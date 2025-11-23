import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { FlatFileCache } from "../../index.js";

type RawPayload = Record<string, { value?: unknown; expiresAt?: number; key?: string } | null>;

const setupCache = () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "flat-file-cache-test-"));
  const filePath = path.join(dir, "cache.json");
  const cache = new FlatFileCache({ filePath });
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { cache, dir, filePath, cleanup };
};

const writePayload = (filePath: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
};

const readPayload = (filePath: string): RawPayload =>
  JSON.parse(fs.readFileSync(filePath, "utf8")) as RawPayload;

describe("FlatFileCache", () => {
  it("uses default file path when none provided", () => {
    const defaultPath = path.join(tmpdir(), "newton-cache.json");
    fs.rmSync(defaultPath, { force: true });

    const cache = new FlatFileCache();
    cache.put("default", "value");

    assert.ok(fs.existsSync(defaultPath));
    cache.flush();
    fs.rmSync(defaultPath, { force: true });
  });

  it("returns default undefined when key is missing", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.get("missing"), undefined);
    cleanup();
  });

  it("returns provided default value when key is missing", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.get("missing", "default"), "default");
    cleanup();
  });

  it("invokes default factory when key is missing", () => {
    const { cache, cleanup } = setupCache();
    const value = cache.get("missing", () => "from-factory");
    assert.equal(value, "from-factory");
    cleanup();
  });

  it("has returns true when entry exists with value", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { exists: { value: 1, key: "exists" } });

    assert.equal(cache.has("exists"), true);
    cleanup();
  });

  it("has returns false when entry missing or value undefined", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { nullish: null, empty: { expiresAt: Date.now() + 1000 } });

    assert.equal(cache.has("missing"), false);
    assert.equal(cache.has("empty"), false);
    cleanup();
  });

  it("get returns default on invalid JSON", () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, "{", "utf8");

    assert.equal(cache.get("key", "default"), "default");
    cleanup();
  });

  it("get returns default when payload is null", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, null);

    assert.equal(cache.get("key", "default"), "default");
    cleanup();
  });

  it("get returns undefined when stored value is null", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { key: { value: null } });

    assert.equal(cache.get("key"), undefined);
    cleanup();
  });

  it("get deletes expired entries and returns default", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { expired: { value: "old", expiresAt: Date.now() - 100 } });

    const value = cache.get("expired", "default");
    assert.equal(value, "default");
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("stores and retrieves values", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("answer", 42);

    assert.equal(cache.get("answer"), 42);
    const payload = readPayload(filePath);
    assert.equal(payload.answer?.value, 42);
    cleanup();
  });

  it("remembers value when missing and caches it", () => {
    const { cache, filePath, cleanup } = setupCache();
    const value = cache.remember("remember", 60, () => ({ payload: 123 }));

    assert.deepEqual(value, { payload: 123 });
    const payload = readPayload(filePath);
    assert.deepEqual(payload.remember?.value, { payload: 123 });
    cleanup();
  });

  it("remembers returns existing non-expired value", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      existing: { value: "kept", expiresAt: Date.now() + 10000, key: "existing" },
    });

    const value = cache.remember("existing", 60, () => "new");
    assert.equal(value, "kept");
    cleanup();
  });

  it("remember overwrites expired entry", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: "old", expiresAt: Date.now() - 100, key: "expired" },
    });

    const value = cache.remember("expired", 60, () => "fresh");
    const payload = readPayload(filePath);
    assert.equal(value, "fresh");
    assert.equal(payload.expired?.value, "fresh");
    cleanup();
  });

  it("remember with non-finite TTL stores without expiresAt", () => {
    const { cache, filePath, cleanup } = setupCache();
    const value = cache.remember("no-ttl", Number.POSITIVE_INFINITY, () => "forever");

    const payload = readPayload(filePath);
    assert.equal(value, "forever");
    assert.equal(Object.prototype.hasOwnProperty.call(payload["no-ttl"] ?? {}, "expiresAt"), false);
    cleanup();
  });

  it("rememberForever stores without expiry", () => {
    const { cache, filePath, cleanup } = setupCache();
    const value = cache.rememberForever("forever", () => "persistent");

    const payload = readPayload(filePath);
    assert.equal(value, "persistent");
    assert.equal(Object.prototype.hasOwnProperty.call(payload.forever ?? {}, "expiresAt"), false);
    cleanup();
  });

  it("put stores with TTL", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("ttl", "value", 1);

    const payload = readPayload(filePath);
    assert.equal(payload.ttl?.value, "value");
    assert.ok(typeof payload.ttl?.expiresAt === "number");
    cleanup();
  });

  it("put stores forever when TTL omitted", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("forever-put", "value");

    const payload = readPayload(filePath);
    assert.equal(payload["forever-put"]?.value, "value");
    assert.equal(Object.prototype.hasOwnProperty.call(payload["forever-put"] ?? {}, "expiresAt"), false);
    cleanup();
  });

  it("forever stores without expiry", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.forever("forever-method", "value");

    const payload = readPayload(filePath);
    assert.equal(payload["forever-method"]?.value, "value");
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload["forever-method"] ?? {}, "expiresAt"),
      false,
    );
    cleanup();
  });

  it("forget removes an item and returns true when it existed", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("forget-me", 1);

    assert.equal(cache.forget("forget-me"), true);
    assert.equal(cache.forget("forget-me"), false);
    assert.equal(fs.existsSync(filePath), true);
    cleanup();
  });

  it("flush clears all entries", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("a", 1);
    cache.put("b", 2);

    cache.flush();

    assert.equal(fs.existsSync(filePath), false);
    assert.equal(cache.count(), 0);
    cleanup();
  });

  it("add stores only when missing", () => {
    const { cache, filePath, cleanup } = setupCache();
    const first = cache.add("add-key", "one", 10);
    const second = cache.add("add-key", "two", 10);

    assert.equal(first, true);
    assert.equal(second, false);

    const payload = readPayload(filePath);
    assert.equal(payload["add-key"]?.value, "one");
    cleanup();
  });

  it("add respects existing non-expired value", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      existing: { value: "kept", expiresAt: Date.now() + 1000, key: "existing" },
    });

    const stored = cache.add("existing", "new", 10);
    const payload = readPayload(filePath);
    assert.equal(stored, false);
    assert.equal(payload.existing?.value, "kept");
    cleanup();
  });

  it("add writes over invalid JSON", () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, "{", "utf8");

    assert.equal(cache.add("new", "value", 10), true);
    const payload = readPayload(filePath);
    assert.equal(payload.new?.value, "value");
    cleanup();
  });

  it("pull returns value and deletes the entry", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("pull-me", 99);

    const value = cache.pull("pull-me");
    assert.equal(value, 99);
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "pull-me"), false);
    cleanup();
  });

  it("pull returns default when missing or expired", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: 1, expiresAt: Date.now() - 1000, key: "expired" },
    });

    assert.equal(cache.pull("missing", "default"), "default");
    assert.equal(cache.pull("expired", () => "from-factory"), "from-factory");
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("pull deletes invalid JSON and returns default", () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, "{", "utf8");

    assert.equal(cache.pull("key", "default"), "default");
    cleanup();
  });

  it("keys returns all non-expired cache keys", () => {
    const { cache, cleanup } = setupCache();
    cache.put("key1", "value1");
    cache.put("key2", "value2");
    cache.put("key3", "value3");

    const keys = cache.keys();
    assert.equal(keys.length, 3);
    assert.ok(keys.includes("key1"));
    assert.ok(keys.includes("key2"));
    assert.ok(keys.includes("key3"));
    cleanup();
  });

  it("keys filters out expired entries", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("valid", "data", 3600);
    writePayload(filePath, {
      valid: { value: "data", expiresAt: Date.now() + 3600 * 1000, key: "valid" },
      expired: { value: "old", expiresAt: Date.now() - 1000, key: "expired" },
    });

    const freshCache = new FlatFileCache({ filePath });
    const keys = freshCache.keys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0], "valid");
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("count returns number of cached items", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.count(), 0);

    cache.put("a", 1);
    cache.put("b", 2);
    assert.equal(cache.count(), 2);
    cleanup();
  });

  it("size returns total cache file size in bytes", () => {
    const { cache, filePath, cleanup } = setupCache();
    assert.equal(cache.size(), 0);

    cache.put("key", "value");
    const sizeAfter = cache.size();
    assert.ok(sizeAfter > 0);

    cache.flush();
    assert.equal(cache.size(), 0);
    assert.equal(fs.existsSync(filePath), false);
    cleanup();
  });

  it("prune removes only expired entries", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("valid1", "data1", 3600);
    cache.put("valid2", "data2");

    writePayload(filePath, {
      ...readPayload(filePath),
      expired1: { value: "old1", expiresAt: Date.now() - 1000, key: "expired1" },
      expired2: { value: "old2", expiresAt: Date.now() - 500, key: "expired2" },
    });

    const freshCache = new FlatFileCache({ filePath });
    const removed = freshCache.prune();
    assert.equal(removed, 2);
    const payload = readPayload(filePath);
    assert.ok(payload.valid1);
    assert.ok(payload.valid2);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired1"), false);
    cleanup();
  });

  it("prune removes invalid entries", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("valid", "data");

    writePayload(filePath, {
      ...readPayload(filePath),
      invalid: null,
      missingValue: { expiresAt: Date.now() + 1000, key: "missingValue" },
    });

    const freshCache = new FlatFileCache({ filePath });
    const removed = freshCache.prune();
    assert.equal(removed, 2);
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "invalid"), false);
    cleanup();
  });

  it("ttl returns remaining time in seconds", () => {
    const { cache, cleanup } = setupCache();
    cache.put("session", "data", 10);

    const ttl = cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! <= 10 && ttl! > 0);
    cleanup();
  });

  it("ttl returns null for non-existent keys or without expiration", () => {
    const { cache, cleanup } = setupCache();
    cache.put("permanent", "data");

    assert.equal(cache.ttl("missing"), null);
    assert.equal(cache.ttl("permanent"), null);
    cleanup();
  });

  it("ttl returns null and removes expired entries", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: "old", expiresAt: Date.now() - 1000, key: "expired" },
    });

    assert.equal(cache.ttl("expired"), null);
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("touch extends TTL of existing entry", () => {
    const { cache, cleanup } = setupCache();
    cache.put("session", "data", 10);

    const updated = cache.touch("session", 3600);
    assert.equal(updated, true);

    const ttl = cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! > 10);
    cleanup();
  });

  it("touch returns false for non-existent or expired keys", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: "old", expiresAt: Date.now() - 1000, key: "expired" },
    });

    assert.equal(cache.touch("missing", 60), false);
    assert.equal(cache.touch("expired", 60), false);
    cleanup();
  });

  it("touch can remove TTL by passing Infinity", () => {
    const { cache, cleanup } = setupCache();
    cache.put("session", "data", 60);
    cache.touch("session", Number.POSITIVE_INFINITY);

    assert.equal(cache.ttl("session"), null);
    assert.ok(cache.has("session"));
    cleanup();
  });

  it("increment and decrement update numeric values", () => {
    const { cache, cleanup } = setupCache();

    assert.equal(cache.increment("counter"), 1);
    assert.equal(cache.increment("counter"), 2);
    assert.equal(cache.decrement("counter"), 1);
    cleanup();
  });

  it("increment treats non-numeric values as zero and preserves TTL", () => {
    const { cache, cleanup } = setupCache();
    cache.put("text", "hello", 3600);

    assert.equal(cache.increment("text"), 1);
    const ttl = cache.ttl("text");
    assert.ok(ttl !== null && ttl! > 0);
    cleanup();
  });

  it("increment handles invalid JSON gracefully", () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, "{", "utf8");

    assert.equal(cache.increment("bad-counter"), 1);
    assert.equal(cache.get("bad-counter"), 1);
    cleanup();
  });

  it("decrement creates negative values when key missing", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.decrement("missing"), -1);
    assert.equal(cache.decrement("missing"), -2);
    cleanup();
  });

  it("batch operations work together", () => {
    const { cache, cleanup } = setupCache();

    cache.putMany(
      {
        user1: "Alice",
        user2: "Bob",
        user3: "Charlie",
      },
      60,
    );

    const users = cache.getMany(["user1", "user2", "user3"]);
    assert.deepEqual(users, {
      user1: "Alice",
      user2: "Bob",
      user3: "Charlie",
    });

    const removed = cache.forgetMany(["user1", "user3"]);
    assert.equal(removed, 2);

    const remaining = cache.getMany(["user1", "user2", "user3"]);
    assert.deepEqual(remaining, {
      user1: undefined,
      user2: "Bob",
      user3: undefined,
    });
    cleanup();
  });

  it("persists data across instances", () => {
    const { filePath, cleanup } = setupCache();
    const cache1 = new FlatFileCache({ filePath });
    cache1.put("persisted", { ok: true }, 120);

    const cache2 = new FlatFileCache({ filePath });
    assert.deepEqual(cache2.get("persisted"), { ok: true });
    cleanup();
  });

  it("recovers from corrupted file by treating as empty", () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, "{", "utf8");

    cache.put("valid", "data");
    assert.equal(cache.get("valid"), "data");
    cleanup();
  });

  it("get with expired entry deletes and saves to disk", async () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("key", "value", 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(cache.get("key", "default"), "default");
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "key"), false);
    cleanup();
  });

  it("has with expired entry deletes and saves to disk", async () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("expired", "old", 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(cache.has("expired"), false);
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("flush removes file when it doesn't exist", () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.flush();
    assert.equal(fs.existsSync(filePath), false);
    cache.flush(); // Call again when file doesn't exist
    assert.equal(fs.existsSync(filePath), false);
    cleanup();
  });

  it("keys with expired entries saves to disk after filtering", async () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("valid", "data");
    cache.put("expired", "old", 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    const keys = cache.keys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0], "valid");
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("ttl with expired entry deletes and saves to disk", async () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("expired", "old", 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(cache.ttl("expired"), null);
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("touch with expired entry deletes and saves to disk", async () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("expired", "old", 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(cache.touch("expired", 60), false);
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("pull with expired entry saves and returns default", async () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("expired", "old", 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(cache.pull("expired", "default"), "default");
    const payload = readPayload(filePath);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("prune removes expired entries and saves to disk", async () => {
    const { cache, filePath, cleanup } = setupCache();
    cache.put("valid", "data");
    cache.put("expired", "old", 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    const removed = cache.prune();
    assert.ok(removed > 0);
    const payload = readPayload(filePath);
    assert.ok(payload.valid);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expired"), false);
    cleanup();
  });

  it("saveToDisk handles write errors gracefully", () => {
    const { cleanup } = setupCache();
    const invalidPath = "/invalid/path/that/does/not/exist/cache.json";
    const cache = new FlatFileCache({ filePath: invalidPath });

    // This should not throw even though the path is invalid
    cache.put("key", "value");
    assert.equal(cache.get("key"), "value"); // Value is in memory
    cleanup();
  });

  it("loadFromDisk handles empty file content", () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, "   \n  ", "utf8"); // Whitespace only

    const freshCache = new FlatFileCache({ filePath });
    assert.equal(freshCache.count(), 0);
    cleanup();
  });

  it("pull returns undefined when stored value is null", () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { key: { value: null, key: "key" } });

    const freshCache = new FlatFileCache({ filePath });
    assert.equal(freshCache.pull("key"), undefined);
    cleanup();
  });

  it("touch preserves key when entry.key is null via store manipulation", () => {
    const { cache, filePath, cleanup } = setupCache();
    // Directly manipulate the private store to create entry with null key
    // This tests the defensive ?? fallback in touch() at line 198
    (cache as any).loaded = true;
    (cache as any).store.set("testkey", { value: "data", key: null });

    assert.equal(cache.touch("testkey", 60), true);
    const payload = readPayload(filePath);
    assert.equal(payload.testkey?.key, "testkey");
    cleanup();
  });
});
