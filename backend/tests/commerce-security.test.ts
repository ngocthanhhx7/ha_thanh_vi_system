import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  canonicalPayOsData,
  createPayOsSignature,
  isValidPayOsWebhook,
  isAllowedPayOsUrl,
} from '../src/utils/paymentSignatures.js';
import { canTransitionOrder } from '../src/constants/order.js';
import { CommerceService } from '../src/services/commerceService.js';
import type { OrderRecord, NewOrder } from '../src/models/order.js';
import type { OrderRepository } from '../src/services/orderRepository.js';
import { ServiceError } from '../src/services/errors.js';
import { checkoutSchema } from '../src/validators/commerce.js';
import { CustomerRepository } from '../src/services/customerRepository.js';
import { PayOsHttpClient } from '../src/services/payOsService.js';

const checksumKey = 'test-checksum-key-that-is-not-a-real-secret';

test('PayOS request signature is deterministic and uses sorted key-value pairs', () => {
  const requestData = {
    amount: 125000,
    cancelUrl: 'https://shop.example/thanh-toan/ket-qua',
    description: 'HTV 123456',
    orderCode: 123456,
    returnUrl: 'https://shop.example/thanh-toan/ket-qua',
  };
  const canonical =
    'amount=125000&cancelUrl=https://shop.example/thanh-toan/ket-qua&description=HTV 123456&orderCode=123456&returnUrl=https://shop.example/thanh-toan/ket-qua';
  assert.equal(canonicalPayOsData(requestData), canonical);
  assert.equal(
    createPayOsSignature(requestData, checksumKey),
    createHmac('sha256', checksumKey).update(canonical).digest('hex'),
  );
});

test('PayOS webhook signature rejects a forged or amount-altered callback', () => {
  const data = {
    orderCode: 123456,
    amount: 125000,
    description: 'HTV 123456',
    currency: 'VND',
    paymentLinkId: 'link-123',
    code: '00',
    desc: 'success',
  };
  const signature = createPayOsSignature(data, checksumKey);
  assert.equal(isValidPayOsWebhook({ data, signature }, checksumKey), true);
  assert.equal(
    isValidPayOsWebhook({ data: { ...data, amount: 1 }, signature }, checksumKey),
    false,
  );
  assert.equal(isValidPayOsWebhook({ data, signature: '0'.repeat(64) }, checksumKey), false);
});

test('PayOS checkout URLs require HTTPS and the official checkout host', () => {
  assert.equal(isAllowedPayOsUrl('https://pay.payos.vn/web/abc'), true);
  assert.equal(isAllowedPayOsUrl('https://pay.payos.vn.attacker.example/web/abc'), false);
  assert.equal(isAllowedPayOsUrl('http://pay.payos.vn/web/abc'), false);
  assert.equal(isAllowedPayOsUrl('https://attacker.example/'), false);
});

test('checkout payload rejects client prices, duplicate lines and invalid quantities', () => {
  assert.equal(
    checkoutSchema.safeParse({
      items: [{ productId: 'x', quantity: 1, price: 1 }],
      customer: {
        name: 'Customer',
        email: 'a@example.com',
        phone: '0912345678',
        address: 'Ha Noi',
      },
      paymentMethod: 'cod',
      note: '',
      consent: true,
    }).success,
    false,
  );
  assert.equal(
    checkoutSchema.safeParse({
      items: [{ productId: 'x', quantity: 0 }],
      customer: {
        name: 'Customer',
        email: 'a@example.com',
        phone: '0912345678',
        address: 'Ha Noi',
      },
      paymentMethod: 'cod',
      note: '',
      consent: true,
    }).success,
    false,
  );
  assert.equal(
    checkoutSchema.safeParse({
      items: [
        { productId: 'x', quantity: 1 },
        { productId: 'x', quantity: 1 },
      ],
      customer: {
        name: 'Customer',
        email: 'a@example.com',
        phone: '0912345678',
        address: 'Ha Noi',
      },
      paymentMethod: 'cod',
      note: '',
      consent: true,
    }).success,
    false,
  );
});

test('order transition graph rejects skipped, reversed and unsafe transitions', () => {
  assert.equal(canTransitionOrder('pending', 'confirmed'), true);
  assert.equal(canTransitionOrder('confirmed', 'shipping'), true);
  assert.equal(canTransitionOrder('shipping', 'delivered'), true);
  assert.equal(canTransitionOrder('delivered', 'return_requested'), true);
  assert.equal(canTransitionOrder('return_requested', 'returned'), true);
  assert.equal(canTransitionOrder('pending', 'shipping'), false);
  assert.equal(canTransitionOrder('delivered', 'shipping'), false);
  assert.equal(canTransitionOrder('cancelled', 'confirmed'), false);
});

class MemoryOrders implements OrderRepository {
  available = true;
  readonly values = new Map<string, OrderRecord>();
  async create(order: NewOrder): Promise<OrderRecord> {
    const id = '0123456789abcdef01234567';
    const now = new Date('2026-10-04T00:00:00.000Z');
    const record: OrderRecord = { ...order, id, createdAt: now, updatedAt: now };
    this.values.set(id, record);
    return record;
  }
  async findById(id: string) {
    return this.values.get(id) ?? null;
  }
  async findByIdempotencyKey(key: string) {
    return [...this.values.values()].find((item) => item.idempotencyKey === key) ?? null;
  }
  async findByOrderCode(code: number) {
    return [...this.values.values()].find((item) => item.orderCode === code) ?? null;
  }
  async reserveOrderCode() {
    return 123456789;
  }
  async updateById(id: string, filter: Partial<OrderRecord>, update: Partial<OrderRecord>) {
    const order = this.values.get(id);
    if (
      !order ||
      Object.entries(filter).some(([key, value]) => order[key as keyof OrderRecord] !== value)
    )
      return null;
    const next = { ...order, ...update };
    this.values.set(id, next);
    return next;
  }
  async list() {
    return { orders: [...this.values.values()], total: this.values.size };
  }
  async listByUser(userId: string) {
    return [...this.values.values()].filter((item) => item.userId === userId);
  }
  async findByIdForUser(id: string, userId: string) {
    const value = this.values.get(id);
    return value?.userId === userId ? value : null;
  }
  async markPaymentException(id: string, message: string) {
    const order = this.values.get(id);
    if (order) this.values.set(id, { ...order, payOsException: message });
  }
  async findExpiredPayOsOrders() {
    return [];
  }
}

const seed = {
  site: {} as never,
  products: [
    {
      id: 'bap-chuong-vang',
      slug: 'bap-chuong-vang',
      name: 'Bắp chuông vàng',
      category: 'banh',
      weight: '500g',
      flavor: 'ngọt',
      description: 'Sản phẩm',
      image: '/brand/a.png',
      price: 79000,
      featured: true,
    },
  ],
};
const checkout = {
  items: [{ productId: 'bap-chuong-vang', quantity: 2 }],
  customer: {
    name: 'Nguyen Van A',
    email: 'a@example.com',
    phone: '0912345678',
    address: 'Ha Noi',
  },
  paymentMethod: 'cod' as const,
  note: '',
  consent: true as const,
};

function makeCommerce(
  orders: OrderRepository = new MemoryOrders(),
  payOs = {
    createPayment: async () => ({
      paymentUrl: 'https://pay.payos.vn/web/test',
      paymentLinkId: 'link-test',
    }),
  },
  paymentsEnabled = false,
) {
  return new CommerceService(
    orders,
    { getContent: async () => seed },
    {
      paymentsEnabled,
      publicWebUrl: 'https://shop.example',
      shippingFee: 30000,
      freeShippingThreshold: 499000,
      orderTokenSecret: 'test-server-order-token-secret-at-least-32',
    },
    payOs,
    () => new Date('2026-10-04T00:00:00.000Z'),
  );
}

test('checkout is idempotent and server prices the saved order', async () => {
  const orders = new MemoryOrders();
  const service = makeCommerce(orders);
  const key = '3df67e2f-2744-4e6a-9bdd-40e6015f8e4c';
  const first = await service.createCheckout(checkout, key);
  const replay = await service.createCheckout(checkout, key);
  assert.equal(first.order.total, 188000);
  assert.equal(first.order.items[0].unitPrice, 79000);
  assert.equal(replay.replay, true);
  assert.equal(replay.accessToken, first.accessToken);
  assert.equal(orders.values.size, 1);
  await assert.rejects(
    () => service.createCheckout({ ...checkout, note: 'different' }, key),
    (error: unknown) => error instanceof ServiceError && error.status === 409,
  );
});

test('order token gates lookup and failed payment creation preserves order for retry', async () => {
  const orders = new MemoryOrders();
  let calls = 0;
  const failingPayment = {
    createPayment: async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return { paymentUrl: 'https://pay.payos.vn/web/test', paymentLinkId: 'link-test' };
    },
  };
  const service = makeCommerce(orders, failingPayment, true);
  const online = { ...checkout, paymentMethod: 'payos' as const };
  const result = await service.createCheckout(online, 'bed5c9db-0ab6-48bc-84d0-2351909cf32b');
  assert.equal(result.paymentUrl, null);
  assert.equal(orders.values.size, 1);
  await assert.rejects(
    () => service.getOrder(result.order.id, 'wrong-token'),
    (error: unknown) => error instanceof ServiceError && error.status === 404,
  );
  assert.equal((await service.getOrder(result.order.id, result.accessToken)).id, result.order.id);
  assert.equal(calls, 1);
  assert.equal(
    await service.createOrGetPayment(result.order.id, result.accessToken),
    'https://pay.payos.vn/web/test',
  );
  assert.equal(orders.values.size, 1);
});

test('verified PayOS webhook validates the saved order amount and is idempotent', async () => {
  const orders = new MemoryOrders();
  const service = makeCommerce(
    orders,
    {
      createPayment: async () => ({
        paymentUrl: 'https://pay.payos.vn/web/test',
        paymentLinkId: 'link-test',
      }),
    },
    true,
  );
  const order = await service.createCheckout(
    { ...checkout, paymentMethod: 'payos' },
    'aec2744f-0c6f-4a5f-902f-162912a188a5',
  );
  const stored = await orders.findById(order.order.id);
  assert.ok(stored);
  const data = {
    orderCode: stored.orderCode,
    amount: stored.total,
    code: '00',
    desc: 'success',
    currency: 'VND',
  };
  const body = {
    code: '00',
    success: true,
    data,
    signature: createPayOsSignature(data, checksumKey),
  };
  await service.handlePayOsWebhook(body, checksumKey);
  await service.handlePayOsWebhook(body, checksumKey);
  assert.equal((await orders.findById(order.order.id))?.paymentStatus, 'paid');
  const altered = { ...body, data: { ...data, amount: data.amount + 1 } };
  await assert.rejects(
    () => service.handlePayOsWebhook(altered, checksumKey),
    (error: unknown) => error instanceof ServiceError && error.status === 400,
  );
});

test('unavailable order storage refuses checkout before writing', async () => {
  const orders = new MemoryOrders();
  orders.available = false;
  const service = makeCommerce(orders);
  await assert.rejects(
    () => service.createCheckout(checkout, 'b9cf61eb-e1ee-4872-a2d9-4002d87c2c23'),
    (error: unknown) => error instanceof ServiceError && error.status === 503,
  );
  assert.equal(orders.values.size, 0);
});

test('request signature is checked against altered amounts in signed callback', () => {
  const data = { orderCode: 654321, amount: 50000, code: '00', desc: 'success' };
  const signature = createPayOsSignature(data, checksumKey);
  assert.equal(
    isValidPayOsWebhook({ data: { ...data, amount: 50001 }, signature }, checksumKey),
    false,
  );
});

test('disabled online checkout refuses persistence and unpaid payOS cannot fulfill', async () => {
  const orders = new MemoryOrders();
  const service = makeCommerce(orders);
  await assert.rejects(
    () =>
      service.createCheckout(
        { ...checkout, paymentMethod: 'payos' },
        '2d5a0fd5-d18d-4a23-8fcd-d64190fd4b38',
      ),
    (error: unknown) => error instanceof ServiceError && error.status === 503,
  );
  assert.equal(orders.values.size, 0);
  const enabled = makeCommerce(
    orders,
    {
      createPayment: async () => ({
        paymentUrl: 'https://pay.payos.vn/web/test',
        paymentLinkId: 'link-test',
      }),
    },
    true,
  );
  const created = await enabled.createCheckout(
    { ...checkout, paymentMethod: 'payos' },
    '75990321-caa7-44e9-b2e2-c5ce5bbaef69',
  );
  await assert.rejects(
    () => enabled.updateAdminOrder(created.order.id, { status: 'confirmed' }),
    (error: unknown) => error instanceof ServiceError && error.status === 409,
  );
  await assert.rejects(
    () => enabled.updateAdminOrder(created.order.id, { paymentStatus: 'paid' }),
    (error: unknown) => error instanceof ServiceError && error.status === 409,
  );
});

test('late valid webhook clears only expiry marker and cancelled late settlement remains cancelled until manual refund', async () => {
  const orders = new MemoryOrders();
  const service = makeCommerce(
    orders,
    {
      createPayment: async () => ({
        paymentUrl: 'https://pay.payos.vn/web/test',
        paymentLinkId: 'link-test',
      }),
    },
    true,
  );
  const created = await service.createCheckout(
    { ...checkout, paymentMethod: 'payos' },
    '33d7b98c-0124-4f73-9e9b-f5298c1d0bb2',
  );
  const stored = (await orders.findById(created.order.id))!;
  orders.values.set(stored.id, {
    ...stored,
    payOsException: 'Liên kết thanh toán quá hạn; yêu cầu đối soát trước mọi cập nhật trạng thái.',
    paymentReviewAt: new Date(),
  });
  const data = {
    orderCode: stored.orderCode,
    amount: stored.total,
    code: '00',
    desc: 'success',
    currency: 'VND',
    paymentLinkId: 'link-test',
  };
  const body = {
    code: '00',
    success: true,
    data,
    signature: createPayOsSignature(data, checksumKey),
  };
  await service.handlePayOsWebhook(body, checksumKey);
  assert.equal((await orders.findById(stored.id))?.payOsException, '');
  assert.equal((await orders.findById(stored.id))?.paymentReviewAt, null);
  assert.equal(
    (await service.updateAdminOrder(stored.id, { status: 'confirmed' })).status,
    'confirmed',
  );
  orders.values.set(stored.id, { ...stored, status: 'cancelled', paymentStatus: 'unpaid' });
  await service.handlePayOsWebhook(body, checksumKey);
  assert.equal((await orders.findById(stored.id))?.status, 'cancelled');
  assert.equal((await orders.findById(stored.id))?.paymentStatus, 'refund_pending');
  await service.updateAdminOrder(stored.id, { paymentStatus: 'refunded' });
  assert.equal((await orders.findById(stored.id))?.status, 'cancelled');
  assert.equal((await orders.findById(stored.id))?.paymentStatus, 'refunded');
});

test('voucher cancellation retries recover release and verified webhook retries recover settlement', async () => {
  class RecoverableVouchers extends CustomerRepository {
    releaseCalls = 0;
    settleCalls = 0;
    override async release() {
      this.releaseCalls++;
      if (this.releaseCalls === 1) throw new Error('temporary storage failure');
    }
    override async settle() {
      this.settleCalls++;
      if (this.settleCalls === 1) throw new Error('temporary storage failure');
    }
  }
  const orders = new MemoryOrders();
  const service = makeCommerce(orders);
  const vouchers = new RecoverableVouchers();
  service.setVoucherRepository(vouchers);
  const created = await service.createCheckout(checkout, 'a37b9c8a-3490-4c49-bf4d-4e011d4e2472');
  const stored = (await orders.findById(created.order.id))!;
  orders.values.set(stored.id, { ...stored, voucherReservationId: 'reservation' });
  await assert.rejects(() => service.cancelOrder(stored.id, created.accessToken));
  assert.equal((await orders.findById(stored.id))?.status, 'cancelled');
  assert.equal((await service.cancelOrder(stored.id, created.accessToken)).status, 'cancelled');
  assert.equal(vouchers.releaseCalls, 2);
  orders.values.set(stored.id, {
    ...stored,
    paymentMethod: 'payos',
    voucherReservationId: 'reservation',
  });
  const data = {
    orderCode: stored.orderCode,
    amount: stored.total,
    code: '00',
    desc: 'success',
    currency: 'VND',
  };
  const body = {
    code: '00',
    success: true,
    data,
    signature: createPayOsSignature(data, checksumKey),
  };
  await assert.rejects(() => service.handlePayOsWebhook(body, checksumKey));
  assert.equal((await orders.findById(stored.id))?.paymentStatus, 'paid');
  await service.handlePayOsWebhook(body, checksumKey);
  assert.equal(vouchers.settleCalls, 2);
});

test('ambiguous order insert response recovers already-persisted order using the same key', async () => {
  class AmbiguousOrders extends MemoryOrders {
    override async create(order: NewOrder): Promise<OrderRecord> {
      await super.create(order);
      throw new Error('network interrupted after insert');
    }
  }
  const orders = new AmbiguousOrders();
  const service = makeCommerce(orders);
  const result = await service.createCheckout(checkout, 'be61b76e-935e-4656-9ecb-1c90fcc2ebd1');
  assert.equal(result.replay, true);
  assert.equal(orders.values.size, 1);
});

test('payOS HTTP client verifies signed response matches order and rejects missing signature', async () => {
  const orders = new MemoryOrders();
  const created = await makeCommerce(orders).createCheckout(
    checkout,
    '0b7c2a83-b614-49c3-9978-236e4ce152e1',
  );
  const order = (await orders.findById(created.order.id))!;
  const data = {
    checkoutUrl: 'https://pay.payos.vn/web/test',
    paymentLinkId: 'link-test',
    amount: order.total,
    orderCode: order.orderCode,
    currency: 'VND',
  };
  let withSignature = true;
  const fetcher: typeof fetch = async (input, options) => {
    assert.equal(input, 'https://api-merchant.payos.vn/v2/payment-requests');
    const payload = JSON.parse(String(options?.body)) as { description: string; amount: number };
    assert.ok(payload.description.length <= 9);
    assert.equal(payload.amount, order.total);
    return new Response(
      JSON.stringify({
        code: '00',
        data,
        ...(withSignature ? { signature: createPayOsSignature(data, checksumKey) } : {}),
      }),
      { status: 200 },
    );
  };
  const client = new PayOsHttpClient(
    {
      enabled: true,
      clientId: 'test-client-id',
      apiKey: 'test-api-key',
      checksumKey,
      publicWebUrl: 'https://shop.example',
    },
    fetcher,
  );
  assert.equal((await client.createPayment(order)).paymentUrl, data.checkoutUrl);
  withSignature = false;
  await assert.rejects(
    () => client.createPayment(order),
    (error: unknown) => error instanceof ServiceError && error.status === 503,
  );
});
