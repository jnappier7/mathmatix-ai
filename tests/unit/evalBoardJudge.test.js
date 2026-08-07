/**
 * Unit tests for tests/eval/boardJudge.js — the deterministic board-tag
 * integrity layer of the eval harness. These are the known-bad / known-good
 * fixtures proving the wiring: replies whose <BOARD> tags the REAL parser /
 * schema / pedagogy guard would kill must be flagged (dead card or ghost
 * board), clean protocol-following replies must pass.
 */
'use strict';

const { judgeBoardIntegrity } = require('../../tests/eval/boardJudge');

const judges = (reply, ctx) => judgeBoardIntegrity(reply, ctx).violations.map((v) => v.judge);

describe('boardJudge — clean replies pass', () => {
  test('no tags at all → no violations', () => {
    expect(judges('Nice — what would you try first?', { studentMessage: 'hi' })).toEqual([]);
  });

  test('pose on a fresh problem is always allowed', () => {
    const reply = 'Here is one: <BOARD action="pose" tex="2x + 4 = 20" /> What is your first move?';
    expect(judges(reply, { studentMessage: 'give me a problem' })).toEqual([]);
  });

  test('apply/resolve that trace to the student\'s words pass the guard', () => {
    const reply = 'Exactly. <BOARD action="apply" op="subtract 4 from both sides" /><BOARD action="resolve" tex="2x = 16" />';
    expect(judges(reply, { studentMessage: 'i would subtract 4 from both sides so 2x = 16' })).toEqual([]);
  });

  test('scaffold with a real blank and a caption passes', () => {
    const reply = 'Try filling this in: <BOARD action="scaffold" tex="2x = \\boxed{}" caption="What does 20 - 4 leave?" />';
    expect(judges(reply, { studentMessage: 'im stuck' })).toEqual([]);
  });

  test('graph/image reference cards are teaching aids and pass without a student-text match', () => {
    const reply = 'Look where it crosses zero. <BOARD action="graph" fn="x^2 - 4" caption="Roots" /><BOARD action="image" query="unit circle labeled" />';
    expect(judges(reply, { studentMessage: 'what does the graph look like?' })).toEqual([]);
  });
});

describe('boardJudge — dead tags (parser/schema rejects, student sees nothing)', () => {
  test('pose without tex fails to parse', () => {
    const reply = 'On the board: <BOARD action="pose" /> Let\'s go.';
    expect(judges(reply, { studentMessage: 'ok' })).toEqual(['deadBoardTag']);
  });

  test('invalid action fails to parse', () => {
    const reply = '<BOARD action="celebrate" tex="x = 8" /> You did it!';
    expect(judges(reply, { studentMessage: 'x = 8' })).toEqual(['deadBoardTag']);
  });

  test('graph without fn fails to parse', () => {
    const reply = '<BOARD action="graph" caption="the parabola" /> See it?';
    expect(judges(reply, { studentMessage: 'show me the graph' })).toEqual(['deadBoardTag']);
  });

  test('tex that sanitizes away to nothing is a dead card at the schema layer', () => {
    const reply = '<BOARD action="pose" tex="\\\\" /> Here we go.';
    expect(judges(reply, { studentMessage: 'ok' })).toEqual(['deadBoardTag']);
  });
});

describe('boardJudge — ghost board steps (guard drops, tutor believes it wrote them)', () => {
  test('resolve for a step the student never said is dropped (anti-cheat)', () => {
    const reply = 'So we get: <BOARD action="resolve" tex="2x = 16" /> Now divide.';
    expect(judges(reply, { studentMessage: 'idk what to do next' })).toEqual(['ghostBoardStep']);
  });

  test('apply for a move the student never named is dropped', () => {
    const reply = '<BOARD action="apply" op="divide both sides by 2" /> That isolates x.';
    expect(judges(reply, { studentMessage: 'im lost' })).toEqual(['ghostBoardStep']);
  });

  test('a "scaffold" with every term filled in is an answer dump and is dropped', () => {
    const reply = '<BOARD action="scaffold" tex="2x = 16" caption="See?" /> Fill it in.';
    expect(judges(reply, { studentMessage: 'help' })).toEqual(['ghostBoardStep']);
  });

  test('clear with no start-over signal is dropped — the student\'s board keeps the old work', () => {
    const reply = '<BOARD action="clear" /> Let me show a cleaner path.';
    expect(judges(reply, { studentMessage: 'wait im confused' })).toEqual(['ghostBoardStep']);
  });

  test('the immediately-prior student turn still licenses a confirmed move', () => {
    const reply = 'Right. <BOARD action="apply" op="subtract 4 from both sides" />';
    const ctx = {
      studentMessage: 'yes do that',
      priorUserMessages: [{ role: 'user', content: 'should i subtract 4 from both sides?' }],
    };
    expect(judges(reply, ctx)).toEqual([]);
  });

  test('confirmed-correct turns exempt mirror-rule drops (production synthesizes the verify card)', () => {
    const reply = '-28 is right! <BOARD action="apply" op="add 6 to both sides" /><BOARD action="resolve" tex="x = -28" />';
    expect(judges(reply, { studentMessage: '-28', studentWasCorrect: true })).toEqual([]);
    // Same reply without the verified-correct context is still a ghost board.
    expect(judges(reply, { studentMessage: '-28' })).toEqual(['ghostBoardStep', 'ghostBoardStep']);
  });

  test('the exemption never covers scaffold defects — an answer-dump scaffold fails even on a correct turn', () => {
    const reply = '<BOARD action="scaffold" tex="2x = 16" caption="See?" />';
    expect(judges(reply, { studentMessage: 'x = 8', studentWasCorrect: true })).toEqual(['ghostBoardStep']);
  });

  test('a mixed reply reports each failure once and lets the clean cards through', () => {
    const reply = [
      '<BOARD action="pose" tex="3x - 6 = 9" />',           // fine
      '<BOARD action="resolve" tex="3x = 15" />',           // ghost: student never said it
      '<BOARD action="graph" />',                           // dead: no fn
    ].join(' ');
    const out = judgeBoardIntegrity(reply, { studentMessage: 'give me one' });
    expect(out.violations.map((v) => v.judge).sort()).toEqual(['deadBoardTag', 'ghostBoardStep']);
    expect(out.commands.map((c) => c.action)).toEqual(['pose', 'resolve']);
  });
});
