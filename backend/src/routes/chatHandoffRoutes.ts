import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { csrfGuard, requireRole } from '../middlewares/customerAuth.js';
import type { ChatHandoffService } from '../services/chatHandoffService.js';
import { chatHandoffControllers } from '../controllers/chatHandoffController.js';

export function createChatHandoffRouter(
  service: ChatHandoffService,
  options: { isDevelopment: boolean; allowedOrigins: Set<string> },
) {
  const router = Router();
  const controllers = chatHandoffControllers(service);
  const customerWriteLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Bạn đã gửi nhiều yêu cầu hỗ trợ. Vui lòng thử lại sau ít phút.' },
  });
  const customerReadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 180,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Bạn đã tải cuộc trò chuyện quá thường xuyên. Vui lòng thử lại sau.' },
  });
  const staff = requireRole('staff', 'admin');
  router.post(
    '/chat/handoffs/:id/realtime-ticket',
    customerReadLimiter,
    csrfGuard(options.allowedOrigins, true),
    (req, res, next) => {
      if (!req.get('origin') || !options.allowedOrigins.has(req.get('origin')!)) {
        res.status(403).json({ message: 'Nguồn yêu cầu không hợp lệ.' });
        return;
      }
      next();
    },
    controllers.realtimeTicket,
  );

  router.post('/chat/handoffs', customerWriteLimiter, (req, res, next) =>
    controllers.create(req, res, next, options.isDevelopment),
  );
  router.get('/chat/handoffs/:id', customerReadLimiter, (req, res, next) =>
    controllers.getCustomer(req, res, next, options.isDevelopment),
  );
  router.post('/chat/handoffs/:id/messages', customerWriteLimiter, (req, res, next) =>
    controllers.customerMessage(req, res, next, options.isDevelopment),
  );
  router.get('/staff/chat-handoffs/summary', staff, controllers.summary);
  router.get('/staff/chat-handoffs', staff, controllers.listStaff);
  router.get('/staff/chat-handoffs/:id', staff, controllers.getStaff);
  router.patch('/staff/chat-handoffs/:id/claim', staff, controllers.claim);
  router.post('/staff/chat-handoffs/:id/messages', staff, controllers.staffMessage);
  router.patch('/staff/chat-handoffs/:id/resolve', staff, controllers.resolve);

  return router;
}
