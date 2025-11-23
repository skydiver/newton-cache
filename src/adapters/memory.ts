import type { CacheAdapter } from "./base.js";
import type { MemoryCacheOptions, CachePayload } from "../types.js";

/**
 * In-memory cache with TTL support.
 * Stores cache entries in memory using a Map. Data is lost on process restart.
 *
 * @template V - The type of values stored in the cache
 *
 * @example
 * ```ts
 * const cache = new MemoryCache<string>();
 * cache.put('key', 'value', 60); // Store for 60 seconds
 * const value = cache.get('key'); // Retrieve value
 * ```
 */
export class MemoryCache<V = unknown> implements CacheAdapter<V> {
  private readonly store: Map<string, CachePayload<V>>;

  /**
   * Creates a new MemoryCache instance.
   *
   * @param options - Configuration options (reserved for future use)
   *
   * @example
   * ```ts
   * const cache = new MemoryCache<User>();
   * ```
   */
  constructor(options: MemoryCacheOptions = {}) {
    this.store = new Map();
  }

  /**
   * Retrieves a cached value by key.
   *
   * @param key - The cache key
   * @param defaultValue - Optional default value or factory function to return if key is missing/expired
   * @returns The cached value, default value, or undefined if not found
   *
   * @example
   * ```ts
   * const value = cache.get('user:123'); // Returns value or undefined
   * const value = cache.get('user:123', 'default'); // Returns value or 'default'
   * const value = cache.get('user:123', () => fetchUser()); // Returns value or calls factory
   * ```
   */
  get(key: string, defaultValue?: V | (() => V)): V | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return this.resolveDefault(defaultValue);
    }

    // Check if expired
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return this.resolveDefault(defaultValue);
    }

    return entry.value ?? undefined;
  }

  /**
   * Retrieves a cached value and immediately deletes it (one-time read).
   *
   * @param key - The cache key
   * @param defaultValue - Optional default value or factory function to return if key is missing/expired
   * @returns The cached value, default value, or undefined if not found
   *
   * @example
   * ```ts
   * const token = cache.pull('one-time-token'); // Read and delete
   * ```
   */
  pull(key: string, defaultValue?: V | (() => V)): V | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return this.resolveDefault(defaultValue);
    }

    this.store.delete(key);

    // Check if was expired
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      return this.resolveDefault(defaultValue);
    }

    return entry.value ?? undefined;
  }

  /**
   * Stores a value in the cache with an optional TTL.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds (omit for no expiration)
   *
   * @example
   * ```ts
   * cache.put('key', 'value', 60); // Expires in 60 seconds
   * cache.put('key', 'value');      // Never expires
   * ```
   */
  put(key: string, value: V, seconds?: number): void {
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;

    this.store.set(key, { value, expiresAt, key });
  }

  /**
   * Stores a value permanently (alias for put without TTL).
   *
   * @param key - The cache key
   * @param value - The value to store
   *
   * @example
   * ```ts
   * cache.forever('config', { setting: 'value' });
   * ```
   */
  forever(key: string, value: V): void {
    this.put(key, value);
  }

  /**
   * Removes an item from the cache.
   *
   * @param key - The cache key
   * @returns True if the item existed and was removed, false otherwise
   *
   * @example
   * ```ts
   * const removed = cache.forget('user:123');
   * ```
   */
  forget(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clears all cached entries.
   *
   * @example
   * ```ts
   * cache.flush(); // Removes all cached items
   * ```
   */
  flush(): void {
    this.store.clear();
  }

  /**
   * Stores a value only if the key doesn't already exist.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds
   * @returns True if the value was stored, false if key already exists
   *
   * @example
   * ```ts
   * const added = cache.add('lock', 'process-1', 10); // Returns true
   * const added = cache.add('lock', 'process-2', 10); // Returns false (already exists)
   * ```
   */
  add(key: string, value: V, seconds?: number): boolean {
    if (this.has(key)) return false;
    this.put(key, value, seconds);
    return true;
  }

  /**
   * Retrieves a value or stores the result of a factory function if missing/expired.
   *
   * @param key - The cache key
   * @param seconds - TTL in seconds (use Infinity for no expiration)
   * @param factory - Function to generate the value if not cached
   * @returns The cached or newly generated value
   *
   * @example
   * ```ts
   * const users = cache.remember('users', 60, () => fetchUsers());
   * // First call: executes fetchUsers() and caches result
   * // Subsequent calls: returns cached value
   * ```
   */
  remember(key: string, seconds: number, factory: () => V): V {
    if (this.has(key)) {
      const existing = this.get(key);
      if (existing !== undefined) return existing;
    }

    const value = factory();
    this.put(key, value, seconds);
    return value;
  }

  /**
   * Retrieves a value or stores the result of a factory function permanently.
   *
   * @param key - The cache key
   * @param factory - Function to generate the value if not cached
   * @returns The cached or newly generated value
   *
   * @example
   * ```ts
   * const config = cache.rememberForever('config', () => loadConfig());
   * ```
   */
  rememberForever(key: string, factory: () => V): V {
    return this.remember(key, Number.POSITIVE_INFINITY, factory);
  }

  /**
   * Checks if a key exists in the cache and has not expired.
   *
   * @param key - The cache key
   * @returns True if the key exists with a defined, non-expired value
   *
   * @example
   * ```ts
   * if (cache.has('user:123')) {
   *   // Value exists and is not expired
   * }
   * ```
   */
  has(key: string): boolean {
    const entry = this.store.get(key);

    if (!entry) return false;

    // Check if expired
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }

    return entry.value !== undefined;
  }

  /**
   * Returns all non-expired cache keys.
   *
   * Note: Expired entries are automatically removed during enumeration.
   *
   * @returns Array of all valid cache keys
   *
   * @example
   * ```ts
   * const allKeys = cache.keys();
   * console.log('Cached keys:', allKeys);
   * ```
   */
  keys(): string[] {
    const validKeys: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      // Check if expired
      if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
        this.store.delete(key);
        continue;
      }

      if (entry.value !== undefined) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  /**
   * Returns the number of non-expired cache entries.
   *
   * @returns The count of valid cache entries
   *
   * @example
   * ```ts
   * const itemCount = cache.count();
   * console.log(`Cache contains ${itemCount} items`);
   * ```
   */
  count(): number {
    return this.keys().length;
  }

  /**
   * Returns the approximate size of all cache entries in bytes.
   *
   * Note: This is an estimate based on JSON serialization.
   *
   * @returns Approximate total size in bytes
   *
   * @example
   * ```ts
   * const bytes = cache.size();
   * console.log(`Cache size: ${(bytes / 1024).toFixed(2)} KB`);
   * ```
   */
  size(): number {
    let totalSize = 0;

    for (const entry of this.store.values()) {
      try {
        // Estimate size by serializing to JSON
        const serialized = JSON.stringify(entry);
        totalSize += serialized.length;
      } catch {
        // Skip entries that can't be serialized
        continue;
      }
    }

    return totalSize;
  }

  /**
   * Removes all expired cache entries.
   *
   * Unlike flush() which removes everything, prune() only removes entries
   * that have exceeded their TTL, keeping valid cached data intact.
   *
   * @returns The number of expired entries removed
   *
   * @example
   * ```ts
   * const removed = cache.prune();
   * console.log(`Removed ${removed} expired entries`);
   * ```
   */
  prune(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt != null && entry.expiresAt <= now) {
        this.store.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Gets the remaining time-to-live (TTL) for a cache key in seconds.
   *
   * @param key - The cache key
   * @returns The remaining TTL in seconds, or null if the key doesn't exist or has no expiration
   *
   * @example
   * ```ts
   * cache.put('session', data, 3600); // 1 hour TTL
   * const remaining = cache.ttl('session'); // e.g., 3599
   * ```
   */
  ttl(key: string): number | null {
    const entry = this.store.get(key);

    if (!entry || entry.value === undefined) return null;

    // No expiration set
    if (entry.expiresAt == null) return null;

    // Check if expired
    const remaining = entry.expiresAt - Date.now();
    if (remaining <= 0) {
      this.store.delete(key);
      return null;
    }

    // Return remaining time in seconds
    return Math.ceil(remaining / 1000);
  }

  /**
   * Updates the TTL of an existing cache entry.
   *
   * @param key - The cache key
   * @param seconds - New TTL in seconds from now
   * @returns True if the TTL was updated, false if the key doesn't exist
   *
   * @example
   * ```ts
   * cache.put('session', data, 60);  // Expires in 60 seconds
   * cache.touch('session', 3600);    // Extend to 1 hour from now
   * ```
   */
  touch(key: string, seconds: number): boolean {
    const entry = this.store.get(key);

    if (!entry || entry.value === undefined) return false;

    // Check if already expired
    if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return false;
    }

    // Update expiration
    const newExpiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;

    this.store.set(key, {
      value: entry.value,
      expiresAt: newExpiresAt,
      key: entry.key,
    });

    return true;
  }

  /**
   * Increments a numeric cache value atomically.
   *
   * If the key doesn't exist, it will be created with the increment amount.
   * Non-numeric values will be treated as 0.
   *
   * @param key - The cache key
   * @param amount - The amount to increment by (default: 1)
   * @returns The new value after incrementing
   *
   * @example
   * ```ts
   * cache.increment('page-views');        // 1
   * cache.increment('page-views');        // 2
   * cache.increment('page-views', 10);    // 12
   * ```
   */
  increment(key: string, amount = 1): number {
    const entry = this.store.get(key);
    let currentValue = 0;
    let expiresAt: number | undefined;

    if (entry) {
      // Only use existing value if it's a number and not expired
      if (
        typeof entry.value === "number" &&
        (entry.expiresAt == null || entry.expiresAt > Date.now())
      ) {
        currentValue = entry.value;
        expiresAt = entry.expiresAt;
      }
    }

    const newValue = currentValue + amount;
    this.store.set(key, { value: newValue as V, expiresAt, key });
    return newValue;
  }

  /**
   * Decrements a numeric cache value atomically.
   *
   * If the key doesn't exist, it will be created with the negative of the decrement amount.
   * Non-numeric values will be treated as 0.
   *
   * @param key - The cache key
   * @param amount - The amount to decrement by (default: 1)
   * @returns The new value after decrementing
   *
   * @example
   * ```ts
   * cache.put('credits', 100);
   * cache.decrement('credits');        // 99
   * cache.decrement('credits', 10);    // 89
   * ```
   */
  decrement(key: string, amount = 1): number {
    return this.increment(key, -amount);
  }

  /**
   * Resolve default value; invoke factory when provided.
   */
  private resolveDefault(defaultValue?: V | (() => V)): V | undefined {
    if (typeof defaultValue === "function") {
      try {
        return (defaultValue as () => V)();
      } catch {
        return undefined;
      }
    }
    return defaultValue;
  }
}
