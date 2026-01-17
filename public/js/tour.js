// tour.js - First-time user tour
(function() {
  'use strict';

  // Tour steps configuration
  const tourSteps = [
    {
      title: 'Welcome to MathMatix AI! 🎉',
      content: `
        <div class="tour-icon"><i class="fas fa-graduation-cap"></i></div>
        <p>We're excited to help you master math! Let's take a quick tour to show you around.</p>
        <p>This will only take a minute, and you can skip it anytime.</p>
      `
    },
    {
      title: 'Chat with Your AI Tutor',
      content: `
        <div class="tour-icon"><i class="fas fa-comments"></i></div>
        <p>Ask your AI tutor anything about math! Type your questions in the chat box at the bottom of the screen.</p>
        <div class="tour-highlight">
          <strong>Pro Tip:</strong> You can upload images, use the whiteboard, or even use voice chat!
        </div>
      `
    },
    {
      title: 'Explore Tools & Features',
      content: `
        <div class="tour-icon"><i class="fas fa-tools"></i></div>
        <p>Check out the powerful tools at your disposal:</p>
        <ul>
          <li><i class="fas fa-chalkboard"></i> <strong>Whiteboard</strong> - Draw, write, and visualize math problems</li>
          <li><i class="fas fa-calculator"></i> <strong>Calculator</strong> - Scientific calculator and graphing tools</li>
          <li><i class="fas fa-image"></i> <strong>Upload</strong> - Share worksheets, homework, or photos of your work</li>
          <li><i class="fas fa-microphone"></i> <strong>Voice Chat</strong> - Talk to your tutor hands-free</li>
        </ul>
      `
    },
    {
      title: 'Track Your Progress',
      content: `
        <div class="tour-icon"><i class="fas fa-chart-line"></i></div>
        <p>Monitor your learning journey with our progress tracking system.</p>
        <div class="tour-highlight">
          <strong>Features:</strong><br>
          • Earn XP and level up as you learn<br>
          • Unlock badges by mastering skills<br>
          • View your skill mastery and growth<br>
          • Complete daily quests for rewards
        </div>
      `
    },
    {
      title: 'You\'re All Set!',
      content: `
        <div class="tour-icon"><i class="fas fa-rocket"></i></div>
        <p>You're ready to start your math learning adventure!</p>
        <p>Remember: Your AI tutor is here to help you learn, not just give you answers. Don't be afraid to ask questions and explore!</p>
        <div class="tour-highlight">
          <strong>Quick Tips:</strong><br>
          • Show your work to get better feedback<br>
          • Ask "why" to understand concepts deeper<br>
          • Use the tools to visualize problems<br>
          • Practice regularly to build mastery
        </div>
      `
    }
  ];

  // Tour state
  let currentStep = 0;
  let tourModal = null;
  let tourCompleted = false;

  // DOM elements
  const elements = {
    modal: null,
    stepContent: null,
    currentStepSpan: null,
    totalStepsSpan: null,
    progressFill: null,
    prevBtn: null,
    nextBtn: null,
    finishBtn: null,
    skipBtn: null
  };

  // Initialize tour
  function initTour() {
    // Get DOM elements
    elements.modal = document.getElementById('tour-modal');
    elements.stepContent = document.getElementById('tour-step-content');
    elements.currentStepSpan = document.getElementById('tour-current-step');
    elements.totalStepsSpan = document.getElementById('tour-total-steps');
    elements.progressFill = document.getElementById('tour-progress-fill');
    elements.prevBtn = document.getElementById('tour-prev-btn');
    elements.nextBtn = document.getElementById('tour-next-btn');
    elements.finishBtn = document.getElementById('tour-finish-btn');
    elements.skipBtn = document.getElementById('tour-skip-btn');

    if (!elements.modal) {
      console.warn('Tour modal not found in DOM');
      return;
    }

    // Set total steps
    elements.totalStepsSpan.textContent = tourSteps.length;

    // Attach event listeners
    elements.prevBtn.addEventListener('click', handlePrev);
    elements.nextBtn.addEventListener('click', handleNext);
    elements.finishBtn.addEventListener('click', handleFinish);
    elements.skipBtn.addEventListener('click', handleSkip);

    // Check if user should see tour
    checkTourStatus();
  }

  // Check if user needs to see the tour
  async function checkTourStatus() {
    try {
      const response = await fetch('/api/user/tour-status');
      if (!response.ok) {
        console.error('Failed to fetch tour status');
        return;
      }

      const data = await response.json();

      // Show tour if user hasn't completed or dismissed it
      if (!data.tourCompleted && !data.tourDismissed) {
        // Wait a bit for the page to load fully
        setTimeout(() => {
          showTour();
        }, 1000);
      }
    } catch (error) {
      console.error('Error checking tour status:', error);
    }
  }

  // Show tour
  function showTour() {
    if (!elements.modal) return;

    currentStep = 0;
    renderStep();
    elements.modal.classList.add('is-visible');
  }

  // Render current step
  function renderStep() {
    const step = tourSteps[currentStep];

    // Update content
    elements.stepContent.innerHTML = `
      <h3>${step.title}</h3>
      ${step.content}
    `;

    // Update step indicator
    elements.currentStepSpan.textContent = currentStep + 1;

    // Update progress bar
    const progress = ((currentStep + 1) / tourSteps.length) * 100;
    elements.progressFill.style.width = `${progress}%`;

    // Update button visibility
    elements.prevBtn.style.display = currentStep > 0 ? 'inline-flex' : 'none';
    elements.nextBtn.style.display = currentStep < tourSteps.length - 1 ? 'inline-flex' : 'none';
    elements.finishBtn.style.display = currentStep === tourSteps.length - 1 ? 'inline-flex' : 'none';
  }

  // Handle previous button
  function handlePrev() {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  }

  // Handle next button
  function handleNext() {
    if (currentStep < tourSteps.length - 1) {
      currentStep++;
      renderStep();
    }
  }

  // Handle finish button
  async function handleFinish() {
    tourCompleted = true;
    await markTourCompleted(true);
    closeTour();
    showWelcomeMessage();
  }

  // Handle skip button
  async function handleSkip() {
    tourCompleted = false;
    await markTourCompleted(false);
    closeTour();
  }

  // Close tour
  function closeTour() {
    if (elements.modal) {
      elements.modal.classList.remove('is-visible');
    }
  }

  // Mark tour as completed or dismissed
  async function markTourCompleted(completed = true) {
    try {
      const response = await csrfFetch('/api/user/tour-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          completed,
          dismissed: !completed
        })
      });

      if (!response.ok) {
        console.error('Failed to mark tour as completed');
      }
    } catch (error) {
      console.error('Error marking tour completed:', error);
    }
  }

  // Show welcome message after tour completion
  function showWelcomeMessage() {
    // You could show a toast notification or confetti here
    if (typeof confetti !== 'undefined') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }

    // Focus on the input to encourage starting
    const chatInput = document.getElementById('user-input');
    if (chatInput) {
      setTimeout(() => {
        chatInput.focus();
        chatInput.placeholder = "Ask me anything about math! For example: 'How do I solve 2x + 5 = 15?'";
      }, 500);
    }
  }

  // Public API
  window.MathMatixTour = {
    show: showTour,
    init: initTour
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTour);
  } else {
    initTour();
  }

})();
