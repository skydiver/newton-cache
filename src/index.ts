import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type FileCacheOptions = {
  cachePath?: string;
};

const DEFAULT_CACHE_DIR = path.join(tmpdir(), "node-cache");

export class FileCache<V = unknown> {
  private readonly cacheDir: string;

  /*****************************************************************************
   * Create cache directory (defaults to OS tmp path).
   ****************************************************************************/
  constructor(options: FileCacheOptions = {}) {
    this.cacheDir = options.cachePath ?? DEFAULT_CACHE_DIR;
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  /*****************************************************************************
   * Retrieve value or return provided default/undefined if missing or unreadable.
   ****************************************************************************/
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

  /*****************************************************************************
   * Retrieve and delete value; returns default/undefined if missing or unreadable.
   ****************************************************************************/
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

  /*****************************************************************************
   * Store a value with optional TTL in seconds (forever when omitted).
   ****************************************************************************/
  put(key: string, value: V, seconds?: number): void {
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    const payload = JSON.stringify({ value, expiresAt });
    const filename = this.pathForKey(key);
    fs.writeFileSync(filename, payload, "utf8");
  }

  /*****************************************************************************
   * Store a value permanently (no expiry).
   ****************************************************************************/
  forever(key: string, value: V): void {
    this.put(key, value);
  }

  /*****************************************************************************
   * Remove an item from the cache; returns true if removed.
   ****************************************************************************/
  forget(key: string): boolean {
    const filename = this.pathForKey(key);
    if (!fs.existsSync(filename)) return false;
    fs.unlinkSync(filename);
    return true;
  }

  /*****************************************************************************
   * Clear all cached entries.
   ****************************************************************************/
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

  /*****************************************************************************
   * Add value only if missing; returns true if stored.
   ****************************************************************************/
  add(key: string, value: V, seconds?: number): boolean {
    if (this.has(key)) return false;
    this.put(key, value, seconds);
    return true;
  }

  /*****************************************************************************
   * Retrieve value or store the computed default when missing/expired.
   ****************************************************************************/
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

  /*****************************************************************************
   * Retrieve value or store it forever when missing.
   ****************************************************************************/
  rememberForever(key: string, factory: () => V): V {
    return this.remember(key, Number.POSITIVE_INFINITY, factory);
  }

  /*****************************************************************************
   * Encode the key into a safe filename inside the cache directory.
   ****************************************************************************/
  private pathForKey(key: string): string {
    const encoded = encodeURIComponent(key);
    return path.join(this.cacheDir, encoded);
  }

  /*****************************************************************************
   * Determine if a value exists and is not undefined.
   ****************************************************************************/
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
