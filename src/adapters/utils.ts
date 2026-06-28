import type { CachePayload } from '../types.js';

/**
 * Validates a TTL value, throwing RangeError for invalid values.
 *
 * undefined and Infinity are valid (they mean "no expiry").
 * A TTL of 0 is valid and means "expires immediately" (the entry is written
 * then treated as expired on the next read).
 * NaN and negative numbers are rejected.
 *
 * @param seconds - TTL in seconds (may be undefined)
 * @throws {RangeError} If seconds is NaN or negative
 */
export function validateTTL(seconds: number | undefined): void {
  if (seconds === undefined) return;
  if (Number.isNaN(seconds) || seconds < 0) {
    throw new RangeError(`TTL must be a non-negative number (got ${seconds})`);
  }
}

/**
 * Asserts that a cache key is a string at runtime, throwing TypeError otherwise.
 *
 * @param key - The value to assert as a string key
 * @throws {TypeError} If key is not a string
 */
export function assertStringKey(key: unknown): asserts key is string {
  if (typeof key !== 'string') {
    throw new TypeError(`Cache key must be a string (got ${typeof key})`);
  }
}

/**
 * Runtime type guard that verifies an unknown value has the shape of CachePayload<V>.
 *
 * Validated conditions:
 *  - non-null object (not an array)
 *  - owns a `value` property of any type (null is a legitimate stored value)
 *  - `expiresAt`, if present, is a number
 *  - `key`, if present, is a string
 *
 * The type of `value` itself is NOT validated — it is generic (V) and callers
 * are responsible for further narrowing when needed (e.g. typeof value === 'number').
 */
export function isCachePayload<V>(data: unknown): data is CachePayload<V> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return false;
  // Narrowed to non-null, non-array object above; cast to indexed type for property access.
  const obj = data as Record<string, unknown>;
  if (!Object.hasOwn(obj, 'value')) return false;
  if ('expiresAt' in obj && typeof obj['expiresAt'] !== 'number') return false;
  if ('key' in obj && typeof obj['key'] !== 'string') return false;
  return true;
}
