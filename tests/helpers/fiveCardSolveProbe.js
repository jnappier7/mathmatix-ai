/**
 * Replays the 2026-10-05 five-card session (fiveCardSolve.fixture.json) end
 * to end and reports what the student would see. Not a test — a probe the
 * test asserts against.
 *
 *   BEFORE — the ledger prod actually persisted, hydrated through the real
 *            client replay path (ledgerToTurns → adapter → DerivationView).
 *            Proves the harness reproduces the bug: five cards.
 *   AFTER  — the same turns run through the server's board tail in pipeline
 *            order (pedagogy guard → dropRedundantPoses → settleBoardTurn),
 *            rendered LIVE turn by turn, then the resulting ledger hydrated
 *            the way a reload does. Both must give one card.
 *
 * Runs as its own Node process for the reason in inlineWorkSealProbe.js
 * (jsdom@27 can't load inside a Jest worker). KaTeX is absent on purpose:
 * typeset() falls back to plain text, so math reads back as strings.
 *
 * Usage: node fiveCardSolveProbe.js → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '../..');
const LWS = path.join(ROOT, 'public/js/living-workspace');
const fixture = require('./fiveCardSolve.fixture.json');

const { enforcePedagogyRule, hasStartOverIntent } = require(path.join(ROOT, 'utils/boardCommandGuard'));
const { dropRedundantPoses } = require(path.join(ROOT, 'utils/pipeline/boardSynthesizer'));
const { settleBoardTurn } = require(path.join(ROOT, 'utils/pipeline/boardSettle'));

function makeView() {
  const dom = new JSDOM('<!doctype html><body><div id="mount"></div></body>', {
    runScripts: 'outside-only',
    url: 'https://www.mathmatix.ai/chat.html',
  });
  const win = dom.window;
  for (const f of ['dom/legacyBoardAdapter.js', 'core/ledgerReplay.js', 'dom/derivationView.js']) {
    win.eval(fs.readFileSync(path.join(LWS, f), 'utf8'));
  }
  const sealed = [];
  const view = new win.LWS.DerivationView(win.document.getElementById('mount'), {
    onSeal: (entry) => sealed.push(entry),
  });
  let turn = 0;
  // The chat-workspace render path, minus the DOM host.
  const render = (cmds) => {
    const out = win.LWS.adaptBoardCommands(cmds, { idPrefix: 'lgc' + (++turn) });
    view.apply(out.elements, out.clear);
  };
  return { win, view, sealed, render };
}

const textOf = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();

function snapshot({ view, sealed }) {
  const rows = Array.from(view.el.lines.querySelectorAll('.lws-step'));
  return {
    sealCount: sealed.length,
    sealedProblems: sealed.map((e) => e.problemTex),
    focusProblem: view._problemTex,
    rows: rows.map((r) => ({
      kind: (r.className.match(/is-(\w+)/) || [])[1] || null,
      op: textOf(r.querySelector('.lws-step-op') || { textContent: '' }) || null,
      tex: textOf(r.querySelector('.lws-step-tex') || { textContent: '' }) || null,
    })),
    solved: view.el.card.classList.contains('is-solved'),
  };
}

function hydrate(ledger) {
  const v = makeView();
  v.win.LWS.ledgerToTurns(ledger).forEach(v.render);
  return snapshot(v);
}

// ── BEFORE: what prod persisted ─────────────────────────────────────────────
const before = hydrate(fixture.observedLedger);

// ── AFTER: the turns through today's server tail, rendered live ────────────
const live = makeView();
const state = { pinTex: null, lastBoardAction: null, ledger: null };
const guardDrops = [];
const settleEvents = [];
let clock = Date.parse('2026-10-05T15:00:00.000Z');

for (const t of fixture.turns) {
  const guarded = enforcePedagogyRule({
    commands: t.commands,
    userMessage: t.message,
    lastBoardActionInConversation: state.lastBoardAction,
    workedExample: !!t.workedExample,
    pinnedProblemTex: state.pinTex,
    focusProblemTex: state.ledger && state.ledger.current ? state.ledger.current.problemTex : null,
  });
  guarded.dropped.forEach((d) => guardDrops.push({ action: d.command.action, tex: d.command.tex || null, reason: d.reason }));
  const deduped = dropRedundantPoses(guarded.allowed, state.pinTex, { startOver: hasStartOverIntent(t.message) }).kept;
  const settled = settleBoardTurn({
    commands: deduped,
    message: t.message,
    pinTex: state.pinTex,
    lastBoardAction: state.lastBoardAction,
    ledger: state.ledger,
    now: new Date((clock += 60000)),
  });
  settleEvents.push({
    demoted: settled.events.demoted.map((c) => c.tex),
    folded: settled.events.folded.map((c) => (c.action === 'pose' ? c.tex : c.action)),
  });
  state.lastBoardAction = settled.lastBoardAction;
  if (settled.pin !== 'keep') state.pinTex = settled.pin ? settled.pin.tex : null;
  state.ledger = settled.ledger;
  if (settled.commands.length) live.render(settled.commands);
}

process.stdout.write(JSON.stringify({
  before,
  after: {
    live: snapshot(live),
    hydrated: hydrate(state.ledger),
    ledger: {
      completed: state.ledger.completed.length,
      currentProblem: state.ledger.current && state.ledger.current.problemTex,
      solved: !!(state.ledger.current && state.ledger.current.steps.some((s) => s.action === 'verify')),
    },
    pinTex: state.pinTex,
    guardDrops,
    settleEvents,
  },
}, null, 2));
