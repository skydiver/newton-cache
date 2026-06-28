import crypto from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CachePayload, FlatFileCacheOptions } from '../types.js';
import { assertStringKey, BaseCacheAdapter, isCachePayload, validateTTL } from './base.js';

const DEFAULT_CACHE_FILE = path.join(tmpdir(), 'newton-cache.json');
const DEFAULT_FILE_MODE = 0o600;
const DEFAULT_DIR_MODE = 0o700;

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
  private readonly fileMode: number;
  private loaded = false;
  private removedOnLoad = 0;

  /**
   * Creates a new FlatFileCache instance.
   *
   * @param options - Configuration options
   * @param options.filePath - Custom cache file path (defaults to `<os tmp>/newton-cache.json`)
   * @param options.mode - POSIX file mode for the cache file (default: 0o600)
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
    this.fileMode = options.mode ?? DEFAULT_FILE_MODE;
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
  async get(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined> {
    assertStringKey(key);
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
  async pull(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined> {
    assertStringKey(key);
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
   * @param seconds - Optional TTL in seconds (omit or pass Infinity for no expiration)
   * @throws {RangeError} If seconds is NaN or negative
   *
   * @example
   * ```ts
   * await cache.put('session:abc', userData, 3600); // Store for 1 hour
   * await cache.put('config', settings); // Store forever
   * ```
   */
  async put(key: string, value: V, seconds?: number): Promise<void> {
    assertStringKey(key);
    validateTTL(seconds);
    this.loadFromDisk();
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    this.store.set(key, { value, expiresAt, key });
    this.saveToDisk();
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
    assertStringKey(key);
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
   * Atomicity guarantee: the existence check and store write happen synchronously
   * in the in-memory Map with no await between them, so within a single process
   * this is race-free. This is per-process atomicity — it is NOT a reliable
   * distributed lock across multiple processes or machines.
   *
   * Expired entries are treated as absent: add() will overwrite them and return true.
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
    assertStringKey(key);
    this.loadFromDisk();

    // Synchronous check-and-set — no await between the check and the store.set().
    const entry = this.store.get(key);
    if (entry && !this.isExpired(entry) && entry.value !== undefined) {
      return false;
    }

    validateTTL(seconds);
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    this.store.set(key, { value, expiresAt, key });
    this.saveToDisk();
    return true;
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
    assertStringKey(key);
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
    assertStringKey(key);
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
   * @throws {RangeError} If seconds is NaN or negative
   *
   * @example
   * ```ts
   * await cache.touch('session:abc', 3600); // Extend for another hour
   * ```
   */
  async touch(key: string, seconds: number): Promise<boolean> {
    assertStringKey(key);
    validateTTL(seconds);
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
    assertStringKey(key);
    this.loadFromDisk();
    const entry = this.store.get(key);
    let currentValue = 0;
    let expiresAt: number | undefined;

    if (entry && !this.isExpired(entry)) {
      if (typeof entry.value === 'number') {
        currentValue = entry.value;
      }
      expiresAt = entry.expiresAt;
    }

    const newValue = currentValue + amount;
    // `as V`: increment is a numeric operation on a generically-typed slot. The result
    // is always a number; callers of a generic cache know the slot holds a numeric value.
    // Removing this assertion would require `V extends number` on the class, which is
    // a breaking API change. `as any` is not used — the assertion is the narrowest sound cast.
    this.store.set(key, { value: newValue as V, expiresAt, key: entry?.key ?? key });
    this.saveToDisk();
    return newValue;
  }

  /**
   * Stores multiple key-value pairs in the cache with an optional TTL.
   * Overrides the base implementation to perform a single disk write for all keys,
   * instead of one write per key.
   *
   * @param items - Object containing key-value pairs to store
   * @param seconds - Optional TTL in seconds (omit or pass Infinity for no expiration)
   * @throws {RangeError} If seconds is NaN or negative
   */
  override async putMany(items: Record<string, V>, seconds?: number): Promise<void> {
    validateTTL(seconds);
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    this.loadFromDisk();
    for (const [key, value] of Object.entries(items)) {
      assertStringKey(key);
      this.store.set(key, { value, expiresAt, key });
    }
    this.saveToDisk();
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

    let dirty = false;
    let content = '';
    try {
      content = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      // Missing file is the normal "empty cache" case — not corruption.
      // Reading directly (no existsSync pre-check) closes the symlink-swap
      // TOCTOU window. Any other read error is treated as corrupt → rewrite.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      dirty = true;
    }

    try {
      if (!dirty && !content.trim()) return;

      const rawParsed: unknown = JSON.parse(content);
      // Guard: outer structure must be a non-null, non-array object.
      if (rawParsed === null || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
        dirty = true;
        return;
      }
      // Narrowed to non-null object; cast to a string-keyed map for iteration.
      // Safety: the null/array/non-object cases are eliminated above.
      const parsed = rawParsed as Record<string, unknown>;

      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        // Validate each entry's shape; skip (treat as absent) if malformed.
        if (!isCachePayload<V>(entry) || entry.value === undefined) {
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
   * Persists the entire cache to disk atomically using a randomized temp file + rename.
   * The temp filename is randomized to prevent symlink-based write-primitive attacks.
   * On rename failure the temp file is cleaned up to avoid leaking it.
   * Writes are silent-fail (errors ignored) to avoid throwing during cache operations.
   */
  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true, mode: DEFAULT_DIR_MODE });
      const tempPath = `${this.filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;

      const payload: Record<string, CachePayload<V>> = {};
      for (const [key, value] of this.store.entries()) {
        payload[key] = value;
      }

      const serialized = JSON.stringify(payload);
      fs.writeFileSync(tempPath, serialized, { encoding: 'utf8', mode: this.fileMode });
      try {
        fs.renameSync(tempPath, this.filePath);
      } catch (renameErr) {
        // Clean up temp file on rename failure to avoid leaking it.
        try {
          fs.unlinkSync(tempPath);
        } catch {
          /* ignore */
        }
        throw renameErr;
      }
    } catch {
      /* ignore — cache writes must not throw */
    }
  }
}
