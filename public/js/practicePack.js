/**
 * PRACTICE PACK — Frontend controller for printable worksheet generation.
 *
 * Adds a "Print Practice Pack" card to the student dashboard with:
 *   - Skill selector (auto-populated from student's active skills)
 *   - Problem count selector
 *   - Answer key toggle
 *   - PDF download flow
 */

class PracticePackManager {
  constructor() {
    this.skills = [];
    this.initButtons();
    this.initDashboardCard();
  }

  initButtons() {
    // Bind to any existing practice-pack buttons on the page
    document.querySelectorAll('[data-action="print-practice-pack"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const skillId = e.target.dataset.skillId || null;
        const count = parseInt(e.target.dataset.count) || 8;
        this.generatePack({ skillId, count });
      });
    });
  }

  async initDashboardCard() {
    const dashTarget = document.getElementById('practice-pack-slot');
    if (!dashTarget) return;

    // Load available skills for the selector
    await this.loadSkills();

    const skillOptions = this.skills.length > 0
      ? this.skills.map(s => {
          const statusIcon = s.status === 'learning' ? '📖' : s.status === 'introduced' ? '🆕' : '✅';
          return `<option value="${s.skillId}">${statusIcon} ${s.displayName} (${s.masteryScore}%)</option>`;
        }).join('')
      : '';

    dashTarget.innerHTML = `
      <div class="practice-pack-card">
        <div class="practice-pack-icon">📝</div>
        <h3>Practice Pack</h3>
        <p>Print personalized problems to work on paper. Upload a photo when done for AI feedback.</p>
        <div class="practice-pack-controls">
          <select id="practice-pack-skill" class="practice-pack-select" title="Focus on a specific skill">
            <option value="">All my skills</option>
            ${skillOptions}
          </select>
          <div class="practice-pack-row">
            <select id="practice-pack-count" class="practice-pack-select practice-pack-count-select">
              <option value="5">5 problems</option>
              <option value="8" selected>8 problems</option>
              <option value="12">12 problems</option>
              <option value="15">15 problems</option>
            </select>
            <label class="practice-pack-checkbox-label">
              <input type="checkbox" id="practice-pack-answer-key" />
              <span>Answer key</span>
            </label>
          </div>
          <button class="btn btn-primary" id="practice-pack-generate-btn">
            🖨️ Print Practice Pack
          </button>
        </div>
        <div id="practice-pack-status" class="practice-pack-status"></div>
      </div>
    `;

    document.getElementById('practice-pack-generate-btn')?.addEventListener('click', () => {
      const count = parseInt(document.getElementById('practice-pack-count')?.value) || 8;
      const skillId = document.getElementById('practice-pack-skill')?.value || null;
      const answerKey = document.getElementById('practice-pack-answer-key')?.checked || false;
      this.generatePack({ count, skillId, answerKey });
    });
  }

  async loadSkills() {
    try {
      const response = await fetch('/api/practice-pack/skills', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.success) this.skills = data.skills;
      }
    } catch (e) {
      console.warn('[PracticePack] Could not load skills:', e);
    }
  }

  async generatePack(options = {}) {
    const { skillId = null, count = 8, answerKey = false } = options;
    const statusEl = document.getElementById('practice-pack-status');
    const btn = document.getElementById('practice-pack-generate-btn');

    // Loading state
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating...';
    }
    if (statusEl) {
      statusEl.textContent = 'Selecting problems at your level...';
      statusEl.className = 'practice-pack-status loading';
    }

    try {
      const params = new URLSearchParams({ count });
      if (skillId) params.set('skillId', skillId);
      if (answerKey) params.set('answerKey', 'true');

      const response = await fetch(`/api/practice-pack/generate?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to generate (${response.status})`);
      }

      // Download the PDF
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `practice-pack-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (statusEl) {
        statusEl.textContent = 'PDF downloaded! Print it, work the problems on paper, then upload a photo.';
        statusEl.className = 'practice-pack-status success';
      }

    } catch (error) {
      console.error('[PracticePack] Generation failed:', error);
      if (statusEl) {
        statusEl.textContent = error.message || 'Something went wrong. Please try again.';
        statusEl.className = 'practice-pack-status error';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🖨️ Print Practice Pack';
      }
    }
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.practicePackManager = new PracticePackManager();
});
