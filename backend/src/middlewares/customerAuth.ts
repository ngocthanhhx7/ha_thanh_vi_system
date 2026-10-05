import type { RequestHandler } from 'express';
import { CustomerRepository, type Role } from '../services/customerRepository.js';
import { CustomerError } from '../utils/customerSecurity.js';

export const SESSION_COOKIE = 'htv_session';
export function sessionToken(cookie: string | undefined): string | undefined {
  return cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(SESSION_COOKIE + '='))
    ?.slice(SESSION_COOKIE.length + 1);
}
export function customerSession(repository: CustomerRepository): RequestHandler {
  return async (req, _res, next) => {
    const token = sessionToken(req.get('cookie'));
    try {
      if (token) req.user = await repository.sessionUser(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new CustomerError(401, 'Vui lòng đăng nhập.'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new CustomerError(403, 'Bạn không có quyền thực hiện thao tác này.'));
      return;
    }
    next();
  };
}
export function csrfGuard(allowedOrigins: Set<string>, always = false): RequestHandler {
  return (req, _res, next) => {
    if (req.method === 'POST' && req.originalUrl.split('?')[0] === '/api/payments/payos/webhook') {
      next();
      return;
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || (!always && !req.user)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (
      req.get('x-requested-with') !== 'XMLHttpRequest' ||
      (origin && !allowedOrigins.has(origin))
    ) {
      next(new CustomerError(403, 'Nguồn yêu cầu không hợp lệ.'));
      return;
    }
    next();
  };
}
