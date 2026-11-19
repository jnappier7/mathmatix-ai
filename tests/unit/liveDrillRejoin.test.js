/**
 * Back into a running Live Drill game (owner, 2026-11-19: "I accidentally exited out of the projector
 * screen and there was no obvious way to get back in. Maybe a Game in progress on the teacher page?").
 *
 * The list itself (GET /api/live-drill/host/games: own games only, live first, a finished one for half an
 * hour) is pinned end to end in tests/integration/liveDrillRoute.test.js. These are the source-level pins
 * on the three ways back, the way teacherClassesStrip.test.js pins the dashboard:
 *   - the host page offers every running game on its setup screen, and a ?code= link goes straight back;
 *   - the projector asks before it is closed while a game is on;
 *   - the dashboard's Today page shows a "Game in progress" card with a link back, and it is bundled.
 */
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

test('the host page lists the teacher\'s games on setup, and a ?code= link rejoins', () => {
  const src = read('public/js/live-drill/host.js');
  expect(read('public/live-drill-host.html')).toMatch(/id="resume"/);
  expect(src).toMatch(/api\('\/games'\)/); // the teacher's own list
  expect(src).toMatch(/Return to game/);
  expect(src).toMatch(/esc\(g\.code\)/); // listed text is escaped
  expect(src).toMatch(/URLSearchParams\(location\.search\)\.get\('code'\)/);
  expect(src).toMatch(/function rejoin\(code\)[\s\S]*connect\(st\.code\)[\s\S]*apply\(st\)/); // rejoin = the same stream + state as hosting
});

test('closing the projector while a game is on asks first', () => {
  expect(read('public/js/live-drill/host.js')).toMatch(/addEventListener\('beforeunload'[\s\S]{0,200}game\.phase === 'live' \|\| game\.phase === 'lobby'/);
});

test('the dashboard\'s Today page shows a Game in progress card that links back, and it is bundled', () => {
  const src = read('public/js/teacher-home.js');
  expect(src).toMatch(/id="td-games"/);
  expect(src).toMatch(/fetch\('\/api\/live-drill\/host\/games'/);
  expect(src).toMatch(/href="\/live-drill\?code=' \+ encodeURIComponent\(g\.code\)/);
  expect(src).toMatch(/esc\(g\.className\)/);
  expect(read('public/css/teacher-home.css')).toMatch(/\.td-games \{/);
  const m = JSON.parse(read('public/dist/page-bundles.manifest.json'))['teacher-dashboard.html'];
  expect(m.js.flatMap((b) => b.files).some((f) => f.startsWith('/js/teacher-home.js'))).toBe(true);
});
