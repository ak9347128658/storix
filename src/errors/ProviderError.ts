import { StorixError } from './StorixError.js';

/** Thrown when a storage provider operation fails. */
export class ProviderError extends StorixError {
  constructor(message: string, provider: string, originalError?: unknown, statusCode?: number) {
    super({
      message,
      code: 'PROVIDER_ERROR',
      statusCode: statusCode ?? 500,
      provider,
      originalError,
    });
    this.name = 'ProviderError';
  }
}

/** Thrown when a requested file does not exist in storage. */
export class FileNotFoundError extends StorixError {
  public readonly key: string;

  constructor(key: string, provider: string, originalError?: unknown) {
    super({
      message: `File not found: "${key}"`,
      code: 'FILE_NOT_FOUND',
      statusCode: 404,
      provider,
      originalError,
    });
    this.name = 'FileNotFoundError';
    this.key = key;
  }
}

/** Thrown when the caller lacks permission to perform the operation. */
export class PermissionError extends StorixError {
  constructor(message: string, provider: string, originalError?: unknown) {
    super({
      message,
      code: 'PERMISSION_DENIED',
      statusCode: 403,
      provider,
      originalError,
    });
    this.name = 'PermissionError';
  }
}

/** Thrown when bucket / container does not exist or is inaccessible. */
export class BucketNotFoundError extends StorixError {
  public readonly bucket: string;

  constructor(bucket: string, provider: string, originalError?: unknown) {
    super({
      message: `Bucket not found: "${bucket}"`,
      code: 'BUCKET_NOT_FOUND',
      statusCode: 404,
      provider,
      originalError,
    });
    this.name = 'BucketNotFoundError';
    this.bucket = bucket;
  }
}

/** Thrown when a multipart upload operation fails. */
export class MultipartUploadError extends StorixError {
  constructor(message: string, provider: string, originalError?: unknown) {
    super({
      message,
      code: 'MULTIPART_UPLOAD_ERROR',
      statusCode: 500,
      provider,
      originalError,
    });
    this.name = 'MultipartUploadError';
  }
}

/** Thrown when the provider returns a network or connectivity error. */
export class NetworkError extends StorixError {
  constructor(message: string, provider: string, originalError?: unknown) {
    super({
      message,
      code: 'NETWORK_ERROR',
      statusCode: 503,
      provider,
      originalError,
    });
    this.name = 'NetworkError';
  }
}

/** Thrown when all retry attempts have been exhausted. */
export class MaxRetriesExceededError extends StorixError {
  public readonly attempts: number;

  constructor(attempts: number, provider: string, originalError?: unknown) {
    super({
      message: `Max retries exceeded after ${attempts} attempt(s)`,
      code: 'MAX_RETRIES_EXCEEDED',
      statusCode: 503,
      provider,
      originalError,
    });
    this.name = 'MaxRetriesExceededError';
    this.attempts = attempts;
  }
}
