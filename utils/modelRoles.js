// utils/modelRoles.js
//
// The OpenAI models for the roles that used to be a hard-coded `gpt-4o`. OpenAI
// retires gpt-4o (and gpt-4o-mini) on 2027-01-14, so every one of those sites now
// reads its model from here, and each role is a Render env flip rather than a
// deploy. Picked BY ROLE, not one id for everything (prices per MTok in/out, read
// from OpenAI's pricing page 2026-11-22; gpt-4o was $2.50/$10):
//
//   VISION_MODEL  reads a PHOTO of handwritten math — the check-work transcription
//                 (checkWorkGrader READ), the single-pass vision grader
//                 (checkWorkVerifier), and Show-Your-Work's gradeWithVision.
//                 Default gpt-6-sol ($2/$10): this is where gpt-4o's quality
//                 mattered, and on the probe sheet gpt-4o itself misgraded a
//                 correct line while sol read and graded every line right.
//
//   JUDGE_MODEL   the stronger TEXT model: the answer verifier's tier 2
//                 (llmVerifier ESCALATION_MODEL — the OpenAI half of the
//                 cross-provider check; VERIFIER_ESCALATION_MODEL overrides it on
//                 its own), the check-work grader's OpenAI judge, the method audit,
//                 gradeWork's PDF-text grading, and the Animation Studio's clip
//                 author. Default gpt-6.1-terra ($1/$5).
//
//   The repeat-miss tutor turn (generate.js, TUTOR_ESCALATION_MODEL) defaults to
//   the same gpt-6.1-terra via STRONG_TEXT_MODEL_DEFAULT; it keeps its own env var
//   because it is a tutoring model, not a judge, and `off` must stay a kill switch.
//
// Every id here was probed through utils/openaiClient.js on every request shape
// these sites send (plain, json_object, strict json_schema, image_url) before it
// became a default — a wrong id or parameter is a terminal 400 with NO fallback
// (isTransientError treats 4xx as terminal on purpose), so "every check-work
// upload fails" is the failure mode, not a degraded grade. Probe a new one the
// same way (and add its reasoning_effort floor to openaiRequestParams if it has
// one: the gpt-6 astra line and sol from 6.1 refuse `none`).
//
// Read at module load by the sites that keep a constant, like VERIFIER_MODEL — so
// an env change takes effect on the next boot, not mid-process.

const VISION_MODEL_DEFAULT = 'gpt-6-sol';
const STRONG_TEXT_MODEL_DEFAULT = 'gpt-6.1-terra';
const VERIFIER_MODEL_DEFAULT = 'claude-haiku-5-5';

function pick(value, fallback) {
  const v = typeof value === 'string' ? value.trim() : '';
  return v || fallback;
}

/** The model that reads a photo of a student's handwritten work. */
function visionModel(env = process.env) {
  return pick(env.VISION_MODEL, VISION_MODEL_DEFAULT);
}

/** The stronger OpenAI text model for judging and grading text. */
function judgeModel(env = process.env) {
  return pick(env.JUDGE_MODEL, STRONG_TEXT_MODEL_DEFAULT);
}

/** Tier 1 of the answer verifier — a Claude id, so it is never the tutor's model. */
function verifierModel(env = process.env) {
  return pick(env.VERIFIER_MODEL, VERIFIER_MODEL_DEFAULT);
}

/** Tier 2 of the answer verifier: VERIFIER_ESCALATION_MODEL, else the judge model. */
function verifierEscalationModel(env = process.env) {
  return pick(env.VERIFIER_ESCALATION_MODEL, judgeModel(env));
}

module.exports = {
  VISION_MODEL_DEFAULT,
  STRONG_TEXT_MODEL_DEFAULT,
  VERIFIER_MODEL_DEFAULT,
  visionModel,
  judgeModel,
  verifierModel,
  verifierEscalationModel,
};
