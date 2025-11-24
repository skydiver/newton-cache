import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryCache } from "../../index.js";

describe("MemoryCache", () => {
  it("returns default undefined when key is missing", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.get("missing"), undefined);
  });

  it("returns provided default value when key is missing", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.get("missing", "default"), "default");
  });

  it("invokes default factory when key is missing", async () => {
    const cache = new MemoryCache();
    const value = await cache.get("missing", () => "from-factory");
    assert.equal(value, "from-factory");
  });

  it("has returns true when key exists with non-undefined value", async () => {
    const cache = new MemoryCache();
    await cache.put("exists", 1);
    assert.equal(await cache.has("exists"), true);
  });

  it("has returns false when key is missing", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.has("missing"), false);
  });

  it("stores and retrieves values from memory", async () => {
    const cache = new MemoryCache();
    await cache.put("answer", 42);
    assert.equal(await cache.get("answer"), 42);
  });

  it("returns undefined when stored value is null", async () => {
    const cache = new MemoryCache();
    await cache.put("nullish", null as unknown as string);
    assert.equal(await cache.get("nullish"), undefined);
  });

  it("remembers value when missing and caches it", async () => {
    const cache = new MemoryCache();
    const value = await cache.remember("remember", 60, () => ({ payload: 123 }));
    assert.deepEqual(value, { payload: 123 });
    assert.deepEqual(await cache.get("remember"), { payload: 123 });
  });

  it("remembers returns existing non-expired value", async () => {
    const cache = new MemoryCache();
    await cache.put("existing", "kept", 10000);
    const value = await cache.remember("existing", 60, () => "new");
    assert.equal(value, "kept");
  });

  it("remember overwrites expired entry", async () => {
    const cache = new MemoryCache();
    await cache.put("existing-expired", "old", 0.001); // Expires almost immediately

    // Wait for expiration
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    const value = await cache.remember("existing-expired", 60, () => "fresh");
    assert.equal(value, "fresh");
    assert.equal(await cache.get("existing-expired"), "fresh");
  });

  it("remember with non-finite TTL stores without expiresAt", async () => {
    const cache = new MemoryCache();
    const value = await cache.remember("remember-nonfinite", Number.POSITIVE_INFINITY, () => "forever");
    assert.equal(value, "forever");
    assert.equal(await cache.ttl("remember-nonfinite"), null);
  });

  it("rememberForever stores without expiry", async () => {
    const cache = new MemoryCache();
    const value = await cache.rememberForever("forever", () => "persistent");
    assert.equal(value, "persistent");
    assert.equal(await cache.ttl("forever"), null);
  });

  it("put stores with TTL", async () => {
    const cache = new MemoryCache();
    await cache.put("ttl", "value", 10);
    const ttl = await cache.ttl("ttl");
    assert.ok(ttl !== null && ttl <= 10);
  });

  it("put stores forever when TTL omitted", async () => {
    const cache = new MemoryCache();
    await cache.put("forever-put", "value");
    assert.equal(await cache.get("forever-put"), "value");
    assert.equal(await cache.ttl("forever-put"), null);
  });

  it("put with NaN TTL stores without expiresAt", async () => {
    const cache = new MemoryCache();
    await cache.put("nan-put", "value", Number.NaN);
    assert.equal(await cache.get("nan-put"), "value");
    assert.equal(await cache.ttl("nan-put"), null);
  });

  it("forever stores without expiry", async () => {
    const cache = new MemoryCache();
    await cache.forever("forever-method", "value");
    assert.equal(await cache.get("forever-method"), "value");
    assert.equal(await cache.ttl("forever-method"), null);
  });

  it("forget removes an item and returns true when it existed", async () => {
    const cache = new MemoryCache();
    await cache.put("forget-me", 1);
    assert.equal(await cache.forget("forget-me"), true);
    assert.equal(await cache.has("forget-me"), false);
    assert.equal(await cache.forget("forget-me"), false);
  });

  it("forget returns false when key missing", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.forget("absent"), false);
  });

  it("flush clears all entries", async () => {
    const cache = new MemoryCache();
    await cache.put("a", 1);
    await cache.put("b", 2);
    await cache.flush();
    assert.equal(await cache.count(), 0);
  });

  it("add stores only when missing", async () => {
    const cache = new MemoryCache();
    const first = await cache.add("add-key", "one", 10);
    const second = await cache.add("add-key", "two", 10);
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(await cache.get("add-key"), "one");
  });

  it("add respects existing non-expired value", async () => {
    const cache = new MemoryCache();
    await cache.put("add-existing", "kept", 1000);
    const stored = await cache.add("add-existing", "new", 10);
    assert.equal(stored, false);
    assert.equal(await cache.get("add-existing"), "kept");
  });

  it("pull returns value and deletes the entry", async () => {
    const cache = new MemoryCache();
    await cache.put("pull-me", 99);
    const value = await cache.pull("pull-me");
    assert.equal(value, 99);
    assert.equal(await cache.has("pull-me"), false);
  });

  it("pull returns default when missing or expired", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.pull("missing", "default"), "default");
    assert.equal(await cache.pull("missing2", () => "from-factory"), "from-factory");
  });

  it("pull returns undefined when stored value is null", async () => {
    const cache = new MemoryCache();
    await cache.put("nullish", null as unknown as string);
    assert.equal(await cache.pull("nullish"), undefined);
    assert.equal(await cache.has("nullish"), false);
  });

  it("pull removes expired entries and returns default", async () => {
    const cache = new MemoryCache();
    await cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    assert.equal(await cache.pull("expired", "default"), "default");
    assert.equal(await cache.has("expired"), false);
  });

  it("resolveDefault returns undefined when factory throws", async () => {
    const cache = new MemoryCache();
    const value = await cache.get("missing", () => {
      throw new Error("boom");
    });
    assert.equal(value, undefined);
  });

  // Introspection methods
  it("keys returns all non-expired cache keys", async () => {
    const cache = new MemoryCache();
    await cache.put("key1", "value1");
    await cache.put("key2", "value2");
    await cache.put("key3", "value3");
    const keys = await cache.keys();
    assert.equal(keys.length, 3);
    assert.ok(keys.includes("key1"));
    assert.ok(keys.includes("key2"));
    assert.ok(keys.includes("key3"));
  });

  it("keys returns empty array when cache is empty", async () => {
    const cache = new MemoryCache();
    assert.deepEqual(await cache.keys(), []);
  });

  it("keys removes expired entries during enumeration", async () => {
    const cache = new MemoryCache();
    await cache.put("stale", "data", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    const keys = await cache.keys();
    assert.deepEqual(keys, []);
    assert.equal(await cache.has("stale"), false);
  });

  it("count returns number of cached items", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.count(), 0);
    await cache.put("a", 1);
    assert.equal(await cache.count(), 1);
    await cache.put("b", 2);
    await cache.put("c", 3);
    assert.equal(await cache.count(), 3);
    await cache.forget("b");
    assert.equal(await cache.count(), 2);
  });

  it("size returns approximate cache size in bytes", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.size(), 0);
    await cache.put("key", "value");
    const sizeAfterOne = await cache.size();
    assert.ok(sizeAfterOne > 0);
    await cache.put("key2", "value2");
    const sizeAfterTwo = await cache.size();
    assert.ok(sizeAfterTwo > sizeAfterOne);
  });

  it("size skips entries that cannot be serialized", async () => {
    const cache = new MemoryCache();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    await cache.put("cyclic", cyclic);
    await cache.put("normal", { value: 1 });

    const size = await cache.size(); // Should skip cyclic entry without throwing
    assert.ok(size > 0);
  });

  // Cleanup
  it("prune removes only expired entries", async () => {
    const cache = new MemoryCache();
    await cache.put("valid1", "data1", 3600);
    await cache.put("valid2", "data2");
    await cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    const removed = await cache.prune();
    assert.equal(removed, 1);
    assert.equal(await cache.count(), 2);
    assert.ok(await cache.has("valid1"));
    assert.ok(await cache.has("valid2"));
    assert.ok(!await cache.has("expired"));
  });

  it("prune returns zero when cache is empty", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.prune(), 0);
  });

  // TTL management
  it("ttl returns remaining time in seconds", async () => {
    const cache = new MemoryCache();
    await cache.put("session", "data", 10);
    const ttl = await cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! <= 10 && ttl! > 0);
  });

  it("ttl returns null for non-existent keys", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.ttl("missing"), null);
  });

  it("ttl returns null for keys without expiration", async () => {
    const cache = new MemoryCache();
    await cache.put("permanent", "data");
    assert.equal(await cache.ttl("permanent"), null);
  });

  it("ttl returns null and removes expired entries", async () => {
    const cache = new MemoryCache();
    await cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    assert.equal(await cache.ttl("expired"), null);
    assert.equal(await cache.has("expired"), false);
  });

  it("touch extends TTL of existing entry", async () => {
    const cache = new MemoryCache();
    await cache.put("session", "data", 10);
    const updated = await cache.touch("session", 3600);
    assert.equal(updated, true);
    const ttl = await cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! > 10);
  });

  it("touch returns false for non-existent keys", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.touch("missing", 60), false);
  });

  it("touch returns false for expired entries", async () => {
    const cache = new MemoryCache();
    await cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    assert.equal(await cache.touch("expired", 60), false);
    assert.equal(await cache.has("expired"), false);
  });

  it("touch can remove TTL by passing Infinity", async () => {
    const cache = new MemoryCache();
    await cache.put("session", "data", 60);
    await cache.touch("session", Number.POSITIVE_INFINITY);
    assert.equal(await cache.ttl("session"), null);
    assert.ok(await cache.has("session"));
  });

  // Atomic counters
  it("increment creates and increments numeric values", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.increment("counter"), 1);
    assert.equal(await cache.increment("counter"), 2);
    assert.equal(await cache.increment("counter"), 3);
    assert.equal(await cache.increment("counter", 10), 13);
  });

  it("increment treats non-numeric values as zero", async () => {
    const cache = new MemoryCache<string | number>();
    await cache.put("text", "hello");
    assert.equal(await cache.increment("text"), 1);
    assert.equal(await cache.increment("text"), 2);
  });

  it("increment preserves TTL of existing entries", async () => {
    const cache = new MemoryCache();
    await cache.put("counter", 5, 3600);
    await cache.increment("counter");
    const ttl = await cache.ttl("counter");
    assert.ok(ttl !== null && ttl! > 0);
  });

  it("decrement decreases numeric values", async () => {
    const cache = new MemoryCache();
    await cache.put("credits", 100);
    assert.equal(await cache.decrement("credits"), 99);
    assert.equal(await cache.decrement("credits", 10), 89);
    assert.equal(await cache.decrement("credits", 5), 84);
  });

  it("decrement creates negative values when key missing", async () => {
    const cache = new MemoryCache();
    assert.equal(await cache.decrement("missing"), -1);
    assert.equal(await cache.decrement("missing"), -2);
  });

  it("increment and decrement work together", async () => {
    const cache = new MemoryCache();
    await cache.put("balance", 50);
    await cache.increment("balance", 20);
    await cache.decrement("balance", 10);
    await cache.increment("balance", 5);
    assert.equal(await cache.get("balance"), 65);
  });

  // Type safety with generics
  it("supports typed values", async () => {
    interface User {
      id: number;
      name: string;
    }
    const cache = new MemoryCache<User>();
    await cache.put("user:1", { id: 1, name: "Alice" });
    const user = await cache.get("user:1");
    assert.deepEqual(user, { id: 1, name: "Alice" });
  });

  it("handles complex objects", async () => {
    const cache = new MemoryCache<Record<string, unknown>>();
    const data = {
      nested: { deep: { value: 42 } },
      array: [1, 2, 3],
      date: new Date().toISOString(),
    };
    await cache.put("complex", data);
    assert.deepEqual(await cache.get("complex"), data);
  });

  it("get deletes expired entries automatically", async () => {
    const cache = new MemoryCache();
    await cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    const value = await cache.get("expired", "default");
    assert.equal(value, "default");
    assert.equal(await cache.has("expired"), false);
  });

  it("has deletes expired entries automatically", async () => {
    const cache = new MemoryCache();
    await cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    assert.equal(await cache.has("expired"), false);
  });

  // Batch operations
  it("getMany retrieves multiple values", async () => {
    const cache = new MemoryCache();
    await cache.put("key1", "value1");
    await cache.put("key2", "value2");
    await cache.put("key3", "value3");

    const result = await cache.getMany(["key1", "key2", "key3"]);
    assert.deepEqual(result, {
      key1: "value1",
      key2: "value2",
      key3: "value3",
    });
  });

  it("getMany returns undefined for missing keys", async () => {
    const cache = new MemoryCache();
    await cache.put("key1", "value1");

    const result = await cache.getMany(["key1", "missing", "key3"]);
    assert.deepEqual(result, {
      key1: "value1",
      missing: undefined,
      key3: undefined,
    });
  });

  it("getMany handles expired entries", async () => {
    const cache = new MemoryCache();
    await cache.put("valid", "data", 3600);
    await cache.put("expired", "old", 0.001);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(10);
    const result = await cache.getMany(["valid", "expired"]);
    assert.deepEqual(result, {
      valid: "data",
      expired: undefined,
    });
  });

  it("getMany returns empty object for empty key array", async () => {
    const cache = new MemoryCache();
    const result = await cache.getMany([]);
    assert.deepEqual(result, {});
  });

  it("putMany stores multiple key-value pairs", async () => {
    const cache = new MemoryCache();
    await cache.putMany({
      key1: "value1",
      key2: "value2",
      key3: "value3",
    });

    assert.equal(await cache.get("key1"), "value1");
    assert.equal(await cache.get("key2"), "value2");
    assert.equal(await cache.get("key3"), "value3");
    assert.equal(await cache.count(), 3);
  });

  it("putMany stores with TTL", async () => {
    const cache = new MemoryCache();
    await cache.putMany({
      session1: "data1",
      session2: "data2",
    }, 10);

    const ttl1 = await cache.ttl("session1");
    const ttl2 = await cache.ttl("session2");
    assert.ok(ttl1 !== null && ttl1 <= 10);
    assert.ok(ttl2 !== null && ttl2 <= 10);
  });

  it("putMany stores without TTL when omitted", async () => {
    const cache = new MemoryCache();
    await cache.putMany({
      perm1: "value1",
      perm2: "value2",
    });

    assert.equal(await cache.ttl("perm1"), null);
    assert.equal(await cache.ttl("perm2"), null);
  });

  it("putMany overwrites existing values", async () => {
    const cache = new MemoryCache();
    await cache.put("existing", "old");
    await cache.putMany({ existing: "new", other: "value" });

    assert.equal(await cache.get("existing"), "new");
    assert.equal(await cache.get("other"), "value");
  });

  it("putMany handles empty object", async () => {
    const cache = new MemoryCache();
    await cache.putMany({});
    assert.equal(await cache.count(), 0);
  });

  it("forgetMany removes multiple items", async () => {
    const cache = new MemoryCache();
    await cache.put("key1", "value1");
    await cache.put("key2", "value2");
    await cache.put("key3", "value3");

    const removed = await cache.forgetMany(["key1", "key3"]);
    assert.equal(removed, 2);
    assert.equal(await cache.has("key1"), false);
    assert.equal(await cache.has("key2"), true);
    assert.equal(await cache.has("key3"), false);
  });

  it("forgetMany returns correct count for mixed existing and missing keys", async () => {
    const cache = new MemoryCache();
    await cache.put("key1", "value1");
    await cache.put("key2", "value2");

    const removed = await cache.forgetMany(["key1", "missing", "key2"]);
    assert.equal(removed, 2);
    assert.equal(await cache.count(), 0);
  });

  it("forgetMany returns zero for all missing keys", async () => {
    const cache = new MemoryCache();
    const removed = await cache.forgetMany(["missing1", "missing2"]);
    assert.equal(removed, 0);
  });

  it("forgetMany handles empty array", async () => {
    const cache = new MemoryCache();
    await cache.put("key", "value");
    const removed = await cache.forgetMany([]);
    assert.equal(removed, 0);
    assert.equal(await cache.count(), 1);
  });

  it("batch operations work together", async () => {
    const cache = new MemoryCache();

    // Store batch
    await cache.putMany({
      user1: "Alice",
      user2: "Bob",
      user3: "Charlie",
    }, 60);

    // Retrieve batch
    const users = await cache.getMany(["user1", "user2", "user3"]);
    assert.deepEqual(users, {
      user1: "Alice",
      user2: "Bob",
      user3: "Charlie",
    });

    // Remove some
    const removed = await cache.forgetMany(["user1", "user3"]);
    assert.equal(removed, 2);

    // Verify remaining
    const remaining = await cache.getMany(["user1", "user2", "user3"]);
    assert.deepEqual(remaining, {
      user1: undefined,
      user2: "Bob",
      user3: undefined,
    });
  });
});
