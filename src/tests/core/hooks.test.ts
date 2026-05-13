import { describe, it, expect, vi } from 'vitest';
import { HookSystem } from '../../hooks/HookSystem.js';

describe('HookSystem', () => {
  it('calls registered handlers in order', async () => {
    const system = new HookSystem();
    const order: number[] = [];

    system.on('before:upload', () => { order.push(1); });
    system.on('before:upload', () => { order.push(2); });
    system.on('before:upload', () => { order.push(3); });

    await system.emit('before:upload', {
      key: 'test.txt',
      file: Buffer.from('x'),
    });

    expect(order).toEqual([1, 2, 3]);
  });

  it('awaits async handlers before continuing', async () => {
    const system = new HookSystem();
    const log: string[] = [];

    system.on('after:upload', async (payload) => {
      await new Promise<void>((r) => setTimeout(r, 10));
      log.push(`handled:${payload.key}`);
    });

    await system.emit('after:upload', {
      key: 'file.png',
      url: 'https://example.com/file.png',
      provider: 's3',
    });

    expect(log).toEqual(['handled:file.png']);
  });

  it('removes a handler with off()', async () => {
    const system = new HookSystem();
    const handler = vi.fn();

    system.on('before:delete', handler);
    system.off('before:delete', handler);

    await system.emit('before:delete', { key: 'old.txt' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('removeAllListeners clears all handlers for an event', async () => {
    const system = new HookSystem();
    const h1 = vi.fn();
    const h2 = vi.fn();

    system.on('before:list', h1);
    system.on('before:list', h2);
    system.removeAllListeners('before:list');

    await system.emit('before:list', { prefix: 'images/' });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('removeAllListeners() with no argument clears all events', async () => {
    const system = new HookSystem();
    const h = vi.fn();
    system.on('before:upload', h);
    system.on('before:delete', h);
    system.removeAllListeners();

    await system.emit('before:upload', { key: 'x', file: Buffer.from('') });
    await system.emit('before:delete', { key: 'x' });
    expect(h).not.toHaveBeenCalled();
  });
});
