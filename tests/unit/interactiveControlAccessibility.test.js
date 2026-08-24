/**
 * Every interactive control must be reachable and announceable.
 *
 * THE BUG THIS CATCHES: the homepage's tutor picker put the "hear my voice"
 * affordance INSIDE the chip's <button> as a `<span role="button" tabindex="0">`
 * — a control nested in a control. Browsers do not let assistive technology
 * announce or activate the inner one separately, so the voice preview, which is
 * the whole point of a picker with four personalities, existed for mouse users
 * only. It also broke the outer chip's own name, which had swallowed the inner
 * control's content.
 *
 * The same picker showed four faces and four names with no indication of what
 * choosing one changed, and the trial chat's controls carried their meaning only
 * in `title` attributes ("←", "π", a paper plane). `title` is not an accessible
 * name you can rely on: several screen readers skip it entirely and it never
 * surfaces on touch, which is most of this product's traffic.
 *
 * Two invariants, both enforced everywhere with no exceptions:
 *
 *   1. NESTED CONTROLS — a control inside another control cannot be announced or
 *      activated separately, whatever role or tabindex is written on it.
 *
 *   2. ACCESSIBLE NAMES — every interactive control has one. `title` does not
 *      count: several screen readers skip it and it never surfaces on touch,
 *      which is most of this product's traffic.
 *
 * The second started as a ratchet — 42 pages clean, 16 with recorded budgets
 * that could only shrink. Those budgets reached zero, so the allowlist is gone.
 *
 * The DOM parsing runs in a spawned process (tests/helpers/interactiveControlsProbe.js)
 * — jsdom@27 cannot be `require`d inside a Jest worker.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** Page list read synchronously — it.each names its cases at collection time,
 *  before beforeAll has run the probe. */
const PAGES = fs
  .readdirSync(path.join(__dirname, '..', '..', 'public'))
  .filter((f) => f.endsWith('.html'))
  .sort();

describe('interactive control accessibility', () => {
  let report;

  beforeAll(() => {
    report = JSON.parse(execFileSync(
      process.execPath,
      [path.join(__dirname, '../helpers/interactiveControlsProbe.js')],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 }
    ));
  });

  it('parses every page in public/', () => {
    expect(Object.keys(report).sort()).toEqual(PAGES);
    expect(PAGES.length).toBeGreaterThan(50);
  });

  describe('no control is nested inside another control', () => {
    it('holds across every page', () => {
      const offenders = Object.entries(report)
        .filter(([, r]) => r.nested.length)
        .map(([file, r]) => `${file}: ${r.nested.map((n) => `${n.inner} inside ${n.outer}`).join('; ')}`);

      // A control inside a control cannot be reached separately by keyboard or
      // screen reader, whatever role or tabindex is written on it.
      expect(offenders).toEqual([]);
    });
  });

  describe('every control has an accessible name', () => {
    // This started as a ratchet: 42 pages clean, 16 recorded in a KNOWN_GAPS map
    // with exact counts that could only go down. They went to zero, so the
    // allowlist is gone with them — a list nobody needs is a list someone
    // eventually adds to. If a page ever genuinely needs an exception, bring the
    // mechanism back with the reason written down, rather than loosening this.
    it('holds on every page', () => {
      const offenders = Object.entries(report)
        .filter(([, r]) => r.unnamed.length)
        .map(([file, r]) => `${file}: ${r.unnamed.join(', ')}`);

      expect(offenders).toEqual([]);
    });

    // Per-page cases as well as the sweep above: when one page regresses, the
    // failure should name it rather than printing a list to read through.
    it.each(PAGES)('%s is clean', (file) => {
      expect(report[file].unnamed).toEqual([]);
    });
  });

  describe('the tutor picker', () => {
    it('keeps the voice preview out of the chip button', () => {
      const homepage = report['index.html'];
      expect(homepage.nested).toEqual([]);
      expect(homepage.unnamed).toEqual([]);
    });
  });
});
