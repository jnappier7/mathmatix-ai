/**
 * CROSS-SESSION PATTERN DETECTOR
 *
 * A human tutor notices patterns across sessions that aren't visible in any
 * single conversation: "This is the third time fractions have tripped them up,"
 * "They always disengage after 20 minutes," "They learn better with visual models."
 *
 * This module analyzes interaction data across sessions to detect patterns and
 * generate tutor notes, signal updates, and plan adjustments.
 *
 * Pure functions — no DB access. Called by the persist stage after each session.
 *
 * @module utils/sessionPatternDetector
 */

// ── Pattern types ──
const PATTERN_TYPES = {
  RECURRING_STRUGGLE: 'recurring_struggle',
  CONFIDENCE_TREND: 'confidence_trend',
  ENGAGEMENT_PATTERN: 'engagement_pattern',
  LEARNING_STYLE_SIGNAL: 'learning_style_signal',
  FRUSTRATION_TRIGGER: 'frustration_trigger',
  BREAKTHROUGH_PATTERN: 'breakthrough_pattern',
  READINESS_SIGNAL: 'readiness_signal',
  RETENTION_DECAY: 'retention_decay',
  PRODUCTIVE_STRUGGLE_THRESHOLD: 'productive_struggle_threshold',
  PREREQUISITE_CHAIN_INSIGHT: 'prerequisite_chain_insight',
};

/**
 * Detect patterns across sessions and generate tutor intelligence.
 *
 * @param {Object} sessionData - Data from the current session
 * @param {string} sessionData.mood - rising / falling / stable
 * @param {Object[]} sessionData.problemResults - [{ correct, skillId, misconception? }]
 * @param {string[]} sessionData.misconceptions - Misconception names encountered
 * @param {string[]} sessionData.skillsWorkedOn - Skill IDs worked on
 * @param {number} sessionData.duration - Session duration in minutes
 * @param {number} sessionData.messageCount - Total messages
 * @param {string[]} sessionData.observationTypes - Message types from observe stage
 * @param {string} sessionData.outcome - productive / struggled / breakthrough / disengaged
 *
 * @param {Object} historicalData - Data from previous sessions
 * @param {Object[]} historicalData.recentSessions - Last 5-10 session summaries
 * @param {Object[]} historicalData.tutorNotes - Existing tutor notes
 * @param {Object} historicalData.skillMastery - User's skill mastery map
 * @param {Object} historicalData.studentSignals - Current student signals
 *
 * @returns {Object} { patterns[], notes[], signalUpdates, planUpdates }
 */
function detectPatterns(sessionData, historicalData) {
  const patterns = [];
  const notes = [];
  const signalUpdates = {};
  const planUpdates = { addSkills: [], removeSkills: [], reprioritize: [], adjustMode: [] };

  const recent = historicalData.recentSessions || [];
  const allSessions = [...recent, sessionData];

  // ── 1. Recurring Struggle ──
  detectRecurringStruggle(sessionData, recent, patterns, notes, planUpdates);

  // ── 2. Confidence Trend ──
  detectConfidenceTrend(allSessions, patterns, notes, signalUpdates);

  // ── 3. Engagement Pattern ──
  detectEngagementPattern(sessionData, recent, patterns, notes, signalUpdates);

  // ── 4. Frustration Triggers ──
  detectFrustrationTriggers(sessionData, recent, patterns, notes, signalUpdates);

  // ── 5. Breakthrough Pattern ──
  detectBreakthroughPattern(sessionData, recent, patterns, notes, signalUpdates);

  // ── 6. Readiness Signal ──
  detectReadinessSignal(sessionData, recent, patterns, notes, planUpdates);

  // ── 7. Retention Decay ──
  detectRetentionDecay(historicalData.skillMastery, recent, patterns, notes, planUpdates);

  // ── 8. Productive Struggle Threshold ──
  detectProductiveStruggleThreshold(allSessions, patterns, notes, signalUpdates);

  return { patterns, notes, signalUpdates, planUpdates };
}

// ═══════════════════════════════════════════════════════════
// PATTERN DETECTORS
// ═══════════════════════════════════════════════════════════

function detectRecurringStruggle(session, recent, patterns, notes, planUpdates) {
  const currentStruggles = session.misconceptions || [];
  const currentSkills = session.skillsWorkedOn || [];

  // Count how many recent sessions had the same misconceptions
  for (const misconception of currentStruggles) {
    const priorOccurrences = recent.filter(s =>
      (s.misconceptions || []).includes(misconception)
    ).length;

    if (priorOccurrences >= 2) {
      patterns.push({
        type: PATTERN_TYPES.RECURRING_STRUGGLE,
        description: `"${misconception}" has appeared in ${priorOccurrences + 1} sessions`,
        severity: priorOccurrences >= 3 ? 'high' : 'medium',
        data: { misconception, occurrences: priorOccurrences + 1 },
      });
      notes.push({
        content: `Recurring misconception: "${misconception}" (${priorOccurrences + 1} sessions). Previous approach isn't working — need different representation or entry point.`,
        category: 'misconception',
        skillId: currentSkills[0] || null,
      });
    }
  }

  // Count how many sessions struggled with the same skill
  for (const skillId of currentSkills) {
    const priorStruggles = recent.filter(s =>
      s.outcome === 'struggled' && (s.skillsWorkedOn || []).includes(skillId)
    ).length;

    if (priorStruggles >= 2 && session.outcome === 'struggled') {
      patterns.push({
        type: PATTERN_TYPES.RECURRING_STRUGGLE,
        description: `Student has struggled with skill "${skillId}" in ${priorStruggles + 1} sessions`,
        severity: 'high',
        data: { skillId, occurrences: priorStruggles + 1 },
      });
      planUpdates.adjustMode.push({
        skillId,
        newMode: 'instruct',
        reason: `Recurring struggle — need to re-teach from scratch with different approach`,
      });
    }
  }
}

function detectConfidenceTrend(allSessions, patterns, notes, signalUpdates) {
  if (allSessions.length < 3) return;

  const last5 = allSessions.slice(-5);
  const outcomes = last5.map(s => s.outcome);
  const moods = last5.map(s => s.mood).filter(Boolean);

  // Rising confidence: multiple productive/breakthrough sessions
  const positiveCount = outcomes.filter(o => o === 'productive' || o === 'breakthrough').length;
  const negativeCount = outcomes.filter(o => o === 'struggled' || o === 'disengaged').length;

  if (positiveCount >= 4) {
    patterns.push({
      type: PATTERN_TYPES.CONFIDENCE_TREND,
      description: 'Confidence rising across recent sessions',
      severity: 'positive',
      data: { trend: 'rising', positiveCount },
    });
    signalUpdates.overallConfidence = 'high';
    signalUpdates.engagementTrend = 'growing';
  } else if (negativeCount >= 3) {
    patterns.push({
      type: PATTERN_TYPES.CONFIDENCE_TREND,
      description: 'Confidence declining across recent sessions',
      severity: 'high',
      data: { trend: 'falling', negativeCount },
    });
    signalUpdates.overallConfidence = 'low';
    signalUpdates.engagementTrend = 'declining';
    notes.push({
      content: `Student confidence declining — ${negativeCount} difficult sessions recently. Consider easier material for a confidence boost.`,
      category: 'emotional',
    });
  }

  // Mood trajectory
  const risingMoods = moods.filter(m => m === 'rising').length;
  const fallingMoods = moods.filter(m => m === 'falling').length;
  if (fallingMoods >= 3 && risingMoods <= 1) {
    signalUpdates.engagementTrend = 'declining';
  }
}

function detectEngagementPattern(session, recent, patterns, notes, signalUpdates) {
  // Duration pattern
  const durations = [...recent.map(s => s.duration || 0), session.duration || 0].filter(d => d > 0);
  if (durations.length >= 3) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Short sessions getting shorter
    if (durations.length >= 4) {
      const firstHalf = durations.slice(0, Math.floor(durations.length / 2));
      const secondHalf = durations.slice(Math.floor(durations.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg < firstAvg * 0.7 && secondAvg < 10) {
        patterns.push({
          type: PATTERN_TYPES.ENGAGEMENT_PATTERN,
          description: 'Session duration declining — student may be losing interest',
          severity: 'medium',
          data: { avgDuration: Math.round(avg), trend: 'shortening' },
        });
        notes.push({
          content: `Sessions getting shorter (avg ${Math.round(avg)}min). May need to adjust difficulty or change topics for engagement.`,
          category: 'engagement',
        });
      }
    }

    // Consistently long sessions — student is engaged
    if (avg > 25) {
      signalUpdates.engagementTrend = 'growing';
    }
  }

  // Disengagement pattern
  const recentDisengaged = recent.filter(s => s.outcome === 'disengaged').length;
  if (recentDisengaged >= 2) {
    patterns.push({
      type: PATTERN_TYPES.ENGAGEMENT_PATTERN,
      description: `Student disengaged in ${recentDisengaged} of last ${recent.length} sessions`,
      severity: 'high',
      data: { disengagedCount: recentDisengaged },
    });
  }
}

function detectFrustrationTriggers(session, recent, patterns, notes, signalUpdates) {
  // Find topics/skills that consistently correlate with frustration
  const frustratingSessions = [...recent.filter(s => s.outcome === 'struggled' || s.mood === 'falling')];
  if (session.outcome === 'struggled' || session.mood === 'falling') {
    frustratingSessions.push(session);
  }

  if (frustratingSessions.length < 2) return;

  // Count skill frequency in frustrating sessions
  const skillFrequency = {};
  for (const s of frustratingSessions) {
    for (const skillId of (s.skillsWorkedOn || [])) {
      skillFrequency[skillId] = (skillFrequency[skillId] || 0) + 1;
    }
  }

  const triggers = Object.entries(skillFrequency)
    .filter(([_, count]) => count >= 2)
    .map(([skillId, count]) => skillId);

  if (triggers.length > 0) {
    patterns.push({
      type: PATTERN_TYPES.FRUSTRATION_TRIGGER,
      description: `Frustration consistently associated with: ${triggers.join(', ')}`,
      severity: 'medium',
      data: { triggers },
    });
    signalUpdates.frustrationTriggers = triggers;
    notes.push({
      content: `Frustration triggers identified: ${triggers.join(', ')}. Consider different teaching approach for these topics.`,
      category: 'emotional',
    });
  }
}

function detectBreakthroughPattern(session, recent, patterns, notes, signalUpdates) {
  if (session.outcome !== 'breakthrough') return;

  // What was different about this session?
  const breakthroughData = {
    skills: session.skillsWorkedOn || [],
    duration: session.duration,
    messageCount: session.messageCount,
  };

  // Compare to struggling sessions
  const struggles = recent.filter(s => s.outcome === 'struggled');
  if (struggles.length > 0) {
    // Did the breakthrough happen on a skill that previously caused struggle?
    const previouslyDifficult = session.skillsWorkedOn?.filter(skillId =>
      struggles.some(s => (s.skillsWorkedOn || []).includes(skillId))
    ) || [];

    if (previouslyDifficult.length > 0) {
      patterns.push({
        type: PATTERN_TYPES.BREAKTHROUGH_PATTERN,
        description: `Breakthrough on previously difficult skill(s): ${previouslyDifficult.join(', ')}`,
        severity: 'positive',
        data: { skills: previouslyDifficult },
      });
      notes.push({
        content: `Breakthrough on ${previouslyDifficult.join(', ')} — perseverance paying off!`,
        category: 'breakthrough',
        skillId: previouslyDifficult[0],
      });
      signalUpdates.recentBreakthroughs = previouslyDifficult;
    }
  }
}

function detectReadinessSignal(session, recent, patterns, notes, planUpdates) {
  // Multiple consecutive productive sessions
  const recentOutcomes = [...recent.slice(-4).map(s => s.outcome), session.outcome];
  const productiveStreak = recentOutcomes.filter(o => o === 'productive' || o === 'breakthrough').length;

  if (productiveStreak >= 3) {
    patterns.push({
      type: PATTERN_TYPES.READINESS_SIGNAL,
      description: `${productiveStreak} consecutive productive sessions — student may be ready for harder material`,
      severity: 'positive',
      data: { streak: productiveStreak },
    });

    // Suggest strengthening current skills
    for (const skillId of (session.skillsWorkedOn || [])) {
      planUpdates.adjustMode.push({
        skillId,
        newMode: 'strengthen',
        reason: 'Consistent success — ready for harder problems',
      });
    }
  }
}

function detectRetentionDecay(skillMastery, recent, patterns, notes, planUpdates) {
  if (!skillMastery) return;

  // Check if any mastered skills showed signs of decay in recent sessions
  const decayingSkills = [];

  for (const s of recent) {
    const incorrectSkills = (s.problemResults || [])
      .filter(r => !r.correct)
      .map(r => r.skillId)
      .filter(Boolean);

    for (const skillId of incorrectSkills) {
      const mastery = skillMastery instanceof Map
        ? skillMastery.get(skillId)
        : skillMastery?.[skillId];

      if (mastery && (mastery.status === 'mastered' || mastery.masteryScore >= 70)) {
        decayingSkills.push(skillId);
      }
    }
  }

  // Count occurrences
  const decayCount = {};
  for (const skillId of decayingSkills) {
    decayCount[skillId] = (decayCount[skillId] || 0) + 1;
  }

  for (const [skillId, count] of Object.entries(decayCount)) {
    if (count >= 2) {
      patterns.push({
        type: PATTERN_TYPES.RETENTION_DECAY,
        description: `Previously mastered skill "${skillId}" showing decay (errors in ${count} sessions)`,
        severity: 'medium',
        data: { skillId, errorSessions: count },
      });
      notes.push({
        content: `Retention decay on "${skillId}" — was mastered but errors appearing. Schedule review.`,
        category: 'prerequisite',
        skillId,
      });
      planUpdates.addSkills.push({
        skillId,
        reason: 'review-due',
        priority: 6,
      });
    }
  }
}

function detectProductiveStruggleThreshold(allSessions, patterns, notes, signalUpdates) {
  if (allSessions.length < 4) return;

  // Find sessions where struggle led to breakthrough vs. disengagement
  const struggleThenBreakthrough = [];
  const struggleThenDisengage = [];

  for (let i = 0; i < allSessions.length - 1; i++) {
    if (allSessions[i].outcome === 'struggled') {
      if (allSessions[i + 1].outcome === 'breakthrough' || allSessions[i + 1].outcome === 'productive') {
        struggleThenBreakthrough.push(allSessions[i]);
      } else if (allSessions[i + 1].outcome === 'disengaged' || allSessions[i + 1].outcome === 'struggled') {
        struggleThenDisengage.push(allSessions[i]);
      }
    }
  }

  // Compare durations — productive struggle sessions tend to be shorter
  if (struggleThenBreakthrough.length >= 2 && struggleThenDisengage.length >= 1) {
    const productiveDuration = avgDuration(struggleThenBreakthrough);
    const destructiveDuration = avgDuration(struggleThenDisengage);

    if (productiveDuration < destructiveDuration) {
      patterns.push({
        type: PATTERN_TYPES.PRODUCTIVE_STRUGGLE_THRESHOLD,
        description: `Productive struggle threshold: ~${Math.round(productiveDuration)} min of struggle leads to breakthroughs, but after ~${Math.round(destructiveDuration)} min, student disengages`,
        severity: 'insight',
        data: { productiveThreshold: productiveDuration, destructiveThreshold: destructiveDuration },
      });
      notes.push({
        content: `Productive struggle lasts about ${Math.round(productiveDuration)} min for this student. After ${Math.round(destructiveDuration)} min of struggle, switch approach or offer a break.`,
        category: 'learning-style',
      });
    }
  }
}

// ── Helpers ──

function avgDuration(sessions) {
  const durations = sessions.map(s => s.duration || 0).filter(d => d > 0);
  if (durations.length === 0) return 0;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

/**
 * Summarize a session for storage in the TutorPlan's recent sessions list.
 *
 * @param {Object} conversation - Conversation document
 * @param {Object} pipelineResults - Results from the last pipeline run
 * @returns {Object} Session summary for storage
 */
function summarizeSession(conversation, pipelineResults) {
  const messages = conversation?.messages || [];
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');

  // Extract problem results
  const problemResults = assistantMessages
    .filter(m => m.problemResult)
    .map(m => ({
      correct: m.problemResult === 'correct',
      skillId: null, // Would need skill tracking per message to populate
    }));

  const correct = problemResults.filter(r => r.correct).length;
  const total = problemResults.length;

  // Calculate duration
  const firstMsg = messages[0]?.timestamp;
  const lastMsg = messages[messages.length - 1]?.timestamp;
  const duration = firstMsg && lastMsg
    ? (new Date(lastMsg) - new Date(firstMsg)) / (1000 * 60)
    : 0;

  // Determine outcome
  let outcome = 'productive';
  if (pipelineResults?._pipeline?.sessionMood?.fatigueSignal) {
    outcome = 'disengaged';
  } else if (total > 0 && correct / total < 0.3) {
    outcome = 'struggled';
  } else if (total > 0 && correct / total > 0.8 && total >= 5) {
    outcome = 'breakthrough';
  }

  return {
    date: new Date(),
    messageCount: messages.length,
    duration: Math.round(duration),
    mood: pipelineResults?._pipeline?.sessionMood?.trajectory || 'stable',
    outcome,
    problemResults,
    misconceptions: [], // Populated by pipeline if detected
    skillsWorkedOn: pipelineResults?._pipeline?.backbone?.targetSkill
      ? [pipelineResults._pipeline.backbone.targetSkill]
      : [],
    observationTypes: userMessages
      .map(m => m.observationType)
      .filter(Boolean),
    accuracy: total > 0 ? correct / total : null,
  };
}

/**
 * Generate human-readable insight from detected patterns.
 * What a tutor would say to a colleague about this student.
 *
 * @param {Object[]} patterns - From detectPatterns
 * @returns {string[]} Human-readable insights
 */
function generateTutorInsight(patterns) {
  return patterns.map(p => {
    switch (p.type) {
      case PATTERN_TYPES.RECURRING_STRUGGLE:
        return p.severity === 'high'
          ? `This student consistently struggles with ${p.data.skillId || p.data.misconception}. We need a fundamentally different approach.`
          : `Watch out for "${p.data.misconception}" — it keeps coming back.`;

      case PATTERN_TYPES.CONFIDENCE_TREND:
        return p.data.trend === 'rising'
          ? `This student is on a roll — confidence is building nicely.`
          : `Confidence is dropping. Consider easier wins to rebuild momentum.`;

      case PATTERN_TYPES.ENGAGEMENT_PATTERN:
        return `Sessions are getting shorter. May need more engaging problems or a topic change.`;

      case PATTERN_TYPES.FRUSTRATION_TRIGGER:
        return `Frustration spikes around ${p.data.triggers.join(' and ')}. Tread carefully there.`;

      case PATTERN_TYPES.BREAKTHROUGH_PATTERN:
        return `Had a breakthrough on ${p.data.skills.join(', ')} — build on this momentum!`;

      case PATTERN_TYPES.READINESS_SIGNAL:
        return `Ready for harder material — ${p.data.streak} solid sessions in a row.`;

      case PATTERN_TYPES.RETENTION_DECAY:
        return `"${p.data.skillId}" is fading — needs a review session soon.`;

      case PATTERN_TYPES.PRODUCTIVE_STRUGGLE_THRESHOLD:
        return `This student's productive struggle window is about ${Math.round(p.data.productiveThreshold)} minutes. After that, switch gears.`;

      default:
        return p.description;
    }
  });
}

module.exports = {
  detectPatterns,
  summarizeSession,
  generateTutorInsight,
  PATTERN_TYPES,
};
