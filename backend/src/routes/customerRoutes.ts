import { createHash } from 'node:crypto';
import type { AuthOptions } from '../services/customerAuthService.js';
import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { CustomerRepository } from '../services/customerRepository.js';
import type { CustomerOrderGateway } from '../services/customerRules.js';
import type { CommerceContentRepository } from '../services/commerceService.js';
import { csrfGuard, customerSession, requireRole } from '../middlewares/customerAuth.js';
import { customerControllers } from '../controllers/customerController.js';

export function createCustomerModule(options: {
  orders: CustomerOrderGateway;
  content: CommerceContentRepository;
  allowedOrigins: Set<string>;
  isDevelopment: boolean;
  auth?: AuthOptions;
}) {
  const repository = new CustomerRepository();
  const router = Router();
  const h = customerControllers(
    repository,
    options.orders,
    options.content,
    options.isDevelopment,
    options.auth,
  );
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.' },
  });
  const identityLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) =>
      createHash('sha256')
        .update(
          String(
            req.body?.email ??
              req.body?.challengeId ??
              req.body?.token ??
              req.body?.appealToken ??
              '',
          )
            .trim()
            .toLowerCase(),
        )
        .digest('hex'),
    message: { message: 'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.' },
  });
  const accountLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 150,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const auth: RequestHandler = (req, res, next) => {
    try {
      repository.requireAvailable();
      requireRole('customer', 'staff', 'admin')(req, res, next);
    } catch (error) {
      next(error);
    }
  };
  router.post(
    '/auth/register',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.register,
  );
  router.post(
    '/auth/login',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.login,
  );
  router.post(
    '/auth/verify-email',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.verifyEmail,
  );
  router.post(
    '/auth/resend-verification',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.resendVerification,
  );
  router.post(
    '/auth/verify-login',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.verifyLogin,
  );
  router.post(
    '/auth/resend-login-otp',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.resendLogin,
  );
  router.post(
    '/auth/appeals',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.submitAppeal,
  );
  router.post(
    '/auth/forgot-password',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.forgotPassword,
  );
  router.post(
    '/auth/reset-password',
    authLimiter,
    identityLimiter,
    csrfGuard(options.allowedOrigins, true),
    h.resetPassword,
  );
  router.post('/auth/logout', auth, h.logout);
  router.get('/auth/me', auth, h.me);
  router.use('/account', auth, accountLimiter);
  router.patch('/account/profile', h.profile);
  router.get('/account/addresses', h.addresses);
  router.post('/account/addresses', h.saveAddress);
  router.patch('/account/addresses/:id', h.saveAddress);
  router.delete('/account/addresses/:id', h.deleteAddress);
  router.get('/account/orders', h.orders);
  router.get('/account/vouchers', h.wallet);
  router.post('/account/vouchers/claim', h.claim);
  router.post('/account/vouchers/quote', h.quote);
  router.post('/account/reviews', h.review);
  router.get('/products/:productId/reviews', h.reviews);
  router.get('/account/tickets', h.tickets);
  router.post('/account/tickets', h.createTicket);
  router.get('/notifications', auth, h.notifications);
  router.patch('/notifications/read-all', auth, h.readAllNotifications);
  router.patch('/notifications/:id/read', auth, h.readNotification);
  router.get('/staff/dashboard', auth, requireRole('admin', 'staff'), h.staffDashboard);
  router.get('/staff/tickets', auth, requireRole('admin', 'staff'), h.staffTickets);
  router.patch('/staff/tickets/:id', auth, requireRole('admin', 'staff'), h.updateTicket);
  router.get('/admin/users', auth, requireRole('admin'), h.users);
  router.get('/admin/system-logs', auth, requireRole('admin'), h.systemLogs);
  router.patch('/admin/users/:id', auth, requireRole('admin'), h.updateUser);
  router.get('/admin/users/:id/audit', auth, requireRole('admin'), h.userAudit);
  router.get('/admin/appeals', auth, requireRole('admin'), h.appeals);
  router.patch('/admin/appeals/:id', auth, requireRole('admin'), h.reviewAppeal);
  router.post('/admin/staff', auth, requireRole('admin'), h.staff);
  router.get('/admin/vouchers', auth, requireRole('admin'), h.adminVouchers);
  router.post('/admin/vouchers', auth, requireRole('admin'), h.createVoucher);
  return {
    repository,
    router,
    middleware: customerSession(repository),
    csrf: csrfGuard(options.allowedOrigins),
  };
}
