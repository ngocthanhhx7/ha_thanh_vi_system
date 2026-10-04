import 'dotenv/config';
import { readCommerceConfig, type CommerceConfig } from './commerce.js';

export type AppConfig = Partial<CommerceConfig> & {
  port: number;
  mongoUri?: string;
  frontendOrigin: string;
  isDevelopment: boolean;
  orderTokenSecret?: string;
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
  const orderTokenSecret = env.ORDER_TOKEN_SECRET?.trim() || undefined;
  if (mongoUri && (!orderTokenSecret || orderTokenSecret.length < 32)) {
    throw new Error('ORDER_TOKEN_SECRET phải có ít nhất 32 ký tự khi sử dụng MongoDB.');
  }
  return {
    port,
    mongoUri,
    frontendOrigin,
    isDevelopment: env.NODE_ENV !== 'production',
    ...commerce,
    orderTokenSecret,
  };
}
