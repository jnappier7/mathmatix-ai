/**
 * A new problem gets a new card in a voice call.
 *
 * Owner, 2026-11-28: "the board doesn't refresh for a new problem. I did about
 * 4 problems and was on line 23."
 *
 * Voice sends the board as a list of lines and the translator made every one
 * a `resolve` — another step of the card in focus. Nothing told the client a
 * problem had changed, so one card took every line of every problem.
 * utils/voiceBoardCards.js sorts each line onto a card by the math; these
 * replay whole calls through it and through the real ledger.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { cardVoiceLines, sameWork, givenTexes } = require('../../utils/voiceBoardCards');
const { applyTurnToLedger } = require('../../utils/pipeline/boardLedger');
const { voiceToBoardCommands } = require('../../public/js/living-workspace/dom/voiceBoardTranslate');

// A call: each turn is the tutor's whole <math> array, as the model sends it.
function call(turns) {
  let ledger = null;
  const sent = [];
  for (const steps of turns) {
    const mathSteps = steps.map(s => (typeof s === 'string' ? { latex: s } : s));
    const cmds = cardVoiceLines(ledger, voiceToBoardCommands({ mathSteps }), { given: givenTexes(mathSteps) });
    sent.push(cmds.map(c => c.action + ' ' + c.tex));
    ledger = applyTurnToLedger(ledger, cmds, new Date(), {});
  }
  return { sent, ledger };
}
const G = tex => ({ label: 'Given', latex: tex });

describe('four problems are four cards', () => {
  test('the owner\'s call: each new problem opens its own card', () => {
    const { sent, ledger } = call([
      [G('3x + 5 = 20')],
      [G('3x + 5 = 20'), '3x = 15'],
      [G('3x + 5 = 20'), '3x = 15', 'x = 5'],
      [G('2x - 4 = 10')],
      [G('2x - 4 = 10'), '2x = 14', 'x = 7'],
      [G('5x = 30')],
      [G('5x = 30'), 'x = 6'],
      [G('4x + 1 = 13')],
      [G('4x + 1 = 13'), '4x = 12'],
    ]);
    expect(sent.flat().filter(l => l.startsWith('pose '))).toEqual([
      'pose 3x + 5 = 20', 'pose 2x - 4 = 10', 'pose 5x = 30', 'pose 4x + 1 = 13',
    ]);
    expect(ledger.completed.map(c => c.problemTex)).toEqual(['3x + 5 = 20', '2x - 4 = 10', '5x = 30']);
    expect(ledger.current.problemTex).toBe('4x + 1 = 13');
    expect(ledger.current.steps.map(s => s.tex)).toEqual(['4x = 12']);
  });

  test('the tutor never starts a fresh array: one growing list is still four cards', () => {
    // The model's own rule is "the math array is the cumulative board", and a
    // small model applies it across problems too. No label says "new".
    const a = ['3x + 5 = 20', '3x = 15', 'x = 5'];
    const b = a.concat(['2x - 4 = 10', '2x = 14', 'x = 7']);
    const c = b.concat(['5x = 30', 'x = 6']);
    const d = c.concat(['4x + 1 = 13', '4x = 12']);
    const { sent, ledger } = call([a.slice(0, 1), a.slice(0, 2), a, b.slice(0, 4), b, c, d]);
    expect(sent.flat().filter(l => l.startsWith('pose '))).toEqual([
      'pose 3x + 5 = 20', 'pose 2x - 4 = 10', 'pose 5x = 30', 'pose 4x + 1 = 13',
    ]);
    expect(ledger.completed).toHaveLength(3);
    // A finished card's lines, sent again every turn, never come back.
    expect(sent[6]).toEqual(['pose 4x + 1 = 13', 'resolve 4x = 12']);
  });

  test('the answer closes the card: it is a verify, and the ledger calls it solved', () => {
    const { sent, ledger } = call([['3x + 5 = 20'], ['3x + 5 = 20', '3x = 15', 'x = 5'], ['2x = 8']]);
    expect(sent[1]).toEqual(['resolve 3x = 15', 'verify x = 5']);
    expect(ledger.completed[0].solved).toBe(true);
  });

  test('a new problem with the SAME answer still gets its own card once the last is solved', () => {
    // Every linear equation with root 5 is proportional to x − 5.
    const { sent } = call([['3x + 5 = 20'], ['3x + 5 = 20', 'x = 5'], ['2x = 10']]);
    expect(sent[2]).toEqual(['pose 2x = 10']);
  });
});

describe('one problem stays one card', () => {
  test('a linear solve, restated and rearranged', () => {
    const { sent, ledger } = call([
      ['5(x + 2) - 3x = 26'],
      ['5(x + 2) - 3x = 26', '5x + 10 - 3x = 26', '2x + 10 = 26'],
      ['5(x + 2) - 3x = 26', '5x + 10 - 3x = 26', '2x + 10 = 26', '2x = 16', '16 = 2x'],
    ]);
    expect(sent.flat().filter(l => l.startsWith('pose '))).toEqual(['pose 5(x + 2) - 3x = 26']);
    expect(ledger.completed).toHaveLength(0);
  });

  test('a quadratic: its factors and both roots are lines of it', () => {
    const { sent } = call([
      ['x^2 - 5x + 6 = 0'],
      ['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0', 'x - 2 = 0', 'x = 2', 'x - 3 = 0', 'x = 3'],
    ]);
    expect(sent[1].every(l => l.startsWith('resolve '))).toBe(true);
    expect(sent[1]).toHaveLength(5);
  });

  test('the check after the answer stays on the card', () => {
    const { sent } = call([['3x + 5 = 20'], ['3x + 5 = 20', 'x = 5', '3(5) + 5 = 20']]);
    expect(sent[1]).toEqual(['verify x = 5', 'resolve 3(5) + 5 = 20']);
  });

  test('arithmetic: unequal parts of the work are never a new problem', () => {
    const { sent } = call([
      [G('3/4 + 1/8')],
      [G('3/4 + 1/8'), '3/4 = 6/8', '6/8 + 1/8', '7/8'],
    ]);
    expect(sent.flat().filter(l => l.startsWith('pose '))).toEqual(['pose 3/4 + 1/8']);
  });

  test('…and there the tutor\'s "Given" is what opens the next card', () => {
    const { sent, ledger } = call([
      [G('3/4 + 1/8')], [G('3/4 + 1/8'), '7/8'],
      [G('2/3 + 1/6')], [G('2/3 + 1/6'), '5/6'],
    ]);
    expect(sent[2]).toEqual(['pose 2/3 + 1/6']);
    expect(ledger.completed.map(c => c.problemTex)).toEqual(['3/4 + 1/8']);
  });

  test('the same board sent again draws nothing', () => {
    const { sent } = call([['2x = 4'], ['2x = 4'], ['2x = 4']]);
    expect(sent).toEqual([['pose 2x = 4'], [], []]);
  });

  test('a line it cannot read stays on the card', () => {
    const { sent } = call([['3x + 5 = 20'], ['3x + 5 = 20', '\\text{subtract 5 from both sides}']]);
    expect(sent[1]).toHaveLength(1);
    expect(sent[1][0]).toMatch(/^resolve /);
  });
});

describe('sameWork: what counts as different', () => {
  test('only one-variable equations are ever called different', () => {
    expect(sameWork('3x + 5 = 20', '3x = 15')).toBe(true);
    expect(sameWork('3x + 5 = 20', '2x - 4 = 10')).toBe(false);      // another root
    expect(sameWork('3x + 5 = 20', '2y = 8')).toBe(false);           // another variable
    expect(sameWork('3x + 5 = 20', 'x^2 - 5x + 6 = 0')).toBe(false);
    expect(sameWork('x^2 - 5x + 6 = 0', 'x = 2')).toBe(true);        // a root of it
    expect(sameWork('3/4 + 1/8', '2/3 + 1/6')).toBe(null);
    expect(sameWork('2(x + 3) + 4x', '2x + 6')).toBe(null);
    expect(sameWork('2(x + 3) + 4x', '6x + 6')).toBe(true);
    expect(sameWork('y = 2x + 1', 'x + y = 7')).toBe(null);          // a system
    expect(sameWork('3x + 5 = 20', 'not math at all')).toBe(null);
  });
});

describe('the wiring: one list, sent and remembered', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '../..', ...p), 'utf8');
  const vs = read('utils/voiceSession.js');

  test('the server sends the cards in response_final and folds the SAME list', () => {
    expect(vs).toMatch(/const boardCommands = this\._cardCommands\(mathStepsForBoard, boardActionsForFinal\);/);
    expect(vs).toMatch(/type: 'response_final',\s*turnId: turn\.metric\.turnId,\s*boardCommands,/);
    expect(vs).toMatch(/this\._foldBoard\(boardCommands, \{ mathSteps: mathStepsForBoard, boardActions: boardActionsForFinal \}\);/);
    expect(vs).toMatch(/return cardVoiceLines\(this\.boardLedger, cmds, \{ given: givenTexes\(mathSteps\) \}\);/);
  });

  test('an interrupted turn does the same, so the ledger matches what was drawn', () => {
    const fn = vs.slice(vs.indexOf('_sendInterruptedFinal(turn) {'), vs.indexOf('// ─── The board as cards'));
    expect(fn).toMatch(/const boardCommands = this\._cardCommands\(mathSteps, boardActions\);\s*this\._foldBoard\(boardCommands\);/);
    expect(fn).toMatch(/boardCommands,/);
  });

  test('the client draws the server\'s cards instead of translating the raw lines', () => {
    expect(read('public/js/voice-stream-client.js')).toMatch(/boardCommands: msg\.boardCommands,/);
    const vc = read('public/js/voice-controller.js');
    expect(vc).toMatch(/if \(this\._lwsOwnsBoard\(\) && Array\.isArray\(ev\.boardCommands\)\) \{[\s\S]*?window\.LWS_CHAT\.applyBoardCommands\(ev\.boardCommands\);/);
  });

  test('the tutor is told a new problem is a new array', () => {
    expect(vs).toMatch(/A NEW problem starts a NEW array/);
  });
});
