/**
 * QA polish pass: course buckets, per-class AI settings merge/diff.
 */
const { courseBucket, BUCKETS } = require('../../utils/courseBuckets');
const { mergeSettings, diffSettings } = require('../../utils/effectiveAISettings');

describe('courseBucket — the live catalog\'s 49 labels into ~9 courses', () => {
  // Every label in the prod catalog on 2026-10-14.
  const LIVE = ['ACT Math Prep', 'AP Calculus AB', 'AP Statistics', 'Algebra 1', 'Algebra 2', 'Algebra 2 / Pre-Calculus', 'Algebra 2 / Statistics',
    'Calculus 1', 'Calculus 2', 'Calculus 3', 'Elementary Math', 'Geometry', 'Geometry / Algebra 2', 'Grade 1 Math', 'Grade 1-2 Math', 'Grade 1-3 Math',
    'Grade 2 Math', 'Grade 2-3 Math', 'Grade 2-4 Math', 'Grade 3 Math', 'Grade 3-4 Math', 'Grade 3-5 Math', 'Grade 4 Math', 'Grade 4-5 Math', 'Grade 5 Math',
    'Grade 5-6 Math', 'Grade 6 Math', 'Grade 6 Math / Algebra 1', 'Grade 6-7 Math', 'Grade 6-8 Math', 'Grade 7 Math', 'Grade 7-8 Math', 'Grade 7-9 Math',
    'Grade 8 Math', 'Grade 8 Math / Algebra 1', 'Grade 8 Math / Geometry', 'Grade 8-9 Math', 'Grade K-1 Math', 'Grade K-2 Math', 'Kindergarten',
    'Kindergarten Math', 'Kindergarten-Grade 1', 'Mathematics', 'Middle School Math', 'Pre-Calculus', 'Pre-Calculus / Calculus', 'Precalculus'];
  test('everything but the generic "Mathematics" lands in a bucket', () => {
    const unplaced = LIVE.filter(l => !courseBucket(l));
    expect(unplaced).toEqual(['Mathematics']);
    expect(new Set(LIVE.map(l => (courseBucket(l) || {}).key).filter(Boolean)).size).toBeLessThanOrEqual(BUCKETS.length);
  });
  test.each([
    ['Grade 6-7 Math', 'middle'], ['Grade 5-6 Math', 'elementary'], ['Algebra 2 / Pre-Calculus', 'algebra-2'],
    ['Pre-Calculus / Calculus', 'precalc'], ['AP Calculus AB', 'calculus'], ['Precalculus', 'precalc'], ['Grade 8 Math / Algebra 1', 'middle'],
  ])('%s → %s (lowest grade / first course)', (label, key) => expect(courseBucket(label).key).toBe(key));
});

describe('per-class AI settings', () => {
  const defaults = { calculatorAccess: 'skill-based', scaffoldingLevel: 3, vocabularyPreferences: { orderOfOperations: 'GEMS', customVocabulary: [] }, responseStyle: { errorCorrectionStyle: 'socratic' } };
  test('a class stores only what differs from the defaults', () => {
    const edited = { ...defaults, calculatorAccess: 'never', vocabularyPreferences: { orderOfOperations: 'PEMDAS', customVocabulary: [] } };
    expect(diffSettings(defaults, edited)).toEqual({ calculatorAccess: 'never', vocabularyPreferences: { orderOfOperations: 'PEMDAS' } });
    expect(diffSettings(defaults, defaults)).toEqual({});
  });
  test('defaults the class did not override keep flowing through', () => {
    const override = { calculatorAccess: 'never' };
    const later = { ...defaults, scaffoldingLevel: 5 };
    expect(mergeSettings(later, override)).toMatchObject({ calculatorAccess: 'never', scaffoldingLevel: 5, responseStyle: { errorCorrectionStyle: 'socratic' } });
  });
  test('deep merge; blanks in an override never erase a default', () => {
    expect(mergeSettings(defaults, { vocabularyPreferences: { orderOfOperations: 'BODMAS' }, calculatorNote: '' }))
      .toMatchObject({ vocabularyPreferences: { orderOfOperations: 'BODMAS', customVocabulary: [] }, calculatorAccess: 'skill-based' });
  });
});

describe('wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const read = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
  test('chat and all THREE calculator-access endpoints read the same effective settings', () => {
    expect(read('routes/chat.js')).toMatch(/getEffectiveAISettings\(user, \{ scope \}\)/);
    for (const f of ['config/routes.js', 'routes/student.js', 'routes/teacher.js']) {
      expect(read(f)).toMatch(/calculatorAccessFor\(req\.user\)/);
    }
  });
  test('analytics names skills through the shared resolver and drops junk keys', () => {
    const src = read('routes/analytics.js');
    expect(src).toMatch(/resolveSkillDisplayNames\(skillIds\)/);
    expect(src).toMatch(/isRealSkillKey\(skillId\)/);
  });
  test('the knowledge view is an HTML table (screen-readable), every chart canvas is labelled', () => {
    expect(read('public/teacher-dashboard.html')).toMatch(/id="class-knowledge-table"/);
    expect(read('public/teacher-dashboard.html')).not.toMatch(/<canvas id="[^"]+"><\/canvas>/);
    expect(read('public/js/analyticsCharts.js')).toMatch(/describeChart\(canvasId, chart\)/);
  });
});
