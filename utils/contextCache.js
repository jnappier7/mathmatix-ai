/**
 * Context Cache - Redis with in-memory fallback
 *
 * Reduces database queries by caching:
 * - User profiles (curriculum, teacher settings)
 * - Recent conversations
 * - Curriculum data
 *
 * Uses Redis when available, falls back to Map-based LRU cache
 *
 * @module contextCache
 */

// Cache configuration
const CACHE_CONFIG = {
    user: { ttl: 60, maxSize: 500 },           // User data: 1 min TTL
    curriculum: { ttl: 300, maxSize: 100 },    // Curriculum: 5 min TTL
    teacherSettings: { ttl: 300, maxSize: 100 }, // Teacher AI settings: 5 min TTL
    conversation: { ttl: 30, maxSize: 200 }    // Conversation: 30 sec TTL
};

// Redis client (lazy initialized)
let redisClient = null;
let useRedis = false;

// In-memory fallback stores
const memoryCaches = {
    user: new Map(),
    curriculum: new Map(),
    teacherSettings: new Map(),
    conversation: new Map()
};

const memoryTimestamps = {
    user: new Map(),
    curriculum: new Map(),
    teacherSettings: new Map(),
    conversation: new Map()
};

/**
 * Initialize Redis connection if available
 */
async function initRedis() {
    if (redisClient !== null) return useRedis;

    const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
    if (!redisUrl) {
        console.log('[ContextCache] No REDIS_URL configured, using in-memory cache');
        redisClient = false; // Mark as attempted
        return false;
    }

    try {
        // Dynamic import to avoid errors if ioredis not installed
        const Redis = require('ioredis');
        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            lazyConnect: true
        });

        await redisClient.connect();
        useRedis = true;
        console.log('✅ [ContextCache] Redis connected successfully');

        redisClient.on('error', (err) => {
            console.error('[ContextCache] Redis error:', err.message);
            useRedis = false;
        });

        redisClient.on('reconnecting', () => {
            console.log('[ContextCache] Redis reconnecting...');
        });

        return true;
    } catch (error) {
        console.log(`[ContextCache] Redis not available (${error.message}), using in-memory cache`);
        redisClient = false;
        useRedis = false;
        return false;
    }
}

// Try to init Redis on module load
initRedis().catch(() => {});

/**
 * Build Redis key with namespace
 */
function buildKey(type, key) {
    return `mathmatix:cache:${type}:${key}`;
}

/**
 * Get item from cache (Redis or memory)
 * @param {string} type - Cache type
 * @param {string} key - Cache key
 * @returns {Promise<*>} Cached value or null
 */
async function get(type, key) {
    if (useRedis && redisClient) {
        try {
            const redisKey = buildKey(type, key);
            const value = await redisClient.get(redisKey);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('[ContextCache] Redis get error:', error.message);
            // Fall through to memory cache
        }
    }

    // Memory fallback
    if (!memoryCaches[type] || !memoryTimestamps[type]) {
        return null;
    }

    const timestamp = memoryTimestamps[type].get(key);
    if (!timestamp) {
        return null;
    }

    const ttlMs = (CACHE_CONFIG[type]?.ttl || 60) * 1000;
    const isExpired = Date.now() - timestamp > ttlMs;

    if (isExpired) {
        memoryCaches[type].delete(key);
        memoryTimestamps[type].delete(key);
        return null;
    }

    return memoryCaches[type].get(key) || null;
}

/**
 * Set item in cache (Redis or memory)
 * @param {string} type - Cache type
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 */
async function set(type, key, value) {
    const ttl = CACHE_CONFIG[type]?.ttl || 60;

    if (useRedis && redisClient) {
        try {
            const redisKey = buildKey(type, key);
            await redisClient.setex(redisKey, ttl, JSON.stringify(value));
            return;
        } catch (error) {
            console.error('[ContextCache] Redis set error:', error.message);
            // Fall through to memory cache
        }
    }

    // Memory fallback
    if (!memoryCaches[type] || !memoryTimestamps[type]) {
        return;
    }

    const config = CACHE_CONFIG[type] || { maxSize: 100 };

    // Enforce max size (simple LRU)
    if (memoryCaches[type].size >= config.maxSize) {
        const oldestKey = memoryCaches[type].keys().next().value;
        memoryCaches[type].delete(oldestKey);
        memoryTimestamps[type].delete(oldestKey);
    }

    memoryCaches[type].set(key, value);
    memoryTimestamps[type].set(key, Date.now());
}

/**
 * Invalidate specific cache entry
 * @param {string} type - Cache type
 * @param {string} key - Cache key to invalidate
 */
async function invalidate(type, key) {
    if (useRedis && redisClient) {
        try {
            await redisClient.del(buildKey(type, key));
        } catch (error) {
            console.error('[ContextCache] Redis invalidate error:', error.message);
        }
    }

    // Also clear from memory
    if (memoryCaches[type]) {
        memoryCaches[type].delete(key);
    }
    if (memoryTimestamps[type]) {
        memoryTimestamps[type].delete(key);
    }
}

/**
 * Clear entire cache type
 * @param {string} type - Cache type to clear
 */
async function clearType(type) {
    if (useRedis && redisClient) {
        try {
            const pattern = buildKey(type, '*');
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(...keys);
            }
        } catch (error) {
            console.error('[ContextCache] Redis clearType error:', error.message);
        }
    }

    // Also clear memory
    if (memoryCaches[type]) {
        memoryCaches[type].clear();
    }
    if (memoryTimestamps[type]) {
        memoryTimestamps[type].clear();
    }
}

/**
 * Clear all caches
 */
async function clearAll() {
    if (useRedis && redisClient) {
        try {
            const keys = await redisClient.keys('mathmatix:cache:*');
            if (keys.length > 0) {
                await redisClient.del(...keys);
            }
        } catch (error) {
            console.error('[ContextCache] Redis clearAll error:', error.message);
        }
    }

    // Also clear memory
    Object.keys(memoryCaches).forEach(type => {
        memoryCaches[type].clear();
        memoryTimestamps[type].clear();
    });
}

/**
 * Get cache statistics for monitoring
 * @returns {Promise<Object>} Cache stats
 */
async function getStats() {
    const stats = {
        backend: useRedis ? 'redis' : 'memory',
        types: {}
    };

    if (useRedis && redisClient) {
        try {
            for (const type of Object.keys(CACHE_CONFIG)) {
                const keys = await redisClient.keys(buildKey(type, '*'));
                stats.types[type] = {
                    size: keys.length,
                    maxSize: CACHE_CONFIG[type]?.maxSize || 0
                };
            }
            return stats;
        } catch (error) {
            console.error('[ContextCache] Redis stats error:', error.message);
        }
    }

    // Memory stats
    Object.keys(memoryCaches).forEach(type => {
        stats.types[type] = {
            size: memoryCaches[type].size,
            maxSize: CACHE_CONFIG[type]?.maxSize || 0
        };
    });

    return stats;
}

/**
 * Wrap a database fetch with caching
 * @param {string} type - Cache type
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch if not cached
 * @returns {Promise<*>} Cached or fetched value
 */
async function getOrFetch(type, key, fetchFn) {
    // Try cache first
    const cached = await get(type, key);
    if (cached !== null) {
        return cached;
    }

    // Fetch from database
    try {
        const value = await fetchFn();
        if (value !== null && value !== undefined) {
            await set(type, key, value);
        }
        return value;
    } catch (error) {
        console.error(`[ContextCache] Error fetching ${type}:${key}:`, error.message);
        throw error;
    }
}

/**
 * Check if Redis is available
 * @returns {boolean}
 */
function isRedisAvailable() {
    return useRedis;
}

module.exports = {
    get,
    set,
    invalidate,
    clearType,
    clearAll,
    getStats,
    getOrFetch,
    isRedisAvailable,
    initRedis,
    CACHE_CONFIG
};
