/**
 * Solo practice (utils/liveDrill/solo.js + public/js/live-drill/solo.js): the hubs point at real
 * banks, and the page grades a typed answer exactly the way the live game does — the page keeps
 * its own copy of facts.normalizeTyped (it runs in the browser), so this pins the two together.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DRILLS, listPlaybooks } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const facts = require('../../utils/liveDrill/facts');

describe('hubs', () => {
  test('every hub game is a Live Drill bank with playbooks and a clock', () => {
    for (const id of Object.keys(solo.HUBS)) {
      const v = solo.hubView(id);
      expect(v.games.length).toBeGreaterThan(0);
      for (const g of v.games) {
        expect(DRILLS[g.drill]).toBeTruthy();
        expect(g.playbooks).toEqual(listPlaybooks(g.drill));
        expect(g.clock.seconds).toContain(g.clock.defaultSeconds);
        expect(g.scoring.gains).toHaveLength(3);
      }
    }
  });

  test('a round never deals past the cap, and a deal is the same for the same seed', () => {
    expect(solo.parseDeal({ drill: 'facts', seed: 'Abc12345', from: String(solo.MAX_PLAY - solo.BATCH) }).error).toBeUndefined();
    expect(solo.parseDeal({ drill: 'facts', seed: 'Abc12345', from: String(solo.MAX_PLAY - solo.BATCH + 1) }).error).toBeTruthy();
    const a = solo.deal('alg1m3', 'all', 'Abc12345', 0, 12);
    const b = solo.deal('alg1m3', 'all', 'Abc12345', 0, 12);
    expect(a.map((p) => p.card)).toEqual(b.map((p) => p.card));
  });
});

describe('a class finds its drill hub', () => {
  test.each([
    [['Honors Geometry', 'P3'], 'geometry'],
    [[null, 'Algebra 1'], 'algebra'],
    [['Algebra-based Geometry'], 'geometry'],
    [['algebra', 'Geometry'], 'geometry'],
    [['Pre-Calculus'], null],
    [[], null],
  ])('%j → %s', (labels, hub) => {
    expect(solo.hubFor(...labels)).toBe(hub);
    if (hub) expect(solo.hubList().map((h) => h.id)).toContain(hub);
  });
});

describe('the page grades typed answers like the game', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/solo.js'), 'utf8');
  const fn = /\n {2}function normalizeTyped\(raw\) \{[\s\S]*?\n {2}\}\n/.exec(src);
  const pageNormalize = vm.runInNewContext(`(${fn[0].trim()})`);

  test.each(['12', ' 12 ', '-7', '−7', '–7', '0', '-0', '007', '1 2', '12a', '', '3.5', '123456', '+4', null])('%p', (raw) => {
    expect(pageNormalize(raw)).toBe(facts.normalizeTyped(raw));
  });
});

describe('sound on the solo page', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/drill.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/solo.js'), 'utf8');

  test('the page loads the sound module in the solo profile: muted by default, crowd off, its own keys, cheers follow Sound', () => {
    const cfg = html.match(/window\.LiveDrillSoundConfig = (\{[^}]*\})/);
    expect(cfg).toBeTruthy();
    expect(new Function(`return ${cfg[1]}`)()).toEqual({ defaultMuted: true, defaultCrowd: false, storagePrefix: 'mm-drill-solo', cheersFollowCrowd: false });
    const order = ['live-drill/common.js', 'LiveDrillSoundConfig', 'live-drill/sound.js', 'live-drill/solo.js'].map((m) => html.indexOf(m));
    expect(order).toEqual([...order].sort((a, b) => a - b)); // config before the module, module before the page
    expect(html).toMatch(/id="snd"[^>]*aria-pressed="true"/); // the button starts in its muted state
  });

  test('the cues are the ones a solo round earns: start, last five seconds, every 3rd in a row, the end, a best', () => {
    expect(js).toMatch(/SND\.whistle\(\)/);
    expect(js).toMatch(/SND\.tick\(sec === 1\)/);
    expect(js).toMatch(/r\.streak % STREAK_EVERY === 0/);
    expect(js).toMatch(/SND\.buzzer\(\)/);
    expect(js).toMatch(/if \(isBest\) setTimeout\(\(\) => SND\.cheer\(true\)/);
    // and nothing plays on an ordinary right or wrong answer
    expect(js).not.toMatch(/SND\.horn/);
    expect(js).not.toMatch(/SND\.groan/);
  });
});

