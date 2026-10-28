/**
 * Drill usage report (utils/drillUsageReport.js): the owner's site-wide "who is using the drill".
 * Pure shaping here; the database read and the admin route are tests/integration/drillUsageReport.test.js.
 */
const { summarizeStudents, toCsv, csvCell, windowDays, COLUMNS, CAVEATS, DEFAULT_DAYS, MAX_DAYS } = require('../../utils/drillUsageReport');

const oid = (n) => `${n}`.padStart(24, '0');
const day = (n) => new Date(Date.UTC(2026, 9, n, 12));

const users = [
  { _id: oid(1), firstName: 'Ada', lastName: 'Lovelace', username: 'ada', email: 'ada@x.org', gradeLevel: '9' },
  { _id: oid(2), firstName: 'Ben', lastName: 'Okri', username: 'ben', email: 'ben@x.org' },
  { _id: oid(3), firstName: '', lastName: '', username: 'nameless', email: 'n@x.org' },
];
const rounds = [
  { userId: oid(1), drill: 'alg1m11', playbook: 'roots', seconds: 120, score: 40, right: 8, attempted: 10, playedAt: day(3) },
  { userId: oid(1), drill: 'alg1m11', playbook: 'all', seconds: 120, score: 60, right: 12, attempted: 14, playedAt: day(5) },
  { userId: oid(1), drill: 'facts', playbook: 'mul', seconds: 60, score: 30, right: 10, attempted: 10, playedAt: day(1) },
  { userId: oid(3), drill: 'hgeo9', playbook: 'trig', seconds: 90, score: 10, right: 1, attempted: 4, playedAt: day(2) },
];
const fluencyDocs = [
  { userId: oid(2), games: 3, lastGameAt: day(6), facts: {
    'mul:7,8': { label: '7 × 8', fam: 'mul', a: 7, b: 8, att: 3, right: 3, recent: [{ ok: true, ms: 1500 }, { ok: true, ms: 1800 }, { ok: true, ms: 1200 }] },
    'mul:6,9': { label: '6 × 9', fam: 'mul', a: 6, b: 9, att: 2, right: 0, recent: [{ ok: false, ms: 4000 }, { ok: false, ms: 5000 }] },
  } },
];
const classes = new Map([[oid(1), [{ className: 'Algebra 1', period: 'P3', teacher: 'J. Nappier' }, { className: 'Geometry', period: '', teacher: 'J. Nappier' }]]]);
const names = { alg1m11: 'Module 11 Review', facts: 'Math Facts', hgeo9: 'Chapter 9 Review' };

describe('summarizeStudents', () => {
  const { students, totals } = summarizeStudents(users, rounds, fluencyDocs, classes, names);
  const ada = students.find((s) => s.id === oid(1));
  const ben = students.find((s) => s.id === oid(2));
  const nameless = students.find((s) => s.id === oid(3));

  test('one row per student, newest activity first', () => {
    expect(students.map((s) => s.id)).toEqual([oid(2), oid(1), oid(3)]);
  });

  test('solo rounds fold into counts, minutes, accuracy, best and games played', () => {
    expect(ada).toMatchObject({
      name: 'Ada Lovelace', grade: '9', soloRounds: 3, soloMinutes: 5, soloRight: 30, soloAttempted: 34,
      soloAccuracy: 88, soloBest: 60, lastSoloAt: day(5),
    });
    expect(ada.soloGames).toBe('Module 11 Review ×2, Math Facts ×1');
    expect(ada.classes).toBe('Algebra 1 · P3; Geometry');
    expect(ada.teachers).toBe('J. Nappier');
    expect(ada.liveFactGames).toBe(0);
    expect(ada.lastActiveAt).toEqual(day(5));
  });

  test('live Math Facts fluency comes from the FactFluency record, status computed on read', () => {
    expect(ben).toMatchObject({ soloRounds: 0, soloAccuracy: null, soloBest: null, liveFactGames: 3, factsTried: 2, factsFluent: 1, factsMissed: 1, factsSlow: 0 });
    expect(ben.lastLiveFactsAt).toEqual(day(6));
    expect(ben.lastActiveAt).toEqual(day(6));
    expect(ben.classes).toBe('');
  });

  test('a student with no name falls back to the username; an unknown drill id is shown as is', () => {
    expect(nameless.name).toBe('nameless');
    const { students: s2 } = summarizeStudents(users, rounds, [], new Map(), {});
    expect(s2.find((s) => s.id === oid(3)).soloGames).toBe('hgeo9 ×1');
  });

  test('totals count players, rounds and minutes (rounded once from raw seconds)', () => {
    expect(totals).toEqual({ students: 3, soloPlayers: 2, liveFactPlayers: 1, soloRounds: 4, soloMinutes: 7, liveFactGames: 3 });
    // 390 s is 6.5 min → 7, not 5 + 2 (per-student rounding would give 5 + 2 = 7 here by luck; check a drifting case)
    const { totals: t2 } = summarizeStudents(users, [
      { userId: oid(1), drill: 'facts', seconds: 90, score: 1, right: 1, attempted: 1, playedAt: day(1) },
      { userId: oid(2), drill: 'facts', seconds: 90, score: 1, right: 1, attempted: 1, playedAt: day(1) },
      { userId: oid(3), drill: 'facts', seconds: 90, score: 1, right: 1, attempted: 1, playedAt: day(1) },
    ], [], new Map(), names);
    expect(t2.soloMinutes).toBe(5); // 270 s, not 2 + 2 + 2
  });

  test('empty inputs are an empty report, not a crash', () => {
    expect(summarizeStudents([], [], [], new Map(), {})).toEqual({
      students: [], totals: { students: 0, soloPlayers: 0, liveFactPlayers: 0, soloRounds: 0, soloMinutes: 0, liveFactGames: 0 },
    });
    expect(summarizeStudents(undefined, undefined, undefined, undefined).students).toEqual([]);
  });
});

describe('toCsv', () => {
  test('one header row, one row per student, every column, CRLF', () => {
    const { students } = summarizeStudents(users, rounds, fluencyDocs, classes, names);
    const csv = toCsv(students);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(COLUMNS.map(([, l]) => l).join(','));
    expect(lines).toHaveLength(students.length + 2); // + trailing newline
    expect(lines[0].split(',')).toContain('Solo accuracy %');
    expect(csv).toContain('Ada Lovelace');
    expect(csv).toContain('"Algebra 1 · P3; Geometry"'.replace(/"/g, '')); // no comma → unquoted
    expect(csv).toContain('"Module 11 Review ×2, Math Facts ×1"'); // comma → quoted
    expect(csv).toContain(day(5).toISOString());
  });

  test('cells: quotes doubled, null blank, dates ISO, formula-looking text defused', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(day(1))).toBe(day(1).toISOString());
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@me')).toBe("'@me");
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
});

describe('windowDays', () => {
  test('defaults, clamps, and ignores junk', () => {
    expect(windowDays(undefined)).toBe(DEFAULT_DAYS);
    expect(windowDays('')).toBe(DEFAULT_DAYS);
    expect(windowDays('0')).toBe(DEFAULT_DAYS);
    expect(windowDays('-4')).toBe(DEFAULT_DAYS);
    expect(windowDays('abc')).toBe(DEFAULT_DAYS);
    expect(windowDays('90')).toBe(90);
    expect(windowDays('999999')).toBe(MAX_DAYS);
  });
});

describe('caveats', () => {
  test('say what the data cannot carry: self-reported scores, no record of non-Facts live games, no guests', () => {
    const text = CAVEATS.join(' ');
    expect(text).toMatch(/self-reported/i);
    expect(text).toMatch(/Math Facts/);
    expect(text).toMatch(/guest/i);
  });
});
