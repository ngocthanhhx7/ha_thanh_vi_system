import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { createErrorHandler } from '../src/middlewares/errorHandler.js';
import type { SiteContent } from '../src/validators/content.js';
import { UnavailableOrderRepository } from '../src/services/unavailableOrderRepository.js';
import type { OrderRepository } from '../src/services/orderRepository.js';

const seed = JSON.parse(
  readFileSync(new URL('../../content/site.json', import.meta.url), 'utf8'),
) as SiteContent;

type Contact = {
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: true;
};

class TestRepository {
  storage = 'memory-test';
  content: SiteContent | null;
  contacts: Contact[] = [];
  available = true;
  get orderRepositoryAvailable() {
    return this.orderRepository.available && this.available;
  }

  constructor(content: SiteContent | null = seed) {
    this.content = structuredClone(content);
  }

  private ensureAvailable() {
    if (!this.available) throw new Error('repository unavailable');
  }

  async getContent() {
    this.ensureAvailable();
    return this.content && structuredClone(this.content);
  }

  async saveContent(content: SiteContent) {
    this.ensureAvailable();
    this.content = structuredClone(content);
    return structuredClone(content);
  }

  async createContact(contact: Contact) {
    this.ensureAvailable();
    this.contacts.push(structuredClone(contact));
  }

  orderRepository: OrderRepository = new UnavailableOrderRepository();
}

function makeApp(repository = new TestRepository()) {
  return {
    app: createApp({
      repository,
      config: {
        frontendOrigin: 'http://localhost:5173',
        isDevelopment: true,
        paymentsEnabled: false,
        publicWebUrl: 'http://localhost:5173',
        shippingFee: 30000,
        freeShippingThreshold: 499000,
      },
      seedContent: seed,
    }),
    repository,
  };
}

test('GET /api/content returns the complete site content object', async () => {
  const { app } = makeApp();
  const response = await request(app).get('/api/content');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, seed);
});

test('GET /api/products returns the products array', async () => {
  const { app } = makeApp();
  const response = await request(app).get('/api/products');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, seed.products);
});

test('GET /api/products/:slug returns the matching product', async () => {
  const { app } = makeApp();
  const product = seed.products[0];
  const response = await request(app).get(`/api/products/${product.slug}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, product);
});

test('GET /api/products/:slug returns 404 for an unknown product', async () => {
  const { app } = makeApp();
  const response = await request(app).get('/api/products/not-a-product');

  assert.equal(response.status, 404);
});

test('POST /api/contact rejects invalid contact input', async () => {
  const { app, repository } = makeApp();
  const response = await request(app).post('/api/contact').send({
    name: '',
    email: 'not-an-email',
    phone: 'abc',
    message: '',
    consent: false,
  });

  assert.equal(response.status, 400);
  assert.equal(repository.contacts.length, 0);
});

test('POST /api/contact responds 503 and never claims persistence when unavailable', async () => {
  const repository = new TestRepository();
  repository.available = false;
  const { app } = makeApp(repository);
  const response = await request(app).post('/api/contact').send({
    name: 'Nguyen Van A',
    email: 'a@example.com',
    phone: '0912345678',
    message: 'Tôi muốn đặt bánh.',
    consent: true,
  });

  assert.equal(response.status, 503);
  assert.match(response.body.message, /chưa thể lưu|chưa khả dụng/i);
});

test('POST /api/contact returns 201 only after the repository saves the contact', async () => {
  const { app, repository } = makeApp();
  const contact = {
    name: 'Nguyen Van A',
    email: 'a@example.com',
    phone: '0912345678',
    message: 'Tôi muốn đặt bánh.',
    consent: true,
  };
  const response = await request(app).post('/api/contact').send(contact);

  assert.equal(response.status, 201);
  assert.equal(repository.contacts.length, 1);
  assert.deepEqual(repository.contacts[0], contact);
});

test('admin content requires a logged-in user with admin role', async () => {
  const { app } = makeApp();
  assert.equal((await request(app).get('/api/admin/content')).status, 401);
  assert.equal(
    (
      await request(app)
        .get('/api/admin/content')
        .set('Authorization', 'Bearer obsolete-admin-token-at-least-32-characters')
    ).status,
    401,
  );
});
test('GET /api/health reports current storage mode', async () => {
  const { app } = makeApp();
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok', storage: 'memory-test' });
});

test('server error handler preserves HTTP 505 for the reusable error page', async () => {
  const app = express();
  app.get('/unsupported-http-version', (_req, _res, next) => {
    next(Object.assign(new Error('Unsupported HTTP version.'), { status: 505 }));
  });
  app.use(createErrorHandler({ storage: 'memory-test' }));

  const response = await request(app).get('/unsupported-http-version');
  assert.equal(response.status, 505);
});
