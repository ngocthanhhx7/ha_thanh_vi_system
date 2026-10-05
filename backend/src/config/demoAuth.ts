import { mkdir, writeFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { AuthOptions } from '../services/customerAuthService.js';
import type { AppConfig } from './env.js';

// Explicit local demo only. No SMTP calls, public mailbox or OTP bypass.
export function demoAuthOptions(config: AppConfig): AuthOptions | undefined {
  if (process.env.HTV_DEMO_MAILBOX !== '1' || !config.isDevelopment || !config.orderTokenSecret)
    return undefined;
  const directory = fileURLToPath(new URL('../../../.local/preview-mailbox/', import.meta.url));
  return {
    publicWebUrl: config.publicWebUrl ?? config.frontendOrigin,
    challengeSecret: createHmac('sha256', config.orderTokenSecret)
      .update('htv:auth:challenge:v1')
      .digest('hex'),
    resetSecret: createHmac('sha256', config.orderTokenSecret)
      .update('htv:auth:reset:v1')
      .digest('hex'),
    mailer: {
      async send(mail) {
        await mkdir(directory, { recursive: true });
        await writeFile(
          resolve(directory, Date.now() + '-' + randomUUID() + '.txt'),
          `LOCAL DEMO EMAIL — NOT SENT\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`,
          { flag: 'wx' },
        );
      },
    },
  };
}
