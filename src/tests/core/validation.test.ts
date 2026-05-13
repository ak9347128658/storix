import { describe, it, expect } from 'vitest';
import { validateConfig, validateKey } from '../../validators/ConfigValidator.js';
import { MissingConfigError, ValidationError } from '../../errors/index.js';

describe('validateKey', () => {
  it('accepts valid keys', () => {
    expect(() => validateKey('users/avatar.png')).not.toThrow();
    expect(() => validateKey('file.txt')).not.toThrow();
    expect(() => validateKey('a/b/c/d.jpg')).not.toThrow();
  });

  it('rejects leading slashes', () => {
    expect(() => validateKey('/users/avatar.png')).toThrow(ValidationError);
  });

  it('rejects path traversal', () => {
    expect(() => validateKey('../../etc/passwd')).toThrow(ValidationError);
  });

  it('rejects empty strings', () => {
    expect(() => validateKey('')).toThrow(ValidationError);
  });
});

describe('validateConfig', () => {
  it('passes for a valid S3 config', () => {
    expect(() =>
      validateConfig({
        provider: 's3',
        credentials: {
          accessKeyId: 'KEY',
          secretAccessKey: 'SECRET',
          region: 'us-east-1',
          bucket: 'my-bucket',
        },
      }),
    ).not.toThrow();
  });

  it('throws MissingConfigError for missing S3 bucket', () => {
    expect(() =>
      validateConfig({
        provider: 's3',
        credentials: {
          accessKeyId: 'KEY',
          secretAccessKey: 'SECRET',
          region: 'us-east-1',
          bucket: '',
        },
      }),
    ).toThrow(MissingConfigError);
  });

  it('throws for Azure missing both accountKey and connectionString', () => {
    expect(() =>
      validateConfig({
        provider: 'azure',
        credentials: {
          accountName: 'myaccount',
          containerName: 'mycontainer',
        },
      }),
    ).toThrow(MissingConfigError);
  });

  it('passes for Azure with connectionString', () => {
    expect(() =>
      validateConfig({
        provider: 'azure',
        credentials: {
          accountName: 'myaccount',
          containerName: 'mycontainer',
          connectionString: 'DefaultEndpointsProtocol=https;...',
        },
      }),
    ).not.toThrow();
  });

  it('throws for GCS missing both keyFilename and credentials', () => {
    expect(() =>
      validateConfig({
        provider: 'gcs',
        credentials: {
          projectId: 'my-project',
          bucket: 'my-bucket',
        },
      }),
    ).toThrow(MissingConfigError);
  });

  it('passes for GCS with credentials object', () => {
    expect(() =>
      validateConfig({
        provider: 'gcs',
        credentials: {
          projectId: 'my-project',
          bucket: 'my-bucket',
          credentials: { client_email: 'sa@proj.iam', private_key: '-----BEGIN...' },
        },
      }),
    ).not.toThrow();
  });
});
