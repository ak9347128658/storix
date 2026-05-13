import { describe, it, expect, vi } from 'vitest';
import { MiddlewareChain } from '../../middleware/MiddlewareChain.js';
import type { MiddlewareContext } from '../../middleware/MiddlewareChain.js';

const makeCtx = (): MiddlewareContext => ({
  options: { key: 'test.txt', file: Buffer.from('hello') },
  provider: 'test',
  startedAt: new Date(),
  metadata: {},
});

const fakeResult = {
  key: 'test.txt',
  url: 'https://example.com/test.txt',
  provider: 'test',
};

describe('MiddlewareChain', () => {
  it('calls the handler when no middleware is registered', async () => {
    const chain = new MiddlewareChain();
    const handler = vi.fn().mockResolvedValue(fakeResult);

    const result = await chain.execute(makeCtx(), handler);
    expect(result).toEqual(fakeResult);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('executes middleware in registration order', async () => {
    const chain = new MiddlewareChain();
    const order: number[] = [];

    chain.use(async (_ctx, next) => { order.push(1); await next(); order.push(4); });
    chain.use(async (_ctx, next) => { order.push(2); await next(); order.push(3); });

    await chain.execute(makeCtx(), async () => {
      order.push(2.5);
      return fakeResult;
    });

    expect(order).toEqual([1, 2, 2.5, 3, 4]);
  });

  it('middleware can mutate context options', async () => {
    const chain = new MiddlewareChain();
    chain.use(async (ctx, next) => {
      ctx.options = { ...ctx.options, metadata: { env: 'production' } };
      await next();
    });

    const capturedCtx = makeCtx();
    await chain.execute(capturedCtx, async (ctx) => {
      expect(ctx.options.metadata).toEqual({ env: 'production' });
      return fakeResult;
    });
  });

  it('middleware can read result after next()', async () => {
    const chain = new MiddlewareChain();
    let capturedKey: string | undefined;

    chain.use(async (ctx, next) => {
      await next();
      capturedKey = ctx.result?.key;
    });

    await chain.execute(makeCtx(), async () => fakeResult);
    expect(capturedKey).toBe('test.txt');
  });

  it('use() returns this for chaining', () => {
    const chain = new MiddlewareChain();
    const result = chain.use(async (_ctx, next) => next());
    expect(result).toBe(chain);
  });
});
