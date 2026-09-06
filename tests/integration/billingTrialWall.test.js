// tests/integration/billingTrialWall.test.js
//
// The 402 wall and the trial behind it.
//
// Two trials existed at once — a 14-day no-card grant at signup and a 7-day
// card-required Stripe trial — and which one you were offered depended on how
// old your account was. That is not a thing a user can be told coherently, and
// the wall was quoting the wrong one. These tests hold the single definition,
// and hold the three different people who arrive at the wall apart.

process.env.BILLING_ENABLED = 'true';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';

jest.mock('stripe', () => () => ({
  webhooks: { constructEvent: jest.fn() },
  billingPortal: { sessions: { create: jest.fn() } },
  checkout: { sessions: { create: jest.fn() } },
  customers: { create: jest.fn(), retrieve: jest.fn() },
  subscriptions: { update: jest.fn(), cancel: jest.fn(), retrieve: jest.fn() },
  prices: { list: jest.fn() }
}));

jest.mock('../../middleware/auth', () => ({
  isAuthenticated: (req, _res, next) => { req.user = { _id: 'u1' }; next(); }
}));
jest.mock('../../models/user', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/affiliate', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/webhookEvent', () => ({
  create: jest.fn().mockResolvedValue({}), findOne: jest.fn().mockResolvedValue(null),
  updateOne: jest.fn().mockResolvedValue({}), deleteOne: jest.fn().mockResolvedValue({})
}));
jest.mock('../../utils/emailService', () => ({
  sendCancellationConfirmation: jest.fn(), sendTrialEndingReminder: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const express = require('express');
const supertest = require('supertest');
const User = require('../../models/user');
const router = require('../../routes/billing');
const { TRIAL_DAYS } = require('../../utils/trialGrant');
const { FREE_WEEKLY_SECONDS } = require('../../utils/aiTimeMeter');

const app = express();
app.use(express.json());
app.use('/api/billing', router);

const days = (n) => new Date(Date.now() + n * 86400000);

function student(overrides = {}) {
  return {
    _id: 'u1', email: 'kid@example.com', role: 'student', roles: ['student'],
    subscriptionTier: 'free', hasUsedTrial: false, trialEndsAt: null,
    weeklyAISeconds: 0, lastAIQuotaReset: new Date(),
    parentIds: [], schoolLicenseId: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockReset();
  User.findOne.mockReset();
  User.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
});

const status = () => supertest(app).get('/api/billing/status');

describe('one trial, one length', () => {
  test('status quotes the no-card trial, not the legacy card one', async () => {
    User.findById.mockResolvedValue(student());
    const r = await status();
    expect(r.body.trialDays).toBe(TRIAL_DAYS);
    expect(TRIAL_DAYS).toBe(14);
  });

  test('billing does not keep its own copy of the free quota', () => {
    // It used to declare FREE_WEEKLY_SECONDS/FREE_QUOTA_RESET_DAYS as literals
    // with a "keep in sync with usageGate" comment. This file is what tells a
    // student how many minutes they have left, so drift here does not throw —
    // it lies to them about their own account.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'billing.js'), 'utf8');
    expect(src).not.toMatch(/const FREE_WEEKLY_SECONDS\s*=/);
    expect(src).not.toMatch(/const FREE_QUOTA_RESET_DAYS\s*=/);
    expect(src).toMatch(/require\('\.\.\/utils\/aiTimeMeter'\)/);
    expect(src).toMatch(/require\('\.\.\/utils\/trialGrant'\)/);
  });

  test('a free student is quoted the real free allowance', async () => {
    User.findById.mockResolvedValue(student({ weeklyAISeconds: 0 }));
    const r = await status();
    expect(r.body.usage.secondsRemaining).toBe(FREE_WEEKLY_SECONDS);
  });
});

describe('a running no-card trial is visible', () => {
  test('status reports the countdown, not just unlimited access', async () => {
    // The no-card trial grants access through trialEndsAt, so it lands in the
    // unmetered branch rather than tier==='unlimited'. Without these fields the
    // student is never told a clock is running and meets the wall unwarned.
    User.findById.mockResolvedValue(student({ hasUsedTrial: true, trialEndsAt: days(9) }));
    const r = await status();
    expect(r.body.hasAccess).toBe(true);
    expect(r.body.unmetered).toBe(true);
    expect(r.body.isTrialing).toBe(true);
    expect(r.body.trialDaysRemaining).toBe(9);
    expect(r.body.trialEndsAt).toBeTruthy();
  });

  test('an unmetered student who is NOT trialing says so', async () => {
    // School-licensed / founding / staff: unmetered, but no clock.
    User.findById.mockResolvedValue(student({ subscriptionTier: 'unlimited' }));
    const r = await status();
    expect(r.body.hasAccess).toBe(true);
    expect(r.body.trialDaysRemaining).toBe(0);
  });
});

describe('the wall tells three people apart', () => {
  test('never trialed → the trial is available', async () => {
    User.findById.mockResolvedValue(student({ hasUsedTrial: false, weeklyAISeconds: FREE_WEEKLY_SECONDS }));
    const r = await status();
    expect(r.body.trialAvailable).toBe(true);
    expect(r.body.trialExpired).toBe(false);
    expect(r.body.usage.limitReached).toBe(true);
  });

  test('trial lapsed → not available, and flagged as expired', async () => {
    User.findById.mockResolvedValue(student({
      hasUsedTrial: true, trialEndsAt: days(-1), weeklyAISeconds: FREE_WEEKLY_SECONDS,
    }));
    const r = await status();
    expect(r.body.trialAvailable).toBe(false);
    expect(r.body.trialExpired).toBe(true);
  });

  test('used a trial that left no end date → not mislabelled as expired', async () => {
    User.findById.mockResolvedValue(student({ hasUsedTrial: true, trialEndsAt: null }));
    const r = await status();
    expect(r.body.trialAvailable).toBe(false);
    expect(r.body.trialExpired).toBe(false);
  });
});

describe('POST /start-trial grants without a card', () => {
  test('grants the no-card trial and never touches Stripe', async () => {
    const u = student();
    User.findById.mockResolvedValue(u);
    const r = await supertest(app).post('/api/billing/start-trial').send({});
    expect(r.status).toBe(200);
    expect(r.body.trialDays).toBe(TRIAL_DAYS);
    expect(u.hasUsedTrial).toBe(true);
    expect(u.trialEndsAt).toEqual(expect.any(Date));
    expect(u.save).toHaveBeenCalled();
    // No checkout session, no customer — the button promised no card.
    expect(require('stripe')().checkout.sessions.create).not.toHaveBeenCalled();
  });

  test('refuses a second trial', async () => {
    const u = student({ hasUsedTrial: true, trialEndsAt: days(-5) });
    User.findById.mockResolvedValue(u);
    const r = await supertest(app).post('/api/billing/start-trial').send({});
    expect(r.status).toBe(400);
    expect(r.body.trialAvailable).toBe(false);
    expect(u.save).not.toHaveBeenCalled();
  });

  test('refuses someone who already has full access, rather than burning their trial', async () => {
    const u = student({ subscriptionTier: 'unlimited' });
    User.findById.mockResolvedValue(u);
    const r = await supertest(app).post('/api/billing/start-trial').send({});
    expect(r.status).toBe(400);
    expect(r.body.alreadyUnmetered).toBe(true);
    expect(u.hasUsedTrial).toBe(false);
  });
});

describe('the wall speaks in the tutor voice and the page theme', () => {
  const module_ = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'modules', 'billing.js'), 'utf8');
  // Scoped to showUpgradePrompt deliberately. Other surfaces in this module (the
  // post-checkout activation banner, manage-subscription) still carry the legacy
  // palette; they are a separate job, and asserting over the whole file would
  // either fail for work this change did not claim or quietly pass once someone
  // moved a colour around.
  // Comments stripped: the code that replaced the old palette names it, so an
  // assertion over the raw text matches the explanation rather than the styles.
  const wall = module_
    .slice(module_.indexOf('export async function showUpgradePrompt'), module_.indexOf('function wireAskParent'))
    .replace(/^\s*\/\/.*$/gm, '');

  test('the wall drops the legacy hardcoded dark palette for the page theme', () => {
    // A #1a1a2e box with #00d4ff buttons over a themed chat read as a different
    // application interrupting.
    expect(wall.length).toBeGreaterThan(500);
    expect(wall).not.toContain('#1a1a2e');
    expect(wall).not.toContain('#00d4ff');
    expect(wall).toContain('--cr-bg-panel');
    expect(wall).toContain('--cr-accent');
  });

  test('the tutor asks, by name, about the work that stopped', () => {
    expect(wall).toContain('WALL_LINES');
    for (const id of ['mr-nappier', 'bob', 'maya', 'ms-maria']) {
      expect(wall).toContain(`'${id}':`);
    }
  });

  test('the trial CTA grants server-side instead of opening checkout', () => {
    expect(wall).toContain("'/api/billing/start-trial'");
  });

  test('no promo is shown against a free trial', () => {
    // A struck-through price under the word "free" reads as a trick.
    expect(wall).toMatch(/showPromo\s*=\s*!!promo\s*&&\s*!trialAvailable/);
  });

  test('students are offered the parent path, read from roles held', () => {
    expect(wall).toContain('ask-parent-btn');
    expect(wall).toMatch(/Array\.isArray\(cu\.roles\)\s*\?\s*cu\.roles\.includes\('student'\)/);
  });
});

describe('the cache-buster chain is intact', () => {
  test('chat.html -> script.js -> modules/billing.js are all versioned', () => {
    // Neither file is page-bundled; chat.html loads script.js as a module and
    // script.js imports billing.js by URL. Both links carry a hand-written ?v=,
    // and a stale one means a returning browser runs the OLD wall behind a
    // fresh-looking page — silent in every check you would normally trust.
    const chatHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'chat.html'), 'utf8');
    const scriptJs = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'script.js'), 'utf8');
    expect(chatHtml).toMatch(/\/js\/script\.js\?v=\d{8}[a-z]?/);
    expect(scriptJs).toMatch(/\.\/modules\/billing\.js\?v=\d{8}[a-z]?/);
  });
});
