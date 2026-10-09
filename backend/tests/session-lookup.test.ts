import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { CustomerRepository } from '../src/services/customerRepository.js';
import { CustomerUser, CustomerSession } from '../src/models/customer.js';
import { hashSessionToken } from '../src/utils/customerSecurity.js';

let database: MongoMemoryReplSet;
const repository = new CustomerRepository();
before(async () => {
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});
after(async () => {
  await mongoose.disconnect();
  await database.stop();
});
async function fixture() {
  const token = randomBytes(32).toString('hex');
  const user = await CustomerUser.create({
    name: 'Khách thử nghiệm',
    email: `${token}@example.com`,
    passwordHash: 'local-test-only',
    role: 'customer',
  });
  const session = await CustomerSession.create({
    tokenHash: hashSessionToken(token),
    userId: user._id,
    expiresAt: new Date(Date.now() + 60_000),
    authVersion: 0,
  });
  return { token, user, session };
}

test('session resolution uses one command and immediately reflects account changes', async () => {
  const { token, user } = await fixture();
  const commands: string[] = [];
  mongoose.set('debug', (_collection: string, method: string) => commands.push(method));
  let view;
  try {
    view = await repository.sessionUser(token);
  } finally {
    mongoose.set('debug', false);
  }
  assert.deepEqual(commands, ['aggregate']);
  assert.equal(view?.id, user.id);
  assert.equal(view?.role, 'customer');
  assert.ok(!('passwordHash' in view!));
  await CustomerUser.updateOne({ _id: user._id }, { $set: { role: 'staff', name: 'Tên mới' } });
  const changed = await repository.sessionUser(token);
  assert.equal(changed?.role, 'staff');
  assert.equal(changed?.name, 'Tên mới');
  await CustomerUser.updateOne({ _id: user._id }, { $set: { accountStatus: 'suspended' } });
  assert.equal(await repository.sessionUser(token), undefined);
  await CustomerUser.updateOne(
    { _id: user._id },
    { $set: { accountStatus: 'active', authVersion: 1 } },
  );
  assert.equal(await repository.sessionUser(token), undefined);
});

test('session lookup rejects unverified, expired, revoked and orphaned sessions', async () => {
  const { token, user, session } = await fixture();
  await CustomerUser.updateOne({ _id: user._id }, { $set: { emailVerification: 'required' } });
  assert.equal(await repository.sessionUser(token), undefined);
  await CustomerUser.updateOne({ _id: user._id }, { $set: { verifiedAt: new Date() } });
  assert.ok(await repository.sessionUser(token));
  await CustomerSession.updateOne({ _id: session._id }, { $set: { expiresAt: new Date(0) } });
  assert.equal(await repository.sessionUser(token), undefined);
  await CustomerSession.updateOne(
    { _id: session._id },
    { $set: { expiresAt: new Date(Date.now() + 60_000) } },
  );
  await CustomerUser.deleteOne({ _id: user._id });
  assert.equal(await repository.sessionUser(token), undefined);
  await CustomerSession.deleteOne({ _id: session._id });
  assert.equal(await repository.sessionUser(token), undefined);
  assert.equal(await repository.sessionUser('invalid-token'), undefined);
});
