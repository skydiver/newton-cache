/**
 * @skydiver/node-cache - Lightweight cache library with pluggable adapters
 *
 * This module provides a simple cache interface with multiple adapter implementations.
 * Currently supports file-based caching with plans for Memory and Redis adapters.
 */

// Export adapter interface
export type { CacheAdapter } from "./adapters/base.js";

// Export type definitions
export type { CacheOptions, FileCacheOptions, CachePayload } from "./types.js";

// Export adapter implementations
export { FileCache } from "./adapters/file.js";

// Default export for convenience
export { FileCache as default } from "./adapters/file.js";
