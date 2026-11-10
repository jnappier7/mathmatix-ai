/**
 * Math Morph (public/js/math-morph.js): how one line of a worked derivation is built from the
 * line above. The animation is only as honest as this matching — a term that "flies" must be a
 * term that was really there, and two unrelated equations must be left alone.
 */
const { lcsPairs, matchTokens, stepMs, MIN_SCORE } = require('../../public/js/math-morph');

const T = (s) => s.split(' ');
const texts = (pairs, a) => pairs.map(([i]) => a[i]);

describe('math morph: matching two lines', () => {
  test('what kept its order stays; the new number is fresh', () => {
    const a = T('2x = 26 − 10'); const b = T('2x = 16');
    const m = matchTokens(a, b);
    expect(texts(m.stay, a)).toEqual(['2x', '=']);
    expect(m.move).toEqual([]);
    expect(m.fresh.map((j) => b[j])).toEqual(['16']);
  });

  test('a term that changes sides is a MOVE, not a new glyph', () => {
    const a = T('2x + 10 = 26'); const b = T('2x = 26 − 10');
    const m = matchTokens(a, b);
    expect(texts(m.stay, a)).toEqual(['2x', '=', '26']);
    expect(m.move.map(([i, j]) => [a[i], b[j]])).toEqual([['10', '10']]);
    expect(m.fresh.map((j) => b[j])).toEqual(['−']); // the sign it picked up crossing over
  });

  test('every pair joins identical text, and no glyph is used twice', () => {
    const a = T('3 ( x + 2 ) = 3 x + 6'); const b = T('3 x + 6 = 3 x + 6');
    const m = matchTokens(a, b);
    const all = m.stay.concat(m.move);
    all.forEach(([i, j]) => expect(a[i]).toBe(b[j]));
    expect(new Set(all.map((p) => p[0])).size).toBe(all.length);
    expect(new Set(all.map((p) => p[1])).size).toBe(all.length);
    expect(all.length + m.fresh.length).toBe(b.length);
  });

  test('an operator never flies across the line on its own', () => {
    const m = matchTokens(T('+ 5 = x'), T('x = 5 +'));
    m.move.forEach(([i]) => expect(T('+ 5 = x')[i]).toMatch(/[0-9a-z]/));
  });

  test('related steps clear the bar; unrelated equations do not', () => {
    expect(matchTokens(T('2 x = 16'), T('x = 8')).score).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(matchTokens(T('2x + 10 = 26'), T('2x = 26 − 10')).score).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(matchTokens(T('A = π r ^ 2'), T('3 y − 7 < 11 + 4 z')).score).toBeLessThan(MIN_SCORE);
  });

  test('lcsPairs is order-preserving', () => {
    const p = lcsPairs(T('a b c d'), T('b d a c'));
    for (let k = 1; k < p.length; k++) { expect(p[k][0]).toBeGreaterThan(p[k - 1][0]); expect(p[k][1]).toBeGreaterThan(p[k - 1][1]); }
    expect(p.length).toBe(2);
  });

  test('a long derivation plays faster, so the whole thing stays near three seconds', () => {
    expect(stepMs(1)).toBe(760);
    expect(stepMs(4)).toBe(750);
    expect(stepMs(10)).toBe(420);
    expect(stepMs(6) * 6).toBeLessThanOrEqual(3100);
  });
});

describe('math morph: wiring', () => {
  const fs = require('fs'); const path = require('path');
  const pub = (p) => fs.readFileSync(path.join(__dirname, '../../public', p), 'utf8');
  test('chat.html loads it and the stream finalizer plays it, guarded', () => {
    expect(pub('chat.html')).toMatch(/<script defer src="\/js\/math-morph\.js/);
    expect(pub('js/script.js')).toMatch(/try \{ if \(window\.MathMorph\) window\.MathMorph\.play\(messageRef\.bubble\); \} catch/);
  });
  test('it honours reduced motion and never writes message content', () => {
    const src = pub('js/math-morph.js');
    expect(src).toMatch(/prefers-reduced-motion/);
    // the only text it ever sets is a ghost copy of an existing glyph and its own button label
    expect(src.match(/\.textContent = /g).length).toBe(3); // the style tag, a ghost, the button
    expect(src).not.toMatch(/innerHTML/);
  });
});
