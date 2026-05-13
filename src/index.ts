/**
 * Storix — Unified Cloud Storage SDK
 *
 * @packageDocumentation
 */

// Factory
export { createStorage, createStorageFromProvider } from './core/ProviderFactory.js';

// Core classes
export { StorageClient } from './core/StorageClient.js';
export { BaseProvider } from './core/BaseProvider.js';

// Types
export type {
  StorageConfig,
  StorageProvider,
  Visibility,
  LogLevel,
  RetryConfig,
  // Credential types
  S3Credentials,
  R2Credentials,
  GCSCredentials,
  AzureCredentials,
  SpacesCredentials,
  B2Credentials,
  MinIOCredentials,
  SupabaseCredentials,
  FirebaseCredentials,
  AppwriteCredentials,
  // Operation types
  UploadOptions,
  UploadResult,
  DeleteOptions,
  ListOptions,
  ListResult,
  FileListEntry,
  FileMetadata,
  SignedUrlOptions,
  CopyOptions,
  FileBody,
  MultipartUploadSession,
  MultipartPartResult,
  UploadPartOptions,
  // Provider interface
  IStorageProvider,
} from './types/index.js';

// Errors
export {
  StorixError,
  ProviderError,
  FileNotFoundError,
  PermissionError,
  BucketNotFoundError,
  MultipartUploadError,
  NetworkError,
  MaxRetriesExceededError,
  ValidationError,
  MissingConfigError,
  UnknownMimeTypeError,
} from './errors/index.js';

// Hooks
export { HookSystem } from './hooks/index.js';
export type { HookEvent, HookPayloads, HookHandler } from './hooks/index.js';

// Middleware
export { MiddlewareChain } from './middleware/index.js';
export type { Middleware, MiddlewareContext } from './middleware/index.js';

// Utilities (public API)
export { detectMimeType, withRetry, mergeRetryConfig } from './utils/index.js';

// Logger
export { Logger } from './logger/index.js';
