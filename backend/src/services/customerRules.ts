import { CustomerError } from '../utils/customerSecurity.js';
export type CustomerOrder = {
  id: string;
  userId?: string;
  status: string;
  items: { productId: string }[];
  [key: string]: unknown;
};
export interface CustomerOrderGateway {
  listByUser(userId: string): Promise<CustomerOrder[]>;
  findById(id: string): Promise<CustomerOrder | null>;
  requestReturn?(id: string, userId: string): Promise<void>;
}
export function assertReviewAllowed(
  order: CustomerOrder | null,
  userId: string,
  productId: string,
) {
  if (!order || order.userId !== userId) throw new CustomerError(404, 'Không tìm thấy đơn hàng.');
  if (order.status !== 'delivered' || !order.items.some((item) => item.productId === productId))
    throw new CustomerError(409, 'Chỉ đánh giá sản phẩm trong đơn đã giao.');
}
export function discountFor(
  v: { type: string; value: number; maxDiscount: number; minOrder: number },
  subtotal: number,
) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal < v.minOrder)
    throw new CustomerError(409, 'Đơn hàng chưa đạt giá trị tối thiểu của voucher.');
  const raw = v.type === 'percent' ? Math.floor((subtotal * v.value) / 100) : v.value;
  return Math.min(subtotal, v.maxDiscount > 0 ? Math.min(raw, v.maxDiscount) : raw);
}
