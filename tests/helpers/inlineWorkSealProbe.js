/**
 * Drives a real DerivationView through a session's worth of work and reports
 * what it SEALED — the contract behind the move off the right rail: a finished
 * problem leaves the work dock and becomes a card in the chat transcript.
 * Not a test — a probe the test asserts against.
 *
 * Runs as its own Node process for the reason documented in i18nRenderProbe.js:
 * jsdom@27 pulls an ESM-only transitive dep that Jest's CommonJS transform
 * cannot parse, so `require('jsdom')` throws inside a Jest worker but is fine
 * under plain Node.
 *
 * KaTeX is deliberately absent: typeset() falls back to plain text, which is
 * what lets us read the sealed cards' math back out as strings.
 *
 * Usage: node inlineWorkSealProbe.js   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '../../public/js/living-workspace');

const dom = new JSDOM('<!doctype html><body><div id="mount"></div></body>', {
  runScripts: 'outside-only',
  url: 'https://www.mathmatix.ai/chat.html',
});
const win = dom.window;

win.eval(fs.readFileSync(path.join(SRC, 'dom/derivationView.js'), 'utf8'));
const { DerivationView } = win.LWS;

const sealed = [];
const view = new DerivationView(win.document.getElementById('mount'), {
  onSeal: (entry) => sealed.push(entry),
});

// The adapted element shape the P5 adapter hands the view.
const eq = (latex, role) => ({ type: 'equation', semantic: { latex, role } });

// A session: solve one problem, abandon a second, leave a third in progress.
view.apply([eq('2x + 4 = 20', 'problem'), eq('2x = 16', 'step')]);
view.apply([eq('x = 8', 'solution')]);
view.apply(null);   // a turn with nothing adapted must not throw or seal
view.clear();       // verify + clear — the way a finished problem ends

view.apply([eq('3y - 1 = 8', 'problem'), eq('3y = 9', 'step')]);
view.apply([eq('5z = 25', 'problem')]); // a different pose abandons the y problem

const beforeSealCount = sealed.length;

// Ledger metadata lands after the replay in the hydrate path; annotating must
// reach the SAME entry objects the seals hold, or a sealed card renders as a
// bare "Solved" forever.
view.annotateArchive([
  { assistance: 2, completedAt: '2026-09-04T10:00:00.000Z' },
  { assistance: 7, completedAt: '2026-09-04T10:05:00.000Z' },
]);

const textOf = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();

const cards = sealed.map((entry) => {
  const node = view.buildSealedCard(entry);
  return {
    problemTex: entry.problemTex,
    solved: entry.solved,
    assistance: entry.assistance == null ? null : entry.assistance,
    completedAt: entry.completedAt == null ? null : entry.completedAt,
    isSealedRoot: node.classList.contains('lws-root') && node.classList.contains('lws-sealed'),
    summary: textOf(node.querySelector('.lws-dv-ov-sum-status')),
    problemText: textOf(node.querySelector('.lws-card-problem')),
    stepTexts: Array.from(node.querySelectorAll('.lws-step .lws-step-tex')).map(textOf),
    cardIsSolved: node.querySelector('.lws-card').classList.contains('is-solved'),
  };
});

process.stdout.write(JSON.stringify({
  sealCount: sealed.length,
  sealCountBeforeAnnotate: beforeSealCount,
  cards,
  // The rail must stay inert in seal mode — the transcript is the archive.
  railHidden: view.el.rail.hidden,
  railChildren: view.el.rail.childNodes.length,
  // The problem still in focus stays in the dock, and the dock is not empty.
  focusProblem: view._problemTex,
  rootIsEmpty: view.el.root.classList.contains('is-empty'),
  // A session reset empties the dock and marks it collapsible again.
  afterReset: (() => {
    view.resetAll();
    return {
      focusProblem: view._problemTex,
      rootIsEmpty: view.el.root.classList.contains('is-empty'),
      archive: view._archive.length,
    };
  })(),
}, null, 2));
