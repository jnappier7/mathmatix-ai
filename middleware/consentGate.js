/**
 * CONSENT GATE MIDDLEWARE
 *
 * Rejects requests for a specific student's records when that student's
 * privacy consent is revoked or expired. Pending-with-legacy consent is
 * allowed through, matching the convention already used on the transcript
 * endpoints (a student mid-onboarding should not be blocked from IEP setup).
 *
 * Usage:
 *   const { requireActiveConsent } = require('../middleware/consentGate');
 *   router.get(
 *     '/students/:studentId/iep',
 *     isTeacher,
 *     requireActiveConsent(),
 *     logRecordAccess('iep_plan', 'teaching_instruction'),
 *     handler
 *   );
 *
 * For routes where the student ID isn't at req.params.studentId, pass a
 * getStudentId accessor:
 *
 *   requireActiveConsent({ getStudentId: (req) => req.params.childId })
 *
 * If the student doesn't exist, this middleware passes through (next()) and
 * lets the downstream handler own the 404 — so error messages stay consistent
 * with the handler's existing contract.
 */

const { checkConsent, computeAge, COPPA_AGE } = require('../utils/consentManager');
const { rolesOf } = require('../utils/roleQuery');
const User = require('../models/user');
const logger = require('../utils/logger');

function requireActiveConsent(options = {}) {
    const getStudentId = options.getStudentId || ((req) => req.params.studentId);

    return async (req, res, next) => {
        try {
            const studentId = getStudentId(req);
            if (!studentId) return next();

            const student = await User.findById(
                studentId,
                'privacyConsent hasParentalConsent role'
            ).lean();

            // Let the handler decide the 404 semantics (some endpoints wrap
            // "not found" with extra context). Only block here when we have a
            // student AND that student's consent is revoked/expired.
            if (!student) return next();

            const consent = checkConsent(student);
            if (!consent.hasConsent && consent.status !== 'pending') {
                return res.status(403).json({
                    message: 'Consent required to access this student record.',
                    consentStatus: { status: consent.status, pathway: consent.pathway },
                });
            }

            req.consentStatus = consent;
            return next();
        } catch (err) {
            console.error('[consentGate] error checking consent:', err);
            return next(err);
        }
    };
}

/* ---------------------------------------------------------------------------
 * requireOwnConsent — the REQUESTING user's own consent, on AI endpoints.
 *
 * requireActiveConsent (above) gates an adult reading a student's records.
 * This gates the student's own AI usage — the point of collection and
 * third-party disclosure under COPPA. Modes via CONSENT_ENFORCEMENT:
 *   off      — no-op
 *   log      — evaluate + record would-blocks, never block
 *   enforce  — actually 403                                  (DEFAULT)
 * The env var is read per-request so a Render env flip takes effect without
 * coordinating a restart with a deploy.
 *
 * The default was 'log' through the staged rollout, which meant the gate was
 * mounted on every AI endpoint and blocked nothing: an under-13 student with
 * pending consent got full tutoring, and their messages went to OpenAI,
 * Anthropic and Mathpix. It defaults to 'enforce' now that there is a working
 * way to obtain consent — before, blocking would have been a dead end, because
 * the emailed consent link 404'd and no UI could grant parental consent at all.
 *
 * Blast radius is narrower than it looks. enforce only blocks three buckets:
 * revoked, expired, and under13_pending. Accounts carrying the legacy
 * hasParentalConsent flag are treated as active, students with no date of birth
 * are allowed through as 'null_dob', and 13+ pending is allowed as
 * teen_pending. Size the real population against the database with
 * `node scripts/auditConsentGaps.js` before deploying; set
 * CONSENT_ENFORCEMENT=log to roll back without a code change.
 * ------------------------------------------------------------------------- */

const CONSENT_MODES = ['off', 'log', 'enforce'];

function getEnforcementMode() {
    const m = (process.env.CONSENT_ENFORCEMENT || 'enforce').toLowerCase();
    // An unrecognised value falls back to 'enforce', not 'log'. A typo in a
    // Render env var must not silently disable a compliance gate.
    return CONSENT_MODES.includes(m) ? m : 'enforce';
}

const ADULT_ROLES = ['teacher', 'parent', 'admin'];

/**
 * Pure decision function — no req/res, so the WS upgrade path and the
 * consent-gap audit script can reuse it. Works on hydrated docs AND .lean()
 * docs; note the two read different shapes for legacy accounts (see below).
 *
 * @returns {{ allow: boolean, code: string|null, bucket: string,
 *             status?: string, pathway?: string }}
 */
function evaluateOwnConsent(user) {
    if (!user) return { allow: true, code: null, bucket: 'no_user' };

    // COPPA protects the child using the product. Any account holding an
    // adult role (incl. multi-role accounts — check roles HELD, not the
    // dashboard currently viewed) is out of scope.
    const roles = rolesOf(user);
    if (roles.some((r) => ADULT_ROLES.includes(r))) {
        return { allow: true, code: null, bucket: 'non_student' };
    }

    const consent = checkConsent(user);
    const age = computeAge(user.dateOfBirth);

    // Legacy accounts predate the privacyConsent subdoc. On a .lean() doc the
    // field is truly absent and checkConsent's own legacy fallback fires; on a
    // HYDRATED doc the schema defaults status to 'pending', which masks it.
    // Detect that shape explicitly: pending, no recorded history, but the
    // legacy flag was set by a real grant.
    const history = user.privacyConsent && user.privacyConsent.history;
    const isLegacyActive =
        consent.status === 'pending' &&
        user.hasParentalConsent === true &&
        (!history || history.length === 0);

    if (consent.hasConsent || isLegacyActive) {
        return {
            allow: true, code: null,
            bucket: isLegacyActive ? 'legacy' : 'active',
            status: consent.status, pathway: isLegacyActive ? 'legacy' : consent.pathway,
        };
    }

    if (consent.status === 'revoked') {
        return { allow: false, code: 'CONSENT_REVOKED', bucket: 'revoked', status: consent.status, pathway: consent.pathway };
    }
    if (consent.status === 'expired') {
        return { allow: false, code: 'CONSENT_EXPIRED', bucket: 'expired', status: consent.status, pathway: consent.pathway };
    }

    // status is 'pending' (or unset) with no legacy grant: decide by COPPA age.
    if (age === null) {
        // No date of birth on file — unclassifiable. Grace default: allow and
        // count, so enforcement can't silently lock out accounts we can't age.
        // scripts/auditConsentGaps.js sizes this population.
        return { allow: true, code: 'CONSENT_UNKNOWN_DOB', bucket: 'null_dob', status: consent.status, pathway: consent.pathway };
    }
    if (age < COPPA_AGE) {
        return { allow: false, code: 'CONSENT_REQUIRED_PARENT', bucket: 'under13_pending', status: consent.status, pathway: consent.pathway };
    }
    // 13+: COPPA does not require parental consent; self-certification is a
    // product step, not a legal gate. Allow, tagged so log mode can size it.
    return { allow: true, code: 'CONSENT_SELF_CERT_PENDING', bucket: 'teen_pending', status: consent.status, pathway: consent.pathway };
}

// --- telemetry: in-memory counters + throttled logs ------------------------
// Counters are per-process observability for the rollout (surfaced on
// GET /api/admin/consent-metrics); durable ground truth comes from
// scripts/auditConsentGaps.js against the DB.

const consentCounters = new Map(); // "mode|bucket|code" -> count
const lastLogAt = new Map();       // userId -> ts of last log line
const LOG_THROTTLE_MS = 60 * 60 * 1000;
const LOG_THROTTLE_MAX_USERS = 10000; // hard cap so the map can't grow unbounded

function recordConsentGateEvent(decision, userId, path, mode) {
    const key = `${mode}|${decision.bucket}|${decision.code || 'none'}`;
    consentCounters.set(key, (consentCounters.get(key) || 0) + 1);

    const id = String(userId || 'anon');
    const now = Date.now();
    const last = lastLogAt.get(id) || 0;
    if (now - last < LOG_THROTTLE_MS) return;
    if (lastLogAt.size >= LOG_THROTTLE_MAX_USERS) lastLogAt.clear();
    lastLogAt.set(id, now);

    const verb = decision.allow ? 'flagged' : (mode === 'enforce' ? 'blocked' : 'would block');
    logger.warn(`[consentGate] ${verb}`, {
        userId: id, code: decision.code, bucket: decision.bucket, mode, path,
    });
}

function consentMetricsHandler(req, res) {
    const counts = {};
    for (const [key, n] of consentCounters) counts[key] = n;
    res.json({ mode: getEnforcementMode(), sinceProcessStart: true, counts });
}

function requireOwnConsent() {
    return (req, res, next) => {
        try {
            const mode = getEnforcementMode();
            if (mode === 'off') return next();

            const decision = evaluateOwnConsent(req.user);
            if (decision.allow && !decision.code) return next();

            recordConsentGateEvent(decision, req.user && req.user._id, req.path, mode);

            if (decision.allow || mode === 'log') return next();

            return res.status(403).json({
                message: 'A parent or guardian needs to approve Mathmatix AI before tutoring can continue.',
                consentRequired: true,
                consentCode: decision.code,
                consentStatus: { status: decision.status, pathway: decision.pathway },
            });
        } catch (err) {
            // Fail-open, matching usageGate: a gate bug must not take down tutoring.
            logger.error('[consentGate] requireOwnConsent error', { error: err.message });
            return next();
        }
    };
}

module.exports = {
    requireActiveConsent,
    requireOwnConsent,
    evaluateOwnConsent,
    getEnforcementMode,
    consentMetricsHandler,
};
