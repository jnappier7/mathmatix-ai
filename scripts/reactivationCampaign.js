#!/usr/bin/env node
/**
 * Summer-slide reactivation campaign (one-off).
 *
 * Targets the warm base — students who were engaged (>= MIN_MINUTES of real
 * tutoring) but have gone dormant (no login in DORMANT_DAYS). Sends the
 * historical-progress PARENT email to linked parents, and (opt-in) the
 * re-engagement KID email to students. Personalizes per student: chosen tutor
 * name, skills mastered, minutes, best streak.
 *
 * SAFETY:
 *   - DRY RUN by default. Prints exactly what would send; sends nothing.
 *   - `--send`         actually sends PARENT emails to linked parents.
 *   - `--include-kids` (with --send) ALSO sends KID emails (minors — opt-in).
 *   - `--limit N`      cap the number of students processed.
 *   - Per-student guard (lastReactivationAt): won't re-email within 14 days.
 *   - `--send` REQUIRES env CAMPAIGN_MAILING_ADDRESS (CAN-SPAM compliance).
 *
 * Usage:
 *   node scripts/reactivationCampaign.js                 # dry run, all
 *   node scripts/reactivationCampaign.js --limit 5       # dry run, 5 students
 *   node scripts/reactivationCampaign.js --send          # send parent emails
 *   node scripts/reactivationCampaign.js --send --include-kids
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const { sendReactivationParentEmail, sendReactivationKidEmail } = require('../utils/emailService');

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const INCLUDE_KIDS = args.includes('--include-kids');
const limitArg = args.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(args[args.indexOf(limitArg) + 1] || limitArg.split('=')[1], 10) : 0;

const MIN_MINUTES = parseInt(process.env.CAMPAIGN_MIN_MINUTES || '5', 10);
const DORMANT_DAYS = parseInt(process.env.CAMPAIGN_DORMANT_DAYS || '14', 10);
const RESEND_GUARD_DAYS = 14;
const DELAY_MS = 1000;
const EXCLUDE_EMAILS = ['jasonnappier@gmail.com']; // founder/test account
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MAILING_ADDRESS = process.env.CAMPAIGN_MAILING_ADDRESS || '';

function tutorName(id) {
  return (TUTOR_CONFIG[id] && TUTOR_CONFIG[id].name) || 'their tutor at Mathmatix';
}
function countMastered(skillMastery) {
  if (!skillMastery) return 0;
  const vals = typeof skillMastery.values === 'function' ? skillMastery.values() : Object.values(skillMastery);
  let n = 0;
  for (const m of vals) if (m && m.status === 'mastered') n++;
  return n;
}
function bestStreak(s) {
  return s.longestStreak || s.dailyQuests?.longestStreak || s.dailyQuests?.currentStreak || s.currentStreak || 0;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`\n=== Summer Reactivation Campaign ===`);
  console.log(SEND ? '🔴 LIVE SEND' : '🟢 DRY RUN (no emails will be sent)');
  console.log(`Filters: >= ${MIN_MINUTES} tutoring min, dormant >= ${DORMANT_DAYS}d. Kid emails: ${SEND && INCLUDE_KIDS ? 'YES' : 'no'}.\n`);

  if (SEND && !MAILING_ADDRESS) {
    console.error('❌ Refusing to send: set CAMPAIGN_MAILING_ADDRESS (required for CAN-SPAM compliance).');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const excludeIds = (await User.find({ email: { $in: EXCLUDE_EMAILS } }, { _id: 1 }).lean()).map(d => d._id);
  const dormantCutoff = new Date(Date.now() - DORMANT_DAYS * 86400000);
  const resendCutoff = new Date(Date.now() - RESEND_GUARD_DAYS * 86400000);

  let q = User.find({
    role: 'student',
    _id: { $nin: excludeIds },
    totalActiveTutoringMinutes: { $gte: MIN_MINUTES },
    $and: [
      { $or: [{ lastLogin: { $lt: dormantCutoff } }, { lastLogin: null }] },
      { $or: [{ lastReactivationAt: null }, { lastReactivationAt: { $lt: resendCutoff } }] },
    ],
  }).populate('parentIds', 'firstName email role');
  if (LIMIT > 0) q = q.limit(LIMIT);
  const students = await q;

  console.log(`Found ${students.length} engaged-but-dormant students.\n`);

  const summary = { parentSent: 0, kidSent: 0, parentSkipNoEmail: 0, failed: 0 };

  for (const s of students) {
    const data = {
      childFirstName: s.firstName,
      tutorName: tutorName(s.selectedTutorId),
      skillsMastered: countMastered(s.skillMastery),
      minutesThisYear: s.totalActiveTutoringMinutes || 0,
      longestStreak: bestStreak(s),
      baseUrl: BASE_URL,
      mailingAddress: MAILING_ADDRESS,
    };
    const parent = (s.parentIds || []).find(p => p && p.email && p.role === 'parent');
    const kidEmail = s.email;

    console.log(`• ${data.childFirstName} (${data.tutorName}, ${data.skillsMastered} skills, ${data.minutesThisYear} min, streak ${data.longestStreak})`);
    console.log(`    parent: ${parent ? parent.email : '— none linked —'} | kid: ${kidEmail}`);

    if (!SEND) { if (!parent) summary.parentSkipNoEmail++; continue; }

    let didSend = false;
    if (parent) {
      const r = await sendReactivationParentEmail(parent.email, { ...data, parentFirstName: parent.firstName });
      if (r.success) { summary.parentSent++; didSend = true; console.log(`    ✅ parent emailed`); }
      else { summary.failed++; console.log(`    ❌ parent email failed: ${r.error}`); }
      await sleep(DELAY_MS);
    } else {
      summary.parentSkipNoEmail++;
    }
    if (INCLUDE_KIDS && kidEmail) {
      const r = await sendReactivationKidEmail(kidEmail, data);
      if (r.success) { summary.kidSent++; didSend = true; console.log(`    ✅ kid emailed`); }
      else { summary.failed++; console.log(`    ❌ kid email failed: ${r.error}`); }
      await sleep(DELAY_MS);
    }
    if (didSend) {
      await User.findByIdAndUpdate(s._id, { lastReactivationAt: new Date() }).catch(() => {});
    }
  }

  console.log(`\n=== Summary ===`);
  if (!SEND) {
    console.log(`Dry run only. ${students.length} students would be processed.`);
    console.log(`Re-run with --send to email parents, add --include-kids to also email students.`);
  } else {
    console.log(`Parent emails sent: ${summary.parentSent}`);
    console.log(`Kid emails sent:    ${summary.kidSent}`);
    console.log(`Students with no linked parent: ${summary.parentSkipNoEmail}`);
    console.log(`Failures: ${summary.failed}`);
  }
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error('CAMPAIGN ERROR:', e.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
