/**
 * LIVE PERSONA EVAL — runs the behavioral personas against the REAL model and
 * scores the tutor's actual words with the LLM judges (llmJudges.js): strict
 * answer-leak detection in any wording, scaffold-vs-tell classification, tone
 * on emotionally loaded turns.
 *
 * OPT-IN ONLY (same contract as liveEval.test.js): needs RUN_LLM_EVAL=1 and an
 * API key; wire as a nightly / pre-release job, never the keyless PR gate.
 *
 *   RUN_LLM_EVAL=1 OPENAI_API_KEY=sk-... npm run test:eval:live
 *
 * A judge that reports uncertain=true is logged and NOT counted as a failure —
 * uncertainty is surfaced, not swallowed (same asymmetry as the pipeline's
 * verifier: only confident violations fail the run).
 */
'use strict';

const RUN = process.env.RUN_LLM_EVAL === '1' && !!process.env.OPENAI_API_KEY;

const personas = require('./personas.json').personas;
const { runScenario, formatFailures } = require('./runner');

const TEST_PROFILE = {
  firstName: 'Alex', lastName: 'Rivera', gradeLevel: '7', mathCourse: 'Math 7',
  interests: [], learningStyle: null, tonePreference: 'encouraging',
};
const TEST_TUTOR = {
  name: 'Mr. Nappier',
  catchphrase: 'See the patterns, solve with ease.',
  personality: 'Warm, encouraging middle-school math teacher who guides with questions.',
};

async function liveGenerateReply({ scenario, turn, history, decision }) {
  // Lazy-require so the keyless suite never loads the OpenAI client.
  const { generateSystemPrompt } = require('../../utils/promptCompact');
  const { callLLM } = require('../../utils/llmGateway');
  const { withActionBlock } = require('./livePrompt');

  // The decide stage's directives are half of what production sends — without
  // them these personas judge a tutor that was never given its instructions.
  const systemPrompt = withActionBlock(generateSystemPrompt(
    TEST_PROFILE, TEST_TUTOR, null, 'student',
    null, null, null, [], null,
    { topicName: scenario.focus || undefined }, null, null, null, null,
    turn.student, history.slice(-8),
  ), decision);

  const messages = [{ role: 'system', content: systemPrompt }, ...history];
  const completion = await callLLM(process.env.TUTOR_MODEL || 'gpt-4o-mini', messages, { temperature: 0.5, max_tokens: 400 });
  const msg = completion?.choices?.[0]?.message;
  return (msg && msg.content) || '';
}

function judgeInputs(name, spec, scenario, turnRecord) {
  if (name === 'answerLeak') {
    return {
      problem: spec.problem || scenario.focus || '',
      expectedAnswer: spec.expectedAnswer || scenario.answer || '',
      // The leak judge scores the prose the student READS. Board cards are
      // deterministically leak-checked by the guard (boardJudge) — leaving
      // them in makes the judge flag guard-legal empty-blank scaffolds.
      tutorReply: turnRecord.cleanedReply ?? turnRecord.reply,
    };
  }
  if (name === 'visualPedagogy') {
    return {
      concept: spec.concept || scenario.focus || '',
      studentMessage: turnRecord.student,
      tutorReply: turnRecord.reply,
    };
  }
  if (name === 'representationShift') {
    return {
      firstExplanation: spec.firstExplanation || '',
      studentMessage: turnRecord.student,
      tutorReply: turnRecord.reply,
    };
  }
  return { studentMessage: turnRecord.student, tutorReply: turnRecord.reply };
}

function checkVerdict(name, spec, verdict) {
  const failures = [];
  for (const [field, want] of Object.entries(spec.expect || {})) {
    if (field === 'classificationNot') {
      if (verdict.classification === want) {
        failures.push(`${name}.classification is "${verdict.classification}" (must not be)`);
      }
    } else if (verdict[field] !== want) {
      failures.push(`${name}.${field} = ${JSON.stringify(verdict[field])}, want ${JSON.stringify(want)}`);
    }
  }
  return failures;
}

(RUN ? describe : describe.skip)('LIVE persona eval (real model + LLM judges)', () => {
  jest.setTimeout(300000);

  const llmJudges = RUN ? require('./llmJudges') : null;
  const JUDGE_FNS = RUN ? {
    answerLeak: llmJudges.judgeAnswerLeak,
    scaffoldVsTell: llmJudges.judgeScaffoldVsTell,
    toneSupport: llmJudges.judgeToneSupport,
    newSkillIntro: llmJudges.judgeNewSkillIntro,
    visualPedagogy: llmJudges.judgeVisualPedagogy,
    representationShift: llmJudges.judgeRepresentationShift,
  } : {};

  for (const persona of personas) {
    if (!persona.turns.some((t) => t.judgeLlm)) continue;
    test(persona.name, async () => {
      const result = await runScenario(persona, { generateReply: liveGenerateReply });

      // Heuristic judges still apply on live replies.
      if (!result.judgesPassed) {
        throw new Error(`heuristic judge violation:\n${formatFailures(result).join('\n')}`);
      }

      const failures = [];
      for (const turnRecord of result.turns) {
        if (!turnRecord.judgeLlm || !turnRecord.reply) continue;
        for (const [name, spec] of Object.entries(turnRecord.judgeLlm)) {
          const verdict = await JUDGE_FNS[name](judgeInputs(name, spec, persona, turnRecord));
          if (verdict.uncertain) {
            console.warn(`[live-eval] ${persona.name} — ${name} uncertain on "${turnRecord.student}": ${verdict.error || 'no confident verdict'}`);
            continue;
          }
          const turnFailures = checkVerdict(name, spec, verdict);
          for (const f of turnFailures) {
            failures.push(`  ${f}\n    student: "${turnRecord.student}"\n    reply: "${String(turnRecord.reply).slice(0, 200)}"${verdict.evidence ? `\n    evidence: ${verdict.evidence}` : ''}`);
          }
        }
      }
      if (failures.length) {
        throw new Error(`LLM judge violations:\n${failures.join('\n')}`);
      }
    });
  }
});

// Keep the file non-empty for the keyless runner (describe.skip emits no tests).
describe('live persona eval config', () => {
  test('is opt-in via RUN_LLM_EVAL', () => {
    expect(typeof RUN).toBe('boolean');
  });
});
