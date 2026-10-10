import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, hashSessionToken } from '../src/utils/customerSecurity.js';
import { discountFor, assertReviewAllowed } from '../src/services/customerRules.js';
test('password hashes are salted and verify without storing plaintext', async () => {
  const one = await hashPassword('a-good-password');
  assert.notEqual(one, await hashPassword('a-good-password'));
  assert.equal(await verifyPassword('a-good-password', one), true);
  assert.equal(await verifyPassword('wrong-password', one), false);
  assert.equal(await verifyPassword('anything', 'malformed'), false);
  assert.equal(hashSessionToken('token').length, 64);
});
test('discount clamps percentage to server cap and never exceeds subtotal', () => {
  assert.equal(
    discountFor({ type: 'percent', value: 20, maxDiscount: 30000, minOrder: 100000 }, 200000),
    30000,
  );
  assert.equal(
    discountFor({ type: 'fixed', value: 500000, maxDiscount: 0, minOrder: 0 }, 100000),
    100000,
  );
  assert.throws(() =>
    discountFor({ type: 'fixed', value: 20000, maxDiscount: 0, minOrder: 100000 }, 99999),
  );
});
test('reviews require owner, delivered state and purchased product', () => {
  const order = {
    id: 'order',
    userId: 'alice',
    status: 'delivered',
    items: [{ productId: 'cake' }],
  };
  assert.doesNotThrow(() => assertReviewAllowed(order, 'alice', 'cake'));
  assert.throws(() => assertReviewAllowed(order, 'bob', 'cake'));
  assert.throws(() => assertReviewAllowed({ ...order, status: 'shipping' }, 'alice', 'cake'));
  assert.throws(() => assertReviewAllowed(order, 'alice', 'other'));
});
test('point vouchers cap the actual discount at 10% of merchandise subtotal', () => {
  const pointsVoucher = {
    type: 'fixed',
    value: 3000,
    maxDiscount: 0,
    minOrder: 0,
    orderPercentCap: 10,
  };
  assert.equal(discountFor(pointsVoucher, 10000), 1000);
  assert.equal(discountFor(pointsVoucher, 30000), 3000);
  assert.equal(discountFor(pointsVoucher, 50000), 3000);
  assert.equal(discountFor(pointsVoucher, 10009), 1000);
  assert.equal(discountFor(pointsVoucher, 0), 0);
  assert.equal(discountFor(pointsVoucher, 9), 0);
  assert.equal(discountFor({ ...pointsVoucher, maxDiscount: 500 }, 10000), 500);
  // A normal voucher keeps its original fixed discount without this optional cap.
  assert.equal(
    discountFor({ type: 'fixed', value: 3000, maxDiscount: 0, minOrder: 0 }, 10000),
    3000,
  );
});
