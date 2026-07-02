/**
 * COSMETICS CATALOG + purchase/equip logic (server-authoritative).
 *
 * Cosmetics are bought with earned Coins (utils/coinEngine.js) and are purely
 * visual — zero effect on tutoring, grading, XP, or progression. This module is
 * the single source of truth for the catalog and the ONLY place that debits
 * coins / mutates ownership + loadout. Logic is pure and testable; routes are a
 * thin wrapper. Callers are responsible for user.save().
 *
 * See docs/COSMETICS_SHOP_DESIGN.md.
 *
 * @module cosmeticsCatalog
 */

const SLOTS = ['theme', 'board', 'calculator', 'header'];

// v1 starter catalog. Token-based themes work with no new art; pattern skins
// (cheetah/camo/etc.) reference art that ships with the shop UI later.
const CATALOG = {
    'theme.sunset':   { slot: 'theme',      name: 'Sunset',              price: 250, rarity: 'rare',   skinClass: 'theme-sunset' },
    'theme.neon':     { slot: 'theme',      name: 'Neon Night',          price: 400, rarity: 'epic',   skinClass: 'theme-neon' },
    'board.cheetah':  { slot: 'board',      name: 'Cheetah Print Board', price: 250, rarity: 'rare',   skinClass: 'skin-board-cheetah' },
    'calc.hotpink':   { slot: 'calculator', name: 'Hot Pink Calculator', price: 150, rarity: 'common', skinClass: 'skin-calc-hotpink' },
    'header.camo':    { slot: 'header',      name: 'Camo Header',         price: 200, rarity: 'common', skinClass: 'skin-header-camo' },
};

const DEFAULT_LOADOUT = { theme: 'default', board: 'default', calculator: 'default', header: 'default' };

function getItem(itemId) {
    return CATALOG[itemId] || null;
}

/**
 * Can this user buy this item? Pure check, no mutation.
 * @returns {{ok:boolean, reason?:string}}
 */
function canPurchase(user, itemId) {
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'unknown_item' };
    if (!user) return { ok: false, reason: 'no_user' };
    const owned = user.ownedCosmetics || [];
    if (owned.includes(itemId)) return { ok: false, reason: 'already_owned' };
    if (item.unlockLevel && (user.level || 1) < item.unlockLevel) {
        return { ok: false, reason: 'level_locked' };
    }
    const coins = (user.wallet && user.wallet.coins) || 0;
    if (coins < item.price) return { ok: false, reason: 'insufficient_coins' };
    return { ok: true };
}

/**
 * Debit coins and grant ownership. Validates first; no-op on failure.
 * @returns {{ok:boolean, reason?:string, coins:number, owned?:string[]}}
 */
function applyPurchase(user, itemId) {
    const check = canPurchase(user, itemId);
    if (!check.ok) return { ok: false, reason: check.reason, coins: (user && user.wallet && user.wallet.coins) || 0 };

    const item = getItem(itemId);
    if (!user.wallet) user.wallet = { coins: 0, lifetimeEarned: 0, dailyEarned: 0 };
    user.wallet.coins = Math.max(0, (user.wallet.coins || 0) - item.price);
    if (!Array.isArray(user.ownedCosmetics)) user.ownedCosmetics = [];
    user.ownedCosmetics.push(itemId);

    if (typeof user.markModified === 'function') {
        user.markModified('wallet');
        user.markModified('ownedCosmetics');
    }
    return { ok: true, coins: user.wallet.coins, owned: user.ownedCosmetics };
}

/**
 * Can this user equip itemId in slot? 'default' (unequip) is always allowed.
 * @returns {{ok:boolean, reason?:string}}
 */
function canEquip(user, slot, itemId) {
    if (!SLOTS.includes(slot)) return { ok: false, reason: 'unknown_slot' };
    if (itemId === 'default' || itemId == null) return { ok: true };
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'unknown_item' };
    if (item.slot !== slot) return { ok: false, reason: 'wrong_slot' };
    const owned = (user && user.ownedCosmetics) || [];
    if (!owned.includes(itemId)) return { ok: false, reason: 'not_owned' };
    return { ok: true };
}

/**
 * Set the equipped item for a slot. Validates first; no-op on failure.
 * @returns {{ok:boolean, reason?:string, equipped?:object}}
 */
function applyEquip(user, slot, itemId) {
    const check = canEquip(user, slot, itemId);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (!user.equippedCosmetics) user.equippedCosmetics = { ...DEFAULT_LOADOUT };
    user.equippedCosmetics[slot] = itemId || 'default';
    if (typeof user.markModified === 'function') user.markModified('equippedCosmetics');
    return { ok: true, equipped: user.equippedCosmetics };
}

module.exports = {
    SLOTS,
    CATALOG,
    DEFAULT_LOADOUT,
    getItem,
    canPurchase,
    applyPurchase,
    canEquip,
    applyEquip,
};
