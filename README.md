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

### How it works

- Files are stored under a cache directory (`<os tmp>/node-cache` by default).
- Keys are URL-encoded to form the filename (e.g., key `answer` -> `/tmp/node-cache/answer`).
- Each file stores a JSON payload: `{ "value": <your data>, "expiresAt": <timestamp|undefined> }`.
- `get` reads and JSON-parses the file for the given key, returning `undefined` or a caller-provided default when missing, invalid, or expired (expired files are deleted).
- `has` returns true only when the file exists, parses, is not expired, and the stored `value` is defined.
- `remember` writes the payload with an `expiresAt` timestamp when given a TTL (seconds). `rememberForever` omits `expiresAt`. If you pass complex objects, they're serialized with `JSON.stringify`; the timestamp sits alongside your data.

## Scripts

- `npm run build` — compile TypeScript to `dist/`.
- `npm test` — build then run Node's built-in test runner against compiled output.
- `npm run clean` — remove build artifacts.

## License

MIT
