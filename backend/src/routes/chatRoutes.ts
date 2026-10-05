import { Router, type RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import type { ChatService } from '../services/chatService.js';
import { chatControllers } from '../controllers/chatController.js';

export interface ChatRouterOptions {
  limiter?: RequestHandler;
  guestLimit?: number;
  authenticatedLimit?: number;
  windowMs?: number;
}

export function createChatRouter(service: ChatService, options?: ChatRouterOptions) {
  const router = Router();
  const controllers = chatControllers(service);

  const guestLimit = options?.guestLimit ?? 5;
  const authenticatedLimit = options?.authenticatedLimit ?? 50;
  const quotaLimiter = rateLimit({
    windowMs: options?.windowMs ?? 24 * 60 * 60 * 1000,
    limit: (req) => (req.user ? authenticatedLimit : guestLimit),
    keyGenerator: (req) => {
      if (req.user) return `account:${req.user.id}`;
      const visitorToken = req.get('x-chat-token');
      if (visitorToken && /^[\w-]{40,60}$/.test(visitorToken))
        return `visitor:${createHash('sha256').update(visitorToken).digest('hex')}`;
      return `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    handler: (req, res) => {
      const limit = req.user ? authenticatedLimit : guestLimit;
      res.status(429).json({
        reply: `Bạn đã dùng hết ${limit} lượt tư vấn trong 24 giờ qua. Vị Ơi đã xác nhận và có thể kết nối bạn với nhân viên nếu cần nhé.`,
        products: [],
        handoff: true,
        sources: [{ label: 'Liên hệ Hà Thành Vị', url: '/lien-he' }],
        available: false,
        limit,
        remaining: 0,
      });
    },
  });

  const chatLimiter = options?.limiter ?? quotaLimiter;

  router.get('/chat/config', controllers.getConfig);
  router.post('/chat', chatLimiter, controllers.postChat);

  return router;
}
