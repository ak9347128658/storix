import { describe, it, expect, vi } from 'vitest';
import { withRetry, computeDelay, mergeRetryConfig, DEFAULT_RETRY_CONFIG } from '../../utils/retry.js';
import { MaxRetriesExceededError } from '../../errors/index.js';

describe('mergeRetryConfig', () => {
  it('returns defaults when no overrides supplied', () => {
    const config = mergeRetryConfig();
    expect(config).toEqual(DEFAULT_RETRY_CONFIG);
  });

  it('merges partial overrides', () => {
    const config = mergeRetryConfig({ maxRetries: 5, baseDelay: 100 });
    expect(config.maxRetries).toBe(5);
    expect(config.baseDelay).toBe(100);
    expect(config.maxDelay).toBe(DEFAULT_RETRY_CONFIG.maxDelay);
  });
});

describe('computeDelay', () => {
  it('returns a value between 0 and maxDelay', () => {
    const config = mergeRetryConfig({ maxDelay: 1000 });
    for (let i = 0; i < 20; i++) {
      const delay = computeDelay(i, config);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, mergeRetryConfig({ maxRetries: 3 }), 'test');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable status codes and eventually succeeds', async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) {
        const err = Object.assign(new Error('Service unavailable'), { statusCode: 503 });
        throw err;
      }
      return 'recovered';
    });

    const config = mergeRetryConfig({ maxRetries: 3, baseDelay: 1, maxDelay: 5 });
    const result = await withRetry(fn, config, 'test');
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws MaxRetriesExceededError after all attempts fail', async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('boom'), { statusCode: 500 });
    });

    const config = mergeRetryConfig({ maxRetries: 2, baseDelay: 1, maxDelay: 5 });
    await expect(withRetry(fn, config, 'test')).rejects.toBeInstanceOf(MaxRetriesExceededError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('re-throws non-retryable errors directly (no wrapping)', async () => {
    const originalError = Object.assign(new Error('Bad request'), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(originalError);

    const config = mergeRetryConfig({ maxRetries: 3, baseDelay: 1 });
    // Non-retryable errors are NOT wrapped in MaxRetriesExceededError
    await expect(withRetry(fn, config, 'test')).rejects.toBe(originalError);
    // Only 1 call — does not retry non-retryable errors
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
