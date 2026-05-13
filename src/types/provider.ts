import type { Readable } from 'node:stream';
import type {
  CopyOptions,
  DeleteOptions,
  FileListEntry,
  FileMetadata,
  ListOptions,
  ListResult,
  MultipartPartResult,
  MultipartUploadSession,
  SignedUrlOptions,
  UploadOptions,
  UploadPartOptions,
  UploadResult,
} from './storage.js';

/**
 * Core interface every storage provider adapter must implement.
 * This is the single contract that drives the entire Storix abstraction.
 */
export interface IStorageProvider {
  readonly providerName: string;

  /** Upload a file to storage. */
  upload(options: UploadOptions): Promise<UploadResult>;

  /** Delete a file from storage. */
  delete(options: DeleteOptions): Promise<void>;

  /** Check whether a file exists. */
  exists(key: string): Promise<boolean>;

  /** Retrieve file metadata without downloading the file body. */
  getMetadata(key: string): Promise<FileMetadata>;

  /** List files (with optional prefix / pagination). */
  list(options?: ListOptions): Promise<ListResult>;

  /** Generate a public URL for a file (only meaningful for public objects). */
  getUrl(key: string): Promise<string>;

  /** Generate a signed / pre-signed URL granting time-limited access. */
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;

  /** Copy a file within the same bucket / container. */
  copy(options: CopyOptions): Promise<UploadResult>;

  /** Move a file (copy + delete source). */
  move(options: CopyOptions): Promise<UploadResult>;

  /** Rename a file (alias for move with same-bucket semantics). */
  rename(sourceKey: string, destinationKey: string): Promise<UploadResult>;

  /** Download a file as a Node.js Readable stream. */
  getStream(key: string): Promise<Readable>;

  /** Download a file as a Buffer. */
  getBuffer(key: string): Promise<Buffer>;

  // ---------------------------------------------------------------------------
  // Multipart upload lifecycle
  // ---------------------------------------------------------------------------

  /** Initiate a multipart upload session. */
  createMultipartUpload(key: string, contentType?: string): Promise<MultipartUploadSession>;

  /** Upload a single part. */
  uploadPart(options: UploadPartOptions): Promise<MultipartPartResult>;

  /** Finalise a multipart upload. */
  completeMultipartUpload(
    session: MultipartUploadSession,
    parts: MultipartPartResult[],
  ): Promise<UploadResult>;

  /** Abort an in-progress multipart upload to avoid storage charges. */
  abortMultipartUpload(session: MultipartUploadSession): Promise<void>;

  /** Return a list of already-uploaded parts for a given multipart session. */
  listParts(session: MultipartUploadSession): Promise<FileListEntry[]>;
}
