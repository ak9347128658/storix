# StoreBridge

**A unified, production-ready cloud storage SDK for Node.js and TypeScript.**

Switch storage providers by changing a single config line — no code changes required.

[![CI](https://github.com/ak9347128658/storix/actions/workflows/ci.yml/badge.svg)](https://github.com/ak9347128658/storix/actions)
[![npm version](https://badge.fury.io/js/storebridge.svg)](https://badge.fury.io/js/storebridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/codecov/c/github/ak9347128658/storix)](https://codecov.io/gh/ak9347128658/storix)

---

## Table of Contents

- [Features](#features)
- [Provider Support](#provider-support)
- [Feature Matrix](#feature-matrix)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [upload](#upload)
  - [delete](#delete)
  - [exists](#exists)
  - [getMetadata](#getmetadata)
  - [list](#list)
  - [getUrl](#geturl)
  - [getSignedUrl](#getsignedurl)
  - [copy / move / rename](#copy--move--rename)
  - [getStream / getBuffer](#getstream--getbuffer)
  - [Multipart Upload](#multipart-upload)
- [Middleware](#middleware)
- [Hooks / Events](#hooks--events)
- [Error Handling](#error-handling)
- [Provider Examples](#provider-examples)
- [Framework Integrations](#framework-integrations)
- [Advanced Usage](#advanced-usage)
- [Performance Notes](#performance-notes)
- [FAQ](#faq)
- [Contributing](#contributing)

---

## Features

- **10 storage providers** — one consistent API
- **TypeScript-first** — 100% typed, no `any`
- **ESM + CommonJS** — tree-shakable, works everywhere
- **Retry system** — exponential backoff with full jitter
- **Middleware** — composable upload pipeline (metadata injection, compression, etc.)
- **Hooks** — lifecycle events (before/after upload, delete, copy, etc.)
- **Multipart upload** — high-level helper + low-level lifecycle API
- **Signed / presigned URLs** — GET and PUT
- **Streaming** — upload and download as Node.js streams
- **MIME auto-detection** — from file extension
- **CDN / custom domain** support
- **Lazy provider loading** — only the SDK you use is imported
- **Zero runtime dependencies** (provider SDKs are peer dependencies)

---

## Provider Support

| Provider              | Package Required                                              |
| --------------------- | ------------------------------------------------------------- |
| AWS S3                | `@aws-sdk/client-s3` `@aws-sdk/s3-request-presigner`         |
| Cloudflare R2         | `@aws-sdk/client-s3` `@aws-sdk/s3-request-presigner`         |
| Google Cloud Storage  | `@google-cloud/storage`                                       |
| Azure Blob Storage    | `@azure/storage-blob`                                         |
| DigitalOcean Spaces   | `@aws-sdk/client-s3` `@aws-sdk/s3-request-presigner`         |
| Backblaze B2          | `@aws-sdk/client-s3` `@aws-sdk/s3-request-presigner`         |
| MinIO                 | `minio`                                                       |
| Supabase Storage      | `@supabase/supabase-js`                                       |
| Firebase Storage      | `firebase-admin`                                              |
| Appwrite Storage      | `node-appwrite`                                               |

---

## Feature Matrix

| Feature              | S3 | R2 | GCS | Azure | Spaces | B2 | MinIO | Supabase | Firebase | Appwrite |
| -------------------- | -- | -- | --- | ----- | ------ | -- | ----- | -------- | -------- | -------- |
| Upload               | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| Delete               | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| Exists               | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| Metadata             | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| List                 | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| Signed URLs          | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ⚠️       |
| Copy                 | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| Move                 | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| Stream Upload        | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| Multipart Upload     | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |
| ACL / Visibility     | ✅ | ✅ | ✅  | ⚠️    | ✅     | ✅ | ⚠️    | ✅       | ✅       | ✅       |
| CDN / Custom Domain  | ✅ | ✅ | ✅  | ✅    | ✅     | ✅ | ✅    | ✅       | ✅       | ✅       |

> ⚠️ = supported with limitations (see provider notes)

---

## Installation

```bash
# Core (no provider SDK)
npm install storebridge

# Install only the SDK you need:
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner   # S3 / R2 / Spaces / B2
npm install @google-cloud/storage                               # GCS / Firebase
npm install @azure/storage-blob                                 # Azure
npm install minio                                               # MinIO
npm install @supabase/supabase-js                               # Supabase
npm install firebase-admin                                      # Firebase
npm install node-appwrite                                       # Appwrite
```

---

## Quick Start

```typescript
import { createStorage } from 'storebridge';

const storage = await createStorage({
  provider: 's3',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1',
    bucket: 'my-bucket',
  },
  visibility: 'private',
});

// Upload a file
const result = await storage.upload({
  key: 'users/profile.png',
  file: imageBuffer,
  contentType: 'image/png',
});
console.log(result.url); // https://my-bucket.s3.us-east-1.amazonaws.com/users/profile.png

// Get a 1-hour signed URL
const url = await storage.getSignedUrl('users/profile.png', { expiresIn: 3600 });

// Check existence
const exists = await storage.exists('users/profile.png');

// Delete a file
await storage.delete({ key: 'users/profile.png' });
```

---

## Configuration

All providers share the same top-level config shape; credentials differ per provider.

```typescript
type StorageConfig = {
  provider: StorageProvider;         // 's3' | 'r2' | 'gcs' | 'azure' | ...
  credentials: ProviderCredentials;  // provider-specific object
  visibility?: 'public' | 'private'; // default visibility (default: 'private')
  retry?: {
    maxRetries?: number;             // default: 3
    baseDelay?: number;              // ms, default: 200
    maxDelay?: number;               // ms, default: 10000
  };
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'; // default: 'warn'
};
```

---

## API Reference

### `upload`

```typescript
const result = await storage.upload({
  key: 'images/photo.jpg',       // required — storage path
  file: buffer,                   // Buffer | Readable | Uint8Array | string | Blob
  contentType: 'image/jpeg',      // optional — auto-detected from key extension
  visibility: 'public',           // optional — overrides default
  metadata: { author: 'alice' },  // optional — arbitrary key/value pairs
  cacheControl: 'max-age=31536000',
  onProgress: (uploaded, total) => console.log(`${uploaded}/${total}`),
});
// result: { key, url, etag?, size?, contentType?, metadata?, provider }
```

### `delete`

```typescript
await storage.delete({ key: 'images/photo.jpg' });
```

### `exists`

```typescript
const exists = await storage.exists('images/photo.jpg');
```

### `getMetadata`

```typescript
const meta = await storage.getMetadata('images/photo.jpg');
// meta: { key, size, contentType, lastModified, etag?, metadata? }
```

### `list`

```typescript
const { files, nextCursor } = await storage.list({
  prefix: 'images/',
  limit: 50,
  cursor: previousNextCursor,
  delimiter: '/',  // treat '/' as folder delimiter
});
```

### `getUrl`

Returns the public URL for a file. Only meaningful for publicly accessible objects.

```typescript
const url = await storage.getUrl('public/logo.png');
```

### `getSignedUrl`

```typescript
// GET (download) — default
const url = await storage.getSignedUrl('private/report.pdf', { expiresIn: 900 });

// PUT (upload) — let clients upload directly to storage
const putUrl = await storage.getSignedUrl('uploads/raw.csv', {
  method: 'PUT',
  expiresIn: 300,
  contentType: 'text/csv',
});
```

### `copy / move / rename`

```typescript
// Copy
await storage.copy({
  sourceKey: 'original.png',
  destinationKey: 'copies/backup.png',
  visibility: 'public',
});

// Move (copy + delete source)
await storage.move({
  sourceKey: 'temp/upload.png',
  destinationKey: 'final/upload.png',
});

// Rename (alias for move within same bucket)
await storage.rename('old-name.png', 'new-name.png');
```

### `getStream / getBuffer`

```typescript
// Stream (memory-efficient for large files)
const stream = await storage.getStream('videos/intro.mp4');
stream.pipe(res);

// Buffer (convenient for small files)
const buffer = await storage.getBuffer('config/settings.json');
const text = buffer.toString('utf8');
```

### Multipart Upload

#### High-level helper

```typescript
const result = await storage.uploadMultipart(
  { key: 'large/dataset.parquet', file: largeBuffer },
  10 * 1024 * 1024, // 10 MB parts
);
```

#### Low-level lifecycle

```typescript
// 1. Initiate
const session = await storage.createMultipartUpload('huge.bin', 'application/octet-stream');

// 2. Upload parts (can be parallel)
const parts = await Promise.all(
  chunks.map((chunk, i) =>
    storage.uploadPart({
      uploadId: session.uploadId,
      key: session.key,
      partNumber: i + 1,
      body: chunk,
    })
  )
);

// 3. Complete
const result = await storage.completeMultipartUpload(session, parts);

// Or abort if something goes wrong
await storage.abortMultipartUpload(session);
```

---

## Middleware

Middleware runs around every `upload()` call in an onion model.

```typescript
// Inject metadata
storage.use(async (ctx, next) => {
  ctx.options.metadata = {
    ...ctx.options.metadata,
    uploadedBy: 'user-123',
    uploadedAt: new Date().toISOString(),
  };
  await next();
});

// Timing
storage.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`Upload took ${Date.now() - start}ms`);
});

// Force key prefix
storage.use(async (ctx, next) => {
  if (!ctx.options.key.startsWith('uploads/')) {
    ctx.options = { ...ctx.options, key: `uploads/${ctx.options.key}` };
  }
  await next();
});
```

---

## Hooks / Events

Hooks fire on all operations and are awaited sequentially.

```typescript
// Log every upload
storage.on('after:upload', (result) => {
  console.log(`Uploaded: ${result.key} (${result.provider})`);
});

// Error tracking
storage.on('error', ({ operation, error }) => {
  Sentry.captureException(error, { extra: { operation } });
});

// Unsubscribe
const handler = (result) => console.log(result);
storage.on('after:upload', handler);
storage.off('after:upload', handler);
```

Available events: `before:upload`, `after:upload`, `before:delete`, `after:delete`,
`before:copy`, `after:copy`, `before:move`, `after:move`, `before:list`, `after:list`,
`before:getSignedUrl`, `after:getSignedUrl`, `error`.

---

## Error Handling

All errors extend `StorixError` and carry a `code`, `statusCode`, `provider`, and `originalError`.

```typescript
import {
  StorixError,
  FileNotFoundError,
  PermissionError,
  MaxRetriesExceededError,
  ValidationError,
} from 'storebridge';

try {
  await storage.getMetadata('missing.png');
} catch (err) {
  if (err instanceof FileNotFoundError) {
    console.log(err.key);       // 'missing.png'
    console.log(err.statusCode); // 404
    console.log(err.provider);   // 's3'
  } else if (err instanceof MaxRetriesExceededError) {
    console.log(err.attempts);  // number of attempts made
  } else if (err instanceof StorixError) {
    console.log(err.code);      // e.g. 'PROVIDER_ERROR'
  }
}
```

---

## Provider Examples

### AWS S3

```typescript
const storage = await createStorage({
  provider: 's3',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1',
    bucket: 'my-bucket',
    cdnUrl: 'https://cdn.example.com',           // optional CDN prefix
    customDomain: 'https://files.example.com',   // optional custom domain
  },
  visibility: 'public',
});
```

### Cloudflare R2

```typescript
const storage = await createStorage({
  provider: 'r2',
  credentials: {
    accountId: process.env.CF_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: 'my-bucket',
    cdnUrl: 'https://pub-xxx.r2.dev',
  },
});
```

### Google Cloud Storage

```typescript
const storage = await createStorage({
  provider: 'gcs',
  credentials: {
    projectId: 'my-gcp-project',
    bucket: 'my-bucket',
    credentials: {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
  },
  visibility: 'public',
});
```

### Azure Blob Storage

```typescript
const storage = await createStorage({
  provider: 'azure',
  credentials: {
    accountName: process.env.AZURE_ACCOUNT_NAME,
    accountKey: process.env.AZURE_ACCOUNT_KEY,
    containerName: 'uploads',
  },
});
```

### DigitalOcean Spaces

```typescript
const storage = await createStorage({
  provider: 'spaces',
  credentials: {
    accessKeyId: process.env.DO_ACCESS_KEY,
    secretAccessKey: process.env.DO_SECRET_KEY,
    region: 'nyc3',
    bucket: 'my-space',
    cdnUrl: 'https://my-space.nyc3.cdn.digitaloceanspaces.com',
  },
  visibility: 'public',
});
```

### Backblaze B2

```typescript
const storage = await createStorage({
  provider: 'b2',
  credentials: {
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
    bucket: 'my-bucket',
    region: 'us-west-004',
  },
});
```

### MinIO

```typescript
const storage = await createStorage({
  provider: 'minio',
  credentials: {
    endPoint: 'minio.example.com',
    port: 9000,
    useSSL: true,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucket: 'my-bucket',
    region: 'us-east-1',
  },
});
```

### Supabase Storage

```typescript
const storage = await createStorage({
  provider: 'supabase',
  credentials: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: 'avatars',
  },
  visibility: 'public',
});
```

### Firebase Storage

```typescript
const storage = await createStorage({
  provider: 'firebase',
  credentials: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    bucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
    serviceAccount: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),
  },
  visibility: 'private',
});
```

### Appwrite Storage

```typescript
const storage = await createStorage({
  provider: 'appwrite',
  credentials: {
    endpoint: 'https://cloud.appwrite.io/v1',
    projectId: process.env.APPWRITE_PROJECT_ID,
    apiKey: process.env.APPWRITE_API_KEY,
    bucketId: process.env.APPWRITE_BUCKET_ID,
  },
  visibility: 'public',
});
```

---

## Framework Integrations

See the `examples/` directory for full, runnable examples.

| Framework    | Location                          |
| ------------ | --------------------------------- |
| Express.js   | `examples/express/index.ts`       |
| Next.js      | `examples/nextjs/pages/api/upload.ts` |
| NestJS       | `examples/nestjs/storage.module.ts` |

---

## Advanced Usage

### Custom provider

```typescript
import { BaseProvider, createStorageFromProvider } from 'storebridge';

class MyProvider extends BaseProvider {
  readonly providerName = 'my-provider';

  protected async doUpload(options) { /* ... */ }
  // implement remaining abstract methods ...
}

const storage = createStorageFromProvider(new MyProvider({ logLevel: 'info' }));
```

### Direct upload from the browser (presigned PUT)

```typescript
// Server — generate a signed PUT URL
const uploadUrl = await storage.getSignedUrl('uploads/avatar.png', {
  method: 'PUT',
  contentType: 'image/png',
  expiresIn: 300,
});

// Client — fetch PUT directly to storage
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'image/png' },
});
```

### Progress tracking

```typescript
const totalBytes = buffer.byteLength;
await storage.upload({
  key: 'videos/intro.mp4',
  file: buffer,
  onProgress: (uploaded, total) => {
    process.stdout.write(`\r${Math.round((uploaded / total) * 100)}%`);
  },
});
```

---

## Performance Notes

- **Lazy provider loading** — provider SDKs are dynamically imported on first use, so your app startup is not slowed by SDKs you don't instantiate.
- **Retry back-off** uses full jitter to avoid thundering herd problems.
- **Multipart uploads** should be used for files > 10 MB. Use `uploadMultipart()` or the low-level lifecycle API.
- **Streaming** (`getStream`) is more memory-efficient than `getBuffer` for files > 50 MB.
- **Middleware** executes synchronously in series — keep handlers lightweight to avoid blocking the upload path.

---

## FAQ

**Q: Can I use multiple providers in the same application?**
Yes. Just call `createStorage()` multiple times with different configs.

```typescript
const s3 = await createStorage({ provider: 's3', credentials: { ... } });
const gcs = await createStorage({ provider: 'gcs', credentials: { ... } });
```

**Q: Does Storix work in edge runtimes (Cloudflare Workers, Vercel Edge)?**
Core utilities are runtime-agnostic. Provider adapters that use Node.js-specific APIs (streams, `crypto`) require a Node.js-compatible runtime. R2 via `@aws-sdk/client-s3` works in Workers with the `aws4fetch` adapter.

**Q: How do I set ACLs per file?**
Pass `visibility: 'public' | 'private'` in the `UploadOptions`. The global default is set in `StorageConfig`.

**Q: Is there a size limit for uploads?**
Storix itself imposes no size limit. Provider limits apply (e.g. S3 single PUT max is 5 GB; use multipart for larger files).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding conventions, and the PR process.

```bash
git clone https://github.com/ak9347128658/storix.git
cd storebridge
npm install
npm run build
npm test
```

---

## License

MIT © [Asif Khan](https://github.com/ak9347128658)
