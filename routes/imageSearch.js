// ============================================
// SAFE EDUCATIONAL IMAGE SEARCH ROUTE
// COPPA-compliant, rate-limited, authenticated
// ============================================

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  searchEducationalImages,
  sanitizeQuery,
  getStaticConceptImage,
  isValidCategory
} = require('../utils/safeImageSearch');

// ── Strict rate limiter: 10 image searches per student per 15 minutes ──
const imageSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: 'Too many image searches. Try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/images/search?q=...&category=...
 *
 * Safe educational image search.
 * - Requires authentication
 * - Rate limited (10/15min per student)
 * - Query is sanitized for COPPA compliance
 * - Results come from education domain whitelist only
 * - SafeSearch is always ACTIVE (cannot be disabled)
 *
 * Query params:
 *   q        - Search query (required, max 100 chars)
 *   category - Educational category filter (optional)
 *
 * Response: { results: [{ url, thumbnail, title, source }], query, error? }
 */
router.get('/search', imageSearchLimiter, async (req, res) => {
  try {
    const query = req.query.q;
    const category = req.query.category;

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query is required (min 2 characters)' });
    }

    if (query.length > 100) {
      return res.status(400).json({ error: 'Search query too long (max 100 characters)' });
    }

    // Validate category if provided
    if (category && !isValidCategory(category)) {
      return res.status(400).json({ error: 'Invalid educational category' });
    }

    // Pre-check: sanitize query before making API call
    const { safe, reason } = sanitizeQuery(query);
    if (!safe) {
      return res.status(400).json({ error: reason || 'Query not allowed' });
    }

    // Try static image first (free, instant, no API call)
    const staticResult = getStaticConceptImage(query);
    if (staticResult) {
      return res.json({
        results: [staticResult],
        query: query.trim(),
        cached: true,
        source: 'static'
      });
    }

    // Search via Google Custom Search (COPPA-safe)
    const searchResult = await searchEducationalImages(query, {
      category,
      maxResults: 3,
      userId: req.user?._id?.toString()
    });

    if (searchResult.error) {
      // Still return 200 with empty results + error message
      // (don't expose internal error details)
      return res.json({
        results: [],
        query: searchResult.query,
        error: searchResult.error === 'Image search not configured'
          ? 'Image search is not available yet'
          : 'No images found for this topic'
      });
    }

    return res.json({
      results: searchResult.results,
      query: searchResult.query,
      source: 'google_cse'
    });

  } catch (error) {
    console.error('[ImageSearch] Route error:', error.message);
    return res.status(500).json({ error: 'Image search temporarily unavailable' });
  }
});

/**
 * GET /api/images/concept/:concept
 *
 * Get a static concept image (no external API call).
 * Instant, free, always available.
 */
router.get('/concept/:concept', (req, res) => {
  const concept = req.params.concept;

  if (!concept || typeof concept !== 'string') {
    return res.status(400).json({ error: 'Concept name required' });
  }

  const image = getStaticConceptImage(concept);

  if (image) {
    return res.json({ result: image });
  }

  return res.status(404).json({ error: 'No image available for this concept' });
});

module.exports = router;
