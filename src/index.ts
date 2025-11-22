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
   * Retrieve value or return provided default/null if missing or unreadable.
   ****************************************************************************/
  get(key: string, defaultValue: V | null | (() => V) = null): V | null {
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

      return parsed.value;
    } catch {
      return this.resolveDefault(defaultValue);
    }
  }

  /*****************************************************************************
   * Retrieve value or store the computed default when missing/expired.
   ****************************************************************************/
  remember(key: string, seconds: number, factory: () => V): V {
    const filename = this.pathForKey(key);

    if (this.has(key)) {
      const existing = this.get(key);
      if (existing !== null) return existing;
    }

    const value = factory();
    const expiresAt = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : undefined;
    const payload = JSON.stringify({ value, expiresAt });
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
   * Determine if a value exists and is not null.
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

      return parsed.value !== null;
    } catch {
      return false;
    }
  }

  /*****************************************************************************
   * Resolve default value; invoke factory when provided.
   ****************************************************************************/
  private resolveDefault(defaultValue: V | null | (() => V)): V | null {
    if (typeof defaultValue === "function") {
      try {
        return (defaultValue as () => V)();
      } catch {
        return null;
      }
    }
    return defaultValue;
  }
}

export default FileCache;
