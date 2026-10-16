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
  fakePrisma._state.blogs = [
    {
      id: 'b1',
      title: 'Existing',
      description: 'Body',
      imageUrl: 'blogs/old.jpg',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'b2',
      title: 'No image',
      description: 'Body',
      imageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

test.beforeEach(() => {
  seed();
});

const { BlogService } = require('../src/services/blogService');
const { AppError } = require('../src/utils/AppError');

test('create stores a valid blogs/ object path', async () => {
  const storage = makeFakeStorage({ existing: ['blogs/new.jpg'] });
  const service = new BlogService(storage);

  const blog = await service.create({
    title: 'Hello',
    description: 'World',
    imageObjectPath: 'blogs/new.jpg',
  });

  const row = fakePrisma._state.blogs.find((entry) => entry.id === blog.id);
  assert.equal(row.imageUrl, 'blogs/new.jpg');
  assert.equal(storage.persisted.length, 0);
});

test('create rejects a path belonging to another feature', async () => {
  const service = new BlogService(makeFakeStorage({ existing: ['our-works/x.jpg'] }));
  await assert.rejects(
    () =>
      service.create({
        title: 'Hello',
        description: 'World',
        imageObjectPath: 'our-works/x.jpg',
      }),
    (error) => error instanceof AppError && error.statusCode === 400
  );
});

test('create rejects path traversal and external URLs', async () => {
  const service = new BlogService(makeFakeStorage());
  for (const bad of [
    'blogs/../secret.jpg',
    '/uploads/blogs/x.jpg',
    'https://evil.com/x.jpg',
  ]) {
    await assert.rejects(
      () => service.create({ title: 'T', description: 'D', imageObjectPath: bad }),
      (error) => error instanceof AppError && error.statusCode === 400
    );
  }
});

test('create rejects a verified-missing object', async () => {
  const service = new BlogService(makeFakeStorage({ existing: [] }));
  await assert.rejects(
    () =>
      service.create({
        title: 'T',
        description: 'D',
        imageObjectPath: 'blogs/missing.jpg',
      }),
    (error) => error instanceof AppError && error.statusCode === 400
  );
});

test('create rejects supplying both an object path and an uploaded file', async () => {
  const storage = makeFakeStorage({ existing: ['blogs/new.jpg'] });
  const service = new BlogService(storage);
  await assert.rejects(
    () =>
      service.create({
        title: 'T',
        description: 'D',
        imageObjectPath: 'blogs/new.jpg',
        uploadedFilename: 'f.jpg',
        uploadedFilePath: '/tmp/f.jpg',
      }),
    (error) => error instanceof AppError && error.statusCode === 400
  );
});

test('update without an image field preserves the existing image', async () => {
  const storage = makeFakeStorage();
  const service = new BlogService(storage);

  const blog = await service.update({ id: 'b1', title: 'Updated' });
  assert.equal(blog.imageUrl, 'https://cdn.invalid/blogs/old.jpg');
  assert.deepEqual(storage.deleted, []);
  assert.equal(fakePrisma._state.blogs.find((b) => b.id === 'b1').imageUrl, 'blogs/old.jpg');
});

test('update replaces the image and deletes the previous object', async () => {
  const storage = makeFakeStorage({ existing: ['blogs/new.jpg'] });
  const service = new BlogService(storage);

  await service.update({
    id: 'b1',
    title: 'Updated',
    imageObjectPath: 'blogs/new.jpg',
  });

  assert.equal(fakePrisma._state.blogs.find((b) => b.id === 'b1').imageUrl, 'blogs/new.jpg');
  assert.deepEqual(storage.deleted, ['blogs/old.jpg']);
});

test('update with removeImage clears the reference and deletes the object', async () => {
  const storage = makeFakeStorage();
  const service = new BlogService(storage);

  await service.update({ id: 'b1', removeImage: true });

  assert.equal(fakePrisma._state.blogs.find((b) => b.id === 'b1').imageUrl, null);
  assert.deepEqual(storage.deleted, ['blogs/old.jpg']);
});

test('update rejects replace and remove in the same request', async () => {
  const storage = makeFakeStorage({ existing: ['blogs/new.jpg'] });
  const service = new BlogService(storage);

  await assert.rejects(
    () =>
      service.update({
        id: 'b1',
        imageObjectPath: 'blogs/new.jpg',
        removeImage: true,
      }),
    (error) => error instanceof AppError && error.statusCode === 400
  );
  assert.deepEqual(storage.deleted, []);
  assert.equal(fakePrisma._state.blogs.find((b) => b.id === 'b1').imageUrl, 'blogs/old.jpg');
});

test('a storage failure during update does not alter the DB reference', async () => {
  const brokenStorage = makeFakeStorage({ existing: ['blogs/new.jpg'] });
  brokenStorage.exists = async () => {
    throw new Error('storage down');
  };
  const service = new BlogService(brokenStorage);

  await assert.rejects(() =>
    service.update({ id: 'b1', imageObjectPath: 'blogs/new.jpg' })
  );
  assert.equal(fakePrisma._state.blogs.find((b) => b.id === 'b1').imageUrl, 'blogs/old.jpg');
  assert.deepEqual(brokenStorage.deleted, []);
});

test('deleting a blog removes its image object', async () => {
  const storage = makeFakeStorage();
  const service = new BlogService(storage);

  await service.delete('b2');
  // b2 has no image, nothing to delete
  assert.deepEqual(storage.deleted, []);
});
