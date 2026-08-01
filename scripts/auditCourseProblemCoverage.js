/**
 * AUDIT: course-module skills vs. problem-bank coverage.
 *
 * Read-only. For every course pathway, walks each module's skills (pathway +
 * moduleFile), resolves them through the skill canonicalizer (the bank is
 * keyed by bank/legacy ids while modules may use canonical unified ids — the
 * id-seam), and counts bank problems per skill with a difficulty spread.
 *
 * Answers the wiring question (owner, 2026-07-29): which courses could serve
 * bank-backed practice in course chat today (bank-first, lesson-file
 * fallback), and which have gaps that need generation first.
 *
 * Run (Render shell or local with Atlas access):
 *   node scripts/auditCourseProblemCoverage.js            # summary table
 *   node scripts/auditCourseProblemCoverage.js --detail   # per-skill rows for gaps
 *   node scripts/auditCourseProblemCoverage.js --suggest  # fuzzy-match uncovered course skills
 *                                                         # to existing bank skills (naming
 *                                                         # mismatches vs true content gaps)
 *
 * A skill counts as COVERED at >= MIN_BANK problems (enough for one varied
 * guided+independent practice sequence without repeats).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const { skillLookupCandidates } = require('../utils/skillCanonicalizer');

/**
 * mongodb+srv:// needs an SRV DNS lookup, and Node's resolver (c-ares) returns
 * EBADRESP against some local resolvers even when `dig` on the SAME machine
 * resolves the record fine (reproduced on macOS, 2026-08-01 — it blocked every
 * local run of this script). Probe once and fall back to public resolvers so
 * the audit runs locally instead of requiring a deploy + Render shell.
 * No-op for non-SRV URIs and when the default resolver works.
 */
async function ensureSrvResolvable(uri) {
  if (!/^mongodb\+srv:\/\//.test(uri || '')) return;
  const host = uri.split('@').pop().split('/')[0].split('?')[0];
  const srv = `_mongodb._tcp.${host}`;
  const probe = () => new Promise((res) => dns.resolveSrv(srv, (err) => res(!err)));
  if (await probe()) return;
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log(`[dns] local resolver failed the SRV lookup for ${host} — using public resolvers`);
  if (!(await probe())) console.warn('[dns] public resolvers failed too; the connection will likely fail');
}

const MIN_BANK = 5;
const DETAIL = process.argv.includes('--detail');
const SUGGEST = process.argv.includes('--suggest');

// ── Fuzzy mapping (--suggest): find bank skills that probably MEAN the same
// thing as an uncovered course skill, so mismatched naming can be fixed with
// canonicalizer aliases instead of generating duplicate content. ──

const STOP_TOKENS = new Set([
  'and', 'or', 'of', 'the', 'a', 'an', 'to', 'with', 'for', 'in', 'on',
  'intro', 'introduction', 'basics', 'basic', 'review', 'comprehensive',
  'practice', 'skills', 'skill', 'math', 'level', 'part',
]);

function tokens(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP_TOKENS.has(t))
  );
}

/** Jaccard on tokens, with a bonus when one side's tokens are a subset. */
function similarity(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter += 1;
  const union = aSet.size + bSet.size - inter;
  let score = inter / union;
  if (inter === aSet.size || inter === bSet.size) score += 0.2; // subset bonus
  return score;
}

/**
 * Rank bank skills against one course skill id. Matches on the bank skillId
 * itself AND on the Skill catalog's displayName for that id (naming often
 * diverges between the two).
 */
function suggestFor(courseSkillId, bankIndex) {
  const target = tokens(courseSkillId);
  const scored = [];
  for (const b of bankIndex) {
    const s = Math.max(similarity(target, b.idTokens), similarity(target, b.nameTokens));
    if (s >= 0.34) scored.push({ ...b, score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

function moduleSkills(pathwayDir, mod) {
  let skills = (mod.skills || []).slice();
  if (mod.moduleFile) {
    const mf = path.join(pathwayDir, '..', mod.moduleFile);
    try {
      const md = JSON.parse(fs.readFileSync(mf, 'utf8'));
      if (Array.isArray(md.skills) && md.skills.length) skills = md.skills;
      // Scaffold steps can carry their own skill tags too.
      for (const s of md.scaffold || []) {
        if (s.skill) skills.push(s.skill);
        if (Array.isArray(s.skills)) skills.push(...s.skills);
      }
    } catch (_) { /* missing moduleFile = pathway skills only */ }
  }
  return [...new Set(skills.map((s) => (typeof s === 'string' ? s : s && s.skillId)).filter(Boolean))];
}

async function bankCount(skillId) {
  const candidates = skillLookupCandidates(skillId);
  const rows = await Problem.aggregate([
    { $match: { skillId: { $in: candidates } } },
    { $group: { _id: '$difficulty', n: { $sum: 1 } } },
  ]);
  const byDiff = {};
  let total = 0;
  for (const r of rows) { byDiff[r._id ?? '?'] = r.n; total += r.n; }
  return { total, byDiff };
}

async function main() {
  await ensureSrvResolvable(process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  const resourcesDir = path.join(__dirname, '../public/resources');
  const pathways = fs.readdirSync(resourcesDir).filter((f) => f.endsWith('-pathway.json'));

  // For --suggest: every skill id that actually has bank problems, indexed
  // with its problem count and (when catalogued) its display name.
  let bankIndex = [];
  if (SUGGEST) {
    const Skill = require('../models/skill');
    const counts = await Problem.aggregate([{ $group: { _id: '$skillId', n: { $sum: 1 } } }]);
    const names = new Map(
      (await Skill.find({}).select('skillId displayName').lean()).map((s) => [s.skillId, s.displayName || ''])
    );
    bankIndex = counts
      .filter((c) => c._id)
      .map((c) => ({
        skillId: c._id,
        count: c.n,
        displayName: names.get(c._id) || '',
        idTokens: tokens(c._id),
        nameTokens: tokens(names.get(c._id) || ''),
      }));
    console.log(`[suggest] bank has ${bankIndex.length} skill ids with problems`);
  }

  const summary = [];
  const cache = new Map();

  for (const file of pathways) {
    const pw = JSON.parse(fs.readFileSync(path.join(resourcesDir, file), 'utf8'));
    const course = file.replace('-pathway.json', '');
    const perSkill = new Map();

    for (const mod of pw.modules || []) {
      for (const sid of moduleSkills(resourcesDir, mod)) {
        if (!cache.has(sid)) cache.set(sid, await bankCount(sid));
        perSkill.set(sid, cache.get(sid));
      }
    }

    const skills = [...perSkill.entries()];
    const covered = skills.filter(([, c]) => c.total >= MIN_BANK);
    const empty = skills.filter(([, c]) => c.total === 0);
    summary.push({
      course,
      skills: skills.length,
      covered: covered.length,
      thin: skills.length - covered.length - empty.length,
      empty: empty.length,
      pct: skills.length ? Math.round((100 * covered.length) / skills.length) : 0,
    });

    if (DETAIL && (empty.length || skills.length - covered.length)) {
      console.log(`\n── ${course} — gaps ──`);
      for (const [sid, c] of skills.filter(([, c]) => c.total < MIN_BANK).sort((a, b) => a[1].total - b[1].total)) {
        console.log(`  ${String(c.total).padStart(3)}  ${sid}  ${JSON.stringify(c.byDiff)}`);
      }
    }

    if (SUGGEST) {
      const uncovered = skills.filter(([, c]) => c.total < MIN_BANK);
      const withMatches = uncovered
        .map(([sid]) => ({ sid, matches: suggestFor(sid, bankIndex) }))
        .filter((x) => x.matches.length);
      if (withMatches.length) {
        console.log(`\n── ${course} — probable naming mismatches (course skill → bank candidates) ──`);
        for (const { sid, matches } of withMatches) {
          console.log(`  ${sid}`);
          for (const m of matches) {
            console.log(`      → ${m.skillId}  (${m.count} problems${m.displayName ? `, "${m.displayName}"` : ''}, score ${m.score.toFixed(2)})`);
          }
        }
        console.log(`  [${withMatches.length}/${uncovered.length} uncovered skills have candidates — the rest are true content gaps]`);
      } else if (uncovered.length) {
        console.log(`\n── ${course}: no naming-mismatch candidates — ${uncovered.length} uncovered skills are true content gaps ──`);
      }
    }
  }

  console.log('\n═══ Course problem-bank coverage (covered = ≥' + MIN_BANK + ' bank problems per skill) ═══');
  console.log('course'.padEnd(26) + 'skills  covered  thin  empty   %covered');
  for (const s of summary.sort((a, b) => b.pct - a.pct)) {
    console.log(
      s.course.padEnd(26) + String(s.skills).padStart(6) + String(s.covered).padStart(9)
      + String(s.thin).padStart(6) + String(s.empty).padStart(7) + String(s.pct + '%').padStart(10)
    );
  }
  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

// Pure pieces exported for unit tests (tests/unit/coverageSuggest.test.js).
module.exports = { tokens, similarity, suggestFor, moduleSkills, MIN_BANK };
