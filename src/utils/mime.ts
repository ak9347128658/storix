/** Minimal MIME type lookup table covering common storage file types. */
const MIME_MAP: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  ts: 'application/typescript',
  jsx: 'application/javascript',
  tsx: 'application/typescript',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/x-yaml',
  yml: 'application/x-yaml',
  md: 'text/markdown',
  // Archives
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  // Fonts
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  // Data
  parquet: 'application/vnd.apache.parquet',
  avro: 'application/avro',
  // Binary fallback
  bin: 'application/octet-stream',
};

/**
 * Detect the MIME type from a file key / path by inspecting its extension.
 * Returns `application/octet-stream` when the extension is not recognised.
 */
export function detectMimeType(key: string): string {
  const parts = key.split('.');
  const ext = parts.length > 1 ? (parts[parts.length - 1] ?? '').toLowerCase() : '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

/** Return `true` when the MIME type represents a publicly renderable image. */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/** Return `true` when the MIME type represents a text-based format. */
export function isText(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json';
}
