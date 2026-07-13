// modules/avatarResolver.js
// Single place that decides which avatar image to show for a user, so chat
// messages, the identity chip, and the status card all render the same thing.
//
// Precedence: a selected catalog creature/character (window.AVATAR_CONFIG) →
// the DiceBear custom avatar → null (caller shows an initial fallback).
//
// Safe for existing users: selectedAvatarId is only ever a catalog id once a
// student picks a creature, so this returns the DiceBear URL exactly as before
// until then.

/**
 * @param {Object} user - user-like object (needs selectedAvatarId + avatar.dicebearUrl)
 * @returns {string|null} image URL, or null if the caller should show an initial
 */
export function resolveAvatarUrl(user) {
    if (!user) return null;
    const cfg = (typeof window !== 'undefined' && window.AVATAR_CONFIG) || {};
    const id = user.selectedAvatarId;
    if (id && cfg[id]) {
        const img = cfg[id].image;
        // Absolute paths (e.g. student presets under /images/students/) are used
        // as-is; bare filenames resolve against the creature art dir.
        return img.charAt(0) === '/' ? img : `/images/avatars/${img}`;
    }
    if (user.avatar && user.avatar.dicebearUrl) return user.avatar.dicebearUrl;
    return null;
}
