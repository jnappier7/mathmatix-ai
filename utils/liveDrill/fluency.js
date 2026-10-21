/**
 * Math-facts fluency, carried across games (models/factFluency.js).
 *
 * games.js tracks every answer of a Math Facts game in memory (player.facts, player.factLog). When a
 * game ends, saveGame folds each SIGNED-IN student's answers into their FactFluency record — one
 * upsert per student, dotted-path $inc/$push so two games ending at once can't lose each other's
 * answers. A guest who joined with only a code has no account and is skipped.
 *
 * A fact's status is computed on read from its last few tries, never stored:
 *   missed — any of the last 3 tries wrong (the fact to reteach)
 *   fluent — at least 2 right, none of the last 3 wrong, typical time ≤ FLUENT_MS
 *   slow   — right, but typically over FLUENT_MS
 *   new    — one fast right answer: promising, not yet proof
 */
const { DRILLS } = require('./engine');
const { FLUENT_MS } = require('./games');
const logger = require('../logger');

const RECENT = 5; // tries kept per fact
const STATUS_RANK = { missed: 0, slow: 1, new: 2, fluent: 3 }; // worst first

const median = (xs) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function statusOf(rec) {
  const last3 = (rec.recent || []).slice(-3);
  if (!last3.length) return 'new';
  if (last3.some((r) => !r.ok)) return 'missed';
  const rights = (rec.recent || []).filter((r) => r.ok);
  const typical = median(last3.map((r) => r.ms));
  if (typical > FLUENT_MS) return 'slow';
  return rights.length >= 2 ? 'fluent' : 'new';
}

/** One player's answers this game, grouped by fact, in the order they were given. */
function answersByFact(player) {
  const out = new Map();
  for (const e of player.factLog || []) {
    if (!e.id) continue;
    if (!out.has(e.id)) out.set(e.id, []);
    out.get(e.id).push({ ok: !!e.ok, ms: Math.round(e.ms) });
  }
  return out;
}

/** The upsert that folds one player's game into their record, or null if there is nothing to save. */
function updateFor(player, at = new Date()) {
  const byFact = answersByFact(player);
  if (!player.userId || !byFact.size) return null;
  const $set = { lastGameAt: at };
  const $inc = { games: 1 };
  const $push = {};
  for (const [id, tries] of byFact) {
    const meta = player.facts.get(id) || {};
    const p = `facts.${id}`;
    Object.assign($set, { [`${p}.label`]: meta.label || id, [`${p}.fam`]: meta.fam || null,
      [`${p}.a`]: meta.a, [`${p}.b`]: meta.b, [`${p}.lastAt`]: at });
    $inc[`${p}.att`] = tries.length;
    $inc[`${p}.right`] = tries.filter((t) => t.ok).length;
    $push[`${p}.recent`] = { $each: tries.map((t) => ({ ...t, at })), $slice: -RECENT };
  }
  return { filter: { userId: player.userId }, update: { $set, $inc, $push } };
}

/** Fold a finished Math Facts game into every signed-in student's record. Never throws. */
async function saveGame(game, Model = require('../../models/factFluency')) {
  if (!(DRILLS[game.drill] && DRILLS[game.drill].trackFacts)) return 0;
  const at = new Date();
  const updates = [...game.players.values()].filter((p) => !p.kicked).map((p) => updateFor(p, at)).filter(Boolean);
  let saved = 0;
  await Promise.all(updates.map(async ({ filter, update }) => {
    try { await Model.updateOne(filter, update, { upsert: true }); saved++; } catch (err) {
      logger.error('fact fluency save failed', { game: game.code, error: err.message });
    }
  }));
  if (saved) logger.info('fact fluency saved', { game: game.code, students: saved });
  return saved;
}

/** One student's record, read for a screen: counts by status and what to practice. */
function summarize(doc) {
  const facts = (doc && doc.facts) || {};
  const rows = Object.entries(facts).map(([id, r]) => ({
    id, label: r.label, fam: r.fam, a: r.a, b: r.b, att: r.att || 0, right: r.right || 0,
    status: statusOf(r), sec: (() => { const m = median((r.recent || []).filter((t) => t.ok).map((t) => t.ms)); return m == null ? null : Math.round(m / 100) / 10; })(),
    lastAt: r.lastAt,
  }));
  const count = (s) => rows.filter((r) => r.status === s).length;
  const missed = rows.filter((r) => r.status === 'missed').sort((x, y) => (y.att - y.right) - (x.att - x.right));
  const slow = rows.filter((r) => r.status === 'slow').sort((x, y) => (y.sec || 0) - (x.sec || 0));
  return {
    tried: rows.length, fluent: count('fluent'), slow: count('slow'), missed: count('missed'), new: count('new'),
    att: rows.reduce((t, r) => t + r.att, 0), right: rows.reduce((t, r) => t + r.right, 0),
    games: (doc && doc.games) || 0, lastGameAt: (doc && doc.lastGameAt) || null,
    practice: [...missed, ...slow].slice(0, 12).map((r) => ({ label: r.label, status: r.status, sec: r.sec })),
    rows,
  };
}

/** One student's grid: each family cell takes its worst fact (7 × 8 fluent but 56 ÷ 7 missed → missed). */
function studentGrid(summary) {
  const grids = {};
  for (const r of summary.rows) {
    if (!r.fam) continue;
    const g = grids[r.fam] || (grids[r.fam] = { fam: r.fam, max: r.fam === 'mul' ? 12 : 10, cells: {} });
    const key = `${r.a},${r.b}`;
    const cur = g.cells[key];
    if (!cur || STATUS_RANK[r.status] < STATUS_RANK[cur.status]) g.cells[key] = { status: r.status, facts: [] };
    g.cells[key].facts = [...((cur && cur.facts) || []), r.label];
  }
  return Object.values(grids);
}

/** A class's grid: per family cell, how many students tried it and how many are fluent / missing it. */
function classGrid(summaries) {
  const grids = {};
  for (const s of summaries) {
    for (const g of studentGrid(s)) {
      const cg = grids[g.fam] || (grids[g.fam] = { fam: g.fam, max: g.max, cells: {} });
      for (const [key, c] of Object.entries(g.cells)) {
        const cc = cg.cells[key] || (cg.cells[key] = { tried: 0, fluent: 0, missed: 0 });
        cc.tried++;
        if (c.status === 'fluent') cc.fluent++;
        if (c.status === 'missed') cc.missed++;
      }
    }
  }
  return Object.values(grids);
}

module.exports = { RECENT, statusOf, updateFor, saveGame, summarize, studentGrid, classGrid };
