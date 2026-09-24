// tests/unit/checkWorkSheetCoverage.test.js
//
// "Check my work" on a completed homework sheet must check the WHOLE sheet.
// It used to come back as feedback on one problem because every layer narrowed
// it: a single sheet-level verdict, a "ONE Socratic question" suffix, a
// "one problem at a time" directive, and — decisively — verify's upload
// answer-key filter, which rewrote any reply that walked through 2+ numbered
// problems into "pick one problem." Checking work is not giving answers; what
// stays enforced is that a wrong problem's corrected value is not handed over
// and a mostly-blank sheet (answer-key fishing) keeps the strict filter.

jest.mock('../../utils/llmGateway', () => ({
  callLLM: jest.fn(),
  callLLMStream: jest.fn(),
  callLLMStructured: jest.fn(),
}));
jest.mock('../../utils/openaiClient', () => ({
  chat: { completions: { create: jest.fn() } },
}));

const { callLLM } = require('../../utils/llmGateway');
const { verify } = require('../../utils/pipeline/verify');
const { observe, MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { decide } = require('../../utils/pipeline/decide');
const {
  isSheetCheckable,
  findRevealedCorrections,
  buildSheetCheckFallback,
} = require('../../utils/pipeline/checkWorkVerifier');

const SHEET = [
  { label: '1', status: 'correct', studentAnswer: 'x = 4', whatIsRight: 'undid the +3 first', errorStep: null, correctedValue: null, confidence: 0.95 },
  { label: '2', status: 'correct', studentAnswer: 'x = -2', whatIsRight: 'divided both sides by -3', errorStep: null, correctedValue: null, confidence: 0.9 },
  { label: '3', status: 'has_error', studentAnswer: 'x = 7', whatIsRight: 'set up the equation', errorStep: '2x = 18 - 4', correctedValue: 'x = 11', confidence: 0.9 },
  { label: '4', status: 'correct', studentAnswer: 'x = 0.5', whatIsRight: 'isolated x', errorStep: null, correctedValue: null, confidence: 0.9 },
];

// The shape the check-work suffix asks for: one "#N:" line per problem. Three
// or more of those is exactly what the numbered-hash answer-key pattern matches.
const REPORT = `Nice work, 3 of 4 are right!
#1: ✅ x = 4, you undid the +3 first. Great.
#2: ✅ x = -2, dividing by -3 was spot on.
#3: 🔍 Look at the line 2x = 18 - 4. What should 18 - 4 really be here?
#4: ✅ x = 0.5, clean.
Rework #3 and send it back!`;

beforeEach(() => callLLM.mockReset());

describe('verify — sheet-wide check is not an answer key', () => {
  test('a per-problem report on a worked sheet passes through untouched', async () => {
    const result = await verify(REPORT, { userId: 'u1', hasRecentUpload: true, checkWork: { problems: SHEET } });
    expect(result.text).toBe(REPORT);
    expect(callLLM).not.toHaveBeenCalled();
    expect(result.flags).not.toContain('upload_answer_giveaway_regenerated');
    expect(result.flags).not.toContain('upload_answer_giveaway_fallback');
  });

  test('WITHOUT check-work results the same reply is still treated as an answer key (control)', async () => {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'Which one do you want to start with?' } }] });
    const result = await verify(REPORT, { userId: 'u1', hasRecentUpload: true });
    expect(result.flags).toContain('upload_answer_giveaway_regenerated');
  });

  test('a mostly-blank sheet keeps the strict answer-key filter', async () => {
    const mostlyBlank = [
      SHEET[0],
      { label: '2', status: 'blank', studentAnswer: null, whatIsRight: '', errorStep: null, correctedValue: null, confidence: 0.9 },
      { label: '3', status: 'blank', studentAnswer: null, whatIsRight: '', errorStep: null, correctedValue: null, confidence: 0.9 },
    ];
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'Give #2 a try first — what is the first step?' } }] });
    const result = await verify(REPORT, { userId: 'u1', hasRecentUpload: true, checkWork: { problems: mostlyBlank } });
    expect(result.flags).toContain('upload_answer_giveaway_regenerated');
  });

  test('revealing a wrong problem\'s corrected value is rewritten — keeping every problem', async () => {
    const leaky = REPORT.replace('What should 18 - 4 really be here?', 'It should be x = 11.');
    const rewritten = REPORT; // the in-voice rewrite drops only the value
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: rewritten } }] });
    const result = await verify(leaky, { userId: 'u1', hasRecentUpload: true, checkWork: { problems: SHEET } });
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(callLLM.mock.calls[0][1][0].content).toMatch(/EVERY problem/);
    expect(result.text).toBe(rewritten);
    expect(result.flags).toContain('check_work_correction_redacted');
  });

  test('if the rewrite still leaks (or fails), the deterministic sheet check is used — all problems, no value', async () => {
    const leaky = REPORT.replace('What should 18 - 4 really be here?', 'It should be x = 11.');
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: 'So #3 is x = 11, the rest are fine.' } }] });
    const result = await verify(leaky, { userId: 'u1', hasRecentUpload: true, checkWork: { problems: SHEET } });
    expect(result.flags).toContain('check_work_correction_fallback');
    for (const p of SHEET) expect(result.text).toContain(`#${p.label}`);
    expect(result.text).not.toMatch(/11/);
  });
});

describe('check-work helpers', () => {
  test('isSheetCheckable: worked sheet yes; blank / empty / mostly-blank no', () => {
    expect(isSheetCheckable(SHEET)).toBe(true);
    expect(isSheetCheckable([])).toBe(false);
    expect(isSheetCheckable(null)).toBe(false);
    expect(isSheetCheckable([{ status: 'blank' }, { status: 'blank' }, { status: 'correct' }])).toBe(false);
    expect(isSheetCheckable([{ status: 'blank' }, { status: 'correct' }])).toBe(true);
  });

  test('findRevealedCorrections: a stated result is a leak; labels and counts are not', () => {
    const p = [{ label: '6', status: 'has_error', studentAnswer: '5', errorStep: 'x', correctedValue: '6' }];
    expect(findRevealedCorrections('Check #6 again. 6 of 8 are right.', p)).toEqual([]);
    expect(findRevealedCorrections('The answer is 6.', p)).toHaveLength(1);
    expect(findRevealedCorrections('so y = 6', p)).toHaveLength(1);
    expect(findRevealedCorrections('so y = 64', p)).toEqual([]);
  });

  test('findRevealedCorrections: unicode minus and spacing are normalized', () => {
    const p = [{ label: '2', status: 'has_error', studentAnswer: '1', errorStep: 'x', correctedValue: '−1' }];
    expect(findRevealedCorrections('4 - 5 = -1', p)).toHaveLength(1);
    const q = [{ label: '3', status: 'has_error', studentAnswer: '2x+3', errorStep: 'x', correctedValue: '2x + 6' }];
    expect(findRevealedCorrections('you should get 2x+6 there', q)).toHaveLength(1);
  });

  test('only verified errors are checked — correct problems may restate their answers', () => {
    expect(findRevealedCorrections(REPORT, SHEET)).toEqual([]);
  });

  test('buildSheetCheckFallback covers every problem and never a corrected value', () => {
    const withBlank = [...SHEET, { label: '5', status: 'blank' }, { label: '6', status: 'uncertain' }];
    const text = buildSheetCheckFallback(withBlank);
    for (const p of withBlank) expect(text).toContain(`#${p.label}`);
    expect(text).toMatch(/3 of 5 are right/);
    expect(text).not.toMatch(/11/);
  });
});

describe('observe + decide — the upload chip\'s message is a whole-sheet check', () => {
  const CHIP = "Can you check my work and tell me if I'm on the right track?";

  test('classified CHECK_MY_WORK when there is an upload (was QUESTION)', () => {
    const o = observe(CHIP, { hasRecentUpload: true, recentAssistantMessages: [] });
    expect(o.messageType).toBe(MESSAGE_TYPES.CHECK_MY_WORK);
  });

  test('without an upload it is still a question', () => {
    const o = observe(CHIP, { hasRecentUpload: false, recentAssistantMessages: [] });
    expect(o.messageType).not.toBe(MESSAGE_TYPES.CHECK_MY_WORK);
  });

  test('decide asks for every problem, not one at a time', () => {
    const o = observe(CHIP, { hasRecentUpload: true, recentAssistantMessages: [] });
    const d = decide(o, { type: 'no_answer' }, { hasRecentUpload: true });
    const all = d.directives.join(' ');
    expect(all).toMatch(/EVERY problem/);
    expect(all).not.toMatch(/one problem at a time/i);
    expect(all).toMatch(/never state the corrected answer/i);
  });
});
