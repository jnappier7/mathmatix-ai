// modules/cosmeticsApply.js
// Applies a user's equipped cosmetics to the page by stamping body attributes;
// CSS in public/css/cosmetics.css keys off those attributes. A no-op for anyone
// whose slots are all 'default' (i.e. everyone until they equip something), so
// this is safe to call unconditionally on load.
//
// Precedence note: base modes (user.theme light/dark/high-contrast) and IEP /
// reduced-motion overrides must win over cosmetics — cosmetics.css is loaded
// before those so they cascade last.

const SLOT_ATTR = {
    theme: 'data-theme-skin',      // avoid clashing with the base `theme` mode
    bubble: 'data-skin-bubble',    // student's own chat message bubbles
    avatarFrame: 'data-skin-avatarframe', // ring around the avatar
    board: 'data-skin-board',
    calculator: 'data-skin-calculator',
    header: 'data-skin-header',
};

function setAttr(name, value) {
    const b = document.body;
    if (!value || value === 'default') b.removeAttribute(name);
    else b.setAttribute(name, value); // full catalog id, e.g. "theme.sunset"
}

/** Apply a loadout object ({ slot: itemId }) directly. Used for live shop
 *  previews, where we stamp a temporary loadout without touching the server. */
export function applyLoadout(equipped) {
    const eq = equipped || {};
    Object.keys(SLOT_ATTR).forEach(slot => setAttr(SLOT_ATTR[slot], eq[slot]));
}

/** Apply the user's equipped loadout. Safe to call repeatedly. */
export function applyCosmetics(user) {
    applyLoadout((user && user.equippedCosmetics) || {});
}

if (typeof window !== 'undefined') {
    window.applyCosmetics = applyCosmetics;
    window.applyLoadout = applyLoadout;
}
