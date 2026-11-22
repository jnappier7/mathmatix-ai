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
 * THE SECOND BUG, 2026-09-08: "move that blurb on top below the fold." The
 * frame had a ceiling by then, but the ceiling was a flat 76vh and the stage
 * starts 227px down the page, so 76vh + 227px overflowed every laptop window.
 * Measured in Chromium, the composer — the demo's only input — sat below the
 * fold at every size we ship to:
 *
 *   viewport (content)   composer clipped by
 *   1440x788  (Air 13)         88 px
 *   1512x860  (MBP 14)         71 px
 *   1728x965  (MBP 16)         46 px
 *   1920x945  (1080p)          50 px
 *
 * Two changes fixed it, and both are pinned below: the describing sentence
 * moved out from under the headline to below the demo (54px), and the ceiling
 * became `100vh - (what is above it)` instead of a fraction of the viewport.
 * After: every one of those viewports clears the fold by 46px.
 *
 * WHY THIS IS A STATIC TEST: jest's testEnvironment is node — nothing in the
 * unit suite has a layout engine, and jsdom would not evaluate the media
 * queries even if it did. The same split as tests/unit/freeTimePill.test.js:
 * the properties ARE the defect, so they are asserted against the stylesheet.
 * The numbers above came from a real browser; this file keeps the fixes from
 * being edited away without one.
 */

const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'css', 'landing-page.css'),
  'utf8'
);

const HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'index.html'),
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

/**
 * THE THIRD BUG, 2026-11-22: "The landing page trial chat expands the page on
 * mobile." Phones used to be exempt from the frame on purpose (`height: auto`
 * at ≤1080px — "a phone wants the document to scroll"). Measured on an
 * iPhone 14 (390x664) in Chromium against the shipped page:
 *
 *                 frame height   composer
 *   on load          641 px      70 px below the fold
 *   4 turns        1,581 px      moved every turn
 *   at the gate    2,503 px      (page 1,862 px taller than it loaded)
 *
 * and the document scrolled itself each turn, chasing the input's focus.
 * After: the frame is 468px at every one of those moments, the page height
 * never changes, and the composer is on screen from load on thirteen
 * viewports from 320x568 to 1440x788.
 */
describe('a phone gets the same fixed frame', () => {
  const phone = () => phoneRuleBody('.lp-trial-stage', 1080);

  it('never releases the ceiling', () => {
    // `height: auto` here IS the bug: the row tracks the transcript again.
    expect(phone()).not.toMatch(/height:\s*auto/);
    expect(phone()).toMatch(/(?:^|[\s;])height:\s*max\(/);
    expect(phoneRuleBody('.lp-trial-hero', 1080)).toMatch(/display:\s*none/);
  });

  it('measures the SMALL viewport, with a vh fallback before it', () => {
    // On iOS Safari 100vh is the viewport with the toolbars hidden, so a vh
    // frame is ~100px taller than the screen at load. svh must come last so it
    // wins where it is understood.
    const body = phone();
    expect(body).toMatch(/100svh/);
    expect(body.lastIndexOf('100svh')).toBeGreaterThan(body.lastIndexOf('100vh'));
  });

  it('caps the floor by the screen, so a phone on its side still fits', () => {
    expect(phone()).toMatch(/min\(\s*var\(--lp-stage-floor\)\s*,\s*calc\(\s*100svh/);
  });

  it('is not undone by a narrower media query', () => {
    const blocks = [...CSS.matchAll(/@media[^{]*max-width[^{]*\{([\s\S]*?)\n\}/g)];
    for (const b of blocks) {
      const rules = [...b[1].matchAll(/\.lp-trial-stage\s*\{([^}]*)\}/g)];
      for (const r of rules) expect(r[1]).not.toMatch(/(?:^|[\s;])height:\s*auto/);
    }
  });
});

describe('the frame keeps room for the transcript', () => {
  it('the work dock takes a share and scrolls, instead of a fixed 277px', () => {
    // On a 427px frame (1366x768 laptop) the dock left the transcript 32px.
    const dock = ruleBody('.lp-trial-main .lp-work-dock:not([hidden])');
    expect(dock).toMatch(/max-height:[^;]*%/);
    expect(dock).toMatch(/min-height:\s*0/);
    const nb = ruleBody('.lp-trial-main .lp-work-dock .lp-trial-notebook');
    expect(nb).toMatch(/overflow-y:\s*auto/);
    expect(nb).toMatch(/max-height:\s*none/);
  });

  it('the gate can shrink and scroll, so its buttons are never clipped', () => {
    // It was a rigid ~400px item inside overflow:hidden: on that laptop the
    // trial button was cut in half and the sign-in link was gone.
    const gate = ruleBody('.lp-trial-main .lp-trial-gate');
    expect(gate).toMatch(/min-height:\s*0/);
    expect(gate).toMatch(/overflow-y:\s*auto/);
  });

  it('the suggestions are one scrolling row on a phone, not a 239px column', () => {
    expect(CSS).toMatch(/\n {2}\.lp-trial-prompt-btns\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/);
    expect(CSS).not.toMatch(/\.lp-trial-prompt-btns\s*\{\s*flex-direction:\s*column/);
  });
});

describe('the script does not move the page', () => {
  const JS = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'landing.js'),
    'utf8'
  );

  it('never calls a bare focus() on the composer', () => {
    // A bare focus() scrolls the document to the input and, on a phone, raises
    // the keyboard after every reply.
    expect(JS).not.toMatch(/trialInput\.focus\(\s*\)/);
  });

  it('Send does not take focus from the composer', () => {
    expect(JS).toMatch(/keepComposerFocus\(trialSend\)/);
  });

  it('a reply is shown from its first line', () => {
    expect(JS).toMatch(/scrollTrialToReply\(row\)/);
  });

  it('the gate clears the dock out of its way', () => {
    const gate = JS.slice(JS.indexOf('function showGate()'));
    expect(gate.slice(0, 900)).toMatch(/workDock\.hidden\s*=\s*true/);
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

describe('the frame fits in what is left of the window', () => {
  const stage = () => ruleBody('.lp-trial-stage');

  it('subtracts what sits above it rather than taking a flat share of the viewport', () => {
    // `min(76vh, 760px)` reads like a cap and is not one: it knows nothing
    // about the 227px of header, eyebrow and headline above the stage, so the
    // sum overflowed every laptop. The ceiling has to be relative to the space
    // that is actually left.
    expect(stage()).toMatch(/height:\s*min\(\s*calc\(\s*100vh\s*-/);
    expect(stage()).not.toMatch(/height:\s*min\(\s*\d+vh/);
  });

  it('names that offset once, so the two numbers cannot drift apart', () => {
    // The offset is the measured height of the header stack. Inlining it in the
    // calc would leave a bare magic number with nothing tying it to the thing
    // it measures — and the next person to add a line above the demo would have
    // no reason to look here at all.
    expect(stage()).toMatch(/--lp-stage-offset:\s*\d+px/);
    expect(stage()).toMatch(/var\(--lp-stage-offset\)/);
  });

  it('still stops the frame ballooning on a tall monitor', () => {
    expect(stage()).toMatch(/,\s*760px\s*\)/);
  });
});

describe('nothing but the headline is spent above the demo', () => {
  const introIndex = HTML.indexOf('class="lp-hero-intro"');
  const demoIndex = HTML.indexOf('id="lp-trial-chat"');
  const ledeIndex = HTML.indexOf('lp-hero-lede');

  it('the describing sentence comes after the demo, not before it', () => {
    // Every line above the stage is paid for out of the stage's height. This
    // sentence cost 54px there and pushed the composer off the fold; below the
    // demo it costs nothing and reads better, because by then the reader has
    // watched the tutor do what it claims.
    expect(ledeIndex).toBeGreaterThan(-1);
    expect(demoIndex).toBeGreaterThan(-1);
    expect(ledeIndex).toBeGreaterThan(demoIndex);
  });

  it('the intro block above the demo is eyebrow and headline only', () => {
    const intro = HTML.slice(introIndex, demoIndex);
    expect(intro).toMatch(/lp-hero-eyebrow/);
    expect(intro).toMatch(/<h1>/);
    expect(intro).not.toMatch(/lp-hero-sub/);
  });

  it('keeps the sentence itself — moved, not deleted', () => {
    // It is the only early mention of IEP accommodations, which is the
    // differentiator. A "shorten the hero" edit that drops it is a regression
    // of a different kind, so it is pinned rather than left to judgement.
    expect(HTML).toMatch(/adapting to their IEP accommodations/);
  });
});

describe('the moved sentence keeps its type', () => {
  it('is styled through .lp-hero so it out-specifies the base rule', () => {
    // `.lp-hero .lp-hero-sub` is 0,2,0. A bare `.lp-hero-lede` is 0,1,0 and
    // loses to it wherever they disagree, silently keeping the old 640px
    // measure and 2rem bottom margin — a rule that appears to apply and does
    // not is worse than no rule at all.
    const matches = [...CSS.matchAll(/\n(\.[^\n{]*\.lp-hero-lede[^\n{]*)\{/g)];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m[1].includes('.lp-hero '))).toBe(true);
  });
});
