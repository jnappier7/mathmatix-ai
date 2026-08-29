// routes/billing.js — Stripe billing: Free (30 min/month) + Mathmatix+ ($9.95/mo unlimited)
//
// Plans:
//   Free      — 30 AI min/month (~2-3 hours real help), no credit card
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
//   POST /api/billing/cancel — cancel subscription at period end
//   POST /api/billing/reactivate — undo pending cancellation
//   POST /api/billing/pause — pause subscription for 1-3 months
//   POST /api/billing/resume — resume a paused subscription
//   GET  /api/billing/subscription-details — detailed subscription info for manage UI

const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Affiliate = require('../models/affiliate');
const WebhookEvent = require('../models/webhookEvent');
const { isAuthenticated } = require('../middleware/auth');
const { hasUnmeteredAiAccess } = require('../middleware/usageGate');
const { sendCancellationConfirmation, sendTrialEndingReminder } = require('../utils/emailService');
const logger = require('../utils/logger').child({ route: 'billing' });

const { userHasRole } = require('../utils/roleQuery');
// ---- Configuration ----
const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';
const FREE_WEEKLY_SECONDS = 30 * 60; // 30 free AI minutes per reset period (now monthly) for all students
const FREE_QUOTA_RESET_DAYS = 30;    // free-AI-minute quota window — keep in sync with middleware/usageGate.js
const TRIAL_DAYS = 7;                // card-required Mathmatix+ free-trial length

// Active plans — Mathmatix+, billed monthly or by the school year.
//
// Both grant the identical `unlimited` tier; they differ only in Stripe's
// recurring interval and price. The annual plan is two months free ($99.00 vs
// $119.40), which is priced against churn rather than against a competitor:
// a consumer math subscription is abandoned over summer break, so an annual
// term both raises realized LTV and moves the renewal decision off the month
// when a student stops having homework.
const PACKS = {
  unlimited: {
    name: 'M∆THM∆TIX+',
    description: 'Unlimited 24/7 AI tutoring with voice, PDF upload, courses, Show My Work, and all platform features',
    price: 995,         // $9.95 in cents
    seconds: null,
    expiryDays: null,
    mode: 'subscription',
    interval: 'month'
  },
  unlimited_annual: {
    name: 'M∆THM∆TIX+ (School Year)',
    description: 'A full year of unlimited 24/7 AI tutoring — voice, PDF upload, courses, Show My Work, and all platform features. Two months free vs monthly.',
    price: 9900,        // $99.00 in cents — 2 months free vs $119.40
    seconds: null,
    expiryDays: null,
    mode: 'subscription',
    interval: 'year'
  }
};

// Plans a new purchase may select. Kept as a Set (not `pack in PACKS`) so a
// legacy pack id can never be revived through the checkout endpoint.
const PURCHASABLE_PACKS = new Set(['unlimited', 'unlimited_annual']);

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
  logger.warn('STRIPE_SECRET_KEY not set — billing endpoints disabled');
} else {
  logger.info('BILLING_ENABLED=false — billing endpoints disabled');
}

// =====================================================
// POST /create-checkout-session
// Creates a Stripe Checkout Session for the selected pack
// Body: { pack: 'unlimited' }
// =====================================================
router.post('/create-checkout-session', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const { pack, couponCode, trial } = req.body;
    if (!PURCHASABLE_PACKS.has(pack)) {
      return res.status(400).json({ message: 'Only the Mathmatix+ monthly and school-year plans are available for new purchases.' });
    }
    const packConfig = PACKS[pack];

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.subscriptionTier === 'unlimited') {
      return res.status(400).json({ message: 'Already subscribed to Unlimited' });
    }

    // Card-required free trial: honor the trial request only if this user has
    // never trialed before (one trial per user). A repeat requester just checks
    // out as a normal paid subscription.
    //
    // Trials are deliberately monthly-only. A 7-day trial that converts into a
    // single $99.00 charge is the shape that produces disputes; the $9.95 one
    // is not. Someone who wants the annual price after trialing can switch at
    // renewal.
    const wantsTrial = trial === true && !user.hasUsedTrial && packConfig.interval !== 'year';

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
    let finalPrice = promoActive ? getPromoPrice(packConfig.price) : packConfig.price;
    let productName = promoActive
      ? `${packConfig.name} (Pi Day Special — $3.14 off!)`
      : packConfig.name;

    // Apply affiliate coupon code discount (stacks with Pi Day promo)
    let affiliateId = null;
    let affiliateCoupon = null;
    if (couponCode) {
      const affiliate = await Affiliate.findOne({
        couponCode: couponCode.trim().toUpperCase(),
        status: 'approved'
      });
      if (affiliate) {
        affiliateId = affiliate._id.toString();
        affiliateCoupon = affiliate.couponCode;
        const discountCents = Math.round(finalPrice * (affiliate.discountPercent / 100));
        finalPrice = Math.max(finalPrice - discountCents, 100); // Floor at $1.00
        productName += ` (${affiliate.discountPercent}% off with code ${affiliate.couponCode})`;
      }
    }

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

    // Recurring packs need the recurring interval. Read it from the plan rather
    // than hard-coding 'month' — that constant is what made annual unshippable.
    if (packConfig.mode === 'subscription') {
      lineItem.price_data.recurring = { interval: packConfig.interval || 'month' };
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    // Include affiliate info in session metadata for webhook attribution
    const metadata = { userId: user._id.toString(), pack };
    if (affiliateId) {
      metadata.affiliateId = affiliateId;
      metadata.affiliateCoupon = affiliateCoupon;
    }
    if (wantsTrial) metadata.trial = 'true';

    const sessionParams = {
      customer: customerId,
      mode: packConfig.mode,
      line_items: [lineItem],
      success_url: `${baseUrl}/chat.html?upgraded=true`,
      cancel_url: `${baseUrl}/chat.html`,
      metadata
    };

    // Card-required trial: collect the card now, don't charge for TRIAL_DAYS,
    // then auto-convert to the paid plan unless the user cancels. Stripe manages
    // the trial→bill transition and (per dashboard setting) the trial-ending
    // reminder email; we also send our own via the trial_will_end webhook.
    if (wantsTrial) {
      sessionParams.subscription_data = { trial_period_days: TRIAL_DAYS };
      // Force card capture during the trial (default would let a trial skip it).
      sessionParams.payment_method_collection = 'always';
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url });
  } catch (error) {
    logger.error('Checkout session error', { userId: req.user?._id?.toString(), error: error.message });
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
    logger.error('Webhook signature verification failed', { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency — two-phase, because the marker must not claim success before
  // the handler has actually succeeded. See models/webhookEvent.js.
  //
  // A 'processing' marker that is still fresh means another delivery of the same
  // event is in flight right now; we answer 500 so Stripe retries later rather
  // than either double-applying it (affiliate commissions and conversion rows are
  // additive, not idempotent) or silently dropping it. A 'processing' marker
  // older than STALE_MS is the residue of an attempt that died before it could
  // clean up, so we take it over.
  const STALE_MS = 15 * 60 * 1000;
  try {
    await WebhookEvent.create({ stripeEventId: event.id, eventType: event.type, status: 'processing' });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await WebhookEvent.findOne({ stripeEventId: event.id }).catch(() => null);

      if (existing && existing.status === 'done') {
        logger.info('Duplicate webhook event — already processed, skipping', {
          eventId: event.id, eventType: event.type
        });
        return res.json({ received: true });
      }

      const age = existing?.processedAt ? Date.now() - new Date(existing.processedAt).getTime() : 0;
      if (existing && age < STALE_MS) {
        logger.warn('Webhook event already in flight — asking Stripe to retry', {
          eventId: event.id, eventType: event.type, ageMs: age
        });
        return res.status(500).json({ error: 'Event already in flight; retry' });
      }

      logger.warn('Reclaiming stale in-flight webhook event', {
        eventId: event.id, eventType: event.type, ageMs: age
      });
      await WebhookEvent.updateOne(
        { stripeEventId: event.id },
        { $set: { status: 'processing', processedAt: new Date() } }
      ).catch(() => null);
    } else {
      // Non-duplicate DB error — log but continue processing. Preferring
      // availability here means a dedup-store outage can let an event through
      // twice; that is the deliberate trade-off, and it is why the failure is
      // logged at error level.
      logger.error('Webhook dedup check error', { error: err.message, eventId: event.id });
    }
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
          // Unlimited monthly (may be starting in a trial)
          user.subscriptionTier = 'unlimited';
          user.stripeSubscriptionId = session.subscription;

          // If this checkout started a free trial, record the trial window and
          // burn the one-trial-per-user flag. We retrieve the subscription so the
          // trial_end comes from Stripe (source of truth), not our own clock.
          if (session.metadata?.trial === 'true' && session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription);
              if (sub.status === 'trialing' && sub.trial_end) {
                user.trialEndsAt = new Date(sub.trial_end * 1000);
              }
            } catch (subErr) {
              logger.warn('Could not retrieve subscription for trial info', { error: subErr.message });
            }
            user.hasUsedTrial = true;
            logger.info('User started Mathmatix+ trial', {
              userId: user._id.toString(),
              trialEndsAt: user.trialEndsAt?.toISOString()
            });
          } else {
            logger.info('User subscribed to Unlimited', { userId: user._id.toString() });
          }

          // Attribute conversion to affiliate if coupon was used
          const affId = session.metadata?.affiliateId;
          if (affId) {
            try {
              const affiliate = await Affiliate.findById(affId);
              if (affiliate && affiliate.status === 'approved') {
                const commissionCents = Math.round(packConfig.price * affiliate.commissionRate);
                affiliate.conversions.push({
                  userId: user._id,
                  type: 'subscription',
                  plan: pack,
                  amountCents: packConfig.price,
                  discountCents: Math.round(packConfig.price * (affiliate.discountPercent / 100)),
                  commissionCents,
                  commissionRate: affiliate.commissionRate,
                  stripeSessionId: session.id
                });
                affiliate.stats.totalSubscriptions += 1;
                affiliate.stats.totalRevenueCents += packConfig.price;
                affiliate.stats.totalCommissionCents += commissionCents;
                affiliate.stats.unpaidCommissionCents += commissionCents;
                await affiliate.save();

                // Store referral on user
                user.referredByAffiliateId = affiliate._id;
                user.referredByCouponCode = affiliate.couponCode;

                logger.info('Affiliate conversion recorded', {
                  affiliateId: affiliate._id.toString(),
                  couponCode: affiliate.couponCode,
                  userId: user._id.toString(),
                  commissionCents
                });
              }
            } catch (affErr) {
              logger.error('Affiliate conversion tracking error', { error: affErr.message, userId: user._id.toString() });
            }
          }
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
          logger.info('Pack purchased', {
            userId: user._id.toString(),
            pack,
            minutes: packConfig.seconds / 60,
            expiresAt: user.packExpiresAt.toISOString().slice(0, 10)
          });
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
        user.trialEndsAt = null; // trial cancelled before converting, or paid sub ended
        await user.save();

        logger.info('User cancelled Unlimited — downgraded to Free', { userId: user._id.toString() });
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

        if (subscription.status === 'trialing') {
          // Trial in progress — full access, keep the trial window in sync.
          user.subscriptionTier = 'unlimited';
          user.stripeSubscriptionId = subscription.id;
          user.hasUsedTrial = true;
          if (subscription.trial_end) user.trialEndsAt = new Date(subscription.trial_end * 1000);
        } else if (subscription.status === 'active') {
          // Active (incl. a trial that just converted) — clear the trial marker.
          user.subscriptionTier = 'unlimited';
          user.stripeSubscriptionId = subscription.id;
          user.trialEndsAt = null;
        } else if (['past_due', 'unpaid', 'canceled'].includes(subscription.status)) {
          user.subscriptionTier = 'free';
          user.subscriptionEndDate = new Date();
          user.trialEndsAt = null;
        }
        await user.save();
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Fires ~3 days before a trial converts. Send our own branded reminder so
        // the parent knows a charge is coming and how to cancel — this is what
        // keeps the trial brand-safe and chargeback-light.
        const subscription = event.data.object;
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) break;

        const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : user.trialEndsAt;
        try {
          await sendTrialEndingReminder(user, trialEnd);
          logger.info('Trial-ending reminder sent', { userId: user._id.toString() });
        } catch (mailErr) {
          logger.error('Trial-ending reminder failed', { userId: user._id.toString(), error: mailErr.message });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
          logger.warn('Payment failed — downgrading to free', { userId: user._id.toString() });
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

    // Processing succeeded — only now is it safe to record the event as handled.
    // A failure here is not fatal: the worst case is that a later retry of the
    // same event reprocesses it, which is strictly better than provisioning
    // nothing at all.
    await WebhookEvent.updateOne(
      { stripeEventId: event.id },
      { $set: { status: 'done', processedAt: new Date() } }
    ).catch((markErr) => {
      logger.error('Failed to mark webhook event done', { error: markErr.message, eventId: event.id });
    });

    // Return 200 only after successful processing
    return res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error', { error: error.message, eventType: event?.type });

    // Drop the marker so Stripe's retry starts clean instead of colliding with a
    // marker for work that never completed. Without this the retry would hit the
    // duplicate-key branch and the event would never be applied.
    await WebhookEvent.deleteOne({ stripeEventId: event.id }).catch((delErr) => {
      logger.error('Failed to clear webhook marker after processing error', {
        error: delErr.message, eventId: event.id
      });
    });

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
    logger.error('Portal session error', { userId: req.user?._id?.toString(), error: error.message });
    res.status(500).json({ message: 'Failed to create portal session' });
  }
});

// =====================================================
// POST /cancel
// Cancel subscription at end of current billing period (not immediate)
// Body: { reason?: string }
// =====================================================
router.post('/cancel', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ message: 'No active subscription to cancel.' });
    }

    // Cancel at period end — user keeps access until current billing period expires
    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Track cancellation reason
    const { reason } = req.body;
    if (reason) {
      user.cancellationReason = reason.slice(0, 500);
    }
    user.cancellationDate = new Date();
    await user.save();

    // current_period_end moved to the subscription *item* in the pinned Stripe
    // API version; fall back to it so the "access until" date still renders.
    const periodEndUnix = subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end;
    const accessUntilDate = periodEndUnix
      ? new Date(periodEndUnix * 1000)
      : null;
    const accessUntilStr = accessUntilDate
      ? accessUntilDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null;

    logger.info('Cancellation scheduled', { userId: user._id.toString(), hasReason: !!reason });

    // Send cancellation confirmation email (best-effort, don't block response)
    if (user.email) {
      sendCancellationConfirmation(user.email, user.firstName || 'there', accessUntilStr || 'the end of your billing period')
        .catch(err => logger.error('Cancellation email failed', { userId: user._id.toString(), error: err.message }));
    }

    res.json({
      success: true,
      message: 'Your subscription has been cancelled. You will keep access until the end of your current billing period.',
      accessUntil: accessUntilDate ? accessUntilDate.toISOString() : null
    });
  } catch (error) {
    logger.error('Cancel error', { userId: req.user?._id?.toString(), error: error.message });
    res.status(500).json({ message: 'Failed to cancel subscription. Please try again or contact support.' });
  }
});

// =====================================================
// POST /reactivate
// Undo a pending cancellation (re-enable auto-renew)
// =====================================================
router.post('/reactivate', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ message: 'No subscription to reactivate.' });
    }

    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    user.cancellationReason = null;
    user.cancellationDate = null;
    await user.save();

    logger.info('Subscription reactivated', { userId: user._id.toString() });

    res.json({
      success: true,
      message: 'Your subscription has been reactivated! You will continue to be billed monthly.'
    });
  } catch (error) {
    logger.error('Reactivate error', { userId: req.user?._id?.toString(), error: error.message });
    res.status(500).json({ message: 'Failed to reactivate subscription.' });
  }
});

// =====================================================
// POST /pause
// Pause subscription for 1-3 months using Stripe pause_collection
// Body: { months: 1|2|3 }
// =====================================================
router.post('/pause', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ message: 'No active subscription to pause.' });
    }

    const months = parseInt(req.body.months);
    if (!months || months < 1 || months > 3) {
      return res.status(400).json({ message: 'Please choose 1, 2, or 3 months to pause.' });
    }

    // Calculate resume date (months from now)
    const resumeDate = new Date();
    resumeDate.setMonth(resumeDate.getMonth() + months);

    // Pause collection — keeps subscription active but skips invoices until resume date
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      pause_collection: {
        behavior: 'void',  // Skip invoices during pause (don't charge)
        resumes_at: Math.floor(resumeDate.getTime() / 1000)
      }
    });

    logger.info('Subscription paused', {
      userId: user._id.toString(),
      months,
      resumesAt: resumeDate.toISOString().slice(0, 10)
    });

    res.json({
      success: true,
      message: `Your subscription has been paused for ${months} month${months > 1 ? 's' : ''}. It will automatically resume on ${resumeDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
      resumesAt: resumeDate.toISOString()
    });
  } catch (error) {
    logger.error('Pause error', { userId: req.user?._id?.toString(), error: error.message });
    res.status(500).json({ message: 'Failed to pause subscription. Please try again or contact support.' });
  }
});

// =====================================================
// POST /resume
// Resume a paused subscription immediately
// =====================================================
router.post('/resume', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ message: 'No subscription to resume.' });
    }

    // Remove pause — billing resumes immediately
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      pause_collection: ''  // Empty string clears the pause
    });

    logger.info('Paused subscription resumed', { userId: user._id.toString() });

    res.json({
      success: true,
      message: 'Your subscription has been resumed! Unlimited tutoring is back.'
    });
  } catch (error) {
    logger.error('Resume error', { userId: req.user?._id?.toString(), error: error.message });
    res.status(500).json({ message: 'Failed to resume subscription.' });
  }
});

// =====================================================
// GET /subscription-details
// Returns detailed subscription info for the manage subscription UI
// =====================================================
router.get('/subscription-details', isAuthenticated, async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Billing is not configured' });
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.stripeSubscriptionId) {
      return res.json({
        success: true,
        hasSubscription: false,
        tier: user.subscriptionTier || 'free'
      });
    }

    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

    // Check if subscription is paused
    const isPaused = !!(subscription.pause_collection && subscription.pause_collection.resumes_at);
    const resumesAt = isPaused
      ? new Date(subscription.pause_collection.resumes_at * 1000).toISOString()
      : null;

    // The plan the subscriber is actually on. Checkout builds prices inline
    // (price_data), so the subscription item's price is the source of truth for
    // both the amount and the billing interval — the manage UI must render from
    // these, not from a hardcoded "$9.95/mo" that lies to annual subscribers.
    const price = subscription.items?.data?.[0]?.price || null;

    res.json({
      success: true,
      hasSubscription: true,
      tier: user.subscriptionTier,
      interval: price?.recurring?.interval || null,
      amountCents: typeof price?.unit_amount === 'number' ? price.unit_amount : null,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: (subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end)
        ? new Date((subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end) * 1000).toISOString()
        : null,
      startDate: user.subscriptionStartDate,
      cancellationReason: user.cancellationReason,
      isPaused,
      resumesAt
    });
  } catch (error) {
    logger.error('Subscription details error', { userId: req.user?._id?.toString(), error: error.message });
    res.status(500).json({ message: 'Failed to fetch subscription details.' });
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

    // Unlimited users (paid OR in a card-required trial)
    if (tier === 'unlimited') {
      const isTrialing = !!(user.trialEndsAt && user.trialEndsAt > now);
      const trialDaysRemaining = isTrialing
        ? Math.max(1, Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
        : 0;
      return res.json({
        success: true,
        billingEnabled: true,
        tier: 'unlimited',
        hasAccess: true,
        isTrialing,
        trialEndsAt: isTrialing ? user.trialEndsAt : null,
        trialDaysRemaining,
        usage: { secondsRemaining: Infinity, limitReached: false },
        subscription: {
          startDate: user.subscriptionStartDate,
          stripeCustomerId: user.stripeCustomerId
        }
      });
    }

    // Legacy pack users — check free monthly allowance + pack balance
    if (tier === 'pack_60' || tier === 'pack_120') {
      const expired = user.packExpiresAt && now > user.packExpiresAt;
      const packRemaining = expired ? 0 : (user.packSecondsRemaining || 0);

      // Pack users also get 30 free minutes/month before pack is used
      let weeklyAIUsedPack = user.weeklyAISeconds || 0;
      const lastResetPack = user.lastAIQuotaReset ? new Date(user.lastAIQuotaReset) : new Date(0);
      if ((now - lastResetPack) / (1000 * 60 * 60 * 24) >= FREE_QUOTA_RESET_DAYS) {
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

    // Free users — calculate remaining free monthly AI minutes
    // Teachers, parents, admins get unlimited; students get 30 free AI minutes/month
    if (['teacher', 'parent', 'admin'].some(r => userHasRole(user, r))) {
      return res.json({
        success: true,
        billingEnabled: true,
        tier: 'free',
        hasAccess: true,
        usage: { secondsRemaining: Infinity, limitReached: false }
      });
    }

    // School-licensed students (and any other unmetered case usageGate honors):
    // unlimited while the license is valid and in capacity. Without this branch
    // the status endpoint fell through to the free-quota math below, so a
    // licensed student who logged >30 AI-min showed a "No AI time left" wall —
    // while usageGate (correctly) kept letting tutor turns through. Same check
    // as the gate, so display and enforcement can never disagree.
    if (await hasUnmeteredAiAccess(user)) {
      return res.json({
        success: true,
        billingEnabled: true,
        tier: 'free',
        hasAccess: true,
        unmetered: true,
        usage: { secondsRemaining: Infinity, limitReached: false }
      });
    }

    // Students: check monthly AI seconds used vs free allowance
    let weeklyAIUsed = user.weeklyAISeconds || 0;
    const lastReset = user.lastAIQuotaReset ? new Date(user.lastAIQuotaReset) : new Date(0);
    if ((now - lastReset) / (1000 * 60 * 60 * 24) >= FREE_QUOTA_RESET_DAYS) {
      // Reset is pending — they effectively have full free minutes
      weeklyAIUsed = 0;
    }
    const freeRemaining = Math.max(0, FREE_WEEKLY_SECONDS - weeklyAIUsed);
    const limitReached = freeRemaining <= 0;

    // Calculate when free minutes reset (FREE_QUOTA_RESET_DAYS from lastAIQuotaReset)
    const lastResetDate = weeklyAIUsed === 0 && (now - lastReset) / (1000 * 60 * 60 * 24) >= FREE_QUOTA_RESET_DAYS
      ? now  // Reset just happened, next reset is FREE_QUOTA_RESET_DAYS from now
      : lastReset;
    const nextReset = new Date(lastResetDate.getTime() + FREE_QUOTA_RESET_DAYS * 24 * 60 * 60 * 1000);

    res.json({
      success: true,
      billingEnabled: true,
      tier: 'free',
      hasAccess: !limitReached,
      hasSeenPricing: user.hasSeenPricing || false,
      // Whether this free student can still start a card-required Mathmatix+ trial
      // (one per user). Frontend uses this to show "Start 7-day free trial" vs a
      // plain upgrade CTA — especially at the 30-min wall.
      trialAvailable: !user.hasUsedTrial,
      trialDays: TRIAL_DAYS,
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
    logger.error('Status check error', { userId: req.user?._id?.toString(), error: error.message });
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
    logger.error('Seen-pricing update failed', { userId: req.user?._id?.toString(), error: error.message });
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
