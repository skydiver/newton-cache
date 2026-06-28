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
node examples/lru-eviction.js
node examples/stampede-protection.js
node examples/auto-prune.js
node examples/namespacing.js
```

## Available Examples

### 1. [basic-file-cache.js](basic-file-cache.js)

Demonstrates fundamental FileCache operations:

- Storing and retrieving values
- TTL (time-to-live) expiration
- Default values and factory functions
- Checking existence

### 2. [basic-memory-cache.js](basic-memory-cache.js)

Shows MemoryCache for fast in-memory storage:

- No disk I/O (fastest performance)
- Same API as FileCache
- Performance comparison with 10,000 operations

### 3. [flat-file-cache.js](flat-file-cache.js)

Demonstrates FlatFileCache with single JSON file:

- All entries in one file (easy backup/restore)
- Inspecting cache file contents
- Persistence across restarts
- Best for small-to-medium caches

### 4. [batch-operations.js](batch-operations.js)

Efficient multi-key operations:

- `putMany()` - Store multiple key-value pairs at once
- `getMany()` - Retrieve multiple values
- `forgetMany()` - Remove multiple keys
- Bulk cache warming and invalidation

### 5. [atomic-counters.js](atomic-counters.js)

Atomic increment/decrement operations:

- Page view tracking
- Rate limiting implementation
- Credit systems
- Download counters
- Game leaderboards

### 6. [ttl-management.js](ttl-management.js)

Time-to-live management:

- Setting TTL when storing values
- Checking remaining TTL with `ttl()`
- Extending TTL with `touch()`
- Removing expiration
- Automatic cleanup with `prune()`

### 7. [remember-pattern.js](remember-pattern.js)

The "remember" pattern for intelligent caching:

- `remember()` - Get from cache or compute and store
- `rememberForever()` - Permanent caching
- API response caching
- Database query caching
- Cache warming strategies

### 8. [lru-eviction.js](lru-eviction.js)

Bounding MemoryCache memory usage with `maxEntries`:

- Least-recently-used eviction once the cache is full
- Reads and writes count as "use" (hot keys stay resident)
- O(1) eviction; `count()` never exceeds `maxEntries`

### 9. [stampede-protection.js](stampede-protection.js)

Concurrent-miss deduplication in `remember()`:

- Many simultaneous callers trigger the factory only once
- All callers await and receive the same result
- Factory failures aren't cached — the next call retries

### 10. [auto-prune.js](auto-prune.js)

Background expired-entry cleanup:

- `startAutoPrune(seconds)` runs `prune()` on a timer
- `unref`'d timer (won't block process exit), idempotent restart
- `stopAutoPrune()` cancels it on shutdown

### 11. [namespacing.js](namespacing.js)

Scoped cache views via `namespace(prefix)`:

- Transparent key prefixing over a shared backing store
- Isolation between namespaces (no key collisions)
- Scoped `flush()` for group invalidation; nesting (`a:b:key`)

## Notes

- All examples use ES module syntax (`import`/`export`)
- Examples import from `../dist/index.js` (the built output)
- Some examples include `await` for demonstration (showing TTL expiration)
- Examples automatically clean up after themselves with `flush()`
- Cache files are stored in the OS temp directory by default
