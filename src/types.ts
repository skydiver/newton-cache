/**
 * Configuration options for FileCache adapter
 */
export interface FileCacheOptions {
  /** Optional custom cache directory path. Defaults to OS temp directory. */
  cachePath?: string;
  /**
   * POSIX file mode for cache files (default: 0o600 — owner read/write only).
   * Has no effect on Windows.
   */
  mode?: number;
}

/**
 * Configuration options for FlatFileCache adapter
 */
export interface FlatFileCacheOptions {
  /** Path to the flat cache file. Defaults to `<os tmp>/newton-cache.json`. */
  filePath?: string;
  /**
   * POSIX file mode for the cache file (default: 0o600 — owner read/write only).
   * Has no effect on Windows.
   */
  mode?: number;
}

/**
 * Configuration options for MemoryCache adapter
 */
export interface MemoryCacheOptions {
  /**
   * Maximum number of entries the cache may hold.
   * Must be a positive integer. When the cache is full, the least-recently-used
   * entry is evicted before each new key is inserted.
   * Omit (or leave undefined) for an unbounded cache.
   */
  maxEntries?: number;
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
