import { Readable } from 'node:stream';
import type {
  CopyOptions,
  FileListEntry,
  FileMetadata,
  GCSCredentials,
  ListOptions,
  ListResult,
  LogLevel,
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
import { toReadable } from '../../utils/index.js';

type Storage = import('@google-cloud/storage').Storage;
type Bucket = import('@google-cloud/storage').Bucket;

/** Google Cloud Storage provider. */
export class GCSProvider extends BaseProvider {
  public readonly providerName = 'gcs';

  private readonly storage: Storage;
  private readonly bucket: Bucket;
  private readonly bucketName: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;

  constructor(
    credentials: GCSCredentials,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      logLevel?: LogLevel;
      defaultVisibility?: Visibility;
    },
  ) {
    super(options ?? {});
    this.bucketName = credentials.bucket;
    this.cdnUrl = credentials.cdnUrl;
    this.customDomain = credentials.customDomain;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Storage } = require('@google-cloud/storage') as typeof import('@google-cloud/storage');

    this.storage = new Storage({
      projectId: credentials.projectId,
      keyFilename: credentials.keyFilename,
      credentials: credentials.credentials,
    });

    this.bucket = this.storage.bucket(credentials.bucket);
  }

  private buildPublicUrl(key: string): string {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${key}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    return `https://storage.googleapis.com/${this.bucketName}/${key}`;
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const file = this.bucket.file(options.key);
    const visibility = this.resolveVisibility(options.visibility);

    const stream = file.createWriteStream({
      metadata: {
        contentType: options.contentType,
        cacheControl: options.cacheControl,
        contentDisposition: options.contentDisposition,
        contentEncoding: options.contentEncoding,
        metadata: options.metadata,
      },
      resumable: false,
      public: visibility === 'public',
    });

    await new Promise<void>((resolve, reject) => {
      const readable = toReadable(options.file);
      readable.pipe(stream).on('finish', resolve).on('error', reject);
      readable.on('error', reject);
    });

    const url = this.buildPublicUrl(options.key);
    return {
      key: options.key,
      url,
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doDelete(key: string): Promise<void> {
    try {
      await this.bucket.file(key).delete();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to delete "${key}"`, this.providerName, error);
    }
  }

  protected async doExists(key: string): Promise<boolean> {
    const [exists] = await this.bucket.file(key).exists();
    return exists;
  }

  protected async doGetMetadata(key: string): Promise<FileMetadata> {
    try {
      const [meta] = await this.bucket.file(key).getMetadata();
      return {
        key,
        size: Number(meta.size ?? 0),
        contentType: String(meta.contentType ?? 'application/octet-stream'),
        lastModified: new Date(String(meta.updated ?? meta.timeCreated ?? Date.now())),
        etag: String(meta.etag ?? '').replace(/"/g, ''),
        metadata: (meta.metadata as Record<string, string> | undefined) ?? {},
      };
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to get metadata for "${key}"`, this.providerName, error);
    }
  }

  protected async doList(options?: ListOptions): Promise<ListResult> {
    const [files, , apiResponse] = await this.bucket.getFiles({
      prefix: options?.prefix,
      maxResults: options?.limit,
      pageToken: options?.cursor,
      delimiter: options?.delimiter,
      autoPaginate: false,
    });

    const entries: FileListEntry[] = files.map((f) => ({
      key: f.name,
      size: Number(f.metadata.size ?? 0),
      lastModified: new Date(String(f.metadata.updated ?? Date.now())),
      etag: String(f.metadata.etag ?? '').replace(/"/g, ''),
    }));

    return {
      files: entries,
      nextCursor: (apiResponse as { nextPageToken?: string } | null)?.nextPageToken,
      prefixes: (apiResponse as { prefixes?: string[] } | null)?.prefixes,
    };
  }

  protected doGetUrl(key: string): Promise<string> {
    return Promise.resolve(this.buildPublicUrl(key));
  }

  protected async doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const expiresIn = options?.expiresIn ?? 3600;
    const action = options?.method === 'PUT' ? 'write' : 'read';

    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action,
      expires: Date.now() + expiresIn * 1000,
      contentType: options?.contentType,
    });

    return url;
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    const dest = this.bucket.file(options.destinationKey);
    await this.bucket.file(options.sourceKey).copy(dest);

    if (options.metadata ?? options.contentType) {
      await dest.setMetadata({
        contentType: options.contentType,
        metadata: options.metadata,
      });
    }

    const visibility = this.resolveVisibility(options.visibility);
    if (visibility === 'public') await dest.makePublic();

    return {
      key: options.destinationKey,
      url: this.buildPublicUrl(options.destinationKey),
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    const file = this.bucket.file(key);
    const exists = await this.doExists(key);
    if (!exists) throw new FileNotFoundError(key, this.providerName);
    return file.createReadStream();
  }

  // ---------------------------------------------------------------------------
  // Multipart — GCS uses resumable uploads; we simulate the session API
  // ---------------------------------------------------------------------------

  private readonly mpSessions = new Map<string, { key: string; parts: Buffer[] }>();

  protected doCreateMultipartUpload(
    key: string,
    _contentType?: string,
  ): Promise<MultipartUploadSession> {
    const uploadId = `gcs-mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.mpSessions.set(uploadId, { key, parts: [] });
    return Promise.resolve({ uploadId, key });
  }

  protected doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    const session = this.mpSessions.get(options.uploadId);
    if (!session)
      throw new MultipartUploadError(
        `Unknown uploadId: ${options.uploadId}`,
        this.providerName,
      );

    session.parts[options.partNumber - 1] = Buffer.from(options.body);
    return Promise.resolve({
      partNumber: options.partNumber,
      etag: `gcs-part-${options.partNumber}`,
    });
  }

  protected async doCompleteMultipartUpload(
    session: MultipartUploadSession,
    _parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) throw new MultipartUploadError(`Unknown uploadId: ${session.uploadId}`, this.providerName);

    const combined = Buffer.concat(stored.parts);
    this.mpSessions.delete(session.uploadId);

    const file = this.bucket.file(session.key);
    await file.save(combined, { resumable: false });

    return {
      key: session.key,
      url: this.buildPublicUrl(session.key),
      provider: this.providerName,
    };
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
