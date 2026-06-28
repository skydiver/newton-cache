import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { FlatFileCache } from '../../index.js';

type RawPayload = Record<string, { value?: unknown; expiresAt?: number; key?: string } | null>;

/** Minimal view of FlatFileCache internals for white-box tests */
interface FlatFileInternals {
  loaded: boolean;
  store: Map<string, { value: unknown; key: string | null }>;
}

const setupCache = () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'flat-file-cache-test-'));
  const filePath = path.join(dir, 'cache.json');
  const cache = new FlatFileCache({ filePath });
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { cache, dir, filePath, cleanup };
};

const writePayload = (filePath: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
};

const readPayload = (filePath: string): RawPayload =>
  JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawPayload;

describe('FlatFileCache', () => {
  it('uses default file path when none provided', async () => {
    const defaultPath = path.join(tmpdir(), 'newton-cache.json');
    fs.rmSync(defaultPath, { force: true });

    const cache = new FlatFileCache();
    await cache.put('default', 'value');

    assert.ok(fs.existsSync(defaultPath));
    await cache.flush();
    fs.rmSync(defaultPath, { force: true });
  });

  it('returns default undefined when key is missing', async () => {
    const { cache, cleanup } = setupCache();
    assert.equal(await cache.get('missing'), undefined);
    cleanup();
  });

  it('returns provided default value when key is missing', async () => {
    const { cache, cleanup } = setupCache();
    assert.equal(await cache.get('missing', 'default'), 'default');
    cleanup();
  });

  it('invokes default factory when key is missing', async () => {
    const { cache, cleanup } = setupCache();
    const value = await cache.get('missing', () => 'from-factory');
    assert.equal(value, 'from-factory');
    cleanup();
  });

  it('has returns true when entry exists with value', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { exists: { value: 1, key: 'exists' } });

    assert.equal(await cache.has('exists'), true);
    cleanup();
  });

  it('has returns false when entry missing or value undefined', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { nullish: null, empty: { expiresAt: Date.now() + 1000 } });

    assert.equal(await cache.has('missing'), false);
    assert.equal(await cache.has('empty'), false);
    cleanup();
  });

  it('get returns default on invalid JSON', async () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, '{', 'utf8');

    assert.equal(await cache.get('key', 'default'), 'default');
    cleanup();
  });

  it('get returns default when payload is null', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, null);

    assert.equal(await cache.get('key', 'default'), 'default');
    cleanup();
  });

  it('get returns undefined when stored value is null', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { key: { value: null } });

    assert.equal(await cache.get('key'), undefined);
    cleanup();
  });

  it('get deletes expired entries and returns default', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, { expired: { value: 'old', expiresAt: Date.now() - 100 } });

    const value = await cache.get('expired', 'default');
    assert.equal(value, 'default');
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('stores and retrieves values', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('answer', 42);

    assert.equal(await cache.get('answer'), 42);
    const payload = readPayload(filePath);
    assert.equal(payload.answer?.value, 42);
    cleanup();
  });

  it('remembers value when missing and caches it', async () => {
    const { cache, filePath, cleanup } = setupCache();
    const value = await cache.remember('remember', 60, () => ({ payload: 123 }));

    assert.deepEqual(value, { payload: 123 });
    const payload = readPayload(filePath);
    assert.deepEqual(payload.remember?.value, { payload: 123 });
    cleanup();
  });

  it('remembers returns existing non-expired value', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      existing: { value: 'kept', expiresAt: Date.now() + 10000, key: 'existing' },
    });

    const value = await cache.remember('existing', 60, () => 'new');
    assert.equal(value, 'kept');
    cleanup();
  });

  it('remember overwrites expired entry', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: 'old', expiresAt: Date.now() - 100, key: 'expired' },
    });

    const value = await cache.remember('expired', 60, () => 'fresh');
    const payload = readPayload(filePath);
    assert.equal(value, 'fresh');
    assert.equal(payload.expired?.value, 'fresh');
    cleanup();
  });

  it('remember with non-finite TTL stores without expiresAt', async () => {
    const { cache, filePath, cleanup } = setupCache();
    const value = await cache.remember('no-ttl', Number.POSITIVE_INFINITY, () => 'forever');

    const payload = readPayload(filePath);
    assert.equal(value, 'forever');
    assert.equal(Object.hasOwn(payload['no-ttl'] ?? {}, 'expiresAt'), false);
    cleanup();
  });

  it('rememberForever stores without expiry', async () => {
    const { cache, filePath, cleanup } = setupCache();
    const value = await cache.rememberForever('forever', () => 'persistent');

    const payload = readPayload(filePath);
    assert.equal(value, 'persistent');
    assert.equal(Object.hasOwn(payload.forever ?? {}, 'expiresAt'), false);
    cleanup();
  });

  it('put stores with TTL', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('ttl', 'value', 1);

    const payload = readPayload(filePath);
    assert.equal(payload.ttl?.value, 'value');
    assert.ok(typeof payload.ttl?.expiresAt === 'number');
    cleanup();
  });

  it('put stores forever when TTL omitted', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('forever-put', 'value');

    const payload = readPayload(filePath);
    assert.equal(payload['forever-put']?.value, 'value');
    assert.equal(Object.hasOwn(payload['forever-put'] ?? {}, 'expiresAt'), false);
    cleanup();
  });

  it('forever stores without expiry', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.forever('forever-method', 'value');

    const payload = readPayload(filePath);
    assert.equal(payload['forever-method']?.value, 'value');
    assert.equal(Object.hasOwn(payload['forever-method'] ?? {}, 'expiresAt'), false);
    cleanup();
  });

  it('forget removes an item and returns true when it existed', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('forget-me', 1);

    assert.equal(await cache.forget('forget-me'), true);
    assert.equal(await cache.forget('forget-me'), false);
    assert.equal(fs.existsSync(filePath), true);
    cleanup();
  });

  it('flush clears all entries', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('a', 1);
    await cache.put('b', 2);

    await cache.flush();

    assert.equal(fs.existsSync(filePath), false);
    assert.equal(await cache.count(), 0);
    cleanup();
  });

  it('add stores only when missing', async () => {
    const { cache, filePath, cleanup } = setupCache();
    const first = await cache.add('add-key', 'one', 10);
    const second = await cache.add('add-key', 'two', 10);

    assert.equal(first, true);
    assert.equal(second, false);

    const payload = readPayload(filePath);
    assert.equal(payload['add-key']?.value, 'one');
    cleanup();
  });

  it('add respects existing non-expired value', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      existing: { value: 'kept', expiresAt: Date.now() + 1000, key: 'existing' },
    });

    const stored = await cache.add('existing', 'new', 10);
    const payload = readPayload(filePath);
    assert.equal(stored, false);
    assert.equal(payload.existing?.value, 'kept');
    cleanup();
  });

  it('add writes over invalid JSON', async () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, '{', 'utf8');

    assert.equal(await cache.add('new', 'value', 10), true);
    const payload = readPayload(filePath);
    assert.equal(payload.new?.value, 'value');
    cleanup();
  });

  it('pull returns value and deletes the entry', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('pull-me', 99);

    const value = await cache.pull('pull-me');
    assert.equal(value, 99);
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'pull-me'), false);
    cleanup();
  });

  it('pull returns default when missing or expired', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: 1, expiresAt: Date.now() - 1000, key: 'expired' },
    });

    assert.equal(await cache.pull('missing', 'default'), 'default');
    assert.equal(await cache.pull('expired', () => 'from-factory'), 'from-factory');
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('pull deletes invalid JSON and returns default', async () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, '{', 'utf8');

    assert.equal(await cache.pull('key', 'default'), 'default');
    cleanup();
  });

  it('keys returns all non-expired cache keys', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('key1', 'value1');
    await cache.put('key2', 'value2');
    await cache.put('key3', 'value3');

    const keys = await cache.keys();
    assert.equal(keys.length, 3);
    assert.ok(keys.includes('key1'));
    assert.ok(keys.includes('key2'));
    assert.ok(keys.includes('key3'));
    cleanup();
  });

  it('keys filters out expired entries', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('valid', 'data', 3600);
    writePayload(filePath, {
      valid: { value: 'data', expiresAt: Date.now() + 3600 * 1000, key: 'valid' },
      expired: { value: 'old', expiresAt: Date.now() - 1000, key: 'expired' },
    });

    const freshCache = new FlatFileCache({ filePath });
    const keys = await freshCache.keys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0], 'valid');
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('count returns number of cached items', async () => {
    const { cache, cleanup } = setupCache();
    assert.equal(await cache.count(), 0);

    await cache.put('a', 1);
    await cache.put('b', 2);
    assert.equal(await cache.count(), 2);
    cleanup();
  });

  it('size returns total cache file size in bytes', async () => {
    const { cache, filePath, cleanup } = setupCache();
    assert.equal(await cache.size(), 0);

    await cache.put('key', 'value');
    const sizeAfter = await cache.size();
    assert.ok(sizeAfter > 0);

    await cache.flush();
    assert.equal(await cache.size(), 0);
    assert.equal(fs.existsSync(filePath), false);
    cleanup();
  });

  it('prune removes only expired entries', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('valid1', 'data1', 3600);
    await cache.put('valid2', 'data2');

    writePayload(filePath, {
      ...readPayload(filePath),
      expired1: { value: 'old1', expiresAt: Date.now() - 1000, key: 'expired1' },
      expired2: { value: 'old2', expiresAt: Date.now() - 500, key: 'expired2' },
    });

    const freshCache = new FlatFileCache({ filePath });
    const removed = await freshCache.prune();
    assert.equal(removed, 2);
    const payload = readPayload(filePath);
    assert.ok(payload.valid1);
    assert.ok(payload.valid2);
    assert.equal(Object.hasOwn(payload, 'expired1'), false);
    cleanup();
  });

  it('prune removes invalid entries', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('valid', 'data');

    writePayload(filePath, {
      ...readPayload(filePath),
      invalid: null,
      missingValue: { expiresAt: Date.now() + 1000, key: 'missingValue' },
    });

    const freshCache = new FlatFileCache({ filePath });
    const removed = await freshCache.prune();
    assert.equal(removed, 2);
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'invalid'), false);
    cleanup();
  });

  it('ttl returns remaining time in seconds', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('session', 'data', 10);

    const ttl = await cache.ttl('session');
    assert.ok(ttl !== null);
    assert.ok(ttl! <= 10 && ttl! > 0);
    cleanup();
  });

  it('ttl returns null for non-existent keys or without expiration', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('permanent', 'data');

    assert.equal(await cache.ttl('missing'), null);
    assert.equal(await cache.ttl('permanent'), null);
    cleanup();
  });

  it('ttl returns null and removes expired entries', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: 'old', expiresAt: Date.now() - 1000, key: 'expired' },
    });

    assert.equal(await cache.ttl('expired'), null);
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('touch extends TTL of existing entry', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('session', 'data', 10);

    const updated = await cache.touch('session', 3600);
    assert.equal(updated, true);

    const ttl = await cache.ttl('session');
    assert.ok(ttl !== null);
    assert.ok(ttl! > 10);
    cleanup();
  });

  it('touch returns false for non-existent or expired keys', async () => {
    const { cache, filePath, cleanup } = setupCache();
    writePayload(filePath, {
      expired: { value: 'old', expiresAt: Date.now() - 1000, key: 'expired' },
    });

    assert.equal(await cache.touch('missing', 60), false);
    assert.equal(await cache.touch('expired', 60), false);
    cleanup();
  });

  it('touch can remove TTL by passing Infinity', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('session', 'data', 60);
    await cache.touch('session', Number.POSITIVE_INFINITY);

    assert.equal(await cache.ttl('session'), null);
    assert.ok(await cache.has('session'));
    cleanup();
  });

  it('increment and decrement update numeric values', async () => {
    const { cache, cleanup } = setupCache();

    assert.equal(await cache.increment('counter'), 1);
    assert.equal(await cache.increment('counter'), 2);
    assert.equal(await cache.decrement('counter'), 1);
    cleanup();
  });

  it('increment treats non-numeric values as zero and preserves TTL', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('text', 'hello', 3600);

    assert.equal(await cache.increment('text'), 1);
    const ttl = await cache.ttl('text');
    assert.ok(ttl !== null && ttl! > 0);
    cleanup();
  });

  it('increment handles invalid JSON gracefully', async () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, '{', 'utf8');

    assert.equal(await cache.increment('bad-counter'), 1);
    assert.equal(await cache.get('bad-counter'), 1);
    cleanup();
  });

  it('decrement creates negative values when key missing', async () => {
    const { cache, cleanup } = setupCache();
    assert.equal(await cache.decrement('missing'), -1);
    assert.equal(await cache.decrement('missing'), -2);
    cleanup();
  });

  it('batch operations work together', async () => {
    const { cache, cleanup } = setupCache();

    await cache.putMany(
      {
        user1: 'Alice',
        user2: 'Bob',
        user3: 'Charlie',
      },
      60
    );

    const users = await cache.getMany(['user1', 'user2', 'user3']);
    assert.deepEqual(users, {
      user1: 'Alice',
      user2: 'Bob',
      user3: 'Charlie',
    });

    const removed = await cache.forgetMany(['user1', 'user3']);
    assert.equal(removed, 2);

    const remaining = await cache.getMany(['user1', 'user2', 'user3']);
    assert.deepEqual(remaining, {
      user1: undefined,
      user2: 'Bob',
      user3: undefined,
    });
    cleanup();
  });

  it('persists data across instances', async () => {
    const { filePath, cleanup } = setupCache();
    const cache1 = new FlatFileCache({ filePath });
    await cache1.put('persisted', { ok: true }, 120);

    const cache2 = new FlatFileCache({ filePath });
    assert.deepEqual(await cache2.get('persisted'), { ok: true });
    cleanup();
  });

  it('recovers from corrupted file by treating as empty', async () => {
    const { cache, filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, '{', 'utf8');

    await cache.put('valid', 'data');
    assert.equal(await cache.get('valid'), 'data');
    cleanup();
  });

  it('get with expired entry deletes and saves to disk', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('key', 'value', 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(await cache.get('key', 'default'), 'default');
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'key'), false);
    cleanup();
  });

  it('has with expired entry deletes and saves to disk', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('expired', 'old', 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(await cache.has('expired'), false);
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it("flush removes file when it doesn't exist", async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.flush();
    assert.equal(fs.existsSync(filePath), false);
    await cache.flush(); // Call again when file doesn't exist
    assert.equal(fs.existsSync(filePath), false);
    cleanup();
  });

  it('keys with expired entries saves to disk after filtering', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('valid', 'data');
    await cache.put('expired', 'old', 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    const keys = await cache.keys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0], 'valid');
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('ttl with expired entry deletes and saves to disk', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('expired', 'old', 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(await cache.ttl('expired'), null);
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('touch with expired entry deletes and saves to disk', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('expired', 'old', 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(await cache.touch('expired', 60), false);
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('pull with expired entry saves and returns default', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('expired', 'old', 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    assert.equal(await cache.pull('expired', 'default'), 'default');
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('prune removes expired entries and saves to disk', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('valid', 'data');
    await cache.put('expired', 'old', 0.01); // 10ms TTL
    await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for expiry

    const removed = await cache.prune();
    assert.ok(removed > 0);
    const payload = readPayload(filePath);
    assert.ok(payload.valid);
    assert.equal(Object.hasOwn(payload, 'expired'), false);
    cleanup();
  });

  it('saveToDisk handles write errors gracefully', async () => {
    const { cleanup } = setupCache();
    const invalidPath = '/invalid/path/that/does/not/exist/cache.json';
    const cache = new FlatFileCache({ filePath: invalidPath });

    // This should not throw even though the path is invalid
    await cache.put('key', 'value');
    assert.equal(await cache.get('key'), 'value'); // Value is in memory
    cleanup();
  });

  it('loadFromDisk handles empty file content', async () => {
    const { filePath, cleanup } = setupCache();
    fs.writeFileSync(filePath, '   \n  ', 'utf8'); // Whitespace only

    const freshCache = new FlatFileCache({ filePath });
    assert.equal(await freshCache.count(), 0);
    cleanup();
  });

  it('pull returns undefined when stored value is null', async () => {
    const { filePath, cleanup } = setupCache();
    writePayload(filePath, { key: { value: null, key: 'key' } });

    const freshCache = new FlatFileCache({ filePath });
    assert.equal(await freshCache.pull('key'), undefined);
    cleanup();
  });

  it('touch preserves key when entry.key is null via store manipulation', async () => {
    const { cache, filePath, cleanup } = setupCache();
    // Directly manipulate the private store to create entry with null key
    // This tests the defensive ?? fallback in touch() at line 198
    const internals = cache as unknown as FlatFileInternals;
    internals.loaded = true;
    internals.store.set('testkey', { value: 'data', key: null });

    assert.equal(await cache.touch('testkey', 60), true);
    const payload = readPayload(filePath);
    assert.equal(payload.testkey?.key, 'testkey');
    cleanup();
  });

  // ── Security fixes ──────────────────────────────────────────────────────────

  // M3: TTL validation
  it('put throws RangeError for NaN TTL', async () => {
    const { cache, cleanup } = setupCache();
    await assert.rejects(() => cache.put('key', 'value', Number.NaN), RangeError);
    cleanup();
  });

  it('put throws RangeError for negative TTL', async () => {
    const { cache, cleanup } = setupCache();
    await assert.rejects(() => cache.put('key', 'value', -1), RangeError);
    cleanup();
  });

  it('put accepts Infinity TTL (stores without expiry)', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('inf-key', 'value', Infinity);
    assert.equal(await cache.get('inf-key'), 'value');
    assert.equal(await cache.ttl('inf-key'), null);
    cleanup();
  });

  it('put accepts zero TTL without throwing', async () => {
    const { cache, cleanup } = setupCache();
    await assert.doesNotReject(() => cache.put('zero-key', 'value', 0));
    cleanup();
  });

  it('touch throws RangeError for negative seconds', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('key', 'value');
    await assert.rejects(() => cache.touch('key', -1), RangeError);
    cleanup();
  });

  it('touch throws RangeError for NaN seconds', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('key', 'value');
    await assert.rejects(() => cache.touch('key', Number.NaN), RangeError);
    cleanup();
  });

  // H1: add() is atomic (synchronous check-and-set in memory)
  it('add succeeds when existing entry is expired', async () => {
    const { filePath, cleanup } = setupCache();
    writePayload(filePath, {
      'exp-key': { value: 'old', expiresAt: Date.now() - 1000, key: 'exp-key' },
    });
    const freshCache = new FlatFileCache({ filePath });
    assert.equal(await freshCache.add('exp-key', 'new', 10), true);
    assert.equal(await freshCache.get('exp-key'), 'new');
    cleanup();
  });

  // M1: File permissions (POSIX only)
  it('writes cache file with mode 0o600', async () => {
    if (process.platform === 'win32') return;
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('mode-test', 'value');
    const stats = fs.statSync(filePath);
    assert.equal(stats.mode & 0o777, 0o600);
    cleanup();
  });

  // M2: loadFromDisk treats a non-ENOENT read error as corrupt without throwing
  it('does not throw when the cache file path is unreadable', async () => {
    if (process.platform === 'win32') return;
    const { dir, filePath, cleanup } = setupCache();
    // Replace the cache file with a directory so readFileSync throws EISDIR (not ENOENT).
    fs.mkdirSync(filePath);
    const cache = new FlatFileCache({ filePath: path.join(dir, 'cache.json') });
    assert.equal(await cache.get('anything'), undefined);
    cleanup();
  });

  // M4: getMany prototype pollution (from BaseCacheAdapter)
  it('getMany with __proto__ key does not pollute Object.prototype', async () => {
    const { cache, cleanup } = setupCache();
    await cache.put('__proto__', { isAdmin: true } as unknown as string);
    await cache.getMany(['__proto__']);
    assert.equal((Object.prototype as Record<string, unknown>).isAdmin, undefined);
    cleanup();
  });

  // L2: Key type validation
  it('put throws TypeError for non-string key', async () => {
    const { cache, cleanup } = setupCache();
    await assert.rejects(
      () => cache.put(42 as unknown as string, 'value'),
      TypeError
    );
    cleanup();
  });

  it('get throws TypeError for non-string key', async () => {
    const { cache, cleanup } = setupCache();
    await assert.rejects(
      () => cache.get(null as unknown as string),
      TypeError
    );
    cleanup();
  });

  it('has throws TypeError for non-string key', async () => {
    const { cache, cleanup } = setupCache();
    await assert.rejects(
      () => cache.has(undefined as unknown as string),
      TypeError
    );
    cleanup();
  });

  // L4: Random temp file (saveToDisk must not leave predictable .tmp artifact)
  it('saveToDisk leaves no predictable .tmp file after successful write', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.put('key', 'value');
    assert.equal(fs.existsSync(`${filePath}.tmp`), false);
    const payload = readPayload(filePath);
    assert.equal(payload.key?.value, 'value');
    cleanup();
  });

  // Coverage: add() with no TTL (exercises the Infinity/null branch in the ternary)
  it('add stores without TTL when seconds is omitted', async () => {
    const { cache, cleanup } = setupCache();
    assert.equal(await cache.add('no-ttl', 'value'), true);
    assert.equal(await cache.ttl('no-ttl'), null);
    assert.equal(await cache.get('no-ttl'), 'value');
    cleanup();
  });

  // Coverage: saveToDisk cleans up temp file when rename fails
  it('saveToDisk cleans up randomized temp file when rename fails', async () => {
    const { dir, cleanup } = setupCache();
    // Make filePath itself a directory so renameSync(tempFile, dir) fails with EISDIR
    const dirAsFilePath = path.join(dir, 'cache-dir');
    fs.mkdirSync(dirAsFilePath);
    const cache = new FlatFileCache({ filePath: dirAsFilePath });

    // put() calls saveToDisk() which will fail at rename — should not throw
    await cache.put('key', 'value');

    // Value should be in memory even though disk write failed
    assert.equal(await cache.get('key'), 'value');

    // No stray .tmp files should remain in the dir
    const tmpFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0);
    cleanup();
  });

  // putMany override tests
  it('putMany performs a single disk write for N keys', async () => {
    const { cache, filePath, cleanup } = setupCache();
    let renameCount = 0;
    const origRename = fs.renameSync;
    fs.renameSync = (oldPath: fs.PathLike, newPath: fs.PathLike) => {
      if (String(newPath) === filePath) renameCount++;
      origRename(oldPath, newPath);
    };
    try {
      await cache.putMany({ a: '1', b: '2', c: '3' }, 60);
      assert.equal(renameCount, 1, `expected 1 disk write, got ${renameCount}`);
    } finally {
      fs.renameSync = origRename;
    }
    cleanup();
  });

  it('putMany persists all keys with correct values', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.putMany({ x: 'alpha', y: 'beta', z: 'gamma' });
    const payload = readPayload(filePath);
    assert.equal(payload.x?.value, 'alpha');
    assert.equal(payload.y?.value, 'beta');
    assert.equal(payload.z?.value, 'gamma');
    cleanup();
  });

  it('putMany with TTL sets expiresAt for all keys', async () => {
    const { cache, filePath, cleanup } = setupCache();
    const before = Date.now();
    await cache.putMany({ p: 1, q: 2 } as Record<string, unknown> as Record<string, string>, 10);
    const payload = readPayload(filePath);
    assert.ok(payload.p?.expiresAt != null && (payload.p.expiresAt as number) > before);
    assert.ok(payload.q?.expiresAt != null && (payload.q.expiresAt as number) > before);
    cleanup();
  });

  it('putMany with Infinity TTL stores without expiresAt', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await cache.putMany({ forever: 'yes' } as Record<string, unknown> as Record<string, string>, Number.POSITIVE_INFINITY);
    const payload = readPayload(filePath);
    assert.equal(Object.hasOwn(payload.forever ?? {}, 'expiresAt'), false);
    cleanup();
  });

  it('putMany rejects invalid TTL before writing any key', async () => {
    const { cache, filePath, cleanup } = setupCache();
    await assert.rejects(
      () => cache.putMany({ a: '1', b: '2' }, -1),
      RangeError
    );
    assert.equal(fs.existsSync(filePath), false);
    cleanup();
  });
});
