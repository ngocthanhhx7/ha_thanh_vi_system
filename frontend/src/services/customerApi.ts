import type { CartItem, Order } from '../constants/commerce';
import { fetchWithErrorRouting, routeApiError } from './httpErrors';

export type CustomerUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'staff' | 'admin';
  accountStatus: 'active' | 'suspended';
  accountStatusReason: string;
  accountStatusChangedAt: string | null;
};
export type AccountAppeal = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
};
export type AccountAuditEntry = {
  id: string;
  actorName: string;
  actorEmail: string;
  actorIp?: string;
  actorUserAgent?: string;
  action: string;
  changes: { field: string; before?: unknown; after?: unknown }[];
  reason: string;
  details: unknown;
  createdAt: string;
};
export type AdminUserSort = 'createdAt' | 'name' | 'email' | 'role' | 'accountStatus';
export type AdminUserPage = {
  users: CustomerUser[];
  total: number;
  page: number;
  limit: number;
};
export type NotificationItem = {
  id: string;
  category: 'order' | 'support' | 'account' | 'system';
  title: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};
export type SystemLogQuery = {
  page: number;
  limit?: number;
  q?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  outcome?: 'success' | 'failure';
  actorRole?: 'customer' | 'staff' | 'admin' | 'guest';
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  targetType?: 'order' | 'user' | 'product' | 'ticket' | 'appeal';
  statusCode?: string;
  from?: string;
  to?: string;
};
export type SystemLogAnomaly = {
  type: 'repeated_auth_failures' | 'repeated_forbidden_access';
  count: number;
  threshold: number;
  windowMinutes: number;
  actorIp: string;
  actorName?: string;
  actorRole?: string;
  latestAt: string;
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
    public retryAfter?: number,
    public verificationRequired = false,
    public email?: string,
  ) {
    super(message);
  }
}

async function customerRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  options: { silentUnauthorized?: boolean } = {},
): Promise<T> {
  const response = await fetchWithErrorRouting(
    '/api' + path,
    {
      method,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    path,
  );
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok && !(options.silentUnauthorized && response.status === 401))
    routeApiError(path, response.status, data, method);
  if (!response.ok)
    throw new CustomerApiError(
      data?.message || 'Chưa thể kết nối hệ thống. Vui lòng thử lại.',
      response.status,
      Number(response.headers.get('Retry-After') || data?.retryAfter || 0) || undefined,
      data?.verificationRequired === true,
      typeof data?.email === 'string' ? data.email : undefined,
    );
  if (data === null) routeApiError(path, 502, undefined, method);
  if (data === null) throw new CustomerApiError('Phản hồi hệ thống chưa hợp lệ.', response.status);
  return data as T;
}

export const customerApi = {
  me: () => customerRequest<{ user: CustomerUser }>('/auth/me'),
  login: (body: { email: string; password: string; rememberDevice?: boolean }) =>
    customerRequest<{
      user?: CustomerUser;
      otpRequired?: boolean;
      challengeId?: string;
      email?: string;
      verificationRequired?: boolean;
      appealRequired?: boolean;
      message?: string;
    }>('/auth/login', 'POST', body),
  register: (body: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    phone: string;
  }) =>
    customerRequest<{ verificationRequired: boolean; email?: string; message: string }>(
      '/auth/register',
      'POST',
      body,
    ),
  verifyEmail: (body: { email: string; code: string; rememberDevice: boolean }) =>
    customerRequest<
      { user: CustomerUser } | { appealRequired: true; appealToken: string; message: string }
    >('/auth/verify-email', 'POST', body),
  verifyLogin: (body: { challengeId: string; code: string }) =>
    customerRequest<
      { user: CustomerUser } | { appealRequired: true; appealToken: string; message: string }
    >('/auth/verify-login', 'POST', body),
  submitAppeal: (appealToken: string, message: string) =>
    customerRequest<{
      appeal: { id: string; status: 'pending'; submittedAt: string };
      message: string;
    }>('/auth/appeals', 'POST', { appealToken, message }),
  updateAdminUser: (
    id: string,
    body: {
      name?: string;
      phone?: string;
      role?: CustomerUser['role'];
      accountStatus?: CustomerUser['accountStatus'];
      reason?: string;
    },
  ) =>
    customerRequest<{ user: CustomerUser }>(
      '/admin/users/' + encodeURIComponent(id),
      'PATCH',
      body,
    ),
  adminUsers: (query: {
    page: number;
    limit?: number;
    q?: string;
    role?: CustomerUser['role'] | 'all';
    accountStatus?: CustomerUser['accountStatus'] | 'all';
    sort?: AdminUserSort;
    direction?: 'asc' | 'desc';
  }) => {
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.limit) params.set('limit', String(query.limit));
    if (query.q) params.set('q', query.q);
    if (query.role && query.role !== 'all') params.set('role', query.role);
    if (query.accountStatus && query.accountStatus !== 'all')
      params.set('accountStatus', query.accountStatus);
    if (query.sort) params.set('sort', query.sort);
    if (query.direction) params.set('direction', query.direction);
    return customerRequest<AdminUserPage>('/admin/users?' + params);
  },
  notifications: (page = 1, limit = 30, silentUnauthorized = false) =>
    customerRequest<{
      notifications: NotificationItem[];
      unread: number;
      page: number;
      limit: number;
    }>(`/notifications?page=${page}&limit=${limit}`, 'GET', undefined, { silentUnauthorized }),
  readNotification: (id: string) =>
    customerRequest<{ success: true }>(
      '/notifications/' + encodeURIComponent(id) + '/read',
      'PATCH',
      {},
    ),
  readAllNotifications: () =>
    customerRequest<{ updated: number }>('/notifications/read-all', 'PATCH', {}),
  systemLogs: (query: SystemLogQuery) => {
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.limit) params.set('limit', String(query.limit));
    if (query.q) params.set('q', query.q);
    if (query.severity) params.set('severity', query.severity);
    if (query.outcome) params.set('outcome', query.outcome);
    if (query.actorRole) params.set('actorRole', query.actorRole);
    if (query.method) params.set('method', query.method);
    if (query.targetType) params.set('targetType', query.targetType);
    if (query.statusCode) params.set('statusCode', query.statusCode);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    return customerRequest<{
      logs: {
        id: string;
        actorName?: string;
        actorRole?: string;
        actorIp?: string;
        actorUserAgent?: string;
        requestId: string;
        outcome: 'success' | 'failure';
        reasonCode?: string;
        targetType?: string;
        event: string;
        severity: string;
        method: string;
        path: string;
        statusCode: number;
        targetId?: string;
        createdAt: string;
      }[];
      total: number;
      page: number;
      limit: number;
      anomalies: SystemLogAnomaly[];
    }>('/admin/system-logs?' + params);
  },
  accountAppeals: () => customerRequest<{ appeals: AccountAppeal[] }>('/admin/appeals'),
  reviewAccountAppeal: (id: string, decision: 'approve' | 'reject', note: string) =>
    customerRequest<{
      appeal: { id: string; status: 'approved' | 'rejected'; reviewNote: string };
    }>('/admin/appeals/' + encodeURIComponent(id), 'PATCH', { decision, note }),
  accountAudit: (id: string) =>
    customerRequest<{ audit: AccountAuditEntry[] }>(
      '/admin/users/' + encodeURIComponent(id) + '/audit',
    ),
  resendVerification: (email: string) =>
    customerRequest<{ message: string }>('/auth/resend-verification', 'POST', { email }),
  resendLoginOtp: (challengeId: string) =>
    customerRequest<{ message: string }>('/auth/resend-login-otp', 'POST', { challengeId }),
  forgotPassword: (email: string) =>
    customerRequest<{ message: string }>('/auth/forgot-password', 'POST', { email }),
  resetPassword: (body: { token: string; password: string; confirmPassword: string }) =>
    customerRequest<{ message: string }>('/auth/reset-password', 'POST', body),
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
