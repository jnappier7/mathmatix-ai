// routes/transcriptFlags.js
//
// Endpoints for flagging specific tutor turns in a transcript and for the
// admin triage list view.
//
//   POST /api/transcript-flags          teachers and admins; creates a flag.
//     body: { conversationId, turnIndex, reason? }
//
//   GET  /api/transcript-flags          admin only; list view.
//     query: ?status=open|reviewed|dismissed|all  (default: open)
//            ?limit=N  (default: 100, max 500)
//
// Teachers can only flag turns in conversations belonging to their own roster
// (and only when student consent is not revoked) — the same gates that protect
// the transcript read. Admins can flag any student's transcript (subject to
// consent), consistent with how the read-side works today.

const express = require('express');
const router = express.Router();

const User = require('../models/user');
const Conversation = require('../models/conversation');
const TranscriptFlag = require('../models/transcriptFlag');
const { getStudentIdsForTeacher } = require('../services/userService');
const { checkConsent } = require('../utils/consentManager');

function roleOf(user) {
    if (!user) return null;
    if (user.role === 'admin') return 'admin';
    if (user.role === 'teacher') return 'teacher';
    if (Array.isArray(user.roles)) {
        if (user.roles.includes('admin')) return 'admin';
        if (user.roles.includes('teacher')) return 'teacher';
    }
    return null;
}

router.post('/', async (req, res) => {
    const reviewerRole = roleOf(req.user);
    if (reviewerRole !== 'teacher' && reviewerRole !== 'admin') {
        return res.status(403).json({ message: 'Only teachers or admins can flag transcripts.' });
    }

    const { conversationId, turnIndex, reason } = req.body || {};
    if (!conversationId || typeof turnIndex !== 'number' || turnIndex < 0) {
        return res.status(400).json({
            message: 'conversationId and a non-negative turnIndex are required.',
        });
    }

    try {
        const conversation = await Conversation.findById(conversationId)
            .select('userId messages')
            .lean();
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        // Must point at an existing tutor turn. Student turns cannot be flagged —
        // the whole point is to audit tutor behavior.
        const msg = Array.isArray(conversation.messages) ? conversation.messages[turnIndex] : null;
        if (!msg) {
            return res.status(400).json({ message: 'turnIndex is out of range for this conversation.' });
        }
        if (msg.role !== 'assistant') {
            return res.status(400).json({ message: 'Only tutor turns can be flagged.' });
        }

        // Authorization: teachers must own the student via roster; admins may flag any
        // student's transcript. Both must respect consent.
        const studentId = conversation.userId;
        if (reviewerRole === 'teacher') {
            const rosterIds = await getStudentIdsForTeacher(req.user._id);
            if (!rosterIds.includes(String(studentId))) {
                return res.status(403).json({ message: "You are not authorized to flag this student's transcripts." });
            }
        }

        const student = await User.findOne(
            { _id: studentId, role: 'student' },
            '_id privacyConsent hasParentalConsent'
        ).lean();
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }
        const consent = checkConsent(student);
        if (!consent.hasConsent && consent.status !== 'pending') {
            return res.status(403).json({
                message: 'Consent required to flag transcripts.',
                consentStatus: { status: consent.status, pathway: consent.pathway },
            });
        }

        try {
            const flag = await TranscriptFlag.create({
                conversationId,
                turnIndex,
                studentId,
                flaggedBy: req.user._id,
                flaggedByRole: reviewerRole,
                reason: (reason || '').toString().slice(0, 2000),
                turnSnapshot: {
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                },
            });
            return res.status(201).json({ flag });
        } catch (err) {
            // E11000 = duplicate key on (conversationId, turnIndex, flaggedBy).
            // A reviewer has already flagged this exact turn; treat as idempotent.
            if (err && err.code === 11000) {
                const existing = await TranscriptFlag.findOne({
                    conversationId,
                    turnIndex,
                    flaggedBy: req.user._id,
                });
                return res.status(200).json({ flag: existing, duplicate: true });
            }
            throw err;
        }
    } catch (err) {
        console.error('Error creating transcript flag:', err);
        return res.status(500).json({ message: 'Server error creating transcript flag.' });
    }
});

router.get('/', async (req, res) => {
    if (roleOf(req.user) !== 'admin') {
        return res.status(403).json({ message: 'Admin only.' });
    }

    try {
        const requestedStatus = (req.query.status || 'open').toString();
        const query = {};
        if (requestedStatus !== 'all') {
            query.status = requestedStatus;
        }

        const rawLimit = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;

        const flags = await TranscriptFlag.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('studentId', 'firstName lastName username')
            .populate('flaggedBy', 'firstName lastName username')
            .lean();

        return res.json({ flags });
    } catch (err) {
        console.error('Error fetching transcript flags:', err);
        return res.status(500).json({ message: 'Server error fetching transcript flags.' });
    }
});

// Admin-only triage action. Transitions a flag between 'open' / 'reviewed' /
// 'dismissed'. Deliberately tight: only the status changes, nothing else.
// Reopening a dismissed/reviewed flag is allowed so admins can walk back a
// decision without re-flagging.
const VALID_STATUSES = ['open', 'reviewed', 'dismissed'];
router.patch('/:id', async (req, res) => {
    if (roleOf(req.user) !== 'admin') {
        return res.status(403).json({ message: 'Admin only.' });
    }

    const { status } = req.body || {};
    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
            message: `status must be one of: ${VALID_STATUSES.join(', ')}.`,
        });
    }

    try {
        const updated = await TranscriptFlag.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true, runValidators: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ message: 'Flag not found.' });
        }

        return res.json({ flag: updated });
    } catch (err) {
        console.error('Error updating transcript flag:', err);
        return res.status(500).json({ message: 'Server error updating transcript flag.' });
    }
});

module.exports = router;
