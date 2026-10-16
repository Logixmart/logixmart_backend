'use strict';

/**
 * Development-only SMTP diagnostic.
 *
 * Verifies SMTP connectivity and authentication WITHOUT sending any email.
 * It never prints credentials, and it refuses to send messages.
 *
 * Usage:
 *   npm run check:smtp
 *
 * Requires SMTP_HOST, MAIL_FROM (and usually SMTP_USER / SMTP_PASS) to be set
 * in the backend .env. See README for how to obtain provider settings.
 */

require('ts-node/register/transpile-only');

const { config, isMailConfigured, getMissingMailVars } = require('../src/config');
const { getMailTransport } = require('../src/services/mail/mailTransport');

async function main() {
  if (!isMailConfigured()) {
    console.error(
      `SMTP is not configured. Missing: ${getMissingMailVars().join(', ') || 'SMTP_HOST, MAIL_FROM'}`
    );
    process.exitCode = 1;
    return;
  }

  const transport = getMailTransport();
  if (!transport) {
    console.error('Could not create an SMTP transport from the current configuration.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `Connecting to SMTP host "${config.mail.host}:${config.mail.port}" (secure=${config.mail.secure})...`
  );

  try {
    await transport.verify();
    console.log(
      'SMTP connection and authentication succeeded. No email was sent.'
    );
  } catch (error) {
    const reason = error && error.message ? error.message : 'unknown error';
    console.error(`SMTP verification failed: ${reason}`);
    console.error(
      'Check SMTP_HOST/PORT/SECURE/USER/PASS and the provider requirements.'
    );
    process.exitCode = 1;
  }
}

void main();
