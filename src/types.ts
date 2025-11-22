/**
 * Base cache configuration options
 */
export interface CacheOptions {
  [key: string]: unknown;
}

/**
 * Configuration options for FileCache adapter
 */
export interface FileCacheOptions extends CacheOptions {
  /** Optional custom cache directory path. Defaults to OS temp directory. */
  cachePath?: string;
}

/**
 * Internal cache payload structure stored in cache files
 * @template V - The type of values stored in the cache
 */
export interface CachePayload<V> {
  /** The cached value */
  value: V;
  /** Unix timestamp (ms) when the entry expires, or undefined for no expiration */
  expiresAt?: number;
  /** Original cache key (stored for hashed long keys) */
  key?: string;
}
