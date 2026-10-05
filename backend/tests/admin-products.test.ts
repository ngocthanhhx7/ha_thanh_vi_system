import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import sharp from 'sharp';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { MongoRepository } from '../src/services/contentRepository.js';
import { CustomerRepository } from '../src/services/customerRepository.js';
import { CustomerUser } from '../src/models/customer.js';
import { OrderModel } from '../src/models/order.js';
import { loadSeedContent } from '../src/utils/contentSeed.js';
import { saveProductImage } from '../src/services/productImageService.js';
import { uploadDirectory } from '../src/services/productImageService.js';

let database: MongoMemoryServer;
let app: Express;
let adminCookie: string;
let staffCookie: string;
const csrf = { 'X-Requested-With': 'XMLHttpRequest', Origin: 'http://localhost:5173' };
before(
  async () => {
    database = await MongoMemoryServer.create();
    await mongoose.connect(database.getUri());
  },
  { timeout: 120000 },
);
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections))
    await collection.deleteMany({});
  const repository = new MongoRepository();
  const seed = loadSeedContent();
  await repository.seedIfAbsent(seed);
  app = createApp({
    repository,
    seedContent: seed,
    config: { frontendOrigin: 'http://localhost:5173', isDevelopment: true },
  });
  const customerRepository = new CustomerRepository();
  for (const role of ['admin', 'staff'] as const) {
    const user = await CustomerUser.create({
      name: role,
      email: role + '@example.com',
      passwordHash: 'test-no-login',
      role,
    });
    const cookie = 'htv_session=' + (await customerRepository.createSession(String(user._id)));
    if (role === 'admin') adminCookie = cookie;
    else staffCookie = cookie;
  }
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
});
test('admin CRUD validates unique identity, immutable ID, details and retained order snapshots', async () => {
  const product = {
    ...loadSeedContent().products[0],
    id: 'new-test-product',
    slug: 'new-test-product',
    name: 'Sản phẩm thử',
    ingredients: 'Thành phần trên nhãn',
    packageContents: ['1 túi 350g'],
  };
  assert.equal(
    (
      await request(app)
        .post('/api/admin/products')
        .set('Cookie', staffCookie)
        .set(csrf)
        .send(product)
    ).status,
    403,
  );
  assert.equal(
    (await request(app).post('/api/admin/products').set('Cookie', adminCookie).send(product))
      .status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/admin/products')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send(product)
    ).status,
    201,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/admin/products')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send(product)
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/products/new-test-product')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ id: 'changed-id' })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/products/new-test-product')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ price: 99000 })
    ).body.price,
    99000,
  );
  assert.equal(
    (await request(app).get('/api/admin/products/new-test-product').set('Cookie', adminCookie)).body
      .ingredients,
    product.ingredients,
  );
  await OrderModel.collection.insertOne({
    items: [{ productId: product.id, name: product.name, unitPrice: 79000, quantity: 1 }],
    status: 'delivered',
    paymentStatus: 'paid',
    total: 79000,
    createdAt: new Date(),
  });
  assert.equal(
    (
      await request(app)
        .delete('/api/admin/products/new-test-product')
        .set('Cookie', adminCookie)
        .set(csrf)
    ).status,
    204,
  );
  assert.equal((await request(app).get('/api/products/new-test-product')).status, 404);
  assert.equal((await OrderModel.findOne().lean())?.items[0].name, product.name);
});
test('upload requires admin and decodes real images, rejects fake image/SVG, publishes only generated WebP', async () => {
  const image = await sharp({
    create: { width: 32, height: 24, channels: 3, background: '#791f26' },
  })
    .png()
    .toBuffer();
  assert.equal(
    (
      await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', staffCookie)
        .set(csrf)
        .type('image/png')
        .send(image)
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .set(csrf)
        .type('image/png')
        .send(Buffer.from('not-image'))
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .set(csrf)
        .type('image/svg+xml')
        .send('<svg/>')
    ).status,
    415,
  );
  const response = await request(app)
    .post('/api/admin/uploads')
    .set('Cookie', adminCookie)
    .set(csrf)
    .type('image/png')
    .send(image);
  assert.equal(response.status, 201);
  assert.match(response.body.url, /^\/uploads\/[a-f0-9-]+\.webp$/);
  const published = await request(app).get(response.body.url);
  assert.equal(published.status, 200);
  assert.match(published.headers['content-type'], /image\/webp/);
  await rm(join(uploadDirectory, response.body.url.split('/').at(-1)), { force: true });
  const directory = await mkdtemp(join(tmpdir(), 'htv-upload-test-'));
  try {
    const saved = await saveProductImage(image, directory);
    const meta = await sharp(
      await readFile(join(directory, saved.url.split('/').at(-1)!)),
    ).metadata();
    assert.equal(meta.format, 'webp');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('admin statistics count paid receipts, exclude refunded/cancelled amounts and honor Vietnam calendar dates', async () => {
  await OrderModel.collection.insertMany(
    [
      {
        status: 'delivered',
        paymentStatus: 'paid',
        total: 100000,
        createdAt: new Date('2026-10-03T18:00:00Z'),
        items: [{ productId: 'a', name: 'A', quantity: 2, unitPrice: 40000 }],
      },
      {
        status: 'returned',
        paymentStatus: 'refunded',
        total: 80000,
        createdAt: new Date('2026-10-04T01:00:00Z'),
        items: [],
      },
      {
        status: 'pending',
        paymentStatus: 'unpaid',
        total: 50000,
        createdAt: new Date('2026-10-04T01:00:00Z'),
        items: [],
      },
    ].map((order, index) => ({
      ...order,
      code: 'TEST-' + index,
      orderCode: index + 1,
      idempotencyKey: 'test-key-' + index,
    })),
  );
  assert.equal(
    (await request(app).get('/api/admin/statistics').set('Cookie', staffCookie)).status,
    403,
  );
  const response = await request(app)
    .get('/api/admin/statistics?from=2026-10-04&to=2026-10-04')
    .set('Cookie', adminCookie);
  assert.equal(response.status, 200);
  assert.equal(response.body.orders, 3);
  assert.equal(response.body.totalCollected, 100000);
  assert.equal(response.body.topProducts[0].quantity, 2);
  assert.ok(Array.isArray(response.body.dailyOrders));
  assert.equal(response.body.dailyOrders.length, 1);
  assert.equal(response.body.dailyOrders.at(-1).collected, 100000);
  assert.equal(
    (await request(app).get('/api/admin/statistics?from=2026-02-30').set('Cookie', adminCookie))
      .status,
    400,
  );
});

test('admin product catalogue supports stable server filtering and pagination', async () => {
  const seed = loadSeedContent();
  const inserted = await request(app)
    .post('/api/admin/products')
    .set('Cookie', adminCookie)
    .set(csrf)
    .send({
      ...seed.products[0],
      id: 'catalog-pagination-example',
      slug: 'catalog-pagination-example',
      name: 'Bánh Chả kiểm thử tìm kiếm',
    });
  assert.equal(inserted.status, 201);

  const response = await request(app)
    .get('/api/admin/products?page=1&limit=2&q=b%C3%A1nh&sort=name&direction=asc')
    .set('Cookie', adminCookie);
  assert.equal(response.status, 200);
  const expectedCount = [...seed.products, inserted.body].filter((product) =>
    [product.name, product.id, product.slug, product.category, product.flavor]
      .join(' ')
      .toLocaleLowerCase('vi-VN')
      .includes('bánh'),
  ).length;
  assert.ok(expectedCount > 2);
  assert.equal(response.body.total, expectedCount);
  assert.equal(response.body.products.length, 2);
  assert.equal(response.body.page, 1);
  assert.equal(response.body.limit, 2);
  assert.ok(
    response.body.products[0].name.localeCompare(response.body.products[1].name, 'vi') <= 0,
  );
});
