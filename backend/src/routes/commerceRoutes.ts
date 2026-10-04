import { Router } from 'express';
import { commerceControllers } from '../controllers/commerceController.js';
import type { CommerceService } from '../services/commerceService.js';
import { requireRole } from '../middlewares/customerAuth.js';

export function createCommerceRouter(options: {
  service: CommerceService;
  checksumKey?: string;
  publicLimiter: ReturnType<typeof import('express-rate-limit').default>;
  adminLimiter: ReturnType<typeof import('express-rate-limit').default>;
}) {
  const router = Router();
  const controllers = commerceControllers(options.service, options.checksumKey);
  const admin = requireRole('admin', 'staff');

  router.get('/commerce/config', (_req, res) => res.json(options.service.config));
  router.post('/orders', options.publicLimiter, controllers.checkout);
  router.get('/orders/:id', options.publicLimiter, controllers.getOrder);
  router.post('/orders/:id/cancel', options.publicLimiter, controllers.cancelOrder);
  router.post('/orders/:id/payment', options.publicLimiter, controllers.createPayment);
  router.post('/payments/payos/webhook', controllers.webhook);
  router.get('/admin/orders', options.adminLimiter, admin, controllers.adminList);
  router.patch('/admin/orders/:id', options.adminLimiter, admin, controllers.adminUpdate);
  return router;
}
