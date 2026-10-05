import type { Request, Response, NextFunction } from 'express';
import type { ChatService } from '../services/chatService.js';
import { chatRequestSchema } from '../validators/chat.js';

export function chatControllers(service: ChatService) {
  return {
    getConfig(_req: Request, res: Response) {
      res.json(service.getConfig());
    },

    async postChat(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const parsed = chatRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          const firstIssue = parsed.error.issues[0];
          const errorMessage = firstIssue?.message || 'Yêu cầu không hợp lệ.';
          res.status(400).json({ message: errorMessage });
          return;
        }

        const result = await service.processChat(parsed.data);
        res.status(result.status).json(result.body);
      } catch (err) {
        next(err);
      }
    },
  };
}
