/**
 * LRU Eviction Example (MemoryCache)
 *
 * Demonstrates bounding memory usage with the `maxEntries` option:
 * - Least-recently-used eviction once the cache is full
 * - Reads and writes count as "use" and keep hot keys resident
 * - How to inspect what survived eviction
 */

import { MemoryCache } from '../dist/index.js';

(async () => {
  console.log('=== MemoryCache LRU Eviction Example ===\n');

  // 1. Create a bounded cache (holds at most 3 entries)
  console.log('1. Creating a MemoryCache with maxEntries: 3');
  const cache = new MemoryCache({ maxEntries: 3 });
  console.log();

  // 2. Fill it to capacity
  console.log('2. Inserting a, b, c (cache is now full):');
  await cache.put('a', 1);
  await cache.put('b', 2);
  await cache.put('c', 3);
  console.log('   Keys:', await cache.keys()); // [a, b, c]
  console.log();

  // 3. Reading 'a' marks it as recently used, so 'b' becomes the oldest
  console.log('3. Reading "a" (bumps it to most-recently-used):');
  console.log('   a =', await cache.get('a'));
  console.log();

  // 4. Inserting a 4th key evicts the least-recently-used ('b')
  console.log('4. Inserting "d" — exceeds maxEntries, evicts LRU:');
  await cache.put('d', 4);
  console.log('   Keys:', await cache.keys()); // [c, a, d] — b evicted
  console.log('   has("b"):', await cache.has('b'), '(evicted)');
  console.log('   has("a"):', await cache.has('a'), '(survived: recently read)');
  console.log();

  // 5. Writes also count as use
  console.log('5. Updating "c" then inserting "e":');
  await cache.put('c', 30); // c becomes most-recently-used
  await cache.put('e', 5); // evicts the now-oldest key
  console.log('   Keys:', await cache.keys());
  console.log('   count():', await cache.count(), '(never exceeds maxEntries)');
  console.log();

  // 6. Cleanup
  await cache.flush();
  console.log('=== Example Complete ===');
  console.log('\nTip: maxEntries is MemoryCache-only and keeps heap usage bounded');
  console.log('     in long-running processes. Eviction is O(1).');
})();
