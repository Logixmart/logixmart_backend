'use strict';

require('ts-node/register/transpile-only');

const jwt = require('jsonwebtoken');

/**
 * Replace the server-side Supabase client accessor so no network calls are
 * made. Storage methods return deterministic, credential-free values.
 */
function patchSupabaseClient(options = {}) {
  const supabaseModule = require('../../src/config/supabase');
  const calls = {
    signedPaths: [],
    signedResumePaths: [],
    removals: [],
    resumeRemovals: [],
    lists: [],
    resumeLists: [],
  };

  const client = {
    storage: {
      from: (bucket) => {
        if (bucket === 'private-resumes') {
          return {
            createSignedUploadUrl: async (objectPath) => {
              calls.signedResumePaths.push({ bucket, objectPath });
              if (options.signedResumeUploadError) {
                return { data: null, error: { message: 'boom' } };
              }
              return {
                data: {
                  signedUrl: `https://signed.invalid/${objectPath}?token=tok`,
                  token: 'signed-token',
                  path: objectPath,
                },
                error: null,
              };
            },
            list: async (dir, opts) => {
              calls.resumeLists.push({ bucket, dir, opts });
              const names = options.existingResumeObjects || [];
              const name = opts && opts.search;
              const filtered = names.filter((entry) =>
                name ? entry.name === name : true
              );
              return {
                data: filtered.map((entry) => ({
                  name: entry.name,
                  metadata: {
                    size: entry.size ?? 123456,
                    mimetype: entry.mimetype,
                  },
                })),
                error: null,
              };
            },
            remove: async (paths) => {
              calls.resumeRemovals.push({ bucket, paths });
              return { data: null, error: null };
            },
            upload: async (objectPath, _body, opts) => {
              calls.resumeUploads = calls.resumeUploads || [];
              calls.resumeUploads.push({ bucket, objectPath, opts });
              if (options.resumeUploadError) {
                return { data: null, error: { message: 'upload failed' } };
              }
              return { data: { path: objectPath }, error: null };
            },
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
            download: async () => {
              if (options.resumeDownloadError) {
                return { data: null, error: { message: 'not found' } };
              }
              const buffer = Buffer.from('dummy');
              return {
                data: {
                  arrayBuffer: async () => buffer.buffer.slice(
                    buffer.byteOffset,
                    buffer.byteOffset + buffer.byteLength
                  ),
                },
                error: null,
              };
            },
          };
        }
        return {
          createSignedUploadUrl: async (objectPath) => {
            calls.signedPaths.push({ bucket, objectPath });
            if (options.signedUploadError) {
              return { data: null, error: { message: 'boom' } };
            }
            return {
              data: {
                signedUrl: `https://signed.invalid/${objectPath}?token=tok`,
                token: 'signed-token',
                path: objectPath,
              },
              error: null,
            };
          },
          list: async (dir, opts) => {
            calls.lists.push({ bucket, dir, opts });
            const names = options.existingObjects || [];
            const name = opts && opts.search;
            return {
              data: names
                .filter((entry) => (name ? entry === name : true))
                .map((entry) => ({ name: entry })),
              error: null,
            };
          },
          remove: async (paths) => {
            calls.removals.push({ bucket, paths });
            return { data: null, error: null };
          },
          getPublicUrl: (objectPath) => ({
            data: { publicUrl: `https://cdn.invalid/${objectPath}` },
          }),
        };
      },
    },
  };

  supabaseModule.getSupabaseClient = () => client;
  return { calls, client };
}

/**
 * Replace the Nodemailer transport accessor with an in-memory fake so tests
 * never open an SMTP connection or send real email.
 *   options.disabled -> getMailTransport() returns null (SMTP unconfigured)
 *   options.fail     -> sendMail() throws (SMTP delivery error)
 */
function patchMailTransport(options = {}) {
  const mailModule = require('../../src/services/mail/mailTransport');
  const sent = [];

  if (options.disabled) {
    mailModule.getMailTransport = () => null;
    return { sent, transport: null };
  }

  const transport = {
    sendMail: async (message) => {
      if (options.fail) {
        throw new Error('smtp down');
      }
      sent.push(message);
      return { messageId: `msg-${sent.length}` };
    },
    verify: async () => {
      if (options.fail) {
        throw new Error('smtp down');
      }
      return true;
    },
  };

  mailModule.getMailTransport = () => transport;
  return { sent, transport };
}

function makeAdminToken(overrides = {}) {  const { config } = require('../../src/config');
  const payload = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'ADMIN',
    ...overrides,
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
}

async function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => server.close(() => done())),
      });
    });
  });
}

/** Minimal in-memory Prisma stand-in for Blog and OurWork. */
function makeFakePrisma(seed = {}) {
  const state = {
    blogs: (seed.blogs || []).map((blog) => ({
      createdAt: new Date(),
      updatedAt: new Date(),
      ...blog,
    })),
    ourWorks: (seed.ourWorks || []).map((work) => ({
      createdAt: new Date(),
      updatedAt: new Date(),
      ...work,
    })),
  };
  let counter = 0;

  function id(prefix) {
    counter += 1;
    return `${prefix}-${counter}`;
  }

  const prisma = {
    _state: state,
    blog: {
      findUnique: async ({ where }) =>
        state.blogs.find((blog) => blog.id === where.id) || null,
      findFirst: async ({ where }) =>
        state.blogs.find((blog) => blog.id === where.id) || null,
      create: async ({ data }) => {
        const row = {
          id: id('blog'),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.blogs.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.blogs.find((blog) => blog.id === where.id);
        if (!row) {
          throw new Error('blog not found');
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      delete: async ({ where }) => {
        const idx = state.blogs.findIndex((blog) => blog.id === where.id);
        const [removed] = state.blogs.splice(idx, 1);
        return removed;
      },
    },
    ourWork: {
      findUnique: async ({ where }) =>
        state.ourWorks.find((work) => work.id === where.id) || null,
      findFirst: async ({ where }) =>
        state.ourWorks.find((work) => work.id === where.id) || null,
      create: async ({ data }) => {
        const row = {
          id: id('work'),
          websiteUrl: null,
          appStoreUrl: null,
          playStoreUrl: null,
          images: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.ourWorks.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.ourWorks.find((work) => work.id === where.id);
        if (!row) {
          throw new Error('our work not found');
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      delete: async ({ where }) => {
        const idx = state.ourWorks.findIndex((work) => work.id === where.id);
        const [removed] = state.ourWorks.splice(idx, 1);
        return removed;
      },
    },
  };

  return prisma;
}

/** Inject a fake Prisma default export; must run before importing services. */
function patchPrisma(fake) {
  const prismaModule = require('../../src/lib/prisma');
  prismaModule.default = fake;
  return fake;
}

function makeFakeStorage({ existing = [] } = {}) {
  const existingSet = new Set(existing);
  const deleted = [];
  const persisted = [];
  return {
    deleted,
    persisted,
    exists: async (path) => existingSet.has(path),
    deleteIfExists: async (path) => {
      if (path) {
        deleted.push(path);
      }
    },
    getPublicUrl: (path) =>
      !path
        ? ''
        : path.startsWith('http')
        ? path
        : `https://cdn.invalid/${path}`,
    publicPathForFilename: (filename, folder = 'blogs') =>
      `${folder}/${filename}`,
    persistLocalUpload: async (_localPath, filename, folder = 'blogs') => {
      persisted.push({ filename, folder });
      return `${folder}/${filename}`;
    },
  };
}

module.exports = {
  patchSupabaseClient,
  patchMailTransport,
  makeAdminToken,
  startServer,
  makeFakePrisma,
  patchPrisma,
  makeFakeStorage,
};
