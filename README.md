# node-cache

Small, dependency-free in-memory cache with optional TTL for each entry. Ships as an ES module with TypeScript typings.

## Install

```bash
npm install node-cache
```

## Usage

```ts
import { MemoryCache } from "node-cache";

const cache = new MemoryCache<string, number>({ ttl: 5_000 }); // default TTL (ms)

cache.set("answer", 42);
cache.set("short", 1, 100); // override TTL for this entry

cache.get("answer"); // 42
cache.has("answer"); // true
cache.size(); // 2
cache.delete("short");
cache.clear();
```

## Scripts

- `npm run build` — compile TypeScript to `dist/`.
- `npm test` — build then run Node's built-in test runner against compiled output.
- `npm run clean` — remove build artifacts.

## Publishing notes

- Update `package.json` with the final package name and metadata.
- Run `npm install` to fetch dev dependencies, then `npm run build` to produce `dist/`.
- Tests live under `src/__tests__` and are omitted from the published package via `.npmignore`.
