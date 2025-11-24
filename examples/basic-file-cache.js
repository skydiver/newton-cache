/**
 * Basic FileCache Example
 *
 * Demonstrates fundamental FileCache operations:
 * - Storing and retrieving values
 * - TTL (time-to-live) expiration
 * - Default values and factory functions
 * - Checking existence
 */

import { FileCache } from '../dist/index.js';

console.log('=== FileCache Basic Example ===\n');

// Create a new FileCache instance
const cache = new FileCache();

// 1. Store a value without TTL (persists until manually deleted)
console.log('1. Storing a value without TTL:');
cache.put('username', 'Alice');
console.log('   Stored: username = Alice');
console.log('   Retrieved:', cache.get('username'));
console.log();

// 2. Store a value with TTL (expires after 3 seconds)
console.log('2. Storing a value with 3-second TTL:');
cache.put('session-token', 'abc123xyz', 3);
console.log('   Stored: session-token = abc123xyz (expires in 3s)');
console.log('   Retrieved immediately:', cache.get('session-token'));
console.log();

// 3. Check if key exists
console.log('3. Checking existence:');
console.log('   cache.has("username"):', cache.has('username'));
console.log('   cache.has("missing-key"):', cache.has('missing-key'));
console.log();

// 4. Get with default value
console.log('4. Getting with default values:');
console.log('   cache.get("missing-key", "default-value"):', cache.get('missing-key', 'default-value'));
console.log();

// 5. Get with factory function (only called when key is missing)
console.log('5. Getting with factory function:');
let factoryCalled = false;
const result = cache.get('another-missing-key', () => {
  factoryCalled = true;
  return 'computed-value';
});
console.log('   Result:', result);
console.log('   Factory was called:', factoryCalled);
console.log();

// 6. Wait for TTL to expire
console.log('6. Waiting for TTL expiration (3 seconds)...');
await new Promise(resolve => setTimeout(resolve, 3100));
console.log('   After 3 seconds, session-token:', cache.get('session-token', 'EXPIRED'));
console.log();

// 7. Store permanently using forever()
console.log('7. Storing permanently:');
cache.forever('app-version', '1.0.0');
console.log('   Stored: app-version = 1.0.0 (no expiration)');
console.log();

// 8. Cleanup
console.log('8. Cleaning up:');
cache.forget('username');
cache.forget('app-version');
console.log('   Removed username and app-version');
console.log('   Remaining keys:', cache.keys());
console.log();

console.log('=== Example Complete ===');
