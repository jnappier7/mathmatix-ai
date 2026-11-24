/**
 * PHONES: THE DESK BECOMES THE BOARD (2026-11-24).
 *
 * On a phone, while a problem is in focus, the work dock is pinned at the top
 * of the screen where the tutor's card was, and the conversation scrolls
 * beneath it. Owner's three requirements, each of which fails silently (a
 * layout bug throws nothing):
 *   1. steps are the common case — the board is sized for them, and the tile
 *      mat (rare) gets more room only when it is on the card;
 *   2. the board is CAPPED and scrolls inside itself — it must never push the
 *      composer off the screen however long the solve;
 *   3. with the keyboard up the board stays on screen, above the typing.
 * The geometry itself is checked by eye in headless Chromium (two phone sizes,
 * a 7-step solve, a simulated keyboard); this pins the rules that produce it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const css = read('public', 'css', 'living-workspace.css');
const js = read('public', 'js', 'living-workspace', 'chat-workspace.js');
const view = read('public', 'js', 'living-workspace', 'dom', 'derivationView.js');

// The phone block: from its banner to the end of the file.
const at = css.indexOf('PHONES: THE DESK BECOMES THE BOARD');
// Rules only — the comments describe the classes at length.
const block = css.slice(css.indexOf('*/', at) + 2).replace(/\/\*[\s\S]*?\*\//g, '');
const media = block.slice(block.indexOf('@media (max-width: 768px)'));

describe('the board takes the tutor\'s place on a phone', () => {
  test('the block exists and everything that moves is inside the phone media query', () => {
    expect(at).toBeGreaterThan(-1);
    expect(media.length).toBeGreaterThan(500);
    // Outside the media query the only board-up rule allowed is "the face is
    // hidden" — a desktop must not move by a pixel.
    const before = block.slice(0, block.indexOf('@media (max-width: 768px)'));
    expect(before).not.toMatch(/mm-board-up/);
    expect(before).toMatch(/\.lws-dock-face\s*\{\s*display:\s*none/);
    // …and nothing earlier in the sheet knows the class at all.
    expect(css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/mm-board-up|mm-board-kb/);
    // The file ends by closing that media block.
    expect(css.trimEnd().endsWith('}')).toBe(true);
  });

  test('the dock goes first in the column and the tutor steps aside', () => {
    expect(media).toMatch(/mm-board-up:not\(\.cr-voice\) \.cr-tutor-hero\s*\{\s*display:\s*none\s*!important/);
    const dock = media.match(/mm-board-up:not\(\.cr-voice\) \.cr-work-dock\s*\{[^}]*\}/);
    expect(dock).not.toBeNull();
    expect(dock[0]).toMatch(/order:\s*-1/);
    // Rigid: a board that shrinks when the conversation grows hides its own lines.
    expect(dock[0]).toMatch(/flex:\s*0 0 auto/);
    // It paints its own opaque ground (CLAUDE.md: inline workspace surfaces must).
    expect(dock[0]).toMatch(/background:\s*var\(--mlt-surface,\s*#FFFFFF\)/);
  });

  test('voice mode is left alone', () => {
    const rules = media.match(/[^{}]*mm-board-up[^{}]*\{/g) || [];
    expect(rules.length).toBeGreaterThan(10);
    rules.forEach((r) => expect(r).toMatch(/:not\(\.cr-voice\)/));
  });

  test('chat-workspace.js says WHEN: body.mm-board-up follows the dock having work', () => {
    expect(js).toMatch(/function watchBoardUp\(/);
    expect(js).toMatch(/classList\.toggle\('mm-board-up', up\)/);
    expect(js).toMatch(/classList\.contains\('is-empty'\)/);
    expect(js).toMatch(/watchBoardUp\(dv && dv\.el && dv\.el\.root\)/);
    // The tutor's face rides on the board's bar.
    expect(js).toMatch(/lws-dock-face/);
  });
});

describe('capped, and it scrolls inside itself', () => {
  const dv = media.match(/mm-board-up:not\(\.cr-voice\) \.cr-work-dock \.lws-dv\s*\{[^}]*\}/);

  test('the steps view has a cap in px, in share of the screen, and against the column', () => {
    expect(dv).not.toBeNull();
    // Three terms: a share, an absolute, and what the column can spare. The
    // third is what keeps the composer on screen on a small phone.
    expect(dv[0]).toMatch(/max-height:\s*min\(38dvh,\s*300px,\s*calc\(100dvh - 440px\)\)/);
    // vh first for engines without dvh.
    expect(dv[0]).toMatch(/max-height:\s*min\(38vh,/);
  });

  test('it scrolls, and a swipe at its end does not drag the page', () => {
    expect(dv[0]).toMatch(/overflow-y:\s*auto/);
    expect(dv[0]).toMatch(/overscroll-behavior:\s*contain/);
  });

  test('tiles get more room ONLY when a tile mat is on the card', () => {
    const tiles = media.match(/\.cr-work-dock \.lws-dv:has\(\.lws-tm\)\s*\{[^}]*\}/);
    expect(tiles).not.toBeNull();
    expect(tiles[0]).toMatch(/max-height:\s*min\(58dvh,\s*480px,\s*calc\(100dvh - 386px\)\)/);
  });

  test('a block taller than the window is shown from its top, not its end', () => {
    const fn = view.slice(view.indexOf('DerivationView.prototype._scrollToEnd'));
    expect(fn.slice(0, 900)).toMatch(/offsetHeight <= s\.clientHeight/);
    expect(fn.slice(0, 900)).toMatch(/s\.scrollTop = Math\.max\(0, top\)/);
  });

  test('the tile mat takes the whole card width on a phone', () => {
    const small = css.slice(css.indexOf('@media (max-width: 520px)'), css.indexOf('@media (max-width: 520px)') + 1800);
    expect(small).toMatch(/\.lws-card-body > \.lws-step:has\(\.lws-tm\) > \.lws-step-spine\s*\{\s*display:\s*none/);
    expect(small).toMatch(/\.lws-tm-tray-tiles\s*\{\s*flex-wrap:\s*wrap/);
  });
});

describe('keyboard up: the board stays above the typing', () => {
  test('chat-workspace.js publishes the visible viewport and stamps mm-board-kb', () => {
    expect(js).toMatch(/function watchKeyboard\(/);
    expect(js).toMatch(/--mm-vv-top/);
    expect(js).toMatch(/--mm-vv-h/);
    expect(js).toMatch(/classList\.toggle\('mm-board-kb', up\)/);
    // A pinch-zoom shrinks the visual viewport too and must not read as a keyboard.
    expect(js).toMatch(/vv\.height \* \(vv\.scale \|\| 1\)/);
  });

  test('the keyboard test is a real drop in visible height, not a toolbar hiding', () => {
    const m = js.match(/function keyboardIsUp\(visibleH, tallestH\) \{ return ([^;]+); \}/);
    expect(m).not.toBeNull();
    const up = new Function('visibleH', 'tallestH', 'return ' + m[1]);
    expect(up(844, 844)).toBe(false);
    expect(up(760, 844)).toBe(false);   // the browser's bars coming and going
    expect(up(508, 844)).toBe(true);    // a keyboard
    expect(up(376, 667)).toBe(true);
  });

  test('the column is fitted to the visible part, only with the board up', () => {
    const rule = media.match(/mm-board-up\.mm-board-kb:not\(\.cr-voice\) #chat-container\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).toMatch(/top:\s*var\(--mm-vv-top, 0px\)\s*!important/);
    expect(rule[0]).toMatch(/height:\s*var\(--mm-vv-h, 100dvh\)\s*!important/);
    // Never keyed on the keyboard alone: without a board the page is as it was.
    (media.match(/[^{}]*mm-board-kb[^{}]*\{/g) || []).forEach((r) => {
      r.split(',').forEach((sel) => { if (/mm-board-kb/.test(sel)) expect(sel).toMatch(/mm-board-up/); });
    });
  });

  test('in that space the board is capped against the composer and the conversation keeps a line', () => {
    expect(media).toMatch(/max-height:\s*max\(72px,\s*min\(calc\(var\(--mm-vv-h, 100dvh\) \* 0\.42\),\s*calc\(var\(--mm-vv-h, 100dvh\) - var\(--mm-composer-h, 128px\) - 130px\)\)\)/);
    expect(media).toMatch(/mm-board-kb:not\(\.cr-voice\) #chat-messages-container\s*\{[^}]*min-height:\s*64px\s*!important/);
  });
});
