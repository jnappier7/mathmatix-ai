// survey.js - Session feedback survey for alpha testing
(function() {
  'use strict';

  // Survey configuration
  const CONFIG = {
    MIN_SESSION_DURATION: 5, // Minimum 5 minutes before showing survey
    SHOW_ON_EXIT_PROBABILITY: 0.7, // 70% chance to show on page exit
    DAILY_FREQUENCY_HOURS: 24, // Show at most once per day
    CHECK_INTERVAL: 60000 // Check every minute
  };

  // Survey state
  let sessionStartTime = Date.now();
  let sessionDuration = 0;
  let surveyShown = false;
  let checkInterval = null;

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
    // Get DOM elements
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

    // Attach event listeners
    elements.closeBtn.addEventListener('click', handleDismiss);
    elements.dismissBtn.addEventListener('click', handleDismiss);
    elements.form.addEventListener('submit', handleSubmit);
    elements.feedbackTextarea.addEventListener('input', updateCharCount);

    // Track session duration
    startSessionTracking();

    // Check survey eligibility periodically
    checkInterval = setInterval(checkSurveyEligibility, CONFIG.CHECK_INTERVAL);

    // Show survey on page unload (with probability)
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Listen for visibility changes (tab switching)
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // Start tracking session duration
  function startSessionTracking() {
    sessionStartTime = Date.now();
  }

  // Get current session duration in minutes
  function getSessionDuration() {
    return Math.floor((Date.now() - sessionStartTime) / 60000);
  }

  // Check if survey should be shown
  async function checkSurveyEligibility() {
    if (surveyShown) return;

    sessionDuration = getSessionDuration();

    // Only check if minimum session duration has passed
    if (sessionDuration < CONFIG.MIN_SESSION_DURATION) {
      return;
    }

    try {
      const response = await fetch('/api/user/survey-status');
      if (!response.ok) {
        console.error('Failed to fetch survey status');
        return;
      }

      const data = await response.json();

      // Check if survey should be shown based on frequency settings
      if (shouldShowSurvey(data)) {
        showSurvey();
      }
    } catch (error) {
      console.error('Error checking survey eligibility:', error);
    }
  }

  // Determine if survey should be shown based on user preferences
  function shouldShowSurvey(data) {
    // Don't show if disabled
    if (!data.enabled) return false;

    // Check frequency
    if (data.frequency === 'never') return false;

    // Check if enough time has passed since last shown
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
  function showSurvey() {
    if (!elements.modal || surveyShown) return;

    surveyShown = true;
    elements.modal.classList.add('is-visible');

    // Track that survey was shown
    trackSurveyShown();
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
      rating: parseInt(formData.get('rating')) || null,
      experience: formData.get('experience') || '',
      helpfulness: parseInt(formData.get('helpfulness')) || null,
      difficulty: parseInt(formData.get('difficulty')) || null,
      feedback: formData.get('feedback') || '',
      bugs: formData.get('bugs') || '',
      features: formData.get('features') || '',
      willingness: parseInt(formData.get('willingness')) || null,
      frequencyPreference: elements.frequencyToggle.checked ? 'weekly' : null
    };

    // Validate required fields
    if (!surveyData.rating) {
      alert('Please rate your session before submitting.');
      return;
    }

    // Show loading state
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    elements.modal.querySelector('.survey-content').classList.add('submitting');

    try {
      const response = await fetch('/api/user/survey-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(surveyData)
      });

      if (!response.ok) {
        throw new Error('Failed to submit survey');
      }

      // Show success message
      showSuccessMessage();

      // Close after delay
      setTimeout(() => {
        hideSurvey();
        resetForm();
      }, 2000);

    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Failed to submit feedback. Please try again.');

      // Reset button state
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

    // Trigger confetti if available
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
    elements.form.reset();
    updateCharCount();
    elements.submitBtn.disabled = false;
    elements.submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';

    // Restore original content
    const content = elements.modal.querySelector('.survey-content');
    if (content.querySelector('.survey-success')) {
      location.reload(); // Reload to restore original form
    }
  }

  // Update character counter
  function updateCharCount() {
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

  // Track that survey was shown
  async function trackSurveyShown() {
    try {
      await fetch('/api/user/survey-shown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shownAt: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Error tracking survey shown:', error);
    }
  }

  // Track that survey was dismissed
  async function trackSurveyDismissed() {
    try {
      await fetch('/api/user/survey-dismissed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error tracking survey dismissed:', error);
    }
  }

  // Handle before unload (page exit)
  function handleBeforeUnload(e) {
    // Only show if session was long enough and we haven't shown it yet
    if (!surveyShown && getSessionDuration() >= CONFIG.MIN_SESSION_DURATION) {
      // Random chance to show survey
      if (Math.random() < CONFIG.SHOW_ON_EXIT_PROBABILITY) {
        // We can't show modal on beforeunload, but we can trigger it for next time
        trackSurveyShown();
      }
    }
  }

  // Handle visibility change (tab switching)
  function handleVisibilityChange() {
    if (document.hidden) {
      // Page is now hidden - user might be leaving
      // Could trigger survey check here if desired
    } else {
      // Page is now visible again
    }
  }

  // Public API
  window.MathMatixSurvey = {
    show: showSurvey,
    hide: hideSurvey,
    init: initSurvey
  };

  // Cleanup on page unload
  window.addEventListener('unload', () => {
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  });

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSurvey);
  } else {
    initSurvey();
  }

})();
