/**
 * Fill-in boxes are retired.
 *
 * Owner, 2026-11-28, with a screenshot of "[ ] = 5π/6" above a unit circle:
 * "Those fill ins are weird and don't really work. Let's either retire them or
 * make them better."
 *
 * A `scaffold` card was a line with an empty \boxed{} the student tapped and
 * typed into. It was removed once (2026-07-25), brought back three days later,
 * and then needed a rule for every way it went wrong: the blank on the wrong
 * side, a given blanked while the answer showed, "?" as the unknown, a box
 * with no caption. The screenshot broke two of those rules and shipped anyway;
 * with the board off, or in a voice call, there was nothing to type into.
 *
 * Retired means three things, each pinned here:
 *   1. no prompt or schema offers the tutor a fill-in;
 *   2. the server drops one that arrives anyway;
 *   3. the board does not draw one, including on boards saved before this.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '../..', ...p), 'utf8');

describe('1. the tutor is not offered a fill-in', () => {
  const { BOARD_ACTIONS, MODEL_BOARD_ACTIONS, BOARD_COMMAND_SCHEMA } = require('../../utils/boardResponseSchema');

  test('the model-facing action list has no scaffold; the stored one still reads old boards', () => {
    expect(MODEL_BOARD_ACTIONS).not.toContain('scaffold');
    expect(BOARD_ACTIONS).toContain('scaffold');
    expect(MODEL_BOARD_ACTIONS).toEqual(BOARD_ACTIONS.filter(a => a !== 'scaffold'));
  });

  test('structured output, the board tool and the translator all use that list', () => {
    expect(JSON.stringify(BOARD_COMMAND_SCHEMA)).not.toMatch(/"scaffold"/);
    const { BOARD_TOOL } = require('../../utils/boardTools');
    expect(BOARD_TOOL.function.parameters.properties.commands.items.properties.action.enum).not.toContain('scaffold');
    const { allowedBoardActionsFor } = require('../../utils/pipeline/boardLlm');
    for (const move of ['guide_incorrect', 'guided_practice', 'scaffold_down', 'worked_example', 'confirm_correct']) {
      expect(allowedBoardActionsFor(move)).not.toContain('scaffold');
    }
  });

  test.each([
    ['inline tags', 'utils/promptCompact.js'],
    ['structured output', 'utils/boardResponseSchema.js'],
    ['the board tool', 'utils/boardTools.js'],
    ['the board translator', 'utils/pipeline/boardLlm.js'],
  ])('%s: no fill-in card is described, and the tutor is told there are none', (_name, file) => {
    const src = read(file);
    expect(src).not.toMatch(/action\s*[:=]\s*\\?["']scaffold\\?["']/);
    expect(src).not.toMatch(/MUST contain (?:at least one|an) empty/);
    expect(src).toMatch(/NO FILL-IN BOXES|NO fill-in cards/);
  });
});

describe('2. the server drops one that arrives anyway', () => {
  const { settleBoardTurn, dropFillIns } = require('../../utils/pipeline/boardSettle');
  const fillIn = { action: 'scaffold', tex: '\\boxed{} = \\frac{5\\pi}{6}' };

  test('dropFillIns removes the card whole and says how many', () => {
    const out = dropFillIns([{ action: 'pose', tex: '2x = 4' }, fillIn, { action: 'graph', fn: 'x^2' }]);
    expect(out.commands.map(c => c.action)).toEqual(['pose', 'graph']);
    expect(out.dropped).toBe(1);
    expect(dropFillIns(null)).toEqual({ commands: [], dropped: 0 });
  });

  test('the owner\'s card: the fill-in goes, the picture beside it stays', () => {
    const settled = settleBoardTurn({
      commands: [fillIn, { action: 'image', query: 'unit circle' }],
      message: 'what is 150 degrees in radians',
    });
    expect(settled.commands.map(c => c.action)).toEqual(['image']);
  });

  test('nothing of it reaches the ledger', () => {
    const settled = settleBoardTurn({
      commands: [{ action: 'pose', tex: '2x + 4 = 20' }, { action: 'scaffold', tex: '2x = \\boxed{}' }],
      message: 'solve 2x + 4 = 20',
    });
    expect(JSON.stringify(settled.ledger)).not.toMatch(/scaffold|boxed/);
  });

  test('the pipeline drops it with or without a conversation to settle against', () => {
    const src = read('utils/pipeline/index.js');
    const drop = src.indexOf('const fill = dropFillIns(verified.boardCommands);');
    const settle = src.indexOf('const settled = settleBoardTurn({');
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(settle);
    // …and before the `if (ctx.conversation)` that guards the settle.
    expect(src.slice(drop, settle)).toMatch(/if \(ctx\.conversation\) \{/);
  });
});

describe('3. the board does not draw one', () => {
  const dv = read('public/js/living-workspace/dom/derivationView.js');
  const cw = read('public/js/living-workspace/chat-workspace.js');

  test('no tappable blank, no input, no submit event', () => {
    expect(dv).not.toMatch(/prototype\._wireBlanks/);
    expect(dv).not.toMatch(/lws-blank-input|lws:blank-submit|Fill in the blank/);
    expect(cw).not.toMatch(/lws:blank-submit/);
  });

  test('a fill-in on a board saved before this is skipped, not drawn empty', () => {
    const addRow = dv.slice(dv.indexOf('DerivationView.prototype._addRow = '));
    expect(addRow).toMatch(/if \(kind === 'scaffold'\) return;/);
    // Skipped inside _addRow, AFTER the caller counted it, so later lines
    // keep the step numbers the tutor's "look at step N" refers to.
    expect(addRow.indexOf("if (kind === 'scaffold') return;")).toBeLessThan(addRow.indexOf("spine.className = 'lws-step-spine'"));
  });

  test('the page loads the version that carries it', () => {
    const v = (cw.match(/var ASSET_V = '\?v=([^']+)'/) || [])[1];
    expect(read('public/chat.html')).toContain('chat-workspace.js?v=' + v);
    expect(v >= '20261128a').toBe(true);
  });
});
