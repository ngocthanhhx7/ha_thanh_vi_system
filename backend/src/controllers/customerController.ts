import type { RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import {
  CustomerUser,
  CustomerReview,
  CustomerTicket,
  CustomerVoucher,
  CustomerWallet,
} from '../models/customer.js';
import { CustomerAccountAudit } from '../models/accountManagement.js';
import { Notification, SystemAuditLog } from '../models/operations.js';
import { ChatHandoff } from '../models/chatHandoff.js';
import { OrderModel } from '../models/order.js';
import { notificationService } from '../services/notificationService.js';
import {
  detectSystemAuditAnomalies,
  SYSTEM_AUDIT_ALERT_WINDOW_MS,
} from '../services/systemAuditAnomalies.js';
import { CustomerRepository, isDuplicate, userView } from '../services/customerRepository.js';
import { CustomerAccountManagementService } from '../services/customerAccountManagementService.js';
import type { CustomerOrderGateway } from '../services/customerRules.js';
import { assertReviewAllowed } from '../services/customerRules.js';
import { CustomerError, hashPassword } from '../utils/customerSecurity.js';
import {
  addressInputSchema,
  claimSchema,
  loginSchema,
  objectId,
  registrationSchema,
  reviewInputSchema,
  ticketInputSchema,
  ticketUpdateSchema,
  voucherInputSchema,
} from '../validators/customer.js';
import { sessionToken, SESSION_COOKIE } from '../middlewares/customerAuth.js';
import type { CommerceContentRepository } from '../services/commerceService.js';
import { z } from 'zod';
import {
  CustomerAuthService,
  genericMailMessage,
  trustedDeviceToken,
  TRUSTED_DEVICE_COOKIE,
  type AuthOptions,
} from '../services/customerAuthService.js';
import {
  verificationSchema,
  authEmailSchema,
  loginVerificationSchema,
  loginResendSchema,
  resetPasswordSchema,
} from '../validators/customer.js';

const parse = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new CustomerError(400, 'Thông tin nhập chưa hợp lệ.');
  return result.data;
};
const present = (item: Record<string, unknown>) => {
  const fields: Record<string, unknown> = { ...item, id: String(item._id) };
  delete fields._id;
  delete fields.__v;
  delete fields.userId;
  delete fields.reservations;
  return fields;
};
const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 .()-]{9,20}$/),
  })
  .strict();
const adminUserUpdateSchema = z
  .object({
    name: registrationSchema.shape.name.optional(),
    phone: registrationSchema.shape.phone.optional(),
    role: z.enum(['customer', 'staff', 'admin']).optional(),
    accountStatus: z.enum(['active', 'suspended']).optional(),
    reason: z.string().trim().max(1500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const appealSubmissionSchema = z
  .object({
    appealToken: z.string().regex(/^[a-f0-9]{64}$/),
    message: z.string().trim().min(20).max(1500),
  })
  .strict();
const appealReviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(1000).default(''),
  })
  .strict()
  .refine((value) => value.decision !== 'reject' || value.note.length >= 5);
const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).default(''),
  role: z.enum(['customer', 'staff', 'admin']).optional(),
  accountStatus: z.enum(['active', 'suspended']).optional(),
  sort: z.enum(['createdAt', 'name', 'email', 'role', 'accountStatus']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
const adminLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    q: z.string().trim().max(120).default(''),
    severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
    outcome: z.enum(['success', 'failure']).optional(),
    actorRole: z.enum(['customer', 'staff', 'admin', 'guest']).optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    targetType: z.enum(['order', 'user', 'product', 'ticket', 'appeal']).optional(),
    statusCode: z.coerce.number().int().min(100).max(599).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'Ngày bắt đầu phải trước ngày kết thúc.',
  });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const quoteSchema = z
  .object({
    code: claimSchema.shape.code,
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(100),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export function customerControllers(
  repository: CustomerRepository,
  orders: CustomerOrderGateway,
  content: CommerceContentRepository,
  isDevelopment: boolean,
  authOptions?: AuthOptions,
) {
  const authService = new CustomerAuthService(repository, authOptions);
  const accountManagement = new CustomerAccountManagementService();
  const run =
    (handler: RequestHandler): RequestHandler =>
    async (req, res, next) => {
      try {
        repository.requireAvailable();
        await handler(req, res, next);
      } catch (error) {
        next(
          isDuplicate(error)
            ? new CustomerError(409, 'Thông tin đã tồn tại hoặc thao tác đã được thực hiện.')
            : error,
        );
      }
    };
  const cookie = (res: Response, token: string, remember = true) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDevelopment,
      ...(remember ? { maxAge: 30 * 86400000 } : {}),
      path: '/api',
    });
  const clearAuthentication = async (req: Parameters<RequestHandler>[0], res: Response) => {
    const token = sessionToken(req.get('cookie'));
    if (token) await repository.deleteSession(token);
    for (const name of [SESSION_COOKIE, TRUSTED_DEVICE_COOKIE])
      res.clearCookie(name, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !isDevelopment,
        path: '/api',
      });
  };
  return {
    register: run(async (req, res) => {
      res.status(201).json(await authService.register(parse(registrationSchema, req.body)));
    }),
    verifyEmail: run(async (req, res) => {
      const data = parse(verificationSchema, req.body);
      const grant = await authService.verifyEmail(data.email, data.code, data.rememberDevice);
      if ('appealRequired' in grant) {
        await clearAuthentication(req, res);
        res.json(grant);
        return;
      }
      const oldToken = sessionToken(req.get('cookie'));
      if (oldToken) await repository.deleteSession(oldToken);
      cookie(res, grant.token, grant.rememberDevice);
      if (grant.deviceToken)
        res.cookie(TRUSTED_DEVICE_COOKIE, grant.deviceToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: !isDevelopment,
          maxAge: 30 * 86400000,
          path: '/api',
        });
      res.json({ user: grant.user });
    }),
    resendVerification: run(async (req, res) => {
      const email = parse(authEmailSchema, req.body).email;
      void authService.resendEmail(email).catch(() => undefined);
      res.status(202).json({ message: genericMailMessage });
    }),
    login: run(async (req, res) => {
      const data = parse(loginSchema, req.body);
      const result = await authService.login(
        data.email,
        data.password,
        data.rememberDevice,
        trustedDeviceToken(req.get('cookie')),
      );
      if ('verificationRequired' in result) {
        res.status(403).json(result);
        return;
      }
      if ('otpRequired' in result) {
        res.json(result);
        return;
      }
      const oldToken = sessionToken(req.get('cookie'));
      if (oldToken) await repository.deleteSession(oldToken);
      cookie(res, result.token, result.rememberDevice);
      res.json({ user: result.user });
    }),
    verifyLogin: run(async (req, res) => {
      const data = parse(loginVerificationSchema, req.body);
      const grant = await authService.verifyLogin(data.challengeId, data.code);
      if ('appealRequired' in grant) {
        await clearAuthentication(req, res);
        res.json(grant);
        return;
      }
      const oldToken = sessionToken(req.get('cookie'));
      if (oldToken) await repository.deleteSession(oldToken);
      cookie(res, grant.token, grant.rememberDevice);
      if (grant.deviceToken)
        res.cookie(TRUSTED_DEVICE_COOKIE, grant.deviceToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: !isDevelopment,
          maxAge: 30 * 86400000,
          path: '/api',
        });
      res.json({ user: grant.user });
    }),
    submitAppeal: run(async (req, res) => {
      const data = parse(appealSubmissionSchema, req.body);
      const result = await authService.submitAccountAppeal(data.appealToken, data.message);
      await notificationService.safeRoles(['admin'], {
        category: 'account',
        title: 'Có kháng nghị tài khoản mới',
        message: 'Một khách hàng đã gửi kháng nghị, cần quản trị viên xem xét.',
        href: '/quan-tri?tab=users',
        eventKey: `account-appeal:${result.appeal.id}:submitted`,
      });
      res.status(201).json(result);
    }),
    resendLogin: run(async (req, res) => {
      await authService.resendLogin(parse(loginResendSchema, req.body).challengeId);
      res.status(202).json({ message: genericMailMessage });
    }),
    forgotPassword: run(async (req, res) => {
      const email = parse(authEmailSchema, req.body).email;
      // Reply independently of account lookup/SMTP latency to avoid recipient enumeration.
      void authService.forgotPassword(email).catch(() => undefined);
      res.status(202).json({ message: genericMailMessage });
    }),
    resetPassword: run(async (req, res) => {
      const data = parse(resetPasswordSchema, req.body);
      await authService.resetPassword(data.token, data.password);
      for (const name of [SESSION_COOKIE, TRUSTED_DEVICE_COOKIE])
        res.clearCookie(name, {
          httpOnly: true,
          sameSite: 'lax',
          secure: !isDevelopment,
          path: '/api',
        });
      res.json({ message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.' });
    }),
    logout: run(async (req, res) => {
      const token = sessionToken(req.get('cookie'));
      if (token) await repository.deleteSession(token);
      res.clearCookie(SESSION_COOKIE, {
        path: '/api',
        httpOnly: true,
        sameSite: 'lax',
        secure: !isDevelopment,
      });
      res.status(204).end();
    }),
    me: run(async (req, res) => res.json({ user: req.user })),
    profile: run(async (req, res) => {
      const data = parse(profileSchema, req.body);
      const user = await CustomerUser.findByIdAndUpdate(
        req.user!.id,
        { $set: data },
        { new: true },
      ).lean();
      res.json({ user: userView(user!) });
    }),
    addresses: run(async (req, res) =>
      res.json({ addresses: await repository.addresses(req.user!.id) }),
    ),
    saveAddress: run(async (req, res) => {
      const id = req.params.id ? parse(objectId, req.params.id) : undefined;
      const address = await repository.saveAddress(
        req.user!.id,
        parse(addressInputSchema, req.body),
        id,
      );
      res.status(id ? 200 : 201).json({ address });
    }),
    deleteAddress: run(async (req, res) => {
      await repository.deleteAddress(req.user!.id, parse(objectId, req.params.id));
      res.status(204).end();
    }),
    orders: run(async (req, res) => {
      const own = await orders.listByUser(req.user!.id);
      res.json({
        orders: own.map((order) => {
          const view = { ...order };
          delete view.userId;
          return view;
        }),
      });
    }),
    wallet: run(async (req, res) => res.json({ vouchers: await repository.wallet(req.user!.id) })),
    claim: run(async (req, res) => {
      const parsed = claimSchema.safeParse(req.body);
      if (!parsed.success)
        throw new CustomerError(
          400,
          'Mã ưu đãi cần từ 3–80 ký tự, chỉ gồm chữ cái, số, dấu gạch ngang hoặc gạch dưới.',
        );
      res.json({ vouchers: await repository.claim(req.user!.id, parsed.data.code) });
    }),
    quote: run(async (req, res) => {
      const data = parse(quoteSchema, req.body);
      if (new Set(data.items.map((item) => item.productId)).size !== data.items.length)
        throw new CustomerError(400, 'Sản phẩm không được lặp.');
      const site = await content.getContent();
      const subtotal = data.items.reduce((sum, item) => {
        const product = site?.products.find((product) => product.id === item.productId);
        if (!product || product.price === null)
          throw new CustomerError(409, 'Sản phẩm chưa có giá hợp lệ.');
        return sum + product.price * item.quantity;
      }, 0);
      res.json(await repository.quote(data.code, req.user!.id, subtotal));
    }),
    reviews: run(async (req, res) => {
      res.json({
        reviews: (
          await CustomerReview.find({ productId: String(req.params.productId) })
            .select('rating comment authorName createdAt')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean()
        ).map(present),
      });
    }),
    review: run(async (req, res) => {
      const data = parse(reviewInputSchema, req.body);
      parse(objectId, data.orderId);
      assertReviewAllowed(await orders.findById(data.orderId), req.user!.id, data.productId);
      // The unique index makes repeated submissions safe; retries can still recover a reward.
      const review = await CustomerReview.findOneAndUpdate(
        { userId: req.user!.id, orderId: data.orderId, productId: data.productId },
        { $setOnInsert: { ...data, userId: req.user!.id, authorName: req.user!.name } },
        { upsert: true, new: true },
      ).lean();
      await repository.reviewReward(req.user!.id, data.orderId);
      res
        .status(201)
        .json({ review: present(review!), reward: 'Một voucher cảm ơn cho mỗi đơn đã đánh giá.' });
    }),
    tickets: run(async (req, res) =>
      res.json({
        tickets: (
          await CustomerTicket.find({ userId: req.user!.id })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean()
        ).map(present),
      }),
    ),
    createTicket: run(async (req, res) => {
      const data = parse(ticketInputSchema, req.body);
      parse(objectId, data.orderId);
      const order = await orders.findById(data.orderId);
      if (!order || order.userId !== req.user!.id)
        throw new CustomerError(404, 'Không tìm thấy đơn hàng.');
      if (data.kind === 'return') {
        if (!['delivered', 'return_requested'].includes(order.status))
          throw new CustomerError(409, 'Chỉ yêu cầu trả hàng cho đơn đã giao.');
        if (order.status === 'delivered') await orders.requestReturn?.(data.orderId, req.user!.id);
        const ticket = await CustomerTicket.findOneAndUpdate(
          { userId: req.user!.id, orderId: data.orderId, kind: 'return' },
          { $setOnInsert: { ...data, userId: req.user!.id } },
          { upsert: true, new: true },
        ).lean();
        await notificationService.safeRoles(['staff', 'admin'], {
          category: 'support',
          title: 'Yêu cầu đổi trả mới',
          message: 'Một yêu cầu đổi trả đã được gửi và cần được xem xét.',
          href: '/quan-tri?tab=tickets',
          eventKey: `ticket:${String(ticket!._id)}:created`,
        });
        res.status(201).json({ ticket: present(ticket!) });
        return;
      }
      const ticket = await CustomerTicket.create({ ...data, userId: req.user!.id });
      await notificationService.safeRoles(['staff', 'admin'], {
        category: 'support',
        title: 'Yêu cầu chăm sóc khách hàng mới',
        message: 'Có yêu cầu hỗ trợ mới cần được tiếp nhận.',
        href: '/quan-tri?tab=tickets',
        eventKey: `ticket:${String(ticket._id)}:created`,
      });
      res.status(201).json({ ticket: present(ticket.toObject()) });
    }),
    staffTickets: run(async (_req, res) =>
      res.json({
        tickets: (await CustomerTicket.find().sort({ createdAt: -1 }).limit(200).lean()).map(
          present,
        ),
      }),
    ),
    updateTicket: run(async (req, res) => {
      const data = parse(ticketUpdateSchema, req.body);
      const ticket = await CustomerTicket.findByIdAndUpdate(
        parse(objectId, req.params.id),
        {
          $set: { status: data.status },
          $push: {
            replies: {
              authorName: req.user!.name,
              role: req.user!.role,
              message: data.reply,
              createdAt: new Date(),
            },
          },
        },
        { new: true },
      ).lean();
      if (!ticket) throw new CustomerError(404, 'Không tìm thấy yêu cầu hỗ trợ.');
      if (ticket.userId)
        await notificationService.safeUser(ticket.userId, {
          category: 'support',
          title: 'Yêu cầu hỗ trợ đã được cập nhật',
          message: 'Nhân viên đã phản hồi hoặc cập nhật trạng thái yêu cầu của bạn.',
          href: '/tai-khoan?section=support',
          eventKey: `ticket:${String(ticket._id)}:updated:${ticket.replies.at(-1)?.createdAt?.toISOString() ?? Date.now()}`,
        });
      res.json({ ticket: present(ticket) });
    }),
    users: run(async (req, res) => {
      const query = adminUsersQuerySchema.safeParse(req.query);
      if (!query.success) throw new CustomerError(400, 'Bộ lọc tài khoản không hợp lệ.');
      const { page, limit, q, role, accountStatus, sort, direction } = query.data;
      const filter: Record<string, unknown> = {};
      if (role) filter.role = role;
      if (accountStatus) filter.accountStatus = accountStatus;
      if (q) {
        const escaped = escapeRegex(q);
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { email: { $regex: escaped, $options: 'i' } },
          { phone: { $regex: escaped, $options: 'i' } },
        ];
      }
      const [records, total] = await Promise.all([
        CustomerUser.find(filter)
          .sort({ [sort]: direction === 'asc' ? 1 : -1, _id: direction === 'asc' ? 1 : -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        CustomerUser.countDocuments(filter),
      ]);
      res.json({ users: records.map(userView), total, page, limit });
    }),
    updateUser: run(async (req, res) => {
      const actor = req.user!;
      const user = await accountManagement.updateUser(
        parse(objectId, req.params.id),
        parse(adminUserUpdateSchema, req.body),
        {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          ip: req.ip,
          userAgent: req.get('user-agent')?.slice(0, 512),
        },
      );
      res.json({ user });
    }),
    userAudit: run(async (req, res) =>
      res.json({ audit: await accountManagement.userAudit(parse(objectId, req.params.id)) }),
    ),
    notifications: run(async (req, res) => {
      const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
      const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
      const [records, unread] = await Promise.all([
        Notification.find({ userId: req.user!.id })
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Notification.countDocuments({ userId: req.user!.id, readAt: { $exists: false } }),
      ]);
      res.json({
        notifications: records.map((entry) => ({
          id: String(entry._id),
          category: entry.category,
          title: entry.title,
          message: entry.message,
          href: entry.href,
          readAt: entry.readAt ?? null,
          createdAt: entry.createdAt,
        })),
        unread,
        page,
        limit,
      });
    }),
    readNotification: run(async (req, res) => {
      const notification = await Notification.findOneAndUpdate(
        { _id: parse(objectId, req.params.id), userId: req.user!.id, readAt: { $exists: false } },
        { $set: { readAt: new Date() } },
        { new: true },
      ).lean();
      if (!notification) {
        const exists = await Notification.exists({ _id: req.params.id, userId: req.user!.id });
        if (!exists) throw new CustomerError(404, 'Không tìm thấy thông báo.');
      }
      res.json({ success: true });
    }),
    readAllNotifications: run(async (req, res) => {
      const result = await Notification.updateMany(
        { userId: req.user!.id, readAt: { $exists: false } },
        { $set: { readAt: new Date() } },
      );
      res.json({ updated: result.modifiedCount });
    }),
    staffDashboard: run(async (req, res) => {
      const since = new Date(Date.now() - 13 * 86400000);
      since.setUTCHours(0, 0, 0, 0);
      const [orderCounts, orderTrend, openTickets, waitingChats, assignedChats] = await Promise.all(
        [
          OrderModel.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id', count: 1 } },
          ]),
          OrderModel.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt',
                    timezone: 'Asia/Ho_Chi_Minh',
                  },
                },
                orders: { $sum: 1 },
                paid: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$paymentStatus', 'paid'] },
                          { $not: [{ $in: ['$status', ['cancelled', 'returned']] }] },
                        ],
                      },
                      '$total',
                      0,
                    ],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: '$_id', orders: 1, paid: 1 } },
          ]),
          CustomerTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
          ChatHandoff.countDocuments({ status: 'waiting' }),
          ChatHandoff.countDocuments({
            status: 'assigned',
            assignedStaffId: req.user!.id,
          }),
        ],
      );
      const statusMap = Object.fromEntries(orderCounts.map(({ status, count }) => [status, count]));
      res.json({
        rangeDays: 14,
        orders: {
          pending: statusMap.pending ?? 0,
          returnRequested: statusMap.return_requested ?? 0,
          byStatus: orderCounts,
          daily: orderTrend,
        },
        support: { open: openTickets },
        chat: { waiting: waitingChats, assignedToMe: assignedChats },
      });
    }),
    systemLogs: run(async (req, res) => {
      const query = adminLogsQuerySchema.safeParse(req.query);
      if (!query.success) throw new CustomerError(400, 'Bộ lọc nhật ký không hợp lệ.');
      const {
        page,
        limit,
        q,
        severity,
        outcome,
        actorRole,
        method,
        targetType,
        statusCode,
        from,
        to,
      } = query.data;
      const filter: Record<string, unknown> = {};
      if (severity) filter.severity = severity;
      if (outcome) filter.outcome = outcome;
      if (actorRole) filter.actorRole = actorRole === 'guest' ? { $exists: false } : actorRole;
      if (method) filter.method = method;
      if (targetType) filter.targetType = targetType;
      if (statusCode) filter.statusCode = statusCode;
      if (from || to) {
        filter.createdAt = {
          ...(from ? { $gte: from } : {}),
          ...(to ? { $lte: to } : {}),
        };
      }
      if (q) {
        const escaped = escapeRegex(q);
        filter.$or = [
          { event: { $regex: escaped, $options: 'i' } },
          { path: { $regex: escaped, $options: 'i' } },
          { actorName: { $regex: escaped, $options: 'i' } },
          { actorIp: { $regex: escaped, $options: 'i' } },
          { actorUserAgent: { $regex: escaped, $options: 'i' } },
          { requestId: { $regex: escaped, $options: 'i' } },
          { targetId: { $regex: escaped, $options: 'i' } },
          { actorRole: { $regex: escaped, $options: 'i' } },
          { method: { $regex: escaped, $options: 'i' } },
          { targetType: { $regex: escaped, $options: 'i' } },
          { statusCode: Number.isNaN(Number(q)) ? -1 : Number(q) },
        ];
      }
      const anomalyWindowStart = new Date(Date.now() - SYSTEM_AUDIT_ALERT_WINDOW_MS);
      const [logs, total, recentFailures] = await Promise.all([
        SystemAuditLog.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        SystemAuditLog.countDocuments(filter),
        SystemAuditLog.find({
          createdAt: { $gte: anomalyWindowStart },
          outcome: 'failure',
          statusCode: { $in: [401, 403] },
          actorIp: { $type: 'string', $ne: '' },
        })
          .select('actorIp actorName actorRole actorUserId event statusCode createdAt')
          .sort({ createdAt: -1 })
          .limit(2000)
          .lean(),
      ]);
      res.json({
        logs: logs.map((entry) => ({ ...entry, id: String(entry._id), _id: undefined })),
        total,
        page,
        limit,
        anomalies: detectSystemAuditAnomalies(recentFailures),
      });
    }),
    appeals: run(async (_req, res) => res.json({ appeals: await accountManagement.listAppeals() })),
    reviewAppeal: run(async (req, res) => {
      const actor = req.user!;
      const data = parse(appealReviewSchema, req.body);
      res.json({
        appeal: await accountManagement.reviewAppeal(
          parse(objectId, req.params.id),
          data.decision,
          data.note,
          {
            id: actor.id,
            name: actor.name,
            email: actor.email,
            ip: req.ip,
            userAgent: req.get('user-agent')?.slice(0, 512),
          },
        ),
      });
    }),
    staff: run(async (req, res) => {
      const data = parse(
        z
          .object({
            name: registrationSchema.shape.name,
            email: registrationSchema.shape.email,
            phone: registrationSchema.shape.phone,
            password: registrationSchema.shape.password,
          })
          .strict(),
        req.body,
      );
      const user = await CustomerUser.create({
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash: await hashPassword(data.password),
        role: 'staff',
      });
      await CustomerAccountAudit.create({
        actorUserId: req.user!.id,
        actorName: req.user!.name,
        actorEmail: req.user!.email,
        actorIp: req.ip,
        actorUserAgent: req.get('user-agent')?.slice(0, 512),
        targetUserId: user._id,
        targetName: user.name,
        targetEmail: user.email,
        action: 'admin.staff.created',
        changes: [{ field: 'role', before: null, after: 'staff' }],
      });
      res.status(201).json({ user: userView(user.toObject()) });
    }),
    adminVouchers: run(async (_req, res) => {
      const [records, walletCounts] = await Promise.all([
        CustomerVoucher.find().sort({ createdAt: -1 }).limit(200).lean(),
        CustomerWallet.aggregate([{ $group: { _id: '$voucherId', count: { $sum: 1 } } }]),
      ]);
      const counts = new Map(walletCounts.map((item) => [String(item._id), item.count]));
      res.json({
        vouchers: records.map((voucher) => ({
          ...present(voucher),
          walletCount: counts.get(String(voucher._id)) ?? 0,
        })),
      });
    }),
    createVoucher: run(async (req, res) => {
      const data = parse(voucherInputSchema, req.body);
      if (data.code.startsWith('REVIEW_'))
        throw new CustomerError(400, 'Tiền tố REVIEW_ dành cho voucher thưởng.');
      const { customerIds, ...voucherData } = data;
      const recipients = customerIds.length
        ? await CustomerUser.find({
            _id: { $in: customerIds },
            role: 'customer',
            accountStatus: { $ne: 'suspended' },
          })
            .select('_id')
            .lean()
        : [];
      if (recipients.length !== customerIds.length)
        throw new CustomerError(400, 'Một số khách nhận không tồn tại hoặc không đủ điều kiện.');

      const session = await CustomerVoucher.startSession();
      let voucher: InstanceType<typeof CustomerVoucher> | null = null;
      try {
        await session.withTransaction(async () => {
          const [created] = await CustomerVoucher.create([voucherData], { session });
          voucher = created;
          if (recipients.length)
            await CustomerWallet.insertMany(
              recipients.map((recipient) => ({
                userId: String(recipient._id),
                voucherId: created._id,
                code: created.code,
                grantSource: 'admin',
                grantedBy: req.user!.id,
              })),
              { session, ordered: true },
            );
        });
      } catch (error) {
        if (isDuplicate(error)) throw new CustomerError(409, 'Mã voucher này đã được phát hành.');
        throw error;
      } finally {
        await session.endSession();
      }
      if (!voucher) throw new CustomerError(503, 'Chưa thể phát hành voucher. Vui lòng thử lại.');
      const issuedVoucher = voucher as InstanceType<typeof CustomerVoucher>;
      const notification = {
        category: 'system' as const,
        title: 'Bạn vừa nhận được ưu đãi',
        message: `${issuedVoucher.name} · Mã ${issuedVoucher.code}`,
        href: '/tai-khoan?section=vouchers',
      };
      if (issuedVoucher.distribution === 'automatic')
        await notificationService.safeRoles(['customer'], {
          ...notification,
          eventKey: `voucher:${String(issuedVoucher._id)}:automatic`,
        });
      else if (issuedVoucher.distribution === 'targeted')
        await Promise.all(
          recipients.map((recipient) =>
            notificationService.safeUser(String(recipient._id), {
              ...notification,
              eventKey: `voucher:${String(issuedVoucher._id)}:granted:${String(recipient._id)}`,
            }),
          ),
        );
      res.status(201).json({
        voucher: present(issuedVoucher.toObject()),
        assignedCount: recipients.length,
      });
    }),
    updateVoucherStatus: run(async (req, res) => {
      const { active } = parse(z.object({ active: z.boolean() }).strict(), req.body);
      const voucher = await CustomerVoucher.findByIdAndUpdate(
        parse(objectId, req.params.id),
        { $set: { active } },
        { new: true, runValidators: true },
      ).lean();
      if (!voucher) throw new CustomerError(404, 'Không tìm thấy voucher.');
      res.json({ voucher: present(voucher) });
    }),
  };
}
