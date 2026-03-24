// tests/unit/cache.test.js
const { MemoryCache } = require('../../utils/cache');

describe('MemoryCache', () => {
  let cache;

  beforeEach(() => {
    cache = new MemoryCache({ defaultTTL: 1 }); // 1 second TTL for tests
  });

  afterEach(() => {
    cache.destroy();
  });

  test('get returns null for missing keys', () => {
    expect(cache.get('missing')).toBeNull();
  });

  test('set and get work correctly', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  test('expired entries return null', async () => {
    cache.set('key', 'value', 0.05); // 50ms TTL
    expect(cache.get('key')).toBe('value');
    await new Promise(r => setTimeout(r, 60));
    expect(cache.get('key')).toBeNull();
  });

  test('getOrSet caches the result of fn()', async () => {
    let callCount = 0;
    const fn = async () => { callCount++; return 'computed'; };

    const first = await cache.getOrSet('key', fn);
    const second = await cache.getOrSet('key', fn);

    expect(first).toBe('computed');
    expect(second).toBe('computed');
    expect(callCount).toBe(1); // fn called only once
  });

  test('invalidate removes a key', () => {
    cache.set('key', 'value');
    cache.invalidate('key');
    expect(cache.get('key')).toBeNull();
  });

  test('invalidatePrefix removes matching keys', () => {
    cache.set('skills:all', 'a');
    cache.set('skills:active', 'b');
    cache.set('users:123', 'c');

    cache.invalidatePrefix('skills:');

    expect(cache.get('skills:all')).toBeNull();
    expect(cache.get('skills:active')).toBeNull();
    expect(cache.get('users:123')).toBe('c');
  });

  test('clear removes all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  test('size returns entry count', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });
});
