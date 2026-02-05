/**
 * FLOATING CAT SCREENER MODULE
 *
 * A draggable, resizable floating module for the adaptive placement test.
 * Moves the screener out of chat and into a dedicated UI component.
 */

class FloatingScreener {
  constructor() {
    this.container = document.getElementById('floating-screener');
    this.dragHandle = document.getElementById('screener-drag-handle');
    this.closeBtn = document.getElementById('close-screener-btn');
    this.sidebarBtn = document.getElementById('sidebar-starting-point-btn');

    // Screens
    this.instructionScreen = document.getElementById('screener-instruction-screen');
    this.questionScreen = document.getElementById('screener-question-screen');
    this.loadingScreen = document.getElementById('screener-loading-screen');
    this.resultsScreen = document.getElementById('screener-results-screen');

    // State
    this.isOpen = false;
    this.sessionId = null;
    this.currentProblem = null;
    this.selectedAnswer = null;
    this.selectedConfidence = null;
    this.textSize = 'medium'; // small, medium, large, xlarge

    // Drag state
    this.isDragging = false;
    this.currentX = 0;
    this.currentY = 0;
    this.initialX = 0;
    this.initialY = 0;
    this.xOffset = 0;
    this.yOffset = 0;

    // Assessment completed state
    this.assessmentCompleted = false;

    this.init();
  }

  init() {
    if (!this.container) {
      console.warn('[FloatingScreener] Container not found, skipping init');
      return;
    }

    this.setupEventListeners();
    this.checkAssessmentStatus();

    console.log('[FloatingScreener] Initialized');
  }

  setupEventListeners() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Sidebar button
    if (this.sidebarBtn) {
      this.sidebarBtn.addEventListener('click', () => this.open());
    }

    // Drag functionality
    if (this.dragHandle) {
      this.dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
      this.dragHandle.addEventListener('touchstart', (e) => this.dragStart(e));
    }

    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('touchmove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.dragEnd());
    document.addEventListener('touchend', () => this.dragEnd());

    // Text size controls
    const textSmaller = document.getElementById('screener-text-smaller');
    const textLarger = document.getElementById('screener-text-larger');

    if (textSmaller) {
      textSmaller.addEventListener('click', () => this.changeTextSize(-1));
    }
    if (textLarger) {
      textLarger.addEventListener('click', () => this.changeTextSize(1));
    }

    // Instruction screen buttons
    const startBtn = document.getElementById('screener-start-btn');
    const waitBtn = document.getElementById('screener-wait-btn');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startAssessment());
    }
    if (waitBtn) {
      waitBtn.addEventListener('click', () => this.close());
    }

    // Submit answer button
    const submitBtn = document.getElementById('screener-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer());
    }

    // Results continue button
    const continueBtn = document.getElementById('screener-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.finishAssessment());
    }

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  async checkAssessmentStatus() {
    try {
      const response = await window.csrfFetch('/api/screener/status', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.assessmentCompleted = data.assessmentCompleted;
        this.startingPointOffered = data.startingPointOffered;
        this.updateSidebarButton();
      }
    } catch (error) {
      console.warn('[FloatingScreener] Could not check assessment status:', error);
    }
  }

  updateSidebarButton() {
    if (!this.sidebarBtn) return;

    if (this.assessmentCompleted) {
      this.sidebarBtn.classList.remove('needs-attention');
      this.sidebarBtn.classList.add('completed');
      this.sidebarBtn.title = 'Starting Point - Completed';
    } else {
      this.sidebarBtn.classList.add('needs-attention');
      this.sidebarBtn.classList.remove('completed');
      this.sidebarBtn.title = 'Starting Point - Find your level';
    }
  }

  open() {
    if (this.assessmentCompleted) {
      // Show a message that they've already completed it
      if (confirm('You have already completed your Starting Point assessment. Would you like to retake it?')) {
        this.showInstructions();
        this.container.classList.add('active');
        this.isOpen = true;
        this.centerModule();
      }
      return;
    }

    this.showInstructions();
    this.container.classList.add('active');
    this.isOpen = true;
    this.centerModule();
  }

  close() {
    this.container.classList.remove('active');
    this.isOpen = false;
    this.sessionId = null;
    this.currentProblem = null;
    this.selectedAnswer = null;
    this.selectedConfidence = null;
  }

  centerModule() {
    this.container.style.transform = 'translate(-50%, -50%)';
    this.xOffset = 0;
    this.yOffset = 0;
  }

  // Drag functionality
  dragStart(e) {
    if (e.type === 'touchstart') {
      this.initialX = e.touches[0].clientX - this.xOffset;
      this.initialY = e.touches[0].clientY - this.yOffset;
    } else {
      this.initialX = e.clientX - this.xOffset;
      this.initialY = e.clientY - this.yOffset;
    }

    if (e.target === this.dragHandle || this.dragHandle.contains(e.target)) {
      this.isDragging = true;
    }
  }

  drag(e) {
    if (!this.isDragging) return;

    e.preventDefault();

    if (e.type === 'touchmove') {
      this.currentX = e.touches[0].clientX - this.initialX;
      this.currentY = e.touches[0].clientY - this.initialY;
    } else {
      this.currentX = e.clientX - this.initialX;
      this.currentY = e.clientY - this.initialY;
    }

    this.xOffset = this.currentX;
    this.yOffset = this.currentY;

    this.container.style.transform = `translate(calc(-50% + ${this.currentX}px), calc(-50% + ${this.currentY}px))`;
  }

  dragEnd() {
    this.isDragging = false;
  }

  // Text size
  changeTextSize(direction) {
    const sizes = ['small', 'medium', 'large', 'xlarge'];
    const currentIndex = sizes.indexOf(this.textSize);
    const newIndex = Math.max(0, Math.min(sizes.length - 1, currentIndex + direction));

    this.textSize = sizes[newIndex];

    const body = document.getElementById('screener-body');
    if (body) {
      body.className = 'screener-body text-size-' + this.textSize;
    }

    // Update button states
    document.getElementById('screener-text-smaller')?.classList.toggle('disabled', newIndex === 0);
    document.getElementById('screener-text-larger')?.classList.toggle('disabled', newIndex === sizes.length - 1);
  }

  // Screen management
  showScreen(screenName) {
    // Hide all screens
    [this.instructionScreen, this.questionScreen, this.loadingScreen, this.resultsScreen].forEach(screen => {
      if (screen) screen.classList.remove('active');
    });

    // Show requested screen
    switch (screenName) {
      case 'instruction':
        if (this.instructionScreen) this.instructionScreen.classList.add('active');
        break;
      case 'question':
        if (this.questionScreen) this.questionScreen.classList.add('active');
        break;
      case 'loading':
        if (this.loadingScreen) this.loadingScreen.classList.add('active');
        break;
      case 'results':
        if (this.resultsScreen) this.resultsScreen.classList.add('active');
        break;
    }
  }

  showInstructions() {
    this.showScreen('instruction');
  }

  showLoading(message = 'Loading...') {
    const loadingText = document.getElementById('screener-loading-text');
    if (loadingText) {
      loadingText.textContent = message;
    }
    this.showScreen('loading');
  }

  // Assessment flow
  async startAssessment() {
    this.showLoading('Starting assessment...');

    try {
      const response = await window.csrfFetch('/api/screener/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ restart: this.assessmentCompleted })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.alreadyCompleted) {
          alert('You have already completed your assessment. Your results are saved.');
          this.close();
          return;
        }
        throw new Error(data.error || 'Failed to start assessment');
      }

      this.sessionId = data.sessionId;
      console.log('[FloatingScreener] Assessment started, sessionId:', this.sessionId);

      // Get first problem
      await this.getNextProblem();

    } catch (error) {
      console.error('[FloatingScreener] Error starting assessment:', error);
      alert('Failed to start assessment. Please try again.');
      this.showInstructions();
    }
  }

  async getNextProblem() {
    this.showLoading('Loading question...');

    try {
      const response = await window.csrfFetch(`/api/screener/next-problem?sessionId=${this.sessionId}`, {
        method: 'GET',
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get problem');
      }

      this.currentProblem = data.problem;
      this.selectedAnswer = null;
      this.selectedConfidence = null;

      this.renderProblem(data.problem);
      this.showScreen('question');

    } catch (error) {
      console.error('[FloatingScreener] Error getting problem:', error);
      alert('Failed to load question. Please try again.');
      this.close();
    }
  }

  renderProblem(problem) {
    // Question number
    const questionNum = document.getElementById('screener-question-num');
    if (questionNum) {
      questionNum.textContent = `Question ${problem.questionNumber}`;
    }

    // Question content
    const questionContent = document.getElementById('screener-question-content');
    if (questionContent) {
      questionContent.innerHTML = this.formatProblemContent(problem.content);
    }

    // Render options for MC questions
    const optionsContainer = document.getElementById('screener-options-container');
    if (optionsContainer && problem.answerType === 'multiple-choice' && problem.options) {
      optionsContainer.innerHTML = problem.options.map((option, index) => `
        <div class="mc-option" data-value="${option.label}" data-index="${index}">
          <span class="mc-option-label">${option.label}</span>
          <span class="mc-option-text">${this.formatOptionText(option.text)}</span>
        </div>
      `).join('');

      // Add click handlers
      optionsContainer.querySelectorAll('.mc-option').forEach(option => {
        option.addEventListener('click', () => this.selectOption(option));
      });

      optionsContainer.style.display = 'flex';
    } else if (optionsContainer) {
      // Fallback for non-MC (shouldn't happen in screener but just in case)
      optionsContainer.innerHTML = `
        <input type="text" id="screener-answer-input" class="form-input" placeholder="Type your answer..." />
      `;
      optionsContainer.style.display = 'block';
    }

    // Reset confidence meter
    this.resetConfidenceMeter();

    // Update submit button state
    this.updateSubmitButton();

    // Typeset any math
    if (window.MathJax) {
      MathJax.typesetPromise?.([questionContent, optionsContainer]).catch(console.error);
    }
  }

  formatProblemContent(content) {
    if (!content) return '';

    // Escape HTML but preserve LaTeX
    let formatted = content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown-style bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    return formatted;
  }

  formatOptionText(text) {
    if (!text) return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  selectOption(optionElement) {
    // Remove selection from all options
    document.querySelectorAll('.mc-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    // Select this option
    optionElement.classList.add('selected');
    this.selectedAnswer = optionElement.dataset.value;

    this.updateSubmitButton();
  }

  selectConfidence(level) {
    // Remove selection from all confidence options
    document.querySelectorAll('.confidence-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    // Select this level
    const option = document.querySelector(`.confidence-option[data-level="${level}"]`);
    if (option) {
      option.classList.add('selected');
      this.selectedConfidence = level;
    }
  }

  resetConfidenceMeter() {
    document.querySelectorAll('.confidence-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    this.selectedConfidence = null;

    // Re-attach click handlers
    document.querySelectorAll('.confidence-option').forEach(opt => {
      opt.onclick = () => this.selectConfidence(parseInt(opt.dataset.level));
    });
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('screener-submit-btn');
    if (!submitBtn) return;

    // Enable if answer is selected (confidence is optional)
    const hasAnswer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;
    submitBtn.disabled = !hasAnswer;
  }

  async submitAnswer() {
    const answer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;

    if (!answer) {
      alert('Please select an answer');
      return;
    }

    this.showLoading('Checking answer...');

    try {
      const response = await window.csrfFetch('/api/screener/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          problemId: this.currentProblem.problemId,
          answer: answer,
          confidence: this.selectedConfidence,
          responseTime: null // Could track time spent on question
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit answer');
      }

      console.log('[FloatingScreener] Answer submitted, action:', data.nextAction);

      if (data.nextAction === 'continue') {
        // Get next problem
        await this.getNextProblem();
      } else if (data.nextAction === 'complete') {
        // Show results
        this.showResults(data);
      }

    } catch (error) {
      console.error('[FloatingScreener] Error submitting answer:', error);
      alert('Failed to submit answer. Please try again.');
      this.showScreen('question');
    }
  }

  async showResults(data) {
    this.showScreen('results');

    // Update grade level display (like STAR testing)
    const gradeLevelEl = document.getElementById('screener-result-grade-level');
    const descriptionEl = document.getElementById('screener-result-description');

    if (gradeLevelEl && data.report?.gradeLevel) {
      gradeLevelEl.textContent = data.report.gradeLevel;
    }

    if (descriptionEl && data.report?.gradeLevelDescription) {
      descriptionEl.textContent = data.report.gradeLevelDescription;
    }

    // Update result stats
    const accuracyEl = document.getElementById('screener-result-accuracy');
    const questionsEl = document.getElementById('screener-result-questions');
    const durationEl = document.getElementById('screener-result-duration');

    if (accuracyEl && data.report?.accuracy !== undefined) {
      accuracyEl.textContent = `${Math.round(data.report.accuracy * 100)}%`;
    }

    if (questionsEl && data.report?.questionsAnswered !== undefined) {
      questionsEl.textContent = data.report.questionsAnswered;
    }

    if (durationEl && data.report?.duration !== undefined) {
      const minutes = Math.round(data.report.duration / 60);
      durationEl.textContent = `${minutes} min`;
    }
  }

  async finishAssessment() {
    this.showLoading('Saving results...');

    try {
      const response = await window.csrfFetch('/api/screener/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete assessment');
      }

      console.log('[FloatingScreener] Assessment completed');

      // Update state
      this.assessmentCompleted = true;
      this.updateSidebarButton();

      // Close the module
      this.close();

      // Show celebration or notification
      if (window.showNotification) {
        window.showNotification('Starting Point complete! Your learning path has been personalized.', 'success');
      }

      // Trigger confetti if available
      if (window.confetti) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

    } catch (error) {
      console.error('[FloatingScreener] Error completing assessment:', error);
      alert('Failed to save results. Please try again.');
      this.showScreen('results');
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.floatingScreener = new FloatingScreener();
});

// Global function to open screener from chat or other places
window.openStartingPoint = function() {
  if (window.floatingScreener) {
    window.floatingScreener.open();
  }
};

console.log('[FloatingScreener] Module loaded');
