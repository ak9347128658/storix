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
} from '../types/index.js';
import { HookSystem } from '../hooks/index.js';
import { MiddlewareChain } from '../middleware/index.js';
import type { Middleware } from '../middleware/index.js';
import type { HookEvent, HookHandler } from '../hooks/index.js';

/**
 * The main public surface of Storix.
 *
 * Wraps a provider adapter with hook support and a composable middleware chain.
 * Instantiate via `createStorage()` — do not construct directly.
 */
export class StorageClient {
  private readonly provider: IStorageProvider;
  private readonly hooks: HookSystem;
  private readonly middleware: MiddlewareChain;

  constructor(provider: IStorageProvider) {
    this.provider = provider;
    this.hooks = new HookSystem();
    this.middleware = new MiddlewareChain();
  }

  /** The underlying provider identifier (e.g. `"s3"`, `"gcs"`). */
  get providerName(): string {
    return this.provider.providerName;
  }

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  /** Register upload middleware. Executes in FIFO order around provider upload. */
  use(middleware: Middleware): this {
    this.middleware.use(middleware);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  /** Subscribe to a lifecycle hook event. */
  on<E extends HookEvent>(event: E, handler: HookHandler<E>): this {
    this.hooks.on(event, handler);
    return this;
  }

  /** Unsubscribe from a lifecycle hook event. */
  off<E extends HookEvent>(event: E, handler: HookHandler<E>): this {
    this.hooks.off(event, handler);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /**
   * Upload a file.
   *
   * @example
   * ```ts
   * const result = await storage.upload({
   *   key: 'avatars/user-1.png',
   *   file: buffer,
   *   contentType: 'image/png',
   * });
   * ```
   */
  async upload(options: UploadOptions): Promise<UploadResult> {
    await this.hooks.emit('before:upload', options);

    const result = await this.middleware.execute(
      {
        options,
        provider: this.provider.providerName,
        startedAt: new Date(),
        metadata: {},
      },
      async (ctx) => this.provider.upload(ctx.options),
    );

    await this.hooks.emit('after:upload', result);
    return result;
  }

  /**
   * Delete a file.
   *
   * @example
   * ```ts
   * await storage.delete({ key: 'avatars/user-1.png' });
   * ```
   */
  async delete(options: DeleteOptions): Promise<void> {
    await this.hooks.emit('before:delete', options);
    await this.provider.delete(options);
    await this.hooks.emit('after:delete', options);
  }

  /**
   * Check if a file exists.
   *
   * @example
   * ```ts
   * if (await storage.exists('avatars/user-1.png')) { ... }
   * ```
   */
  async exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  /**
   * Retrieve file metadata without downloading the body.
   *
   * @example
   * ```ts
   * const meta = await storage.getMetadata('avatars/user-1.png');
   * console.log(meta.size, meta.contentType);
   * ```
   */
  async getMetadata(key: string): Promise<FileMetadata> {
    return this.provider.getMetadata(key);
  }

  /**
   * List files with optional prefix and pagination.
   *
   * @example
   * ```ts
   * const { files, nextCursor } = await storage.list({ prefix: 'avatars/' });
   * ```
   */
  async list(options?: ListOptions): Promise<ListResult> {
    await this.hooks.emit('before:list', { prefix: options?.prefix });
    const result = await this.provider.list(options);
    await this.hooks.emit('after:list', result);
    return result;
  }

  /**
   * Get the public URL for a file.
   * Only meaningful for objects with `visibility: "public"`.
   */
  async getUrl(key: string): Promise<string> {
    return this.provider.getUrl(key);
  }

  /**
   * Generate a signed / pre-signed URL for time-limited access.
   *
   * @example
   * ```ts
   * const url = await storage.getSignedUrl('private/report.pdf', { expiresIn: 900 });
   * ```
   */
  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    await this.hooks.emit('before:getSignedUrl', { key, expiresIn: options?.expiresIn });
    const url = await this.provider.getSignedUrl(key, options);
    await this.hooks.emit('after:getSignedUrl', { key, url });
    return url;
  }

  /**
   * Copy a file within the same bucket / container.
   *
   * @example
   * ```ts
   * await storage.copy({ sourceKey: 'original.png', destinationKey: 'copies/1.png' });
   * ```
   */
  async copy(options: CopyOptions): Promise<UploadResult> {
    await this.hooks.emit('before:copy', {
      sourceKey: options.sourceKey,
      destinationKey: options.destinationKey,
    });
    const result = await this.provider.copy(options);
    await this.hooks.emit('after:copy', result);
    return result;
  }

  /**
   * Move a file (copy + delete source).
   *
   * @example
   * ```ts
   * await storage.move({ sourceKey: 'temp/upload.png', destinationKey: 'final/upload.png' });
   * ```
   */
  async move(options: CopyOptions): Promise<UploadResult> {
    await this.hooks.emit('before:move', {
      sourceKey: options.sourceKey,
      destinationKey: options.destinationKey,
    });
    const result = await this.provider.move(options);
    await this.hooks.emit('after:move', result);
    return result;
  }

  /**
   * Rename a file (move with same-bucket semantics).
   *
   * @example
   * ```ts
   * await storage.rename('old-name.png', 'new-name.png');
   * ```
   */
  async rename(sourceKey: string, destinationKey: string): Promise<UploadResult> {
    return this.move({ sourceKey, destinationKey });
  }

  /** Download a file as a Node.js Readable stream. */
  async getStream(key: string): Promise<Readable> {
    return this.provider.getStream(key);
  }

  /** Download a file as a Buffer. */
  async getBuffer(key: string): Promise<Buffer> {
    return this.provider.getBuffer(key);
  }

  // ---------------------------------------------------------------------------
  // Multipart upload API
  // ---------------------------------------------------------------------------

  /** Initiate a multipart upload session. */
  async createMultipartUpload(key: string, contentType?: string): Promise<MultipartUploadSession> {
    return this.provider.createMultipartUpload(key, contentType);
  }

  /** Upload a single part in a multipart session. */
  async uploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    return this.provider.uploadPart(options);
  }

  /** Complete a multipart upload after all parts have been uploaded. */
  async completeMultipartUpload(
    session: MultipartUploadSession,
    parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    return this.provider.completeMultipartUpload(session, parts);
  }

  /** Abort an in-progress multipart upload to avoid storage charges. */
  async abortMultipartUpload(session: MultipartUploadSession): Promise<void> {
    return this.provider.abortMultipartUpload(session);
  }

  /** List already-uploaded parts for an active multipart session. */
  async listParts(session: MultipartUploadSession): Promise<FileListEntry[]> {
    return this.provider.listParts(session);
  }

  /**
   * High-level multipart upload helper.
   * Automatically splits a Buffer into chunks and uploads each part.
   *
   * @param options - Upload options (file must be a Buffer or Uint8Array).
   * @param chunkSize - Part size in bytes. @default 5 * 1024 * 1024
   */
  async uploadMultipart(
    options: UploadOptions,
    chunkSize = 5 * 1024 * 1024,
  ): Promise<UploadResult> {
    const { splitBuffer, streamToBuffer, toReadable } = await import('../utils/index.js');

    let buffer: Buffer;
    if (options.file instanceof Buffer) {
      buffer = options.file;
    } else if (options.file instanceof Uint8Array) {
      buffer = Buffer.from(options.file);
    } else {
      buffer = await streamToBuffer(toReadable(options.file));
    }

    const contentType = options.contentType ?? (await import('../utils/index.js')).detectMimeType(options.key);
    const session = await this.createMultipartUpload(options.key, contentType);

    const chunks = splitBuffer(buffer, chunkSize);
    const parts: MultipartPartResult[] = [];

    let uploaded = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;

      const part = await this.uploadPart({
        uploadId: session.uploadId,
        key: session.key,
        partNumber: i + 1,
        body: chunk,
      });

      parts.push(part);
      uploaded += chunk.byteLength;
      options.onProgress?.(uploaded, buffer.byteLength);
    }

    return this.completeMultipartUpload(session, parts);
  }
}
