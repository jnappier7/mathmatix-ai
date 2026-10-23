const { gameNames, summarizeStudent, summarizeClass } = require('../../utils/liveDrill/practice');

const at = (iso) => new Date(iso);
const row = (o) => ({ userId: 'u1', drill: 'algebra', seconds: 120, score: 100, playedAt: at('2026-10-20T10:00:00Z'), ...o });

describe('summarizeStudent', () => {
  it('counts rounds and practice minutes', () => {
    const s = summarizeStudent([
      row({ seconds: 120 }), row({ seconds: 180 }), row({ seconds: 120 }),
    ]);
    expect(s.rounds).toBe(3);
    expect(s.minutes).toBe(7);           // 420s
  });

  it('folds by game and reports the best', () => {
    const s = summarizeStudent([
      row({ drill: 'algebra', score: 300 }),
      row({ drill: 'algebra', score: 900 }),
      row({ drill: 'alg1m3', score: 50 }),
    ]);
    expect(s.games.map((g) => g.drill)).toEqual(['algebra', 'alg1m3']); // most rounds first
    expect(s.games[0].best).toBe(900);
    expect(s.games[0].rounds).toBe(2);
  });

  it('measures movement from the earliest round to the latest, not the order given', () => {
    const s = summarizeStudent([
      row({ score: 900, playedAt: at('2026-10-22T10:00:00Z') }),  // latest, listed first
      row({ score: 400, playedAt: at('2026-10-20T10:00:00Z') }),  // earliest
    ]);
    expect(s.games[0].first).toBe(400);
    expect(s.games[0].last).toBe(900);
    expect(s.games[0].delta).toBe(500);
  });

  it('reports no movement for a single round rather than a misleading +0', () => {
    const s = summarizeStudent([row({ score: 400 })]);
    expect(s.games[0].delta).toBeNull();
    expect(s.games[0].rounds).toBe(1);
  });

  it('handles a student with nothing', () => {
    const s = summarizeStudent([]);
    expect(s).toMatchObject({ rounds: 0, minutes: 0, lastAt: null, games: [] });
  });
});

describe('summarizeClass', () => {
  const roster = [{ id: 'u2', name: 'Bea' }, { id: 'u1', name: 'Ada' }, { id: 'u3', name: 'Cy' }];

  it('keeps students who have never practised — usually the row a teacher wants', () => {
    const c = summarizeClass(roster, [row({ userId: 'u1' }), row({ userId: 'u2' })]);
    expect(c.students.map((s) => s.name)).toEqual(['Ada', 'Bea', 'Cy']);   // name-sorted
    expect(c.students.find((s) => s.name === 'Cy').rounds).toBe(0);
    expect(c.totals).toMatchObject({ students: 3, practised: 2, notPractised: 1, rounds: 2 });
  });

  it('totals rounds and minutes across the class', () => {
    const c = summarizeClass(roster, [
      row({ userId: 'u1', seconds: 120 }), row({ userId: 'u1', seconds: 120 }), row({ userId: 'u2', seconds: 180 }),
    ]);
    expect(c.totals.rounds).toBe(3);
    expect(c.totals.minutes).toBe(7);           // 240s + 180s
  });

  it('rounds class minutes once, from raw seconds', () => {
    // three students at 90s each is 4.5 minutes; summing each one's rounded
    // 1.5 -> 2 would report 6
    const c = summarizeClass(roster, [
      row({ userId: 'u1', seconds: 90 }), row({ userId: 'u2', seconds: 90 }), row({ userId: 'u3', seconds: 90 }),
    ]);
    expect(c.totals.minutes).toBe(5);
    expect(c.students.every((s) => s.minutes === 2)).toBe(true);  // each student still rounds alone
  });

  it('offers no average, ranking or pass/fail — the numbers are self-reported', () => {
    const c = summarizeClass(roster, [row({ userId: 'u1' })]);
    const keys = Object.keys(c.totals).concat(Object.keys(c.students[0]));
    for (const banned of ['average', 'avg', 'mean', 'rank', 'grade', 'passed', 'percentile']) {
      expect(keys.some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });
});

describe('gameNames', () => {
  it('maps drill ids to the names a teacher would recognise', () => {
    expect(gameNames({
      algebra: { games: [{ drill: 'alg1m3', name: 'Module 3 Test Prep' }] },
      geometry: { games: [{ drill: 'hgeo3', name: 'Chapter 3 Test Prep' }] },
    })).toEqual({ alg1m3: 'Module 3 Test Prep', hgeo3: 'Chapter 3 Test Prep' });
  });

  it('survives an empty or malformed catalog', () => {
    expect(gameNames(undefined)).toEqual({});
    expect(gameNames({ x: {} })).toEqual({});
  });
});
