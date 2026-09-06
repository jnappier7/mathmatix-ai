// tests/unit/freeTierCopy.test.js
//
// The free tier is one constant, and twelve surfaces used to restate it as a
// literal — the 402 message and payload, the billing module, and eight public
// pages. That meant changing the tier did not throw or fail a test; it just
// made the product state a number it had stopped enforcing, in twelve places,
// including the wall where it asks for money.
//
// These tests hold the number down to one definition and fail if any surface
// starts disagreeing with it again.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { FREE_WEEKLY_SECONDS, FREE_QUOTA_RESET_DAYS } = require('../../utils/aiTimeMeter');
const FREE_MINUTES = Math.round(FREE_WEEKLY_SECONDS / 60);

// Comments explain what a value used to be, so they name the old number on
// purpose. Assertions here read code and copy, never the explanation of it.
const stripComments = (src) => src
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const PUBLIC_SURFACES = [
  'public/index.html',
  'public/pricing.html',
  'public/for-students.html',
  'public/login.html',
  'public/mastery-chat.html',
  'public/js/modules/billing.js',
];

describe('the free tier is a small weekly taste', () => {
  test('three minutes a week', () => {
    // Pinned in turns, not minutes, by tests/unit/usageGate.test.js: the 30s
    // billing floor in utils/pipeline/persist.js makes this six turns a week.
    expect(FREE_MINUTES).toBe(3);
    expect(FREE_QUOTA_RESET_DAYS).toBe(7);
  });

  test('shrinking the window cannot strand anyone mid-window', () => {
    // usageGate resets when (now - lastAIQuotaReset) >= FREE_QUOTA_RESET_DAYS.
    // A smaller window means an existing user becomes eligible for a reset
    // sooner, never later — so nobody who was already gated waits longer than
    // they would have. That is why this needed no migration.
    expect(FREE_QUOTA_RESET_DAYS).toBeLessThanOrEqual(30);
  });
});

describe('nothing restates the quota as a literal', () => {
  test('the 402 message and payload derive from the constant', () => {
    const gate = stripComments(read('middleware/usageGate.js'));
    expect(gate).toMatch(/const freeMinutesTotal = Math\.round\(FREE_WEEKLY_SECONDS \/ 60\)/);
    expect(gate).toMatch(/freeMinutesTotal,/);          // shorthand, not a literal
    expect(gate).not.toMatch(/freeMinutesTotal:\s*\d/);
    expect(gate).not.toMatch(/\d+ free minutes this month/);
    // The sentence must not name the tier as the amount already spent: mid-
    // transition that number is smaller than what the student actually used.
    expect(gate).not.toMatch(/used your \$\{freeMinutesTotal\}/);
  });

  test.each(PUBLIC_SURFACES)('%s states no AI-minute figure but the real one', (file) => {
    const src = stripComments(read(file));
    const claimed = [...src.matchAll(/(\d+)\s*(?:free\s+)?AI[\s-]*min/gi)].map((m) => Number(m[1]));
    for (const n of claimed) {
      expect(n).toBe(FREE_MINUTES);
    }
  });

  // Retired PHRASINGS ("30 free AI minutes a month", the weekly/monthly window)
  // are swept by tests/unit/contentConsistency.test.js against every public page,
  // which is the copy-standards test and globs more surfaces than this list. What
  // is left here is the thing that test cannot see: the claim computed from the
  // old number.
  test.each(PUBLIC_SURFACES)('%s drops the hours conversion sized for the old tier', (file) => {
    const src = stripComments(read(file));
    // "usually 2-3 hours of tutoring" was true of thirty AI minutes of tutor
    // response time. It is not true of three, and it is exactly the kind of
    // derived claim that outlives the number it was derived from.
    expect(src).not.toMatch(/2[–—-]3 hours/);
    expect(src).not.toMatch(/2&ndash;3 hours/);
  });
});

describe('server-rendered copy states the tier once', () => {
  // Emails are the surface that rots quietest: nobody re-reads a cancellation
  // template, and there is no page to scroll past it on. All three of these
  // carried their own sentence, and routes/adminEmail.js was already claiming
  // "30 free minutes per week" while the meter enforced 30 a month.
  const SERVER_SURFACES = ['utils/emailService.js', 'routes/adminEmail.js'];

  test.each(SERVER_SURFACES)('%s states the tier through the shared phrase, not a literal', (file) => {
    const src = stripComments(read(file));
    const claimed = [...src.matchAll(/(\d+)\s*(?:free\s+)?(?:AI\s+)?min(?:ute)?s?\b/gi)]
      // "Usually 10-30 minutes" (screener duration) and inactivity timeouts are
      // not the allowance. Only count figures sitting next to "free" or "plan".
      .filter((m) => /free|plan/i.test(src.slice(Math.max(0, m.index - 60), m.index + 60)))
      .map((m) => Number(m[1]));
    for (const n of claimed) {
      expect(n).toBe(FREE_MINUTES);
    }
  });

  test('the free-tier phrase has exactly one definition', () => {
    const meter = read('utils/aiTimeMeter.js');
    expect(meter).toMatch(/const FREE_TIER_MINUTES = Math\.round\(FREE_WEEKLY_SECONDS \/ 60\)/);
    for (const file of SERVER_SURFACES) {
      expect(read(file)).toMatch(/freeTierPhrase|TRIAL_DAYS/);
    }
  });
});

describe('the offer people are shown is the trial', () => {
  const { TRIAL_DAYS } = require('../../utils/trialGrant');

  test.each(['public/index.html', 'public/pricing.html', 'public/login.html'])(
    '%s leads with the free trial rather than the free tier', (file) => {
      const src = stripComments(read(file));
      expect(src).toMatch(new RegExp(`${TRIAL_DAYS} days`, 'i'));
    });

  test('the new-user banner describes the trial they actually have', () => {
    // A brand-new account is trialing — the grant happens at signup. The banner
    // used to welcome them with the free-tier allowance, which is the thing they
    // drop to in two weeks, not the thing they have.
    const billing = read('public/js/modules/billing.js');
    const fn = billing.slice(billing.indexOf('export function showNewUserPricingPrompt'));
    expect(fn).toMatch(/st\.isTrialing/);
    expect(fn).toMatch(/trialDaysRemaining/);
  });
});
