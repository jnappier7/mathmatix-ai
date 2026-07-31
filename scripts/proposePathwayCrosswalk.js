/**
 * PROPOSE: the pathway -> bank crosswalk that unstrands the problem bank.
 *
 * 13,291 of 14,165 bank problems are unreachable from any course (see
 * scripts/dumpBankVocabulary.js). Not a content shortage — the course pathways
 * and the bank speak different skill vocabularies, and only one crosswalk
 * (alg1) has ever been fed to utils/skillCanonicalizer.js, so 538 of 558
 * pathway ids resolve to nothing.
 *
 * This builds the missing crosswalk. For every pathway skill id it ranks the
 * bank's real skills (reusing the matcher from auditCourseProblemCoverage.js,
 * which is already unit-tested) and emits rows the canonicalizer loads with no
 * code change.
 *
 * TARGET CHOICE — deliberate, and worth understanding before extending this.
 * Rows point pathway ids at the BANK skill id, not at a math_taxonomy.json
 * node. The bank id is where the problems actually are, so one row makes the
 * pathway skill reachable immediately:
 *
 *   canonicalSkillId('g6-place-value-decimals')     -> 'place-value'
 *   skillLookupCandidates('g6-place-value-decimals') -> ['place-value', 'g6-...']
 *   Problem.find({ skillId: { $in: candidates } })   -> the 601 real problems
 *
 * Mapping both sides onto a unified COURSE.STRAND.n node instead would be the
 * tidier long-term model, but it needs a second correct mapping (bank -> node)
 * before a single problem becomes reachable, and a wrong node silently serves
 * nothing. This gets the content flowing first; re-pointing rows at unified
 * nodes later is a data change, not a code change.
 *
 * CONFIDENCE — only unambiguous matches go live.
 *   high   -> written to the crosswalk. Strong score AND a clear lead over the
 *             runner-up, so there is no plausible second reading.
 *   review -> written to a separate review file, NOT loaded by the resolver.
 *   none   -> no candidate cleared the floor; these are the real generation
 *             worklist, not naming problems.
 *
 * Run:
 *   node scripts/proposePathwayCrosswalk.js            # live bank counts (Render)
 *   node scripts/proposePathwayCrosswalk.js --write    # emit the JSON files
 *   node scripts/proposePathwayCrosswalk.js --offline  # smoke test only, see below
 *
 * --offline indexes seeds/ instead of the bank, and seeds/ contains the PATHWAY
 * ids too — so matches land on other pathway ids rather than on skills that hold
 * problems. It proves the pipeline runs; it cannot produce a crosswalk, and
 * --offline --write is refused.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { tokens, similarity, MIN_BANK } = require('./auditCourseProblemCoverage');
const { pathwaySkillIds } = require('./dumpBankVocabulary');

const OFFLINE = process.argv.includes('--offline');
const WRITE = process.argv.includes('--write');

const TAX_DIR = path.join(__dirname, '..', 'seeds', 'unified-taxonomy');
const OUT_CROSSWALK = path.join(TAX_DIR, 'pathway-crosswalk.json');
const OUT_REVIEW = path.join(TAX_DIR, 'pathway-crosswalk.review.json');

// A match is only auto-applied when it is both strong AND unrivalled. The lead
// requirement is what stops `comprehensive-trig-review` from being pinned to
// whichever of several trig skills happened to score highest — a review module
// spanning three skills has no single right answer, and guessing one silently
// narrows it.
const HIGH_SCORE = 0.62;
const HIGH_LEAD = 0.12;
const REVIEW_FLOOR = 0.34;

/**
 * Decide a pathway id's fate from its ranked candidates.
 * Returns { tier, target, score, alternatives, reason }.
 */
function classifyMatch(candidates, pathwayId) {
  if (!candidates.length) {
    return { tier: 'none', reason: 'no bank skill scored above the floor — content gap' };
  }
  const [best, second] = candidates;
  const lead = second ? best.score - second.score : 1;
  const alternatives = candidates.slice(1).map((c) => c.id);

  if (best.score >= HIGH_SCORE && lead >= HIGH_LEAD) {
    // The target drops a word that names a SUBJECT, not a method. The lead check
    // cannot catch this: `slope-fields -> slope` has no rival precisely because
    // the bank holds no slope-fields content, so absence of a competitor is what
    // let a 451-problem mismatch score 0.87 clean. Demote, never discard —
    // the row survives in the review file for a human to accept or correct.
    const drops = pathwayId ? topicDrops(pathwayId, best) : [];
    if (drops.length) {
      return {
        tier: 'review',
        target: best.id,
        score: best.score,
        alternatives,
        uncoveredTopics: drops,
        reason: `"${best.id}" does not cover ${drops.join(', ')} — a different subject, not a rewording`,
      };
    }
    // A strong name match onto an almost-empty skill unstrands nothing, but
    // would report as covered — false coverage is worse than a known gap.
    // (count === null means offline, where counts are unknown and --write is
    // refused anyway.)
    if (best.count !== null && best.count !== undefined && best.count < MIN_BANK) {
      return {
        tier: 'review',
        target: best.id,
        score: best.score,
        alternatives,
        reason: `target "${best.id}" holds only ${best.count} problem(s) — below the ${MIN_BANK} needed for a practice set`,
      };
    }
    return {
      tier: 'high',
      target: best.id,
      score: best.score,
      alternatives,
    };
  }
  return {
    tier: 'review',
    target: best.id,
    score: best.score,
    alternatives: candidates.slice(1).map((c) => c.id),
    reason: best.score < HIGH_SCORE
      ? `top score ${best.score.toFixed(2)} below ${HIGH_SCORE}`
      : `only ${lead.toFixed(2)} ahead of ${second.id} — ambiguous`,
  };
}

// Course prefixes carry no topic meaning — `g6` in `g6-place-value-decimals`
// says which course, not which math. `emf` = early-math-foundations,
// `cm` = consumer-math; both appear as id prefixes across the pathways.
const COURSE_PREFIXES = new Set([
  'act', 'sat', 'alg1', 'alg2', 'geo', 'prec', 'calc', 'calc3', 'emf', 'cm', 'pm',
]);
const isPrefix = (t) => COURSE_PREFIXES.has(t) || /^[gk]\d+$/.test(t);

// Words that describe HOW a skill is worked rather than WHAT it is about.
// Dropping one of these narrows nothing: `solving-one-step-equations ->
// one-step-equations` loses only a verb.
//
// This list is deliberately short and closed. Anything not on it is treated as
// a topic word, because the two errors are not symmetric: a false demotion
// costs one review row, while a false approval points a course skill at content
// about a different subject. `slope-fields -> slope` scored 0.87 with no rival
// and would have served 451 problems about computing slope to a student
// studying differential equations.
const STRUCTURAL_WORDS = new Set([
  'solving', 'solve', 'graphing', 'graph', 'writing', 'write', 'using', 'use',
  'understanding', 'identifying', 'identify', 'visual', 'diagrams', 'overview',
  'spiral', 'techniques', 'fluency', 'principles', 'intuitive', 'back', 'applications',
]);

/**
 * Topic words the pathway skill has that its target does not cover.
 *
 * The wide set, used for reporting. `topicDrops` narrows it to subject words
 * and that is what gates: `act-polygons-circles -> act-circles` scores 0.87
 * with no rival, so the ambiguity check clears it while the target silently
 * drops polygons. Absence of a competing skill is not evidence of a good match.
 */
function uncoveredTopics(pathwayId, target) {
  if (!target) return [];
  const covered = new Set([...target.idTokens || [], ...target.nameTokens || []]);
  return [...tokens(pathwayId)].filter((t) => !covered.has(t) && !isPrefix(t));
}

/**
 * Uncovered words that name a SUBJECT rather than a method — the ones that make
 * a match wrong rather than merely terser. This is the gate; `uncoveredTopics`
 * remains the wider advisory used for reporting.
 */
function topicDrops(pathwayId, target) {
  return uncoveredTopics(pathwayId, target).filter((t) => !STRUCTURAL_WORDS.has(t));
}

/**
 * Rank bank skills for one pathway id. Bank entries: {id, name, count}.
 *
 * Identity is excluded: a row mapping `X -> X` resolves to itself and unstrands
 * nothing, so proposing one is pure noise. This is not hypothetical — it is what
 * --offline produces for every single id, because the seeds it indexes contain
 * the pathway ids themselves.
 */
function rankCandidates(pathwayId, bankIndex) {
  const target = tokens(pathwayId);
  const scored = [];
  for (const b of bankIndex) {
    if (b.id === pathwayId) continue;
    const s = Math.max(similarity(target, b.idTokens), similarity(target, b.nameTokens));
    if (s >= REVIEW_FLOOR) scored.push({ ...b, score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 4);
}

/** Bank skills with problem counts — from Mongo, or from seeds when offline. */
async function loadBankIndex() {
  let raw;
  if (OFFLINE) {
    const ids = new Map();
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'seeds')).filter((n) => n.endsWith('.json'))) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seeds', f), 'utf8'));
        for (const s of Array.isArray(d) ? d : (d.skills || [])) {
          const id = s && (s.skillId || s.skill_id);
          if (id && !ids.has(id)) ids.set(id, s.displayName || s.name || '');
        }
      } catch { /* skip unreadable seed */ }
    }
    raw = [...ids].map(([id, name]) => ({ id, name, count: null }));
  } else {
    const mongoose = require('mongoose');
    const Problem = require('../models/problem');
    const Skill = require('../models/skill');
    await mongoose.connect(process.env.MONGO_URI);
    const rows = await Problem.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $group: { _id: '$skillId', count: { $sum: 1 } } },
    ]);
    const names = new Map(
      (await Skill.find({}).select('skillId displayName').lean()).map((s) => [s.skillId, s.displayName])
    );
    raw = rows.filter((r) => r._id).map((r) => ({ id: r._id, name: names.get(r._id) || '', count: r.count }));
  }
  return raw.map((b) => ({ ...b, idTokens: tokens(b.id), nameTokens: tokens(b.name) }));
}

async function main() {
  if (OFFLINE && WRITE) {
    // --offline indexes seeds/, which contain the PATHWAY ids alongside the bank
    // ids. Siblings then match each other (`g7-simplify-expressions-basics` ->
    // `g7-simplify-expressions`), producing rows that point one unreachable id at
    // another. Fine as a smoke test that the pipeline runs; never a crosswalk.
    console.error('--offline cannot produce a valid crosswalk: seeds contain the pathway ids '
      + 'themselves, so matches land on other pathway ids rather than on bank skills.\n'
      + 'Run without --offline (Render shell) to index the real bank.');
    process.exit(1);
  }

  const bankIndex = await loadBankIndex();
  const byCourse = pathwaySkillIds();

  const rows = [];
  const review = [];
  const gaps = [];
  const seen = new Set();

  for (const [course, ids] of byCourse) {
    for (const pathwayId of ids) {
      if (seen.has(pathwayId)) continue;
      seen.add(pathwayId);
      const verdict = classifyMatch(rankCandidates(pathwayId, bankIndex), pathwayId);
      const bank = bankIndex.find((b) => b.id === verdict.target);
      const uncovered = uncoveredTopics(pathwayId, bank);
      const entry = {
        legacyId: pathwayId,
        unifiedId: verdict.target,
        course,
        score: verdict.score ? Number(verdict.score.toFixed(3)) : undefined,
        bankProblems: bank ? bank.count : undefined,
        uncoveredTopics: uncovered.length ? uncovered : undefined,
        alternatives: verdict.alternatives,
        reason: verdict.reason,
      };
      if (verdict.tier === 'high') rows.push(entry);
      else if (verdict.tier === 'review') review.push(entry);
      else gaps.push({ legacyId: pathwayId, course, reason: verdict.reason });
    }
  }

  // Bank skills that become course-reachable — the input the canonical-owner
  // pass needs, since "whichever skill a course references" is unanswerable
  // until this mapping exists.
  const reachable = new Set(rows.map((r) => r.unifiedId));
  const unstranded = rows.reduce((n, r) => n + (r.bankProblems || 0), 0);

  console.log('\n═══ Pathway → bank crosswalk proposal ═══');
  console.log(`bank skills indexed     ${bankIndex.length}${OFFLINE ? ' (offline: seeds, no counts)' : ''}`);
  console.log(`pathway skill ids       ${seen.size}`);
  console.log(`  high confidence       ${rows.length}  → crosswalk`);
  console.log(`  needs review          ${review.length}  → review file, NOT loaded`);
  console.log(`  no candidate          ${gaps.length}  → generation worklist`);
  console.log(`bank skills reachable   ${reachable.size}/${bankIndex.length}`);
  if (!OFFLINE) console.log(`problems unstranded     ${unstranded}`);

  const narrowing = rows.filter((r) => r.uncoveredTopics);
  console.log('\n─── sample high-confidence rows ───');
  for (const r of rows.slice(0, 25)) {
    console.log(`  ${r.legacyId.padEnd(40)} → ${String(r.unifiedId).padEnd(28)}`
      + `${r.score}  ${r.bankProblems ?? '?'} problems`
      + (r.uncoveredTopics ? `   ⚠ drops: ${r.uncoveredTopics.join(', ')}` : ''));
  }

  if (narrowing.length) {
    console.log(`\n─── ⚠ ${narrowing.length} high-confidence row(s) drop a topic — skim these ───`);
    for (const r of narrowing.slice(0, 20)) {
      console.log(`  ${r.legacyId.padEnd(40)} → ${String(r.unifiedId).padEnd(28)}`
        + `drops: ${r.uncoveredTopics.join(', ')}`);
    }
  }

  console.log('\n─── sample needing review ───');
  for (const r of review.slice(0, 15)) {
    console.log(`  ${r.legacyId.padEnd(40)} → ${String(r.unifiedId).padEnd(24)} ${r.reason}`);
  }

  if (!WRITE) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to emit:');
    console.log(`  ${OUT_CROSSWALK}`);
    console.log(`  ${OUT_REVIEW}`);
  } else {
    fs.writeFileSync(OUT_CROSSWALK, JSON.stringify({
      source: 'scripts/proposePathwayCrosswalk.js',
      note: 'pathway skill ids -> bank skill ids. Loaded by utils/skillCanonicalizer.js.',
      rowCount: rows.length,
      rows,
    }, null, 2));
    // Shaped as a crosswalk on purpose: `rows` is exactly what the resolver
    // reads. Approving these is edit-then-rename, not retype. See HOW_TO_APPROVE.
    fs.writeFileSync(OUT_REVIEW, JSON.stringify({
      note: 'NOT loaded — the filename lacks the -crosswalk.json suffix the resolver globs for.',
      HOW_TO_APPROVE: [
        '1. Edit rows[]: fix each unifiedId (pick from alternatives, or type any bank skill id).',
        '2. Delete rows you do not want. Anything left WILL go live.',
        '3. Save as seeds/unified-taxonomy/00-manual-crosswalk.json',
        'The 00- prefix sorts first, and the resolver takes the first file that maps an id —',
        'so your manual rows override every generated one, including alg1-crosswalk.json.',
        'contentGaps below have no candidate at all; add rows for them by hand if the bank',
        'really does hold something under a name the matcher missed.',
      ],
      rows: review,
      contentGaps: gaps,
    }, null, 2));
    console.log(`\nwrote ${rows.length} rows → ${OUT_CROSSWALK}`);
    console.log(`wrote ${review.length} review + ${gaps.length} gaps → ${OUT_REVIEW}`);
  }

  if (!OFFLINE) await require('mongoose').disconnect();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = {
  classifyMatch, rankCandidates, uncoveredTopics, topicDrops,
  HIGH_SCORE, HIGH_LEAD, REVIEW_FLOOR, STRUCTURAL_WORDS,
};
