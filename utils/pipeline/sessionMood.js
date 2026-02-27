/**
 * SESSION MOOD — Computes emotional arc across a conversation
 *
 * A human tutor notices patterns across time:
 * - "They started confident but they're fading"
 * - "They were stuck but just had a breakthrough"
 * - "They're in the zone — don't interrupt"
 * - "They're getting tired — shorter messages, longer pauses"
 *
 * This module reads the full conversation history and returns a
 * session-level mood snapshot. Pure function, no DB, no LLM.
 *
 * Consumed by:
 *   - decide stage: adjusts scaffold thresholds, skip DOK3 in flow
 *   - generate stage: one-line mood directive in the prompt
 *
 * @module pipeline/sessionMood
 */

const { PATTERNS, CONTEXT_SIGNALS } = require('./observe');

// ── Mood trajectory labels ──
const TRAJECTORIES = {
  RISING: 'rising',           // Getting better — correct answers, engagement
  FALLING: 'falling',         // Getting worse — more wrong, frustration
  STABLE: 'stable',           // Steady state
  RECOVERED: 'recovered',     // Was falling, now rising — celebrate this
};

const ENERGY_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/**
 * Score a single message for emotional valence.
 * Positive = good (engagement, correct, confidence).
 * Negative = bad (frustration, wrong, give-up).
 * Returns a number from -1 to +1.
 */
function scoreMessage(msg) {
  if (!msg || !msg.content) return 0;

  const content = msg.content.toLowerCase();
  let score = 0;

  if (msg.role === 'user') {
    // Positive signals
    if (PATTERNS.affirmative.test(content)) score += 0.3;
    if (PATTERNS.metacognition.test(content)) score += 0.5;  // "oh I see!" = breakthrough
    if (PATTERNS.confidence.test(content)) score += 0.2;
    if (/^(cool|nice|awesome|sweet|great|thanks|wow)\b/i.test(content)) score += 0.3;

    // Negative signals
    if (PATTERNS.frustration.test(content)) score -= 0.6;
    if (PATTERNS.idk.test(content)) score -= 0.3;
    if (PATTERNS.giveUp.test(content)) score -= 0.7;
    if (PATTERNS.uncertainty.test(content)) score -= 0.1;

    // Message length as energy proxy (very short = disengaged or quick answer)
    // Very short non-answer messages suggest low engagement
    const words = content.split(/\s+/).length;
    if (words <= 2 && !PATTERNS.affirmative.test(content) && !/^\d/.test(content)) {
      score -= 0.1; // Terse, disengaged
    }
  }

  if (msg.role === 'assistant') {
    // Use problemResult if available (set by persist stage)
    if (msg.problemResult === 'correct') score += 0.5;
    if (msg.problemResult === 'incorrect') score -= 0.3;
    if (msg.problemResult === 'skipped') score -= 0.2;
  }

  return Math.max(-1, Math.min(1, score));
}

/**
 * Compute the session mood from full conversation history.
 *
 * @param {Array} messages - Full conversation messages array
 * @param {Object} [options]
 * @param {Date} [options.sessionStart] - When the session started (for fatigue detection)
 * @returns {Object} Session mood snapshot
 */
function computeSessionMood(messages, options = {}) {
  if (!messages || messages.length < 2) {
    return {
      trajectory: TRAJECTORIES.STABLE,
      energy: ENERGY_LEVELS.MEDIUM,
      momentum: 0,
      inFlow: false,
      fatigueSignal: false,
      turnCount: messages?.length || 0,
      summary: null,
    };
  }

  // Score every message
  const scored = messages.map(msg => ({
    role: msg.role,
    score: scoreMessage(msg),
    timestamp: msg.timestamp ? new Date(msg.timestamp) : null,
    problemResult: msg.problemResult || null,
  }));

  // ── Trajectory: compare first half vs second half ──
  const mid = Math.floor(scored.length / 2);
  const firstHalf = scored.slice(0, mid);
  const secondHalf = scored.slice(mid);

  const firstAvg = average(firstHalf.map(s => s.score));
  const secondAvg = average(secondHalf.map(s => s.score));
  const delta = secondAvg - firstAvg;

  let trajectory;
  if (delta > 0.15) {
    // Check if it was falling before — that makes it a recovery
    const quarterPoint = Math.floor(scored.length / 4);
    const q1Avg = average(scored.slice(0, quarterPoint).map(s => s.score));
    const q2Avg = average(scored.slice(quarterPoint, mid).map(s => s.score));
    trajectory = (q2Avg < q1Avg - 0.1) ? TRAJECTORIES.RECOVERED : TRAJECTORIES.RISING;
  } else if (delta < -0.15) {
    trajectory = TRAJECTORIES.FALLING;
  } else {
    trajectory = TRAJECTORIES.STABLE;
  }

  // ── Momentum: weighted recent score (last 6 messages matter more) ──
  const recent = scored.slice(-6);
  const momentum = weightedAverage(recent.map(s => s.score));

  // ── Energy level: from momentum + message patterns ──
  const recentUserMessages = messages.filter(m => m.role === 'user').slice(-6);
  const avgWordCount = average(recentUserMessages.map(m => (m.content || '').split(/\s+/).length));

  let energy;
  if (momentum > 0.2 && avgWordCount > 4) {
    energy = ENERGY_LEVELS.HIGH;
  } else if (momentum < -0.2 || avgWordCount < 2.5) {
    energy = ENERGY_LEVELS.LOW;
  } else {
    energy = ENERGY_LEVELS.MEDIUM;
  }

  // ── Flow state: 4+ consecutive correct answers with no help requests ──
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  const recentResults = assistantMessages.slice(-6)
    .map(m => m.problemResult)
    .filter(Boolean);

  let consecutiveCorrect = 0;
  for (let i = recentResults.length - 1; i >= 0; i--) {
    if (recentResults[i] === 'correct') consecutiveCorrect++;
    else break;
  }

  const recentHelpRequests = userMessages.slice(-6)
    .filter(m => PATTERNS.helpRequest.test(m.content?.toLowerCase() || '')).length;

  const inFlow = consecutiveCorrect >= 4 && recentHelpRequests === 0;

  // ── Fatigue detection ──
  // Signals: session > 20 min, falling energy, shorter messages over time
  let fatigueSignal = false;
  if (options.sessionStart) {
    const sessionMinutes = (Date.now() - new Date(options.sessionStart).getTime()) / 60000;
    if (sessionMinutes > 20 && energy === ENERGY_LEVELS.LOW) {
      fatigueSignal = true;
    }
    if (sessionMinutes > 30 && trajectory === TRAJECTORIES.FALLING) {
      fatigueSignal = true;
    }
  }
  // Also detect from message length trend (no timestamp needed)
  if (userMessages.length >= 8) {
    const earlyWords = average(userMessages.slice(0, 4).map(m => (m.content || '').split(/\s+/).length));
    const lateWords = average(userMessages.slice(-4).map(m => (m.content || '').split(/\s+/).length));
    if (earlyWords > 5 && lateWords < 3) {
      fatigueSignal = true;
    }
  }

  // ── Human-readable summary ──
  const summary = buildSummary(trajectory, energy, momentum, inFlow, fatigueSignal, consecutiveCorrect);

  return {
    trajectory,
    energy,
    momentum: Math.round(momentum * 100) / 100,
    inFlow,
    fatigueSignal,
    consecutiveCorrect,
    turnCount: messages.length,
    summary,
  };
}

/**
 * Build a concise prompt-friendly summary of the session mood.
 * This is what gets injected into the generate stage.
 */
function buildSummary(trajectory, energy, momentum, inFlow, fatigueSignal, consecutiveCorrect) {
  if (inFlow) {
    return `Student is in flow (${consecutiveCorrect} correct in a row). Maintain pace. Don't over-explain or interrupt with comprehension checks.`;
  }

  if (fatigueSignal) {
    return `Student is showing fatigue. Keep responses shorter. Offer a break or easier problem. Don't push DOK 3.`;
  }

  if (trajectory === TRAJECTORIES.RECOVERED) {
    return `Student was struggling but is now recovering. Acknowledge the turnaround naturally. Build on this momentum.`;
  }

  if (trajectory === TRAJECTORIES.FALLING && energy === ENERGY_LEVELS.LOW) {
    return `Student energy is dropping. Simplify. Shorter responses. Consider offering a different approach or break.`;
  }

  if (trajectory === TRAJECTORIES.FALLING) {
    return `Student is struggling more than earlier. Lower the bar slightly. More scaffolding, fewer open-ended questions.`;
  }

  if (trajectory === TRAJECTORIES.RISING) {
    return `Student is gaining confidence. Good momentum — can increase difficulty slightly.`;
  }

  // Stable / neutral
  return null;
}

/**
 * Build a one-line directive for the generate stage prompt.
 * Returns null if no mood context is noteworthy.
 */
function buildMoodDirective(sessionMood) {
  if (!sessionMood || !sessionMood.summary) return null;
  return `--- SESSION MOOD ---\n${sessionMood.summary}`;
}

// ── Utilities ──

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function weightedAverage(nums) {
  if (!nums.length) return 0;
  // More recent messages get higher weight
  let totalWeight = 0;
  let weightedSum = 0;
  for (let i = 0; i < nums.length; i++) {
    const weight = i + 1; // 1, 2, 3, ... (latest = highest)
    weightedSum += nums[i] * weight;
    totalWeight += weight;
  }
  return weightedSum / totalWeight;
}

module.exports = {
  computeSessionMood,
  buildMoodDirective,
  scoreMessage,
  TRAJECTORIES,
  ENERGY_LEVELS,
};
