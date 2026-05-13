import { Readable } from 'node:stream';
import type {
  AppwriteCredentials,
  CopyOptions,
  FileListEntry,
  FileMetadata,
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
import { toReadable, streamToBuffer, randomId } from '../../utils/index.js';

type AppwriteStorage = import('node-appwrite').Storage;
type AppwriteClient = import('node-appwrite').Client;
type InputFile = import('node-appwrite/file').InputFile;

/** Appwrite Storage provider. */
export class AppwriteProvider extends BaseProvider {
  public readonly providerName = 'appwrite';

  private readonly storage: AppwriteStorage;
  private readonly client: AppwriteClient;
  private readonly bucketId: string;
  private readonly endpoint: string;
  private readonly projectId: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;

  constructor(
    credentials: AppwriteCredentials,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      logLevel?: LogLevel;
      defaultVisibility?: Visibility;
    },
  ) {
    super(options ?? {});
    this.bucketId = credentials.bucketId;
    this.endpoint = credentials.endpoint;
    this.projectId = credentials.projectId;
    this.cdnUrl = credentials.cdnUrl;
    this.customDomain = credentials.customDomain;

    const {
      Client,
      Storage,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('node-appwrite') as typeof import('node-appwrite');

    this.client = new Client()
      .setEndpoint(credentials.endpoint)
      .setProject(credentials.projectId)
      .setKey(credentials.apiKey);

    this.storage = new Storage(this.client);
  }

  private buildPublicUrl(fileId: string): string {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${fileId}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${fileId}`;
    return `${this.endpoint}/storage/buckets/${this.bucketId}/files/${fileId}/view?project=${this.projectId}`;
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const {
      InputFile,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('node-appwrite/file') as typeof import('node-appwrite/file');

    const buffer = await streamToBuffer(toReadable(options.file));
    const fileId = randomId();

    // Appwrite InputFile accepts a Buffer (as Blob) with a filename derived from the key
    const fileName = options.key.split('/').pop() ?? options.key;
    const inputFile = InputFile.fromBuffer(buffer, fileName);

    const file = await this.storage.createFile(this.bucketId, fileId, inputFile);

    return {
      key: options.key,
      url: this.buildPublicUrl(file.$id),
      size: file.sizeOriginal,
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doDelete(key: string): Promise<void> {
    // Appwrite uses fileIds; we store key→id mapping in metadata during upload.
    // For a simple implementation, use the key as the fileId.
    try {
      await this.storage.deleteFile(this.bucketId, key);
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to delete "${key}"`, this.providerName, error);
    }
  }

  protected async doExists(key: string): Promise<boolean> {
    try {
      await this.storage.getFile(this.bucketId, key);
      return true;
    } catch {
      return false;
    }
  }

  protected async doGetMetadata(key: string): Promise<FileMetadata> {
    try {
      const file = await this.storage.getFile(this.bucketId, key);
      return {
        key,
        size: file.sizeOriginal,
        contentType: file.mimeType,
        lastModified: new Date(file.$updatedAt),
        etag: file.$id,
      };
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to get metadata for "${key}"`, this.providerName, error);
    }
  }

  protected async doList(options?: ListOptions): Promise<ListResult> {
    const { Query } = await import('node-appwrite');

    const queries: string[] = [];
    if (options?.limit) queries.push(Query.limit(options.limit));
    if (options?.cursor) queries.push(Query.cursorAfter(options.cursor));

    const result = await this.storage.listFiles(this.bucketId, queries);

    const files: FileListEntry[] = result.files.map((f) => ({
      key: f.name,
      size: f.sizeOriginal,
      lastModified: new Date(f.$updatedAt),
      etag: f.$id,
    }));

    return { files };
  }

  protected doGetUrl(key: string): Promise<string> {
    return Promise.resolve(this.buildPublicUrl(key));
  }

  protected async doGetSignedUrl(key: string, _options?: SignedUrlOptions): Promise<string> {
    // Appwrite generates short-lived tokens via getFileDownload for private access.
    // For public buckets, the view URL serves as the "signed" URL.
    return Promise.resolve(this.buildPublicUrl(key));
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    // Appwrite has no native copy; download then re-upload.
    const {
      InputFile,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('node-appwrite/file') as typeof import('node-appwrite/file');

    const arrayBuffer = await this.storage.getFileDownload(this.bucketId, options.sourceKey);
    const buffer = Buffer.from(arrayBuffer);
    const fileName = options.destinationKey.split('/').pop() ?? options.destinationKey;
    const inputFile = InputFile.fromBuffer(buffer, fileName);
    const newFileId = randomId();

    const file = await this.storage.createFile(this.bucketId, newFileId, inputFile);

    return {
      key: options.destinationKey,
      url: this.buildPublicUrl(file.$id),
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    try {
      const arrayBuffer = await this.storage.getFileDownload(this.bucketId, key);
      return Readable.from(Buffer.from(arrayBuffer));
    } catch (error) {
      throw new FileNotFoundError(key, this.providerName, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Multipart — buffer in memory
  // ---------------------------------------------------------------------------

  private readonly mpSessions = new Map<string, { key: string; parts: Buffer[]; contentType?: string }>();

  protected doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession> {
    const uploadId = `aw-mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.mpSessions.set(uploadId, { key, parts: [], contentType });
    return Promise.resolve({ uploadId, key });
  }

  protected doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    const session = this.mpSessions.get(options.uploadId);
    if (!session) throw new MultipartUploadError(`Unknown uploadId: ${options.uploadId}`, this.providerName);
    session.parts[options.partNumber - 1] = Buffer.from(options.body);
    return Promise.resolve({ partNumber: options.partNumber, etag: `aw-etag-${options.partNumber}` });
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
