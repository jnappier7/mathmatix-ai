// survey.js - Smart feedback survey with meaningful triggers
(function() {
  'use strict';

  // Survey configuration
  const CONFIG = {
    MIN_SESSION_DURATION: 10,        // Minimum 10 minutes before eligible
    MIN_PROBLEMS_FOR_TRIGGER: 3,     // Trigger after solving 3+ problems
    DAILY_FREQUENCY_HOURS: 24,       // Show at most once per day
    QUICK_SURVEY_THRESHOLD_HOURS: 48, // Show quick version if responded within 48h
    CHECK_INTERVAL: 60000            // Check every minute for problem-based triggers
  };

  // Survey state
  let sessionStartTime = Date.now();
  let surveyShown = false;
  let problemsSolvedThisSession = 0;
  let checkInterval = null;
  let originalFormHTML = null;
  let isQuickMode = false;
  let cachedSurveyStatus = null;

  // DOM elements
  const elements = {
    modal: null,
    form: null,
    closeBtn: null,
    dismissBtn: null,
    submitBtn: null,
    frequencyToggle: null,
    feedbackTextarea: null,
    charCount: null
  };

  // Initialize survey
  function initSurvey() {
    elements.modal = document.getElementById('survey-modal');
    elements.form = document.getElementById('survey-form');
    elements.closeBtn = document.getElementById('close-survey-modal-btn');
    elements.dismissBtn = document.getElementById('survey-dismiss-btn');
    elements.submitBtn = document.getElementById('survey-submit-btn');
    elements.frequencyToggle = document.getElementById('survey-frequency-toggle');
    elements.feedbackTextarea = document.getElementById('survey-feedback');
    elements.charCount = document.getElementById('feedback-char-count');

    if (!elements.modal) {
      console.warn('Survey modal not found in DOM');
      return;
    }

    // Store original form HTML for restoration
    const content = elements.modal.querySelector('.survey-content');
    if (content) {
      originalFormHTML = content.innerHTML;
    }

    // Attach event listeners
    elements.closeBtn.addEventListener('click', handleDismiss);
    elements.dismissBtn.addEventListener('click', handleDismiss);
    elements.form.addEventListener('submit', handleSubmit);
    if (elements.feedbackTextarea) {
      elements.feedbackTextarea.addEventListener('input', updateCharCount);
    }

    setupStarRating();
    sessionStartTime = Date.now();

    // Listen for problem completion events
    document.addEventListener('problemSolved', handleProblemSolved);
    document.addEventListener('milestoneReached', handleMilestone);

    // Periodic check for time-based eligibility
    checkInterval = setInterval(checkTimeBasedEligibility, CONFIG.CHECK_INTERVAL);

    // Show survey on tab switch (after being away)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Pre-fetch survey status for faster checks
    prefetchSurveyStatus();
  }

  // Pre-fetch survey status on init
  async function prefetchSurveyStatus() {
    try {
      const response = await fetch('/api/user/survey-status');
      if (response.ok) {
        cachedSurveyStatus = await response.json();
      }
    } catch (error) {
      console.error('Error prefetching survey status:', error);
    }
  }

  // Get current session duration in minutes
  function getSessionDuration() {
    return Math.floor((Date.now() - sessionStartTime) / 60000);
  }

  // Handle problem solved event - this is the main trigger
  async function handleProblemSolved(e) {
    problemsSolvedThisSession++;

    // Trigger survey after solving enough problems (if eligible today)
    if (problemsSolvedThisSession >= CONFIG.MIN_PROBLEMS_FOR_TRIGGER && !surveyShown) {
      await checkAndShowSurvey('problems_completed');
    }
  }

  // Handle milestone events (level up, streak, achievement)
  async function handleMilestone(e) {
    if (!surveyShown && getSessionDuration() >= CONFIG.MIN_SESSION_DURATION) {
      await checkAndShowSurvey('milestone');
    }
  }

  // Check time-based eligibility (fallback for long sessions without problem completion)
  async function checkTimeBasedEligibility() {
    if (surveyShown) return;

    const duration = getSessionDuration();

    // After 20 minutes with no problems solved, check if we should show
    if (duration >= 20 && problemsSolvedThisSession === 0) {
      await checkAndShowSurvey('time_based');
    }
  }

  // Handle visibility change (returning to tab)
  let hiddenTime = null;

  async function handleVisibilityChange() {
    if (document.hidden) {
      hiddenTime = Date.now();
    } else {
      // Returning to tab after 2+ minutes away
      if (hiddenTime && (Date.now() - hiddenTime) > 120000) {
        const duration = getSessionDuration();

        if (!surveyShown && duration >= CONFIG.MIN_SESSION_DURATION) {
          await checkAndShowSurvey('tab_return');
        }
      }
      hiddenTime = null;
    }
  }

  // Main survey check and show logic
  async function checkAndShowSurvey(trigger) {
    if (surveyShown) return;

    try {
      // Use cached status or fetch fresh
      let data = cachedSurveyStatus;
      if (!data) {
        const response = await fetch('/api/user/survey-status');
        if (!response.ok) return;
        data = await response.json();
      }

      if (shouldShowSurvey(data)) {
        // Determine if we should show quick mode
        const hoursSinceLastResponse = data.lastRespondedAt
          ? (Date.now() - new Date(data.lastRespondedAt).getTime()) / (1000 * 60 * 60)
          : Infinity;

        isQuickMode = hoursSinceLastResponse < CONFIG.QUICK_SURVEY_THRESHOLD_HOURS && data.responsesCount > 0;

        showSurvey(trigger);
      }
    } catch (error) {
      console.error('Error checking survey eligibility:', error);
    }
  }

  // Determine if survey should be shown based on user preferences
  function shouldShowSurvey(data) {
    if (!data.enabled) return false;
    if (data.frequency === 'never') return false;

    const now = Date.now();
    const lastShown = data.lastShownAt ? new Date(data.lastShownAt).getTime() : 0;
    const hoursSinceLastShown = (now - lastShown) / (1000 * 60 * 60);

    switch (data.frequency) {
      case 'every-session':
        return true;
      case 'daily':
        return hoursSinceLastShown >= CONFIG.DAILY_FREQUENCY_HOURS;
      case 'weekly':
        return hoursSinceLastShown >= (CONFIG.DAILY_FREQUENCY_HOURS * 7);
      default:
        return hoursSinceLastShown >= CONFIG.DAILY_FREQUENCY_HOURS;
    }
  }

  // Show survey modal
  function showSurvey(trigger) {
    if (!elements.modal || surveyShown) return;

    surveyShown = true;

    // Apply quick mode if applicable
    if (isQuickMode) {
      applyQuickMode();
    }

    elements.modal.classList.add('is-visible');
    trackSurveyShown(trigger);
  }

  // Apply quick survey mode - simplified form
  function applyQuickMode() {
    const content = elements.modal.querySelector('.survey-content');
    if (!content) return;

    // Update header
    const header = content.querySelector('.survey-header');
    if (header) {
      header.innerHTML = `
        <h2><i class="fas fa-bolt"></i> Quick Check-in</h2>
        <p class="survey-subtitle">Still going well? (1-tap feedback)</p>
      `;
    }

    // Hide optional sections, keep just star rating and expand option
    const optionalSections = content.querySelectorAll('.form-group');
    optionalSections.forEach((section, index) => {
      // Keep first (star rating), hide others initially
      if (index > 0) {
        section.classList.add('quick-mode-hidden');
        section.style.display = 'none';
      }
    });

    // Add expand button after star rating
    const starRating = content.querySelector('.star-rating');
    if (starRating && !content.querySelector('.expand-survey-btn')) {
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'btn btn-link expand-survey-btn';
      expandBtn.innerHTML = '<i class="fas fa-plus"></i> Add more details';
      expandBtn.addEventListener('click', expandQuickSurvey);
      starRating.parentNode.insertAdjacentElement('afterend', expandBtn);
    }
  }

  // Expand quick survey to full form
  function expandQuickSurvey() {
    const content = elements.modal.querySelector('.survey-content');
    const hiddenSections = content.querySelectorAll('.quick-mode-hidden');
    hiddenSections.forEach(section => {
      section.classList.remove('quick-mode-hidden');
      section.style.display = '';
    });

    const expandBtn = content.querySelector('.expand-survey-btn');
    if (expandBtn) {
      expandBtn.remove();
    }

    isQuickMode = false;
  }

  // Hide survey modal
  function hideSurvey() {
    if (elements.modal) {
      elements.modal.classList.remove('is-visible');
    }
  }

  // Handle dismiss button
  async function handleDismiss() {
    hideSurvey();
    await trackSurveyDismissed();
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(elements.form);
    const surveyData = {
      sessionDuration: getSessionDuration(),
      problemsSolved: problemsSolvedThisSession,
      rating: parseInt(formData.get('rating')) || null,
      experience: formData.get('experience') || '',
      helpfulness: parseInt(formData.get('helpfulness')) || null,
      difficulty: parseInt(formData.get('difficulty')) || null,
      feedback: formData.get('feedback') || '',
      bugs: formData.get('bugs') || '',
      features: formData.get('features') || '',
      willingness: parseInt(formData.get('willingness')) || null,
      frequencyPreference: elements.frequencyToggle?.checked ? 'weekly' : null,
      isQuickResponse: isQuickMode
    };

    // Validate required fields
    if (!surveyData.rating) {
      alert('Please rate your session with stars (1-5) before submitting.');
      const starRating = document.querySelector('.star-rating');
      if (starRating) {
        starRating.scrollIntoView({ behavior: 'smooth', block: 'center' });
        starRating.style.animation = 'pulse 0.5s ease-in-out';
        setTimeout(() => { starRating.style.animation = ''; }, 500);
      }
      return;
    }

    // Show loading state
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    elements.modal.querySelector('.survey-content').classList.add('submitting');

    try {
      const response = await csrfFetch('/api/user/survey-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(surveyData)
      });

      if (!response.ok) {
        throw new Error('Failed to submit survey');
      }

      showSuccessMessage();

      setTimeout(() => {
        hideSurvey();
        resetForm();
      }, 2000);

    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Failed to submit feedback. Please try again.');
      elements.submitBtn.disabled = false;
      elements.submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';
      elements.modal.querySelector('.survey-content').classList.remove('submitting');
    }
  }

  // Show success message
  function showSuccessMessage() {
    const content = elements.modal.querySelector('.survey-content');
    content.innerHTML = `
      <div class="survey-success">
        <i class="fas fa-check-circle"></i>
        <h3>Thank You!</h3>
        <p>Your feedback helps us improve MathMatix AI for everyone.</p>
      </div>
    `;
    content.classList.remove('submitting');

    if (typeof confetti !== 'undefined') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
    }
  }

  // Reset form to initial state
  function resetForm() {
    const content = elements.modal.querySelector('.survey-content');
    if (content && content.querySelector('.survey-success') && originalFormHTML) {
      content.innerHTML = originalFormHTML;

      // Re-attach event listeners
      elements.form = document.getElementById('survey-form');
      elements.closeBtn = document.getElementById('close-survey-modal-btn');
      elements.dismissBtn = document.getElementById('survey-dismiss-btn');
      elements.submitBtn = document.getElementById('survey-submit-btn');
      elements.frequencyToggle = document.getElementById('survey-frequency-toggle');
      elements.feedbackTextarea = document.getElementById('survey-feedback');
      elements.charCount = document.getElementById('feedback-char-count');

      elements.closeBtn.addEventListener('click', handleDismiss);
      elements.dismissBtn.addEventListener('click', handleDismiss);
      elements.form.addEventListener('submit', handleSubmit);
      if (elements.feedbackTextarea) {
        elements.feedbackTextarea.addEventListener('input', updateCharCount);
      }

      setupStarRating();
    }

    if (elements.form) elements.form.reset();
    if (elements.charCount) updateCharCount();
    if (elements.submitBtn) {
      elements.submitBtn.disabled = false;
      elements.submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';
    }

    isQuickMode = false;
  }

  // Update character counter
  function updateCharCount() {
    if (!elements.feedbackTextarea || !elements.charCount) return;

    const length = elements.feedbackTextarea.value.length;
    elements.charCount.textContent = length;

    if (length > 900) {
      elements.charCount.style.color = '#f44336';
    } else if (length > 700) {
      elements.charCount.style.color = '#ff9800';
    } else {
      elements.charCount.style.color = '#888';
    }
  }

  // Setup star rating interactions
  function setupStarRating() {
    const starLabels = document.querySelectorAll('.star-rating label');
    const starInputs = document.querySelectorAll('.star-rating input');

    starLabels.forEach(label => {
      label.addEventListener('click', () => {
        const input = label.previousElementSibling;
        if (input && input.type === 'radio') {
          input.checked = true;
          updateStarDisplay();
        }
      });
    });

    starInputs.forEach(input => {
      input.addEventListener('change', updateStarDisplay);
    });
  }

  // Update star display based on selected rating
  function updateStarDisplay() {
    const checkedInput = document.querySelector('.star-rating input:checked');
    const allLabels = document.querySelectorAll('.star-rating label');

    allLabels.forEach(label => { label.style.color = '#ddd'; });

    if (checkedInput) {
      const rating = parseInt(checkedInput.value);
      allLabels.forEach(label => {
        const labelRating = parseInt(label.previousElementSibling?.value || 0);
        if (labelRating <= rating) {
          label.style.color = '#ffc107';
        }
      });
    }
  }

  // Track that survey was shown
  async function trackSurveyShown(trigger) {
    try {
      await csrfFetch('/api/user/survey-shown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shownAt: new Date().toISOString(),
          trigger: trigger || 'unknown',
          problemsSolved: problemsSolvedThisSession,
          sessionDuration: getSessionDuration()
        })
      });
    } catch (error) {
      console.error('Error tracking survey shown:', error);
    }
  }

  // Track that survey was dismissed
  async function trackSurveyDismissed() {
    try {
      await csrfFetch('/api/user/survey-dismissed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error tracking survey dismissed:', error);
    }
  }

  // Public API
  window.MathMatixSurvey = {
    show: () => showSurvey('manual'),
    hide: hideSurvey,
    init: initSurvey,
    trackProblemSolved: () => {
      document.dispatchEvent(new CustomEvent('problemSolved'));
    },
    trackMilestone: (type) => {
      document.dispatchEvent(new CustomEvent('milestoneReached', { detail: { type } }));
    }
  };

  // Cleanup on page unload
  window.addEventListener('unload', () => {
    if (checkInterval) clearInterval(checkInterval);
  });

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSurvey);
  } else {
    initSurvey();
  }

})();
