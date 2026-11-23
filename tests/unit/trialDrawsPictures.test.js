/**
 * The landing-page preview DRAWS the tutor's pictures (owner, 2026-11-23, on a
 * screenshot of the live page: the tutor said "notice the bars are split into
 * different numbers of pieces" and there were no bars — "Draw it").
 *
 * Until then routes/trialChat.js stripped every picture tag, because the page
 * had nothing to draw them with: the picture vanished and the sentence about
 * it stayed. Now the page loads the chat's own renderer on demand, and:
 *
 *   • the server keeps the tags that page can draw and strips the rest;
 *   • the tutor is told which those are, so it does not point at a picture it
 *     cannot put there;
 *   • the page holds the same list and never hands the renderer anything else;
 *   • read-aloud never speaks a tag.
 *
 * And the picture in the screenshot itself was broken everywhere: the fraction
 * comparison drew only the FIRST fraction, as one solid bar, with its decimal
 * value underneath.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

const fs = require('fs');
const path = require('path');

const { stripVisualDirectives, TRIAL_DRAWABLE } = require('../../routes/trialChat');
const { buildVisualDirective } = require('../../utils/pipeline/visualDirective');
const { fractionList } = require('../../public/js/visualTokenParser');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const KEEP = new Set(TRIAL_DRAWABLE);

describe('the server sends through what the page can draw, and nothing else', () => {
  test('a drawable picture stays in the reply, whole, nested brackets included', () => {
    const reply = 'Here they are:\n\n[FRACTION:compare=2/3,3/4]\n\nNotice the bars. [NUMBER_LINE:min=0,max=5,points=[1,2],label="L"]';
    expect(stripVisualDirectives(reply, KEEP)).toBe(reply);
  });

  test('everything else is still stripped — a raw tag never reaches the bubble', () => {
    const out = stripVisualDirectives('A [ALGEBRA_TILES:2x+3] B [GRAPH_3D:fn=x*y] C [DIAGRAM:triangle:a=3] D [OLD:x] E [SEARCH_IMAGE:query="q"] F', KEEP);
    expect(out).not.toMatch(/\[[A-Z_]+:/);
    expect(out).toMatch(/^A\s+B\s+C\s+D\s+E\s+F$/);
  });

  test('display math is words, not a tag', () => {
    const reply = 'So \\[ x^2 - 4 \\] and [FRACTION:numerator=1,denominator=2]';
    expect(stripVisualDirectives(reply, KEEP)).toBe(reply);
  });

  test('with no list, every tag goes — read-aloud uses this and must never speak one', () => {
    expect(stripVisualDirectives('Look: [FRACTION:compare=2/3,3/4] see?')).toBe('Look:  see?');
    const src = read('routes/trialChat.js');
    expect(src).toMatch(/let cleaned = stripVisualDirectives\(text\);/);
  });

  test('pictures that print a computed result are not on the list', () => {
    for (const name of ['AREA_MODEL', 'PYTHAGOREAN', 'RIGHT_TRIANGLE', 'ALGEBRA_TILES', 'MULTI_REP', 'GRAPH_3D', 'DIAGRAM', 'SEARCH_IMAGE']) {
      expect(KEEP.has(name)).toBe(false);
    }
    expect(KEEP.has('FRACTION')).toBe(true);
    expect(KEEP.has('NUMBER_LINE')).toBe(true);
    expect(KEEP.has('FUNCTION_GRAPH')).toBe(true);
  });
});

describe('the tutor is told what this page draws', () => {
  test('the trial prompt names the tags and forbids pointing at anything else', () => {
    const src = read('routes/trialChat.js');
    expect(src).toMatch(/--- PICTURES ON THIS PAGE ---/);
    expect(src).toMatch(/NEVER mention a picture, graph, bars or diagram unless you wrote one of those tags/);
    expect(src).toMatch(/drawableVisuals: TRIAL_DRAWABLE/);
  });

  test('a topic whose pictures this page cannot draw is not asked for', () => {
    // factoring → [TILES:...] only
    expect(buildVisualDirective({ action: 'x', studentText: 'factor x^2 + 5x + 6', drawable: TRIAL_DRAWABLE })).toBeNull();
    // …but is, where everything draws
    expect(buildVisualDirective({ action: 'x', studentText: 'factor x^2 + 5x + 6' })).toMatch(/TILES/);
  });

  test('a topic it can draw is asked for, with the limit stated', () => {
    const d = buildVisualDirective({ action: 'x', studentText: 'which is bigger, 2/3 or 3/4?', drawable: TRIAL_DRAWABLE });
    expect(d).toContain('[FRACTION:compare=');
    expect(d).toMatch(/On THIS page only these tags draw/);
    expect(d).toMatch(/never refer to a picture you did not draw/);
  });

  test('the signed-in chat is asked exactly as before', () => {
    const d = buildVisualDirective({ action: 'x', studentText: 'which is bigger, 2/3 or 3/4?' });
    expect(d).toContain('[FRACTION:compare=');
    expect(d).not.toMatch(/On THIS page/);
  });
});

describe('the page', () => {
  const landing = read('public/js/landing.js');

  test('holds the SAME list as the server', () => {
    const block = landing.match(/var TRIAL_DRAWABLE = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const names = block[1].match(/'([A-Z_]+)'/g).map(s => s.slice(1, -1));
    expect(names.slice().sort()).toEqual(TRIAL_DRAWABLE.slice().sort());
  });

  test('draws with the chat\'s own renderer, fetched on demand', () => {
    expect(landing).toMatch(/\/js\/inlineChatVisuals\.js/);
    expect(landing).toMatch(/\/js\/visualTokenParser\.js/);
    expect(landing).toMatch(/\/js\/mathGraph\.js/);
    expect(landing).toMatch(/window\.inlineChatVisuals\.processMessage\(slot\.tag\)/);
    // not in the page's own <head>: nothing is paid for until the chat opens
    expect(read('public/index.html')).not.toMatch(/inlineChatVisuals\.js/);
  });

  test('a tag that will not draw leaves no slot and no raw text', () => {
    expect(landing).toMatch(/TRIAL_DRAWABLE\.indexOf\(name\) !== -1/);
    expect(landing).toMatch(/slot\.el\.parentNode\.removeChild\(slot\.el\)/);
  });

  test('index.html serves the new script and stylesheet', () => {
    const html = read('public/index.html');
    expect(html).toMatch(/landing\.js\?v=8/);
    expect(html).toMatch(/landing-page\.css\?v=10/);
  });
});

describe('the fraction comparison is every fraction the tutor named, as bars', () => {
  test('the whole list is read — the comma used to end it at the first fraction', () => {
    expect(fractionList('compare=2/3,3/4')).toEqual([{ num: 2, denom: 3 }, { num: 3, denom: 4 }]);
    expect(fractionList('compare="1/2, 3/4, 5/8"')).toEqual([{ num: 1, denom: 2 }, { num: 3, denom: 4 }, { num: 5, denom: 8 }]);
    expect(fractionList('compare=[2/3,3/4],title="T"')).toHaveLength(2);
    expect(fractionList('compare=2/3,3/4,type=bar')).toHaveLength(2);
    expect(fractionList('compare=3/4')).toEqual([{ num: 3, denom: 4 }]);
  });

  test('what a bar cannot show draws nothing, never part of the list', () => {
    expect(fractionList('compare=5/3,1/2')).toEqual([]);          // more than one whole
    expect(fractionList('compare=2/3,x/4')).toEqual([]);          // not a number
    expect(fractionList('compare=1/2,1/0')).toEqual([]);
    expect(fractionList('compare=1/2,1/25')).toEqual([]);         // 25 slivers
    expect(fractionList('compare=1/2,1/3,1/4,1/5,1/6')).toEqual([]);
    expect(fractionList('numerator=3,denominator=4')).toEqual([]);
    expect(fractionList('')).toEqual([]);
  });

  test('the picture is cut bars with no decimal and no verdict', () => {
    const src = read('public/js/inlineChatVisuals.js');
    const at = src.indexOf('    createFractionComparison(paramStr, id) {');
    const fn = src.slice(at, src.indexOf('// PIE CHART', at));
    expect(at).toBeGreaterThan(0);
    expect(fn).toMatch(/VTP\.fractionList\(paramStr\)/);
    expect(fn).toMatch(/for \(let i = 0; i < f\.denom; i\+\+\)/);    // one piece per part
    expect(fn).not.toMatch(/toFixed\(3\)|icv-fraction-decimal/);       // the decimal WAS the answer
    expect(src).toMatch(/return this\.createFractionComparison\(paramStr, id\);/);
  });
});
