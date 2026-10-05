import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { test } from 'node:test';
import { readCommerceConfig } from '../src/config/commerce.js';
import { ServiceError } from '../src/services/errors.js';
import { confirmPayOsWebhook } from '../src/services/payOsService.js';
import { csrfGuard } from '../src/middlewares/customerAuth.js';

test('PayOS webhook URL defaults to the application callback and supports an explicit public URL', () => {
  const defaults = readCommerceConfig({ FRONTEND_ORIGIN: 'http://localhost:5173' });
  assert.equal(defaults.payOsWebhookUrl, 'http://localhost:5173/api/payments/payos/webhook');

  const configured = readCommerceConfig({
    FRONTEND_ORIGIN: 'http://localhost:5173',
    PAYOS_WEBHOOK_URL: 'https://hathanhvi.vn/api/payments/payos/webhook',
  });
  assert.equal(configured.payOsWebhookUrl, 'https://hathanhvi.vn/api/payments/payos/webhook');
});

test('PayOS webhook URL configuration only accepts the mounted callback path', () => {
  assert.throws(
    () =>
      readCommerceConfig({
        FRONTEND_ORIGIN: 'http://localhost:5173',
        PAYOS_WEBHOOK_URL: 'https://hathanhvi.vn/not-the-webhook',
      }),
    /PAYOS_WEBHOOK_URL/,
  );
});

test('PayOS webhook confirmation sends credentials in headers and only the callback URL in the body', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ code: '00', desc: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await confirmPayOsWebhook(
    { clientId: 'test-client', apiKey: 'test-api-key' },
    'https://hathanhvi.vn/api/payments/payos/webhook',
    fetcher,
  );

  assert.equal(capturedUrl, 'https://api-merchant.payos.vn/confirm-webhook');
  assert.equal(new Headers(capturedInit?.headers).get('x-client-id'), 'test-client');
  assert.equal(new Headers(capturedInit?.headers).get('x-api-key'), 'test-api-key');
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    webhookUrl: 'https://hathanhvi.vn/api/payments/payos/webhook',
  });
});

test('PayOS webhook registration rejects local or non-HTTPS URLs before contacting PayOS', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ code: '00' }), { status: 200 });
  };

  for (const webhookUrl of [
    'http://hathanhvi.vn/api/payments/payos/webhook',
    'https://localhost/api/payments/payos/webhook',
    'https://192.168.1.10/api/payments/payos/webhook',
  ]) {
    await assert.rejects(
      () =>
        confirmPayOsWebhook(
          { clientId: 'test-client', apiKey: 'test-api-key' },
          webhookUrl,
          fetcher,
        ),
      (error: unknown) => error instanceof ServiceError && error.status === 400,
    );
  }
  assert.equal(calls, 0);
});

test('PayOS webhook registration rejects non-success responses without exposing credentials', async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ code: '401', desc: 'Unauthorized' }), { status: 401 });

  await assert.rejects(
    () =>
      confirmPayOsWebhook(
        { clientId: 'test-client', apiKey: 'test-api-key' },
        'https://hathanhvi.vn/api/payments/payos/webhook',
        fetcher,
      ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 503 &&
      !error.message.includes('test-api-key'),
  );
});

test('only the PayOS webhook POST bypasses browser CSRF checks', async () => {
  const app = express();
  app.use('/api', csrfGuard(new Set(['https://hathanhvi.vn']), true));
  app.post('/api/payments/payos/webhook', (_req, res) => res.sendStatus(204));
  app.post('/api/browser-action', (_req, res) => res.sendStatus(204));

  assert.equal((await request(app).post('/api/payments/payos/webhook').send({})).status, 204);
  assert.equal((await request(app).post('/api/browser-action').send({})).status, 403);
  assert.equal((await request(app).get('/api/payments/payos/webhook')).status, 404);
});
