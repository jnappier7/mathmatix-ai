// utils/orchestrator/phaseEnforcer.js
// Deterministic struct rewriter that enforces phase semantics on the
// segmented pipeline output. NO re-prompt loop — if the model emits an
// "i-do" segment during "we-do", we strip silently rather than blow the
// latency budget retrying. The strip rate is exposed as a metric; if
// any phase exceeds 5%, the fix lives in promptPlanLayer.js, not here.

'use strict';

const PRODUCTIVE_OPS = new Set([
  'writeStep', 'graph', 'algebraTiles', 'unitCircle', 'writeText',
]);

/**
 * Classify a segment's "style" by looking at its boardOps + wait shape.
 */
function classifySegmentStyle(seg) {
  const productiveOpCount = (seg.boardOps || [])
    .filter(op => PRODUCTIVE_OPS.has(op.op)).length;
  const hasWait = !!seg.wait;
  const hasExpect = hasWait && !!seg.wait.expect;

  return {
    productiveOpCount,
    hasWait,
    hasExpect,
    isIDoStyle: productiveOpCount >= 2 && !hasWait && seg.mode === 'teacher',
    isWeDoStyle: productiveOpCount >= 1 && hasWait,
    isYouDoStyle: productiveOpCount === 0 && hasWait && hasExpect,
  };
}

/**
 * Strip the segment back to a "what comes next" prompt. Keeps the first
 * productive op so the student still has visual anchor.
 */
function rewriteToWeDoPrompt(seg) {
  const ops = seg.boardOps || [];
  const firstProductiveIdx = ops.findIndex(op => PRODUCTIVE_OPS.has(op.op));
  const kept = firstProductiveIdx >= 0 ? ops.slice(0, firstProductiveIdx + 1) : [];
  const trimmedSpoken = trimAfterFirstSentence(seg.spoken);
  return {
    ...seg,
    boardOps: kept,
    spoken: trimmedSpoken
      ? `${trimmedSpoken} What should we do next?`
      : 'What should we do next?',
    wait: { expect: { kind: 'free-text' }, timeoutMs: 30000 },
  };
}

function rewriteToYouDoPrompt(seg, target) {
  const prompt = target?.prompt || 'Your turn — try the next step.';
  return {
    ...seg,
    boardOps: [],
    spoken: prompt,
    wait: {
      expect: target?.expect || { kind: 'any' },
      timeoutMs: 30000,
    },
  };
}

function rewriteToMasteryItem(seg, target) {
  const prompt = target?.masteryPrompt || target?.prompt || 'Show me the answer.';
  return {
    ...seg,
    boardOps: [],
    spoken: prompt,
    wait: {
      expect: target?.expect || { kind: 'any' },
      timeoutMs: 30000,
      // Mastery-check has no hint ladder — hints defeat the assessment.
      // Caller-side wait timer applies the mastery override.
    },
  };
}

function trimAfterFirstSentence(spoken) {
  if (!spoken) return '';
  const m = String(spoken).match(/^([^.!?]*[.!?])/);
  return m ? m[1].trim() : String(spoken).trim();
}

/**
 * Apply phase rules to every segment in an envelope. Mutates a shallow
 * copy and returns it; original envelope is preserved. Records strip
 * events in `_phaseStrips` for telemetry.
 *
 * @param {import('./types').OrchestratorEnvelope} envelope
 * @param {Object} ctx
 * @param {string} ctx.expectedPhase            From tutorPlan.currentTarget.instructionPhase
 * @param {Object} [ctx.activeTarget]           {prompt, expect, masteryPrompt}
 * @returns {{envelope: import('./types').OrchestratorEnvelope, strips: Array<{segmentId:string, from:string, to:string}>}}
 */
function rewrite(envelope, ctx = {}) {
  const expectedPhase = ctx.expectedPhase || null;
  const target = ctx.activeTarget || null;
  const strips = [];

  if (!expectedPhase) {
    // No active phase — pass through. This also covers GUIDE/STRENGTHEN/
    // LEVERAGE modes where instructionPhase is null.
    return { envelope, strips };
  }

  const segments = (envelope.segments || []).map((seg) => {
    seg.emittedUnderPhase = expectedPhase;
    const style = classifySegmentStyle(seg);

    switch (expectedPhase) {
      case 'prerequisite-review':
      case 'vocabulary':
      case 'concept-intro':
      case 'i-do':
        return seg;

      case 'we-do':
        if (style.isIDoStyle) {
          strips.push({ segmentId: seg.id, from: 'i-do', to: 'we-do' });
          return rewriteToWeDoPrompt(seg);
        }
        return seg;

      case 'you-do':
        if (style.isIDoStyle || style.isWeDoStyle) {
          strips.push({
            segmentId: seg.id,
            from: style.isIDoStyle ? 'i-do' : 'we-do',
            to: 'you-do',
          });
          return rewriteToYouDoPrompt(seg, target);
        }
        return seg;

      case 'mastery-check':
        if (!style.hasExpect) {
          strips.push({ segmentId: seg.id, from: 'instructive', to: 'mastery' });
          return rewriteToMasteryItem(seg, target);
        }
        return seg;

      default:
        return seg;
    }
  });

  return {
    envelope: { ...envelope, segments },
    strips,
  };
}

module.exports = { rewrite, classifySegmentStyle };
