/**
 * THE LEARNING NOTEBOOK (Live Workspace spec §15)
 *
 * Read/manage the student's persistent learning cards — AHA moments,
 * reminders, ideas — captured by the tutoring pipeline across sessions.
 *
 * GET    /api/notebook           — list my cards (?type=aha|reminder|idea|strategy|reflection, ?limit=)
 * PATCH  /api/notebook/:id/archive — soft-remove a card from my notebook
 *
 * Students only see their own cards. Natural-language search and the
 * teacher's cross-student view (spec §15/§20) build on this later.
 */

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const LearningCard = require('../models/learningCard');
const logger = require('../utils/logger').child({ route: 'notebook' });

const TYPES = ['aha', 'reminder', 'idea', 'strategy', 'reflection'];

// Text search over a student's own cards (spec §15: "Show me where I learned
// slope", "find a problem where I lost a negative sign"). Plain escaped-regex
// matching for now — semantic search can swap in behind the same param.
function escapeRegex(s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function buildSearchClause(q) {
  const term = String(q == null ? '' : q).trim().slice(0, 120);
  if (!term) return null;
  const rx = new RegExp(escapeRegex(term), 'i');
  return { $or: [{ title: rx }, { body: rx }, { quote: rx }, { skillId: rx }, { problemTex: rx }] };
}

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const query = { userId: req.user._id, archived: false };
    if (req.query.type && TYPES.includes(req.query.type)) query.type = req.query.type;
    const search = buildSearchClause(req.query.q);
    if (search) Object.assign(query, search);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const cards = await LearningCard.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('type title body quote skillId problemTex seenCount createdAt lastSeenAt')
      .lean();

    res.json({ cards });
  } catch (err) {
    logger.error('Failed to list notebook cards', { error: err.message });
    res.status(500).json({ message: 'Failed to load notebook' });
  }
});

router.patch('/:id/archive', isAuthenticated, async (req, res) => {
  try {
    const card = await LearningCard.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { archived: true } },
      { new: true }
    ).select('_id').lean();
    if (!card) return res.status(404).json({ message: 'Card not found' });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to archive notebook card', { error: err.message });
    res.status(500).json({ message: 'Failed to archive card' });
  }
});

// Pure helpers reachable from unit tests (same pattern as practicePack).
router.__helpers = { escapeRegex, buildSearchClause };

module.exports = router;
