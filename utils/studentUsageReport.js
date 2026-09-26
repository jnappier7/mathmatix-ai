/* ============================================================
   utils/studentUsageReport.js — student usage + consumer conversion,
   from the data we already collect.

   WHY THIS EXISTS
   ---------------
   `GET /api/admin/funnel` answers "how many signups paid" from User fields
   alone, and those fields can't tell a payment from a card trial:
   `subscriptionStartDate` is stamped at checkout, which for a trial commits
   no money. Meanwhile models/conversionEvent.js has been logging every stage
   of the funnel (trial activity, the free-quota wall, checkout, the trial's
   first charge) and nothing read it. This module joins the two.

   DEFINITIONS (each one is a place a flattering number could hide)
   ----------------------------------------------------------------
   - Population: accounts that HOLD the student role. Demo accounts and demo
     clones are counted, reported, and excluded from every rate.
   - Segment: `school` (has a schoolLicenseId) and `founding` (founding-school
     email domain) get unlimited access without paying, so they are NOT in the
     conversion cohort — counting them as "free users who didn't convert"
     would deflate conversion; counting them as paid would inflate it.
   - Paid: a `subscribed` event that did not start in a trial, OR a
     `trial_converted` event, OR a current paid tier (covers anyone who paid
     before the events existed). A card trial is never paid.
   - Parent-paid: the subscription lives on a linked parent's account. It is
     a real sale but not the student's own, so it is reported beside the
     student conversion rate, never folded into it.
   - Active: a conversation touched within the window (Conversation
     .lastActivity) — actual tutoring, not a login.
   ============================================================ */

const { isInTrial } = require('./trialGrant');
const { isFoundingSchoolUser } = require('./foundingSchool');

const DAY_MS = 24 * 60 * 60 * 1000;

// A cohort smaller than this produces rates that move 3+ points per student.
const MIN_COHORT_FOR_RATES = 30;

// Signups younger than a full trial haven't had a chance to convert yet.
const CONVERSION_MATURITY_DAYS = 14;

// Events the report reads. The route queries exactly these.
const REPORT_EVENTS = [
  'trial_started',
  'trial_activated',
  'trial_returned',
  'free_quota_exhausted',
  'upgrade_started',
  'subscribed',
  'trial_converted',
  'subscription_ended',
];

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/** 'demo' | 'school' | 'founding' | 'consumer' */
function segmentOf(student) {
  if (student.isDemo || student.isDemoClone) return 'demo';
  if (student.schoolLicenseId) return 'school';
  if (isFoundingSchoolUser(student)) return 'founding';
  return 'consumer';
}

/**
 * What the student's access rests on right now.
 * 'paying' | 'card_trial' | 'trial' | 'legacy_pack' | 'parent_paid' | 'free'
 */
function planOf(student, { now, payingParentIds }) {
  const inTrial = isInTrial(student, now);
  const tier = student.subscriptionTier || 'free';
  if (tier === 'unlimited') return inTrial ? 'card_trial' : 'paying';
  if (tier.startsWith('pack_')) return 'legacy_pack';
  if (inTrial) return 'trial';
  if ((student.parentIds || []).some((id) => payingParentIds.has(String(id)))) return 'parent_paid';
  return 'free';
}

/** Monday 00:00 UTC of the week containing `date`, as YYYY-MM-DD. */
function weekStart(date) {
  const d = new Date(date);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back))
    .toISOString().slice(0, 10);
}

/** Per-user sets of the funnel events that user reached. */
function indexEvents(events) {
  const byUser = new Map();
  for (const e of events) {
    if (!e.userId) continue;
    const id = String(e.userId);
    if (!byUser.has(id)) byUser.set(id, new Set());
    const set = byUser.get(id);
    if (e.event === 'subscribed') {
      // Only a checkout outside a trial moved money.
      set.add(e.context?.startedInTrial ? 'card_trial_started' : 'paid');
    } else if (e.event === 'trial_converted') {
      set.add('paid');
    } else if (e.event === 'subscription_ended') {
      set.add(e.context?.endedInTrial ? 'trial_cancelled' : 'churned');
    } else {
      set.add(e.event);
    }
  }
  return byUser;
}

/**
 * @param {object}   input
 * @param {object[]} input.students          lean users holding the student role
 * @param {Set<string>} input.payingParentIds ids of parents on the unlimited tier
 * @param {Map<string,Date>} input.lastActivityByUser  latest conversation activity
 * @param {object[]} input.events            ConversionEvent rows (REPORT_EVENTS)
 * @param {Date|null} input.earliestEventAt  first ConversionEvent ever written
 * @param {Date|null} input.startDate        signup cohort window (null = all time)
 * @param {Date}     input.endDate
 * @param {Date}     [input.now]
 */
function buildStudentUsageReport({
  students,
  payingParentIds = new Set(),
  lastActivityByUser = new Map(),
  events = [],
  earliestEventAt = null,
  startDate = null,
  endDate,
  now = new Date(),
}) {
  const eventsByUser = indexEvents(events);
  const segments = { demo: 0, school: 0, founding: 0, consumer: 0 };
  const plans = { paying: 0, card_trial: 0, trial: 0, legacy_pack: 0, parent_paid: 0, free: 0 };
  const active = { day: 0, week: 0, month: 0 };
  const minutes = [];
  let real = 0;
  let activatedEver = 0;

  const cohort = [];
  const inWindow = (d) => d && (!startDate || d >= startDate) && d <= endDate;

  for (const s of students) {
    const segment = segmentOf(s);
    segments[segment]++;
    if (segment === 'demo') continue;
    real++;

    const last = lastActivityByUser.get(String(s._id));
    if (last) {
      const age = now - new Date(last);
      if (age <= DAY_MS) active.day++;
      if (age <= 7 * DAY_MS) active.week++;
      if (age <= 30 * DAY_MS) active.month++;
    }
    const mins = Number(s.totalActiveTutoringMinutes) || 0;
    if (mins > 0) {
      activatedEver++;
      minutes.push(mins);
    }

    if (segment !== 'consumer') continue;
    const plan = planOf(s, { now, payingParentIds });
    plans[plan]++;
    const createdAt = s.createdAt ? new Date(s.createdAt) : null;
    if (inWindow(createdAt)) cohort.push({ s, plan, createdAt, mins });
  }
  minutes.sort((a, b) => a - b);

  // ── Conversion: consumer students who signed up in the window ──
  const stage = {
    signedUp: 0, activated: 0, trialStarted: 0, trialActivated: 0, trialReturned: 0,
    hitFreeWall: 0, upgradeStarted: 0, paid: 0,
  };
  const now_ = {
    payingNow: 0, inTrialNow: 0, parentPaidNow: 0, churned: 0, trialCancelled: 0,
  };
  let paidOrParentPaid = 0;
  const weeks = new Map();
  let immature = 0;

  for (const { s, plan, createdAt, mins } of cohort) {
    const ev = eventsByUser.get(String(s._id)) || new Set();
    const paid = ev.has('paid') || plan === 'paying';

    stage.signedUp++;
    if (mins > 0) stage.activated++;
    if (s.hasUsedTrial || ev.has('trial_started') || ev.has('card_trial_started')) stage.trialStarted++;
    if (ev.has('trial_activated')) stage.trialActivated++;
    if (ev.has('trial_returned')) stage.trialReturned++;
    if (ev.has('free_quota_exhausted')) stage.hitFreeWall++;
    if (ev.has('upgrade_started')) stage.upgradeStarted++;
    if (paid) stage.paid++;
    if (paid || plan === 'parent_paid') paidOrParentPaid++;

    if (plan === 'paying') now_.payingNow++;
    if (plan === 'trial' || plan === 'card_trial') now_.inTrialNow++;
    if (plan === 'parent_paid') now_.parentPaidNow++;
    if (paid && plan !== 'paying') now_.churned++;
    if (ev.has('trial_cancelled')) now_.trialCancelled++;
    if (now - createdAt < CONVERSION_MATURITY_DAYS * DAY_MS) immature++;

    const wk = weekStart(createdAt);
    if (!weeks.has(wk)) weeks.set(wk, { weekOf: wk, signups: 0, activated: 0, paid: 0, payingNow: 0 });
    const w = weeks.get(wk);
    w.signups++;
    if (mins > 0) w.activated++;
    if (paid) w.paid++;
    if (plan === 'paying') w.payingNow++;
  }

  const funnelOrder = [
    ['Signed up', stage.signedUp],
    ['Activated (did tutoring)', stage.activated],
    ['Started a trial', stage.trialStarted],
    ['Trial activated (real use)', stage.trialActivated],
    ['Came back on a 2nd day of trial', stage.trialReturned],
    ['Hit the free-minute wall', stage.hitFreeWall],
    ['Started checkout', stage.upgradeStarted],
    ['Paid', stage.paid],
  ];
  const funnel = funnelOrder.map(([label, count]) => ({
    stage: label, count, pctOfSignups: pct(count, stage.signedUp),
  }));

  // ── Caveats travel with the numbers ──
  const caveats = [];
  if (stage.signedUp < MIN_COHORT_FOR_RATES) {
    caveats.push(`Only ${stage.signedUp} consumer signups in this window; each student moves the rates by ${stage.signedUp ? pct(1, stage.signedUp) : '—'} points. Treat them as anecdotes.`);
  }
  if (immature > 0) {
    caveats.push(`${immature} of these signups are under ${CONVERSION_MATURITY_DAYS} days old and have not had a full trial to decide; the paid rate will rise as they age. Compare mature weekly cohorts, not the headline.`);
  }
  if (!earliestEventAt) {
    caveats.push('No funnel events have been logged, so trial, wall and checkout stages read 0 and "paid" falls back to current subscription tier.');
  } else if (startDate === null || new Date(earliestEventAt) > startDate) {
    caveats.push(`Funnel events only exist from ${new Date(earliestEventAt).toISOString().slice(0, 10)}; for earlier signups the event stages under-count and "paid" falls back to current subscription tier (so someone who paid and left before then is invisible).`);
  }
  if (segments.school + segments.founding > 0) {
    caveats.push(`${segments.school + segments.founding} school-licensed or founding-school students have unlimited access without paying and are excluded from conversion (included in usage).`);
  }
  caveats.push('Parent-paid students are reported separately: the subscription is on the parent account. A student who upgraded by asking a parent shows as parent_paid, not paid.');
  caveats.push('"Active" means a tutoring conversation was touched in the window, not a login.');

  return {
    usage: {
      students: real,
      excludedDemo: segments.demo,
      segments: { consumer: segments.consumer, school: segments.school, founding: segments.founding },
      active: {
        last24h: active.day,
        last7d: active.week,
        last30d: active.month,
        stickiness: pct(active.day, active.month), // DAU/MAU
      },
      activatedEver,
      activationRate: pct(activatedEver, real),
      tutoringMinutesPerActivatedStudent: {
        median: percentile(minutes, 50),
        p75: percentile(minutes, 75),
        p90: percentile(minutes, 90),
      },
      consumerPlanMix: plans,
    },
    conversion: {
      cohort: 'consumer students by signup date',
      ...stage,
      ...now_,
      rates: {
        activation: pct(stage.activated, stage.signedUp),
        trialActivation: pct(stage.trialActivated, stage.trialStarted),
        wallToCheckout: pct(stage.upgradeStarted, stage.hitFreeWall),
        checkoutToPaid: pct(stage.paid, stage.upgradeStarted),
        signupToPaid: pct(stage.paid, stage.signedUp),
        signupToPaidIncludingParent: pct(paidOrParentPaid, stage.signedUp),
        paidChurn: pct(now_.churned, stage.paid),
      },
      funnel,
      weeklyCohorts: [...weeks.values()].sort((a, b) => a.weekOf.localeCompare(b.weekOf)),
    },
    caveats,
  };
}

module.exports = {
  buildStudentUsageReport,
  segmentOf,
  planOf,
  weekStart,
  REPORT_EVENTS,
  MIN_COHORT_FOR_RATES,
  CONVERSION_MATURITY_DAYS,
};
