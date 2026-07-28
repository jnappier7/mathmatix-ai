'use strict';
/* ============================================================
   masteryScore.js — ONE scale for "how mastered is this skill."

   Third confirmed data seam (after skill ids and theta): masteryScore is
   dual-scale in the wild — placement seeded 0-1 (1.0 / 0.5 / 0), the
   pillar engine writes 0-100. Readers guessed, wrongly:
     • teacher.js `< 40` → every placement-seeded 0.5 flagged "struggling"
     • practicePack `mastered && < 90` → every placement-mastered 1.0
       queued for review
     • utils/growthCheck `< 0.5` → engine-scale strugglers (40) invisible
     • learningCurve client `* 100` → engine 78 displayed as 7800%
   student.js normalized locally (the rule below) — now everyone shares it.

   CANON: 0-100. normalizedMasteryScore() converts on read (legacy 0-1
   data heals lazily); new writes should be 0-100 (screener seeds updated).
   The 0/1 ambiguity resolves to the seed meanings: values ≤ 1 are the
   placement scale (1.0 = fully placed-mastered → 100).
   ============================================================ */

function normalizedMasteryScore(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  const scaled = n <= 1 ? n * 100 : n;
  return Math.round(Math.min(100, scaled));
}

module.exports = { normalizedMasteryScore };
