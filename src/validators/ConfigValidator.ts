import type { StorageConfig } from '../types/index.js';
import { MissingConfigError, ValidationError } from '../errors/index.js';

type RequiredFields = Record<string, string[]>;

const REQUIRED_FIELDS: RequiredFields = {
  s3: ['accessKeyId', 'secretAccessKey', 'region', 'bucket'],
  r2: ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket'],
  gcs: ['projectId', 'bucket'],
  azure: ['accountName', 'containerName'],
  spaces: ['accessKeyId', 'secretAccessKey', 'region', 'bucket'],
  b2: ['applicationKeyId', 'applicationKey', 'bucket'],
  minio: ['endPoint', 'accessKey', 'secretKey', 'bucket'],
  supabase: ['url', 'serviceRoleKey', 'bucket'],
  firebase: ['projectId', 'bucket'],
  appwrite: ['endpoint', 'projectId', 'apiKey', 'bucketId'],
};

/** Validate that all required credential fields are present and non-empty. */
export function validateConfig(config: StorageConfig): void {
  const { provider, credentials } = config;
  const required = REQUIRED_FIELDS[provider];

  if (!required) {
    throw new ValidationError(`Unknown provider: "${provider}"`);
  }

  for (const field of required) {
    const value = (credentials as Record<string, unknown>)[field];
    if (value === undefined || value === null || value === '') {
      throw new MissingConfigError(field, provider);
    }
  }

  // Azure must have either accountKey or connectionString
  if (provider === 'azure') {
    const creds = credentials as { accountKey?: string; connectionString?: string };
    if (!creds.accountKey && !creds.connectionString) {
      throw new MissingConfigError('accountKey or connectionString', 'azure');
    }
  }

  // GCS must have either keyFilename or credentials
  if (provider === 'gcs') {
    const creds = credentials as { keyFilename?: string; credentials?: unknown };
    if (!creds.keyFilename && !creds.credentials) {
      throw new MissingConfigError('keyFilename or credentials', 'gcs');
    }
  }
}

/** Validate that a storage key is a non-empty string with no leading slashes. */
export function validateKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new ValidationError('Storage key must be a non-empty string', 'key');
  }
  if (key.startsWith('/')) {
    throw new ValidationError(
      'Storage key must not start with a leading slash — use "folder/file.txt" not "/folder/file.txt"',
      'key',
    );
  }
  if (key.includes('..')) {
    throw new ValidationError('Storage key must not contain ".." path traversal sequences', 'key');
  }
}
