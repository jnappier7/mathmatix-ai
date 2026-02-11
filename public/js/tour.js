// tour.js - First-time user tour (chat.html)
// Uses direct style manipulation to avoid CSS specificity issues.
(function() {
  'use strict';

  const tourSteps = [
    {
      title: 'Welcome to MathMatix AI!',
      icon: 'fa-graduation-cap',
      content: `
        <p>Your personal AI math tutor is ready. Let's take a 30-second tour.</p>
      `
    },
    {
      title: 'Ask Anything',
      icon: 'fa-comments',
      content: `
        <p>Type a math question below and your tutor will walk you through it step by step.</p>
        <div class="tour-highlight">
          <strong>Try it:</strong> "How do I solve 2x + 5 = 15?"
        </div>
        <p>You can also <strong>upload a photo</strong> of a worksheet or use <strong>voice chat</strong>.</p>
      `
    },
    {
      title: 'Your Toolkit',
      icon: 'fa-calculator',
      content: `
        <p>Open the <strong>sidebar</strong> on the left for:</p>
        <ul>
          <li><i class="fas fa-calculator"></i> <strong>Calculator</strong> &mdash; scientific + graphing</li>
          <li><i class="fas fa-camera-retro"></i> <strong>Upload</strong> &mdash; snap homework, worksheets, or notes</li>
          <li><i class="fas fa-graduation-cap"></i> <strong>Courses</strong> &mdash; enroll in a self-paced course</li>
        </ul>
      `
    },
    {
      title: 'Level Up!',
      icon: 'fa-bolt',
      content: `
        <p>Every problem you solve earns <strong>XP</strong>. Level up, earn badges, and climb the leaderboard.</p>
        <div class="tour-highlight">
          <strong>Tip:</strong> Show your work and explain your reasoning &mdash; you'll earn bonus XP for great math thinking!
        </div>
      `
    }
  ];

  let currentStep = 0;
  let isOpen = false;

  // DOM refs (populated in initTour)
  const el = {};

  function initTour() {
    el.modal = document.getElementById('tour-modal');
    el.stepContent = document.getElementById('tour-step-content');
    el.currentStepSpan = document.getElementById('tour-current-step');
    el.totalStepsSpan = document.getElementById('tour-total-steps');
    el.progressFill = document.getElementById('tour-progress-fill');
    el.prevBtn = document.getElementById('tour-prev-btn');
    el.nextBtn = document.getElementById('tour-next-btn');
    el.finishBtn = document.getElementById('tour-finish-btn');
    el.skipBtn = document.getElementById('tour-skip-btn');

    if (!el.modal || !el.nextBtn) {
      console.warn('[Tour] Modal elements not found');
      return;
    }

    el.totalStepsSpan.textContent = tourSteps.length;

    // Button handlers with stopPropagation to prevent overlay/parent interference
    el.prevBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); goTo(currentStep - 1); });
    el.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); goTo(currentStep + 1); });
    el.finishBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); finish(true); });
    el.skipBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); finish(false); });

    // Block overlay background click from closing (stop propagation at content level)
    const tourContent = el.modal.querySelector('.tour-content');
    if (tourContent) {
      tourContent.addEventListener('click', (e) => e.stopPropagation());
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (currentStep < tourSteps.length - 1) goTo(currentStep + 1);
        else finish(true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStep > 0) goTo(currentStep - 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });

    checkTourStatus();
  }

  async function checkTourStatus() {
    try {
      const response = await fetch('/api/user/tour-status', { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data.tourCompleted && !data.tourDismissed) {
        // Delay so the page fully initializes first
        setTimeout(showTour, 1500);
      }
    } catch (err) {
      console.error('[Tour] Status check failed:', err);
    }
  }

  function showTour() {
    if (!el.modal || isOpen) return;
    currentStep = 0;
    renderStep();
    // Use direct style to bypass any CSS specificity issues
    el.modal.style.display = 'flex';
    el.modal.classList.add('is-visible');
    isOpen = true;
  }

  function closeTour() {
    if (!el.modal) return;
    el.modal.style.display = 'none';
    el.modal.classList.remove('is-visible');
    isOpen = false;
  }

  function goTo(step) {
    if (step < 0 || step >= tourSteps.length) return;
    currentStep = step;
    renderStep();
  }

  function renderStep() {
    const step = tourSteps[currentStep];

    el.stepContent.innerHTML = `
      <div class="tour-icon"><i class="fas ${step.icon}"></i></div>
      <h3>${step.title}</h3>
      ${step.content}
    `;

    el.currentStepSpan.textContent = currentStep + 1;
    el.progressFill.style.width = `${((currentStep + 1) / tourSteps.length) * 100}%`;

    el.prevBtn.style.display = currentStep > 0 ? 'inline-flex' : 'none';
    el.nextBtn.style.display = currentStep < tourSteps.length - 1 ? 'inline-flex' : 'none';
    el.finishBtn.style.display = currentStep === tourSteps.length - 1 ? 'inline-flex' : 'none';
  }

  async function finish(completed) {
    closeTour();
    try {
      await csrfFetch('/api/user/tour-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed, dismissed: !completed })
      });
    } catch (err) {
      console.error('[Tour] Failed to save status:', err);
    }
    if (completed) {
      // Confetti celebration
      if (typeof confetti !== 'undefined') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
      const chatInput = document.getElementById('user-input');
      if (chatInput) {
        setTimeout(() => {
          chatInput.focus();
          chatInput.placeholder = "Ask me anything about math! Try: 'How do I solve 2x + 5 = 15?'";
        }, 400);
      }
    }
  }

  // Public API
  window.MathMatixTour = { show: showTour, init: initTour };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTour);
  } else {
    initTour();
  }
})();
