// tests/unit/previewTrialFunnel.test.js
//
// Pins the PREVIEW -> TRIAL -> FREE ladder at the four seams where a mistake is
// SILENT — no throw, no log, just a funnel that quietly does nothing:
//
//   1. The no-card trial has no Stripe object, so `trialEndsAt` is the only
//      thing granting it. If usageGate stops reading it, every new account is
//      told "14 days free" and metered from turn one.
//   2. routes/trialChat.js sizes its history window and rate limiter from
//      MAX_TURNS. Hardcode either and the tutor forgets the start of the
//      conversation, or a second visitor on one IP gets a 429 instead of the wall.
//   3. public/js/landing.js keeps a client-side copy of the turn cap. When it is
//      the lower of the two it silently becomes the real cap.
//   4. CONVERSION_EVENTS is a mongoose enum and recordConversionEvent swallows
//      write errors on purpose, so an event fired but not listed never lands a row.

const fs = require('fs');
const path = require('path');

process.env.BILLING_ENABLED = 'true';

jest.mock('../../models/user');
jest.mock('../../models/schoolLicense');

const User = require('../../models/user');
const SchoolLicense = require('../../models/schoolLicense');

delete require.cache[require.resolve('../../middleware/usageGate')];
const {
  usageGate,
  premiumFeatureGate,
  hasUnmeteredAiAccess,
  FREE_WEEKLY_SECONDS,
} = require('../../middleware/usageGate');
const { TRIAL_DAYS, isInTrial, trialDaysRemaining, grantTrial } = require('../../utils/trialGrant');
const { CONVERSION_EVENTS } = require('../../models/conversionEvent');

const REPO = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe('utils/trialGrant', () => {
  test('grants a TRIAL_DAYS window and reports it as active', () => {
    const user = {};
    expect(grantTrial(user)).toBe(true);
    expect(user.hasUsedTrial).toBe(true);
    expect(isInTrial(user)).toBe(true);
    expect(trialDaysRemaining(user)).toBe(TRIAL_DAYS);
  });

  test('is 14 days — a 7-day window can contain no homework night at all', () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  test('refuses to re-grant, whichever path burned the flag first', () => {
    // The Stripe card trial writes the same two fields, so a user who trialed
    // that way must not collect a second one by signing up again.
    const cardTrialed = { hasUsedTrial: true, trialEndsAt: daysFromNow(-1) };
    expect(grantTrial(cardTrialed)).toBe(false);
    expect(cardTrialed.trialEndsAt).toEqual(expect.any(Date));
    expect(isInTrial(cardTrialed)).toBe(false);
  });

  test('an expired trial is not a trial', () => {
    const user = { hasUsedTrial: true, trialEndsAt: daysFromNow(-0.001) };
    expect(isInTrial(user)).toBe(false);
    expect(trialDaysRemaining(user)).toBe(0);
  });

  test('a user who never trialed is not in one', () => {
    expect(isInTrial({})).toBe(false);
    expect(isInTrial(null)).toBe(false);
  });
});

describe('usageGate honours the no-card trial', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'POST',
      user: {
        _id: 'student123',
        role: 'student',
        subscriptionTier: 'free',
        // Deliberately OVER the free quota: without the trial this request is a 402.
        weeklyAISeconds: FREE_WEEKLY_SECONDS + 600,
        lastWeeklyReset: new Date(),
        lastAIQuotaReset: new Date(),
        freeUploadsUsed: 9,
        freeGradesUsed: 9,
        parentIds: [],
        schoolLicenseId: null,
        hasUsedTrial: true,
      },
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
    next = jest.fn();
    jest.clearAllMocks();
    User.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    User.findOneAndUpdate = jest.fn().mockResolvedValue(null);
    User.findByIdAndUpdate = jest.fn().mockReturnValue({ catch: jest.fn() });
    SchoolLicense.findById = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  });

  test('an active trial passes a student who is over the free quota', async () => {
    req.user.trialEndsAt = daysFromNow(7);
    expect(await hasUnmeteredAiAccess(req.user)).toBe(true);
    await usageGate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(402);
  });

  test('the SAME student is metered the moment the trial lapses', async () => {
    // This pair is the whole point: subscriptionTier never changes, because a
    // no-card trial has no Stripe subscription to change it.
    req.user.trialEndsAt = daysFromNow(-1);
    expect(await hasUnmeteredAiAccess(req.user)).toBe(false);
    await usageGate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
  });

  test('a trial includes the premium features, or it is just a longer free tier', async () => {
    req.user.trialEndsAt = daysFromNow(7);
    // Voice has no free taste at all, so it only passes on a real entitlement.
    await premiumFeatureGate('Voice chat')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('premium features close again once the trial lapses', async () => {
    req.user.trialEndsAt = daysFromNow(-1);
    await premiumFeatureGate('Voice chat')(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('preview limits derive from MAX_TURNS', () => {
  const src = read('routes/trialChat.js');

  test('the history window is not a literal', () => {
    // Was `Math.min(6, ...)`, invisible at 3 volleys and amnesia at 8.
    expect(src).toMatch(/const MAX_HISTORY_MESSAGES = MAX_TURNS \* 2;/);
    expect(src).not.toMatch(/slice\(-Math\.min\(6,/);
  });

  test('the rate limiter is not a literal', () => {
    expect(src).toMatch(/max: PREVIEW_SESSIONS_PER_IP \* \(MAX_TURNS \+ 1\)/);
  });

  test('the preview is 9 turns — a greeting plus 8 volleys', () => {
    expect(src).toMatch(/const MAX_TURNS = 9;/);
  });
});

describe('the client turn cap tracks the server', () => {
  test('MAX_CLIENT_TURNS equals MAX_TURNS', () => {
    // Defense-in-depth, not an independent policy. When the browser's copy is
    // lower it silently becomes the real cap: the server would serve turn 5 and
    // the page would never ask for it.
    const server = read('routes/trialChat.js').match(/const MAX_TURNS = (\d+);/);
    const client = read('public/js/landing.js').match(/var MAX_CLIENT_TURNS = (\d+);/);
    expect(server).not.toBeNull();
    expect(client).not.toBeNull();
    expect(Number(client[1])).toBe(Number(server[1]));
  });
});

describe('every emitted conversion event is in the enum', () => {
  // recordConversionEvent logs to Winston then .catch()es the mongo write, so an
  // unlisted event is lost without a trace. This test is the only thing standing
  // between a new funnel stage and a permanently empty column.
  const SOURCES = [
    'routes/trialChat.js',
    'routes/signup.js',
    'routes/billing.js',
    'routes/quiz.js',
    'routes/campaignLink.js',
    'middleware/usageGate.js',
  ];

  const emitted = new Set();
  for (const file of SOURCES) {
    const src = read(file);
    for (const m of src.matchAll(/recordConversionEvent\(\s*'([a-z_]+)'/g)) {
      emitted.add(m[1]);
    }
  }

  test('finds the events actually fired in the codebase', () => {
    expect(emitted.size).toBeGreaterThanOrEqual(7);
  });

  test.each([...emitted])('%s is a permitted enum value', (event) => {
    expect(CONVERSION_EVENTS).toContain(event);
  });

  test('the funnel stages this work introduced are all wired', () => {
    for (const stage of ['preview_started', 'preview_completed', 'signup_started', 'trial_started', 'upgrade_started', 'subscribed']) {
      expect(emitted).toContain(stage);
    }
  });
});
