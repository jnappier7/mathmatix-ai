// ============================================
// LESSON PROGRESS TRACKER
// Renders a student-safe, calm progress UI from
// the server-authoritative progressUpdate payload.
// Called on every /api/course-chat response and
// on page load via the rehydration endpoint.
// ============================================

class LessonTracker {
    constructor() {
        this._lastUpdate = null;
        this._devMode = false; // Toggle via LessonTracker.dev()
        this._initialized = false;
    }

    // --------------------------------------------------
    // Public API
    // --------------------------------------------------

    /**
     * Update the tracker with a progressUpdate payload.
     * Called after every course-chat response.
     */
    update(progressUpdate) {
        if (!progressUpdate) return;
        this._lastUpdate = progressUpdate;
        this._render(progressUpdate);
    }

    /**
     * Rehydrate: fetch progress from server and render.
     * Called on page load, tab refocus, reconnect.
     */
    async rehydrate(sessionId) {
        if (!sessionId) return;
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/lesson-progress`, {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success && data.progressUpdate) {
                this.update(data.progressUpdate);
            }
        } catch (err) {
            console.warn('[LessonTracker] Rehydration failed:', err);
        }
    }

    /**
     * Show the tracker (when entering a course).
     */
    show() {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper) wrapper.style.display = 'block';
    }

    /**
     * Hide the tracker (when exiting a course).
     */
    hide() {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    }

    /**
     * Toggle dev overlay for debugging.
     */
    static dev() {
        if (window.lessonTracker) {
            window.lessonTracker._devMode = !window.lessonTracker._devMode;
            if (window.lessonTracker._lastUpdate) {
                window.lessonTracker._render(window.lessonTracker._lastUpdate);
            }
            console.log(`[LessonTracker] Dev mode: ${window.lessonTracker._devMode ? 'ON' : 'OFF'}`);
        }
    }

    // --------------------------------------------------
    // Rendering
    // --------------------------------------------------

    _render(pu) {
        // Phase dots
        this._renderPhaseDots(pu.phaseGroups);

        // Main progress bar — use server-computed displayPct directly (no client math)
        const displayPct = pu.displayPct || 0;
        const fill = document.getElementById('lt-progress-fill');
        const stepText = document.getElementById('lt-step-label');
        const phaseText = document.getElementById('lt-phase-label');

        if (fill) {
            fill.style.width = `${displayPct}%`;
        }
        if (stepText) {
            stepText.textContent = pu.stepLabel || '';
        }
        if (phaseText) {
            phaseText.textContent = pu.phaseLabel || '';
        }

        // Details panel (expandable)
        this._renderDetails(pu);

        // Dev overlay
        this._renderDevOverlay(pu);

        // Ensure visibility
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper && wrapper.style.display === 'none') {
            wrapper.style.display = 'block';
        }
    }

    _renderPhaseDots(phaseGroups) {
        const container = document.getElementById('lt-phase-dots');
        if (!container || !phaseGroups) return;

        container.innerHTML = phaseGroups.map(pg => {
            let dotClass = 'lt-dot-future';
            let icon = '';
            if (pg.status === 'completed') {
                dotClass = 'lt-dot-completed';
                icon = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            } else if (pg.status === 'current') {
                dotClass = 'lt-dot-current';
                icon = '<div class="lt-dot-pulse"></div>';
            }

            return `
                <div class="lt-phase-group ${dotClass}" title="${pg.label}">
                    <div class="lt-dot">${icon}</div>
                    <span class="lt-dot-label">${pg.label}</span>
                </div>
            `;
        }).join('<div class="lt-dot-connector"></div>');
    }

    _renderDetails(pu) {
        const panel = document.getElementById('lt-details-panel');
        if (!panel) return;

        let html = `<div class="lt-detail-row"><span class="lt-detail-key">Phase</span><span class="lt-detail-val">${pu.phaseGroupLabel || ''}</span></div>`;

        if (pu.uiFlags?.showAccuracy && pu.problemsAttempted > 0) {
            html += `<div class="lt-detail-row"><span class="lt-detail-key">Accuracy</span><span class="lt-detail-val">${pu.problemsCorrect}/${pu.problemsAttempted} correct</span></div>`;
        }

        // Streak: count recent consecutive correct
        if (pu.problemsCorrect > 0) {
            html += `<div class="lt-detail-row"><span class="lt-detail-key">Progress</span><span class="lt-detail-val lt-streak">${pu.problemsCorrect} problem${pu.problemsCorrect !== 1 ? 's' : ''} solved</span></div>`;
        }

        panel.innerHTML = html;
    }

    _renderDevOverlay(pu) {
        let overlay = document.getElementById('lt-dev-overlay');
        if (!this._devMode) {
            if (overlay) overlay.style.display = 'none';
            return;
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'lt-dev-overlay';
            overlay.className = 'lt-dev-overlay';
            const wrapper = document.getElementById('lesson-tracker-wrapper');
            if (wrapper) wrapper.appendChild(overlay);
        }
        overlay.style.display = 'block';
        overlay.innerHTML = `<pre style="margin:0;font-size:10px;line-height:1.3;color:#8b5cf6;white-space:pre-wrap;">${JSON.stringify(pu, null, 2)}</pre>`;
    }
}

// --------------------------------------------------
// Tab refocus rehydration
// --------------------------------------------------
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.lessonTracker && window.courseManager?.activeCourseSessionId) {
        window.lessonTracker.rehydrate(window.courseManager.activeCourseSessionId);
    }
});

// Auto-initialise
document.addEventListener('DOMContentLoaded', () => {
    window.lessonTracker = new LessonTracker();

    // Wire up the details toggle
    const toggle = document.getElementById('lt-details-toggle');
    const panel = document.getElementById('lt-details-panel');
    if (toggle && panel) {
        toggle.addEventListener('click', () => {
            const expanded = panel.classList.toggle('expanded');
            toggle.classList.toggle('expanded', expanded);
        });
    }

    console.log('[LessonTracker] Initialised. Use LessonTracker.dev() to toggle debug overlay.');
});

console.log('[LessonTracker] Module loaded');
