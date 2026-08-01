// tests/unit/cosmeticsCatalog.test.js
// Unit tests for the purchase / refund (Undo) logic in utils/cosmeticsCatalog.js.
// Pure functions — coins are spent/refunded and ownership mutated here, so a
// regression would let students buy free or refund old items, hence coverage.

const {
    DEFAULT_LOADOUT,
    REFUND_WINDOW_MS,
    applyPurchase,
    canRefund,
    applyRefund,
    applyEquip,
} = require('../../utils/cosmeticsCatalog');

function newUser(overrides = {}) {
    return {
        level: 20,
        wallet: { coins: 1000 },
        ownedCosmetics: [],
        equippedCosmetics: { ...DEFAULT_LOADOUT },
        ...overrides,
    };
}

describe('applyPurchase records an undoable purchase', () => {
    test('debits coins, grants ownership, stamps lastPurchase', () => {
        const u = newUser();
        const r = applyPurchase(u, 'bubble.glass'); // 250
        expect(r.ok).toBe(true);
        expect(u.wallet.coins).toBe(750);
        expect(u.ownedCosmetics).toContain('bubble.glass');
        expect(u.wallet.lastPurchase.itemId).toBe('bubble.glass');
        expect(u.wallet.lastPurchase.price).toBe(250);
        expect(u.wallet.lastPurchase.at).toBeInstanceOf(Date);
    });
});

describe('canRefund', () => {
    test('the most recent purchase is undoable inside the window', () => {
        const u = newUser();
        applyPurchase(u, 'frame.gold');
        expect(canRefund(u, 'frame.gold')).toEqual({ ok: true });
    });

    test('only the LAST purchase is undoable', () => {
        const u = newUser();
        applyPurchase(u, 'frame.gold');   // 300
        applyPurchase(u, 'board.grid');   // 150 — now the last
        expect(canRefund(u, 'board.grid').ok).toBe(true);
        expect(canRefund(u, 'frame.gold')).toEqual({ ok: false, reason: 'not_last_purchase' });
    });

    test('expires after the refund window', () => {
        const u = newUser();
        applyPurchase(u, 'frame.gold');
        const later = Date.now() + REFUND_WINDOW_MS + 1000;
        expect(canRefund(u, 'frame.gold', later)).toEqual({ ok: false, reason: 'window_expired' });
    });

    test('nothing to undo on a fresh wallet', () => {
        expect(canRefund(newUser(), 'frame.gold')).toEqual({ ok: false, reason: 'nothing_to_undo' });
    });
});

describe('applyRefund', () => {
    test('refunds coins, drops ownership, unequips, and consumes the undo', () => {
        const u = newUser();
        applyPurchase(u, 'bubble.glass');           // 1000 -> 750
        applyEquip(u, 'bubble', 'bubble.glass');

        const r = applyRefund(u, 'bubble.glass');
        expect(r.ok).toBe(true);
        expect(u.wallet.coins).toBe(1000);          // fully restored
        expect(u.ownedCosmetics).not.toContain('bubble.glass');
        expect(u.equippedCosmetics.bubble).toBe('default'); // unequipped
        expect(u.wallet.lastPurchase.itemId).toBeNull();

        // Can't refund twice.
        expect(applyRefund(u, 'bubble.glass')).toMatchObject({ ok: false, reason: 'nothing_to_undo' });
    });

    test('refuses to refund outside the window (no coin change)', () => {
        const u = newUser();
        applyPurchase(u, 'frame.gold');             // 1000 -> 700
        const later = Date.now() + REFUND_WINDOW_MS + 1000;
        const r = applyRefund(u, 'frame.gold', later);
        expect(r.ok).toBe(false);
        expect(u.wallet.coins).toBe(700);           // unchanged
        expect(u.ownedCosmetics).toContain('frame.gold');
    });
});

// ---------------------------------------------------------------------------
// Every purchasable skin must actually paint something.
//
// This is the bug the shop shipped with: `calc.hotpink` and `calc.carbon` were
// buyable and equippable, and the CSS that painted them only ever targeted the
// chat calculator — so a student paid 150 coins, opened a practice test, and
// got the default purple. A catalog entry with no matching rule is a cosmetic
// you can buy and never see, and nothing in the suite could tell the difference.
//
// Reading the stylesheet is crude, but it is the seam: the catalog is the
// server's list of what you may buy, cosmetics.css is the client's list of what
// exists, and the two have no other connection.
const fs = require('fs');
const path = require('path');
const { CATALOG } = require('../../utils/cosmeticsCatalog');

const COSMETICS_CSS = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'css', 'cosmetics.css'), 'utf8');

const SLOT_ATTR = {
    theme: 'data-theme-skin',
    bubble: 'data-skin-bubble',
    avatarFrame: 'data-skin-avatarframe',
    board: 'data-skin-board',
    calculator: 'data-skin-calculator',
    header: 'data-skin-header',
};

describe('every catalog skin has CSS that paints it', () => {
    const ids = Object.keys(CATALOG);

    test('the catalog is not empty (guards a silently broken require)', () => {
        expect(ids.length).toBeGreaterThan(10);
    });

    test.each(ids)('%s is styled', (id) => {
        const attr = SLOT_ATTR[CATALOG[id].slot];
        expect(attr).toBeTruthy(); // an unknown slot can never be applied
        expect(COSMETICS_CSS).toContain(`[${attr}="${id}"]`);
    });
});

describe('calculator skins reach the ONE calculator', () => {
    const calcIds = Object.keys(CATALOG).filter((id) => CATALOG[id].slot === 'calculator');

    test('there are several to choose from', () => {
        expect(calcIds.length).toBeGreaterThanOrEqual(5);
    });

    test.each(calcIds)('%s targets the shared component, not a retired one', (id) => {
        const rules = COSMETICS_CSS
            .split('\n')
            .filter((l) => l.includes(`[data-skin-calculator="${id}"]`));
        expect(rules.length).toBeGreaterThan(0);
        // Every rule must key off .mmc. The two implementations these replaced
        // (#floating-calculator and .actt-calc) are gone; a rule naming either
        // paints nothing at all.
        for (const rule of rules) {
            expect(rule).toMatch(/\.mmc/);
            expect(rule).not.toMatch(/#floating-calculator|\.actt-calc/);
        }
    });

    test('the skin ladder spans common to legendary', () => {
        const rarities = new Set(calcIds.map((id) => CATALOG[id].rarity));
        expect(rarities.has('common')).toBe(true);
        expect(rarities.has('rare')).toBe(true);
        expect(rarities.has('epic')).toBe(true);
        expect(rarities.has('legendary')).toBe(true);
    });

    test('prices rise with rarity', () => {
        const order = { common: 0, rare: 1, epic: 2, legendary: 3 };
        const sorted = [...calcIds].sort((a, b) => CATALOG[a].price - CATALOG[b].price);
        const ranks = sorted.map((id) => order[CATALOG[id].rarity]);
        for (let i = 1; i < ranks.length; i++) {
            expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
        }
    });
});
