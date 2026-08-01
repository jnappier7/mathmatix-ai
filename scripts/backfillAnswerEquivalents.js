/**
 * BACKFILL: answer.equivalents[] for exact-match problems.
 *
 * The Fable item banks (alg1/calc/sat) store answers with typographic operators
 * and, for equation-form answers, a leading "x = ". Both mis-grade real student
 * input against the deterministic solver (verified 2026-08-01):
 *
 *   stored "x = −7"              student "-7"            → WRONG (bare value)
 *   stored "y − 1 = −2(x − 5)"   student "y-1=-2(x-5)"   → WRONG (U+2212)
 *
 * Neither is a student error. This adds the missing surface forms to
 * `answer.equivalents[]` — additive only, never touching `answer.value`, so the
 * display form keeps its typography.
 *
 * Read-only unless --write is passed.
 *   node scripts/backfillAnswerEquivalents.js            # report what would change
 *   node scripts/backfillAnswerEquivalents.js --write    # apply
 */

require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

const WRITE = process.argv.includes('--write');

/** Typographic → ASCII, matching utils/mathSolver's own normalization map. */
function toAscii(s) {
  return String(s)
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/⋅|·/g, '*')
    .replace(/ /g, ' ');
}

/**
 * Surface forms a student could legitimately type for this answer.
 * Additive and conservative: only mechanical rewrites, never a re-derivation.
 */
function surfaceForms(value) {
  const out = new Set();
  const add = (v) => {
    const t = String(v == null ? '' : v).trim();
    if (t && t !== String(value).trim()) out.add(t);
  };

  const ascii = toAscii(value);
  add(ascii);
  add(ascii.replace(/\s+/g, ''));

  // "x = -7" → the bare value "-7". Students overwhelmingly type just the
  // number when the question asks them to solve for a variable. Only for a
  // SINGLE-variable assignment: an equation with variables on both sides
  // ("y - 1 = -2(x - 5)") is not equivalent to its right-hand side.
  const assign = ascii.match(/^\s*([a-zA-Z])\s*=\s*(.+?)\s*$/);
  if (assign && !/[a-zA-Z]/.test(assign[2])) {
    add(assign[2]);
    add(assign[2].replace(/\s+/g, ''));
  }
  return [...out];
}

async function ensureSrvResolvable(uri) {
  if (!/^mongodb\+srv:\/\//.test(uri || '')) return;
  const host = uri.split('@').pop().split('/')[0].split('?')[0];
  const probe = () => new Promise((res) => dns.resolveSrv(`_mongodb._tcp.${host}`, (e) => res(!e)));
  if (await probe()) return;
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('[dns] local resolver failed the SRV lookup — using public resolvers');
}

async function main() {
  await ensureSrvResolvable(process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  const docs = await Problem.find({ 'answer.type': 'exact', 'answer.value': { $type: 'string' } })
    .select('problemId answer source').lean();

  let changed = 0;
  let added = 0;
  const samples = [];

  for (const d of docs) {
    const value = d.answer.value;
    const existing = Array.isArray(d.answer.equivalents) ? d.answer.equivalents.map(String) : [];
    const fresh = surfaceForms(value).filter((f) => !existing.includes(f));
    if (!fresh.length) continue;
    changed += 1;
    added += fresh.length;
    if (samples.length < 8) samples.push(`  ${JSON.stringify(value)}  +  ${JSON.stringify(fresh)}`);
    if (WRITE) {
      await Problem.updateOne(
        { _id: d._id },
        { $set: { 'answer.equivalents': existing.concat(fresh) } }
      );
    }
  }

  console.log(`exact-answer problems scanned: ${docs.length}`);
  console.log(`${WRITE ? 'updated' : 'would update'}: ${changed} problems (+${added} equivalent forms)`);
  if (samples.length) console.log('samples:\n' + samples.join('\n'));
  if (!WRITE) console.log('\n(dry run — pass --write to apply)');

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { surfaceForms, toAscii };
