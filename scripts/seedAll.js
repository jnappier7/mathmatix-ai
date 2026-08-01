#!/usr/bin/env node
/**
 * scripts/seedAll.js — seed every skill catalog and item bank in one pass.
 *
 * WHY THIS EXISTS
 * Nine seeders had to be run by hand, in an order documented nowhere, and three
 * of them (bank top-up, calc top-up, low-volume expansion) had no npm alias at
 * all — so "seed my new items and skills" meant remembering which files shipped
 * in which commit. Order is not cosmetic: seedBankTopupItems aborts when an
 * item's skillId is not already in the Skill collection, so skills must land
 * before items. And every Fable bank re-upserts `answer.value` from JSON, which
 * silently drops the typography fixes in `answer.equivalents[]` — so the
 * backfill has to run *after* the banks, every time, or students start getting
 * marked wrong for correct answers again.
 *
 * Every step here is an idempotent, source-scoped upsert. Re-running is safe.
 *
 * Usage:
 *   npm run seed:all                        # upsert everything, then backfill
 *   npm run seed:all -- --dry-run           # preflight + plan only, no writes
 *   npm run seed:all -- --fresh             # each bank clears its OWN prior rows first
 *   npm run seed:all -- --only=act-items,sat-items
 *   npm run seed:all -- --skip=low-volume-expansion
 *   npm run seed:all -- --continue-on-error
 *   npm run seed:all -- --list
 *
 * DELIBERATELY EXCLUDED
 *   scripts/seed-skills.js          runs Skill.deleteMany({}) — wipes the ENTIRE
 *                                   catalog (unified taxonomy, pattern skills,
 *                                   every course) and leaves only the ~40
 *                                   Ready-for-Algebra skills. Empty-database
 *                                   bootstrap only, never an incremental seed.
 *   scripts/seedSkillsFromProblems  derives placeholder skills from whatever is
 *                                   in the Problem collection; it invents rows
 *                                   the taxonomy never authored.
 *   scripts/seed-curriculum.js      legacy per-course K→Calc3 catalog, superseded
 *                                   by the unified taxonomy. Run it directly if
 *                                   you are standing up a fresh database.
 *   The pathway crosswalk           (seeds/unified-taxonomy/pathway-crosswalk*.json)
 *                                   is read from disk at runtime by
 *                                   utils/skillCanonicalizer.js. It ships with
 *                                   the code and needs no seeding.
 */

// Guarded so that --list and --dry-run still work on a checkout with no
// node_modules — the plan is answerable from the repo alone.
try { require('dotenv').config(); } catch { /* env comes from the shell */ }

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dns = require('dns');
const { spawnSync } = require('child_process');

const SEEDS = path.join(__dirname, '..', 'seeds');
const PRELOAD = path.join(__dirname, 'lib', 'dnsSrvFallback.js');

// ---------------------------------------------------------------- seed plan

/** ids from a plain JSON array payload */
const jsonIds = (file, key) => () =>
  JSON.parse(fs.readFileSync(path.join(SEEDS, file), 'utf8')).map((r) => r[key]);

/** ids from the gzipped low-volume payloads (committed compressed) */
const gzIds = (files, key) => () =>
  files.flatMap((file) =>
    JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(SEEDS, file))).toString('utf8'))
      .map((r) => r[key])
  );

const LOW_VOLUME_FILES = [
  'low-volume-expansion/act-items.generated.json.gz',
  'low-volume-expansion/calc3-items.generated.json.gz',
  'low-volume-expansion/general-items.generated.json.gz',
];

// Order is load-bearing: skills → items → fix-ups.
const STEPS = [
  {
    key: 'unified-skills',
    label: 'Unified taxonomy skills (Map of Mathmatix)',
    script: 'seedUnifiedSkills.js',
    supportsFresh: true,
    files: ['skills-unified.json'],
    model: 'Skill',
    idField: 'skillId',
    ids: jsonIds('skills-unified.json', 'skillId'),
  },
  {
    key: 'pattern-skills',
    label: 'Pattern-based skills',
    script: 'seed-pattern-skills.js',
    supportsFresh: false, // additive by design — it has no --fresh path
    files: ['skills-pattern-based.json'],
    model: 'Skill',
    idField: 'skillId',
    ids: jsonIds('skills-pattern-based.json', 'skillId'),
  },
  {
    key: 'act-items',
    label: 'ACT Math items (Fable)',
    script: 'seedActItems.js',
    supportsFresh: true,
    files: ['act-fable-items.generated.json'],
    model: 'Problem',
    idField: 'problemId',
    ids: jsonIds('act-fable-items.generated.json', 'problemId'),
  },
  {
    key: 'alg1-items',
    label: 'Algebra 1 assessment items (Fable)',
    script: 'seedAlg1Items.js',
    supportsFresh: true,
    files: ['alg1-items.generated.json'],
    model: 'Problem',
    idField: 'problemId',
    ids: jsonIds('alg1-items.generated.json', 'problemId'),
  },
  {
    key: 'calc-items',
    label: 'AP Calculus AB items (Fable)',
    script: 'seedCalcItems.js',
    supportsFresh: true,
    files: ['calc-items.generated.json'],
    model: 'Problem',
    idField: 'problemId',
    ids: jsonIds('calc-items.generated.json', 'problemId'),
  },
  {
    key: 'sat-items',
    label: 'Digital SAT Math items (Fable)',
    script: 'seedSatItems.js',
    supportsFresh: true,
    files: ['sat-items.generated.json'],
    model: 'Problem',
    idField: 'problemId',
    ids: jsonIds('sat-items.generated.json', 'problemId'),
  },
  {
    key: 'calc-topup-items',
    label: 'AP Calculus AB top-up (ten thin skills)',
    script: 'seedCalcTopupItems.js',
    supportsFresh: true,
    files: ['calc-topup-items.generated.json'],
    model: 'Problem',
    idField: 'problemId',
    ids: jsonIds('calc-topup-items.generated.json', 'problemId'),
  },
  {
    key: 'bank-topup-items',
    label: 'Low-volume bank top-up (calc3 + K-12 tail)',
    script: 'seedBankTopupItems.js',
    supportsFresh: true,
    files: ['bank-topup-items.generated.json'],
    model: 'Problem',
    idField: 'problemId',
    ids: jsonIds('bank-topup-items.generated.json', 'problemId'),
  },
  {
    key: 'low-volume-expansion',
    label: 'Low-volume expansion (82 skills)',
    script: 'seedLowVolumeExpansion.js',
    supportsFresh: true,
    files: LOW_VOLUME_FILES,
    model: 'Problem',
    idField: 'problemId',
    ids: gzIds(LOW_VOLUME_FILES, 'problemId'),
  },
  {
    key: 'answer-equivalents',
    label: 'Backfill answer.equivalents (must follow the banks)',
    script: 'backfillAnswerEquivalents.js',
    args: ['--write'],
    supportsFresh: false,
    files: [],
    // Nothing to verify by id — it edits existing docs rather than inserting.
  },
];

// ---------------------------------------------------------------------- cli

function parseArgs(argv) {
  const list = (flag) => {
    const hit = argv.find((a) => a.startsWith(`${flag}=`));
    return hit ? hit.slice(flag.length + 1).split(',').map((s) => s.trim()).filter(Boolean) : [];
  };
  return {
    dryRun: argv.includes('--dry-run'),
    fresh: argv.includes('--fresh'),
    showList: argv.includes('--list'),
    continueOnError: argv.includes('--continue-on-error'),
    only: list('--only'),
    skip: list('--skip'),
  };
}

function selectSteps(opts) {
  const keys = new Set(STEPS.map((s) => s.key));
  const unknown = [...opts.only, ...opts.skip].filter((k) => !keys.has(k));
  if (unknown.length) {
    throw new Error(
      `Unknown step key(s): ${unknown.join(', ')}\nValid keys: ${[...keys].join(', ')}`
    );
  }
  return STEPS
    .filter((s) => (opts.only.length ? opts.only.includes(s.key) : true))
    .filter((s) => !opts.skip.includes(s.key));
}

// --------------------------------------------------------------- preflight

/** Every payload must exist before we write anything — no half-seeded runs. */
function checkFiles(steps) {
  const missing = [];
  for (const step of steps) {
    for (const f of step.files) {
      const abs = path.join(SEEDS, f);
      if (!fs.existsSync(abs)) missing.push(`${step.key}: seeds/${f}`);
    }
  }
  return missing;
}

const resolveSrv = (host) =>
  new Promise((res) => dns.resolveSrv(`_mongodb._tcp.${host}`, (e) => res(!e)));

/**
 * Probe the Atlas SRV record once. If the local resolver can't answer it but
 * the public ones can, hand the working servers to the children via env — see
 * scripts/lib/dnsSrvFallback.js.
 */
async function dnsFallback(uri) {
  if (!/^mongodb\+srv:\/\//.test(uri || '')) return null;
  const host = uri.split('@').pop().split('/')[0].split('?')[0];
  if (await resolveSrv(host)) return null;

  const publicServers = ['8.8.8.8', '1.1.1.1'];
  const original = dns.getServers();
  dns.setServers(publicServers);
  if (await resolveSrv(host)) {
    console.log('[dns] local resolver failed the SRV lookup — using public resolvers\n');
    return publicServers.join(',');
  }
  dns.setServers(original);
  console.warn('[dns] SRV lookup failed on both local and public resolvers — connection may fail\n');
  return null;
}

// ------------------------------------------------------------------- runner

function runStep(step, opts, childEnv) {
  const args = [path.join(__dirname, step.script), ...(step.args || [])];
  if (opts.fresh && step.supportsFresh) args.push('--fresh');

  const res = spawnSync(process.execPath, ['--require', PRELOAD, ...args], {
    stdio: 'inherit',
    env: childEnv,
  });
  // A seeder that exits non-zero, is killed, or fails to spawn is all one thing
  // to us: this step did not land.
  return res.status === 0;
}

async function verify(steps) {
  const verifiable = steps.filter((s) => s.ids);
  if (!verifiable.length) return { ok: true, rows: [] };

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const models = {
    Skill: require('../models/skill'),
    Problem: require('../models/problem'),
  };

  const rows = [];
  for (const step of verifiable) {
    const ids = step.ids();
    const found = await models[step.model].countDocuments({ [step.idField]: { $in: ids } });
    rows.push({ key: step.key, model: step.model, expected: ids.length, found });
  }
  await mongoose.disconnect();
  return { ok: rows.every((r) => r.found >= r.expected), rows };
}

function printPlan(steps, opts) {
  console.log('Seed plan:\n');
  for (const [i, step] of steps.entries()) {
    const count = step.ids ? `${step.ids().length} ${step.model === 'Skill' ? 'skills' : 'items'}` : 'in-place fix';
    const fresh = opts.fresh && step.supportsFresh ? ' --fresh' : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${step.key.padEnd(22)} ${count.padEnd(16)} → ${step.script}${fresh}`);
  }
  const total = steps.reduce((n, s) => n + (s.ids ? s.ids().length : 0), 0);
  console.log(`\n  ${total} rows across ${steps.filter((s) => s.ids).length} banks.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.showList) {
    for (const s of STEPS) console.log(`${s.key.padEnd(22)} ${s.label}`);
    return 0;
  }

  let steps;
  try {
    steps = selectSteps(opts);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  if (!steps.length) {
    console.error('No steps selected.');
    return 1;
  }

  const missing = checkFiles(steps);
  if (missing.length) {
    console.error('Missing seed payload(s) — nothing was written:');
    missing.forEach((m) => console.error(`  ${m}`));
    return 1;
  }

  printPlan(steps, opts);

  if (opts.dryRun) {
    console.log('\n--dry-run: payloads validated, no database writes.');
    return 0;
  }

  if (!process.env.MONGO_URI) {
    console.error('\nMONGO_URI not set.');
    return 1;
  }

  const childEnv = { ...process.env };
  const servers = await dnsFallback(process.env.MONGO_URI);
  if (servers) childEnv.MM_SEED_DNS_SERVERS = servers;

  const failed = [];
  const ran = [];
  for (const [i, step] of steps.entries()) {
    console.log(`\n${'─'.repeat(72)}\n[${i + 1}/${steps.length}] ${step.label}\n${'─'.repeat(72)}`);
    if (runStep(step, opts, childEnv)) {
      ran.push(step);
      continue;
    }
    failed.push(step.key);
    console.error(`\n✗ ${step.key} failed.`);
    if (!opts.continueOnError) {
      // Later steps assume earlier ones landed (items need their skills; the
      // backfill needs the items), so stopping is the honest default.
      console.error('Stopping — later steps depend on this one. Re-run with --continue-on-error to override.');
      break;
    }
  }

  let result = { ok: true, rows: [] };
  if (ran.length) {
    console.log(`\n${'═'.repeat(72)}\nVerifying what actually landed\n${'═'.repeat(72)}`);
    try {
      result = await verify(ran);
    } catch (e) {
      console.error(`Verification could not run: ${e.message}`);
      result = { ok: false, rows: [] };
    }

    for (const r of result.rows) {
      const mark = r.found >= r.expected ? '✓' : '⚠';
      console.log(`  ${mark} ${r.key.padEnd(22)} ${String(r.found).padStart(5)}/${r.expected} in ${r.model}`);
    }
  }

  if (failed.length) {
    console.error(`\n✗ ${failed.length} step(s) failed: ${failed.join(', ')}`);
    return 1;
  }
  if (!result.ok) {
    console.error('\n⚠ Every seeder reported success but the database is short rows — investigate before trusting the bank.');
    return 1;
  }
  console.log(`\n✓ All ${ran.length} steps seeded and verified.`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error('seedAll failed:', e);
      process.exit(1);
    });
}

module.exports = { STEPS, parseArgs, selectSteps, checkFiles };
