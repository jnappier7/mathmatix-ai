/**
 * PROOF that completing the baseline actually adapts the course — the thing that
 * "the test runs" never established. Two seams had to close for it to be real:
 *
 *   1. Crediting was keyed by the baseline's fine skill ids, but the course
 *      teaches by its own coarser ids (only 8 of 44 matched). So mastery was
 *      stored where the course never looks. seeds/act-crosswalk.json + the
 *      re-key/merge fix credit under COURSE ids.
 *   2. The every-turn course prompt never read skillMastery, so a skill the
 *      student PROVED on the baseline was still taught from scratch. The prompt
 *      now surfaces the module's already-proven skills.
 *
 * Together these two mean: ace a skill on the baseline -> it's credited under the
 * course id -> the course prompt tells the tutor to skip it. This test proves
 * both halves and the join between them.
 */

const { mergeTalliesToCourse, toCourseSkill } = require('../../utils/actCrosswalk');
const { creditFromTallies } = require('../../utils/coursePreAssessment');
const { buildCourseSystemPrompt } = require('../../utils/coursePrompt');

describe('seam 1 — the baseline credits under COURSE skill ids', () => {
  test('the crosswalk maps a fine baseline id to the course id the modules use', () => {
    expect(toCourseSkill('act-percentages')).toBe('act-percent-applications');
    expect(toCourseSkill('act-function-evaluation-notation')).toBe('act-function-notation-evaluation');
    expect(toCourseSkill('act-linear-equations')).toBe('act-linear-equations'); // one of the 8 that already matched
  });

  test('many-to-one baseline tallies MERGE onto one course skill; clean ones credit', () => {
    // Baseline: aced linear equations (2/2), aced BOTH ratio skills that roll up
    // into one course skill, and MISSED quadratics (1/2).
    const baselineTallies = {
      'act-linear-equations': { correct: 2, total: 2 },
      'act-ratios-proportions': { correct: 1, total: 1 },   // -> act-multi-step-rate-proportion
      'act-multi-step-arithmetic': { correct: 1, total: 1 },// -> act-multi-step-rate-proportion (merges)
      'act-quadratic-equations': { correct: 1, total: 2 },  // missed one -> NOT credited
    };
    const courseTallies = mergeTalliesToCourse(baselineTallies);

    // Re-keyed onto course ids, and the two rate/proportion skills summed.
    expect(courseTallies['act-multi-step-rate-proportion']).toEqual({ correct: 2, total: 2 });
    expect(courseTallies['act-linear-equations']).toEqual({ correct: 2, total: 2 });
    expect(courseTallies['act-quadratic-equations']).toEqual({ correct: 1, total: 2 });

    const { credited } = creditFromTallies(courseTallies);
    expect(credited).toContain('act-linear-equations');
    expect(credited).toContain('act-multi-step-rate-proportion');
    expect(credited).not.toContain('act-quadratic-equations'); // a miss is never credited
  });

  test('an unmapped baseline id is dropped (no course home), never crashes', () => {
    const out = mergeTalliesToCourse({ 'act-nonexistent-skill': { correct: 1, total: 1 } });
    expect(out).toEqual({});
  });
});

describe('seam 2 — the course prompt SKIPS what the student already proved', () => {
  const baseArgs = () => ({
    tutorProfile: { name: 'Mr. Nappier', persona: '' },
    courseSession: { courseId: 'act-prep', courseName: 'ACT Math Prep', currentModuleId: 'algebra', modules: [] },
    pathway: { track: 'ACT Math Prep', modules: [] },
    scaffoldData: null,
    currentModule: { title: 'Algebra', skills: ['act-linear-equations', 'act-quadratic-equations'] },
  });

  test('a module skill the student proved is surfaced as ALREADY PROVEN', () => {
    const userProfile = {
      firstName: 'Jason',
      // credited by the baseline (seam 1) under the COURSE id:
      skillMastery: { 'act-linear-equations': { status: 'mastered', rung: 'proved' } },
    };
    const prompt = buildCourseSystemPrompt({ ...baseArgs(), userProfile });

    expect(prompt).toMatch(/ALREADY PROVEN/);
    expect(prompt).toMatch(/linear equations/);      // proven -> named for spot-check
    expect(prompt).not.toMatch(/quadratic equations[^]*ALREADY PROVEN/); // not proven -> not in the proven list
  });

  test('no ALREADY-PROVEN block when the student has proved nothing in the module', () => {
    const userProfile = { firstName: 'Jason', skillMastery: {} };
    const prompt = buildCourseSystemPrompt({ ...baseArgs(), userProfile });
    expect(prompt).not.toMatch(/ALREADY PROVEN/);
  });

  test('the join: baseline-credited id (seam 1) is exactly the id the prompt reads (seam 2)', () => {
    // Prove the two halves speak the SAME id — the whole point of the crosswalk.
    const credited = creditFromTallies(mergeTalliesToCourse({ 'act-percentages': { correct: 3, total: 3 } })).credited;
    expect(credited).toContain('act-percent-applications');

    const userProfile = { firstName: 'J', skillMastery: { 'act-percent-applications': { rung: 'proved' } } };
    const prompt = buildCourseSystemPrompt({
      ...baseArgs(),
      currentModule: { title: 'Integrating Essential Skills', skills: ['act-percent-applications'] },
      userProfile,
    });
    expect(prompt).toMatch(/ALREADY PROVEN/);
    expect(prompt).toMatch(/percent applications/);
  });
});
