// tests/integration/billingWebhook.test.js
// Integration test for the Stripe webhook in routes/billing.js — the most
// security-critical surface in the route (signature verification + money path).

// BILLING_ENABLED + STRIPE_SECRET_KEY must be set BEFORE requiring the route,
// otherwise the module skips Stripe initialization entirely.
process.env.BILLING_ENABLED = 'true';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';

global.__stripeWebhookConstruct = jest.fn();
global.__stripeBillingPortal = jest.fn();

jest.mock('stripe', () => () => ({
  webhooks: {
    constructEvent: (...a) => global.__stripeWebhookConstruct(...a)
  },
  billingPortal: {
    sessions: { create: (...a) => global.__stripeBillingPortal(...a) }
  },
  checkout: { sessions: { create: jest.fn() } },
  customers:   { create: jest.fn(), retrieve: jest.fn() },
  subscriptions: { update: jest.fn(), cancel: jest.fn(), retrieve: jest.fn() },
  prices:      { list: jest.fn() }
}));

jest.mock('../../models/user', () => ({
  findById: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../models/affiliate', () => ({
  findById: jest.fn()
}));

jest.mock('../../models/webhookEvent', () => ({
  create: jest.fn().mockResolvedValue({})
}));

jest.mock('../../utils/emailService', () => ({
  sendCancellationConfirmation: jest.fn()
}));

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const WebhookEvent = require('../../models/webhookEvent');
const router = require('../../routes/billing');

const constructEvent = global.__stripeWebhookConstruct;

function makeApp() {
  const app = express();
  // Webhook needs raw body in production (mounted with express.raw at the
  // app level); express.json() is fine for these tests because Stripe lib
  // is mocked out and our test never tries to verify the actual signature.
  app.use(express.json());
  app.use('/api/billing', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  // mockRejectedValue from earlier tests can leak into later ones —
  // explicitly restore default behaviors per test.
  WebhookEvent.create.mockResolvedValue({});
  User.findById.mockReset();
  User.findOne.mockReset();
});

describe('POST /api/billing/webhook — signature verification', () => {
  test('returns 400 when Stripe signature is invalid', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const r = await supertest(makeApp())
      .post('/api/billing/webhook')
      .set('stripe-signature', 'bad-sig')
      .send({ id: 'evt_x' });

    expect(r.status).toBe(400);
    expect(r.text).toMatch(/signature/i);
    expect(WebhookEvent.create).not.toHaveBeenCalled();
  });

  test('returns 200 + skips processing on duplicate event (idempotency)', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_dup', type: 'checkout.session.completed', data: { object: {} }
    });
    // Mongo duplicate key error
    const dupErr = new Error('duplicate key'); dupErr.code = 11000;
    WebhookEvent.create.mockRejectedValue(dupErr);

    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(r.status).toBe(200);
    expect(r.body.received).toBe(true);
    expect(User.findById).not.toHaveBeenCalled(); // event-handler skipped
  });

  test('returns 200 on unknown event type without acting', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_x', type: 'product.something.weird', data: { object: {} }
    });

    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(r.status).toBe(200);
    expect(r.body.received).toBe(true);
  });
});

describe('checkout.session.completed', () => {
  function setupCheckoutEvent(metadata = {}) {
    constructEvent.mockReturnValue({
      id: 'evt_co', type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', metadata
      } }
    });
  }

  test('subscribes user to Unlimited and stores Stripe IDs', async () => {
    setupCheckoutEvent({ userId: 'u1', pack: 'unlimited' });
    const user = {
      _id: 'u1', firstName: 'Sam', lastName: 'L', save: jest.fn().mockResolvedValue()
    };
    User.findById.mockResolvedValue(user);

    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(r.status).toBe(200);
    expect(user.subscriptionTier).toBe('unlimited');
    expect(user.stripeCustomerId).toBe('cus_1');
    expect(user.stripeSubscriptionId).toBe('sub_1');
    expect(user.subscriptionStartDate).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalled();
  });

  test('skips silently when userId or pack is missing in metadata', async () => {
    setupCheckoutEvent({}); // no userId/pack
    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});
    expect(r.status).toBe(200);
    expect(User.findById).not.toHaveBeenCalled();
  });

  test('skips when user not found', async () => {
    setupCheckoutEvent({ userId: 'gone', pack: 'unlimited' });
    User.findById.mockResolvedValue(null);
    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});
    expect(r.status).toBe(200);
  });

  test('skips when pack is unknown (not in ALL_PACKS)', async () => {
    setupCheckoutEvent({ userId: 'u1', pack: 'bogus_pack' });
    const user = { save: jest.fn() };
    User.findById.mockResolvedValue(user);
    await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});
    expect(user.save).not.toHaveBeenCalled();
  });

  test('handles legacy minute-pack purchase by adding seconds + setting expiry', async () => {
    setupCheckoutEvent({ userId: 'u1', pack: 'pack_60' });
    const user = {
      _id: 'u1', firstName: 'A', lastName: 'B',
      packSecondsRemaining: 0,
      save: jest.fn().mockResolvedValue()
    };
    User.findById.mockResolvedValue(user);

    await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(user.subscriptionTier).toBe('pack_60');
    expect(user.packSecondsRemaining).toBe(60 * 60);
    expect(user.packExpiresAt).toBeInstanceOf(Date);
  });
});

describe('customer.subscription.deleted', () => {
  test('downgrades the user to free and clears stripeSubscriptionId', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_d', type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } }
    });
    const user = {
      _id: 'u1', firstName: 'A', lastName: 'B',
      subscriptionTier: 'unlimited',
      save: jest.fn().mockResolvedValue()
    };
    User.findOne.mockResolvedValue(user);

    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(r.status).toBe(200);
    expect(User.findOne).toHaveBeenCalledWith({ stripeSubscriptionId: 'sub_1' });
    expect(user.subscriptionTier).toBe('free');
    expect(user.stripeSubscriptionId).toBeNull();
    expect(user.subscriptionEndDate).toBeInstanceOf(Date);
  });

  test('no-op when user not found by subscription id', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_d', type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } }
    });
    User.findOne.mockResolvedValue(null);
    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});
    expect(r.status).toBe(200);
  });
});

describe('customer.subscription.updated', () => {
  test('reactivates user → unlimited when status=active', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_u', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } }
    });
    const user = { save: jest.fn().mockResolvedValue() };
    User.findOne.mockResolvedValueOnce(user);

    await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(user.subscriptionTier).toBe('unlimited');
    expect(user.stripeSubscriptionId).toBe('sub_1');
  });

  test('falls back to customer-id lookup when subscription-id misses', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_u', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_2', customer: 'cus_2', status: 'active' } }
    });
    User.findOne
      .mockResolvedValueOnce(null) // sub-id miss
      .mockResolvedValueOnce({ save: jest.fn().mockResolvedValue() }); // cus-id hit

    await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(User.findOne).toHaveBeenNthCalledWith(1, { stripeSubscriptionId: 'sub_2' });
    expect(User.findOne).toHaveBeenNthCalledWith(2, { stripeCustomerId: 'cus_2' });
  });

  test('downgrades to free on past_due/unpaid/canceled status', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_u', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'past_due' } }
    });
    const user = { subscriptionTier: 'unlimited', save: jest.fn().mockResolvedValue() };
    User.findOne.mockResolvedValueOnce(user);

    await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(user.subscriptionTier).toBe('free');
    expect(user.subscriptionEndDate).toBeInstanceOf(Date);
  });
});

describe('invoice.payment_failed', () => {
  test('downgrades unlimited user to free immediately', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_p', type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } }
    });
    const user = {
      _id: 'u1', firstName: 'A', lastName: 'B',
      subscriptionTier: 'unlimited',
      save: jest.fn().mockResolvedValue()
    };
    User.findOne.mockResolvedValue(user);

    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(r.status).toBe(200);
    expect(user.subscriptionTier).toBe('free');
  });

  test('does not save when user is already on free tier', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_p', type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } }
    });
    const user = {
      _id: 'u1', firstName: 'A', lastName: 'B',
      subscriptionTier: 'free',
      save: jest.fn().mockResolvedValue()
    };
    User.findOne.mockResolvedValue(user);

    await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(user.save).not.toHaveBeenCalled();
  });
});

describe('webhook error handling', () => {
  test('returns 500 (so Stripe retries) when handler throws unexpectedly', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_x', type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'u1', pack: 'unlimited' }, id: 'cs', customer: 'cus' } }
    });
    User.findById.mockRejectedValue(new Error('db down'));

    const r = await supertest(makeApp())
      .post('/api/billing/webhook').set('stripe-signature', 's').send({});

    expect(r.status).toBe(500);
  });
});
