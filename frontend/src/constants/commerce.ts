export type CartItem = { productId: string; quantity: number };
export type CommerceConfig = {
  enabled: boolean;
  payments: { cod: boolean; payos: boolean };
  shippingFee: number;
  freeShippingThreshold: number;
  pricingNotice: string;
};
export type Customer = { name: string; phone: string; email: string; address: string };
export type Order = {
  id: string;
  code: string;
  items: { productId: string; name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  shippingFee: number;
  discount?: number;
  voucherCode?: string;
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: 'cod' | 'payos';
  createdAt: string;
  customer: Customer;
  note: string;
  trackingNumber?: string;
  payOsException?: string;
  paymentReviewAt?: string;
  carrier?: string;
  shippingEvents?: { status: string; description: string; location?: string; occurredAt: string }[];
};
export type OrderInput = {
  items: CartItem[];
  customer: Customer;
  paymentMethod: 'cod' | 'payos';
  note: string;
  consent: boolean;
  voucherCode?: string;
};
export const orderStatuses: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Chờ lấy hàng',
  shipping: 'Chờ giao hàng',
  delivered: 'Đã giao',
  return_requested: 'Yêu cầu trả hàng',
  returned: 'Đã trả hàng',
  cancelled: 'Đã hủy',
};
export const paymentStatuses: Record<string, string> = {
  unpaid: 'Chưa thanh toán',
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thanh toán chưa thành công',
  refund_pending: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
  payment_exception: 'Cần đối soát thanh toán',
  exception: 'Cần đối soát thanh toán',
};
export const pricingNotice =
  'Giá tạm cho bản giới thiệu, có thể điều chỉnh trước khi mở bán chính thức.';
