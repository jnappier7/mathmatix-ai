/**
 * The work moved off the right rail and into the chat column (2026-09).
 *
 * Two surfaces replace the 320px workspace aside, both inside #chat-container:
 *   • the WORK DOCK (#cr-work-dock) — the problem in focus, above the composer;
 *   • SEALED CARDS (.lws-sealed) — finished problems, in the transcript.
 *
 * The failure mode this guards is silent in every check you'd normally trust:
 * the rail is hidden by CSS, so if the dock slot is missing, the flag class
 * isn't stamped, or seal mode still paints a rail, the student gets a chat page
 * with the tutor's work nowhere at all — no error, no blank panel, just absent
 * math. Nothing throws, and jest passes on the modules in isolation.
 *
 * Behavioural half runs through a real DOM (tests/helpers/inlineWorkSealProbe.js,
 * spawned — see that file for why it can't run inside a Jest worker).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '../../..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const html = read('public', 'chat.html');
const lwsCss = read('public', 'css', 'living-workspace.css');
const chatCss = read('public', 'css', 'chat-redesign.css');
const voiceCss = read('public', 'css', 'voice-mode.css');
const integration = read('public', 'js', 'living-workspace', 'chat-workspace.js');

describe('the work dock lives in the chat column', () => {
  test('#cr-work-dock sits between the transcript and the composer', () => {
    const transcript = html.indexOf('id="chat-messages-container"');
    const dock = html.indexOf('id="cr-work-dock"');
    const composer = html.indexOf('id="input-container"');
    expect(transcript).toBeGreaterThan(-1);
    expect(dock).toBeGreaterThan(transcript);
    expect(composer).toBeGreaterThan(dock);

    // …and inside #chat-container, not floating beside it: the dock inherits
    // the chat column's width, which is the whole point of the move.
    const chatPanel = html.indexOf('id="chat-container"');
    expect(chatPanel).toBeLessThan(dock);
  });

  test('the integration mounts into that slot, not the retired rail', () => {
    expect(integration).toMatch(/getElementById\('cr-work-dock'\)/);
    // The old swap hid the rail's children and mounted over them. If that
    // returns, the board is invisible — html.mm-work-inline display:none's the
    // whole aside now.
    expect(integration).not.toMatch(/getElementById\('cr-workspace'\)/);
    expect(integration).not.toMatch(/lws-swapped/);
  });
});

describe('the flag stamps the layout before first paint', () => {
  test('chat.html adds mm-work-inline for every on-mode, synchronously', () => {
    expect(html).toMatch(/classList\.add\('mm-work-inline'\)/);
    // Every on-mode, not just 'live': dev and beta also render inline, so a
    // pilot on beta must not get a three-column stage with an empty rail.
    const guard = html.slice(
      html.indexOf("['dev', 'beta', 'live']"),
      html.indexOf("classList.add('mm-work-inline')")
    );
    expect(guard).toMatch(/livingWorkspace/);
    // Before the body opens — the reason mm-lws-live is stamped here too.
    expect(html.indexOf("classList.add('mm-work-inline')")).toBeLessThan(html.indexOf('<body'));
  });

  test('mm-work-inline drops the rail from the stage and hides it', () => {
    expect(chatCss).toMatch(
      /html\.mm-work-inline \.cr-stage \{\s*grid-template-columns: var\(--cr-hero-w\) minmax\(0, 1fr\);/
    );
    expect(chatCss).toMatch(/html\.mm-work-inline \.cr-workspace[\s\S]{0,200}display: none/);
  });

  test('it restates the stage at every breakpoint it now outranks', () => {
    // html.mm-work-inline .cr-stage is more specific than the plain .cr-stage
    // rules in the responsive blocks, so it wins REGARDLESS of source order.
    // Without a copy per breakpoint the flag silently pins tablets and phones
    // to the desktop hero width — no error, just a squeezed chat column.
    for (const [width, cols] of [[1200, '260px minmax\\(0, 1fr\\)'], [900, '1fr']]) {
      const re = new RegExp(
        `@media \\(max-width: ${width}px\\) \\{[\\s\\S]{0,400}?html\\.mm-work-inline \\.cr-stage \\{ grid-template-columns: ${cols};`
      );
      expect(chatCss).toMatch(re);
    }
  });

  test('the phone stage does not try to position the profile against display:contents', () => {
    // .cr-hero-col is `display: contents` below 900px, so position:relative on
    // it does nothing and an absolute #psc-profile escapes to the wrapper —
    // the rail-era bug workspace.css documents. Phones drop both surfaces; the
    // bottom nav's Progress tab is the entry point there.
    expect(chatCss).toMatch(
      /@media \(max-width: 900px\)[\s\S]{0,900}html\.mm-work-inline #psc-profile \{ display: none !important; \}/
    );
  });
});

describe('the dock costs nothing when there is no work', () => {
  test('an empty derivation collapses the dock and its header', () => {
    expect(lwsCss).toMatch(/\.cr-work-dock \.lws-dv-root\.is-empty \{ display: none; \}/);
    expect(lwsCss).toMatch(/\.cr-work-dock:has\(\.lws-dv-root\.is-empty\) \.lws-dock-bar \{ display: none; \}/);
  });

  test('the derivation view is what stamps is-empty', () => {
    const view = read('public', 'js', 'living-workspace', 'dom', 'derivationView.js');
    expect(view).toMatch(/classList\.toggle\('is-empty', !has\)/);
  });
});

describe('the inline surfaces paint their own ground', () => {
  // The two theme systems can disagree. design-system.css is dark by default
  // and only goes light on [data-theme="light"]; living-workspace.css ALSO
  // answers to prefers-color-scheme. A student on a light-OS machine, before
  // the deferred theme-toggle.js stamps data-theme, therefore has a dark chat
  // panel and a light board palette at once. In the rail that was invisible —
  // the board painted --lws-grid-bg under its own ink. Inline, anything
  // transparent puts that ink straight onto the chat panel, which is how the
  // sealed summary's step count first rendered near-black on near-black.
  test('the dock keeps an opaque --lws-grid-bg, never transparent', () => {
    const dock = lwsCss.slice(
      lwsCss.indexOf('.cr-work-dock .lws-root {'),
      lwsCss.indexOf('.cr-work-dock .lws-dv {')
    );
    expect(dock).toMatch(/background: var\(--lws-grid-bg\);/);
    expect(dock).not.toMatch(/background: transparent/);
  });

  test('a sealed summary sits on an opaque board colour', () => {
    // .is-solved tints with a translucent green, so it needs a known base
    // beneath it rather than whatever the transcript happens to be.
    expect(lwsCss).toMatch(/\.lws-sealed \.lws-dv-ov-sum \{ background-color: var\(--lws-card-bg\); \}/);
  });
});

describe('voice mode still has a stage', () => {
  test('the chat column takes the floor and the dock grows', () => {
    // The call layout used to promote #cr-workspace to centre stage. With the
    // rail gone that rule is inert, so voice needs its own inline answer or a
    // call opens onto a column ordered for a board that no longer exists.
    expect(voiceCss).toMatch(/html\.mm-work-inline body\.cr-voice #chat-container[\s\S]{0,160}order: 2/);
    expect(voiceCss).toMatch(/html\.mm-work-inline body\.cr-voice \.cr-work-dock \.lws-dv \{\s*max-height:/);
  });
});

describe('finished problems seal into the transcript', () => {
  const probe = () =>
    JSON.parse(
      execFileSync('node', [path.join(ROOT, 'tests/helpers/inlineWorkSealProbe.js')], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      })
    );

  let out;
  beforeAll(() => { out = probe(); });

  test('both ways a problem ends hand a card to the host', () => {
    // clear (verify + done) and a different pose (abandoned) — the same two
    // transitions boardLedger records server-side.
    expect(out.sealCount).toBe(2);
    expect(out.cards.map((c) => c.problemTex)).toEqual(['2x + 4 = 20', '3y - 1 = 8']);
  });

  test('a sealed card carries the whole derivation, not just the problem', () => {
    expect(out.cards[0].problemText).toBe('2x + 4 = 20');
    expect(out.cards[0].stepTexts).toEqual(['2x = 16', 'x = 8']);
    expect(out.cards[0].cardIsSolved).toBe(true);
    expect(out.cards[1].cardIsSolved).toBe(false);
  });

  test('it is its own .lws-root so the board tokens resolve in the transcript', () => {
    // Every --lws-* colour is defined ON .lws-root. A sealed card lives outside
    // the board's subtree, so without its own root it renders unstyled.
    expect(out.cards.every((c) => c.isSealedRoot)).toBe(true);
  });

  test('ledger metadata still reaches a card that was sealed before it arrived', () => {
    // The hydrate path replays first and annotates after; seals hold the same
    // entry objects, so the assistance level must survive the gap. Level ≤4 is
    // independent work, 5+ had the tutor's thinking in the loop.
    expect(out.sealCountBeforeAnnotate).toBe(2);
    expect(out.cards[0].summary).toBe('Solved it myself');
    expect(out.cards[1].summary).toBe('Not finished yet');
    expect(out.cards[0].completedAt).toBe('2026-09-04T10:00:00.000Z');
  });

  test('seal mode never paints a rail', () => {
    expect(out.railHidden).toBe(true);
    expect(out.railChildren).toBe(0);
  });

  test('the problem in focus stays in the dock, and a reset empties it', () => {
    expect(out.focusProblem).toBe('5z = 25');
    expect(out.rootIsEmpty).toBe(false);
    expect(out.afterReset).toEqual({ focusProblem: null, rootIsEmpty: true, archive: 0 });
  });
});

describe('sealed cards are placed by when the work happened', () => {
  test('history messages are stamped with the timestamp the placement reads', () => {
    const script = read('public', 'js', 'script.js');
    expect(script).toMatch(/setAttribute\('data-ts', String\(ts\)\)/);
    expect(integration).toMatch(/querySelectorAll\('\[data-ts\]'\)/);
  });

  test('two problems finishing between the same pair of messages keep their order', () => {
    // Both anchor to the same message; inserting at anchor.nextSibling twice
    // would reverse them, so the placement steps past cards already sealed there.
    expect(integration).toMatch(/while \(at2 && at2\.classList && at2\.classList\.contains\('lws-sealed'\)\)/);
  });
});
