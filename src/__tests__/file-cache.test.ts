import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { FileCache } from "../index.js";

const setupCache = () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "node-cache-test-"));
  const cache = new FileCache({ cachePath: dir });
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { cache, dir, cleanup };
};

describe("FileCache", () => {
  it("returns default null when key is missing", () => {
    const { cache, cleanup } = setupCache();
    assert.equal(cache.get("missing"), null);
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

  it("has returns false when file missing or value is null", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "nullish";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, "null", "utf8");

    assert.equal(cache.has("missing"), false);
    assert.equal(cache.has(key), false);
    cleanup();
  });

  it("stores and retrieves values on disk", () => {
    const { cache, cleanup, dir } = setupCache();
    const key = "answer";
    const filename = path.join(dir, encodeURIComponent(key));
    fs.writeFileSync(filename, JSON.stringify({ value: 42 }), "utf8");

    assert.deepEqual(cache.get("answer"), { value: 42 });

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
});
