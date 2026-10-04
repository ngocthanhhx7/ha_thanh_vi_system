export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'shipping',
  'delivered',
  'cancelled',
  'return_requested',
  'returned',
] as const;
export const PAYMENT_STATUSES = ['unpaid', 'paid', 'failed', 'refund_pending', 'refunded'] as const;
export const PAYMENT_METHODS = ['cod', 'payos'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered', 'return_requested'],
  delivered: ['return_requested'],
  cancelled: [],
  return_requested: ['returned'],
  returned: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  const allowed: Record<PaymentStatus, readonly PaymentStatus[]> = {
    unpaid: ['paid', 'failed'],
    paid: ['refund_pending'],
    failed: ['paid'],
    refund_pending: ['refunded'],
    refunded: [],
  };
  return from === to || allowed[from]?.includes(to) === true;
}
