export type CommerceConfig = {
  paymentsEnabled: boolean;
  payOsClientId?: string;
  payOsApiKey?: string;
  payOsChecksumKey?: string;
  payOsWebhookUrl: string;
  publicWebUrl: string;
  shippingFee: number;
  freeShippingThreshold: number;
};

function integerSetting(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name];
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`${name} phải là số nguyên không âm.`);
  return parsed;
}

export function readCommerceConfig(env: NodeJS.ProcessEnv = process.env): CommerceConfig {
  const publicWebUrl =
    env.PUBLIC_WEB_URL?.trim() || env.FRONTEND_ORIGIN?.trim() || 'http://localhost:5173';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(publicWebUrl);
  } catch {
    throw new Error('PUBLIC_WEB_URL không hợp lệ.');
  }
  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.origin !== publicWebUrl ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error('PUBLIC_WEB_URL phải là một origin HTTP(S) chính xác.');
  }
  const payOsWebhookUrl =
    env.PAYOS_WEBHOOK_URL?.trim() || `${parsedUrl.origin}/api/payments/payos/webhook`;
  let parsedWebhookUrl: URL;
  try {
    parsedWebhookUrl = new URL(payOsWebhookUrl);
  } catch {
    throw new Error('PAYOS_WEBHOOK_URL không hợp lệ.');
  }
  if (
    !['http:', 'https:'].includes(parsedWebhookUrl.protocol) ||
    parsedWebhookUrl.username ||
    parsedWebhookUrl.password ||
    parsedWebhookUrl.search ||
    parsedWebhookUrl.hash ||
    parsedWebhookUrl.pathname !== '/api/payments/payos/webhook'
  ) {
    throw new Error('PAYOS_WEBHOOK_URL phải trỏ đúng endpoint webhook HTTP(S) của ứng dụng.');
  }
  const paymentsEnabled = env.PAYMENTS_ENABLED?.trim().toLowerCase() === 'true';
  const payOsClientId = env.PAYOS_CLIENT_ID?.trim() || undefined;
  const payOsApiKey = env.PAYOS_API_KEY?.trim() || undefined;
  const payOsChecksumKey = env.PAYOS_CHECKSUM_KEY?.trim() || undefined;
  if (paymentsEnabled && (!payOsClientId || !payOsApiKey || !payOsChecksumKey)) {
    throw new Error(
      'PAYMENTS_ENABLED=true yêu cầu đầy đủ PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY.',
    );
  }

  return {
    paymentsEnabled,
    payOsClientId,
    payOsApiKey,
    payOsChecksumKey,
    payOsWebhookUrl: parsedWebhookUrl.toString(),
    publicWebUrl: parsedUrl.origin,
    shippingFee: integerSetting(env, 'SHIPPING_FEE', 30_000),
    freeShippingThreshold: integerSetting(env, 'FREE_SHIPPING_THRESHOLD', 499_000),
  };
}
