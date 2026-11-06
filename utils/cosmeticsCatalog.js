/**
 * COSMETICS CATALOG + purchase/equip logic (server-authoritative).
 *
 * Cosmetics are bought with earned Coins (utils/coinEngine.js) and are purely
 * visual — zero effect on tutoring, grading, XP, or progression. This module is
 * the single source of truth for the catalog and the ONLY place that debits
 * coins / mutates ownership + loadout. Logic is pure and testable; routes are a
 * thin wrapper. Callers are responsible for user.save().
 *
 * @module cosmeticsCatalog
 */

const TUTOR_CONFIG = require('./tutorConfig');
const { canSelectTutor, ownsTutor, isPurchasableTutor, FALLBACK_TUTOR_ID } = require('./tutorAccess');

// Visual loadout slots. 'tutor' is deliberately NOT one of these: a tutor isn't
// a skin in equippedCosmetics — owning one writes user.unlockedItems and
// "equipping" it writes user.selectedTutorId. See TUTOR_ITEMS below.
const SLOTS = ['theme', 'bubble', 'avatarFrame', 'board', 'calculator', 'header'];
const TUTOR_SLOT = 'tutor';

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

// ---- Shop tutors (slot 'tutor') ----
// Built from the purchasable:true entries in tutorConfig.js, so price and
// persona live in one place. Coins are the only way to get one (owner decision
// 2026-11-05) — the earned unlock in utils/unlockTutors.js skips them.
// A low level floor stops a brand-new account spending its welcome bonus on a
// tutor before it has met the free ones.
const TUTOR_SHOP_MIN_LEVEL = 3;
const tutorItemId = (tutorId) => `tutor.${tutorId}`;
const TUTOR_ITEMS = Object.fromEntries(
    Object.entries(TUTOR_CONFIG)
        .filter(([id]) => isPurchasableTutor(id))
        .map(([id, t]) => [tutorItemId(id), {
            slot: TUTOR_SLOT,
            name: t.name,
            price: t.shopPrice,
            rarity: t.shopRarity || 'epic',
            unlockLevel: TUTOR_SHOP_MIN_LEVEL,
            tutorId: id,
            image: t.image,
            catchphrase: t.catchphrase,
            specialties: t.specialties,
        }])
);

const DEFAULT_LOADOUT = {
    theme: 'default', bubble: 'default', avatarFrame: 'default',
    board: 'default', calculator: 'default', header: 'default',
};

// How long after buying a cosmetic the student can still Undo it (full refund).
// Long enough to fix a misclick or buyer's remorse; short enough that you can't
// "rent" a legendary for a session and refund it. Undo only ever targets the most
// recent purchase.
const REFUND_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

const hasOwn = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

function getItem(itemId) {
    if (hasOwn(CATALOG, itemId)) return CATALOG[itemId];
    if (hasOwn(TUTOR_ITEMS, itemId)) return TUTOR_ITEMS[itemId];
    return null;
}

/** Does the user own this item? Tutors live in unlockedItems, skins in ownedCosmetics. */
function isOwned(user, itemId, item = getItem(itemId)) {
    if (!item || !user) return false;
    if (item.slot === TUTOR_SLOT) return ownsTutor(user, item.tutorId);
    return (user.ownedCosmetics || []).includes(itemId);
}

/**
 * Can this user buy this item? Pure check, no mutation.
 * @returns {{ok:boolean, reason?:string}}
 */
function canPurchase(user, itemId) {
    const item = getItem(itemId);
    if (!item) return { ok: false, reason: 'unknown_item' };
    if (!user) return { ok: false, reason: 'no_user' };
    if (isOwned(user, itemId, item)) return { ok: false, reason: 'already_owned' };
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
    if (item.slot === TUTOR_SLOT) {
        if (!Array.isArray(user.unlockedItems)) user.unlockedItems = [];
        user.unlockedItems.push(item.tutorId);
    } else {
        if (!Array.isArray(user.ownedCosmetics)) user.ownedCosmetics = [];
        user.ownedCosmetics.push(itemId);
    }
    // Record the buy so it can be undone (one-tap refund of the most recent purchase).
    // prevTutorId lets an Undo put the student back on the tutor they had, if
    // they switched to the one they just bought.
    user.wallet.lastPurchase = {
        itemId, price: item.price, at: new Date(),
        prevTutorId: item.slot === TUTOR_SLOT ? (user.selectedTutorId || null) : null,
    };

    if (typeof user.markModified === 'function') {
        user.markModified('wallet');
        user.markModified(item.slot === TUTOR_SLOT ? 'unlockedItems' : 'ownedCosmetics');
    }
    return { ok: true, coins: user.wallet.coins, owned: ownedIds(user) };
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
    if (!isOwned(user, itemId)) return { ok: false, reason: 'not_owned' };
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
    const prevTutorId = user.wallet.lastPurchase && user.wallet.lastPurchase.prevTutorId;
    if (item && item.slot === TUTOR_SLOT) {
        // Drop ownership, and if they're talking to that tutor right now, put
        // them back on the one they had before buying (or the house default).
        user.unlockedItems = (user.unlockedItems || []).filter(id => id !== item.tutorId);
        if (user.selectedTutorId === item.tutorId) {
            user.selectedTutorId = prevTutorId && canSelectTutor(user, prevTutorId) ? prevTutorId : FALLBACK_TUTOR_ID;
        }
    } else {
        // Drop ownership.
        user.ownedCosmetics = (user.ownedCosmetics || []).filter(id => id !== itemId);
        // Unequip if it was worn.
        if (item && user.equippedCosmetics && user.equippedCosmetics[item.slot] === itemId) {
            user.equippedCosmetics[item.slot] = 'default';
        }
    }
    // Consume the undo — only the single most recent purchase is ever refundable.
    user.wallet.lastPurchase = { itemId: null, price: 0, at: null, prevTutorId: null };

    if (typeof user.markModified === 'function') {
        user.markModified('wallet');
        user.markModified('ownedCosmetics');
        user.markModified('equippedCosmetics');
        user.markModified('unlockedItems');
    }
    return {
        ok: true, coins: user.wallet.coins, owned: ownedIds(user), equipped: equippedView(user),
        refundedItemId: itemId, selectedTutorId: user.selectedTutorId || null,
    };
}

/**
 * Can this user equip itemId in slot? 'default' (unequip) is always allowed.
 * @returns {{ok:boolean, reason?:string}}
 */
function canEquip(user, slot, itemId) {
    if (slot === TUTOR_SLOT) {
        // There is no "no tutor" — switching is the only move, and only to one you can select.
        const item = getItem(itemId);
        const tutorId = item && item.slot === TUTOR_SLOT ? item.tutorId
            : (typeof itemId === 'string' && itemId.startsWith('tutor.') ? itemId.slice(6) : null);
        if (!tutorId) return { ok: false, reason: 'unknown_item' };
        if (!canSelectTutor(user, tutorId)) return { ok: false, reason: 'not_owned' };
        return { ok: true, tutorId };
    }
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
    if (slot === TUTOR_SLOT) {
        user.selectedTutorId = check.tutorId;
        return { ok: true, equipped: equippedView(user), selectedTutorId: check.tutorId };
    }
    if (!user.equippedCosmetics) user.equippedCosmetics = { ...DEFAULT_LOADOUT };
    user.equippedCosmetics[slot] = itemId || 'default';
    if (typeof user.markModified === 'function') user.markModified('equippedCosmetics');
    return { ok: true, equipped: user.equippedCosmetics };
}

/** Every owned shop id: skins from ownedCosmetics + `tutor.<id>` for owned shop tutors. */
function ownedIds(user) {
    const skins = (user && user.ownedCosmetics) || [];
    const tutors = Object.keys(TUTOR_ITEMS).filter(id => isOwned(user, id));
    return skins.concat(tutors);
}

/** The loadout as the shop sees it: the skin slots plus `tutor` = the current tutor's item id. */
function equippedView(user) {
    const out = { ...DEFAULT_LOADOUT, ...((user && user.equippedCosmetics) || {}) };
    const sel = user && user.selectedTutorId;
    out.tutor = sel ? tutorItemId(sel) : null;
    return out;
}

module.exports = {
    TUTOR_SLOT,
    TUTOR_ITEMS,
    TUTOR_SHOP_MIN_LEVEL,
    ownedIds,
    equippedView,
    isOwned,
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
