// tests/integration/billingAnnualPlan.test.js
// Pins the Mathmatix+ school-year (annual) plan at checkout.
//
// The interval used to be the hard-coded string 'month' in the line item, so an
// annual plan could not exist no matter what the catalog said. These tests hold
// the three things that made it shippable: the plan is purchasable, its price
// and interval reach Stripe, and a $99 charge can never be the tail end of a
// 7-day trial (that shape is what generates disputes).

process.env.BILLING_ENABLED = 'true';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';

global.__stripeCheckoutCreate = jest.fn();
global.__stripeCustomerCreate = jest.fn();
global.__stripeSubRetrieve = jest.fn();

jest.mock('stripe', () => () => ({
  webhooks: { constructEvent: jest.fn() },
  billingPortal: { sessions: { create: jest.fn() } },
  checkout: { sessions: { create: (...a) => global.__stripeCheckoutCreate(...a) } },
  customers: { create: (...a) => global.__stripeCustomerCreate(...a), retrieve: jest.fn() },
  subscriptions: { update: jest.fn(), cancel: jest.fn(), retrieve: (...a) => global.__stripeSubRetrieve(...a) },
  prices: { list: jest.fn() }
}));

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => { req.user = { _id: 'u1' }; next(); }
}));

jest.mock('../../models/user', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/affiliate', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/webhookEvent', () => ({
  create: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue(null),
  updateOne: jest.fn().mockResolvedValue({}),
  deleteOne: jest.fn().mockResolvedValue({})
}));
jest.mock('../../utils/emailService', () => ({
  sendCancellationConfirmation: jest.fn(),
  sendTrialEndingReminder: jest.fn().mockResolvedValue({ success: true })
}));

const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const router = require('../../routes/billing');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', router);
  return app;
}

// A free-tier student who has never trialed — the state every one of these
// checkouts starts from.
function freeUser(overrides = {}) {
  return {
    _id: 'u1',
    email: 'kid@example.com',
    firstName: 'Test',
    lastName: 'Student',
    role: 'student',
    subscriptionTier: 'free',
    hasUsedTrial: false,
    stripeCustomerId: 'cus_existing',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

// The single line item Stripe was asked to bill for.
function billedItem() {
  return global.__stripeCheckoutCreate.mock.calls[0][0].line_items[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockReset();
  global.__stripeSubRetrieve.mockReset();
  global.__stripeCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/s/x' });
});

describe('POST /api/billing/create-checkout-session — plan selection', () => {
  test('bills the annual plan yearly at $99.00', async () => {
    User.findById.mockResolvedValue(freeUser());

    const r = await supertest(makeApp())
      .post('/api/billing/create-checkout-session')
      .send({ pack: 'unlimited_annual' });

    expect(r.status).toBe(200);
    const item = billedItem();
    expect(item.price_data.recurring).toEqual({ interval: 'year' });
    expect(item.price_data.unit_amount).toBe(9900);
  });

  test('still bills the monthly plan monthly at $9.95', async () => {
    User.findById.mockResolvedValue(freeUser());

    const r = await supertest(makeApp())
      .post('/api/billing/create-checkout-session')
      .send({ pack: 'unlimited' });

    expect(r.status).toBe(200);
    const item = billedItem();
    expect(item.price_data.recurring).toEqual({ interval: 'month' });
    expect(item.price_data.unit_amount).toBe(995);
  });

  test('records the chosen plan in metadata so the webhook provisions it', async () => {
    User.findById.mockResolvedValue(freeUser());

    await supertest(makeApp())
      .post('/api/billing/create-checkout-session')
      .send({ pack: 'unlimited_annual' });

    expect(global.__stripeCheckoutCreate.mock.calls[0][0].metadata.pack)
      .toBe('unlimited_annual');
  });

  // The legacy minute packs stay reachable in the webhook (existing customers)
  // but must never be sellable again.
  test.each(['pack_60', 'pack_120', 'nonsense', ''])(
    'rejects %p as a new purchase',
    async (pack) => {
      User.findById.mockResolvedValue(freeUser());

      const r = await supertest(makeApp())
        .post('/api/billing/create-checkout-session')
        .send({ pack });

      expect(r.status).toBe(400);
      expect(global.__stripeCheckoutCreate).not.toHaveBeenCalled();
    }
  );
});

describe('POST /api/billing/create-checkout-session — trials are monthly-only', () => {
  test('grants the 7-day trial on the monthly plan', async () => {
    User.findById.mockResolvedValue(freeUser());

    await supertest(makeApp())
      .post('/api/billing/create-checkout-session')
      .send({ pack: 'unlimited', trial: true });

    const params = global.__stripeCheckoutCreate.mock.calls[0][0];
    expect(params.subscription_data).toEqual({ trial_period_days: 7 });
    expect(params.metadata.trial).toBe('true');
  });

  test('refuses to attach a trial to the $99 annual plan', async () => {
    User.findById.mockResolvedValue(freeUser());

    const r = await supertest(makeApp())
      .post('/api/billing/create-checkout-session')
      .send({ pack: 'unlimited_annual', trial: true });

    expect(r.status).toBe(200);
    const params = global.__stripeCheckoutCreate.mock.calls[0][0];
    expect(params.subscription_data).toBeUndefined();
    expect(params.metadata.trial).toBeUndefined();
    // The sale still goes through — it is just billed immediately.
    expect(params.line_items[0].price_data.unit_amount).toBe(9900);
  });
});

describe('GET /api/billing/subscription-details — plan identity for the manage UI', () => {
  // The panel used to hardcode "Plan: Mathmatix+ ($9.95/mo)". Once annual
  // subscribers exist that line lies to them, so the endpoint must say which
  // plan the subscriber is actually on — from the Stripe subscription item,
  // the one source that cannot drift from what is being charged.

  function subscriber() {
    return freeUser({ subscriptionTier: 'unlimited', stripeSubscriptionId: 'sub_1' });
  }

  function stripeSub(unitAmount, interval) {
    return {
      status: 'active',
      cancel_at_period_end: false,
      pause_collection: null,
      current_period_end: 1790000000,
      items: { data: [{ price: { unit_amount: unitAmount, recurring: { interval } } }] }
    };
  }

  test('reports the annual plan as $99.00 billed yearly', async () => {
    User.findById.mockResolvedValue(subscriber());
    global.__stripeSubRetrieve.mockResolvedValue(stripeSub(9900, 'year'));

    const r = await supertest(makeApp()).get('/api/billing/subscription-details');

    expect(r.status).toBe(200);
    expect(r.body.interval).toBe('year');
    expect(r.body.amountCents).toBe(9900);
  });

  test('reports the monthly plan as $9.95 billed monthly', async () => {
    User.findById.mockResolvedValue(subscriber());
    global.__stripeSubRetrieve.mockResolvedValue(stripeSub(995, 'month'));

    const r = await supertest(makeApp()).get('/api/billing/subscription-details');

    expect(r.status).toBe(200);
    expect(r.body.interval).toBe('month');
    expect(r.body.amountCents).toBe(995);
  });

  test('degrades to nulls, not a crash, when the price shape is missing', async () => {
    User.findById.mockResolvedValue(subscriber());
    global.__stripeSubRetrieve.mockResolvedValue({
      status: 'active', cancel_at_period_end: false, pause_collection: null, items: { data: [] }
    });

    const r = await supertest(makeApp()).get('/api/billing/subscription-details');

    expect(r.status).toBe(200);
    expect(r.body.interval).toBeNull();
    expect(r.body.amountCents).toBeNull();
  });
});
