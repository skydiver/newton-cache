/**
 * Remember Pattern Example
 *
 * Demonstrates the "remember" pattern for caching:
 * - remember() - Get from cache or compute and store with TTL
 * - rememberForever() - Get from cache or compute and store permanently
 * - Lazy evaluation (factory only called when needed)
 * - Common pattern for API responses, database queries, expensive computations
 */

import { FileCache } from '../dist/index.js';

console.log('=== Remember Pattern Example ===\n');

const cache = new FileCache();

// Simulate expensive operations
let apiCallCount = 0;
let dbQueryCount = 0;
let computationCount = 0;

// 1. Basic remember pattern
console.log('1. Basic remember pattern:');

function fetchUserFromAPI(userId) {
  apiCallCount++;
  console.log(`   [API CALL #${apiCallCount}] Fetching user ${userId}...`);
  return { id: userId, name: `User ${userId}`, email: `user${userId}@example.com` };
}

// First call - cache miss, factory runs
const user1 = cache.remember('user:123', 10, () => fetchUserFromAPI(123));
console.log('   First call result:', user1);

// Second call - cache hit, factory NOT run
const user2 = cache.remember('user:123', 10, () => fetchUserFromAPI(123));
console.log('   Second call result:', user2);
console.log('   Total API calls:', apiCallCount);
console.log();

// 2. Expensive database query
console.log('2. Caching database query:');

function queryDatabase(query) {
  dbQueryCount++;
  console.log(`   [DB QUERY #${dbQueryCount}] Executing: ${query}`);
  // Simulate slow query
  return [
    { id: 1, product: 'Widget', price: 19.99 },
    { id: 2, product: 'Gadget', price: 29.99 },
    { id: 3, product: 'Doohickey', price: 39.99 },
  ];
}

console.log('   Calling getProducts() three times:');
function getProducts() {
  return cache.remember('products:all', 60, () =>
    queryDatabase('SELECT * FROM products')
  );
}

getProducts(); // Cache miss - DB query runs
getProducts(); // Cache hit - no DB query
getProducts(); // Cache hit - no DB query

console.log('   Total DB queries:', dbQueryCount, '(should be 1)');
console.log();

// 3. Remember forever
console.log('3. Remember forever pattern:');

function loadAppConfig() {
  computationCount++;
  console.log(`   [COMPUTATION #${computationCount}] Loading configuration...`);
  return {
    appName: 'Newton Cache Demo',
    version: '1.0.0',
    features: ['caching', 'ttl', 'persistence']
  };
}

const config1 = cache.rememberForever('app-config', loadAppConfig);
console.log('   First call:', config1);

const config2 = cache.rememberForever('app-config', loadAppConfig);
console.log('   Second call:', config2);

console.log('   Total computations:', computationCount, '(should be 1)');
console.log('   TTL:', cache.ttl('app-config'), '(null = permanent)');
console.log();

// 4. API response caching with real-world pattern
console.log('4. Real-world API caching pattern:');

class UserService {
  constructor(cache) {
    this.cache = cache;
    this.apiCalls = 0;
  }

  async getUserProfile(userId) {
    return this.cache.remember(`user-profile:${userId}`, 300, () => {
      this.apiCalls++;
      console.log(`   [API] Fetching profile for user ${userId} (call #${this.apiCalls})`);
      // Simulate API call
      return {
        id: userId,
        name: `User ${userId}`,
        bio: 'Software developer',
        followers: Math.floor(Math.random() * 1000)
      };
    });
  }

  async getUserPosts(userId) {
    return this.cache.remember(`user-posts:${userId}`, 180, () => {
      this.apiCalls++;
      console.log(`   [API] Fetching posts for user ${userId} (call #${this.apiCalls})`);
      // Simulate API call
      return [
        { id: 1, title: 'First Post', likes: 42 },
        { id: 2, title: 'Second Post', likes: 108 },
      ];
    });
  }
}

const userService = new UserService(cache);

// Multiple calls to same endpoints
await userService.getUserProfile(456);
await userService.getUserProfile(456); // Cached
await userService.getUserPosts(456);
await userService.getUserPosts(456); // Cached
await userService.getUserProfile(789);

console.log('   Total API calls:', userService.apiCalls, '(should be 3, not 5)');
console.log();

// 5. Cache warming
console.log('5. Cache warming on startup:');

function warmCache() {
  const criticalData = [
    { key: 'homepage-content', factory: () => ({ title: 'Welcome', content: '...' }) },
    { key: 'nav-menu', factory: () => ['Home', 'About', 'Contact'] },
    { key: 'featured-products', factory: () => [1, 2, 3, 4, 5] },
  ];

  console.log('   Warming cache with critical data...');
  criticalData.forEach(({ key, factory }) => {
    cache.rememberForever(key, () => {
      console.log(`     Loading ${key}...`);
      return factory();
    });
  });
  console.log('   Cache warming complete!');
}

warmCache();
console.log('   Cached keys:', cache.keys().filter(k =>
  ['homepage-content', 'nav-menu', 'featured-products'].includes(k)
));
console.log();

// 6. Conditional caching
console.log('6. Conditional caching based on data:');

function getWeatherData(city) {
  const data = { city, temp: 72, condition: 'Sunny' };
  const cacheKey = `weather:${city}`;

  // Only cache if conditions are favorable
  if (data.condition !== 'Error') {
    return cache.remember(cacheKey, 1800, () => {
      console.log(`   Fetching weather for ${city}...`);
      return data;
    });
  }
  return data; // Don't cache errors
}

getWeatherData('San Francisco');
getWeatherData('San Francisco'); // Cached
console.log('   Weather data cached successfully');
console.log();

// 7. Factory with parameters
console.log('7. Remember pattern with factory parameters:');

function getFilteredProducts(category, minPrice) {
  const cacheKey = `products:${category}:${minPrice}`;

  return cache.remember(cacheKey, 120, () => {
    console.log(`   Filtering products: category=${category}, minPrice=${minPrice}`);
    return [
      { name: 'Premium Widget', category, price: minPrice + 10 },
      { name: 'Deluxe Gadget', category, price: minPrice + 20 },
    ];
  });
}

getFilteredProducts('electronics', 50);
getFilteredProducts('electronics', 50); // Cached
getFilteredProducts('electronics', 100); // Different key, not cached
console.log();

// 8. Cleanup
console.log('8. Cache statistics before cleanup:');
console.log('   Total entries:', cache.count());
console.log('   All keys:', cache.keys().length, 'keys');

cache.flush();
console.log('   After flush:', cache.count(), 'entries');
console.log();

console.log('=== Example Complete ===');
console.log('\nRemember pattern benefits:');
console.log('  ✓ Reduces API calls and database queries');
console.log('  ✓ Factory only runs when cache misses');
console.log('  ✓ Clean, readable code pattern');
console.log('  ✓ Automatic cache invalidation via TTL');
console.log('  ✓ Perfect for expensive operations');
