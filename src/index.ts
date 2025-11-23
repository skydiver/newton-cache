/**
 * @skydiver/node-cache - Lightweight cache library with pluggable adapters
 *
 * Zero dependencies, TTL support, TypeScript-first.
 * All adapters implement the CacheAdapter interface for consistent API.
 */

// Export adapter interface
export type { CacheAdapter } from "./adapters/base.js";

// Export type definitions
export type { CacheOptions, FileCacheOptions, MemoryCacheOptions, CachePayload } from "./types.js";

// Export adapter implementations
export { FileCache } from "./adapters/file.js";
export { MemoryCache } from "./adapters/memory.js";

// Default export for convenience
export { FileCache as default } from "./adapters/file.js";
