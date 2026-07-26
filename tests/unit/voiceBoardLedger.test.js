/**
 * Voice joins the Live Workspace loop (spec §17): a voice turn's board
 * output folds into the SAME ledger chat writes, so it persists, earns
 * assistance evidence, and feeds the board ghost — end to end.
 *
 *   voice payload → voiceToBoardCommands → promoteLeadingResolveToPose
 *     → applyTurnToLedger → buildBoardStateBlock / ledgerToTurns
 */
const { voiceToBoardCommands } = require('../../public/js/living-workspace/dom/voiceBoardTranslate');
const { applyTurnToLedger, promoteLeadingResolveToPose } = require('../../utils/pipeline/boardLedger');
const { assistanceLevelForTurn } = require('../../utils/pipeline/assistanceLadder');
const { buildBoardStateBlock } = require('../../utils/pipeline/boardStateBlock');
const { ledgerToTurns } = require('../../public/js/living-workspace/core/ledgerReplay.js');

const NOW = new Date('2026-07-26T12:00:00Z');

function foldVoiceTurn(ledger, payload) {
  let cmds = voiceToBoardCommands(payload);
  cmds = promoteLeadingResolveToPose(ledger, cmds);
  if (!cmds.length) return ledger;
  return applyTurnToLedger(ledger, cmds, NOW, {
    assistance: assistanceLevelForTurn({ boardCommands: cmds }),
  });
}

describe('promoteLeadingResolveToPose', () => {
  test('empty board: the first voice math line becomes the problem', () => {
    const out = promoteLeadingResolveToPose(null, [
      { action: 'resolve', tex: '2x - 4 = 0' },
      { action: 'resolve', tex: '2x = 4' },
    ]);
    expect(out[0]).toEqual({ action: 'pose', tex: '2x - 4 = 0' });
    expect(out[1].action).toBe('resolve');
  });

  test('a problem already in focus is never re-posed over', () => {
    const ledger = applyTurnToLedger(null, [{ action: 'pose', tex: '2x - 4 = 0' }], NOW);
    const out = promoteLeadingResolveToPose(ledger, [{ action: 'resolve', tex: '2x = 4' }]);
    expect(out[0].action).toBe('resolve');
  });

  test('non-resolve heads and junk pass through untouched', () => {
    expect(promoteLeadingResolveToPose(null, [{ action: 'clear' }])).toEqual([{ action: 'clear' }]);
    expect(promoteLeadingResolveToPose(null, [])).toEqual([]);
    expect(promoteLeadingResolveToPose(null, null)).toEqual([]);
  });
});

describe('a voice-first session persists like a typed one', () => {
  test('cumulative mathSteps turns build one problem with steps, ghost included', () => {
    // Turn 1: problem posed by voice ("solve 2x minus 4 equals 0").
    let ledger = foldVoiceTurn(null, { mathSteps: [{ label: 'Given', latex: '2x - 4 = 0' }] });
    expect(ledger.current.problemTex).toBe('2x - 4 = 0');

    // Turn 2: voice re-sends the board CUMULATIVELY (its protocol) + new step.
    ledger = foldVoiceTurn(ledger, {
      mathSteps: [
        { label: 'Given', latex: '2x - 4 = 0' },
        { label: 'Add 4', latex: '2x = 4' },
      ],
    });
    // The cumulative re-send must not duplicate the problem into the steps…
    expect(ledger.current.problemTex).toBe('2x - 4 = 0');
    const stepTex = ledger.current.steps.map(c => c.tex);
    expect(stepTex).toContain('2x = 4');

    // …and the ghost the voice tutor reads matches what the student sees.
    const ghost = buildBoardStateBlock(ledger);
    expect(ghost).toContain('Problem in focus: 2x - 4 = 0');
    expect(ghost).toContain('2x = 4');

    // A later chat reload replays it like any typed problem.
    const turns = ledgerToTurns(JSON.parse(JSON.stringify(ledger)));
    expect(turns[turns.length - 1][0]).toEqual({ action: 'pose', tex: '2x - 4 = 0' });
  });

  test('graph steps from voice visuals survive the fold', () => {
    let ledger = foldVoiceTurn(null, {
      mathSteps: [
        { label: 'Given', latex: 'y = x^2' },
        { visual: { fn: 'x^2', caption: 'the parabola' } },
      ],
    });
    expect(ledger.current.steps.some(c => c.action === 'graph' && c.fn === 'x^2')).toBe(true);
  });

  test('board-actions mode: WRITE lines fold; narration and annotations do not', () => {
    const ledger = foldVoiceTurn(null, {
      boardActions: [
        { type: 'write', text: '3x + 1 = 10' },
        { type: 'write', text: 'nice work today' },   // prose — not board math
        { type: 'circle', objectId: 'obj1' },          // annotation — dropped
      ],
    });
    expect(ledger.current.problemTex).toBe('3x + 1 = 10');
    expect(ledger.current.steps).toHaveLength(0);
  });
});

describe('cumulative re-sends never duplicate ledger lines', () => {
  const { dedupeCumulativeResolves } = require('../../utils/pipeline/boardLedger');

  function foldVoiceTurnDeduped(ledger, payload) {
    let cmds = voiceToBoardCommands(payload);
    cmds = promoteLeadingResolveToPose(ledger, cmds);
    cmds = dedupeCumulativeResolves(ledger, cmds);
    if (!cmds.length) return ledger;
    return applyTurnToLedger(ledger, cmds, NOW, {});
  }

  test('three cumulative turns → one problem, each step exactly once', () => {
    const t1 = [{ label: 'Given', latex: '2x - 4 = 0' }];
    const t2 = t1.concat([{ label: 'Add 4', latex: '2x = 4' }]);
    const t3 = t2.concat([{ label: 'Divide', latex: 'x = 2' }]);

    let ledger = null;
    for (const steps of [t1, t2, t3]) ledger = foldVoiceTurnDeduped(ledger, { mathSteps: steps });

    expect(ledger.current.problemTex).toBe('2x - 4 = 0');
    expect(ledger.current.steps.map(c => c.tex)).toEqual(['2x = 4', 'x = 2']);
  });

  test('a small-talk turn (prior board re-sent unchanged) folds nothing', () => {
    let ledger = foldVoiceTurnDeduped(null, { mathSteps: [{ latex: '2x - 4 = 0' }, { latex: '2x = 4' }] });
    const before = JSON.parse(JSON.stringify(ledger));
    ledger = foldVoiceTurnDeduped(ledger, { mathSteps: [{ latex: '2x - 4 = 0' }, { latex: '2x = 4' }] });
    expect(ledger.current.steps).toEqual(before.current.steps);
  });

  test('graph/clear commands pass through the dedupe untouched', () => {
    const ledger = { current: { problemTex: 'y=x^2', steps: [] }, completed: [] };
    const out = dedupeCumulativeResolves(ledger, [{ action: 'graph', fn: 'x^2' }, { action: 'clear' }]);
    expect(out).toHaveLength(2);
  });
});
