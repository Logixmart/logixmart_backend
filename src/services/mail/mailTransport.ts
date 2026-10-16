import nodemailer, { Transporter } from 'nodemailer';
import { config, isMailConfigured } from '../../config';

/**
 * Lazily-created Nodemailer transport built solely from backend environment
 * variables. The provider is not hardcoded: host/port/TLS come from SMTP_*.
 * `SMTP_PASS` is never logged or returned.
 *
 * Exposed as a module function (rather than a singleton constant) so tests can
 * replace it with a fake transport.
 */
let transporter: Transporter | null = null;

export function getMailTransport(): Transporter | null {
  if (!isMailConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      // `secure: true` for implicit TLS (e.g. port 465). STARTTLS upgrades are
      // negotiated automatically when secure is false.
      secure: config.mail.secure,
      auth: config.mail.user
        ? { user: config.mail.user, pass: config.mail.pass }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  return transporter;
}

