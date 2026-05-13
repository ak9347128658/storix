/** Base error class for all Storix errors. */
export class StorixError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly provider?: string;
  public readonly originalError?: unknown;

  constructor(options: {
    message: string;
    code: string;
    statusCode?: number;
    provider?: string;
    originalError?: unknown;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause ?? options.originalError });
    this.name = 'StorixError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.provider = options.provider;
    this.originalError = options.originalError;

    // Maintains proper stack trace in V8.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
