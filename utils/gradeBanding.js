// utils/gradeBanding.js
//
// Reading the unified taxonomy's per-skill `grade` field, which is a STRING
// and not always a single number: "4", "6–7", "3-5", "10-11". Both an en dash
// and a hyphen appear in the data, which is exactly the kind of thing that
// silently half-works if every caller writes its own split.
//
// Why per-skill grade at all: `gradeBand` ("K-5") and `courseLevel` ("ELEM")
// are both too coarse to answer "what grade level have I reached". They each
// cover grades 3, 4 and 5, so a student finishing an entire year of work sees
// their progress unchanged. Grade is what moves.

// Both dash characters that appear in seeds/unified-taxonomy/math_taxonomy.json.
const RANGE_SPLIT = /[–-]/;

/**
 * The LOW end of a grade string, as a number. Low rather than high on purpose:
 * owning a skill marked "3–4" means the student has done grade-3 work for
 * certain and grade-4 work maybe. Claiming the higher grade would overstate
 * what they have shown, and this feeds a label a parent will read.
 *
 * @returns {number|null} null when the value is missing or unparseable
 */
function lowGrade(grade) {
  if (grade == null) return null;
  const first = String(grade).trim().split(RANGE_SPLIT)[0].trim();
  if (!/^\d+$/.test(first)) return null;
  return parseInt(first, 10);
}

/** Human label for a grade number: 4 -> "4th grade". */
function gradeLabel(n) {
  if (n == null || Number.isNaN(n)) return null;
  const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th'
    : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + suffix + ' grade';
}

/** Ascending, de-duplicated grade numbers present in a set of skills. */
function gradesPresent(skills) {
  const set = new Set();
  (skills || []).forEach((s) => {
    const g = lowGrade(s && s.grade);
    if (g != null) set.add(g);
  });
  return [...set].sort((a, b) => a - b);
}

module.exports = { lowGrade, gradeLabel, gradesPresent };
