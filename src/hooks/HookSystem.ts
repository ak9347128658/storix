import type { UploadOptions, UploadResult, DeleteOptions, ListResult } from '../types/index.js';

/** All event names emitted by Storix. */
export type HookEvent =
  | 'before:upload'
  | 'after:upload'
  | 'before:delete'
  | 'after:delete'
  | 'before:copy'
  | 'after:copy'
  | 'before:move'
  | 'after:move'
  | 'before:list'
  | 'after:list'
  | 'before:getSignedUrl'
  | 'after:getSignedUrl'
  | 'error';

/** Payload types for each hook event. */
export interface HookPayloads {
  'before:upload': UploadOptions;
  'after:upload': UploadResult;
  'before:delete': DeleteOptions;
  'after:delete': DeleteOptions;
  'before:copy': { sourceKey: string; destinationKey: string };
  'after:copy': UploadResult;
  'before:move': { sourceKey: string; destinationKey: string };
  'after:move': UploadResult;
  'before:list': { prefix?: string };
  'after:list': ListResult;
  'before:getSignedUrl': { key: string; expiresIn?: number };
  'after:getSignedUrl': { key: string; url: string };
  error: { operation: string; error: unknown };
}

export type HookHandler<E extends HookEvent> = (payload: HookPayloads[E]) => void | Promise<void>;

/**
 * Lightweight, typed event hook system.
 * Handlers are called sequentially in registration order.
 */
export class HookSystem {
  private readonly handlers = new Map<HookEvent, HookHandler<HookEvent>[]>();

  /** Register a handler for a specific event. */
  on<E extends HookEvent>(event: E, handler: HookHandler<E>): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as HookHandler<HookEvent>);
    this.handlers.set(event, list);
    return this;
  }

  /** Remove a previously registered handler. */
  off<E extends HookEvent>(event: E, handler: HookHandler<E>): this {
    const list = this.handlers.get(event) ?? [];
    const filtered = list.filter((h) => h !== (handler as HookHandler<HookEvent>));
    this.handlers.set(event, filtered);
    return this;
  }

  /** Remove all handlers for a given event (or all events when omitted). */
  removeAllListeners(event?: HookEvent): this {
    if (event !== undefined) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
    return this;
  }

  /** Emit an event, awaiting each handler in sequence. */
  async emit<E extends HookEvent>(event: E, payload: HookPayloads[E]): Promise<void> {
    const list = this.handlers.get(event) ?? [];
    for (const handler of list) {
      await handler(payload);
    }
  }
}
