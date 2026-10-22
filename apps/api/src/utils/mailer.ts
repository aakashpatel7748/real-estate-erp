import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** In tests, sent mail is captured here for assertions. */
export const testOutbox: Mail[] = [];

let transporter: Transporter | null = null;
if (env.SMTP_URL) transporter = nodemailer.createTransport(env.SMTP_URL);

/**
 * Sends email via SMTP when configured. In development without SMTP the message is logged
 * so links can be copied; in tests it is captured. Failures never break the request.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.isTest) {
    testOutbox.push(mail);
    return;
  }
  if (!transporter) {
    if (env.isProd) logger.error({ to: mail.to, subject: mail.subject }, 'SMTP_URL not configured; email not sent');
    else logger.info({ to: mail.to, subject: mail.subject, text: mail.text }, 'Email (dev, not sent)');
    return;
  }
  try {
    await transporter.sendMail({ from: env.MAIL_FROM, ...mail });
  } catch (err) {
    logger.error({ err, to: mail.to }, 'Failed to send email');
  }
}
