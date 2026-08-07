#!/usr/bin/env node
/**
 * Transcript Mining Cron — nightly tutor-quality sweep.
 *
 * Runs the tutor-reply judges (the same detectors as the eval harness) over
 * conversations active in the last 24h and saves a ranked TutorQualityReport.
 * Read it on GET /api/admin/tutor-quality-report. Violations are CANDIDATES
 * for human review — nothing is auto-actioned.
 *
 * Usage:  node scripts/mineTranscripts.js [--hours=24] [--max-conversations=500]
 *                                         [--llm-budget=40] [--no-llm]
 *         npm run cron:mine-transcripts
 *
 * Render cron (configured manually in the dashboard, per CLAUDE.md — this
 * repo's render.yaml is reference only):
 *   Schedule: 0 7 * * *   (07:00 UTC ≈ nightly, after US evening usage)
 *   Command:  npm run cron:mine-transcripts
 *
 * Env knobs: TRANSCRIPT_MINER_LLM_BUDGET, TRANSCRIPT_MINER_MAX_CONVERSATIONS,
 *            TRANSCRIPT_MINER_DISABLE_LLM=true, EVAL_JUDGE_MODEL.
 *
 * @module mineTranscripts
 */

// Load .env for local runs. In production (Render) env vars are injected
// directly and there is no .env file, so a missing dotenv must not crash.
try {
  require('dotenv').config();
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}

const mongoose = require('mongoose');
const { runSweepAndSave } = require('../utils/transcriptMiner');

function argValue(name) {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : null;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('[mineTranscripts] MONGO_URI is required.');
    process.exit(1);
  }

  const options = { trigger: 'cron' };
  if (argValue('hours')) options.windowHours = Number(argValue('hours'));
  if (argValue('max-conversations')) options.maxConversations = Number(argValue('max-conversations'));
  if (argValue('llm-budget')) options.llmBudget = Number(argValue('llm-budget'));
  if (process.argv.includes('--no-llm')) options.llmEnabled = false;

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[mineTranscripts] Connected. Sweeping…');

  try {
    const report = await runSweepAndSave(options);
    const s = report.stats || {};
    console.log(`[mineTranscripts] Run ${report._id} saved.`);
    console.log(`  window: last ${report.windowHours}h · conversations: ${s.conversationsScanned} · turns judged: ${s.turnsJudged}`);
    console.log(`  violations: ${s.totalViolations} · LLM calls: ${report.llmTier?.calls ?? 0} · ${report.durationMs}ms`);
    for (const b of s.rankedJudges || []) {
      if (b.violations > 0) console.log(`    ${b.judge}: ${b.violations}/${b.eligibleTurns} eligible turns (${(b.violationRate * 100).toFixed(1)}%)`);
    }
    console.log('  Review: GET /api/admin/tutor-quality-report');
  } finally {
    await mongoose.disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[mineTranscripts] Failed:', err);
    process.exit(1);
  }
);
