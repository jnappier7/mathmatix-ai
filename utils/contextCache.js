/**
 * Context Cache - In-memory caching for frequently accessed data
 *
 * Reduces database queries by caching:
 * - User profiles (curriculum, teacher settings)
 * - Recent conversations
 * - Curriculum data
 *
 * Uses Map-based LRU cache with TTL expiration
 *
 * @module contextCache
 */

// Cache configuration
const CACHE_CONFIG = {
    user: { ttl: 60 * 1000, maxSize: 500 },           // User data: 1 min TTL
    curriculum: { ttl: 5 * 60 * 1000, maxSize: 100 }, // Curriculum: 5 min TTL
    teacherSettings: { ttl: 5 * 60 * 1000, maxSize: 100 }, // Teacher AI settings: 5 min TTL
    conversation: { ttl: 30 * 1000, maxSize: 200 }    // Conversation: 30 sec TTL
};

// Cache stores
const caches = {
    user: new Map(),
    curriculum: new Map(),
    teacherSettings: new Map(),
    conversation: new Map()
};

// Timestamps for TTL checking
const timestamps = {
    user: new Map(),
    curriculum: new Map(),
    teacherSettings: new Map(),
    conversation: new Map()
};

/**
 * Get item from cache if not expired
 * @param {string} type - Cache type (user, curriculum, teacherSettings, conversation)
 * @param {string} key - Cache key (usually an ID)
 * @returns {*} Cached value or null if expired/missing
 */
function get(type, key) {
    if (!caches[type] || !timestamps[type]) {
        return null;
    }

    const timestamp = timestamps[type].get(key);
    if (!timestamp) {
        return null;
    }

    const ttl = CACHE_CONFIG[type]?.ttl || 60000;
    const isExpired = Date.now() - timestamp > ttl;

    if (isExpired) {
        caches[type].delete(key);
        timestamps[type].delete(key);
        return null;
    }

    return caches[type].get(key) || null;
}

/**
 * Set item in cache with timestamp
 * @param {string} type - Cache type
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 */
function set(type, key, value) {
    if (!caches[type] || !timestamps[type]) {
        return;
    }

    const config = CACHE_CONFIG[type] || { maxSize: 100 };

    // Enforce max size (simple LRU - remove oldest entries)
    if (caches[type].size >= config.maxSize) {
        const oldestKey = caches[type].keys().next().value;
        caches[type].delete(oldestKey);
        timestamps[type].delete(oldestKey);
    }

    caches[type].set(key, value);
    timestamps[type].set(key, Date.now());
}

/**
 * Invalidate specific cache entry
 * @param {string} type - Cache type
 * @param {string} key - Cache key to invalidate
 */
function invalidate(type, key) {
    if (caches[type]) {
        caches[type].delete(key);
    }
    if (timestamps[type]) {
        timestamps[type].delete(key);
    }
}

/**
 * Clear entire cache type
 * @param {string} type - Cache type to clear
 */
function clearType(type) {
    if (caches[type]) {
        caches[type].clear();
    }
    if (timestamps[type]) {
        timestamps[type].clear();
    }
}

/**
 * Clear all caches
 */
function clearAll() {
    Object.keys(caches).forEach(type => {
        caches[type].clear();
        timestamps[type].clear();
    });
}

/**
 * Get cache statistics for monitoring
 * @returns {Object} Cache stats
 */
function getStats() {
    const stats = {};
    Object.keys(caches).forEach(type => {
        stats[type] = {
            size: caches[type].size,
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
    const cached = get(type, key);
    if (cached !== null) {
        return cached;
    }

    // Fetch from database
    try {
        const value = await fetchFn();
        if (value !== null && value !== undefined) {
            set(type, key, value);
        }
        return value;
    } catch (error) {
        console.error(`[ContextCache] Error fetching ${type}:${key}:`, error.message);
        throw error;
    }
}

module.exports = {
    get,
    set,
    invalidate,
    clearType,
    clearAll,
    getStats,
    getOrFetch,
    CACHE_CONFIG
};
