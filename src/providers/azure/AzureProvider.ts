import { Readable } from 'node:stream';
import type {
  AzureCredentials,
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
  UploadOptions,
  UploadPartOptions,
  UploadResult,
  Visibility,
} from '../../types/index.js';
import { BaseProvider } from '../../core/BaseProvider.js';
import { FileNotFoundError, MultipartUploadError, ProviderError } from '../../errors/index.js';
import { toReadable, streamToBuffer } from '../../utils/index.js';

type BlobServiceClient = import('@azure/storage-blob').BlobServiceClient;
type ContainerClient = import('@azure/storage-blob').ContainerClient;

/** Azure Blob Storage provider. */
export class AzureProvider extends BaseProvider {
  public readonly providerName = 'azure';

  private readonly serviceClient: BlobServiceClient;
  private readonly containerClient: ContainerClient;
  private readonly containerName: string;
  private readonly accountName: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;

  constructor(
    credentials: AzureCredentials,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      logLevel?: LogLevel;
      defaultVisibility?: Visibility;
    },
  ) {
    super(options ?? {});
    this.containerName = credentials.containerName;
    this.accountName = credentials.accountName;
    this.cdnUrl = credentials.cdnUrl;
    this.customDomain = credentials.customDomain;

    const {
      BlobServiceClient,
      StorageSharedKeyCredential,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('@azure/storage-blob') as typeof import('@azure/storage-blob');

    if (credentials.connectionString) {
      this.serviceClient = BlobServiceClient.fromConnectionString(credentials.connectionString);
    } else {
      const credential = new StorageSharedKeyCredential(
        credentials.accountName,
        credentials.accountKey ?? '',
      );
      this.serviceClient = new BlobServiceClient(
        `https://${credentials.accountName}.blob.core.windows.net`,
        credential,
      );
    }

    this.containerClient = this.serviceClient.getContainerClient(credentials.containerName);
  }

  private buildPublicUrl(key: string): string {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${key}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${key}`;
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(options.key);
    const buffer = await streamToBuffer(toReadable(options.file));

    const visibility = this.resolveVisibility(options.visibility);

    await blockBlobClient.upload(buffer, buffer.byteLength, {
      blobHTTPHeaders: {
        blobContentType: options.contentType,
        blobCacheControl: options.cacheControl,
        blobContentDisposition: options.contentDisposition,
        blobContentEncoding: options.contentEncoding,
      },
      metadata: options.metadata,
      // Azure uses container-level access; object-level public access is the default when
      // the container was created with public blob access.
      tier: visibility === 'public' ? 'Hot' : undefined,
    });

    return {
      key: options.key,
      url: this.buildPublicUrl(options.key),
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doDelete(key: string): Promise<void> {
    try {
      await this.containerClient.getBlockBlobClient(key).delete();
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to delete "${key}"`, this.providerName, error);
    }
  }

  protected async doExists(key: string): Promise<boolean> {
    return this.containerClient.getBlockBlobClient(key).exists();
  }

  protected async doGetMetadata(key: string): Promise<FileMetadata> {
    try {
      const props = await this.containerClient.getBlockBlobClient(key).getProperties();
      return {
        key,
        size: props.contentLength ?? 0,
        contentType: props.contentType ?? 'application/octet-stream',
        lastModified: props.lastModified ?? new Date(),
        etag: props.etag?.replace(/"/g, ''),
        metadata: props.metadata,
      };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to get metadata for "${key}"`, this.providerName, error);
    }
  }

  protected async doList(options?: ListOptions): Promise<ListResult> {
    const files: FileListEntry[] = [];
    let nextCursor: string | undefined;

    const iter = this.containerClient
      .listBlobsFlat({ prefix: options?.prefix })
      .byPage({ maxPageSize: options?.limit ?? 1000, continuationToken: options?.cursor });

    for await (const page of iter) {
      for (const blob of page.segment.blobItems) {
        files.push({
          key: blob.name,
          size: blob.properties.contentLength ?? 0,
          lastModified: blob.properties.lastModified,
          etag: blob.properties.etag?.replace(/"/g, ''),
        });
      }
      nextCursor = page.continuationToken ?? undefined;
      break; // single page
    }

    return { files, nextCursor: nextCursor !== '' ? nextCursor : undefined };
  }

  protected doGetUrl(key: string): Promise<string> {
    return Promise.resolve(this.buildPublicUrl(key));
  }

  protected async doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const {
      generateBlobSASQueryParameters,
      BlobSASPermissions,
      StorageSharedKeyCredential,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('@azure/storage-blob') as typeof import('@azure/storage-blob');

    const credential = this.serviceClient.credential as import('@azure/storage-blob').StorageSharedKeyCredential;

    if (!(credential instanceof StorageSharedKeyCredential)) {
      throw new ProviderError(
        'Signed URLs require StorageSharedKeyCredential (accountName + accountKey)',
        this.providerName,
      );
    }

    const expiresIn = options?.expiresIn ?? 3600;
    const permissions = new BlobSASPermissions();

    if (options?.method === 'PUT') {
      permissions.write = true;
      permissions.create = true;
    } else {
      permissions.read = true;
    }

    const sasQueryParams = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: key,
        permissions,
        expiresOn: new Date(Date.now() + expiresIn * 1000),
        contentType: options?.contentType,
      },
      credential,
    );

    return `${this.buildPublicUrl(key)}?${sasQueryParams.toString()}`;
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    const sourceUrl = this.buildPublicUrl(options.sourceKey);
    const destClient = this.containerClient.getBlockBlobClient(options.destinationKey);

    const op = await destClient.beginCopyFromURL(sourceUrl);
    await op.pollUntilDone();

    return {
      key: options.destinationKey,
      url: this.buildPublicUrl(options.destinationKey),
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    try {
      const response = await this.containerClient.getBlockBlobClient(key).download(0);
      if (!response.readableStreamBody) throw new FileNotFoundError(key, this.providerName);
      return response.readableStreamBody as Readable;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404) throw new FileNotFoundError(key, this.providerName, error);
      throw new ProviderError(`Failed to stream "${key}"`, this.providerName, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Multipart — Azure Block Blob staged blocks
  // ---------------------------------------------------------------------------

  private readonly mpSessions = new Map<
    string,
    { key: string; blockIds: string[]; contentType?: string }
  >();

  protected doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession> {
    const uploadId = `az-mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.mpSessions.set(uploadId, { key, blockIds: [], contentType });
    return Promise.resolve({ uploadId, key });
  }

  protected async doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    const session = this.mpSessions.get(options.uploadId);
    if (!session) throw new MultipartUploadError(`Unknown uploadId: ${options.uploadId}`, this.providerName);

    const blockId = Buffer.from(`block-${options.partNumber.toString().padStart(6, '0')}`).toString('base64');
    const blockBlobClient = this.containerClient.getBlockBlobClient(session.key);
    await blockBlobClient.stageBlock(blockId, options.body, options.body.byteLength);

    session.blockIds[options.partNumber - 1] = blockId;
    return { partNumber: options.partNumber, etag: blockId };
  }

  protected async doCompleteMultipartUpload(
    session: MultipartUploadSession,
    _parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) throw new MultipartUploadError(`Unknown uploadId: ${session.uploadId}`, this.providerName);

    const blockBlobClient = this.containerClient.getBlockBlobClient(session.key);
    await blockBlobClient.commitBlockList(stored.blockIds, {
      blobHTTPHeaders: { blobContentType: stored.contentType },
    });

    this.mpSessions.delete(session.uploadId);
    return {
      key: session.key,
      url: this.buildPublicUrl(session.key),
      provider: this.providerName,
    };
  }

  protected doAbortMultipartUpload(session: MultipartUploadSession): Promise<void> {
    this.mpSessions.delete(session.uploadId);
    return Promise.resolve();
  }

  protected async doListParts(session: MultipartUploadSession): Promise<FileListEntry[]> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) return [];

    const blockBlobClient = this.containerClient.getBlockBlobClient(stored.key);
    const response = await blockBlobClient.getBlockList('uncommitted');

    return (response.uncommittedBlocks ?? []).map((b, i) => ({
      key: `${stored.key}#block-${i + 1}`,
      size: b.size,
      lastModified: new Date(),
    }));
  }
}
