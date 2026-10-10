import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CustomerError } from '../utils/customerSecurity.js';
import { requireRole } from '../middlewares/customerAuth.js';
import { GameService, type GameAction } from '../services/gameService.js';
export function createGameRouter(service = new GameService()) {
  const router = Router();
  router.use(
    '/games',
    requireRole('customer'),
    rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  const handler =
    (action: (body: unknown) => GameAction): RequestHandler =>
    async (req, res, next) => {
      try {
        res.set('Cache-Control', 'no-store');
        res.json(await service.act(req.user!.id, action(req.body)));
      } catch (error) {
        next(
          error instanceof z.ZodError
            ? new CustomerError(400, 'Dữ liệu trò chơi không hợp lệ.')
            : error,
        );
      }
    };
  router.get(
    '/games',
    handler(() => ({ kind: 'state' })),
  );
  router.post(
    '/games/enter',
    handler((body) => {
      z.object({}).strict().parse(body);
      return { kind: 'enter' };
    }),
  );
  router.post(
    '/games/visit',
    (req, _res, next) => {
      const page = req.body?.page;
      next(visitContext(req.get('referer'), page === 'about' ? 'about' : 'products'));
    },
    handler((body) => ({
      kind: 'visit',
      ...z.object({ page: z.enum(['products', 'about']) }).parse(body),
    })),
  );
  router.post(
    '/games/products-presence',
    (req, _res, next) => next(visitContext(req.get('referer'), 'products')),
    handler((body) => ({
      kind: 'presence',
      ...z.object({ token: z.string().uuid().optional() }).parse(body),
    })),
  );
  router.post(
    '/games/memory/flip',
    handler((body) => ({
      kind: 'flip',
      ...z
        .object({
          index: z.number().int().min(0).max(19),
          requestId: z.string().uuid(),
          round: z.number().int().positive(),
        })
        .parse(body),
    })),
  );
  router.post(
    '/games/memory/start',
    handler((body) => ({
      kind: 'startMemory',
      ...z.object({ round: z.number().int().positive(), requestId: z.string().uuid() }).parse(body),
    })),
  );
  router.post(
    '/games/memory/redeem',
    handler((body) => ({
      kind: 'redeemMemory',
      ...z.object({ requestId: z.string().uuid() }).parse(body),
    })),
  );
  router.post(
    '/games/memory/reward',
    handler((body) => ({
      kind: 'memoryReward',
      ...z.object({ round: z.number().int().positive() }).parse(body),
    })),
  );
  router.post(
    '/games/collection/draw',
    handler((body) => ({
      kind: 'draw',
      ...z.object({ requestId: z.string().uuid() }).parse(body),
    })),
  );
  router.post(
    '/games/collection/redeem',
    handler((body) => ({
      kind: 'redeem',
      ...z.object({ tier: z.union([z.literal(9), z.literal(10)]) }).parse(body),
    })),
  );
  return router;
}

function visitContext(referer: string | undefined, page: 'products' | 'about') {
  try {
    const pathname = new URL(referer || '').pathname;
    const matches =
      page === 'about'
        ? pathname === '/ve-chung-toi'
        : pathname === '/san-pham' || pathname.startsWith('/san-pham/');
    if (matches) return undefined;
  } catch {
    /* A missing page context does not complete a visit mission. */
  }
  return new CustomerError(403, 'Mở trang nhiệm vụ để nhận lượt chơi.');
}
