/**
 * MASTERY MODE ORCHESTRATOR
 *
 * Guides students through a 3-phase mastery journey:
 * 1. Adaptive Placement (Screener)
 * 2. AI Interview Probe (Frontier Deep Dive)
 * 3. Mastery Badge Earning
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const masteryState = {
  currentPhase: null,  // 'placement' | 'interview' | 'badges'
  screenerResults: null,
  interviewComplete: false,
  badges: []
};

// ============================================================================
// BUTTON CONTROLS (No modal - redirects to separate page)
// ============================================================================

let elements = {};

// Initialize after DOM is loaded
function initializeMasteryMode() {
  elements = {
    masteryModeBtn: document.getElementById('mastery-mode-btn')
  };

  // Redirect to badge map for separate mastery experience
  elements.masteryModeBtn?.addEventListener('click', () => {
    console.log('Mastery Mode button clicked! Redirecting to badge map...');
    window.location.href = '/badge-map.html';
  });

  console.log('Mastery Mode button initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMasteryMode);
} else {
  initializeMasteryMode();
}

// ============================================================================
// PHASE 2: AI INTERVIEW PROBE
// ============================================================================

/**
 * Check if returning from screener and should start interview
 */
async function checkMasteryPhaseOnLoad() {
  const masteryActive = sessionStorage.getItem('masteryModeActive');
  const currentPhase = sessionStorage.getItem('masteryPhase');

  if (masteryActive === 'true') {
    if (currentPhase === 'interview') {
      // Start AI interview probe
      await startAIInterviewProbe();
    } else if (currentPhase === 'badges') {
      // Show badge earning interface
      await showBadgeEarning();
    }
  }
}

/**
 * Start AI-driven interview at student's frontier
 */
async function startAIInterviewProbe() {
  console.log('Starting AI Interview Probe...');

  // Get screener results from session storage
  const screenerResults = JSON.parse(sessionStorage.getItem('screenerResults') || '{}');

  if (!screenerResults || !screenerResults.theta) {
    console.error('No screener results found');
    return;
  }

  // Show interview introduction
  showInterviewIntro(screenerResults);
}

/**
 * Show interview introduction message
 */
function showInterviewIntro(results) {
  const interviewMessage = {
    role: 'assistant',
    content: `# 🔬 AI Interview Probe

Great job on the placement test! You scored at **θ = ${results.theta}** (${results.percentile}th percentile).

Now I'm going to ask you some deeper questions to really understand your frontier skills. This isn't about right or wrong answers—I want to see how you think about problems at the edge of your ability.

**Your Frontier Skills:**
${results.frontierSkills?.map(skill => `- ${skill.replace(/-/g, ' ')}`).join('\n') || '- To be determined'}

Let's start with a question that will help me understand your reasoning process.`,
    isSystemMessage: true
  };

  // Display in chat
  if (window.appendMessage) {
    window.appendMessage(interviewMessage.content, 'ai');
  }

  // Trigger first interview question via API
  triggerInterviewQuestion(results);
}

/**
 * Trigger AI to ask first interview question
 */
async function triggerInterviewQuestion(results) {
  try {
    // Send message to AI requesting interview question
    const response = await fetch('/api/mastery/interview-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        screenerResults: results,
        phase: 'initial'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get interview question');
    }

    const data = await response.json();

    // Display AI's question
    if (data.question && window.appendMessage) {
      window.appendMessage(data.question, 'ai');
    }

  } catch (error) {
    console.error('Error getting interview question:', error);

    // Fallback: Just let the AI continue naturally
    if (window.appendMessage) {
      window.appendMessage('Let\'s explore your understanding. Can you explain your thinking on the problems you found challenging?', 'ai');
    }
  }
}

// ============================================================================
// PHASE 3: MASTERY BADGE EARNING
// ============================================================================

/**
 * Show badge earning interface
 */
async function showBadgeEarning() {
  console.log('Starting Badge Earning Phase...');

  // Show brief intro message before redirecting
  if (window.appendMessage) {
    window.appendMessage(`# 🎖️ Phase 3: Mastery Badge Earning

Excellent work! You've completed the interview phase.

Now it's time to choose a skill to master and earn your first badge!

Redirecting you to the Badge Map...`, 'ai');
  }

  // Redirect to badge map after short delay
  setTimeout(() => {
    window.location.href = '/badge-map.html';
  }, 2000);
}

/**
 * Display badge earning interface
 */
function displayBadgeInterface(badges) {
  if (!window.appendMessage) return;

  const badgeList = badges.map(badge =>
    `- **${badge.name}** - ${badge.description} (Difficulty: ${badge.difficulty})`
  ).join('\n');

  window.appendMessage(`# 🎖️ Available Mastery Badges

Based on your assessment, here are the badges you can earn:

${badgeList}

Reply with the name of the badge you'd like to pursue, or say "show me all" to see your full progress.`, 'ai');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Complete current phase and move to next
 */
function completePhase(phase) {
  if (phase === 'placement') {
    sessionStorage.setItem('masteryPhase', 'interview');
    // Results are passed via screener completion
  } else if (phase === 'interview') {
    sessionStorage.setItem('masteryPhase', 'badges');
    masteryState.interviewComplete = true;
  }
}

/**
 * Exit mastery mode
 */
function exitMasteryMode() {
  sessionStorage.removeItem('masteryModeActive');
  sessionStorage.removeItem('masteryPhase');
  sessionStorage.removeItem('screenerResults');
  masteryState.currentPhase = null;
  masteryState.screenerResults = null;
  masteryState.interviewComplete = false;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Check on page load if we're in the middle of mastery mode
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkMasteryPhaseOnLoad);
} else {
  checkMasteryPhaseOnLoad();
}

console.log('Mastery Mode Orchestrator initialized');

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    startAIInterviewProbe,
    showBadgeEarning,
    completePhase,
    exitMasteryMode
  };
}
