// ============================================================
// utils/replyLlmJudges.js — LLM judges for tutor-reply quality.
//
// The heuristic judges in ./replyJudges.js are the cheap regression net;
// these are the nuanced layer for what regexes can't catch — an answer
// leaked in any wording, scaffold-vs-tell classification, tone, visual
// pedagogy. Each judge takes a transcript slice and returns a structured
// verdict via callLLMStructured.
//
// Moved from tests/eval/llmJudges.js (a re-export shim remains there) so the
// production transcript miner (utils/transcriptMiner.js) can share them
// without prod code importing from tests/ — same split as replyJudges.js.
//
// PII: callLLMStructured is the gateway's LOW-LEVEL entry — it does NOT
// anonymize by itself. The eval harness feeds these judges synthetic
// scenario text, so that's moot there; any caller passing REAL student
// transcript text (the transcript miner) must anonymize the payload
// strings BEFORE calling (createAnonymizationContext + .anonymize()).
//
// In the eval suite these run LIVE-TIER ONLY (RUN_LLM_EVAL=1): they cost
// real API calls and never run in the keyless CI suite.
//
// Judge philosophy mirrors the pipeline's verifier asymmetry: STRICT about
// failures that destroy trust (leaking the answer), CHARITABLE about style.
// A judge that can't decide reports uncertain=true rather than guessing —
// uncertain results are surfaced, not counted as passes.
// ============================================================

'use strict';

const { callLLMStructured } = require('./llmGateway');

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || 'gpt-4o-mini';
const JUDGE_TIMEOUT_MS = 20000;

function schema(name, properties, required) {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

async function runJudge(name, systemPrompt, payload, responseFormat) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(payload) },
  ];
  try {
    const verdict = await callLLMStructured(JUDGE_MODEL, messages, responseFormat, {
      temperature: 0,
      timeoutMs: JUDGE_TIMEOUT_MS,
    });
    return { judge: name, ...verdict };
  } catch (err) {
    return { judge: name, uncertain: true, error: err.message };
  }
}

/**
 * Did the tutor's reply reveal the answer to the problem the student is
 * supposed to be working on? The single most trust-destroying failure —
 * judged strictly: a reworded answer, a "the answer should be…", or worked
 * steps that land on the final value all count as leaks. Scaffolds with
 * empty blanks, definitions, and parallel examples with DIFFERENT numbers
 * do not.
 */
async function judgeAnswerLeak({ problem, expectedAnswer, tutorReply }) {
  return runJudge(
    'answer_leak',
    [
      'You are auditing an AI math tutor for K-12 students. Decide whether the',
      'tutor reply REVEALS the final answer to the problem the student is working on.',
      'Count as a leak: stating the answer in any form or wording, completing the',
      'final step for the student, or worked steps on THE STUDENT\'S OWN problem',
      'that arrive at the final value. Do NOT count: hints, definitions, scaffolds',
      'with empty blanks (\\boxed{}), Socratic questions, or worked examples on a',
      'DIFFERENT problem with different numbers. The reply may contain raw',
      '<BOARD .../> or [TYPE:...] markup — that is UI the student sees RENDERED,',
      'not prose; judge its content by the same rules. In particular a',
      '<BOARD action="scaffold" tex="... \\boxed{} ..."> card whose box is EMPTY is',
      'a fill-in-the-blank hint, never a leak. Be strict: when the reply',
      'effectively hands over the answer, leaked=true even if phrased as a hint.',
      'If you genuinely cannot tell, set uncertain=true (and leaked=false).',
    ].join(' '),
    { problem, expectedAnswer, tutorReply },
    schema('AnswerLeakVerdict', {
      leaked: { type: 'boolean' },
      uncertain: { type: 'boolean' },
      evidence: { type: ['string', 'null'], description: 'Quote from the reply that leaks, or null.' },
    }, ['leaked', 'uncertain', 'evidence'])
  );
}

/**
 * Is the tutor scaffolding (guiding the student to produce the next step)
 * or telling (doing the step for them)? "mixed" is allowed; the eval asserts
 * per-persona which classifications are acceptable for the turn.
 */
async function judgeScaffoldVsTell({ studentMessage, tutorReply }) {
  return runJudge(
    'scaffold_vs_tell',
    [
      'You are auditing an AI math tutor. Classify the tutor reply:',
      '"scaffold" = it guides — asks a question, offers a hint or partial structure,',
      'prompts the student to take the next step themselves.',
      '"tell" = it performs the step or explains the full procedure the student was',
      'supposed to attempt.',
      '"mixed" = it does some of both.',
      'Direct instruction is not automatically "tell": explaining a CONCEPT while',
      'leaving the student\'s actual step to them still counts as scaffold.',
      'If you cannot tell, set uncertain=true and classification="mixed".',
    ].join(' '),
    { studentMessage, tutorReply },
    schema('ScaffoldVerdict', {
      classification: { type: 'string', enum: ['scaffold', 'tell', 'mixed'] },
      uncertain: { type: 'boolean' },
      reasoning: { type: 'string' },
    }, ['classification', 'uncertain', 'reasoning'])
  );
}

/**
 * For an emotionally loaded student turn (frustration, self-deprecation):
 * did the tutor acknowledge the feeling before pushing content, and did it
 * avoid piling on a new problem in the same breath?
 */
async function judgeToneSupport({ studentMessage, tutorReply }) {
  return runJudge(
    'tone_support',
    [
      'You are auditing an AI math tutor for K-12 students. The student message is',
      'emotionally loaded (frustration, giving up, self-deprecation). Judge the reply:',
      'acknowledgesFeeling = it names or responds to the emotion before pushing math.',
      'pushesNewProblem = the reply puts actual math work in front of the student NOW:',
      'it states a problem, equation, or numbers to work on; assigns a task; or demands',
      'a step, an attempt, or an answer in this same reply.',
      'An OPT-IN OFFER is NOT pushing and must be scored pushesNewProblem=false:',
      'a question offering choices the student can freely decline (break it into a',
      'smaller piece, try a different angle, take a break, set it aside, see a similar',
      'one first) that contains no problem text and no numbers to work on.',
      'A good reply acknowledges first and lowers the load; it may end with one such',
      'opt-in offer, but must not ignore the emotion or assign concrete work.',
      'If you cannot tell, set uncertain=true.',
    ].join(' '),
    { studentMessage, tutorReply },
    schema('ToneVerdict', {
      acknowledgesFeeling: { type: 'boolean' },
      pushesNewProblem: { type: 'boolean' },
      uncertain: { type: 'boolean' },
    }, ['acknowledgesFeeling', 'pushesNewProblem', 'uncertain'])
  );
}

/**
 * For a student meeting a skill for the FIRST time ("we start X tomorrow,
 * I've never seen it"): did the tutor introduce it the way a great human
 * tutor would — anchored to something the student already knows, one small
 * concrete example, and an invitation to participate — rather than a
 * lecture dump or a cold problem assignment?
 */
async function judgeNewSkillIntro({ studentMessage, tutorReply }) {
  return runJudge(
    'new_skill_intro',
    [
      'You are auditing an AI math tutor for K-12 students. The student has NEVER',
      'seen this skill before and asked to learn it. Judge the tutor reply:',
      'connectsToPrior = it explicitly anchors the new idea to something the student',
      'already knows (a simpler skill, a familiar situation, or earlier work).',
      'lectureDump = it delivers the full procedure or several worked steps in one',
      'monologue with nothing for the student to do or respond to mid-way.',
      'invitesParticipation = it ends with (or contains) a genuine question or a',
      'small first step the student is asked to try or answer.',
      'Direct instruction is EXPECTED here — a first exposure should teach, not quiz.',
      'lectureDump is only true when the teaching is a wall of procedure with no',
      'interaction, not merely because the reply explains the concept.',
      'If you cannot tell, set uncertain=true.',
    ].join(' '),
    { studentMessage, tutorReply },
    schema('NewSkillIntroVerdict', {
      connectsToPrior: { type: 'boolean' },
      lectureDump: { type: 'boolean' },
      invitesParticipation: { type: 'boolean' },
      uncertain: { type: 'boolean' },
    }, ['connectsToPrior', 'lectureDump', 'invitesParticipation', 'uncertain'])
  );
}

/**
 * Did the tutor use a REPRESENTATION as pedagogy at a moment that begs for
 * one — and was it the right one, at the right weight? A fantastic tutor
 * reaches for fraction bars when comparing 2/3 vs 3/4, an area model for
 * distribution, a number-line/pattern for negative×negative, rise-over-run
 * on a graph for slope. The tutor's visual surfaces are <BOARD> tags
 * (graph/image/scaffold), inline [TYPE:params] visuals, or a concrete visual
 * model described in words — all count. The inverse also matters: a visual
 * where none is needed (counting blocks for a basic fact to a secondary
 * student) is noise, not teaching.
 */
async function judgeVisualPedagogy({ concept, studentMessage, tutorReply }) {
  return runJudge(
    'visual_pedagogy',
    [
      'You are auditing an AI math tutor for K-12 students. The `concept` field',
      'names the mathematical moment. Judge how the tutor reply used visual or',
      'concrete representations as pedagogy.',
      'usedOrOfferedVisual = the reply renders, describes, offers, or STARTS ANY',
      'visual/concrete representation: a <BOARD action="graph|image|scaffold"...> tag,',
      'an inline [FRACTION:...]/[NUMBER_LINE:...]-style visual, a drawn-in-words model',
      '(fraction bars, area model, number line, tiles, a real-world picture), an',
      'explicit offer to show one, or the opening move of a concrete pattern build',
      '(e.g. "let\'s build it — what is 3 × (-2)?" stepping toward the target).',
      'Purely symbolic re-statement of the rule = false.',
      'matchesConcept = the representation chosen actually illuminates THIS concept',
      '(e.g. same-size bars shaded 2/3 vs 3/4 for comparing fractions; an area model',
      'for distribution; a pattern/number-line for negative times negative; rise and',
      'run on a graphed line for slope). If NO visual was used, set true (vacuous).',
      'notOverkill = false ONLY when a visual/manipulative was used on something',
      'this student clearly commands (e.g. counting objects for a one-step basic',
      'fact with a secondary student) so it adds noise, not insight. If no visual',
      'was used, or the visual pulls real weight, set true.',
      'If you cannot tell, set uncertain=true.',
    ].join(' '),
    { concept, studentMessage, tutorReply },
    schema('VisualPedagogyVerdict', {
      usedOrOfferedVisual: { type: 'boolean' },
      matchesConcept: { type: 'boolean' },
      notOverkill: { type: 'boolean' },
      uncertain: { type: 'boolean' },
      reasoning: { type: 'string' },
    }, ['usedOrOfferedVisual', 'matchesConcept', 'notOverkill', 'uncertain', 'reasoning'])
  );
}

/**
 * The student has missed the same idea repeatedly and `firstExplanation` is
 * how the tutor already explained it. Did the new reply CHANGE representation
 * (symbols → visual/diagram → concrete numbers → real-world story), or is it
 * the same lens said again louder? Mirrors decide.js's representation-switch
 * order: "The same explanation said louder is NOT a different approach."
 */
async function judgeRepresentationShift({ firstExplanation, studentMessage, tutorReply }) {
  return runJudge(
    'representation_shift',
    [
      'You are auditing an AI math tutor for K-12 students. The student has missed',
      'the same concept repeatedly. `firstExplanation` is how the tutor explained it',
      'before (it did not land). Judge the new tutorReply:',
      'usedDifferentRepresentation = the new explanation approaches the idea through',
      'a genuinely DIFFERENT representation than firstExplanation — e.g. symbolic',
      'algebra vs a visual model (bars, area, number line, tiles, a drawing or',
      '<BOARD> graph/image card) vs concrete plugged-in numbers vs a real-world',
      'story. Restating the same symbolic procedure with new wording, smaller',
      'steps, or more enthusiasm is NOT a different representation — set false.',
      'Judge the representation, not the quality: a clumsy but genuinely different',
      'lens still counts as true.',
      'If you cannot tell, set uncertain=true.',
    ].join(' '),
    { firstExplanation, studentMessage, tutorReply },
    schema('RepresentationShiftVerdict', {
      usedDifferentRepresentation: { type: 'boolean' },
      uncertain: { type: 'boolean' },
      reasoning: { type: 'string' },
    }, ['usedDifferentRepresentation', 'uncertain', 'reasoning'])
  );
}

module.exports = {
  JUDGE_MODEL,
  judgeAnswerLeak,
  judgeScaffoldVsTell,
  judgeToneSupport,
  judgeNewSkillIntro,
  judgeVisualPedagogy,
  judgeRepresentationShift,
};
