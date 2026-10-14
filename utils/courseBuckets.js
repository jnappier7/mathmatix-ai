'use strict';
/* ============================================================
   courseBuckets.js — the skill catalog's `course` labels, collapsed into
   the courses a teacher thinks in.

   The live catalog carries 49 labels for ~9 real courses ("Grade 6 Math",
   "Grade 6-7 Math", "Grade 6 Math / Algebra 1", "Middle School Math", …).
   Insights → Course Progress grouped on the raw label and showed a
   high-school roster 31 overlapping "courses". A label belongs to the bucket
   of its LOWEST grade / FIRST course ("Grade 6-7" → middle school,
   "Algebra 2 / Pre-Calculus" → Algebra 2).
   ============================================================ */

const BUCKETS = [
  { key: 'elementary', label: 'Elementary (K–5)' },
  { key: 'middle', label: 'Middle school (6–8)' },
  { key: 'algebra-1', label: 'Algebra 1' },
  { key: 'geometry', label: 'Geometry' },
  { key: 'algebra-2', label: 'Algebra 2' },
  { key: 'precalc', label: 'Pre-Calculus' },
  { key: 'calculus', label: 'Calculus' },
  { key: 'statistics', label: 'Statistics' },
  { key: 'test-prep', label: 'ACT / SAT prep' },
];
const BY_KEY = new Map(BUCKETS.map((b, i) => [b.key, { ...b, order: i }]));

function courseBucket(label) {
  if (!label || typeof label !== 'string') return null;
  const first = label.split('/')[0].trim().toLowerCase();
  let key = null;
  if (/\bact\b|\bsat\b|prep/.test(first)) key = 'test-prep';
  else if (/kinder|elementary|^grade k\b/.test(first)) key = 'elementary';
  else if (/middle school/.test(first)) key = 'middle';
  else if (/calculus|calc\b/.test(first) && !/pre-?\s?calc/.test(first)) key = 'calculus';
  else if (/pre-?\s?calc/.test(first)) key = 'precalc';
  else if (/statistic/.test(first)) key = 'statistics';
  else if (/algebra\s*(2|ii)\b/.test(first)) key = 'algebra-2';
  else if (/algebra\s*(1|i)\b|^algebra$/.test(first)) key = 'algebra-1';
  else if (/geometry/.test(first)) key = 'geometry';
  else {
    const m = /grade\s*(\d{1,2})/.exec(first);
    if (m) {
      const g = Number(m[1]);
      key = g <= 5 ? 'elementary' : g <= 8 ? 'middle' : g === 9 ? 'algebra-1' : null;
    }
  }
  return key ? BY_KEY.get(key) : null;
}

module.exports = { BUCKETS, courseBucket };
