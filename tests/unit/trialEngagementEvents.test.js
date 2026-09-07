// tests/unit/trialEngagementEvents.test.js
//
// trial_activated and trial_returned sat in the CONVERSION_EVENTS enum marked
// "NOT YET EMITTED" from the day the enum was written. This pins them now that
// they fire.
//
// WHY THEY MATTER: the conversion rate cannot tell a trialist who never really
// used the product from one who used it and decided it was not worth $9.95.
// Those two failures look identical in the number and have OPPOSITE fixes — the
// first is a product/onboarding problem, the second is a pricing or value
// problem. Without these two events a weak trial cohort is uninterpretable, and
// the first cohort of no-card trials expires two weeks after they were granted.
//
// WHAT IS EASY TO GET WRONG, and what each block below guards:
//   1. Volume. Both events describe a THRESHOLD being crossed. Emitted per turn
//      instead, they would bury the table they live in and make "how many
//      trialists activated" a distinct-count query over noise.
//   2. The definition of a "real" turn. persist bills a turn only when the
//      meter charges for it; counting trial usage anywhere else creates a
//      second, quietly diverging answer to the same question.
//   3. The enum. It is mongoose-enforced and recordConversionEvent swallows
//      write errors on purpose, so an event name that is not listed reaches
//      Winston and never lands a queryable row — failing in total silence.

const fs = require('fs');
const path = require('path');

const {
  TRIAL_DAYS,
  TRIAL_ACTIVATION_TURNS,
  dayKey,
  grantTrial,
  recordTrialActivity,
} = require('../../utils/trialGrant');
const { CONVERSION_EVENTS } = require('../../models/conversionEvent');

const REPO = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-07T10:00:00Z');

/** A user one turn into a fresh trial, as grantTrial leaves them. */
const trialingUser = (overrides = {}) => {
  const user = { _id: 'u1', trialTurns: 0, trialActiveDays: [], ...overrides };
  grantTrial(user, START);
  return user;
};

const at = (ms) => new Date(START.getTime() + ms);
const names = (events) => events.map((e) => e.event);

// ============================================================================
// The enum — the silent-failure seam
// ============================================================================

describe('CONVERSION_EVENTS carries both names', () => {
  test.each(['trial_activated', 'trial_returned'])('%s is a valid event', (name) => {
    expect(CONVERSION_EVENTS).toContain(name);
  });

  test('the enum no longer claims they are unemitted', () => {
    expect(read('models/conversionEvent.js')).not.toMatch(/NOT YET EMITTED/);
  });

  test('a real row with the context these events carry actually validates', () => {
    // toContain() checks the array; this checks the SCHEMA, which is what
    // actually rejects a row. The enum is mongoose-enforced and
    // recordConversionEvent swallows write errors by design, so a name that
    // fails validation reaches Winston and never lands a queryable row — the
    // failure is total silence, and a grep-level test would not see it.
    const ConversionEvent = require('../../models/conversionEvent');
    const mongoose = require('mongoose');
    const userId = new mongoose.Types.ObjectId();

    for (const { event, context } of [
      { event: 'trial_activated', context: { turns: TRIAL_ACTIVATION_TURNS, trialDaysRemaining: 11 } },
      { event: 'trial_returned', context: { activeDays: 3, trialDaysRemaining: 9 } },
    ]) {
      const err = new ConversionEvent({ event, userId, context }).validateSync();
      expect(err).toBeUndefined();
    }
  });

  test('and an unlisted event does not — proving the check above has teeth', () => {
    const ConversionEvent = require('../../models/conversionEvent');
    const err = new ConversionEvent({ event: 'trial_vibed' }).validateSync();
    expect(err).toBeDefined();
  });
});

// ============================================================================
// trial_activated — depth
// ============================================================================

describe('trial_activated', () => {
  test('fires on the turn that reaches the threshold, and not before', () => {
    const user = trialingUser();
    for (let i = 1; i < TRIAL_ACTIVATION_TURNS; i++) {
      expect(names(recordTrialActivity(user, at(i * 60000)))).not.toContain('trial_activated');
    }
    const events = recordTrialActivity(user, at(TRIAL_ACTIVATION_TURNS * 60000));
    expect(names(events)).toContain('trial_activated');
    expect(user.trialTurns).toBe(TRIAL_ACTIVATION_TURNS);
  });

  test('fires exactly once, however long they keep going', () => {
    // The count is `=== threshold`, not `>=`. A `>=` here would emit on every
    // turn for the rest of the trial — thousands of rows for one fact.
    const user = trialingUser();
    let fired = 0;
    for (let i = 1; i <= TRIAL_ACTIVATION_TURNS * 6; i++) {
      fired += names(recordTrialActivity(user, at(i * 60000))).filter((n) => n === 'trial_activated').length;
    }
    expect(fired).toBe(1);
  });

  test('carries the context that makes it answerable', () => {
    const user = trialingUser();
    let activated;
    for (let i = 1; i <= TRIAL_ACTIVATION_TURNS; i++) {
      activated = recordTrialActivity(user, at(i * 60000)).find((e) => e.event === 'trial_activated') || activated;
    }
    expect(activated.context).toMatchObject({ turns: TRIAL_ACTIVATION_TURNS });
    // "How far into the trial did they get serious?" is the follow-up question
    // to every activation number, so it travels with the event.
    expect(activated.context.trialDaysRemaining).toBe(TRIAL_DAYS);
  });
});

// ============================================================================
// trial_returned — breadth
// ============================================================================

describe('trial_returned', () => {
  test('does not fire on the first day — arriving is not returning', () => {
    const user = trialingUser();
    expect(names(recordTrialActivity(user, at(0)))).not.toContain('trial_returned');
    expect(names(recordTrialActivity(user, at(8 * 3600000)))).not.toContain('trial_returned');
    expect(user.trialActiveDays).toEqual([dayKey(START)]);
  });

  test('fires on the first turn of a new day', () => {
    const user = trialingUser();
    recordTrialActivity(user, at(0));
    const events = recordTrialActivity(user, at(DAY_MS));
    expect(names(events)).toContain('trial_returned');
    expect(events.find((e) => e.event === 'trial_returned').context.activeDays).toBe(2);
  });

  test('fires once per day, not once per turn within it', () => {
    const user = trialingUser();
    recordTrialActivity(user, at(0));
    let fired = 0;
    for (let t = 0; t < 20; t++) {
      fired += names(recordTrialActivity(user, at(DAY_MS + t * 60000))).filter((n) => n === 'trial_returned').length;
    }
    expect(fired).toBe(1);
  });

  test('fires again on each further day, so the rows are the retention curve', () => {
    // Deliberately NOT once per trial. Row count per user = days they showed up
    // after the first, which is the shape of within-trial retention.
    const user = trialingUser();
    recordTrialActivity(user, at(0));
    for (let d = 1; d <= 4; d++) {
      expect(names(recordTrialActivity(user, at(d * DAY_MS)))).toContain('trial_returned');
    }
    expect(user.trialActiveDays).toHaveLength(5);
  });

  test('the day list cannot grow without bound', () => {
    const user = trialingUser();
    // Past the trial's own length — a re-grant or clock skew must not let this
    // array grow forever on a document that is read on every request.
    for (let d = 0; d < TRIAL_DAYS * 3; d++) {
      user.trialEndsAt = new Date(at(d * DAY_MS).getTime() + DAY_MS);
      recordTrialActivity(user, at(d * DAY_MS));
    }
    expect(user.trialActiveDays.length).toBeLessThanOrEqual(TRIAL_DAYS + 1);
  });
});

// ============================================================================
// Who is counted
// ============================================================================

describe('only trialists are counted', () => {
  test('an expired trial records nothing and does not advance the counters', () => {
    const user = trialingUser();
    recordTrialActivity(user, at(0));
    const turnsBefore = user.trialTurns;
    const daysBefore = [...user.trialActiveDays];

    expect(recordTrialActivity(user, at((TRIAL_DAYS + 1) * DAY_MS))).toEqual([]);
    expect(user.trialTurns).toBe(turnsBefore);
    expect(user.trialActiveDays).toEqual(daysBefore);
  });

  test('a user who never had a trial records nothing', () => {
    const user = { _id: 'u2' };
    expect(recordTrialActivity(user, START)).toEqual([]);
    expect(user.trialTurns).toBeUndefined();
  });

  test('tolerates a lean doc with the fields missing', () => {
    // These read off req.user, which is sometimes lean and sometimes a fresh
    // account created before the fields existed.
    const user = { _id: 'u3', trialEndsAt: new Date(START.getTime() + DAY_MS) };
    expect(() => recordTrialActivity(user, START)).not.toThrow();
    expect(user.trialTurns).toBe(1);
    expect(user.trialActiveDays).toEqual([dayKey(START)]);
  });
});

// ============================================================================
// The wiring — where it is called from, which is what makes it real
// ============================================================================

describe('persist emits them on billed turns only', () => {
  const persistSrc = read('utils/pipeline/persist.js');

  test('the call sits inside the billed-turn block', () => {
    // "A genuine tutoring turn" must have ONE definition — the meter's. If this
    // call moves outside `if (billedSeconds > 0)`, a "hi" counts as trial usage
    // and the activation number stops meaning what it says.
    const block = persistSrc.slice(persistSrc.indexOf('if (billedSeconds > 0)'));
    const callIndex = block.indexOf('recordTrialActivity');
    expect(callIndex).toBeGreaterThan(-1);
    // ...and before the block closes, i.e. before the cognitive-load section
    // that follows it.
    const blockEnd = block.indexOf('Persist cognitive load snapshot');
    expect(blockEnd).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(blockEnd);
  });

  test('every returned event is recorded, with the user id', () => {
    expect(persistSrc).toMatch(/for \(const \{ event, context \} of recordTrialActivity\(user\)\)/);
    expect(persistSrc).toMatch(/recordConversionEvent\(event, \{ userId: user\._id, context \}\)/);
  });

  test('telemetry cannot break a tutoring turn', () => {
    // recordConversionEvent already swallows its own write errors; this guards
    // the call site, which runs mid-turn inside persist.
    // Anchored on the call itself rather than a fixed byte window, so growing
    // the comment above it cannot silently stop this from checking anything.
    const call = persistSrc.indexOf('recordTrialActivity(user)');
    const tryOpen = persistSrc.lastIndexOf('try {', call);
    const catchAfter = persistSrc.indexOf('catch (err)', call);
    expect(tryOpen).toBeGreaterThan(-1);
    expect(catchAfter).toBeGreaterThan(call);
    // The try must be the one wrapping this call, not an earlier unrelated one:
    // nothing may close it between the try and the call.
    expect(persistSrc.slice(tryOpen, call)).not.toMatch(/catch \(/);
  });

  test('mutations ride out on the existing save, adding no write', () => {
    // recordTrialActivity mutates and does not save (same contract as
    // grantTrial). The counters only persist because persist saves the user
    // afterwards — if that ordering inverts, the events fire forever because
    // trialTurns never advances.
    const from = persistSrc.indexOf('Trial engagement telemetry');
    expect(persistSrc.indexOf('await user.save()', from)).toBeGreaterThan(from);
    expect(read('utils/trialGrant.js')).toMatch(/Mutates the user's trial counters and does NOT save/);
  });
});
