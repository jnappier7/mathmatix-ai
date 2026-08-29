// tests/unit/impactReport.test.js
// Pins the school-facing efficacy report.
//
// This report is a sales artifact, which is exactly why it needs pinning: every
// bug in it points the same direction — a number that flatters the product. The
// tests below hold the four places that could happen (damped declines, unmeasured
// students, an unknown grade, and inference on a tiny sample).

const {
  buildImpactReport,
  summarizeStudentGrowth,
  thetaPerGradeAt,
  UNKNOWN_GRADE_SPACING,
} = require('../../utils/impactReport');

// A student with one growth check from `baseline` to `raw`.
function student(id, baseline, raw, opts = {}) {
  return {
    _id: id,
    gradeLevel: opts.gradeLevel || '8th Grade',
    totalActiveTutoringMinutes: opts.minutes ?? 100,
    learningProfile: {
      growthCheckHistory: [{
        date: opts.date || '2026-01-15',
        previousTheta: baseline,
        newTheta: opts.newTheta ?? raw,
        rawTheta: raw,
        damped: !!opts.damped,
      }],
    },
  };
}

// A student who never took a growth check.
function unmeasured(id, minutes = 0) {
  return { _id: id, gradeLevel: '8th Grade', totalActiveTutoringMinutes: minutes, learningProfile: {} };
}

describe('thetaPerGradeAt', () => {
  test('reads secondary and elementary spacing off the placement table', () => {
    expect(thetaPerGradeAt('8th Grade')).toBeCloseTo(0.3, 5);
    expect(thetaPerGradeAt('4th Grade')).toBeCloseTo(0.5, 5);
  });

  test('an unresolvable grade uses the widest spacing, so it under-claims', () => {
    // Months-of-growth is delta ÷ spacing: a wide spacing yields FEWER claimed
    // months. An unknown grade must never inflate the headline.
    for (const g of [null, undefined, '', 'garbage']) {
      expect(thetaPerGradeAt(g)).toBe(UNKNOWN_GRADE_SPACING);
    }
    expect(UNKNOWN_GRADE_SPACING).toBeGreaterThanOrEqual(thetaPerGradeAt('8th Grade'));
  });

  test('never returns zero or negative (months-of-growth divides by it)', () => {
    for (const g of ['Kindergarten', '1st Grade', '6th Grade', '12th Grade', 'College', 0, 13, 99]) {
      expect(thetaPerGradeAt(g)).toBeGreaterThan(0);
    }
  });
});

describe('summarizeStudentGrowth', () => {
  test('measures the undamped reading, not the value placement acted on', () => {
    // The guard let through a 0.05 drop but the check measured a 0.40 drop.
    // Reporting the damped number would hide a real decline from the school.
    const s = student('a', 1.0, 0.6, { newTheta: 0.95, damped: true });
    const out = summarizeStudentGrowth(s);
    expect(out.deltaTheta).toBeCloseTo(-0.4, 5);
    expect(out.dampedChecks).toBe(1);
  });

  test('falls back to newTheta on legacy rows written before rawTheta existed', () => {
    const s = { _id: 'b', gradeLevel: '8th Grade', learningProfile: {
      growthCheckHistory: [{ date: '2026-01-01', previousTheta: 0.6, newTheta: 0.9 }],
    }};
    expect(summarizeStudentGrowth(s).deltaTheta).toBeCloseTo(0.3, 5);
  });

  test('spans first baseline to last reading across several checks, in date order', () => {
    const s = { _id: 'c', gradeLevel: '8th Grade', learningProfile: {
      growthCheckHistory: [
        { date: '2026-05-01', previousTheta: 0.9, rawTheta: 1.2 },
        { date: '2026-01-01', previousTheta: 0.6, rawTheta: 0.9 },
      ],
    }};
    const out = summarizeStudentGrowth(s);
    expect(out.baselineTheta).toBe(0.6);   // earliest check's "before"
    expect(out.currentTheta).toBe(1.2);    // latest check's reading
    expect(out.checks).toBe(2);
  });

  test('returns null — never a zero — for a student with no checks', () => {
    expect(summarizeStudentGrowth(unmeasured('d'))).toBeNull();
  });

  test('buckets match the thresholds the student was shown at debrief', () => {
    expect(summarizeStudentGrowth(student('e', 0, 0.5)).status).toBe('significant-growth');
    expect(summarizeStudentGrowth(student('f', 0, 0.2)).status).toBe('some-growth');
    expect(summarizeStudentGrowth(student('g', 0, 0.0)).status).toBe('stable');
    expect(summarizeStudentGrowth(student('h', 0, -0.5)).status).toBe('review-needed');
  });
});

describe('buildImpactReport — participation', () => {
  test('unmeasured students dilute participation but not the mean gain', () => {
    const cohort = [student('a', 0, 0.4), student('b', 0, 0.4), unmeasured('c'), unmeasured('d')];
    const r = buildImpactReport(cohort);

    expect(r.cohort.enrolled).toBe(4);
    expect(r.cohort.measured).toBe(2);
    expect(r.cohort.measuredPct).toBe(50);
    // Scoring the two unmeasured students as 0 would halve this to 0.2.
    expect(r.growth.meanThetaGain).toBeCloseTo(0.4, 5);
  });

  test('states the participation rate in the caveats that ship with the numbers', () => {
    const r = buildImpactReport([student('a', 0, 0.4), unmeasured('b'), unmeasured('c')]);
    expect(r.caveats.join(' ')).toMatch(/1 of 3 students \(33\.3%\)/);
  });

  test('always carries the no-control-group caveat', () => {
    const r = buildImpactReport([student('a', 0, 0.4)]);
    expect(r.caveats.join(' ')).toMatch(/no control group/i);
  });

  test('an empty cohort produces zeros, not NaN or a divide-by-zero', () => {
    const r = buildImpactReport([]);
    expect(r.cohort).toMatchObject({ enrolled: 0, measured: 0, measuredPct: 0 });
    expect(r.growth.meanThetaGain).toBe(0);
    expect(r.growth.ci95).toBeNull();
    expect(r.distribution.grewPct).toBe(0);
  });
});

describe('buildImpactReport — inference is withheld on small samples', () => {
  test('no CI or effect size below 10 measured students', () => {
    const cohort = Array.from({ length: 9 }, (_, i) => student(`s${i}`, 0, 0.1 * i));
    const r = buildImpactReport(cohort);
    expect(r.growth.ci95).toBeNull();
    expect(r.growth.effectSize).toBeNull();
    expect(r.caveats.join(' ')).toMatch(/withheld below 10/);
  });

  test('reports both once the sample is large enough', () => {
    const cohort = Array.from({ length: 20 }, (_, i) => student(`s${i}`, 0, 0.3 + (i % 5) * 0.05));
    const r = buildImpactReport(cohort);
    expect(r.growth.ci95.low).toBeLessThan(r.growth.meanThetaGain);
    expect(r.growth.ci95.high).toBeGreaterThan(r.growth.meanThetaGain);
    expect(typeof r.growth.effectSize).toBe('number');
  });

  test('a cohort that declined reports a negative gain rather than clamping to 0', () => {
    const cohort = Array.from({ length: 12 }, (_, i) => student(`s${i}`, 1.0, 1.0 - 0.1 * ((i % 4) + 1)));
    const r = buildImpactReport(cohort);
    expect(r.growth.meanThetaGain).toBeLessThan(0);
    expect(r.distribution.declined).toBeGreaterThan(0);
  });
});

describe('buildImpactReport — engagement', () => {
  test('separates median minutes over everyone from median over active students', () => {
    const cohort = [
      student('a', 0, 0.3, { minutes: 200 }),
      student('b', 0, 0.3, { minutes: 100 }),
      unmeasured('c', 0),
      unmeasured('d', 0),
    ];
    const r = buildImpactReport(cohort);
    expect(r.engagement.totalTutoringMinutes).toBe(300);
    expect(r.engagement.medianMinutesPerStudent).toBe(50);        // includes the zeros
    expect(r.engagement.medianMinutesPerActiveStudent).toBe(150); // excludes them
  });
});
