/**
 * FLOATING CHECKPOINT MODULE
 *
 * Card-based assessment UI for course checkpoints.
 * Presents problems one at a time, grades server-side, shows results.
 * Reuses the floating-screener visual pattern but with checkpoint-specific logic.
 */

class FloatingCheckpoint {
  constructor() {
    this.container = document.getElementById('floating-checkpoint');
    this.isOpen = false;
    this.submitting = false;
    this.currentProblem = null;
    this.moduleTitle = '';
    this.totalProblems = 0;
    this.passThreshold = 70;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.setupEventListeners();
    console.log('[FloatingCheckpoint] Initialized');
  }

  setupEventListeners() {
    // Close button
    const closeBtn = this.container.querySelector('.checkpoint-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Submit button
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer());
    }

    // Skip button
    const skipBtn = document.getElementById('checkpoint-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion());
    }

    // Answer input — submit on Enter
    const answerInput = document.getElementById('checkpoint-answer-input');
    if (answerInput) {
      answerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitAnswer();
        }
      });
      answerInput.addEventListener('input', () => this.updateSubmitButton());
    }

    // Continue button (after results)
    const continueBtn = document.getElementById('checkpoint-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.finishCheckpoint());
    }

    // Start button
    const startBtn = document.getElementById('checkpoint-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.startCheckpoint());
    }
  }

  async open(moduleInfo) {
    if (!this.container) return;
    this.container.classList.add('active');
    this.isOpen = true;
    this.showScreen('instruction');

    // Pre-populate instruction screen with module info if available
    const titleEl = document.getElementById('checkpoint-module-title');
    if (titleEl && moduleInfo?.title) {
      titleEl.textContent = moduleInfo.title;
    }
  }

  close() {
    if (!this.container) return;
    this.container.classList.remove('active');
    this.isOpen = false;
  }

  showScreen(screenName) {
    const screens = this.container.querySelectorAll('.checkpoint-screen');
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`checkpoint-${screenName}-screen`);
    if (target) target.classList.add('active');
  }

  showLoading(text) {
    const loadingText = document.getElementById('checkpoint-loading-text');
    if (loadingText) loadingText.textContent = text || 'Loading...';
    this.showScreen('loading');
  }

  async startCheckpoint() {
    this.showLoading('Loading checkpoint...');

    try {
      const response = await window.csrfFetch('/api/checkpoint/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start checkpoint');
      }

      const data = await response.json();
      this.moduleTitle = data.moduleTitle;
      this.totalProblems = data.totalProblems;
      this.passThreshold = data.passThreshold;

      if (data.problem) {
        this.currentProblem = data.problem;
        this.renderProblem(data.problem);
        this.showScreen('question');
      } else {
        throw new Error('No problems available');
      }
    } catch (err) {
      console.error('[FloatingCheckpoint] Start error:', err);
      alert('Failed to start checkpoint: ' + err.message);
      this.close();
    }
  }

  renderProblem(problem) {
    // Question number
    const numEl = document.getElementById('checkpoint-question-num');
    if (numEl) numEl.textContent = `Problem ${problem.questionNumber} of ${problem.totalQuestions}`;

    // Points
    const ptsEl = document.getElementById('checkpoint-question-pts');
    if (ptsEl) ptsEl.textContent = `${problem.points} pt${problem.points !== 1 ? 's' : ''}`;

    // Skill tag
    const skillEl = document.getElementById('checkpoint-question-skill');
    if (skillEl) {
      skillEl.textContent = (problem.skill || '').replace(/-/g, ' ');
    }

    // Question content
    const contentEl = document.getElementById('checkpoint-question-content');
    if (contentEl) {
      contentEl.innerHTML = this.formatMath(problem.question);
    }

    // Progress bar
    this.updateProgressBar(problem.questionNumber - 1, problem.totalQuestions);

    // Clear answer input
    const input = document.getElementById('checkpoint-answer-input');
    if (input) {
      input.value = '';
      input.focus();
    }

    // Clear feedback
    const feedbackEl = document.getElementById('checkpoint-feedback');
    if (feedbackEl) {
      feedbackEl.classList.remove('active', 'correct', 'incorrect');
      feedbackEl.textContent = '';
    }

    // Show submit, hide next
    this.toggleButtons('submit');

    this.updateSubmitButton();

    // Render KaTeX
    if (window.renderMathInElement) {
      requestAnimationFrame(() => {
        window.renderMathInElement(contentEl, {
          delimiters: [
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
        });
      });
    }
  }

  formatMath(text) {
    if (!text) return '';
    let formatted = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Handle multi-part problems: (a), (b), (c) on new lines
    formatted = formatted.replace(/\(([a-d])\)\s/g, '<br><strong>($1)</strong> ');

    return formatted;
  }

  updateProgressBar(current, total) {
    const fill = document.getElementById('checkpoint-progress-fill');
    if (fill) {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      fill.style.width = `${pct}%`;
    }
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    const input = document.getElementById('checkpoint-answer-input');
    if (submitBtn && input) {
      submitBtn.disabled = !input.value.trim();
    }
  }

  toggleButtons(mode) {
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    const skipBtn = document.getElementById('checkpoint-skip-btn');
    const nextBtn = document.getElementById('checkpoint-next-btn');
    const answerInput = document.getElementById('checkpoint-answer-input');

    if (mode === 'submit') {
      if (submitBtn) submitBtn.style.display = '';
      if (skipBtn) skipBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = 'none';
      if (answerInput) answerInput.disabled = false;
    } else if (mode === 'next') {
      if (submitBtn) submitBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = '';
      if (answerInput) answerInput.disabled = true;
    }
  }

  async submitAnswer() {
    const input = document.getElementById('checkpoint-answer-input');
    const answer = input?.value?.trim();
    if (!answer || this.submitting) return;

    this.submitting = true;
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const response = await window.csrfFetch('/api/checkpoint/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answer }),
      });

      if (!response.ok) throw new Error('Failed to submit');
      const data = await response.json();
      this.handleResult(data);
    } catch (err) {
      console.error('[FloatingCheckpoint] Submit error:', err);
      alert('Failed to submit answer. Please try again.');
    } finally {
      this.submitting = false;
    }
  }

  async skipQuestion() {
    if (this.submitting) return;
    this.submitting = true;

    try {
      const response = await window.csrfFetch('/api/checkpoint/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answer: '', skipped: true }),
      });

      if (!response.ok) throw new Error('Failed to skip');
      const data = await response.json();
      this.handleResult(data);
    } catch (err) {
      console.error('[FloatingCheckpoint] Skip error:', err);
    } finally {
      this.submitting = false;
    }
  }

  handleResult(data) {
    // Show feedback
    const feedbackEl = document.getElementById('checkpoint-feedback');
    if (feedbackEl) {
      feedbackEl.classList.add('active');
      if (data.correct) {
        feedbackEl.classList.add('correct');
        feedbackEl.classList.remove('incorrect');
        feedbackEl.innerHTML = '<i class="fas fa-check-circle"></i> Correct!';
      } else if (data.skipped) {
        feedbackEl.classList.add('incorrect');
        feedbackEl.classList.remove('correct');
        feedbackEl.innerHTML = '<i class="fas fa-forward"></i> Skipped';
      } else {
        feedbackEl.classList.add('incorrect');
        feedbackEl.classList.remove('correct');
        // Prefer LLM feedback (natural explanation), fall back to answer key
        const explanation = data.feedback
          ? `<div class="correct-answer-hint">${this.formatMath(data.feedback)}</div>`
          : data.correctAnswer
            ? `<div class="correct-answer-hint">${this.formatMath(data.correctAnswer)}</div>`
            : '';
        feedbackEl.innerHTML = `<i class="fas fa-times-circle"></i> Not quite.${explanation}`;

        // Render math in feedback
        if (window.renderMathInElement) {
          requestAnimationFrame(() => window.renderMathInElement(feedbackEl, {
            delimiters: [
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
            ],
            throwOnError: false,
          }));
        }
      }
    }

    // Update progress
    if (data.progress) {
      this.updateProgressBar(data.progress.answered, data.progress.total);
    }

    if (data.nextAction === 'complete') {
      // Show results after a brief pause
      setTimeout(() => this.showResultsScreen(data.summary), 1200);
    } else {
      // Show next button
      this.toggleButtons('next');
      const nextBtn = document.getElementById('checkpoint-next-btn');
      if (nextBtn) {
        nextBtn.onclick = () => {
          if (data.nextProblem) {
            this.currentProblem = data.nextProblem;
            this.renderProblem(data.nextProblem);
          }
        };
        nextBtn.focus();
      }
    }
  }

  showResultsScreen(summary) {
    this.showScreen('results');

    const scoreEl = document.getElementById('checkpoint-result-score');
    const statusEl = document.getElementById('checkpoint-result-status');
    const correctEl = document.getElementById('checkpoint-result-correct');
    const totalEl = document.getElementById('checkpoint-result-total');
    const durationEl = document.getElementById('checkpoint-result-duration');
    const breakdownEl = document.getElementById('checkpoint-skill-breakdown');

    if (scoreEl) scoreEl.textContent = `${summary.scorePercent}%`;
    if (statusEl) {
      statusEl.textContent = summary.passed ? 'Passed!' : 'Needs Review';
      statusEl.className = `result-status ${summary.passed ? 'passed' : 'needs-review'}`;
    }
    if (correctEl) correctEl.textContent = `${summary.correct}/${summary.totalProblems}`;
    if (totalEl) totalEl.textContent = `${summary.earnedPoints}/${summary.totalPoints} pts`;

    if (durationEl && summary.duration) {
      const mins = Math.floor(summary.duration / 60000);
      const secs = Math.round((summary.duration % 60000) / 1000);
      durationEl.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    // Skill breakdown
    if (breakdownEl && summary.skillBreakdown) {
      breakdownEl.innerHTML = summary.skillBreakdown.map(s => {
        const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
        const label = (s.skill || '').replace(/-/g, ' ');
        const status = pct >= 70 ? 'strong' : pct >= 40 ? 'developing' : 'needs-work';
        return `<div class="skill-row ${status}">
          <span class="skill-name">${label}</span>
          <span class="skill-score">${s.correct}/${s.total}</span>
          <div class="skill-bar"><div class="skill-bar-fill" style="width: ${pct}%"></div></div>
        </div>`;
      }).join('');
    }
  }

  async finishCheckpoint() {
    this.showLoading('Saving results...');

    try {
      const response = await window.csrfFetch('/api/checkpoint/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to complete');

      const data = await response.json();
      this.close();

      if (window.showNotification) {
        const msg = data.summary?.passed
          ? `Checkpoint complete! Score: ${data.summary.scorePercent}%. Moving to next module.`
          : `Checkpoint complete. Score: ${data.summary.scorePercent}%. Some areas need review.`;
        window.showNotification(msg, data.summary?.passed ? 'success' : 'info');
      }

      // Reload the page to refresh course state
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('[FloatingCheckpoint] Complete error:', err);
      alert('Failed to save results. Please try again.');
      this.showScreen('results');
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.floatingCheckpoint = new FloatingCheckpoint();
  });
} else {
  window.floatingCheckpoint = new FloatingCheckpoint();
}
