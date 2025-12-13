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
  window.location.href = '/chat.html';  // Move to interview phase
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
      const error = await response.json();
      throw new Error(error.error || 'Failed to start screener');
    }

    const data = await response.json();

    if (data.alreadyCompleted) {
      const retake = confirm(data.message);
      if (!retake) {
        window.location.href = '/chat.html';
        return;
      }
    }

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
      throw new Error('Failed to load problem');
    }

    const data = await response.json();

    // Check if we're done
    if (data.nextAction && data.nextAction !== 'continue') {
      await handleCompletion(data);
      return;
    }

    // Update state
    state.currentProblem = data.problem;
    state.questionStartTime = Date.now();
    state.questionCount = data.problem.questionNumber;
    state.theta = data.session.theta;
    state.confidence = data.session.confidence;

    // Update UI
    displayProblem(data.problem);
    updateProgress(data.session);
    updateAperture(data.session.confidence);

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
async function submitAnswer() {
  const answer = elements.answerInput.value.trim();

  if (!answer) {
    elements.answerInput.focus();
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

    // Show feedback
    showFeedback(data.correct, data.feedback);

    // Store response
    state.responses.push({
      correct: data.correct,
      responseTime
    });

    // Update theta if available
    if (data.session) {
      state.theta = data.session.theta;
      state.confidence = data.session.confidence;
      updateProgress(data.session);
      updateAperture(data.session.confidence);
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

    // Check if in Mastery Mode
    const masteryModeActive = sessionStorage.getItem('masteryModeActive');

    if (masteryModeActive === 'true') {
      // Save results for Phase 2 (AI Interview)
      sessionStorage.setItem('screenerResults', JSON.stringify(report));
      sessionStorage.setItem('masteryPhase', 'interview');

      // Show brief completion message
      displayResults(report);
      switchScreen('results');

      // Update continue button text for mastery mode
      if (elements.continueBtn) {
        elements.continueBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Continue to AI Interview';
      }

      // Auto-redirect after 3 seconds
      setTimeout(() => {
        window.location.href = '/chat.html';
      }, 3000);

    } else {
      // Normal screener mode
      displayResults(report);
      switchScreen('results');
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
  elements.problemText.textContent = problem.content;
}

/**
 * Update progress indicators
 */
function updateProgress(session) {
  elements.questionCount.textContent = `${session.questionCount} / ~12`;

  // Format theta display
  const thetaValue = session.theta.toFixed(1);
  const thetaLabel = getThetaLabel(session.theta);
  elements.thetaDisplay.textContent = `θ=${thetaValue} (${thetaLabel})`;

  // Update confidence badge
  const confidencePercent = Math.round(session.confidence * 100);
  let confidenceText = 'Calibrating...';

  if (confidencePercent < 40) {
    confidenceText = 'Searching...';
  } else if (confidencePercent < 70) {
    confidenceText = `${confidencePercent}% confident`;
  } else {
    confidenceText = `${confidencePercent}% locked`;
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

  // Skills
  displaySkillList(elements.masteredSkills, report.masteredSkills);
  displaySkillList(elements.learningSkills, report.learningSkills);
  displaySkillList(elements.frontierSkills, report.frontierSkills);
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
  // Try to parse as number
  const num = parseFloat(answer);
  if (!isNaN(num)) {
    return num;
  }

  // Return as string (for expressions)
  return answer.trim();
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
