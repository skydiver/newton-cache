type CacheEntry<V> = {
  value: V;
  expiresAt?: number;
};

export type CacheOptions = {
  ttl?: number;
};

export class MemoryCache<K, V> {
  private readonly defaultTtl?: number;
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl;
  }

  set(key: K, value: V, ttl?: number): void {
    const now = Date.now();
    const effectiveTtl = ttl ?? this.defaultTtl;
    const expiresAt = effectiveTtl != null ? now + effectiveTtl : undefined;
    this.store.set(key, { value, expiresAt });
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  keys(): IterableIterator<K> {
    return this.store.keys();
  }

  size(): number {
    this.pruneExpired();
    return this.store.size;
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    if (entry.expiresAt == null) return false;
    return entry.expiresAt <= Date.now();
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt != null && entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

export default MemoryCache;
