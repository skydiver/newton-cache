/**
 * FlatFileCache Example
 *
 * Demonstrates FlatFileCache - single JSON file storage:
 * - All entries in one file (easy backup/restore)
 * - Best for <1000 keys
 * - Persistent across restarts
 * - Easy to inspect (just read the JSON file)
 */

import { FlatFileCache } from '../dist/index.js';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

console.log('=== FlatFileCache Example ===\n');

// Create a custom cache file path for this example
const cacheFilePath = path.join(tmpdir(), 'example-cache.json');

// Clean up any existing cache file
if (fs.existsSync(cacheFilePath)) {
  fs.unlinkSync(cacheFilePath);
}

// Create a new FlatFileCache instance with custom path
const cache = new FlatFileCache({ filePath: cacheFilePath });

console.log('Using cache file:', cacheFilePath);
console.log();

// 1. Store multiple entries
console.log('1. Storing multiple configuration values:');
cache.put('app.name', 'Newton Cache Demo');
cache.put('app.version', '1.0.0');
cache.put('app.debug', true);
cache.put('api.endpoint', 'https://api.example.com');
cache.put('api.timeout', 5000);
console.log('   Stored 5 configuration entries');
console.log();

// 2. Show the actual file contents
console.log('2. Actual cache file contents:');
const fileContent = fs.readFileSync(cacheFilePath, 'utf8');
console.log(fileContent);
console.log();

// 3. Retrieve values
console.log('3. Retrieving configuration:');
console.log('   app.name:', cache.get('app.name'));
console.log('   app.debug:', cache.get('app.debug'));
console.log('   api.timeout:', cache.get('api.timeout'));
console.log();

// 4. Store with TTL
console.log('4. Storing temporary session data:');
cache.put('session:user123', {
  userId: 123,
  loginTime: new Date().toISOString(),
  permissions: ['read', 'write']
}, 10); // 10 seconds TTL
console.log('   Stored session data (expires in 10s)');
console.log('   Session data:', cache.get('session:user123'));
console.log();

// 5. Introspection
console.log('5. Cache statistics:');
console.log('   Total entries:', cache.count());
console.log('   All keys:', cache.keys());
console.log('   File size:', cache.size(), 'bytes');
console.log();

// 6. Simulating restart (create new instance)
console.log('6. Simulating process restart:');
console.log('   Creating new cache instance pointing to same file...');
const cache2 = new FlatFileCache({ filePath: cacheFilePath });
console.log('   Data persisted! app.name:', cache2.get('app.name'));
console.log('   Session still exists:', cache2.has('session:user123'));
console.log();

// 7. Easy backup
console.log('7. Easy backup demonstration:');
const backupPath = path.join(tmpdir(), 'example-cache-backup.json');
fs.copyFileSync(cacheFilePath, backupPath);
console.log('   Backed up to:', backupPath);
console.log('   Single file copy = complete backup!');
console.log();

// 8. Cleanup
console.log('8. Cleanup:');
cache.flush();
fs.unlinkSync(backupPath);
console.log('   Cache flushed and backup removed');
console.log();

console.log('=== Example Complete ===');
console.log('\nFlatFileCache advantages:');
console.log('  ✓ Single file for all entries (easy backup)');
console.log('  ✓ Human-readable JSON format');
console.log('  ✓ Minimal inode usage');
console.log('  ✓ Persists across restarts');
console.log('\nBest for: Small-to-medium caches (<1000 keys)');
