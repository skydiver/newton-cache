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
      return JSON.parse(content) as V;
    } catch {
      return this.resolveDefault(defaultValue);
    }
  }

  /*****************************************************************************
   * Encode the key into a safe filename inside the cache directory.
   ****************************************************************************/
  private pathForKey(key: string): string {
    const encoded = encodeURIComponent(key);
    return path.join(this.cacheDir, encoded);
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
