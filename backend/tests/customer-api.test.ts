import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
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
import { OrderModel } from '../src/models/order.js';
import { SESSION_COOKIE } from '../src/middlewares/customerAuth.js';

let database: MongoMemoryServer;
let app: Express;
let adminCookie: string;
let staffCookie: string;
let customerCookie: string;
let otherCookie: string;
let customerId: string;
const origin = 'http://localhost:5173';
const seed = loadSeedContent();
const password = 'Test-password-for-api!';
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
    database = await MongoMemoryServer.create({ instance: { dbName: 'htv_customer_api_test' } });
    await mongoose.connect(database.getUri());
    const repository = new MongoRepository();
    await repository.seedIfAbsent(seed);
    await initializeCustomerIndexes();
    await OrderModel.init();
    await bootstrapAdmin({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: password });
    app = createApp({
      repository,
      seedContent: seed,
      config: {
        isDevelopment: true,
        frontendOrigin: origin,
        orderTokenSecret: 'test-order-token-secret-at-least-32-chars',
      },
    });
    const login = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ email: 'admin@example.com', password });
    assert.equal(login.status, 200, login.body.message);
    adminCookie = cookieFrom(login);
    const staff = await request(app)
      .post('/api/admin/staff')
      .set(csrf)
      .set('Cookie', adminCookie)
      .send({ email: 'staff@example.com', name: 'Nhân viên', phone: '0912345678', password });
    assert.equal(staff.status, 201);
    staffCookie = cookieFrom(
      await request(app)
        .post('/api/auth/login')
        .set(csrf)
        .send({ email: 'staff@example.com', password }),
    );
    for (const email of ['customer@example.com', 'other@example.com']) {
      const response = await request(app)
        .post('/api/auth/register')
        .set(csrf)
        .send({ email, name: 'Khách hàng', phone: '0912345678', password });
      assert.equal(response.status, 201, response.body.message);
      if (email.startsWith('customer')) {
        customerCookie = cookieFrom(response);
        customerId = response.body.user.id;
      } else otherCookie = cookieFrom(response);
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
  app = createApp({
    repository: new MongoRepository(),
    seedContent: seed,
    config: {
      isDevelopment: true,
      frontendOrigin: origin,
      orderTokenSecret: 'test-order-token-secret-at-least-32-chars',
    },
  });
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
  const login = await request(app)
    .post('/api/auth/login')
    .set(csrf)
    .send({ email: 'customer@example.com', password });
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
  assert.equal((await checkout(customerCookie, { voucherCode: 'EXPIRED1' })).status, 409);
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
