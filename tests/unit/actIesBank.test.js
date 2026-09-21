/**
 * The ACT Integrating Essential Skills expansion bank.
 *
 * CORRECTION 2026-09-21: this header used to open "IES is 40–43% of the real
 * ACT math section", and that claim is what talked the blueprint from 9 of 45
 * slots up to 19. It is the LEGACY 60-question ACT's share. The enhanced
 * 45-question section is 80/20 — ACT's own "Preparing for the ACT" ((c) 2026)
 * states IES at 20%, and both official practice forms score it at exactly 8 of
 * 41 scored items. 9 of 45 was the right weight all along; the bank's depth was
 * never the thing holding it down.
 *
 * What the bank is for, then, is DEPTH per skill so that no two forms repeat an
 * item — not leverage to enlarge the category.
 *
 * These assertions are the ones that would silently ruin a practice test if
 * they broke: a key that doesn't match its option text marks a correct student
 * wrong, a skillId outside the blueprint's IES list is an item the assembler
 * can never draw, and duplicate prompt shapes defeat the form-level dedup that
 * keeps one test from asking the same-looking question twice.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '../..');
const items = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'seeds/act-ies-expansion/ies-items.generated.json'), 'utf8'));
const blueprint = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'seeds/act-math-blueprint.json'), 'utf8'));

const IES_SKILLS = blueprint.skillsByCategory['integrating-essential-skills'];

describe('ACT IES expansion bank', () => {
  test('every IES skill in the blueprint is stocked, and only those', () => {
    // Was pinned at exactly 300 items / 50 per skill / six skills. The two
    // concept areas ACT names but we never covered (average and median;
    // expressing numbers in different ways) are now skills too, so the shape
    // is a floor per skill rather than one magic number — but the set of
    // skills must still match the blueprint exactly in both directions.
    const bySkill = {};
    items.forEach((i) => { bySkill[i.skillId] = (bySkill[i.skillId] || 0) + 1; });
    expect(Object.keys(bySkill).sort()).toEqual([...IES_SKILLS].sort());
    Object.values(bySkill).forEach((n) => expect(n).toBeGreaterThanOrEqual(12));
    expect(items.length).toBeGreaterThanOrEqual(300);
  });

  test('every skillId is an IES skill the blueprint can actually draw', () => {
    // An item tagged with a skill outside skillsByCategory is dead weight —
    // the assembler builds slots from the blueprint, so it is never served.
    items.forEach((i) => expect(IES_SKILLS).toContain(i.skillId));
  });

  test('the keyed option exists exactly once and matches answer.value', () => {
    // This is the seam that marks correct students wrong. problem.checkAnswer
    // resolves MC by label; answer.value has to name the same option.
    items.forEach((i) => {
      const keyed = i.options.filter((o) => o.label === i.correctOption);
      expect(keyed).toHaveLength(1);
      expect(keyed[0].text).toBe(i.answer.value);
    });
  });

  test('four options labeled A–D, no duplicate option text', () => {
    items.forEach((i) => {
      expect(i.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
      const texts = i.options.map((o) => o.text.trim());
      expect(new Set(texts).size).toBe(4);
    });
  });

  test('problemIds are unique and contentHash matches its formula', () => {
    const ids = items.map((i) => i.problemId);
    expect(new Set(ids).size).toBe(ids.length);
    items.forEach((i) => {
      const expected = crypto.createHash('sha256')
        .update(`${i.problemId}|${i.prompt}|${i.answer.value}`).digest('hex');
      expect(i.contentHash).toBe(expected);
    });
  });

  test('no two items share a prompt shape (numbers blanked)', () => {
    // The assembler's pickDiverse dedups a FORM by this signature; duplicates
    // in the bank would collapse its choices without it noticing.
    const sig = (s) => s.replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
    const seen = new Map();
    items.forEach((i) => {
      const s = sig(i.prompt);
      expect(seen.has(s)).toBe(false);
      seen.set(s, i.problemId);
    });
  });

  test('prompts are plain text — the runner escapes, it does not typeset', () => {
    // public/js/act-test.js renders question text with escapeHtml and no KaTeX,
    // so a LaTeX macro would reach the student as literal backslash source.
    items.forEach((i) => expect(i.prompt).not.toMatch(/\\[a-zA-Z]+|\\\(|\$\$/));
  });

  test('every item carries a worked explanation and the right source tag', () => {
    items.forEach((i) => {
      expect(i.explanation.length).toBeGreaterThanOrEqual(150);
      expect(i.source).toBe('act-ies-expansion');
      expect(i.isActive).toBe(true);
      expect(i.answerType).toBe('multiple-choice');
      expect(i.svg).toBeNull();   // figures are described in words; none stored
    });
  });

  test('the difficulty ramp is spread, not bunched at one level', () => {
    // assembleForm draws each slot against a target difficulty from the
    // blueprint's ramp, so a skill bunched at one level leaves the rest of the
    // ramp unfillable and the form drifts off its intended shape.
    //
    // The six original skills were generated to one exact histogram and it is
    // still worth pinning exactly. The two later concept-coverage skills are
    // hand-authored and smaller, so they get the property the test is actually
    // named for: every level present, none dominant.
    const GENERATED_HISTOGRAM = { 1: 8, 2: 12, 3: 14, 4: 10, 5: 6 };
    const bySkillDiff = {};
    items.forEach((i) => {
      bySkillDiff[i.skillId] = bySkillDiff[i.skillId] || {};
      bySkillDiff[i.skillId][i.difficulty] = (bySkillDiff[i.skillId][i.difficulty] || 0) + 1;
    });
    Object.entries(bySkillDiff).forEach(([skill, d]) => {
      const n = Object.values(d).reduce((a, b) => a + b, 0);
      if (n === 50) {
        expect(d).toEqual(GENERATED_HISTOGRAM);
        return;
      }
      const levels = Object.keys(d).map(Number).sort((a, b) => a - b);
      expect(levels.length).toBeGreaterThanOrEqual(3);          // genuinely spread
      expect(Math.min(...levels)).toBeLessThanOrEqual(2);       // reaches the easy end
      expect(Math.max(...levels)).toBeGreaterThanOrEqual(4);    // reaches the hard end
      Object.values(d).forEach((c) => {
        expect(c / n).toBeLessThanOrEqual(0.5);                 // no level dominates
        expect(skill).toBeTruthy();
      });
    });
  });

  test('no problemId collides with the existing ACT banks', () => {
    const fable = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'seeds/act-fable-items.generated.json'), 'utf8'));
    const existing = new Set(fable.map((i) => i.problemId));
    items.forEach((i) => expect(existing.has(i.problemId)).toBe(false));
  });
});
