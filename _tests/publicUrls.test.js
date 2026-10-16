'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { patchSupabaseClient } = require('./helpers/common');

const { calls } = patchSupabaseClient({
  existingObjects: ['x.jpg', 'y.png'],
});

const { SupabaseFileStorage } = require('../src/services/storage/supabaseFileStorage');
const { LocalFileStorage } = require('../src/services/storage/localFileStorage');
const { config } = require('../src/config');

const supabaseStorage = new SupabaseFileStorage();
const localStorage = new LocalFileStorage();

test('Supabase object paths resolve to public bucket URLs', () => {
  assert.equal(
    supabaseStorage.getPublicUrl('blogs/x.jpg'),
    'https://cdn.invalid/blogs/x.jpg'
  );
  assert.equal(
    supabaseStorage.getPublicUrl('our-works/y.png'),
    'https://cdn.invalid/our-works/y.png'
  );
});

test('legacy and absolute URLs keep working', () => {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  assert.equal(
    supabaseStorage.getPublicUrl('/uploads/blogs/legacy.jpg'),
    `${base}/uploads/blogs/legacy.jpg`
  );
  assert.equal(
    supabaseStorage.getPublicUrl('https://cdn.example.com/keep.jpg'),
    'https://cdn.example.com/keep.jpg'
  );
  assert.equal(
    localStorage.getPublicUrl('/uploads/blogs/legacy.jpg'),
    `${base}/uploads/blogs/legacy.jpg`
  );
});

test('delete never touches legacy local paths or external URLs', async () => {
  const before = calls.removals.length;

  await supabaseStorage.deleteIfExists('/uploads/blogs/legacy.jpg');
  await supabaseStorage.deleteIfExists('https://evil.com/x.jpg');

  const after = calls.removals.length;
  assert.equal(after, before);
});

test('delete removes validated Supabase object paths', async () => {
  const before = calls.removals.length;
  await supabaseStorage.deleteIfExists('blogs/x.jpg');
  assert.equal(calls.removals.length, before + 1);
  assert.deepEqual(calls.removals.at(-1).paths, ['blogs/x.jpg']);
});

test('exists() reports object presence for object paths only', async () => {
  assert.equal(await supabaseStorage.exists('blogs/x.jpg'), true);
  assert.equal(await supabaseStorage.exists('blogs/missing.jpg'), false);
  assert.equal(await supabaseStorage.exists('/uploads/blogs/x.jpg'), false);
  assert.equal(await localStorage.exists('blogs/x.jpg'), false);
});
