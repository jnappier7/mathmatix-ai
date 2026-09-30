// utils/dob.js — the one shared date-of-birth validator/writer.
//
// DOB drives every age-gated protection (COPPA consent, under-13 voice block,
// teen self-certification), and it historically had three writers with three
// behaviors — signup silently discarded it, /api/user/settings dropped it via
// the allowlist, onboarding validated inline. This module is the single
// source of truth all writers share.
//
// Write-once by design: a student's self-serve DOB can be SET when absent but
// never CHANGED — otherwise an under-13 who gets age-gated can simply age
// themselves up in settings. Corrections go through support/admin tooling.

/**
 * Parse and sanity-check a date-of-birth input.
 * @param {*} input - anything a client sent (string, Date)
 * @returns {{date: Date}|{error: string}}
 */
function parseDateOfBirth(input) {
    if (!input) return { error: 'No date provided.' };
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) {
        return { error: 'That birth date didn’t look right — try again.' };
    }
    const now = new Date();
    const minBirth = new Date(now.getFullYear() - 120, 0, 1);
    if (d > now || d < minBirth) {
        return { error: 'That birth date didn’t look right — try again.' };
    }
    return { date: d };
}

/**
 * Apply a self-serve DOB update to a user doc (does not save).
 * @returns {{ok: true, changed: boolean}|{ok: false, status: number, message: string}}
 */
function applyDobToUser(user, input) {
    if (user.dateOfBirth) {
        // Re-sending the date already on file is not a change. complete-profile
        // pre-fills the stored DOB and submits it back, and the teen
        // self-consent step saves it before the form submits — refusing the
        // same date there blocked every student from finishing their profile.
        const parsed = parseDateOfBirth(input);
        if (!parsed.error && sameCalendarDay(parsed.date, user.dateOfBirth)) {
            return { ok: true, changed: false };
        }
        return {
            ok: false,
            status: 400,
            message: 'Your birth date is already set. Contact support if it needs a correction.',
        };
    }
    const parsed = parseDateOfBirth(input);
    if (parsed.error) {
        return { ok: false, status: 400, message: parsed.error };
    }
    user.dateOfBirth = parsed.date;
    return { ok: true, changed: true };
}

function sameCalendarDay(a, b) {
    const d1 = new Date(a);
    const d2 = new Date(b);
    return !Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime()) &&
        d1.toISOString().slice(0, 10) === d2.toISOString().slice(0, 10);
}

module.exports = { parseDateOfBirth, applyDobToUser };
