#!/usr/bin/env node
/**
 * Option A: copy application data from local Docker Postgres → Supabase (DATABASE_URL).
 * - Does not DROP/CREATE schema (run `prisma migrate deploy` first)
 * - Does not disable FK constraints; loads JobPost before JobApplication
 * - Single interactive transaction on the target; fails closed on any error
 * - Never logs connection strings or passwords
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..');
const envPath = path.join(ROOT, '.env');
const parsed = require('dotenv').parse(fs.readFileSync(envPath));
for (const k of Object.keys(parsed)) process.env[k] = parsed[k];

const EXPECTED = {
  Admin: 2,
  blogs: 5,
  JobPost: 4,
  JobApplication: 5,
  ContactSubmission: 4,
  ClientReview: 4,
  our_works: 7,
};

const LOCAL_URL =
  process.env.LOCAL_DATABASE_URL ||
  'postgresql://logixmart:Password%40123@localhost:5433/logixmart?schema=public';

function redact(msg) {
  return String(msg || '')
    .replace(/postgresql:\/\/[^\s"'`]+/gi, 'postgresql://***')
    .slice(0, 400);
}

function urlMeta(url) {
  const body = String(url).replace(/^postgresql:\/\//i, '');
  const slash = body.indexOf('/');
  const authority = slash === -1 ? body : body.slice(0, slash);
  const lastAt = authority.lastIndexOf('@');
  const user = authority.slice(0, authority.indexOf(':'));
  const hostport = authority.slice(lastAt + 1);
  const host = hostport.includes(':') ? hostport.slice(0, hostport.lastIndexOf(':')) : hostport;
  const port = hostport.includes(':') ? hostport.slice(hostport.lastIndexOf(':') + 1) : '5432';
  const database = (slash === -1 ? '' : body.slice(slash + 1)).split('?')[0];
  return { user, host, port, database };
}

function assertTargetIsSupabase(url) {
  const m = urlMeta(url);
  const isLocal = m.host === 'localhost' || m.host === '127.0.0.1';
  const isSupabase = m.host.includes('supabase.com') || m.host.includes('supabase.co');
  if (!isSupabase || isLocal) {
    throw new Error(
      `Refusing to load: DATABASE_URL host is not Supabase (got host=${m.host}).`,
    );
  }
  return m;
}

function assertLocalIsDocker(url) {
  const m = urlMeta(url);
  if (!(m.host === 'localhost' || m.host === '127.0.0.1') || m.port !== '5433') {
    throw new Error(
      `Refusing to read source: LOCAL_DATABASE_URL must be localhost:5433 (got ${m.host}:${m.port}).`,
    );
  }
  return m;
}

async function countAll(client) {
  const [Admin, blogs, JobPost, JobApplication, ContactSubmission, ClientReview, our_works] =
    await Promise.all([
      client.admin.count(),
      client.blog.count(),
      client.jobPost.count(),
      client.jobApplication.count(),
      client.contactSubmission.count(),
      client.clientReview.count(),
      client.ourWork.count(),
    ]);
  return { Admin, blogs, JobPost, JobApplication, ContactSubmission, ClientReview, our_works };
}

function assertCounts(label, counts) {
  const mismatches = [];
  for (const [k, v] of Object.entries(EXPECTED)) {
    if (counts[k] !== v) mismatches.push(`${k}: got ${counts[k]}, expected ${v}`);
  }
  if (mismatches.length) {
    throw new Error(`${label} count mismatch:\n` + mismatches.join('\n'));
  }
}

(async () => {
  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) throw new Error('DATABASE_URL is missing');

  const targetMeta = assertTargetIsSupabase(targetUrl);
  const localMeta = assertLocalIsDocker(LOCAL_URL);
  console.log(
    JSON.stringify({
      phase: 'preflight',
      source: localMeta,
      target: targetMeta,
      expected: EXPECTED,
    }),
  );

  const local = new PrismaClient({
    datasources: { db: { url: LOCAL_URL } },
    log: [],
  });
  const remote = new PrismaClient({
    datasources: { db: { url: targetUrl } },
    log: [],
  });

  try {
    const sourceCounts = await countAll(local);
    console.log('SOURCE_COUNTS', JSON.stringify(sourceCounts));
    assertCounts('local Docker', sourceCounts);

    const targetBefore = await countAll(remote).catch((e) => {
      throw new Error(
        `Target schema missing or unreachable (run prisma migrate deploy first): ${redact(e.message)}`,
      );
    });
    console.log('TARGET_BEFORE', JSON.stringify(targetBefore));
    const nonEmpty = Object.entries(targetBefore).filter(([, n]) => n > 0);
    if (nonEmpty.length) {
      throw new Error(
        `Refusing to load: target already has rows (${nonEmpty
          .map(([k, n]) => `${k}=${n}`)
          .join(', ')}).`,
      );
    }

    // FK-safe order: parents before JobApplication
    const [
      admins,
      reviews,
      contacts,
      jobs,
      blogs,
      works,
      apps,
    ] = await Promise.all([
      local.admin.findMany(),
      local.clientReview.findMany(),
      local.contactSubmission.findMany(),
      local.jobPost.findMany(),
      local.blog.findMany(),
      local.ourWork.findMany(),
      local.jobApplication.findMany(),
    ]);

    const orphanApps = apps.filter((a) => !jobs.some((j) => j.id === a.jobId));
    if (orphanApps.length) {
      throw new Error(
        `Source FK orphan JobApplication rows: ${orphanApps.map((a) => a.id).join(', ')}`,
      );
    }

    await remote.$transaction(
      async (tx) => {
        if (admins.length) await tx.admin.createMany({ data: admins });
        if (reviews.length) await tx.clientReview.createMany({ data: reviews });
        if (contacts.length) await tx.contactSubmission.createMany({ data: contacts });
        if (jobs.length) await tx.jobPost.createMany({ data: jobs });
        if (blogs.length) await tx.blog.createMany({ data: blogs });
        if (works.length) await tx.ourWork.createMany({ data: works });
        if (apps.length) await tx.jobApplication.createMany({ data: apps });
      },
      { maxWait: 10000, timeout: 60000 },
    );

    const targetAfter = await countAll(remote);
    console.log('TARGET_AFTER', JSON.stringify(targetAfter));
    assertCounts('Supabase after load', targetAfter);

    const fkCheck = await remote.$queryRaw`
      SELECT ja.id AS app_id
      FROM "JobApplication" ja
      LEFT JOIN "JobPost" jp ON jp.id = ja."jobId"
      WHERE jp.id IS NULL`;
    if (fkCheck.length) {
      throw new Error(`FK check failed after load: ${fkCheck.length} orphan application(s)`);
    }
    console.log('FK_CHECK_OK', true);

    const migs = await remote.$queryRaw`
      SELECT COUNT(*)::int AS n FROM "_prisma_migrations"`;
    console.log('PRISMA_MIGRATIONS_COUNT', migs[0].n);

    console.log('LOAD_OK');
  } catch (e) {
    console.error('LOAD_FAIL', redact(e.message));
    process.exitCode = 1;
  } finally {
    await Promise.all([local.$disconnect(), remote.$disconnect()]);
  }
})();
