import { readConfig } from './config/env.js';
import { confirmPayOsWebhook } from './services/payOsService.js';

async function main() {
  const config = readConfig();
  if (!config.payOsClientId || !config.payOsApiKey) {
    throw new Error('Thiếu PAYOS_CLIENT_ID hoặc PAYOS_API_KEY trong cấu hình môi trường.');
  }

  await confirmPayOsWebhook(
    { clientId: config.payOsClientId, apiKey: config.payOsApiKey },
    config.payOsWebhookUrl,
  );
  console.log(`Webhook PayOS đã xác nhận: ${config.payOsWebhookUrl}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Không xác định được lỗi đăng ký webhook.';
  console.error(message);
  process.exitCode = 1;
});
