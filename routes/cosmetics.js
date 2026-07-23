// routes/cosmetics.js
// Cosmetics shop — server-authoritative purchase/equip over the earned Coins
// currency. All validation + mutation lives in utils/cosmeticsCatalog.js; this
// is a thin HTTP wrapper. Mounted at /api/cosmetics (see config/routes.js).
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const {
    CATALOG,
    DEFAULT_LOADOUT,
    REFUND_WINDOW_MS,
    applyPurchase,
    applyRefund,
    canRefund,
    applyEquip,
} = require('../utils/cosmeticsCatalog');

// Shape the undo hint the client needs: which item is undoable and for how long.
function undoInfo(user) {
    const lp = user && user.wallet && user.wallet.lastPurchase;
    if (!lp || !lp.itemId) return null;
    if (!canRefund(user, lp.itemId).ok) return null;
    const expiresAt = new Date(new Date(lp.at).getTime() + REFUND_WINDOW_MS).toISOString();
    return { itemId: lp.itemId, price: lp.price, expiresAt };
}

// GET /api/cosmetics/catalog — catalog + this user's balance/owned/equipped.
router.get('/catalog', async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('wallet ownedCosmetics equippedCosmetics').lean();
        if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });
        res.json({
            success: true,
            catalog: CATALOG,
            coins: user.wallet?.coins ?? 0,
            owned: user.ownedCosmetics || [],
            equipped: { ...DEFAULT_LOADOUT, ...(user.equippedCosmetics || {}) },
            undo: undoInfo(user),
        });
    } catch (err) {
        console.error('[cosmetics] catalog error:', err.message);
        res.status(500).json({ success: false, error: 'Could not load catalog' });
    }
});

// POST /api/cosmetics/purchase { itemId }
router.post('/purchase', async (req, res) => {
    try {
        const { itemId } = req.body || {};
        if (!itemId) return res.status(400).json({ success: false, error: 'Missing itemId' });
        const user = await User.findById(req.user._id);
        if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

        const result = applyPurchase(user, itemId);
        if (!result.ok) {
            return res.status(400).json({ success: false, error: result.reason, coins: result.coins });
        }
        await user.save();
        res.json({ success: true, coins: result.coins, owned: result.owned, undo: undoInfo(user) });
    } catch (err) {
        console.error('[cosmetics] purchase error:', err.message);
        res.status(500).json({ success: false, error: 'Purchase failed' });
    }
});

// POST /api/cosmetics/refund { itemId } — undo the most recent purchase (full
// refund) if it's still within the window. Server-authoritative, like purchase.
router.post('/refund', async (req, res) => {
    try {
        const { itemId } = req.body || {};
        if (!itemId) return res.status(400).json({ success: false, error: 'Missing itemId' });
        const user = await User.findById(req.user._id);
        if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

        const result = applyRefund(user, itemId);
        if (!result.ok) {
            return res.status(400).json({ success: false, error: result.reason, coins: result.coins });
        }
        await user.save();
        res.json({
            success: true,
            coins: result.coins,
            owned: result.owned,
            equipped: result.equipped,
            refundedItemId: result.refundedItemId,
        });
    } catch (err) {
        console.error('[cosmetics] refund error:', err.message);
        res.status(500).json({ success: false, error: 'Refund failed' });
    }
});

// POST /api/cosmetics/equip { slot, itemId }  (itemId 'default' unequips)
router.post('/equip', async (req, res) => {
    try {
        const { slot, itemId } = req.body || {};
        if (!slot) return res.status(400).json({ success: false, error: 'Missing slot' });
        const user = await User.findById(req.user._id);
        if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

        const result = applyEquip(user, slot, itemId);
        if (!result.ok) return res.status(400).json({ success: false, error: result.reason });
        await user.save();
        res.json({ success: true, equipped: result.equipped });
    } catch (err) {
        console.error('[cosmetics] equip error:', err.message);
        res.status(500).json({ success: false, error: 'Equip failed' });
    }
});

module.exports = router;
