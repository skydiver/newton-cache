/**
 * Basic MemoryCache Example
 *
 * Demonstrates MemoryCache - fast in-memory storage:
 * - No disk I/O (fastest performance)
 * - Data lost on restart
 * - Same API as FileCache
 */

import { MemoryCache } from '../dist/index.js';

(async () => {
  console.log('=== MemoryCache Basic Example ===\n');

  // Create a new MemoryCache instance
  const cache = new MemoryCache();

  // 1. Store and retrieve values (no disk I/O)
  console.log('1. Storing values in memory:');
  await cache.put('user:1', { id: 1, name: 'Alice', role: 'admin' });
  await cache.put('user:2', { id: 2, name: 'Bob', role: 'user' });
  console.log('   Stored 2 user objects');
  console.log('   Retrieved user:1:', await cache.get('user:1'));
  console.log();

  // 2. TTL expiration (same as FileCache)
  console.log('2. TTL expiration:');
  await cache.put('temp-token', 'secret123', 2);
  console.log('   Stored temp-token with 2-second TTL');
  console.log('   Value:', await cache.get('temp-token'));
  console.log();

  // 3. Introspection
  console.log('3. Introspection:');
  console.log('   Total keys:', await cache.count());
  console.log('   All keys:', await cache.keys());
  console.log('   Memory size:', await cache.size(), 'bytes (approximate)');
  console.log();

  // 4. Add only when missing
  console.log('4. Add only when missing:');
  const added1 = await cache.add('user:1', { id: 99, name: 'Override' });
  console.log('   Try to add existing user:1:', added1, '(already exists)');
  const added2 = await cache.add('user:3', { id: 3, name: 'Charlie' });
  console.log('   Try to add new user:3:', added2, '(successfully added)');
  console.log();

  // 5. Pull (read and delete)
  console.log('5. Pull operation (read and delete):');
  const pulled = await cache.pull('temp-token');
  console.log('   Pulled temp-token:', pulled);
  console.log('   Try to get again:', await cache.get('temp-token', 'GONE'));
  console.log();

  // 6. Performance comparison
  console.log('6. Performance demonstration:');
  const iterations = 10000;
  console.log(`   Writing ${iterations} entries...`);
  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    await cache.put(`key:${i}`, { value: i });
  }
  const elapsed = Date.now() - start;
  console.log(`   Completed in ${elapsed}ms (${(iterations / elapsed).toFixed(0)} ops/ms)`);
  console.log(`   Total entries: ${await cache.count()}`);
  console.log();

  // 7. Cleanup
  console.log('7. Flushing all data:');
  await cache.flush();
  console.log('   After flush, count:', await cache.count());
  console.log();

  console.log('=== Example Complete ===');
  console.log('\nNote: MemoryCache data is lost when the process exits.');
  console.log('      Use FileCache or FlatFileCache for persistence.');
})();
