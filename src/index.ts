import crypto from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Configuration options for FileCache
 */
export type FileCacheOptions = {
  /** Optional custom cache directory path. Defaults to OS temp directory. */
  cachePath?: string;
};

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
export class FileCache<V = unknown> {
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
      const parsed = JSON.parse(content) as { value: V; expiresAt?: number } | null;
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
      const parsed = JSON.parse(content) as { value: V; expiresAt?: number } | null;
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
    const payload = JSON.stringify({ value, expiresAt });
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
    const payload = JSON.stringify({ value, expiresAt });
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
      const parsed = JSON.parse(content) as { value: V; expiresAt?: number } | null;
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

export default FileCache;
