/**
 * ADAPTIVE SCREENER - FRONTEND
 *
 * Handles the user interface for the IRT-based adaptive placement test.
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  sessionId: null,
  currentProblem: null,
  questionStartTime: null,
  questionCount: 0,
  theta: 0,
  confidence: 0,
  responses: []
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  // Screens
  welcomeScreen: document.getElementById('welcome-screen'),
  screenerScreen: document.getElementById('screener-screen'),
  resultsScreen: document.getElementById('results-screen'),

  // Buttons
  startBtn: document.getElementById('start-btn'),
  submitBtn: document.getElementById('submit-btn'),
  continueBtn: document.getElementById('continue-btn'),
  retakeBtn: document.getElementById('retake-btn'),

  // Aperture
  apertureRing: document.getElementById('aperture-ring'),
  confidenceFill: document.getElementById('confidence-fill'),
  confidenceLabel: document.getElementById('confidence-label'),

  // Problem display
  questionNumber: document.getElementById('question-number'),
  confidenceBadge: document.getElementById('confidence-badge'),
  problemText: document.getElementById('problem-text'),
  answerInput: document.getElementById('answer-input'),
  feedbackSection: document.getElementById('feedback-section'),

  // Progress
  questionCount: document.getElementById('question-count'),
  thetaDisplay: document.getElementById('theta-display'),

  // Results
  finalTheta: document.getElementById('final-theta'),
  finalPercentile: document.getElementById('final-percentile'),
  finalDuration: document.getElementById('final-duration'),
  finalQuestions: document.getElementById('final-questions'),
  finalAccuracy: document.getElementById('final-accuracy'),
  masteredSkills: document.getElementById('mastered-skills'),
  learningSkills: document.getElementById('learning-skills'),
  frontierSkills: document.getElementById('frontier-skills')
};

// ============================================================================
// EVENT LISTENERS
// ============================================================================

elements.startBtn.addEventListener('click', startScreener);
elements.submitBtn.addEventListener('click', submitAnswer);
elements.answerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitAnswer();
});
elements.continueBtn.addEventListener('click', () => {
  window.location.href = '/badge-map.html';  // Move to badge selection
});
elements.retakeBtn.addEventListener('click', () => {
  window.location.reload();
});

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Start the adaptive screener
 */
async function startScreener() {
  try {
    elements.startBtn.disabled = true;
    elements.startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';

    const response = await fetch('/api/screener/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        console.error('Authentication failed - redirecting to login');
        // Clear any stale mastery mode flags
        if (window.StorageUtils) {
          StorageUtils.session.removeItem('masteryModeActive');
          StorageUtils.session.removeItem('masteryPhase');
          StorageUtils.session.removeItem('activeBadgeId');
          StorageUtils.session.removeItem('screenerResults');
        }
        alert('Your session has expired. Please log in again.');
        window.location.href = '/login.html';
        return;
      }

      const error = await response.json();

      // Handle "already completed" case (403 Forbidden)
      if (error.alreadyCompleted) {
        alert(error.message || 'You have already completed the placement assessment.');
        window.location.href = '/badge-map.html';
        return;
      }

      throw new Error(error.error || 'Failed to start screener');
    }

    const data = await response.json();

    state.sessionId = data.sessionId;

    // Switch to screener screen
    switchScreen('screener');

    // Load first problem
    await loadNextProblem();

  } catch (error) {
    console.error('Error starting screener:', error);
    alert('Failed to start assessment: ' + error.message);
    elements.startBtn.disabled = false;
    elements.startBtn.innerHTML = '<i class="fas fa-play"></i> Start Assessment';
  }
}

/**
 * Load the next adaptive problem
 */
async function loadNextProblem() {
  try {
    const response = await fetch(`/api/screener/next-problem?sessionId=${state.sessionId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to load problem');
    }

    const data = await response.json();

    // Check if we're done
    if (data.nextAction && data.nextAction !== 'continue') {
      await handleCompletion(data);
      return;
    }

    // Validate response data
    if (!data.problem) {
      throw new Error('No problem data received from server');
    }

    // Update state
    state.currentProblem = data.problem;
    state.questionStartTime = Date.now();
    state.questionCount = data.problem.questionNumber;

    // Session data (theta/confidence) is not exposed to students for security
    // We only track progress which is visible
    if (data.session) {
      state.theta = data.session.theta;
      state.confidence = data.session.confidence;
    }

    // Update UI
    displayProblem(data.problem);

    // Use problem progress instead of session data
    if (data.problem.progress) {
      updateProgressFromProblem(data.problem.progress);
    } else if (data.session) {
      updateProgress(data.session);
      updateAperture(data.session.confidence);
    }

    // Clear previous answer and feedback
    elements.answerInput.value = '';
    elements.answerInput.focus();
    elements.feedbackSection.style.display = 'none';
    elements.submitBtn.disabled = false;

  } catch (error) {
    console.error('Error loading problem:', error);
    alert('Failed to load problem: ' + error.message);
  }
}

/**
 * Submit the current answer
 */
async function submitAnswer(answerValue) {
  // For multiple choice, answerValue is passed directly
  // For fill-in, read from input field
  const answer = (answerValue !== undefined)
    ? String(answerValue).trim()
    : elements.answerInput?.value?.trim() || '';

  if (!answer) {
    if (elements.answerInput) {
      elements.answerInput.focus();
    }
    return;
  }

  // Calculate response time
  const responseTime = (Date.now() - state.questionStartTime) / 1000;

  // Disable submit button
  elements.submitBtn.disabled = true;
  elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

  try {
    const response = await fetch('/api/screener/submit-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        sessionId: state.sessionId,
        problemId: state.currentProblem.problemId,
        answer: parseAnswer(answer),
        responseTime
      })
    });

    if (!response.ok) {
      throw new Error('Failed to submit answer');
    }

    const data = await response.json();

    // Track correctness behind the scenes (even though we don't show feedback)
    // This is used for analytics and final report
    state.responses.push({
      correct: data.correct,  // Backend always sends this for tracking
      responseTime
    });

    // Backend intentionally doesn't send feedback TEXT during screener (prevents negative momentum)
    // Only show feedback UI if provided (typically only at completion)
    if (data.feedback !== undefined) {
      showFeedback(data.correct, data.feedback);
    }

    // Update theta if available
    if (data.session) {
      state.theta = data.session.theta;
      state.confidence = data.session.confidence;
      updateProgress(data.session);
      updateAperture(data.session.confidence);
    } else if (data.progress) {
      // Use progress data if session not available
      updateProgressFromProblem(data.progress);
    }

    // Wait for user to see feedback, then proceed
    setTimeout(() => {
      if (data.nextAction === 'continue') {
        loadNextProblem();
      } else {
        handleCompletion(data);
      }
    }, 2000);

  } catch (error) {
    console.error('Error submitting answer:', error);
    alert('Failed to submit answer: ' + error.message);
    elements.submitBtn.disabled = false;
    elements.submitBtn.innerHTML = 'Submit <i class="fas fa-arrow-right"></i>';
  }
}

/**
 * Handle screener completion
 */
async function handleCompletion(data) {
  try {
    // Complete the screener
    const completeResponse = await fetch('/api/screener/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId: state.sessionId })
    });

    if (!completeResponse.ok) {
      throw new Error('Failed to complete screener');
    }

    const completeData = await completeResponse.json();
    const report = completeData.report;

    // Save results to sessionStorage for chat to access
    if (window.StorageUtils) {
      StorageUtils.session.setItem('screenerResults', JSON.stringify(report));
      StorageUtils.session.setItem('screenerJustCompleted', 'true');
    }

    // Check if in Mastery Mode
    const masteryModeActive = window.StorageUtils
      ? StorageUtils.session.getItem('masteryModeActive')
      : null;

    if (masteryModeActive === 'true') {
      // Mastery mode: Set phase for interview
      if (window.StorageUtils) {
        StorageUtils.session.setItem('masteryPhase', 'interview');
      }

      // Show brief completion message
      displayResults(report);
      switchScreen('results');

      // Update continue button text for mastery mode
      if (elements.continueBtn) {
        elements.continueBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Continue to AI Interview';
      }

      // Auto-redirect after 3 seconds
      setTimeout(() => {
        window.location.href = '/badge-map.html';
      }, 3000);

    } else {
      // Normal screener mode
      displayResults(report);
      switchScreen('results');

      // Auto-redirect to badge map after 5 seconds (give time to see results)
      setTimeout(() => {
        window.location.href = '/badge-map.html';
      }, 5000);
    }

  } catch (error) {
    console.error('Error completing screener:', error);
    alert('Failed to complete assessment: ' + error.message);
  }
}

// ============================================================================
// UI UPDATE FUNCTIONS
// ============================================================================

/**
 * Display a problem
 */
function displayProblem(problem) {
  elements.questionNumber.textContent = `Question ${problem.questionNumber}`;

  // BUGFIX: Ensure problem content is displayed as text, not interpreted as date
  // If content contains fractions (e.g., "1/2"), display as plain text
  let content = String(problem.content);
  elements.problemText.textContent = content;

  // Handle multiple choice vs fill-in
  const answerSection = document.querySelector('.answer-section');

  if (problem.answerType === 'multiple-choice' && problem.options && problem.options.length > 0) {
    // Render multiple choice buttons
    answerSection.innerHTML = `
      <div class="multiple-choice-options" id="mc-options">
        ${problem.options.map(opt => `
          <button class="mc-option" data-option="${opt.label}">
            <span class="option-label">${opt.label}</span>
            <span class="option-text">${opt.text}</span>
          </button>
        `).join('')}
      </div>
    `;

    // Add click handlers for multiple choice
    document.querySelectorAll('.mc-option').forEach(btn => {
      btn.addEventListener('click', function() {
        // Remove previous selection
        document.querySelectorAll('.mc-option').forEach(b => b.classList.remove('selected'));
        // Mark this as selected
        this.classList.add('selected');
        // Auto-submit after selection
        setTimeout(() => submitAnswer(this.dataset.option), 300);
      });
    });
  } else {
    // Render fill-in input
    answerSection.innerHTML = `
      <input
        type="text"
        id="answer-input"
        class="answer-input"
        placeholder="Type your answer..."
        autocomplete="off"
        autofocus
      />
      <button class="btn btn-primary" id="submit-btn">
        Submit <i class="fas fa-arrow-right"></i>
      </button>
    `;

    // Re-attach submit button handler
    elements.answerInput = document.getElementById('answer-input');
    elements.submitBtn = document.getElementById('submit-btn');
    elements.submitBtn.addEventListener('click', () => submitAnswer(elements.answerInput.value));
    elements.answerInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitAnswer(elements.answerInput.value);
    });
  }
}

/**
 * Update progress from problem data (when session data is not exposed)
 */
function updateProgressFromProblem(progress) {
  const { current, target, percentComplete } = progress;

  // Update progress text
  if (elements.questionCount) {
    elements.questionCount.textContent = `${current} / ${target}`;
  }

  // Students don't see theta/confidence for privacy
  if (elements.thetaDisplay) {
    elements.thetaDisplay.textContent = 'Finding your level...';
  }
  if (elements.confidenceBadge) {
    elements.confidenceBadge.textContent = `${percentComplete}% Complete`;
  }
}

/**
 * Update progress indicators (legacy - when session data available)
 */
function updateProgress(session) {
  // Adaptive progress display (15-25 questions based on confidence)
  const currentQ = session.questionCount;
  const standardError = session.standardError || Infinity;

  // Display shows range: "X of 15-25" where the actual stop point is adaptive
  let progressText;
  if (currentQ < 15) {
    progressText = `${currentQ} / 15-25`;
  } else if (standardError < 0.30) {
    // High confidence - may finish soon
    progressText = `${currentQ} / ~${currentQ + 2}`;
  } else if (standardError < 0.35) {
    // Medium confidence - need a few more
    progressText = `${currentQ} / ~${Math.min(currentQ + 5, 25)}`;
  } else {
    // Low confidence - might need up to max
    progressText = `${currentQ} / 25`;
  }

  elements.questionCount.textContent = progressText;

  // Format theta display with SE (Standard Error)
  const thetaValue = session.theta.toFixed(1);
  const thetaLabel = getThetaLabel(session.theta);
  const seDisplay = standardError < 10 ? `±${standardError.toFixed(2)}` : '';
  elements.thetaDisplay.textContent = `θ=${thetaValue} ${seDisplay} (${thetaLabel})`;

  // Update confidence badge (based on Standard Error, not arbitrary confidence)
  let confidenceText = 'Calibrating...';

  if (standardError === Infinity || standardError > 0.5) {
    confidenceText = 'Searching...';
  } else if (standardError <= 0.25) {
    confidenceText = `High Confidence (SE=${standardError.toFixed(2)})`;
  } else if (standardError <= 0.30) {
    confidenceText = `Good Confidence (SE=${standardError.toFixed(2)})`;
  } else {
    confidenceText = `Moderate (SE=${standardError.toFixed(2)})`;
  }

  elements.confidenceBadge.innerHTML = `<i class="fas fa-crosshairs"></i> ${confidenceText}`;
}

/**
 * Update aperture visualization based on confidence
 */
function updateAperture(confidence) {
  // Update confidence bar
  elements.confidenceFill.style.width = `${confidence * 100}%`;

  // Update aperture ring state
  let confidenceState;
  if (confidence < 0.4) {
    confidenceState = 'low';
  } else if (confidence < 0.7) {
    confidenceState = 'medium';
  } else if (confidence < 0.9) {
    confidenceState = 'high';
  } else {
    confidenceState = 'locked';
  }

  elements.apertureRing.setAttribute('data-confidence', confidenceState);

  // Update label text
  const labelText = document.querySelector('.confidence-text');
  if (confidence < 0.4) {
    labelText.textContent = 'Searching for your level...';
  } else if (confidence < 0.7) {
    labelText.textContent = 'Narrowing down your ability...';
  } else if (confidence < 0.9) {
    labelText.textContent = 'Almost there...';
  } else {
    labelText.textContent = 'Level locked in!';
  }
}

/**
 * Show feedback after answer submission
 */
function showFeedback(correct, feedbackText) {
  elements.feedbackSection.className = `feedback-section ${correct ? 'correct' : 'incorrect'}`;

  const icon = correct
    ? '<i class="fas fa-check-circle"></i>'
    : '<i class="fas fa-times-circle"></i>';

  elements.feedbackSection.innerHTML = `
    <div class="feedback-text">
      ${icon}
      <span>${feedbackText}</span>
    </div>
  `;

  elements.feedbackSection.style.display = 'block';
}

/**
 * Display final results
 */
function displayResults(report) {
  // Main stats
  elements.finalTheta.textContent = `θ = ${report.theta}`;
  elements.finalPercentile.textContent = `${report.percentile}th percentile`;

  const durationMinutes = Math.floor(report.duration / 60000);
  const durationSeconds = Math.floor((report.duration % 60000) / 1000);
  elements.finalDuration.textContent = `${durationMinutes}m ${durationSeconds}s`;
  elements.finalQuestions.textContent = `${report.questionsAnswered} questions`;
  elements.finalAccuracy.textContent = `${report.accuracy}%`;

  // 🎖️ Display earned badges (Like ALEKS: show what they tested out of)
  if (report.earnedBadges && report.earnedBadges.length > 0) {
    displayEarnedBadges(report.earnedBadges);
  }

  // Skills
  displaySkillList(elements.masteredSkills, report.masteredSkills);
  displaySkillList(elements.learningSkills, report.learningSkills);
  displaySkillList(elements.frontierSkills, report.frontierSkills);
}

/**
 * Display earned badges (ALEKS-style: show what they tested out of)
 */
function displayEarnedBadges(badges) {
  const section = document.getElementById('earned-badges-section');
  const list = document.getElementById('earned-badges-list');

  if (!badges || badges.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  const tierEmoji = {
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇'
  };

  list.innerHTML = badges.map(badge => `
    <div class="earned-badge-card ${badge.tier}">
      <div class="badge-tier-icon">${tierEmoji[badge.tier] || '🏅'}</div>
      <div class="badge-name">${badge.name}</div>
      <div class="badge-score">${badge.score}%</div>
      <div class="badge-tested-out">✓ Tested Out</div>
    </div>
  `).join('');

  // Trigger confetti celebration if badges earned
  if (window.confetti && badges.length > 0) {
    setTimeout(() => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }, 500);
  }
}

/**
 * Display skill list
 */
function displaySkillList(element, skills) {
  if (!skills || skills.length === 0) {
    element.textContent = 'None detected';
    element.classList.add('empty');
    return;
  }

  element.classList.remove('empty');
  element.innerHTML = skills.map(skillId => {
    const displayName = skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `<div class="skill-item"><i class="fas fa-check"></i> ${displayName}</div>`;
  }).join('');
}

/**
 * Switch between screens
 */
function switchScreen(screenName) {
  elements.welcomeScreen.classList.remove('active');
  elements.screenerScreen.classList.remove('active');
  elements.resultsScreen.classList.remove('active');

  if (screenName === 'welcome') {
    elements.welcomeScreen.classList.add('active');
  } else if (screenName === 'screener') {
    elements.screenerScreen.classList.add('active');
  } else if (screenName === 'results') {
    elements.resultsScreen.classList.add('active');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse user answer (handle integers, decimals, fractions)
 */
function parseAnswer(answer) {
  const trimmed = answer.trim();

  // Only parse as number if it's purely numeric (no variables)
  // This prevents "7k" from being parsed as 7
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Return as string (for expressions like "7k", "3x + 5", etc.)
  return trimmed;
}

/**
 * Get human-readable label for theta
 */
function getThetaLabel(theta) {
  if (theta < -2) return 'Grade 4-5';
  if (theta < -1) return 'Grade 6';
  if (theta < 0) return 'Grade 7';
  if (theta < 1) return 'Grade 8-9';
  if (theta < 2) return 'Grade 10-11';
  return 'Grade 12+';
}

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('Adaptive Screener initialized');
