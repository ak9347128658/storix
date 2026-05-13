import type { Readable } from 'node:stream';
import type {
  CopyOptions,
  FileListEntry,
  FileMetadata,
  ListOptions,
  ListResult,
  LogLevel,
  MultipartPartResult,
  MultipartUploadSession,
  RetryConfig,
  SignedUrlOptions,
  SpacesCredentials,
  UploadOptions,
  UploadPartOptions,
  UploadResult,
  Visibility,
} from '../../types/index.js';
import { BaseProvider } from '../../core/BaseProvider.js';
import { FileNotFoundError, ProviderError } from '../../errors/index.js';
import { toReadable } from '../../utils/index.js';

/**
 * DigitalOcean Spaces provider.
 * Spaces is S3-compatible so this adapter uses @aws-sdk/client-s3 pointed at the DO endpoint.
 */
export class SpacesProvider extends BaseProvider {
  public readonly providerName = 'spaces';

  private readonly client: import('@aws-sdk/client-s3').S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;

  constructor(
    credentials: SpacesCredentials,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      logLevel?: LogLevel;
      defaultVisibility?: Visibility;
    },
  ) {
    super(options ?? {});
    this.bucket = credentials.bucket;
    this.region = credentials.region;
    this.cdnUrl = credentials.cdnUrl;
    this.customDomain = credentials.customDomain;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3Client } = require('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');
    const endpoint =
      credentials.endpoint ?? `https://${credentials.region}.digitaloceanspaces.com`;

    this.client = new S3Client({
      region: credentials.region,
      endpoint,
      forcePathStyle: false,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
  }

  private buildPublicUrl(key: string): string {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${key}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    return `https://${this.bucket}.${this.region}.digitaloceanspaces.com/${key}`;
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const visibility = this.resolveVisibility(options.visibility);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: options.key,
        Body: toReadable(options.file),
        ContentType: options.contentType,
        ACL: visibility === 'public' ? 'public-read' : 'private',
        Metadata: options.metadata,
        ContentDisposition: options.contentDisposition,
        ContentEncoding: options.contentEncoding,
        CacheControl: options.cacheControl,
      }),
    );

    return {
      key: options.key,
      url: this.buildPublicUrl(options.key),
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

    return {
      files: (response.Contents ?? []).map((obj) => ({
        key: obj.Key ?? '',
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
        etag: obj.ETag?.replace(/"/g, ''),
      })),
      nextCursor: response.NextContinuationToken,
      prefixes: response.CommonPrefixes?.map((p) => p.Prefix ?? ''),
    };
  }

  protected doGetUrl(key: string): Promise<string> {
    return Promise.resolve(this.buildPublicUrl(key));
  }

  protected async doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const command =
      options?.method === 'PUT'
        ? new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: options.contentType })
        : new GetObjectCommand({ Bucket: this.bucket, Key: key });

    return getSignedUrl(this.client, command, { expiresIn: options?.expiresIn ?? 3600 });
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
    const visibility = this.resolveVisibility(options.visibility);

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${options.sourceKey}`,
        Key: options.destinationKey,
        ACL: visibility === 'public' ? 'public-read' : 'private',
        Metadata: options.metadata,
        ContentType: options.contentType,
        MetadataDirective: options.metadata ?? options.contentType ? 'REPLACE' : 'COPY',
      }),
    );

    return {
      key: options.destinationKey,
      url: this.buildPublicUrl(options.destinationKey),
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new FileNotFoundError(key, this.providerName);
    return response.Body as unknown as Readable;
  }

  protected async doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession> {
    const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    const response = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
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
        MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
      }),
    );
    return { key: session.key, url: this.buildPublicUrl(session.key), provider: this.providerName };
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
      new ListPartsCommand({ Bucket: this.bucket, Key: session.key, UploadId: session.uploadId }),
    );
    return (response.Parts ?? []).map((p) => ({
      key: `${session.key}#part-${p.PartNumber ?? 0}`,
      size: p.Size ?? 0,
      lastModified: p.LastModified ?? new Date(),
      etag: p.ETag?.replace(/"/g, ''),
    }));
  }
}
