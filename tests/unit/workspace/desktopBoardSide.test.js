/**
 * DESKTOP: THE BOARD HANGS UNDER THE TUTOR (2026-11-24).
 *
 * On a wide screen, while a problem is in focus, the work dock moves out of
 * the chat column into the tutor's column: the tutor's card shortens to a
 * strip, the board takes the rest of that column, and the conversation keeps
 * the whole chat column. (Above the composer, three steps left the
 * conversation one bubble at 1366x800.) With no work, everything is exactly as
 * it was.
 *
 * Every way this breaks is silent — a board moved into a hidden column, or a
 * tutor column that stays stripped after the work is gone, throws nothing.
 * The geometry is checked by eye in headless Chromium; this pins the rule that
 * decides WHEN and the CSS that makes it safe.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const css = read('public', 'css', 'living-workspace.css');
const js = read('public', 'js', 'living-workspace', 'chat-workspace.js');
const html = read('public', 'chat.html');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const at = css.indexOf('DESKTOP: THE BOARD HANGS UNDER THE TUTOR');
const block = strip(css.slice(css.indexOf('*/', at) + 2));

describe('when the board goes to the tutor\'s side', () => {
  const m = js.match(/function wantsSide\(up, wide, voice, tutorHidden\) \{ return ([^;]+); \}/);
  const wantsSide = m && new Function('up', 'wide', 'voice', 'tutorHidden', 'return ' + m[1]);

  test('the rule exists and is the one placeDock uses', () => {
    expect(m).not.toBeNull();
    expect(js).toMatch(/var side = wantsSide\(up, !!\(mq && mq\.matches\), body\.contains\('cr-voice'\), body\.contains\('cr-hero-min'\)\)/);
    expect(js).toMatch(/var SIDE_MQ = '\(min-width: 1100px\)'/);
  });

  test('only with work on the board — it disappears when not in use', () => {
    expect(wantsSide(true, true, false, false)).toBe(true);
    expect(wantsSide(false, true, false, false)).toBe(false);
  });

  test('never on a narrow window, in voice mode, or with the tutor\'s column minimized', () => {
    expect(wantsSide(true, false, false, false)).toBe(false);
    expect(wantsSide(true, true, true, false)).toBe(false);
    // A board moved into a hidden column would be work nobody can see.
    expect(wantsSide(true, true, false, true)).toBe(false);
  });

  test('the dock moves next to the tutor, and goes HOME above the composer', () => {
    const fn = js.slice(js.indexOf('function placeDock('), js.indexOf('function watchBoardUp('));
    expect(fn).toMatch(/else if \(side\) col\.insertBefore\(slot, hero\.nextSibling\)/);
    expect(fn).toMatch(/else home\.parentNode\.insertBefore\(slot, home\)/);
    // It only moves when where it IS differs from where it belongs.
    expect(fn).toMatch(/var to = stage \? document\.body : \(side \? col : home\.parentNode\)/);
    expect(fn).toMatch(/if \(was !== to\) \{/);
    expect(fn).toMatch(/classList\.toggle\('mm-board-side', side\)/);
    // Home is where chat.html puts it: between the transcript and the composer.
    expect(html.indexOf('id="cr-work-dock"')).toBeGreaterThan(html.indexOf('id="chat-messages-container"'));
    expect(html.indexOf('id="input-container"')).toBeGreaterThan(html.indexOf('id="cr-work-dock"'));
  });

  test('it is re-decided when the board fills or empties, the window crosses the breakpoint, or the body\'s state changes', () => {
    const fn = js.slice(js.indexOf('function watchBoardUp('), js.indexOf('function keyboardIsUp('));
    expect(fn).toMatch(/if \(placeDock\(up\)\) settleThread\(\)/);
    expect(fn).toMatch(/mq\.addEventListener\('change', sync\)/);
    expect(fn).toMatch(/observe\(document\.body, \{ attributes: true, attributeFilter: \['class'\] \}\)/);
    // placeDock runs BEFORE the "nothing changed" return, or a resize with the
    // board already up would never move it.
    expect(fn.indexOf('placeDock(up)')).toBeLessThan(fn.indexOf('if (up === was) return'));
  });
});

describe('the layout, wide screens only', () => {
  test('every rule is inside the 1100px media query and keyed on the class the script sets', () => {
    expect(at).toBeGreaterThan(-1);
    expect(block.trimStart().startsWith('@media (min-width: 1100px)')).toBe(true);
    const rules = (block.match(/[^{}]+\{/g) || []).map((r) => r.trim()).filter((r) => !/^@|^from|^to/.test(r));
    expect(rules.length).toBeGreaterThan(12);
    rules.forEach((r) => expect(r).toMatch(/mm-board-side/));
    // Nothing outside this block knows the class: no work, no change.
    expect(strip(css.slice(0, at))).not.toMatch(/mm-board-side/);
  });

  test('the tutor shortens to a strip and the column holds only the tutor and the work', () => {
    expect(block).toMatch(/\.cr-hero-col > :not\(\.cr-tutor-hero\):not\(#cr-work-dock\)\s*\{\s*display:\s*none\s*!important/);
    expect(block).toMatch(/\.cr-hero-col \.cr-tutor-hero\s*\{[^}]*height:\s*150px/);
    // Wider than the tutor's usual column, never narrower than the student dragged it.
    expect(block).toMatch(/grid-template-columns:\s*max\(var\(--cr-hero-w, 320px\), clamp\(400px, 34vw, 480px\)\) minmax\(0, 1fr\)/);
  });

  test('the board fills the column, scrolls inside itself and paints its own ground', () => {
    const dock = block.match(/\.cr-hero-col > \.cr-work-dock\s*\{[^}]*\}/);
    expect(dock).not.toBeNull();
    expect(dock[0]).toMatch(/flex:\s*1 1 auto/);
    expect(dock[0]).toMatch(/background:\s*var\(--cr-bg-panel, #FFFFFF\)/);
    const dv = block.match(/mm-board-side \.cr-work-dock \.lws-dv\s*\{[^}]*\}/);
    expect(dv[0]).toMatch(/max-height:\s*none/);
    expect(dv[0]).toMatch(/overflow-y:\s*auto/);
    expect(dv[0]).toMatch(/overscroll-behavior:\s*contain/);
  });

  test('the arrival animation stands down for reduced motion', () => {
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*body\.mm-board-side \.cr-hero-col > \.cr-work-dock\s*\{\s*animation:\s*none/);
  });
});
