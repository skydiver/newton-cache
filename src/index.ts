/**
 * newton-cache - Lightweight cache library with pluggable adapters
 *
 * Zero dependencies, TTL support, TypeScript-first.
 * All adapters implement the CacheAdapter interface for consistent API.
 */

// Export adapter interface
export type { CacheAdapter } from './adapters/base.js';
// Export adapter implementations
// Default export for convenience
export { FileCache, FileCache as default } from './adapters/file.js';
export { FlatFileCache } from './adapters/flat-file.js';
export { MemoryCache } from './adapters/memory.js';
// Export type definitions
export type {
  CachePayload,
  FileCacheOptions,
  FlatFileCacheOptions,
  MemoryCacheOptions,
} from './types.js';
