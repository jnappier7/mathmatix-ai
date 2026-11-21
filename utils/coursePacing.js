// utils/coursePacing.js
//
// How long a course is, in the course's OWN words.
//
// The catalog used to print `moduleCount × 45 minutes` — "~16h" for Algebra 1,
// "~11h" for 6th Grade Math — a number nobody authored, for courses whose
// modules are paced across a school year. Every module file already says where
// it sits in the year (`weeks`: "3-5", "12", "36+") and how long a sitting is
// (`estimatedDuration`, minutes), so the catalog reports that instead:
//
//   paceWeeks   the last week any module is scheduled in — the length of the
//               course at the pace it was written for. 0 when no module says.
//   estMinutes  the authored minutes summed over modules. Only meaningful for
//               the short guides (the parent courses, all in "week 1"); for a
//               year-long course it is a count of sittings, not of the course.

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../public');
const cache = new Map();   // moduleFile path → { mtimeMs, weeks, minutes }

/** Last week number in a module's `weeks` value ("3-5" → 5, "36+" → 36, 12 → 12). */
function lastWeek(weeks) {
  const nums = String(weeks == null ? '' : weeks).match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : 0;
}

function readModule(moduleFile) {
  if (typeof moduleFile !== 'string' || !moduleFile) return null;
  const file = path.resolve(PUBLIC_DIR, moduleFile.replace(/^\/+/, ''));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null;
  try {
    const { mtimeMs } = fs.statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit;
    const mod = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entry = {
      mtimeMs,
      weeks: lastWeek(mod.weeks),
      minutes: Number.isFinite(mod.estimatedDuration) && mod.estimatedDuration > 0 ? mod.estimatedDuration : 0,
    };
    cache.set(file, entry);
    return entry;
  } catch {
    return null;   // a missing or unreadable module just contributes nothing
  }
}

/** { paceWeeks, estMinutes } for a pathway object. */
function coursePacing(pathway) {
  let paceWeeks = 0;
  let estMinutes = 0;
  for (const m of (pathway && pathway.modules) || []) {
    const mod = readModule(m.moduleFile);
    if (!mod) continue;
    paceWeeks = Math.max(paceWeeks, mod.weeks);
    estMinutes += mod.minutes;
  }
  return { paceWeeks, estMinutes };
}

module.exports = { coursePacing, lastWeek };
