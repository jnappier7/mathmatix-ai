/**
 * Strip personal data from a Sentry event before it leaves the server.
 *
 * THE PROBLEM THIS SOLVES: instrument.js was initialised with
 * `sendDefaultPii: true`. On a child-directed service that meant every captured
 * 5xx shipped the request's cookies (the session id), its headers, its body and
 * the client IP to a third party — and the body of a chat request is the
 * student's message. Nothing in the privacy policy disclosed Sentry as a
 * recipient of any of that, because nobody had looked.
 *
 * The flag is now off, and this hook is the belt to that brace: even if a
 * future integration re-attaches request data, it is removed here. What is
 * kept is what an engineer needs to fix the bug — the stack, the route, the
 * status, a user *id* to correlate with our own logs. What is dropped is
 * everything that identifies or quotes a person.
 *
 * Pure and dependency-free so it can be unit-tested without initialising
 * Sentry, and so instrument.js (which loads before every other module) has
 * nothing heavy to pull in.
 *
 * @module utils/sentryScrub
 */

// Request fields that carry identity or content. `url` and `method` stay —
// they are the route, not the person.
const REQUEST_FIELDS_TO_DROP = ['cookies', 'headers', 'data', 'query_string', 'env'];

// Everything on `user` except the id. Sentry's own IP inference comes from
// `ip_address`; `email`/`username`/`name` would be real PII.
const USER_FIELDS_TO_KEEP = new Set(['id']);

// Keys anywhere in `extra`/`contexts`/`tags` that are likely to hold a person's
// words or identifiers. Matched case-insensitively as substrings.
const SENSITIVE_KEY_FRAGMENTS = [
    'message', 'content', 'text', 'prompt', 'transcript', 'body',
    'email', 'name', 'phone', 'address', 'ip', 'cookie', 'token',
    'password', 'secret', 'authorization',
];

function isSensitiveKey(key) {
    const k = String(key).toLowerCase();
    return SENSITIVE_KEY_FRAGMENTS.some((frag) => k.includes(frag));
}

/** Recursively redact values under sensitive keys. Leaves structure intact. */
function redactDeep(value, depth = 0) {
    if (depth > 8 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = isSensitiveKey(k) ? '[redacted]' : redactDeep(v, depth + 1);
    }
    return out;
}

/**
 * Sentry `beforeSend` hook. Returns the scrubbed event; never drops it — a
 * scrubbed error report is still a useful error report.
 *
 * @param {object} event  Sentry event
 * @returns {object}
 */
function scrubEvent(event) {
    if (!event || typeof event !== 'object') return event;

    if (event.request && typeof event.request === 'object') {
        for (const field of REQUEST_FIELDS_TO_DROP) delete event.request[field];
    }

    if (event.user && typeof event.user === 'object') {
        const kept = {};
        for (const [k, v] of Object.entries(event.user)) {
            if (USER_FIELDS_TO_KEEP.has(k)) kept[k] = v;
        }
        event.user = kept;
    }

    if (event.extra) event.extra = redactDeep(event.extra);
    if (event.contexts) event.contexts = redactDeep(event.contexts);
    if (event.tags) event.tags = redactDeep(event.tags);

    // Breadcrumbs can carry request bodies from the http integration.
    if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((b) =>
            b && b.data ? { ...b, data: redactDeep(b.data) } : b
        );
    }

    return event;
}

module.exports = { scrubEvent, isSensitiveKey };
