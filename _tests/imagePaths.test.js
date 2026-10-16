'use strict';

require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidImageObjectPath,
  resolveImageObjectPath,
  isSafeImageFilename,
  extensionOf,
  isAllowedImageMimeForExtension,
  getFolderFromObjectPath,
  objectPathFromSupabasePublicUrl,
  isLegacyLocalImagePath,
  isAbsoluteHttpUrl,
} = require('../src/utils/imagePaths');
const {
  IMAGE_MAX_BYTES,
  MAX_OUR_WORK_IMAGES,
} = require('../src/constants/images');

test('accepts valid folder-prefixed object paths', () => {
  assert.equal(isValidImageObjectPath('blogs/abc.jpg', 'blogs'), true);
  assert.equal(isValidImageObjectPath('blogs/abc.jpeg', 'blogs'), true);
  assert.equal(isValidImageObjectPath('our-works/abc.png', 'our-works'), true);
  assert.equal(isValidImageObjectPath('our-works/a1/b2.webp', 'our-works'), true);
});

test('rejects cross-feature, traversal and malformed paths', () => {
  assert.equal(isValidImageObjectPath('our-works/abc.jpg', 'blogs'), false);
  assert.equal(isValidImageObjectPath('blogs/abc.jpg', 'our-works'), false);
  assert.equal(isValidImageObjectPath('blogs/../secret.jpg', 'blogs'), false);
  assert.equal(isValidImageObjectPath('blogs/sub/../../x.jpg', 'blogs'), false);
  assert.equal(isValidImageObjectPath('/blogs/abc.jpg', 'blogs'), false);
  assert.equal(isValidImageObjectPath('blogs\\abc.jpg', 'blogs'), false);
  assert.equal(isValidImageObjectPath('blogs/abc.exe', 'blogs'), false);
  assert.equal(isValidImageObjectPath('https://evil.com/x.jpg', 'blogs'), false);
  assert.equal(isValidImageObjectPath('/uploads/blogs/x.jpg', 'blogs'), false);
  assert.equal(isValidImageObjectPath('', 'blogs'), false);
  assert.equal(isValidImageObjectPath(null, 'blogs'), false);
});

test('resolves a same-bucket public URL to an object path', () => {
  const url =
    'https://proj.supabase.co/storage/v1/object/public/user-images/blogs/x.jpg';
  assert.equal(
    resolveImageObjectPath(url, 'blogs', 'user-images'),
    'blogs/x.jpg'
  );
  assert.equal(
    resolveImageObjectPath(url, 'our-works', 'user-images'),
    null
  );
  assert.equal(
    resolveImageObjectPath('https://evil.com/blogs/x.jpg', 'blogs', 'user-images'),
    null
  );
});

test('objectPathFromSupabasePublicUrl only matches the configured bucket', () => {
  const url =
    'https://proj.supabase.co/storage/v1/object/public/user-images/our-works/x.png';
  assert.equal(
    objectPathFromSupabasePublicUrl(url, 'user-images'),
    'our-works/x.png'
  );
  assert.equal(objectPathFromSupabasePublicUrl(url, 'other-bucket'), null);
  assert.equal(objectPathFromSupabasePublicUrl('/uploads/x.png', 'user-images'), null);
});

test('filename and extension validation', () => {
  assert.equal(isSafeImageFilename('photo.jpg'), true);
  assert.equal(isSafeImageFilename('photo.WEBP'), true);
  assert.equal(isSafeImageFilename('photo.txt'), false);
  assert.equal(isSafeImageFilename('sub/photo.jpg'), false);
  assert.equal(isSafeImageFilename('..\\photo.jpg'), false);
  assert.equal(extensionOf('PHOTO.JPEG'), '.jpeg');
  assert.equal(isAllowedImageMimeForExtension('.jpg', 'image/jpeg'), true);
  assert.equal(isAllowedImageMimeForExtension('.jpeg', 'image/jpeg'), true);
  assert.equal(isAllowedImageMimeForExtension('.png', 'image/jpeg'), false);
  assert.equal(isAllowedImageMimeForExtension('.webp', 'image/webp'), true);
});

test('folder detection and legacy helpers', () => {
  assert.equal(getFolderFromObjectPath('blogs/x.jpg'), 'blogs');
  assert.equal(getFolderFromObjectPath('our-works/x.jpg'), 'our-works');
  assert.equal(getFolderFromObjectPath('/uploads/x.jpg'), null);
  assert.equal(isLegacyLocalImagePath('/uploads/blogs/x.jpg'), true);
  assert.equal(isLegacyLocalImagePath('blogs/x.jpg'), false);
  assert.equal(isAbsoluteHttpUrl('https://x.com/a.jpg'), true);
  assert.equal(isAbsoluteHttpUrl('blogs/x.jpg'), false);
});

test('limits reflect documented constraints', () => {
  assert.equal(IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_OUR_WORK_IMAGES, 5);
});
