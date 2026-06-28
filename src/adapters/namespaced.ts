import type { CacheAdapter } from './interface.js';
import { assertStringKey } from './utils.js';

const SEPARATOR = ':';

/**
 * A namespaced view of a parent cache adapter. All keys are transparently prefixed
 * with `${prefix}:` so multiple logical caches can share one backing store and be
 * invalidated as a group via the namespace's flush().
 *
 * @template V - The type of values stored in the cache
 */
export class NamespacedCache<V = unknown> implements CacheAdapter<V> {
  constructor(
    private readonly parent: CacheAdapter<V>,
    private readonly prefix: string
  ) {}

  /**
   * Returns the full (prefixed) key for a given sub-key.
   * Validates that the sub-key is a non-empty string.
   */
  private fullKey(key: string): string {
    assertStringKey(key);
    return `${this.prefix}${SEPARATOR}${key}`;
  }

  // ---------------------------------------------------------------------------
  // Single-key operations — delegate with prefixed key
  // ---------------------------------------------------------------------------

  async get(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined> {
    return this.parent.get(this.fullKey(key), defaultValue);
  }

  async put(key: string, value: V, seconds?: number): Promise<void> {
    return this.parent.put(this.fullKey(key), value, seconds);
  }

  async has(key: string): Promise<boolean> {
    return this.parent.has(this.fullKey(key));
  }

  async forget(key: string): Promise<boolean> {
    return this.parent.forget(this.fullKey(key));
  }

  async forever(key: string, value: V): Promise<void> {
    return this.parent.forever(this.fullKey(key), value);
  }

  async add(key: string, value: V, seconds?: number): Promise<boolean> {
    return this.parent.add(this.fullKey(key), value, seconds);
  }

  async pull(key: string, defaultValue?: V | (() => V | Promise<V>)): Promise<V | undefined> {
    return this.parent.pull(this.fullKey(key), defaultValue);
  }

  async remember(key: string, seconds: number, factory: () => V | Promise<V>): Promise<V> {
    return this.parent.remember(this.fullKey(key), seconds, factory);
  }

  async rememberForever(key: string, factory: () => V | Promise<V>): Promise<V> {
    return this.parent.rememberForever(this.fullKey(key), factory);
  }

  async ttl(key: string): Promise<number | null> {
    return this.parent.ttl(this.fullKey(key));
  }

  async touch(key: string, seconds: number): Promise<boolean> {
    return this.parent.touch(this.fullKey(key), seconds);
  }

  async increment(key: string, amount?: number): Promise<number> {
    return this.parent.increment(this.fullKey(key), amount);
  }

  async decrement(key: string, amount?: number): Promise<number> {
    return this.parent.decrement(this.fullKey(key), amount);
  }

  // ---------------------------------------------------------------------------
  // Batch operations
  // ---------------------------------------------------------------------------

  /**
   * Stores multiple key-value pairs under prefixed keys.
   * Prefixing converts `prefix:__proto__` to a safe own-property string,
   * so plain object assignment is acceptable here.
   */
  async putMany(items: Record<string, V>, seconds?: number): Promise<void> {
    const prefixed: Record<string, V> = {};
    for (const [key, value] of Object.entries(items)) {
      prefixed[this.fullKey(key)] = value;
    }
    return this.parent.putMany(prefixed, seconds);
  }

  /**
   * Retrieves multiple values by original (unprefixed) keys.
   * Builds the result with Object.defineProperty to prevent prototype pollution
   * when a key named '__proto__' is present in the input.
   */
  async getMany(keys: string[]): Promise<Record<string, V | undefined>> {
    const prefixedKeys = keys.map((k) => this.fullKey(k));
    const prefixedResult = await this.parent.getMany(prefixedKeys);
    const result: Record<string, V | undefined> = {};
    for (const key of keys) {
      Object.defineProperty(result, key, {
        value: prefixedResult[this.fullKey(key)],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    return result;
  }

  /**
   * Removes multiple items by original (unprefixed) keys.
   */
  async forgetMany(keys: string[]): Promise<number> {
    return this.parent.forgetMany(keys.map((k) => this.fullKey(k)));
  }

  // ---------------------------------------------------------------------------
  // keys / count / size
  // ---------------------------------------------------------------------------

  /**
   * Returns all non-expired keys in this namespace, with the `prefix:` stripped.
   * Uses an exact match on `prefix:` so namespace 'user' does NOT capture 'users:...' keys.
   */
  async keys(): Promise<string[]> {
    const ns = `${this.prefix}${SEPARATOR}`;
    const allKeys = await this.parent.keys();
    return allKeys.filter((k) => k.startsWith(ns)).map((k) => k.slice(ns.length));
  }

  /**
   * Returns the number of non-expired entries in this namespace.
   */
  async count(): Promise<number> {
    return (await this.keys()).length;
  }

  /**
   * Returns the approximate total byte size of this namespace's values only.
   * Computed by summing `Buffer.byteLength(JSON.stringify(value))` for each
   * defined value. Undefined values (missing/expired) are skipped.
   *
   * Note: this is an approximation — it does not account for metadata overhead.
   */
  async size(): Promise<number> {
    const keys = await this.keys();
    if (keys.length === 0) return 0;
    const values = await this.getMany(keys);
    let total = 0;
    for (const key of keys) {
      const val = values[key];
      if (val !== undefined) {
        total += Buffer.byteLength(JSON.stringify(val));
      }
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // flush() — SCOPED: removes only this namespace's keys
  // ---------------------------------------------------------------------------

  /**
   * Removes all keys belonging to this namespace from the backing store.
   * Sibling namespaces and root-level keys are NOT affected.
   *
   * This is the headline feature of namespacing: group-invalidation.
   */
  async flush(): Promise<void> {
    const ns = `${this.prefix}${SEPARATOR}`;
    const allKeys = await this.parent.keys();
    const mine = allKeys.filter((k) => k.startsWith(ns));
    if (mine.length === 0) return;
    await this.parent.forgetMany(mine);
  }

  // ---------------------------------------------------------------------------
  // prune / autoPrune — global maintenance, delegated to parent
  // ---------------------------------------------------------------------------

  /**
   * Delegates to parent.prune(). Prune is GLOBAL maintenance — it removes only
   * already-expired entries everywhere in the backing store. This is intentional
   * and harmless: pruning expired entries from other namespaces causes no data loss.
   */
  async prune(): Promise<number> {
    return this.parent.prune();
  }

  /**
   * Starts the background prune timer on the parent backing store.
   * This affects the whole backing store, not just this namespace.
   */
  startAutoPrune(intervalSeconds: number): void {
    this.parent.startAutoPrune(intervalSeconds);
  }

  /**
   * Stops the background prune timer on the parent backing store.
   */
  stopAutoPrune(): void {
    this.parent.stopAutoPrune();
  }

  // ---------------------------------------------------------------------------
  // namespace() — nesting support
  // ---------------------------------------------------------------------------

  /**
   * Returns a nested namespaced view. The effective prefix compounds naturally:
   * `cache.namespace('a').namespace('b')` → effective prefix `a:b`.
   *
   * @throws {TypeError} if prefix is not a non-empty string
   */
  namespace(prefix: string): CacheAdapter<V> {
    if (typeof prefix !== 'string' || prefix.length === 0) {
      throw new TypeError(
        `Namespace prefix must be a non-empty string (got ${JSON.stringify(prefix)})`
      );
    }
    return new NamespacedCache<V>(this, prefix);
  }
}
