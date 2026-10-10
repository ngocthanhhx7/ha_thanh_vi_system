import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { CustomerUser } from '../src/models/customer.js';
import { CustomerRepository } from '../src/services/customerRepository.js';
import { MongoRepository } from '../src/services/contentRepository.js';
import { ContentService } from '../src/services/contentService.js';
import { migrateIngredientCatalog } from '../src/services/ingredientMigration.js';
import { loadSeedContent } from '../src/utils/contentSeed.js';
import type { SiteContent } from '../src/validators/content.js';

let database: MongoMemoryServer;
let app: Express;
let repository: MongoRepository;
let adminCookie: string;
let staffCookie: string;
const csrf = { 'X-Requested-With': 'XMLHttpRequest', Origin: 'http://localhost:5173' };
const ingredient = {
  id: 'vanilla',
  name: 'Vani',
  image: '/brand/game/cards/flour.webp',
  description: 'Hương vani cho bánh.',
  coreFlavor: 'Hương thơm vani.',
};
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
  repository = new MongoRepository();
  const seed = loadSeedContent();
  await repository.seedIfAbsent(seed);
  app = createApp({
    repository,
    seedContent: seed,
    config: { frontendOrigin: 'http://localhost:5173', isDevelopment: true },
  });
  for (const role of ['admin', 'staff'] as const) {
    const user = await CustomerUser.create({
      name: role,
      email: role + '@example.com',
      passwordHash: 'test',
      role,
    });
    const cookie =
      'htv_session=' + (await new CustomerRepository().createSession(String(user._id)));
    if (role === 'admin') adminCookie = cookie;
    else staffCookie = cookie;
  }
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

test('ingredient catalog is public through content, with nine seeded items and assigned products', async () => {
  const response = await request(app).get('/api/content');
  assert.equal(response.body.ingredients.length, 9);
  assert.deepEqual(response.body.products[0].ingredientIds, [
    'flour',
    'sticky-rice',
    'lard',
    'sugar',
    'oil',
    'lime-leaf',
  ]);
  assert.deepEqual(response.body.products[1].ingredientIds.slice(-2), ['salted-egg', 'cacao']);
  assert.deepEqual(response.body.products[2].ingredientIds.slice(-2), ['salted-egg', 'matcha']);
});

test('ingredient CRUD protects admin access, CSRF, immutable ids, unique names and image safety', async () => {
  assert.equal((await request(app).get('/api/admin/ingredients')).status, 401);
  assert.equal(
    (await request(app).get('/api/admin/ingredients').set('Cookie', staffCookie)).status,
    403,
  );
  for (const [method, path] of [
    ['post', '/api/admin/ingredients'],
    ['patch', '/api/admin/ingredients/flour'],
    ['delete', '/api/admin/ingredients/flour'],
  ] as const) {
    assert.equal(
      (await request(app)[method](path).set('Cookie', staffCookie).set(csrf).send(ingredient))
        .status,
      403,
    );
    assert.equal(
      (await request(app)[method](path).set('Cookie', adminCookie).send(ingredient)).status,
      403,
    );
  }
  const api = () => request(app);
  assert.equal(
    (
      await api()
        .post('/api/admin/ingredients')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ ...ingredient, image: '/brand/../secret' })
    ).status,
    400,
  );
  assert.equal(
    (
      await api()
        .post('/api/admin/ingredients')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send(ingredient)
    ).status,
    201,
  );
  assert.equal(
    (
      await api()
        .post('/api/admin/ingredients')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ ...ingredient, id: 'other-vanilla', name: ' vani ' })
    ).status,
    409,
  );
  assert.equal(
    (
      await api()
        .patch('/api/admin/ingredients/vanilla')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ id: 'changed' })
    ).status,
    400,
  );
  const updated = await api()
    .patch('/api/admin/ingredients/vanilla')
    .set('Cookie', adminCookie)
    .set(csrf)
    .send({ coreFlavor: 'Hương mới.' });
  assert.equal(updated.body.coreFlavor, 'Hương mới.');
  assert.equal(
    (await api().get('/api/admin/ingredients').set('Cookie', adminCookie)).body.ingredients.length,
    10,
  );
  assert.equal(
    (await api().delete('/api/admin/ingredients/vanilla').set('Cookie', adminCookie).set(csrf))
      .status,
    204,
  );
});

test('product selections reject unknown and duplicate ingredients, and referenced ingredients cannot be deleted', async () => {
  const path = '/api/admin/products/banh-cha-truyen-thong';
  for (const ingredientIds of [['unknown'], ['flour', 'flour']]) {
    assert.equal(
      (await request(app).patch(path).set('Cookie', adminCookie).set(csrf).send({ ingredientIds }))
        .status,
      400,
    );
  }
  assert.equal(
    (await request(app).delete('/api/admin/ingredients/flour').set('Cookie', adminCookie).set(csrf))
      .status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .patch(path)
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ ingredientIds: [] })
    ).status,
    200,
  );
});

test('legacy whole-content saves preserve catalog and existing product selections; explicit empty catalog cannot strand references', async () => {
  const current = loadSeedContent();
  const legacy = structuredClone(current);
  delete legacy.ingredients;
  for (const product of legacy.products) delete product.ingredientIds;
  legacy.site.tagline = 'Nội dung cũ cập nhật';
  const response = await request(app)
    .put('/api/admin/content')
    .set('Cookie', adminCookie)
    .set(csrf)
    .send(legacy);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.ingredients, current.ingredients);
  assert.deepEqual(response.body.products[0].ingredientIds, current.products[0].ingredientIds);
  assert.equal(
    (
      await request(app)
        .put('/api/admin/content')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ ...current, ingredients: [] })
    ).status,
    400,
  );
});

test('site-only update retains catalog and product changes made after the editor loaded', async () => {
  const snapshot = (await request(app).get('/api/admin/content').set('Cookie', adminCookie)).body;
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/site')
        .set('Cookie', staffCookie)
        .set(csrf)
        .send(snapshot.site)
    ).status,
    403,
  );
  assert.equal(
    (await request(app).patch('/api/admin/site').set('Cookie', adminCookie).send(snapshot.site))
      .status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/site')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ ...snapshot.site, products: [] })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/admin/ingredients')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send(ingredient)
    ).status,
    201,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/products/banh-cha-truyen-thong')
        .set('Cookie', adminCookie)
        .set(csrf)
        .send({ name: 'Sản phẩm vừa cập nhật', ingredientIds: ['vanilla'] })
    ).status,
    200,
  );
  const site = { ...snapshot.site, tagline: 'Website vừa cập nhật' };
  const response = await request(app)
    .patch('/api/admin/site')
    .set('Cookie', adminCookie)
    .set(csrf)
    .send(site);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.site, site);
  assert.equal(response.body.ingredients.length, 10);
  assert.equal(response.body.ingredients.at(-1).id, 'vanilla');
  assert.equal(response.body.products[0].name, 'Sản phẩm vừa cập nhật');
  assert.deepEqual(response.body.products[0].ingredientIds, ['vanilla']);
});

test('migration is additive, idempotent, preserves explicit edits and never restores deliberately deleted catalog entries', async () => {
  const legacy = structuredClone(loadSeedContent());
  delete legacy.ingredients;
  for (const product of legacy.products) delete product.ingredientIds;
  legacy.products[0].name = 'Tên shop đã chỉnh';
  legacy.products[0].ingredientIds = [];
  await repository.saveContent(legacy);
  await migrateIngredientCatalog(repository, loadSeedContent());
  const migrated = (await repository.getContent())!;
  assert.equal(migrated.ingredients?.length, 9);
  assert.equal(migrated.products[0].name, 'Tên shop đã chỉnh');
  assert.deepEqual(migrated.products[0].ingredientIds, []);
  assert.deepEqual(migrated.products[1].ingredientIds?.slice(-2), ['salted-egg', 'cacao']);
  migrated.ingredients = migrated.ingredients!.filter((item) => item.id !== 'cacao');
  for (const product of migrated.products)
    product.ingredientIds = product.ingredientIds?.filter((id) => id !== 'cacao');
  await repository.saveContent(migrated);
  await migrateIngredientCatalog(repository, loadSeedContent());
  assert.deepEqual(await repository.getContent(), migrated);
});

test('migration retries a concurrent write without losing edits and content mutations reject lost updates', async () => {
  const seed = loadSeedContent();
  const legacy = structuredClone(seed);
  delete legacy.ingredients;
  let value: SiteContent = legacy;
  let attempts = 0;
  const concurrent = {
    storage: 'test',
    available: true,
    async getContent() {
      return structuredClone(value);
    },
    async saveContent(content: SiteContent) {
      value = content;
      return content;
    },
    async createContact() {},
    async saveContentIfCurrent(content: SiteContent) {
      if (++attempts === 1) {
        value.site.tagline = 'Concurrent edit';
        return false;
      }
      value = content;
      return true;
    },
  };
  await migrateIngredientCatalog(concurrent, seed);
  assert.equal(attempts, 2);
  assert.equal(value.site.tagline, 'Concurrent edit');
  concurrent.saveContentIfCurrent = async () => false;
  const service = new ContentService(concurrent, seed);
  await assert.rejects(service.replaceContent(value), { status: 409 });
  await assert.rejects(service.updateSite(value.site), { status: 409 });
  await assert.rejects(service.mutateIngredient(undefined, ingredient, 'create'), { status: 409 });
});
