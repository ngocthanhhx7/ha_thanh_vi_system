import type { Content } from '../constants/catalog';
import type { CommerceConfig, Order, OrderInput } from '../constants/commerce';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.message || 'Chưa thể kết nối hệ thống. Vui lòng thử lại.');
  if (data === null) throw new Error('Phản hồi hệ thống chưa hợp lệ. Vui lòng thử lại.');
  return data as T;
}
export const api = {
  content: () => request<Content>('/content'),
  config: () => request<CommerceConfig>('/commerce/config'),
  createOrder: (body: OrderInput, key: string) =>
    request<{ order: Order; accessToken: string; paymentUrl: string | null }>('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify(body),
    }),
  order: (id: string, token = '') =>
    request<Order>('/orders/' + encodeURIComponent(id), {
      headers: token ? { 'X-Order-Token': token } : {},
    }),
  cancel: (id: string, token = '') =>
    request<unknown>('/orders/' + encodeURIComponent(id) + '/cancel', {
      method: 'POST',
      headers: token ? { 'X-Order-Token': token } : {},
    }),
  payment: (id: string, token = '') =>
    request<{ paymentUrl: string }>('/orders/' + encodeURIComponent(id) + '/payment', {
      method: 'POST',
      headers: token ? { 'X-Order-Token': token } : {},
    }),
};
