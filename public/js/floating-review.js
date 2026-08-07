/**
 * FLOATING REVIEW MODULE
 *
 * Spaced-repetition warm-up widget. Offered by the tutor's greeting when the
 * FSRS queue says previously-learned skills are fading; always opt-in, never
 * interrupts mid-session. Pulls the whole session from
 * GET /api/review/smart-queue?includeProblems=true, submits each answer to
 * POST /api/review/submit (which updates both the SM-2 and FSRS schedules).
 * Reuses the floating-checkpoint visual pattern.
 */

class FloatingReview {
  constructor() {
    this.container = document.getElementById('floating-review');
    this.isOpen = false;
    this.submitting = false;
    this.items = [];          // queue items that have a problem attached
    this.index = 0;
    this.results = [];        // { skillName, correct, skipped, intervalDays }
    this.questionStartedAt = null;
    this.selectedOption = null;

    // Drag state
    this._dragging = false;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.setupEventListeners();
    this.setupDrag();
    console.log('[FloatingReview] Initialized');
  }

  setupEventListeners() {
    const closeBtn = this.container.querySelector('.review-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const collapseBtn = this.container.querySelector('.review-collapse-btn');
    if (collapseBtn) collapseBtn.addEventListener('click', () => this.toggleCollapse());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    const startBtn = document.getElementById('review-start-btn');
    if (startBtn) startBtn.addEventListener('click', () => this.startSession());

    const laterBtn = document.getElementById('review-later-btn');
    if (laterBtn) laterBtn.addEventListener('click', () => this.close());

    const submitBtn = document.getElementById('review-submit-btn');
    if (submitBtn) submitBtn.addEventListener('click', () => this.submitAnswer());

    const skipBtn = document.getElementById('review-skip-btn');
    if (skipBtn) skipBtn.addEventListener('click', () => this.skipProblem());

    const doneBtn = document.getElementById('review-done-btn');
    if (doneBtn) doneBtn.addEventListener('click', () => this.close());

    const emptyCloseBtn = document.getElementById('review-empty-close-btn');
    if (emptyCloseBtn) emptyCloseBtn.addEventListener('click', () => this.close());

    const answerInput = document.getElementById('review-answer-input');
    if (answerInput) {
      answerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitAnswer();
        }
      });
      answerInput.addEventListener('input', () => this.updateSubmitButton());
    }
  }

  // ── Drag support (same pattern as FloatingCheckpoint) ──
  setupDrag() {
    const header = this.container.querySelector('.review-header-bar');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      this._startDrag(e.clientX, e.clientY);
    });

    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      const touch = e.touches[0];
      this._startDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('mousemove', (e) => this._onDrag(e.clientX, e.clientY));
    document.addEventListener('touchmove', (e) => {
      if (!this._dragging) return;
      const touch = e.touches[0];
      this._onDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('mouseup', () => this._endDrag());
    document.addEventListener('touchend', () => this._endDrag());
  }

  _startDrag(clientX, clientY) {
    this._dragging = true;
    const rect = this.container.getBoundingClientRect();
    this._dragOffsetX = clientX - rect.left;
    this._dragOffsetY = clientY - rect.top;
    this.container.style.transform = 'none';
    this.container.style.left = rect.left + 'px';
    this.container.style.top = rect.top + 'px';
  }

  _onDrag(clientX, clientY) {
    if (!this._dragging) return;
    let newLeft = clientX - this._dragOffsetX;
    let newTop = clientY - this._dragOffsetY;
    const rect = this.container.getBoundingClientRect();
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
    this.container.style.left = newLeft + 'px';
    this.container.style.top = newTop + 'px';
  }

  _endDrag() {
    this._dragging = false;
  }

  toggleCollapse() {
    this.container.classList.toggle('collapsed');
    const btn = this.container.querySelector('.review-collapse-btn i');
    if (btn) {
      const isCollapsed = this.container.classList.contains('collapsed');
      btn.className = isCollapsed ? 'fas fa-plus' : 'fas fa-minus';
    }
  }

  showScreen(screenName) {
    const screens = this.container.querySelectorAll('.review-screen');
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`review-${screenName}-screen`);
    if (target) target.classList.add('active');
  }

  // ── Open: fetch the queue, show the intro ──
  async open() {
    if (!this.container) return;
    this.container.classList.add('active');
    this.container.classList.remove('collapsed');
    this.isOpen = true;

    // Reset position to center
    this.container.style.left = '50%';
    this.container.style.top = '50%';
    this.container.style.transform = 'translate(-50%, -50%)';

    this.showScreen('loading');
    const loadingText = document.getElementById('review-loading-text');
    if (loadingText) loadingText.textContent = 'Checking which skills are due...';

    try {
      const response = await fetch('/api/review/smart-queue?max=3&includeProblems=true', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load review queue');
      const data = await response.json();

      this.items = (data.queue || []).filter(item => item.problem);
      this.sessionPlan = data.sessionPlan || {};

      if (this.items.length === 0) {
        this.showScreen('empty');
        return;
      }

      this.renderIntro();
      this.showScreen('intro');
    } catch (err) {
      console.error('[FloatingReview] Load error:', err);
      this.showScreen('empty');
    }
  }

  close() {
    if (!this.container) return;
    this.container.classList.remove('active', 'collapsed');
    this.isOpen = false;
  }

  renderIntro() {
    const listEl = document.getElementById('review-skill-list');
    if (listEl) {
      listEl.innerHTML = this.items.map(item =>
        `<li><i class="fas fa-circle"></i> ${this.escapeHtml(item.displayName || 'a skill')}</li>`
      ).join('');
    }

    const durationEl = document.getElementById('review-duration');
    if (durationEl) {
      const mins = Math.max(1, this.sessionPlan.estimatedMinutes || this.items.length);
      durationEl.textContent = `About ${mins} minute${mins !== 1 ? 's' : ''} — ${this.items.length} problem${this.items.length !== 1 ? 's' : ''}`;
    }
  }

  startSession() {
    this.index = 0;
    this.results = [];
    this.renderProblem();
    this.showScreen('question');
  }

  renderProblem() {
    const item = this.items[this.index];
    const problem = item.problem;
    this.selectedOption = null;
    this.questionStartedAt = Date.now();

    const numEl = document.getElementById('review-question-num');
    if (numEl) numEl.textContent = `Problem ${this.index + 1} of ${this.items.length}`;

    const skillEl = document.getElementById('review-question-skill');
    if (skillEl) skillEl.textContent = item.displayName || '';

    const contentEl = document.getElementById('review-question-content');
    if (contentEl) {
      let html = this.formatMath(problem.prompt);
      if (problem.svg) html += `<div class="review-problem-svg">${problem.svg}</div>`;
      contentEl.innerHTML = html;
    }

    // Progress
    const fill = document.getElementById('review-progress-fill');
    if (fill) {
      fill.style.width = `${Math.round((this.index / this.items.length) * 100)}%`;
    }

    // Answer area: multiple choice vs free response
    const mcArea = document.getElementById('review-mc-options');
    const inputArea = this.container.querySelector('.review-answer-area');
    const isMC = Array.isArray(problem.options) && problem.options.length > 0;

    if (mcArea) {
      mcArea.innerHTML = '';
      mcArea.style.display = isMC ? '' : 'none';
      if (isMC) {
        for (const opt of problem.options) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'review-mc-option';
          btn.dataset.label = opt.label;
          btn.innerHTML = `<span class="mc-label">${this.escapeHtml(opt.label)}.</span> <span>${this.formatMath(opt.text)}</span>`;
          btn.addEventListener('click', () => {
            if (this.submitting) return;
            mcArea.querySelectorAll('.review-mc-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            this.selectedOption = opt.label;
            this.updateSubmitButton();
          });
          mcArea.appendChild(btn);
        }
      }
    }
    if (inputArea) inputArea.style.display = isMC ? 'none' : '';

    const input = document.getElementById('review-answer-input');
    if (input) {
      input.value = '';
      input.disabled = false;
      if (!isMC) input.focus();
    }

    // Clear feedback, show submit/skip
    const feedbackEl = document.getElementById('review-feedback');
    if (feedbackEl) {
      feedbackEl.classList.remove('active', 'correct', 'incorrect');
      feedbackEl.innerHTML = '';
    }
    this.toggleButtons('submit');
    this.updateSubmitButton();

    // Render KaTeX
    if (window.renderMathInElement) {
      requestAnimationFrame(() => {
        const card = this.container.querySelector('.review-question-card');
        if (card) {
          window.renderMathInElement(card, {
            delimiters: [
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
            ],
            throwOnError: false,
          });
        }
      });
    }
  }

  escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  formatMath(text) {
    if (!text) return '';
    let formatted = this.escapeHtml(text);
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return formatted;
  }

  currentAnswer() {
    const item = this.items[this.index];
    if (Array.isArray(item.problem.options) && item.problem.options.length > 0) {
      return this.selectedOption;
    }
    const input = document.getElementById('review-answer-input');
    return input?.value?.trim() || null;
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('review-submit-btn');
    if (submitBtn) submitBtn.disabled = !this.currentAnswer();
  }

  toggleButtons(mode) {
    const submitBtn = document.getElementById('review-submit-btn');
    const skipBtn = document.getElementById('review-skip-btn');
    const nextBtn = document.getElementById('review-next-btn');
    const answerInput = document.getElementById('review-answer-input');
    const mcArea = document.getElementById('review-mc-options');

    if (mode === 'submit') {
      if (submitBtn) submitBtn.style.display = '';
      if (skipBtn) skipBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = 'none';
      if (answerInput) answerInput.disabled = false;
    } else if (mode === 'next') {
      if (submitBtn) submitBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'none';
      if (nextBtn) {
        nextBtn.style.display = '';
        nextBtn.textContent = this.index + 1 >= this.items.length ? 'See Results' : 'Next Problem';
        nextBtn.onclick = () => this.advance();
        nextBtn.focus();
      }
      if (answerInput) answerInput.disabled = true;
      if (mcArea) mcArea.querySelectorAll('.review-mc-option').forEach(b => { b.disabled = true; });
    }
  }

  async submitAnswer() {
    const item = this.items[this.index];
    const answer = this.currentAnswer();
    if (!answer || this.submitting) return;

    this.submitting = true;
    const submitBtn = document.getElementById('review-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const response = await window.csrfFetch('/api/review/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          skillId: item.skillId,
          problemId: item.problem.problemId,
          userAnswer: answer,
          responseTimeMs: Date.now() - this.questionStartedAt,
          hintUsed: false,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit');
      const data = await response.json();
      this.handleResult(item, data);
    } catch (err) {
      console.error('[FloatingReview] Submit error:', err);
      // Don't strand the student mid-warm-up on a transient error
      this.results.push({ skillName: item.displayName, skipped: true });
      this.toggleButtons('next');
    } finally {
      this.submitting = false;
    }
  }

  async skipProblem() {
    const item = this.items[this.index];
    if (this.submitting) return;
    this.submitting = true;

    try {
      await window.csrfFetch('/api/review/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ skillId: item.skillId }),
      });
    } catch (err) {
      console.error('[FloatingReview] Skip error:', err);
    } finally {
      this.submitting = false;
    }

    this.results.push({ skillName: item.displayName, skipped: true });
    this.advance();
  }

  handleResult(item, data) {
    const intervalDays = Math.max(1, Math.round(data.interval || 1));
    this.results.push({
      skillName: item.displayName,
      correct: data.correct,
      intervalDays,
    });

    const feedbackEl = document.getElementById('review-feedback');
    if (feedbackEl) {
      feedbackEl.classList.add('active');
      if (data.correct) {
        feedbackEl.classList.add('correct');
        feedbackEl.classList.remove('incorrect');
        feedbackEl.innerHTML = `<i class="fas fa-check-circle"></i> Still got it!` +
          `<div class="next-review-note">I'll bring this back in about ${intervalDays} day${intervalDays !== 1 ? 's' : ''} to keep it locked in.</div>`;
      } else {
        feedbackEl.classList.add('incorrect');
        feedbackEl.classList.remove('correct');
        const hint = data.correctAnswer != null
          ? `<div class="correct-answer-hint">Answer: ${this.formatMath(String(data.correctAnswer))}</div>`
          : '';
        feedbackEl.innerHTML = `<i class="fas fa-times-circle"></i> Not quite — that one's gotten rusty.${hint}` +
          `<div class="next-review-note">No stress, we'll revisit it soon.</div>`;

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

    this.toggleButtons('next');
  }

  advance() {
    this.index += 1;
    if (this.index >= this.items.length) {
      this.showResults();
    } else {
      this.renderProblem();
    }
  }

  showResults() {
    const fill = document.getElementById('review-progress-fill');
    if (fill) fill.style.width = '100%';

    const answered = this.results.filter(r => !r.skipped);
    const correct = answered.filter(r => r.correct).length;

    const scoreEl = document.getElementById('review-result-score');
    if (scoreEl) scoreEl.textContent = `${correct}/${answered.length || this.results.length}`;

    const subEl = document.getElementById('review-results-sub');
    if (subEl) {
      subEl.textContent =
        answered.length === 0 ? 'Saved for another day — no pressure.' :
        correct === answered.length ? 'Memory refreshed — everything held up.' :
        correct > 0 ? 'Good work — a couple of skills needed dusting off.' :
        'Those got rusty — worth revisiting with your tutor.';
    }

    const breakdownEl = document.getElementById('review-result-breakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = this.results.map(r => {
        const icon = r.skipped
          ? '<i class="fas fa-forward result-icon skipped"></i>'
          : r.correct
            ? '<i class="fas fa-check-circle result-icon correct"></i>'
            : '<i class="fas fa-times-circle result-icon incorrect"></i>';
        const next = r.skipped
          ? 'tomorrow'
          : `in ~${r.intervalDays} day${r.intervalDays !== 1 ? 's' : ''}`;
        return `<div class="review-result-row">${icon}<span class="result-skill-name">${this.escapeHtml(r.skillName || '')}</span><span class="result-next">back ${next}</span></div>`;
      }).join('');
    }

    this.showScreen('results');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.floatingReview = new FloatingReview();
  });
} else {
  window.floatingReview = new FloatingReview();
}

console.log('[FloatingReview] Module loaded');
