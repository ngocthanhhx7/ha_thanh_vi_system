import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { SystemAuditLog } from '../models/operations.js';

const objectIdInPath = /(?:^|\/)([a-f\d]{24})(?:\/|$)/i;

export const systemAuditMiddleware: RequestHandler = (req, res, next) => {
  const path = req.path.slice(0, 240);
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isAuthAttempt = /^\/auth\/(?:login|verify-login|register)$/.test(path);
  const isAuditRead = req.method === 'GET' && path === '/admin/system-logs';
  const suppliedRequestId = req.get('x-request-id');
  const requestId =
    suppliedRequestId && /^[a-z\d-]{16,80}$/i.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  res.setHeader('X-Request-Id', requestId);

  res.once('finish', () => {
    const failed = res.statusCode >= 400;
    const securityFailure = [401, 403].includes(res.statusCode) || res.statusCode >= 500;
    if (!isWrite && !isAuthAttempt && !securityFailure && !isAuditRead) return;
    if (mongoose.connection.readyState !== 1) return;
    const severity =
      res.statusCode >= 500 ? 'critical' : res.statusCode >= 400 ? 'warning' : 'info';
    const actor = req.user;
    const targetId = path.match(objectIdInPath)?.[1];
    const targetType = path.includes('/orders')
      ? 'order'
      : path.includes('/users')
        ? 'user'
        : path.includes('/products')
          ? 'product'
          : path.includes('/tickets')
            ? 'ticket'
            : path.includes('/appeals')
              ? 'appeal'
              : undefined;
    void SystemAuditLog.create({
      ...(actor ? { actorUserId: actor.id, actorName: actor.name, actorRole: actor.role } : {}),
      requestId,
      event: `${req.method} ${path}`.slice(0, 180),
      outcome: failed ? 'failure' : 'success',
      ...(failed ? { reasonCode: `HTTP_${res.statusCode}` } : {}),
      severity,
      method: req.method,
      path,
      statusCode: res.statusCode,
      ...(req.ip ? { actorIp: req.ip.slice(0, 64) } : {}),
      ...(req.get('user-agent') ? { actorUserAgent: req.get('user-agent')!.slice(0, 512) } : {}),
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
    }).catch(() => {
      process.stderr.write('System audit event could not be persisted.\n');
    });
  });
  next();
};
