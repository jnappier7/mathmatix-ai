/**
 * SKILL MAP — pure view model.
 *
 * Everything here is a plain data transform over the /api/mastery/map payload:
 * no DOM, no fetch. The renderer in skill-map.js does the drawing. Split out so
 * the parts that decide what a student is TOLD — which rung they can attempt,
 * how close a band is, what the board calls a skill — are unit-testable rather
 * than only observable by clicking around production.
 *
 * Loads as a browser global and as a CommonJS module (for jest).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkillMapModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ascending abstraction. STAT and CALC are peers in reality — AP Statistics
  // needs no calculus — so this order is for layout only and carries no claim
  // that one follows the other.
  const COURSE_LEVELS = ['ELEM', 'MS', 'ALG1', 'GEO', 'ALG2', 'PREC', 'STAT', 'CALC'];

  const STRANDS = [
    { key: 'QNT', name: 'Quantity & Operations' },
    { key: 'PRP', name: 'Proportional Reasoning' },
    { key: 'EQV', name: 'Equivalence & Structure' },
    { key: 'FNC', name: 'Functional Dependence' },
    { key: 'SPC', name: 'Space & Measure' },
    { key: 'DTA', name: 'Data & Chance' }
  ];

  // The six board states, weakest to strongest. `above` is a skill cleared by
  // prerequisite closure rather than demonstrated — deliberately distinct from
  // `proved` so the board never implies evidence that does not exist.
  const STATE_ORDER = ['locked', 'open', 'learned', 'above', 'proved', 'taught'];

  const STATE_LABEL = {
    locked: 'Locked',
    open: 'Open',
    learned: 'Learned it',
    above: 'Cleared from above',
    proved: 'Proved it',
    taught: 'Taught it'
  };

  /** Group skills into a strand x level grid, preserving catalog order. */
  function buildGrid(skills) {
    const grid = new Map();
    (skills || []).forEach(function (s) {
      if (!s || !s.strand || !s.courseLevel) return;
      const key = s.courseLevel + '|' + s.strand;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(s);
    });
    return grid;
  }

  /** Levels that actually contain skills, bottom-up. Never render empty bands. */
  function activeLevels(skills) {
    const present = new Set((skills || []).map(function (s) { return s && s.courseLevel; }));
    return COURSE_LEVELS.filter(function (l) { return present.has(l); });
  }

  /** Per-strand completion, for the thin bar under each column header. */
  function strandTotals(skills) {
    const out = {};
    STRANDS.forEach(function (s) { out[s.key] = { total: 0, owned: 0 }; });
    (skills || []).forEach(function (s) {
      if (!s || !out[s.strand]) return;
      out[s.strand].total += 1;
      if (isOwned(s.state)) out[s.strand].owned += 1;
    });
    return out;
  }

  /** Proved or better — the states that clear prerequisites above them. */
  function isOwned(state) {
    return state === 'proved' || state === 'taught' || state === 'above';
  }

  /** Can the student do anything with this cell right now? */
  function isActionable(state) {
    return state !== 'locked';
  }

  /**
   * Which rungs to offer, given the cell's state.
   *
   * Mirrors utils/skillRung.canAdvance so the board never offers a rung the
   * server will refuse. In particular a skill cleared from above must be proved
   * DIRECTLY before it can be taught — the system granted it, the student did
   * not demonstrate it, and the top rung requires demonstration.
   */
  function rungOptions(skill) {
    if (!skill) return [];
    switch (skill.state) {
      case 'open':
        return [
          { key: 'learn', label: 'Learn it', hint: 'Work through it with your tutor.' },
          { key: 'challenge', label: 'Prove it', hint: 'Five problems, no hints, one shot.' }
        ];
      case 'learned':
        return [
          { key: 'learn', label: 'Keep working', hint: 'Back to the lesson.' },
          { key: 'challenge', label: 'Prove it', hint: 'Five problems, no hints, one shot.' }
        ];
      case 'above':
        return [
          { key: 'challenge', label: 'Prove it directly', hint: 'This one was cleared from above. Prove it to unlock teaching.' }
        ];
      case 'proved':
        return [
          { key: 'teach', label: 'Teach it back', hint: 'Explain it to a confused student. The top rung.' }
        ];
      default:
        return [];
    }
  }

  /**
   * The proximity line: "2 skills from closing Proportional Reasoning at ALG1."
   *
   * Returns null when there is nothing honest to say. A band is only a hook when
   * something in it can actually be started — dangling "1 away!" at work that is
   * still locked is a wall dressed as a nudge.
   */
  function hookText(nearest) {
    if (!nearest || !nearest.remaining || !nearest.nextSkillId) return null;
    const strand = strandName(nearest.strand);
    const n = nearest.remaining;
    const skills = n === 1 ? '1 skill' : n + ' skills';
    const next = nearest.nextLabel ? ' Next up: ' + nearest.nextLabel + '.' : '';
    return skills + ' from closing ' + strand + ' at ' + nearest.courseLevel + '.' + next;
  }

  function strandName(key) {
    const found = STRANDS.filter(function (s) { return s.key === key; })[0];
    return found ? found.name : key;
  }

  /** Headline counts. `open` is what they can start right now, which is the ask. */
  function summarize(payload) {
    const c = (payload && payload.counts) || {};
    return {
      proved: c.proved || 0,
      taught: c.taught || 0,
      open: c.open || 0,
      total: c.total || 0
    };
  }

  return {
    COURSE_LEVELS: COURSE_LEVELS,
    STRANDS: STRANDS,
    STATE_ORDER: STATE_ORDER,
    STATE_LABEL: STATE_LABEL,
    buildGrid: buildGrid,
    activeLevels: activeLevels,
    strandTotals: strandTotals,
    isOwned: isOwned,
    isActionable: isActionable,
    rungOptions: rungOptions,
    hookText: hookText,
    strandName: strandName,
    summarize: summarize
  };
}));
