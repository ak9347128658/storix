import type { Readable } from 'node:stream';
import type {
  CopyOptions,
  DeleteOptions,
  FileListEntry,
  FileMetadata,
  IStorageProvider,
  ListOptions,
  ListResult,
  MultipartPartResult,
  MultipartUploadSession,
  SignedUrlOptions,
  UploadOptions,
  UploadPartOptions,
  UploadResult,
  RetryConfig,
  Visibility,
} from '../types/index.js';
import { withRetry, mergeRetryConfig, detectMimeType, streamToBuffer } from '../utils/index.js';
import { validateKey } from '../validators/index.js';
import { Logger } from '../logger/Logger.js';

/**
 * Abstract base class for all Storix provider adapters.
 *
 * Subclasses implement the `protected abstract` methods while this class
 * supplies retry orchestration, key validation, MIME detection, and
 * sensible defaults for `move`, `rename`, and `getBuffer`.
 */
export abstract class BaseProvider implements IStorageProvider {
  public abstract readonly providerName: string;

  protected readonly logger: Logger;
  protected readonly retryConfig: RetryConfig;
  protected readonly defaultVisibility: Visibility;

  constructor(options: {
    retryConfig?: Partial<RetryConfig>;
    logLevel?: import('../types/index.js').LogLevel;
    defaultVisibility?: Visibility;
  }) {
    this.retryConfig = mergeRetryConfig(options.retryConfig);
    this.logger = new Logger(options.logLevel ?? 'warn', '[Storix]');
    this.defaultVisibility = options.defaultVisibility ?? 'private';
  }

  // ---------------------------------------------------------------------------
  // Abstract methods — each provider must implement these
  // ---------------------------------------------------------------------------

  protected abstract doUpload(options: UploadOptions): Promise<UploadResult>;
  protected abstract doDelete(key: string): Promise<void>;
  protected abstract doExists(key: string): Promise<boolean>;
  protected abstract doGetMetadata(key: string): Promise<FileMetadata>;
  protected abstract doList(options?: ListOptions): Promise<ListResult>;
  protected abstract doGetUrl(key: string): Promise<string>;
  protected abstract doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  protected abstract doCopy(options: CopyOptions): Promise<UploadResult>;
  protected abstract doGetStream(key: string): Promise<Readable>;
  protected abstract doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession>;
  protected abstract doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult>;
  protected abstract doCompleteMultipartUpload(
    session: MultipartUploadSession,
    parts: MultipartPartResult[],
  ): Promise<UploadResult>;
  protected abstract doAbortMultipartUpload(session: MultipartUploadSession): Promise<void>;
  protected abstract doListParts(session: MultipartUploadSession): Promise<FileListEntry[]>;

  // ---------------------------------------------------------------------------
  // Public API — wraps abstract methods with validation + retry
  // ---------------------------------------------------------------------------

  async upload(options: UploadOptions): Promise<UploadResult> {
    validateKey(options.key);
    if (!options.contentType) {
      options = { ...options, contentType: detectMimeType(options.key) };
    }
    this.logger.debug(`upload:start`, { key: options.key, provider: this.providerName });

    const result = await withRetry(
      () => this.doUpload(options),
      this.retryConfig,
      this.providerName,
      this.logger,
    );

    this.logger.info(`upload:complete`, { key: options.key, url: result.url });
    return result;
  }

  async delete(options: DeleteOptions): Promise<void> {
    validateKey(options.key);
    this.logger.debug(`delete:start`, { key: options.key });
    await withRetry(
      () => this.doDelete(options.key),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
    this.logger.info(`delete:complete`, { key: options.key });
  }

  async exists(key: string): Promise<boolean> {
    validateKey(key);
    return withRetry(() => this.doExists(key), this.retryConfig, this.providerName, this.logger);
  }

  async getMetadata(key: string): Promise<FileMetadata> {
    validateKey(key);
    return withRetry(
      () => this.doGetMetadata(key),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  async list(options?: ListOptions): Promise<ListResult> {
    return withRetry(() => this.doList(options), this.retryConfig, this.providerName, this.logger);
  }

  async getUrl(key: string): Promise<string> {
    validateKey(key);
    return withRetry(() => this.doGetUrl(key), this.retryConfig, this.providerName, this.logger);
  }

  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    validateKey(key);
    return withRetry(
      () => this.doGetSignedUrl(key, options),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  async copy(options: CopyOptions): Promise<UploadResult> {
    validateKey(options.sourceKey);
    validateKey(options.destinationKey);
    return withRetry(
      () => this.doCopy(options),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  /** Default move implementation: copy then delete source. Override for atomic moves. */
  async move(options: CopyOptions): Promise<UploadResult> {
    const result = await this.copy(options);
    await this.delete({ key: options.sourceKey });
    return result;
  }

  /** Alias for move within the same bucket. */
  async rename(sourceKey: string, destinationKey: string): Promise<UploadResult> {
    return this.move({ sourceKey, destinationKey });
  }

  async getStream(key: string): Promise<Readable> {
    validateKey(key);
    return withRetry(
      () => this.doGetStream(key),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  /** Download a file as a Buffer (streams the object and buffers it). */
  async getBuffer(key: string): Promise<Buffer> {
    const stream = await this.getStream(key);
    return streamToBuffer(stream);
  }

  async createMultipartUpload(key: string, contentType?: string): Promise<MultipartUploadSession> {
    validateKey(key);
    return withRetry(
      () => this.doCreateMultipartUpload(key, contentType ?? detectMimeType(key)),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  async uploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    return withRetry(
      () => this.doUploadPart(options),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  async completeMultipartUpload(
    session: MultipartUploadSession,
    parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    return withRetry(
      () => this.doCompleteMultipartUpload(session, parts),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  async abortMultipartUpload(session: MultipartUploadSession): Promise<void> {
    await withRetry(
      () => this.doAbortMultipartUpload(session),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  async listParts(session: MultipartUploadSession): Promise<FileListEntry[]> {
    return withRetry(
      () => this.doListParts(session),
      this.retryConfig,
      this.providerName,
      this.logger,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers available to subclasses
  // ---------------------------------------------------------------------------

  /** Resolve the effective visibility for an upload. */
  protected resolveVisibility(uploadVisibility?: Visibility): Visibility {
    return uploadVisibility ?? this.defaultVisibility;
  }
}
