import assert from 'node:assert/strict';
import test from 'node:test';
import { createSmtpAuthMailer } from '../src/services/authMail.js';

test('Gmail mailer requires an account and app password before sending', async () => {
  const mailer = createSmtpAuthMailer({
    host: 'smtp.gmail.com',
    port: 587,
    from: 'shop@example.com',
  });

  await assert.rejects(
    mailer.send({
      to: 'customer@example.com',
      subject: 'Order',
      text: 'Confirmed',
      html: '<p>Confirmed</p>',
    }),
    /SMTP_USER/,
  );
});
