#!/usr/bin/env node
/**
 * Migrate local uploads → Supabase Storage, then update DB paths.
 * - blogs / our-works → public bucket user-images (privacy unchanged)
 * - resumes → private bucket private-resumes
 * Preserves all local files. Never prints secrets.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const parsed = require('dotenv').parse(fs.readFileSync(path.join(ROOT, '.env')));
for (const k of Object.keys(parsed)) process.env[k] = parsed[k];

const IMAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET?.trim() || 'user-images';
const RESUME_BUCKET =
  process.env.SUPABASE_RESUME_BUCKET?.trim() || 'private-resumes';

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function redact(msg) {
  return String(msg || '')
    .replace(/postgresql:\/\/[^\s"'`]+/gi, 'postgresql://***')
    .slice(0, 400);
}

function basenameFromStored(p) {
  if (!p) return null;
  const parts = String(p).replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || null;
}

async function objectExists(supabase, bucket, objectPath) {
  const dir = objectPath.includes('/')
    ? objectPath.slice(0, objectPath.lastIndexOf('/'))
    : '';
  const name = path.basename(objectPath);
  const { data, error } = await supabase.storage.from(bucket).list(dir || '', {
    search: name,
    limit: 100,
  });
  if (error) return false;
  return (data || []).some((f) => f.name === name);
}

async function uploadFile(supabase, bucket, localPath, objectPath, { upsert }) {
  const buffer = await fs.promises.readFile(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  if (!upsert && (await objectExists(supabase, bucket, objectPath))) {
    return { status: 'skipped_exists', objectPath };
  }

  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    if (/already exists|Duplicate/i.test(error.message)) {
      return { status: 'skipped_exists', objectPath };
    }
    return { status: 'failed', error: error.message, objectPath };
  }

  const ok = await objectExists(supabase, bucket, objectPath);
  if (!ok) {
    return { status: 'failed', error: 'upload reported ok but object missing', objectPath };
  }
  return { status: 'uploaded', objectPath };
}

(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY required');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  const stats = {
    blogs: { found: 0, uploaded: 0, skipped: 0, failed: 0, dbUpdated: 0 },
    ourWorks: { found: 0, uploaded: 0, skipped: 0, failed: 0, dbUpdated: 0 },
    resumes: { found: 0, uploaded: 0, skipped: 0, failed: 0, dbUpdated: 0 },
  };
  const failures = [];

  try {
    // --- Bucket privacy checks ---
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) throw new Error(`listBuckets: ${listErr.message}`);

    const imageBucket = (buckets || []).find((b) => b.name === IMAGE_BUCKET);
    if (!imageBucket) throw new Error(`Bucket ${IMAGE_BUCKET} not found`);
    if (!imageBucket.public) {
      throw new Error(
        `${IMAGE_BUCKET} is not public — aborting (will not change privacy without approval)`
      );
    }
    console.log(
      'IMAGE_BUCKET',
      JSON.stringify({ name: IMAGE_BUCKET, public: imageBucket.public, action: 'unchanged' })
    );

    let resumeBucket = (buckets || []).find((b) => b.name === RESUME_BUCKET);
    if (!resumeBucket) {
      const { data: created, error: createErr } = await supabase.storage.createBucket(
        RESUME_BUCKET,
        { public: false }
      );
      if (createErr) throw new Error(`createBucket ${RESUME_BUCKET}: ${createErr.message}`);
      console.log('RESUME_BUCKET_CREATED', JSON.stringify({ name: RESUME_BUCKET, public: false }));
      resumeBucket = { name: RESUME_BUCKET, public: false };
    } else {
      console.log(
        'RESUME_BUCKET',
        JSON.stringify({ name: RESUME_BUCKET, public: resumeBucket.public })
      );
      if (resumeBucket.public) {
        throw new Error(
          `${RESUME_BUCKET} exists but is PUBLIC — refusing to upload resumes. Make it private in Dashboard, then retry.`
        );
      }
    }

    const blogs = await prisma.blog.findMany({
      select: { id: true, imageUrl: true },
    });
    const works = await prisma.ourWork.findMany({
      select: { id: true, images: true },
    });
    const apps = await prisma.jobApplication.findMany({
      select: { id: true, resumeUrl: true },
    });

    // --- Build plans ---
    const blogPlan = [];
    for (const b of blogs) {
      const name = basenameFromStored(b.imageUrl);
      if (!b.imageUrl?.startsWith('/uploads/blogs/') || !name) {
        stats.blogs.skipped++;
        continue;
      }
      const localPath = path.join(ROOT, 'uploads/blogs', name);
      if (!fs.existsSync(localPath)) {
        stats.blogs.skipped++;
        failures.push({ type: 'blogs', id: b.id, reason: 'missing_local', path: b.imageUrl });
        continue;
      }
      stats.blogs.found++;
      blogPlan.push({
        id: b.id,
        field: 'imageUrl',
        from: b.imageUrl,
        to: `blogs/${name}`,
        localPath,
      });
    }

    const workPlanById = new Map();
    for (const w of works) {
      const nextImages = [];
      let changed = false;
      for (const img of w.images || []) {
        const name = basenameFromStored(img);
        if (!img?.startsWith('/uploads/our-works/') || !name) {
          nextImages.push(img);
          stats.ourWorks.skipped++;
          continue;
        }
        const localPath = path.join(ROOT, 'uploads/our-works', name);
        if (!fs.existsSync(localPath)) {
          nextImages.push(img);
          stats.ourWorks.skipped++;
          failures.push({
            type: 'our-works',
            id: w.id,
            reason: 'missing_local',
            path: img,
          });
          continue;
        }
        stats.ourWorks.found++;
        const to = `our-works/${name}`;
        nextImages.push(to);
        changed = true;
        if (!workPlanById.has(w.id)) {
          workPlanById.set(w.id, { id: w.id, uploads: [], from: [...w.images], to: null });
        }
        workPlanById.get(w.id).uploads.push({ from: img, to, localPath });
      }
      if (changed) {
        const entry = workPlanById.get(w.id);
        entry.to = nextImages;
      }
    }

    const resumePlan = [];
    for (const a of apps) {
      const name = basenameFromStored(a.resumeUrl);
      if (!a.resumeUrl?.startsWith('/uploads/resumes/') || !name) {
        stats.resumes.skipped++;
        continue;
      }
      const localPath = path.join(ROOT, 'uploads/resumes', name);
      if (!fs.existsSync(localPath)) {
        stats.resumes.skipped++;
        failures.push({
          type: 'resumes',
          id: a.id,
          reason: 'missing_local',
          path: a.resumeUrl,
        });
        continue;
      }
      stats.resumes.found++;
      resumePlan.push({
        id: a.id,
        field: 'resumeUrl',
        from: a.resumeUrl,
        to: `resumes/${name}`,
        localPath,
      });
    }

    console.log('\n=== PLANNED DATABASE PATH UPDATES (before apply) ===');
    console.log(
      'BLOGS',
      JSON.stringify(
        blogPlan.map((p) => ({ id: p.id, field: p.field, from: p.from, to: p.to })),
        null,
        2
      )
    );
    console.log(
      'OUR_WORKS',
      JSON.stringify(
        [...workPlanById.values()].map((p) => ({
          id: p.id,
          field: 'images',
          from: p.from,
          to: p.to,
        })),
        null,
        2
      )
    );
    console.log(
      'RESUMES',
      JSON.stringify(
        resumePlan.map((p) => ({ id: p.id, field: p.field, from: p.from, to: p.to })),
        null,
        2
      )
    );

    // --- Upload images (verify before DB) ---
    for (const item of blogPlan) {
      const result = await uploadFile(
        supabase,
        IMAGE_BUCKET,
        item.localPath,
        item.to,
        { upsert: false }
      );
      if (result.status === 'uploaded') stats.blogs.uploaded++;
      else if (result.status === 'skipped_exists') stats.blogs.skipped++;
      else {
        stats.blogs.failed++;
        failures.push({ type: 'blogs', id: item.id, reason: result.error, path: item.to });
        item.ok = false;
        continue;
      }
      item.ok = true;
    }

    for (const entry of workPlanById.values()) {
      let allOk = true;
      for (const u of entry.uploads) {
        const result = await uploadFile(
          supabase,
          IMAGE_BUCKET,
          u.localPath,
          u.to,
          { upsert: false }
        );
        if (result.status === 'uploaded') stats.ourWorks.uploaded++;
        else if (result.status === 'skipped_exists') stats.ourWorks.skipped++;
        else {
          stats.ourWorks.failed++;
          failures.push({
            type: 'our-works',
            id: entry.id,
            reason: result.error,
            path: u.to,
          });
          allOk = false;
        }
      }
      entry.ok = allOk;
    }

    for (const item of resumePlan) {
      const result = await uploadFile(
        supabase,
        RESUME_BUCKET,
        item.localPath,
        item.to,
        { upsert: false }
      );
      if (result.status === 'uploaded') stats.resumes.uploaded++;
      else if (result.status === 'skipped_exists') stats.resumes.skipped++;
      else {
        stats.resumes.failed++;
        failures.push({
          type: 'resumes',
          id: item.id,
          reason: result.error,
          path: item.to,
        });
        item.ok = false;
        continue;
      }
      item.ok = true;
    }

    // --- Apply DB updates only for verified uploads ---
    console.log('\n=== APPLYING DATABASE PATH UPDATES ===');
    for (const item of blogPlan.filter((p) => p.ok)) {
      await prisma.blog.update({
        where: { id: item.id },
        data: { imageUrl: item.to },
      });
      stats.blogs.dbUpdated++;
    }

    for (const entry of [...workPlanById.values()].filter((e) => e.ok && e.to)) {
      await prisma.ourWork.update({
        where: { id: entry.id },
        data: { images: entry.to },
      });
      stats.ourWorks.dbUpdated++;
    }

    for (const item of resumePlan.filter((p) => p.ok)) {
      await prisma.jobApplication.update({
        where: { id: item.id },
        data: { resumeUrl: item.to },
      });
      stats.resumes.dbUpdated++;
    }

    // Confirm local files still present
    const localStillThere = {
      blogs: blogPlan.every((p) => fs.existsSync(p.localPath)),
      ourWorks: [...workPlanById.values()].every((e) =>
        e.uploads.every((u) => fs.existsSync(u.localPath))
      ),
      resumes: resumePlan.every((p) => fs.existsSync(p.localPath)),
    };

    console.log('\n=== TOTALS ===');
    console.log(JSON.stringify({ stats, localStillThere, failures }, null, 2));
  } catch (e) {
    console.error('MIGRATE_FAIL', redact(e.message));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})();
