import type { Readable } from 'node:stream';
import type {
  CopyOptions,
  FileListEntry,
  FileMetadata,
  ListOptions,
  ListResult,
  MultipartPartResult,
  MultipartUploadSession,
  RetryConfig,
  SignedUrlOptions,
  UploadOptions,
  UploadPartOptions,
  UploadResult,
  Visibility,
  LogLevel,
  S3Credentials,
} from '../../types/index.js';
import { BaseProvider } from '../../core/BaseProvider.js';
import { FileNotFoundError, ProviderError } from '../../errors/index.js';
import { toReadable } from '../../utils/index.js';

type S3Client = import('@aws-sdk/client-s3').S3Client;
type S3ClientConfig = import('@aws-sdk/client-s3').S3ClientConfig;

/** AWS S3 storage provider. Also works with any S3-compatible service via `endpoint`. */
export class S3Provider extends BaseProvider {
  public readonly providerName = 's3';

  /** @internal exposed for dependency injection in tests */
  protected readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;

  constructor(
    credentials: S3Credentials,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      logLevel?: LogLevel;
      defaultVisibility?: Visibility;
      /** @internal pre-built client for unit tests */
      _client?: S3Client;
    },
  ) {
    super(options ?? {});
    this.bucket = credentials.bucket;
    this.cdnUrl = credentials.cdnUrl;
    this.customDomain = credentials.customDomain;

    if (options?._client) {
      this.client = options._client;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');

      const config: S3ClientConfig = {
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      };

      if (credentials.endpoint) {
        config.endpoint = credentials.endpoint;
        config.forcePathStyle = credentials.forcePathStyle ?? true;
      }

      this.client = new S3Client(config);
    }
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const {
      PutObjectCommand,
    } = await import('@aws-sdk/client-s3');

    const visibility = this.resolveVisibility(options.visibility);
    const acl = visibility === 'public' ? 'public-read' : 'private';

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: toReadable(options.file),
        ContentType: options.contentType,
        ACL: acl,
        Metadata: options.metadata,
        ContentDisposition: options.contentDisposition,
        ContentEncoding: options.contentEncoding,
        CacheControl: options.cacheControl,
      }),
    );

    const url = await this.doGetUrl(options.key);
    return {
      key: options.key,
      url,
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doDelete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  protected async doExists(key: string): Promise<boolean> {
    try {
      await this.doGetMetadata(key);
      return true;
    } catch {
      return false;
    }
  }

  protected async doGetMetadata(key: string): Promise<FileMetadata> {
    const { HeadObjectCommand, NotFound } = await import('@aws-sdk/client-s3');
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        size: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
        lastModified: response.LastModified ?? new Date(),
        etag: response.ETag?.replace(/"/g, ''),
        metadata: response.Metadata,
      };
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === 'NotFound') {
        throw new FileNotFoundError(key, this.providerName, error);
      }
      throw new ProviderError(`Failed to get metadata for "${key}"`, this.providerName, error);
    }
  }

  protected async doList(options?: ListOptions): Promise<ListResult> {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');

    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: options?.prefix,
        MaxKeys: options?.limit,
        ContinuationToken: options?.cursor,
        Delimiter: options?.delimiter,
      }),
    );

    const files: FileListEntry[] = (response.Contents ?? []).map((obj) => ({
      key: obj.Key ?? '',
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(),
      etag: obj.ETag?.replace(/"/g, ''),
    }));

    return {
      files,
      nextCursor: response.NextContinuationToken,
      prefixes: response.CommonPrefixes?.map((p) => p.Prefix ?? ''),
    };
  }

  protected async doGetUrl(key: string): Promise<string> {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${key}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;

    // Attempt to read endpoint from client config for custom S3-compatible services
    const clientConfig = this.client.config as { endpoint?: string | (() => Promise<{ url: URL }>) };
    if (typeof clientConfig.endpoint === 'string') {
      return `${clientConfig.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    }

    const { endpoint: resolvedEndpoint } = this.client.config as { endpoint?: () => Promise<{ url: URL }> };
    if (typeof resolvedEndpoint === 'function') {
      const ep = await resolvedEndpoint();
      return `${ep.url.origin}/${this.bucket}/${key}`;
    }

    const region = (this.client.config as { region: string }).region;
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  protected async doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const method = options?.method ?? 'GET';
    const expiresIn = options?.expiresIn ?? 3600;

    const command =
      method === 'PUT'
        ? new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: options?.contentType,
          })
        : new GetObjectCommand({ Bucket: this.bucket, Key: key });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3');

    const visibility = this.resolveVisibility(options.visibility);
    const acl = visibility === 'public' ? 'public-read' : 'private';

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${options.sourceKey}`,
        Key: options.destinationKey,
        ACL: acl,
        Metadata: options.metadata,
        ContentType: options.contentType,
        MetadataDirective: options.metadata ?? options.contentType ? 'REPLACE' : 'COPY',
      }),
    );

    const url = await this.doGetUrl(options.destinationKey);
    return {
      key: options.destinationKey,
      url,
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new FileNotFoundError(key, this.providerName);
    }

    return response.Body as unknown as Readable;
  }

  protected async doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession> {
    const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );

    return { uploadId: response.UploadId ?? '', key };
  }

  protected async doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    const { UploadPartCommand } = await import('@aws-sdk/client-s3');
    const response = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: options.key,
        UploadId: options.uploadId,
        PartNumber: options.partNumber,
        Body: options.body,
      }),
    );

    return { partNumber: options.partNumber, etag: response.ETag?.replace(/"/g, '') ?? '' };
  }

  protected async doCompleteMultipartUpload(
    session: MultipartUploadSession,
    parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    const { CompleteMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: session.key,
        UploadId: session.uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );

    const url = await this.doGetUrl(session.key);
    return { key: session.key, url, provider: this.providerName };
  }

  protected async doAbortMultipartUpload(session: MultipartUploadSession): Promise<void> {
    const { AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: session.key,
        UploadId: session.uploadId,
      }),
    );
  }

  protected async doListParts(session: MultipartUploadSession): Promise<FileListEntry[]> {
    const { ListPartsCommand } = await import('@aws-sdk/client-s3');
    const response = await this.client.send(
      new ListPartsCommand({
        Bucket: this.bucket,
        Key: session.key,
        UploadId: session.uploadId,
      }),
    );

    return (response.Parts ?? []).map((p) => ({
      key: `${session.key}#part-${p.PartNumber ?? 0}`,
      size: p.Size ?? 0,
      lastModified: p.LastModified ?? new Date(),
      etag: p.ETag?.replace(/"/g, ''),
    }));
  }
}
