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

const SLOTS = ['theme', 'bubble', 'avatarFrame', 'board', 'calculator', 'header'];

// Cosmetics catalog. Everything here renders from PURE CSS (public/css/cosmetics.css)
// keyed off body attributes — no art assets required — so equipping anything
// produces an instant, visible change on the chat surface. That's the whole point:
// it's the "hey, how did you get that?!" flex a friend notices over your shoulder.
//
// Item shape: { slot, name, price, rarity, skinClass, unlockLevel? }
//   • price      — Coins (utils/coinEngine.js). Roughly rarity-tiered.
//   • rarity     — common | rare | epic | legendary (drives the card shimmer).
//   • unlockLevel— optional level gate; pairs the store chase with the XP chase.
//   • skinClass  — legacy descriptor; the live styling keys off the catalog id
//                  attribute (data-skin-*), so this is documentation only.
const CATALOG = {
    // ---- Whole-UI accent themes (data-theme-skin) ----
    'theme.bubblegum': { slot: 'theme', name: 'Bubblegum',   price: 200, rarity: 'common',    skinClass: 'theme-bubblegum' },
    'theme.forest':    { slot: 'theme', name: 'Deep Forest',  price: 200, rarity: 'common',    skinClass: 'theme-forest' },
    'theme.sunset':    { slot: 'theme', name: 'Sunset',       price: 250, rarity: 'rare',      skinClass: 'theme-sunset' },
    'theme.ocean':     { slot: 'theme', name: 'Ocean',        price: 250, rarity: 'rare',      skinClass: 'theme-ocean' },
    'theme.neon':      { slot: 'theme', name: 'Neon Night',   price: 400, rarity: 'epic',      skinClass: 'theme-neon' },
    'theme.galaxy':    { slot: 'theme', name: 'Galaxy',       price: 500, rarity: 'epic',      skinClass: 'theme-galaxy' },
    'theme.gold':      { slot: 'theme', name: 'Solid Gold',   price: 900, rarity: 'legendary', skinClass: 'theme-gold', unlockLevel: 10 },

    // ---- Your chat bubbles (data-skin-bubble) — the student's own messages ----
    'bubble.gradient': { slot: 'bubble', name: 'Gradient Pop',   price: 150, rarity: 'common',    skinClass: 'skin-bubble-gradient' },
    'bubble.glass':    { slot: 'bubble', name: 'Frosted Glass',  price: 250, rarity: 'rare',      skinClass: 'skin-bubble-glass' },
    'bubble.gold':     { slot: 'bubble', name: 'Gold Trim',      price: 450, rarity: 'epic',      skinClass: 'skin-bubble-gold' },
    'bubble.holo':     { slot: 'bubble', name: 'Holographic',    price: 900, rarity: 'legendary', skinClass: 'skin-bubble-holo', unlockLevel: 15 },

    // ---- Avatar frames (data-skin-avatarframe) — ring around your avatar ----
    'frame.silver':    { slot: 'avatarFrame', name: 'Silver Ring',   price: 150, rarity: 'common',    skinClass: 'skin-frame-silver' },
    'frame.gold':      { slot: 'avatarFrame', name: 'Gold Ring',     price: 300, rarity: 'rare',      skinClass: 'skin-frame-gold' },
    'frame.neon':      { slot: 'avatarFrame', name: 'Neon Pulse',    price: 450, rarity: 'epic',      skinClass: 'skin-frame-neon' },
    'frame.rainbow':   { slot: 'avatarFrame', name: 'Rainbow Halo',  price: 800, rarity: 'legendary', skinClass: 'skin-frame-rainbow', unlockLevel: 12 },

    // ---- Board skins (data-skin-board) ----
    'board.grid':     { slot: 'board',      name: 'Blueprint Grid',      price: 150, rarity: 'common', skinClass: 'skin-board-grid' },
    'board.chalk':    { slot: 'board',      name: 'Chalkboard',          price: 200, rarity: 'common', skinClass: 'skin-board-chalk' },
    'board.cheetah':  { slot: 'board',      name: 'Cheetah Print Board', price: 250, rarity: 'rare',   skinClass: 'skin-board-cheetah' },

    // ---- Calculator skins (data-skin-calculator) ----
    // Since the three calculators were consolidated onto one component, a skin
    // here paints chat, the ACT practice test AND /calculator.html at once —
    // so these are worth more to a student than they used to be, and the
    // ladder now runs common -> legendary rather than stopping at rare.
    'calc.hotpink':   { slot: 'calculator', name: 'Hot Pink Calculator', price: 150, rarity: 'common',    skinClass: 'skin-calc-hotpink' },
    'calc.carbon':    { slot: 'calculator', name: 'Carbon Fiber',        price: 250, rarity: 'rare',      skinClass: 'skin-calc-carbon' },
    'calc.sunset':    { slot: 'calculator', name: 'Sunset Fade',         price: 350, rarity: 'rare',      skinClass: 'skin-calc-sunset' },
    'calc.arcade':    { slot: 'calculator', name: 'Arcade Cabinet',      price: 500, rarity: 'epic',      skinClass: 'skin-calc-arcade' },
    'calc.aurora':    { slot: 'calculator', name: 'Aurora',              price: 850, rarity: 'legendary', skinClass: 'skin-calc-aurora', unlockLevel: 12 },

    // ---- Header skins (data-skin-header) ----
    'header.camo':    { slot: 'header',      name: 'Camo Header',         price: 200, rarity: 'common', skinClass: 'skin-header-camo' },
    'header.wave':    { slot: 'header',      name: 'Wave Header',         price: 200, rarity: 'common', skinClass: 'skin-header-wave' },
};

const DEFAULT_LOADOUT = {
    theme: 'default', bubble: 'default', avatarFrame: 'default',
    board: 'default', calculator: 'default', header: 'default',
};

// How long after buying a cosmetic the student can still Undo it (full refund).
// Long enough to fix a misclick or buyer's remorse; short enough that you can't
// "rent" a legendary for a session and refund it. Undo only ever targets the most
// recent purchase.
const REFUND_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

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
    // Record the buy so it can be undone (one-tap refund of the most recent purchase).
    user.wallet.lastPurchase = { itemId, price: item.price, at: new Date() };

    if (typeof user.markModified === 'function') {
        user.markModified('wallet');
        user.markModified('ownedCosmetics');
    }
    return { ok: true, coins: user.wallet.coins, owned: user.ownedCosmetics };
}

/**
 * Is the given item currently undoable (i.e. it's the most recent purchase and
 * still inside the refund window)? Pure check, no mutation.
 * @param {number} [now=Date.now()]
 * @returns {{ok:boolean, reason?:string}}
 */
function canRefund(user, itemId, now = Date.now()) {
    if (!user) return { ok: false, reason: 'no_user' };
    const lp = user.wallet && user.wallet.lastPurchase;
    if (!lp || !lp.itemId) return { ok: false, reason: 'nothing_to_undo' };
    if (lp.itemId !== itemId) return { ok: false, reason: 'not_last_purchase' };
    if (!(user.ownedCosmetics || []).includes(itemId)) return { ok: false, reason: 'not_owned' };
    const at = lp.at ? new Date(lp.at).getTime() : 0;
    if (!at || (now - at) > REFUND_WINDOW_MS) return { ok: false, reason: 'window_expired' };
    return { ok: true };
}

/**
 * Undo the most recent purchase: refund the coins, drop ownership, unequip it if
 * worn, and clear the undo record. Validates first; no-op on failure.
 * @returns {{ok:boolean, reason?:string, coins:number, owned?:string[], equipped?:object, refundedItemId?:string}}
 */
function applyRefund(user, itemId, now = Date.now()) {
    const check = canRefund(user, itemId, now);
    if (!check.ok) return { ok: false, reason: check.reason, coins: (user && user.wallet && user.wallet.coins) || 0 };

    const item = getItem(itemId);
    const price = (user.wallet.lastPurchase && user.wallet.lastPurchase.price) || (item ? item.price : 0);

    // Refund coins.
    user.wallet.coins = (user.wallet.coins || 0) + price;
    // Drop ownership.
    user.ownedCosmetics = (user.ownedCosmetics || []).filter(id => id !== itemId);
    // Unequip if it was worn.
    if (item && user.equippedCosmetics && user.equippedCosmetics[item.slot] === itemId) {
        user.equippedCosmetics[item.slot] = 'default';
    }
    // Consume the undo — only the single most recent purchase is ever refundable.
    user.wallet.lastPurchase = { itemId: null, price: 0, at: null };

    if (typeof user.markModified === 'function') {
        user.markModified('wallet');
        user.markModified('ownedCosmetics');
        user.markModified('equippedCosmetics');
    }
    return { ok: true, coins: user.wallet.coins, owned: user.ownedCosmetics, equipped: user.equippedCosmetics, refundedItemId: itemId };
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
    REFUND_WINDOW_MS,
    getItem,
    canPurchase,
    applyPurchase,
    canRefund,
    applyRefund,
    canEquip,
    applyEquip,
};
