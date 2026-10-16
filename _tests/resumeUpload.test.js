'use strict';

process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://test-project.supabase.co';
process.env.SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || 'test-secret-key';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  patchSupabaseClient,
  makeAdminToken,
  startServer,
  patchPrisma,
} = require('./helpers/common');

const ACTIVE_JOB = {
  id: 'job-1',
  title: 'Engineer',
  isActive: true,
  isDeleted: false,
};

function makeFakeJobPrisma(seed = {}) {
  const state = {
    jobs: (seed.jobs || []).map((job) => ({
      isActive: true,
      isDeleted: false,
      ...job,
    })),
    applications: (seed.applications || []).map((app) => ({ ...app })),
  };
  let counter = 0;
  let failNextCreate = null;

  return {
    _state: state,
    _setFailNextCreate(error) {
      failNextCreate = error;
    },
    jobPost: {
      findFirst: async ({ where }) =>
        state.jobs.find((job) => job.id === where.id) || null,
    },
    jobApplication: {
      findUnique: async ({ where }) =>
        state.applications.find((app) => app.id === where.id) || null,
      findFirst: async ({ where }) =>
        state.applications.find((app) => app.id === where.id) || null,
      findMany: async () => state.applications,
      count: async ({ where } = {}) => {
        if (where && where.resumeUrl) {
          return state.applications.filter(
            (app) => app.resumeUrl === where.resumeUrl
          ).length;
        }
        return state.applications.length;
      },
      create: async ({ data }) => {
        if (failNextCreate) {
          const error = failNextCreate;
          failNextCreate = null;
          throw error;
        }
        if (
          state.applications.some(
            (app) => app.jobId === data.jobId && app.email === data.email
          )
        ) {
          const error = new Error('Unique constraint');
          error.code = 'P2002';
          throw error;
        }
        counter += 1;
        const row = {
          id: `app-${counter}`,
          status: 'PENDING',
          resumeUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.applications.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.applications.find((app) => app.id === where.id);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }) => {
        const idx = state.applications.findIndex((app) => app.id === where.id);
        return state.applications.splice(idx, 1)[0];
      },
    },
  };
}

const fakePrisma = makeFakeJobPrisma({
  jobs: [ACTIVE_JOB],
  applications: [],
});
patchPrisma(fakePrisma);

const app = require('../src/app').default;

let ctx;
let supa;

test.before(async () => {
  ctx = await startServer(app);
});

test.after(async () => {
  await ctx.close();
});

test.beforeEach(() => {
  fakePrisma._state.applications = [];
  fakePrisma._state.jobs = [{ ...ACTIVE_JOB }];
  fakePrisma._setFailNextCreate(null);
  supa = patchSupabaseClient({ existingResumeObjects: [] });
});

function uploadUrl(jobId, body) {
  return fetch(
    `${ctx.baseUrl}/api/job-posts/${jobId}/applications/resume/upload-url`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  ).then(async (res) => ({ status: res.status, json: await res.json().catch(() => ({})) }));
}

function applyJson(jobId, body) {
  return fetch(`${ctx.baseUrl}/api/job-posts/${jobId}/applications`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => ({})) }));
}

async function applyMultipart(jobId, fields, file) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  if (file) {
    form.append('resume', new Blob([file.bytes], { type: file.type }), file.name);
  }
  const res = await fetch(`${ctx.baseUrl}/api/job-posts/${jobId}/applications`, {
    method: 'POST',
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const VALID_UPLOAD = {
  filename: 'resume.pdf',
  contentType: 'application/pdf',
  size: 204800,
};

const VALID_APPLICATION = {
  applicantName: 'Jane Doe',
  email: 'jane@example.com',
};

// --- Signed upload URL -----------------------------------------------------

test('upload-url: valid request returns a server-generated path and token', async () => {
  const { status, json } = await uploadUrl('job-1', VALID_UPLOAD);
  assert.equal(status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.bucket, 'private-resumes');
  assert.match(json.data.path, /^resumes\/[0-9a-f-]{36}\.pdf$/);
  assert.equal(json.data.token, 'signed-token');
  assert.equal(JSON.stringify(json).includes('test-secret-key'), false);
  assert.equal(JSON.stringify(json).includes('service_role'), false);
  assert.equal(supa.calls.signedResumePaths.length, 1);
});

test('upload-url: does not require admin authentication', async () => {
  const { status } = await uploadUrl('job-1', VALID_UPLOAD);
  assert.equal(status, 200);
});

test('upload-url: nonexistent job returns 404', async () => {
  const { status } = await uploadUrl('missing-job', VALID_UPLOAD);
  assert.equal(status, 404);
});

test('upload-url: inactive job returns 400', async () => {
  fakePrisma._state.jobs = [{ ...ACTIVE_JOB, isActive: false }];
  const { status } = await uploadUrl('job-1', VALID_UPLOAD);
  assert.equal(status, 400);
});

test('upload-url: invalid extension returns 400', async () => {
  const { status } = await uploadUrl('job-1', {
    ...VALID_UPLOAD,
    filename: 'resume.exe',
  });
  assert.equal(status, 400);
});

test('upload-url: disallowed MIME returns 400', async () => {
  const { status } = await uploadUrl('job-1', {
    ...VALID_UPLOAD,
    contentType: 'application/x-msdownload',
  });
  assert.equal(status, 400);
});

test('upload-url: extension/MIME mismatch returns 400', async () => {
  const { status } = await uploadUrl('job-1', {
    filename: 'resume.docx',
    contentType: 'application/pdf',
    size: 1000,
  });
  assert.equal(status, 400);
});

test('upload-url: empty MIME is accepted when the extension is valid', async () => {
  const { status, json } = await uploadUrl('job-1', {
    filename: 'resume.docx',
    contentType: '',
    size: 1000,
  });
  assert.equal(status, 200);
  assert.match(json.data.path, /^resumes\/[0-9a-f-]{36}\.docx$/);
});

test('upload-url: zero size returns 400', async () => {
  const { status } = await uploadUrl('job-1', { ...VALID_UPLOAD, size: 0 });
  assert.equal(status, 400);
});

test('upload-url: oversized file returns 413', async () => {
  const { status } = await uploadUrl('job-1', {
    ...VALID_UPLOAD,
    size: 6 * 1024 * 1024,
  });
  assert.equal(status, 413);
});

test('upload-url: Supabase failure returns 500 without leaking details', async () => {
  supa = patchSupabaseClient({ signedResumeUploadError: true });
  const { status, json } = await uploadUrl('job-1', VALID_UPLOAD);
  assert.equal(status, 500);
  assert.equal(json.success, false);
  assert.equal(String(json.message).includes('boom'), false);
});

// --- Application submission ------------------------------------------------

test('apply: succeeds with a valid resumePath', async () => {
  const path = 'resumes/11111111-2222-4333-8444-555555555555.pdf';
  supa = patchSupabaseClient({
    existingResumeObjects: [
      { name: '11111111-2222-4333-8444-555555555555.pdf', size: 204800, mimetype: 'application/pdf' },
    ],
  });

  const { status, json } = await applyJson('job-1', {
    ...VALID_APPLICATION,
    resumePath: path,
  });
  assert.equal(status, 201);
  assert.equal(json.success, true);
  assert.equal(fakePrisma._state.applications[0].resumeUrl, path);
});

test('apply: nonexistent job returns 404', async () => {
  const { status } = await applyJson('missing-job', VALID_APPLICATION);
  assert.equal(status, 404);
});

test('apply: rejects malicious resumePath values', async () => {
  for (const bad of [
    'resumes/../secret.pdf',
    '/etc/passwd',
    'https://evil.com/resume.pdf',
    'uploads/resumes/x.pdf',
    'blogs/x.pdf',
    'resumes/x.exe',
  ]) {
    const { status } = await applyJson('job-1', {
      ...VALID_APPLICATION,
      resumePath: bad,
    });
    assert.equal(status, 400, `expected 400 for ${bad}`);
  }
});

test('apply: missing storage object returns 404', async () => {
  const { status } = await applyJson('job-1', {
    ...VALID_APPLICATION,
    resumePath: 'resumes/99999999-2222-4333-8444-555555555555.pdf',
  });
  assert.equal(status, 404);
});

test('apply: conflicting resumePath and file upload returns 400', async () => {
  const path = 'resumes/aaaaaaa1-2222-4333-8444-555555555555.pdf';
  supa = patchSupabaseClient({
    existingResumeObjects: [{ name: 'aaaaaaa1-2222-4333-8444-555555555555.pdf' }],
  });
  const { status } = await applyMultipart(
    'job-1',
    { ...VALID_APPLICATION, resumePath: path },
    { name: 'resume.pdf', type: 'application/pdf', bytes: 'pdf' }
  );
  assert.equal(status, 400);
});

test('apply: legacy multipart resume still works', async () => {
  supa = patchSupabaseClient({});
  const { status, json } = await applyMultipart(
    'job-1',
    VALID_APPLICATION,
    { name: 'resume.pdf', type: 'application/pdf', bytes: 'pdf-bytes' }
  );
  assert.equal(status, 201);
  assert.equal(json.success, true);
  assert.match(
    fakePrisma._state.applications[0].resumeUrl,
    /^resumes\/.+\.pdf$/
  );
  assert.equal(supa.calls.resumeUploads.length, 1);
});

test('apply: duplicate application returns 409', async () => {
  fakePrisma._state.applications = [
    {
      id: 'existing',
      jobId: 'job-1',
      email: 'jane@example.com',
      resumeUrl: null,
    },
  ];
  const { status } = await applyJson('job-1', VALID_APPLICATION);
  assert.equal(status, 409);
});

test('apply: creation failure cleans up the orphaned object', async () => {
  const path = 'resumes/bbbbbbb1-2222-4333-8444-555555555555.pdf';
  supa = patchSupabaseClient({
    existingResumeObjects: [{ name: 'bbbbbbb1-2222-4333-8444-555555555555.pdf' }],
  });
  fakePrisma._setFailNextCreate(new Error('db down'));

  const { status } = await applyJson('job-1', {
    ...VALID_APPLICATION,
    resumePath: path,
  });
  assert.equal(status, 500);
  const removed = supa.calls.resumeRemovals.flatMap((call) => call.paths);
  assert.ok(removed.includes(path));
});

test('apply: invalid applicant data cleans up the uploaded orphan', async () => {
  const path = 'resumes/ccccccc1-2222-4333-8444-555555555555.pdf';
  supa = patchSupabaseClient({
    existingResumeObjects: [{ name: 'ccccccc1-2222-4333-8444-555555555555.pdf' }],
  });

  const { status } = await applyJson('job-1', {
    email: 'jane@example.com',
    resumePath: path,
  });
  assert.equal(status, 400);
  const removed = supa.calls.resumeRemovals.flatMap((call) => call.paths);
  assert.ok(removed.includes(path));
});

// --- Admin resume download -------------------------------------------------

test('download: unauthenticated request is rejected', async () => {
  fakePrisma._state.applications = [
    { id: 'app-x', jobId: 'job-1', email: 'a@b.com', resumeUrl: 'resumes/x.pdf' },
  ];
  const res = await fetch(`${ctx.baseUrl}/api/job-applications/app-x/resume`);
  assert.equal(res.status, 401);
});

test('download: admin can download a private resume', async () => {
  fakePrisma._state.applications = [
    { id: 'app-x', jobId: 'job-1', email: 'a@b.com', resumeUrl: 'resumes/x.pdf' },
  ];
  supa = patchSupabaseClient({});
  const res = await fetch(`${ctx.baseUrl}/api/job-applications/app-x/resume`, {
    headers: { authorization: `Bearer ${makeAdminToken()}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(await res.text(), 'dummy');
});

test('download: missing storage object returns 404', async () => {
  fakePrisma._state.applications = [
    { id: 'app-x', jobId: 'job-1', email: 'a@b.com', resumeUrl: 'resumes/x.pdf' },
  ];
  supa = patchSupabaseClient({ resumeDownloadError: true });
  const res = await fetch(`${ctx.baseUrl}/api/job-applications/app-x/resume`, {
    headers: { authorization: `Bearer ${makeAdminToken()}` },
  });
  assert.equal(res.status, 404);
});

test('download: application without a resume returns 404', async () => {
  fakePrisma._state.applications = [
    { id: 'app-y', jobId: 'job-1', email: 'a@b.com', resumeUrl: null },
  ];
  const res = await fetch(`${ctx.baseUrl}/api/job-applications/app-y/resume`, {
    headers: { authorization: `Bearer ${makeAdminToken()}` },
  });
  assert.equal(res.status, 404);
});
