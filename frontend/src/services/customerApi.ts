import type { CartItem, Order } from '../constants/commerce';

export type CustomerUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'staff' | 'admin';
};
export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  isDefault: boolean;
};
export type VoucherWalletItem = {
  id: string;
  code: string;
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  minOrder: number;
  maxDiscount?: number;
  startsAt: string;
  expiresAt: string;
  status: 'available' | 'used' | 'expired';
};
export type SupportTicket = {
  id: string;
  orderId: string;
  kind: 'support' | 'return';
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
  replies?: { message?: string; reply?: string; createdAt: string }[];
};
export type ProductReview = {
  id: string;
  rating: number;
  comment: string;
  authorName: string;
  createdAt: string;
};

export class CustomerApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function customerRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new CustomerApiError(
      data?.message || 'Chưa thể kết nối hệ thống. Vui lòng thử lại.',
      response.status,
    );
  if (data === null) throw new CustomerApiError('Phản hồi hệ thống chưa hợp lệ.', response.status);
  return data as T;
}

export const customerApi = {
  me: () => customerRequest<{ user: CustomerUser }>('/auth/me'),
  login: (body: { email: string; password: string }) =>
    customerRequest<{ user: CustomerUser }>('/auth/login', 'POST', body),
  register: (body: { name: string; email: string; password: string; phone: string }) =>
    customerRequest<{ user: CustomerUser }>('/auth/register', 'POST', body),
  logout: () => customerRequest<void>('/auth/logout', 'POST'),
  profile: (body: { name: string; phone: string }) =>
    customerRequest<{ user: CustomerUser }>('/account/profile', 'PATCH', body),
  addresses: () => customerRequest<{ addresses: Address[] }>('/account/addresses'),
  saveAddress: (body: Omit<Address, 'id'>, id?: string) =>
    customerRequest<{ address: Address }>(
      '/account/addresses' + (id ? '/' + encodeURIComponent(id) : ''),
      id ? 'PATCH' : 'POST',
      body,
    ),
  deleteAddress: (id: string) =>
    customerRequest<void>('/account/addresses/' + encodeURIComponent(id), 'DELETE'),
  orders: () => customerRequest<{ orders: Order[] }>('/account/orders'),
  vouchers: () => customerRequest<{ vouchers: VoucherWalletItem[] }>('/account/vouchers'),
  claimVoucher: (code: string) =>
    customerRequest<unknown>('/account/vouchers/claim', 'POST', { code }),
  quoteVoucher: (code: string, items: CartItem[]) =>
    customerRequest<{ discount: number; subtotal: number; code: string }>(
      '/account/vouchers/quote',
      'POST',
      { code, items },
    ),
  productReviews: (id: string) =>
    customerRequest<{ reviews: ProductReview[] }>(
      '/products/' + encodeURIComponent(id) + '/reviews',
    ),
  review: (body: { orderId: string; productId: string; rating: number; comment: string }) =>
    customerRequest<unknown>('/account/reviews', 'POST', body),
  tickets: () => customerRequest<{ tickets: SupportTicket[] }>('/account/tickets'),
  createTicket: (body: { orderId: string; kind: 'support' | 'return'; message: string }) =>
    customerRequest<unknown>('/account/tickets', 'POST', body),
};
