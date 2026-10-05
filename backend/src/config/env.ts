import 'dotenv/config';
import { readCommerceConfig, type CommerceConfig } from './commerce.js';

export type AppConfig = CommerceConfig & {
  port: number;
  mongoUri?: string;
  frontendOrigin: string;
  isDevelopment: boolean;
  trustProxyHops: number;
  orderTokenSecret?: string;
  authTokenSecret?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  mailFrom?: string;
  geminiApiKey?: string;
  geminiModel?: string;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.PORT ?? '4000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
  }
  const mongoUri = env.MONGODB_URI?.trim() || undefined;
  if (mongoUri && !/^mongodb(?:\+srv)?:\/\//i.test(mongoUri))
    throw new Error('MONGODB_URI không hợp lệ.');
  const frontendOrigin = env.FRONTEND_ORIGIN?.trim() || 'http://localhost:5173';
  try {
    const url = new URL(frontendOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== frontendOrigin)
      throw new Error();
  } catch {
    throw new Error('FRONTEND_ORIGIN phải là một origin HTTP(S) chính xác.');
  }
  const commerce = readCommerceConfig(env);
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS || '0');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 1)
    throw new Error('TRUST_PROXY_HOPS phải là 0 (trực tiếp) hoặc 1 (một reverse proxy).');
  const orderTokenSecret = env.ORDER_TOKEN_SECRET?.trim() || undefined;
  const smtpPort = Number(env.SMTP_PORT || '587');
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
    throw new Error('SMTP_PORT phải là số nguyên từ 1 đến 65535.');
  const authTokenSecret = env.AUTH_TOKEN_SECRET?.trim() || undefined;
  if (authTokenSecret && authTokenSecret.length < 32)
    throw new Error('AUTH_TOKEN_SECRET phải có ít nhất 32 ký tự.');
  if (mongoUri && (!orderTokenSecret || orderTokenSecret.length < 32)) {
    throw new Error('ORDER_TOKEN_SECRET phải có ít nhất 32 ký tự khi sử dụng MongoDB.');
  }
  return {
    port,
    mongoUri,
    frontendOrigin,
    isDevelopment: env.NODE_ENV !== 'production',
    trustProxyHops,
    ...commerce,
    orderTokenSecret,
    authTokenSecret,
    smtpHost: env.SMTP_HOST?.trim() || undefined,
    smtpPort,
    smtpUser: env.SMTP_USER?.trim() || undefined,
    smtpPassword: env.SMTP_PASS || undefined,
    mailFrom: env.MAIL_FROM?.trim() || undefined,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    geminiModel: env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite',
  };
}
