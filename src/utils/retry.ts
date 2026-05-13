import type { RetryConfig } from '../types/index.js';
import { MaxRetriesExceededError } from '../errors/index.js';
import type { Logger } from '../logger/Logger.js';

/** Default retry policy applied when none is provided. */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 200,
  maxDelay: 10_000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/** Merge a partial config with the defaults, producing a complete RetryConfig. */
export function mergeRetryConfig(partial?: Partial<RetryConfig>): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG, ...partial };
}

/**
 * Compute full jittered exponential back-off delay.
 * Uses "full jitter": delay = random(0, min(cap, base * 2^attempt)).
 */
export function computeDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelay * Math.pow(2, attempt);
  const capped = Math.min(config.maxDelay, exponential);
  return Math.random() * capped;
}

function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('socket hang up')
    ) {
      return true;
    }
  }

  const err = error as Record<string, unknown>;
  const status =
    typeof err['statusCode'] === 'number'
      ? err['statusCode']
      : typeof err['status'] === 'number'
        ? err['status']
        : undefined;

  if (status !== undefined && config.retryableStatusCodes?.includes(status)) {
    return true;
  }

  return false;
}

/**
 * Execute `fn` with automatic retry and exponential back-off.
 *
 * @param fn - Async function to execute.
 * @param config - Retry configuration.
 * @param provider - Provider name used in error messages.
 * @param logger - Optional logger for retry diagnostics.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  provider: string,
  logger?: Logger,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLast = attempt === config.maxRetries;
      const retryable = isRetryableError(error, config);

      // Non-retryable errors are re-thrown immediately without wrapping.
      if (!retryable) throw error;

      if (isLast) break;

      const delay = computeDelay(attempt, config);
      logger?.warn(`[${provider}] Retry ${attempt + 1}/${config.maxRetries} after ${Math.round(delay)}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  throw new MaxRetriesExceededError(config.maxRetries, provider, lastError);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
