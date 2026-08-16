#!/usr/bin/env node
/**
 * FERPA Annual Notification Cron — 34 CFR § 99.7.
 *
 * Sends every parent with a linked child their annual notice of FERPA rights:
 * inspect and review, request amendment, consent to disclosure, opt out of
 * directory information, and file a complaint with the Department of Education.
 *
 * public/privacy.html has promised this notice ("at the start of each school
 * year and upon new enrollment") since long before anything sent it.
 * utils/ferpaCompliance.js had the generator and the sender fully written and
 * unit-tested, but nothing in the codebase ever called them — this script is
 * the missing caller.
 *
 * Safe to run repeatedly. sendAnnualNotifications skips any parent already
 * notified in the current school year (August 1 boundary), so a daily schedule
 * sends each parent exactly once per year and picks up newly-linked parents
 * without a second job.
 *
 * Usage:  node scripts/ferpaAnnualNotification.js [--dry-run]
 *         npm run cron:ferpa-notice
 *
 * Render cron (configured manually in the dashboard, per CLAUDE.md — this
 * repo's render.yaml is reference only):
 *   Schedule: 0 13 * * *   (13:00 UTC daily; the skip-guard makes this
 *                           once-per-parent-per-year in practice)
 *   Command:  npm run cron:ferpa-notice
 *
 * @module ferpaAnnualNotification
 */

// Load .env for local runs. In production (Render) env vars are injected
// directly and there is no .env file, so a missing dotenv must not crash.
try {
  require('dotenv').config();
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}

const mongoose = require('mongoose');
const { sendAnnualNotifications, schoolYearLabel } = require('../utils/ferpaCompliance');
const { sendComposedNotification } = require('../utils/emailService');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('[ferpaAnnualNotification] MONGO_URI is required.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[ferpaAnnualNotification] Connected. School year ${schoolYearLabel()}${dryRun ? ' (DRY RUN)' : ''}`);

  try {
    // In a dry run we still walk the full selection and skip logic — only the
    // actual send is stubbed — so the reported counts are real.
    const sendFn = dryRun
      ? async (to, subject) => { console.log(`  would send to ${to}: ${subject}`); }
      : sendComposedNotification;

    const summary = await sendAnnualNotifications(sendFn);

    console.log('[ferpaAnnualNotification] Done.');
    console.log(`  sent: ${summary.sent} · skipped (already notified this year): ${summary.skipped} · failed: ${summary.failed}`);
    for (const e of summary.errors || []) {
      console.error(`    parent ${e.parentId}: ${e.error}`);
    }

    // A failure to notify is a compliance gap, not a warning — surface it to
    // the cron runner so a red run is visible rather than buried in logs.
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().then(
  () => process.exit(process.exitCode || 0),
  (err) => {
    console.error('[ferpaAnnualNotification] Failed:', err);
    process.exit(1);
  }
);
