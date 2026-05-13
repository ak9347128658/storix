import { Readable } from 'node:stream';
import type { FileBody } from '../types/index.js';

/** Convert any supported FileBody into a Node.js Readable stream. */
export function toReadable(body: FileBody): Readable {
  if (body instanceof Readable) return body;
  if (typeof body === 'string') return Readable.from(Buffer.from(body, 'utf8'));
  if (body instanceof Blob) {
    return Readable.fromWeb(body.stream() as import('node:stream/web').ReadableStream);
  }
  return Readable.from(body instanceof Buffer ? body : Buffer.from(body));
}

/** Collect all chunks from a Readable into a single Buffer. */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/** Get the byte length of any FileBody without buffering the entire stream. */
export function getBodySize(body: FileBody): number | undefined {
  if (body instanceof Buffer) return body.byteLength;
  if (body instanceof Uint8Array) return body.byteLength;
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if (body instanceof Blob) return body.size;
  return undefined; // Readable — unknown size
}

/** Split a Buffer into chunks of at most `chunkSize` bytes. */
export function splitBuffer(buffer: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, offset + chunkSize));
  }
  return chunks;
}
