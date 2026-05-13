import { StorixError } from './StorixError.js';

/** Thrown when configuration or input validation fails. */
export class ValidationError extends StorixError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super({ message, code: 'VALIDATION_ERROR', statusCode: 400 });
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** Thrown when a required configuration field is missing. */
export class MissingConfigError extends ValidationError {
  constructor(field: string, provider: string) {
    super(`Missing required configuration field "${field}" for provider "${provider}"`, field);
    this.name = 'MissingConfigError';
  }
}

/** Thrown when a MIME type cannot be determined and no fallback is available. */
export class UnknownMimeTypeError extends StorixError {
  constructor(key: string) {
    super({
      message: `Cannot determine MIME type for key: "${key}"`,
      code: 'UNKNOWN_MIME_TYPE',
      statusCode: 400,
    });
    this.name = 'UnknownMimeTypeError';
  }
}
