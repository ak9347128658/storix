import { Readable } from 'node:stream';
import type {
  CopyOptions,
  FileListEntry,
  FileMetadata,
  FirebaseCredentials,
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
import { toReadable, streamToBuffer } from '../../utils/index.js';

type App = import('firebase-admin/app').App;
type Storage = import('firebase-admin/storage').Storage;
type Bucket = import('@google-cloud/storage').Bucket;

/** Firebase Storage provider (uses firebase-admin SDK). */
export class FirebaseProvider extends BaseProvider {
  public readonly providerName = 'firebase';

  private readonly storage: Storage;
  private readonly storageBucket: Bucket;
  private readonly bucketName: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;
  private readonly app: App;

  constructor(
    credentials: FirebaseCredentials,
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

    const {
      initializeApp,
      getApps,
      cert,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('firebase-admin/app') as typeof import('firebase-admin/app');
    const {
      getStorage,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('firebase-admin/storage') as typeof import('firebase-admin/storage');

    // Reuse existing app if already initialised (prevents duplicate app error).
    const existingApps = getApps();
    const appName = `storix-firebase-${credentials.projectId}`;
    const existing = existingApps.find((a) => a.name === appName);

    this.app =
      existing ??
      initializeApp(
        {
          credential: credentials.serviceAccount
            ? cert(credentials.serviceAccount as import('firebase-admin').ServiceAccount)
            : undefined,
          projectId: credentials.projectId,
          storageBucket: credentials.bucket,
        },
        appName,
      );

    this.storage = getStorage(this.app);
    this.storageBucket = this.storage.bucket(credentials.bucket);
  }

  private buildPublicUrl(key: string): string {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${key}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    return `https://storage.googleapis.com/${this.bucketName}/${key}`;
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const buffer = await streamToBuffer(toReadable(options.file));
    const visibility = this.resolveVisibility(options.visibility);
    const file = this.storageBucket.file(options.key);

    await file.save(buffer, {
      metadata: {
        contentType: options.contentType,
        cacheControl: options.cacheControl,
        metadata: options.metadata,
      },
      public: visibility === 'public',
    });

    return {
      key: options.key,
      url: this.buildPublicUrl(options.key),
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doDelete(key: string): Promise<void> {
    try {
      await this.storageBucket.file(key).delete();
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to delete "${key}"`, this.providerName, error);
    }
  }

  protected async doExists(key: string): Promise<boolean> {
    const [exists] = await this.storageBucket.file(key).exists();
    return exists;
  }

  protected async doGetMetadata(key: string): Promise<FileMetadata> {
    try {
      const [meta] = await this.storageBucket.file(key).getMetadata();
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
    const [files, , apiResponse] = await this.storageBucket.getFiles({
      prefix: options?.prefix,
      maxResults: options?.limit,
      pageToken: options?.cursor,
      autoPaginate: false,
    });

    return {
      files: files.map((f) => ({
        key: f.name,
        size: Number(f.metadata.size ?? 0),
        lastModified: new Date(String(f.metadata.updated ?? Date.now())),
        etag: String(f.metadata.etag ?? '').replace(/"/g, ''),
      })),
      nextCursor: (apiResponse as { nextPageToken?: string } | null)?.nextPageToken,
    };
  }

  protected doGetUrl(key: string): Promise<string> {
    return Promise.resolve(this.buildPublicUrl(key));
  }

  protected async doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const expiresIn = options?.expiresIn ?? 3600;
    const action = options?.method === 'PUT' ? 'write' : 'read';

    const [url] = await this.storageBucket.file(key).getSignedUrl({
      version: 'v4',
      action,
      expires: Date.now() + expiresIn * 1000,
      contentType: options?.contentType,
    });

    return url;
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    await this.storageBucket.file(options.sourceKey).copy(
      this.storageBucket.file(options.destinationKey),
    );

    const visibility = this.resolveVisibility(options.visibility);
    if (visibility === 'public') {
      await this.storageBucket.file(options.destinationKey).makePublic();
    }

    return {
      key: options.destinationKey,
      url: this.buildPublicUrl(options.destinationKey),
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    const exists = await this.doExists(key);
    if (!exists) throw new FileNotFoundError(key, this.providerName);
    return this.storageBucket.file(key).createReadStream();
  }

  // ---------------------------------------------------------------------------
  // Multipart — buffer in memory (Firebase doesn't expose native MPU)
  // ---------------------------------------------------------------------------

  private readonly mpSessions = new Map<string, { key: string; parts: Buffer[]; contentType?: string }>();

  protected doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession> {
    const uploadId = `fb-mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.mpSessions.set(uploadId, { key, parts: [], contentType });
    return Promise.resolve({ uploadId, key });
  }

  protected doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    const session = this.mpSessions.get(options.uploadId);
    if (!session) throw new MultipartUploadError(`Unknown uploadId: ${options.uploadId}`, this.providerName);
    session.parts[options.partNumber - 1] = Buffer.from(options.body);
    return Promise.resolve({ partNumber: options.partNumber, etag: `fb-etag-${options.partNumber}` });
  }

  protected async doCompleteMultipartUpload(
    session: MultipartUploadSession,
    _parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) throw new MultipartUploadError(`Unknown uploadId: ${session.uploadId}`, this.providerName);

    const combined = Buffer.concat(stored.parts);
    this.mpSessions.delete(session.uploadId);

    return this.doUpload({
      key: session.key,
      file: combined,
      contentType: stored.contentType,
    });
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
