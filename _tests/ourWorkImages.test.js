'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  makeFakePrisma,
  patchPrisma,
  makeFakeStorage,
} = require('./helpers/common');

const fakePrisma = patchPrisma(makeFakePrisma());

function seed() {
  fakePrisma._state.ourWorks = [
    {
      id: 'w1',
      title: 'Work',
      description: 'Description',
      category: 'App Development',
      websiteUrl: null,
      appStoreUrl: null,
      playStoreUrl: null,
      images: [
        'our-works/a.png',
        'our-works/b.jpg',
        '/uploads/our-works/c.jpg',
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

test.beforeEach(() => {
  seed();
});

const { OurWorkService } = require('../src/services/ourWorkService');
const { AppError } = require('../src/utils/AppError');

function baseCreateInput(overrides = {}) {
  return {
    title: 'New work',
    description: 'Desc',
    category: 'App Development',
    ...overrides,
  };
}

test('create preserves the submitted image order', async () => {
  const storage = makeFakeStorage({
    existing: ['our-works/1.png', 'our-works/2.jpg', 'our-works/3.webp'],
  });
  const service = new OurWorkService(storage);

  const work = await service.create(
    baseCreateInput({
      imageObjectPaths: ['our-works/3.webp', 'our-works/1.png', 'our-works/2.jpg'],
    })
  );

  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === work.id);
  assert.deepEqual(row.images, [
    'our-works/3.webp',
    'our-works/1.png',
    'our-works/2.jpg',
  ]);
});

test('create deduplicates repeated object paths', async () => {
  const storage = makeFakeStorage({
    existing: ['our-works/1.png', 'our-works/2.jpg'],
  });
  const service = new OurWorkService(storage);

  const work = await service.create(
    baseCreateInput({
      imageObjectPaths: ['our-works/1.png', 'our-works/1.png', 'our-works/2.jpg'],
    })
  );
  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === work.id);
  assert.deepEqual(row.images, ['our-works/1.png', 'our-works/2.jpg']);
});

test('create rejects paths from another feature, traversal and external URLs', async () => {
  const service = new OurWorkService(makeFakeStorage());
  for (const bad of [
    'blogs/x.png',
    'our-works/../x.png',
    '/uploads/our-works/x.png',
    'https://evil.com/x.png',
  ]) {
    await assert.rejects(
      () => service.create(baseCreateInput({ imageObjectPaths: [bad] })),
      (error) => error instanceof AppError && error.statusCode === 400
    );
  }
});

test('create enforces the five-image maximum', async () => {
  const paths = [1, 2, 3, 4, 5, 6].map((n) => `our-works/${n}.png`);
  const service = new OurWorkService(makeFakeStorage({ existing: paths }));

  await assert.rejects(
    () => service.create(baseCreateInput({ imageObjectPaths: paths })),
    (error) => error instanceof AppError && error.statusCode === 400
  );
});

test('update preserves existing images when no new paths are provided', async () => {
  const storage = makeFakeStorage();
  const service = new OurWorkService(storage);

  await service.update({ id: 'w1', title: 'Renamed' });

  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.deepEqual(row.images, [
    'our-works/a.png',
    'our-works/b.jpg',
    '/uploads/our-works/c.jpg',
  ]);
  assert.deepEqual(storage.deleted, []);
});

test('update appends new images after existing ones', async () => {
  const storage = makeFakeStorage({ existing: ['our-works/d.png'] });
  const service = new OurWorkService(storage);

  await service.update({
    id: 'w1',
    imageObjectPaths: ['our-works/d.png'],
  });

  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.deepEqual(row.images, [
    'our-works/a.png',
    'our-works/b.jpg',
    '/uploads/our-works/c.jpg',
    'our-works/d.png',
  ]);
});

test('update removes selected object paths only', async () => {
  const storage = makeFakeStorage();
  const service = new OurWorkService(storage);

  await service.update({
    id: 'w1',
    removeImages: ['our-works/b.jpg'],
  });

  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.deepEqual(row.images, ['our-works/a.png', '/uploads/our-works/c.jpg']);
  assert.deepEqual(storage.deleted, ['our-works/b.jpg']);
});

test('update can remove a legacy /uploads path without touching Supabase', async () => {
  const storage = makeFakeStorage();
  const service = new OurWorkService(storage);

  await service.update({
    id: 'w1',
    removeImages: ['/uploads/our-works/c.jpg'],
  });

  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.deepEqual(row.images, ['our-works/a.png', 'our-works/b.jpg']);
  assert.deepEqual(storage.deleted, ['/uploads/our-works/c.jpg']);
});

test('update can remove an image given as a Supabase public URL', async () => {
  const storage = makeFakeStorage();
  const service = new OurWorkService(storage);

  await service.update({
    id: 'w1',
    removeImages: [
      'https://proj.supabase.co/storage/v1/object/public/user-images/our-works/b.jpg',
    ],
  });

  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.deepEqual(row.images, ['our-works/a.png', '/uploads/our-works/c.jpg']);
  assert.deepEqual(storage.deleted, ['our-works/b.jpg']);
});

test('update rejects a final list larger than five images', async () => {
  const storage = makeFakeStorage({
    existing: ['our-works/d.png', 'our-works/e.png', 'our-works/f.png'],
  });
  const service = new OurWorkService(storage);

  await assert.rejects(
    () =>
      service.update({
        id: 'w1',
        imageObjectPaths: ['our-works/d.png', 'our-works/e.png', 'our-works/f.png'],
      }),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.equal(row.images.length, 3);
});

test('update rejects an invalid new path before writing', async () => {
  const storage = makeFakeStorage({ existing: ['blogs/x.png'] });
  const service = new OurWorkService(storage);

  await assert.rejects(
    () => service.update({ id: 'w1', imageObjectPaths: ['blogs/x.png'] }),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.deepEqual(row.images, [
    'our-works/a.png',
    'our-works/b.jpg',
    '/uploads/our-works/c.jpg',
  ]);
});

test('a failed DB update does not delete removed images', async () => {
  const storage = makeFakeStorage();
  const service = new OurWorkService(storage);

  const originalUpdate = fakePrisma.ourWork.update;
  fakePrisma.ourWork.update = async () => {
    throw new Error('db down');
  };

  try {
    await assert.rejects(() =>
      service.update({ id: 'w1', removeImages: ['our-works/b.jpg'] })
    );
  } finally {
    fakePrisma.ourWork.update = originalUpdate;
  }

  assert.deepEqual(storage.deleted, []);
  const row = fakePrisma._state.ourWorks.find((entry) => entry.id === 'w1');
  assert.deepEqual(row.images, [
    'our-works/a.png',
    'our-works/b.jpg',
    '/uploads/our-works/c.jpg',
  ]);
});
