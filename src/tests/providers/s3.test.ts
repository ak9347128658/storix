import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Provider } from '../../providers/s3/S3Provider.js';
import { FileNotFoundError } from '../../errors/index.js';

// ---------------------------------------------------------------------------
// Build a minimal fake S3Client — no SDK required
// ---------------------------------------------------------------------------

const mockSend = vi.fn();

const fakeS3Client = {
  send: mockSend,
  config: { region: 'us-east-1' },
};

// Mock the SDK modules so dynamic `import('@aws-sdk/client-s3')` calls in the
// provider methods return lightweight command stubs.
vi.mock('@aws-sdk/client-s3', () => {
  class NotFound extends Error {
    constructor() { super('NotFound'); this.name = 'NotFound'; }
  }
  return {
    S3Client: vi.fn(),
    PutObjectCommand: vi.fn((args: unknown) => ({ _tag: 'Put', args })),
    GetObjectCommand: vi.fn((args: unknown) => ({ _tag: 'Get', args })),
    DeleteObjectCommand: vi.fn((args: unknown) => ({ _tag: 'Delete', args })),
    HeadObjectCommand: vi.fn((args: unknown) => ({ _tag: 'Head', args })),
    ListObjectsV2Command: vi.fn((args: unknown) => ({ _tag: 'List', args })),
    CopyObjectCommand: vi.fn((args: unknown) => ({ _tag: 'Copy', args })),
    CreateMultipartUploadCommand: vi.fn((args: unknown) => ({ _tag: 'CreateMP', args })),
    UploadPartCommand: vi.fn((args: unknown) => ({ _tag: 'Part', args })),
    CompleteMultipartUploadCommand: vi.fn((args: unknown) => ({ _tag: 'Complete', args })),
    AbortMultipartUploadCommand: vi.fn((args: unknown) => ({ _tag: 'Abort', args })),
    ListPartsCommand: vi.fn((args: unknown) => ({ _tag: 'ListParts', args })),
    NotFound,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.url/key?sig=abc'),
}));

// ---------------------------------------------------------------------------

const CREDENTIALS = {
  accessKeyId: 'AKID',
  secretAccessKey: 'SECRET',
  region: 'us-east-1',
  bucket: 'my-bucket',
};

function makeProvider(): S3Provider {
  return new S3Provider(CREDENTIALS, {
    logLevel: 'silent',
    retryConfig: { maxRetries: 0 },
    _client: fakeS3Client as unknown as import('@aws-sdk/client-s3').S3Client,
  });
}

describe('S3Provider', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('upload()', () => {
    it('calls PutObjectCommand and returns upload result', async () => {
      const provider = makeProvider();
      mockSend.mockResolvedValue({});

      const result = await provider.upload({
        key: 'images/photo.jpg',
        file: Buffer.from('data'),
        contentType: 'image/jpeg',
        visibility: 'public',
      });

      expect(result.key).toBe('images/photo.jpg');
      expect(result.provider).toBe('s3');
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('auto-detects MIME type when contentType is omitted', async () => {
      const provider = makeProvider();
      mockSend.mockResolvedValue({});

      const result = await provider.upload({ key: 'doc.pdf', file: Buffer.from('') });
      expect(result.contentType).toBe('application/pdf');
    });
  });

  describe('delete()', () => {
    it('delegates to DeleteObjectCommand', async () => {
      const provider = makeProvider();
      mockSend.mockResolvedValue({});

      await provider.delete({ key: 'old.jpg' });
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('exists()', () => {
    it('returns true when HeadObject succeeds', async () => {
      const provider = makeProvider();
      mockSend.mockResolvedValue({
        ContentLength: 100,
        ContentType: 'image/png',
        LastModified: new Date(),
        ETag: '"abc"',
      });

      expect(await provider.exists('file.png')).toBe(true);
    });

    it('returns false when HeadObject throws NotFound', async () => {
      const provider = makeProvider();
      class NotFound extends Error {
        constructor() { super('NotFound'); this.name = 'NotFound'; }
      }
      mockSend.mockRejectedValue(new NotFound());

      expect(await provider.exists('missing.png')).toBe(false);
    });
  });

  describe('getMetadata()', () => {
    it('maps HeadObject response to FileMetadata', async () => {
      const provider = makeProvider();
      const lastModified = new Date('2024-01-01');
      mockSend.mockResolvedValue({
        ContentLength: 1024,
        ContentType: 'image/png',
        LastModified: lastModified,
        ETag: '"deadbeef"',
        Metadata: { author: 'test' },
      });

      const meta = await provider.getMetadata('photo.png');
      expect(meta.size).toBe(1024);
      expect(meta.contentType).toBe('image/png');
      expect(meta.lastModified).toEqual(lastModified);
      expect(meta.etag).toBe('deadbeef');
      expect(meta.metadata).toEqual({ author: 'test' });
    });

    it('throws FileNotFoundError when object is missing', async () => {
      const provider = makeProvider();
      class NotFound extends Error {
        constructor() { super('NotFound'); this.name = 'NotFound'; }
      }
      mockSend.mockRejectedValue(new NotFound());

      await expect(provider.getMetadata('ghost.png')).rejects.toBeInstanceOf(FileNotFoundError);
    });
  });

  describe('list()', () => {
    it('maps ListObjectsV2 response to ListResult', async () => {
      const provider = makeProvider();
      mockSend.mockResolvedValue({
        Contents: [
          { Key: 'a.png', Size: 100, LastModified: new Date(), ETag: '"e1"' },
          { Key: 'b.png', Size: 200, LastModified: new Date(), ETag: '"e2"' },
        ],
        NextContinuationToken: 'token123',
      });

      const result = await provider.list({ prefix: 'images/' });
      expect(result.files).toHaveLength(2);
      expect(result.files[0]?.key).toBe('a.png');
      expect(result.nextCursor).toBe('token123');
    });
  });

  describe('getSignedUrl()', () => {
    it('returns a presigned GET URL', async () => {
      const provider = makeProvider();
      const url = await provider.getSignedUrl('private.pdf', { expiresIn: 900 });
      expect(url).toBe('https://signed.url/key?sig=abc');
    });

    it('generates a presigned PUT URL', async () => {
      const provider = makeProvider();
      const url = await provider.getSignedUrl('uploads/new.png', {
        method: 'PUT',
        contentType: 'image/png',
        expiresIn: 300,
      });
      expect(url).toBe('https://signed.url/key?sig=abc');
    });
  });

  describe('copy()', () => {
    it('calls CopyObjectCommand and returns result', async () => {
      const provider = makeProvider();
      mockSend.mockResolvedValue({});

      const result = await provider.copy({
        sourceKey: 'original.png',
        destinationKey: 'copy.png',
      });

      expect(result.key).toBe('copy.png');
      expect(result.provider).toBe('s3');
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('move()', () => {
    it('copies then deletes source (2 send calls)', async () => {
      const provider = makeProvider();
      mockSend.mockResolvedValue({});

      const result = await provider.move({
        sourceKey: 'old.png',
        destinationKey: 'new.png',
      });

      expect(result.key).toBe('new.png');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('multipart upload', () => {
    it('completes a full multipart upload lifecycle', async () => {
      const provider = makeProvider();

      mockSend
        .mockResolvedValueOnce({ UploadId: 'upload-123' })
        .mockResolvedValueOnce({ ETag: '"part-etag-1"' })
        .mockResolvedValueOnce({ ETag: '"part-etag-2"' })
        .mockResolvedValueOnce({});

      const session = await provider.createMultipartUpload('large.bin', 'application/octet-stream');
      expect(session.uploadId).toBe('upload-123');

      const part1 = await provider.uploadPart({
        uploadId: session.uploadId,
        key: session.key,
        partNumber: 1,
        body: Buffer.alloc(5 * 1024 * 1024),
      });
      const part2 = await provider.uploadPart({
        uploadId: session.uploadId,
        key: session.key,
        partNumber: 2,
        body: Buffer.alloc(1024),
      });

      const result = await provider.completeMultipartUpload(session, [part1, part2]);
      expect(result.key).toBe('large.bin');
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it('aborts a multipart upload', async () => {
      const provider = makeProvider();
      mockSend
        .mockResolvedValueOnce({ UploadId: 'abort-id' })
        .mockResolvedValueOnce({});

      const session = await provider.createMultipartUpload('huge.bin');
      await provider.abortMultipartUpload(session);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
