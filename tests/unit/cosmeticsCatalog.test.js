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
