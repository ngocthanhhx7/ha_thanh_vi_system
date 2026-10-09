import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { containsCredentialOrPaymentData, containsPII } from '../validators/chat.js';
import type { ChatHandoffService } from '../services/chatHandoffService.js';
import { notificationService } from '../services/notificationService.js';
import { issueChatTicket } from '../services/chatRealtime.js';
import { CustomerRepository } from '../services/customerRepository.js';
import { sessionToken } from '../middlewares/customerAuth.js';

const transcriptSchema = z
  .object({
    transcript: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(1500),
          })
          .strict(),
      )
      .max(12)
      .default([]),
  })
  .strict();
const messageSchema = z.object({ message: z.string().trim().min(1).max(1500) }).strict();

const parse = <T>(schema: z.ZodType<T>, input: unknown) => schema.safeParse(input);
const idFrom = (req: Request) =>
  typeof req.params.id === 'string' ? req.params.id : (req.params.id?.[0] ?? '');

export function chatHandoffControllers(service: ChatHandoffService) {
  const cookieName = (id: string) => `htv_chat_${id}`;
  const accessTokenFrom = (req: Request, id: string) => {
    const prefix = cookieName(id) + '=';
    const cookie = req
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    return cookie || req.get('x-chat-token');
  };
  const setGuestCookie = (res: Response, id: string, token: string, isDevelopment: boolean) => {
    res.cookie(cookieName(id), token, {
      httpOnly: true,
      secure: !isDevelopment,
      sameSite: 'strict',
      maxAge: 7 * 86400000,
      path: `/api/chat/handoffs/${id}`,
    });
  };

  return {
    async realtimeTicket(req: Request, res: Response, next: NextFunction) {
      try {
        const id = idFrom(req);
        const token = accessTokenFrom(req, id);
        const userId = req.user?.id;
        const session = sessionToken(req.get('cookie'));
        const valid = async () => {
          if (userId) {
            const user = session ? await new CustomerRepository().sessionUser(session) : undefined;
            if (user?.id !== userId) return false;
          }
          return service.canSubscribe(id, userId, token);
        };
        if (!(await valid())) {
          res.status(404).json({ message: 'Không tìm thấy cuộc tư vấn.' });
          return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ticket: issueChatTicket({ handoffId: id, valid }) });
      } catch (error) {
        next(error);
      }
    },
    async create(req: Request, res: Response, next: NextFunction, isDevelopment: boolean) {
      const parsed = parse(transcriptSchema, req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? 'Yêu cầu không hợp lệ.' });
        return;
      }
      if (parsed.data.transcript.some((message) => containsPII(message.content))) {
        res.status(400).json({
          message:
            'Vui lòng xóa số điện thoại, mã đơn hàng và thông tin riêng tư khỏi nội dung chat trước khi chuyển cho nhân viên.',
        });
        return;
      }
      const accessToken = req.get('x-chat-token');
      if (accessToken && !/^[\w-]{40,60}$/.test(accessToken)) {
        res.status(400).json({ message: 'Mã phiên trò chuyện không hợp lệ.' });
        return;
      }
      try {
        const result = await service.create({
          userId: req.user?.id,
          userName: req.user?.name,
          accessToken,
          transcript: parsed.data.transcript,
        });
        await notificationService.safeRoles(['staff', 'admin'], {
          category: 'support',
          title: 'Khách cần tư vấn trực tiếp',
          message: 'Một cuộc trò chuyện mới đang chờ nhân viên tiếp nhận.',
          href: '/quan-tri?tab=chat',
          eventKey: `chat-handoff:${result.handoff.id}:created`,
        });
        if (result.accessToken)
          setGuestCookie(res, result.handoff.id, result.accessToken, isDevelopment);
        res.status(201).json({ handoff: result.handoff });
      } catch (error) {
        next(error);
      }
    },
    async getCustomer(req: Request, res: Response, next: NextFunction, isDevelopment: boolean) {
      try {
        const id = idFrom(req);
        const token = accessTokenFrom(req, id);
        const handoff = await service.getForCustomer(id, req.user?.id, token);
        if (!req.user && token) setGuestCookie(res, id, token, isDevelopment);
        res.json({ handoff });
      } catch (error) {
        next(error);
      }
    },
    async customerMessage(req: Request, res: Response, next: NextFunction, isDevelopment: boolean) {
      const parsed = parse(messageSchema, req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? 'Yêu cầu không hợp lệ.' });
        return;
      }
      if (containsCredentialOrPaymentData(parsed.data.message)) {
        res.status(400).json({
          message:
            'Vì an toàn, vui lòng không gửi mật khẩu, OTP, thông tin thẻ hoặc tài khoản ngân hàng.',
        });
        return;
      }
      try {
        const id = idFrom(req);
        const token = accessTokenFrom(req, id);
        const handoff = await service.addCustomerMessage(
          id,
          req.user?.id,
          token,
          parsed.data.message,
        );
        if (!req.user && token) setGuestCookie(res, id, token, isDevelopment);
        res.json({ handoff });
      } catch (error) {
        next(error);
      }
    },
    async listStaff(_req: Request, res: Response, next: NextFunction) {
      try {
        const [handoffs, summary] = await Promise.all([
          service.listForStaff(),
          service.staffSummary(),
        ]);
        res.json({ handoffs, summary });
      } catch (error) {
        next(error);
      }
    },
    async summary(_req: Request, res: Response, next: NextFunction) {
      try {
        res.json(await service.staffSummary());
      } catch (error) {
        next(error);
      }
    },
    async getStaff(req: Request, res: Response, next: NextFunction) {
      try {
        res.json({ handoff: await service.getForStaff(idFrom(req)) });
      } catch (error) {
        next(error);
      }
    },
    async claim(req: Request, res: Response, next: NextFunction) {
      try {
        const actor = req.user!;
        res.json({
          handoff: await service.claim(idFrom(req), {
            id: actor.id,
            name: actor.name,
            role: actor.role as 'admin' | 'staff',
          }),
        });
      } catch (error) {
        next(error);
      }
    },
    async staffMessage(req: Request, res: Response, next: NextFunction) {
      const parsed = parse(messageSchema, req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ message: parsed.error.issues[0]?.message ?? 'Yêu cầu không hợp lệ.' });
        return;
      }
      try {
        const actor = req.user!;
        if (actor.role === 'customer') {
          res.status(403).json({ message: 'Bạn không có quyền xử lý yêu cầu tư vấn.' });
          return;
        }
        res.json({
          handoff: await service.reply(
            idFrom(req),
            { id: actor.id, name: actor.name, role: actor.role as 'admin' | 'staff' },
            parsed.data.message,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
    async resolve(req: Request, res: Response, next: NextFunction) {
      try {
        const actor = req.user!;
        if (actor.role === 'customer') {
          res.status(403).json({ message: 'Bạn không có quyền kết thúc yêu cầu tư vấn.' });
          return;
        }
        res.json({
          handoff: await service.resolve(idFrom(req), {
            id: actor.id,
            name: actor.name,
            role: actor.role as 'admin' | 'staff',
          }),
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
