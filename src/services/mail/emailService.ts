import { config, isMailConfigured } from '../../config';
import { isValidEmail } from '../../utils/validation';
import {
  ClientQueryEmailData,
  JobApplicationEmailData,
  renderClientQueryEmail,
  renderJobApplicationEmail,
  RenderedEmail,
} from './emailTemplates';
import { getMailTransport } from './mailTransport';
import { sendWithResend } from './resendTransport';

export interface MailMessage extends RenderedEmail {
  to: string;
}

/**
 * Central email service. All notification types route through `send`, which
 * targets an explicit recipient and never throws on delivery failure — the
 * caller's primary operation (database persistence) must not be affected.
 */
export class EmailService {
  async send(message: MailMessage): Promise<boolean> {
    if (!isValidEmail(message.to)) {
      console.error('[mail] Notification skipped: recipient is not a valid email address.');
      return false;
    }

    if (!isMailConfigured()) {
      console.warn('[mail] Notification skipped: email provider is not configured.');
      return false;
    }

    try {
      if (config.mail.provider === 'resend') {
        await sendWithResend(
          message,
          config.mail.resendApiKey,
          config.mail.from
        );
      } else {
        const transport = getMailTransport();
        if (!transport) {
          console.warn('[mail] Notification skipped: SMTP is not configured.');
          return false;
        }
        await transport.sendMail({
          from: config.mail.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      }
      return true;
    } catch (error) {
      // Never log credentials, tokens or resume paths.
      const reason = error instanceof Error ? error.message : 'unknown error';
      console.error('[mail] Email delivery failed:', reason);
      return false;
    }
  }

  async sendJobApplicationNotification(
    data: JobApplicationEmailData
  ): Promise<boolean> {
    const to = config.mail.hrNotificationEmail;
    if (!to) {
      console.warn(
        '[mail] HR notification skipped: HR_NOTIFICATION_EMAIL is not configured.'
      );
      return false;
    }
    return this.send({ to, ...renderJobApplicationEmail(data) });
  }

  async sendClientQueryNotification(
    data: ClientQueryEmailData
  ): Promise<boolean> {
    const to = config.mail.clientQueryEmail;
    if (!to) {
      console.warn(
        '[mail] Client query notification skipped: CLIENT_QUERY_EMAIL is not configured.'
      );
      return false;
    }
    return this.send({ to, ...renderClientQueryEmail(data) });
  }
}

export const emailService = new EmailService();
