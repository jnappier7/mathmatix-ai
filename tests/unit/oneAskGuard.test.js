/**
 * The one-ask rule + the "Sure!" opener ban (owner report, 2026-07-26).
 *
 * Production pattern: the tutor asked "can you walk me through it?" on
 * already-confirmed work FOUR times in one stretch, each opening with a
 * filler "Sure!" — which the owner correctly read as a tell for a canned,
 * distrustful turn ("sure doesn't read as an affirmation — it's actually
 * kind of condescending"). The guard is deterministic: if the previous
 * assistant message asked for an explanation, this turn must not ask again.
 */
const { observe } = require('../../utils/pipeline/observe');
const { decide } = require('../../utils/pipeline/decide');

const noAnswerDiagnosis = { type: 'no_answer', isCorrect: null, answer: null, correctAnswer: null };

function decideAfterAssistant(assistantContent, studentMessage, diagnosis = noAnswerDiagnosis) {
  const obs = observe(studentMessage, { recentUserMessages: [], recentAssistantMessages: [assistantContent] });
  return decide(obs, diagnosis, {
    phaseState: null, activeSkill: null, hasRecentUpload: false,
    conversation: { messages: [
      { role: 'user', content: 'x = 100/7' },
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: studentMessage },
    ] },
  });
}

const hasOneAsk = d => d.directives.some(x => x.startsWith('ONE-ASK RULE'));

describe('one-ask guard', () => {
  test('fires after every explanation-request shape the transcript showed', () => {
    for (const probe of [
      'Can you walk me through how you arrived at that point?',
      "I'm curious about your thought process in simplifying those fractions.",
      'Can you show me how you would simplify that?',
      'Can you explain how you arrived at your final answer?',
      'What steps did you take, and where did the 2f come from?',
    ]) {
      expect(hasOneAsk(decideAfterAssistant(probe, 'I cross cancelled the 20 and 100 so its 5/7'))).toBe(true);
    }
  });

  test('does not fire when the previous tutor message was not a probe', () => {
    const d = decideAfterAssistant("Nice — that's exactly right. Ready for the next one?", 'yes');
    expect(hasOneAsk(d)).toBe(false);
  });

  test('does not fire with no conversation in context (voice, tests, fallbacks)', () => {
    const obs = observe('sure', { recentUserMessages: [], recentAssistantMessages: [] });
    const d = decide(obs, noAnswerDiagnosis, { phaseState: null, activeSkill: null });
    expect(hasOneAsk(d)).toBe(false);
  });

  test('fires regardless of which action the core logic picked (post-pass)', () => {
    const correct = { type: 'answer', isCorrect: true, answer: '5/7', correctAnswer: '5/7' };
    const d = decideAfterAssistant('Can you explain how you arrived at that?', 'its 5/7', correct);
    expect(hasOneAsk(d)).toBe(true);
  });
});

describe('the prompt no longer teaches the "Sure" opener', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('../../utils/promptCompact.js'), 'utf8');

  test('exemplar dialogues do not open with "Sure"', () => {
    expect(src).not.toMatch(/You: "Sure/);
  });

  test('the OPENERS rule bans filler and names the reason', () => {
    expect(src).toContain('--- OPENERS (MANDATORY) ---');
    expect(src).toContain('compliance, not affirmation');
  });
});

describe('arithmetic dignity (owner transcript: apples explained to a formula-builder)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('../../utils/promptCompact.js'), 'utf8');

  test('the prompt forbids object/counting explanations above elementary level', () => {
    expect(src).toContain('--- ARITHMETIC DIGNITY (MANDATORY) ---');
    expect(src).toContain('apples, objects, fingers, or counting stories');
  });

  test('the prompt forbids doubting correct answers to the tutor own sub-questions', () => {
    expect(src).toContain('it is CORRECT');
  });
});
