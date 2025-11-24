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
}

/**
 * Abstract base class that provides shared implementations for cache adapters.
 * Implements common batch operations and helper methods that delegate to primitive operations.
 *
 * Concrete adapters only need to implement the primitive operations (get, put, has, etc.).
 * Batch operations (getMany, putMany, forgetMany) are automatically provided and can be
 * overridden for adapter-specific optimizations (e.g., Redis MGET/MSET).
 *
 * @template V - The type of values stored in the cache
 */
export abstract class BaseCacheAdapter<V = unknown> implements CacheAdapter<V> {
  // Abstract primitive methods - each adapter must implement these
  abstract get(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined>;
  abstract put(key: string, value: V, seconds?: number): Promise<void>;
  abstract forget(key: string): Promise<boolean>;
  abstract has(key: string): Promise<boolean>;
  abstract flush(): Promise<void>;
  abstract forever(key: string, value: V): Promise<void>;
  abstract add(key: string, value: V, seconds?: number): Promise<boolean>;
  abstract pull(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined>;
  abstract remember(key: string, seconds: number, factory: () => V | Promise<V>): Promise<V>;
  abstract rememberForever(key: string, factory: () => V | Promise<V>): Promise<V>;
  abstract keys(): Promise<string[]>;
  abstract count(): Promise<number>;
  abstract size(): Promise<number>;
  abstract prune(): Promise<number>;
  abstract ttl(key: string): Promise<number | null>;
  abstract touch(key: string, seconds: number): Promise<boolean>;
  abstract increment(key: string, amount?: number): Promise<number>;
  abstract decrement(key: string, amount?: number): Promise<number>;

  /**
   * Retrieves multiple cached values by their keys.
   * Delegates to the get() method for each key.
   *
   * Can be overridden by adapters that support native batch operations.
   *
   * @param keys - Array of cache keys to retrieve
   * @returns Object mapping keys to their values (undefined for missing/expired keys)
   */
  async getMany(keys: string[]): Promise<Record<string, V | undefined>> {
    const result: Record<string, V | undefined> = {};
    for (const key of keys) {
      result[key] = await this.get(key);
    }
    return result;
  }

  /**
   * Stores multiple key-value pairs in the cache with an optional TTL.
   * Delegates to the put() method for each key-value pair.
   *
   * Can be overridden by adapters that support native batch operations.
   *
   * @param items - Object containing key-value pairs to store
   * @param seconds - Optional TTL in seconds (omit for no expiration)
   */
  async putMany(items: Record<string, V>, seconds?: number): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      await this.put(key, value, seconds);
    }
  }

  /**
   * Removes multiple items from the cache.
   * Delegates to the forget() method for each key.
   *
   * Can be overridden by adapters that support native batch operations.
   *
   * @param keys - Array of cache keys to remove
   * @returns The number of items that were actually removed
   */
  async forgetMany(keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (await this.forget(key)) {
        removed++;
      }
    }
    return removed;
  }

  /**
   * Helper method to resolve default values.
   * If the default is a function, invokes it and returns the result (awaiting if it's a Promise).
   * If the function throws, returns undefined.
   *
   * @param defaultValue - Static value, sync factory, or async factory function
   * @returns The resolved default value or undefined
   */
  protected async resolveDefault(
    defaultValue?: V | (() => V | Promise<V>),
  ): Promise<V | undefined> {
    if (typeof defaultValue === "function") {
      try {
        return await (defaultValue as () => V | Promise<V>)();
      } catch {
        return undefined;
      }
    }
    return defaultValue;
  }
}
