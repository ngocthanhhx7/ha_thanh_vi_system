import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectSystemAuditAnomalies,
  SYSTEM_AUDIT_AUTH_FAILURE_THRESHOLD,
  SYSTEM_AUDIT_FORBIDDEN_THRESHOLD,
} from '../src/services/systemAuditAnomalies.js';

const now = new Date('2026-10-05T12:00:00.000Z');
const failedLogin = (index: number, actorIp = '192.0.2.1') => ({
  actorIp,
  event: 'POST /auth/login',
  statusCode: 401,
  createdAt: new Date(now.getTime() - index * 1000),
});

test('flags repeated authentication failures only after the configured threshold', () => {
  assert.equal(
    detectSystemAuditAnomalies(
      Array.from({ length: SYSTEM_AUDIT_AUTH_FAILURE_THRESHOLD - 1 }, (_, index) =>
        failedLogin(index),
      ),
    ).length,
    0,
  );

  const [alert] = detectSystemAuditAnomalies(
    Array.from({ length: SYSTEM_AUDIT_AUTH_FAILURE_THRESHOLD }, (_, index) => failedLogin(index)),
  );
  assert.deepEqual(alert, {
    type: 'repeated_auth_failures',
    count: 5,
    threshold: 5,
    windowMinutes: 15,
    actorIp: '192.0.2.1',
    latestAt: now.toISOString(),
  });
});

test('flags repeated permission denials per IP but excludes unrelated failures', () => {
  const entries = [
    ...Array.from({ length: SYSTEM_AUDIT_FORBIDDEN_THRESHOLD }, (_, index) => ({
      actorIp: '198.51.100.4',
      event: 'PATCH /admin/users/0123456789abcdef01234567',
      statusCode: 403,
      createdAt: new Date(now.getTime() - index * 1000),
    })),
    { ...failedLogin(0), statusCode: 500 },
    { ...failedLogin(1), actorIp: undefined },
  ];

  const alerts = detectSystemAuditAnomalies(entries);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'repeated_forbidden_access');
  assert.equal(alerts[0].count, SYSTEM_AUDIT_FORBIDDEN_THRESHOLD);
  assert.equal(alerts[0].actorIp, '198.51.100.4');
});
