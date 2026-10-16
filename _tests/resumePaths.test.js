'use strict';

require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extensionOf,
  isAllowedResumeExtension,
  isAllowedResumeMimeForExtension,
  isAllowedResumeMimeType,
  isResumeSizeWithinLimit,
  isSafeResumeFilename,
  isValidResumeObjectPath,
} = require('../src/utils/resumePaths');
const { RESUME_MAX_BYTES } = require('../src/constants/resumes');

test('accepts valid resume object paths under resumes/', () => {
  assert.equal(isValidResumeObjectPath('resumes/abc.pdf'), true);
  assert.equal(isValidResumeObjectPath('resumes/abc.doc'), true);
  assert.equal(isValidResumeObjectPath('resumes/abc.docx'), true);
  assert.equal(
    isValidResumeObjectPath('resumes/0f2c9a1b-1234-4abc-9def-000000000000.pdf'),
    true
  );
});

test('rejects traversal, URLs, filesystem and cross-bucket paths', () => {
  assert.equal(isValidResumeObjectPath('resumes/../secret.pdf'), false);
  assert.equal(isValidResumeObjectPath('resumes/sub/../../x.pdf'), false);
  assert.equal(isValidResumeObjectPath('/resumes/abc.pdf'), false);
  assert.equal(isValidResumeObjectPath('resumes\\abc.pdf'), false);
  assert.equal(isValidResumeObjectPath('uploads/resumes/abc.pdf'), false);
  assert.equal(isValidResumeObjectPath('blogs/abc.pdf'), false);
  assert.equal(isValidResumeObjectPath('https://evil.com/x.pdf'), false);
  assert.equal(isValidResumeObjectPath('resumes/abc.exe'), false);
  assert.equal(isValidResumeObjectPath('resumes/'), false);
  assert.equal(isValidResumeObjectPath('resumes/noextension'), false);
  assert.equal(isValidResumeObjectPath(''), false);
  assert.equal(isValidResumeObjectPath(null), false);
  assert.equal(isValidResumeObjectPath(undefined), false);
});

test('filename and extension validation', () => {
  assert.equal(isSafeResumeFilename('resume.pdf'), true);
  assert.equal(isSafeResumeFilename('My Resume.DOCX'), true);
  assert.equal(isSafeResumeFilename('resume.txt'), false);
  assert.equal(isSafeResumeFilename('sub/resume.pdf'), false);
  assert.equal(isSafeResumeFilename('..\\resume.pdf'), false);
  assert.equal(extensionOf('RESUME.PDF'), '.pdf');
  assert.equal(isAllowedResumeExtension('.pdf'), true);
  assert.equal(isAllowedResumeExtension('.exe'), false);
  assert.equal(isAllowedResumeMimeType('application/pdf'), true);
  assert.equal(isAllowedResumeMimeType('image/png'), false);
  assert.equal(
    isAllowedResumeMimeForExtension('.pdf', 'application/pdf'),
    true
  );
  assert.equal(
    isAllowedResumeMimeForExtension('.docx', 'application/pdf'),
    false
  );
});

test('size limit reflects documented constraints', () => {
  assert.equal(RESUME_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(isResumeSizeWithinLimit(1), true);
  assert.equal(isResumeSizeWithinLimit(RESUME_MAX_BYTES), true);
  assert.equal(isResumeSizeWithinLimit(0), false);
  assert.equal(isResumeSizeWithinLimit(-1), false);
  assert.equal(isResumeSizeWithinLimit(RESUME_MAX_BYTES + 1), false);
  assert.equal(isResumeSizeWithinLimit(Number.NaN), false);
});
