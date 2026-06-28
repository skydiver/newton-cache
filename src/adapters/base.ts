// CacheAdapter interface and utilities live in separate cycle-free modules.
// base.ts imports NamespacedCache; namespaced.ts imports only from interface.ts
// and utils.ts (not from base.ts), so there is no import cycle.
import type { CacheAdapter } from './interface.js';
import { NamespacedCache } from './namespaced.js';

// Re-export everything that consumers already import from './base.js',
// so existing imports in concrete adapters and tests remain unchanged.
export type { CacheAdapter } from './interface.js';
export { assertStringKey, isCachePayload, validateTTL } from './utils.js';

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
  /**
   * Tracks in-progress factory executions by cache key to deduplicate concurrent
   * remember() calls (thundering-herd / cache-stampede protection).
   *
   * Scope note: deduplication is per-instance and per-process. It is fully effective
   * for MemoryCache and prevents redundant I/O within a single process for file-based
   * adapters. It does NOT provide cross-process locking.
   */
  private readonly inFlight = new Map<string, Promise<V>>();

  /**
   * Handle to the background prune timer, or undefined when no timer is active.
   * Stored so stopAutoPrune() can cancel it and startAutoPrune() can replace it.
   */
  private pruneTimer: ReturnType<typeof setInterval> | undefined;

  // Abstract primitive methods - each adapter must implement these
  abstract get(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined>;
  abstract put(key: string, value: V, seconds?: number): Promise<void>;
  abstract forget(key: string): Promise<boolean>;
  abstract has(key: string): Promise<boolean>;
  abstract flush(): Promise<void>;
  abstract add(key: string, value: V, seconds?: number): Promise<boolean>;
  abstract pull(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined>;
  abstract keys(): Promise<string[]>;
  abstract size(): Promise<number>;
  abstract prune(): Promise<number>;
  abstract ttl(key: string): Promise<number | null>;
  abstract touch(key: string, seconds: number): Promise<boolean>;
  abstract increment(key: string, amount?: number): Promise<number>;

  /**
   * Retrieves a value or stores the result of a factory function if missing/expired.
   *
   * Uses a single get() call to check existence and retrieve the value, avoiding the
   * TOCTOU window of the older has()+get() double-lookup pattern. An undefined result
   * from get() is treated as a cache miss (key absent or expired).
   *
   * Stampede protection: concurrent calls for the same key while the factory is running
   * all await the same in-flight Promise — the factory is invoked exactly once.
   * On rejection, the in-flight entry is cleared so a subsequent call can retry.
   * Deduplication is per-instance/per-process (effective for MemoryCache; within-process
   * for file adapters; not a cross-process lock).
   *
   * @param key - The cache key
   * @param seconds - TTL in seconds (use Infinity for no expiration)
   * @param factory - Sync or async function to generate the value if not cached
   * @returns The cached or newly generated value
   */
  async remember(key: string, seconds: number, factory: () => V | Promise<V>): Promise<V> {
    const existing = await this.get(key);
    if (existing !== undefined) return existing;

    // Stampede protection: if a factory is already running for this key, await it.
    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending;

    // No await between inFlight.get() and inFlight.set() — check-and-register is synchronous.
    const promise = (async () => {
      const value = await factory();
      await this.put(key, value, seconds);
      return value;
    })();
    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Stores a value permanently (alias for put without TTL).
   *
   * @param key - The cache key
   * @param value - The value to store
   */
  async forever(key: string, value: V): Promise<void> {
    await this.put(key, value);
  }

  /**
   * Decrements a numeric cache value atomically.
   * Delegates to increment() with a negative amount.
   *
   * @param key - The cache key
   * @param amount - The amount to decrement by (default: 1)
   * @returns The new value after decrementing
   */
  async decrement(key: string, amount = 1): Promise<number> {
    return await this.increment(key, -amount);
  }

  /**
   * Retrieves a value or stores the result of a factory function permanently.
   * Delegates to remember() with Infinity TTL.
   *
   * @param key - The cache key
   * @param factory - Sync or async function to generate the value if not cached
   * @returns The cached or newly generated value
   */
  async rememberForever(key: string, factory: () => V | Promise<V>): Promise<V> {
    return await this.remember(key, Number.POSITIVE_INFINITY, factory);
  }

  /**
   * Returns the number of non-expired cache entries.
   * Delegates to keys().length.
   *
   * @returns The count of valid cache entries
   */
  async count(): Promise<number> {
    return (await this.keys()).length;
  }

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
      // Use Object.defineProperty ([[DefineOwnProperty]]) instead of assignment
      // ([[Set]]) to bypass the __proto__ accessor and prevent prototype pollution
      // when a key named '__proto__' is present.
      Object.defineProperty(result, key, {
        value: await this.get(key),
        writable: true,
        enumerable: true,
        configurable: true,
      });
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
    defaultValue?: V | (() => V | Promise<V>)
  ): Promise<V | undefined> {
    if (typeof defaultValue === 'function') {
      try {
        return await (defaultValue as () => V | Promise<V>)();
      } catch {
        return;
      }
    }
    return defaultValue;
  }

  /**
   * Start a background timer that calls prune() every `intervalSeconds`.
   * Idempotent: calling again replaces the existing timer. The timer is
   * unref'd so it never keeps the Node.js process alive on its own.
   *
   * @param intervalSeconds - How often to run prune(), in seconds. Must be a positive finite number.
   * @throws {RangeError} If intervalSeconds is not a positive finite number.
   */
  startAutoPrune(intervalSeconds: number): void {
    if (
      typeof intervalSeconds !== 'number' ||
      !Number.isFinite(intervalSeconds) ||
      intervalSeconds <= 0
    ) {
      throw new RangeError(
        `intervalSeconds must be a positive finite number (got ${intervalSeconds})`
      );
    }
    this.stopAutoPrune();
    this.pruneTimer = setInterval(() => {
      // prune() is async; the rejection is intentionally swallowed so an unhandled
      // rejection never crashes the host process from a background fire-and-forget timer.
      void Promise.resolve(this.prune()).catch(() => {
        /* intentionally ignored — background prune failures must not crash the host */
      });
    }, intervalSeconds * 1000);
    this.pruneTimer.unref();
  }

  /**
   * Stop the background prune timer if running. Safe to call when not running.
   */
  stopAutoPrune(): void {
    if (this.pruneTimer !== undefined) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
  }

  /**
   * Returns a namespaced view of this cache. All keys are transparently prefixed
   * with `${prefix}:` so multiple logical caches can share one backing store and
   * be invalidated as a group via the namespace's flush().
   *
   * @param prefix - A non-empty string used as the key prefix
   * @returns A CacheAdapter that transparently prefixes all keys
   * @throws {TypeError} if prefix is not a non-empty string
   */
  namespace(prefix: string): CacheAdapter<V> {
    if (typeof prefix !== 'string' || prefix.length === 0) {
      throw new TypeError(
        `Namespace prefix must be a non-empty string (got ${JSON.stringify(prefix)})`
      );
    }
    return new NamespacedCache<V>(this, prefix);
  }
}
