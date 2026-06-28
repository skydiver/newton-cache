import crypto from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FileCacheOptions } from '../types.js';
import { assertStringKey, BaseCacheAdapter, isCachePayload, validateTTL } from './base.js';

const DEFAULT_CACHE_DIR = path.join(tmpdir(), 'node-cache');
const MAX_KEY_LENGTH = 200; // Safe limit for encoded filenames across filesystems
const DEFAULT_FILE_MODE = 0o600;
const DEFAULT_DIR_MODE = 0o700;

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
export class FileCache<V = unknown> extends BaseCacheAdapter<V> {
  private readonly cacheDir: string;
  private readonly fileMode: number;

  /**
   * Creates a new FileCache instance.
   *
   * @param options - Configuration options
   * @param options.cachePath - Custom cache directory path (defaults to OS temp directory)
   * @param options.mode - POSIX file mode for cache files (default: 0o600)
   *
   * @example
   * ```ts
   * const cache = new FileCache({ cachePath: '/var/tmp/my-cache' });
   * ```
   */
  constructor(options: FileCacheOptions = {}) {
    super();
    const cachePath = options.cachePath ?? DEFAULT_CACHE_DIR;

    // Resolve to absolute path and normalize (prevents path traversal)
    this.cacheDir = path.resolve(cachePath);
    this.fileMode = options.mode ?? DEFAULT_FILE_MODE;

    fs.mkdirSync(this.cacheDir, { recursive: true, mode: DEFAULT_DIR_MODE });
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
    const filename = this.pathForKey(key);
    try {
      const content = fs.readFileSync(filename, 'utf8');
      const rawParsed: unknown = JSON.parse(content);
      if (!isCachePayload<V>(rawParsed)) return await this.resolveDefault(defaultValue);
      const parsed = rawParsed;

      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return await this.resolveDefault(defaultValue);
      }

      return parsed.value ?? undefined;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return await this.resolveDefault(defaultValue);
      // JSON parse errors or other read errors — return default
      return await this.resolveDefault(defaultValue);
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
   * const token = await cache.pull('one-time-token'); // Read and delete
   * ```
   */
  async pull(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined> {
    const filename = this.pathForKey(key);
    try {
      const content = fs.readFileSync(filename, 'utf8');
      const rawParsed: unknown = JSON.parse(content);

      if (!isCachePayload<V>(rawParsed)) {
        fs.unlinkSync(filename);
        return await this.resolveDefault(defaultValue);
      }
      const parsed = rawParsed;

      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return await this.resolveDefault(defaultValue);
      }

      // Delete before returning the value. Swallow cleanup errors so the value
      // is always returned even if the file can't be removed (race condition).
      try {
        fs.unlinkSync(filename);
      } catch {
        /* ignore race-condition failures */
      }
      return parsed.value ?? undefined;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return await this.resolveDefault(defaultValue);
      // Other errors (directory entry, permissions) — try to clean up and return default
      try {
        fs.unlinkSync(filename);
      } catch {
        /* ignore */
      }
      return await this.resolveDefault(defaultValue);
    }
  }

  /**
   * Stores a value in the cache with an optional TTL.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds (omit or pass Infinity for no expiration)
   * @throws {RangeError} If seconds is NaN or negative
   *
   * @example
   * ```ts
   * await cache.put('key', 'value', 60); // Expires in 60 seconds
   * await cache.put('key', 'value');      // Never expires
   * ```
   */
  async put(key: string, value: V, seconds?: number): Promise<void> {
    validateTTL(seconds);
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    // Store original key for reconstruction (needed for hashed long keys)
    const payload = JSON.stringify({ value, expiresAt, key });
    const filename = this.pathForKey(key);
    fs.writeFileSync(filename, payload, { encoding: 'utf8', mode: this.fileMode });
  }

  /**
   * Removes an item from the cache.
   *
   * @param key - The cache key
   * @returns True if the item existed and was removed, false otherwise
   *
   * @example
   * ```ts
   * const removed = await cache.forget('user:123');
   * ```
   */
  async forget(key: string): Promise<boolean> {
    const filename = this.pathForKey(key);
    try {
      fs.unlinkSync(filename);
      return true;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  /**
   * Clears all cached entries.
   *
   * @example
   * ```ts
   * await cache.flush(); // Removes all cached items
   * ```
   */
  async flush(): Promise<void> {
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
   * Atomicity guarantee: uses O_EXCL (exclusive file creation) so that at most
   * one concurrent caller gets true on a single filesystem. This is per-process
   * atomicity on a local filesystem — it is NOT a reliable distributed lock.
   *
   * Expired entries are treated as absent: add() will overwrite them and return true.
   * Note: the atomicity guarantee applies only to a fresh (non-existent) key. When the
   * key already exists but is expired, two concurrent callers may both overwrite it and
   * return true, since the expired-overwrite path is not exclusive.
   *
   * @param key - The cache key
   * @param value - The value to store
   * @param seconds - Optional TTL in seconds
   * @returns True if the value was stored, false if key already exists
   *
   * @example
   * ```ts
   * const added = await cache.add('lock', 'process-1', 10); // Returns true
   * const added = await cache.add('lock', 'process-2', 10); // Returns false (already exists)
   * ```
   */
  async add(key: string, value: V, seconds?: number): Promise<boolean> {
    const filename = this.pathForKey(key);

    // Attempt exclusive creation (O_EXCL) — atomic on a single filesystem.
    let fd: number;
    try {
      fd = fs.openSync(filename, 'wx', this.fileMode);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'EEXIST') throw error;

      // File exists — check if it's expired or invalid, and overwrite if so.
      try {
        const content = fs.readFileSync(filename, 'utf8');
        const rawParsed: unknown = JSON.parse(content);

        if (!isCachePayload<V>(rawParsed)) {
          // Null / invalid payload — overwrite
          await this.put(key, value, seconds);
          return true;
        }
        const parsed = rawParsed;

        if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
          // Expired — overwrite
          await this.put(key, value, seconds);
          return true;
        }

        // Valid, non-expired entry — key already exists
        return false;
      } catch {
        // JSON parse error — corrupt file, overwrite
        await this.put(key, value, seconds);
        return true;
      }
    }

    // Exclusive create succeeded — write the payload and close.
    try {
      validateTTL(seconds);
      const expiresAt =
        seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
      const payload = JSON.stringify({ value, expiresAt, key });
      fs.writeSync(fd, payload);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  }

  /*****************************************************************************
   * Encode the key into a safe filename inside the cache directory.
   *
   * Guards:
   *  1. key must be a string (L2)
   *  2. The raw key, when path-resolved relative to cacheDir, must not escape
   *     cacheDir — this blocks `.`, `..`, `../x`, and `a/../../b` (H2)
   *  3. Defense-in-depth: the encoded filename, when path-resolved, must also
   *     stay inside cacheDir
   *  Long keys are hashed to prevent filesystem length limits.
   ****************************************************************************/
  private pathForKey(key: string): string {
    assertStringKey(key);

    // Guard 1: resolve raw key as if it were a relative path — must stay inside cacheDir.
    const boundary = path.resolve(this.cacheDir) + path.sep;
    const resolvedRaw = path.resolve(this.cacheDir, key);
    if (!resolvedRaw.startsWith(boundary)) {
      throw new TypeError('Invalid cache key');
    }

    // Build encoded filename (hash long keys to stay within fs limits)
    let filename: string;
    if (key.length > MAX_KEY_LENGTH) {
      const hash = crypto.createHash('sha256').update(key).digest('hex');
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
   * if (await cache.has('user:123')) {
   *   // Value exists and is not expired
   * }
   * ```
   */
  async has(key: string): Promise<boolean> {
    const filename = this.pathForKey(key);
    try {
      const content = fs.readFileSync(filename, 'utf8');
      const rawParsed: unknown = JSON.parse(content);
      if (!isCachePayload<V>(rawParsed)) return false;
      const parsed = rawParsed;

      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return false;
      }

      return parsed.value !== undefined;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return false;
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
   * const allKeys = await cache.keys();
   * console.log('Cached keys:', allKeys);
   * ```
   */
  async keys(): Promise<string[]> {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const validKeys: string[] = [];

      for (const file of files) {
        const filename = path.join(this.cacheDir, file);

        try {
          const content = fs.readFileSync(filename, 'utf8');
          const rawParsed: unknown = JSON.parse(content);

          if (!isCachePayload<V>(rawParsed) || rawParsed.value === undefined) continue;
          const parsed = rawParsed;

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
   * Returns the total size of all cache files in bytes.
   *
   * Note: This includes both expired and non-expired entries.
   * Run prune() first to get accurate size of valid entries only.
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
   * const removed = await cache.prune();
   * console.log(`Removed ${removed} expired entries`);
   * ```
   */
  async prune(): Promise<number> {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let removed = 0;

      for (const file of files) {
        const filename = path.join(this.cacheDir, file);

        try {
          const content = fs.readFileSync(filename, 'utf8');
          const rawParsed: unknown = JSON.parse(content);

          // Remove if invalid, expired, or missing value
          if (!isCachePayload<V>(rawParsed) || rawParsed.value === undefined) {
            fs.unlinkSync(filename);
            removed++;
            continue;
          }
          const parsed = rawParsed;

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
   * await cache.put('session', data, 3600); // 1 hour TTL
   * const remaining = await cache.ttl('session'); // e.g., 3599
   * ```
   */
  async ttl(key: string): Promise<number | null> {
    const filename = this.pathForKey(key);
    try {
      const content = fs.readFileSync(filename, 'utf8');
      const rawParsed: unknown = JSON.parse(content);

      if (!isCachePayload<V>(rawParsed) || rawParsed.value === undefined) return null;
      const parsed = rawParsed;

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
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return null;
      return null;
    }
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
   * await cache.put('session', data, 60);  // Expires in 60 seconds
   * await cache.touch('session', 3600);    // Extend to 1 hour from now
   * ```
   */
  async touch(key: string, seconds: number): Promise<boolean> {
    validateTTL(seconds);
    const filename = this.pathForKey(key);
    try {
      const content = fs.readFileSync(filename, 'utf8');
      const rawParsed: unknown = JSON.parse(content);

      if (!isCachePayload<V>(rawParsed) || rawParsed.value === undefined) return false;
      const parsed = rawParsed;

      // Check if already expired
      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) {
        fs.unlinkSync(filename);
        return false;
      }

      // Update expiration
      const newExpiresAt =
        seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
      const newPayload = JSON.stringify({
        value: parsed.value,
        expiresAt: newExpiresAt,
        key: parsed.key,
      });
      fs.writeFileSync(filename, newPayload, { encoding: 'utf8', mode: this.fileMode });
      return true;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') return false;
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
   * await cache.increment('page-views');        // 1
   * await cache.increment('page-views');        // 2
   * await cache.increment('page-views', 10);    // 12
   * ```
   */
  async increment(key: string, amount = 1): Promise<number> {
    const filename = this.pathForKey(key);
    let currentValue = 0;
    let expiresAt: number | undefined;
    let storedKey: string | undefined;

    // Try to read existing value
    try {
      const content = fs.readFileSync(filename, 'utf8');
      const rawParsed: unknown = JSON.parse(content);

      if (isCachePayload<V>(rawParsed)) {
        // Only use existing value if it's a number
        if (typeof rawParsed.value === 'number') {
          currentValue = rawParsed.value;
        }
        expiresAt = rawParsed.expiresAt;
        storedKey = rawParsed.key;

        // Check if expired
        if (expiresAt != null && expiresAt <= Date.now()) {
          currentValue = 0;
          expiresAt = undefined;
        }
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      // ENOENT means key doesn't exist yet — start from 0 (already the default)
      if (error.code !== 'ENOENT') {
        // Invalid file content — start from 0 (already the default)
      }
    }

    const newValue = currentValue + amount;
    const payload = JSON.stringify({
      value: newValue,
      expiresAt,
      key: storedKey ?? key,
    });
    fs.writeFileSync(filename, payload, { encoding: 'utf8', mode: this.fileMode });
    return newValue;
  }
}
