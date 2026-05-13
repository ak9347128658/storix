/**
 * Supported storage provider identifiers.
 */
export type StorageProvider =
  | 's3'
  | 'r2'
  | 'gcs'
  | 'azure'
  | 'spaces'
  | 'b2'
  | 'minio'
  | 'supabase'
  | 'firebase'
  | 'appwrite';

/** File visibility mode controlling access control. */
export type Visibility = 'public' | 'private';

/** Log level for the built-in logger. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

// ---------------------------------------------------------------------------
// Provider credential types
// ---------------------------------------------------------------------------

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  sessionToken?: string;
  cdnUrl?: string;
  customDomain?: string;
}

export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  cdnUrl?: string;
  customDomain?: string;
}

export interface GCSCredentials {
  projectId: string;
  bucket: string;
  keyFilename?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
  cdnUrl?: string;
  customDomain?: string;
}

export interface AzureCredentials {
  accountName: string;
  accountKey?: string;
  connectionString?: string;
  containerName: string;
  cdnUrl?: string;
  customDomain?: string;
}

export interface SpacesCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
  cdnUrl?: string;
  customDomain?: string;
}

export interface B2Credentials {
  applicationKeyId: string;
  applicationKey: string;
  bucket: string;
  endpoint?: string;
  region?: string;
  cdnUrl?: string;
  customDomain?: string;
}

export interface MinIOCredentials {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
  cdnUrl?: string;
  customDomain?: string;
}

export interface SupabaseCredentials {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  cdnUrl?: string;
  customDomain?: string;
}

export interface FirebaseCredentials {
  projectId: string;
  bucket: string;
  serviceAccount?: Record<string, unknown>;
  cdnUrl?: string;
  customDomain?: string;
}

export interface AppwriteCredentials {
  endpoint: string;
  projectId: string;
  apiKey: string;
  bucketId: string;
  cdnUrl?: string;
  customDomain?: string;
}

/** Union of all provider credential shapes. */
export type ProviderCredentials =
  | S3Credentials
  | R2Credentials
  | GCSCredentials
  | AzureCredentials
  | SpacesCredentials
  | B2Credentials
  | MinIOCredentials
  | SupabaseCredentials
  | FirebaseCredentials
  | AppwriteCredentials;

// ---------------------------------------------------------------------------
// Main storage configuration
// ---------------------------------------------------------------------------

/** Retry policy configuration. */
export interface RetryConfig {
  /** Maximum number of retry attempts. @default 3 */
  maxRetries: number;
  /** Base delay in milliseconds for exponential back-off. @default 200 */
  baseDelay: number;
  /** Maximum delay cap in milliseconds. @default 10000 */
  maxDelay: number;
  /** Status codes that should trigger a retry. */
  retryableStatusCodes?: number[];
}

/** Strongly-typed provider-to-credentials mapping used by the discriminated union. */
export type StorageConfig =
  | {
      provider: 's3';
      credentials: S3Credentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'r2';
      credentials: R2Credentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'gcs';
      credentials: GCSCredentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'azure';
      credentials: AzureCredentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'spaces';
      credentials: SpacesCredentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'b2';
      credentials: B2Credentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'minio';
      credentials: MinIOCredentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'supabase';
      credentials: SupabaseCredentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'firebase';
      credentials: FirebaseCredentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    }
  | {
      provider: 'appwrite';
      credentials: AppwriteCredentials;
      visibility?: Visibility;
      retry?: Partial<RetryConfig>;
      logLevel?: LogLevel;
    };
