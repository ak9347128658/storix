import { describe, it, expect } from 'vitest';
import { detectMimeType, isImage, isText } from '../../utils/mime.js';

describe('detectMimeType', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['icon.png', 'image/png'],
    ['animation.gif', 'image/gif'],
    ['image.webp', 'image/webp'],
    ['document.pdf', 'application/pdf'],
    ['data.json', 'application/json'],
    ['script.js', 'application/javascript'],
    ['style.css', 'text/css'],
    ['archive.zip', 'application/zip'],
    ['video.mp4', 'video/mp4'],
    ['audio.mp3', 'audio/mpeg'],
  ])('detects %s → %s', (key, expected) => {
    expect(detectMimeType(key)).toBe(expected);
  });

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(detectMimeType('file.unknown123')).toBe('application/octet-stream');
    expect(detectMimeType('no-extension')).toBe('application/octet-stream');
  });

  it('handles keys with folder paths', () => {
    expect(detectMimeType('users/avatars/photo.png')).toBe('image/png');
  });
});

describe('isImage', () => {
  it('returns true for image MIME types', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isImage('image/jpeg')).toBe(true);
    expect(isImage('image/webp')).toBe(true);
  });

  it('returns false for non-image MIME types', () => {
    expect(isImage('application/pdf')).toBe(false);
    expect(isImage('text/plain')).toBe(false);
  });
});

describe('isText', () => {
  it('returns true for text MIME types', () => {
    expect(isText('text/plain')).toBe(true);
    expect(isText('text/html')).toBe(true);
    expect(isText('application/json')).toBe(true);
  });

  it('returns false for binary MIME types', () => {
    expect(isText('image/png')).toBe(false);
    expect(isText('application/octet-stream')).toBe(false);
  });
});
