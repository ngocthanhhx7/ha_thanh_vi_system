import type { RequestHandler } from 'express';
import type { CommerceService } from '../services/commerceService.js';
import { ServiceError } from '../services/errors.js';
import {
  adminOrderQuerySchema,
  adminOrderUpdateSchema,
  checkoutSchema,
  idempotencyKeySchema,
  orderIdSchema,
} from '../validators/commerce.js';
import { requestUserId } from '../middlewares/requestUser.js';
import { notificationService } from '../services/notificationService.js';
import type { AuthMailer } from '../services/authMail.js';
import { orderConfirmationEmail } from '../services/orderConfirmationEmail.js';

const fail = (error: unknown, next: Parameters<RequestHandler>[2]) => {
  if (error instanceof ServiceError) {
    const responseError = Object.assign(error, { status: error.status });
    next(responseError);
  } else next(error);
};

export function commerceControllers(
  service: CommerceService,
  checksumKey?: string,
  orderMailer?: AuthMailer,
  publicWebUrl = 'http://localhost:5173',
) {
  const checkout: RequestHandler = async (req, res, next) => {
    const parsed = checkoutSchema.safeParse(req.body);
    const key = idempotencyKeySchema.safeParse(req.get('idempotency-key'));
    if (!parsed.success || !key.success) {
      res.status(400).json({
        message: !key.success
          ? 'Idempotency-Key phải là UUID hợp lệ.'
          : 'Thông tin đặt hàng chưa hợp lệ.',
      });
      return;
    }
    try {
      const result = await service.createCheckout(parsed.data, key.data, requestUserId(req));
      if (!result.replay && orderMailer) {
        const trackingUrl = result.accessToken
          ? `${publicWebUrl}/don-hang/${encodeURIComponent(result.order.id)}#token=${encodeURIComponent(result.accessToken)}`
          : `${publicWebUrl}/tai-khoan?section=orders`;
        void orderMailer.send(orderConfirmationEmail(result.order, trackingUrl)).catch(() => {
          process.stderr.write(
            `Order confirmation email could not be sent for order ${result.order.id}.\n`,
          );
        });
      }
      await notificationService.safeRoles(['staff', 'admin'], {
        category: 'order',
        title: 'Đơn hàng mới cần xác nhận',
        message: `Đơn ${result.order.code} vừa được tạo.`,
        href: '/quan-tri?tab=orders',
        eventKey: `order:${result.order.id}:created`,
      });
      res.status(result.replay ? 200 : 201).json({
        order: result.order,
        accessToken: result.accessToken,
        paymentUrl: result.paymentUrl,
      });
    } catch (error) {
      fail(error, next);
    }
  };

  const getOrder: RequestHandler = async (req, res, next) => {
    const id = orderIdSchema.safeParse(req.params.id);
    const token = req.get('x-order-token');
    if (!id.success || (!token && !req.user)) {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
      return;
    }
    try {
      res.json(await service.getOrder(id.data, token ?? '', requestUserId(req)));
    } catch (error) {
      fail(error, next);
    }
  };

  const cancelOrder: RequestHandler = async (req, res, next) => {
    const id = orderIdSchema.safeParse(req.params.id);
    const token = req.get('x-order-token');
    if (!id.success || (!token && !req.user)) {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
      return;
    }
    try {
      res.json(await service.cancelOrder(id.data, token ?? '', requestUserId(req)));
    } catch (error) {
      fail(error, next);
    }
  };

  const createPayment: RequestHandler = async (req, res, next) => {
    const id = orderIdSchema.safeParse(req.params.id);
    const token = req.get('x-order-token');
    if (!id.success || (!token && !req.user)) {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
      return;
    }
    try {
      res.json({
        paymentUrl: await service.createOrGetPayment(id.data, token ?? '', requestUserId(req)),
      });
    } catch (error) {
      fail(error, next);
    }
  };

  const webhook: RequestHandler = async (req, res, next) => {
    if (!checksumKey) {
      res.status(503).json({ message: 'Webhook thanh toán chưa được cấu hình.' });
      return;
    }
    try {
      await service.handlePayOsWebhook(req.body, checksumKey);
      res.json({ success: true });
    } catch (error) {
      fail(error, next);
    }
  };

  const adminList: RequestHandler = async (req, res, next) => {
    const parsed = adminOrderQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: 'Bộ lọc đơn hàng không hợp lệ.' });
      return;
    }
    try {
      const result = await service.listOrders(parsed.data.page, parsed.data.limit, parsed.data);
      const { publicOrder } = await import('../utils/orderViews.js');
      res.json({
        orders: result.orders.map((order) => ({
          ...publicOrder(order),
          isOwnOrder: Boolean(
            req.user &&
            (order.userId === req.user.id ||
              order.customer.email.trim().toLocaleLowerCase('en-US') ===
                req.user.email.trim().toLocaleLowerCase('en-US')),
          ),
          ...(order.payOsException ? { payOsException: order.payOsException } : {}),
          ...(order.paymentReviewAt ? { paymentReviewAt: order.paymentReviewAt } : {}),
        })),
        total: result.total,
        page: parsed.data.page,
        limit: parsed.data.limit,
      });
    } catch (error) {
      fail(error, next);
    }
  };

  const adminUpdate: RequestHandler = async (req, res, next) => {
    const id = orderIdSchema.safeParse(req.params.id);
    const patch = adminOrderUpdateSchema.safeParse(req.body);
    if (!id.success || !patch.success) {
      res.status(400).json({ message: 'Thông tin cập nhật đơn hàng không hợp lệ.' });
      return;
    }
    if (
      req.user?.role === 'staff' &&
      (patch.data.paymentStatus === 'refunded' || patch.data.paymentStatus === 'refund_pending')
    ) {
      res.status(403).json({ message: 'Hoàn tiền cần quản trị viên xác nhận.' });
      return;
    }
    try {
      const previous = await service.findByIdForCustomerModule(id.data);
      const result = await service.updateAdminOrder(id.data, patch.data, {
        id: req.user!.id,
        email: req.user!.email,
      });
      if (
        previous?.userId &&
        ((patch.data.status && patch.data.status !== previous.status) ||
          (patch.data.paymentStatus && patch.data.paymentStatus !== previous.paymentStatus))
      ) {
        await notificationService.safeUser(previous.userId, {
          category: 'order',
          title: 'Đơn hàng của bạn đã được cập nhật',
          message: `Trạng thái đơn ${result.code} đã thay đổi: ${result.status}.`,
          href: `/don-hang/${encodeURIComponent(result.id)}`,
          eventKey: `order:${result.id}:state:${result.status}:${result.paymentStatus}`,
        });
      }
      res.json(result);
    } catch (error) {
      fail(error, next);
    }
  };

  return { checkout, getOrder, cancelOrder, createPayment, webhook, adminList, adminUpdate };
}
