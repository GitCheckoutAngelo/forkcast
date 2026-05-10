import Anthropic from '@anthropic-ai/sdk'

/**
 * Returns true for errors that are worth retrying: Anthropic 5xx responses and
 * network/connection failures. 4xx errors (bad input, auth, rate-limit) are not
 * transient and should not be retried.
 */
export function isTransient(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true // network / timeout
  if (err instanceof Anthropic.APIError) return err.status >= 500 // 5xx HTTP errors
  return false
}

/**
 * Calls fn up to `attempts` times. On a transient failure it waits `delay` ms
 * before retrying. On a non-transient failure it rethrows immediately.
 *
 * Default: 2 attempts (= 1 retry), 500 ms delay, retryOn = isTransient.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    attempts = 2,
    delay = 500,
    retryOn = isTransient,
  }: { attempts?: number; delay?: number; retryOn?: (err: unknown) => boolean } = {},
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < attempts - 1 && retryOn(err)) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay))
      } else {
        throw err
      }
    }
  }
  throw lastErr
}
