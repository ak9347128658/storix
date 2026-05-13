import { createHash } from 'node:crypto';

/** Compute a hex-encoded MD5 hash of a buffer — used for ETag verification. */
export function md5Hex(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

/** Generate a random UUID v4 (crypto-quality). */
export function randomId(): string {
  return crypto.randomUUID();
}
