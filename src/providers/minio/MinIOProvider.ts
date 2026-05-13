import { Readable } from 'node:stream';
import type {
  CopyOptions,
  FileListEntry,
  FileMetadata,
  ListOptions,
  ListResult,
  LogLevel,
  MinIOCredentials,
  MultipartPartResult,
  MultipartUploadSession,
  RetryConfig,
  SignedUrlOptions,
  UploadOptions,
  UploadPartOptions,
  UploadResult,
  Visibility,
} from '../../types/index.js';
import { BaseProvider } from '../../core/BaseProvider.js';
import { FileNotFoundError, MultipartUploadError, ProviderError } from '../../errors/index.js';
import { toReadable, streamToBuffer } from '../../utils/index.js';

type MinioClient = import('minio').Client;

/** MinIO (and MinIO-compatible) storage provider using the official `minio` SDK. */
export class MinIOProvider extends BaseProvider {
  public readonly providerName = 'minio';

  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;
  private readonly endPoint: string;
  private readonly useSSL: boolean;
  private readonly port: number;

  constructor(
    credentials: MinIOCredentials,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      logLevel?: LogLevel;
      defaultVisibility?: Visibility;
    },
  ) {
    super(options ?? {});
    this.bucket = credentials.bucket;
    this.cdnUrl = credentials.cdnUrl;
    this.customDomain = credentials.customDomain;
    this.endPoint = credentials.endPoint;
    this.useSSL = credentials.useSSL ?? true;
    this.port = credentials.port ?? (this.useSSL ? 443 : 80);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('minio') as typeof import('minio');

    this.client = new Client({
      endPoint: credentials.endPoint,
      port: credentials.port,
      useSSL: credentials.useSSL ?? true,
      accessKey: credentials.accessKey,
      secretKey: credentials.secretKey,
      region: credentials.region,
    });
  }

  private buildPublicUrl(key: string): string {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${key}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    const scheme = this.useSSL ? 'https' : 'http';
    const portStr = (this.useSSL && this.port === 443) || (!this.useSSL && this.port === 80) ? '' : `:${this.port}`;
    return `${scheme}://${this.endPoint}${portStr}/${this.bucket}/${key}`;
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const buffer = await streamToBuffer(toReadable(options.file));
    const visibility = this.resolveVisibility(options.visibility);

    await this.client.putObject(this.bucket, options.key, buffer, buffer.byteLength, {
      'Content-Type': options.contentType ?? 'application/octet-stream',
      ...options.metadata,
    });

    if (visibility === 'public') {
      // MinIO ACL is set at bucket level; set per-object policy via tagging if needed.
    }

    return {
      key: options.key,
      url: this.buildPublicUrl(options.key),
      size: buffer.byteLength,
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doDelete(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (error) {
      throw new ProviderError(`Failed to delete "${key}"`, this.providerName, error);
    }
  }

  protected async doExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  protected async doGetMetadata(key: string): Promise<FileMetadata> {
    try {
      const stat = await this.client.statObject(this.bucket, key);
      return {
        key,
        size: stat.size,
        contentType: stat.metaData?.['content-type'] ?? 'application/octet-stream',
        lastModified: stat.lastModified,
        etag: stat.etag.replace(/"/g, ''),
        metadata: stat.metaData as Record<string, string>,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        throw new FileNotFoundError(key, this.providerName, error);
      }
      throw new ProviderError(`Failed to get metadata for "${key}"`, this.providerName, error);
    }
  }

  protected async doList(options?: ListOptions): Promise<ListResult> {
    return new Promise((resolve, reject) => {
      const files: FileListEntry[] = [];
      const stream = this.client.listObjectsV2(
        this.bucket,
        options?.prefix ?? '',
        true,
        options?.cursor,
      );

      let count = 0;
      const limit = options?.limit ?? Infinity;

      stream.on('data', (obj: { name?: string; prefix?: string; size?: number; lastModified?: Date; etag?: string }) => {
        if (!obj.name) return; // skip prefix/directory entries
        if (count >= limit) {
          stream.destroy();
          return;
        }
        files.push({
          key: obj.name,
          size: obj.size ?? 0,
          lastModified: obj.lastModified ?? new Date(),
          etag: obj.etag?.replace(/"/g, ''),
        });
        count++;
      });

      stream.on('end', () => resolve({ files }));
      stream.on('error', (err) => reject(new ProviderError('List failed', this.providerName, err)));
    });
  }

  protected doGetUrl(key: string): Promise<string> {
    return Promise.resolve(this.buildPublicUrl(key));
  }

  protected async doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const expiresIn = options?.expiresIn ?? 3600;
    const method = options?.method ?? 'GET';

    if (method === 'PUT') {
      return this.client.presignedPutObject(this.bucket, key, expiresIn);
    }
    return this.client.presignedGetObject(this.bucket, key, expiresIn);
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    const { CopyConditions } = await import('minio');
    const cond = new CopyConditions();
    await this.client.copyObject(
      this.bucket,
      options.destinationKey,
      `/${this.bucket}/${options.sourceKey}`,
      cond,
    );

    return {
      key: options.destinationKey,
      url: this.buildPublicUrl(options.destinationKey),
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    try {
      return await this.client.getObject(this.bucket, key);
    } catch (error) {
      throw new FileNotFoundError(key, this.providerName, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Multipart — MinIO supports S3 multipart; use the SDK's initiateNewMultipartUpload
  // ---------------------------------------------------------------------------

  private readonly mpSessions = new Map<string, { key: string; parts: Buffer[]; contentType?: string }>();

  protected doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession> {
    const uploadId = `minio-mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.mpSessions.set(uploadId, { key, parts: [], contentType });
    return Promise.resolve({ uploadId, key });
  }

  protected doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    const session = this.mpSessions.get(options.uploadId);
    if (!session) throw new MultipartUploadError(`Unknown uploadId: ${options.uploadId}`, this.providerName);
    session.parts[options.partNumber - 1] = Buffer.from(options.body);
    return Promise.resolve({ partNumber: options.partNumber, etag: `minio-etag-${options.partNumber}` });
  }

  protected async doCompleteMultipartUpload(
    session: MultipartUploadSession,
    _parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) throw new MultipartUploadError(`Unknown uploadId: ${session.uploadId}`, this.providerName);

    const combined = Buffer.concat(stored.parts);
    await this.client.putObject(this.bucket, session.key, combined, combined.byteLength, {
      'Content-Type': stored.contentType ?? 'application/octet-stream',
    });

    this.mpSessions.delete(session.uploadId);
    return { key: session.key, url: this.buildPublicUrl(session.key), provider: this.providerName };
  }

  protected doAbortMultipartUpload(session: MultipartUploadSession): Promise<void> {
    this.mpSessions.delete(session.uploadId);
    return Promise.resolve();
  }

  protected doListParts(session: MultipartUploadSession): Promise<FileListEntry[]> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) return Promise.resolve([]);
    return Promise.resolve(
      stored.parts.map((p, i) => ({
        key: `${session.key}#part-${i + 1}`,
        size: p.byteLength,
        lastModified: new Date(),
      })),
    );
  }
}
