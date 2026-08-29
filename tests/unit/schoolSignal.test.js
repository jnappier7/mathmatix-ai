// tests/unit/schoolSignal.test.js
// Pins the school-density pipeline signal.
//
// The one failure that would matter here is a false positive: a cluster that
// looks like a warm school and isn't, sending the founder to cold-call a
// mailbox provider. Most of these tests hold that line.

const {
  buildSchoolSignals,
  emailDomain,
  isInstitutionalDomain,
  READY_TEACHER_THRESHOLD,
} = require('../../utils/schoolSignal');

const NOW = new Date('2026-08-29T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

let seq = 0;
function teacher(email, opts = {}) {
  return {
    _id: `t${seq++}`,
    email,
    lastLogin: opts.lastLogin === undefined ? daysAgo(1) : opts.lastLogin,
    schoolLicenseId: opts.licensed ? 'lic1' : null,
  };
}
function studentOf(t, minutes = 30) {
  return { _id: `s${seq++}`, teacherId: t._id, totalActiveTutoringMinutes: minutes };
}
const run = (teachers, students = []) =>
  buildSchoolSignals(teachers, students, { now: NOW });
const byDomain = (res, d) => res.clusters.find((c) => c.domain === d);

describe('emailDomain', () => {
  test('lowercases and takes the part after the last @', () => {
    expect(emailDomain('A.Teacher@Sub.K12.MO.US')).toBe('sub.k12.mo.us');
  });

  test('rejects anything that is not a usable address', () => {
    for (const bad of [null, undefined, 42, '', 'nope', '@nodomain.com', 'user@', 'user@localhost']) {
      expect(emailDomain(bad)).toBeNull();
    }
  });
});

describe('isInstitutionalDomain', () => {
  test('accepts school domains and rejects mailbox providers', () => {
    expect(isInstitutionalDomain('stcharles.k12.mo.us')).toBe(true);
    for (const consumer of ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'aol.com']) {
      expect(isInstitutionalDomain(consumer)).toBe(false);
    }
  });
});

describe('buildSchoolSignals — false positives', () => {
  test('a crowd of consumer addresses never becomes a lead', () => {
    // 40 strangers on gmail must not outrank a real school of four.
    const gmail = Array.from({ length: 40 }, (_, i) => teacher(`p${i}@gmail.com`));
    const school = Array.from({ length: 4 }, (_, i) => teacher(`t${i}@springfield.k12.il.us`));

    const res = run([...gmail, ...school]);

    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0].domain).toBe('springfield.k12.il.us');
    expect(res.skipped.consumerDomain).toBe(40);
  });

  test('unusable addresses are counted as skipped, not clustered', () => {
    const res = run([teacher('broken'), teacher(null), teacher('a@school.edu')]);
    expect(res.skipped.noDomain).toBe(2);
    expect(res.clusters).toHaveLength(1);
  });

  test('dormant teachers raise headcount but not the active count that ranks', () => {
    const res = run([
      teacher('a@school.edu'),
      teacher('b@school.edu', { lastLogin: daysAgo(200) }),
      teacher('c@school.edu', { lastLogin: null }),
    ]);
    const c = byDomain(res, 'school.edu');
    expect(c.teachers).toBe(3);
    expect(c.activeTeachers).toBe(1);
    expect(c.readyForOutreach).toBe(false);
  });
});

describe('buildSchoolSignals — readiness', () => {
  test('flags a cluster once enough teachers are active', () => {
    const staff = Array.from({ length: READY_TEACHER_THRESHOLD }, (_, i) =>
      teacher(`t${i}@ready.k12.mo.us`)
    );
    expect(byDomain(run(staff), 'ready.k12.mo.us').readyForOutreach).toBe(true);
  });

  test('one teacher short of the threshold is not flagged', () => {
    const staff = Array.from({ length: READY_TEACHER_THRESHOLD - 1 }, (_, i) =>
      teacher(`t${i}@almost.k12.mo.us`)
    );
    expect(byDomain(run(staff), 'almost.k12.mo.us').readyForOutreach).toBe(false);
  });

  test('a fully licensed school is a renewal, not a lead', () => {
    const staff = Array.from({ length: 5 }, (_, i) =>
      teacher(`t${i}@customer.k12.mo.us`, { licensed: true })
    );
    const c = byDomain(run(staff), 'customer.k12.mo.us');
    expect(c.alreadyLicensed).toBe(true);
    expect(c.readyForOutreach).toBe(false);
  });

  test('a partly licensed school is still an expansion lead', () => {
    const staff = [
      teacher('a@growing.k12.mo.us', { licensed: true }),
      teacher('b@growing.k12.mo.us'),
      teacher('c@growing.k12.mo.us'),
      teacher('d@growing.k12.mo.us'),
    ];
    const c = byDomain(run(staff), 'growing.k12.mo.us');
    expect(c.alreadyLicensed).toBe(false);
    expect(c.readyForOutreach).toBe(true);
  });
});

describe('buildSchoolSignals — reach', () => {
  test('totals each cluster only over its own teachers students', () => {
    const a1 = teacher('a1@alpha.edu');
    const a2 = teacher('a2@alpha.edu');
    const b1 = teacher('b1@beta.edu');
    const res = run(
      [a1, a2, b1],
      [studentOf(a1, 60), studentOf(a2, 40), studentOf(a2, 0), studentOf(b1, 10)]
    );

    const alpha = byDomain(res, 'alpha.edu');
    expect(alpha.students).toBe(3);
    expect(alpha.activeStudents).toBe(2);   // the 0-minute student is not active
    expect(alpha.tutoringMinutes).toBe(100);

    expect(byDomain(res, 'beta.edu').tutoringMinutes).toBe(10);
  });

  test('ranks by active teachers first, then reach', () => {
    const big = Array.from({ length: 5 }, (_, i) => teacher(`t${i}@big.edu`));
    const small = Array.from({ length: 2 }, (_, i) => teacher(`t${i}@small.edu`));
    // Give the SMALL school far more usage — density must still win.
    const res = run([...small, ...big], small.map((t) => studentOf(t, 5000)));
    expect(res.clusters[0].domain).toBe('big.edu');
  });

  test('an empty database returns empty structures, not undefined', () => {
    const res = run([], []);
    expect(res.clusters).toEqual([]);
    expect(res.skipped).toEqual({ noDomain: 0, consumerDomain: 0 });
    expect(res.caveats.length).toBeGreaterThan(0);
  });

  test('carries the caveat that personal-email teachers are invisible', () => {
    expect(run([teacher('a@school.edu')]).caveats.join(' ')).toMatch(/personal address/i);
  });
});
