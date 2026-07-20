/**
 * Prerequisite closure over the unified skill graph.
 *
 * WHAT WAS MISSING
 * ----------------
 * The platform had no transitive reasoning over the graph at all — only
 * single-hop, read-time checks (Skill.checkPrerequisites, masteryEngine's
 * per-skill state calc, badgeLaunchService's ready/not-ready query). Nothing
 * ever asked "given everything this student has proved, what else follows?"
 *
 * Two consequences, both observed in production:
 *
 *   1. A student placed at Algebra 1 inherited a backlog of below-level skills
 *      the screener never closed, and the only way to clear each one was to sit
 *      through it. A student who plainly knew absolute value was walked through
 *      absolute value.
 *   2. utils/masteryInference.js was written to fix exactly this and is dead
 *      code: it reads `skill.patternId` and `skill.tier`, neither of which
 *      exists on the Skill schema, so it returns [] for every real skill.
 *
 * WHAT THIS DOES
 * --------------
 * Proving a skill clears everything beneath it. If you can do slope as a rate,
 * you can do unit rates — the graph says so via crossPrereqs, and making the
 * student prove it again is a tax on knowing things. Cleared skills are granted
 * at rung `proved` with provenBy 'inference', which fills the board and opens
 * what sits above them but never earns the top rung (see utils/skillRung.js).
 *
 * Everything here is pure: it takes a graph and a mastery map and returns what
 * changed. No Mongo, no I/O, so it is testable against the real 315-skill
 * taxonomy without a database.
 */

const { currentRung, clearsPrerequisites, advanceRung } = require('./skillRung');

/**
 * Index a list of skill docs (Mongoose or plain) into a traversable graph.
 * Accepts both the split fields and a legacy flat `prerequisites`.
 */
function buildGraph(skills) {
  const byId = new Map();
  const parents = new Map();   // skill -> [prerequisites, both kinds]
  const children = new Map();  // skill -> [skills it unlocks]

  skills.forEach((s) => {
    const id = s.skillId;
    byId.set(id, s);
    const up = [...(s.prerequisites || []), ...(s.crossPrereqs || [])];
    parents.set(id, [...new Set(up)]);
  });

  // Derive children from parents rather than trusting the stored `enables`,
  // which was empty for all 315 skills until recently and may be stale in any
  // database seeded before that fix.
  byId.forEach((_s, id) => {
    if (!children.has(id)) children.set(id, []);
  });
  parents.forEach((ups, id) => {
    ups.forEach((p) => {
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(id);
    });
  });

  return {
    byId,
    has: (id) => byId.has(id),
    parentsOf: (id) => parents.get(id) || [],
    childrenOf: (id) => children.get(id) || [],
    ids: () => [...byId.keys()]
  };
}

/** Read an entry from a Mongoose Map, a plain Map, or a plain object. */
function readEntry(mastery, id) {
  if (!mastery) return undefined;
  if (typeof mastery.get === 'function') return mastery.get(id);
  return mastery[id];
}

function writeEntry(mastery, id, entry) {
  if (typeof mastery.set === 'function') mastery.set(id, entry);
  else mastery[id] = entry;
  return entry;
}

/** Every transitive prerequisite of a skill, nearest first. */
function prerequisiteClosure(graph, skillId, { includeSelf = false } = {}) {
  const seen = new Set(includeSelf ? [skillId] : []);
  const out = [];
  const queue = [...graph.parentsOf(skillId)];

  while (queue.length) {
    const id = queue.shift();
    if (!graph.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...graph.parentsOf(id));
  }
  return out;
}

/**
 * Grant everything beneath a just-proved skill.
 *
 * A prerequisite is skipped — never silently overwritten — when the student has
 * already demonstrated it, or when they have explicitly missed it in live work.
 * That second guard is what stops the cascade from re-asserting a skill we have
 * direct evidence against, which is the cascade-invalidation gap CLAUDE.md flags.
 */
function applyProofCascade(graph, mastery, skillId, { now = new Date() } = {}) {
  const cleared = [];
  const skipped = [];

  prerequisiteClosure(graph, skillId).forEach((id) => {
    const entry = readEntry(mastery, id) || {};

    if (clearsPrerequisites(entry)) {
      skipped.push({ skillId: id, why: 'already owned' });
      return;
    }
    if (entry.explicitlyFailed) {
      // We watched them miss this. The graph implying it is not stronger
      // evidence than having seen it fail.
      skipped.push({ skillId: id, why: 'explicitly failed' });
      return;
    }

    advanceRung(entry, 'proved', { via: 'inference', sourceSkillId: skillId, now });
    if (entry.__rungResult && entry.__rungResult.changed) {
      delete entry.__rungResult;
      writeEntry(mastery, id, entry);
      cleared.push(id);
    } else {
      skipped.push({ skillId: id, why: (entry.__rungResult || {}).reason || 'refused' });
      delete entry.__rungResult;
    }
  });

  return { source: skillId, cleared, skipped };
}

/**
 * Which skills can the student legally start right now?
 *
 * `open` is the attackable frontier: not yet on the ladder, every prerequisite
 * proved. This is the set the board outlines and the tutor picks a target from.
 */
function availability(graph, mastery) {
  const open = [];
  const locked = [];
  const inProgress = [];
  const owned = [];

  graph.ids().forEach((id) => {
    const entry = readEntry(mastery, id);
    const rung = currentRung(entry);

    if (clearsPrerequisites(entry)) {
      owned.push(id);
      return;
    }
    if (rung === 'learned') {
      inProgress.push(id);
      return;
    }
    const ready = graph.parentsOf(id).every((p) => !graph.has(p) || clearsPrerequisites(readEntry(mastery, p)));
    (ready ? open : locked).push(id);
  });

  return { open, locked, inProgress, owned };
}

/**
 * A student missed a skill we had cleared. Walk UP and re-close anything whose
 * prerequisites no longer hold — but only where the higher skill was itself
 * inferred. A skill the student actually proved stays proved: their
 * demonstration outranks our bookkeeping.
 */
function invalidateFrom(graph, mastery, skillId, { now = new Date() } = {}) {
  const { demoteRung, isInferred } = require('./skillRung');
  const invalidated = [];
  const queue = [...graph.childrenOf(skillId)];
  const seen = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id) || !graph.has(id)) continue;
    seen.add(id);

    const entry = readEntry(mastery, id);
    if (!entry || !clearsPrerequisites(entry)) continue;
    if (!isInferred(entry)) continue;   // they proved it themselves; leave it alone

    demoteRung(entry, { reason: `prerequisite ${skillId} was contradicted`, now });
    if (entry.__rungResult && entry.__rungResult.changed) {
      delete entry.__rungResult;
      writeEntry(mastery, id, entry);
      invalidated.push(id);
      queue.push(...graph.childrenOf(id));
    } else {
      delete entry.__rungResult;
    }
  }

  return { source: skillId, invalidated };
}

/**
 * How close is each strand-band to being finished?
 *
 * Near-miss is the strongest pull in any progression system, and the
 * strand x course-level grid generates it for free. Returns bands sorted by how
 * few skills remain, so the UI can say "2 skills from closing Proportional
 * Reasoning at Algebra 1" without recomputing anything.
 */
function bandProgress(graph, mastery) {
  const bands = new Map();

  graph.ids().forEach((id) => {
    const skill = graph.byId.get(id);
    if (!skill.strand || !skill.courseLevel) return;
    const key = `${skill.courseLevel}|${skill.strand}`;
    if (!bands.has(key)) {
      bands.set(key, { courseLevel: skill.courseLevel, strand: skill.strand, total: 0, owned: 0, remaining: [], attackable: [] });
    }
    const band = bands.get(key);
    band.total += 1;

    const entry = readEntry(mastery, id);
    if (clearsPrerequisites(entry)) {
      band.owned += 1;
      return;
    }
    band.remaining.push(id);
    const ready = graph.parentsOf(id).every((p) => !graph.has(p) || clearsPrerequisites(readEntry(mastery, p)));
    if (ready || currentRung(entry) === 'learned') band.attackable.push(id);
  });

  return [...bands.values()]
    .map((b) => ({ ...b, pct: b.total ? b.owned / b.total : 0 }))
    .sort((a, b) => {
      // Closest to done first, but a band with nothing the student can actually
      // start is not a hook — it is a locked wall. Push those back.
      const aLive = a.remaining.length > 0 && a.attackable.length > 0;
      const bLive = b.remaining.length > 0 && b.attackable.length > 0;
      if (aLive !== bLive) return aLive ? -1 : 1;
      return a.remaining.length - b.remaining.length;
    });
}

/**
 * What each skill looks like on the board.
 *
 * Six states, because the board has to distinguish two things the old UI could
 * not: whether a skill was demonstrated or merely cleared from above, and
 * whether a student has been taught it versus taught it to someone else.
 *
 *   taught  - explained it back (top rung)
 *   proved  - demonstrated independently
 *   above   - cleared by closure; fills the board, does not earn the top rung
 *   learned - worked through with the tutor, not yet proved
 *   open    - every prerequisite met; can be started now
 *   locked  - still behind a prerequisite
 */
function boardStates(graph, mastery) {
  const { open, inProgress } = availability(graph, mastery);
  const openSet = new Set(open);
  const inProgressSet = new Set(inProgress);
  const states = new Map();

  graph.ids().forEach((id) => {
    const entry = readEntry(mastery, id);
    const rung = currentRung(entry);

    if (rung === 'taught') states.set(id, 'taught');
    else if (rung === 'proved') states.set(id, isInferredEntry(entry) ? 'above' : 'proved');
    else if (rung === 'learned' || inProgressSet.has(id)) states.set(id, 'learned');
    else if (openSet.has(id)) states.set(id, 'open');
    else states.set(id, 'locked');
  });

  return states;
}

// Local alias so this module does not need a circular-looking re-import.
function isInferredEntry(entry) {
  return !!entry && entry.provenBy === 'inference';
}

/** The single nearest band the student can actually close, or null. */
function nearestClosableBand(graph, mastery, { maxRemaining = 3 } = {}) {
  const best = bandProgress(graph, mastery).find(
    (b) => b.remaining.length > 0 && b.remaining.length <= maxRemaining && b.attackable.length > 0
  );
  return best || null;
}

module.exports = {
  buildGraph,
  prerequisiteClosure,
  applyProofCascade,
  availability,
  invalidateFrom,
  boardStates,
  bandProgress,
  nearestClosableBand
};
