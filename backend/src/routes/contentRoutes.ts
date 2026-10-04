import { Router } from 'express';
import type { RequestHandler } from 'express';

export function createContentRouter(handlers: {
  getContent: RequestHandler;
  getProducts: RequestHandler;
  getProduct: RequestHandler;
  createContact: RequestHandler;
  adminAuth: RequestHandler;
  adminLimiter: RequestHandler;
  publicLimiter: RequestHandler;
  getAdminContent: RequestHandler;
  putAdminContent: RequestHandler;
}) {
  const router = Router();
  router.get('/content', handlers.getContent);
  router.get('/products', handlers.getProducts);
  router.get('/products/:slug', handlers.getProduct);
  router.post('/contact', handlers.publicLimiter, handlers.createContact);
  router.get('/admin/content', handlers.adminLimiter, handlers.adminAuth, handlers.getAdminContent);
  router.put('/admin/content', handlers.adminLimiter, handlers.adminAuth, handlers.putAdminContent);
  return router;
}
