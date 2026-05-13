import type { StorageConfig } from '../types/index.js';
import { validateConfig } from '../validators/index.js';
import { StorageClient } from './StorageClient.js';
import type { IStorageProvider } from '../types/index.js';

/** Lazy provider loader — only the selected provider SDK is imported. */
async function loadProvider(config: StorageConfig): Promise<IStorageProvider> {
  switch (config.provider) {
    case 's3': {
      const { S3Provider } = await import('../providers/s3/S3Provider.js');
      return new S3Provider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'r2': {
      const { R2Provider } = await import('../providers/r2/R2Provider.js');
      return new R2Provider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'gcs': {
      const { GCSProvider } = await import('../providers/gcs/GCSProvider.js');
      return new GCSProvider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'azure': {
      const { AzureProvider } = await import('../providers/azure/AzureProvider.js');
      return new AzureProvider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'spaces': {
      const { SpacesProvider } = await import('../providers/spaces/SpacesProvider.js');
      return new SpacesProvider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'b2': {
      const { B2Provider } = await import('../providers/b2/B2Provider.js');
      return new B2Provider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'minio': {
      const { MinIOProvider } = await import('../providers/minio/MinIOProvider.js');
      return new MinIOProvider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'supabase': {
      const { SupabaseProvider } = await import('../providers/supabase/SupabaseProvider.js');
      return new SupabaseProvider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'firebase': {
      const { FirebaseProvider } = await import('../providers/firebase/FirebaseProvider.js');
      return new FirebaseProvider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
    case 'appwrite': {
      const { AppwriteProvider } = await import('../providers/appwrite/AppwriteProvider.js');
      return new AppwriteProvider(config.credentials, {
        retryConfig: config.retry,
        logLevel: config.logLevel,
        defaultVisibility: config.visibility,
      });
    }
  }
}

/**
 * Create and configure a `StorageClient` for the specified provider.
 *
 * Only the selected provider's SDK is dynamically imported, keeping
 * the initial bundle lean (tree-shaking + lazy loading).
 *
 * @example
 * ```ts
 * const storage = await createStorage({
 *   provider: 's3',
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *     region: 'us-east-1',
 *     bucket: 'my-bucket',
 *   },
 *   visibility: 'public',
 * });
 * ```
 */
export async function createStorage(config: StorageConfig): Promise<StorageClient> {
  validateConfig(config);
  const provider = await loadProvider(config);
  return new StorageClient(provider);
}

/**
 * Synchronous variant — useful when you already have an instantiated provider.
 *
 * @example
 * ```ts
 * const provider = new S3Provider(credentials);
 * const storage = createStorageFromProvider(provider);
 * ```
 */
export function createStorageFromProvider(provider: IStorageProvider): StorageClient {
  return new StorageClient(provider);
}
