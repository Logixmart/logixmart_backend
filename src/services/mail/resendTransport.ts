import type { MailMessage } from './emailService';

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendWithResend(
  message: MailMessage,
  apiKey: string,
  from: string,
  request: typeof fetch = fetch
): Promise<void> {
  const response = await request(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Resend API request failed (HTTP ${response.status}).`);
  }
}
