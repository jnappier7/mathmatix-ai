// utils/cache.js — Lightweight in-memory cache for expensive DB queries
// For data that changes infrequently (skills, curriculum, enrollment codes)

class MemoryCache {
  constructor({ defaultTTL = 300 } = {}) {
    this.store = new Map();
    this.defaultTTL = defaultTTL * 1000; // Convert seconds to ms

    // Cleanup expired entries every 60s
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.cleanupInterval.unref(); // Don't prevent process exit
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    const ttl = (ttlSeconds || this.defaultTTL / 1000) * 1000;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Get-or-set: returns cached value, or calls fn() and caches the result.
   * @param {string} key - Cache key
   * @param {Function} fn - Async function to compute value if not cached
   * @param {number} [ttlSeconds] - TTL in seconds
   */
  async getOrSet(key, fn, ttlSeconds) {
    const cached = this.get(key);
    if (cached !== null) return cached;

    const value = await fn();
    this.set(key, value, ttlSeconds);
    return value;
  }

  invalidate(key) {
    this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   * @param {string} prefix - Key prefix to match
   */
  invalidatePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  get size() {
    return this.store.size;
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Shared singleton instances
const queryCache = new MemoryCache({ defaultTTL: 300 });   // 5 min for DB queries
const configCache = new MemoryCache({ defaultTTL: 3600 }); // 1 hr for config/skills

module.exports = { MemoryCache, queryCache, configCache };
