# @skydiver/node-cache

Lightweight, dependency-free cache library with pluggable adapters. File-based storage with TTL support. Ships as an ES module with TypeScript typings.

## Install

```bash
npm install @skydiver/node-cache
```

## Usage

### Initializing

```ts
import { FileCache } from '@skydiver/node-cache';

// Stores files in the OS tmp directory by default.
const cache = new FileCache<string>();

// Or provide your own directory:
// const cache = new FileCache({ cachePath: "/var/tmp/my-cache" });
```

### Getting items from the cache

```ts
// If a file named "answer" exists in the cache directory, read it:
const value = cache.get('answer'); // parsed value, or undefined if missing

// Provide a default if the file doesn't exist or is unreadable:
const fallback = cache.get('missing-key', 'default');

// Or pass a factory/closure so the default is only computed when needed:
const fromFactory = cache.get('missing', () => expensiveLookup());

// You can also pass the function reference directly:
const directFactory = cache.get('missing', expensiveLookup);

// Inline anonymous factory
const twoLine = cache.get('computed', () => {
  const value = expensiveLookup();
  return value;
});
```

### Checking existence

```ts
// Returns true when the file exists and contains a defined value.
if (cache.has('answer')) {
  // ...
}
```

### Storing items

```ts
// Store with a 10-second TTL:
cache.put('key', 'value', 10);

// Store indefinitely (no TTL):
cache.put('key', 'value');

// Store permanently (alias for put without TTL):
cache.forever('key', 'value');
```

### Store only when missing

```ts
// Add only when missing; returns true if stored:
const added = cache.add('key', 'value', 10);
```

### Deleting items

```ts
// Remove and return whether it existed:
const removed = cache.forget('key');

// Clear all cached entries:
cache.flush();
```

### Special (compose read + write)

```ts
// Retrieve or compute and store for 60 seconds (TTL is in seconds):
const users = cache.remember('users', 60, () => fetchUsers());

// Store forever when missing:
const usersAlways = cache.rememberForever('users', () => fetchUsers());

// Retrieve and remove the cached value. Returns undefined when missing.
const pulled = cache.pull('answer');

// Provide a static default:
const staticDefault = cache.pull('missing', 'default');

// Provide a default (or factory) when missing:
const fallback = cache.pull('missing', () => expensiveLookup());
```

If the entry is missing or expired, the factory runs and the result is written to disk. Otherwise, the cached value is returned. `pull` removes the file after reading.

### Introspection

```ts
// Get all cache keys
const keys = cache.keys(); // ['user:1', 'user:2', 'session:abc']

// Count cached items
const count = cache.count(); // 3

// Get total cache size in bytes
const bytes = cache.size(); // 1024
console.log(`Cache size: ${(bytes / 1024).toFixed(2)} KB`);
```

### Cleanup

```ts
// Remove expired entries (keeps valid ones)
const removed = cache.prune();
console.log(`Removed ${removed} expired entries`);

// Clear everything (removes all entries)
cache.flush();
```

### TTL management

```ts
// Get remaining time-to-live in seconds
cache.put('session', data, 3600); // 1 hour
const ttl = cache.ttl('session'); // e.g., 3599

// Extend TTL of existing entry
cache.touch('session', 7200); // Extend to 2 hours from now

// Remove expiration
cache.touch('session', Number.POSITIVE_INFINITY);
```

### Atomic counters

```ts
// Increment counters
cache.increment('page-views');       // 1
cache.increment('page-views');       // 2
cache.increment('page-views', 10);   // 12

// Decrement counters
cache.put('credits', 100);
cache.decrement('credits');          // 99
cache.decrement('credits', 20);      // 79

// Use together
cache.increment('balance', 50);      // 50
cache.decrement('balance', 10);      // 40
```

## Real-world Examples

### Rate Limiting

```ts
const cache = new FileCache<number>();

function checkRateLimit(userId: string): boolean {
  const key = `rate-limit:${userId}`;
  const requests = cache.get(key, 0);

  if (requests >= 100) {
    return false; // Rate limit exceeded
  }

  cache.increment(key);
  cache.touch(key, 3600); // 1 hour window
  return true;
}
```

### API Response Caching

```ts
const cache = new FileCache<APIResponse>();

async function fetchUserProfile(userId: string) {
  return cache.remember(`user:${userId}`, 300, async () => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  });
}
```

### Session Storage

```ts
const sessions = new FileCache<SessionData>();

function createSession(userId: string, data: SessionData) {
  const sessionId = generateId();
  sessions.put(sessionId, data, 86400); // 24 hours
  return sessionId;
}

function extendSession(sessionId: string) {
  sessions.touch(sessionId, 86400); // Extend by 24 hours
}
```

### Feature Flags

```ts
const flags = new FileCache<boolean>();

function isFeatureEnabled(feature: string): boolean {
  return flags.remember(feature, 60, () => {
    // Fetch from remote config service
    return fetchFeatureFlag(feature);
  });
}
```

### Job Queue Deduplication

```ts
const jobs = new FileCache<string>();

function enqueueJob(jobId: string, payload: any) {
  const added = jobs.add(`job:${jobId}`, payload, 3600);
  if (!added) {
    console.log('Job already queued');
    return false;
  }
  return true;
}
```

## Performance Characteristics

### Read Performance
- **Cache hit**: ~0.5-2ms (includes file I/O, JSON parsing, TTL check)
- **Cache miss**: ~0.1-0.5ms (file existence check only)
- Long keys (>200 chars) have no performance penalty (hashed)

### Write Performance
- **Single write**: ~1-3ms (JSON serialization + file write)
- **Atomic counters**: ~2-4ms (read + increment + write)
- Batch operations can be simulated with `Promise.all()`

### Scalability
- **Sweet spot**: 1-10,000 entries
- **Memory footprint**: Minimal (only metadata in memory, values on disk)
- **Disk usage**: ~100-500 bytes per entry (depends on value size)

### Trade-offs
- **Slower than in-memory** caches (Redis, node-cache) but survives restarts
- **Faster than databases** for simple key-value operations
- **Thread-safe reads** but not atomic across processes (see limitations)
- **`has()` reads full file** to check expiration (accurate but slower)

## Limitations

### Thread Safety
⚠️ **Not thread-safe across multiple processes**
- Safe for single-process applications
- Not suitable for multi-process/cluster mode without external locking
- Race conditions possible with concurrent writes to the same key

```ts
// ❌ Unsafe in cluster mode
cluster.fork();
cache.increment('counter'); // Race condition!

// ✅ Safe in single process
cache.increment('counter');
```

### Filesystem Dependencies
- **Requires write access** to cache directory
- **Not suitable for serverless** with read-only filesystems (use `/tmp` with caution)
- **Disk I/O** adds latency compared to in-memory caches
- **No ACID guarantees** (writes are not transactional)

### Platform-Specific
- **File path limits**: Keys >200 chars are hashed (irreversible)
- **Case sensitivity**: Depends on filesystem (HFS+ vs ext4)
- **Permissions**: Ensure cache directory is writable

### Error Handling
- **Silent failures** by design (returns defaults instead of throwing)
- **No error callbacks** or logging hooks
- Corrupted cache files are silently removed during operations

### Not Suitable For
- ❌ High-frequency writes (>10K ops/sec)
- ❌ Large values (>1MB per entry)
- ❌ Distributed systems without coordination
- ❌ Critical data requiring persistence guarantees

### Best Suited For
- ✅ API response caching
- ✅ Session storage
- ✅ Rate limiting
- ✅ Feature flags
- ✅ Temporary computations
- ✅ Single-server applications

## How it works

- Files are stored under a cache directory (`<os tmp>/node-cache` by default).
- Keys are URL-encoded to form the filename (e.g., key `answer` -> `/tmp/node-cache/answer`).
- Very long keys (>200 chars) are SHA-256 hashed to prevent filesystem limits.
- Each file stores a JSON payload: `{ "value": <your data>, "expiresAt": <timestamp|undefined>, "key": "<original key>" }`.
- `get` reads and JSON-parses the file for the given key, returning `undefined` or a caller-provided default when missing, invalid, or expired (expired files are deleted).
- `has` returns true only when the file exists, parses, is not expired, and the stored `value` is defined.
- `remember` writes the payload with an `expiresAt` timestamp when given a TTL (seconds). `rememberForever` omits `expiresAt`.
- `prune()` removes only expired entries, while `flush()` removes everything.
- Counters (`increment`/`decrement`) are atomic within a single process and preserve existing TTL.

## Scripts

- `npm run build` — compile TypeScript to `dist/`.
- `npm test` — build then run Node's built-in test runner against compiled output.
- `npm run clean` — remove build artifacts.

## License

MIT
