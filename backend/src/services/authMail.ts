import nodemailer from 'nodemailer';
import { CustomerError } from '../utils/customerSecurity.js';
export type AuthMail = { to: string; subject: string; text: string; html: string };
export interface AuthMailer {
  send(message: AuthMail): Promise<void>;
}
export type SmtpAuthOptions = {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  secure?: boolean;
};
export function createSmtpAuthMailer(options: SmtpAuthOptions): AuthMailer {
  // Lazy construction keeps missing configuration from preventing app startup.
  return {
    async send(message) {
      if (!options.host || !options.from)
        throw new CustomerError(503, 'Hiện chưa thể gửi email. Vui lòng thử lại sau.');
      if (
        options.host.toLocaleLowerCase('en-US') === 'smtp.gmail.com' &&
        (!options.user || !options.password)
      )
        throw new CustomerError(
          503,
          'SMTP Gmail yêu cầu SMTP_USER và mật khẩu ứng dụng trong SMTP_PASS.',
        );
      const transport = nodemailer.createTransport({
        host: options.host,
        port: options.port ?? 587,
        secure: options.secure ?? false,
        requireTLS: !(options.secure ?? false),
        auth:
          options.user && options.password
            ? { user: options.user, pass: options.password }
            : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: { rejectUnauthorized: true },
      });
      try {
        await transport.sendMail({ from: options.from, ...message });
      } catch {
        throw new CustomerError(503, 'Hiện chưa thể gửi email. Vui lòng thử lại sau.');
      } finally {
        transport.close();
      }
    },
  };
}
