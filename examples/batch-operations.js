/**
 * Batch Operations Example
 *
 * Demonstrates efficient multi-key operations:
 * - putMany() - Store multiple key-value pairs at once
 * - getMany() - Retrieve multiple values
 * - forgetMany() - Remove multiple keys
 */

import { FileCache } from '../dist/index.js';

(async () => {
  console.log('=== Batch Operations Example ===\n');

  const cache = new FileCache();

  // 1. putMany - Store multiple entries at once
  console.log('1. Storing multiple users with putMany():');
  const users = {
    'user:101': { id: 101, name: 'Alice', email: 'alice@example.com' },
    'user:102': { id: 102, name: 'Bob', email: 'bob@example.com' },
    'user:103': { id: 103, name: 'Charlie', email: 'charlie@example.com' },
    'user:104': { id: 104, name: 'Diana', email: 'diana@example.com' },
    'user:105': { id: 105, name: 'Eve', email: 'eve@example.com' },
  };

  await cache.putMany(users, 3600); // Store all with 1 hour TTL
  console.log(`   Stored ${Object.keys(users).length} users`);
  console.log();

  // 2. getMany - Retrieve multiple entries at once
  console.log('2. Retrieving multiple users with getMany():');
  const userKeys = ['user:101', 'user:103', 'user:105'];
  const retrieved = await cache.getMany(userKeys);
  console.log('   Retrieved users:', userKeys);
  console.log('   Results:');
  for (const [key, value] of Object.entries(retrieved)) {
    console.log(`     ${key}:`, value);
  }
  console.log();

  // 3. getMany with missing keys
  console.log('3. Getting keys that include missing ones:');
  const mixedKeys = ['user:101', 'user:999', 'user:103', 'user:888'];
  const mixedResults = await cache.getMany(mixedKeys);
  console.log('   Requested:', mixedKeys);
  console.log('   Results:');
  for (const [key, value] of Object.entries(mixedResults)) {
    console.log(`     ${key}:`, value === undefined ? 'MISSING' : value);
  }
  console.log();

  // 4. Bulk cache warming
  console.log('4. Bulk cache warming scenario:');
  console.log('   Simulating loading product catalog...');

  const products = {};
  for (let i = 1; i <= 50; i++) {
    products[`product:${i}`] = {
      id: i,
      name: `Product ${i}`,
      price: (Math.random() * 100).toFixed(2),
      inStock: Math.random() > 0.3
    };
  }

  const start = Date.now();
  await cache.putMany(products, 7200); // 2 hours TTL
  const elapsed = Date.now() - start;

  console.log(`   Cached ${Object.keys(products).length} products in ${elapsed}ms`);
  console.log(`   Total cache entries: ${await cache.count()}`);
  console.log();

  // 5. Selective retrieval
  console.log('5. Retrieving specific products:');
  const productIds = [5, 15, 25, 35, 45];
  const productKeys = productIds.map(id => `product:${id}`);
  const selectedProducts = await cache.getMany(productKeys);
  console.log(`   Retrieved ${productIds.length} products:`);
  for (const [key, product] of Object.entries(selectedProducts)) {
    if (product) {
      console.log(`     ${key}: ${product.name} - $${product.price}`);
    }
  }
  console.log();

  // 6. forgetMany - Batch deletion
  console.log('6. Batch deletion with forgetMany():');
  const keysToDelete = ['user:102', 'user:104', 'product:10', 'product:20'];
  const deleted = await cache.forgetMany(keysToDelete);
  console.log(`   Attempted to delete ${keysToDelete.length} keys`);
  console.log(`   Actually deleted: ${deleted} keys`);
  console.log(`   Remaining entries: ${await cache.count()}`);
  console.log();

  // 7. Bulk invalidation pattern
  console.log('7. Bulk invalidation pattern:');
  console.log('   Finding all user keys to invalidate...');
  const allKeys = await cache.keys();
  const userOnlyKeys = allKeys.filter(key => key.startsWith('user:'));
  console.log(`   Found ${userOnlyKeys.length} user keys`);

  const removedUsers = await cache.forgetMany(userOnlyKeys);
  console.log(`   Invalidated ${removedUsers} user entries`);
  console.log(`   Remaining entries: ${await cache.count()}`);
  console.log();

  // 8. Cleanup
  console.log('8. Cleanup:');
  await cache.flush();
  console.log('   All cache entries cleared');
  console.log();

  console.log('=== Example Complete ===');
  console.log('\nBatch operations are ideal for:');
  console.log('  ✓ Bulk data loading');
  console.log('  ✓ Cache warming');
  console.log('  ✓ Multi-key invalidation');
  console.log('  ✓ Reducing overhead when working with multiple keys');
})();
