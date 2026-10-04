// Order credentials never enter a URL or persistent localStorage.
const memory = new Map<string, string>();
export function rememberOrder(id: string, token: string) {
  memory.set(id, token);
  try {
    sessionStorage.setItem('htv-order-' + id, token);
    sessionStorage.setItem('htv-last-order', id);
  } catch {
    /* The current page can still display the retrieval key. */
  }
}
export function orderToken(id: string) {
  try {
    return memory.get(id) || sessionStorage.getItem('htv-order-' + id) || '';
  } catch {
    return memory.get(id) || '';
  }
}
export function lastOrderId() {
  try {
    return sessionStorage.getItem('htv-last-order') || '';
  } catch {
    return '';
  }
}
export function paymentDestination(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['pay.payos.vn', 'payos.vn'].includes(parsed.hostname))
    throw new Error('Liên kết thanh toán chưa hợp lệ. Vui lòng liên hệ cửa hàng.');
  return parsed.href;
}
