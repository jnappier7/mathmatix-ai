// routes/billing.js — Stripe subscription billing for free/premium tiers
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

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ---- Configuration ----
const PREMIUM_PRICE = 1995; // $19.95 in cents
const FREE_WEEKLY_SECONDS = 20 * 60; // 20 minutes per week
const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';

// =====================================================
// POST /create-checkout-session
// Creates a Stripe Checkout Session and returns the URL
// =====================================================
router.post('/create-checkout-session', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.subscriptionTier === 'premium') {
      return res.status(400).json({ message: 'Already subscribed to Premium' });
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

    // Create a Checkout Session with an inline price
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'M∆THM∆TIX Premium',
            description: 'Unlimited AI tutoring, voice, OCR, and uploads'
          },
          unit_amount: PREMIUM_PRICE,
          recurring: { interval: 'month' }
        },
        quantity: 1
      }],
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/chat.html?upgraded=true`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/chat.html?upgrade_cancelled=true`,
      metadata: { userId: user._id.toString() }
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
        if (!userId) break;

        const user = await User.findById(userId);
        if (!user) break;

        user.subscriptionTier = 'premium';
        user.stripeSubscriptionId = session.subscription;
        user.stripeCustomerId = session.customer;
        user.subscriptionStartDate = new Date();
        await user.save();

        console.log(`[Billing] User ${user.firstName} ${user.lastName} upgraded to Premium`);
        break;
      }

      case 'customer.subscription.deleted': {
        // Subscription cancelled or expired
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) break;

        user.subscriptionTier = 'free';
        user.stripeSubscriptionId = null;
        user.subscriptionEndDate = new Date();
        await user.save();

        console.log(`[Billing] User ${user.firstName} ${user.lastName} downgraded to Free`);
        break;
      }

      case 'customer.subscription.updated': {
        // Subscription changed (e.g., payment failed → past_due)
        const subscription = event.data.object;
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) break;

        if (subscription.status === 'active') {
          user.subscriptionTier = 'premium';
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
        // Unhandled event type — ignore
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
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ message: 'No billing account found. Subscribe first.' });
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
// Returns subscription status and free tier usage
// =====================================================
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    // When billing is off, report unlimited access (pre-launch mode)
    if (!BILLING_ENABLED) {
      return res.json({
        success: true,
        billingEnabled: false,
        tier: 'unlimited',
        isPremium: true,
        usage: { weeklySecondsUsed: 0, weeklySecondsRemaining: Infinity, weeklyLimitReached: false, percentUsed: 0 }
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check for weekly reset
    const now = new Date();
    const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
    const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);
    if (daysSinceReset >= 7) {
      user.weeklyActiveSeconds = 0;
      user.weeklyActiveTutoringMinutes = 0;
      user.lastWeeklyReset = now;
      await user.save();
    }

    const isPremium = user.subscriptionTier === 'premium';
    const weeklySecondsUsed = user.weeklyActiveSeconds || 0;
    const weeklySecondsRemaining = isPremium ? Infinity : Math.max(0, FREE_WEEKLY_SECONDS - weeklySecondsUsed);
    const weeklyLimitReached = !isPremium && weeklySecondsUsed >= FREE_WEEKLY_SECONDS;

    res.json({
      success: true,
      tier: user.subscriptionTier || 'free',
      isPremium,
      usage: {
        weeklySecondsUsed,
        weeklySecondsRemaining,
        weeklyLimitSeconds: FREE_WEEKLY_SECONDS,
        weeklyLimitReached,
        percentUsed: isPremium ? 0 : Math.round((weeklySecondsUsed / FREE_WEEKLY_SECONDS) * 100)
      },
      subscription: isPremium ? {
        startDate: user.subscriptionStartDate,
        stripeCustomerId: user.stripeCustomerId
      } : null
    });
  } catch (error) {
    console.error('[Billing] Status check error:', error);
    res.status(500).json({ message: 'Failed to fetch billing status' });
  }
});

module.exports = router;
