/**
 * Retest of the live site, 2026-11-26 (board on). Four ways the board lost the
 * student's problem or left a solved one open, each reproduced from that
 * session's stored turns:
 *
 *   - "solve \(x^{2}\) - 5x - 14 = 0" was posed as "- 5x - 14 = 0";
 *   - the tutor's parallel example replaced the student's problem;
 *   - an equation nobody wrote was posed beside the student's own;
 *   - a confirmed derivative never closed its card ("Not finished yet").
 */

const { synthesizeBoardCommands } = require('../../../utils/pipeline/boardSynthesizer');
const { settleBoardTurn } = require('../../../utils/pipeline/boardSettle');

const shape = (cmds) => cmds.map((c) => [c.action, c.tex || null]);

describe('a problem typed in the math field is read whole', () => {
  test('the quadratic keeps its x^2', () => {
    const cmds = synthesizeBoardCommands({
      studentMessage: 'i already solved it. next one: solve \\(x^{2}\\) - 5x - 14 = 0',
      tutorResponse: 'You’ve set up the quadratic \\(x^2-5x-14=0\\). What two numbers multiply to \\(-14\\) and add to \\(-5\\)?',
      lastBoardAction: 'verify',
      pinnedProblem: null,
      recentAssistantMessages: [],
    });
    const pose = cmds.find((c) => c.action === 'pose');
    expect(pose.tex.replace(/\s+/g, '')).toBe('x^2-5x-14=0');
  });

  test('a plain-text problem is unchanged', () => {
    const cmds = synthesizeBoardCommands({
      studentMessage: 'next one: solve 3(x-4) = 2x + 5',
      tutorResponse: 'What’s your first move to open up the parentheses?',
      lastBoardAction: 'verify',
      pinnedProblem: null,
      recentAssistantMessages: [],
    });
    expect(cmds.find((c) => c.action === 'pose').tex).toBe('3(x-4) = 2x + 5');
  });
});

describe('the problem in focus stays the student\'s', () => {
  const open = { pinTex: 'x^2-5x-14=0', lastBoardAction: 'pose', ledger: { current: { problemTex: 'x^2-5x-14=0', steps: [] }, completed: [] } };

  test('a parallel example is an example card: the pin and the ledger do not move', () => {
    const s = settleBoardTurn({
      ...open,
      commands: [{ action: 'clear' }, { action: 'pose', tex: 'x^2-3x-10=0' }],
      message: 'idk how to start, can you just tell me the answer',
      tutorText: 'Let’s use a similar quadratic with smaller numbers first: \\(x^2-3x-10=0\\). What two numbers multiply to \\(-10\\) and add to \\(-3\\)? Then we’ll bring that strategy back to your equation.',
    });
    expect(shape(s.commands)).toEqual([['example', 'x^2-3x-10=0']]);
    expect(s.pin).toBe('keep');
    expect(s.ledger.current.problemTex).toBe('x^2-5x-14=0');
    expect(s.ledger.completed).toHaveLength(0);
    expect(s.events.examples).toEqual(['x^2-3x-10=0']);
  });

  test('a new problem the STUDENT brings still replaces it, example words or not', () => {
    const s = settleBoardTurn({
      ...open,
      commands: [{ action: 'clear' }, { action: 'pose', tex: '2x + 3 = 11' }],
      message: 'forget that. similar one from my homework: solve 2x + 3 = 11',
      tutorText: 'Sure — here is a similar example to start: \\(2x+3=11\\). What comes first?',
    });
    expect(shape(s.commands)).toEqual([['clear', null], ['pose', '2x + 3 = 11']]);
    expect(s.pin).toEqual({ tex: '2x + 3 = 11' });
  });

  test('a tutor-posed new problem with nothing open is a pose, as before', () => {
    const s = settleBoardTurn({
      commands: [{ action: 'pose', tex: '2x^2+5x-3=0' }],
      message: 'ok give me another',
      tutorText: 'Here’s a similar one: \\(2x^2+5x-3=0\\).',
      pinTex: null, lastBoardAction: 'verify', ledger: null,
    });
    expect(shape(s.commands)).toEqual([['pose', '2x^2+5x-3=0']]);
  });

  test('without example framing, the tutor moving on to a new problem is a pose', () => {
    const s = settleBoardTurn({
      ...open,
      commands: [{ action: 'clear' }, { action: 'pose', tex: 'x^2-9=0' }],
      message: 'can we do a different one',
      tutorText: 'Sure, let’s switch. Try this one: \\(x^2-9=0\\).',
    });
    expect(s.pin).toEqual({ tex: 'x^2-9=0' });
  });
});

describe('one new problem per turn, and it is one somebody posed', () => {
  test('an equation in nobody\'s words is dropped beside the student\'s own', () => {
    const s = settleBoardTurn({
      commands: [{ action: 'clear' }, { action: 'pose', tex: '2(x + 3) = 14' }, { action: 'pose', tex: '3(x-4) = 2x + 5' }],
      message: 'next one: solve 3(x-4) = 2x + 5',
      tutorText: 'You’ve got the new equation. What’s your first move to open up the parentheses?',
      pinTex: null, lastBoardAction: 'verify', ledger: null,
    });
    expect(shape(s.commands)).toEqual([['clear', null], ['pose', '3(x-4) = 2x + 5']]);
    expect(s.events.ungroundedPoses).toEqual(['2(x + 3) = 14']);
    expect(s.ledger.completed).toHaveLength(0);
  });

  test('a single pose that paraphrases a word problem is kept', () => {
    const s = settleBoardTurn({
      commands: [{ action: 'pose', tex: '24 - \\frac{1}{3} \\cdot 24' }],
      message: 'Sara has 24 stickers and gives 1/3 of them to her brother. how many does she have left?',
      tutorText: 'Sara starts with \\(24\\) stickers and gives away \\(\\frac{1}{3}\\) of them.',
      pinTex: null, lastBoardAction: 'verify', ledger: null,
    });
    expect(shape(s.commands)).toEqual([['pose', '24 - \\frac{1}{3} \\cdot 24']]);
  });
});

describe('an expression answer closes its card when it answers the board problem', () => {
  const turn = (diagnosis) => synthesizeBoardCommands({
    studentMessage: 'product rule: 2x sin(x) + \\(x^{2}\\) cos(x)',
    tutorResponse: 'That’s correct. You used the product rule in the right order.',
    lastBoardAction: 'pose',
    pinnedProblem: 'f(x)=x^2\\sin(x)',
    observation: { answer: { value: '2x sin(x) + x^{2} cos(x)' } },
    diagnosis,
    recentAssistantMessages: [],
  });

  test('verified against the board problem: verify', () => {
    const cmds = turn({ isCorrect: true, verificationSource: 'llm', answersBoardProblem: true });
    expect(shape(cmds)).toEqual([['verify', '2x sin(x) + x^{2} cos(x)']]);
    const s = settleBoardTurn({ commands: cmds, message: '', tutorText: '', pinTex: 'f(x)=x^2\\sin(x)', lastBoardAction: 'pose', ledger: { current: { problemTex: 'f(x)=x^2\\sin(x)', steps: [] }, completed: [] } });
    expect(s.lastBoardAction).toBe('verify');
    expect(s.pin).toBeNull();
  });

  test('correct for a sub-question only: the card stays open', () => {
    expect(turn({ isCorrect: true, verificationSource: 'llm' })).toEqual([]);
  });

  test('not correct: nothing', () => {
    expect(turn({ isCorrect: false, verificationSource: 'llm', answersBoardProblem: true })).toEqual([]);
  });
});

// Owner, 2026-11-26: "No inline cards when the board is active and showing."
// jest has no DOM here, so this pins the contract between the two files; the
// behaviour itself was checked in the browser against the live page's DOM.
describe('no inline cards while the board is showing', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '../../../public/css/living-workspace.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../../../public/js/living-workspace/chat-workspace.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../../public/chat.html'), 'utf8');

  test('sealed cards are hidden while the board is showing — and only then', () => {
    expect(css).toMatch(/body\.mm-board-showing #chat-messages-container \.lws-sealed \{ display: none; \}/);
    // No unconditional hide: with the board hidden or idle the transcript is the record.
    expect(css).not.toMatch(/^\.lws-sealed \{[^}]*display: none/m);
  });

  test('"showing" is work on the board AND not hidden, and both changes re-check it', () => {
    expect(js).toMatch(/var on = body\.contains\('mm-board-up'\) && !!slot && !slot\.classList\.contains\('is-collapsed'\);/);
    expect(js).toMatch(/body\.toggle\('mm-board-showing', on\)/);
    // The board going up or idle…
    expect(js).toMatch(/classList\.toggle\('mm-board-up', up\);\s*syncBoardShowing\(\);/);
    // …and the dock being hidden or shown, by the button or the phone swipe.
    expect(js).toMatch(/new MutationObserver\(syncBoardShowing\)\.observe\(slot/);
  });

  test('cards are still sealed, so hiding the board brings the record back', () => {
    expect(js).toMatch(/function sealToTranscript\(entry\)/);
    expect(js).toMatch(/placeSealed\(node, entry\.completedAt\)/);
  });

  test('the page asks for the same build of the script that the script asks of its modules', () => {
    const inPage = html.match(/chat-workspace\.js\?v=([\w]+)/)[1];
    const inScript = js.match(/var ASSET_V = '\?v=([\w]+)'/)[1];
    expect(inPage).toBe(inScript);
  });
});
