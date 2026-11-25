/**
 * The Work Board keeps up with a solve (2026-11-24).
 *
 * Owner, on a preview account: "Work board stops updating after a couple of
 * steps. Or maybe doesn't understand simplification and distribution as a
 * step." Both were the pedagogy guard, and both were silent — a dropped card
 * is a log line, never an error:
 *
 *   1. A student who gives only the side that changed ("6x + 7") is answered
 *      with the whole line ("6x + 7 = 2x + 31"). The guard matched each side
 *      against the student's last TWO messages, so the untouched side was
 *      found only while the problem statement was still in that window — the
 *      first step or two landed and every later one was dropped.
 *   2. A student who names the move ("distribute the 3", "combine like
 *      terms") got its label and never its line.
 *
 * What must NOT change: the answer never reaches the board unless the student
 * states it, and one move puts one line on the board.
 */
process.env.WORK_BOARD = 'on';

const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');
const { RESOLVE_RULE, MIRROR_RULE } = require('../../utils/boardStepRule');

const PROBLEM = '3(2x + 4) - 5 = 2x + 31';
const A = (op) => ({ action: 'apply', op });
const R = (tex) => ({ action: 'resolve', tex });
const POSE = (tex) => ({ action: 'pose', tex });

// Play a conversation the way the pipeline does: each turn the guard sees the
// student's message, their earlier messages, and the lines already on the card.
function play(turns, problem = PROBLEM) {
  const msgs = [];
  const lines = [];
  let last = null;
  return turns.map(([student, commands]) => {
    const r = enforcePedagogyRule({
      commands,
      userMessage: student,
      recentUserMessages: msgs.slice(),
      lastBoardActionInConversation: last,
      pinnedProblemTex: problem,
      focusProblemTex: problem,
      boardLines: lines.slice(),
    });
    r.allowed.forEach((c) => { if (c.action === 'resolve') lines.push(c.tex); });
    if (r.allowed.length) last = r.allowed[r.allowed.length - 1].action;
    msgs.push({ role: 'user', content: student });
    return {
      kept: r.allowed.map((c) => (c.tex ? `${c.action}:${c.tex}` : c.action)),
      dropped: r.dropped.map((d) => `${d.command.action}:${d.reason}`),
    };
  });
}

describe('the student gives the side that changed', () => {
  const out = play([
    ['help me solve 3(2x+4) - 5 = 2x + 31', [POSE(PROBLEM)]],
    ['6x + 12 - 5', [A('distribute the 3'), R('6x + 12 - 5 = 2x + 31')]],
    ['6x + 7', [A('combine like terms'), R('6x + 7 = 2x + 31')]],
    ['now its 4x + 7', [A('subtract 2x from both sides'), R('4x + 7 = 31')]],
    ['4x = 24', [R('4x = 24')]],
    ['6', [R('x = 6')]],
  ]);

  test('every line lands — including the ones past the two-message window', () => {
    expect(out[1].kept).toContain('resolve:6x + 12 - 5 = 2x + 31');
    // The step that used to be the first one lost: "2x + 31" is no longer in
    // the student's last two messages, only on the board.
    expect(out[2].kept).toContain('resolve:6x + 7 = 2x + 31');
    expect(out[4].kept).toContain('resolve:4x = 24');
    expect(out[5].kept).toContain('resolve:x = 6');
  });

  test('a side that is on NEITHER the board nor in their message is still refused', () => {
    // They said "4x + 7"; the 31 is new — the tutor did that subtraction.
    expect(out[3].kept).not.toContain('resolve:4x + 7 = 31');
  });

  test('the label follows its line: the student did the move, so naming it reveals nothing', () => {
    expect(out[1].kept[0]).toBe('apply');
    expect(out[2].kept[0]).toBe('apply');
    expect(out[1].dropped).toEqual([]);
  });

  test('…and a label whose line is refused goes with it', () => {
    expect(out[3].kept).toEqual([]);
    expect(out[3].dropped).toContain('apply:apply_op_not_in_student_message');
  });
});

describe('the student names the move', () => {
  const out = play([
    ['help me solve 3(2x+4) - 5 = 2x + 31', [POSE(PROBLEM)]],
    ['distribute the 3', [A('distribute the 3'), R('6x + 12 - 5 = 2x + 31')]],
    ['combine like terms', [A('combine like terms'), R('6x + 7 = 2x + 31')]],
    ['subtract 2x from both sides', [A('subtract 2x from both sides'), R('4x + 7 = 31')]],
    ['subtract 7', [A('subtract 7 from both sides'), R('4x = 24')]],
    ['divide by 4', [A('divide both sides by 4'), R('x = 6')]],
  ]);

  test('distribution and simplification are steps: each named move lands its line', () => {
    expect(out[1].kept).toEqual(['apply', 'resolve:6x + 12 - 5 = 2x + 31']);
    expect(out[2].kept).toEqual(['apply', 'resolve:6x + 7 = 2x + 31']);
    expect(out[3].kept).toEqual(['apply', 'resolve:4x + 7 = 31']);
    expect(out[4].kept).toEqual(['apply', 'resolve:4x = 24']);
  });

  test('the ANSWER never lands on a named move — the student states it', () => {
    expect(out[5].kept).toEqual(['apply']);
    expect(out[5].dropped).toEqual(['resolve:resolve_tex_not_in_student_message']);
  });
});

describe('what the board still refuses', () => {
  test('"divide by 2" on 2x = 4 does not put x = 2 on the board', () => {
    // The old per-side match passed this: "x" from the problem the student
    // typed a message ago, "2" from the move they named.
    const out = play([
      ['help me solve 2x = 4', [POSE('2x = 4')]],
      ['divide by 2', [A('divide both sides by 2'), R('x = 2')]],
    ], '2x = 4');
    expect(out[1].kept).toEqual(['apply']);
  });

  test('a number the student STATES is theirs, in any ordinary phrasing', () => {
    ['2', 'x = 2', 'its 2', 'so x is 2', 'i got 2', 'divide by 2 and you get 2'].forEach((said) => {
      const out = play([['help me solve 2x = 4', [POSE('2x = 4')]], [said, [R('x = 2')]]], '2x = 4');
      expect([said, out[1].kept]).toEqual([said, ['resolve:x = 2']]);
    });
  });

  test('one move, one line: the tutor cannot run the rest of the solve off one named move', () => {
    const out = play([
      ['solve 3(2x+4) - 5 = 2x + 31', [POSE(PROBLEM)]],
      ['distribute', [A('distribute the 3'), R('6x + 12 - 5 = 2x + 31'), R('6x + 7 = 2x + 31'), R('4x = 24'), R('x = 6')]],
    ]);
    expect(out[1].kept).toEqual(['apply', 'resolve:6x + 12 - 5 = 2x + 31']);
    expect(out[1].dropped).toHaveLength(3);
  });

  test('no move named, no line: "ok" and "what do i do" land nothing', () => {
    const out = play([
      ['solve 3(2x+4) - 5 = 2x + 31', [POSE(PROBLEM)]],
      ['ok', [R('6x + 12 - 5 = 2x + 31')]],
      ['what do i do next', [R('6x + 12 - 5 = 2x + 31')]],
    ]);
    expect(out[1].kept).toEqual([]);
    expect(out[2].kept).toEqual([]);
  });

  test('a line that is not this equation is refused even on a named move', () => {
    const out = play([
      ['solve 3(2x+4) - 5 = 2x + 31', [POSE(PROBLEM)]],
      ['distribute the 3', [A('distribute the 3'), R('6x + 4 - 5 = 2x + 31')]],   // a wrong distribution
      ['subtract 7', [A('subtract 7'), R('5x = 100')]],                            // another problem entirely
    ]);
    expect(out[1].kept).toEqual(['apply']);
    expect(out[2].kept).toEqual(['apply']);
  });

  test('repeating the line already on the board is not a landing', () => {
    const out = play([
      ['solve 2x + 3 = 7', [POSE('2x + 3 = 7')]],
      ['hmm', []],
      ['ok', []],
      // (Two turns on, so the line is no longer something they just typed.)
      ['subtract 3', [A('subtract 3'), R('2x + 3 = 7')]],
    ], '2x + 3 = 7');
    expect(out[3].kept).toEqual(['apply']);
  });

  test('without the board\'s lines the guard is exactly as strict as before', () => {
    const r = enforcePedagogyRule({
      commands: [A('distribute the 3'), R('6x + 12 - 5 = 2x + 31')],
      userMessage: 'distribute the 3',
      recentUserMessages: [],
      lastBoardActionInConversation: 'pose',
    });
    expect(r.allowed.map((c) => c.action)).toEqual(['apply']);
  });
});

describe('one move, one label', () => {
  const { mergeWithLlmCommands, _detectAppliedOperation } = require('../../utils/pipeline/boardSynthesizer');

  test('the model\'s label and the synthesizer\'s label for the same move do not both land', () => {
    // Owner, 2026-11-25: "Distribute came up and distribute 3." The model said
    // "distribute the 3"; the synthesizer, matching the keyword, said
    // "distribute"; the merge compared exact text and kept both.
    const merged = mergeWithLlmCommands(
      [{ action: 'apply', op: 'distribute the 3' }, { action: 'resolve', tex: '6x + 12 - 5 = 2x + 31' }],
      [{ action: 'apply', op: 'distribute' }],
    );
    expect(merged.all.filter((c) => c.action === 'apply').map((c) => c.op)).toEqual(['distribute the 3']);
  });

  test('…however differently the two word it', () => {
    const merged = mergeWithLlmCommands(
      [{ action: 'apply', op: 'divide both sides by 4' }],
      [{ action: 'apply', op: 'divide by 4' }],
    );
    expect(merged.all.filter((c) => c.action === 'apply')).toHaveLength(1);
  });

  test('with no label from the model, the synthesizer\'s still lands — and the rest of its cards are untouched', () => {
    const merged = mergeWithLlmCommands(
      [{ action: 'resolve', tex: '2x = 4' }],
      [{ action: 'apply', op: 'subtract 3 from both sides' }, { action: 'resolve', tex: '2x = 4' }, { action: 'verify', tex: 'x = 2' }],
    );
    expect(merged.all.map((c) => c.action)).toEqual(['apply', 'resolve', 'verify']);
  });

  test('the synthesizer keeps WHAT is being distributed when the student says it', () => {
    expect(_detectAppliedOperation('distribute the 3')).toBe('distribute the 3');
    expect(_detectAppliedOperation('i would distribute 3 first')).toBe('distribute 3');
    expect(_detectAppliedOperation('distribute')).toBe('distribute');
    expect(_detectAppliedOperation('distribute first')).toBe('distribute');
  });
});

describe('the prompts say what the guard enforces — one wording, every board mode', () => {
  test('the rule names both cases and the one thing that never lands', () => {
    expect(RESOLVE_RULE).toMatch(/only the side that changed/);
    expect(RESOLVE_RULE).toMatch(/NAMED the move/);
    expect(RESOLVE_RULE).toMatch(/NEVER the final answer/);
    expect(MIRROR_RULE).toMatch(/never more than one new line per move/);
  });

  test('inline tags, structured output, the tool and the Board-LLM translator all carry it', () => {
    const fs = require('fs');
    const path = require('path');
    const src = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
    ['utils/promptCompact.js', 'utils/boardTools.js', 'utils/boardResponseSchema.js', 'utils/pipeline/boardLlm.js'].forEach((f) => {
      expect([f, /RESOLVE_RULE/.test(src(f))]).toEqual([f, true]);
      // …and none still tells the model the old rule the guard no longer enforces.
      expect([f, /tex is what THEY wrote|must be what the student wrote|an intermediate result the student stated/.test(src(f))]).toEqual([f, false]);
    });
  });

  test('the pipeline hands the guard the lines on the card', () => {
    const fs = require('fs');
    const path = require('path');
    const idx = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
    expect((idx.match(/boardLines: boardLinesInFocus/g) || []).length).toBe(2);
  });
});
