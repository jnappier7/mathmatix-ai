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
// MODAL CONTROLS
// ============================================================================

let elements = {};

// Initialize after DOM is loaded
function initializeMasteryMode() {
  elements = {
    masteryModeBtn: document.getElementById('mastery-mode-btn'),
    masteryModeModal: document.getElementById('mastery-mode-modal'),
    closeMasteryModal: document.getElementById('close-mastery-mode-modal'),
    startJourneyBtn: document.getElementById('start-mastery-journey-btn'),
    cancelBtn: document.getElementById('cancel-mastery-mode-btn')
  };

  // Open modal
  elements.masteryModeBtn?.addEventListener('click', () => {
    console.log('Mastery Mode button clicked!');
    elements.masteryModeModal.style.display = 'flex';
  });

  // Close modal
  elements.closeMasteryModal?.addEventListener('click', () => {
    elements.masteryModeModal.style.display = 'none';
  });

  elements.cancelBtn?.addEventListener('click', () => {
    elements.masteryModeModal.style.display = 'none';
  });

  // Click outside to close
  elements.masteryModeModal?.addEventListener('click', (e) => {
    if (e.target === elements.masteryModeModal) {
      elements.masteryModeModal.style.display = 'none';
    }
  });

  // Start mastery journey - redirect to screener
  elements.startJourneyBtn?.addEventListener('click', async () => {
    try {
      console.log('Begin Journey clicked!');
      // Save state to indicate we're starting mastery mode
      sessionStorage.setItem('masteryModeActive', 'true');
      sessionStorage.setItem('masteryPhase', 'placement');

      // Redirect to screener
      window.location.href = '/screener.html';
    } catch (error) {
      console.error('Error starting mastery journey:', error);
      alert('Failed to start mastery journey. Please try again.');
    }
  });

  console.log('Mastery Mode initialized', elements);
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
  if (window.displayMessage) {
    window.displayMessage(interviewMessage);
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
    if (data.question && window.displayMessage) {
      window.displayMessage({
        role: 'assistant',
        content: data.question
      });
    }

  } catch (error) {
    console.error('Error getting interview question:', error);

    // Fallback: Just let the AI continue naturally
    if (window.displayMessage) {
      window.displayMessage({
        role: 'assistant',
        content: 'Let\'s explore your understanding. Can you explain your thinking on the problems you found challenging?'
      });
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

  try {
    // Fetch available badges based on student's level
    const response = await fetch('/api/mastery/available-badges', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load badges');
    }

    const data = await response.json();

    // Show badge selection interface
    displayBadgeInterface(data.badges);

  } catch (error) {
    console.error('Error loading badges:', error);

    // Fallback message
    if (window.displayMessage) {
      window.displayMessage({
        role: 'assistant',
        content: `# 🎖️ Mastery Badges

You've completed the interview! Now you can start earning mastery badges.

**How it works:**
- Choose a skill to demonstrate mastery in
- Complete a series of problems at that skill level
- Earn your badge when you demonstrate consistent mastery

Which skill would you like to work on first?`
      });
    }
  }
}

/**
 * Display badge earning interface
 */
function displayBadgeInterface(badges) {
  if (!window.displayMessage) return;

  const badgeList = badges.map(badge =>
    `- **${badge.name}** - ${badge.description} (Difficulty: ${badge.difficulty})`
  ).join('\n');

  window.displayMessage({
    role: 'assistant',
    content: `# 🎖️ Available Mastery Badges

Based on your assessment, here are the badges you can earn:

${badgeList}

Reply with the name of the badge you'd like to pursue, or say "show me all" to see your full progress.`,
    isSystemMessage: true
  });
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
