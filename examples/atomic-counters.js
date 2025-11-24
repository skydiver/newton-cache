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

console.log('=== Atomic Counters Example ===\n');

const cache = new FileCache();

// 1. Basic increment
console.log('1. Basic increment operations:');
console.log('   Initial increment (starts at 0):', cache.increment('page-views'));
console.log('   Second increment:', cache.increment('page-views'));
console.log('   Third increment:', cache.increment('page-views'));
console.log('   Fourth increment:', cache.increment('page-views'));
console.log('   Current value:', cache.get('page-views'));
console.log();

// 2. Increment by custom amount
console.log('2. Increment by custom amount:');
cache.increment('score', 10);
console.log('   After +10:', cache.get('score'));
cache.increment('score', 25);
console.log('   After +25:', cache.get('score'));
cache.increment('score', 5);
console.log('   After +5:', cache.get('score'));
console.log('   Total score:', cache.get('score'));
console.log();

// 3. Basic decrement
console.log('3. Basic decrement operations:');
cache.put('credits', 100);
console.log('   Starting credits:', cache.get('credits'));
cache.decrement('credits');
console.log('   After -1:', cache.get('credits'));
cache.decrement('credits', 20);
console.log('   After -20:', cache.get('credits'));
cache.decrement('credits', 30);
console.log('   After -30:', cache.get('credits'));
console.log('   Remaining credits:', cache.get('credits'));
console.log();

// 4. Mixed operations
console.log('4. Mixed increment/decrement:');
cache.increment('balance', 100);
console.log('   After deposit +100:', cache.get('balance'));
cache.increment('balance', 50);
console.log('   After deposit +50:', cache.get('balance'));
cache.decrement('balance', 30);
console.log('   After withdrawal -30:', cache.get('balance'));
cache.decrement('balance', 20);
console.log('   After withdrawal -20:', cache.get('balance'));
console.log('   Final balance:', cache.get('balance'));
console.log();

// 5. Rate limiting example
console.log('5. Rate limiting simulation:');
function checkRateLimit(userId, limit = 5) {
  const key = `rate-limit:${userId}`;
  const requests = cache.get(key, 0);

  if (requests >= limit) {
    return { allowed: false, remaining: 0 };
  }

  const newCount = cache.increment(key);
  cache.touch(key, 60); // 60 second window

  return { allowed: true, remaining: limit - newCount };
}

console.log('   User makes 7 API requests (limit: 5):');
for (let i = 1; i <= 7; i++) {
  const result = checkRateLimit('user-123', 5);
  console.log(`   Request ${i}: ${result.allowed ? '✓ ALLOWED' : '✗ BLOCKED'} (${result.remaining} remaining)`);
}
console.log();

// 6. Download counter
console.log('6. Download tracking:');
const files = ['app.zip', 'data.csv', 'report.pdf'];
files.forEach(file => {
  const downloads = Math.floor(Math.random() * 20) + 1;
  for (let i = 0; i < downloads; i++) {
    cache.increment(`downloads:${file}`);
  }
});

console.log('   Download statistics:');
files.forEach(file => {
  const count = cache.get(`downloads:${file}`, 0);
  console.log(`     ${file}: ${count} downloads`);
});
console.log();

// 7. Preserving TTL during counter operations
console.log('7. TTL preservation during increments:');
cache.put('session-requests', 0, 30); // 30 second TTL
console.log('   Created counter with 30s TTL');
console.log('   Initial TTL:', cache.ttl('session-requests'), 'seconds');

await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

cache.increment('session-requests');
cache.increment('session-requests');
cache.increment('session-requests');
console.log('   After 2s and 3 increments:');
console.log('     Value:', cache.get('session-requests'));
console.log('     Remaining TTL:', cache.ttl('session-requests'), 'seconds (preserved!)');
console.log();

// 8. Leaderboard example
console.log('8. Game leaderboard:');
const players = [
  { name: 'Alice', points: 150 },
  { name: 'Bob', points: 200 },
  { name: 'Charlie', points: 75 },
  { name: 'Diana', points: 300 },
];

players.forEach(player => {
  cache.increment(`leaderboard:${player.name}`, player.points);
});

// Simulate more gameplay
cache.increment('leaderboard:Alice', 50);
cache.increment('leaderboard:Bob', 100);
cache.increment('leaderboard:Charlie', 225);

console.log('   Final scores:');
const scores = players.map(p => ({
  name: p.name,
  score: cache.get(`leaderboard:${p.name}`, 0)
})).sort((a, b) => b.score - a.score);

scores.forEach((player, index) => {
  console.log(`     ${index + 1}. ${player.name}: ${player.score} points`);
});
console.log();

// 9. Cleanup
console.log('9. Cleanup:');
cache.flush();
console.log('   All counters cleared');
console.log();

console.log('=== Example Complete ===');
console.log('\nAtomic counters are perfect for:');
console.log('  ✓ Page view tracking');
console.log('  ✓ Rate limiting');
console.log('  ✓ Credit systems');
console.log('  ✓ Download counters');
console.log('  ✓ Game leaderboards');
