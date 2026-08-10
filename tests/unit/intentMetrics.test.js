// tests/unit/intentMetrics.test.js
//
// The onboarding classifier shipped with no way to tell whether it was right,
// which is how it carried an ordering bug for as long as it did. This is the
// instrumentation that makes it visible.
//
// Three properties are pinned, and all three fail silently if broken:
//
//   1. No student text is ever stored. The whole point of dropping intentText
//      was to stop retaining free-form voice input from minors; a metrics ring
//      that quietly kept it would put it straight back.
//
//   2. The agreement ring dedupes per student per pair. buildIntentContext runs
//      on EVERY tutoring turn, so without this the agreement rate measures
//      session length rather than anything about the classifier.
//
//   3. `neverProduced` names categories the classifier has never emitted —
//      the only way a dead enum branch surfaces at all.

const metrics = require('../../utils/intentMetrics');
const { ALLOWED_CATEGORIES } = require('../../utils/onboardingIntent');

beforeEach(() => metrics.reset());

describe('no student text is retained', () => {
  test('a classification record keeps a bucket, never the answer', () => {
    const rec = metrics.recordClassification({
      category: 'student_homework',
      capturedVia: 'voice',
      textLength: 'my mom said I should try this'.length,
    });
    const serialized = JSON.stringify(rec);
    expect(serialized).not.toMatch(/mom|said|try/i);
    expect(rec.length).toBe('medium');
    expect(rec).not.toHaveProperty('text');
    expect(rec).not.toHaveProperty('intentText');
  });

  test('length is bucketed, not exact', () => {
    expect(metrics.recordClassification({ category: 'unknown', textLength: 3 }).length).toBe('short');
    expect(metrics.recordClassification({ category: 'unknown', textLength: 60 }).length).toBe('medium');
    expect(metrics.recordClassification({ category: 'unknown', textLength: 900 }).length).toBe('long');
  });
});

describe('coverage — the headline is what the classifier could not place', () => {
  test('unknownRate is the share that fell through', () => {
    metrics.recordClassification({ category: 'unknown' });
    metrics.recordClassification({ category: 'unknown' });
    metrics.recordClassification({ category: 'student_homework' });
    metrics.recordClassification({ category: 'act_sat_prep' });

    const a = metrics.aggregate().classification;
    expect(a.sampleSize).toBe(4);
    expect(a.unknownRate).toBe(0.5);
    expect(a.byCategory.student_homework).toBe(1);
  });

  test('neverProduced names the branches that have never fired', () => {
    metrics.recordClassification({ category: 'student_homework' });
    const { neverProduced } = metrics.aggregate().classification;
    expect(neverProduced).not.toContain('student_homework');
    expect(neverProduced).toContain('teacher_exploring');
    // It can only ever name real schema values.
    neverProduced.forEach(c => expect(ALLOWED_CATEGORIES).toContain(c));
  });

  test('an empty ring reports zero rather than NaN', () => {
    const a = metrics.aggregate().classification;
    expect(a.sampleSize).toBe(0);
    expect(a.unknownRate).toBe(0);
    expect(a.neverProduced).toEqual(ALLOWED_CATEGORIES);
  });
});

describe('agreement — what they said versus what they did', () => {
  test('one student, one pair, however many turns', () => {
    for (let i = 0; i < 50; i++) {
      metrics.recordObservation({
        stated: 'just_exploring', observed: 'student_homework', userKey: 'u1',
      });
    }
    expect(metrics.aggregate().agreement.sampleSize).toBe(1);
  });

  test('the same student showing a different behaviour is a new record', () => {
    metrics.recordObservation({ stated: 'just_exploring', observed: 'student_homework', userKey: 'u1' });
    metrics.recordObservation({ stated: 'just_exploring', observed: 'act_sat_prep', userKey: 'u1' });
    expect(metrics.aggregate().agreement.sampleSize).toBe(2);
  });

  test('different students are counted separately', () => {
    metrics.recordObservation({ stated: 'just_exploring', observed: 'student_homework', userKey: 'u1' });
    metrics.recordObservation({ stated: 'just_exploring', observed: 'student_homework', userKey: 'u2' });
    expect(metrics.aggregate().agreement.sampleSize).toBe(2);
  });

  test('mismatched pairs are ranked by count — the top row is the work-list', () => {
    ['a', 'b', 'c'].forEach(u =>
      metrics.recordObservation({ stated: 'just_exploring', observed: 'student_homework', userKey: u }));
    metrics.recordObservation({ stated: 'general_math_help', observed: 'act_sat_prep', userKey: 'd' });
    metrics.recordObservation({ stated: 'student_homework', observed: 'student_homework', userKey: 'e' });

    const { agreementRate, topMismatches } = metrics.aggregate().agreement;
    expect(agreementRate).toBe(0.2);                       // 1 agreement in 5
    expect(topMismatches[0].stated).toBe('just_exploring');
    expect(topMismatches[0].observed).toBe('student_homework');
    expect(topMismatches[0].count).toBe(3);
    // An agreement is never listed as a mismatch.
    expect(topMismatches.some(m => m.stated === m.observed)).toBe(false);
  });

  test('an incomplete observation is not recorded rather than half-recorded', () => {
    expect(metrics.recordObservation({ stated: 'student_homework' })).toBeNull();
    expect(metrics.recordObservation({ observed: 'student_homework' })).toBeNull();
    expect(metrics.recordObservation({})).toBeNull();
    expect(metrics.recordObservation()).toBeNull();
    expect(metrics.aggregate().agreement.sampleSize).toBe(0);
  });
});

describe('the ring is bounded', () => {
  test('it does not grow without limit', () => {
    for (let i = 0; i < 1200; i++) metrics.recordClassification({ category: 'unknown' });
    const a = metrics.aggregate().classification;
    expect(a.sampleSize).toBeLessThanOrEqual(500);
    expect(a.totalEver).toBe(1200);   // the count is exact even though the sample is not
  });
});
