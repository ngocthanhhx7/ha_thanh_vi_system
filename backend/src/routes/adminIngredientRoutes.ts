import { Router, type RequestHandler } from 'express';
import type { ContentService } from '../services/contentService.js';

export function createAdminIngredientRouter(
  content: ContentService,
  adminAuth: RequestHandler,
  limiter: RequestHandler,
) {
  const router = Router();
  router.use('/admin/ingredients', limiter, adminAuth);
  router.get('/admin/ingredients', async (_req, res, next) => {
    try {
      res.json({ ingredients: (await content.getPublicContent()).ingredients ?? [] });
    } catch (error) {
      next(error);
    }
  });
  router.post('/admin/ingredients', async (req, res, next) => {
    try {
      res.status(201).json(await content.mutateIngredient(undefined, req.body, 'create'));
    } catch (error) {
      next(error);
    }
  });
  router.patch('/admin/ingredients/:id', async (req, res, next) => {
    try {
      res.json(await content.mutateIngredient(String(req.params.id), req.body, 'update'));
    } catch (error) {
      next(error);
    }
  });
  router.delete('/admin/ingredients/:id', async (req, res, next) => {
    try {
      await content.mutateIngredient(String(req.params.id), undefined, 'delete');
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
