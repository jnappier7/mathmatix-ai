/**
 * TUTOR ACCESS — who may select which tutor.
 *
 * Core tutors (`unlocked: true` in tutorConfig.js) are open to everyone. Shop
 * tutors (`purchasable: true`) must be owned: their id is in user.unlockedItems,
 * written by a Coins purchase (utils/cosmeticsCatalog.js, slot "tutor") or by the
 * legacy earned-unlock system for accounts that got one before it went dormant.
 * Anything else (unknown id, `active: false`) is not selectable.
 *
 * Before this existed PATCH /api/user/settings stored any selectedTutorId it
 * was sent, so a paid tutor would have been one devtools call away.
 *
 * @module tutorAccess
 */

const TUTOR_CONFIG = require('./tutorConfig');

/** The tutor every account falls back to when a selection is no longer allowed. */
const FALLBACK_TUTOR_ID = 'mr-nappier';

function getTutor(tutorId) {
    if (!tutorId || typeof tutorId !== 'string') return null;
    if (!Object.prototype.hasOwnProperty.call(TUTOR_CONFIG, tutorId)) return null;
    return TUTOR_CONFIG[tutorId];
}

function isPurchasableTutor(tutorId) {
    const t = getTutor(tutorId);
    return !!(t && t.purchasable && t.active !== false);
}

function ownsTutor(user, tutorId) {
    const t = getTutor(tutorId);
    if (!t || t.active === false) return false;
    if (t.unlocked === true) return true;
    const owned = (user && user.unlockedItems) || [];
    return owned.includes(tutorId);
}

/** May this user set selectedTutorId to tutorId? */
function canSelectTutor(user, tutorId) {
    return ownsTutor(user, tutorId);
}

module.exports = { FALLBACK_TUTOR_ID, getTutor, isPurchasableTutor, ownsTutor, canSelectTutor };
