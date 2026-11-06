/**
 * Mathmatix Arcade (utils/liveDrill/arcade.js, /arcade): the one front door to every game.
 * What these pin: the catalogue names exactly the game types games.js plays (a fifth mode, or a
 * renamed one, shows up here or the page lies), every solo hub is on it with a working URL, every
 * practice test it links to is a page the server serves, and the page's scripts exist.
 */
const fs = require('fs');
const path = require('path');
const arcade = require('../../utils/liveDrill/arcade');
const solo = require('../../utils/liveDrill/solo');
const G = require('../../utils/liveDrill/games');

const ROOT = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the four game cards are exactly the modes the game plays, in the order a teacher meets them', () => {
  expect(arcade.GAMES.map((g) => g.id)).toEqual(['drive', 'huddle', 'hill', 'heist']);
  for (const g of arcade.GAMES) {
    expect(() => G.createGame({ hostId: `arc-${g.id}`, drill: 'geometry', playbook: 'all', mode: g.id })).not.toThrow();
    expect(g.name && g.tagline && g.how && g.icon && g.players).toBeTruthy();
  }
  G._reset();
});

test('the host page opens on the game a card names (/live-drill?mode=…) and offers every one', () => {
  const host = read('public/js/live-drill/host.js');
  expect(host).toMatch(/URLSearchParams\(location\.search\)\.get\('mode'\)/);
  const page = read('public/live-drill-host.html');
  for (const g of arcade.GAMES) expect(page).toContain(`id="m-${g.id}"`);
});

test('every solo hub is a card with its games and a URL the server routes', () => {
  const { hubs } = arcade.catalog();
  expect(hubs.map((h) => h.id)).toEqual(Object.keys(solo.HUBS));
  for (const h of hubs) {
    expect(h.url).toBe(`/drill/${h.id}`);
    expect(h.games.length).toBeGreaterThan(0);
  }
});

test('every practice test on the Arcade is a page the server serves, and the Arcade itself is routed', () => {
  const routes = read('config/routes.js');
  for (const t of arcade.TESTS) expect(routes).toContain(`'${t.url}'`);
  expect(routes).toMatch(/\['\/arcade', '\/games', '\/arcade\.html'\]/);
});

test('the page loads the scripts and styles it names, and the pages around it link back', () => {
  const html = read('public/arcade.html');
  for (const m of html.matchAll(/(?:src|href)="(\/(?:js|css)\/[^"?]+)/g)) expect(fs.existsSync(path.join(ROOT, 'public', m[1]))).toBe(true);
  for (const p of ['public/play.html', 'public/drill.html', 'public/live-drill-host.html', 'public/teacher-dashboard.html']) expect(read(p)).toContain('href="/arcade"');
  const js = read('public/js/live-drill/arcade.js');
  for (const g of arcade.GAMES) expect(js).toContain(`${g.icon}:`); // every card has its art
});
