import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CacheAdapter } from '../../adapters/base.js';
import { FileCache, MemoryCache, NamespacedCache } from '../../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// namespace() validation
// ---------------------------------------------------------------------------
describe('namespace() validation', () => {
  it('throws TypeError for empty string prefix', () => {
    const cache = new MemoryCache<string>();
    assert.throws(() => cache.namespace(''), TypeError);
  });

  it('throws TypeError for non-string prefix (number)', () => {
    const cache = new MemoryCache<string>();
    assert.throws(() => cache.namespace(42 as unknown as string), TypeError);
  });

  it('throws TypeError for non-string prefix (null)', () => {
    const cache = new MemoryCache<string>();
    assert.throws(() => cache.namespace(null as unknown as string), TypeError);
  });

  it('returns a NamespacedCache instance for a valid prefix', () => {
    const cache = new MemoryCache<string>();
    const ns = cache.namespace('user');
    assert.ok(ns instanceof NamespacedCache);
  });

  it('returned wrapper satisfies CacheAdapter<V> type (compile-time check via assignment)', () => {
    const cache = new MemoryCache<string>();
    // This line must compile; if CacheAdapter<string> is not satisfied it fails tsc
    const _typed: CacheAdapter<string> = cache.namespace('user');
    assert.ok(_typed);
  });
});

// ---------------------------------------------------------------------------
// Core single-key delegation
// ---------------------------------------------------------------------------
describe('NamespacedCache single-key ops', () => {
  it('put stores under prefix:key in the root cache', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.put('42', 'alice');
    assert.equal(await root.get('user:42'), 'alice');
  });

  it('get retrieves value by original key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await root.put('user:42', 'alice');
    assert.equal(await ns.get('42'), 'alice');
  });

  it('get returns default value when key missing', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    assert.equal(await ns.get('missing', 'fallback'), 'fallback');
  });

  it('get invokes factory when key missing', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    assert.equal(await ns.get('missing', () => 'from-factory'), 'from-factory');
  });

  it('has returns true for existing key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.put('1', 'alice');
    assert.equal(await ns.has('1'), true);
  });

  it('has returns false for missing key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    assert.equal(await ns.has('missing'), false);
  });

  it('forget removes the key and returns true', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.put('1', 'alice');
    assert.equal(await ns.forget('1'), true);
    assert.equal(await root.has('user:1'), false);
  });

  it('forget returns false for non-existent key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    assert.equal(await ns.forget('missing'), false);
  });

  it('forever stores permanently (no expiry)', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.forever('1', 'alice');
    assert.equal(await ns.ttl('1'), null);
    assert.equal(await ns.get('1'), 'alice');
  });

  it('add stores only if key is absent', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    assert.equal(await ns.add('x', 'first'), true);
    assert.equal(await ns.add('x', 'second'), false);
    assert.equal(await ns.get('x'), 'first');
  });

  it('pull retrieves and removes the key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.put('tmp', 'temp-value');
    const val = await ns.pull('tmp');
    assert.equal(val, 'temp-value');
    assert.equal(await ns.has('tmp'), false);
  });

  it('pull returns default for missing key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    assert.equal(await ns.pull('missing', 'default'), 'default');
  });

  it('remember caches factory result under prefixed key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    const val = await ns.remember('42', 60, () => 'computed');
    assert.equal(val, 'computed');
    assert.equal(await root.get('user:42'), 'computed');
  });

  it('rememberForever caches without TTL', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.rememberForever('42', () => 'forever-value');
    assert.equal(await ns.ttl('42'), null);
  });

  it('ttl returns remaining TTL via prefixed key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.put('42', 'alice', 100);
    const remaining = await ns.ttl('42');
    assert.ok(remaining !== null && remaining > 0 && remaining <= 100);
  });

  it('ttl returns null for key without expiry', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.forever('42', 'alice');
    assert.equal(await ns.ttl('42'), null);
  });

  it('touch updates TTL on existing key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    await ns.put('42', 'alice', 10);
    const updated = await ns.touch('42', 999);
    assert.equal(updated, true);
    const remaining = await ns.ttl('42');
    assert.ok(remaining !== null && remaining > 100);
  });

  it('touch returns false for missing key', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('user');
    assert.equal(await ns.touch('missing', 60), false);
  });

  it('increment increments under prefixed key', async () => {
    const root = new MemoryCache<number>();
    const ns = root.namespace('ctr');
    await root.put('ctr:hits', 5 as unknown as number);
    const val = await ns.increment('hits');
    assert.equal(val, 6);
    assert.equal(await root.get('ctr:hits'), 6);
  });

  it('decrement decrements under prefixed key', async () => {
    const root = new MemoryCache<number>();
    const ns = root.namespace('ctr');
    await root.put('ctr:hits', 10 as unknown as number);
    const val = await ns.decrement('hits');
    assert.equal(val, 9);
  });
});

// ---------------------------------------------------------------------------
// Isolation between namespaces
// ---------------------------------------------------------------------------
describe('NamespacedCache isolation', () => {
  it('two namespaces do not share same sub-key', async () => {
    const root = new MemoryCache<string>();
    const a = root.namespace('a');
    const b = root.namespace('b');
    await a.put('x', 'from-a');
    await b.put('x', 'from-b');
    assert.equal(await a.get('x'), 'from-a');
    assert.equal(await b.get('x'), 'from-b');
  });

  it('prefix "user" does NOT capture keys of namespace "users"', async () => {
    const root = new MemoryCache<string>();
    const user = root.namespace('user');
    const users = root.namespace('users');
    await users.put('1', 'alice');
    // 'user' namespace should NOT see 'users:1'
    assert.equal(await user.has('s:1'), false);
    const userKeys = await user.keys();
    assert.ok(!userKeys.includes('s:1'));
  });

  it('keys() boundary: user namespace does not see users:... keys', async () => {
    const root = new MemoryCache<string>();
    const user = root.namespace('user');
    const users = root.namespace('users');
    await user.put('abc', 'val1');
    await users.put('abc', 'val2');
    const userKeys = await user.keys();
    assert.deepEqual(userKeys, ['abc']);
    const usersKeys = await users.keys();
    assert.deepEqual(usersKeys, ['abc']);
  });
});

// ---------------------------------------------------------------------------
// keys() and count()
// ---------------------------------------------------------------------------
describe('NamespacedCache keys() and count()', () => {
  it('keys() returns only this namespace keys, prefix stripped', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.put('a', '1');
    await ns.put('b', '2');
    await root.put('other', 'x');
    const keys = await ns.keys();
    keys.sort();
    assert.deepEqual(keys, ['a', 'b']);
  });

  it('count() returns count of this namespace only', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.put('a', '1');
    await ns.put('b', '2');
    await root.put('outside', 'x');
    assert.equal(await ns.count(), 2);
  });
});

// ---------------------------------------------------------------------------
// flush() scoped behavior
// ---------------------------------------------------------------------------
describe('NamespacedCache flush()', () => {
  it('flush() removes only this namespace keys', async () => {
    const root = new MemoryCache<string>();
    const a = root.namespace('a');
    const b = root.namespace('b');
    await a.put('x', '1');
    await a.put('y', '2');
    await b.put('x', '3');
    await root.put('root-key', 'root-val');
    await a.flush();
    assert.equal(await a.has('x'), false);
    assert.equal(await a.has('y'), false);
    assert.equal(await b.has('x'), true);
    assert.equal(await root.has('root-key'), true);
  });

  it('flush() on empty namespace does not throw', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('empty');
    await assert.doesNotReject(() => ns.flush());
  });
});

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------
describe('NamespacedCache batch ops', () => {
  it('putMany stores all items under prefixed keys', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.putMany({ a: '1', b: '2' });
    assert.equal(await root.get('ns:a'), '1');
    assert.equal(await root.get('ns:b'), '2');
  });

  it('getMany returns results keyed by original (unprefixed) keys', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.put('a', '1');
    await ns.put('b', '2');
    const result = await ns.getMany(['a', 'b', 'c']);
    assert.equal(result['a'], '1');
    assert.equal(result['b'], '2');
    assert.equal(result['c'], undefined);
  });

  it('forgetMany removes prefixed keys and returns removed count', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.put('a', '1');
    await ns.put('b', '2');
    const count = await ns.forgetMany(['a', 'b', 'c']);
    assert.equal(count, 2);
    assert.equal(await ns.has('a'), false);
    assert.equal(await ns.has('b'), false);
  });

  it('putMany with __proto__ key stores as literal own property (no prototype pollution)', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    // Use Object.create(null) + assignment so __proto__ is a real own property,
    // not the inherited prototype setter that { __proto__: ... } triggers.
    const items = Object.create(null) as Record<string, string>;
    items['__proto__'] = 'bad';
    await ns.putMany(items);
    // Should be stored as 'ns:__proto__' and NOT pollute Object.prototype
    assert.equal(
      (Object.prototype as Record<string, unknown>)['x'],
      undefined,
      'Object.prototype must not be polluted'
    );
    assert.equal(await root.get('ns:__proto__'), 'bad');
  });

  it('getMany with __proto__ key does not cause prototype pollution', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.put('__proto__', 'value');
    const result = await ns.getMany(['__proto__']);
    // Result must be a plain object without prototype pollution
    assert.equal(
      (Object.prototype as Record<string, unknown>)['polluted'],
      undefined,
      'Object.prototype must not be polluted'
    );
    // The key __proto__ should be accessible as own property
    assert.equal(Object.hasOwn(result, '__proto__'), true);
    assert.equal(result['__proto__'], 'value');
  });
});

// ---------------------------------------------------------------------------
// size()
// ---------------------------------------------------------------------------
describe('NamespacedCache size()', () => {
  it('size() returns a non-negative number reflecting only this namespace', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.put('a', 'hello');
    await root.put('outside', 'world');
    const s = await ns.size();
    assert.ok(typeof s === 'number' && s >= 0);
    const rootSize = await root.size();
    assert.ok(s < rootSize);
  });

  it('size() returns 0 for empty namespace', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('empty');
    await root.put('other', 'x');
    assert.equal(await ns.size(), 0);
  });
});

// ---------------------------------------------------------------------------
// prune / autoPrune delegation
// ---------------------------------------------------------------------------
describe('NamespacedCache prune and autoPrune', () => {
  it('prune() delegates to parent and returns a number', async () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    await ns.put('expired', 'val', 0.001);
    await delay(10);
    const count = await ns.prune();
    assert.ok(typeof count === 'number' && count >= 0);
  });

  it('startAutoPrune and stopAutoPrune delegate without throwing', () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    assert.doesNotThrow(() => ns.startAutoPrune(60));
    assert.doesNotThrow(() => ns.stopAutoPrune());
  });

  it('startAutoPrune propagates RangeError from parent for invalid interval', () => {
    const root = new MemoryCache<string>();
    const ns = root.namespace('ns');
    assert.throws(() => ns.startAutoPrune(-1), RangeError);
    assert.throws(() => ns.startAutoPrune(0), RangeError);
    assert.throws(() => ns.startAutoPrune(Number.POSITIVE_INFINITY), RangeError);
  });
});

// ---------------------------------------------------------------------------
// Nesting: namespace().namespace()
// ---------------------------------------------------------------------------
describe('NamespacedCache nesting', () => {
  it('nested namespace prefixes effectively compound', async () => {
    const root = new MemoryCache<string>();
    const a = root.namespace('a');
    const ab = a.namespace('b');
    await ab.put('k', 'v');
    assert.equal(await root.get('a:b:k'), 'v');
  });

  it('nested namespace flush() scopes to the nested prefix only', async () => {
    const root = new MemoryCache<string>();
    const a = root.namespace('a');
    const ab = a.namespace('b');
    const ac = a.namespace('c');
    await ab.put('k1', 'v1');
    await ab.put('k2', 'v2');
    await ac.put('k3', 'v3');
    await ab.flush();
    assert.equal(await root.has('a:b:k1'), false);
    assert.equal(await root.has('a:b:k2'), false);
    assert.equal(await root.has('a:c:k3'), true);
  });

  it('nested namespace() throws TypeError for empty prefix', () => {
    const root = new MemoryCache<string>();
    const a = root.namespace('a');
    assert.throws(() => a.namespace(''), TypeError);
  });

  it('nested namespace keys() strips both layers of prefix', async () => {
    const root = new MemoryCache<string>();
    const ab = root.namespace('a').namespace('b');
    await ab.put('x', '1');
    const keys = await ab.keys();
    assert.deepEqual(keys, ['x']);
  });
});

// ---------------------------------------------------------------------------
// Adapter-agnosticism: FileCache backing store
// ---------------------------------------------------------------------------
describe('NamespacedCache with FileCache backing store', () => {
  it('put/get work correctly through FileCache', async () => {
    const root = new FileCache<string>({ cachePath: '.cache-ns-test' });
    const ns = root.namespace('file-ns');
    try {
      await ns.put('key1', 'file-value');
      assert.equal(await ns.get('key1'), 'file-value');
      assert.equal(await root.get('file-ns:key1'), 'file-value');
    } finally {
      await root.flush();
    }
  });

  it('flush() scopes correctly with FileCache', async () => {
    const root = new FileCache<string>({ cachePath: '.cache-ns-test2' });
    const a = root.namespace('a');
    const b = root.namespace('b');
    try {
      await a.put('x', 'from-a');
      await b.put('x', 'from-b');
      await a.flush();
      assert.equal(await a.has('x'), false);
      assert.equal(await b.has('x'), true);
    } finally {
      await root.flush();
    }
  });
});
