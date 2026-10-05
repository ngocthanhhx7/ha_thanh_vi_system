import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { test } from 'node:test';
import { MongoOrderRepository } from '../src/services/orderRepository.js';
import { OrderModel } from '../src/models/order.js';
import { orderConfirmationEmail } from '../src/services/orderConfirmationEmail.js';

const makeOrder = (overrides: Record<string, unknown> = {}) => {
  const { code: codeSuffix = '00000001', ...fields } = overrides;
  const suffix = String(codeSuffix);
  return {
    code: 'HTV-' + suffix,
    items: [{ productId: 'banh-cha', name: 'Bánh Chả', quantity: 2, unitPrice: 89000 }],
    subtotal: 178000,
    shippingFee: 30000,
    total: 208000,
    status: 'pending',
    paymentStatus: 'unpaid',
    paymentMethod: 'cod',
    customer: {
      name: 'Khách Hà Nội',
      email: 'guest@example.com',
      phone: '0901234567',
      address: 'Hà Nội',
    },
    note: '',
    accessTokenHash: 'token-hash',
    idempotencyKey: 'key-' + suffix,
    payloadHash: 'payload-hash',
    orderCode: Number(suffix.replace(/\D/g, '')) || 12345678,
    ...fields,
  };
};

test('order queue filters server-side and sorts attention items before standard work', async (context) => {
  const mongo = await MongoMemoryServer.create();
  context.after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  await mongoose.connect(mongo.getUri());
  await OrderModel.init();
  await OrderModel.insertMany([
    makeOrder({
      code: '00000001',
      status: 'pending',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      createdAt: new Date('2026-10-01T10:00:00Z'),
    }),
    makeOrder({
      code: '00000002',
      status: 'pending',
      paymentMethod: 'payos',
      paymentStatus: 'unpaid',
      createdAt: new Date('2026-10-01T09:00:00Z'),
    }),
    makeOrder({
      code: '00000003',
      status: 'confirmed',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      createdAt: new Date('2026-10-01T08:00:00Z'),
    }),
    makeOrder({
      code: '00000004',
      status: 'return_requested',
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      createdAt: new Date('2026-10-01T07:00:00Z'),
    }),
    makeOrder({
      code: '00000005',
      status: 'returned',
      paymentMethod: 'cod',
      paymentStatus: 'refund_pending',
      createdAt: new Date('2026-10-01T06:00:00Z'),
    }),
  ]);

  const repository = new MongoOrderRepository();
  const queue = await repository.list(1, 20, { queue: 'needs_action', sort: 'priority' });
  assert.deepEqual(
    queue.orders.map((order) => order.code),
    ['HTV-00000005', 'HTV-00000004', 'HTV-00000001'],
  );
  assert.equal(queue.total, 3);

  const paymentQueue = await repository.list(1, 20, {
    queue: 'awaiting_payment',
    paymentMethod: 'payos',
  });
  assert.deepEqual(
    paymentQueue.orders.map((order) => order.code),
    ['HTV-00000002'],
  );
  assert.equal(paymentQueue.total, 1);

  const search = await repository.list(1, 20, {
    queue: 'all',
    q: '00000003',
    from: new Date('2026-10-01T07:30:00Z'),
  });
  assert.deepEqual(
    search.orders.map((order) => order.code),
    ['HTV-00000003'],
  );
  assert.equal(search.total, 1);
});

test('order confirmation email includes a useful summary and escapes product content', () => {
  const email = orderConfirmationEmail({
    code: 'HTV-00000011',
    createdAt: new Date('2026-10-05T09:00:00Z'),
    customer: {
      name: 'Khách Hà Nội',
      email: 'guest@example.com',
      phone: '0901234567',
      address: 'Hà Nội',
    },
    items: [
      { productId: 'cake', name: '<script>alert(1)</script>', quantity: 1, unitPrice: 89000 },
    ],
    subtotal: 89000,
    shippingFee: 30000,
    total: 119000,
    paymentMethod: 'cod',
  });
  assert.equal(email.to, 'guest@example.com');
  assert.match(email.subject, /HTV-00000011/);
  assert.match(email.text, /119\.000/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /Thanh toán khi nhận hàng/);
});
