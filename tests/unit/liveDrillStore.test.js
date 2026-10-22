/**
 * The Live Drill shadow store (utils/liveDrill/store.js): a game outlives the process.
 *
 * What these pin, against an in-memory stand-in for the LiveDrillGame collection:
 *   - every change is written within a second, as ONE write however many answers came in;
 *   - a request for a code this process doesn't hold revives the game from its snapshot — the
 *     teacher's board, a phone's token and its next answer all work on the new process;
 *   - a code that isn't there is answered "not found" without asking the DB again for a while;
 *   - a game swept from memory leaves the shadow; shutdown flushes what is scheduled;
 *   - the chat banner finds a class game hosted before the deploy.
 */
jest.mock('../../models/liveDrillGame', () => {
  const docs = new Map();
  const lean = (v) => ({ lean: () => Promise.resolve(v) });
  const m = {
    _docs: docs,
    updateOne: jest.fn(async (q, u) => { docs.set(q.code, { code: q.code, ...(docs.get(q.code) || {}), ...u.$set }); }),
    findOne: jest.fn((q) => lean(docs.get(q.code) || null)),
    find: jest.fn((q) => lean([...docs.values()].filter((d) => q.classId.$in.includes(d.classId) && d.phase !== 'over'))),
    deleteOne: jest.fn(async (q) => { docs.delete(q.code); }),
    countDocuments: jest.fn(async () => [...docs.values()].filter((d) => d.classId && d.phase !== 'over').length),
  };
  return m;
});
jest.mock('../../models/enrollmentCode', () => {
  const CLASSES = [{ _id: 'class-1', teacherId: 'teacher-1', className: 'Algebra 1', period: 'P3', enrolledStudents: [{ studentId: 'stu-marcus' }] }];
  const chain = (v) => ({ lean: () => Promise.resolve(v) });
  return {
    find: () => chain(CLASSES),
    findOne: (q) => chain(CLASSES.find((c) => c._id === String(q._id) && c.teacherId === String(q.teacherId)) || null),
  };
});

jest.useFakeTimers();
const mongoose = require('mongoose');
const express = require('express');
const supertest = require('supertest');
const Model = require('../../models/liveDrillGame');
const G = require('../../utils/liveDrill/games');
const store = require('../../utils/liveDrill/store');
const { hostRouter, playRouter, mineRouter, TOKEN_HEADER } = require('../../routes/liveDrill');

// "Connected" — after every model is defined (mongoose.model() reads the real connection).
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

const HOST = 'teacher-1';
const keyOf = (g, n) => G.playAt(g, n).answer;
const tick = (ms) => jest.advanceTimersByTimeAsync(ms);

// The deploy: this process's last write lands, the process is gone, the shadow is all that's
// left (a sweep in a test's _reset would drop the shadow too — a real process exit never does).
async function deploy() {
  await store.flush();
  const shadow = new Map([...Model._docs].map(([k, v]) => [k, { ...v }]));
  G._reset();
  await tick(1);
  Model._docs.clear();
  for (const [k, v] of shadow) Model._docs.set(k, v);
  Model.deleteOne.mockClear();
  store._pause(false); // forget the class peek and the misses, as a fresh process would
}

function app(user) {
  const a = express();
  a.use(express.json());
  a.use('/api/live-drill/host', (req, _res, next) => { req.user = user || { _id: HOST, roles: ['teacher'], firstName: 'Jason', lastName: 'N' }; next(); }, hostRouter);
  a.use('/api/live-drill/play', playRouter);
  a.use('/api/live-drill/mine', (req, _res, next) => { req.user = user || { _id: 'stu-marcus', roles: ['student'], firstName: 'Marcus', lastName: 'Lee' }; next(); }, mineRouter);
  return supertest(a);
}

beforeEach(() => { store._pause(false); Model._docs.clear(); jest.clearAllMocks(); });
afterEach(() => { G._reset(); Model._docs.clear(); });

describe('writes', () => {
  test('a burst of changes is one write, within a second', async () => {
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive' });
    const ana = G.join(g, 'Ana');
    G.join(g, 'Ben');
    G.start(g);
    for (let i = 0; i < 5; i++) { const { n } = G.currentPlay(g, ana.player); G.answer(g, ana.player, n, keyOf(g, n)); }
    expect(Model.updateOne).not.toHaveBeenCalled();
    await tick(store.SAVE_DELAY_MS + 5);
    expect(Model.updateOne).toHaveBeenCalledTimes(1);
    const doc = Model._docs.get(g.code);
    expect(doc).toMatchObject({ hostId: HOST, phase: 'live', version: g.version });
    expect(doc.state.players.__map).toHaveLength(2);
    expect(doc.touchedAt).toEqual(new Date(g.touchedAt));
    // the next change schedules the next write
    G.join(g, 'Cal');
    await tick(store.SAVE_DELAY_MS + 5);
    expect(Model.updateOne).toHaveBeenCalledTimes(2);
    expect(Model._docs.get(g.code).state.players.__map).toHaveLength(3);
  });

  test('flush writes what is scheduled right away (shutdown)', async () => {
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive' });
    G.join(g, 'Ana');
    await store.flush();
    expect(Model.updateOne).toHaveBeenCalledTimes(1);
    expect(Model._docs.get(g.code).state.players.__map[0][1].name).toBe('Ana');
    await tick(store.SAVE_DELAY_MS + 5);
    expect(Model.updateOne).toHaveBeenCalledTimes(1); // the scheduled write was the flushed one
  });

  test('a game swept from memory leaves the shadow', async () => {
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive' });
    await store.flush();
    expect(Model._docs.has(g.code)).toBe(true);
    G._reset();
    await tick(1);
    expect(Model.deleteOne).toHaveBeenCalledWith({ code: g.code });
    expect(Model._docs.has(g.code)).toBe(false);
  });

  test('without a DB connection nothing is written and nothing is read', async () => {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });
    try {
      const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive' });
      await tick(store.SAVE_DELAY_MS + 5);
      await store.flush();
      expect(Model.updateOne).not.toHaveBeenCalled();
      expect(await store.load(g.code)).toBe(g); // memory still answers
      G._reset();
      expect(await store.load(g.code)).toBeNull();
      expect(Model.findOne).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    }
  });
});

describe('load', () => {
  test('revives a game another process saved; a held game is answered from memory', async () => {
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive', seconds: 120 });
    const ana = G.join(g, 'Ana');
    G.start(g);
    await store.flush();
    expect(await store.load(g.code)).toBe(g);
    expect(Model.findOne).not.toHaveBeenCalled();
    await deploy();
    const h = await store.load(g.code.toLowerCase());
    expect(h).not.toBeNull();
    expect(h).not.toBe(g);
    expect(h.code).toBe(g.code);
    expect(G.playerFor(h, ana.token).name).toBe('Ana');
    expect(h.phase).toBe('live');
    expect(G.getGame(g.code)).toBe(h);
  });

  test('a code that is nowhere is "not found", and not asked of the DB again for a while', async () => {
    expect(await store.load('NOPE22')).toBeNull();
    expect(await store.load('NOPE22')).toBeNull();
    expect(Model.findOne).toHaveBeenCalledTimes(1);
    await tick(store.MISS_TTL_MS + 5);
    expect(await store.load('NOPE22')).toBeNull();
    expect(Model.findOne).toHaveBeenCalledTimes(2);
    expect(await store.load('')).toBeNull();
    expect(await store.load('???')).toBeNull();
  });

  test('a snapshot the game module would have swept is not revived', async () => {
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive' });
    await deploy();
    const doc = Model._docs.get(g.code);
    Model._docs.set(g.code, { ...doc, touchedAt: new Date(Date.now() - G.IDLE_TTL_MS - 1000) });
    expect(await store.load(g.code)).toBeNull();
    // finished more than an hour ago, too
    Model._docs.set(g.code, { ...doc, phase: 'over', touchedAt: new Date(), state: { ...doc.state, phase: 'over', endedAt: Date.now() - G.DONE_TTL_MS - 1000 } });
    await tick(store.MISS_TTL_MS + 5);
    expect(await store.load(g.code)).toBeNull();
  });
});

describe('over HTTP: a deploy mid-game', () => {
  test('the board, a phone and its next answer all carry on in the new process', async () => {
    const api = app();
    const made = await api.post('/api/live-drill/host/games').send({ drill: 'algebra', playbook: 'all', mode: 'drive', seconds: 120 });
    expect(made.status).toBe(201);
    const { code } = made.body;
    const seat = await api.post('/api/live-drill/play/join').send({ code, name: 'Ana' });
    expect(seat.status).toBe(201);
    const token = seat.body.token;
    expect((await api.post(`/api/live-drill/host/games/${code}/start`).send({})).status).toBe(200);
    const p1 = await api.get(`/api/live-drill/play/${code}/play`).set(TOKEN_HEADER, token);
    expect(p1.status).toBe(200);
    const g = G.getGame(code);
    const r1 = await api.post(`/api/live-drill/play/${code}/answer`).set(TOKEN_HEADER, token).send({ n: p1.body.n, k: keyOf(g, p1.body.n) });
    expect(r1.body.ok).toBe(true);
    const p2 = await api.get(`/api/live-drill/play/${code}/play`).set(TOKEN_HEADER, token);
    const versionBefore = G.hostView(g).version;

    await deploy();
    expect(Model._docs.has(code)).toBe(true);

    const board = await api.get(`/api/live-drill/host/games/${code}`);
    expect(board.status).toBe(200);
    expect(board.body.version).toBe(versionBefore);
    expect(board.body.players.map((p) => [p.name, p.yards])).toEqual([['Ana', 15]]);
    const state = await api.get(`/api/live-drill/play/${code}/state`).set(TOKEN_HEADER, token);
    expect(state.status).toBe(200);
    expect(state.body.me.name).toBe('Ana');
    const again = await api.get(`/api/live-drill/play/${code}/play`).set(TOKEN_HEADER, token);
    expect(again.body).toEqual(p2.body); // the play they were looking at
    const r2 = await api.post(`/api/live-drill/play/${code}/answer`).set(TOKEN_HEADER, token).send({ n: p2.body.n, k: keyOf(G.getGame(code), p2.body.n) });
    expect(r2.body.ok).toBe(true);
    expect((await api.get(`/api/live-drill/host/games/${code}`)).body.players[0].yards).toBe(30);
    // and another teacher still can't see it
    expect((await app({ _id: 'teacher-2', roles: ['teacher'] }).get(`/api/live-drill/host/games/${code}`)).status).toBe(404);
  });

  test('the chat banner finds a class game hosted before the deploy', async () => {
    const api = app();
    const made = await api.post('/api/live-drill/host/games').send({ drill: 'algebra', playbook: 'all', mode: 'drive', classId: 'class-1' });
    expect(made.status).toBe(201);
    await deploy();
    const mine = await api.get('/api/live-drill/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.games.map((x) => x.code)).toEqual([made.body.code]);
    expect(G.getGame(made.body.code)).not.toBeNull();
  });

  test('with no class game anywhere, the banner poll is one cached count, not a query per student', async () => {
    const api = app();
    await api.get('/api/live-drill/mine');
    await api.get('/api/live-drill/mine');
    await api.get('/api/live-drill/mine');
    expect(Model.countDocuments).toHaveBeenCalledTimes(1);
    expect(Model.find).not.toHaveBeenCalled();
  });
});

describe('handoff (SIGTERM on the old process)', () => {
  test('writes every game, stops its clocks, closes its streams, and answers 503 "retry" from then on', async () => {
    const api = app();
    const g = G.createGame({ hostId: HOST, drill: 'algebra', playbook: 'all', mode: 'drive', seconds: 120 });
    const ana = G.join(g, 'Ana');
    G.start(g);
    const res = { write: jest.fn(), end: jest.fn() };
    G.subscribe(g, { kind: 'player', playerId: ana.player.id, res });
    expect(g.timers.size).toBe(1);
    const over = jest.fn();
    G.onGameOver(over);

    await store.handoff();
    expect(Model._docs.get(g.code).version).toBe(g.version);
    expect(g.timers.size).toBe(0);
    expect(res.end).toHaveBeenCalled();
    expect(g.listeners.size).toBe(0);
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(over).not.toHaveBeenCalled(); // the NEW process ends it (and saves the facts) — not both
    expect(store.isHandingOff()).toBe(true);

    for (const r of [
      api.get(`/api/live-drill/host/games/${g.code}`),
      api.post(`/api/live-drill/play/${g.code}/answer`).set(TOKEN_HEADER, ana.token).send({ n: 1, k: 'x' }),
      api.post('/api/live-drill/play/join').send({ code: g.code, name: 'Ben' }),
      api.get('/api/live-drill/mine'),
    ]) {
      const out = await r;
      expect(out.status).toBe(503);
      expect(out.body.retry).toBe(true);
    }
    expect((await api.get('/api/live-drill/solo/hubs')).status).toBe(404); // not mounted here — but never 503
    await store.handoff(); // idempotent
    expect(Model.updateOne).toHaveBeenCalledTimes(1);
  });

  test('both clients retry a 503 "retry" and a dropped connection for a few seconds, quietly', () => {
    const fs = require('fs');
    const path = require('path');
    for (const f of ['play.js', 'host.js']) {
      const src = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill', f), 'utf8');
      expect(src).toMatch(/res\.status === 503 && body && body\.retry && attempt < MOVE_RETRIES/);
      expect(src).toMatch(/catch \(netErr\) \{\s*if \(attempt < MOVE_RETRIES\)/);
      expect(Number(src.match(/MOVE_RETRIES = (\d+)/)[1]) * Number(src.match(/MOVE_WAIT_MS = (\d+)/)[1])).toBeGreaterThanOrEqual(5000);
    }
    // the board's "that game has ended" is only ever for a real not-found, never a 503 or a dropped socket
    const host = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/host.js'), 'utf8');
    expect(host).toMatch(/if \(\/not found\/i\.test\(e\.message\)\)/);
  });
});

