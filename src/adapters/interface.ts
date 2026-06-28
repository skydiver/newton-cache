/**
 * Base interface that all cache adapters must implement.
 * Defines the standard cache operations with TTL support.
 *
 * All methods are async and return Promises for consistency across adapters,
 * enabling support for async backends like Redis, SQLite, etc.
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
  get(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined>;

  /**
   * Stores a value in the cache with an optional TTL.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds (omit for no expiration)
   */
  put(key: string, value: V, seconds?: number): Promise<void>;

  /**
   * Checks if a key exists in the cache and has not expired.
   *
   * @param key - The cache key
   * @returns True if the key exists with a defined, non-expired value
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes an item from the cache.
   *
   * @param key - The cache key
   * @returns True if the item existed and was removed, false otherwise
   */
  forget(key: string): Promise<boolean>;

  /**
   * Clears all cached entries.
   */
  flush(): Promise<void>;

  /**
   * Stores a value permanently (alias for put without TTL).
   *
   * @param key - The cache key
   * @param value - The value to store
   */
  forever(key: string, value: V): Promise<void>;

  /**
   * Stores a value only if the key doesn't already exist.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds
   * @returns True if the value was stored, false if key already exists
   */
  add(key: string, value: V, seconds?: number): Promise<boolean>;

  /**
   * Retrieves a cached value and immediately deletes it (one-time read).
   *
   * @param key - The cache key
   * @param defaultValue - Optional default value or factory function to return if key is missing/expired
   * @returns The cached value, default value, or undefined if not found
   */
  pull(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined>;

  /**
   * Retrieves a value or stores the result of a factory function if missing/expired.
   *
   * @param key - The cache key
   * @param seconds - TTL in seconds (use Infinity for no expiration)
   * @param factory - Sync or async function to generate the value if not cached
   * @returns The cached or newly generated value
   */
  remember(key: string, seconds: number, factory: () => V | Promise<V>): Promise<V>;

  /**
   * Retrieves a value or stores the result of a factory function permanently.
   *
   * @param key - The cache key
   * @param factory - Sync or async function to generate the value if not cached
   * @returns The cached or newly generated value
   */
  rememberForever(key: string, factory: () => V | Promise<V>): Promise<V>;

  /**
   * Returns all non-expired cache keys.
   *
   * @returns Array of all valid cache keys
   */
  keys(): Promise<string[]>;

  /**
   * Returns the number of non-expired cache entries.
   *
   * @returns The count of valid cache entries
   */
  count(): Promise<number>;

  /**
   * Returns the total size of all cache storage in bytes.
   *
   * @returns Total size in bytes
   */
  size(): Promise<number>;

  /**
   * Removes all expired cache entries.
   *
   * @returns The number of expired entries removed
   */
  prune(): Promise<number>;

  /**
   * Gets the remaining time-to-live (TTL) for a cache key in seconds.
   *
   * @param key - The cache key
   * @returns The remaining TTL in seconds, or null if the key doesn't exist or has no expiration
   */
  ttl(key: string): Promise<number | null>;

  /**
   * Updates the TTL of an existing cache entry.
   *
   * @param key - The cache key
   * @param seconds - New TTL in seconds from now
   * @returns True if the TTL was updated, false if the key doesn't exist
   */
  touch(key: string, seconds: number): Promise<boolean>;

  /**
   * Increments a numeric cache value atomically.
   *
   * @param key - The cache key
   * @param amount - The amount to increment by (default: 1)
   * @returns The new value after incrementing
   */
  increment(key: string, amount?: number): Promise<number>;

  /**
   * Decrements a numeric cache value atomically.
   *
   * @param key - The cache key
   * @param amount - The amount to decrement by (default: 1)
   * @returns The new value after decrementing
   */
  decrement(key: string, amount?: number): Promise<number>;

  /**
   * Retrieves multiple cached values by their keys.
   *
   * @param keys - Array of cache keys to retrieve
   * @returns Object mapping keys to their values (undefined for missing/expired keys)
   *
   * @example
   * ```ts
   * const result = await cache.getMany(['user:1', 'user:2', 'user:3']);
   * // { 'user:1': data1, 'user:2': undefined, 'user:3': data3 }
   * ```
   */
  getMany(keys: string[]): Promise<Record<string, V | undefined>>;

  /**
   * Stores multiple key-value pairs in the cache with an optional TTL.
   *
   * @param items - Object containing key-value pairs to store
   * @param seconds - Optional TTL in seconds (omit for no expiration)
   *
   * @example
   * ```ts
   * await cache.putMany({ 'key1': 'val1', 'key2': 'val2' }, 60);
   * ```
   */
  putMany(items: Record<string, V>, seconds?: number): Promise<void>;

  /**
   * Removes multiple items from the cache.
   *
   * @param keys - Array of cache keys to remove
   * @returns The number of items that were actually removed
   *
   * @example
   * ```ts
   * const removed = await cache.forgetMany(['key1', 'key2', 'key3']); // Returns 2 if only 2 existed
   * ```
   */
  forgetMany(keys: string[]): Promise<number>;

  /**
   * Start a background timer that calls prune() every `intervalSeconds`.
   * Idempotent: calling again replaces the existing timer. The timer is
   * unref'd so it never keeps the Node.js process alive on its own.
   *
   * @param intervalSeconds - How often to run prune(), in seconds. Must be a positive finite number.
   * @throws {RangeError} If intervalSeconds is not a positive finite number.
   */
  startAutoPrune(intervalSeconds: number): void;

  /**
   * Stop the background prune timer if running. Safe to call when not running.
   */
  stopAutoPrune(): void;

  /**
   * Returns a namespaced view of this cache. All keys are transparently prefixed
   * with `${prefix}:` so multiple logical caches can share one backing store and
   * be invalidated as a group via the namespace's flush().
   *
   * @param prefix - A non-empty string used as the key prefix
   * @returns A CacheAdapter that transparently prefixes all keys
   * @throws {TypeError} if prefix is not a non-empty string
   */
  namespace(prefix: string): CacheAdapter<V>;
}
