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
 *
 * A skill counts as COVERED at >= MIN_BANK problems (enough for one varied
 * guided+independent practice sequence without repeats).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const { skillLookupCandidates } = require('../utils/skillCanonicalizer');

const MIN_BANK = 5;
const DETAIL = process.argv.includes('--detail');

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

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const resourcesDir = path.join(__dirname, '../public/resources');
  const pathways = fs.readdirSync(resourcesDir).filter((f) => f.endsWith('-pathway.json'));

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
})().catch((e) => { console.error(e); process.exit(1); });
