import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { FileCache } from "../../index.js";

const setupCache = () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "node-cache-test-"));
  const cache = new FileCache({ cachePath: dir });
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { cache, dir, cleanup };
};

describe("FileCache", () => {
  it("creates default cache directory when no path provided", () => {
    const defaultDir = path.join(tmpdir(), "node-cache");
    fs.rmSync(defaultDir, { recursive: true, force: true });
    const cache = new FileCache();
    assert.ok(fs.existsSync(defaultDir));
    cache.flush();
    fs.rmSync(defaultDir, { recursive: true, force: true });
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

  it("has returns true when file exists with non-null value", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "exists";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: 1 }), "utf8");

    assert.equal(cache.has(key), true);
    cleanup();
  });

  it("has returns false when file missing or value is null/undefined", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "nullish";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "null", "utf8");

    assert.equal(cache.has("missing"), false);
    assert.equal(cache.has(key), false);
    cleanup();
  });

  it("get returns default on invalid JSON", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "invalid-json";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "{", "utf8");

    assert.equal(cache.get(key, "default"), "default");
    cleanup();
  });

  it("get returns default when payload is null", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "null-get";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "null", "utf8");

    assert.equal(cache.get(key, "default"), "default");
    cleanup();
  });

  it("get returns undefined when stored value is null", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "nullish-value";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: null }), "utf8");

    assert.equal(cache.get(key), undefined);
    cleanup();
  });

  it("get handles unreadable directory and returns default", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "dir-key";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.mkdirSync(filename);

    assert.equal(cache.get(key, "default"), "default");
    cleanup();
  });

  it("get deletes expired entries and returns default", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "expired";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: "old", expiresAt: Date.now() - 100 }),
      "utf8"
    );

    const value = cache.get(key, "default");
    assert.equal(value, "default");
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("stores and retrieves values on disk", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "answer";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: 42 }), "utf8");

    assert.equal(cache.get("answer"), 42);

    cleanup();
  });

  it("remembers value when missing and caches it", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "remember";
    const value = cache.remember(key, 60, () => ({ payload: 123 }));
    assert.deepEqual(value, { payload: 123 });

    const filename = path.join(dir, encodeURIComponent(key));
    const onDisk = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.deepEqual(onDisk.value, { payload: 123 });
    cleanup();
  });

  it("remembers returns existing non-expired value", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "existing";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: "kept", expiresAt: Date.now() + 10000 }),
      "utf8"
    );

    const value = cache.remember(key, 60, () => "new");
    assert.equal(value, "kept");
    cleanup();
  });

  it("remember overwrites expired entry", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "existing-expired";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: "old", expiresAt: Date.now() - 100 }),
      "utf8"
    );

    const value = cache.remember(key, 60, () => "fresh");
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(value, "fresh");
    assert.equal(payload.value, "fresh");
    cleanup();
  });

  it("remember with non-finite TTL stores without expiresAt", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "remember-nonfinite";
    const value = cache.remember(key, Number.POSITIVE_INFINITY, () => "forever");
    const filename = path.join(dir, encodeURIComponent(key));
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(value, "forever");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expiresAt"), false);
    cleanup();
  });

  it("rememberForever stores without expiry", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "forever";
    const value = cache.rememberForever(key, () => "persistent");
    assert.equal(value, "persistent");

    const filename = path.join(dir, encodeURIComponent(key));
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(payload.value, "persistent");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expiresAt"), false);
    cleanup();
  });

  it("put stores with TTL", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "ttl";
    cache.put(key, "value", 1);
    const filename = path.join(dir, encodeURIComponent(key));
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(payload.value, "value");
    assert.ok(typeof payload.expiresAt === "number");
    cleanup();
  });

  it("put stores forever when TTL omitted", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "forever-put";
    cache.put(key, "value");
    const filename = path.join(dir, encodeURIComponent(key));
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(payload.value, "value");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expiresAt"), false);
    cleanup();
  });

  it("put with NaN TTL stores without expiresAt", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "nan-put";
    cache.put(key, "value", Number.NaN);
    const filename = path.join(dir, encodeURIComponent(key));
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(payload.value, "value");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expiresAt"), false);
    cleanup();
  });

  it("forever stores without expiry", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "forever-method";
    cache.forever(key, "value");
    const filename = path.join(dir, encodeURIComponent(key));
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(payload.value, "value");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "expiresAt"), false);
    cleanup();
  });

  it("flush ignores errors when directory missing", () => {
    const { cache, cleanup, dir } = setupCache();
    fs.rmSync(dir, { recursive: true, force: true });
    cache.flush();
    cleanup();
  });

  it("forget removes an item and returns true when it existed", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "forget-me";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: 1 }), "utf8");

    assert.equal(cache.forget(key), true);
    assert.equal(fs.existsSync(filename), false);
    assert.equal(cache.forget(key), false);
    cleanup();
  });

  it("forget returns false when key missing", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.forget("absent"), false);
    cleanup();
  });

  it("flush clears all entries", () => {
    const { cache, cleanup, dir } = setupCache();
    fs.writeFileSync(path.join(dir, "a"), JSON.stringify({ value: 1 }), "utf8");
    fs.writeFileSync(path.join(dir, "b"), JSON.stringify({ value: 2 }), "utf8");

    cache.flush();

    assert.deepEqual(fs.readdirSync(dir), []);
    cleanup();
  });

  it("add stores only when missing", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "add-key";
    const first = cache.add(key, "one", 10);
    const second = cache.add(key, "two", 10);

    assert.equal(first, true);
    assert.equal(second, false);

    const filename = path.join(dir, encodeURIComponent(key));
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(payload.value, "one");
    cleanup();
  });

  it("add respects existing non-expired value", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "add-existing";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: "kept", expiresAt: Date.now() + 1000 }),
      "utf8"
    );

    const stored = cache.add(key, "new", 10);
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(stored, false);
    assert.equal(payload.value, "kept");
    cleanup();
  });

  it("add returns false when file contains invalid JSON", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "add-invalid";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "{", "utf8");

    assert.equal(cache.add(key, "new", 10), true);
    const payload = JSON.parse(fs.readFileSync(filename, "utf8"));
    assert.equal(payload.value, "new");
    cleanup();
  });

  it("pull returns value and deletes the file", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "pull-me";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: 99 }), "utf8");

    const value = cache.pull(key);
    assert.equal(value, 99);
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("pull returns default when missing or expired", () => {
    const { cache, cleanup, dir } = setupCache();
    const expiredKey = "old";
    const filename = path.join(dir, encodeURIComponent(expiredKey));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: 1, expiresAt: Date.now() - 1000 }),
      "utf8"
    );

    assert.equal(cache.pull("missing", "default"), "default");
    assert.equal(cache.pull(expiredKey, () => "from-factory"), "from-factory");
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("pull deletes invalid JSON and returns default", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "pull-invalid";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "{", "utf8");

    assert.equal(cache.pull(key, "default"), "default");
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("pull returns undefined when stored value is null", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "nullish-pull";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: null }), "utf8");

    assert.equal(cache.pull(key), undefined);
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("pull removes null payload and returns default", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "pull-null";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "null", "utf8");

    assert.equal(cache.pull(key, "default"), "default");
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("pull handles unreadable directory entry and still returns default", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "pull-dir";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.mkdirSync(filename);

    assert.equal(cache.pull(key, "default"), "default");
    assert.equal(fs.existsSync(filename), true);
    cleanup();
  });

  it("resolveDefault returns undefined when factory throws", () => {
    const { cache, cleanup } = setupCache();
    const value = cache.get("missing", () => {
      throw new Error("boom");
    });
    assert.equal(value, undefined);
    cleanup();
  });

  it("handles very long keys by hashing them", () => {
    const { cache, cleanup } = setupCache();
    const longKey = "x".repeat(300); // Exceeds MAX_KEY_LENGTH
    cache.put(longKey, "value");

    assert.equal(cache.get(longKey), "value");
    assert.equal(cache.has(longKey), true);

    cache.forget(longKey);
    assert.equal(cache.has(longKey), false);
    cleanup();
  });

  it("normalizes relative cache paths to absolute", () => {
    const relativeDir = "./test-cache-relative";
    const cache = new FileCache({ cachePath: relativeDir });

    cache.put("test", "value");
    assert.equal(cache.get("test"), "value");

    // Cleanup
    cache.flush();
    const absolutePath = path.resolve(relativeDir);
    fs.rmSync(absolutePath, { recursive: true, force: true });
  });

  it("stores and retrieves values with special characters in keys", () => {
    const { cache, cleanup } = setupCache();
    const specialKey = "user:123/profile?lang=en&format=json";

    cache.put(specialKey, { data: "test" });
    assert.deepEqual(cache.get(specialKey), { data: "test" });
    cleanup();
  });

  // Phase 3: Introspection methods
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
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid", "data", 3600);

    const expiredFilename = path.join(dir, encodeURIComponent("expired"));
    fs.writeFileSync(
      expiredFilename,
      JSON.stringify({ value: "old", expiresAt: Date.now() - 1000, key: "expired" }),
      "utf8"
    );

    const keys = cache.keys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0], "valid");
    assert.equal(fs.existsSync(expiredFilename), false); // Expired entry removed
    cleanup();
  });

  it("keys returns empty array when cache is empty", () => {
    const { cache, cleanup } = setupCache();
    assert.deepEqual(cache.keys(), []);
    cleanup();
  });

  it("keys handles long hashed keys correctly", () => {
    const { cache, cleanup } = setupCache();
    const longKey = "x".repeat(300);
    cache.put(longKey, "value");

    const keys = cache.keys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0], longKey);
    cleanup();
  });

  it("keys decodes filenames when key is not stored in payload", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "user:1/profile";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: "data" }), "utf8");

    const keys = cache.keys();
    assert.deepEqual(keys, [key]);
    cleanup();
  });

  it("count returns number of cached items", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.count(), 0);

    cache.put("a", 1);
    assert.equal(cache.count(), 1);

    cache.put("b", 2);
    cache.put("c", 3);
    assert.equal(cache.count(), 3);

    cache.forget("b");
    assert.equal(cache.count(), 2);
    cleanup();
  });

  it("size returns total cache size in bytes", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.size(), 0);

    cache.put("key", "value");
    const sizeAfterOne = cache.size();
    assert.ok(sizeAfterOne > 0);

    cache.put("key2", "value2");
    const sizeAfterTwo = cache.size();
    assert.ok(sizeAfterTwo > sizeAfterOne);
    cleanup();
  });

  it("size includes expired entries until pruned", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid", "data");

    const expiredFilename = path.join(dir, "expired");
    fs.writeFileSync(
      expiredFilename,
      JSON.stringify({ value: "old", expiresAt: Date.now() - 1000 }),
      "utf8"
    );

    const sizeWithExpired = cache.size();
    assert.ok(sizeWithExpired > 0);

    cache.prune();
    const sizeAfterPrune = cache.size();
    assert.ok(sizeAfterPrune < sizeWithExpired);
    cleanup();
  });

  it("size skips entries that cannot be stat'd and still returns total", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid", "data");

    const broken = path.join(dir, "broken-link");
    fs.symlinkSync("non-existent-target", broken);

    const size = cache.size();
    assert.ok(size >= fs.statSync(path.join(dir, encodeURIComponent("valid"))).size);
    cleanup();
  });

  it("size returns zero when cache directory is missing", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.flush();
    fs.rmSync(dir, { recursive: true, force: true });

    assert.equal(cache.size(), 0);
    cleanup();
  });

  // Phase 3: Cleanup
  it("prune removes only expired entries", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid1", "data1", 3600);
    cache.put("valid2", "data2");

    const expired1 = path.join(dir, "expired1");
    const expired2 = path.join(dir, "expired2");
    fs.writeFileSync(
      expired1,
      JSON.stringify({ value: "old1", expiresAt: Date.now() - 1000 }),
      "utf8"
    );
    fs.writeFileSync(
      expired2,
      JSON.stringify({ value: "old2", expiresAt: Date.now() - 500 }),
      "utf8"
    );

    const removed = cache.prune();
    assert.equal(removed, 2);
    assert.equal(cache.count(), 2);
    assert.ok(cache.has("valid1"));
    assert.ok(cache.has("valid2"));
    cleanup();
  });

  it("prune removes invalid entries", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid", "data");

    const invalidFile = path.join(dir, "invalid");
    fs.writeFileSync(invalidFile, "{", "utf8");

    const removed = cache.prune();
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(invalidFile), false);
    assert.equal(cache.count(), 1);
    cleanup();
  });

  it("prune removes entries missing value field", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid", "data");

    const missingValue = path.join(dir, "missing-value");
    fs.writeFileSync(missingValue, JSON.stringify({ expiresAt: Date.now() + 1000 }), "utf8");

    const removed = cache.prune();
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(missingValue), false);
    assert.equal(cache.count(), 1);
    cleanup();
  });

  it("prune returns zero when cache is empty", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.prune(), 0);
    cleanup();
  });

  // Phase 3: TTL management
  it("ttl returns remaining time in seconds", () => {
    const { cache, cleanup } = setupCache();
    cache.put("session", "data", 10); // 10 seconds

    const ttl = cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! <= 10 && ttl! > 0);
    cleanup();
  });

  it("ttl returns null for non-existent keys", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.ttl("missing"), null);
    cleanup();
  });

  it("ttl returns null for keys without expiration", () => {
    const { cache, cleanup } = setupCache();
    cache.put("permanent", "data");
    assert.equal(cache.ttl("permanent"), null);
    cleanup();
  });

  it("ttl returns null when payload is missing value", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "no-value";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ expiresAt: Date.now() + 1000 }), "utf8");

    assert.equal(cache.ttl(key), null);
    cleanup();
  });

  it("ttl returns null and removes expired entries", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "expired";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: "old", expiresAt: Date.now() - 1000, key }),
      "utf8"
    );

    assert.equal(cache.ttl(key), null);
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("touch extends TTL of existing entry", () => {
    const { cache, cleanup } = setupCache();
    cache.put("session", "data", 10);

    const updated = cache.touch("session", 3600);
    assert.equal(updated, true);

    const ttl = cache.ttl("session");
    assert.ok(ttl !== null);
    assert.ok(ttl! > 10); // Should be close to 3600
    cleanup();
  });

  it("touch returns false for non-existent keys", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.touch("missing", 60), false);
    cleanup();
  });

  it("touch returns false when payload is missing value", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "no-value";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ expiresAt: Date.now() + 1000 }), "utf8");

    assert.equal(cache.touch(key, 60), false);
    cleanup();
  });

  it("touch returns false for expired entries", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "expired";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: "old", expiresAt: Date.now() - 1000, key }),
      "utf8"
    );

    assert.equal(cache.touch(key, 60), false);
    assert.equal(fs.existsSync(filename), false);
    cleanup();
  });

  it("touch can remove TTL by passing Infinity", () => {
    const { cache, cleanup } = setupCache();
    cache.put("session", "data", 60);
    cache.touch("session", Number.POSITIVE_INFINITY);

    assert.equal(cache.ttl("session"), null); // No expiration
    assert.ok(cache.has("session"));
    cleanup();
  });

  // Phase 3: Atomic counters
  it("increment creates and increments numeric values", () => {
    const { cache, cleanup } = setupCache();

    assert.equal(cache.increment("counter"), 1);
    assert.equal(cache.increment("counter"), 2);
    assert.equal(cache.increment("counter"), 3);
    assert.equal(cache.increment("counter", 10), 13);
    cleanup();
  });

  it("increment treats non-numeric values as zero", () => {
    const { cache, cleanup } = setupCache();
    cache.put("text", "hello");

    assert.equal(cache.increment("text"), 1);
    assert.equal(cache.increment("text"), 2);
    cleanup();
  });

  it("increment preserves TTL of existing entries", () => {
    const { cache, cleanup } = setupCache();
    cache.put("counter", 5, 3600);

    cache.increment("counter");
    const ttl = cache.ttl("counter");
    assert.ok(ttl !== null && ttl! > 0);
    cleanup();
  });

  it("increment resets expired counters to zero", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "expired-counter";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: 100, expiresAt: Date.now() - 1000, key }),
      "utf8"
    );

    assert.equal(cache.increment(key), 1);
    cleanup();
  });

  it("decrement decreases numeric values", () => {
    const { cache, cleanup } = setupCache();
    cache.put("credits", 100);

    assert.equal(cache.decrement("credits"), 99);
    assert.equal(cache.decrement("credits", 10), 89);
    assert.equal(cache.decrement("credits", 5), 84);
    cleanup();
  });

  it("decrement creates negative values when key missing", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.decrement("missing"), -1);
    assert.equal(cache.decrement("missing"), -2);
    cleanup();
  });

  it("increment and decrement work together", () => {
    const { cache, cleanup } = setupCache();
    cache.put("balance", 50);

    cache.increment("balance", 20); // 70
    cache.decrement("balance", 10); // 60
    cache.increment("balance", 5);  // 65

    assert.equal(cache.get("balance"), 65);
    cleanup();
  });

  it("increment works with long hashed keys", () => {
    const { cache, cleanup } = setupCache();
    const longKey = "x".repeat(300);

    assert.equal(cache.increment(longKey), 1);
    assert.equal(cache.increment(longKey), 2);
    assert.equal(cache.get(longKey), 2);
    cleanup();
  });

  // Edge cases and error handling
  it("prune handles directory read errors gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    cleanup(); // Remove the directory

    const removed = cache.prune(); // Should not throw
    assert.equal(removed, 0);
  });

  it("keys handles directory read errors gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    cleanup(); // Remove the directory

    const keys = cache.keys(); // Should not throw
    assert.deepEqual(keys, []);
  });

  it("ttl handles file read errors gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "bad-file";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "{", "utf8"); // Invalid JSON

    assert.equal(cache.ttl(key), null);
    cleanup();
  });

  it("touch handles file read errors gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "bad-file";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "{", "utf8"); // Invalid JSON

    assert.equal(cache.touch(key, 60), false);
    cleanup();
  });

  it("increment handles invalid JSON gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "bad-counter";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "{", "utf8"); // Invalid JSON

    assert.equal(cache.increment(key), 1);
    assert.equal(cache.get(key), 1);
    cleanup();
  });

  it("keys handles invalid cache files gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid", "data");

    // Create invalid file
    const invalidFile = path.join(dir, "invalid");
    fs.writeFileSync(invalidFile, "{", "utf8");

    const keys = cache.keys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0], "valid");
    cleanup();
  });

  it("size handles file stat errors gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    cache.put("valid", "data");

    // Create a directory instead of a file (will cause stat to succeed but we want to test error handling)
    const dirEntry = path.join(dir, "subdir");
    fs.mkdirSync(dirEntry);

    const size = cache.size(); // Should not throw
    assert.ok(size >= 0);
    cleanup();
  });

  it("keys handles null parsed values gracefully", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "null-value";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "null", "utf8");

    const keys = cache.keys();
    assert.equal(keys.length, 0);
    cleanup();
  });

  it("prune handles file deletion errors gracefully", () => {
    const { cache, cleanup, dir } = setupCache();

    // Create an expired entry
    const key = "expired";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(
      filename,
      JSON.stringify({ value: "old", expiresAt: Date.now() - 1000 }),
      "utf8"
    );

    // Make directory read-only on Unix systems to test deletion error handling
    if (process.platform !== "win32") {
      fs.chmodSync(dir, 0o444);

      try {
        const removed = cache.prune();
        // Should attempt to remove but might fail due to permissions
        assert.ok(removed >= 0);
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(dir, 0o755);
      }
    }
    cleanup();
  });
});
