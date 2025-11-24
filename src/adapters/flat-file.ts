import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { BaseCacheAdapter } from "./base.js";
import type { CachePayload, FlatFileCacheOptions } from "../types.js";

const DEFAULT_CACHE_FILE = path.join(tmpdir(), "newton-cache.json");

/**
 * Flat-file cache that stores all entries in a single JSON file.
 * Data is fully loaded into memory on first access and persisted on each write.
 *
 * Best for small-to-medium caches (<1000 keys) where you want easy backup/restore
 * or minimal inode usage. For large caches or high write frequency, use FileCache instead.
 *
 * @template V - The type of values stored in the cache
 *
 * @example
 * ```ts
 * const cache = new FlatFileCache<string>();
 * cache.put('key', 'value', 60); // Store for 60 seconds
 * const value = cache.get('key'); // Retrieve value
 * ```
 */
export class FlatFileCache<V = unknown> extends BaseCacheAdapter<V> {
  private readonly filePath: string;
  private readonly store: Map<string, CachePayload<V>>;
  private loaded = false;
  private removedOnLoad = 0;

  /**
   * Creates a new FlatFileCache instance.
   *
   * @param options - Configuration options
   * @param options.filePath - Custom cache file path (defaults to `<os tmp>/newton-cache.json`)
   *
   * @example
   * ```ts
   * const cache = new FlatFileCache({ filePath: '/var/cache/my-app.json' });
   * ```
   */
  constructor(options: FlatFileCacheOptions = {}) {
    super();
    const targetPath = options.filePath ?? DEFAULT_CACHE_FILE;
    this.filePath = path.resolve(targetPath);
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
   * const value = await cache.get('user:123'); // Returns value or undefined
   * const value = await cache.get('user:123', 'default'); // Returns value or 'default'
   * const value = await cache.get('user:123', () => fetchUser()); // Returns value or calls factory
   * ```
   */
  async get(key: string, defaultValue?: V | (() => V)): Promise<V | undefined> {
    this.loadFromDisk();
    const entry = this.store.get(key);
    if (!entry) return await this.resolveDefault(defaultValue);

    if (this.isExpired(entry)) {
      this.store.delete(key);
      this.saveToDisk();
      return await this.resolveDefault(defaultValue);
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
   * const token = await cache.pull('one-time-token'); // Read and delete
   * ```
   */
  async pull(key: string, defaultValue?: V | (() => V)): Promise<V | undefined> {
    this.loadFromDisk();
    const entry = this.store.get(key);
    if (!entry) return await this.resolveDefault(defaultValue);

    this.store.delete(key);

    if (this.isExpired(entry)) {
      this.saveToDisk();
      return await this.resolveDefault(defaultValue);
    }

    this.saveToDisk();
    return entry.value ?? undefined;
  }

  /**
   * Stores a value in the cache with an optional TTL.
   *
   * Note: Every write rewrites the entire cache file. For high-frequency writes, consider FileCache.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds (omit for no expiration)
   *
   * @example
   * ```ts
   * await cache.put('session:abc', userData, 3600); // Store for 1 hour
   * await cache.put('config', settings); // Store forever
   * ```
   */
  async put(key: string, value: V, seconds?: number): Promise<void> {
    this.loadFromDisk();
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    this.store.set(key, { value, expiresAt, key });
    this.saveToDisk();
  }

  /**
   * Stores a value permanently (alias for put without TTL).
   *
   * @param key - The cache key
   * @param value - The value to store
   *
   * @example
   * ```ts
   * await cache.forever('app-version', '1.0.0');
   * ```
   */
  async forever(key: string, value: V): Promise<void> {
    await this.put(key, value);
  }

  /**
   * Removes an item from the cache.
   *
   * @param key - The cache key
   * @returns True if the item existed and was removed, false otherwise
   *
   * @example
   * ```ts
   * const removed = await cache.forget('session:abc'); // true if existed
   * ```
   */
  async forget(key: string): Promise<boolean> {
    this.loadFromDisk();
    const existed = this.store.delete(key);
    if (existed) this.saveToDisk();
    return existed;
  }

  /**
   * Clears all cached entries and removes the cache file.
   *
   * @example
   * ```ts
   * await cache.flush(); // All data deleted
   * ```
   */
  async flush(): Promise<void> {
    this.loaded = true;
    this.store.clear();
    try {
      fs.unlinkSync(this.filePath);
    } catch {
      /* ignore */
    }
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
   * const stored = await cache.add('lock:resource', true, 60); // Returns true if lock acquired
   * ```
   */
  async add(key: string, value: V, seconds?: number): Promise<boolean> {
    if (await this.has(key)) return false;
    await this.put(key, value, seconds);
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
   * const users = await cache.remember('users', 60, () => fetchUsers());
   * ```
   */
  async remember(key: string, seconds: number, factory: () => V | Promise<V>): Promise<V> {
    if (await this.has(key)) {
      const existing = await this.get(key);
      if (existing !== undefined) return existing;
    }

    const value = await factory();
    await this.put(key, value, seconds);
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
   * const config = await cache.rememberForever('config', () => loadConfig());
   * ```
   */
  async rememberForever(key: string, factory: () => V | Promise<V>): Promise<V> {
    return await this.remember(key, Number.POSITIVE_INFINITY, factory);
  }

  /**
   * Checks if a key exists in the cache and has not expired.
   *
   * @param key - The cache key
   * @returns True if the key exists with a defined, non-expired value
   *
   * @example
   * ```ts
   * if (await cache.has('user:123')) {
   *   // User data is cached
   * }
   * ```
   */
  async has(key: string): Promise<boolean> {
    this.loadFromDisk();
    const entry = this.store.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      this.saveToDisk();
      return false;
    }

    return entry.value !== undefined;
  }

  /**
   * Returns all non-expired cache keys.
   *
   * @returns Array of all valid cache keys
   *
   * @example
   * ```ts
   * const allKeys = await cache.keys(); // ['user:1', 'user:2', 'session:abc']
   * ```
   */
  async keys(): Promise<string[]> {
    this.loadFromDisk();
    const keys: string[] = [];
    let changed = false;
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        changed = true;
        continue;
      }
      keys.push(key);
    }

    if (changed) this.saveToDisk();
    return keys;
  }

  /**
   * Returns the number of non-expired cache entries.
   *
   * @returns The count of valid cache entries
   *
   * @example
   * ```ts
   * console.log(`Cache has ${await cache.count()} entries`);
   * ```
   */
  async count(): Promise<number> {
    return (await this.keys()).length;
  }

  /**
   * Returns the total size of the cache file in bytes.
   *
   * @returns Total size in bytes
   *
   * @example
   * ```ts
   * const bytes = await cache.size();
   * console.log(`Cache size: ${(bytes / 1024).toFixed(2)} KB`);
   * ```
   */
  async size(): Promise<number> {
    this.loadFromDisk();
    try {
      const stats = fs.statSync(this.filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Removes all expired cache entries.
   *
   * @returns The number of expired entries removed
   *
   * @example
   * ```ts
   * const removed = await cache.prune();
   * console.log(`Removed ${removed} expired entries`);
   * ```
   */
  async prune(): Promise<number> {
    this.loadFromDisk();
    let removed = this.removedOnLoad;
    this.removedOnLoad = 0;
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry) || entry.value === undefined) {
        this.store.delete(key);
        removed++;
      }
    }

    if (removed > 0) this.saveToDisk();
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
   * const remaining = await cache.ttl('session:abc'); // e.g., 3599
   * ```
   */
  async ttl(key: string): Promise<number | null> {
    this.loadFromDisk();
    const entry = this.store.get(key);
    if (!entry || entry.value === undefined) return null;

    if (entry.expiresAt == null) return null;

    const remaining = entry.expiresAt - Date.now();
    if (remaining <= 0) {
      this.store.delete(key);
      this.saveToDisk();
      return null;
    }

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
   * await cache.touch('session:abc', 3600); // Extend for another hour
   * ```
   */
  async touch(key: string, seconds: number): Promise<boolean> {
    this.loadFromDisk();
    const entry = this.store.get(key);
    if (!entry || entry.value === undefined) return false;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      this.saveToDisk();
      return false;
    }

    const newExpiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    this.store.set(key, { value: entry.value, expiresAt: newExpiresAt, key: entry.key ?? key });
    this.saveToDisk();
    return true;
  }

  /**
   * Increments a numeric cache value atomically.
   *
   * Non-numeric values are treated as 0. Preserves existing TTL.
   *
   * @param key - The cache key
   * @param amount - The amount to increment by (default: 1)
   * @returns The new value after incrementing
   *
   * @example
   * ```ts
   * await cache.increment('page-views'); // Returns 1
   * await cache.increment('page-views'); // Returns 2
   * await cache.increment('score', 10); // Increment by 10
   * ```
   */
  async increment(key: string, amount = 1): Promise<number> {
    this.loadFromDisk();
    const entry = this.store.get(key);
    let currentValue = 0;
    let expiresAt: number | undefined;

    if (entry && !this.isExpired(entry)) {
      if (typeof entry.value === "number") {
        currentValue = entry.value;
      }
      expiresAt = entry.expiresAt;
    }

    const newValue = currentValue + amount;
    this.store.set(key, { value: newValue as V, expiresAt, key: entry?.key ?? key });
    this.saveToDisk();
    return newValue;
  }

  /**
   * Decrements a numeric cache value atomically.
   *
   * Non-numeric values are treated as 0. Preserves existing TTL.
   *
   * @param key - The cache key
   * @param amount - The amount to decrement by (default: 1)
   * @returns The new value after decrementing
   *
   * @example
   * ```ts
   * await cache.decrement('credits'); // Returns -1
   * await cache.put('balance', 100);
   * await cache.decrement('balance', 20); // Returns 80
   * ```
   */
  async decrement(key: string, amount = 1): Promise<number> {
    return await this.increment(key, -amount);
  }

  /**
   * Loads the cache file from disk into memory (lazy loading).
   * Only loads once per instance. Removes expired entries during load.
   */
  private loadFromDisk(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.store.clear();
    this.removedOnLoad = 0;

    if (!fs.existsSync(this.filePath)) return;

    let dirty = false;
    try {
      const content = fs.readFileSync(this.filePath, "utf8");
      if (!content.trim()) return;

      const parsed = JSON.parse(content) as Record<string, CachePayload<V>> | null;
      if (!parsed || typeof parsed !== "object") {
        dirty = true;
        return;
      }

      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry !== "object") {
          dirty = true;
          this.removedOnLoad++;
          continue;
        }

        if (entry.value === undefined) {
          dirty = true;
          this.removedOnLoad++;
          continue;
        }

        if (entry.expiresAt != null && entry.expiresAt <= now) {
          dirty = true;
          this.removedOnLoad++;
          continue;
        }

        this.store.set(key, {
          value: entry.value,
          expiresAt: entry.expiresAt ?? undefined,
          key: entry.key ?? key,
        });
      }
    } catch {
      dirty = true;
    }

    if (dirty) {
      this.saveToDisk();
    }
  }

  /**
   * Checks if a cache entry has expired.
   */
  private isExpired(entry: CachePayload<V>): boolean {
    return entry.expiresAt != null && entry.expiresAt <= Date.now();
  }

  /**
   * Persists the entire cache to disk atomically using temp file + rename.
   * Writes are silent-fail (errors ignored) to avoid throwing during cache operations.
   */
  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tempPath = `${this.filePath}.tmp`;

      const payload: Record<string, CachePayload<V>> = {};
      for (const [key, value] of this.store.entries()) {
        payload[key] = value;
      }

      const serialized = JSON.stringify(payload);
      fs.writeFileSync(tempPath, serialized, "utf8");
      fs.renameSync(tempPath, this.filePath);
    } catch {
      /* ignore */
    }
  }
}
