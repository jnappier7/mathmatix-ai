/**
 * THE LEARNING NOTEBOOK (Live Workspace spec §15)
 *
 * Read/manage the student's persistent learning cards — AHA moments,
 * reminders, ideas — captured by the tutoring pipeline across sessions, plus
 * the notes the student writes themselves. The notebook is theirs: they can
 * add to it, edit what they wrote, and clear anything out of it.
 *
 * GET    /api/notebook             — list my cards (?type=…, ?q=, ?limit=)
 * POST   /api/notebook             — add a card (student-authored kinds only)
 * PATCH  /api/notebook/:id         — edit a card I wrote myself
 * PATCH  /api/notebook/:id/archive — soft-remove a card from my notebook
 *
 * Students only see their own cards. Natural-language search and the
 * teacher's cross-student view (spec §15/§20) build on this later.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const LearningCard = require('../models/learningCard');
const logger = require('../utils/logger').child({ route: 'notebook' });

const TYPES = ['aha', 'reminder', 'idea', 'strategy', 'reflection', 'note'];

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
      .select('type source title body quote skillId problemTex seenCount createdAt lastSeenAt')
      .lean();

    res.json({ cards });
  } catch (err) {
    logger.error('Failed to list notebook cards', { error: err.message });
    res.status(500).json({ message: 'Failed to load notebook' });
  }
});

// Card creation, two flavours, one gate:
//   - spec §7.6 promotion: the tutor OFFERS an idea (<NOTEBOOK_IDEA> →
//     ideaSuggestion on the chat response) and the student clicks save.
//   - the student writes their own `note` (or drags a chat message into the
//     notebook), which is what makes the notebook theirs rather than a
//     read-only report card.
// Both are restricted to the student-initiated kinds; aha/reminder stay
// pipeline-only so their evidence semantics stay honest. A client that asks
// for one gets 'idea' instead — the coercion is deliberate, don't relax it.
const CREATABLE_TYPES = ['idea', 'strategy', 'reflection', 'note'];
// Who a given kind's words belong to. `source` is DERIVED here, never read
// off the request — otherwise a client could post source:'student' on an
// idea and hand itself an edit permit for tutor-worded text.
function sourceForType(type) {
  return type === 'note' ? 'student' : 'tutor';
}
function sanitizeCardInput(body) {
  const b = body || {};
  const type = CREATABLE_TYPES.includes(b.type) ? b.type : 'idea';
  const title = String(b.title == null ? '' : b.title).trim().slice(0, 160);
  const text = String(b.body == null ? '' : b.body).trim().slice(0, 2000);
  if (!title && !text) return null;
  const skillId = b.skillId ? String(b.skillId).trim().slice(0, 80) : null;
  return { type, source: sourceForType(type), title: title || text.slice(0, 60), body: text, skillId };
}

// Edits carry no type: a note stays a note. Only the two fields the student
// actually wrote are writable, and only when at least one survives trimming.
function sanitizeCardEdit(body) {
  const b = body || {};
  const title = String(b.title == null ? '' : b.title).trim().slice(0, 160);
  const text = String(b.body == null ? '' : b.body).trim().slice(0, 2000);
  if (!title && !text) return null;
  return { title: title || text.slice(0, 60), body: text };
}

router.post('/', isAuthenticated, async (req, res) => {
  try {
    const input = sanitizeCardInput(req.body);
    if (!input) return res.status(400).json({ message: 'Card needs a title or body' });
    const card = await LearningCard.create({
      userId: req.user._id,
      type: input.type,
      source: input.source,
      title: input.title,
      body: input.body,
      skillId: input.skillId,
      conversationId: null,
    });
    res.status(201).json({
      card: {
        _id: card._id,
        type: card.type,
        source: card.source,
        title: card.title,
        body: card.body,
        createdAt: card.createdAt,
      },
    });
  } catch (err) {
    logger.error('Failed to create notebook card', { error: err.message });
    res.status(500).json({ message: 'Failed to save card' });
  }
});

// Edit a card the student wrote themselves. The `source: 'student'` term in
// the filter is the whole guard: an aha/reminder/idea card is never matched,
// so a student can revise their own notes without being able to rewrite the
// tutor's record of what happened. Cards predating the `source` field have it
// unset, which correctly fails this filter.
router.patch('/:id', isAuthenticated, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Note not found' });
    }
    const input = sanitizeCardEdit(req.body);
    if (!input) return res.status(400).json({ message: 'Note needs a title or body' });
    const card = await LearningCard.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, source: 'student', archived: false },
      { $set: { title: input.title, body: input.body } },
      { new: true }
    ).select('_id type source title body createdAt').lean();
    if (!card) return res.status(404).json({ message: 'Note not found' });
    res.json({ card });
  } catch (err) {
    logger.error('Failed to edit notebook card', { error: err.message });
    res.status(500).json({ message: 'Failed to save note' });
  }
});

router.patch('/:id/archive', isAuthenticated, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Card not found' });
    }
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
router.__helpers = { escapeRegex, buildSearchClause, sanitizeCardInput, sanitizeCardEdit, sourceForType, TYPES, CREATABLE_TYPES };

module.exports = router;
