# newton-cache Examples

This directory contains practical, runnable examples demonstrating newton-cache functionality.

## Running the Examples

First, ensure the package is built:

```bash
npm run build
```

Then run any example:

```bash
node examples/basic-file-cache.js
node examples/basic-memory-cache.js
node examples/flat-file-cache.js
node examples/batch-operations.js
node examples/atomic-counters.js
node examples/ttl-management.js
node examples/remember-pattern.js
```

## Available Examples

### 1. basic-file-cache.js
Demonstrates fundamental FileCache operations:
- Storing and retrieving values
- TTL (time-to-live) expiration
- Default values and factory functions
- Checking existence

### 2. basic-memory-cache.js
Shows MemoryCache for fast in-memory storage:
- No disk I/O (fastest performance)
- Same API as FileCache
- Performance comparison with 10,000 operations

### 3. flat-file-cache.js
Demonstrates FlatFileCache with single JSON file:
- All entries in one file (easy backup/restore)
- Inspecting cache file contents
- Persistence across restarts
- Best for small-to-medium caches

### 4. batch-operations.js
Efficient multi-key operations:
- `putMany()` - Store multiple key-value pairs at once
- `getMany()` - Retrieve multiple values
- `forgetMany()` - Remove multiple keys
- Bulk cache warming and invalidation

### 5. atomic-counters.js
Atomic increment/decrement operations:
- Page view tracking
- Rate limiting implementation
- Credit systems
- Download counters
- Game leaderboards

### 6. ttl-management.js
Time-to-live management:
- Setting TTL when storing values
- Checking remaining TTL with `ttl()`
- Extending TTL with `touch()`
- Removing expiration
- Automatic cleanup with `prune()`

### 7. remember-pattern.js
The "remember" pattern for intelligent caching:
- `remember()` - Get from cache or compute and store
- `rememberForever()` - Permanent caching
- API response caching
- Database query caching
- Cache warming strategies

## Notes

- All examples use ES module syntax (`import`/`export`)
- Examples import from `../dist/index.js` (the built output)
- Some examples include `await` for demonstration (showing TTL expiration)
- Examples automatically clean up after themselves with `flush()`
- Cache files are stored in the OS temp directory by default
