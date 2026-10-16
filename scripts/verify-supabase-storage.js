#!/usr/bin/env node
/**
 * Read-only Supabase Storage health check.
 * Reports whether the configured buckets exist and their public/private state.
 * Never creates, deletes or modifies buckets, and never prints secrets.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
const envPath = path.join(ROOT, '.env');

if (fs.existsSync(envPath)) {
  const parsed = require('dotenv').parse(fs.readFileSync(envPath));
  for (const key of Object.keys(parsed)) {
    if (process.env[key] === undefined) process.env[key] = parsed[key];
  }
}

const IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET?.trim() || 'user-images';
const RESUME_BUCKET =
  process.env.SUPABASE_RESUME_BUCKET?.trim() || 'private-resumes';

(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error(
      'BLOCKER: SUPABASE_URL and SUPABASE_SECRET_KEY must be set to verify buckets.'
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      throw new Error(error.message);
    }

    const report = [IMAGE_BUCKET, RESUME_BUCKET].map((name) => {
      const bucket = (data || []).find((entry) => entry.name === name);
      return bucket
        ? { name, exists: true, public: Boolean(bucket.public) }
        : { name, exists: false };
    });

    console.log(JSON.stringify({ buckets: report }, null, 2));

    const imageBucket = report.find((entry) => entry.name === IMAGE_BUCKET);
    const resumeBucket = report.find((entry) => entry.name === RESUME_BUCKET);

    if (!imageBucket?.exists) {
      console.error(
        `BLOCKER: image bucket "${IMAGE_BUCKET}" is missing. Create it in the Supabase Dashboard (Storage → New bucket) and make it public, then re-run.`
      );
      process.exitCode = 1;
    } else if (!imageBucket.public) {
      console.error(
        `BLOCKER: image bucket "${IMAGE_BUCKET}" is private, so public image URLs will not resolve. Change it to public in the Dashboard if images should be publicly readable.`
      );
      process.exitCode = 1;
    }

    if (!resumeBucket?.exists) {
      console.warn(
        `WARNING: resume bucket "${RESUME_BUCKET}" is missing (needed only for job applications).`
      );
    } else if (resumeBucket.public) {
      console.error(
        `BLOCKER: resume bucket "${RESUME_BUCKET}" is public. It must be private.`
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Storage check failed:', String(error.message || error).slice(0, 200));
    process.exitCode = 1;
  }
})();
