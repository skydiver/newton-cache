/**
 * Base interface that all cache adapters must implement.
 * Defines the standard cache operations with TTL support.
 *
 * @template V - The type of values stored in the cache
 */
export interface CacheAdapter<V = unknown> {
  /**
   * Retrieves a cached value by key.
   *
   * @param key - The cache key
   * @param defaultValue - Optional default value or factory function to return if key is missing/expired
   * @returns The cached value, default value, or undefined if not found
   */
  get(key: string, defaultValue?: V | (() => V)): V | undefined;

  /**
   * Stores a value in the cache with an optional TTL.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds (omit for no expiration)
   */
  put(key: string, value: V, seconds?: number): void;

  /**
   * Checks if a key exists in the cache and has not expired.
   *
   * @param key - The cache key
   * @returns True if the key exists with a defined, non-expired value
   */
  has(key: string): boolean;

  /**
   * Removes an item from the cache.
   *
   * @param key - The cache key
   * @returns True if the item existed and was removed, false otherwise
   */
  forget(key: string): boolean;

  /**
   * Clears all cached entries.
   */
  flush(): void;

  /**
   * Stores a value permanently (alias for put without TTL).
   *
   * @param key - The cache key
   * @param value - The value to store
   */
  forever(key: string, value: V): void;

  /**
   * Stores a value only if the key doesn't already exist.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds
   * @returns True if the value was stored, false if key already exists
   */
  add(key: string, value: V, seconds?: number): boolean;

  /**
   * Retrieves a cached value and immediately deletes it (one-time read).
   *
   * @param key - The cache key
   * @param defaultValue - Optional default value or factory function to return if key is missing/expired
   * @returns The cached value, default value, or undefined if not found
   */
  pull(key: string, defaultValue?: V | (() => V)): V | undefined;

  /**
   * Retrieves a value or stores the result of a factory function if missing/expired.
   *
   * @param key - The cache key
   * @param seconds - TTL in seconds (use Infinity for no expiration)
   * @param factory - Function to generate the value if not cached
   * @returns The cached or newly generated value
   */
  remember(key: string, seconds: number, factory: () => V): V;

  /**
   * Retrieves a value or stores the result of a factory function permanently.
   *
   * @param key - The cache key
   * @param factory - Function to generate the value if not cached
   * @returns The cached or newly generated value
   */
  rememberForever(key: string, factory: () => V): V;

  /**
   * Returns all non-expired cache keys.
   *
   * @returns Array of all valid cache keys
   */
  keys(): string[];

  /**
   * Returns the number of non-expired cache entries.
   *
   * @returns The count of valid cache entries
   */
  count(): number;

  /**
   * Returns the total size of all cache storage in bytes.
   *
   * @returns Total size in bytes
   */
  size(): number;

  /**
   * Removes all expired cache entries.
   *
   * @returns The number of expired entries removed
   */
  prune(): number;

  /**
   * Gets the remaining time-to-live (TTL) for a cache key in seconds.
   *
   * @param key - The cache key
   * @returns The remaining TTL in seconds, or null if the key doesn't exist or has no expiration
   */
  ttl(key: string): number | null;

  /**
   * Updates the TTL of an existing cache entry.
   *
   * @param key - The cache key
   * @param seconds - New TTL in seconds from now
   * @returns True if the TTL was updated, false if the key doesn't exist
   */
  touch(key: string, seconds: number): boolean;

  /**
   * Increments a numeric cache value atomically.
   *
   * @param key - The cache key
   * @param amount - The amount to increment by (default: 1)
   * @returns The new value after incrementing
   */
  increment(key: string, amount?: number): number;

  /**
   * Decrements a numeric cache value atomically.
   *
   * @param key - The cache key
   * @param amount - The amount to decrement by (default: 1)
   * @returns The new value after decrementing
   */
  decrement(key: string, amount?: number): number;
}
