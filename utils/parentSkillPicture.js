'use strict';
/* ============================================================
   parentSkillPicture.js — ONE classification of a child's skills for the
   parent dashboard, the Learning Report and the analytics card.

   Before this, four surfaces counted from three stores with four rules, and
   the same screen said "47 mastered · 0 needs review" next to "1 Needs
   Review" and a donut of "2 total skills". Worse, "mastered" counted skills
   the child never practised:
     • provenBy:'placement' — placed out by the screener (Jayden: 18
       "mastered", 0 problems ever attempted)
     • legacy entries with status 'mastered' and no attempts or provenance —
       old seeds, which is how a 9th grader's "Top Strengths" became
       "Addition Within 100" and "Classifying Shapes"
   masteryType doesn't separate these — every record in prod says 'verified'.

   So every skillMastery entry is classified once:
     practiced  — real attempts, or a non-placement provenance
     placed     — placement, inferred, or mastered with no practice evidence
     not-started— anything else (ready / locked / 0-attempt learning)
   and memory (FSRS retrievability) is folded into the same needs-review
   count instead of being a second, contradicting number.

   Pure: callers resolve names (utils/skillDisplayNames.resolveSkillInfo)
   and pass the stores in; tests drive it directly.
   ============================================================ */

const { engineEntries, engineStorageKey, isValidSkillKey } = require('./engineStore');
const { calculateRetrievability } = require('./fsrsScheduler');

const DAY_MS = 86400000;
const MEMORY_STRONG = 0.85;
const MEMORY_FADING = 0.5;
const NEEDS_REVIEW_STATUSES = new Set(['needs-review', 're-fragile']);

function entriesOf(store) {
  if (!store) return [];
  const raw = typeof store.entries === 'function' ? Array.from(store.entries()) : Object.entries(store);
  return raw.filter(([k, v]) => isValidSkillKey(k) && v && typeof v === 'object');
}

function attemptsOf(data) {
  const n = Number(data.totalAttempts);
  if (Number.isFinite(n) && n > 0) return n;
  const p = Number(data.pillars && data.pillars.accuracy && data.pillars.accuracy.total);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/** 'practiced' | 'placed' | 'not-started' */
function classifySkill(data) {
  if (!data) return 'not-started';
  if (data.provenBy === 'placement' || data.masteryType === 'inferred') return 'placed';
  if (attemptsOf(data) > 0) return 'practiced';
  if (data.provenBy) return 'practiced';
  if (data.status === 'mastered') return 'placed';
  return 'not-started';
}

function toTime(d) {
  const t = d ? new Date(d).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function scoreOf(data) {
  const s = Number(data.masteryScore);
  if (!Number.isFinite(s)) return 0;
  return Math.round(s <= 1 ? s * 100 : s);
}

/**
 * @param {Object} args
 * @param {Map|Object} args.skillMastery  child.skillMastery
 * @param {Map|Object} args.fsrs          child.learningEngines.fsrs
 * @param {Object}     args.info          key -> { name, category } for both stores' keys
 * @param {number}     [args.now]
 */
function buildSkillPicture({ skillMastery, fsrs, info = {}, now = Date.now() } = {}) {
  const label = (key) => (info[key] && info[key].name) || null;
  const categoryOf = (key) => (info[key] && info[key].category) || 'Other';

  const practiced = [];
  let placedOut = 0;

  for (const [key, data] of entriesOf(skillMastery)) {
    const kind = classifySkill(data);
    if (kind === 'placed') { placedOut++; continue; }
    if (kind !== 'practiced') continue;
    const name = label(key);
    if (!name) continue; // unresolvable → never show a raw id
    const status = data.status === 'mastered' ? 'mastered'
      : NEEDS_REVIEW_STATUSES.has(data.status) ? 'needs-review'
        : 'learning';
    practiced.push({
      key, name, category: categoryOf(key), status,
      score: scoreOf(data),
      attempts: attemptsOf(data),
      lastPracticed: toTime(data.lastPracticed || (data.pillars && data.pillars.retention && data.pillars.retention.lastPracticed)) || null,
      masteredAt: toTime(data.masteredDate || data.masteredAt) || null,
    });
  }

  // Memory: retrievability on skills that have review data.
  const memorySkills = [];
  for (const [id, card] of engineEntries(fsrs)) {
    if (!card || !card.lastReview) continue;
    const name = label(id);
    if (!name) continue;
    const elapsed = Math.max(0, (now - toTime(card.lastReview)) / DAY_MS);
    const r = calculateRetrievability(elapsed, card.stability ?? 0);
    memorySkills.push({
      key: id, name,
      retrievability: Math.round(r * 100),
      status: r >= MEMORY_STRONG ? 'strong' : r >= MEMORY_FADING ? 'fading' : 'needs-review',
    });
  }
  memorySkills.sort((a, b) => a.retrievability - b.retrievability);

  // One needs-review count: a practiced skill flagged by mastery OR by memory.
  const needsReviewKeys = new Set();
  const growthAreas = [];
  for (const s of practiced) {
    if (s.status === 'needs-review') {
      needsReviewKeys.add(engineStorageKey(s.key));
      growthAreas.push({ key: s.key, name: s.name, category: s.category, reason: 'mastery' });
    }
  }
  for (const m of memorySkills) {
    if (m.status !== 'needs-review') continue;
    const k = engineStorageKey(m.key);
    if (needsReviewKeys.has(k)) continue;
    needsReviewKeys.add(k);
    growthAreas.push({ key: m.key, name: m.name, category: null, reason: 'memory', retrievability: m.retrievability });
  }

  const practicedMastered = practiced.filter((s) => s.status === 'mastered');
  const learning = practiced.filter((s) => s.status === 'learning').length;

  // Strengths: earned, most recent first (a skill practised last week says more
  // about where the child is than one mastered last spring).
  const topStrengths = practicedMastered
    .slice()
    .sort((a, b) => (b.lastPracticed || 0) - (a.lastPracticed || 0) || b.score - a.score)
    .slice(0, 5)
    .map(({ key, name, category, score }) => ({ key, name, category, score }));

  const byCategory = {};
  for (const s of practiced) {
    const c = (byCategory[s.category] ||= { name: s.category, mastered: 0, learning: 0, needsReview: 0, total: 0 });
    c.total++;
    if (s.status === 'mastered') c.mastered++;
    else if (needsReviewKeys.has(engineStorageKey(s.key))) c.needsReview++;
    else c.learning++;
  }

  const weekAgo = now - 7 * DAY_MS;
  return {
    counts: {
      practiced: practiced.length,
      practicedMastered: practicedMastered.length,
      learning,
      needsReview: needsReviewKeys.size,
      placedOut,
    },
    topStrengths,
    growthAreas: growthAreas.slice(0, 5),
    memory: {
      tracked: memorySkills.length,
      strong: memorySkills.filter((m) => m.status === 'strong').length,
      fading: memorySkills.filter((m) => m.status === 'fading').length,
      needsReview: memorySkills.filter((m) => m.status === 'needs-review').length,
      skills: memorySkills,
    },
    categories: Object.values(byCategory).sort((a, b) => b.total - a.total),
    masteredThisWeek: practicedMastered.filter((s) => s.masteredAt && s.masteredAt >= weekAgo).length,
  };
}

/** Resolve names for both stores, then build. What the routes call. */
async function skillPictureFor(child, now = Date.now()) {
  const { resolveSkillInfo } = require('./skillDisplayNames');
  const skillMastery = child && child.skillMastery;
  const fsrs = child && child.learningEngines && child.learningEngines.fsrs;
  const keys = [
    ...entriesOf(skillMastery).map(([k]) => k),
    ...engineEntries(fsrs).map(([k]) => k),
  ];
  const info = await resolveSkillInfo(keys);
  return buildSkillPicture({ skillMastery, fsrs, info, now });
}

module.exports = { buildSkillPicture, skillPictureFor, classifySkill, MEMORY_STRONG, MEMORY_FADING };
