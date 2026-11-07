// Unlocking SESSIONS with a tutor for Coins (shop slot "tutor") and the
// selection gate that makes the unlock mean something. Coins pay for the
// coaching, never the person — the copy tests below pin that wording. See utils/cosmeticsCatalog.js TUTOR_ITEMS
// and utils/tutorAccess.js.
const TUTOR_CONFIG = require('../../utils/tutorConfig');
const {
    TUTOR_ITEMS, TUTOR_SHOP_MIN_LEVEL, CATALOG,
    getItem, canPurchase, applyPurchase, canRefund, applyRefund,
    canEquip, applyEquip, ownedIds, equippedView,
} = require('../../utils/cosmeticsCatalog');
const { canSelectTutor, FALLBACK_TUTOR_ID } = require('../../utils/tutorAccess');
const { getTutorsToUnlock } = require('../../utils/unlockTutors');

const student = (over = {}) => ({
    level: 5,
    wallet: { coins: 5000 },
    ownedCosmetics: [],
    unlockedItems: [],
    selectedTutorId: 'bob',
    ...over,
});

describe('shop tutors come from tutorConfig', () => {
    const shopIds = Object.keys(TUTOR_CONFIG).filter(id => TUTOR_CONFIG[id].purchasable);

    test('all 7 extra tutors are for sale, and no core tutor is', () => {
        expect(shopIds.sort()).toEqual(
            ['dr-g', 'mr-lee', 'mr-sierawski', 'mr-wiggles', 'ms-alex', 'ms-rashida', 'prof-davies']);
        expect(Object.keys(TUTOR_ITEMS).sort()).toEqual(shopIds.map(id => `tutor.${id}`).sort());
        for (const id of ['bob', 'maya', 'ms-maria', 'mr-nappier']) {
            expect(TUTOR_ITEMS[`tutor.${id}`]).toBeUndefined();
        }
    });

    test('every shop tutor has a price, voice and portrait — and no rarity tier', () => {
        for (const item of Object.values(TUTOR_ITEMS)) {
            expect(item.slot).toBe('tutor');
            expect(item.price).toBeGreaterThan(0);
            expect(item.rarity).toBeUndefined();
            expect(TUTOR_CONFIG[item.tutorId].shopRarity).toBeUndefined();
            expect(item.unlockLevel).toBe(TUTOR_SHOP_MIN_LEVEL);
            expect(item.image).toBeTruthy();
            expect(TUTOR_CONFIG[item.tutorId].cartesiaVoiceId).toBeTruthy();
        }
    });

    test('tutor ids never collide with skin ids', () => {
        for (const id of Object.keys(TUTOR_ITEMS)) expect(CATALOG[id]).toBeUndefined();
    });

    test('coins are the only way in — the earned unlock never grants a shop tutor', () => {
        const maxed = [{ behavior: 'persistence', count: 99 }, { behavior: 'taught_back', count: 99 }];
        expect(getTutorsToUnlock(99, [], maxed)).toEqual([]);
    });

    test('getItem does not resolve prototype keys', () => {
        expect(getItem('__proto__')).toBeNull();
        expect(getItem('constructor')).toBeNull();
    });
});

describe('selecting a tutor', () => {
    test('core tutors are open to everyone', () => {
        expect(canSelectTutor(student(), 'maya')).toBe(true);
        expect(canSelectTutor(student(), FALLBACK_TUTOR_ID)).toBe(true);
    });

    test('a shop tutor is locked until owned', () => {
        expect(canSelectTutor(student(), 'mr-wiggles')).toBe(false);
        expect(canSelectTutor(student({ unlockedItems: ['mr-wiggles'] }), 'mr-wiggles')).toBe(true);
    });

    test('unknown or junk ids are refused', () => {
        for (const id of ['nobody', '', null, undefined, 42, '__proto__', 'toString']) {
            expect(canSelectTutor(student(), id)).toBe(false);
        }
    });
});

describe('unlocking sessions with a tutor', () => {
    test('debits coins and writes unlockedItems, not ownedCosmetics', () => {
        const u = student();
        const price = TUTOR_ITEMS['tutor.ms-rashida'].price;
        const r = applyPurchase(u, 'tutor.ms-rashida');
        expect(r.ok).toBe(true);
        expect(u.wallet.coins).toBe(5000 - price);
        expect(u.unlockedItems).toEqual(['ms-rashida']);
        expect(u.ownedCosmetics).toEqual([]);
        expect(r.owned).toContain('tutor.ms-rashida');
        // Buying does not switch you — that's a separate, free choice.
        expect(u.selectedTutorId).toBe('bob');
    });

    test('below the level floor it is locked', () => {
        expect(canPurchase(student({ level: TUTOR_SHOP_MIN_LEVEL - 1 }), 'tutor.ms-rashida'))
            .toEqual({ ok: false, reason: 'level_locked' });
        expect(canPurchase(student({ level: TUTOR_SHOP_MIN_LEVEL }), 'tutor.ms-rashida').ok).toBe(true);
    });

    test('cannot be bought twice — including a tutor earned under the old system', () => {
        expect(canPurchase(student({ unlockedItems: ['mr-lee'] }), 'tutor.mr-lee'))
            .toEqual({ ok: false, reason: 'already_owned' });
    });

    test('needs the coins', () => {
        expect(canPurchase(student({ wallet: { coins: 10 } }), 'tutor.mr-wiggles'))
            .toEqual({ ok: false, reason: 'insufficient_coins' });
    });
});

describe('switching to a tutor via the shop', () => {
    test('only an owned tutor can be equipped, and equipping sets selectedTutorId', () => {
        const u = student();
        expect(canEquip(u, 'tutor', 'tutor.mr-lee')).toEqual({ ok: false, reason: 'not_owned' });
        u.unlockedItems.push('mr-lee');
        const r = applyEquip(u, 'tutor', 'tutor.mr-lee');
        expect(r.ok).toBe(true);
        expect(u.selectedTutorId).toBe('mr-lee');
        expect(r.equipped.tutor).toBe('tutor.mr-lee');
    });

    test('there is no "unequip" for a tutor', () => {
        expect(canEquip(student(), 'tutor', 'default').ok).toBe(false);
    });

    test('equippedView and ownedIds expose the tutor alongside skins', () => {
        const u = student({ ownedCosmetics: ['theme.ocean'], unlockedItems: ['ms-alex'], selectedTutorId: 'ms-alex' });
        expect(ownedIds(u)).toEqual(['theme.ocean', 'tutor.ms-alex']);
        expect(equippedView(u).tutor).toBe('tutor.ms-alex');
        expect(equippedView(u).theme).toBe('default');
    });
});

describe('undoing a session unlock', () => {
    test('refunds, drops ownership, and puts them back on their previous tutor', () => {
        const u = student({ selectedTutorId: 'maya' });
        applyPurchase(u, 'tutor.prof-davies');
        applyEquip(u, 'tutor', 'tutor.prof-davies');
        expect(canRefund(u, 'tutor.prof-davies').ok).toBe(true);
        const r = applyRefund(u, 'tutor.prof-davies');
        expect(r.ok).toBe(true);
        expect(u.wallet.coins).toBe(5000);
        expect(u.unlockedItems).toEqual([]);
        expect(u.selectedTutorId).toBe('maya');
        expect(r.selectedTutorId).toBe('maya');
        expect(canSelectTutor(u, 'prof-davies')).toBe(false);
    });

    test('falls back to the house tutor when there was no previous one', () => {
        const u = student({ selectedTutorId: undefined });
        applyPurchase(u, 'tutor.ms-alex');
        applyEquip(u, 'tutor', 'tutor.ms-alex');
        applyRefund(u, 'tutor.ms-alex');
        expect(u.selectedTutorId).toBe(FALLBACK_TUTOR_ID);
    });

    test('leaves the current tutor alone if they never switched', () => {
        const u = student({ selectedTutorId: 'bob' });
        applyPurchase(u, 'tutor.ms-alex');
        applyRefund(u, 'tutor.ms-alex');
        expect(u.selectedTutorId).toBe('bob');
    });
});

describe('PATCH /api/user/settings enforces ownership', () => {
    // The settings route is the only self-serve writer of selectedTutorId. It
    // used to store whatever id it was sent, which would make a paid tutor
    // free to anyone who opened devtools. Pin that the gate sits in front of
    // the allowlist loop that writes the field.
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../config/routes.js'), 'utf8');
    const start = src.indexOf("app.patch('/api/user/settings'");
    const handler = src.slice(start, src.indexOf('app.get(', start));

    test('the handler checks canSelectTutor before writing fields', () => {
        expect(start).toBeGreaterThan(-1);
        const gate = handler.indexOf('canSelectTutor(user, req.body.selectedTutorId)');
        const write = handler.indexOf('user[key] = req.body[key]');
        expect(gate).toBeGreaterThan(-1);
        expect(write).toBeGreaterThan(gate);
        expect(handler).toMatch(/status\(403\)/);
    });
});

describe('copy: coins pay for sessions, never for a person', () => {
    // Owner rule (2026-11-05). These are the strings a student reads on the
    // two surfaces that sell tutor sessions.
    const fs = require('fs');
    const path = require('path');
    const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
    const shop = read('public/js/modules/shop.js');
    const tutorCard = shop.slice(shop.indexOf('function tutorCardHTML'), shop.indexOf('function itemCardHTML'));
    const picker = read('public/js/pick-tutor.js');
    const shelf = picker.slice(picker.indexOf('function renderLocked'), picker.indexOf('/* -------- KICKOFF'));

    test('the tutor card says "Unlock sessions", shows no rarity, and never "buy/own"', () => {
        expect(tutorCard).toMatch(/Unlock sessions/);
        expect(tutorCard).not.toMatch(/item\.rarity|shop-rarity/);
        expect(tutorCard).not.toMatch(/>[^<]*\b(buy|bought|own|owned|purchase)\b[^<]*</i);
    });

    test('the undo bar says sessions were unlocked for a tutor', () => {
        expect(shop).toMatch(/Unlocked sessions with \$\{itemName\}/);
    });

    test('the picker shelf sells sessions and shows faces without a padlock', () => {
        expect(shelf).toMatch(/unlock sessions with coins/i);
        expect(shelf).not.toMatch(/fa-lock/);
        expect(read('public/css/tutor-picker.css')).not.toMatch(/\.tp-lock-portrait img[^}]*grayscale/);
    });
});

describe('every selectable tutor has current-style art on disk', () => {
    // The picker renders <id>-fullBody (.webp first) for every tutor in the
    // lineup, and the shop / shelf / chat avatar render tutorConfig.image. A
    // missing file is a silent broken image, so pin both, plus the shared
    // 961x1637 canvas the lineup's baseline depends on.
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../public/images/tutor_avatars');
    const pngSize = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    const selectable = Object.entries(TUTOR_CONFIG).filter(([id, t]) => id !== 'default' && t.active !== false);

    test.each(selectable.map(([id]) => id))('%s', (id) => {
        for (const ext of ['png', 'webp']) {
            expect(fs.existsSync(path.join(dir, `${id}-fullBody.${ext}`))).toBe(true);
        }
        expect(pngSize(path.join(dir, `${id}-fullBody.png`))).toEqual([961, 1637]);
        const img = TUTOR_CONFIG[id].image;
        for (const ext of ['png', 'webp']) {
            expect(fs.existsSync(path.join(dir, img.replace(/\.png$/, `.${ext}`)))).toBe(true);
        }
    });

    // The chat hero (and chat message avatars, via getTutorPortraitSrc) use the
    // seated desk portrait from HERO_PORTRAIT_OVERRIDES; a tutor missing from
    // that map falls back to the small bust, stretched into the hero frame.
    const redesign = fs.readFileSync(path.join(__dirname, '../../public/js/chat-redesign.js'), 'utf8');
    test.each(selectable.map(([id]) => id))('%s has a desk hero wired into the chat page', (id) => {
        expect(redesign).toContain(`'${id}': '${id}-new2.png'`);
        for (const ext of ['png', 'webp']) {
            expect(fs.existsSync(path.join(dir, `${id}-new2.${ext}`))).toBe(true);
        }
        expect(pngSize(path.join(dir, `${id}-new2.png`))).toEqual([1536, 1024]);
    });
});

describe('Dr. G is a gorilla character, never a person of any human heritage', () => {
    // His art is a gorilla. When his bio was a Nigerian-American man, the
    // product showed a Black man as an ape — the racist trope. The fix is the
    // bio (owner decision 2026-11-06): no nationality, ethnicity, race or human
    // hometown, and the prompt forbids him from claiming one.
    const g = TUTOR_CONFIG['dr-g'];
    const GUARD = 'never give yourself a human nationality, ethnicity, race or hometown';
    // Everything he says about himself, minus the guard sentence (which has to name what it forbids).
    const text = [g.personality.replace(GUARD, ''), g.humanBehaviors, g.about, g.specialties, g.culturalBackground, g.voicePreview].join(' ');

    test('his bio says he is a gorilla', () => {
        expect(g.culturalBackground).toMatch(/gorilla/i);
        expect(g.about).toMatch(/gorilla/i);
    });

    test('nothing gives him a human nationality, ethnicity or race', () => {
        expect(text).not.toMatch(/\b(nigeria\w*|lagos|houston|texas|african|black (man|students?|person)|american|ethnic\w*|heritage|immigra\w*)\b/i);
    });

    test('his prompt tells him not to claim one', () => {
        expect(g.personality).toContain(GUARD);
    });
});
