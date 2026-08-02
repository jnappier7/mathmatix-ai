/**
 * No internal skill id may reach text the tutor speaks.
 *
 * The live bug: Maya greeted a student with "we could dive into MS_QNT_8 from
 * your learning plan." MS_QNT_8 is the dot-encoded skillMastery storage key for
 * MS.QNT.8 ("Math with negatives and fractions"). Two independent paths fed it:
 *
 *   1. promptCompact.buildSkillMasteryContext derived the display name from the
 *      Map key with `.replace(/-/g, ' ')` — hyphens only, so an underscore-
 *      encoded unified key passed through untouched.
 *   2. sessionOpener fell back to `displayName || skillId` whenever the plan
 *      entry had no persisted displayName.
 *
 * Both are pinned here. The assertion is deliberately about the SHAPE of an
 * internal id, not one hardcoded string, so a new leak of any unified key fails.
 */

const { buildSkillMasteryContext } = require('../../utils/promptCompact');
const { generateSessionOpener, STRATEGIES } = require('../../utils/sessionOpener');
const { studentLabel } = require('../../utils/studentLabels');

// An encoded unified key ("MS_QNT_8") or a raw dotted one ("MS.QNT.8").
const INTERNAL_ID = /\b[A-Z]{2,5}[._][A-Z]{3}[._]\d+\b/;

describe('studentLabels', () => {
  test('resolves an encoded storage key to the student-facing label', () => {
    expect(studentLabel('MS_QNT_8')).toBe('Math with negatives and fractions');
  });

  test('resolves the logical dotted id identically', () => {
    expect(studentLabel('MS.QNT.8')).toBe('Math with negatives and fractions');
  });

  test('an unknown id degrades to a prettified name, never the encoded form', () => {
    const label = studentLabel('ZZZ_ABC_9');
    expect(label).not.toMatch(/_/);
    // prettify() capitalizes initials without lowercasing the rest, matching
    // skillDisplayNames.prettify — an already-uppercase id stays uppercase.
    expect(label).toBe('ZZZ ABC 9');
  });

  test('a legacy kebab id still reads naturally', () => {
    expect(studentLabel('order-of-operations')).toBe('Order Of Operations');
  });

  test('empty input does not throw', () => {
    expect(studentLabel(null)).toBe('');
    expect(studentLabel('')).toBe('');
  });
});

describe('promptCompact skill context', () => {
  const profileWith = (entries) => ({ skillMastery: new Map(entries) });

  test('names a unified-keyed skill instead of printing its storage key', () => {
    const ctx = buildSkillMasteryContext(
      profileWith([['MS_QNT_8', { status: 'practicing', totalAttempts: 4 }]]),
      null
    );
    expect(ctx).toContain('Math with negatives and fractions');
    expect(ctx).not.toMatch(INTERNAL_ID);
  });

  test('no bucket leaks an id', () => {
    const ctx = buildSkillMasteryContext(
      profileWith([
        ['MS_QNT_8', { status: 'mastered', masteredDate: new Date() }],
        ['ALG1_EQV_1', { status: 'learning' }],
        ['ELEM_QNT_9', { status: 'needs-review' }],
        ['MS_PRP_2', { status: 'ready' }],
        ['ELEM_QNT_4', { status: 'practicing', totalAttempts: 2 }],
      ]),
      null
    );
    expect(ctx).not.toMatch(INTERNAL_ID);
  });

  test('the filter matches across the encoded/logical seam', () => {
    // The Map key is encoded; callers pass the logical id. A raw !== comparison
    // matched nothing, so a badge session got an EMPTY skill block.
    const ctx = buildSkillMasteryContext(
      profileWith([
        ['MS_QNT_8', { status: 'practicing', totalAttempts: 3 }],
        ['ELEM_QNT_4', { status: 'mastered', masteredDate: new Date() }],
      ]),
      'MS.QNT.8'
    );
    expect(ctx).toContain('Math with negatives and fractions');
    expect(ctx).not.toContain('times tables'); // the filtered-out skill
  });

  test('does not instruct the model to emit a skill id', () => {
    const ctx = buildSkillMasteryContext(
      profileWith([['MS_QNT_8', { status: 'ready' }]]),
      null
    );
    expect(ctx).not.toContain('SKILL_MASTERED');
  });
});

describe('sessionOpener directives', () => {
  test('FRESH_START suggests a named skill, not an id (the reported bug)', () => {
    const opener = generateSessionOpener({
      tutorPlan: { currentTarget: { skillId: 'MS_QNT_8', displayName: null } },
      user: {},
    });
    const text = opener.directives.join(' ');
    expect(text).toContain('Math with negatives and fractions');
    expect(text).not.toMatch(INTERNAL_ID);
  });

  test('a persisted displayName still wins', () => {
    const opener = generateSessionOpener({
      tutorPlan: { currentTarget: { skillId: 'MS_QNT_8', displayName: 'Negatives and Fractions' } },
      user: {},
    });
    expect(opener.directives.join(' ')).toContain('Negatives and Fractions');
  });

  test('STRATEGIES is still exported for callers that branch on it', () => {
    expect(STRATEGIES.FRESH_START).toBe('fresh_start');
  });
});
