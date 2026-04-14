/**
 * PRACTICE PACK — Frontend controller for printable worksheet generation.
 *
 * Adds a "Print Practice Pack" button to the student dashboard and
 * handles the PDF download flow.
 */

class PracticePackManager {
  constructor() {
    this.initButtons();
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

    // Inject button into student dashboard if the container exists
    const dashTarget = document.getElementById('practice-pack-slot');
    if (dashTarget) {
      dashTarget.innerHTML = `
        <div class="practice-pack-card">
          <div class="practice-pack-icon">📝</div>
          <h3>Practice Pack</h3>
          <p>Print personalized problems to work on paper. Upload a photo when done for AI feedback.</p>
          <div class="practice-pack-controls">
            <select id="practice-pack-count" class="practice-pack-select">
              <option value="5">5 problems</option>
              <option value="8" selected>8 problems</option>
              <option value="12">12 problems</option>
              <option value="15">15 problems</option>
            </select>
            <button class="btn btn-primary" id="practice-pack-generate-btn">
              🖨️ Print Practice Pack
            </button>
          </div>
          <div id="practice-pack-status" class="practice-pack-status"></div>
        </div>
      `;

      document.getElementById('practice-pack-generate-btn')?.addEventListener('click', () => {
        const count = parseInt(document.getElementById('practice-pack-count')?.value) || 8;
        this.generatePack({ count });
      });
    }
  }

  async generatePack(options = {}) {
    const { skillId = null, count = 8 } = options;
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
