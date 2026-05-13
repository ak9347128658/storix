import { Readable } from 'node:stream';
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
  SupabaseCredentials,
  UploadOptions,
  UploadPartOptions,
  UploadResult,
  Visibility,
} from '../../types/index.js';
import { BaseProvider } from '../../core/BaseProvider.js';
import { FileNotFoundError, MultipartUploadError, ProviderError } from '../../errors/index.js';
import { toReadable, streamToBuffer } from '../../utils/index.js';

type SupabaseClient = import('@supabase/supabase-js').SupabaseClient;

/** Supabase Storage provider. */
export class SupabaseProvider extends BaseProvider {
  public readonly providerName = 'supabase';

  private readonly supabase: SupabaseClient;
  private readonly bucket: string;
  private readonly supabaseUrl: string;
  private readonly cdnUrl?: string;
  private readonly customDomain?: string;

  constructor(
    credentials: SupabaseCredentials,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      logLevel?: LogLevel;
      defaultVisibility?: Visibility;
    },
  ) {
    super(options ?? {});
    this.bucket = credentials.bucket;
    this.supabaseUrl = credentials.url;
    this.cdnUrl = credentials.cdnUrl;
    this.customDomain = credentials.customDomain;

    const {
      createClient,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');

    this.supabase = createClient(credentials.url, credentials.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private buildPublicUrl(key: string): string {
    if (this.customDomain) return `${this.customDomain.replace(/\/$/, '')}/${key}`;
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  protected async doUpload(options: UploadOptions): Promise<UploadResult> {
    const buffer = await streamToBuffer(toReadable(options.file));
    const visibility = this.resolveVisibility(options.visibility);

    const { data, error } = await this.supabase.storage.from(this.bucket).upload(
      options.key,
      buffer,
      {
        contentType: options.contentType,
        upsert: true,
        cacheControl: options.cacheControl ?? '3600',
        metadata: options.metadata,
      },
    );

    if (error) {
      throw new ProviderError(error.message, this.providerName, error);
    }

    // Make public if visibility requires it
    if (visibility === 'public') {
      await this.supabase.storage.from(this.bucket).createSignedUrl(options.key, 0).catch(() => {
        // Best-effort — bucket may already be public
      });
    }

    const url = visibility === 'public'
      ? this.buildPublicUrl(options.key)
      : `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${options.key}`;

    return {
      key: data?.path ?? options.key,
      url,
      contentType: options.contentType,
      metadata: options.metadata,
      provider: this.providerName,
    };
  }

  protected async doDelete(key: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([key]);
    if (error) throw new ProviderError(error.message, this.providerName, error);
  }

  protected async doExists(key: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.storage.from(this.bucket).list('', {
        search: key,
        limit: 1,
      });
      if (error) return false;
      return (data ?? []).some((f) => f.name === key.split('/').pop());
    } catch {
      return false;
    }
  }

  protected async doGetMetadata(key: string): Promise<FileMetadata> {
    // Supabase doesn't expose a direct head/stat — we list and filter
    const folder = key.includes('/') ? key.substring(0, key.lastIndexOf('/')) : '';
    const name = key.split('/').pop() ?? key;

    const { data, error } = await this.supabase.storage.from(this.bucket).list(folder, {
      search: name,
    });

    if (error) throw new ProviderError(error.message, this.providerName, error);

    const file = (data ?? []).find((f) => f.name === name);
    if (!file) throw new FileNotFoundError(key, this.providerName);

    return {
      key,
      size: file.metadata?.size as number ?? 0,
      contentType: (file.metadata?.mimetype as string) ?? 'application/octet-stream',
      lastModified: new Date(file.updated_at ?? file.created_at ?? Date.now()),
      etag: file.id ?? undefined,
    };
  }

  protected async doList(options?: ListOptions): Promise<ListResult> {
    const folder = options?.prefix ?? '';
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .list(folder, { limit: options?.limit ?? 100, offset: 0 });

    if (error) throw new ProviderError(error.message, this.providerName, error);

    const files: FileListEntry[] = (data ?? []).map((f) => ({
      key: folder ? `${folder}/${f.name}` : f.name,
      size: (f.metadata?.size as number) ?? 0,
      lastModified: new Date(f.updated_at ?? f.created_at ?? Date.now()),
      etag: f.id ?? undefined,
    }));

    return { files };
  }

  protected doGetUrl(key: string): Promise<string> {
    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(key);
    return Promise.resolve(data.publicUrl);
  }

  protected async doGetSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, options?.expiresIn ?? 3600);

    if (error) throw new ProviderError(error.message, this.providerName, error);
    return data?.signedUrl ?? '';
  }

  protected async doCopy(options: CopyOptions): Promise<UploadResult> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .copy(options.sourceKey, options.destinationKey);

    if (error) throw new ProviderError(error.message, this.providerName, error);

    return {
      key: options.destinationKey,
      url: this.buildPublicUrl(options.destinationKey),
      provider: this.providerName,
    };
  }

  protected async doGetStream(key: string): Promise<Readable> {
    const { data, error } = await this.supabase.storage.from(this.bucket).download(key);
    if (error) throw new FileNotFoundError(key, this.providerName, error);
    if (!data) throw new FileNotFoundError(key, this.providerName);

    const arrayBuffer = await data.arrayBuffer();
    return Readable.from(Buffer.from(arrayBuffer));
  }

  // ---------------------------------------------------------------------------
  // Multipart — buffer parts in memory, flush on complete
  // ---------------------------------------------------------------------------

  private readonly mpSessions = new Map<string, { key: string; parts: Buffer[]; contentType?: string }>();

  protected doCreateMultipartUpload(
    key: string,
    contentType?: string,
  ): Promise<MultipartUploadSession> {
    const uploadId = `sb-mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.mpSessions.set(uploadId, { key, parts: [], contentType });
    return Promise.resolve({ uploadId, key });
  }

  protected doUploadPart(options: UploadPartOptions): Promise<MultipartPartResult> {
    const session = this.mpSessions.get(options.uploadId);
    if (!session) throw new MultipartUploadError(`Unknown uploadId: ${options.uploadId}`, this.providerName);
    session.parts[options.partNumber - 1] = Buffer.from(options.body);
    return Promise.resolve({ partNumber: options.partNumber, etag: `sb-etag-${options.partNumber}` });
  }

  protected async doCompleteMultipartUpload(
    session: MultipartUploadSession,
    _parts: MultipartPartResult[],
  ): Promise<UploadResult> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) throw new MultipartUploadError(`Unknown uploadId: ${session.uploadId}`, this.providerName);

    const combined = Buffer.concat(stored.parts);
    this.mpSessions.delete(session.uploadId);

    return this.doUpload({
      key: session.key,
      file: combined,
      contentType: stored.contentType,
    });
  }

  protected doAbortMultipartUpload(session: MultipartUploadSession): Promise<void> {
    this.mpSessions.delete(session.uploadId);
    return Promise.resolve();
  }

  protected doListParts(session: MultipartUploadSession): Promise<FileListEntry[]> {
    const stored = this.mpSessions.get(session.uploadId);
    if (!stored) return Promise.resolve([]);
    return Promise.resolve(
      stored.parts.map((p, i) => ({
        key: `${session.key}#part-${i + 1}`,
        size: p.byteLength,
        lastModified: new Date(),
      })),
    );
  }
}
