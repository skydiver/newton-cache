import crypto from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CacheAdapter } from "./base.js";
import type { FileCacheOptions, CachePayload } from "../types.js";

const DEFAULT_CACHE_DIR = path.join(tmpdir(), "node-cache");
const MAX_KEY_LENGTH = 200; // Safe limit for encoded filenames across filesystems

/**
 * File-based cache with TTL support and pluggable adapter design.
 * Stores cache entries as JSON files in a designated directory.
 *
 * @template V - The type of values stored in the cache
 *
 * @example
 * ```ts
 * const cache = new FileCache<string>();
 * cache.put('key', 'value', 60); // Store for 60 seconds
 * const value = cache.get('key'); // Retrieve value
 * ```
 */
export class FileCache<V = unknown> implements CacheAdapter<V> {
  private readonly cacheDir: string;

  /**
   * Creates a new FileCache instance.
   *
   * @param options - Configuration options
   * @param options.cachePath - Custom cache directory path (defaults to OS temp directory)
   *
   * @example
   * ```ts
   * const cache = new FileCache({ cachePath: '/var/tmp/my-cache' });
   * ```
   */
  constructor(options: FileCacheOptions = {}) {
    const cachePath = options.cachePath ?? DEFAULT_CACHE_DIR;

    // Resolve to absolute path and normalize (prevents path traversal)
    this.cacheDir = path.resolve(cachePath);

    fs.mkdirSync(this.cacheDir, { recursive: true });
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
    const filename = this.pathForKey(key);
    if (!fs.existsSync(filename)) return this.resolveDefault(defaultValue);

    try {
      const content = fs.readFileSync(filename, "utf8");
      const parsed = JSON.parse(content) as CachePayload<V> | null;
      if (!parsed) return this.resolveDefault(defaultValue);

      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return this.resolveDefault(defaultValue);
      }

      return parsed.value ?? undefined;
    } catch {
      return this.resolveDefault(defaultValue);
    }
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
    const filename = this.pathForKey(key);
    if (!fs.existsSync(filename)) return this.resolveDefault(defaultValue);

    try {
      const content = fs.readFileSync(filename, "utf8");
      const parsed = JSON.parse(content) as CachePayload<V> | null;
      if (!parsed) {
        fs.unlinkSync(filename);
        return this.resolveDefault(defaultValue);
      }

      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return this.resolveDefault(defaultValue);
      }

      fs.unlinkSync(filename);
      return parsed.value ?? undefined;
    } catch {
      if (fs.existsSync(filename)) {
        try {
          fs.unlinkSync(filename);
        } catch {
          /* ignore */
        }
      }
      return this.resolveDefault(defaultValue);
    }
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
    // Store original key for reconstruction (needed for hashed long keys)
    const payload = JSON.stringify({ value, expiresAt, key });
    const filename = this.pathForKey(key);
    fs.writeFileSync(filename, payload, "utf8");
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
    const filename = this.pathForKey(key);
    if (!fs.existsSync(filename)) return false;
    fs.unlinkSync(filename);
    return true;
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
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
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
    const expiresAt = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : undefined;
    const payload = JSON.stringify({ value, expiresAt, key });
    const filename = this.pathForKey(key);
    fs.writeFileSync(filename, payload, "utf8");
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

  /*****************************************************************************
   * Encode the key into a safe filename inside the cache directory.
   * Long keys are hashed to prevent filesystem length limits.
   ****************************************************************************/
  private pathForKey(key: string): string {
    let filename: string;

    // Hash long keys to stay within filesystem limits (typically 255 bytes)
    if (key.length > MAX_KEY_LENGTH) {
      const hash = crypto.createHash("sha256").update(key).digest("hex");
      filename = `long_${hash}`;
    } else {
      filename = encodeURIComponent(key);
    }

    return path.join(this.cacheDir, filename);
  }

  /**
   * Checks if a key exists in the cache and has not expired.
   *
   * Note: This method reads and parses the entire cache file to check expiration
   * and validate the value. This ensures accuracy but may be slower for large values.
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
    const filename = this.pathForKey(key);
    if (!fs.existsSync(filename)) return false;

    try {
      const content = fs.readFileSync(filename, "utf8");
      const parsed = JSON.parse(content) as CachePayload<V> | null;
      if (!parsed) return false;

      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return false;
      }

      return parsed.value !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Returns all non-expired cache keys.
   *
   * Note: This method reads all cache files to check expiration status.
   * Expired entries are automatically removed during enumeration.
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
    try {
      const files = fs.readdirSync(this.cacheDir);
      const validKeys: string[] = [];

      for (const file of files) {
        const filename = path.join(this.cacheDir, file);

        try {
          const content = fs.readFileSync(filename, "utf8");
          const parsed = JSON.parse(content) as CachePayload<V> | null;

          if (!parsed || parsed.value === undefined) continue;

          // Remove expired entries
          if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
            fs.unlinkSync(filename);
            continue;
          }

          // Use stored key if available (for hashed long keys), otherwise decode filename
          const key = parsed.key ?? decodeURIComponent(file);
          validKeys.push(key);
        } catch {
          // Skip invalid or unreadable files
          continue;
        }
      }

      return validKeys;
    } catch {
      return [];
    }
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
   * Returns the total size of all cache files in bytes.
   *
   * Note: This includes both expired and non-expired entries.
   * Run prune() first to get accurate size of valid entries only.
   *
   * @returns Total size in bytes
   *
   * @example
   * ```ts
   * const bytes = cache.size();
   * console.log(`Cache size: ${(bytes / 1024).toFixed(2)} KB`);
   * ```
   */
  size(): number {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;

      for (const file of files) {
        try {
          const filename = path.join(this.cacheDir, file);
          const stats = fs.statSync(filename);
          totalSize += stats.size;
        } catch {
          // Skip files that can't be stat'd
          continue;
        }
      }

      return totalSize;
    } catch {
      return 0;
    }
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
    try {
      const files = fs.readdirSync(this.cacheDir);
      let removed = 0;

      for (const file of files) {
        const filename = path.join(this.cacheDir, file);

        try {
          const content = fs.readFileSync(filename, "utf8");
          const parsed = JSON.parse(content) as CachePayload<V> | null;

          // Remove if expired or invalid
          if (!parsed || parsed.value === undefined) {
            fs.unlinkSync(filename);
            removed++;
            continue;
          }

          if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
            fs.unlinkSync(filename);
            removed++;
          }
        } catch {
          // Remove invalid/unreadable files
          try {
            fs.unlinkSync(filename);
            removed++;
          } catch {
            // Ignore if file can't be removed
          }
        }
      }

      return removed;
    } catch {
      return 0;
    }
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
    const filename = this.pathForKey(key);
    if (!fs.existsSync(filename)) return null;

    try {
      const content = fs.readFileSync(filename, "utf8");
      const parsed = JSON.parse(content) as CachePayload<V> | null;

      if (!parsed || parsed.value === undefined) return null;

      // No expiration set
      if (parsed.expiresAt == null) return null;

      // Check if expired
      const remaining = parsed.expiresAt - Date.now();
      if (remaining <= 0) {
        fs.unlinkSync(filename);
        return null;
      }

      // Return remaining time in seconds
      return Math.ceil(remaining / 1000);
    } catch {
      return null;
    }
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
    const filename = this.pathForKey(key);
    if (!fs.existsSync(filename)) return false;

    try {
      const content = fs.readFileSync(filename, "utf8");
      const parsed = JSON.parse(content) as CachePayload<V> | null;

      if (!parsed || parsed.value === undefined) return false;

      // Check if already expired
      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return false;
      }

      // Update expiration
      const newExpiresAt =
        seconds == null || !Number.isFinite(seconds)
          ? undefined
          : Date.now() + seconds * 1000;
      const newPayload = JSON.stringify({
        value: parsed.value,
        expiresAt: newExpiresAt,
        key: parsed.key,
      });
      fs.writeFileSync(filename, newPayload, "utf8");
      return true;
    } catch {
      return false;
    }
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
    const filename = this.pathForKey(key);
    let currentValue = 0;
    let expiresAt: number | undefined;
    let storedKey: string | undefined;

    // Try to read existing value
    if (fs.existsSync(filename)) {
      try {
        const content = fs.readFileSync(filename, "utf8");
        const parsed = JSON.parse(content) as {
          value: unknown;
          expiresAt?: number;
          key?: string;
        } | null;

        if (parsed) {
          // Only use existing value if it's a number
          if (typeof parsed.value === "number") {
            currentValue = parsed.value;
          }
          expiresAt = parsed.expiresAt;
          storedKey = parsed.key;

          // Check if expired
          if (expiresAt != null && expiresAt <= Date.now()) {
            currentValue = 0;
            expiresAt = undefined;
          }
        }
      } catch {
        // Invalid file, start from 0
        currentValue = 0;
      }
    }

    const newValue = currentValue + amount;
    const payload = JSON.stringify({
      value: newValue,
      expiresAt,
      key: storedKey ?? key,
    });
    fs.writeFileSync(filename, payload, "utf8");
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

  /*****************************************************************************
   * Resolve default value; invoke factory when provided.
   ****************************************************************************/
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
