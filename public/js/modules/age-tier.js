// public/js/modules/age-tier.js
// Age-Adaptive UI Tier System
// Maps student grade level to a UI tier and applies the corresponding
// body class so CSS custom property overrides take effect.
//
// Tiers:
//   k2      — Kindergarten through 2nd grade
//   35      — 3rd through 5th grade
//   68      — 6th through 8th grade
//   9plus   — 9th grade and above (default — no visual overrides)

/**
 * Grade-level string to tier mapping.
 * Handles the gradeLevel values stored in the user model
 * (e.g., 'Kindergarten', '1st Grade', '7th Grade', 'College').
 */
const GRADE_TO_TIER = {
    'kindergarten':  'k2',
    'k':             'k2',
    '1st grade':     'k2',
    '1st':           'k2',
    '2nd grade':     'k2',
    '2nd':           'k2',

    '3rd grade':     '35',
    '3rd':           '35',
    '4th grade':     '35',
    '4th':           '35',
    '5th grade':     '35',
    '5th':           '35',

    '6th grade':     '68',
    '6th':           '68',
    '7th grade':     '68',
    '7th':           '68',
    '8th grade':     '68',
    '8th':           '68',

    '9th grade':     '9plus',
    '9th':           '9plus',
    '10th grade':    '9plus',
    '10th':          '9plus',
    '11th grade':    '9plus',
    '11th':          '9plus',
    '12th grade':    '9plus',
    '12th':          '9plus',
    'college':       '9plus',
    'university':    '9plus',
};

/** All possible tier class names (for clean removal). */
const TIER_CLASSES = ['age-tier-k2', 'age-tier-35', 'age-tier-68', 'age-tier-9plus'];

/**
 * Resolve a user's grade level string to a tier identifier.
 * Falls back to '9plus' (default UI) if grade is unrecognized.
 *
 * @param {string|null|undefined} gradeLevel - The gradeLevel from the user model
 * @returns {'k2'|'35'|'68'|'9plus'} The tier identifier
 */
export function resolveAgeTier(gradeLevel) {
    if (!gradeLevel) return '9plus';
    const normalized = gradeLevel.trim().toLowerCase();
    return GRADE_TO_TIER[normalized] || '9plus';
}

/**
 * Apply the age-adaptive UI tier to the page.
 * Adds the appropriate body class (e.g., 'age-tier-k2') and removes
 * any previously applied tier class.
 *
 * Should be called once during app initialization, after the user
 * object is available.
 *
 * @param {Object} user - The user object from /user endpoint
 * @param {string} [user.gradeLevel] - The student's grade level
 * @param {string} [user.role] - The user's role
 */
export function applyAgeTier(user) {
    // Only apply to students — teachers/parents/admins get default UI
    if (!user || user.role !== 'student') return;

    const tier = resolveAgeTier(user.gradeLevel);
    const tierClass = `age-tier-${tier}`;

    // Remove any existing tier classes first
    document.body.classList.remove(...TIER_CLASSES);

    // Apply the resolved tier
    document.body.classList.add(tierClass);

    console.log(`[AgeTier] Applied tier "${tier}" (grade: ${user.gradeLevel || 'unknown'}) → body.${tierClass}`);
}

/**
 * Get the current active tier from the body class.
 * Useful for JS logic that needs to branch on tier.
 *
 * @returns {'k2'|'35'|'68'|'9plus'|null} Current tier or null if none applied
 */
export function getCurrentTier() {
    for (const cls of TIER_CLASSES) {
        if (document.body.classList.contains(cls)) {
            return cls.replace('age-tier-', '');
        }
    }
    return null;
}

/**
 * Remove all age tier classes from the body.
 * Useful for cleanup or role-switching scenarios.
 */
export function removeAgeTier() {
    document.body.classList.remove(...TIER_CLASSES);
}
