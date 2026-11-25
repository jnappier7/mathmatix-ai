/**
 * The landing preview's pictures fail CLOSED without a sanitizer (QA on #1943,
 * 2026-11-25). Picture HTML is built from params the model wrote — a visitor
 * can steer those by prompt injection (label="<img onerror=…>") — and
 * sanitizeTrialVisual returned it untouched when DOMPurify was not on the
 * page. Now no sanitizer means no picture: the slot goes and the words stay.
 *
 * The DOM work runs in a spawned process (tests/helpers/trialVisualProbe.js),
 * which drives the page's real functions in jsdom.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const landing = fs.readFileSync(path.join(__dirname, '../../public/js/landing.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

let probe;
beforeAll(() => {
  probe = JSON.parse(execFileSync(process.execPath,
    [path.join(__dirname, '../helpers/trialVisualProbe.js')], { encoding: 'utf8', timeout: 30000 }));
});

describe.each(['absent', 'notTheLibrary'])('DOMPurify %s → no picture', (state) => {
  test('sanitizeTrialVisual returns nothing, never the raw HTML', () => {
    expect(probe[state].direct).toBe('');
  });

  test('no picture HTML is inserted: the slot is removed and nothing runs', () => {
    const r = probe[state];
    expect(r.slots).toBe(0);
    expect(r.pictures).toBe(0);
    expect(r.dangerous).toBe(0);
    expect(r.html).not.toMatch(/onerror|icv-container|<svg|<script/);
    expect(r.pwned).toBe(false);
    expect(r.initialized).toBe(0);
  });

  test('the words stay', () => {
    expect(probe[state].words).toEqual(['Look at the bars.', 'Which is longer?']);
  });
});

describe('with DOMPurify, the picture is what the sanitizer returns', () => {
  test('the renderer\'s HTML goes through it, html + svg profiles', () => {
    expect(probe.present.sanitizedInput).toHaveLength(2);       // the direct call + the reply's slot
    expect(probe.present.sanitizedInput[0]).toMatch(/onerror/);
    expect(probe.present.sanitizedProfiles[0]).toEqual(expect.arrayContaining(['html', 'svg']));
  });

  test('only the sanitized picture is inserted', () => {
    const r = probe.present;
    expect(r.slots).toBe(1);
    expect(r.pictures).toBe(1);
    expect(r.dangerous).toBe(0);
    expect(r.pwned).toBe(false);
    expect(r.initialized).toBe(1);
    expect(r.words).toEqual(['Look at the bars.', 'Which is longer?']);
  });
});

describe('the page still ships its sanitizer, and the new script', () => {
  test('DOMPurify is loaded locally, before landing.js', () => {
    const purify = indexHtml.indexOf('/vendor/dompurify/purify.min.js');
    const script = indexHtml.search(/\/js\/landing\.js\?v=\d+/);
    expect(purify).toBeGreaterThan(0);
    expect(script).toBeGreaterThan(purify);
  });

  test('landing.js is cache-busted past the version that failed open', () => {
    expect(Number(indexHtml.match(/landing\.js\?v=(\d+)/)[1])).toBeGreaterThanOrEqual(10);
    expect(landing).not.toMatch(/if \(!window\.DOMPurify\) return html;/);
  });
});
