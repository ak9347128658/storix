import type { UploadOptions, UploadResult } from '../types/index.js';

/** Context passed through every middleware during an upload. */
export interface MiddlewareContext {
  options: UploadOptions;
  result?: UploadResult;
  provider: string;
  startedAt: Date;
  metadata: Record<string, unknown>;
}

/** A middleware function. Call `next()` to continue the chain. */
export type Middleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>,
) => void | Promise<void>;

/**
 * Composable middleware chain for upload operations.
 * Middleware executes in FIFO registration order (onion model).
 *
 * @example
 * ```ts
 * chain.use(async (ctx, next) => {
 *   ctx.options.metadata = { ...ctx.options.metadata, uploadedBy: 'system' };
 *   await next();
 *   console.log('Uploaded:', ctx.result?.key);
 * });
 * ```
 */
export class MiddlewareChain {
  private readonly stack: Middleware[] = [];

  /** Register a middleware. Returns `this` for chaining. */
  use(middleware: Middleware): this {
    this.stack.push(middleware);
    return this;
  }

  /**
   * Execute the chain wrapping `handler` as the innermost function.
   * `handler` performs the actual provider upload.
   */
  async execute(
    ctx: MiddlewareContext,
    handler: (ctx: MiddlewareContext) => Promise<UploadResult>,
  ): Promise<UploadResult> {
    let index = 0;

    const dispatch = async (): Promise<void> => {
      if (index < this.stack.length) {
        const middleware = this.stack[index++];
        if (middleware) await middleware(ctx, dispatch);
      } else {
        ctx.result = await handler(ctx);
      }
    };

    await dispatch();

    if (!ctx.result) {
      throw new Error('Middleware chain did not produce a result');
    }

    return ctx.result;
  }
}
