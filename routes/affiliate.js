// routes/affiliate.js — Affiliate / Referral Program API
//
// Social Snowball-style affiliate system:
//   - Anyone can apply to become an affiliate
//   - Approved affiliates get a unique coupon code
//   - New users who checkout with the coupon get a discount
//   - Affiliates earn commission on each paid conversion
//
// Endpoints:
//   POST /api/affiliate/apply           — Apply to become an affiliate (auth required)
//   GET  /api/affiliate/dashboard       — Get affiliate dashboard data (auth required)
//   GET  /api/affiliate/validate/:code  — Validate a coupon code (public)
//   POST /api/affiliate/click/:code     — Track a coupon link click (public)
//   GET  /api/affiliate/admin/list      — List all affiliates (admin only)
//   PATCH /api/affiliate/admin/:id      — Update affiliate status/settings (admin only)
//   POST /api/affiliate/admin/:id/payout — Record a payout (admin only)

const express = require('express');
const router = express.Router();
const Affiliate = require('../models/affiliate');
const User = require('../models/user');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// =====================================================
// POST /apply
// Apply to become an affiliate (must be logged in)
// Body: { couponCode, displayName, bio, website, audience, paypalEmail }
// =====================================================
router.post('/apply', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Check if user already has an affiliate account
    const existing = await Affiliate.findOne({ userId });
    if (existing) {
      return res.status(400).json({
        message: existing.status === 'rejected'
          ? 'Your previous application was not approved. Please contact support.'
          : 'You already have an affiliate account.',
        status: existing.status
      });
    }

    const { couponCode, displayName, bio, website, audience, paypalEmail } = req.body;

    if (!couponCode || !couponCode.trim()) {
      return res.status(400).json({ message: 'Coupon code is required.' });
    }

    // Validate coupon code format
    const normalizedCode = couponCode.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9_-]{3,30}$/.test(normalizedCode)) {
      return res.status(400).json({
        message: 'Coupon code must be 3-30 characters using only letters, numbers, hyphens, and underscores.'
      });
    }

    // Check if coupon code is already taken
    const codeExists = await Affiliate.findOne({ couponCode: normalizedCode });
    if (codeExists) {
      return res.status(409).json({ message: 'This coupon code is already taken. Please choose another.' });
    }

    // Create the affiliate application
    const affiliate = await Affiliate.create({
      userId,
      couponCode: normalizedCode,
      displayName: displayName?.trim() || req.user.firstName + ' ' + req.user.lastName,
      bio: bio?.trim(),
      website: website?.trim(),
      audience: audience?.trim(),
      paypalEmail: paypalEmail?.trim(),
      status: 'pending'
    });

    // Mark user as affiliate
    await User.findByIdAndUpdate(userId, { isAffiliate: true });

    console.log(`[Affiliate] New application: ${normalizedCode} by ${req.user.firstName} ${req.user.lastName}`);

    res.status(201).json({
      success: true,
      message: 'Application submitted! We\'ll review it shortly.',
      affiliate: {
        couponCode: affiliate.couponCode,
        status: affiliate.status,
        displayName: affiliate.displayName
      }
    });
  } catch (error) {
    console.error('[Affiliate] Apply error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This coupon code is already taken.' });
    }
    res.status(500).json({ message: 'Failed to submit application.' });
  }
});

// =====================================================
// GET /dashboard
// Affiliate dashboard — stats, conversions, payouts
// =====================================================
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const affiliate = await Affiliate.findOne({ userId: req.user._id });
    if (!affiliate) {
      return res.json({ success: true, isAffiliate: false });
    }

    // Return dashboard data
    const recentConversions = affiliate.conversions
      .sort((a, b) => b.convertedAt - a.convertedAt)
      .slice(0, 20)
      .map(c => ({
        type: c.type,
        plan: c.plan,
        commissionCents: c.commissionCents,
        discountCents: c.discountCents,
        convertedAt: c.convertedAt
      }));

    const recentPayouts = affiliate.payouts
      .sort((a, b) => b.paidAt - a.paidAt)
      .slice(0, 10)
      .map(p => ({
        amountCents: p.amountCents,
        method: p.method,
        paidAt: p.paidAt
      }));

    res.json({
      success: true,
      isAffiliate: true,
      affiliate: {
        couponCode: affiliate.couponCode,
        status: affiliate.status,
        displayName: affiliate.displayName,
        commissionRate: affiliate.commissionRate,
        discountPercent: affiliate.discountPercent,
        bio: affiliate.bio,
        website: affiliate.website,
        audience: affiliate.audience,
        paypalEmail: affiliate.paypalEmail,
        stats: affiliate.stats,
        recentConversions,
        recentPayouts,
        createdAt: affiliate.createdAt,
        approvedAt: affiliate.approvedAt
      }
    });
  } catch (error) {
    console.error('[Affiliate] Dashboard error:', error);
    res.status(500).json({ message: 'Failed to load affiliate dashboard.' });
  }
});

// =====================================================
// PATCH /profile
// Update affiliate profile settings
// =====================================================
router.patch('/profile', isAuthenticated, async (req, res) => {
  try {
    const affiliate = await Affiliate.findOne({ userId: req.user._id });
    if (!affiliate) {
      return res.status(404).json({ message: 'Affiliate account not found.' });
    }

    const { displayName, bio, website, audience, paypalEmail } = req.body;
    if (displayName !== undefined) affiliate.displayName = displayName.trim();
    if (bio !== undefined) affiliate.bio = bio.trim();
    if (website !== undefined) affiliate.website = website.trim();
    if (audience !== undefined) affiliate.audience = audience.trim();
    if (paypalEmail !== undefined) affiliate.paypalEmail = paypalEmail.trim();

    await affiliate.save();
    res.json({ success: true, message: 'Profile updated.' });
  } catch (error) {
    console.error('[Affiliate] Profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// =====================================================
// GET /validate/:code
// Public endpoint — validate a coupon code and return discount info
// =====================================================
router.get('/validate/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const affiliate = await Affiliate.findOne({ couponCode: code, status: 'approved' });

    if (!affiliate) {
      return res.json({ valid: false });
    }

    res.json({
      valid: true,
      couponCode: affiliate.couponCode,
      discountPercent: affiliate.discountPercent,
      displayName: affiliate.displayName
    });
  } catch (error) {
    console.error('[Affiliate] Validate error:', error);
    res.status(500).json({ valid: false });
  }
});

// =====================================================
// POST /click/:code
// Public endpoint — track a coupon link click
// =====================================================
router.post('/click/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    await Affiliate.updateOne(
      { couponCode: code, status: 'approved' },
      { $inc: { 'stats.totalClicks': 1 } }
    );
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

// =====================================================
// ADMIN ENDPOINTS
// =====================================================

// GET /admin/list — List all affiliates with optional status filter
router.get('/admin/list', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const affiliates = await Affiliate.find(filter)
      .populate('userId', 'firstName lastName email username role')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      affiliates: affiliates.map(a => ({
        _id: a._id,
        user: a.userId,
        couponCode: a.couponCode,
        status: a.status,
        displayName: a.displayName,
        bio: a.bio,
        website: a.website,
        audience: a.audience,
        paypalEmail: a.paypalEmail,
        commissionRate: a.commissionRate,
        discountPercent: a.discountPercent,
        stats: a.stats,
        adminNotes: a.adminNotes,
        createdAt: a.createdAt,
        approvedAt: a.approvedAt
      }))
    });
  } catch (error) {
    console.error('[Affiliate] Admin list error:', error);
    res.status(500).json({ message: 'Failed to load affiliates.' });
  }
});

// PATCH /admin/:id — Update affiliate status, commission, or notes
router.patch('/admin/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) {
      return res.status(404).json({ message: 'Affiliate not found.' });
    }

    const { status, commissionRate, discountPercent, adminNotes } = req.body;

    if (status !== undefined) {
      affiliate.status = status;
      affiliate.reviewedBy = req.user._id;
      affiliate.reviewedAt = new Date();
      if (status === 'approved' && !affiliate.approvedAt) {
        affiliate.approvedAt = new Date();
      }
    }
    if (commissionRate !== undefined) affiliate.commissionRate = commissionRate;
    if (discountPercent !== undefined) affiliate.discountPercent = discountPercent;
    if (adminNotes !== undefined) affiliate.adminNotes = adminNotes;

    await affiliate.save();

    console.log(`[Affiliate] Admin updated ${affiliate.couponCode}: status=${affiliate.status}`);

    res.json({ success: true, message: `Affiliate ${affiliate.couponCode} updated.` });
  } catch (error) {
    console.error('[Affiliate] Admin update error:', error);
    res.status(500).json({ message: 'Failed to update affiliate.' });
  }
});

// POST /admin/:id/payout — Record a manual payout
router.post('/admin/:id/payout', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) {
      return res.status(404).json({ message: 'Affiliate not found.' });
    }

    const { amountCents, method, reference, note } = req.body;
    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ message: 'Valid payout amount is required.' });
    }

    affiliate.payouts.push({
      amountCents,
      method: method || 'paypal',
      reference,
      note,
      paidBy: req.user._id
    });

    affiliate.stats.totalPayoutCents += amountCents;
    affiliate.stats.unpaidCommissionCents = Math.max(0, affiliate.stats.unpaidCommissionCents - amountCents);

    await affiliate.save();

    console.log(`[Affiliate] Payout recorded for ${affiliate.couponCode}: $${(amountCents / 100).toFixed(2)}`);

    res.json({ success: true, message: `Payout of $${(amountCents / 100).toFixed(2)} recorded.` });
  } catch (error) {
    console.error('[Affiliate] Payout error:', error);
    res.status(500).json({ message: 'Failed to record payout.' });
  }
});

module.exports = router;
