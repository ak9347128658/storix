import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageClient } from '../../core/StorageClient.js';
import type { IStorageProvider } from '../../types/index.js';

function makeMockProvider(): IStorageProvider {
  return {
    providerName: 'mock',
    upload: vi.fn().mockResolvedValue({ key: 'test.png', url: 'https://example.com/test.png', provider: 'mock' }),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
    getMetadata: vi.fn().mockResolvedValue({
      key: 'test.png',
      size: 1000,
      contentType: 'image/png',
      lastModified: new Date(),
    }),
    list: vi.fn().mockResolvedValue({ files: [] }),
    getUrl: vi.fn().mockResolvedValue('https://example.com/test.png'),
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example.com/test.png?sig=x'),
    copy: vi.fn().mockResolvedValue({ key: 'copy.png', url: 'https://example.com/copy.png', provider: 'mock' }),
    move: vi.fn().mockResolvedValue({ key: 'moved.png', url: 'https://example.com/moved.png', provider: 'mock' }),
    rename: vi.fn().mockResolvedValue({ key: 'renamed.png', url: 'https://example.com/renamed.png', provider: 'mock' }),
    getStream: vi.fn().mockResolvedValue({ pipe: vi.fn() }),
    getBuffer: vi.fn().mockResolvedValue(Buffer.from('hello')),
    createMultipartUpload: vi.fn().mockResolvedValue({ uploadId: 'id1', key: 'large.bin' }),
    uploadPart: vi.fn().mockResolvedValue({ partNumber: 1, etag: 'e1' }),
    completeMultipartUpload: vi.fn().mockResolvedValue({ key: 'large.bin', url: 'https://example.com/large.bin', provider: 'mock' }),
    abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
    listParts: vi.fn().mockResolvedValue([]),
  };
}

describe('StorageClient', () => {
  let provider: IStorageProvider;
  let client: StorageClient;

  beforeEach(() => {
    provider = makeMockProvider();
    client = new StorageClient(provider);
  });

  it('exposes the provider name', () => {
    expect(client.providerName).toBe('mock');
  });

  describe('upload()', () => {
    it('delegates to provider.upload', async () => {
      const result = await client.upload({ key: 'test.png', file: Buffer.from('data') });
      expect(result.key).toBe('test.png');
      expect(provider.upload).toHaveBeenCalledOnce();
    });

    it('fires before:upload and after:upload hooks', async () => {
      const before = vi.fn();
      const after = vi.fn();
      client.on('before:upload', before);
      client.on('after:upload', after);

      await client.upload({ key: 'img.png', file: Buffer.from('') });

      expect(before).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });
  });

  describe('delete()', () => {
    it('delegates to provider.delete', async () => {
      await client.delete({ key: 'test.png' });
      expect(provider.delete).toHaveBeenCalledWith({ key: 'test.png' });
    });

    it('fires before:delete and after:delete hooks', async () => {
      const before = vi.fn();
      const after = vi.fn();
      client.on('before:delete', before);
      client.on('after:delete', after);

      await client.delete({ key: 'test.png' });
      expect(before).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });
  });

  describe('middleware', () => {
    it('middleware can augment upload metadata', async () => {
      client.use(async (ctx, next) => {
        ctx.options = { ...ctx.options, metadata: { ...ctx.options.metadata, tagged: 'true' } };
        await next();
      });

      await client.upload({ key: 'file.txt', file: Buffer.from('x') });

      const uploadCall = vi.mocked(provider.upload).mock.calls[0]?.[0];
      expect(uploadCall?.metadata).toMatchObject({ tagged: 'true' });
    });

    it('use() is chainable', () => {
      const result = client.use(async (_ctx, next) => next());
      expect(result).toBe(client);
    });
  });

  describe('getSignedUrl()', () => {
    it('fires before:getSignedUrl and after:getSignedUrl hooks', async () => {
      const before = vi.fn();
      const after = vi.fn();
      client.on('before:getSignedUrl', before);
      client.on('after:getSignedUrl', after);

      const url = await client.getSignedUrl('private.pdf', { expiresIn: 3600 });
      expect(url).toBe('https://signed.example.com/test.png?sig=x');
      expect(before).toHaveBeenCalledWith({ key: 'private.pdf', expiresIn: 3600 });
      expect(after).toHaveBeenCalledWith({ key: 'private.pdf', url: 'https://signed.example.com/test.png?sig=x' });
    });
  });

  describe('exists()', () => {
    it('delegates to provider.exists', async () => {
      const result = await client.exists('file.png');
      expect(result).toBe(true);
    });
  });

  describe('list()', () => {
    it('fires list hooks', async () => {
      const before = vi.fn();
      const after = vi.fn();
      client.on('before:list', before);
      client.on('after:list', after);

      await client.list({ prefix: 'images/' });
      expect(before).toHaveBeenCalledWith({ prefix: 'images/' });
      expect(after).toHaveBeenCalledOnce();
    });
  });

  describe('copy() / move()', () => {
    it('copy fires copy hooks', async () => {
      const before = vi.fn();
      const after = vi.fn();
      client.on('before:copy', before);
      client.on('after:copy', after);

      await client.copy({ sourceKey: 'a.png', destinationKey: 'b.png' });
      expect(before).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });

    it('move fires move hooks', async () => {
      const before = vi.fn();
      const after = vi.fn();
      client.on('before:move', before);
      client.on('after:move', after);

      await client.move({ sourceKey: 'a.png', destinationKey: 'b.png' });
      expect(before).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });
  });
});
