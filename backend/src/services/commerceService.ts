import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { SiteContent } from '../validators/content.js';
import type { CommerceConfig } from '../config/commerce.js';
import type { CheckoutInput } from '../validators/commerce.js';
import {
  canTransitionOrder,
  canTransitionPayment,
  type OrderStatus,
  type PaymentStatus,
} from '../constants/order.js';
import type { NewOrder, OrderRecord } from '../models/order.js';
import type { OrderRepository } from './orderRepository.js';
import type { PayOsClient } from './payOsService.js';
import { ServiceError } from './errors.js';
import type { CustomerRepository } from './customerRepository.js';
import type { ShippingEvent } from '../models/order.js';
const EXPIRED_PAYMENT_REVIEW =
  'Liên kết thanh toán quá hạn; yêu cầu đối soát trước mọi cập nhật trạng thái.';

export interface CommerceContentRepository {
  getContent(): Promise<SiteContent | null>;
}

export type CommerceOrderView = ReturnType<typeof import('../utils/orderViews.js').publicOrder>;
export type CheckoutResult = {
  order: CommerceOrderView;
  accessToken: string;
  paymentUrl: string | null;
  replay: boolean;
};

export class CommerceService {
  private vouchers?: CustomerRepository;
  setVoucherRepository(repository: CustomerRepository) {
    this.vouchers = repository;
  }
  constructor(
    private readonly orders: OrderRepository,
    private readonly content: CommerceContentRepository,
    private readonly settings: CommerceConfig & { orderTokenSecret?: string },
    private readonly payOs: PayOsClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get config() {
    return {
      enabled: this.orders.available,
      payments: { cod: true, payos: this.settings.paymentsEnabled },
      shippingFee: this.settings.shippingFee,
      freeShippingThreshold: this.settings.freeShippingThreshold,
      pricingNotice: 'Giá và phí giao hàng được xác nhận tại thời điểm đặt hàng.',
    };
  }

  async createCheckout(
    input: CheckoutInput,
    idempotencyKey: string,
    userId?: string,
  ): Promise<CheckoutResult> {
    if (!this.orders.available)
      throw new ServiceError(503, 'Hệ thống đặt hàng hiện chưa khả dụng. Vui lòng thử lại sau.');
    const payloadHash = createHash('sha256').update(stableJson(input)).digest('hex');
    const derivedToken = this.deriveAccessToken(idempotencyKey);
    let existing = await this.orders.findByIdempotencyKey(idempotencyKey);
    let replay = Boolean(existing);
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new ServiceError(409, 'Idempotency-Key đã được dùng cho nội dung đơn hàng khác.');
      if (!this.validToken(derivedToken, existing.accessTokenHash))
        throw new ServiceError(409, 'Không thể khôi phục quyền truy cập cho lần đặt hàng này.');
      if (existing.userId !== userId)
        throw new ServiceError(409, 'Idempotency-Key không thuộc tài khoản hiện tại.');
    } else {
      if (input.paymentMethod === 'payos' && !this.settings.paymentsEnabled)
        throw new ServiceError(503, 'Thanh toán PayOS chưa được bật. Vui lòng chọn COD.');
      const site = await this.content.getContent();
      if (!site) throw new ServiceError(503, 'Danh mục sản phẩm hiện chưa khả dụng.');
      const productsById = new Map(site.products.map((product) => [product.id, product]));
      const items = input.items.map(({ productId, quantity }) => {
        const product = productsById.get(productId);
        if (!product) throw new ServiceError(400, 'Danh sách có sản phẩm không hợp lệ.');
        if (product.price === null || !Number.isSafeInteger(product.price)) {
          throw new ServiceError(409, 'Một sản phẩm chưa có giá hợp lệ và không thể đặt hàng.');
        }
        return { productId, name: product.name, quantity, unitPrice: product.price };
      });
      const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
      if (!Number.isSafeInteger(subtotal))
        throw new ServiceError(400, 'Tổng giá trị đơn hàng vượt giới hạn.');
      const shippingFee =
        subtotal >= this.settings.freeShippingThreshold ? 0 : this.settings.shippingFee;
      if (!Number.isSafeInteger(subtotal + shippingFee))
        throw new ServiceError(400, 'Tổng giá trị đơn hàng vượt giới hạn.');
      let orderCode = await this.orders.reserveOrderCode();
      const reservationId = `${idempotencyKey}:${payloadHash}`;
      let discount = 0;
      if (input.voucherCode) {
        if (!userId) throw new ServiceError(401, 'Vui lòng đăng nhập để sử dụng voucher.');
        if (!this.vouchers) throw new ServiceError(503, 'Voucher hiện chưa khả dụng.');
        discount = (await this.vouchers.reserve(input.voucherCode, userId, subtotal, reservationId))
          .discount;
      }
      const accessToken = derivedToken;
      const newOrder: NewOrder = {
        code: `HTV-${orderCode}`,
        items,
        subtotal,
        shippingFee,
        total: subtotal + shippingFee - discount,
        discount,
        ...(input.voucherCode
          ? { voucherCode: input.voucherCode, voucherReservationId: reservationId }
          : {}),
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentMethod: input.paymentMethod,
        customer: input.customer,
        note: input.note,
        accessTokenHash: this.hashToken(accessToken),
        idempotencyKey,
        payloadHash,
        orderCode,
        ...(userId ? { userId } : {}),
      };
      try {
        existing = await this.orders.create(newOrder);
      } catch (error) {
        let createError = error;
        if (isDuplicateKey(createError) && duplicateKeyField(createError) === 'orderCode') {
          orderCode = await this.orders.reserveOrderCode();
          newOrder.orderCode = orderCode;
          newOrder.code = `HTV-${orderCode}`;
          try {
            existing = await this.orders.create(newOrder);
          } catch (retryError) {
            createError = retryError;
          }
        }
        existing = await this.orders.findByIdempotencyKey(idempotencyKey);
        if (!existing) {
          if (input.voucherCode) await this.vouchers?.release(reservationId);
          if (!isDuplicateKey(createError)) throw createError;
          throw new ServiceError(
            503,
            'Không thể xác nhận kết quả đặt hàng. Vui lòng thử lại cùng Idempotency-Key.',
          );
        }
        if (existing.payloadHash !== payloadHash) {
          if (input.voucherCode) await this.vouchers?.release(reservationId);
          throw new ServiceError(409, 'Idempotency-Key đã được dùng cho nội dung đơn hàng khác.');
        }
        if (!this.validToken(derivedToken, existing.accessTokenHash))
          throw new ServiceError(409, 'Không thể khôi phục quyền truy cập cho lần đặt hàng này.');
        replay = true;
      }
    }

    if (!existing) throw new ServiceError(503, 'Không thể xác nhận kết quả đặt hàng.');
    if (existing.userId !== userId)
      throw new ServiceError(409, 'Idempotency-Key không thuộc tài khoản hiện tại.');
    const accessToken = existing.userId ? '' : derivedToken;
    let paymentUrl: string | null = existing.paymentUrl ?? null;
    if (
      existing.paymentMethod === 'payos' &&
      existing.paymentStatus === 'unpaid' &&
      !['cancelled', 'delivered', 'returned', 'return_requested'].includes(existing.status) &&
      !paymentUrl &&
      this.settings.paymentsEnabled
    ) {
      paymentUrl = await this.createPaymentBestEffort(existing);
      existing = (await this.orders.findById(existing.id)) ?? existing;
    }
    const { publicOrder } = await import('../utils/orderViews.js');
    return { order: publicOrder(existing), accessToken, paymentUrl, replay };
  }

  async getOrder(id: string, accessToken: string, userId?: string): Promise<CommerceOrderView> {
    if (!this.orders.available)
      throw new ServiceError(503, 'Dịch vụ tra cứu đơn hàng hiện chưa khả dụng.');
    const order = await this.orders.findById(id);
    if (!order || !this.canAccess(order, accessToken, userId))
      throw new ServiceError(404, 'Không tìm thấy đơn hàng.');
    const { publicOrder } = await import('../utils/orderViews.js');
    return publicOrder(order);
  }

  async cancelOrder(id: string, accessToken: string, userId?: string): Promise<CommerceOrderView> {
    if (!this.orders.available) throw new ServiceError(503, 'Dịch vụ đơn hàng hiện chưa khả dụng.');
    const order = await this.orders.findById(id);
    if (!order || !this.canAccess(order, accessToken, userId))
      throw new ServiceError(404, 'Không tìm thấy đơn hàng.');
    if (
      order.status === 'cancelled' &&
      order.paymentMethod === 'cod' &&
      order.paymentStatus === 'unpaid'
    ) {
      if (order.voucherReservationId) await this.vouchers?.release(order.voucherReservationId);
      const { publicOrder } = await import('../utils/orderViews.js');
      return publicOrder(order);
    }
    if (
      order.paymentMethod !== 'cod' ||
      order.status !== 'pending' ||
      order.paymentStatus !== 'unpaid'
    ) {
      throw new ServiceError(409, 'Đơn hàng này không thể tự hủy trực tuyến.');
    }
    const updated = await this.orders.updateById(
      id,
      { status: 'pending', paymentStatus: 'unpaid', paymentUrl: order.paymentUrl },
      { status: 'cancelled' },
    );
    if (!updated) throw new ServiceError(409, 'Đơn hàng đã thay đổi; vui lòng tải lại trạng thái.');
    if (order.voucherReservationId) await this.vouchers?.release(order.voucherReservationId);
    const { publicOrder } = await import('../utils/orderViews.js');
    return publicOrder(updated);
  }

  async createOrGetPayment(id: string, accessToken: string, userId?: string): Promise<string> {
    if (!this.orders.available)
      throw new ServiceError(503, 'Dịch vụ thanh toán hiện chưa khả dụng.');
    const order = await this.orders.findById(id);
    if (!order || !this.canAccess(order, accessToken, userId))
      throw new ServiceError(404, 'Không tìm thấy đơn hàng.');
    if (
      order.paymentMethod !== 'payos' ||
      order.paymentStatus !== 'unpaid' ||
      ['cancelled', 'delivered', 'returned', 'return_requested'].includes(order.status)
    ) {
      throw new ServiceError(409, 'Đơn hàng này không thể thanh toán trực tuyến.');
    }
    if (order.paymentUrl) return order.paymentUrl;
    if (!this.settings.paymentsEnabled)
      throw new ServiceError(503, 'Thanh toán PayOS hiện chưa được bật.');
    const url = await this.createPaymentBestEffort(order);
    if (!url)
      throw new ServiceError(
        503,
        'Không thể tạo liên kết thanh toán; đơn hàng vẫn được lưu để thử lại.',
      );
    return url;
  }

  async handlePayOsWebhook(
    body: { data?: unknown; signature?: unknown },
    checksumKey: string,
  ): Promise<void> {
    const { isValidPayOsWebhook } = await import('../utils/paymentSignatures.js');
    if (!isValidPayOsWebhook(body, checksumKey))
      throw new ServiceError(400, 'Chữ ký thông báo thanh toán không hợp lệ.');
    const envelope = body as { code?: unknown; success?: unknown; data: Record<string, unknown> };
    const data = envelope.data;
    if (
      envelope.code !== '00' ||
      envelope.success !== true ||
      data.code !== '00' ||
      (data.currency !== undefined && data.currency !== 'VND') ||
      typeof data.orderCode !== 'number' ||
      !Number.isSafeInteger(data.orderCode) ||
      typeof data.amount !== 'number' ||
      !Number.isSafeInteger(data.amount)
    ) {
      throw new ServiceError(400, 'Thông tin thanh toán không hợp lệ.');
    }
    if (!this.orders.available)
      throw new ServiceError(503, 'Dịch vụ thanh toán hiện chưa khả dụng.');
    const order = await this.orders.findByOrderCode(data.orderCode);
    if (!order || order.paymentMethod !== 'payos' || order.total !== data.amount) {
      throw new ServiceError(400, 'Mã đơn hoặc số tiền thanh toán không khớp.');
    }
    if (data.paymentLinkId !== undefined && typeof data.paymentLinkId !== 'string') {
      throw new ServiceError(400, 'Liên kết thanh toán không hợp lệ.');
    }
    if (order.paymentLinkId && data.paymentLinkId && order.paymentLinkId !== data.paymentLinkId) {
      throw new ServiceError(400, 'Liên kết thanh toán không khớp đơn hàng.');
    }
    if (
      order.paymentStatus === 'paid' ||
      order.paymentStatus === 'refund_pending' ||
      order.paymentStatus === 'refunded'
    ) {
      if (order.voucherReservationId) await this.vouchers?.settle(order.voucherReservationId);
      return;
    }
    if (order.paymentStatus !== 'unpaid' && order.paymentStatus !== 'failed') return;
    if (order.status === 'cancelled') {
      await this.orders.updateById(
        order.id,
        { paymentStatus: order.paymentStatus },
        {
          paymentStatus: 'refund_pending',
          payOsException:
            'Thanh toán đã xác nhận sau khi đơn bị hủy; cần đối soát/hoàn tiền thủ công.',
        },
      );
      return;
    }
    const paid = await this.orders.updateById(
      order.id,
      { paymentStatus: order.paymentStatus, status: order.status },
      {
        paymentStatus: 'paid',
        ...(order.payOsException === EXPIRED_PAYMENT_REVIEW
          ? { payOsException: '', paymentReviewAt: null }
          : {}),
      },
    );
    if (paid?.voucherReservationId) await this.vouchers?.settle(paid.voucherReservationId);
  }

  async listOrders(page: number, limit: number) {
    if (!this.orders.available)
      throw new ServiceError(503, 'Dịch vụ quản trị đơn hàng hiện chưa khả dụng.');
    return this.orders.list(page, limit);
  }

  async updateAdminOrder(
    id: string,
    patch: {
      status?: OrderStatus;
      trackingNumber?: string;
      carrier?: string;
      shippingEvent?: { status: string; description: string; location?: string; occurredAt?: Date };
      paymentStatus?: PaymentStatus;
    },
  ): Promise<CommerceOrderView> {
    if (!this.orders.available)
      throw new ServiceError(503, 'Dịch vụ quản trị đơn hàng hiện chưa khả dụng.');
    const order = await this.orders.findById(id);
    if (!order) throw new ServiceError(404, 'Không tìm thấy đơn hàng.');
    const changes: Partial<OrderRecord> = {};
    if (
      order.paymentMethod === 'payos' &&
      patch.status &&
      ['confirmed', 'shipping', 'delivered'].includes(patch.status) &&
      (order.paymentStatus !== 'paid' || order.payOsException)
    )
      throw new ServiceError(
        409,
        'Chỉ xử lý giao hàng PayOS sau khi đã xác nhận thanh toán và đối soát xong.',
      );
    if (patch.status) {
      if (patch.status !== order.status && !canTransitionOrder(order.status, patch.status)) {
        throw new ServiceError(409, 'Trạng thái đơn hàng không thể chuyển theo luồng hiện tại.');
      }
      if (
        patch.status === 'cancelled' &&
        (order.paymentStatus === 'paid' ||
          order.paymentStatus === 'refund_pending' ||
          order.paymentStatus === 'refunded')
      ) {
        throw new ServiceError(409, 'Không thể hủy đơn đã thanh toán hoặc đang xử lý hoàn tiền.');
      }
      changes.status = patch.status;
    }
    if (patch.trackingNumber !== undefined) changes.trackingNumber = patch.trackingNumber;
    if (patch.carrier !== undefined) changes.carrier = patch.carrier;
    if (
      patch.status === 'shipping' &&
      !(patch.trackingNumber || order.trackingNumber) &&
      !(patch.carrier || order.carrier)
    ) {
      // Shop delivery may use a carrier name without a third-party tracking number.
      throw new ServiceError(409, 'Vui lòng nhập đơn vị giao hàng hoặc mã vận đơn trước khi giao.');
    }
    const event = patch.shippingEvent;
    if (
      event ||
      patch.trackingNumber ||
      patch.carrier ||
      (patch.status && patch.status !== order.status)
    ) {
      const occurredAt = event?.occurredAt ?? this.now();
      const description =
        event?.description ??
        (patch.status
          ? `Cửa hàng cập nhật trạng thái: ${patch.status}.`
          : 'Cửa hàng cập nhật thông tin vận chuyển.');
      const shippingEvent: ShippingEvent = {
        status: event?.status ?? patch.status ?? order.status,
        description,
        message: description,
        occurredAt,
        createdAt: this.now(),
        ...(event?.location ? { location: event.location } : {}),
      };
      changes.shippingEvents = [...(order.shippingEvents ?? []), shippingEvent].slice(-200);
    }
    if (patch.paymentStatus) this.validateAdminPaymentStatus(order, patch.paymentStatus, changes);
    const updated = await this.orders.updateById(
      id,
      {
        status: order.status,
        paymentStatus: order.paymentStatus,
        updatedAt: order.updatedAt,
        ...(order.paymentMethod === 'payos' ? { paymentUrl: order.paymentUrl } : {}),
      },
      changes,
    );
    if (!updated) throw new ServiceError(409, 'Đơn hàng đã được cập nhật; vui lòng tải lại.');
    if (order.voucherReservationId) {
      if (updated.status === 'cancelled' || updated.paymentStatus === 'failed')
        await this.vouchers?.release(order.voucherReservationId);
      else if (updated.status === 'delivered')
        await this.vouchers?.settle(order.voucherReservationId);
    }
    const { publicOrder } = await import('../utils/orderViews.js');
    return publicOrder(updated);
  }

  async listByUser(userId: string): Promise<OrderRecord[]> {
    if (!this.orders.available)
      throw new ServiceError(503, 'Dịch vụ danh sách đơn hàng hiện chưa khả dụng.');
    return this.orders.listByUser(userId);
  }

  async findByIdForCustomerModule(id: string): Promise<OrderRecord | null> {
    if (!this.orders.available) throw new ServiceError(503, 'Dịch vụ đơn hàng hiện chưa khả dụng.');
    return this.orders.findById(id);
  }

  async findByIdForUser(id: string, userId: string): Promise<OrderRecord | null> {
    if (!this.orders.available) throw new ServiceError(503, 'Dịch vụ đơn hàng hiện chưa khả dụng.');
    return this.orders.findByIdForUser(id, userId);
  }

  async requestReturn(id: string, userId: string): Promise<void> {
    if (!this.orders.available) throw new ServiceError(503, 'Dịch vụ đơn hàng hiện chưa khả dụng.');
    const order = await this.orders.findByIdForUser(id, userId);
    if (!order) throw new ServiceError(404, 'Không tìm thấy đơn hàng.');
    if (!canTransitionOrder(order.status, 'return_requested'))
      throw new ServiceError(409, 'Đơn hàng chưa đủ điều kiện yêu cầu trả hàng.');
    const updated = await this.orders.updateById(
      id,
      { userId, status: order.status },
      { status: 'return_requested' },
    );
    if (!updated) throw new ServiceError(409, 'Trạng thái đơn hàng đã thay đổi; vui lòng tải lại.');
  }

  async markExpiredPayOsForReview(olderThanMs: number, limit = 100): Promise<number> {
    if (!this.orders.available) return 0;
    const expired = await this.orders.findExpiredPayOsOrders(
      new Date(this.now().getTime() - olderThanMs),
      limit,
    );
    let marked = 0;
    for (const order of expired) {
      const update = await this.orders.updateById(
        order.id,
        { status: order.status, paymentStatus: 'unpaid' },
        { paymentReviewAt: this.now(), payOsException: EXPIRED_PAYMENT_REVIEW },
      );
      if (update) marked += 1;
    }
    return marked;
  }

  private validateAdminPaymentStatus(
    order: OrderRecord,
    next: PaymentStatus,
    changes: Partial<OrderRecord>,
  ) {
    if (next === order.paymentStatus) return;
    if (order.paymentMethod === 'payos' && !['refund_pending', 'refunded'].includes(next)) {
      throw new ServiceError(
        409,
        'Trạng thái thanh toán PayOS chỉ được cập nhật bằng webhook đã xác minh.',
      );
    }
    if (
      next === 'refund_pending' &&
      !['return_requested', 'returned', 'cancelled'].includes(changes.status ?? order.status)
    )
      throw new ServiceError(409, 'Chỉ xử lý hoàn tiền khi đang trả hàng hoặc đơn đã hủy.');
    if (
      next === 'refunded' &&
      order.status !== 'returned' &&
      changes.status !== 'returned' &&
      order.status !== 'cancelled'
    ) {
      throw new ServiceError(409, 'Chỉ đánh dấu hoàn tiền khi yêu cầu trả hàng đã hoàn tất.');
    }
    if (!canTransitionPayment(order.paymentStatus, next))
      throw new ServiceError(409, 'Trạng thái thanh toán không thể chuyển theo luồng hiện tại.');
    if (next === 'paid' && !(order.status === 'delivered' || changes.status === 'delivered')) {
      throw new ServiceError(409, 'Chỉ xác nhận COD đã thu khi đơn ở trạng thái đã giao.');
    }
    changes.paymentStatus = next;
  }

  private async createPaymentBestEffort(order: OrderRecord): Promise<string | null> {
    try {
      const result = await this.payOs.createPayment(order);
      if (!result.paymentUrl) return null;
      const updated = await this.orders.updateById(
        order.id,
        { paymentStatus: 'unpaid', status: order.status, paymentUrl: order.paymentUrl },
        {
          paymentUrl: result.paymentUrl,
          ...(result.paymentLinkId ? { paymentLinkId: result.paymentLinkId } : {}),
        },
      );
      return updated?.paymentUrl ?? null;
    } catch {
      return null;
    }
  }

  private deriveAccessToken(idempotencyKey: string): string {
    const secret = this.settings.orderTokenSecret;
    if (!secret || secret.length < 32)
      throw new ServiceError(503, 'Dịch vụ đặt hàng chưa được cấu hình an toàn.');
    return createHmac('sha256', secret).update(`guest-order:${idempotencyKey}`).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private validToken(candidate: string, storedHash: string): boolean {
    const actual = Buffer.from(this.hashToken(candidate), 'hex');
    const expected = Buffer.from(storedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  private canAccess(order: OrderRecord, token: string, userId?: string) {
    return order.userId
      ? order.userId === userId
      : Boolean(token) && this.validToken(token, order.accessTokenHash);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function duplicateKeyField(error: unknown): string | undefined {
  if (
    !isDuplicateKey(error) ||
    typeof error !== 'object' ||
    error === null ||
    !('keyPattern' in error)
  )
    return undefined;
  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
  return pattern ? Object.keys(pattern)[0] : undefined;
}
