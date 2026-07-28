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

  test('fires after teach-back phrasings (AP Calc transcript, 2026-07-28: student gave a solid teach-back and was asked to walk through it AGAIN)', () => {
    for (const probe of [
      "pretend I'm a student who's never seen this problem before. How would you explain, in your own words, why we calculated 3.5(4) and 0.1(4)^2 before subtracting from 100?",
      'How did you decide to handle 4^2 first, and what did you do next?',
      'Can you teach it back to me like I have never seen it?',
      'Explain it in your own words for me.',
    ]) {
      expect(hasOneAsk(decideAfterAssistant(probe, 'there was a grouping symbol, so you do that first. inside, the exponent is next.'))).toBe(true);
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

describe("student's lead (owner policy: regular tutoring never forces a direction)", () => {
  const { observe: obs2 } = require('../../utils/pipeline/observe');
  const { decide: decide2 } = require('../../utils/pipeline/decide');
  const noAnswer = { type: 'no_answer', isCorrect: null, answer: null, correctAnswer: null };
  const hasLead = d => d.directives.some(x => x.startsWith("STUDENT'S LEAD"));

  function decideOpener(message, ctxExtra = {}) {
    const o = obs2(message, { recentUserMessages: [], recentAssistantMessages: [] });
    return decide2(o, noAnswer, { phaseState: null, activeSkill: null, ...ctxExtra });
  }

  test('bare "ok" at a topicless session start → offer, never launch', () => {
    expect(hasLead(decideOpener('ok'))).toBe(true);
    expect(hasLead(decideOpener('sure'))).toBe(true);
  });

  test('a named subject is the student leading — no guard', () => {
    expect(hasLead(decideOpener("Let's keep working on Absolute Value."))).toBe(false);
  });

  test('a problem already in play → mid-session affirmative flows normally', () => {
    const conv = { boardLedger: { current: { problemTex: '2x=4', steps: [] }, completed: [] } };
    expect(hasLead(decideOpener('ok', { conversation: conv }))).toBe(false);
  });

  test('course lessons still drive (phaseState present → no guard)', () => {
    expect(hasLead(decideOpener('ok', { phaseState: { currentPhase: 'we-do' } }))).toBe(false);
  });

  test('the prompt codifies the policy for open tutoring', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../../utils/promptCompact.js'), 'utf8');
    expect(src).toContain("--- STUDENT'S LEAD (OPEN TUTORING) ---");
    expect(src).toContain('NOT consent to your agenda');
  });

  test('the plan layer frames the plan as memory, not agenda, in free chat only', () => {
    const { buildPlanLayer } = require('../../utils/promptPlanLayer');
    const plan = { currentTarget: { skillId: 'sequences', instructionalMode: 'direct-instruction' }, skillFocus: [] };
    const chat = buildPlanLayer(plan, { interactionType: 'chat' });
    expect(chat).toContain('NOT TODAY');
    const course = buildPlanLayer(plan, { interactionType: 'course' });
    expect(course || '').not.toContain('NOT TODAY');
  });
});
