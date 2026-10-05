import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createPayOsSignature, isAllowedPayOsUrl } from '../utils/paymentSignatures.js';
import { ServiceError } from './errors.js';
import type { OrderRecord } from '../models/order.js';

export type PayOsSettings = {
  enabled: boolean;
  clientId?: string;
  apiKey?: string;
  checksumKey?: string;
  publicWebUrl: string;
};

export type PayOsClient = {
  createPayment(order: OrderRecord): Promise<{ paymentUrl: string; paymentLinkId?: string }>;
};

export async function confirmPayOsWebhook(
  settings: Pick<PayOsSettings, 'clientId' | 'apiKey'>,
  webhookUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!settings.clientId || !settings.apiKey) {
    throw new ServiceError(503, 'Thiếu Client ID hoặc API Key để đăng ký webhook PayOS.');
  }
  let target: URL;
  try {
    target = new URL(webhookUrl);
  } catch {
    throw new ServiceError(400, 'PAYOS_WEBHOOK_URL không hợp lệ.');
  }
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.hostname === 'localhost' ||
    target.hostname.endsWith('.localhost') ||
    target.hostname.endsWith('.local') ||
    isIP(target.hostname.replace(/^\[|\]$/g, '')) !== 0
  ) {
    throw new ServiceError(400, 'Webhook PayOS cần URL HTTPS công khai, không dùng localhost.');
  }
  let response: Response;
  try {
    response = await fetcher('https://api-merchant.payos.vn/confirm-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': settings.clientId,
        'x-api-key': settings.apiKey,
      },
      body: JSON.stringify({ webhookUrl: target.toString() }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ServiceError(503, 'Không thể kết nối PayOS để đăng ký webhook.');
  }
  const result: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !result ||
    typeof result !== 'object' ||
    (result as { code?: unknown }).code !== '00'
  ) {
    throw new ServiceError(
      503,
      'PayOS chưa xác nhận webhook. Kiểm tra URL và trạng thái endpoint.',
    );
  }
}

export class PayOsHttpClient implements PayOsClient {
  constructor(
    private readonly settings: PayOsSettings,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createPayment(order: OrderRecord): Promise<{ paymentUrl: string; paymentLinkId?: string }> {
    if (
      !this.settings.enabled ||
      !this.settings.clientId ||
      !this.settings.apiKey ||
      !this.settings.checksumKey
    ) {
      throw new ServiceError(503, 'Thanh toán trực tuyến hiện chưa được cấu hình.');
    }
    const returnUrl = `${this.settings.publicWebUrl}/thanh-toan/ket-qua`;
    const cancelUrl = `${this.settings.publicWebUrl}/thanh-toan/ket-qua`;
    // Official API limits unlinked-bank descriptions to nine characters.
    const description = `HTV${String(order.orderCode).slice(-6)}`;
    const payload = {
      orderCode: order.orderCode,
      amount: order.total,
      description,
      cancelUrl,
      returnUrl,
      items: order.items.map((item) => ({
        name: item.name.slice(0, 50),
        quantity: item.quantity,
        price: item.unitPrice,
      })),
      ...(order.customer.name ? { buyerName: order.customer.name.slice(0, 50) } : {}),
      ...(order.customer.email ? { buyerEmail: order.customer.email } : {}),
      ...(order.customer.phone ? { buyerPhone: order.customer.phone } : {}),
      ...(order.customer.address ? { buyerAddress: order.customer.address.slice(0, 200) } : {}),
    };
    const signatureData = {
      amount: payload.amount,
      cancelUrl,
      description,
      orderCode: payload.orderCode,
      returnUrl,
    };
    const response = await this.fetcher('https://api-merchant.payos.vn/v2/payment-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.settings.clientId,
        'x-api-key': this.settings.apiKey,
      },
      body: JSON.stringify({
        ...payload,
        signature: createPayOsSignature(signatureData, this.settings.checksumKey),
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw new ServiceError(
        503,
        'Không thể tạo yêu cầu thanh toán lúc này. Đơn hàng vẫn được lưu để thử lại.',
      );
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== 'object') {
      throw new ServiceError(
        503,
        'Cổng thanh toán hiện không khả dụng. Đơn hàng vẫn được lưu để thử lại.',
      );
    }
    const result = body as {
      code?: string;
      data?: {
        checkoutUrl?: string;
        paymentLinkId?: string;
        amount?: number;
        orderCode?: number;
        currency?: string;
      };
      signature?: string;
    };
    if (
      result.code !== '00' ||
      !result.data ||
      !isAllowedPayOsUrl(result.data.checkoutUrl) ||
      result.data.amount !== order.total ||
      result.data.orderCode !== order.orderCode ||
      result.data.currency !== 'VND' ||
      !result.signature
    ) {
      throw new ServiceError(
        503,
        'Cổng thanh toán trả về kết quả không hợp lệ. Đơn hàng vẫn được lưu để thử lại.',
      );
    }
    if (result.signature) {
      const responseData = result.data as Record<string, unknown>;
      const expected = Buffer.from(
        createPayOsSignature(responseData, this.settings.checksumKey),
        'hex',
      );
      const actual = /^[a-f\d]{64}$/i.test(result.signature)
        ? Buffer.from(result.signature, 'hex')
        : Buffer.alloc(0);
      if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) {
        throw new ServiceError(
          503,
          'Không xác minh được phản hồi từ cổng thanh toán. Đơn hàng vẫn được lưu để thử lại.',
        );
      }
    }
    return { paymentUrl: result.data.checkoutUrl, paymentLinkId: result.data.paymentLinkId };
  }
}
