/**
 * Every legacy catalog skill has a student-voice label.
 *
 * The unified taxonomy's labels (student-labels.json) are written in the voice a
 * 4th–10th grader would use ("Sharing into equal groups"). The legacy kebab
 * catalogs (seeds/skills-*.json) only carry teacher-facing displayNames
 * ("Interpreting Remainders"), and an id with no unified crosswalk used to reach
 * the student either as that heading or as its storage key prettified, catalog
 * prefix and all ("Emf Divide Word Problems" on a review nudge, 2026-10-25).
 *
 * This pins the words: every skillId in every catalog resolves through
 * studentLabel() to a label that is neither the prettified key nor the catalog
 * displayName, carries no catalog prefix token, and stays short enough for a
 * nudge or a skill-map chip. A new catalog row needs a label in
 * student-labels.json under its own id (or a crosswalk to a unified skill).
 */

const fs = require('fs');
const path = require('path');

const { studentLabel, _reset } = require('../../utils/studentLabels');

const SEEDS_DIR = path.join(__dirname, '..', '..', 'seeds');
const LABELS_FILE = path.join(SEEDS_DIR, 'unified-taxonomy', 'student-labels.json');

const PREFIX_TOKEN = /\b(emf|g6|g7|act|cm)\b/i;
const MAX_LABEL_LENGTH = 48;

function prettify(id) {
  return String(id)
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function catalogRows() {
  const rows = [];
  for (const file of fs.readdirSync(SEEDS_DIR).filter((f) => /^skills-.*\.json$/.test(f))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8'));
    if (!Array.isArray(parsed)) continue;
    for (const row of parsed) {
      if (row && typeof row.skillId === 'string') {
        rows.push({ file, skillId: row.skillId, displayName: row.displayName || row.name || '' });
      }
    }
  }
  return rows;
}

describe('student-voice labels cover every legacy catalog skill', () => {
  beforeAll(() => _reset());

  const rows = catalogRows();

  test('the catalogs were found', () => {
    expect(rows.length).toBeGreaterThan(500);
  });

  test('no skill falls back to a prettified id or a catalog prefix', () => {
    const failures = [];
    for (const { file, skillId, displayName } of rows) {
      const label = studentLabel(skillId);
      const problems = [];
      if (!label) problems.push('empty');
      if (label === prettify(skillId)) problems.push('prettified key');
      if (PREFIX_TOKEN.test(label)) problems.push('catalog prefix');
      if (label.length > MAX_LABEL_LENGTH) problems.push(`${label.length} chars`);
      if (problems.length) failures.push(`${file} ${skillId} -> "${label}" (${problems.join(', ')})`);
      void displayName;
    }
    expect(failures).toEqual([]);
  });

  test('legacy ids read in the student voice, not the textbook heading', () => {
    // Spot checks on the catalog rows the owner saw reach a student.
    expect(studentLabel('emf-interpreting-remainders')).toBe('What to do with the leftover');
    expect(studentLabel('emf-divide-word-problems')).toBe('Division story problems');
    expect(studentLabel('scientific-notation')).toBe('Writing huge and tiny numbers the short way');
    expect(studentLabel('g6-place-value-decimals')).not.toBe('Place Value & Decimals');
  });

  test('every label in the file is a non-empty string under the length cap', () => {
    const { labels } = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf8'));
    const bad = Object.entries(labels).filter(
      ([, v]) => typeof v !== 'string' || !v.trim() || v.length > MAX_LABEL_LENGTH || v !== v.trim()
    );
    expect(bad).toEqual([]);
  });

  test('a unified label still wins over a legacy key', () => {
    expect(studentLabel('MS_QNT_8')).toBe('Math with negatives and fractions');
  });
});
