/**
 * Auto-Prune Scheduler Example
 *
 * Demonstrates running prune() automatically on a background timer:
 * - startAutoPrune(seconds) periodically removes expired entries
 * - The timer is unref'd, so it never keeps the process alive on its own
 * - stopAutoPrune() cancels it (call on shutdown)
 */

import { MemoryCache } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('=== Auto-Prune Scheduler Example ===\n');

  const cache = new MemoryCache();

  // 1. Store entries with a short TTL
  console.log('1. Storing 3 entries with a 1-second TTL:');
  await cache.put('a', 1, 1);
  await cache.put('b', 2, 1);
  await cache.put('c', 3, 1);
  console.log('   count():', await cache.count());
  console.log();

  // 2. Start pruning every second
  console.log('2. Starting auto-prune (every 1 second)...');
  cache.startAutoPrune(1);
  console.log();

  // 3. Wait past the TTL + a prune tick — expired entries are swept away
  console.log('3. Waiting ~2.5s for entries to expire and be pruned...');
  await sleep(2500);
  console.log('   count() after auto-prune:', await cache.count(), '(expired entries removed)');
  console.log();

  // 4. Stop the scheduler (important on shutdown / before reuse)
  console.log('4. Stopping auto-prune:');
  cache.stopAutoPrune();
  console.log('   Timer cancelled. Safe to call even if not running.');
  console.log();

  // Notes on behavior
  console.log('Behavior notes:');
  console.log('   - startAutoPrune is idempotent: calling again replaces the timer');
  console.log('   - throws RangeError if the interval is not a positive finite number');
  console.log('   - the timer is unref\'d, so it will not block process exit');
  console.log();

  await cache.flush();
  console.log('=== Example Complete ===');
})();
