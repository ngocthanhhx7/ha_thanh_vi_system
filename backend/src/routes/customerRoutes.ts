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
}) {
  const repository = new CustomerRepository();
  const router = Router();
  const h = customerControllers(repository, options.orders, options.content, options.isDevelopment);
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau.' },
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
  router.post('/auth/register', authLimiter, csrfGuard(options.allowedOrigins, true), h.register);
  router.post('/auth/login', authLimiter, csrfGuard(options.allowedOrigins, true), h.login);
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
  router.get('/staff/tickets', auth, requireRole('admin', 'staff'), h.staffTickets);
  router.patch('/staff/tickets/:id', auth, requireRole('admin', 'staff'), h.updateTicket);
  router.get('/admin/users', auth, requireRole('admin'), h.users);
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
