/**
 * Math-facts fluency saved across games (utils/liveDrill/fluency.js).
 *
 * What these pin:
 *   - a finished Math Facts game folds each SIGNED-IN student's answers into one upsert per
 *     student; guests (code only) and the course drills save nothing; a lobby cancel saves nothing;
 *   - the update is dotted $inc/$push (+ $slice) — applied twice, the totals add and the recent tries
 *     keep only the last few — so two games ending together can't overwrite each other;
 *   - status from the recent tries: missed beats everything, fluent needs 2+ right at ≤ 3 s, one fast
 *     right is only "new", slow is right-but-over-3 s;
 *   - grids fold a fact and its inverse into one family cell, a student's cell takes its worst fact.
 */
jest.useFakeTimers();
const G = require('../../utils/liveDrill/games');
const F = require('../../utils/liveDrill/fluency');

afterEach(() => G._reset());

/** A tiny Mongo: applies $set/$inc/$push($each,$slice) with dotted paths, as updateOne would. */
function fakeModel() {
  const docs = new Map();
  const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const put = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); let x = o; for (const k of ks) x = x[k] || (x[k] = {}); x[last] = v; };
  return {
    docs,
    calls: 0,
    async updateOne(filter, u, opts) {
      this.calls++;
      expect(opts).toEqual({ upsert: true });
      const key = String(filter.userId);
      const d = docs.get(key) || { userId: filter.userId };
      for (const [p, v] of Object.entries(u.$set || {})) put(d, p, v);
      for (const [p, v] of Object.entries(u.$inc || {})) put(d, p, (get(d, p) || 0) + v);
      for (const [p, v] of Object.entries(u.$push || {})) put(d, p, [...(get(d, p) || []), ...v.$each].slice(v.$slice));
      docs.set(key, d);
    },
  };
}

function factsGame(opts = {}) {
  return G.createGame({ hostId: 'h' + Math.random(), drill: 'facts', playbook: 'mul', mode: 'drive', ...opts });
}
function answer(g, p, ms, ok = true) {
  const { n } = G.currentPlay(g, p);
  jest.advanceTimersByTime(ms);
  const pl = G.playAt(g, n);
  return { fact: pl.fact, res: G.answer(g, p, n, ok ? pl.answer : String(Number(pl.answer) + 1)) };
}

describe('saving a game', () => {
  test('signed-in students are saved, guests are not, and the update adds up across games', async () => {
    const M = fakeModel();
    const g = factsGame();
    const ana = G.join(g, 'Ana', { userId: 'u-ana' }).player;
    const guest = G.join(g, 'Guest').player;
    G.start(g);
    const first = answer(g, ana, 1500).fact;
    answer(g, ana, 1500, false);
    answer(g, guest, 1500);
    G.endGame(g);
    expect(await F.saveGame(g, M)).toBe(1);
    expect(M.calls).toBe(1);
    const doc = M.docs.get('u-ana');
    expect(doc.games).toBe(1);
    expect(doc.facts[first.id]).toMatchObject({ label: first.label, fam: 'mul', a: first.a, b: first.b, att: 1, right: 1 });

    // run it back: a second game for the same student adds to the same record
    G.rematch(g); G.start(g);
    for (let i = 0; i < 4; i++) answer(g, ana, 1000);
    G.endGame(g);
    await F.saveGame(g, M);
    expect(M.docs.get('u-ana').games).toBe(2);
    const totalAtt = Object.values(M.docs.get('u-ana').facts).reduce((t, r) => t + r.att, 0);
    expect(totalAtt).toBe(6);
  });

  test('only the last few tries of a fact are kept', async () => {
    const M = fakeModel();
    const g = factsGame();
    const ana = G.join(g, 'Ana', { userId: 'u1' }).player;
    // seven tries at the same fact, straight into the log
    for (let i = 0; i < 7; i++) ana.factLog.push({ id: 'mul:7,8', ok: i % 2 === 0, ms: 1000 + i });
    ana.facts.set('mul:7,8', { label: '7 × 8', fam: 'mul', a: 7, b: 8 });
    g.startedAt = Date.now();
    await F.saveGame(g, M);
    const rec = M.docs.get('u1').facts['mul:7,8'];
    expect(rec.att).toBe(7);
    expect(rec.recent).toHaveLength(F.RECENT);
    expect(rec.recent.map((r) => r.ms)).toEqual([1002, 1003, 1004, 1005, 1006]);
  });

  test('the course drills save nothing', async () => {
    const M = fakeModel();
    const g = G.createGame({ hostId: 'alg', drill: 'algebra', playbook: 'all', mode: 'drive' });
    G.join(g, 'Ana', { userId: 'u2' });
    G.start(g); G.endGame(g);
    expect(await F.saveGame(g, M)).toBe(0);
  });

  test('the Test Prep drills save nothing — native banks, but not fact records', async () => {
    for (const drill of ['alg1m3', 'hgeo3']) {
      const M = fakeModel();
      const g = G.createGame({ hostId: 'prep-' + drill, drill, playbook: 'all', mode: 'hill' });
      const ana = G.join(g, 'Ana', { userId: 'u3' }).player;
      G.start(g);
      answer(g, ana, 1500);
      // the gate is the drill's `trackFacts`, not whatever happens to be on the player
      ana.factLog = [...(ana.factLog || []), { id: '7x8', ok: true, ms: 1500 }];
      G.endGame(g);
      expect(await F.saveGame(g, M)).toBe(0);
    }
  });

  test('a game ending fires the hook once; a lobby cancel never fires it', () => {
    const seen = [];
    G.onGameOver((game) => seen.push(game.code));
    const cancelled = factsGame();
    G.join(cancelled, 'A');
    G.endGame(cancelled);
    const played = factsGame();
    G.join(played, 'A'); G.start(played);
    G.endGame(played); G.endGame(played);
    expect(seen).toEqual([played.code]);
  });

  test('a failed write is logged, not thrown', async () => {
    const g = factsGame();
    const ana = G.join(g, 'Ana', { userId: 'u3' }).player;
    G.start(g); answer(g, ana, 1000); G.endGame(g);
    await expect(F.saveGame(g, { updateOne: () => Promise.reject(new Error('db down')) })).resolves.toBe(0);
  });
});

describe('status and summaries', () => {
  const rec = (...tries) => ({ recent: tries.map(([ok, ms]) => ({ ok, ms })) });
  test.each([
    ['two fast rights', 'fluent', rec([true, 1200], [true, 2000])],
    ['one fast right is only', 'new', rec([true, 900])],
    ['right but slow', 'slow', rec([true, 5000], [true, 4000])],
    ['a recent miss', 'missed', rec([true, 1000], [false, 900], [true, 1000])],
    ['an old miss has aged out', 'fluent', rec([false, 1000], [true, 1000], [true, 1100], [true, 900])],
  ])('%s → %s', (_, status, r) => expect(F.statusOf(r)).toBe(status));

  test('a summary counts by status and lists what to practice, misses first', () => {
    const s = F.summarize({ games: 3, facts: {
      'mul:7,8': { label: '7 × 8', fam: 'mul', a: 7, b: 8, att: 3, right: 2, recent: [{ ok: true, ms: 1000 }, { ok: false, ms: 1000 }] },
      'mul:6,7': { label: '6 × 7', fam: 'mul', a: 6, b: 7, att: 2, right: 2, recent: [{ ok: true, ms: 5000 }, { ok: true, ms: 6000 }] },
      'mul:2,3': { label: '2 × 3', fam: 'mul', a: 2, b: 3, att: 2, right: 2, recent: [{ ok: true, ms: 900 }, { ok: true, ms: 800 }] },
    } });
    expect(s).toMatchObject({ tried: 3, fluent: 1, slow: 1, missed: 1, games: 3, att: 7, right: 6 });
    expect(s.practice.map((p) => p.label)).toEqual(['7 × 8', '6 × 7']);
    expect(F.summarize(null)).toMatchObject({ tried: 0, games: 0, practice: [] });
  });

  test('grids: a fact and its inverse share a cell, and the cell takes the worse one', () => {
    const fast = [{ ok: true, ms: 900 }, { ok: true, ms: 900 }];
    const a = F.summarize({ facts: {
      'mul:7,8': { label: '7 × 8', fam: 'mul', a: 7, b: 8, recent: fast },
      'div:7,8': { label: '56 ÷ 7', fam: 'mul', a: 7, b: 8, recent: [{ ok: false, ms: 900 }] },
      'add:8,5': { label: '8 + 5', fam: 'add', a: 8, b: 5, recent: fast },
    } });
    const grid = F.studentGrid(a);
    const mul = grid.find((x) => x.fam === 'mul');
    expect(mul.cells['7,8']).toEqual({ status: 'missed', facts: ['7 × 8', '56 ÷ 7'] });
    expect(grid.find((x) => x.fam === 'add').max).toBe(10);
    const b = F.summarize({ facts: { 'mul:7,8': { label: '7 × 8', fam: 'mul', a: 7, b: 8, recent: fast } } });
    const cls = F.classGrid([a, b]).find((x) => x.fam === 'mul');
    expect(cls.cells['7,8']).toEqual({ tried: 2, fluent: 1, missed: 1 });
  });
});
