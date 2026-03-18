// routes/billing.js — Stripe billing: Free (30 min/week) + Mathmatix+ ($9.95/mo unlimited)
//
// Plans:
//   Free      — 30 AI min/week (~2-3 hours real help), no credit card
//   Mathmatix+ — $9.95/mo recurring, unlimited everything, cancel anytime
//
// Legacy minute packs (pack_60, pack_120) are retained in webhook processing
// only for users who purchased them before the simplified pricing launch.
//
// Endpoints:
//   POST /api/billing/create-checkout-session — redirect user to Stripe Checkout
//   POST /api/billing/webhook — Stripe event handler (raw body, no auth)
//   GET  /api/billing/portal — redirect to Stripe Customer Portal
//   GET  /api/billing/status — current subscription status + usage

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const WebhookEvent = require('../models/webhookEvent');
const { isAuthenticated } = require('../middleware/auth');

// ---- Configuration ----
const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';
const FREE_WEEKLY_SECONDS = 30 * 60; // 30 free AI minutes per week for all students

// Active plan — Mathmatix+ is the only paid tier for new purchases
const PACKS = {
  unlimited: {
    name: 'M∆THM∆TIX+',
    description: 'Unlimited 24/7 AI tutoring with voice, PDF upload, courses, Show My Work, and all platform features',
    price: 995,         // $9.95 in cents
    seconds: null,
    expiryDays: null,
    mode: 'subscription'
  }
};

// Legacy packs — kept only for webhook processing of existing pack purchases
const LEGACY_PACKS = {
  pack_60: {
    name: 'M∆THM∆TIX 60-Minute Pack',
    price: 995,
    seconds: 60 * 60,
    expiryDays: 90,
    mode: 'payment'
  },
  pack_120: {
    name: 'M∆THM∆TIX 120-Minute Pack',
    price: 1495,
    seconds: 120 * 60,
    expiryDays: 180,
    mode: 'payment'
  }
};

// Combined lookup for webhook processing (handles both active + legacy packs)
const ALL_PACKS = { ...PACKS, ...LEGACY_PACKS };

// ---- Pi Day Promo ($3.14 off all plans) ----
const PI_DAY_DISCOUNT_CENTS = 314; // $3.14 in cents

/**
 * Check if the Pi Day promo is currently active.
 * Active from March 14, 2026 00:00 EDT through March 15, 2026 23:59 EDT.
 */
function isPiDayPromoActive() {
  const now = new Date();
  const start = new Date('2026-03-14T04:00:00Z'); // midnight EDT
  const end   = new Date('2026-03-16T03:59:59Z'); // end of March 15 EDT
  return now >= start && now <= end;
}

/**
 * Return promo-adjusted price (in cents) if Pi Day promo is active, otherwise original price.
 */
function getPromoPrice(originalPriceCents) {
  if (!isPiDayPromoActive()) return originalPriceCents;
  return Math.max(originalPriceCents - PI_DAY_DISCOUNT_CENTS, 100); // floor at $1.00
}

// Defer Stripe init — only create client when billing is enabled and key exists
let stripe;
if (BILLING_ENABLED && process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Billing] STRIPE_SECRET_KEY not set — billing endpoints disabled');
} else {
  console.log('[Billing] BILLING_ENABLED=false — billing endpoints disabled');
}

// =====================================================
// POST /create-checkout-session
// Creates a Stripe Checkout Session for the selected pack
// Body: { pack: 'unlimited' }
// =====================================================
router.post('/create-checkout-session', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const { pack } = req.body;
    if (pack !== 'unlimited') {
      return res.status(400).json({ message: 'Only the Unlimited plan is available for new purchases.' });
    }
    const packConfig = PACKS[pack];

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.subscriptionTier === 'unlimited') {
      return res.status(400).json({ message: 'Already subscribed to Unlimited' });
    }

    // Create or reuse Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || user.username,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: user._id.toString(), role: user.role }
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Build line item — apply Pi Day promo discount if active
    const promoActive = isPiDayPromoActive();
    const finalPrice = promoActive ? getPromoPrice(packConfig.price) : packConfig.price;
    const productName = promoActive
      ? `${packConfig.name} (Pi Day Special — $3.14 off!)`
      : packConfig.name;

    const lineItem = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: productName,
          description: packConfig.description
        },
        unit_amount: finalPrice
      },
      quantity: 1
    };

    // Recurring packs need the recurring interval
    if (packConfig.mode === 'subscription') {
      lineItem.price_data.recurring = { interval: 'month' };
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: packConfig.mode,
      line_items: [lineItem],
      success_url: `${baseUrl}/chat.html?upgraded=true`,
      cancel_url: `${baseUrl}/chat.html`,
      metadata: { userId: user._id.toString(), pack }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('[Billing] Checkout session error:', error);
    res.status(500).json({ message: 'Failed to create checkout session' });
  }
});

// =====================================================
// POST /webhook
// Stripe sends events here. Must use raw body for signature verification.
// This route is mounted separately in server.js with express.raw().
// =====================================================
router.post('/webhook', async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Billing] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency check — prevent duplicate processing on Stripe retries
  try {
    await WebhookEvent.create({ stripeEventId: event.id, eventType: event.type });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key — already processed this event
      console.log(`[Billing] Duplicate webhook event ${event.id} (${event.type}) — skipping`);
      return res.json({ received: true });
    }
    // Non-duplicate DB error — log but continue processing
    console.error('[Billing] Webhook dedup check error:', err.message);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const pack = session.metadata?.pack;
        if (!userId || !pack) break;

        const user = await User.findById(userId);
        if (!user) break;

        const packConfig = ALL_PACKS[pack];
        if (!packConfig) break;

        user.stripeCustomerId = session.customer;
        user.subscriptionStartDate = new Date();

        if (packConfig.mode === 'subscription') {
          // Unlimited monthly
          user.subscriptionTier = 'unlimited';
          user.stripeSubscriptionId = session.subscription;
          console.log(`[Billing] ${user.firstName} ${user.lastName} subscribed to Unlimited`);
        } else {
          // Minute pack — add seconds to existing balance, extend expiry
          user.subscriptionTier = pack;
          user.packSecondsRemaining = (user.packSecondsRemaining || 0) + packConfig.seconds;
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + packConfig.expiryDays);
          // Use the later of current expiry or new expiry
          if (user.packExpiresAt && user.packExpiresAt > expiry) {
            // Keep existing later expiry
          } else {
            user.packExpiresAt = expiry;
          }
          console.log(`[Billing] ${user.firstName} ${user.lastName} purchased ${pack} (${packConfig.seconds / 60} min, expires ${user.packExpiresAt.toISOString().slice(0, 10)})`);
        }

        await user.save();
        break;
      }

      case 'customer.subscription.deleted': {
        // Unlimited subscription cancelled or expired
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) break;

        user.subscriptionTier = 'free';
        user.stripeSubscriptionId = null;
        user.subscriptionEndDate = new Date();
        await user.save();

        console.log(`[Billing] ${user.firstName} ${user.lastName} cancelled Unlimited — downgraded to Free`);
        break;
      }

      case 'customer.subscription.updated': {
        // Subscription status changed (e.g., payment failed → past_due)
        const subscription = event.data.object;
        // Look up by subscription ID first, then fall back to customer ID for reactivations
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) {
          user = await User.findOne({ stripeCustomerId: subscription.customer });
        }
        if (!user) break;

        if (subscription.status === 'active') {
          user.subscriptionTier = 'unlimited';
          user.stripeSubscriptionId = subscription.id;
        } else if (['past_due', 'unpaid', 'canceled'].includes(subscription.status)) {
          user.subscriptionTier = 'free';
          user.subscriptionEndDate = new Date();
        }
        await user.save();
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          console.warn(`[Billing] Payment failed for ${user.firstName} ${user.lastName} — downgrading to free`);
          // Downgrade immediately so user doesn't retain unlimited access
          if (user.subscriptionTier === 'unlimited') {
            user.subscriptionTier = 'free';
            user.subscriptionEndDate = new Date();
            await user.save();
          }
        }
        break;
      }

      default:
        break;
    }

    // Return 200 only after successful processing
    return res.json({ received: true });
  } catch (error) {
    console.error('[Billing] Webhook processing error:', error);
    // Return 500 so Stripe retries the webhook
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =====================================================
// GET /portal
// Redirects to Stripe Customer Portal for subscription management
// =====================================================
router.get('/portal', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ message: 'No billing account found. Purchase a pack first.' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/chat.html`
    });

    res.json({ url: portalSession.url });
  } catch (error) {
    console.error('[Billing] Portal session error:', error);
    res.status(500).json({ message: 'Failed to create portal session' });
  }
});

// =====================================================
// GET /status
// Returns subscription status and pack usage info
// =====================================================
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    // When billing is off, report unlimited access (pre-launch mode)
    if (!BILLING_ENABLED) {
      return res.json({
        success: true,
        billingEnabled: false,
        tier: 'unlimited',
        hasAccess: true,
        usage: { secondsRemaining: Infinity, limitReached: false }
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const tier = user.subscriptionTier || 'free';
    const now = new Date();

    // Unlimited users
    if (tier === 'unlimited') {
      return res.json({
        success: true,
        billingEnabled: true,
        tier: 'unlimited',
        hasAccess: true,
        usage: { secondsRemaining: Infinity, limitReached: false },
        subscription: {
          startDate: user.subscriptionStartDate,
          stripeCustomerId: user.stripeCustomerId
        }
      });
    }

    // Legacy pack users — check free weekly allowance + pack balance
    if (tier === 'pack_60' || tier === 'pack_120') {
      const expired = user.packExpiresAt && now > user.packExpiresAt;
      const packRemaining = expired ? 0 : (user.packSecondsRemaining || 0);

      // Pack users also get 30 free minutes/week before pack is used
      let weeklyAIUsedPack = user.weeklyAISeconds || 0;
      const lastResetPack = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
      if ((now - lastResetPack) / (1000 * 60 * 60 * 24) >= 7) {
        weeklyAIUsedPack = 0;
      }
      const freeRemainingPack = Math.max(0, FREE_WEEKLY_SECONDS - weeklyAIUsedPack);

      // Total remaining = free minutes left + pack balance
      const totalRemaining = freeRemainingPack + packRemaining;
      const packLimitReached = totalRemaining <= 0;

      // Auto-downgrade expired/empty packs and clean up stale fields
      if (packRemaining <= 0) {
        user.subscriptionTier = 'free';
        user.packSecondsRemaining = 0;
        user.packExpiresAt = null;
        await user.save();
      }

      return res.json({
        success: true,
        billingEnabled: true,
        tier: packRemaining <= 0 ? 'free' : tier,
        hasAccess: !packLimitReached,
        usage: {
          secondsRemaining: totalRemaining,
          minutesRemaining: Math.floor(totalRemaining / 60),
          freeSecondsRemaining: freeRemainingPack,
          packSecondsRemaining: packRemaining,
          packExpiresAt: user.packExpiresAt,
          expired,
          limitReached: packLimitReached
        }
      });
    }

    // Check if a linked parent has an active Mathmatix+ subscription
    // (parent pays → child gets unlimited access)
    if (user.parentIds && user.parentIds.length > 0) {
      const subscribedParent = await User.findOne({
        _id: { $in: user.parentIds },
        subscriptionTier: 'unlimited'
      }).lean();
      if (subscribedParent) {
        return res.json({
          success: true,
          billingEnabled: true,
          tier: 'unlimited',
          hasAccess: true,
          usage: { secondsRemaining: Infinity, limitReached: false },
          parentSubscription: true
        });
      }
    }

    // Free users — calculate remaining free weekly AI minutes
    // Teachers, parents, admins get unlimited; students get 30 free AI minutes/week
    if (user.role === 'teacher' || user.role === 'parent' || user.role === 'admin') {
      return res.json({
        success: true,
        billingEnabled: true,
        tier: 'free',
        hasAccess: true,
        usage: { secondsRemaining: Infinity, limitReached: false }
      });
    }

    // Students: check weekly AI seconds used vs free allowance
    let weeklyAIUsed = user.weeklyAISeconds || 0;
    const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
    if ((now - lastReset) / (1000 * 60 * 60 * 24) >= 7) {
      // Reset is pending — they effectively have full free minutes
      weeklyAIUsed = 0;
    }
    const freeRemaining = Math.max(0, FREE_WEEKLY_SECONDS - weeklyAIUsed);
    const limitReached = freeRemaining <= 0;

    // Calculate when free minutes reset (7 days from lastWeeklyReset)
    const lastResetDate = weeklyAIUsed === 0 && (now - lastReset) / (1000 * 60 * 60 * 24) >= 7
      ? now  // Reset just happened, next reset is 7 days from now
      : lastReset;
    const nextReset = new Date(lastResetDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    res.json({
      success: true,
      billingEnabled: true,
      tier: 'free',
      hasAccess: !limitReached,
      hasSeenPricing: user.hasSeenPricing || false,
      usage: {
        secondsRemaining: freeRemaining,
        minutesRemaining: Math.floor(freeRemaining / 60),
        weeklyAISecondsUsed: weeklyAIUsed,
        freeWeeklySeconds: FREE_WEEKLY_SECONDS,
        limitReached,
        nextResetAt: nextReset.toISOString()
      }
    });
  } catch (error) {
    console.error('[Billing] Status check error:', error);
    res.status(500).json({ message: 'Failed to fetch billing status' });
  }
});

/* ============================================================
   POST /api/billing/seen-pricing
   Mark that the user has seen the pricing page (shown once after signup)
   ============================================================ */
router.post('/seen-pricing', async (req, res) => {
  try {
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { hasSeenPricing: true });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update' });
  }
});

// =====================================================
// GET /promo
// Returns current promo status and adjusted prices
// =====================================================
router.get('/promo', (req, res) => {
  const active = isPiDayPromoActive();
  if (!active) {
    return res.json({ active: false });
  }

  res.json({
    active: true,
    name: 'Pi Day Launch Special',
    discount: '$3.14 off',
    prices: {
      unlimited: { original: PACKS.unlimited.price, promo: getPromoPrice(PACKS.unlimited.price) }
    },
    endsAt: '2026-03-16T03:59:59Z'
  });
});

module.exports = router;
