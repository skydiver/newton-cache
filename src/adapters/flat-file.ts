import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { BaseCacheAdapter } from "./base.js";
import type { CachePayload, FlatFileCacheOptions } from "../types.js";

const DEFAULT_CACHE_FILE = path.join(tmpdir(), "flex-cache.json");

/**
 * Flat-file cache that stores all entries in a single JSON file.
 * Data is fully loaded into memory on first access and persisted on each write.
 *
 * @template V - The type of values stored in the cache
 */
export class FlatFileCache<V = unknown> extends BaseCacheAdapter<V> {
  private readonly filePath: string;
  private readonly store: Map<string, CachePayload<V>>;
  private loaded = false;
  private removedOnLoad = 0;

  constructor(options: FlatFileCacheOptions = {}) {
    super();
    const targetPath = options.filePath ?? DEFAULT_CACHE_FILE;
    this.filePath = path.resolve(targetPath);
    this.store = new Map();
  }

  get(key: string, defaultValue?: V | (() => V)): V | undefined {
    this.loadFromDisk();
    const entry = this.store.get(key);
    if (!entry) return this.resolveDefault(defaultValue);

    if (this.isExpired(entry)) {
      this.store.delete(key);
      this.saveToDisk();
      return this.resolveDefault(defaultValue);
    }

    return entry.value ?? undefined;
  }

  pull(key: string, defaultValue?: V | (() => V)): V | undefined {
    this.loadFromDisk();
    const entry = this.store.get(key);
    if (!entry) return this.resolveDefault(defaultValue);

    this.store.delete(key);

    if (this.isExpired(entry)) {
      this.saveToDisk();
      return this.resolveDefault(defaultValue);
    }

    this.saveToDisk();
    return entry.value ?? undefined;
  }

  put(key: string, value: V, seconds?: number): void {
    this.loadFromDisk();
    const expiresAt =
      seconds == null || !Number.isFinite(seconds) ? undefined : Date.now() + seconds * 1000;
    this.store.set(key, { value, expiresAt, key });
    this.saveToDisk();
  }

  forever(key: string, value: V): void {
    this.put(key, value);
  }

  forget(key: string): boolean {
    this.loadFromDisk();
    const existed = this.store.delete(key);
    if (existed) this.saveToDisk();
    return existed;
  }

  flush(): void {
    this.loaded = true;
    this.store.clear();
    try {
      fs.unlinkSync(this.filePath);
    } catch {
      /* ignore */
    }
  }

  add(key: string, value: V, seconds?: number): boolean {
    if (this.has(key)) return false;
    this.put(key, value, seconds);
    return true;
  }

  remember(key: string, seconds: number, factory: () => V): V {
    if (this.has(key)) {
      const existing = this.get(key);
      if (existing !== undefined) return existing;
    }

    const value = factory();
    this.put(key, value, seconds);
    return value;
  }

  rememberForever(key: string, factory: () => V): V {
    return this.remember(key, Number.POSITIVE_INFINITY, factory);
  }

  has(key: string): boolean {
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

  keys(): string[] {
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

  count(): number {
    return this.keys().length;
  }

  size(): number {
    this.loadFromDisk();
    try {
      const stats = fs.statSync(this.filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  prune(): number {
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

  ttl(key: string): number | null {
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

  touch(key: string, seconds: number): boolean {
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

  increment(key: string, amount = 1): number {
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

  decrement(key: string, amount = 1): number {
    return this.increment(key, -amount);
  }

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

  private isExpired(entry: CachePayload<V>): boolean {
    return entry.expiresAt != null && entry.expiresAt <= Date.now();
  }

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
