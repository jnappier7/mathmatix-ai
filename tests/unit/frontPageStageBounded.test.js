/**
 * The front-page stage is a FIXED FRAME the transcript scrolls inside.
 *
 * THE BUG THIS CATCHES — reported live, 2026-09-07: "the entire chat window is
 * flexing, not just the 'our work'. The tutor is getting bigger each turn."
 *
 * Measured in Chromium against the shipped page, injecting messages into the
 * real transcript container:
 *
 *            portrait height   transcript scrolls
 *   empty         518 px             no
 *   4 messages    560 px             no
 *   24 messages  2216 px             no      <-- 4.3x, and still growing
 *
 * The chain, every link of which is ordinary CSS:
 *   1. `.lp-trial-main .lp-trial-messages { max-height: none }` lifts the 360px
 *      cap on the base rule, so the transcript is as tall as its content.
 *   2. `.lp-trial-main` is a flex column with no `min-height: 0`. A flex child
 *      defaults to `min-height: auto` and REFUSES to shrink below its content,
 *      so the column grows too and the `overflow-y` never engages.
 *   3. `.lp-trial-stage` is a grid with a min-height and no max, so the row is
 *      as tall as its tallest child — now the transcript.
 *   4. `align-items: stretch` stretches the hero to the row.
 *   5. `.lp-trial-hero-portrait` is `height: 100%` of the hero.
 * So every message made the tutor bigger.
 *
 * WHY THIS IS A STATIC TEST: jest's testEnvironment is node — nothing in the
 * unit suite has a layout engine, and jsdom would not evaluate the media
 * queries even if it did. The same split as tests/unit/freeTimePill.test.js:
 * the properties ARE the defect, so they are asserted against the stylesheet.
 * The 4.3x number above came from a real browser; this file keeps the fix from
 * being edited away without one.
 */

const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'css', 'landing-page.css'),
  'utf8'
);

/**
 * Body of the LAST TOP-LEVEL `selector { ... }` rule.
 *
 * Anchored to column 0 on purpose. Rules nested in a media block are indented,
 * and matching them too would have made every assertion here read the phone
 * exemption (which legitimately sets min-height:0) instead of the desktop rule
 * it means to check — a test that passes while the bug is present.
 */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...CSS.matchAll(new RegExp(`\\n${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(matches.length).toBeGreaterThan(0);
  return matches[matches.length - 1][1];
}

/** Body of `selector { ... }` inside the first max-width media query that has it. */
function phoneRuleBody(selector, maxWidth) {
  const blocks = [...CSS.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)];
  const block = blocks.find(b => Number(b[1]) === maxWidth);
  expect(block).toBeTruthy();
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rules = [...block[2].matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  return rules.map(r => r[1]).join(' ');
}

describe('the stage has a ceiling', () => {
  const stage = () => ruleBody('.lp-trial-stage');

  it('bounds its height, not only its minimum', () => {
    // `min-height` alone is what allowed the growth: it sets a floor and no
    // ceiling, so the grid row tracked the transcript upward forever.
    expect(stage()).toMatch(/(?:^|[\s;])height:\s*[^;]+/);
  });

  it('keeps the minimum too, so a short conversation still fills the frame', () => {
    expect(stage()).toMatch(/min-height:\s*\d+px/);
  });

  it('caps against the viewport, so the frame is never taller than the screen', () => {
    // A fixed pixel ceiling would still overflow a laptop; the tutor has to be
    // visible without scrolling, which is the whole premise of this page.
    expect(stage()).toMatch(/height:\s*min\(/);
    expect(stage()).toMatch(/vh/);
  });
});

describe('the transcript scrolls instead of growing', () => {
  it('the column may shrink inside the stage', () => {
    // Without min-height:0 a flex child will not go below its content height,
    // which silently defeats the overflow-y below it. This single declaration
    // is the difference between a scrolling pane and a growing page.
    expect(ruleBody('.lp-trial-main')).toMatch(/min-height:\s*0/);
  });

  it('the transcript may shrink inside the column, and scrolls', () => {
    const rule = ruleBody('.lp-trial-main .lp-trial-messages');
    expect(rule).toMatch(/min-height:\s*0/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/flex:\s*1/);
  });
});

describe('phones are deliberately exempt', () => {
  it('releases the ceiling where the portrait is hidden', () => {
    // ≤1080px hides the hero, so there is nothing to stretch — and a phone
    // wants the document to scroll, not a short inner pane. The cap is lifted
    // there on purpose; asserting it keeps a later "simplification" from
    // applying the desktop frame to a 390px screen.
    const phone = phoneRuleBody('.lp-trial-stage', 1080);
    expect(phone).toMatch(/height:\s*auto/);
    expect(phoneRuleBody('.lp-trial-hero', 1080)).toMatch(/display:\s*none/);
  });
});

describe('the portrait still sizes by height', () => {
  it('fills the hero rather than the column width', () => {
    // Not the bug — the bug was what the hero's height tracked — and this is
    // load-bearing for the portrait reading at full size (the source frames are
    // 1536x1024 with the character occupying a fraction). Pinned so a future
    // fix for "the tutor is too big" does not reach for the wrong lever.
    const portrait = ruleBody('.lp-trial-hero-portrait');
    expect(portrait).toMatch(/height:\s*100%/);
    expect(portrait).toMatch(/width:\s*auto/);
  });
});
