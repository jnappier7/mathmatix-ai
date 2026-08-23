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
 * Two invariants, at different strengths:
 *
 *   1. NESTED CONTROLS — enforced everywhere, no exceptions. There are currently
 *      zero in public/, and there is no legitimate reason to add one.
 *
 *   2. ACCESSIBLE NAMES — enforced page by page against KNOWN_GAPS below, which
 *      records what each page has today. 42 pages are clean and must stay clean;
 *      the 16 that are not may only get better. This is a ratchet, not a
 *      pass: lowering a number is the fix, raising one is the regression.
 *
 * The DOM parsing runs in a spawned process (tests/helpers/interactiveControlsProbe.js)
 * — jsdom@27 cannot be `require`d inside a Jest worker.
 */

const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Controls with no accessible name, per page, as of this test being written.
 * A page absent from this map must have zero. Fix a page, drop its count; when
 * it reaches zero, delete the entry so the page joins the enforced set.
 */
const KNOWN_GAPS = {
  'admin-dashboard.html': 6,
  'admin-upload.html': 1,
  'affiliate.html': 4,
  'animation-studio.html': 4,
  'avatar-builder.html': 23,
  'bio-chat.html': 1,
  'canvas.html': 2,
  'chat-mockup.html': 3,
  'chat.html': 12,
  'contact-support.html': 5,
  'mastery-chat.html': 2,
  'math-showdown.html': 1,
  'parent-course.html': 2,
  'parent-dashboard.html': 5,
  'phone-upload.html': 1,
  'teacher-dashboard.html': 11,
};

/** Pages a visitor meets before they have an account. These carry the review's fixes. */
const FRONT_DOOR = [
  'index.html',
  'signup.html',
  'onboarding.html',
  'login.html',
  'pricing.html',
  'reset-password.html',
  'forgot-password.html',
  'complete-profile.html',
  'parental-consent.html',
  'role-picker.html',
  'pick-tutor.html',
];

describe('interactive control accessibility', () => {
  let report;

  beforeAll(() => {
    report = JSON.parse(execFileSync(
      process.execPath,
      [path.join(__dirname, '../helpers/interactiveControlsProbe.js')],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 }
    ));
  });

  it('parses the whole public/ surface', () => {
    expect(Object.keys(report).length).toBeGreaterThan(50);
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
    it.each(FRONT_DOOR)('%s is clean', (file) => {
      // These are the pages someone meets before they trust us with anything.
      expect(report[file].unnamed).toEqual([]);
    });

    it('holds on every page not in the known-gaps list', () => {
      const unexpected = Object.entries(report)
        .filter(([file, r]) => r.unnamed.length && !(file in KNOWN_GAPS))
        .map(([file, r]) => `${file}: ${r.unnamed.join(', ')}`);

      expect(unexpected).toEqual([]);
    });

    it('never gets worse on a page that already has gaps', () => {
      const worse = Object.entries(KNOWN_GAPS)
        .filter(([file, allowed]) => (report[file]?.unnamed.length ?? 0) > allowed)
        .map(([file, allowed]) => `${file}: ${report[file].unnamed.length} unnamed, budget ${allowed}`);

      expect(worse).toEqual([]);
    });

    it('has its budgets tightened when a page is fixed', () => {
      // Keeps KNOWN_GAPS honest: a stale, too-generous budget silently stops
      // protecting the page it names.
      const stale = Object.entries(KNOWN_GAPS)
        .filter(([file, allowed]) => (report[file]?.unnamed.length ?? 0) < allowed)
        .map(([file, allowed]) => `${file}: now ${report[file].unnamed.length}, budget still ${allowed} — lower it`);

      expect(stale).toEqual([]);
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
