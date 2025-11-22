import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryCache } from "../index.js";

describe("MemoryCache", () => {
  it("stores and retrieves values", () => {
    const cache = new MemoryCache<string, number>();
    cache.set("a", 1);
    assert.equal(cache.get("a"), 1);
    assert.ok(cache.has("a"));
  });

  it("expires entries based on TTL", async () => {
    const cache = new MemoryCache<string, number>({ ttl: 5 });
    cache.set("a", 1);
    assert.equal(cache.get("a"), 1);

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.has("a"), false);
  });

  it("allows per-entry TTL override", async () => {
    const cache = new MemoryCache<string, number>({ ttl: 50 });
    cache.set("short", 1, 5);
    cache.set("long", 2);

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(cache.get("short"), undefined);
    assert.equal(cache.get("long"), 2);
  });

  it("clears and deletes values", () => {
    const cache = new MemoryCache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.size(), 2);

    cache.delete("a");
    assert.equal(cache.size(), 1);

    cache.clear();
    assert.equal(cache.size(), 0);
  });
});
