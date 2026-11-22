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

test('the game cards are exactly the modes the game plays, in the order a teacher meets them', () => {
  expect(arcade.GAMES.map((g) => g.id)).toEqual(['drive', 'huddle', 'hill', 'heist', 'knockout']);
  for (const g of arcade.GAMES) {
    // (Knockout Arena builds its orbs from one operation's facts, so it plays the Math Facts bank only)
    expect(() => G.createGame({ hostId: `arc-${g.id}`, drill: g.id === 'knockout' ? 'facts' : 'geometry', playbook: 'all', mode: g.id })).not.toThrow();
    expect(g.name && g.tagline && g.how && g.icon && g.players).toBeTruthy();
  }
  G._reset();
});

test('the host page opens on the game a card names (/live-drill?mode=…) and draws its game tiles from this catalogue', () => {
  const host = read('public/js/live-drill/host.js');
  expect(host).toMatch(/URLSearchParams\(location\.search\)\.get\('mode'\)/);
  expect(host).toContain("fetch('/api/live-drill/solo/arcade'"); // one source of game names and taglines
  expect(host).toContain('id="m-${esc(g.id)}"'); // the tiles the ?mode= preselect lands on
  for (const g of arcade.GAMES) expect(host).toContain(`'${g.id}'`); // the preselect's allow-list knows every game
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

test('a student reaches the Arcade from the chat page (sidebar Tools, the More menu, the phone Practice tab) and the dashboard', () => {
  const chat = read('public/chat.html');
  expect(chat).toContain('id="sidebar-arcade-btn" class="sidebar-tool-btn"');
  expect(chat).toContain('id="more-arcade" href="/arcade"');
  // bottom-nav.js is loaded straight from source (not bundled): the Practice sheet's first action is the Arcade
  const nav = read('public/js/bottom-nav.js');
  expect(nav).toContain('id="mbn-arcade"');
  expect(nav).toContain("window.location.href = '/arcade'");
  expect(chat).toMatch(/bottom-nav\.js\?v=(?!4")/); // the cache-buster moved with the edit
  expect(read('public/student-dashboard.html')).toContain('href="/arcade" class="quick-action-btn');
});

test('the skill bank is on the Arcade and on the solo page, and the drill pages can render its TeX', () => {
  const arcade = read('public/arcade.html');
  expect(arcade).toContain('id="k-levels"'); // browse by level
  expect(arcade).toContain('id="q"'); // one search box: skills and course drills
  expect(read('public/js/live-drill/arcade.js')).toContain(`\${SOLO}/skills`);
  const drill = read('public/drill.html');
  expect(drill).toContain('id="bank"');
  expect(read('public/js/live-drill/solo.js')).toContain("const SKILLS = 'skills'");
  // the bank renders TeX server-side with KaTeX: every page that shows a play links its stylesheet
  for (const p of ['public/drill.html', 'public/play.html', 'public/live-drill-host.html']) expect(read(p)).toContain('/vendor/katex/katex.min.css');
  expect(fs.existsSync(path.join(ROOT, 'public/vendor/katex/katex.min.css'))).toBe(true);
  expect(read('config/routes.js')).toContain('liveDrillSolo.SKILLS_HUB'); // /drill/skills is routed to the solo page
});

test('the page loads the scripts and styles it names, and the pages around it link back', () => {
  const html = read('public/arcade.html');
  for (const m of html.matchAll(/(?:src|href)="(\/(?:js|css)\/[^"?]+)/g)) expect(fs.existsSync(path.join(ROOT, 'public', m[1]))).toBe(true);
  for (const p of ['public/play.html', 'public/drill.html', 'public/live-drill-host.html', 'public/teacher-dashboard.html']) expect(read(p)).toContain('href="/arcade"');
  const js = read('public/js/live-drill/arcade.js');
  for (const g of arcade.GAMES) expect(js).toContain(`${g.icon}:`); // every card has its art
});
