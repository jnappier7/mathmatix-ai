// survey.js - Session feedback survey for alpha testing
(function() {
  'use strict';

  // Survey configuration
  const CONFIG = {
    MIN_SESSION_DURATION: 15, // Minimum 15 minutes before showing survey
    SHOW_ON_EXIT_PROBABILITY: 1.0, // Always show on page exit (if eligible)
    DAILY_FREQUENCY_HOURS: 24, // Show at most once per day
    CHECK_INTERVAL: 300000, // Check every 5 minutes (reduced frequency)
    PREFER_EXIT_TRIGGER: true // Prefer showing on page exit rather than during session
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

    // Setup star rating interactions
    setupStarRating();

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

    // If we prefer exit trigger, don't show during session
    if (CONFIG.PREFER_EXIT_TRIGGER) {
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
      alert('Please rate your session with stars (1-5) before submitting.');
      // Scroll to star rating
      const starRating = document.querySelector('.star-rating');
      if (starRating) {
        starRating.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a pulse animation to draw attention
        starRating.style.animation = 'pulse 0.5s ease-in-out';
        setTimeout(() => {
          starRating.style.animation = '';
        }, 500);
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

  // Setup star rating interactions
  function setupStarRating() {
    const starLabels = document.querySelectorAll('.star-rating label');
    const starInputs = document.querySelectorAll('.star-rating input');

    // Add click handlers to labels
    starLabels.forEach((label, index) => {
      label.addEventListener('click', () => {
        const input = label.previousElementSibling;
        if (input && input.type === 'radio') {
          input.checked = true;

          // Update visual feedback
          updateStarDisplay();
        }
      });
    });

    // Add change handlers to inputs
    starInputs.forEach(input => {
      input.addEventListener('change', updateStarDisplay);
    });
  }

  // Update star display based on selected rating
  function updateStarDisplay() {
    const checkedInput = document.querySelector('.star-rating input:checked');
    const allLabels = document.querySelectorAll('.star-rating label');

    allLabels.forEach(label => {
      label.style.color = '#ddd';
    });

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
  async function trackSurveyShown() {
    try {
      await csrfFetch('/api/user/survey-shown', {
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
      await csrfFetch('/api/user/survey-dismissed', {
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
    // Note: Modern browsers don't allow showing custom modals on beforeunload
    // This just tracks that the user had a qualifying session
    // The survey will be shown on their next visit or when they return to the tab
    if (!surveyShown && getSessionDuration() >= CONFIG.MIN_SESSION_DURATION) {
      // Use sendBeacon to track the exit event
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ event: 'session_end', duration: getSessionDuration() })], {
          type: 'application/json'
        });
        navigator.sendBeacon('/api/user/survey-shown', blob);
      }
    }
  }

  // Handle visibility change (tab switching)
  let hiddenTime = null;

  async function handleVisibilityChange() {
    if (document.hidden) {
      // Page is now hidden - track the time
      hiddenTime = Date.now();
    } else {
      // Page is now visible again
      // If user was away for more than 2 minutes and session is long enough, check survey
      if (hiddenTime && (Date.now() - hiddenTime) > 120000) {
        const sessionDur = getSessionDuration();

        if (!surveyShown && sessionDur >= CONFIG.MIN_SESSION_DURATION) {
          try {
            const response = await fetch('/api/user/survey-status');
            if (response.ok) {
              const data = await response.json();
              if (shouldShowSurvey(data)) {
                // Small delay to let the page fully activate
                setTimeout(() => {
                  showSurvey();
                }, 1000);
              }
            }
          } catch (error) {
            console.error('Error checking survey on visibility change:', error);
          }
        }
      }
      hiddenTime = null;
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
