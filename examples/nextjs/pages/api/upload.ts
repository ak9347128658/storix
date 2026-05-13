/**
 * Next.js API route — file upload via Storix
 *
 * Usage: POST /api/upload with multipart/form-data body containing a "file" field.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createStorage } from 'storix';
import type { UploadResult } from 'storix';

// Disable Next.js body parser so we can handle raw streams.
export const config = { api: { bodyParser: false } };

// Lazily initialised storage client.
let storage: Awaited<ReturnType<typeof createStorage>> | null = null;

async function getStorage(): Promise<Awaited<ReturnType<typeof createStorage>>> {
  if (!storage) {
    storage = await createStorage({
      provider: 'gcs',
      credentials: {
        projectId: process.env['GCS_PROJECT_ID'] ?? '',
        bucket: process.env['GCS_BUCKET'] ?? '',
        credentials: {
          client_email: process.env['GCS_CLIENT_EMAIL'] ?? '',
          private_key: (process.env['GCS_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n'),
        },
      },
      visibility: 'public',
    });
  }
  return storage;
}

interface UploadResponse {
  key: string;
  url: string;
}

interface ErrorResponse {
  error: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResponse | ErrorResponse>,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const s = await getStorage();

    // Parse the raw request stream using busboy or formidable in production.
    // Here we show a simplified stream upload for illustration:
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk as Uint8Array));
    }
    const buffer = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] ?? 'application/octet-stream';
    const key = `uploads/${Date.now()}.bin`;

    const result: UploadResult = await s.upload({ key, file: buffer, contentType });
    res.status(200).json({ key: result.key, url: result.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
}
