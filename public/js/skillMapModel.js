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
   * The three rungs, as a ladder you can see yourself standing on.
   *
   * rungOptions() answers "which buttons do I show". This answers the question
   * the student actually has — "where am I, and what is left" — which the flat
   * pair of buttons never did. The page is called *learn it, prove it, teach
   * it*; until now that progression existed only in the subtitle.
   *
   * Rung status vocabulary:
   *   done     earned, behind you
   *   granted  filled WITHOUT demonstration (state 'above' — prerequisite
   *            closure gave it to you). Deliberately its own status, never
   *            'done': the board must not imply evidence that does not exist.
   *   current  the rung you are on and can act on now
   *   locked   ahead of you, with a reason
   *
   * @returns {Array<{key,label,ordinal,status,hint,action}>} always length 3
   */
  function ladderRungs(skill) {
    const state = skill && skill.state;

    // [learnStatus, proveStatus, teachStatus] per board state.
    const SHAPE = {
      locked:  ['locked',  'locked',  'locked'],
      open:    ['current', 'current', 'locked'],
      learned: ['done',    'current', 'locked'],
      above:   ['locked',  'granted', 'locked'],
      proved:  ['done',    'done',    'current'],
      taught:  ['done',    'done',    'done']
    };
    const shape = SHAPE[state] || SHAPE.locked;

    const LEARN_LABEL = state === 'learned' ? 'Keep working' : 'Learn it';
    const PROVE_LABEL = state === 'above' ? 'Prove it directly' : 'Prove it';

    return [
      {
        key: 'learn', ordinal: 1, label: LEARN_LABEL, status: shape[0],
        hint: shape[0] === 'done'
          ? 'You worked through this one.'
          : 'Work through it with your tutor.',
        action: shape[0] === 'current' ? 'learn' : null
      },
      {
        key: 'challenge', ordinal: 2, label: PROVE_LABEL, status: shape[1],
        hint: shape[1] === 'granted'
          // Say plainly that the system granted it. A student who reads "proved"
          // over work they never did learns the board lies.
          ? 'Cleared from above — you have not shown this one yet. Prove it directly to unlock teaching.'
          : shape[1] === 'done'
            ? 'Proved with a clean challenge run.'
            : 'Five problems, no hints, one shot.',
        // 'granted' is still actionable: proving directly is the whole point.
        action: (shape[1] === 'current' || shape[1] === 'granted') ? 'challenge' : null
      },
      {
        key: 'teach', ordinal: 3, label: 'Teach it back', status: shape[2],
        hint: shape[2] === 'done'
          ? 'You taught it. Top of the ladder.'
          : state === 'above'
            ? 'Prove this one directly first — teaching needs demonstrated work.'
            : shape[2] === 'current'
              ? 'Explain it to a confused student. The rarest rung.'
              : 'Prove it first.',
        action: shape[2] === 'current' ? 'teach' : null
      }
    ];
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

  /**
   * Per-strand progress for the summary columns.
   *
   * Six columns filling bottom-up, echoing the strand towers on the board
   * below — the same vertical thread the product's whole "see the patterns"
   * argument rests on. Shows what the student OWNS, filling up.
   *
   * Deliberately NOT a "0 / 17,500 points" readout: same data, but a big zero
   * against a huge number frames learning as debt before the student has done
   * anything, and it lands hardest on whoever is furthest behind.
   *
   * `fill` is linear here, and can be: a column's filled AREA is proportional
   * to its height, so height = fraction owned is already honest. (A radial
   * fill would need sqrt, because area grows with the square of the radius —
   * the reason this is not drawn as wedges.)
   */
  // Grade strings from the taxonomy are not always a single number: "4",
  // "6–7", "3-5", and BOTH dash characters appear in the data. Low end on
  // purpose — owning a "3–4" skill means grade-3 work for certain and grade-4
  // maybe, and claiming the higher one overstates what the student has shown.
  // Mirrors utils/gradeBanding.lowGrade for the server side.
  function lowGrade(grade) {
    if (grade == null) return null;
    const first = String(grade).trim().split(/[\u2013-]/)[0].trim();
    return /^\d+$/.test(first) ? parseInt(first, 10) : null;
  }

  function gradeLabel(n) {
    if (n == null || isNaN(n)) return null;
    const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th'
      : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
    return n + suffix;
  }

  function strandProgress(skills) {
    const totals = strandTotals(skills);

    // Band by GRADE, not course level. courseLevel "ELEM" and gradeBand "K-5"
    // both cover grades 3-5, so a student finishing an entire grade of work
    // would see their column sit exactly where it was.
    const allGrades = [];
    (skills || []).forEach(function (s) {
      const g = lowGrade(s && s.grade);
      if (g != null && allGrades.indexOf(g) === -1) allGrades.push(g);
    });
    allGrades.sort(function (a, b) { return a - b; });

    // owned/total per (strand, grade)
    const cell = new Map();
    (skills || []).forEach(function (s) {
      if (!s || !s.strand) return;
      const g = lowGrade(s.grade);
      if (g == null) return;
      const k = s.strand + '|' + g;
      const c = cell.get(k) || { owned: 0, total: 0 };
      c.total += 1;
      if (isOwned(s.state)) c.owned += 1;
      cell.set(k, c);
    });

    return STRANDS.map(function (strand) {
      const t = totals[strand.key] || { total: 0, owned: 0 };

      // The highest grade with anything owned, and how far through it. A grade
      // is only "cleared" when every skill in it is owned — that is what makes
      // "finished 4th, moving up to 5th" a true statement rather than a nudge.
      let reachedIndex = -1;
      let withinReached = 0;
      allGrades.forEach(function (g, i) {
        const c = cell.get(strand.key + '|' + g);
        if (c && c.owned > 0) {
          reachedIndex = i;
          withinReached = c.total ? c.owned / c.total : 0;
        }
      });

      const reachedGrade = reachedIndex >= 0 ? allGrades[reachedIndex] : null;
      const clearedReached = withinReached >= 1;
      // Once a grade is finished, the student is working at the NEXT one.
      const workingGrade = clearedReached && reachedIndex + 1 < allGrades.length
        ? allGrades[reachedIndex + 1]
        : reachedGrade;

      // Linear: a column's filled area is proportional to its height, so this
      // is already honest. Clamped low too — with nothing owned reachedIndex is
      // -1, and (-1 + 0) / n is negative.
      const fill = allGrades.length
        ? Math.max(0, Math.min(1, (reachedIndex + withinReached) / allGrades.length))
        : 0;

      return {
        key: strand.key,
        name: strand.name,
        owned: t.owned,
        total: t.total,
        pct: t.total ? Math.round((t.owned / t.total) * 100) : 0,
        grades: allGrades,
        reachedGrade: reachedGrade,
        clearedReached: clearedReached,
        workingGrade: workingGrade,
        workingLabel: gradeLabel(workingGrade),
        fill: fill
      };
    });
  }

  /**
   * The next few skills the student can actually start, nearest first.
   *
   * Deliberately NOT the whole map. Showing all 348 nodes is the thing that
   * makes a skill graph unusable on a phone and paralysing anywhere: the
   * question a student has is "what do I do next", not "what exists". `open`
   * means every prerequisite is already done, so each of these is genuinely
   * startable right now — nothing here is aspirational.
   *
   * @param {Array} skills      map payload skills[]
   * @param {string} nearestId  nearest.nextSkillId — the one to lead with
   * @param {number} limit      how many to surface (default 5)
   */
  function availableNow(skills, nearestId, limit) {
    const max = typeof limit === 'number' ? limit : 5;
    const open = (skills || []).filter(function (s) { return s && s.state === 'open'; });

    // The closure engine's recommendation goes first; the rest keep catalog
    // order, which already runs foundational -> advanced within a strand.
    const lead = [];
    const rest = [];
    open.forEach(function (s) {
      if (nearestId && s.skillId === nearestId) lead.push(s);
      else rest.push(s);
    });
    return lead.concat(rest).slice(0, max);
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
    ladderRungs: ladderRungs,
    hookText: hookText,
    strandName: strandName,
    summarize: summarize,
    strandProgress: strandProgress,
    availableNow: availableNow
  };
}));
