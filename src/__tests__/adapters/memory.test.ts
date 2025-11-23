import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryCache } from "../../index.js";

describe("MemoryCache", () => {
  it("returns default undefined when key is missing", () => {
    const cache = new MemoryCache();
    assert.equal(cache.get("missing"), undefined);
  });

  it("returns provided default value when key is missing", () => {
    const cache = new MemoryCache();
    assert.equal(cache.get("missing", "default"), "default");
  });

  it("invokes default factory when key is missing", () => {
    const cache = new MemoryCache();
    const value = cache.get("missing", () => "from-factory");
    assert.equal(value, "from-factory");
  });

  it("has returns true when key exists with non-undefined value", () => {
    const cache = new MemoryCache();
    cache.put("exists", 1);
    assert.equal(cache.has("exists"), true);
  });

  it("has returns false when key is missing", () => {
    const cache = new MemoryCache();
    assert.equal(cache.has("missing"), false);
  });

  it("stores and retrieves values from memory", () => {
    const cache = new MemoryCache();
    cache.put("answer", 42);
    assert.equal(cache.get("answer"), 42);
  });

  it("returns undefined when stored value is null", () => {
    const cache = new MemoryCache();
    cache.put("nullish", null as unknown as string);
    assert.equal(cache.get("nullish"), undefined);
  });

  it("remembers value when missing and caches it", () => {
    const cache = new MemoryCache();
    const value = cache.remember("remember", 60, () => ({ payload: 123 }));
    assert.deepEqual(value, { payload: 123 });
    assert.deepEqual(cache.get("remember"), { payload: 123 });
  });

  it("remembers returns existing non-expired value", () => {
    const cache = new MemoryCache();
    cache.put("existing", "kept", 10000);
    const value = cache.remember("existing", 60, () => "new");
    assert.equal(value, "kept");
  });

  it("remember overwrites expired entry", () => {
    const cache = new MemoryCache();
    cache.put("existing-expired", "old", 0.001); // Expires almost immediately

    // Wait for expiration
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      const value = cache.remember("existing-expired", 60, () => "fresh");
      assert.equal(value, "fresh");
      assert.equal(cache.get("existing-expired"), "fresh");
    });
  });

  it("remember with non-finite TTL stores without expiresAt", () => {
    const cache = new MemoryCache();
    const value = cache.remember("remember-nonfinite", Number.POSITIVE_INFINITY, () => "forever");
    assert.equal(value, "forever");
    assert.equal(cache.ttl("remember-nonfinite"), null);
  });

  it("rememberForever stores without expiry", () => {
    const cache = new MemoryCache();
    const value = cache.rememberForever("forever", () => "persistent");
    assert.equal(value, "persistent");
    assert.equal(cache.ttl("forever"), null);
  });

  it("put stores with TTL", () => {
    const cache = new MemoryCache();
    cache.put("ttl", "value", 10);
    const ttl = cache.ttl("ttl");
    assert.ok(ttl !== null && ttl <= 10);
  });

  it("put stores forever when TTL omitted", () => {
    const cache = new MemoryCache();
    cache.put("forever-put", "value");
    assert.equal(cache.get("forever-put"), "value");
    assert.equal(cache.ttl("forever-put"), null);
  });

  it("put with NaN TTL stores without expiresAt", () => {
    const cache = new MemoryCache();
    cache.put("nan-put", "value", Number.NaN);
    assert.equal(cache.get("nan-put"), "value");
    assert.equal(cache.ttl("nan-put"), null);
  });

  it("forever stores without expiry", () => {
    const cache = new MemoryCache();
    cache.forever("forever-method", "value");
    assert.equal(cache.get("forever-method"), "value");
    assert.equal(cache.ttl("forever-method"), null);
  });

  it("forget removes an item and returns true when it existed", () => {
    const cache = new MemoryCache();
    cache.put("forget-me", 1);
    assert.equal(cache.forget("forget-me"), true);
    assert.equal(cache.has("forget-me"), false);
    assert.equal(cache.forget("forget-me"), false);
  });

  it("forget returns false when key missing", () => {
    const cache = new MemoryCache();
    assert.equal(cache.forget("absent"), false);
  });

  it("flush clears all entries", () => {
    const cache = new MemoryCache();
    cache.put("a", 1);
    cache.put("b", 2);
    cache.flush();
    assert.equal(cache.count(), 0);
  });

  it("add stores only when missing", () => {
    const cache = new MemoryCache();
    const first = cache.add("add-key", "one", 10);
    const second = cache.add("add-key", "two", 10);
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(cache.get("add-key"), "one");
  });

  it("add respects existing non-expired value", () => {
    const cache = new MemoryCache();
    cache.put("add-existing", "kept", 1000);
    const stored = cache.add("add-existing", "new", 10);
    assert.equal(stored, false);
    assert.equal(cache.get("add-existing"), "kept");
  });

  it("pull returns value and deletes the entry", () => {
    const cache = new MemoryCache();
    cache.put("pull-me", 99);
    const value = cache.pull("pull-me");
    assert.equal(value, 99);
    assert.equal(cache.has("pull-me"), false);
  });

  it("pull returns default when missing or expired", () => {
    const cache = new MemoryCache();
    assert.equal(cache.pull("missing", "default"), "default");
    assert.equal(cache.pull("missing2", () => "from-factory"), "from-factory");
  });

  it("pull returns undefined when stored value is null", () => {
    const cache = new MemoryCache();
    cache.put("nullish", null as unknown as string);
    assert.equal(cache.pull("nullish"), undefined);
    assert.equal(cache.has("nullish"), false);
  });

  it("pull removes expired entries and returns default", () => {
    const cache = new MemoryCache();
    cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      assert.equal(cache.pull("expired", "default"), "default");
      assert.equal(cache.has("expired"), false);
    });
  });

  it("resolveDefault returns undefined when factory throws", () => {
    const cache = new MemoryCache();
    const value = cache.get("missing", () => {
      throw new Error("boom");
    });
    assert.equal(value, undefined);
  });

  // Introspection methods
  it("keys returns all non-expired cache keys", () => {
    const cache = new MemoryCache();
    cache.put("key1", "value1");
    cache.put("key2", "value2");
    cache.put("key3", "value3");
    const keys = cache.keys();
    assert.equal(keys.length, 3);
    assert.ok(keys.includes("key1"));
    assert.ok(keys.includes("key2"));
    assert.ok(keys.includes("key3"));
  });

  it("keys returns empty array when cache is empty", () => {
    const cache = new MemoryCache();
    assert.deepEqual(cache.keys(), []);
  });

  it("keys removes expired entries during enumeration", () => {
    const cache = new MemoryCache();
    cache.put("stale", "data", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      const keys = cache.keys();
      assert.deepEqual(keys, []);
      assert.equal(cache.has("stale"), false);
    });
  });

  it("count returns number of cached items", () => {
    const cache = new MemoryCache();
    assert.equal(cache.count(), 0);
    cache.put("a", 1);
    assert.equal(cache.count(), 1);
    cache.put("b", 2);
    cache.put("c", 3);
    assert.equal(cache.count(), 3);
    cache.forget("b");
    assert.equal(cache.count(), 2);
  });

  it("size returns approximate cache size in bytes", () => {
    const cache = new MemoryCache();
    assert.equal(cache.size(), 0);
    cache.put("key", "value");
    const sizeAfterOne = cache.size();
    assert.ok(sizeAfterOne > 0);
    cache.put("key2", "value2");
    const sizeAfterTwo = cache.size();
    assert.ok(sizeAfterTwo > sizeAfterOne);
  });

  it("size skips entries that cannot be serialized", () => {
    const cache = new MemoryCache();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    cache.put("cyclic", cyclic);
    cache.put("normal", { value: 1 });

    const size = cache.size(); // Should skip cyclic entry without throwing
    assert.ok(size > 0);
  });

  // Cleanup
  it("prune removes only expired entries", () => {
    const cache = new MemoryCache();
    cache.put("valid1", "data1", 3600);
    cache.put("valid2", "data2");
    cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      const removed = cache.prune();
      assert.equal(removed, 1);
      assert.equal(cache.count(), 2);
      assert.ok(cache.has("valid1"));
      assert.ok(cache.has("valid2"));
      assert.ok(!cache.has("expired"));
    });
  });

  it("prune returns zero when cache is empty", () => {
    const cache = new MemoryCache();
    assert.equal(cache.prune(), 0);
  });

  // TTL management
  it("ttl returns remaining time in seconds", () => {
    const cache = new MemoryCache();
    cache.put("session", "data", 10);
    const ttl = cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! <= 10 && ttl! > 0);
  });

  it("ttl returns null for non-existent keys", () => {
    const cache = new MemoryCache();
    assert.equal(cache.ttl("missing"), null);
  });

  it("ttl returns null for keys without expiration", () => {
    const cache = new MemoryCache();
    cache.put("permanent", "data");
    assert.equal(cache.ttl("permanent"), null);
  });

  it("ttl returns null and removes expired entries", () => {
    const cache = new MemoryCache();
    cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      assert.equal(cache.ttl("expired"), null);
      assert.equal(cache.has("expired"), false);
    });
  });

  it("touch extends TTL of existing entry", () => {
    const cache = new MemoryCache();
    cache.put("session", "data", 10);
    const updated = cache.touch("session", 3600);
    assert.equal(updated, true);
    const ttl = cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! > 10);
  });

  it("touch returns false for non-existent keys", () => {
    const cache = new MemoryCache();
    assert.equal(cache.touch("missing", 60), false);
  });

  it("touch returns false for expired entries", () => {
    const cache = new MemoryCache();
    cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      assert.equal(cache.touch("expired", 60), false);
      assert.equal(cache.has("expired"), false);
    });
  });

  it("touch can remove TTL by passing Infinity", () => {
    const cache = new MemoryCache();
    cache.put("session", "data", 60);
    cache.touch("session", Number.POSITIVE_INFINITY);
    assert.equal(cache.ttl("session"), null);
    assert.ok(cache.has("session"));
  });

  // Atomic counters
  it("increment creates and increments numeric values", () => {
    const cache = new MemoryCache();
    assert.equal(cache.increment("counter"), 1);
    assert.equal(cache.increment("counter"), 2);
    assert.equal(cache.increment("counter"), 3);
    assert.equal(cache.increment("counter", 10), 13);
  });

  it("increment treats non-numeric values as zero", () => {
    const cache = new MemoryCache<string | number>();
    cache.put("text", "hello");
    assert.equal(cache.increment("text"), 1);
    assert.equal(cache.increment("text"), 2);
  });

  it("increment preserves TTL of existing entries", () => {
    const cache = new MemoryCache();
    cache.put("counter", 5, 3600);
    cache.increment("counter");
    const ttl = cache.ttl("counter");
    assert.ok(ttl !== null && ttl! > 0);
  });

  it("decrement decreases numeric values", () => {
    const cache = new MemoryCache();
    cache.put("credits", 100);
    assert.equal(cache.decrement("credits"), 99);
    assert.equal(cache.decrement("credits", 10), 89);
    assert.equal(cache.decrement("credits", 5), 84);
  });

  it("decrement creates negative values when key missing", () => {
    const cache = new MemoryCache();
    assert.equal(cache.decrement("missing"), -1);
    assert.equal(cache.decrement("missing"), -2);
  });

  it("increment and decrement work together", () => {
    const cache = new MemoryCache();
    cache.put("balance", 50);
    cache.increment("balance", 20);
    cache.decrement("balance", 10);
    cache.increment("balance", 5);
    assert.equal(cache.get("balance"), 65);
  });

  // Type safety with generics
  it("supports typed values", () => {
    interface User {
      id: number;
      name: string;
    }
    const cache = new MemoryCache<User>();
    cache.put("user:1", { id: 1, name: "Alice" });
    const user = cache.get("user:1");
    assert.deepEqual(user, { id: 1, name: "Alice" });
  });

  it("handles complex objects", () => {
    const cache = new MemoryCache<Record<string, unknown>>();
    const data = {
      nested: { deep: { value: 42 } },
      array: [1, 2, 3],
      date: new Date().toISOString(),
    };
    cache.put("complex", data);
    assert.deepEqual(cache.get("complex"), data);
  });

  it("get deletes expired entries automatically", () => {
    const cache = new MemoryCache();
    cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      const value = cache.get("expired", "default");
      assert.equal(value, "default");
      assert.equal(cache.has("expired"), false);
    });
  });

  it("has deletes expired entries automatically", () => {
    const cache = new MemoryCache();
    cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      assert.equal(cache.has("expired"), false);
    });
  });

  // Batch operations
  it("getMany retrieves multiple values", () => {
    const cache = new MemoryCache();
    cache.put("key1", "value1");
    cache.put("key2", "value2");
    cache.put("key3", "value3");

    const result = cache.getMany(["key1", "key2", "key3"]);
    assert.deepEqual(result, {
      key1: "value1",
      key2: "value2",
      key3: "value3",
    });
  });

  it("getMany returns undefined for missing keys", () => {
    const cache = new MemoryCache();
    cache.put("key1", "value1");

    const result = cache.getMany(["key1", "missing", "key3"]);
    assert.deepEqual(result, {
      key1: "value1",
      missing: undefined,
      key3: undefined,
    });
  });

  it("getMany handles expired entries", () => {
    const cache = new MemoryCache();
    cache.put("valid", "data", 3600);
    cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    return delay(10).then(() => {
      const result = cache.getMany(["valid", "expired"]);
      assert.deepEqual(result, {
        valid: "data",
        expired: undefined,
      });
    });
  });

  it("getMany returns empty object for empty key array", () => {
    const cache = new MemoryCache();
    const result = cache.getMany([]);
    assert.deepEqual(result, {});
  });

  it("putMany stores multiple key-value pairs", () => {
    const cache = new MemoryCache();
    cache.putMany({
      key1: "value1",
      key2: "value2",
      key3: "value3",
    });

    assert.equal(cache.get("key1"), "value1");
    assert.equal(cache.get("key2"), "value2");
    assert.equal(cache.get("key3"), "value3");
    assert.equal(cache.count(), 3);
  });

  it("putMany stores with TTL", () => {
    const cache = new MemoryCache();
    cache.putMany({
      session1: "data1",
      session2: "data2",
    }, 10);

    const ttl1 = cache.ttl("session1");
    const ttl2 = cache.ttl("session2");
    assert.ok(ttl1 !== null && ttl1 <= 10);
    assert.ok(ttl2 !== null && ttl2 <= 10);
  });

  it("putMany stores without TTL when omitted", () => {
    const cache = new MemoryCache();
    cache.putMany({
      perm1: "value1",
      perm2: "value2",
    });

    assert.equal(cache.ttl("perm1"), null);
    assert.equal(cache.ttl("perm2"), null);
  });

  it("putMany overwrites existing values", () => {
    const cache = new MemoryCache();
    cache.put("existing", "old");
    cache.putMany({ existing: "new", other: "value" });

    assert.equal(cache.get("existing"), "new");
    assert.equal(cache.get("other"), "value");
  });

  it("putMany handles empty object", () => {
    const cache = new MemoryCache();
    cache.putMany({});
    assert.equal(cache.count(), 0);
  });

  it("forgetMany removes multiple items", () => {
    const cache = new MemoryCache();
    cache.put("key1", "value1");
    cache.put("key2", "value2");
    cache.put("key3", "value3");

    const removed = cache.forgetMany(["key1", "key3"]);
    assert.equal(removed, 2);
    assert.equal(cache.has("key1"), false);
    assert.equal(cache.has("key2"), true);
    assert.equal(cache.has("key3"), false);
  });

  it("forgetMany returns correct count for mixed existing and missing keys", () => {
    const cache = new MemoryCache();
    cache.put("key1", "value1");
    cache.put("key2", "value2");

    const removed = cache.forgetMany(["key1", "missing", "key2"]);
    assert.equal(removed, 2);
    assert.equal(cache.count(), 0);
  });

  it("forgetMany returns zero for all missing keys", () => {
    const cache = new MemoryCache();
    const removed = cache.forgetMany(["missing1", "missing2"]);
    assert.equal(removed, 0);
  });

  it("forgetMany handles empty array", () => {
    const cache = new MemoryCache();
    cache.put("key", "value");
    const removed = cache.forgetMany([]);
    assert.equal(removed, 0);
    assert.equal(cache.count(), 1);
  });

  it("batch operations work together", () => {
    const cache = new MemoryCache();

    // Store batch
    cache.putMany({
      user1: "Alice",
      user2: "Bob",
      user3: "Charlie",
    }, 60);

    // Retrieve batch
    const users = cache.getMany(["user1", "user2", "user3"]);
    assert.deepEqual(users, {
      user1: "Alice",
      user2: "Bob",
      user3: "Charlie",
    });

    // Remove some
    const removed = cache.forgetMany(["user1", "user3"]);
    assert.equal(removed, 2);

    // Verify remaining
    const remaining = cache.getMany(["user1", "user2", "user3"]);
    assert.deepEqual(remaining, {
      user1: undefined,
      user2: "Bob",
      user3: undefined,
    });
  });
});
