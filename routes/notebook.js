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

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const query = { userId: req.user._id, archived: false };
    if (req.query.type && TYPES.includes(req.query.type)) query.type = req.query.type;
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

module.exports = router;
