import type { OrderRecord } from '../models/order.js';

export function publicOrder(order: OrderRecord) {
  return {
    id: order.id,
    code: order.code,
    items: order.items,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    discount: order.discount ?? 0,
    ...(order.voucherCode ? { voucherCode: order.voucherCode } : {}),
    ...(order.carrier ? { carrier: order.carrier } : {}),
    shippingEvents: order.shippingEvents ?? [],
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    customer: order.customer,
    note: order.note,
    ...(order.trackingNumber ? { trackingNumber: order.trackingNumber } : {}),
    ...(order.paymentMethod === 'payos' && order.paymentStatus === 'unpaid' && order.paymentUrl
      ? { paymentUrl: order.paymentUrl }
      : {}),
  };
}
