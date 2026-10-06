/**
 * The Work Board is OFF by default (2026-10): the tutor writes the math in its
 * message and the derivation dock never mounts. One env var, WORK_BOARD, is the
 * whole switch — the server reads it for the prompt (utils/featureFlags.js
 * isWorkBoardEnabled) and the client reads the same value through
 * /api/features.js for the dock, so the two cannot disagree.
 *
 * Why: the board protocols were ~2.5K tokens of every turn's prompt (sent even
 * on "hi"), still described a "panel beside the chat" that no longer existed,
 * and the model drove the board unreliably. The server keeps pinning the
 * problem from chat text (synthesizer), so grading and the teacher live view
 * do not depend on the board.
 *
 * WORK_BOARD=on restores everything; the board's own suites opt in to it.
 */

const fs = require('fs');
const path = require('path');
const { buildSystemPrompt } = require('../../utils/promptCompact');
const { isStructuredModeEnabled } = require('../../utils/boardResponseSchema');
const { isBoardToolModeEnabled } = require('../../utils/boardTools');
const { buildBoardStateBlock } = require('../../utils/pipeline/boardStateBlock');

const ENV_KEYS = ['WORK_BOARD', 'STRUCTURED_TUTOR_RESPONSE', 'BOARD_TOOL_CALLS'];
const saved = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const PROFILE = { firstName: 'Sam', gradeLevel: '8', mathCourse: 'Algebra 1', interests: [] };
const TUTOR = { name: 'Mr. Nappier', catchphrase: 'See the patterns.', personality: 'Warm.' };
const prompt = () => buildSystemPrompt(PROFILE, TUTOR).prompt;

describe('the tutor prompt', () => {
  test('board off (default): no board or workspace-tab protocol; the work goes in the message', () => {
    const p = prompt();
    expect(p).not.toMatch(/WORKBOARD TAG PROTOCOL/);
    expect(p).not.toMatch(/<BOARD action=/);
    expect(p).not.toMatch(/WORKSPACE TAB TAGS/);
    expect(p).not.toMatch(/beside the chat/i);
    expect(p).toMatch(/WHERE THE WORK GOES: IN YOUR MESSAGE/);
    // The pedagogy the board enforced still applies to the message.
    expect(p).toMatch(/write only what the student has already said/i);
    expect(p).toMatch(/Never graph the student's own unsolved function/);
  });

  test('WORK_BOARD=on restores the board protocols', () => {
    process.env.WORK_BOARD = 'on';
    const p = prompt();
    expect(p).toMatch(/WORKBOARD TAG PROTOCOL/);
    expect(p).toMatch(/WORKSPACE TAB TAGS/);
    expect(p).not.toMatch(/WHERE THE WORK GOES: IN YOUR MESSAGE/);
  });

  test('board off saves at least 8K characters of every prompt', () => {
    const off = prompt().length;
    process.env.WORK_BOARD = 'on';
    const on = prompt().length;
    expect(on - off).toBeGreaterThan(8000);
  });

  test('the switch is read per call, not frozen at module load', () => {
    const before = prompt();
    process.env.WORK_BOARD = 'on';
    expect(prompt()).not.toBe(before);
    delete process.env.WORK_BOARD;
    expect(prompt()).toBe(before);
  });
});

describe('board-only modes stand down with the board off', () => {
  test('structured response mode', () => {
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    expect(isStructuredModeEnabled()).toBe(false);
    process.env.WORK_BOARD = 'on';
    expect(isStructuredModeEnabled()).toBe(true);
  });

  test('board tool-call mode', () => {
    process.env.BOARD_TOOL_CALLS = 'true';
    expect(isBoardToolModeEnabled()).toBe(false);
    process.env.WORK_BOARD = 'on';
    expect(isBoardToolModeEnabled()).toBe(true);
  });
});

describe('the per-turn board state block', () => {
  const ledger = (steps = []) => ({
    current: { problemTex: '2x + 4 = 20', posedAt: new Date().toISOString(), steps: [{ action: 'pose', tex: '2x + 4 = 20' }, ...steps] },
    completed: [{}],
  });

  test('board off: only the problem in focus — nothing about a board the student cannot see', () => {
    const block = buildBoardStateBlock(ledger([{ action: 'resolve', tex: '2x = 16' }]));
    expect(block).toMatch(/PROBLEM IN FOCUS/);
    expect(block).toMatch(/Problem: 2x \+ 4 = 20/);
    expect(block).toMatch(/Status: in progress/);
    expect(block).not.toMatch(/BOARD/);
    expect(block).not.toMatch(/visible to them/i);
  });

  test('board off: a solved problem says so', () => {
    expect(buildBoardStateBlock(ledger([{ action: 'verify', tex: 'x = 8' }]))).toMatch(/SOLVED/);
  });

  test('board off: no problem pinned → no block', () => {
    expect(buildBoardStateBlock({ current: null, completed: [{}] })).toBe('');
  });

  test('WORK_BOARD=on: the full board block, pointing included', () => {
    process.env.WORK_BOARD = 'on';
    const block = buildBoardStateBlock(ledger());
    expect(block).toMatch(/THE STUDENT'S BOARD/);
    expect(block).toMatch(/BOARD_POINT/);
  });
});

describe('the client honours the same switch', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '../..', ...p), 'utf8');
  const cw = read('public/js/living-workspace/chat-workspace.js');
  const html = read('public/chat.html');

  test('chat.html defaults the board off, under the server override', () => {
    expect(html).toMatch(/workBoard: false/);
    // /api/features.js loads first, so the server value wins the merge.
    expect(html.indexOf('/api/features.js')).toBeLessThan(html.indexOf('workBoard: false'));
  });

  test('the dock and derivation view mount only with the board on', () => {
    expect(cw).toMatch(/window\.MM_FEATURES\.workBoard === true/);
    expect(cw).toMatch(/if \(BOARD\) \{[\s\S]*?mount = buildDock\(\);[\s\S]*?new window\.LWS\.DerivationView/);
  });

  test('board calls are no-ops with the board off', () => {
    for (const fn of ['applyBoardCommands', 'applyVoiceBoard', 'hydrate']) {
      expect(cw).toMatch(new RegExp(`api\\.${fn} = function \\([^)]*\\) \\{\\s*if \\(!BOARD\\) return;`));
    }
  });

  test('the Notebook and Source Dock still mount (isOn stays true, so no legacy-board fallback)', () => {
    expect(cw).toMatch(/if \(widgetHost && window\.LWS\.SourceDock\)/);
    expect(cw).toMatch(/if \(widgetHost && window\.LWS\.NotebookPanel\)/);
    expect(cw).toMatch(/isOn: function \(\) \{ return ON; \}/);
  });
});
