'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  patchSupabaseClient,
  makeAdminToken,
  startServer,
} = require('./helpers/common');

const { calls } = patchSupabaseClient({ existingObjects: [] });

const app = require('../src/app').default;

let ctx;

test.before(async () => {
  ctx = await startServer(app);
});

test.after(async () => {
  await ctx.close();
});

async function post(body, { token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${ctx.baseUrl}/api/storage/upload-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const VALID_BODY = {
  folder: 'blogs',
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  size: 204800,
};

test('unauthenticated request returns 401', async () => {
  const { status } = await post(VALID_BODY);
  assert.equal(status, 401);
});

test('token with an unknown role is rejected as 401', async () => {
  const token = makeAdminToken({ role: 'GUEST' });
  const { status } = await post(VALID_BODY, { token });
  assert.equal(status, 401);
});

test('disallowed folder returns 403', async () => {
  const token = makeAdminToken();
  const { status } = await post(
    { ...VALID_BODY, folder: 'maps' },
    { token }
  );
  assert.equal(status, 403);
});

test('missing folder returns 400', async () => {
  const token = makeAdminToken();
  const { status } = await post(
    { filename: 'photo.jpg', contentType: 'image/jpeg', size: 1000 },
    { token }
  );
  assert.equal(status, 400);
});

test('unsupported MIME type returns 400', async () => {
  const token = makeAdminToken();
  const { status } = await post(
    { ...VALID_BODY, filename: 'photo.gif', contentType: 'image/gif' },
    { token }
  );
  assert.equal(status, 400);
});

test('extension inconsistent with MIME returns 400', async () => {
  const token = makeAdminToken();
  const { status } = await post(
    { ...VALID_BODY, filename: 'photo.png', contentType: 'image/jpeg' },
    { token }
  );
  assert.equal(status, 400);
});

test('oversized file returns 413', async () => {
  const token = makeAdminToken();
  const { status } = await post(
    { ...VALID_BODY, size: 6 * 1024 * 1024 },
    { token }
  );
  assert.equal(status, 413);
});

test('valid request returns a server-generated path and token', async () => {
  const token = makeAdminToken();
  const { status, json } = await post(VALID_BODY, { token });
  assert.equal(status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.bucket, 'user-images');
  assert.match(json.data.path, /^blogs\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(json.data.token, 'signed-token');
  assert.ok(json.data.signedUrl.startsWith('https://signed.invalid/blogs/'));

  // Secret key is never returned.
  assert.equal(JSON.stringify(json).includes('SUPABASE_SECRET_KEY'), false);
  assert.equal(JSON.stringify(json).includes('service_role'), false);

  // Server generated the path; it accepted no client path.
  assert.equal(calls.signedPaths.length, 1);
});

test('our-works folder generates an object path under our-works/', async () => {
  const token = makeAdminToken({ role: 'SUPER_ADMIN' });
  const { status, json } = await post(
    {
      folder: 'our-works',
      filename: 'shot.png',
      contentType: 'image/png',
      size: 1024,
    },
    { token }
  );
  assert.equal(status, 200);
  assert.match(json.data.path, /^our-works\/[0-9a-f-]{36}\.png$/);
});

test('Supabase signed-upload failure returns 500 without leaking details', async () => {
  const failing = patchSupabaseClient({ signedUploadError: true });
  // Re-patch affects subsequent requests; restore a valid client afterwards.
  const token = makeAdminToken();
  const { status, json } = await post(VALID_BODY, { token });
  assert.equal(status, 500);
  assert.equal(json.success, false);
  assert.equal(String(json.message).includes('boom'), false);
  assert.equal(failing.calls.signedPaths.length >= 1, true);
  // restore working mock for any later tests
  patchSupabaseClient({ existingObjects: [] });
});
