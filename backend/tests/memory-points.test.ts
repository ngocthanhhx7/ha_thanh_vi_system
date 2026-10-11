import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  enterGame,
  flipCard,
  refreshGame,
  publicGame,
  CARDS,
} from '../src/services/gameRules.js';
import { startMemory, redeemMemory, memoryPoints } from '../src/services/memoryRules.js';

const now = Date.parse('2026-10-10T08:00:00Z');

test('new rounds select five distinct random types, paired twice, and last exactly 120 seconds', () => {
  const selections = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const data = newGame(now);
    enterGame(data, now);
    startMemory(data, data.round, now);
    assert.equal(data.board.length, 10);
    const types = [...new Set(data.board)];
    assert.equal(types.length, 5);
    for (const type of types) {
      assert.ok(CARDS.includes(type));
      assert.equal(data.board.filter((card) => card === type).length, 2);
    }
    selections.add(types.sort().join(','));
    assert.equal(data.memoryProgress!.deadline, now + 120000);
    refreshGame(data, now + 119999);
    assert.equal(data.memoryProgress!.status, 'playing');
    refreshGame(data, now + 120000);
    assert.equal(data.memoryProgress!.status, 'lost');
  }
  assert.ok(selections.size > 1);
});
test('memory entry no longer grants pair attempts or exposes missions', () => {
  const data = newGame(now);
  enterGame(data, now);
  assert.equal(data.attempts, 0);
  const memory = publicGame(data, 0, now).memory;
  assert.equal('missions' in memory, false);
  assert.equal('status' in memory && memory.status, 'idle');
  assert.throws(() => flipCard(data, 0, now), /Bắt đầu/);
});
test('legacy migration preserves collection and never creates points from attempts', () => {
  const data = newGame(now);
  data.attempts = 123;
  data.inventory['banh-cha'] = 1;
  data.rareEver = true;
  data.redeemed9 = true;
  data.board = [...CARDS, ...CARDS];
  data.firstIndex = 0;
  refreshGame(data, now);
  const memory = publicGame(data, 10, now).memory;
  assert.equal('points' in memory && memory.points, 0);
  assert.equal(data.inventory['banh-cha'], 1);
  assert.equal(data.rareEver, true);
  assert.equal(data.redeemed9, true);
  assert.equal(data.firstIndex, null);
});

function win(data: ReturnType<typeof newGame>, start: number, elapsed: number) {
  startMemory(data, data.round, start);
  // Use the actual shuffled positions, without relying on a predictable board.
  for (const id of new Set(data.board)) {
    const indices = data.board.flatMap((card, index) => (card === id ? [index] : []));
    flipCard(data, indices[0], start + elapsed - 1);
    flipCard(data, indices[1], start + elapsed);
  }
}

test('three timed starts per day, reload and midnight never extend a live deadline', () => {
  const midnight = Date.parse('2026-10-10T17:00:00Z');
  const data = newGame(midnight - 10000);
  enterGame(data, midnight - 10000);
  startMemory(data, data.round, midnight - 10000);
  const deadline = data.memoryProgress!.deadline;
  assert.throws(() => startMemory(data, data.round, midnight), /đang có/);
  refreshGame(data, midnight);
  assert.equal(data.memoryProgress!.started, 0);
  assert.equal(data.memoryProgress!.deadline, deadline);
  refreshGame(data, deadline);
  assert.equal(data.memoryProgress!.status, 'lost');
  for (let i = 0; i < 3; i++) {
    const start = deadline + i * 120000;
    startMemory(data, data.round, start);
    refreshGame(data, start + 120000);
  }
  assert.throws(() => startMemory(data, data.round, deadline + 360000), /3 ván/);
  startMemory(data, data.round, midnight + 86400000);
  assert.equal(data.memoryProgress!.started, 1);
});

test('first lifetime win is free; personal records bonus; cap includes bonuses and truncates final win', () => {
  const data = newGame(now);
  enterGame(data, now);
  win(data, now, 30000);
  assert.equal(data.memoryProgress!.lastPoints, 0);
  assert.equal(data.memoryProgress!.bestMs, 30000);
  const day2 = now + 86400000;
  win(data, day2, 25000);
  assert.equal(data.memoryProgress!.lastPoints, 250);
  win(data, day2 + 60000, 20000);
  assert.equal(data.memoryProgress!.lastPoints, 250);
  win(data, day2 + 120000, 18000);
  assert.equal(data.memoryProgress!.lastPoints, 100);
  assert.equal(data.memoryProgress!.earnedToday, 600);
  assert.equal(memoryPoints(data.memoryProgress!), 600);
  assert.equal(data.memoryProgress!.bestMs, 18000);
  win(data, day2 + 86400000, 18000);
  assert.equal(data.memoryProgress!.lastPoints, 200);
  assert.equal(data.memoryProgress!.earnedToday, 200);
});

test('last match at exact deadline cannot win or grant points', () => {
  const data = newGame(now);
  enterGame(data, now);
  startMemory(data, data.round, now);
  data.matched = Array.from({ length: 8 }, (_, i) => i);
  data.board[9] = data.board[8];
  flipCard(data, 8, now + 119999);
  assert.throws(() => flipCard(data, 9, now + 120000), /hết giờ/);
  assert.equal(data.memoryProgress!.status, 'lost');
  assert.equal(data.memoryProgress!.wins, 0);
  assert.equal(memoryPoints(data.memoryProgress!), 0);
});

test('points expire lot by lot at exactly 90 days and redemption takes only the live balance', () => {
  const data = newGame(now);
  enterGame(data, now);
  const expires = now + 90 * 86400000;
  data.memoryProgress!.lots = [
    { amount: 200, expiresAt: expires },
    { amount: 3000, expiresAt: expires + 1 },
  ];
  refreshGame(data, expires - 1);
  assert.equal(memoryPoints(data.memoryProgress!), 3200);
  assert.equal(redeemMemory(data, expires), 3000);
  assert.equal(memoryPoints(data.memoryProgress!), 0);
  assert.throws(() => redeemMemory(data, expires), /3.000/);
});

test('a backwards clock cannot reset already-consumed rounds or daily points', () => {
  const midnight = Date.parse('2026-10-10T17:00:00Z');
  const data = newGame(midnight - 1000);
  enterGame(data, midnight - 1000);
  startMemory(data, data.round, midnight + 1000);
  data.memoryProgress!.earnedToday = 250;
  refreshGame(data, midnight - 1000);
  assert.equal(data.memoryProgress!.started, 1);
  assert.equal(data.memoryProgress!.earnedToday, 250);
  assert.equal(data.memoryProgress!.day, '2026-10-11');
});
