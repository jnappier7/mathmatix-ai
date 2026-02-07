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
    this.submitting = false;
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

    // Skip skill button
    const skipBtn = document.getElementById('screener-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion());
    }

    // Results continue button
    const continueBtn = document.getElementById('screener-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.finishAssessment());
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      // Escape to close
      if (e.key === 'Escape') {
        this.close();
        return;
      }

      // Only handle shortcuts on question screen
      if (!this.questionScreen?.classList.contains('active')) return;
      if (this.submitting) return;

      // A-F to select MC option (auto-submits via selectOption)
      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E', 'F'].includes(key)) {
        const option = document.querySelector(`.mc-option[data-value="${key}"]`);
        if (option) {
          this.selectOption(option);
          e.preventDefault();
        }
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
        this.assessmentExpired = data.assessmentExpired;
        this.growthCheckDue = data.growthCheckDue;
        this.currentGradeLevel = data.currentGradeLevel;
        this.updateSidebarButton();
      }
    } catch (error) {
      console.warn('[FloatingScreener] Could not check assessment status:', error);
    }
  }

  updateSidebarButton() {
    if (!this.sidebarBtn) return;

    // Reset classes
    this.sidebarBtn.classList.remove('needs-attention', 'completed', 'growth-due', 'expired');

    if (!this.assessmentCompleted || this.assessmentExpired) {
      // Needs initial assessment (or assessment expired - annual renewal)
      this.sidebarBtn.classList.add('needs-attention');
      this.sidebarBtn.title = this.assessmentExpired
        ? 'Starting Point - Annual renewal due'
        : 'Starting Point - Find your level';

      // Update button text for expired assessments
      const spanEl = this.sidebarBtn.querySelector('span');
      if (spanEl && this.assessmentExpired) {
        spanEl.textContent = 'Starting Point';
      }
    } else if (this.growthCheckDue) {
      // Growth check is available (every 3 months)
      this.sidebarBtn.classList.add('growth-due');
      this.sidebarBtn.title = `Growth Check available - See how you've grown! (Current: ${this.currentGradeLevel || 'Unknown'})`;

      // Update button text
      const spanEl = this.sidebarBtn.querySelector('span');
      if (spanEl) {
        spanEl.textContent = 'Growth Check';
      }
    } else {
      // Assessment completed, not expired, growth check not due
      this.sidebarBtn.classList.add('completed');
      this.sidebarBtn.title = `Starting Point - Completed (${this.currentGradeLevel || 'Unknown'})`;
    }
  }

  open() {
    // Determine what mode we're in
    if (this.growthCheckDue) {
      // Growth Check mode
      this.isGrowthCheck = true;
      this.showInstructions('growth-check');
    } else if (this.assessmentCompleted && !this.assessmentExpired) {
      // Already completed, not expired - ask if they want to retake
      if (confirm('You have already completed your Starting Point assessment. Would you like to retake it?')) {
        this.isGrowthCheck = false;
        this.showInstructions('starting-point');
      } else {
        return;
      }
    } else {
      // New assessment or expired - Starting Point mode
      this.isGrowthCheck = false;
      this.showInstructions('starting-point');
    }

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
    this.submitting = false;
  }

  centerModule() {
    // On mobile, no transform needed (full-screen)
    if (window.innerWidth <= 768) {
      this.container.style.transform = 'none';
    } else {
      this.container.style.transform = 'translate(-50%, -50%)';
    }
    this.xOffset = 0;
    this.yOffset = 0;
  }

  // Drag functionality
  dragStart(e) {
    // Disable drag on mobile (full-screen mode)
    if (window.innerWidth <= 768) return;

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

  showInstructions(mode = 'starting-point') {
    this.showScreen('instruction');

    // Update instruction screen content based on mode
    const titleEl = document.querySelector('#screener-instruction-screen h2');
    const subtitleEl = document.querySelector('#screener-instruction-screen .subtitle');
    const whatIsEl = document.querySelector('#screener-instruction-screen .instruction-card h3');
    const descriptionEl = document.querySelector('#screener-instruction-screen .instruction-card p');
    const durationEl = document.querySelector('#screener-instruction-screen .duration span');
    const headerTitleEl = document.querySelector('.screener-title');

    if (mode === 'growth-check') {
      // Growth Check mode - shorter, focused assessment
      if (titleEl) titleEl.textContent = 'Growth Check';
      if (subtitleEl) subtitleEl.textContent = `Let's see how much you've grown since ${this.currentGradeLevel || 'your last assessment'}!`;
      if (whatIsEl) whatIsEl.innerHTML = '<i class="fas fa-chart-line"></i> What is this?';
      if (descriptionEl) descriptionEl.innerHTML = `This is a shorter assessment to measure your progress. We'll focus on skills you've been working on recently. <strong>There's no penalty for wrong answers</strong> - we just want to see how you've grown!`;
      if (durationEl) durationEl.innerHTML = '<strong>Time:</strong> Usually 5-15 minutes';
      if (headerTitleEl) headerTitleEl.innerHTML = '<i class="fas fa-chart-line"></i> Growth Check';
    } else {
      // Starting Point mode - full initial assessment
      if (titleEl) titleEl.textContent = 'Find Your Starting Point';
      if (subtitleEl) subtitleEl.textContent = "Let's figure out where you are, so we can help you get where you're going.";
      if (whatIsEl) whatIsEl.innerHTML = '<i class="fas fa-info-circle"></i> What is this?';
      if (descriptionEl) descriptionEl.innerHTML = `This short assessment helps us understand your current math level. It's <strong>not a test you can fail</strong> - we're just finding the best place to start your learning journey.`;
      if (durationEl) durationEl.innerHTML = '<strong>Time:</strong> Usually 10-30 minutes, depending on your level';
      if (headerTitleEl) headerTitleEl.innerHTML = '<i class="fas fa-crosshairs"></i> Starting Point';
    }
  }

  showLoading(message = 'Loading...') {
    const loadingText = document.getElementById('screener-loading-text');
    if (loadingText) {
      loadingText.textContent = message;
    }
    this.showScreen('loading');
  }

  // Utility: wait for a duration
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Flash the question card border green for correct answers
  flashCard(type) {
    return new Promise(resolve => {
      const card = document.querySelector('.question-card');
      if (!card) { resolve(); return; }

      card.classList.add(`flash-${type}`);
      setTimeout(() => {
        card.classList.remove(`flash-${type}`);
        resolve();
      }, 400);
    });
  }

  // Fetch next problem without showing a loading screen
  async fetchNextProblem() {
    const response = await window.csrfFetch(`/api/screener/next-problem?sessionId=${this.sessionId}`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get problem');
    }

    return data;
  }

  // Update progress bar from submit-answer response
  updateProgressBar(progress) {
    if (!progress) return;

    const fill = document.getElementById('screener-progress-fill');
    if (fill) {
      fill.style.width = `${progress.percentComplete || 0}%`;
    }
  }

  // Lock/unlock answer controls during submit
  setControlsLocked(locked) {
    const submitBtn = document.getElementById('screener-submit-btn');
    const skipBtn = document.getElementById('screener-skip-btn');
    if (submitBtn) submitBtn.disabled = locked;
    if (skipBtn) skipBtn.disabled = locked;

    // Disable MC option clicks
    document.querySelectorAll('.mc-option').forEach(opt => {
      opt.style.pointerEvents = locked ? 'none' : '';
    });
  }

  // Assessment flow
  async startAssessment() {
    this.showLoading(this.isGrowthCheck ? 'Starting growth check...' : 'Starting assessment...');

    try {
      const response = await window.csrfFetch('/api/screener/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          restart: this.assessmentCompleted && !this.isGrowthCheck,
          isGrowthCheck: this.isGrowthCheck
        })
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

      // Get first problem (loading spinner is already visible)
      const nextData = await this.fetchNextProblem();
      this.currentProblem = nextData.problem;
      this.selectedAnswer = null;
      this.renderProblem(nextData.problem);
      this.showScreen('question');

    } catch (error) {
      console.error('[FloatingScreener] Error starting assessment:', error);
      alert('Failed to start assessment. Please try again.');
      this.showInstructions();
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
      const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
      optionsContainer.innerHTML = problem.options.map((option, index) => {
        // Handle both {label, text} format and plain string options
        const label = option.label || labels[index] || String.fromCharCode(65 + index);
        const text = option.text || option || '';
        return `
          <div class="mc-option" data-value="${label}" data-index="${index}">
            <span class="mc-option-label">${label}</span>
            <span class="mc-option-text">${this.formatOptionText(text)}</span>
          </div>
        `;
      }).join('');

      // Add click handlers
      optionsContainer.querySelectorAll('.mc-option').forEach(option => {
        option.addEventListener('click', () => this.selectOption(option));
      });

      optionsContainer.style.display = 'flex';

      // Hide submit button for MC — tap to answer
      const submitBtn = document.getElementById('screener-submit-btn');
      if (submitBtn) submitBtn.style.display = 'none';
    } else if (optionsContainer) {
      // Fallback for non-MC — show text input with submit button
      optionsContainer.innerHTML = `
        <input type="text" id="screener-answer-input" class="form-input" placeholder="Type your answer..." />
      `;
      optionsContainer.style.display = 'block';

      const submitBtn = document.getElementById('screener-submit-btn');
      if (submitBtn) {
        submitBtn.style.display = '';
        submitBtn.disabled = true;
      }

      // Enable submit when they type something
      const input = document.getElementById('screener-answer-input');
      if (input) {
        input.addEventListener('input', () => this.updateSubmitButton());
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            this.selectedAnswer = input.value.trim();
            this.submitAnswer();
          }
        });
      }
    }

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

    // Auto-wrap math expressions in LaTeX delimiters if not already wrapped
    // This handles content like "2^3 × 2^1" that should render as math
    if (!formatted.includes('\\(') && !formatted.includes('$')) {
      // Detect if content has math-like patterns
      const hasMathPatterns = /[\^_]|\d+\/\d+|×|÷|√|∑|∫|π|θ/.test(formatted);

      if (hasMathPatterns) {
        // Wrap the math portion in LaTeX delimiters
        // Replace common patterns with LaTeX equivalents
        formatted = formatted
          // Wrap expressions with exponents: 2^3 → \(2^3\)
          .replace(/(\d+)\^(\d+)/g, '\\($1^{$2}\\)')
          // Handle multiplication symbol
          .replace(/×/g, '\\times ')
          // Handle division symbol
          .replace(/÷/g, '\\div ')
          // Handle fractions like 1/2 (but not dates like 1/15)
          .replace(/(\d+)\/(\d+)(?!\d)/g, '\\(\\frac{$1}{$2}\\)')
          // Square root
          .replace(/√(\d+)/g, '\\(\\sqrt{$1}\\)');
      }
    }

    return formatted;
  }

  formatOptionText(text) {
    if (!text) return '';
    let formatted = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Auto-wrap math expressions in LaTeX delimiters for options too
    if (!formatted.includes('\\(') && !formatted.includes('$')) {
      const hasMathPatterns = /[\^_]|\d+\/\d+|×|÷|√/.test(formatted);
      if (hasMathPatterns) {
        formatted = formatted
          .replace(/(\d+)\^(\d+)/g, '\\($1^{$2}\\)')
          .replace(/×/g, '\\(\\times\\)')
          .replace(/÷/g, '\\(\\div\\)')
          .replace(/(\d+)\/(\d+)(?!\d)/g, '\\(\\frac{$1}{$2}\\)')
          .replace(/√(\d+)/g, '\\(\\sqrt{$1}\\)');
      }
    }
    return formatted;
  }

  selectOption(optionElement) {
    if (this.submitting) return;

    // Remove selection from all options
    document.querySelectorAll('.mc-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    // Select this option
    optionElement.classList.add('selected');
    this.selectedAnswer = optionElement.dataset.value;

    // Auto-submit for MC — no extra click needed
    this.submitAnswer();
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('screener-submit-btn');
    if (!submitBtn) return;

    const hasAnswer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;
    submitBtn.disabled = !hasAnswer;
  }

  async submitAnswer() {
    const answer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;

    if (!answer || this.submitting) return;

    this.submitting = true;
    this.setControlsLocked(true);

    try {
      const response = await window.csrfFetch('/api/screener/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          problemId: this.currentProblem.problemId,
          answer: answer,
          responseTime: null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit answer');
      }

      console.log('[FloatingScreener] Answer submitted:', data.correct ? 'correct' : 'miss');

      // Update progress bar
      this.updateProgressBar(data.progress);

      if (data.nextAction === 'continue') {
        // Start fetching next problem NOW (runs in parallel with flash)
        const nextProblemPromise = this.fetchNextProblem();

        // Green flash for correct, brief neutral pause for miss
        if (data.correct) {
          await this.flashCard('correct');
        } else {
          await this.wait(200);
        }

        // Render the prefetched problem (or wait if still loading)
        try {
          const nextData = await nextProblemPromise;
          this.currentProblem = nextData.problem;
          this.selectedAnswer = null;
          this.renderProblem(nextData.problem);
          this.showScreen('question');
        } catch (fetchError) {
          console.error('[FloatingScreener] Error prefetching next problem:', fetchError);
          alert('Failed to load next question. Please try again.');
          this.close();
        }

      } else if (data.nextAction === 'complete') {
        // Flash green for a correct final answer
        if (data.correct) {
          await this.flashCard('correct');
        }
        this.showResults(data);
      }

    } catch (error) {
      console.error('[FloatingScreener] Error submitting answer:', error);
      alert('Failed to submit answer. Please try again.');
      this.showScreen('question');
    } finally {
      this.submitting = false;
      this.setControlsLocked(false);
    }
  }

  async skipQuestion() {
    if (!this.currentProblem || this.submitting) return;

    this.submitting = true;
    this.setControlsLocked(true);

    try {
      const response = await window.csrfFetch('/api/screener/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          problemId: this.currentProblem.problemId,
          answer: '__SKIP__',
          skipped: true,
          responseTime: null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to skip question');
      }

      console.log('[FloatingScreener] Question skipped, action:', data.nextAction);

      // Update progress bar
      this.updateProgressBar(data.progress);

      if (data.nextAction === 'continue') {
        // Fetch next problem and transition immediately (no flash for skips)
        const nextData = await this.fetchNextProblem();
        this.currentProblem = nextData.problem;
        this.selectedAnswer = null;
        this.renderProblem(nextData.problem);
        this.showScreen('question');
      } else if (data.nextAction === 'complete') {
        this.showResults(data);
      }

    } catch (error) {
      console.error('[FloatingScreener] Error skipping question:', error);
      alert('Failed to skip question. Please try again.');
      this.showScreen('question');
    } finally {
      this.submitting = false;
      this.setControlsLocked(false);
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
      // Backend already returns accuracy as percentage (0-100), not decimal
      accuracyEl.textContent = `${Math.round(data.report.accuracy)}%`;
    }

    if (questionsEl && data.report?.questionsAnswered !== undefined) {
      questionsEl.textContent = data.report.questionsAnswered;
    }

    if (durationEl && data.report?.duration !== undefined) {
      // Duration is in milliseconds, convert to readable format
      const totalSeconds = Math.round(data.report.duration / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (minutes > 0) {
        durationEl.textContent = seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} min`;
      } else {
        durationEl.textContent = `${seconds} sec`;
      }
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
