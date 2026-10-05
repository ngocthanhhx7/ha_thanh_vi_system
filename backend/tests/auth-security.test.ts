import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { MongoRepository } from '../src/services/contentRepository.js';
import { loadSeedContent } from '../src/utils/contentSeed.js';
import { initializeCustomerIndexes } from '../src/services/customerRepository.js';
import { AuthChallenge } from '../src/models/authChallenge.js';
import { CustomerUser } from '../src/models/customer.js';
import { hashPassword } from '../src/utils/customerSecurity.js';
import type { AuthOptions } from '../src/services/customerAuthService.js';

const origin = 'http://localhost:5173';
const csrf = { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' };
const password = 'Auth-test-password-123!';
const email = 'auth-test@example.com';
let database: MongoMemoryServer;
let app: Express;
let failMail = false;
let mailAttempts = 0;
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 250 && !condition(); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(condition(), 'Fake mailbox operation did not complete');
};
const sent: { to: string; text: string; html: string }[] = [];
const auth: AuthOptions = {
  publicWebUrl: origin,
  challengeSecret: 'isolated-test-challenge-secret-32-characters',
  resetSecret: 'isolated-test-reset-secret-32-characters',
  mailer: {
    async send(mail) {
      mailAttempts++;
      if (failMail) throw new Error('fake transport unavailable');
      sent.push(mail);
    },
  },
};
const post = (path: string, body: Record<string, unknown>, cookie?: string) => {
  const req = request(app)
    .post('/api/auth/' + path)
    .set(csrf);
  if (cookie) req.set('Cookie', cookie);
  return req.send(body);
};
const code = (address = email) =>
  sent
    .filter((mail) => mail.to === address)
    .at(-1)!
    .text.match(/\b\d{6}\b/)![0];
const cookies = (response: { headers: Record<string, unknown> }) =>
  ((response.headers['set-cookie'] ?? []) as string[])
    .map((value) => value.split(';')[0])
    .join('; ');
const resetToken = () =>
  new URL(sent.at(-1)!.text.match(/https?:\/\/[^\s<>]+/)![0]).searchParams.get('token')!;
const register = (extra: Record<string, unknown> = {}) =>
  post('register', {
    name: 'Người thử',
    email,
    phone: '0912345678',
    password,
    confirmPassword: password,
    ...extra,
  });
const verifiedAccount = async (rememberDevice = false) => {
  assert.equal((await register()).status, 201);
  const response = await post('verify-email', { email, code: code(), rememberDevice });
  assert.equal(response.status, 200, response.body.message);
  return response;
};
before(
  async () => {
    database = await MongoMemoryServer.create({ instance: { dbName: 'htv_auth_security' } });
    await mongoose.connect(database.getUri());
    await initializeCustomerIndexes();
  },
  { timeout: 120000 },
);
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections))
    await collection.deleteMany({});
  sent.length = 0;
  failMail = false;
  mailAttempts = 0;
  const seed = loadSeedContent();
  const repository = new MongoRepository();
  await repository.seedIfAbsent(seed);
  app = createApp({
    repository,
    seedContent: seed,
    auth,
    config: {
      frontendOrigin: origin,
      isDevelopment: true,
      orderTokenSecret: 'auth-test-order-secret-32-characters',
    },
  });
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

test('registration requires matching confirmation, denies role injection, and grants session only after correct email code', async () => {
  assert.equal((await register({ confirmPassword: 'different-password' })).status, 400);
  assert.equal((await register({ role: 'admin' })).status, 400);
  const initial = await register();
  assert.equal(initial.status, 201);
  assert.equal(initial.body.verificationRequired, true);
  assert.equal(initial.headers['set-cookie'], undefined);
  const login = await post('login', { email, password });
  assert.equal(login.status, 403);
  assert.equal(login.body.verificationRequired, true);
  assert.equal(sent.length, 1);
  const verified = await post('verify-email', { email, code: code() });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.role, 'customer');
  assert.equal(verified.body.user.passwordHash, undefined);
  assert.match(String(verified.headers['set-cookie']), /HttpOnly/);
  assert.equal(
    (await request(app).get('/api/auth/me').set('Cookie', cookies(verified))).status,
    200,
  );
  assert.notEqual((await post('verify-email', { email, code: code() })).status, 200);
});

test('unverified registration retry cannot replace password or identity and successful mail has cooldown', async () => {
  assert.equal((await register()).status, 201);
  const original = await CustomerUser.findOne({ email }).select('+passwordHash').lean();
  await register({
    name: 'Attacker',
    password: 'Attacker-password-123!',
    confirmPassword: 'Attacker-password-123!',
  });
  const current = await CustomerUser.findOne({ email }).select('+passwordHash').lean();
  assert.equal(current!.name, original!.name);
  assert.equal(current!.passwordHash, original!.passwordHash);
  await post('resend-verification', { email });
  assert.equal(sent.length, 1);
});

test('failed initial mail remains retryable without minting a session', async () => {
  failMail = true;
  const failed = await register();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers['set-cookie'], undefined);
  failMail = false;
  const retried = await register();
  assert.equal(retried.status, 201, retried.body.message);
  assert.equal(sent.length, 1);
  assert.equal((await post('verify-email', { email, code: code() })).status, 200);
});

test('new device password login requires OTP; trusted cookie is owner-bound and password remains required', async () => {
  await verifiedAccount();
  const login = await post('login', { email, password, rememberDevice: true });
  assert.equal(login.status, 200);
  assert.equal(login.body.otpRequired, true);
  assert.equal(login.headers['set-cookie'], undefined);
  const proof = await post('verify-login', { challengeId: login.body.challengeId, code: code() });
  assert.equal(proof.status, 200, proof.body.message);
  const trusted = cookies(proof);
  assert.match(trusted, /htv_trusted_device=/);
  assert.equal(
    (await post('login', { email, password: 'incorrect-password' }, trusted)).status,
    401,
  );
  const recognized = await post('login', { email, password, rememberDevice: true }, trusted);
  assert.equal(recognized.status, 200);
  assert.equal(recognized.body.otpRequired, undefined);
  assert.equal(recognized.body.user.email, email);
  await CustomerUser.create({
    name: 'Other',
    email: 'other-auth@example.com',
    phone: '0912345678',
    passwordHash: await hashPassword(password),
    role: 'customer',
  });
  const other = await post('login', { email: 'other-auth@example.com', password }, trusted);
  assert.equal(other.body.otpRequired, true);
});

test('five incorrect OTP attempts invalidate challenge; codes and challenge IDs cannot be replayed', async () => {
  await verifiedAccount();
  const login = await post('login', { email, password });
  const correct = code();
  const incorrect = correct === '000000' ? '999999' : '000000';
  for (let i = 0; i < 5; i++)
    assert.notEqual(
      (await post('verify-login', { challengeId: login.body.challengeId, code: incorrect })).status,
      200,
    );
  assert.notEqual(
    (await post('verify-login', { challengeId: login.body.challengeId, code: correct })).status,
    200,
  );
});

test('forgot password responses hide existence and delivery failures; reset is atomic, single-use, and revokes all authentication', async () => {
  const initial = await verifiedAccount(true);
  const oldCookies = cookies(initial);
  const login = await post('login', { email, password });
  const oldCode = code();
  const unknown = await post('forgot-password', { email: 'unknown@example.com' });
  failMail = true;
  const attemptsBeforeFailure = mailAttempts;
  const failed = await post('forgot-password', { email });
  await waitFor(() => mailAttempts > attemptsBeforeFailure);
  failMail = false;
  const known = await post('forgot-password', { email });
  await waitFor(() => sent.at(-1)!.text.includes('/dat-lai-mat-khau'));
  assert.equal(unknown.status, 202);
  assert.deepEqual(failed.body, unknown.body);
  assert.deepEqual(known.body, unknown.body);
  const token = resetToken();
  assert.match(sent.at(-1)!.text, /\/dat-lai-mat-khau\?token=/);
  const replacement = 'Replacement-password-456!';
  const body = { token, password: replacement, confirmPassword: replacement };
  const outcomes = await Promise.all([post('reset-password', body), post('reset-password', body)]);
  assert.equal(outcomes.filter((response) => response.status === 200).length, 1);
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', oldCookies)).status, 401);
  assert.notEqual(
    (await post('verify-login', { challengeId: login.body.challengeId, code: oldCode })).status,
    200,
  );
  assert.equal((await post('login', { email, password }, oldCookies)).status, 401);
  const fresh = await post('login', { email, password: replacement }, oldCookies);
  assert.equal(fresh.body.otpRequired, true);
});

test('legacy verified role accounts require new-device OTP and CSRF applies to public auth endpoints', async () => {
  await CustomerUser.create({
    name: 'Legacy admin',
    email,
    phone: '',
    passwordHash: await hashPassword(password),
    role: 'admin',
  });
  const denied = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(denied.status, 403);
  const login = await post('login', { email, password });
  assert.equal(login.body.otpRequired, true);
  const verified = await post('verify-login', {
    challengeId: login.body.challengeId,
    code: code(),
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.role, 'admin');
});

test('expired email OTP and expired reset link cannot authenticate or change password; nonremembered sessions are browser cookies', async () => {
  await register();
  const emailCode = code();
  await AuthChallenge.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await post('verify-email', { email, code: emailCode })).status, 400);
  // Replace expired challenge with a freshly issued fake delivery, without waiting in tests.
  await AuthChallenge.deleteMany({});
  const beforeResend = sent.length;
  await post('resend-verification', { email });
  await waitFor(() => sent.length > beforeResend);
  const verified = await post('verify-email', { email, code: code() });
  assert.equal(verified.status, 200);
  assert.doesNotMatch(String(verified.headers['set-cookie']), /Max-Age=/);
  await post('forgot-password', { email });
  await waitFor(() => sent.at(-1)!.text.includes('/dat-lai-mat-khau'));
  const token = resetToken();
  await CustomerUser.updateOne(
    { email },
    { $set: { resetExpiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal(
    (
      await post('reset-password', {
        token,
        password: 'Changed-password-123!',
        confirmPassword: 'Changed-password-123!',
      })
    ).status,
    400,
  );
});

test('concurrent password stage sends only one login mail and failed login delivery releases the reservation', async () => {
  await verifiedAccount();
  const before = sent.length;
  const logins = await Promise.all([
    post('login', { email, password }),
    post('login', { email, password }),
  ]);
  assert.equal(logins.filter((r) => r.status === 200).length, 1);
  assert.equal(logins.filter((r) => r.status === 429).length, 1);
  assert.equal(sent.length, before + 1);
  await CustomerUser.updateOne({ email }, { $unset: { loginOtpSentAt: 1 } });
  failMail = true;
  assert.equal((await post('login', { email, password })).status, 503);
  failMail = false;
  assert.equal((await post('login', { email, password })).status, 200);
});

test('email owner recovers a pre-registered unverified account without knowing the squatter password', async () => {
  assert.equal((await register()).status, 201);
  const attackerCode = code();
  await post('forgot-password', { email });
  await waitFor(() => sent.at(-1)!.text.includes('/dat-lai-mat-khau'));
  const replacement = 'Owner-recovered-password-123!';
  const reset = await post('reset-password', {
    token: resetToken(),
    password: replacement,
    confirmPassword: replacement,
  });
  assert.equal(reset.status, 200);
  assert.notEqual((await post('verify-email', { email, code: attackerCode })).status, 200);
  assert.equal((await post('login', { email, password })).status, 401);
  assert.equal((await post('login', { email, password: replacement })).status, 403);
  const resumed = await register({ password: replacement, confirmPassword: replacement });
  assert.equal(resumed.status, 201);
  assert.equal((await post('verify-email', { email, code: code() })).status, 200);
});
