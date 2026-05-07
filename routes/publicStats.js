// routes/publicStats.js — Public, no-auth stats for the landing page.
// Counter only ever climbs; cached in memory for 5 minutes so we're not
// running an aggregation on every cold-visitor page load.

const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const logger = require('../utils/logger');

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { value: null, computedAt: 0, inFlight: null };

async function computeProblemsSolved() {
  // Each assistant message is one teaching exchange — what we surface as
  // "problems solved" on the landing page. Subdocument array, so a single
  // aggregation pass with $size + $filter is the cheapest option.
  const result = await Conversation.aggregate([
    {
      $project: {
        assistantMessages: {
          $size: {
            $filter: {
              input: { $ifNull: ['$messages', []] },
              as: 'm',
              cond: { $eq: ['$$m.role', 'assistant'] },
            },
          },
        },
      },
    },
    { $group: { _id: null, total: { $sum: '$assistantMessages' } } },
  ]).allowDiskUse(true);

  return result[0]?.total || 0;
}

async function getProblemsSolved() {
  const now = Date.now();
  if (cache.value !== null && now - cache.computedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  if (cache.inFlight) return cache.inFlight;

  cache.inFlight = computeProblemsSolved()
    .then((value) => {
      cache = { value, computedAt: Date.now(), inFlight: null };
      return value;
    })
    .catch((err) => {
      cache.inFlight = null;
      throw err;
    });

  return cache.inFlight;
}

router.get('/problems-solved', async (req, res) => {
  try {
    const count = await getProblemsSolved();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ count, asOf: new Date(cache.computedAt).toISOString() });
  } catch (err) {
    logger.error('publicStats: problems-solved aggregation failed', { error: err.message });
    // Stale cache is better than a broken hero counter.
    if (cache.value !== null) {
      return res.json({ count: cache.value, asOf: new Date(cache.computedAt).toISOString(), stale: true });
    }
    res.status(503).json({ error: 'Stats temporarily unavailable' });
  }
});

module.exports = router;
