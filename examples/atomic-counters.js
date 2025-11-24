/**
 * Atomic Counters Example
 *
 * Demonstrates atomic increment/decrement operations:
 * - increment() - Atomically increase counter
 * - decrement() - Atomically decrease counter
 * - Preserves TTL on counter operations
 * - Common use cases: page views, rate limiting, credits
 */

import { FileCache } from '../dist/index.js';

(async () => {
  console.log('=== Atomic Counters Example ===\n');

  const cache = new FileCache();

  // 1. Basic increment
  console.log('1. Basic increment operations:');
  console.log('   Initial increment (starts at 0):', await cache.increment('page-views'));
  console.log('   Second increment:', await cache.increment('page-views'));
  console.log('   Third increment:', await cache.increment('page-views'));
  console.log('   Fourth increment:', await cache.increment('page-views'));
  console.log('   Current value:', await cache.get('page-views'));
  console.log();

  // 2. Increment by custom amount
  console.log('2. Increment by custom amount:');
  await cache.increment('score', 10);
  console.log('   After +10:', await cache.get('score'));
  await cache.increment('score', 25);
  console.log('   After +25:', await cache.get('score'));
  await cache.increment('score', 5);
  console.log('   After +5:', await cache.get('score'));
  console.log('   Total score:', await cache.get('score'));
  console.log();

  // 3. Basic decrement
  console.log('3. Basic decrement operations:');
  await cache.put('credits', 100);
  console.log('   Starting credits:', await cache.get('credits'));
  await cache.decrement('credits');
  console.log('   After -1:', await cache.get('credits'));
  await cache.decrement('credits', 20);
  console.log('   After -20:', await cache.get('credits'));
  await cache.decrement('credits', 30);
  console.log('   After -30:', await cache.get('credits'));
  console.log('   Remaining credits:', await cache.get('credits'));
  console.log();

  // 4. Mixed operations
  console.log('4. Mixed increment/decrement:');
  await cache.increment('balance', 100);
  console.log('   After deposit +100:', await cache.get('balance'));
  await cache.increment('balance', 50);
  console.log('   After deposit +50:', await cache.get('balance'));
  await cache.decrement('balance', 30);
  console.log('   After withdrawal -30:', await cache.get('balance'));
  await cache.decrement('balance', 20);
  console.log('   After withdrawal -20:', await cache.get('balance'));
  console.log('   Final balance:', await cache.get('balance'));
  console.log();

  // 5. Rate limiting example
  console.log('5. Rate limiting simulation:');
  async function checkRateLimit(userId, limit = 5) {
    const key = `rate-limit:${userId}`;
    const requests = await cache.get(key, 0);

    if (requests >= limit) {
      return { allowed: false, remaining: 0 };
    }

    const newCount = await cache.increment(key);
    await cache.touch(key, 60); // 60 second window

    return { allowed: true, remaining: limit - newCount };
  }

  console.log('   User makes 7 API requests (limit: 5):');
  for (let i = 1; i <= 7; i++) {
    const result = await checkRateLimit('user-123', 5);
    console.log(`   Request ${i}: ${result.allowed ? '✓ ALLOWED' : '✗ BLOCKED'} (${result.remaining} remaining)`);
  }
  console.log();

  // 6. Download counter
  console.log('6. Download tracking:');
  const files = ['app.zip', 'data.csv', 'report.pdf'];
  for (const file of files) {
    const downloads = Math.floor(Math.random() * 20) + 1;
    for (let i = 0; i < downloads; i++) {
      await cache.increment(`downloads:${file}`);
    }
  }

  console.log('   Download statistics:');
  for (const file of files) {
    const count = await cache.get(`downloads:${file}`, 0);
    console.log(`     ${file}: ${count} downloads`);
  }
  console.log();

  // 7. Preserving TTL during counter operations
  console.log('7. TTL preservation during increments:');
  await cache.put('session-requests', 0, 30); // 30 second TTL
  console.log('   Created counter with 30s TTL');
  console.log('   Initial TTL:', await cache.ttl('session-requests'), 'seconds');

  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  await cache.increment('session-requests');
  await cache.increment('session-requests');
  await cache.increment('session-requests');
  console.log('   After 2s and 3 increments:');
  console.log('     Value:', await cache.get('session-requests'));
  console.log('     Remaining TTL:', await cache.ttl('session-requests'), 'seconds (preserved!)');
  console.log();

  // 8. Leaderboard example
  console.log('8. Game leaderboard:');
  const players = [
    { name: 'Alice', points: 150 },
    { name: 'Bob', points: 200 },
    { name: 'Charlie', points: 75 },
    { name: 'Diana', points: 300 },
  ];

  for (const player of players) {
    await cache.increment(`leaderboard:${player.name}`, player.points);
  }

  // Simulate more gameplay
  await cache.increment('leaderboard:Alice', 50);
  await cache.increment('leaderboard:Bob', 100);
  await cache.increment('leaderboard:Charlie', 225);

  console.log('   Final scores:');
  const scores = [];
  for (const p of players) {
    scores.push({
      name: p.name,
      score: await cache.get(`leaderboard:${p.name}`, 0)
    });
  }
  scores.sort((a, b) => b.score - a.score);

  scores.forEach((player, index) => {
    console.log(`     ${index + 1}. ${player.name}: ${player.score} points`);
  });
  console.log();

  // 9. Cleanup
  console.log('9. Cleanup:');
  await cache.flush();
  console.log('   All counters cleared');
  console.log();

  console.log('=== Example Complete ===');
  console.log('\nAtomic counters are perfect for:');
  console.log('  ✓ Page view tracking');
  console.log('  ✓ Rate limiting');
  console.log('  ✓ Credit systems');
  console.log('  ✓ Download counters');
  console.log('  ✓ Game leaderboards');
})();
