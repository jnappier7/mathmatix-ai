/**
 * GHOST TIMER - Adaptive Fluency Tracking
 *
 * PHILOSOPHY:
 * - Track response times WITHOUT inducing panic
 * - No ticking countdown clock
 * - Subtle visual cues only at key thresholds
 * - Invisible to the student, visible to the system
 *
 * DESIGN:
 * - Starts automatically when AI asks a question
 * - Tracks elapsed time in the background
 * - Sends response time with answer for fluency analysis
 * - Optional visual "encouragement" cues (not warnings)
 *
 * @module ghostTimer
 */

class GhostTimer {
  constructor() {
    this.startTime = null;
    this.isActive = false;
    this.currentProblemType = null;  // 'reflex', 'process', 'algorithm', 'conceptual'
    this.timeLimits = null;           // Adaptive time limits from server
    this.visualCueTimeout = null;
    this.onTimeUpdate = null;         // Callback for time updates
  }

  /**
   * Start the ghost timer for a new problem
   *
   * @param {Object} options - Timer configuration
   * @param {String} options.problemType - 'reflex', 'process', 'algorithm', 'conceptual'
   * @param {Object} options.timeLimits - { expectedTime, warningThreshold, ghostLimit }
   * @param {Function} options.onTimeUpdate - Callback with elapsed time
   */
  start(options = {}) {
    this.reset();

    this.startTime = Date.now();
    this.isActive = true;
    this.currentProblemType = options.problemType || 'process';
    this.timeLimits = options.timeLimits || null;
    this.onTimeUpdate = options.onTimeUpdate || null;

    // Start tracking loop (update every second)
    this.trackingInterval = setInterval(() => {
      this.tick();
    }, 1000);

    console.log('[GhostTimer] Started', {
      problemType: this.currentProblemType,
      timeLimits: this.timeLimits
    });
  }

  /**
   * Called every second while timer is active
   */
  tick() {
    if (!this.isActive) return;

    const elapsed = this.getElapsedTime();

    // Call update callback if provided
    if (this.onTimeUpdate) {
      this.onTimeUpdate(elapsed);
    }

    // Check for visual cue thresholds (if we have time limits)
    if (this.timeLimits) {
      this.checkVisualCues(elapsed);
    }
  }

  /**
   * Check if we should show subtle visual encouragement
   *
   * NOT a panic-inducing warning, but a gentle nudge
   */
  checkVisualCues(elapsed) {
    const { warningThreshold, ghostLimit } = this.timeLimits;

    // At 75% of ghost limit: Show gentle "keep going" encouragement
    if (elapsed >= warningThreshold && elapsed < ghostLimit) {
      this.showEncouragementCue('gentle');
    }

    // At ghost limit: Show "take your time" but acknowledge time passing
    if (elapsed >= ghostLimit) {
      this.showEncouragementCue('time-passing');
    }
  }

  /**
   * Show subtle visual encouragement (NOT panic-inducing)
   *
   * @param {String} cueType - 'gentle' or 'time-passing'
   */
  showEncouragementCue(cueType) {
    const inputArea = document.getElementById('user-input');
    if (!inputArea) return;

    // Remove any existing cues
    inputArea.classList.remove('ghost-timer-gentle', 'ghost-timer-time-passing');

    // Add appropriate cue class
    if (cueType === 'gentle') {
      // Subtle border pulse - barely noticeable
      inputArea.classList.add('ghost-timer-gentle');
    } else if (cueType === 'time-passing') {
      // Slightly more visible, but still encouraging
      inputArea.classList.add('ghost-timer-time-passing');
    }
  }

  /**
   * Stop the timer and return elapsed time
   *
   * Call this when student submits their answer
   *
   * @returns {Number} Elapsed time in seconds
   */
  stop() {
    if (!this.isActive) return 0;

    const elapsed = this.getElapsedTime();

    this.isActive = false;
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    // Remove any visual cues
    const inputArea = document.getElementById('user-input');
    if (inputArea) {
      inputArea.classList.remove('ghost-timer-gentle', 'ghost-timer-time-passing');
    }

    console.log('[GhostTimer] Stopped', {
      elapsed: elapsed.toFixed(1) + 's',
      problemType: this.currentProblemType
    });

    return elapsed;
  }

  /**
   * Get current elapsed time in seconds
   *
   * @returns {Number} Seconds since timer started (0 if not active)
   */
  getElapsedTime() {
    if (!this.startTime) return 0;
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Reset the timer to initial state
   */
  reset() {
    this.isActive = false;
    this.startTime = null;
    this.currentProblemType = null;
    this.timeLimits = null;

    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    if (this.visualCueTimeout) {
      clearTimeout(this.visualCueTimeout);
      this.visualCueTimeout = null;
    }

    // Remove visual cues
    const inputArea = document.getElementById('user-input');
    if (inputArea) {
      inputArea.classList.remove('ghost-timer-gentle', 'ghost-timer-time-passing');
    }
  }

  /**
   * Pause the timer (useful for multi-part problems or clarifications)
   */
  pause() {
    if (!this.isActive) return;

    this.isActive = false;
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    // Store elapsed time so far
    this.pausedElapsed = this.getElapsedTime();
    this.pausedAt = Date.now();

    console.log('[GhostTimer] Paused at', this.pausedElapsed.toFixed(1) + 's');
  }

  /**
   * Resume a paused timer
   */
  resume() {
    if (this.isActive || !this.pausedElapsed) return;

    // Adjust start time to account for paused period
    const pauseDuration = Date.now() - this.pausedAt;
    this.startTime = Date.now() - (this.pausedElapsed * 1000);

    this.isActive = true;
    this.pausedElapsed = null;
    this.pausedAt = null;

    // Restart tracking loop
    this.trackingInterval = setInterval(() => {
      this.tick();
    }, 1000);

    console.log('[GhostTimer] Resumed');
  }

  /**
   * Check if timer is currently running
   *
   * @returns {Boolean} True if timer is active
   */
  isRunning() {
    return this.isActive;
  }
}

// ============================================================================
// GLOBAL GHOST TIMER INSTANCE
// ============================================================================

// Create singleton instance
const ghostTimer = new GhostTimer();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect problem type from AI message content
 *
 * Looks for tags like <REFLEX_PROBLEM>, <PROCESS_PROBLEM>, etc.
 *
 * @param {String} messageContent - AI's message text
 * @returns {String|null} Problem type or null
 */
function detectProblemType(messageContent) {
  if (!messageContent) return null;

  if (messageContent.includes('<REFLEX_PROBLEM>')) return 'reflex';
  if (messageContent.includes('<PROCESS_PROBLEM>')) return 'process';
  if (messageContent.includes('<ALGORITHM_PROBLEM>')) return 'algorithm';
  if (messageContent.includes('<CONCEPTUAL_PROBLEM>')) return 'conceptual';

  // Default: If message ends with a question mark and is relatively short,
  // assume it's a process problem
  if (messageContent.trim().endsWith('?') && messageContent.length < 200) {
    return 'process';
  }

  return null;
}

/**
 * Auto-start ghost timer when AI asks a question
 *
 * Call this after appending AI message to chat
 *
 * @param {String} aiMessage - AI's message content
 * @param {Object} timeLimits - Optional adaptive time limits from server
 */
function autoStartGhostTimer(aiMessage, timeLimits = null) {
  const problemType = detectProblemType(aiMessage);

  // Only start timer if we detected a problem
  if (problemType) {
    ghostTimer.start({
      problemType,
      timeLimits,
      onTimeUpdate: (elapsed) => {
        // Optional: Update UI with elapsed time (for debugging or teacher view)
        // console.log('[GhostTimer] Elapsed:', elapsed.toFixed(1) + 's');
      }
    });
  }
}

/**
 * Get response time and stop timer
 *
 * Call this before sending student's answer
 *
 * @returns {Number|null} Response time in seconds, or null if timer not running
 */
function getResponseTimeAndStop() {
  if (!ghostTimer.isRunning()) {
    return null;
  }

  return ghostTimer.stop();
}

// ============================================================================
// EXPORTS (for use in script.js)
// ============================================================================

// Expose to global scope for use in main script
window.GhostTimer = GhostTimer;
window.ghostTimer = ghostTimer;
window.autoStartGhostTimer = autoStartGhostTimer;
window.getResponseTimeAndStop = getResponseTimeAndStop;
window.detectProblemType = detectProblemType;
