'use strict';

// Must be set before the config module is first loaded.
process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.test.invalid';
process.env.MAIL_FROM = process.env.MAIL_FROM || 'no-reply@logixmart.com';
process.env.HR_NOTIFICATION_EMAIL = 'hr@logixmart.com';
process.env.CLIENT_QUERY_EMAIL = 'contact@logixmart.com';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  patchMailTransport,
  patchPrisma,
  startServer,
} = require('./helpers/common');

const ACTIVE_JOB = {
  id: 'job-1',
  title: 'Senior Engineer',
  isActive: true,
  isDeleted: false,
};

function makeFakeEmailPrisma(seed = {}) {
  const state = {
    jobs: (seed.jobs || []).map((job) => ({
      isActive: true,
      isDeleted: false,
      ...job,
    })),
    applications: (seed.applications || []).map((app) => ({ ...app })),
    contacts: (seed.contacts || []).map((contact) => ({ ...contact })),
  };
  let counter = 0;
  let failCreate = null;

  return {
    _state: state,
    _setFailCreate(error) {
      failCreate = error;
    },
    jobPost: {
      findFirst: async ({ where }) =>
        state.jobs.find((job) => job.id === where.id) || null,
    },
    jobApplication: {
      findUnique: async ({ where }) =>
        state.applications.find((app) => app.id === where.id) || null,
      findMany: async () => state.applications,
      count: async () => state.applications.length,
      create: async ({ data }) => {
        if (failCreate) {
          const error = failCreate;
          failCreate = null;
          throw error;
        }
        counter += 1;
        const row = {
          id: `app-${counter}`,
          status: 'PENDING',
          phone: null,
          portfolioUrl: null,
          linkedinUrl: null,
          coverLetter: null,
          resumeUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.applications.push(row);
        return row;
      },
    },
    contactSubmission: {
      findUnique: async ({ where }) =>
        state.contacts.find((contact) => contact.id === where.id) || null,
      findMany: async () => state.contacts,
      count: async () => state.contacts.length,
      create: async ({ data }) => {
        counter += 1;
        const row = {
          id: `contact-${counter}`,
          subject: null,
          phone: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.contacts.push(row);
        return row;
      },
    },
  };
}

const fakePrisma = makeFakeEmailPrisma({ jobs: [ACTIVE_JOB] });
patchPrisma(fakePrisma);

const app = require('../src/app').default;
const { escapeHtml, isHttpUrl } = require('../src/utils/escapeHtml');

let ctx;

test.before(async () => {
  ctx = await startServer(app);
});

test.after(async () => {
  await ctx.close();
});

test.beforeEach(() => {
  fakePrisma._state.applications = [];
  fakePrisma._state.contacts = [];
  fakePrisma._state.jobs = [{ ...ACTIVE_JOB }];
  fakePrisma._setFailCreate(null);
});

function postJson(path, body) {
  return fetch(`${ctx.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => ({})) }));
}

const APPLICATION = {
  applicantName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '555-0100',
};

// --- HR job application notifications --------------------------------------

test('successful application notifies HR with job title and candidate details', async () => {
  const mail = patchMailTransport();
  const { status } = await postJson('/api/job-posts/job-1/applications', APPLICATION);
  assert.equal(status, 201);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, 'hr@logixmart.com');
  assert.match(mail.sent[0].subject, /New Job Application Received — Senior Engineer/);
  assert.match(mail.sent[0].html, /Jane Doe/);
  assert.match(mail.sent[0].text, /jane@example\.com/);
  // No resume path/URL leaks into the notification.
  assert.equal(/resumes\//.test(mail.sent[0].html), false);
});

test('failed database persistence does not send an email', async () => {
  const mail = patchMailTransport();
  fakePrisma._setFailCreate(new Error('db down'));
  const { status } = await postJson('/api/job-posts/job-1/applications', APPLICATION);
  assert.equal(status, 500);
  assert.equal(mail.sent.length, 0);
});

test('SMTP failure does not delete a saved application or fail the request', async () => {
  patchMailTransport({ fail: true });
  const { status } = await postJson('/api/job-posts/job-1/applications', APPLICATION);
  assert.equal(status, 201);
  assert.equal(fakePrisma._state.applications.length, 1);
});

// --- Client query notifications --------------------------------------------

test('client query notifies the client-query recipient, not HR', async () => {
  const mail = patchMailTransport();
  const { status } = await postJson('/api/contact', {
    name: 'Acme Corp',
    email: 'buyer@acme.example',
    message: 'We would like a quote.',
    subject: 'Pricing',
  });
  assert.equal(status, 201);
  assert.equal(fakePrisma._state.contacts.length, 1);
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].to, 'contact@logixmart.com');
  assert.notEqual(mail.sent[0].to, 'hr@logixmart.com');
  assert.match(mail.sent[0].subject, /New Client Query — Pricing/);
});

test('client query HTML escapes untrusted values', async () => {
  const mail = patchMailTransport();
  const { status } = await postJson('/api/contact', {
    name: '<script>alert(1)</script>',
    email: 'x@y.example',
    message: '<b>bold</b> & <img src=x onerror=alert(2)>',
  });
  assert.equal(status, 201);
  const html = mail.sent[0].html;
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
  assert.equal(html.includes('<b>bold</b>'), false);
  assert.equal(html.includes('&lt;b&gt;bold&lt;/b&gt;'), true);
});

test('missing SMTP configuration is handled safely (no email, no error)', async () => {
  const mail = patchMailTransport({ disabled: true });
  const { status } = await postJson('/api/contact', {
    name: 'No SMTP',
    email: 'nosmtp@example.com',
    message: 'Hello',
  });
  assert.equal(status, 201);
  assert.equal(mail.sent.length, 0);
});

// --- Unit: escaping helpers ------------------------------------------------

test('escapeHtml encodes all dangerous characters', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('isHttpUrl accepts only http(s) URLs', () => {
  assert.equal(isHttpUrl('https://admin.logixmart.com/job-applications/1'), true);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('not-a-url'), false);
  assert.equal(isHttpUrl(''), false);
});
