import type { Readable } from 'node:stream';
import type { Visibility } from './config.js';

/** Accepted file body types for upload operations. */
export type FileBody = Buffer | Readable | Uint8Array | string | Blob;

/** Options for uploading a file. */
export interface UploadOptions {
  /** Storage key / path (e.g. `"users/avatar.png"`). */
  key: string;
  /** File content to upload. */
  file: FileBody;
  /** MIME content type. Auto-detected from key extension when omitted. */
  contentType?: string;
  /** Visibility override for this specific upload. */
  visibility?: Visibility;
  /** Arbitrary metadata key-value pairs stored alongside the object. */
  metadata?: Record<string, string>;
  /** Multipart chunk size in bytes. @default 5 * 1024 * 1024 (5 MB) */
  chunkSize?: number;
  /** Whether to use multipart upload for large files. @default true */
  multipart?: boolean;
  /** Content-Disposition header value. */
  contentDisposition?: string;
  /** Content-Encoding header value. */
  contentEncoding?: string;
  /** Cache-Control header value. */
  cacheControl?: string;
  /** Progress callback invoked with bytes uploaded so far and total bytes. */
  onProgress?: (uploaded: number, total: number) => void;
}

/** Result returned by a successful upload. */
export interface UploadResult {
  key: string;
  url: string;
  etag?: string;
  size?: number;
  contentType?: string;
  metadata?: Record<string, string>;
  provider: string;
}

/** Options for generating a signed / pre-signed URL. */
export interface SignedUrlOptions {
  /** Expiry duration in seconds. @default 3600 */
  expiresIn?: number;
  /** HTTP method the signed URL permits. @default "GET" */
  method?: 'GET' | 'PUT' | 'DELETE';
  /** Content-Type the PUT signed URL should accept. */
  contentType?: string;
  /** Extra query string parameters to embed. */
  queryParams?: Record<string, string>;
}

/** File metadata returned by stat / head operations. */
export interface FileMetadata {
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag?: string;
  metadata?: Record<string, string>;
  visibility?: Visibility;
}

/** Entry returned when listing files. */
export interface FileListEntry {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

/** Options for listing files in a bucket / container. */
export interface ListOptions {
  /** Key prefix to filter results. */
  prefix?: string;
  /** Maximum number of results to return. */
  limit?: number;
  /** Continuation token for pagination. */
  cursor?: string;
  /** Delimiter for hierarchical listing (e.g. `"/"`). */
  delimiter?: string;
}

/** Paginated list result. */
export interface ListResult {
  files: FileListEntry[];
  /** Continuation token for the next page. `undefined` when no more pages. */
  nextCursor?: string;
  /** Common prefixes (virtual "folders") returned when a delimiter is used. */
  prefixes?: string[];
}

/** Options controlling copy / move operations. */
export interface CopyOptions {
  /** Source key. */
  sourceKey: string;
  /** Destination key. */
  destinationKey: string;
  /** Visibility to apply to the destination object. Inherits source when omitted. */
  visibility?: Visibility;
  /** Metadata to apply to the destination. Inherits source when omitted. */
  metadata?: Record<string, string>;
  /** Content type override for the destination. */
  contentType?: string;
}

/** Options for deleting a file. */
export interface DeleteOptions {
  /** Storage key to delete. */
  key: string;
}

/** Multipart upload session. */
export interface MultipartUploadSession {
  uploadId: string;
  key: string;
}

/** Result of uploading one multipart part. */
export interface MultipartPartResult {
  partNumber: number;
  etag: string;
}

/** Options for a single part in a multipart upload. */
export interface UploadPartOptions {
  uploadId: string;
  key: string;
  partNumber: number;
  body: Buffer | Uint8Array;
}
