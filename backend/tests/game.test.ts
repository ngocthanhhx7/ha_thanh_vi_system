import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { GameService } from '../src/services/gameService.js';
import {
  newGame,
  enterGame,
  refreshGame,
  flipCard,
  publicGame,
  presence,
  CARDS,
  consumeCollection,
} from '../src/services/gameRules.js';
import { GameState, GameStock, GameReceipt } from '../src/models/game.js';
import { CustomerVoucher, CustomerWallet } from '../src/models/customer.js';
import { Notification } from '../src/models/operations.js';
const now = Date.parse('2026-10-08T12:00:00Z');
let db: MongoMemoryReplSet;
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(db.getUri());
  await Promise.all([
    GameState.init(),
    GameStock.init(),
    GameReceipt.init(),
    CustomerVoucher.init(),
    CustomerWallet.init(),
    Notification.init(),
  ]);
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
const uid = () => new mongoose.Types.ObjectId().toString();
test('daily GMT+7 grants once, attempts persist, unused draws expire', () => {
  const g = newGame(Date.parse('2026-10-08T16:59:00Z'));
  enterGame(g, Date.parse('2026-10-08T16:59:00Z'));
  assert.equal(g.attempts, 4);
  g.draws = 2;
  enterGame(g, Date.parse('2026-10-08T17:00:00Z'));
  assert.equal(g.attempts, 5);
  assert.equal(g.draws, 1);
  refreshGame(g, Date.parse('2026-10-08T17:01:00Z'));
  assert.equal(g.attempts, 5);
});
test('first reveal spends attempt, reload leaks no hidden cards, second reveal works at zero', () => {
  const g = newGame(now);
  enterGame(g, now);
  g.attempts = 1;
  flipCard(g, 0, now);
  assert.equal(g.attempts, 0);
  assert.equal(publicGame(g, 0).memory.cards.filter((c) => c.cardId).length, 1);
  const second = g.board.findIndex((id, i) => i !== 0 && id === g.board[0]);
  flipCard(g, second, now);
  assert.equal(g.matched.length, 2);
  assert.throws(() => flipCard(g, 1, now));
});
test('mismatched cards persist briefly and cannot reveal a third', () => {
  const g = newGame(now);
  enterGame(g, now);
  flipCard(g, 0, now);
  const other = g.board.findIndex((id) => id !== g.board[0]);
  flipCard(g, other, now);
  assert.equal(g.mismatch.length, 2);
  assert.throws(() => flipCard(g, 19, now + 500));
  refreshGame(g, now + 1700);
  assert.equal(g.mismatch.length, 0);
});
test('presence requires paced heartbeats; hidden pause grants nothing and bonus only once', () => {
  const g = newGame(now);
  enterGame(g, now);
  presence(g, undefined, now);
  const token = g.presenceToken;
  presence(g, token, now + 30000);
  assert.equal(g.productSeconds, 0);
  for (let i = 1; i <= 7; i++) presence(g, token, now + 30000 + i * 5000);
  assert.equal(g.draws, 2);
  assert.equal(g.productBonusClaimed, true);
});
test('collection consumption excludes rare for tier9 and rejects repeats', () => {
  const g = newGame(now);
  enterGame(g, now);
  for (const id of CARDS) g.inventory[id] = 2;
  consumeCollection(g, 9);
  assert.equal(g.inventory['banh-cha'], 2);
  assert.equal(g.inventory.flour, 1);
  assert.throws(() => consumeCollection(g, 9));
  consumeCollection(g, 10);
  assert.equal(g.inventory.flour, 0);
  assert.equal(g.inventory['banh-cha'], 1);
});
test('concurrent first visits grant once; repeat product visits grant once', async () => {
  const id = uid(),
    svc = new GameService();
  await Promise.all(Array.from({ length: 5 }, () => svc.act(id, { kind: 'enter' }, now)));
  await Promise.all(
    Array.from({ length: 5 }, () => svc.act(id, { kind: 'visit', page: 'products' }, now)),
  );
  assert.equal((await GameState.findById(id))!.data.attempts, 5);
});
test('draw request retries consume one draw and rare lifetime cap survives concurrent accounts', async () => {
  const svc = new GameService(() => 0);
  const ids = Array.from({ length: 15 }, uid);
  await Promise.all(ids.map((id) => svc.act(id, { kind: 'enter' }, now)));
  await Promise.all(ids.map((id) => svc.act(id, { kind: 'draw', requestId: randomUUID() }, now)));
  assert.equal((await GameStock.findById('banh-cha'))!.issued, 10);
  assert.equal(await GameState.countDocuments({ 'data.rareEver': true }), 10);
  const id = ids[0];
  await GameState.updateOne({ _id: id }, { $set: { 'data.draws': 2 } });
  const action = { kind: 'draw' as const, requestId: randomUUID() };
  await Promise.all([svc.act(id, action, now), svc.act(id, action, now)]);
  const g = (await GameState.findById(id))!.data;
  assert.equal(g.draws, 1);
  assert.ok(g.inventory['banh-cha'] <= 1);
});
test('concurrent reward claim is atomic/idempotent and resets board without welcome grant', async () => {
  const svc = new GameService(),
    id = uid();
  await svc.act(id, { kind: 'enter' }, now);
  await GameState.updateOne(
    { _id: id },
    { $set: { 'data.matched': Array.from({ length: 20 }, (_, i) => i), 'data.attempts': 7 } },
  );
  const results = await Promise.all([
    svc.act(id, { kind: 'memoryReward', round: 1 }, now),
    svc.act(id, { kind: 'memoryReward', round: 1 }, now),
  ]);
  assert.deepEqual(results[0].reward, results[1].reward);
  const g = (await GameState.findById(id))!.data;
  assert.equal(g.round, 2);
  assert.equal(g.attempts, 7);
  const wallets = await CustomerWallet.find({ userId: id });
  assert.equal(wallets.length, 1);
  const v = await CustomerVoucher.findById(wallets[0].voucherId);
  assert.equal(v!.value, 30000);
  assert.equal(v!.distribution, 'targeted');
  assert.equal(v!.expiresAt!.getTime() - v!.startsAt!.getTime(), 30 * 86400000);
  assert.equal(await Notification.countDocuments({ userId: id }), 1);
});
test('tier10 reward consumes each card once, capped50%, and insufficient redemption rolls back', async () => {
  const svc = new GameService(),
    id = uid();
  await svc.act(id, { kind: 'enter' }, now);
  await assert.rejects(svc.act(id, { kind: 'redeem', tier: 10 }, now));
  assert.equal(await CustomerWallet.countDocuments({ userId: id }), 0);
  await GameState.updateOne(
    { _id: id },
    { $set: { 'data.inventory': Object.fromEntries(CARDS.map((c) => [c, 1])) } },
  );
  await Promise.all([
    svc.act(id, { kind: 'redeem', tier: 10 }, now),
    svc.act(id, { kind: 'redeem', tier: 10 }, now),
  ]);
  const w = await CustomerWallet.findOne({ userId: id });
  const v = await CustomerVoucher.findById(w!.voucherId);
  assert.equal(v!.type, 'percent');
  assert.equal(v!.value, 50);
  assert.equal(v!.maxDiscount, 100000);
  assert.equal(v!.minOrder, 0);
  assert.ok(Object.values((await GameState.findById(id))!.data.inventory).every((n) => n === 0));
});

test('duplicate first-flip request cannot spend twice or advance the pair', async () => {
  const svc = new GameService(),
    id = uid();
  await svc.act(id, { kind: 'enter' }, now);
  const action = { kind: 'flip' as const, index: 0, requestId: randomUUID() };
  await Promise.all([svc.act(id, action, now), svc.act(id, action, now)]);
  const data = (await GameState.findById(id))!.data;
  assert.equal(data.attempts, 3);
  assert.equal(data.firstIndex, 0);
  assert.equal(publicGame(data, 10).memory.cards.filter((c) => c.cardId).length, 1);
});

test('notification failure rolls back inventory, voucher, wallet and redemption together', async () => {
  const { notificationService } = await import('../src/services/notificationService.js');
  const svc = new GameService(),
    id = uid();
  await svc.act(id, { kind: 'enter' }, now);
  await GameState.updateOne(
    { _id: id },
    { $set: { 'data.inventory': Object.fromEntries(CARDS.map((c) => [c, 1])) } },
  );
  const original = notificationService.user;
  notificationService.user = async () => {
    throw new Error('simulated persistence failure');
  };
  try {
    await assert.rejects(svc.act(id, { kind: 'redeem', tier: 9 }, now));
  } finally {
    notificationService.user = original;
  }
  const data = (await GameState.findById(id))!.data;
  assert.equal(data.redeemed9, false);
  assert.equal(data.inventory.flour, 1);
  assert.equal(await CustomerWallet.countDocuments({ userId: id }), 0);
  assert.equal(await GameReceipt.countDocuments({ userId: id, key: 'redeem:9' }), 0);
  await svc.act(id, { kind: 'redeem', tier: 9 }, now);
  assert.equal(await CustomerWallet.countDocuments({ userId: id }), 1);
});

test('GET and product visits never grant game entry rewards, entry remains once per GMT+7 day', async () => {
  const svc = new GameService(),
    id = uid();
  await svc.act(id, { kind: 'state' }, now);
  assert.equal(await GameState.countDocuments({ _id: id }), 0);
  await svc.act(id, { kind: 'visit', page: 'products' }, now);
  let data = (await GameState.findById(id))!.data;
  assert.equal(data.attempts, 1);
  assert.equal(data.draws, 0);
  assert.equal(data.welcome, false);
  await svc.act(id, { kind: 'enter' }, now);
  data = (await GameState.findById(id))!.data;
  assert.equal(data.attempts, 5);
  assert.equal(data.draws, 1);
  await svc.act(id, { kind: 'state' }, now + 86400000);
  data = (await GameState.findById(id))!.data;
  assert.equal(data.attempts, 5);
  await svc.act(id, { kind: 'enter' }, now + 86400000);
  data = (await GameState.findById(id))!.data;
  assert.equal(data.attempts, 6);
  assert.equal(data.draws, 1);
});

test('HTTP routes enforce authentication, CSRF, body validation, and no-store state', async () => {
  const express = (await import('express')).default;
  const request = (await import('supertest')).default;
  const { createGameRouter } = await import('../src/routes/gameRoutes.js');
  const { csrfGuard } = await import('../src/middlewares/customerAuth.js');
  const { createErrorHandler } = await import('../src/middlewares/errorHandler.js');
  const id = uid(),
    app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.get('test-login'))
      req.user = {
        id,
        name: 'Game test',
        email: 'game@example.test',
        phone: '',
        role: 'customer',
      };
    next();
  });
  app.use('/api', csrfGuard(new Set(['http://localhost:5173'])), createGameRouter());
  app.use(createErrorHandler({ storage: 'mongodb' }));
  await request(app).get('/api/games').expect(401);
  await request(app).post('/api/games/enter').set('test-login', 'yes').send({}).expect(403);
  await request(app)
    .post('/api/games/enter')
    .set('test-login', 'yes')
    .set('x-requested-with', 'XMLHttpRequest')
    .set('origin', 'https://evil.example')
    .send({})
    .expect(403);
  await request(app)
    .post('/api/games/memory/flip')
    .set('test-login', 'yes')
    .set('x-requested-with', 'XMLHttpRequest')
    .send({ index: -1, requestId: 'bad' })
    .expect(400);
  const entered = await request(app)
    .post('/api/games/enter')
    .set('test-login', 'yes')
    .set('x-requested-with', 'XMLHttpRequest')
    .send({})
    .expect(200);
  assert.equal(entered.body.state.memory.attempts, 4);
  await request(app)
    .post('/api/games/products-presence')
    .set('test-login', 'yes')
    .set('x-requested-with', 'XMLHttpRequest')
    .set('referer', 'http://localhost:5173/tro-choi')
    .send({})
    .expect(403);
  await request(app)
    .post('/api/games/visit')
    .set('test-login', 'yes')
    .set('x-requested-with', 'XMLHttpRequest')
    .send({ page: 'about' })
    .expect(403);
  const visit = await request(app)
    .post('/api/games/visit')
    .set('test-login', 'yes')
    .set('x-requested-with', 'XMLHttpRequest')
    .set('referer', 'http://localhost:5173/san-pham')
    .send({ page: 'products' })
    .expect(200);
  assert.equal(visit.body.state.memory.attempts, 5);
  const presence = await request(app)
    .post('/api/games/products-presence')
    .set('test-login', 'yes')
    .set('x-requested-with', 'XMLHttpRequest')
    .set('referer', 'http://localhost:5173/san-pham')
    .send({})
    .expect(200);
  assert.match(presence.body.token, /^[a-f0-9-]{36}$/);
  const state = await request(app).get('/api/games').set('test-login', 'yes').expect(200);
  assert.equal(state.headers['cache-control'], 'no-store');
  assert.ok(
    state.body.state.memory.cards.every((card: { cardId: unknown }) => card.cardId === null),
  );
});
