/**
 * THE PLACEMENT LADDER — what a student sees when the Starting Point ends.
 *
 * WHY THIS EXISTS
 * ---------------
 * The results screen used to lead with a grade level: "Your Starting Point —
 * 5th Grade". For the student that number is accurate and useless. A 9th grader
 * who reads "5th Grade" over their own work has been handed a verdict about
 * themselves, and there is nothing on the screen to argue with. It is the one
 * moment in the product where we take everything a kid just demonstrated and
 * compress it into the single number most likely to make them quit.
 *
 * The same assessment already produces something far better and we were
 * throwing it away. Placement proves skills directly, and `applyProofCascade`
 * then clears every prerequisite beneath them (routes/screener.js). A typical
 * run ends with a few dozen skills PROVED and a couple hundred CLEARED. That is
 * a large, concrete, entirely true statement about what a student owns — and it
 * reads as an accomplishment rather than a diagnosis.
 *
 * So the hero becomes the ladder, lit: every band the student owns, filled.
 *
 * WHAT IT IS CAREFUL ABOUT
 * ------------------------
 * - `proved` and `assumed` never merge. A skill the closure engine granted was
 *   not demonstrated, and the board's standing rule is that it must never imply
 *   evidence that does not exist (utils/skillClosure.js, skillMapModel.js).
 *   They are counted apart and drawn apart.
 * - Rungs are labelled by COURSE BAND, never by grade. "Algebra 1" orients a
 *   student; "5th grade" ranks them. Re-introducing the grade number as a rung
 *   label would say the same demoralizing thing in a bigger font, which is the
 *   whole thing this replaces.
 * - Provisional skills stay in the graph (their prerequisite edges are real and
 *   closure must traverse them) but are excluded from every count, exactly as
 *   GET /api/mastery/map does. Otherwise the ladder and the skill map the
 *   student lands on next would quote two different totals.
 *
 * Pure: takes skill docs and a mastery map, returns a payload. No Mongo, no
 * I/O, so it is testable against the real taxonomy without a database.
 */

const { buildGraph, boardStates } = require('./skillClosure');

/**
 * The rungs, bottom to top.
 *
 * Ascending abstraction, mirroring SkillMapModel.COURSE_LEVELS so the two
 * surfaces order the world the same way. STAT and CALC are peers in reality —
 * AP Statistics needs no calculus — so their relative order is layout only and
 * carries no claim that one follows the other.
 */
const LADDER_BANDS = [
  { level: 'ELEM', label: 'Foundations' },
  { level: 'MS', label: 'Middle school core' },
  { level: 'ALG1', label: 'Algebra 1' },
  { level: 'GEO', label: 'Geometry' },
  { level: 'ALG2', label: 'Algebra 2' },
  { level: 'PREC', label: 'Precalculus' },
  { level: 'STAT', label: 'Statistics' },
  { level: 'CALC', label: 'Calculus' }
];

// Board states that mean "this is yours" — the same three isOwned() accepts on
// the client. `above` counts as owned because it does clear what sits on top of
// it; it is reported separately so it is never SHOWN as demonstrated.
const OWNED_STATES = ['proved', 'taught', 'above'];

/**
 * Build the lit ladder for one student.
 *
 * @param {Array}  skills   unified-taxonomy skill docs (plain or lean)
 * @param {Map}    mastery  canonical-id -> mastery entry (decodedMasteryMap)
 * @returns {{seeded:boolean, rungs:Array, totals:Object, edgeIndex:number}}
 */
function buildPlacementLadder(skills, mastery) {
  const list = Array.isArray(skills) ? skills : [];
  if (!list.length) {
    // Say "not set up" rather than rendering an empty ladder, which reads as
    // "you have done nothing" — the exact message this whole file exists to
    // avoid. The caller falls back to the old card.
    return { seeded: false, rungs: [], totals: emptyTotals(), edgeIndex: 0 };
  }

  const graph = buildGraph(list);
  const states = boardStates(graph, mastery || new Map());

  const byLevel = new Map();
  list.forEach((s) => {
    if (!s || s.provisional || !s.courseLevel) return;
    if (!byLevel.has(s.courseLevel)) byLevel.set(s.courseLevel, []);
    byLevel.get(s.courseLevel).push(s);
  });

  const totals = emptyTotals();

  const rungs = LADDER_BANDS
    // Never render an empty band. A ladder with rungs the catalog cannot fill
    // invents work that does not exist in this environment.
    .filter((band) => (byLevel.get(band.level) || []).length > 0)
    .map((band) => {
      const skillsInBand = byLevel.get(band.level);
      const rung = {
        level: band.level,
        label: band.label,
        total: skillsInBand.length,
        proved: 0,
        assumed: 0,
        taught: 0,
        learned: 0,
        open: 0,
        locked: 0,
        owned: 0,
        pct: 0,
        state: 'ahead',
        isEdge: false,
        // Every skill in the band, so the renderer can light one pip each.
        // Ordered strongest-first: the lit block reads as one mass rather than
        // as confetti scattered through a field of grey.
        skills: []
      };

      skillsInBand.forEach((s) => {
        const state = states.get(s.skillId) || 'locked';
        if (state === 'proved') rung.proved += 1;
        else if (state === 'above') rung.assumed += 1;
        else if (state === 'taught') rung.taught += 1;
        else if (state === 'learned') rung.learned += 1;
        else if (state === 'open') rung.open += 1;
        else rung.locked += 1;
        if (OWNED_STATES.indexOf(state) !== -1) rung.owned += 1;
        rung.skills.push({
          skillId: s.skillId,
          label: s.studentLabel || s.displayName || s.skillId,
          state
        });
      });

      rung.skills.sort((a, b) => PIP_ORDER.indexOf(a.state) - PIP_ORDER.indexOf(b.state));
      rung.pct = rung.total ? Math.round((rung.owned / rung.total) * 100) : 0;
      rung.state = rung.total && rung.owned === rung.total
        ? 'cleared'
        : rung.owned > 0 ? 'partial' : 'ahead';

      totals.total += rung.total;
      totals.proved += rung.proved;
      totals.assumed += rung.assumed;
      totals.taught += rung.taught;
      totals.learned += rung.learned;
      totals.open += rung.open;
      totals.owned += rung.owned;
      return rung;
    });

  const edgeIndex = findEdge(rungs);
  if (rungs[edgeIndex]) rungs[edgeIndex].isEdge = true;

  // `seeded` means "there is a ladder to draw", not merely "the collection has
  // rows". A catalog whose docs carry no courseLevel yields no rungs, and
  // reporting that as seeded would hand the clients an empty ladder to render
  // instead of the fallback card.
  return { seeded: rungs.length > 0, rungs, totals, edgeIndex };
}

// Strongest first. Drives pip order only — it has no bearing on what the
// student may attempt, which is skillRung's business.
const PIP_ORDER = ['taught', 'proved', 'above', 'learned', 'open', 'locked'];

function emptyTotals() {
  return { total: 0, owned: 0, proved: 0, assumed: 0, taught: 0, learned: 0, open: 0 };
}

/**
 * Which rung to mark "you're working here".
 *
 * The highest band with anything owned — that is the true top of the climb so
 * far. A student who owns nothing yet gets the lowest band that has something
 * OPEN, so the marker still points at real work instead of defaulting to a rung
 * they cannot start. Never returns -1: the renderer indexes with it.
 */
function findEdge(rungs) {
  for (let i = rungs.length - 1; i >= 0; i -= 1) {
    if (rungs[i].owned > 0) return i;
  }
  for (let i = 0; i < rungs.length; i += 1) {
    if (rungs[i].open > 0) return i;
  }
  return 0;
}

module.exports = { buildPlacementLadder, LADDER_BANDS };
