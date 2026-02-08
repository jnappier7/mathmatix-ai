// routes/billing.js — Stripe billing for minute packs & unlimited subscription
//
// Packs:
//   60 min  — $9.95  one-time, expires 90 days
//   120 min — $14.95 one-time, expires 180 days
//   Unlimited monthly — $19.95 recurring subscription
//
// Endpoints:
//   POST /api/billing/create-checkout-session — redirect user to Stripe Checkout
//   POST /api/billing/webhook — Stripe event handler (raw body, no auth)
//   GET  /api/billing/portal — redirect to Stripe Customer Portal
//   GET  /api/billing/status — current subscription status + usage

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { isAuthenticated } = require('../middleware/auth');

// ---- Configuration ----
const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';

const PACKS = {
  pack_60: {
    name: 'M∆THM∆TIX 60-Minute Pack',
    description: '60 minutes of AI tutoring — expires in 90 days',
    price: 995,        // $9.95 in cents
    seconds: 60 * 60,  // 3600
    expiryDays: 90,
    mode: 'payment'    // one-time
  },
  pack_120: {
    name: 'M∆THM∆TIX 120-Minute Pack',
    description: '120 minutes of AI tutoring — expires in 180 days',
    price: 1495,        // $14.95 in cents
    seconds: 120 * 60,  // 7200
    expiryDays: 180,
    mode: 'payment'     // one-time
  },
  unlimited: {
    name: 'M∆THM∆TIX Unlimited Monthly',
    description: 'Unlimited AI tutoring, voice, OCR, and uploads',
    price: 1995,        // $19.95 in cents
    seconds: null,
    expiryDays: null,
    mode: 'subscription'
  }
};

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
// Body: { pack: 'pack_60' | 'pack_120' | 'unlimited' }
// =====================================================
router.post('/create-checkout-session', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const { pack } = req.body;
    const packConfig = PACKS[pack];
    if (!packConfig) {
      return res.status(400).json({ message: 'Invalid pack. Choose pack_60, pack_120, or unlimited.' });
    }

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

    // Build line item
    const lineItem = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: packConfig.name,
          description: packConfig.description
        },
        unit_amount: packConfig.price
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
      success_url: `${baseUrl}/chat.html?upgraded=${pack}`,
      cancel_url: `${baseUrl}/chat.html?upgrade_cancelled=true`,
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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const pack = session.metadata?.pack;
        if (!userId || !pack) break;

        const user = await User.findById(userId);
        if (!user) break;

        const packConfig = PACKS[pack];
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
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) break;

        if (subscription.status === 'active') {
          user.subscriptionTier = 'unlimited';
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
          console.warn(`[Billing] Payment failed for ${user.firstName} ${user.lastName}`);
        }
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Billing] Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
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

    // Pack users — check expiry and balance
    if (tier === 'pack_60' || tier === 'pack_120') {
      const expired = user.packExpiresAt && now > user.packExpiresAt;
      const remaining = expired ? 0 : (user.packSecondsRemaining || 0);
      const limitReached = remaining <= 0;

      // Auto-downgrade expired/empty packs
      if (limitReached && tier !== 'free') {
        user.subscriptionTier = 'free';
        await user.save();
      }

      return res.json({
        success: true,
        billingEnabled: true,
        tier: limitReached ? 'free' : tier,
        hasAccess: !limitReached,
        usage: {
          secondsRemaining: remaining,
          minutesRemaining: Math.floor(remaining / 60),
          packExpiresAt: user.packExpiresAt,
          expired,
          limitReached
        }
      });
    }

    // Free users
    res.json({
      success: true,
      billingEnabled: true,
      tier: 'free',
      hasAccess: false,
      usage: { secondsRemaining: 0, limitReached: true }
    });
  } catch (error) {
    console.error('[Billing] Status check error:', error);
    res.status(500).json({ message: 'Failed to fetch billing status' });
  }
});

module.exports = router;
