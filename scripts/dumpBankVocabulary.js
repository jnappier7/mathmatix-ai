/**
 * AUDIT: what skill vocabulary is the problem bank actually filed under?
 *
 * Read-only. The companion to scripts/auditCourseProblemCoverage.js, which
 * asked "can each course skill reach bank problems?" and answered no for 94%
 * of them. This asks the mirror question — "what names IS the content filed
 * under?" — because the bank holds ~14k problems while only ~26 course skill
 * slots can reach any of them (owner's Render shell, 2026-07-29/30).
 *
 * That gap is a vocabulary seam, not a content shortage: course pathways use
 * kebab ids (`g6-place-value-decimals`), the bank uses its own kebab ids
 * (`trig-identities-basic`), and the canonicalizer's unified taxonomy uses
 * `COURSE.STRAND.n`. Only alg1-crosswalk.json has been fed to the resolver, so
 * 538 of 558 pathway ids resolve to nothing.
 *
 * This script dumps the bank's real inventory — every distinct skillId with
 * problem counts, difficulty spread, and catalog display name — and reports
 * how much of the bank is REACHABLE from course pathways today. The JSON output
 * is the target list a crosswalk proposer maps pathway ids onto; guessing at
 * bank names from a screenshot is how you generate duplicates of content you
 * already own.
 *
 * Run (Render shell, or local with Atlas access):
 *   node scripts/dumpBankVocabulary.js                  # summary + top skills
 *   node scripts/dumpBankVocabulary.js --all            # every bank skill
 *   node scripts/dumpBankVocabulary.js --unreachable    # only what courses can't see
 *   node scripts/dumpBankVocabulary.js --json out.json  # machine-readable inventory
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Problem = require('../models/problem');
const Skill = require('../models/skill');
const { canonicalSkillId, isUnifiedSkillId } = require('../utils/skillCanonicalizer');

const ALL = process.argv.includes('--all');
const UNREACHABLE_ONLY = process.argv.includes('--unreachable');
const TOP_N = ALL || UNREACHABLE_ONLY ? Infinity : 40;
const MIN_BANK = 5; // same "covered" bar as auditCourseProblemCoverage.js

function jsonOutPath() {
  const i = process.argv.indexOf('--json');
  return i === -1 ? null : process.argv[i + 1];
}

/**
 * Every skillId referenced by any course pathway, plus its module files and
 * scaffold step tags. Mirrors moduleSkills() in auditCourseProblemCoverage.js —
 * the two scripts must agree on what "a course skill" means or their numbers
 * can't be compared.
 */
function pathwaySkillIds() {
  const resourcesDir = path.join(__dirname, '../public/resources');
  const byCourse = new Map();
  let files;
  try {
    files = fs.readdirSync(resourcesDir).filter((f) => f.endsWith('-pathway.json'));
  } catch {
    return byCourse; // no resources dir (minimal env) — nothing to reach with
  }

  for (const file of files) {
    let pw;
    try {
      pw = JSON.parse(fs.readFileSync(path.join(resourcesDir, file), 'utf8'));
    } catch {
      continue;
    }
    const course = file.replace('-pathway.json', '');
    const ids = new Set();

    for (const mod of pw.modules || []) {
      const raw = (mod.skills || []).slice();
      if (mod.moduleFile) {
        try {
          const md = JSON.parse(
            fs.readFileSync(path.join(resourcesDir, '..', mod.moduleFile), 'utf8')
          );
          if (Array.isArray(md.skills) && md.skills.length) {
            raw.length = 0;
            raw.push(...md.skills);
          }
          for (const s of md.scaffold || []) {
            if (s.skill) raw.push(s.skill);
            if (Array.isArray(s.skills)) raw.push(...s.skills);
          }
        } catch {
          // missing moduleFile = pathway skills only
        }
      }
      for (const s of raw) {
        const id = typeof s === 'string' ? s : s && s.skillId;
        if (id) ids.add(id);
      }
    }
    byCourse.set(course, ids);
  }
  return byCourse;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  // ── The bank's real inventory ──
  const rows = await Problem.aggregate([
    {
      $group: {
        _id: '$skillId',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        diffs: { $push: '$difficulty' },
        sample: { $first: '$prompt' },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const totalProblems = rows.reduce((n, r) => n + r.total, 0);

  // Catalog display names, for matching on meaning rather than just id tokens.
  const names = new Map();
  for (const s of await Skill.find({}).select('skillId displayName').lean()) {
    names.set(s.skillId, s.displayName);
  }

  // ── Reachability: which bank skills can a course actually get to? ──
  // A course reaches a bank skill when both sides land on the same id after
  // canonicalization — exactly the resolution course practice performs.
  const byCourse = pathwaySkillIds();
  const reachIndex = new Map(); // canonical id -> Set<course>
  let pathwayIdCount = 0;
  for (const [course, ids] of byCourse) {
    pathwayIdCount += ids.size;
    for (const id of ids) {
      const key = canonicalSkillId(id);
      if (!reachIndex.has(key)) reachIndex.set(key, new Set());
      reachIndex.get(key).add(course);
    }
  }

  const inventory = rows.map((r) => {
    const skillId = r._id || '(null)';
    const canonical = canonicalSkillId(skillId);
    const courses = [...(reachIndex.get(canonical) || [])];
    const byDiff = {};
    for (const d of r.diffs) byDiff[d ?? '?'] = (byDiff[d ?? '?'] || 0) + 1;
    return {
      skillId,
      canonical,
      unified: isUnifiedSkillId(skillId),
      total: r.total,
      active: r.active,
      byDiff,
      displayName: names.get(skillId) || names.get(canonical) || null,
      reachableFrom: courses,
      sample: (r.sample || '').slice(0, 80),
    };
  });

  const reachable = inventory.filter((s) => s.reachableFrom.length);
  const stranded = inventory.filter((s) => !s.reachableFrom.length);
  const strandedProblems = stranded.reduce((n, s) => n + s.total, 0);
  const noDifficulty = inventory.filter((s) => Object.keys(s.byDiff).every((k) => k === '?'));

  // ── Report ──
  console.log('\n═══ Problem-bank vocabulary ═══');
  console.log(`problems in bank        ${totalProblems}`);
  console.log(`distinct bank skillIds  ${inventory.length}`);
  console.log(`  unified-taxonomy ids  ${inventory.filter((s) => s.unified).length}`);
  console.log(`  legacy/kebab ids      ${inventory.filter((s) => !s.unified).length}`);
  console.log(`  ≥${MIN_BANK} problems          ${inventory.filter((s) => s.total >= MIN_BANK).length}`);
  console.log(`  missing difficulty    ${noDifficulty.length}`);

  console.log('\n═══ Reachability from course pathways ═══');
  console.log(`courses                 ${byCourse.size}`);
  console.log(`pathway skill slots     ${pathwayIdCount}`);
  console.log(
    `bank skills reachable   ${reachable.length}/${inventory.length}`
    + ` (${Math.round((100 * reachable.length) / (inventory.length || 1))}%)`
  );
  console.log(
    `PROBLEMS STRANDED       ${strandedProblems}/${totalProblems}`
    + ` (${Math.round((100 * strandedProblems) / (totalProblems || 1))}%)`
    + ' — content that exists but no course can serve'
  );

  const shown = (UNREACHABLE_ONLY ? stranded : inventory).slice(0, TOP_N);
  console.log(
    `\n═══ ${UNREACHABLE_ONLY ? 'Stranded' : 'Bank'} skills`
    + `${Number.isFinite(TOP_N) ? ` (top ${TOP_N} by count)` : ''} ═══`
  );
  console.log('    n  skillId'.padEnd(52) + 'reachable from');
  for (const s of shown) {
    const reach = s.reachableFrom.length ? s.reachableFrom.join(',') : '— STRANDED';
    console.log(`${String(s.total).padStart(5)}  ${s.skillId.padEnd(44)}${reach}`);
  }
  if (Number.isFinite(TOP_N) && inventory.length > TOP_N) {
    console.log(`  … ${inventory.length - TOP_N} more (--all to list, --unreachable for gaps only)`);
  }

  const out = jsonOutPath();
  if (out) {
    fs.writeFileSync(
      out,
      JSON.stringify(
        { generatedFor: 'pathway->bank crosswalk', totalProblems, inventory },
        null,
        2
      )
    );
    console.log(`\nwrote ${inventory.length} bank skills → ${out}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { pathwaySkillIds };
