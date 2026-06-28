/**
 * Cache Stampede Protection Example
 *
 * Demonstrates how remember()/rememberForever() deduplicate concurrent misses:
 * - Many simultaneous callers for a missing key trigger the factory only ONCE
 * - All callers await and receive the same result
 * - A factory rejection clears the in-flight entry so the next call retries
 *
 * Dedup is per cache instance / per process — it fully protects MemoryCache and
 * serializes work within a single process for the file adapters.
 */

import { MemoryCache } from '../dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log('=== Cache Stampede Protection Example ===\n');

  const cache = new MemoryCache();

  // 1. A slow, expensive factory that counts how often it runs
  let factoryCalls = 0;
  const expensiveFetch = async () => {
    factoryCalls++;
    await sleep(100); // simulate a slow upstream call
    return { data: 'computed', at: factoryCalls };
  };

  // 2. Fire 10 concurrent remember() calls for the SAME missing key
  console.log('1. Firing 10 concurrent remember("report") calls...');
  const results = await Promise.all(
    Array.from({ length: 10 }, () => cache.remember('report', 60, expensiveFetch))
  );

  console.log('   Factory was called:', factoryCalls, 'time(s)');
  console.log('   All callers got the same object:', results.every((r) => r === results[0]));
  console.log('   Result:', results[0]);
  console.log();

  // 3. The value is now cached — subsequent reads never call the factory
  console.log('2. Subsequent get() is served from cache:');
  console.log('   get("report"):', await cache.get('report'));
  console.log('   Factory calls still:', factoryCalls);
  console.log();

  // 4. Failures are NOT cached — the in-flight entry is cleared on rejection
  console.log('3. Factory rejection clears the in-flight entry (no poisoning):');
  let attempts = 0;
  const flaky = async () => {
    attempts++;
    await sleep(20);
    if (attempts === 1) throw new Error('upstream down');
    return 'recovered';
  };

  await Promise.allSettled([
    cache.remember('flaky', 60, flaky),
    cache.remember('flaky', 60, flaky),
  ]).then((settled) => {
    console.log('   First batch outcomes:', settled.map((s) => s.status));
  });

  const recovered = await cache.remember('flaky', 60, flaky);
  console.log('   Retry after failure succeeds:', recovered);
  console.log();

  await cache.flush();
  console.log('=== Example Complete ===');
  console.log('\nNote: without dedup, 10 concurrent misses would trigger 10 factory');
  console.log('      calls — a classic cache stampede / thundering herd.');
})();
