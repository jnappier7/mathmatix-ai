/**
 * AVATAR CATALOG — the selectable student avatar set (revives the shelved
 * Blooket-style art in public/images/avatars/). CANONICAL source of truth;
 * the client mirrors it in public/js/avatar-config-data.js (keep in sync).
 *
 * Coexists with DiceBear: DiceBear stays the free-form "create your own" avatar;
 * these are pickable characters/creatures. A user's choice is stored in
 * `user.selectedAvatarId` — when it's a key in this catalog, the creature art
 * renders; otherwise the DiceBear avatar (or initial) is used.
 *
 * Gating: characters/sports/styles are free (level 1); creatures unlock by level
 * per docs/AVATAR_IMAGES_NEEDED.md — the progression reward.
 *
 * @module avatarCatalog
 */

function titleCase(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Creatures = the leveled progression set (levels per the design doc).
const CREATURE_TIERS = [
    { level: 1,  rarity: 'common',    ids: ['lion', 'dragon', 'panda', 'owl', 'fox', 'tiger'] },
    { level: 5,  rarity: 'uncommon',  ids: ['unicorn', 'penguin', 'wolf'] },
    { level: 10, rarity: 'rare',      ids: ['phoenix', 'shark', 'eagle'] },
    { level: 15, rarity: 'rare',      ids: ['octopus', 'raccoon', 'leopard'] },
    { level: 20, rarity: 'epic',      ids: ['robot', 'alien'] },
    { level: 25, rarity: 'epic',      ids: ['ninja'] },
    { level: 30, rarity: 'legendary', ids: ['wizard', 'dinosaur'] },
];

// Free at level 1 — an immediate, expressive selection for every student.
const CHARACTER_IDS = ['astronaut', 'architect', 'artist', 'bookworm', 'chef', 'coder',
    'dancer', 'filmmaker', 'gamer', 'musician', 'photographer', 'pirate', 'scientist',
    'superhero', 'cheerleader'];
const SPORTS_IDS = ['swimmer', 'gymnast', 'golfer', 'tennis', 'wrestler', 'runner',
    'skateboarder', 'softball', 'volleyball', 'lacrosse', 'fieldhockey', 'figureskater',
    'equestrian', 'yoga'];
const STYLE_IDS = ['concrete', 'wood', 'nature', 'graffiti'];

// Premium human "student" presets — polished bespoke characters in the tutors'
// art style (the glow-up target). Free (level 1). Art files live under
// public/images/avatars/students/; add a preset by (1) dropping the transparent
// PNG there and (2) adding a row here + in the client mirror. The picker
// auto-hides any preset whose art isn't present yet, so it's safe to list a
// preset before its file lands.
const STUDENT_PRESETS = [
    { id: 'student.navy',     name: 'Navy Hoodie',     image: 'students/navy.png' },
    { id: 'student.charcoal', name: 'Charcoal Hoodie', image: 'students/charcoal.png' },
    { id: 'student.lavender', name: 'Lavender Hoodie', image: 'students/lavender.png' },
];

const CATALOG = {};
STUDENT_PRESETS.forEach(p => {
    CATALOG[p.id] = { id: p.id, name: p.name, image: p.image, group: 'student', rarity: 'common', unlockLevel: 1 };
});
CREATURE_TIERS.forEach(tier => tier.ids.forEach(id => {
    CATALOG[id] = { id, name: titleCase(id), image: `${id}.png`, group: 'creature', rarity: tier.rarity, unlockLevel: tier.level };
}));
CHARACTER_IDS.forEach(id => { CATALOG[id] = { id, name: titleCase(id), image: `${id}.png`, group: 'character', rarity: 'common', unlockLevel: 1 }; });
SPORTS_IDS.forEach(id => { CATALOG[id] = { id, name: titleCase(id), image: `${id}.png`, group: 'sports', rarity: 'common', unlockLevel: 1 }; });
STYLE_IDS.forEach(id => { CATALOG[id] = { id, name: titleCase(id), image: `${id}.png`, group: 'style', rarity: 'common', unlockLevel: 1 }; });

function getAvatar(id) {
    return CATALOG[id] || null;
}

function isCatalogAvatar(id) {
    return !!(id && CATALOG[id]);
}

/**
 * Can this user select this avatar? Pure check.
 * @returns {{ok:boolean, reason?:string}}
 */
function canSelectAvatar(user, id) {
    const a = getAvatar(id);
    if (!a) return { ok: false, reason: 'unknown_avatar' };
    if ((user?.level || 1) < a.unlockLevel) return { ok: false, reason: 'level_locked' };
    return { ok: true };
}

module.exports = { CATALOG, getAvatar, isCatalogAvatar, canSelectAvatar, titleCase };
