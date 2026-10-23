/**
 * Live Two-Minute Drill over HTTP (routes/liveDrill.js), plus the three pieces of app wiring a
 * public, whole-class endpoint needs and would silently lose otherwise:
 *
 *   1. the player router is mounted ABOVE the `app.use('/api', isAuthenticated, …)` catch-alls
 *      in config/routes.js — below them, every student without an account gets a 401;
 *   2. it is off the global apiLimiter — a class shares one school IP, and 300 requests per
 *      15 minutes is gone in the first minute of a 30-student drive;
 *   3. it is CSRF-exempt — players carry a bearer token in a header, not a cookie session.
 */
// Class rosters for the class-bound game / chat banner. teacher-1 owns class-1 (Marcus enrolled);
// teacher-2 owns class-2. Only the query shapes routes/liveDrill.js uses are modelled.
jest.mock('../../models/enrollmentCode', () => {
  const CLASSES = [
    { _id: 'class-1', teacherId: 'teacher-1', className: 'Algebra 1', period: 'P3', enrolledStudents: [{ studentId: 'stu-marcus' }] },
    { _id: 'class-2', teacherId: 'teacher-2', className: 'Geometry', enrolledStudents: [{ studentId: 'stu-other' }] },
  ];
  const match = (q) => (c) => (!q._id || c._id === String(q._id)) && (!q.teacherId || c.teacherId === String(q.teacherId))
    && (!q['enrolledStudents.studentId'] || c.enrolledStudents.some((e) => e.studentId === String(q['enrolledStudents.studentId'])));
  const chain = (v) => ({ lean: () => Promise.resolve(v), sort: () => chain(v) });
  return { find: (q) => chain(CLASSES.filter(match(q))), findOne: (q) => chain(CLASSES.find(match(q)) || null) };
});

const fs = require('fs');
const path = require('path');
const express = require('express');
const supertest = require('supertest');
const G = require('../../utils/liveDrill/games');
const { hostRouter, playRouter, mineRouter, soloRouter, isLiveDrillPlayPath } = require('../../routes/liveDrill');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/live-drill/host', (req, _res, next) => { req.user = { _id: req.get('X-Test-User') || 'teacher-1' }; next(); }, hostRouter);
  app.use('/api/live-drill/play', playRouter);
  app.use('/api/live-drill/solo', soloRouter); // no user: solo practice is public
  // Signed-in users: X-Test-Student names a student account; otherwise a teacher is signed in.
  app.use('/api/live-drill/mine', (req, _res, next) => {
    const stu = req.get('X-Test-Student');
    req.user = stu
      ? { _id: stu, roles: ['student'], firstName: 'Marcus', lastName: 'Thompson' }
      : { _id: 'teacher-1', roles: ['teacher'], firstName: 'Jason', lastName: 'Nappier' };
    next();
  }, mineRouter);
  return app;
}

afterEach(() => G._reset());

describe('live drill over HTTP', () => {
  const app = makeApp();
  const req = supertest(app);

  async function host(body) {
    const r = await req.post('/api/live-drill/host/games').send({ drill: 'algebra', playbook: 'm1', mode: 'drive', ...body });
    expect(r.status).toBe(201);
    return r.body;
  }
  async function join(code, name) {
    const r = await req.post('/api/live-drill/play/join').send({ code, name });
    expect(r.status).toBe(201);
    return r.body;
  }

  test('the setup lists every drill with its playbooks and its own settings', async () => {
    const r = await req.get('/api/live-drill/host/drills');
    expect(r.status).toBe(200);
    expect(r.body.drills.map((d) => d.id)).toEqual(['algebra', 'geometry', 'facts', 'alg1m3', 'hgeo3', 'alg1m7', 'hgeo4', 'alg1m8', 'hgeo5', 'alg1m9', 'hgeo6', 'alg1m10', 'hgeo7', 'alg1m11', 'hgeo8', 'alg1m12', 'hgeo9']);
    expect(r.body.drills.every((d) => d.playbooks.length > 1 && !d.unavailable && d.settings.huddle.secondsPerPlay.length)).toBe(true);
    const facts = r.body.drills.find((d) => d.id === 'facts');
    expect(facts.focusable.books).toContain('mul');
    expect(facts.settings.huddle.secondsPerPlay).toContain(10);
  });

  test('a wrong code is a 404, a bad name a 400', async () => {
    expect((await req.post('/api/live-drill/play/join').send({ code: 'ZZZZZZ', name: 'A' })).status).toBe(404);
    const g = await host();
    expect((await req.post('/api/live-drill/play/join').send({ code: g.code, name: '' })).status).toBe(400);
  });

  test('a drive, end to end: join, kick off, play, grade, final', async () => {
    const g = await host();
    const p = await join(g.code.toLowerCase(), 'Ana R.');
    const tok = { 'X-Live-Drill-Token': p.token };

    expect((await req.get(`/api/live-drill/play/${g.code}/state`)).status).toBe(401);
    expect((await req.get(`/api/live-drill/play/${g.code}/play`).set(tok)).status).toBe(409); // lobby

    const started = await req.post(`/api/live-drill/host/games/${g.code}/start`);
    expect(started.body.phase).toBe('live');

    const play = await req.get(`/api/live-drill/play/${g.code}/play`).set(tok);
    expect(play.status).toBe(200);
    expect(play.body.n).toBe(1);
    expect(play.body.play.answer).toBeUndefined();
    expect(play.headers['cache-control']).toBe('no-store');

    const answer = G.playAt(G.getGame(g.code), 1).answer;
    const r = await req.post(`/api/live-drill/play/${g.code}/answer`).set(tok).send({ n: 1, k: answer });
    expect(r.body).toMatchObject({ ok: true, gain: 15, answer });
    expect((await req.post(`/api/live-drill/play/${g.code}/answer`).set(tok).send({ n: 1, k: answer })).status).toBe(409);

    const end = await req.post(`/api/live-drill/host/games/${g.code}/end`);
    expect(end.body.phase).toBe('over');
    expect(end.body.final.mvps[0][0]).toMatchObject({ name: 'Ana R.', yards: 15 });
    const mine = await req.get(`/api/live-drill/play/${g.code}/state`).set(tok);
    expect(mine.body.me).toMatchObject({ comp: 1, att: 1 });
  });

  test('a huddle, end to end: the teacher reveals, the student sees how they did', async () => {
    const g = await host({ drill: 'geometry', playbook: 'all', mode: 'huddle', plays: 5 });
    const p = await join(g.code, 'Ben');
    const tok = { 'X-Live-Drill-Token': p.token };
    await req.post(`/api/live-drill/host/games/${g.code}/start`);
    const open = await req.get(`/api/live-drill/play/${g.code}/state`).set(tok);
    expect(open.body.round.n).toBe(1);
    expect(open.body.round.answer).toBeUndefined();
    const k = open.body.round.play.choices[0].k;
    expect((await req.post(`/api/live-drill/play/${g.code}/answer`).set(tok).send({ n: 1, k })).body).toEqual({ locked: true, n: 1 });
    const revealed = await req.get(`/api/live-drill/play/${g.code}/state`).set(tok); // only player → closes at once
    expect(revealed.body.phase).toBe('reveal');
    expect(revealed.body.round.mine.k).toBe(k);
    expect(revealed.body.round.tell).toBeTruthy();
    const next = await req.post(`/api/live-drill/host/games/${g.code}/advance`);
    expect(next.body.round.n).toBe(2);
  });

  test('a game belongs to the teacher who hosted it', async () => {
    const g = await host();
    const other = await req.get(`/api/live-drill/host/games/${g.code}`).set('X-Test-User', 'teacher-2');
    expect(other.status).toBe(404);
    expect((await req.post(`/api/live-drill/host/games/${g.code}/start`).set('X-Test-User', 'teacher-2')).status).toBe(404);
  });

  test('the teacher can move and remove names in the lobby', async () => {
    const g = await host();
    const p = await join(g.code, 'Kid');
    const moved = await req.post(`/api/live-drill/host/games/${g.code}/players/${p.playerId}/team`).send({ team: 1 });
    expect(moved.body.players[0].team).toBe(1);
    await req.post(`/api/live-drill/host/games/${g.code}/players/${p.playerId}/kick`);
    expect((await req.get(`/api/live-drill/play/${g.code}/state`).set('X-Live-Drill-Token', p.token)).status).toBe(401);
  });
});

describe('class games, the chat banner and run it back', () => {
  const req = supertest(makeApp());
  const asMarcus = { 'X-Test-Student': 'stu-marcus' };

  test('the host picks from their own classes, and only those', async () => {
    const r = await req.get('/api/live-drill/host/classes');
    expect(r.body.classes).toEqual([{ id: 'class-1', name: 'Algebra 1 · P3', students: 1 }]);
    const theirs = await req.post('/api/live-drill/host/games').send({ drill: 'algebra', mode: 'drive', classId: 'class-2' });
    expect(theirs.status).toBe(404);
  });

  test('a class game shows on an enrolled student’s chat screen, and nowhere else', async () => {
    expect((await req.get('/api/live-drill/mine').set(asMarcus)).body).toEqual({ student: true, name: 'Marcus T.', games: [] });
    const g = (await req.post('/api/live-drill/host/games').send({ drill: 'algebra', mode: 'huddle', classId: 'class-1' })).body;
    expect(g.className).toBe('Algebra 1 · P3');

    const mine = await req.get('/api/live-drill/mine').set(asMarcus);
    expect(mine.headers['cache-control']).toBe('no-store');
    expect(mine.body.games).toEqual([expect.objectContaining({ code: g.code, className: 'Algebra 1 · P3', mode: 'huddle' })]);
    expect((await req.get('/api/live-drill/mine').set({ 'X-Test-Student': 'stu-other' })).body.games).toEqual([]);
    expect((await req.get('/api/live-drill/mine')).body).toEqual({ student: false, name: null, games: [] }); // a teacher
  });

  test('a signed-in student joins with their account name, once, from any device', async () => {
    const g = (await req.post('/api/live-drill/host/games').send({ drill: 'geometry', mode: 'drive', classId: 'class-1' })).body;
    const first = await req.post('/api/live-drill/mine/join').set(asMarcus).send({ code: g.code });
    expect(first.status).toBe(201);
    expect(first.body.name).toBe('Marcus T.');
    const second = await req.post('/api/live-drill/mine/join').set(asMarcus).send({ code: g.code.toLowerCase() });
    expect(second.body.playerId).toBe(first.body.playerId);
    const host = await req.get(`/api/live-drill/host/games/${g.code}`);
    expect(host.body.players).toEqual([expect.objectContaining({ name: 'Marcus T.', linked: true })]);
    // the token it hands back drives the public player routes like any other
    expect((await req.get(`/api/live-drill/play/${g.code}/state`).set('X-Live-Drill-Token', second.body.token)).body.me.name).toBe('Marcus T.');
    // a teacher signed in on the same browser gets the name form instead
    expect((await req.post('/api/live-drill/mine/join').send({ code: g.code })).status).toBe(403);
  });

  test('the lobby serves a QR code image, to the host only', async () => {
    const g = (await req.post('/api/live-drill/host/games').send({ drill: 'algebra', mode: 'drive' })).body;
    const r = await req.get(`/api/live-drill/host/games/${g.code}/qr.svg`).buffer(true).parse((res, cb) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => cb(null, d));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(r.body).toMatch(/^<svg/);
    expect((await req.get(`/api/live-drill/host/games/${g.code}/qr.svg`).set('X-Test-User', 'teacher-2')).status).toBe(404);
  });

  test('run it back keeps the code and every seat', async () => {
    const g = (await req.post('/api/live-drill/host/games').send({ drill: 'algebra', mode: 'drive' })).body;
    const p = (await req.post('/api/live-drill/play/join').send({ code: g.code, name: 'Ana' })).body;
    await req.post(`/api/live-drill/host/games/${g.code}/start`);
    expect((await req.post(`/api/live-drill/host/games/${g.code}/rematch`)).status).toBe(409);
    await req.post(`/api/live-drill/host/games/${g.code}/end`);
    const again = await req.post(`/api/live-drill/host/games/${g.code}/rematch`);
    expect(again.body).toMatchObject({ code: g.code, phase: 'lobby', gameNumber: 2 });
    expect((await req.get(`/api/live-drill/play/${g.code}/state`).set('X-Live-Drill-Token', p.token)).body.phase).toBe('lobby');
  });
});

describe('solo practice (/drill/<hub>)', () => {
  const req = supertest(makeApp());

  test('a hub lists its games with playbooks, clock and scoring — no account needed', async () => {
    const r = await req.get('/api/live-drill/solo/hubs/algebra');
    expect(r.status).toBe(200);
    expect(r.body.games.map((g) => g.drill)).toEqual(['algebra', 'alg1m3', 'alg1m7', 'alg1m8', 'alg1m9', 'alg1m10', 'alg1m11', 'alg1m12', 'facts']);
    const facts = r.body.games.find((g) => g.drill === 'facts');
    expect(facts.typed).toBe(true);
    expect(facts.scoring).toEqual({ gains: [6, 4, 2], withinMs: [3000, 6000], miss: 2 });
    expect(r.body.hubs.map((h) => h.id)).toEqual(['algebra', 'geometry']);
    expect((await req.get('/api/live-drill/solo/hubs')).body.hubs).toHaveLength(2);
  });

  test('an unknown hub is a 404, prototype names included', async () => {
    for (const h of ['calculus', 'constructor', '__proto__', 'toString']) {
      expect((await req.get(`/api/live-drill/solo/hubs/${h}`)).status).toBe(404);
    }
  });

  test('plays come whole (answer and tell) and page two continues page one', async () => {
    const q = '/api/live-drill/solo/plays?drill=hgeo3&book=coord&seed=Abc12345';
    const a = await req.get(`${q}&from=0`);
    expect(a.status).toBe(200);
    expect(a.body.plays).toHaveLength(40);
    expect(a.body.plays.every((p) => p.answer != null && p.tell && p.revealCard && p.playbook === 'coord')).toBe(true);
    const b = await req.get(`${q}&from=30`);
    expect(b.body.plays.slice(0, 10).map((p) => p.card)).toEqual(a.body.plays.slice(30).map((p) => p.card));
  });

  test('Math Facts takes a focus — every fact has one of the numbers — and nothing else does', async () => {
    const hub = await req.get('/api/live-drill/solo/hubs/algebra');
    expect(hub.body.games.find((g) => g.drill === 'facts').focusable.books).toEqual(['all', 'add', 'sub', 'mul', 'div']);
    expect(hub.body.games.find((g) => g.drill === 'alg1m3').focusable).toBeUndefined();
    const r = await req.get('/api/live-drill/solo/plays?drill=facts&book=mul&seed=Abc12345&focus=2,5,10');
    expect(r.body.plays.every((p) => [p.fact.a, p.fact.b].some((n) => [2, 5, 10].includes(n)))).toBe(true);
    // junk in the list is dropped, not an error; a focus on a playbook that can't take one is ignored
    const j = await req.get('/api/live-drill/solo/plays?drill=facts&book=mul&seed=Abc12345&focus=7,x,99');
    expect(j.body.plays.every((p) => [p.fact.a, p.fact.b].includes(7))).toBe(true);
    const sq = await req.get('/api/live-drill/solo/plays?drill=facts&book=sq&seed=Abc12345&focus=7');
    const plain = await req.get('/api/live-drill/solo/plays?drill=facts&book=sq&seed=Abc12345');
    expect(sq.body.plays.map((p) => p.card)).toEqual(plain.body.plays.map((p) => p.card));
  });

  test('only hub games, a sane seed and a bounded position are dealt', async () => {
    const bad = ['drill=nope&seed=Abc12345', 'drill=facts&seed=short', 'drill=facts&seed=bad%20seed%21', 'drill=facts&seed=Abc12345&from=-1',
      'drill=facts&seed=Abc12345&from=1e9', 'drill=facts&seed=Abc12345&from=2.5'];
    for (const q of bad) expect((await req.get(`/api/live-drill/solo/plays?${q}`)).status).toBe(400);
    // an unknown playbook falls back to the whole bank rather than failing
    expect((await req.get('/api/live-drill/solo/plays?drill=facts&book=zzz&seed=Abc12345')).status).toBe(200);
  });
});

describe('app wiring', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../../config/routes.js'), 'utf8');

  test('the player router is mounted before the /api isAuthenticated catch-alls', () => {
    const code = routes.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n'); // comments mention the catch-all too
    const mount = code.indexOf("app.use('/api/live-drill/play'");
    const catchAll = code.indexOf("app.use('/api', isAuthenticated");
    expect(mount).toBeGreaterThan(0);
    expect(catchAll).toBeGreaterThan(0);
    expect(mount).toBeLessThan(catchAll);
    expect(routes).toMatch(/app\.use\('\/api\/live-drill\/host', isAuthenticated, isTeacher,/);
    // solo practice is public too: same rule
    const solo = code.indexOf("app.use('/api/live-drill/solo'");
    expect(solo).toBeGreaterThan(0);
    expect(solo).toBeLessThan(catchAll);
    expect(routes).toMatch(/app\.get\(\['\/drill', '\/drill\/:hub'\]/);
  });

  test('the Fact Fluency page is teacher-only, like the data behind it', () => {
    expect(routes).toMatch(/app\.get\(\['\/fact-fluency', '\/fact-fluency\.html'\], isAuthenticated, isTeacher,/);
  });

  test('player calls skip the global limiter; host calls do not', () => {
    expect(isLiveDrillPlayPath('/live-drill/play/join')).toBe(true);
    expect(isLiveDrillPlayPath('/live-drill/play/ABC123/answer')).toBe(true);
    expect(isLiveDrillPlayPath('/live-drill/host/games')).toBe(false);
    expect(isLiveDrillPlayPath('/live-drill/solo/plays')).toBe(true);
    expect(isLiveDrillPlayPath('/live-drill/solo/hubs/algebra')).toBe(true);
    const mw = fs.readFileSync(path.join(__dirname, '../../config/middleware.js'), 'utf8');
    expect(mw).toMatch(/isLiveDrillPlayPath\(req\.path\)/);
  });

  test('the signed-in student router requires a session and is NOT CSRF-exempt', () => {
    expect(routes).toMatch(/app\.use\('\/api\/live-drill\/mine', isAuthenticated,/);
    const csrf = fs.readFileSync(path.join(__dirname, '../../middleware/csrf.js'), 'utf8');
    expect(csrf).not.toMatch(/'\/api\/live-drill\/mine'/);
    expect(isLiveDrillPlayPath('/live-drill/mine/join')).toBe(false);
    // The banner's poll is exempt from the global limiter (exact path — the join is not).
    const mw = fs.readFileSync(path.join(__dirname, '../../config/middleware.js'), 'utf8');
    expect(mw).toMatch(/'\/live-drill\/mine',/);
  });

  test('the chat screen loads the banner, outside the bundles', () => {
    const chat = fs.readFileSync(path.join(__dirname, '../../public/chat.html'), 'utf8');
    expect(chat).toMatch(/<script defer src="\/js\/live-drill\/chat-banner\.js/);
  });

  test('the student page never uses csrfFetch (its 401 would send a guest to the login page)', () => {
    const play = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/play.js'), 'utf8');
    expect(play).not.toMatch(/csrfFetch\(/);
    expect(play).toMatch(/addCsrfToken\(/);
  });

  test('player calls are CSRF-exempt; host calls are not', () => {
    const csrf = fs.readFileSync(path.join(__dirname, '../../middleware/csrf.js'), 'utf8');
    expect(csrf).toMatch(/'\/api\/live-drill\/play'/);
    expect(csrf).not.toMatch(/'\/api\/live-drill\/host'/);
  });
});
