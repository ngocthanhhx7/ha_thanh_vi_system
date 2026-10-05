import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config/env.js';

test('proxy trust is disabled by default and accepts exactly one configured proxy', () => {
  assert.equal(readConfig({}).trustProxyHops, 0);
  assert.equal(readConfig({ TRUST_PROXY_HOPS: '1' }).trustProxyHops, 1);
  for (const value of ['true', '-1', '2', '1.5']) {
    assert.throws(() => readConfig({ TRUST_PROXY_HOPS: value }), /TRUST_PROXY_HOPS/);
  }
});
