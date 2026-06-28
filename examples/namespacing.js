/**
 * Namespacing Example
 *
 * Demonstrates scoped cache views via namespace(prefix):
 * - Transparent key prefixing (multiple logical caches share one store)
 * - Isolation between namespaces (no key collisions)
 * - Scoped flush() for group invalidation
 * - Scoped keys()/count() (prefix stripped on the way out)
 * - Nesting (a.namespace('b') -> a:b:key)
 */

import { MemoryCache } from '../dist/index.js';

(async () => {
  console.log('=== Namespacing Example ===\n');

  const cache = new MemoryCache();

  // 1. Create scoped views over a single backing store
  console.log('1. Creating "user" and "session" namespaces:');
  const users = cache.namespace('user');
  const sessions = cache.namespace('session');
  console.log();

  // 2. Keys are transparently prefixed — no collisions across namespaces
  console.log('2. Storing the same sub-key "42" in both namespaces:');
  await users.put('42', { name: 'Alice' });
  await sessions.put('42', { token: 'abc123' });
  await cache.put('root-key', 'not namespaced');
  console.log('   users.get("42"):', await users.get('42'));
  console.log('   sessions.get("42"):', await sessions.get('42'));
  console.log('   root sees full key user:42:', await cache.get('user:42'));
  console.log();

  // 3. Scoped listing — keys come back without the prefix
  console.log('3. Scoped keys()/count():');
  await users.put('99', { name: 'Bob' });
  console.log('   users.keys():', await users.keys()); // ['42', '99']
  console.log('   users.count():', await users.count()); // 2
  console.log();

  // 4. Group invalidation — flush() clears ONLY this namespace
  console.log('4. users.flush() (group invalidation):');
  await users.flush();
  console.log('   users.count():', await users.count(), '(cleared)');
  console.log('   sessions.get("42"):', await sessions.get('42'), '(sibling survives)');
  console.log('   cache.get("root-key"):', await cache.get('root-key'), '(root survives)');
  console.log();

  // 5. Nesting — prefixes compound
  console.log('5. Nested namespaces:');
  const tenantA = cache.namespace('tenant-a');
  const tenantAUsers = tenantA.namespace('user');
  await tenantAUsers.put('1', 'scoped value');
  console.log('   stored via tenant-a > user > "1"');
  console.log('   root.get("tenant-a:user:1"):', await cache.get('tenant-a:user:1'));
  console.log();

  await cache.flush();
  console.log('=== Example Complete ===');
  console.log('\nTip: a namespace implements the full CacheAdapter interface,');
  console.log('     so it is a drop-in anywhere a cache is expected.');
})();
