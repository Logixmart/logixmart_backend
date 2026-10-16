import { escapeHtml, isHttpUrl } from '../../utils/escapeHtml';

export interface JobApplicationEmailData {
  id: string;
  jobTitle: string;
  applicantName: string;
  email: string;
  phone?: string | null;
  portfolioUrl?: string | null;
  linkedinUrl?: string | null;
  coverLetter?: string | null;
  resumeProvided: boolean;
  createdAt: Date;
  /** Optional, fully-formed admin application URL. Omitted when unknown. */
  adminUrl?: string | null;
}

export interface ClientQueryEmailData {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  createdAt: Date;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function formatDate(date: Date): string {
  return date.toISOString();
}

function row(label: string, value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">${escapeHtml(
    label
  )}</td><td style="padding:4px 0;">${escapeHtml(value)}</td></tr>`;
}

export function renderJobApplicationEmail(
  data: JobApplicationEmailData
): RenderedEmail {
  const subject = `New Job Application Received — ${data.jobTitle}`;
  const adminUrl = isHttpUrl(data.adminUrl) ? data.adminUrl : '';

  const lines = [
    `New job application received.`,
    ``,
    `Job title: ${data.jobTitle}`,
    `Candidate: ${data.applicantName}`,
    `Email: ${data.email}`,
    data.phone ? `Phone: ${data.phone}` : null,
    data.portfolioUrl ? `Portfolio: ${data.portfolioUrl}` : null,
    data.linkedinUrl ? `LinkedIn: ${data.linkedinUrl}` : null,
    `Resume attached: ${data.resumeProvided ? 'Yes (download from admin panel)' : 'No'}`,
    `Applied at: ${formatDate(data.createdAt)}`,
    data.coverLetter ? `\nCover letter:\n${data.coverLetter}` : null,
    adminUrl ? `\nView in admin panel: ${adminUrl}` : null,
  ].filter((line): line is string => line !== null);

  const htmlRows = [
    row('Job title', data.jobTitle),
    row('Candidate', data.applicantName),
    row('Email', data.email),
    row('Phone', data.phone),
    row('Portfolio', data.portfolioUrl),
    row('LinkedIn', data.linkedinUrl),
    row('Resume attached', data.resumeProvided ? 'Yes (download from admin panel)' : 'No'),
    row('Applied at', formatDate(data.createdAt)),
  ].join('');

  const coverLetterHtml = data.coverLetter
    ? `<p style="margin-top:16px;"><strong>Cover letter</strong></p><pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(
        data.coverLetter
      )}</pre>`
    : '';

  const adminHtml = adminUrl
    ? `<p style="margin-top:16px;"><a href="${escapeHtml(
        adminUrl
      )}">View application in admin panel</a></p>`
    : '';

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">
<p>A new job application was received.</p>
<table style="border-collapse:collapse;">${htmlRows}</table>
${coverLetterHtml}
${adminHtml}
</div>`;

  return { subject, text: lines.join('\n'), html };
}

export function renderClientQueryEmail(
  data: ClientQueryEmailData
): RenderedEmail {
  const subject = data.subject
    ? `New Client Query — ${data.subject}`
    : `New Client Query — ${data.name}`;

  const lines = [
    `New client query received.`,
    ``,
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    data.phone ? `Phone: ${data.phone}` : null,
    data.subject ? `Subject: ${data.subject}` : null,
    `Submitted at: ${formatDate(data.createdAt)}`,
    ``,
    `Message:`,
    data.message,
  ].filter((line): line is string => line !== null);

  const htmlRows = [
    row('Name', data.name),
    row('Email', data.email),
    row('Phone', data.phone),
    row('Subject', data.subject),
    row('Submitted at', formatDate(data.createdAt)),
  ].join('');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">
<p>A new client query was submitted.</p>
<table style="border-collapse:collapse;">${htmlRows}</table>
<p style="margin-top:16px;"><strong>Message</strong></p>
<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(
    data.message
  )}</pre>
</div>`;

  return { subject, text: lines.join('\n'), html };
}
