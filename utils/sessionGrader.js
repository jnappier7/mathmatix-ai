/**
 * SESSION GRADER — Deterministic teaching quality evaluator
 *
 * A teaching coach sitting in the back of the classroom.
 * After every turn, this module evaluates the tutoring quality
 * using ONLY pipeline signals — no LLM involved.
 *
 * Grading dimensions:
 *   1. Evidence-gated advancement — did a phase advance without proof?
 *   2. Scaffold cascade — too many scaffold-downs = the explanation failed
 *   3. Post-instruction confusion — student confused right after teaching
 *   4. Prior knowledge activation — was available context used?
 *   5. Procedural language — red-flag patterns in AI response
 *   6. Engagement trajectory — is the student tuning out?
 *   7. Mode compliance — did the AI follow its instructional mode?
 *
 * Grades accumulate per session into a scorecard. At session end,
 * the scorecard generates coaching notes that persist in the TutorPlan
 * so the AI self-corrects over time.
 *
 * @module utils/sessionGrader
 */

// ── Procedural language red flags ──
// These patterns in the AI response suggest procedural teaching,
// not conceptual. Regex tested against the full response text.
const PROCEDURAL_FLAGS = [
  { pattern: /\bjust memorize\b/i, label: 'told student to memorize' },
  { pattern: /\bthe rule is\b/i, label: 'stated rule without explaining why' },
  { pattern: /\balways (multiply|divide|add|subtract|move|flip|cross)/i, label: 'gave procedural shortcut without reasoning' },
  { pattern: /\bbring down the (exponent|number|coefficient)\b/i, label: 'used procedural trick language' },
  { pattern: /\bjust (do|move|put|plug|swap|flip|cancel)\b/i, label: 'procedural "just do X" instruction' },
  { pattern: /\bremember the formula\b/i, label: 'told student to remember formula without derivation' },
  { pattern: /\bthe trick is\b/i, label: 'taught trick instead of concept' },
  { pattern: /\bfollow these steps\b/i, label: 'gave procedure without conceptual framing' },
  { pattern: /\bdon'?t worry about why\b/i, label: 'explicitly dismissed conceptual understanding' },
];

// ── Conceptual indicators (positive signals) ──
const CONCEPTUAL_INDICATORS = [
  { pattern: /\bbecause\b/i, label: 'explained reasoning' },
  { pattern: /\bwhy (this|that|it|we) (works?|do|did|makes?)\b/i, label: 'addressed why' },
  { pattern: /\bimagine\b|\bpicture\b|\bvisualize\b|\bthink of it (as|like)\b/i, label: 'used visualization' },
  { pattern: /\bconnect(s|ed|ing)? to\b|\brelated to\b|\bjust like\b|\bsimilar to\b/i, label: 'connected to prior knowledge' },
  { pattern: /\bwhat would happen if\b|\bwhat if\b/i, label: 'posed what-if reasoning' },
  { pattern: /\bin your own words\b|\bexplain (it |this )?(back|to me)\b/i, label: 'asked for teach-back' },
  { pattern: /\bopposite(s)?\b|\bundo(es|ing)?\b|\breverse\b|\binverse\b/i, label: 'explained inverse relationships' },
];

// ── Socratic violation patterns (asking questions during INSTRUCT early phases) ──
const SOCRATIC_VIOLATIONS_IN_INSTRUCT = [
  { pattern: /\bwhat do you think\b/i, label: 'asked opinion during instruction' },
  { pattern: /\bcan you (try|solve|figure|work)\b/i, label: 'asked student to solve during instruction' },
  { pattern: /\bwhat('s| is) (your|the) (first |next )?step\b/i, label: 'asked for steps during instruction' },
  { pattern: /\bhow would you\b/i, label: 'asked student to reason before teaching' },
];

/**
 * Grade a single turn of tutoring.
 *
 * Called after persist with the full pipeline context. Returns a
 * turn-level grade that accumulates into the session scorecard.
 *
 * @param {Object} params
 * @param {string} params.responseText - The AI's response
 * @param {Object} params.decision - From decide stage
 * @param {Object} params.diagnosis - From diagnose stage
 * @param {Object} params.observation - From observe stage
 * @param {Object} params.sessionMood - From sessionMood computation
 * @param {Object} params.evidence - From evidenceAccumulator
 * @param {Object} params.tutorPlan - The TutorPlan document
 * @param {Object} params.skillResolution - From skillFamiliarityResolver
 * @param {Object} params.phaseTracker - Phase evidence tracker from conversation
 * @param {Object} params.scorecard - Running session scorecard (mutated)
 * @returns {Object} { turnGrade, flags[], coachingNotes[], scorecard }
 */
function gradeTurn(params) {
  const {
    responseText,
    decision,
    diagnosis,
    observation,
    sessionMood,
    evidence,
    tutorPlan,
    skillResolution,
    phaseTracker,
    scorecard: existingScorecard,
  } = params;

  const scorecard = existingScorecard || createScorecard();
  const flags = [];
  const coachingNotes = [];
  const dimensionScores = {};

  // ═══════════════════════════════════════════════════════════
  // DIMENSION 1: Evidence-gated advancement
  // Did a phase advance this turn? Was there sufficient evidence?
  // ═══════════════════════════════════════════════════════════
  dimensionScores.evidenceGating = gradeEvidenceGating(phaseTracker, flags, coachingNotes);

  // ═══════════════════════════════════════════════════════════
  // DIMENSION 2: Scaffold cascade
  // Too many consecutive scaffold-downs = explanation failed
  // ═══════════════════════════════════════════════════════════
  dimensionScores.scaffoldCascade = gradeScaffoldCascade(decision, scorecard, flags, coachingNotes);

  // ═══════════════════════════════════════════════════════════
  // DIMENSION 3: Post-instruction confusion
  // Student confused/wrong RIGHT after a teaching turn
  // ═══════════════════════════════════════════════════════════
  dimensionScores.postInstructionClarity = gradePostInstructionClarity(
    diagnosis, observation, scorecard, flags, coachingNotes
  );

  // ═══════════════════════════════════════════════════════════
  // DIMENSION 4: Prior knowledge activation
  // Was connectionsToPriorKnowledge available? Did the AI use it?
  // ═══════════════════════════════════════════════════════════
  dimensionScores.priorKnowledgeActivation = gradePriorKnowledgeActivation(
    responseText, decision, skillResolution, tutorPlan, flags, coachingNotes
  );

  // ═══════════════════════════════════════════════════════════
  // DIMENSION 5: Procedural vs conceptual language
  // Red flags in the AI response
  // ═══════════════════════════════════════════════════════════
  dimensionScores.conceptualDepth = gradeConceptualDepth(responseText, decision, flags, coachingNotes);

  // ═══════════════════════════════════════════════════════════
  // DIMENSION 6: Engagement trajectory
  // Student response patterns: length, confusion, disengagement
  // ═══════════════════════════════════════════════════════════
  dimensionScores.engagement = gradeEngagement(observation, sessionMood, scorecard, flags, coachingNotes);

  // ═══════════════════════════════════════════════════════════
  // DIMENSION 7: Mode compliance
  // Did the AI follow its assigned instructional mode?
  // ═══════════════════════════════════════════════════════════
  dimensionScores.modeCompliance = gradeModeCompliance(
    responseText, decision, tutorPlan, flags, coachingNotes
  );

  // ── Compute turn-level composite score ──
  const activeDimensions = Object.entries(dimensionScores).filter(([_, v]) => v !== null);
  const turnScore = activeDimensions.length > 0
    ? activeDimensions.reduce((sum, [_, v]) => sum + v, 0) / activeDimensions.length
    : 1.0;

  // ── Update running scorecard ──
  scorecard.turnCount += 1;
  scorecard.turnScores.push(turnScore);
  scorecard.allFlags.push(...flags);

  for (const [dim, score] of Object.entries(dimensionScores)) {
    if (score !== null) {
      if (!scorecard.dimensions[dim]) {
        scorecard.dimensions[dim] = { scores: [], total: 0, count: 0 };
      }
      scorecard.dimensions[dim].scores.push(score);
      scorecard.dimensions[dim].total += score;
      scorecard.dimensions[dim].count += 1;
    }
  }

  // Track what the last action was (for next-turn context)
  scorecard._lastAction = decision.action;
  scorecard._lastWasInstruction = isInstructionAction(decision.action);
  scorecard._consecutiveScaffoldDowns = decision.action === 'scaffold_down'
    ? (scorecard._consecutiveScaffoldDowns || 0) + 1
    : 0;

  return {
    turnScore,
    dimensionScores,
    flags,
    coachingNotes,
    scorecard,
  };
}

// ═══════════════════════════════════════════════════════════════
// Dimension graders
// Each returns a score from 0 (bad) to 1 (good), or null if N/A
// ═══════════════════════════════════════════════════════════════

function gradeEvidenceGating(phaseTracker, flags, notes) {
  if (!phaseTracker) return null;

  // Check if a phase just advanced
  const history = phaseTracker.phaseHistory || [];
  if (history.length < 2) return null;

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  // Was it a regression? Regressions are good — means we're responsive.
  if (latest.isRegression) return 1.0;

  // How many turns were spent in the previous phase?
  // Advancing after 1 turn is suspicious. After 2+ is reasonable.
  const turnsInPrevPhase = phaseTracker.turnsInPhase; // This was reset, so check evidence
  const evidenceCount = (phaseTracker.evidenceLog || []).length;

  if (evidenceCount <= 1 && !latest.reason?.includes('Fast-track')) {
    flags.push({
      dimension: 'evidenceGating',
      severity: 'high',
      message: `Phase advanced from ${previous.phase} to ${latest.phase} with only ${evidenceCount} evidence signal(s)`,
    });
    notes.push(`Possible premature advancement: moved to ${latest.phase} without strong evidence. Require more proof next time.`);
    return 0.3;
  }

  if (latest.reason?.includes('Fast-track')) {
    // Fast-track is fine if evidence justified it
    return 0.9;
  }

  return 1.0;
}

function gradeScaffoldCascade(decision, scorecard, flags, notes) {
  const consecutive = scorecard._consecutiveScaffoldDowns || 0;

  if (decision.action === 'scaffold_down') {
    const newCount = consecutive + 1;
    if (newCount >= 3) {
      flags.push({
        dimension: 'scaffoldCascade',
        severity: 'high',
        message: `${newCount} consecutive scaffold-downs — initial explanation is not landing`,
      });
      notes.push('Multiple scaffold-downs in a row. The teaching approach is not working. Try a completely different representation or analogy next time.');
      return 0.2;
    }
    if (newCount >= 2) {
      flags.push({
        dimension: 'scaffoldCascade',
        severity: 'medium',
        message: '2 consecutive scaffold-downs',
      });
      return 0.5;
    }
    return 0.7;
  }

  // Not a scaffold-down — check if we just recovered from one
  if (consecutive >= 2 && decision.action === 'confirm_correct') {
    // Student got it after heavy scaffolding — note the pattern
    notes.push('Student needed heavy scaffolding before getting it. Consider more thorough initial explanations.');
    return 0.8;
  }

  return null; // N/A this turn
}

function gradePostInstructionClarity(diagnosis, observation, scorecard, flags, notes) {
  // Only applies if the PREVIOUS turn was an instruction turn
  if (!scorecard._lastWasInstruction) return null;

  // Did the student show confusion right after we taught?
  if (observation.messageType === 'idk' || observation.messageType === 'help_request') {
    flags.push({
      dimension: 'postInstructionClarity',
      severity: 'high',
      message: 'Student confused immediately after instruction',
    });
    notes.push('Student did not understand the instruction. The explanation needs to be clearer — try a different representation or simpler language.');
    return 0.2;
  }

  if (diagnosis.isCorrect === false) {
    flags.push({
      dimension: 'postInstructionClarity',
      severity: 'medium',
      message: 'Student answered incorrectly right after instruction',
    });
    notes.push('Student got it wrong right after being taught. The concept may not have been explained with enough depth. Check if the explanation addressed WHY, not just WHAT.');
    return 0.4;
  }

  if (observation.messageType === 'frustration') {
    flags.push({
      dimension: 'postInstructionClarity',
      severity: 'high',
      message: 'Student frustrated after instruction',
    });
    notes.push('Student became frustrated right after teaching. The explanation may have been overwhelming or confusing. Try shorter explanations with more check-ins.');
    return 0.1;
  }

  // Student engaged positively after instruction
  if (diagnosis.isCorrect === true || observation.messageType === 'affirmative') {
    return 1.0;
  }

  return 0.7; // Neutral — no clear signal
}

function gradePriorKnowledgeActivation(responseText, decision, skillResolution, tutorPlan, flags, notes) {
  // Only applies during instruction phases
  if (!isInstructionAction(decision.action)) return null;

  const connections = skillResolution?.teachingGuidance?.connectionsToPriorKnowledge || [];
  if (connections.length === 0) return null; // No data to work with

  // Check if the response references ANY of the prior knowledge connections
  const lowerResponse = responseText.toLowerCase();
  const activatedConnections = connections.filter(connection => {
    // Extract key terms from the connection string
    const terms = connection.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 3); // Skip short words

    // Check if at least some key terms appear in the response
    const matchCount = terms.filter(t => lowerResponse.includes(t)).length;
    return matchCount >= Math.max(1, Math.floor(terms.length * 0.3));
  });

  if (activatedConnections.length === 0) {
    const phase = tutorPlan?.currentTarget?.instructionPhase;
    // During concept-intro and vocabulary, this is a bigger miss
    if (phase === 'concept-intro' || phase === 'vocabulary') {
      flags.push({
        dimension: 'priorKnowledgeActivation',
        severity: 'high',
        message: `Prior knowledge available (${connections.slice(0, 2).join('; ')}) but not activated during ${phase}`,
      });
      notes.push(`Missed prior-knowledge connection. Available connections: "${connections.slice(0, 2).join('", "')}". Use these as entry points next time.`);
      return 0.2;
    }
    // During i-do, still notable but less critical
    if (phase === 'i-do') {
      flags.push({
        dimension: 'priorKnowledgeActivation',
        severity: 'medium',
        message: 'Prior knowledge not referenced during worked example',
      });
      return 0.5;
    }
    return 0.6;
  }

  // Some connections activated — good
  const ratio = activatedConnections.length / connections.length;
  return Math.min(1.0, 0.6 + ratio * 0.4);
}

function gradeConceptualDepth(responseText, decision, flags, notes) {
  // Only grade instructional responses — not confirmations, redirects, etc.
  if (!isInstructionAction(decision.action) && decision.action !== 'guided_practice') return null;

  if (!responseText || responseText.length < 50) return null; // Too short to judge

  // Check for procedural red flags
  const proceduralHits = PROCEDURAL_FLAGS.filter(f => f.pattern.test(responseText));

  // Check for conceptual indicators
  const conceptualHits = CONCEPTUAL_INDICATORS.filter(f => f.pattern.test(responseText));

  if (proceduralHits.length > 0 && conceptualHits.length === 0) {
    // All procedure, no concept — bad
    flags.push({
      dimension: 'conceptualDepth',
      severity: 'high',
      message: `Procedural language detected: ${proceduralHits.map(h => h.label).join(', ')}`,
    });
    notes.push(`Response was procedural, not conceptual. Flagged: "${proceduralHits[0].label}". Always explain WHY, not just WHAT.`);
    return 0.2;
  }

  if (proceduralHits.length > 0 && conceptualHits.length > 0) {
    // Mix — acceptable if conceptual outweighs procedural
    const ratio = conceptualHits.length / (conceptualHits.length + proceduralHits.length);
    if (ratio < 0.5) {
      flags.push({
        dimension: 'conceptualDepth',
        severity: 'medium',
        message: `More procedural (${proceduralHits.length}) than conceptual (${conceptualHits.length}) language`,
      });
      notes.push('Response leaned procedural. Lead with the concept, then show the procedure as a consequence.');
      return 0.5;
    }
    return 0.7;
  }

  if (conceptualHits.length >= 2) {
    return 1.0; // Strong conceptual language
  }

  if (conceptualHits.length === 1) {
    return 0.8; // Some conceptual effort
  }

  // No strong signals either way
  return 0.6;
}

function gradeEngagement(observation, sessionMood, scorecard, flags, notes) {
  // Track student response length trend
  const messageLength = observation.rawMessage?.length || 0;
  scorecard._responseLengths = scorecard._responseLengths || [];
  scorecard._responseLengths.push(messageLength);

  // Only grade after we have enough data (3+ turns)
  if (scorecard._responseLengths.length < 3) return null;

  const recent = scorecard._responseLengths.slice(-5);
  const earlier = scorecard._responseLengths.slice(-10, -5);

  if (earlier.length > 0) {
    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const earlierAvg = earlier.reduce((s, v) => s + v, 0) / earlier.length;

    // Significant drop in response length = disengagement
    if (earlierAvg > 20 && recentAvg < earlierAvg * 0.4) {
      flags.push({
        dimension: 'engagement',
        severity: 'medium',
        message: `Student response length dropped ${Math.round((1 - recentAvg / earlierAvg) * 100)}%`,
      });
      notes.push('Student responses getting shorter — may be disengaging. Try shorter explanations, more interactive prompts, or a topic shift.');
      return 0.4;
    }
  }

  // Check session mood signals
  if (sessionMood?.fatigueSignal) {
    return 0.5;
  }

  if (sessionMood?.inFlow) {
    return 1.0;
  }

  if (sessionMood?.trajectory === 'falling') {
    return 0.5;
  }

  if (sessionMood?.trajectory === 'rising' || sessionMood?.trajectory === 'recovered') {
    return 0.9;
  }

  return 0.7; // Stable engagement
}

function gradeModeCompliance(responseText, decision, tutorPlan, flags, notes) {
  if (!tutorPlan?.currentTarget?.instructionalMode) return null;

  const mode = tutorPlan.currentTarget.instructionalMode;
  const phase = tutorPlan.currentTarget.instructionPhase;

  switch (mode) {
    case 'instruct': {
      // During early instruction (vocab, concept-intro, i-do),
      // the AI should NOT be asking the student to solve things
      if (['vocabulary', 'concept-intro', 'i-do'].includes(phase)) {
        const violations = SOCRATIC_VIOLATIONS_IN_INSTRUCT.filter(v => v.pattern.test(responseText));
        if (violations.length > 0) {
          flags.push({
            dimension: 'modeCompliance',
            severity: 'high',
            message: `Socratic questioning during ${phase} phase: ${violations.map(v => v.label).join(', ')}`,
          });
          notes.push(`During ${phase}, teach — don't quiz. The student hasn't learned this yet. Violations: "${violations[0].label}".`);
          return 0.3;
        }
        return 1.0;
      }

      // During we-do, Socratic questioning is expected — not a violation
      if (phase === 'we-do' || phase === 'you-do') {
        return 1.0; // Socratic is fine here
      }

      return null;
    }

    case 'guide': {
      // In guide mode, the AI should be asking questions, not lecturing
      // A very long response with no questions = probably lecturing
      if (responseText.length > 500 && !responseText.includes('?')) {
        flags.push({
          dimension: 'modeCompliance',
          severity: 'medium',
          message: 'Long response with no questions in GUIDE mode — may be lecturing instead of guiding',
        });
        notes.push('In guide mode, ask more questions and lecture less. The student has seen this before — draw it out of them.');
        return 0.4;
      }
      return 1.0;
    }

    case 'strengthen': {
      // In strengthen mode, the AI should be challenging, not hand-holding
      if (decision.scaffoldLevel >= 4) {
        flags.push({
          dimension: 'modeCompliance',
          severity: 'medium',
          message: 'Heavy scaffolding in STRENGTHEN mode — student is proficient, push them',
        });
        return 0.5;
      }
      return 1.0;
    }

    case 'leverage': {
      // In leverage mode, we should NOT be drilling the mastered skill
      if (decision.action === 'direct_instruction' || decision.action === 'guided_practice') {
        flags.push({
          dimension: 'modeCompliance',
          severity: 'medium',
          message: 'Teaching/practicing a mastered skill in LEVERAGE mode — should be bridging to new concept',
        });
        return 0.4;
      }
      return 1.0;
    }

    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Session-level summary
// ═══════════════════════════════════════════════════════════════

/**
 * Generate session-end coaching notes from the accumulated scorecard.
 *
 * These become tutor notes in the TutorPlan — the AI sees them
 * next session and adjusts its teaching accordingly.
 *
 * @param {Object} scorecard - Accumulated session scorecard
 * @returns {Object} { overallScore, dimensionSummaries, coachingNotes[], strengths[], weaknesses[] }
 */
function summarizeSession(scorecard) {
  if (!scorecard || scorecard.turnCount === 0) {
    return { overallScore: null, dimensionSummaries: {}, coachingNotes: [], strengths: [], weaknesses: [] };
  }

  const overallScore = scorecard.turnScores.reduce((s, v) => s + v, 0) / scorecard.turnScores.length;

  const dimensionSummaries = {};
  const strengths = [];
  const weaknesses = [];
  const coachingNotes = [];

  for (const [dim, data] of Object.entries(scorecard.dimensions)) {
    if (data.count === 0) continue;
    const avg = data.total / data.count;
    dimensionSummaries[dim] = { average: Math.round(avg * 100) / 100, count: data.count };

    if (avg >= 0.85) {
      strengths.push(formatDimensionName(dim));
    } else if (avg < 0.5) {
      weaknesses.push(formatDimensionName(dim));
    }
  }

  // Generate coaching notes from patterns
  const flagCounts = {};
  for (const flag of scorecard.allFlags) {
    const key = flag.dimension;
    flagCounts[key] = (flagCounts[key] || 0) + 1;
  }

  // Recurring issues become coaching notes
  for (const [dim, count] of Object.entries(flagCounts)) {
    if (count >= 2) {
      switch (dim) {
        case 'conceptualDepth':
          coachingNotes.push('RECURRING: Explanations are drifting procedural. Lead every explanation with WHY before showing HOW. Use multiple representations.');
          break;
        case 'priorKnowledgeActivation':
          coachingNotes.push('RECURRING: Not connecting new concepts to what the student already knows. Always start from familiar ground and extend.');
          break;
        case 'modeCompliance':
          coachingNotes.push('RECURRING: Not following the instructional mode. During instruction, teach. During guided practice, ask. During strengthening, challenge.');
          break;
        case 'postInstructionClarity':
          coachingNotes.push('RECURRING: Student confused after explanations. Try shorter explanations, more concrete examples, and check understanding more often.');
          break;
        case 'scaffoldCascade':
          coachingNotes.push('RECURRING: Scaffold cascades detected. When the first explanation fails, try a DIFFERENT approach — not more of the same.');
          break;
        case 'evidenceGating':
          coachingNotes.push('RECURRING: Phases advancing without sufficient evidence. Require proof of understanding before moving on.');
          break;
        case 'engagement':
          coachingNotes.push('RECURRING: Student engagement dropping during sessions. Keep explanations shorter and more interactive.');
          break;
      }
    }
  }

  // Single-occurrence but high-severity flags
  const highSeverity = scorecard.allFlags.filter(f => f.severity === 'high');
  if (highSeverity.length > 0 && coachingNotes.length === 0) {
    // Pick the most impactful one
    const note = highSeverity[0];
    coachingNotes.push(`NOTE: ${note.message}. Address this in future sessions.`);
  }

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    dimensionSummaries,
    coachingNotes,
    strengths,
    weaknesses,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function createScorecard() {
  return {
    turnCount: 0,
    turnScores: [],
    dimensions: {},
    allFlags: [],
    // Internal tracking state
    _lastAction: null,
    _lastWasInstruction: false,
    _consecutiveScaffoldDowns: 0,
    _responseLengths: [],
  };
}

function isInstructionAction(action) {
  return action === 'direct_instruction' || action === 'prerequisite_bridge';
}

function formatDimensionName(dim) {
  return dim.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

module.exports = {
  gradeTurn,
  summarizeSession,
  createScorecard,
  // Exported for testing
  PROCEDURAL_FLAGS,
  CONCEPTUAL_INDICATORS,
  SOCRATIC_VIOLATIONS_IN_INSTRUCT,
};
