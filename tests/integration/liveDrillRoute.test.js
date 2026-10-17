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
const fs = require('fs');
const path = require('path');
const express = require('express');
const supertest = require('supertest');
const G = require('../../utils/liveDrill/games');
const { hostRouter, playRouter, isLiveDrillPlayPath } = require('../../routes/liveDrill');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/live-drill/host', (req, _res, next) => { req.user = { _id: req.get('X-Test-User') || 'teacher-1' }; next(); }, hostRouter);
  app.use('/api/live-drill/play', playRouter);
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

  test('the setup lists both drills with their playbooks', async () => {
    const r = await req.get('/api/live-drill/host/drills');
    expect(r.status).toBe(200);
    expect(r.body.drills.map((d) => d.id)).toEqual(['algebra', 'geometry']);
    expect(r.body.drills.every((d) => d.playbooks.length > 1 && !d.unavailable)).toBe(true);
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
  });

  test('player calls skip the global limiter; host calls do not', () => {
    expect(isLiveDrillPlayPath('/live-drill/play/join')).toBe(true);
    expect(isLiveDrillPlayPath('/live-drill/play/ABC123/answer')).toBe(true);
    expect(isLiveDrillPlayPath('/live-drill/host/games')).toBe(false);
    const mw = fs.readFileSync(path.join(__dirname, '../../config/middleware.js'), 'utf8');
    expect(mw).toMatch(/isLiveDrillPlayPath\(req\.path\)/);
  });

  test('player calls are CSRF-exempt; host calls are not', () => {
    const csrf = fs.readFileSync(path.join(__dirname, '../../middleware/csrf.js'), 'utf8');
    expect(csrf).toMatch(/'\/api\/live-drill\/play'/);
    expect(csrf).not.toMatch(/'\/api\/live-drill\/host'/);
  });
});
