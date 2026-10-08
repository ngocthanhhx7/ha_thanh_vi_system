import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadSeedContent } from '../src/utils/contentSeed.js';
import { MongoRepository } from '../src/services/contentRepository.js';
import { bootstrapAdmin, initializeCustomerIndexes } from '../src/services/customerRepository.js';
import {
  CustomerUser,
  CustomerSession,
  CustomerWallet,
  CustomerVoucher,
  CustomerReview,
} from '../src/models/customer.js';
import { TrustedDevice } from '../src/models/authChallenge.js';
import { CustomerAccountAppeal } from '../src/models/accountManagement.js';
import { OrderModel } from '../src/models/order.js';
import { Notification, SystemAuditLog } from '../src/models/operations.js';
import type { AuthOptions } from '../src/services/customerAuthService.js';
import type { AuthMailer } from '../src/services/authMail.js';
import { SESSION_COOKIE } from '../src/middlewares/customerAuth.js';

let database: MongoMemoryReplSet;
let app: Express;
let adminCookie: string;
let staffCookie: string;
let customerCookie: string;
let otherCookie: string;
let customerId: string;
const origin = 'http://localhost:5173';
const seed = loadSeedContent();
const password = 'Test-password-for-api!';
const delivered: { to: string; text: string }[] = [];
const orderEmails: { to: string; subject: string; text: string; html: string }[] = [];
const orderMailer: AuthMailer = {
  async send(message) {
    orderEmails.push(message);
  },
};
const auth: AuthOptions = {
  mailer: {
    async send(message) {
      delivered.push(message);
    },
  },
  publicWebUrl: origin,
  challengeSecret: 'test-challenge-secret-at-least-32-characters',
  resetSecret: 'test-reset-secret-at-least-32-characters',
};
const latestCode = (email: string) =>
  delivered
    .filter((mail) => mail.to === email)
    .at(-1)!
    .text.match(/\b\d{6}\b/)![0];
const loginVerified = async (email: string) => {
  const login = await request(app).post('/api/auth/login').set(csrf).send({ email, password });
  assert.equal(login.status, 200, login.body.message);
  if (!login.body.otpRequired) return login;
  const verified = await request(app)
    .post('/api/auth/verify-login')
    .set(csrf)
    .send({ challengeId: login.body.challengeId, code: latestCode(email) });
  assert.equal(verified.status, 200, verified.body.message);
  return verified;
};
const csrf = { 'X-Requested-With': 'XMLHttpRequest', Origin: origin };
const checkoutBody = {
  items: [{ productId: seed.products[0].id, quantity: 3 }],
  customer: {
    name: 'Khách thử nghiệm',
    email: 'customer@example.com',
    phone: '0912345678',
    address: '12 Phố Huế, Hà Nội',
  },
  consent: true,
  paymentMethod: 'cod',
  note: '',
};
const cookieFrom = (response: { headers: Record<string, unknown> }) =>
  String((response.headers['set-cookie'] as string[])[0]).split(';')[0];
const registerCustomer = async (email: string) => {
  const registered = await request(app).post('/api/auth/register').set(csrf).send({
    email,
    name: 'Khách hàng thử',
    phone: '0912345678',
    password,
    confirmPassword: password,
  });
  assert.equal(registered.status, 201, registered.body.message);
  const verified = await request(app)
    .post('/api/auth/verify-email')
    .set(csrf)
    .send({ email, code: latestCode(email), rememberDevice: true });
  assert.equal(verified.status, 200, verified.body.message);
  const cookies = verified.headers['set-cookie'] as unknown as string[];
  return {
    id: verified.body.user.id as string,
    cookie: cookies.map((value) => value.split(';')[0]).join('; '),
  };
};
const createSuspendedAppeal = async (email: string) => {
  const account = await registerCustomer(email);
  const suspended = await request(app)
    .patch('/api/admin/users/' + account.id)
    .set(csrf)
    .set('User-Agent', 'HTV-account-admin-test/1.0')
    .set('Cookie', adminCookie)
    .send({ accountStatus: 'suspended', reason: 'Review bảo mật trong kiểm thử.' });
  assert.equal(suspended.status, 200, suspended.body.message);
  assert.equal(await CustomerSession.exists({ userId: account.id }), null);
  assert.equal(await TrustedDevice.exists({ userId: account.id }), null);

  const login = await request(app)
    .post('/api/auth/login')
    .set(csrf)
    .set('Cookie', account.cookie)
    .send({ email, password, rememberDevice: true });
  assert.equal(login.status, 200, login.body.message);
  assert.equal(login.body.otpRequired, true);
  assert.equal(login.body.appealRequired, true);
  const verified = await request(app)
    .post('/api/auth/verify-login')
    .set(csrf)
    .send({ challengeId: login.body.challengeId, code: latestCode(email) });
  assert.equal(verified.status, 200, verified.body.message);
  assert.equal(verified.body.appealRequired, true);
  assert.equal(await CustomerSession.exists({ userId: account.id }), null);
  assert.equal((await request(app).get('/api/account/addresses')).status, 401);

  const submitted = await request(app).post('/api/auth/appeals').set(csrf).send({
    appealToken: verified.body.appealToken,
    message: 'Tôi tin tài khoản bị khóa nhầm, xin vui lòng kiểm tra và xem xét lại giúp tôi.',
  });
  assert.equal(submitted.status, 201, submitted.body.message);
  return { ...account, appealId: submitted.body.appeal.id as string };
};
const checkout = (cookie?: string, extra: Record<string, unknown> = {}) => {
  const req = request(app).post('/api/orders').set(csrf).set('Idempotency-Key', randomUUID());
  if (cookie) req.set('Cookie', cookie);
  return req.send({ ...checkoutBody, ...extra });
};
const campaign = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  name: 'Voucher thử nghiệm',
  type: 'fixed',
  value: 20000,
  minOrder: 0,
  maxDiscount: 0,
  startsAt: new Date(Date.now() - 60000),
  expiresAt: new Date(Date.now() + 86400000),
  distribution: 'code',
  totalLimit: 100,
  perUserLimit: 1,
  active: true,
  ...extra,
});

before(
  async () => {
    database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(database.getUri());
    const repository = new MongoRepository();
    await repository.seedIfAbsent(seed);
    await initializeCustomerIndexes();
    await OrderModel.init();
    await bootstrapAdmin({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: password });
    app = createApp({
      auth,
      orderMailer,
      repository,
      seedContent: seed,
      config: {
        isDevelopment: true,
        frontendOrigin: origin,
        orderTokenSecret: 'test-order-token-secret-at-least-32-chars',
      },
    });
    const login = await loginVerified('admin@example.com');
    assert.equal(login.status, 200, login.body.message);
    adminCookie = cookieFrom(login);
    const staff = await request(app)
      .post('/api/admin/staff')
      .set(csrf)
      .set('Cookie', adminCookie)
      .send({ email: 'staff@example.com', name: 'Nhân viên', phone: '0912345678', password });
    assert.equal(staff.status, 201);
    staffCookie = cookieFrom(await loginVerified('staff@example.com'));
    for (const email of ['customer@example.com', 'other@example.com']) {
      const response = await request(app).post('/api/auth/register').set(csrf).send({
        email,
        name: 'Khách hàng',
        phone: '0912345678',
        password,
        confirmPassword: password,
      });
      assert.equal(response.status, 201, response.body.message);
      assert.equal(response.body.verificationRequired, true);
      assert.equal(response.headers['set-cookie'], undefined);
      const verified = await request(app)
        .post('/api/auth/verify-email')
        .set(csrf)
        .send({ email, code: latestCode(email) });
      assert.equal(verified.status, 200, verified.body.message);
      if (email.startsWith('customer')) {
        customerCookie = cookieFrom(verified);
        customerId = verified.body.user.id;
      } else otherCookie = cookieFrom(verified);
    }
  },
  { timeout: 120000 },
);
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
});
// Each scenario uses a fresh limiter while preserving the isolated test database and sessions.
beforeEach(() => {
  orderEmails.length = 0;
  app = createApp({
    auth,
    orderMailer,
    repository: new MongoRepository(),
    seedContent: seed,
    config: {
      isDevelopment: true,
      frontendOrigin: origin,
      orderTokenSecret: 'test-order-token-secret-at-least-32-chars',
    },
  });
});

test('new checkout sends one confirmation email and an idempotent replay does not resend it', async () => {
  const key = randomUUID();
  const send = () =>
    request(app).post('/api/orders').set(csrf).set('Idempotency-Key', key).send(checkoutBody);
  const created = await send();
  assert.equal(created.status, 201, created.body.message);
  assert.equal(orderEmails.length, 1);
  assert.equal(orderEmails[0].to, checkoutBody.customer.email);
  assert.match(orderEmails[0].subject, new RegExp(created.body.order.code));
  assert.match(orderEmails[0].text, new RegExp(created.body.order.code));
  assert.ok(
    orderEmails[0].text.includes(
      `/don-hang/${created.body.order.id}#token=${created.body.accessToken}`,
    ),
  );

  const replay = await send();
  assert.equal(replay.status, 200);
  assert.equal(replay.body.order.id, created.body.order.id);
  assert.equal(orderEmails.length, 1);
});

test('cookie session is HttpOnly, token is stored hashed, registration cannot choose role, CSRF and logout revoke access', async () => {
  assert.match(customerCookie, new RegExp('^' + SESSION_COOKIE + '='));
  const token = customerCookie.split('=')[1];
  assert.equal(await CustomerSession.exists({ tokenHash: token }), null);
  const me = await request(app).get('/api/auth/me').set('Cookie', customerCookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'customer');
  assert.equal(me.body.user.passwordHash, undefined);
  const escalated = await request(app).post('/api/auth/register').set(csrf).send({
    email: 'attack@example.com',
    name: 'Attack',
    phone: '0912345678',
    password,
    role: 'admin',
  });
  assert.equal(escalated.status, 400);
  assert.equal(
    (
      await request(app)
        .patch('/api/account/profile')
        .set('Cookie', customerCookie)
        .send({ name: 'Changed', phone: '0912345678' })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/account/profile')
        .set('Cookie', customerCookie)
        .set({ 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://attacker.example' })
        .send({ name: 'Changed', phone: '0912345678' })
    ).status,
    403,
  );
  const login = await loginVerified('customer@example.com');
  assert.match(String(login.headers['set-cookie']), /HttpOnly/);
  assert.match(String(login.headers['set-cookie']), /SameSite=Lax/);
  const temporary = cookieFrom(login);
  assert.equal(
    (await request(app).post('/api/auth/logout').set(csrf).set('Cookie', temporary)).status,
    204,
  );
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', temporary)).status, 401);
});

test('address book enforces owner, one default, ten-address cap and checkout snapshots remain unchanged', async () => {
  const input = {
    label: 'Nhà riêng',
    name: 'Ngọc Thành',
    phone: '0912345678',
    address: '12 Phố Huế, Hà Nội',
    isDefault: false,
  };
  const first = await request(app)
    .post('/api/account/addresses')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send(input);
  assert.equal(first.status, 201);
  assert.equal(first.body.address.isDefault, true);
  const id = first.body.address.id;
  assert.equal(
    (
      await request(app)
        .delete('/api/account/addresses/' + id)
        .set(csrf)
        .set('Cookie', otherCookie)
    ).status,
    404,
  );
  const order = await checkout(customerCookie);
  assert.equal(order.status, 201);
  const changed = await request(app)
    .patch('/api/account/addresses/' + id)
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ ...input, address: 'Địa chỉ mới', isDefault: true });
  assert.equal(changed.status, 200);
  assert.equal(
    (
      await request(app)
        .get('/api/orders/' + order.body.order.id)
        .set('Cookie', customerCookie)
    ).body.customer.address,
    checkoutBody.customer.address,
  );
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      request(app)
        .post('/api/account/addresses')
        .set(csrf)
        .set('Cookie', customerCookie)
        .send({ ...input, label: 'Địa chỉ ' + index, isDefault: true }),
    ),
  );
  const list = await request(app).get('/api/account/addresses').set('Cookie', customerCookie);
  assert.ok(list.body.addresses.length <= 10);
  assert.equal(
    list.body.addresses.filter((item: { isDefault: boolean }) => item.isDefault).length,
    1,
  );
});

test('guest token and account ownership are isolated, duplicate checkout replay is safe, staff has scoped roles', async () => {
  const registered = await checkout(customerCookie);
  assert.equal(registered.status, 201);
  assert.equal(registered.body.accessToken, '');
  const id = registered.body.order.id;
  assert.equal(
    (
      await request(app)
        .get('/api/orders/' + id)
        .set('Cookie', customerCookie)
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .get('/api/orders/' + id)
        .set('Cookie', otherCookie)
        .set('X-Order-Token', registered.body.accessToken)
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .get('/api/orders/' + id)
        .set('X-Order-Token', registered.body.accessToken)
    ).status,
    404,
  );
  assert.equal(
    (await request(app).get('/api/admin/orders').set('Cookie', staffCookie)).status,
    200,
  );
  for (const path of ['/api/admin/users', '/api/admin/content', '/api/admin/vouchers'])
    assert.equal((await request(app).get(path).set('Cookie', staffCookie)).status, 403);
  assert.equal(
    (await request(app).get('/api/admin/orders').set('Cookie', customerCookie)).status,
    403,
  );
  const guestKey = randomUUID();
  const guest = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', guestKey)
    .send(checkoutBody);
  assert.equal(guest.status, 201);
  assert.equal((await request(app).get('/api/orders/' + guest.body.order.id)).status, 404);
  assert.equal(
    (
      await request(app)
        .get('/api/orders/' + guest.body.order.id)
        .set('X-Order-Token', guest.body.accessToken)
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/orders')
        .set(csrf)
        .set('Cookie', customerCookie)
        .set('Idempotency-Key', guestKey)
        .send(checkoutBody)
    ).status,
    409,
  );
  const replay = await request(app)
    .post('/api/orders')
    .set('Idempotency-Key', guestKey)
    .send(checkoutBody);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.order.id, guest.body.order.id);
});

test('voucher checkout validates price server-side, automatic wallet grants, cap is atomic and cancellation releases quota', async () => {
  await CustomerVoucher.create(campaign('CAP1', { totalLimit: 1, perUserLimit: 1 }));
  await CustomerVoucher.create(campaign('AUTO1', { distribution: 'automatic' }));
  await CustomerVoucher.create(campaign('EXPIRED1', { expiresAt: new Date(Date.now() - 1) }));
  const wallet = await request(app).get('/api/account/vouchers').set('Cookie', customerCookie);
  assert.ok(wallet.body.vouchers.some((voucher: { code: string }) => voucher.code === 'AUTO1'));
  const quote = await request(app)
    .post('/api/account/vouchers/quote')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: 'CAP1', items: checkoutBody.items });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.discount, 20000);
  assert.equal((await checkout(undefined, { voucherCode: 'CAP1' })).status, 401);
  const expired = await checkout(customerCookie, { voucherCode: 'EXPIRED1' });
  assert.equal(expired.status, 409);
  assert.match(expired.body.message, /Voucher đã hết hạn/);
  assert.equal(
    (await checkout(customerCookie, { voucherCode: 'CAP1', discount: 1000000 })).status,
    400,
  );
  const concurrent = await Promise.all([
    checkout(customerCookie, { voucherCode: 'CAP1' }),
    checkout(otherCookie, { voucherCode: 'CAP1' }),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 201).length, 1);
  assert.equal(concurrent.filter((result) => result.status === 409).length, 1);
  const winner = concurrent.find((result) => result.status === 201)!;
  const ownerCookie = concurrent[0].status === 201 ? customerCookie : otherCookie;
  assert.equal(winner.body.order.discount, 20000);
  assert.equal(
    winner.body.order.total,
    winner.body.order.subtotal + winner.body.order.shippingFee - 20000,
  );
  const cancelled = await request(app)
    .post('/api/orders/' + winner.body.order.id + '/cancel')
    .set(csrf)
    .set('Cookie', ownerCookie);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, 'cancelled');
  assert.equal((await CustomerVoucher.findOne({ code: 'CAP1' }).lean())?.reservations.length, 0);
  assert.equal((await checkout(customerCookie, { voucherCode: 'CAP1' })).status, 201);
  await CustomerVoucher.create(campaign('PERUSER1', { totalLimit: 100, perUserLimit: 1 }));
  const perUser = await Promise.all([
    checkout(otherCookie, { voucherCode: 'PERUSER1' }),
    checkout(otherCookie, { voucherCode: 'PERUSER1' }),
  ]);
  assert.equal(perUser.filter((result) => result.status === 201).length, 1);
  assert.equal(perUser.filter((result) => result.status === 409).length, 1);
});

test('admin voucher grants are visible only to intended customers and scheduled vouchers report their effective time', async () => {
  const create = (code: string, extra: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/admin/vouchers')
      .set(csrf)
      .set('Cookie', adminCookie)
      .send({ ...campaign(code), ...extra });
  const claimable = await create('CLAIM1');
  assert.equal(claimable.status, 201, claimable.body.message);
  const savedClaim = await request(app)
    .post('/api/account/vouchers/claim')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: ' claim1 ' });
  assert.equal(savedClaim.status, 200, savedClaim.body.message);
  assert.ok(
    savedClaim.body.vouchers.some((voucher: { code: string }) => voucher.code === 'CLAIM1'),
  );
  const repeatedSavedClaim = await request(app)
    .post('/api/account/vouchers/claim')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: 'CLAIM1' });
  assert.equal(repeatedSavedClaim.status, 200, repeatedSavedClaim.body.message);
  const claimableId = claimable.body.voucher.id;
  assert.equal(
    await CustomerWallet.countDocuments({ userId: customerId, voucherId: claimableId }),
    1,
  );

  const issued = await create('TARGET1', {
    distribution: 'targeted',
    customerIds: [customerId],
  });
  assert.equal(issued.status, 201, issued.body.message);
  assert.equal(issued.body.assignedCount, 1);
  const voucherId = issued.body.voucher.id;
  const grant = await CustomerWallet.findOne({ userId: customerId, voucherId }).lean();
  assert.equal(grant?.grantSource, 'admin');
  assert.ok(
    await Notification.exists({
      userId: customerId,
      eventKey: `voucher:${voucherId}:granted:${customerId}`,
    }),
  );

  const customerWallet = await request(app)
    .get('/api/account/vouchers')
    .set('Cookie', customerCookie);
  const targeted = customerWallet.body.vouchers.find(
    (voucher: { code: string }) => voucher.code === 'TARGET1',
  );
  assert.equal(targeted.status, 'available');
  const otherWallet = await request(app).get('/api/account/vouchers').set('Cookie', otherCookie);
  assert.equal(
    otherWallet.body.vouchers.some((voucher: { code: string }) => voucher.code === 'TARGET1'),
    false,
  );

  const repeatClaim = await request(app)
    .post('/api/account/vouchers/claim')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: ' target1 ' });
  assert.equal(repeatClaim.status, 200, repeatClaim.body.message);
  assert.equal(await CustomerWallet.countDocuments({ userId: customerId, voucherId }), 1);
  const outsiderClaim = await request(app)
    .post('/api/account/vouchers/claim')
    .set(csrf)
    .set('Cookie', otherCookie)
    .send({ code: 'TARGET1' });
  assert.equal(outsiderClaim.status, 404);

  const targetedQuote = await request(app)
    .post('/api/account/vouchers/quote')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: 'TARGET1', items: checkoutBody.items });
  assert.equal(targetedQuote.status, 200);
  const outsiderQuote = await request(app)
    .post('/api/account/vouchers/quote')
    .set(csrf)
    .set('Cookie', otherCookie)
    .send({ code: 'TARGET1', items: checkoutBody.items });
  assert.equal(outsiderQuote.status, 409);
  const ordered = await checkout(customerCookie, { voucherCode: 'TARGET1' });
  assert.equal(ordered.status, 201, ordered.body.message);
  assert.equal(ordered.body.order.discount, 20000);

  const paused = await request(app)
    .patch('/api/admin/vouchers/' + voucherId)
    .set(csrf)
    .set('Cookie', adminCookie)
    .send({ active: false });
  assert.equal(paused.status, 200);
  const pausedWallet = await request(app)
    .get('/api/account/vouchers')
    .set('Cookie', customerCookie);
  assert.equal(
    pausedWallet.body.vouchers.find((voucher: { code: string }) => voucher.code === 'TARGET1')
      .status,
    'inactive',
  );

  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
  const upcoming = await create('UPCOMING1', {
    startsAt: scheduledAt,
    expiresAt: new Date(scheduledAt.getTime() + 24 * 60 * 60 * 1000),
  });
  assert.equal(upcoming.status, 201, upcoming.body.message);
  const claimUpcoming = await request(app)
    .post('/api/account/vouchers/claim')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: 'UPCOMING1' });
  assert.equal(claimUpcoming.status, 200, claimUpcoming.body.message);
  assert.equal(
    claimUpcoming.body.vouchers.find((voucher: { code: string }) => voucher.code === 'UPCOMING1')
      .status,
    'scheduled',
  );
  const unavailableQuote = await request(app)
    .post('/api/account/vouchers/quote')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: 'UPCOMING1', items: checkoutBody.items });
  assert.equal(unavailableQuote.status, 409);
  assert.match(unavailableQuote.body.message, /chưa đến thời gian áp dụng/);
  const unavailableCheckout = await checkout(customerCookie, { voucherCode: 'UPCOMING1' });
  assert.equal(unavailableCheckout.status, 409);
  assert.match(unavailableCheckout.body.message, /chưa đến thời gian áp dụng/);

  const malformedClaim = await request(app)
    .post('/api/account/vouchers/claim')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ code: '!!' });
  assert.equal(malformedClaim.status, 400);
  assert.match(malformedClaim.body.message, /3–80 ký tự/);
  const expiredIssue = await create('PASTEND1', {
    expiresAt: new Date(Date.now() - 60 * 1000),
  });
  assert.equal(expiredIssue.status, 400);
});

test('delivery events, purchased-product reviews, one reward per order, customer returns and staff ticket reply follow order workflow', async () => {
  const placed = await checkout(customerCookie);
  const id = placed.body.order.id;
  const patch = (body: Record<string, unknown>) =>
    request(app)
      .patch('/api/admin/orders/' + id)
      .set(csrf)
      .set('Cookie', staffCookie)
      .send(body);
  assert.equal((await patch({ status: 'delivered' })).status, 409);
  assert.equal(
    (
      await request(app)
        .post('/api/account/reviews')
        .set(csrf)
        .set('Cookie', customerCookie)
        .send({ orderId: id, productId: seed.products[0].id, rating: 5, comment: 'Bánh ngon lắm' })
    ).status,
    409,
  );
  assert.equal((await patch({ status: 'confirmed' })).status, 200);
  assert.equal(
    (await patch({ status: 'shipping', carrier: 'GHN', trackingNumber: 'TEST-MANUAL-01' })).status,
    200,
  );
  const delivered = await patch({
    status: 'delivered',
    paymentStatus: 'paid',
    shippingEvent: {
      status: 'delivered',
      description: 'Nhân viên xác nhận giao thành công',
      location: 'Hà Nội',
    },
  });
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.shippingEvents.length, 3);
  assert.equal(delivered.body.carrier, 'GHN');
  const review = {
    orderId: id,
    productId: seed.products[0].id,
    rating: 5,
    comment: '<b>Bánh ngon</b>',
  };
  assert.equal(
    (
      await request(app)
        .post('/api/account/reviews')
        .set(csrf)
        .set('Cookie', otherCookie)
        .send(review)
    ).status,
    404,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(app)
          .post('/api/account/reviews')
          .set(csrf)
          .set('Cookie', customerCookie)
          .send(review)
      ).status,
      201,
    );
  assert.equal(await CustomerReview.countDocuments({ orderId: id }), 1);
  assert.equal(await CustomerWallet.countDocuments({ rewardOrderId: id }), 1);
  const reward = await CustomerWallet.findOne({ rewardOrderId: id }).lean();
  assert.equal(
    (
      await request(app)
        .post('/api/account/vouchers/claim')
        .set(csrf)
        .set('Cookie', otherCookie)
        .send({ code: reward!.code })
    ).status,
    404,
  );
  const publicReviews = await request(app).get('/api/products/' + seed.products[0].id + '/reviews');
  assert.equal(publicReviews.status, 200);
  assert.equal(publicReviews.body.reviews[0].userId, undefined);
  const ticket = await request(app)
    .post('/api/account/tickets')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ orderId: id, kind: 'return', message: 'Hộp bị móp, xin hỗ trợ đổi trả.' });
  assert.equal(ticket.status, 201, ticket.body.message);
  const retryTicket = await request(app)
    .post('/api/account/tickets')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ orderId: id, kind: 'return', message: 'Hộp bị móp, xin hỗ trợ đổi trả.' });
  assert.equal(retryTicket.status, 201);
  assert.equal(retryTicket.body.ticket.id, ticket.body.ticket.id);
  assert.equal((await OrderModel.findById(id).lean())?.status, 'return_requested');
  const replied = await request(app)
    .patch('/api/staff/tickets/' + ticket.body.ticket.id)
    .set(csrf)
    .set('Cookie', staffCookie)
    .send({ status: 'in_progress', reply: 'Cửa hàng đã tiếp nhận và sẽ liên hệ.' });
  assert.equal(replied.status, 200);
  assert.equal(replied.body.ticket.replies.length, 1);
  assert.equal((await patch({ status: 'returned', paymentStatus: 'refunded' })).status, 403);
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/orders/' + id)
        .set(csrf)
        .set('Cookie', adminCookie)
        .send({ status: 'returned', paymentStatus: 'refund_pending' })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/orders/' + id)
        .set(csrf)
        .set('Cookie', adminCookie)
        .send({ paymentStatus: 'refunded' })
    ).status,
    200,
  );
  assert.equal(
    (
      await CustomerUser.findById(customerId).select('+passwordHash').lean()
    )?.passwordHash.startsWith('scrypt:'),
    true,
  );
});

test('CMS validation requires database-admin session and rejects obsolete bearer authentication', async () => {
  assert.equal(CustomerUser.collection.name, 'users');
  assert.equal(
    (
      await request(app)
        .get('/api/admin/content')
        .set('Authorization', 'Bearer obsolete-admin-token-at-least-32-characters')
    ).status,
    401,
  );
  const read = await request(app).get('/api/admin/content').set('Cookie', adminCookie);
  assert.equal(read.status, 200);
  const invalid = structuredClone(seed);
  invalid.products[0].slug = 'Not-Lowercase';
  assert.equal(
    (
      await request(app)
        .put('/api/admin/content')
        .set(csrf)
        .set('Cookie', adminCookie)
        .send(invalid)
    ).status,
    400,
  );
  const changed = structuredClone(seed);
  changed.site.tagline = 'Vị Hà Nội trong từng món quà';
  const write = await request(app)
    .put('/api/admin/content')
    .set(csrf)
    .set('Cookie', adminCookie)
    .send(changed);
  assert.equal(write.status, 200);
  assert.equal(write.body.site.tagline, changed.site.tagline);
});

test('authentication attempts are rate-limited independently of successful accounts', async () => {
  for (let index = 0; index < 20; index++)
    assert.equal((await request(app).post('/api/auth/login').set(csrf).send({})).status, 400);
  assert.equal((await request(app).post('/api/auth/login').set(csrf).send({})).status, 429);
});

test('admin account edits are audited, role changes revoke sessions, and admins cannot change their own access', async () => {
  const account = await registerCustomer(`account-edit-${randomUUID()}@example.com`);
  const profile = await request(app)
    .patch('/api/admin/users/' + account.id)
    .set(csrf)
    .set('User-Agent', 'HTV-account-admin-test/1.0')
    .set('Cookie', adminCookie)
    .send({ name: 'Nguyễn Hà My', phone: '0987654321' });
  assert.equal(profile.status, 200, profile.body.message);
  assert.equal(profile.body.user.name, 'Nguyễn Hà My');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', account.cookie)).status, 200);

  const changedRole = await request(app)
    .patch('/api/admin/users/' + account.id)
    .set(csrf)
    .set('User-Agent', 'HTV-account-admin-test/1.0')
    .set('Cookie', adminCookie)
    .send({ role: 'staff' });
  assert.equal(changedRole.status, 200, changedRole.body.message);
  assert.equal(changedRole.body.user.role, 'staff');
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', account.cookie)).status, 401);

  const admin = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
  const selfChange = await request(app)
    .patch('/api/admin/users/' + admin.body.user.id)
    .set(csrf)
    .set('Cookie', adminCookie)
    .send({ accountStatus: 'suspended', reason: 'Self-lock test.' });
  assert.equal(selfChange.status, 403);

  const audit = await request(app)
    .get('/api/admin/users/' + account.id + '/audit')
    .set('Cookie', adminCookie);
  assert.equal(audit.status, 200);
  assert.equal(audit.body.audit.length, 2);
  assert.ok(
    audit.body.audit.every(
      (entry: { actorIp?: string; actorUserAgent?: string }) =>
        entry.actorIp && entry.actorUserAgent === 'HTV-account-admin-test/1.0',
    ),
  );
});

test('suspended accounts can submit one verified appeal without a session and admins can approve or reject it', async () => {
  const approved = await createSuspendedAppeal(`appeal-approve-${randomUUID()}@example.com`);
  const approve = await request(app)
    .patch('/api/admin/appeals/' + approved.appealId)
    .set(csrf)
    .set('User-Agent', 'HTV-appeal-review-test/1.0')
    .set('Cookie', adminCookie)
    .send({ decision: 'approve', note: 'Đã xác minh thông tin tài khoản.' });
  assert.equal(approve.status, 200, approve.body.message);
  assert.equal((await CustomerUser.findById(approved.id).lean())?.accountStatus, 'active');
  assert.equal(await CustomerSession.exists({ userId: approved.id }), null);

  const approvedAudit = await request(app)
    .get('/api/admin/users/' + approved.id + '/audit')
    .set('Cookie', adminCookie);
  assert.ok(
    approvedAudit.body.audit.some(
      (entry: { action: string; actorIp?: string; actorUserAgent?: string }) =>
        entry.action === 'admin.appeal.approved' &&
        entry.actorIp &&
        entry.actorUserAgent === 'HTV-appeal-review-test/1.0',
    ),
  );

  const rejected = await createSuspendedAppeal(`appeal-reject-${randomUUID()}@example.com`);
  const reject = await request(app)
    .patch('/api/admin/appeals/' + rejected.appealId)
    .set(csrf)
    .set('User-Agent', 'HTV-appeal-review-test/1.0')
    .set('Cookie', adminCookie)
    .send({ decision: 'reject', note: 'Chưa đủ thông tin xác minh.' });
  assert.equal(reject.status, 200, reject.body.message);
  assert.equal((await CustomerUser.findById(rejected.id).lean())?.accountStatus, 'suspended');
  assert.equal(await CustomerSession.exists({ userId: rejected.id }), null);
});

test('concurrent admin appeal decisions commit exactly one matching account outcome', async () => {
  const appealed = await createSuspendedAppeal(`appeal-race-${randomUUID()}@example.com`);
  const [approve, reject] = await Promise.all([
    request(app)
      .patch('/api/admin/appeals/' + appealed.appealId)
      .set(csrf)
      .set('Cookie', adminCookie)
      .send({ decision: 'approve', note: 'Đủ thông tin xác minh.' }),
    request(app)
      .patch('/api/admin/appeals/' + appealed.appealId)
      .set(csrf)
      .set('Cookie', adminCookie)
      .send({ decision: 'reject', note: 'Chưa đủ thông tin xác minh.' }),
  ]);
  assert.equal([approve.status, reject.status].filter((status) => status === 200).length, 1);
  assert.equal([approve.status, reject.status].filter((status) => status === 409).length, 1);

  const [appeal, user] = await Promise.all([
    CustomerAccountAppeal.findById(appealed.appealId).lean(),
    CustomerUser.findById(appealed.id).lean(),
  ]);
  assert.ok(appeal);
  assert.ok(user);
  assert.equal(appeal.status === 'approved', user.accountStatus === 'active');
});

test('admin account search is filtered and paged in the database instead of truncating at 200', async () => {
  const extraUsers = Array.from({ length: 31 }, (_, index) => ({
    name: `Ops Directory ${String(index).padStart(2, '0')}`,
    email: `ops-directory-${index}@example.com`,
    phone: '0912345678',
    passwordHash: 'test-only-hash',
    role: index % 2 ? 'staff' : 'customer',
    accountStatus: index % 3 ? 'active' : 'suspended',
    authVersion: 0,
  }));
  await CustomerUser.insertMany(extraUsers);
  const first = await request(app)
    .get('/api/admin/users?page=1&limit=7&q=Ops%20Directory&role=staff&sort=name&direction=asc')
    .set('Cookie', adminCookie);
  assert.equal(first.status, 200);
  assert.equal(first.body.total, 15);
  assert.equal(first.body.users.length, 7);
  assert.equal(first.body.page, 1);
  const second = await request(app)
    .get('/api/admin/users?page=3&limit=7&q=Ops%20Directory&role=staff&sort=name&direction=asc')
    .set('Cookie', adminCookie);
  assert.equal(second.status, 200);
  assert.equal(second.body.users.length, 1);
  assert.notEqual(first.body.users[0].id, second.body.users[0].id);
  assert.equal(
    (await request(app).get('/api/admin/users?page=1&limit=1000').set('Cookie', adminCookie))
      .status,
    400,
  );
});

test('notification inbox is owner-scoped, supports read actions, and the staff dashboard is role protected', async () => {
  const customer = await request(app).get('/api/auth/me').set('Cookie', customerCookie);
  const other = await request(app).get('/api/auth/me').set('Cookie', otherCookie);
  const ownNotification = await Notification.create({
    userId: customer.body.user.id,
    category: 'order',
    title: 'Đơn hàng đã cập nhật',
    message: 'Kiểm thử hộp thông báo.',
    href: '/tai-khoan?section=orders',
    eventKey: `test-owner-notification:${randomUUID()}`,
  });
  const otherNotification = await Notification.create({
    userId: other.body.user.id,
    category: 'support',
    title: 'Riêng tư',
    message: 'Không hiển thị cho người khác.',
    href: '/tai-khoan?section=support',
    eventKey: `test-other-notification:${randomUUID()}`,
  });
  const inbox = await request(app).get('/api/notifications').set('Cookie', customerCookie);
  assert.equal(inbox.status, 200);
  assert.ok(
    inbox.body.notifications.some(
      (item: { id: string }) => item.id === String(ownNotification._id),
    ),
  );
  assert.ok(
    !inbox.body.notifications.some(
      (item: { id: string }) => item.id === String(otherNotification._id),
    ),
  );
  assert.equal(inbox.body.unread >= 1, true);
  assert.equal(
    (
      await request(app)
        .patch('/api/notifications/' + otherNotification.id + '/read')
        .set(csrf)
        .set('Cookie', customerCookie)
    ).status,
    404,
  );
  const marked = await request(app)
    .patch('/api/notifications/' + ownNotification.id + '/read')
    .set(csrf)
    .set('Cookie', customerCookie);
  assert.equal(marked.status, 200);
  assert.ok((await Notification.findById(ownNotification.id).lean())?.readAt);

  const dashboard = await request(app).get('/api/staff/dashboard').set('Cookie', staffCookie);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.rangeDays, 14);
  assert.ok(Array.isArray(dashboard.body.orders.byStatus));
  assert.equal(
    (await request(app).get('/api/staff/dashboard').set('Cookie', customerCookie)).status,
    403,
  );
});

test('system audit captures correlated safe request metadata and logs are admin-only', async () => {
  const account = await registerCustomer(`audit-target-${randomUUID()}@example.com`);
  const requestId = randomUUID();
  const changed = await request(app)
    .patch('/api/admin/users/' + account.id)
    .set(csrf)
    .set('X-Request-Id', requestId)
    .set('User-Agent', 'HTV-audit-console-test/1.0')
    .set('Cookie', adminCookie)
    .send({ name: 'Audit Correlated Target' });
  assert.equal(changed.status, 200);
  assert.equal(changed.headers['x-request-id'], requestId);
  type SystemAuditEntry = {
    outcome: string;
    method: string;
    path: string;
    targetType?: string;
    targetId?: string;
    actorRole?: string;
    actorUserAgent?: string;
  };
  let entry: SystemAuditEntry | null = null;
  for (let attempt = 0; attempt < 25 && !entry; attempt++) {
    entry = (await SystemAuditLog.findOne({ requestId }).lean()) as SystemAuditEntry | null;
    if (!entry) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(entry);
  assert.equal(entry.outcome, 'success');
  assert.equal(entry.method, 'PATCH');
  assert.equal(entry.path, '/admin/users/' + account.id);
  assert.equal(entry.targetType, 'user');
  assert.equal(entry.targetId, account.id);
  assert.equal(entry.actorRole, 'admin');
  assert.equal(entry.actorUserAgent, 'HTV-audit-console-test/1.0');

  const logs = await request(app)
    .get('/api/admin/system-logs?q=HTV-audit-console-test')
    .set('Cookie', adminCookie);
  assert.equal(logs.status, 200);
  assert.ok(logs.body.logs.some((item: { requestId: string }) => item.requestId === requestId));
  const filtered = await request(app)
    .get(
      '/api/admin/system-logs?severity=info&outcome=success&actorRole=admin&method=PATCH&targetType=user&statusCode=200&from=' +
        encodeURIComponent(new Date(Date.now() - 86400000).toISOString()) +
        '&to=' +
        encodeURIComponent(new Date(Date.now() + 86400000).toISOString()),
    )
    .set('Cookie', adminCookie);
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.logs.some((item: { requestId: string }) => item.requestId === requestId));
  assert.equal(Array.isArray(filtered.body.anomalies), true);
  const invalidRange = await request(app)
    .get('/api/admin/system-logs?from=2026-10-06T00:00:00.000Z&to=2026-10-04T00:00:00.000Z')
    .set('Cookie', adminCookie);
  assert.equal(invalidRange.status, 400);
  assert.equal(
    (await request(app).get('/api/admin/system-logs').set('Cookie', staffCookie)).status,
    403,
  );
  assert.equal(
    (await request(app).get('/api/admin/system-logs').set('Cookie', customerCookie)).status,
    403,
  );
});
