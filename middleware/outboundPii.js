/**
 * OUTBOUND PII SCOPE — one anonymization context per request.
 *
 * Opens an AsyncLocalStorage scope holding the context for req.user, so every
 * LLM and embedding call made while this request is being served (the chat
 * pipeline, the verifier, the board translator, the reading-level simplifier,
 * the hint generator, the greeting builder — sixty-odd call sites) strips the
 * student's name on the way out and restores it on the way back, without any
 * of them passing a context. The chokepoint in utils/openaiClient.js reads it
 * via currentOutboundPiiContext() whenever a call has no options.anonContext.
 *
 * Must be mounted AFTER passport and impersonation: the context is built from
 * whoever req.user is once impersonation has swapped it, so an admin viewing a
 * student's chat strips the student, not the admin.
 *
 * A request with no user (trial chat, waitlist) gets a pattern-only context,
 * which is still more than the raw pass-through it had.
 */

const { createActorAnonymizationContext, runWithOutboundPiiContext } = require('../utils/piiAnonymizer');

function outboundPiiScope(req, res, next) {
    let context = null;
    try {
        context = createActorAnonymizationContext(req.user || null);
    } catch (err) {
        // A malformed profile must not take the request down; the chokepoint
        // falls back to its pattern-only pass when the scope is empty.
        console.error('[outboundPii] context build failed (non-fatal):', err.message);
    }
    return runWithOutboundPiiContext(context, () => next());
}

module.exports = { outboundPiiScope };
