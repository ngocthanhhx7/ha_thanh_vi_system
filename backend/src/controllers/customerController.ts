import type { RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import {
  CustomerUser,
  CustomerReview,
  CustomerTicket,
  CustomerVoucher,
} from '../models/customer.js';
import { CustomerRepository, isDuplicate, userView } from '../services/customerRepository.js';
import type { CustomerOrderGateway } from '../services/customerRules.js';
import { assertReviewAllowed } from '../services/customerRules.js';
import { CustomerError, hashPassword, verifyPassword } from '../utils/customerSecurity.js';
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
) {
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
  const cookie = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDevelopment,
      maxAge: 30 * 86400000,
      path: '/api',
    });
  return {
    register: run(async (req, res) => {
      const data = parse(registrationSchema, req.body);
      const user = await CustomerUser.create({
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash: await hashPassword(data.password),
        role: 'customer',
      });
      cookie(res, await repository.createSession(String(user._id)));
      res.status(201).json({ user: userView(user.toObject()) });
    }),
    login: run(async (req, res) => {
      const data = parse(loginSchema, req.body);
      const user = await CustomerUser.findOne({ email: data.email }).select('+passwordHash').lean();
      // Run scrypt for unknown emails as well to avoid trivial timing-based email enumeration.
      const matches = await verifyPassword(
        data.password,
        user?.passwordHash ?? 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128),
      );
      if (!user || !matches) throw new CustomerError(401, 'Email hoặc mật khẩu chưa đúng.');
      const oldToken = sessionToken(req.get('cookie'));
      if (oldToken) await repository.deleteSession(oldToken);
      cookie(res, await repository.createSession(String(user._id)));
      res.json({ user: userView(user) });
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
    claim: run(async (req, res) =>
      res.json({
        vouchers: await repository.claim(req.user!.id, parse(claimSchema, req.body).code),
      }),
    ),
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
        res.status(201).json({ ticket: present(ticket!) });
        return;
      }
      const ticket = await CustomerTicket.create({ ...data, userId: req.user!.id });
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
      res.json({ ticket: present(ticket) });
    }),
    users: run(async (_req, res) =>
      res.json({
        users: (await CustomerUser.find().sort({ createdAt: -1 }).limit(200).lean()).map(userView),
      }),
    ),
    staff: run(async (req, res) => {
      const data = parse(registrationSchema, req.body);
      const user = await CustomerUser.create({
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash: await hashPassword(data.password),
        role: 'staff',
      });
      res.status(201).json({ user: userView(user.toObject()) });
    }),
    adminVouchers: run(async (_req, res) =>
      res.json({
        vouchers: (await CustomerVoucher.find().sort({ createdAt: -1 }).limit(200).lean()).map(
          present,
        ),
      }),
    ),
    createVoucher: run(async (req, res) => {
      const data = parse(voucherInputSchema, req.body);
      if (data.code.startsWith('REVIEW_'))
        throw new CustomerError(400, 'Tiền tố REVIEW_ dành cho voucher thưởng.');
      const voucher = await CustomerVoucher.create(data);
      res.status(201).json({ voucher: present(voucher.toObject()) });
    }),
  };
}
