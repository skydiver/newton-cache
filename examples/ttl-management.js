/**
 * TTL Management Example
 *
 * Demonstrates time-to-live (TTL) operations:
 * - Setting TTL when storing values
 * - Checking remaining TTL with ttl()
 * - Extending TTL with touch()
 * - Removing expiration
 * - Automatic cleanup with prune()
 */

import { FileCache } from '../dist/index.js';

(async () => {
  console.log('=== TTL Management Example ===\n');

  const cache = new FileCache();

  // 1. Store with different TTL values
  console.log('1. Storing values with different TTLs:');
  await cache.put('short-lived', 'expires soon', 5);  // 5 seconds
  await cache.put('medium-lived', 'expires later', 15); // 15 seconds
  await cache.put('long-lived', 'expires much later', 30); // 30 seconds
  await cache.forever('permanent', 'never expires'); // No TTL
  console.log('   Created 4 entries with varying TTLs');
  console.log();

  // 2. Check remaining TTL
  console.log('2. Checking remaining TTL:');
  console.log('   short-lived TTL:', await cache.ttl('short-lived'), 'seconds');
  console.log('   medium-lived TTL:', await cache.ttl('medium-lived'), 'seconds');
  console.log('   long-lived TTL:', await cache.ttl('long-lived'), 'seconds');
  console.log('   permanent TTL:', await cache.ttl('permanent'), '(null = no expiration)');
  console.log();

  // 3. Wait and check again
  console.log('3. Waiting 6 seconds...');
  await new Promise(resolve => setTimeout(resolve, 6000));
  console.log('   After 6 seconds:');
  console.log('   short-lived:', await cache.get('short-lived', 'EXPIRED'));
  console.log('   medium-lived TTL:', await cache.ttl('medium-lived'), 'seconds');
  console.log('   long-lived TTL:', await cache.ttl('long-lived'), 'seconds');
  console.log();

  // 4. Extend TTL with touch()
  console.log('4. Extending TTL with touch():');
  console.log('   medium-lived current TTL:', await cache.ttl('medium-lived'), 'seconds');
  await cache.touch('medium-lived', 60); // Extend to 60 seconds from now
  console.log('   After touch(60):', await cache.ttl('medium-lived'), 'seconds');
  console.log();

  // 5. Remove expiration
  console.log('5. Removing expiration:');
  console.log('   long-lived current TTL:', await cache.ttl('long-lived'), 'seconds');
  await cache.touch('long-lived', Number.POSITIVE_INFINITY);
  console.log('   After touch(Infinity):', await cache.ttl('long-lived'), '(null = permanent)');
  console.log();

  // 6. Session extension pattern
  console.log('6. Session extension pattern:');

  async function createSession(userId, data) {
    const sessionId = `session:${userId}`;
    await cache.put(sessionId, data, 10); // 10 seconds for demo (normally 3600)
    console.log(`   Created session ${sessionId} with 10s TTL`);
    return sessionId;
  }

  async function extendSession(sessionId) {
    const extended = await cache.touch(sessionId, 10); // Extend by 10s
    if (extended) {
      console.log(`   Extended ${sessionId} to ${await cache.ttl(sessionId)}s remaining`);
    } else {
      console.log(`   Failed to extend ${sessionId} (not found or expired)`);
    }
    return extended;
  }

  const session = await createSession('user-456', { userId: 456, role: 'admin' });
  console.log('   Session TTL:', await cache.ttl(session), 'seconds');

  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('   After 3 seconds, TTL:', await cache.ttl(session), 'seconds');

  await extendSession(session);
  console.log('   After extension, TTL:', await cache.ttl(session), 'seconds');
  console.log();

  // 7. Pruning expired entries
  console.log('7. Pruning expired entries:');

  // Create some entries that will expire
  await cache.put('temp-1', 'data', 2);
  await cache.put('temp-2', 'data', 2);
  await cache.put('temp-3', 'data', 2);
  await cache.put('keep-1', 'data'); // No expiration
  await cache.put('keep-2', 'data'); // No expiration

  console.log('   Created 5 entries (3 with 2s TTL, 2 permanent)');
  console.log('   Total entries:', await cache.count());

  await new Promise(resolve => setTimeout(resolve, 2500));

  console.log('   After 2.5 seconds:');
  console.log('   Before prune, count:', await cache.count());
  const pruned = await cache.prune();
  console.log('   Pruned', pruned, 'expired entries');
  console.log('   After prune, count:', await cache.count());
  console.log('   Remaining keys:', await cache.keys());
  console.log();

  // 8. TTL monitoring
  console.log('8. TTL monitoring demonstration:');

  await cache.put('monitored', 'important data', 10);
  console.log('   Created entry with 10s TTL');

  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const remaining = await cache.ttl('monitored');
    if (remaining === null) {
      console.log(`   After ${(i + 1) * 2}s: EXPIRED`);
      break;
    } else {
      console.log(`   After ${(i + 1) * 2}s: ${remaining}s remaining`);
    }
  }
  console.log();

  // 9. Cleanup
  console.log('9. Cleanup:');
  await cache.flush();
  console.log('   All entries flushed');
  console.log();

  console.log('=== Example Complete ===');
  console.log('\nTTL management tips:');
  console.log('  ✓ Use ttl() to check expiration before costly operations');
  console.log('  ✓ Use touch() to extend TTL for active sessions');
  console.log('  ✓ Use touch(Infinity) to make entries permanent');
  console.log('  ✓ Use prune() periodically to clean up expired entries');
  console.log('  ✓ Remember: TTL is in seconds, timestamps are in milliseconds');
})();
