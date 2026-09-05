// tests/unit/frontPagePreview.test.js
//
// The landing page IS the product now — anonymous, unpersonalized, but the same
// tutor in the same layout. Signing in does not change what it is; it makes it
// theirs. Every check here guards a way that could quietly stop being true.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('public/index.html');
const js = read('public/js/landing.js');
const css = read('public/css/landing-page.css');
const trialChat = read('routes/trialChat.js');

describe('the chat is the front page', () => {
  test('the stage is not hidden on load', () => {
    // It used to be display:none behind a tutor-pick phase. If that comes back,
    // the front page silently becomes a marketing page again.
    expect(html).toMatch(/<div class="lp-trial-chat" id="lp-trial-chat">/);
    expect(html).not.toMatch(/id="lp-trial-chat" style="display:none/);
  });

  test('the tutor greets on arrival rather than waiting to be poked', () => {
    expect(js).toMatch(/^\s*showTrialChat\(\);/m);
  });

  test('the separate hero composer and tutor picker are gone', () => {
    for (const dead of ['lp-hero-composer', 'lp-hero-example', 'lp-hero-tutor-chip', 'lp-hero-pick']) {
      expect(html).not.toContain(dead);
      expect(js).not.toContain(dead);
      expect(css).not.toContain(dead);
    }
  });
});

describe('the preview mirrors the product as it is now', () => {
  test('no right-rail workspace anywhere', () => {
    // #1569 moved the tutor's work into the chat column. A preview still
    // showing a 320px rail would put a homepage in front of visitors that
    // looks like the previous product.
    for (const src of [html, js, css]) {
      expect(src).not.toContain('lp-trial-workspace');
      expect(src).not.toContain('lp-trial-ws-');
    }
  });

  test('the work dock lives in the chat column and starts collapsed', () => {
    expect(html).toMatch(/<div class="lp-work-dock" id="lp-work-dock" hidden>/);
    // Ordered: dock, then the composer it docks above.
    expect(html.indexOf('id="lp-work-dock"')).toBeLessThan(html.indexOf('id="lp-trial-input-area"'));
  });

  test('the dock paints its own opaque ground', () => {
    // CLAUDE.md §12: design-system.css and living-workspace.css answer different
    // theme signals before theme-toggle.js stamps data-theme, so a transparent
    // inline surface can put light ink on a dark panel. It shipped that way once.
    const block = css.slice(css.indexOf('.lp-work-dock {'), css.indexOf('.lp-work-dock-head'));
    expect(block).toMatch(/background:\s*#/);
    expect(css).toMatch(/\[data-theme="dark"\] \.lp-work-dock \{[^}]*background:/);
  });
});

describe('locked affordances, not missing ones', () => {
  test('mic and camera render as locked rather than absent', () => {
    expect(html).toMatch(/id="lp-trial-mic"[^>]*data-locked="voice"/);
    expect(html).toMatch(/id="lp-trial-upload"[^>]*data-locked="photo"/);
  });

  test('paste of a file is intercepted, not silently dropped', () => {
    // A page that looks like a real chat invites a screenshot paste. With no
    // handler the paste does nothing, which reads as broken at the moment the
    // visitor was most engaged.
    const paste = js.slice(js.indexOf("addEventListener('paste'"), js.indexOf("var previewStage"));
    expect(paste).toContain("kind === 'file'");
    expect(paste).toContain('preventDefault');
    expect(paste).toContain("showLockedNotice('photo')");
  });

  test('drag-drop intercepts dragover too, or the browser navigates away', () => {
    const drop = js.slice(js.indexOf('var previewStage'));
    expect(drop).toMatch(/addEventListener\('dragover'/);
    expect(drop).toMatch(/addEventListener\('drop'/);
    expect(drop).toContain('preventDefault');
  });
});

describe('the arrival greeting', () => {
  const greet = trialChat.slice(trialChat.indexOf('You are ${tutor.name}'), trialChat.indexOf('Generate the greeting.'));

  test('hits the three beats: welcome, one of the tutors, learning how they think', () => {
    expect(greet).toMatch(/Welcome them to Mathmatix/i);
    expect(greet).toMatch(/ONE OF the tutors/);
    expect(greet).toMatch(/how THEY think/);
  });

  test('promises to learn about them without interrogating them', () => {
    // Anonymous: anything they answered would go nowhere, and questions in
    // front of help are friction at the worst possible moment.
    expect(greet).toMatch(/PROMISE, not an interview/);
    expect(greet).toMatch(/Do NOT ask their name, grade/);
  });

  test('never tells the visitor they are in a trial', () => {
    expect(greet).toMatch(/Never say "trial", "preview", "demo"/);
  });

  test('the failure-path fallbacks hit the same beats', () => {
    const fallbacks = trialChat.slice(trialChat.indexOf('const fallbacks = {'), trialChat.indexOf('const fallbackGreeting'));
    for (const id of ['bob', 'maya', 'ms-maria', 'mr-nappier']) {
      expect(fallbacks).toContain(`'${id}':`);
    }
    // Four canned lines, each welcoming to Mathmatix and naming the roster.
    expect((fallbacks.match(/[Ww]elcome to Mathmatix/g) || []).length).toBe(4);
    expect((fallbacks.match(/one of the tutors/g) || []).length).toBe(4);
    expect(fallbacks).not.toMatch(/\btrial\b|\bpreview\b|\bfree\b/i);
  });
});

describe('regressions the browser caught that source review did not', () => {
  test('[hidden] beats the author display on the locked notice', () => {
    // .lp-locked-notice sets display:flex, which overrides the UA stylesheet's
    // [hidden] rule — so the notice rendered empty on every single page load
    // until an explicit guard was added. Chromium showed it; no source test
    // would have.
    expect(css).toMatch(/\.lp-locked-notice\[hidden\][^{]*\{[^}]*display:\s*none/);
  });

  test('the arrival focus never scrolls the viewport', () => {
    // A plain focus() scrolled the headline AND the greeting off the top of a
    // phone before either could be read — harmless while the chat opened below
    // a hero, breaking once the stage became the page.
    expect(js).toContain('preventScroll: true');
    expect(js).toMatch(/matchMedia\('\(max-width: 780px\)'\)[\s\S]{0,40}return;/);
  });

  test('the composer input can shrink', () => {
    // flex:1 without min-width:0 refuses to shrink below its content, so three
    // round buttons truncated the placeholder at 390px.
    const block = css.slice(css.indexOf('.lp-trial-input {'), css.indexOf('.lp-trial-input:'));
    expect(block).toMatch(/min-width:\s*0/);
  });
});

describe('changed landing assets are cache-busted', () => {
  test('landing.js and landing-page.css carry the same bumped version', () => {
    // index.html is not in page-bundles.manifest.json, so it links the sources
    // directly — a stale ?v= is how a returning visitor keeps the old page.
    const jsV = html.match(/\/js\/landing\.js\?v=(\d+)/);
    const cssV = html.match(/\/css\/landing-page\.css\?v=(\d+)/);
    expect(jsV).not.toBeNull();
    expect(cssV).not.toBeNull();
    expect(Number(jsV[1])).toBeGreaterThanOrEqual(5);
    expect(Number(cssV[1])).toBeGreaterThanOrEqual(5);
  });
});
