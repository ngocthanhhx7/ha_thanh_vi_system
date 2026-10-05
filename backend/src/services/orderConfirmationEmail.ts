import type { OrderRecord } from '../models/order.js';
import type { AuthMail } from './authMail.js';

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

export function orderConfirmationEmail(
  order: Pick<
    OrderRecord,
    | 'code'
    | 'createdAt'
    | 'customer'
    | 'items'
    | 'subtotal'
    | 'shippingFee'
    | 'total'
    | 'paymentMethod'
  >,
  trackingUrl?: string,
): AuthMail {
  const customerName = escapeHtml(order.customer.name);
  const orderCode = escapeHtml(order.code);
  const paymentLabel =
    order.paymentMethod === 'payos'
      ? 'Thanh toán trực tuyến VietQR'
      : 'Thanh toán khi nhận hàng (COD)';
  const itemText = order.items
    .map((item) => `${item.name} × ${item.quantity} — ${money(item.unitPrice * item.quantity)}`)
    .join('\n');
  const itemHtml = order.items
    .map(
      (item) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eee4d5">${escapeHtml(item.name)} × ${item.quantity}</td><td style="padding:10px 0;border-bottom:1px solid #eee4d5;text-align:right">${money(item.unitPrice * item.quantity)}</td></tr>`,
    )
    .join('');
  const orderDate = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(order.createdAt);
  const trackingSectionText = trackingUrl
    ? `Theo dõi trạng thái đơn hàng tại: ${trackingUrl}`
    : 'Hãy giữ mã đơn và khóa tra cứu riêng được hiển thị sau khi đặt hàng.';
  const trackingSectionHtml = trackingUrl
    ? `<p style="margin:22px 0"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#743b35;color:#fff;text-decoration:none">Theo dõi đơn hàng</a></p>`
    : '<p>Hãy giữ mã đơn và khóa tra cứu riêng được hiển thị sau khi đặt hàng.</p>';
  const text = [
    `Chào ${order.customer.name},`,
    `Hà Thành Vị đã tiếp nhận đơn hàng ${order.code}.`,
    `Thời gian: ${orderDate}`,
    `Hình thức thanh toán: ${paymentLabel}`,
    '',
    itemText,
    '',
    `Tạm tính: ${money(order.subtotal)}`,
    `Phí giao hàng: ${money(order.shippingFee)}`,
    `Tổng thanh toán: ${money(order.total)}`,
    '',
    trackingSectionText,
    'Nếu cần hỗ trợ, vui lòng liên hệ đội ngũ chăm sóc khách hàng.',
    'Cảm ơn bạn đã chọn một thức quà Hà Nội từ Hà Thành Vị!',
  ].join('\n');
  const html = `<div style="margin:0;background:#f8f4ed;padding:28px 12px;color:#3b3028;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;background:#fffefa;border:1px solid #e8ddca;border-radius:16px;padding:28px"><p style="color:#98754b;font-size:11px;font-weight:bold;letter-spacing:2px">HÀ THÀNH VỊ</p><h1 style="color:#743b35;font-family:Georgia,serif;font-size:28px;font-weight:500">Đơn hàng đã được tiếp nhận</h1><p>Chào ${customerName}, cảm ơn bạn đã chọn một thức quà Hà Nội.</p><div style="padding:14px;border-radius:10px;background:#f7f0e5"><strong>Mã đơn: ${orderCode}</strong><br><span style="font-size:13px;color:#776b5c">${escapeHtml(orderDate)} · ${escapeHtml(paymentLabel)}</span></div><table style="width:100%;border-collapse:collapse;margin-top:16px"><tbody>${itemHtml}</tbody><tfoot><tr><td style="padding-top:14px">Tạm tính</td><td style="padding-top:14px;text-align:right">${money(order.subtotal)}</td></tr><tr><td style="padding-top:8px">Phí giao hàng</td><td style="padding-top:8px;text-align:right">${money(order.shippingFee)}</td></tr><tr><td style="padding-top:14px;font-size:18px;font-weight:bold">Tổng thanh toán</td><td style="padding-top:14px;text-align:right;font-size:18px;font-weight:bold">${money(order.total)}</td></tr></tfoot></table><p style="margin-top:22px;line-height:1.6">Bạn có thể tra cứu trạng thái đơn hàng trên website bằng mã đơn này. Nếu cần hỗ trợ, đội ngũ Hà Thành Vị luôn sẵn sàng giúp bạn.</p><p style="color:#786c5e;font-size:12px">Email tự động xác nhận đơn hàng; vui lòng không gửi thông tin mật khẩu hoặc mã xác thực qua email.</p></div></div>`;
  const emailHtml = trackingUrl ? html.replace('</table>', `</table>${trackingSectionHtml}`) : html;
  return {
    to: order.customer.email,
    subject: `Hà Thành Vị đã tiếp nhận đơn ${order.code}`,
    text,
    html: emailHtml,
  };
}
