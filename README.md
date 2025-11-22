# node-cache

Small, dependency-free file-based cache that stores entries as plain text files under a tmp directory. Ships as an ES module with TypeScript typings.

## Install

```bash
npm install node-cache
```

## Usage

### Initializing

```ts
import { FileCache } from "node-cache";

// Stores files in the OS tmp directory by default.
const cache = new FileCache<string>();

// Or provide your own directory:
// const cache = new FileCache({ cachePath: "/var/tmp/my-cache" });
```

### Getting items from the cache

```ts
// If a file named "answer" exists in the cache directory, read it:
const value = cache.get("answer"); // parsed value, or null if missing

// Provide a default if the file doesn't exist or is unreadable:
const fallback = cache.get("missing-key", "default");

// Or pass a factory/closure so the default is only computed when needed:
const fromFactory = cache.get("missing", () => expensiveLookup());

// You can also pass the function reference directly:
const directFactory = cache.get("missing", expensiveLookup);

// Inline anonymous factory
const twoLine = cache.get("computed", () => {
  const value = expensiveLookup();
  return value;
});
```

### How it works

- Files are stored under a cache directory (`<os tmp>/node-cache` by default).
- Keys are URL-encoded to form the filename (e.g., key `answer` -> `/tmp/node-cache/answer`).
- `get` reads and JSON-parses the file for the given key, returning `null` or a caller-provided default when missing or invalid.

## Scripts

- `npm run build` — compile TypeScript to `dist/`.
- `npm test` — build then run Node's built-in test runner against compiled output.
- `npm run clean` — remove build artifacts.

## Publishing notes

- Update `package.json` with the final package name and metadata.
- Run `npm install` to fetch dev dependencies, then `npm run build` to produce `dist/`.
- Tests live under `src/__tests__` and are omitted from the published package via `.npmignore`.
