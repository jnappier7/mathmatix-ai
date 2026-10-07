/**
 * Content-based difficulty estimates for ACT items, on the Fable bank's 1-5
 * scale (seeds/act-difficulty-estimates.json, written by
 * scripts/estimateActDifficulty.js).
 *
 * The form is ordered by difficulty, and until real responses calibrate an
 * item its only rating is the authored one — which for two banks says little
 * (the IES expansion rated by position within each skill; the enhanced drop
 * per template). Each item was rated from its content against a rubric and
 * fixed Fable anchors, then the raw ratings were mapped onto the Fable scale
 * by a line fitted on Fable's own ratings (_meta.map), so every bank sits on
 * one scale. _meta.validation records how well they agree with Fable.
 *
 * Shipped with the code and read at runtime, like the pathway crosswalk: no
 * reseed is needed when it changes. A calibrated item ignores its estimate
 * (utils/actTestAssembler.js preciseDifficulty).
 *
 * @module utils/actDifficultyEstimates
 */
const path = require('path');
const fs = require('fs');

const FILE = path.join(__dirname, '..', 'seeds', 'act-difficulty-estimates.json');
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { _meta: {}, estimates: {} };
  }
  return cache;
}

/** The item's estimated difficulty on the Fable 1-5 scale, or null when it has none. */
function estimatedDifficulty(problemId) {
  const { _meta, estimates } = load();
  const raw = estimates && estimates[problemId];
  if (raw == null) return null;
  const m = (_meta && _meta.map) || { a: 0, b: 1 };
  return Math.round(Math.min(5, Math.max(1, m.a + m.b * raw)) * 100) / 100;
}

module.exports = { estimatedDifficulty, _load: load, _reset: () => { cache = null; } };
