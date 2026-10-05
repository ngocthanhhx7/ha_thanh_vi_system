import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import type { Express } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ChatHandoff } from '../src/models/chatHandoff.js';
import { CustomerSession, CustomerUser } from '../src/models/customer.js';
import { MongoRepository } from '../src/services/contentRepository.js';
import { initializeCustomerIndexes } from '../src/services/customerRepository.js';
import { loadSeedContent } from '../src/utils/contentSeed.js';
import { hashPassword, hashSessionToken, newSessionToken } from '../src/utils/customerSecurity.js';

const origin = 'http://localhost:5173';
const csrf = { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' };
const seed = loadSeedContent();
let database: MongoMemoryServer;
let app: Express;
let staffCookie: string;
let otherStaffCookie: string;
let customerCookie: string;
let adminCookie: string;

async function createSession(role: 'staff' | 'customer' | 'admin', email: string) {
  const user = await CustomerUser.create({
    name: role === 'customer' ? 'Khách Thử' : role === 'admin' ? 'Quản trị Thử' : 'Nhân viên Thử',
    email,
    phone: '',
    role,
    passwordHash: await hashPassword('Test-password-123!'),
  });
  const token = newSessionToken();
  await CustomerSession.create({
    userId: user._id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 86400000),
    authVersion: 0,
  });
  return { cookie: `htv_session=${token}`, user };
}

async function createHandoff(
  transcript: { role: 'user' | 'assistant'; content: string }[] = [],
  token?: string,
) {
  const pending = request(app).post('/api/chat/handoffs').set(csrf);
  if (token) pending.set('X-Chat-Token', token);
  const response = await pending.send({ transcript });
  assert.equal(response.status, 201, response.body.message);
  const handoff = response.body.handoff as {
    id: string;
    status: string;
    messages: { content: string }[];
  };
  const rawCookies = response.headers['set-cookie'];
  const cookieHeader = (Array.isArray(rawCookies) ? rawCookies : [rawCookies]).find((value) =>
    value?.startsWith(`htv_chat_${handoff.id}=`),
  );
  return {
    handoff,
    cookie: cookieHeader?.split(';')[0],
    setCookie: cookieHeader,
  };
}

before(
  async () => {
    database = await MongoMemoryServer.create({ instance: { dbName: 'htv_chat_handoff_test' } });
    await mongoose.connect(database.getUri());
    await initializeCustomerIndexes();
    await new MongoRepository().seedIfAbsent(seed);
    staffCookie = (await createSession('staff', 'chat-staff@example.com')).cookie;
    otherStaffCookie = (await createSession('staff', 'chat-staff-two@example.com')).cookie;
    customerCookie = (await createSession('customer', 'chat-customer@example.com')).cookie;
    adminCookie = (await createSession('admin', 'chat-admin@example.com')).cookie;
    app = createApp({
      repository: new MongoRepository(),
      seedContent: seed,
      config: {
        frontendOrigin: origin,
        isDevelopment: true,
        orderTokenSecret: 'chat-handoff-test-order-secret-32-characters',
      },
    });
  },
  { timeout: 120000 },
);

beforeEach(async () => {
  await ChatHandoff.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

test('MongoDB initializes handoff queue, unread, owner and guest-token indexes', async () => {
  const indexes = await ChatHandoff.collection.indexes();
  assert.ok(indexes.some((index) => index.key.status === 1 && index.key.lastMessageAt === 1));
  assert.ok(indexes.some((index) => index.key.status === 1 && index.key.staffUnreadCount === 1));
  assert.ok(indexes.some((index) => index.key.accessTokenHash === 1 && index.unique));
  assert.ok(
    indexes.some(
      (index) =>
        index.key.activeOwnerUserId === 1 &&
        index.unique &&
        index.partialFilterExpression?.activeOwnerUserId !== undefined,
    ),
  );
});

test('guest handoff stores only a token hash and hides the transcript from other visitors', async () => {
  const accessToken = 'guest-handoff-retry-token-000000000000000000000';
  const created = await createHandoff(
    [
      { role: 'user', content: 'Bánh chả có những vị nào ạ?' },
      { role: 'assistant', content: 'Mình có vị truyền thống và các vị mới ạ.' },
    ],
    accessToken,
  );
  const retried = await createHandoff([{ role: 'user', content: 'Yêu cầu gửi lại.' }], accessToken);
  assert.equal(retried.handoff.id, created.handoff.id);
  assert.equal(await ChatHandoff.countDocuments({}), 1);
  assert.equal(created.handoff.status, 'waiting');
  assert.ok(created.cookie);
  assert.equal(created.setCookie?.includes('HttpOnly'), true);
  assert.equal(created.setCookie?.includes('SameSite=Strict'), true);
  assert.equal(created.setCookie?.includes(`/api/chat/handoffs/${created.handoff.id}`), true);
  assert.equal('accessToken' in created.handoff, false);
  const stored = await ChatHandoff.findById(created.handoff.id).select('+accessTokenHash').lean();
  assert.ok(stored);
  assert.equal(stored.accessTokenHash, createHash('sha256').update(accessToken).digest('hex'));
  assert.notEqual(stored.accessTokenHash, accessToken);

  const hidden = await request(app).get(`/api/chat/handoffs/${created.handoff.id}`);
  assert.equal(hidden.status, 404);
  const wrongToken = await request(app)
    .get(`/api/chat/handoffs/${created.handoff.id}`)
    .set('Cookie', `htv_chat_${created.handoff.id}=${'x'.repeat(43)}`);
  assert.equal(wrongToken.status, 404);
  const visible = await request(app)
    .get(`/api/chat/handoffs/${created.handoff.id}`)
    .set('Cookie', created.cookie!);
  assert.equal(visible.status, 200);
  assert.equal(visible.body.handoff.messages[0].content, 'Bánh chả có những vị nào ạ?');
  assert.equal(visible.body.handoff.messages.at(-1).sender, 'system');
});

test('staff-only inbox claims atomically, replies to the guest, and resolves the handoff', async () => {
  const created = await createHandoff([
    { role: 'user', content: 'Mình cần tư vấn chọn set quà.' },
    { role: 'assistant', content: 'Bạn muốn chọn set theo dịp nào ạ?' },
  ]);
  const unauthenticated = await request(app).get('/api/staff/chat-handoffs');
  assert.equal(unauthenticated.status, 401);
  const customerDenied = await request(app)
    .get('/api/staff/chat-handoffs')
    .set('Cookie', customerCookie);
  assert.equal(customerDenied.status, 403);

  const inbox = await request(app).get('/api/staff/chat-handoffs').set('Cookie', staffCookie);
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.handoffs[0].id, created.handoff.id);
  assert.deepEqual(inbox.body.handoffs[0].messages, []);
  assert.equal(inbox.body.summary.waiting, 1);

  const claim = await request(app)
    .patch(`/api/staff/chat-handoffs/${created.handoff.id}/claim`)
    .set(csrf)
    .set('Cookie', staffCookie);
  assert.equal(claim.status, 200);
  assert.equal(claim.body.handoff.status, 'assigned');
  const duplicateClaim = await request(app)
    .patch(`/api/staff/chat-handoffs/${created.handoff.id}/claim`)
    .set(csrf)
    .set('Cookie', staffCookie);
  assert.equal(duplicateClaim.status, 200);
  assert.equal(
    duplicateClaim.body.handoff.auditTrail.filter(
      (event: { action: string }) => event.action === 'claimed',
    ).length,
    1,
  );
  const collision = await request(app)
    .patch(`/api/staff/chat-handoffs/${created.handoff.id}/claim`)
    .set(csrf)
    .set('Cookie', otherStaffCookie);
  assert.equal(collision.status, 409);

  const reply = await request(app)
    .post(`/api/staff/chat-handoffs/${created.handoff.id}/messages`)
    .set(csrf)
    .set('Cookie', staffCookie)
    .send({ message: 'Mình sẽ giúp bạn chọn một set phù hợp nhé.' });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.handoff.customerUnreadCount, 1);

  const customerReply = await request(app)
    .post(`/api/chat/handoffs/${created.handoff.id}/messages`)
    .set(csrf)
    .set('Cookie', created.cookie!)
    .send({ message: 'Mình cần tư vấn đơn quà; số liên hệ 0912345678.' });
  assert.equal(customerReply.status, 200);
  assert.equal(customerReply.body.handoff.staffUnreadCount, 1);

  const resolve = await request(app)
    .patch(`/api/staff/chat-handoffs/${created.handoff.id}/resolve`)
    .set(csrf)
    .set('Cookie', staffCookie);
  assert.equal(resolve.status, 200);
  assert.equal(resolve.body.handoff.status, 'resolved');
  const closedReply = await request(app)
    .post(`/api/chat/handoffs/${created.handoff.id}/messages`)
    .set(csrf)
    .set('Cookie', created.cookie!)
    .send({ message: 'Mình hỏi thêm một chút.' });
  assert.equal(closedReply.status, 409);
});

test('waiting handoffs stay ahead of older assigned work when the inbox is capped', async () => {
  const now = Date.now();
  await ChatHandoff.insertMany(
    Array.from({ length: 100 }, (_, index) => ({
      accessTokenHash: createHash('sha256').update(`assigned-queue-${index}`).digest('hex'),
      status: 'assigned',
      assignedStaffId: `staff-${index % 3}`,
      assignedStaffName: 'Nhân viên Thử',
      lastMessageAt: new Date(now - 100000 - index),
      lastMessagePreview: 'Đơn đang được xử lý',
    })),
  );
  const waiting = await createHandoff([{ role: 'user', content: 'Mình cần chọn set quà.' }]);
  const inbox = await request(app).get('/api/staff/chat-handoffs').set('Cookie', staffCookie);

  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.handoffs.length, 100);
  assert.equal(inbox.body.handoffs[0].id, waiting.handoff.id);
  assert.equal(inbox.body.handoffs[0].status, 'waiting');
});

test('admin identity and role are retained in claim and resolve audit entries', async () => {
  const created = await createHandoff();
  const claim = await request(app)
    .patch(`/api/staff/chat-handoffs/${created.handoff.id}/claim`)
    .set(csrf)
    .set('Cookie', adminCookie);
  assert.equal(claim.status, 200);
  assert.equal(claim.body.handoff.auditTrail.at(-1).actorName, 'Quản trị Thử');
  assert.equal(claim.body.handoff.auditTrail.at(-1).actorRole, 'admin');

  const resolve = await request(app)
    .patch(`/api/staff/chat-handoffs/${created.handoff.id}/resolve`)
    .set(csrf)
    .set('Cookie', adminCookie);
  assert.equal(resolve.status, 200);
  assert.equal(resolve.body.handoff.auditTrail.at(-1).actorRole, 'admin');
  assert.equal(resolve.body.handoff.auditTrail.at(-1).actorName, 'Quản trị Thử');
});

test('account handoffs bind to the signed-in owner and private data is not copied into support logs', async () => {
  const response = await request(app)
    .post('/api/chat/handoffs')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ transcript: [{ role: 'user', content: 'Tư vấn giúp mình set quà.' }] });
  assert.equal(response.status, 201);
  assert.equal(response.body.accessToken, undefined);
  const duplicate = await request(app)
    .post('/api/chat/handoffs')
    .set(csrf)
    .set('Cookie', customerCookie)
    .send({ transcript: [{ role: 'user', content: 'Mình muốn hỗ trợ lại.' }] });
  assert.equal(duplicate.status, 201);
  assert.equal(duplicate.body.handoff.id, response.body.handoff.id);
  assert.equal(await ChatHandoff.countDocuments({}), 1);

  const unauthenticated = await request(app).get(`/api/chat/handoffs/${response.body.handoff.id}`);
  assert.equal(unauthenticated.status, 404);
  const owner = await request(app)
    .get(`/api/chat/handoffs/${response.body.handoff.id}`)
    .set('Cookie', customerCookie);
  assert.equal(owner.status, 200);

  const privateMessage = await request(app)
    .post('/api/chat/handoffs')
    .set(csrf)
    .send({ transcript: [{ role: 'user', content: 'Số điện thoại của mình là 0912345678.' }] });
  assert.equal(privateMessage.status, 400);
  assert.equal(await ChatHandoff.countDocuments({}), 1);
});
