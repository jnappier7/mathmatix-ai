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
        // Every progressUpdate carries the course-session id (progressState.js).
        // Capture it here, not just in rehydrate(): when the page renders the
        // tracker from a chat-turn payload before (or instead of) rehydration,
        // the bootcamp jump/continue actions still need the id — without this
        // they silently no-oped.
        if (progressUpdate.sessionId) this._sessionId = progressUpdate.sessionId;
        this._lastUpdate = progressUpdate;
        this._render(progressUpdate);
    }

    /**
     * Rehydrate: fetch progress from server and render.
     * Called on page load, tab refocus, reconnect.
     */
    async rehydrate(sessionId) {
        if (!sessionId) return;
        this._sessionId = sessionId; // needed by the missed-number rail's jump call
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
        // ACT bootcamp: the course is a test→review→re-test loop, not a
        // gradual-release scaffold, so render the loop view instead of the
        // Warm-up/Learn/Practice stepper — for act-prep ALWAYS, even before the
        // first baseline (pre-baseline shows a "start your baseline" state).
        if (pu && pu.courseId === 'act-prep') {
            return this._renderBootcamp(pu);
        }
        // Not in bootcamp mode — restore the standard tracker chrome if the
        // bootcamp panel was showing.
        const bcPanel = document.getElementById('lt-bootcamp');
        if (bcPanel) bcPanel.style.display = 'none';
        const ltContainer = document.querySelector('#lesson-tracker-wrapper .lt-container');
        if (ltContainer) ltContainer.style.display = '';

        // Lesson breadcrumb (shows module > lesson context)
        this._renderBreadcrumb(pu);

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

    // ── ACT bootcamp loop view (replaces the scaffold stepper for act-prep) ──
    _renderBootcamp(pu) {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (!wrapper) return;
        const ltContainer = wrapper.querySelector('.lt-container');
        if (ltContainer) ltContainer.style.display = 'none';
        let panel = document.getElementById('lt-bootcamp');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'lt-bootcamp';
            panel.style.padding = '4px 0';
            wrapper.appendChild(panel);
        }
        this._bc = pu.bootcamp || null;   // continue-button needs the current queue item
        panel.innerHTML = this._bootcampHtml(pu.bootcamp, pu.diagnosticPlan);
        panel.style.display = 'block';
        wrapper.style.display = 'block';
        this._wireBootcamp();
        this._loadBootcampScore();
    }

    _bootcampHtml(bc, dp) {
        bc = bc || {};
        const CAT = { 'integrating-essential-skills': 'Essential skills', 'number-quantity': 'Number & Quantity', algebra: 'Algebra', functions: 'Functions', geometry: 'Geometry', 'statistics-probability': 'Statistics & Probability' };
        const label = (c) => CAT[c] || String(c || '').replace(/-/g, ' ');
        const hasBaseline = !!bc.phase;   // bootcamp state only exists once a test is scored
        const total = Array.isArray(bc.queue) ? bc.queue.length : 0;
        // Count actual reviewed items, not the queue index — jumping around
        // (now possible from the number rail) makes index ≠ progress.
        const reviewed = Array.isArray(bc.queue)
            ? bc.queue.filter((q) => q && q.status === 'reviewed').length
            : 0;
        const pct = total ? Math.round((100 * reviewed) / total) : 0;
        const round = bc.round || 1;
        const isReview = bc.phase === 'review' && total > 0;
        const cur = isReview && Array.isArray(bc.queue) ? bc.queue[bc.index] : null;

        const step = (icon, name, state) => {
            const style = state === 'active'
                ? 'background:rgba(255,255,255,.22);color:#fff;font-weight:600'
                : state === 'done' ? 'color:rgba(255,255,255,.85)' : 'color:rgba(255,255,255,.5)';
            return `<div style="flex:1;text-align:center;padding:8px 4px;border-radius:8px;font-size:12px;${style}"><i class="fas ${icon}"></i> ${name}</div>`;
        };
        const loop = `<div style="display:flex;gap:6px;margin:10px 0 14px">
            ${step('fa-flag-checkered', 'Baseline', hasBaseline ? 'done' : 'active')}
            ${step('fa-bullseye', 'Review', isReview ? 'active' : (hasBaseline ? 'done' : 'todo'))}
            ${step('fa-clipboard-list', 'Re-test', bc.phase === 'reassess' ? 'active' : 'todo')}
            ${step('fa-chart-line', 'Compare', 'todo')}
          </div>`;

        const phaseCard = !hasBaseline ? `
            <div style="background:rgba(255,255,255,.14);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="color:#fff;font-size:13.5px;font-weight:500">Start with your baseline ACT — a full timed test that sets your starting score and shows exactly what to work on.</span>
              <button id="lt-bc-start" style="background:#fff;color:#5b3ea8;border:0;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer">Start baseline</button>
            </div>` : isReview ? `
            <div style="background:rgba(255,255,255,.14);border-radius:12px;padding:12px 14px">
              <div style="display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:14px;font-weight:600;margin-bottom:8px"><span>Going over what you missed</span><span style="font-weight:500;font-size:12.5px;opacity:.85">${reviewed} of ${total} done</span></div>
              <div style="height:7px;background:rgba(255,255,255,.22);border-radius:5px;overflow:hidden;margin-bottom:10px"><div style="width:${pct}%;height:100%;background:#fff;border-radius:5px"></div></div>
              ${this._numberRailHtml(bc)}
              ${this._missPreviewHtml(cur, label)}
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="color:rgba(255,255,255,.9);font-size:12.5px">Up next: <strong>${cur && cur.position != null ? `#${cur.position} · ` : ''}${cur ? label(cur.category) : '—'}</strong></span>
                <button id="lt-bc-continue" style="background:#fff;color:#5b3ea8;border:0;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer">Continue in chat</button>
              </div>
            </div>` : `
            <div style="background:rgba(255,255,255,.14);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="color:#fff;font-size:13.5px;font-weight:500">You've reviewed your misses — take a fresh test to measure your gains.</span>
              <button id="lt-bc-retest" style="background:#fff;color:#5b3ea8;border:0;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer">Take a fresh test</button>
            </div>`;

        const chips = (dp && (dp.focusCategories || dp.masteredCategories)) ? `
            <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
              ${(dp.focusCategories || []).map((c) => `<span style="background:rgba(255,255,255,.2);color:#fff;font-size:11.5px;padding:3px 9px;border-radius:20px">${label(c)}</span>`).join('')}
              ${(dp.masteredCategories || []).map((c) => `<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.75);font-size:11.5px;padding:3px 9px;border-radius:20px"><i class="fas fa-check" style="font-size:10px"></i> ${label(c)}</span>`).join('')}
            </div>` : '';

        return `
          <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:14px;padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="color:#fff;font-size:15px;font-weight:700">🎯 ACT bootcamp <span style="font-weight:500;font-size:12px;background:rgba(255,255,255,.2);padding:2px 9px;border-radius:20px;margin-left:4px">Round ${round}</span></span>
              <span id="lt-bc-score" style="color:#fff;font-size:13px;opacity:.9"></span>
            </div>
            ${loop}
            ${phaseCard}
            ${chips}
            ${hasBaseline ? `<div style="margin-top:12px;text-align:right"><a id="lt-bc-progress" href="#" style="color:#fff;font-size:12px;opacity:.9;text-decoration:none"><i class="fas fa-chart-line"></i> See your progress</a></div>` : ''}
          </div>`;
    }

    /**
     * The missed-number rail: every question they missed, as a clickable
     * number in test order ("maybe they missed 2, 4, 5, 12, 19, 23, 35…").
     * Review runs in order unless the student clicks a number to jump.
     * Renders nothing for queues that predate position-stamping — wrong
     * numbers would be worse than none.
     */
    _numberRailHtml(bc) {
        const queue = Array.isArray(bc.queue) ? bc.queue : [];
        if (!queue.length || !queue.some((q) => q && q.position != null)) return '';
        const idx = bc.index || 0;
        const chip = (q, i) => {
            if (q.position == null) return '';
            const isCur = i === idx;
            const done = q.status === 'reviewed';
            // Reviewed = checked off: a ✓ beside the number, green-tinted. It
            // stays clickable — revisiting a reviewed miss is legitimate.
            const style = isCur
                ? 'background:#fff;color:#5b3ea8;font-weight:700'
                : done
                    ? 'background:rgba(88,214,141,.28);color:#eafff2;cursor:pointer'
                    : 'background:rgba(255,255,255,.2);color:#fff;cursor:pointer';
            const title = done ? 'Reviewed ✓ — click to revisit' : (isCur ? 'Up next' : 'Click to work this one next');
            return `<button data-bc-jump="${i}" title="${title}" style="border:0;border-radius:8px;min-width:30px;padding:4px 7px;font-size:12px;cursor:pointer;${style}">${done ? '✓ ' : ''}${q.position}</button>`;
        };
        return `<div style="margin-bottom:10px">
            <div style="color:rgba(255,255,255,.8);font-size:11.5px;margin-bottom:5px">Questions you missed — tap one to jump, or just keep going in order:</div>
            <div id="lt-bc-numbers" style="display:flex;flex-wrap:wrap;gap:5px">${queue.map(chip).join('')}</div>
          </div>`;
    }

    _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /**
     * The current missed question, verbatim: exact prompt + the answer choices
     * as the student saw them, with THEIR pick marked (or a skipped note).
     * Deliberately does NOT mark the correct answer — the tutor's review flow
     * has them re-try before revealing, and the card must not undercut that.
     * Renders nothing for queues that predate prompt/options stamping.
     */
    _missPreviewHtml(cur, label) {
        if (!cur || !cur.prompt) return '';
        const esc = this._esc;
        // Figure is our own generated SVG from the item bank — same guard as
        // the test runner: bare <svg>, no scripts.
        const fig = (cur.svg && /^<svg[\s>]/.test(cur.svg) && !/<script/i.test(cur.svg))
            ? `<div style="display:flex;justify-content:center;margin:2px 0 8px">${cur.svg}</div>` : '';
        const rows = (cur.options || []).map((o) => {
            const mine = !cur.skipped && cur.theirAnswer != null && o.label === cur.theirAnswer;
            const rowStyle = mine
                ? 'background:#fdecec;border:1px solid #f0b4b4'
                : 'background:#f7f6fb;border:1px solid #eceaf4';
            return `<div style="display:flex;align-items:baseline;gap:8px;padding:5px 9px;border-radius:8px;${rowStyle}">
                <span style="font-weight:700;font-size:12px;color:#5b3ea8;flex:0 0 14px">${esc(o.label)}</span>
                <span style="font-size:13px;color:#2a2440">${esc(o.text)}</span>
                ${mine ? '<span style="margin-left:auto;font-size:11px;font-weight:600;color:#c0392b;white-space:nowrap">your answer</span>' : ''}
              </div>`;
        }).join('');
        return `<div style="background:rgba(255,255,255,.96);border-radius:10px;padding:11px 13px;margin-bottom:10px">
            <div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#8578ab;text-transform:uppercase;margin-bottom:6px">Question ${cur.position != null ? '#' + cur.position : ''} · ${esc(label(cur.category))}</div>
            ${fig}
            <div style="font-size:13.5px;line-height:1.5;color:#1f1a33;white-space:pre-wrap;margin-bottom:${rows ? '8px' : '0'}">${esc(cur.prompt)}</div>
            ${rows ? `<div style="display:flex;flex-direction:column;gap:5px">${rows}</div>` : ''}
            ${cur.skipped ? '<div style="margin-top:7px;font-size:11.5px;font-weight:600;color:#b26a00">You skipped this one on the test.</div>' : ''}
          </div>`;
    }

    /** Repaint the bootcamp panel from a chat-turn payload (data.actBootcamp). */
    updateBootcamp(bc) {
        if (!bc || !this._lastUpdate) return;
        this._lastUpdate.bootcamp = bc;
        this._renderBootcamp(this._lastUpdate);
    }

    async _jumpTo(i) {
        // Last-resort fallback: the course catalog tracks the active session too.
        const sessionId = this._sessionId
            || (window.courseManager && window.courseManager.activeCourseSessionId);
        if (!sessionId) {
            console.warn('[LessonTracker] Jump skipped: no course-session id available');
            return;
        }
        try {
            const fetcher = window.csrfFetch || window.fetch;
            const res = await fetcher(`/api/course-sessions/${sessionId}/bootcamp/jump`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ index: i })
            });
            const data = await res.json();
            if (!data.success) {
                console.warn('[LessonTracker] Jump rejected:', data && data.message);
                return;
            }
            this.updateBootcamp(data.bootcamp);
            const q = (data.bootcamp.queue || [])[i];
            // Pull the question into the conversation so the tutor presents it
            // this turn instead of waiting for the student to say something.
            if (q && q.position != null && typeof window.mmSendChatMessage === 'function') {
                window.mmSendChatMessage(`Let's go over question ${q.position}.`);
            }
        } catch (e) { console.warn('[LessonTracker] Jump failed:', e); }
    }

    _wireBootcamp() {
        const rail = document.getElementById('lt-bc-numbers');
        if (rail) rail.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-bc-jump]');
            if (btn) this._jumpTo(Number(btn.getAttribute('data-bc-jump')));
        });
        const cont = document.getElementById('lt-bc-continue');
        if (cont) cont.addEventListener('click', () => {
            // "Continue" must actually continue: ask the tutor to present the
            // next missed question. (It used to only focus the input box, which
            // reads as a dead button.) The typed-message path is the designed
            // way review advances; focusing is only the no-send fallback.
            const bc = this._bc || {};
            const cur = Array.isArray(bc.queue) ? bc.queue[bc.index || 0] : null;
            const msg = (cur && cur.position != null)
                ? `Let's go over question ${cur.position}.`
                : "I'm ready to review my missed questions.";
            const sent = (typeof window.mmSendChatMessage === 'function') && window.mmSendChatMessage(msg);
            if (!sent) {
                const input = document.getElementById('user-input') || document.getElementById('chat-input');
                if (input) input.focus();
            }
        });
        const retest = document.getElementById('lt-bc-retest');
        if (retest) retest.addEventListener('click', () => { if (window.openActTest) window.openActTest(); });
        const start = document.getElementById('lt-bc-start');
        if (start) start.addEventListener('click', () => { if (window.openActTest) window.openActTest(); });
        const prog = document.getElementById('lt-bc-progress');
        if (prog) prog.addEventListener('click', (e) => { e.preventDefault(); if (window.openActProgress) window.openActProgress(); });
    }

    async _loadBootcampScore() {
        try {
            const fetcher = window.csrfFetch || window.fetch;
            const r = await fetcher('/api/act-test/history').then((x) => x.json()).catch(() => null);
            const a = ((r && r.attempts) || []).filter((x) => x.scaledScore != null);
            const el = document.getElementById('lt-bc-score');
            if (!el || !a.length) return;
            if (a.length === 1) { el.textContent = `Score ${a[0].scaledScore}`; return; }
            const first = a[0].scaledScore, latest = a[a.length - 1].scaledScore, d = latest - first;
            el.innerHTML = `${first} &rarr; ${latest}${d > 0 ? ` <span style="background:rgba(255,255,255,.25);padding:1px 7px;border-radius:20px;font-size:11px">&#9650; +${d}</span>` : ''}`;
        } catch (e) { /* non-fatal */ }
    }

    _renderBreadcrumb(pu) {
        const container = document.getElementById('lt-breadcrumb');
        if (!container) return;

        // Build breadcrumb from course progress data
        // The lessonId in progressUpdate maps to the current lesson
        const session = window.courseManager?.courseSessions?.find(
            s => s._id === pu.sessionId
        );

        if (!session) {
            container.style.display = 'none';
            return;
        }

        const currentMod = (session.modules || []).find(
            m => m.moduleId === session.currentModuleId
        );

        if (!currentMod) {
            container.style.display = 'none';
            return;
        }

        const parts = [];
        // Unit first, with its own readout — "Unit 1 (2 of 3)" — so the student
        // can see the larger arc, not just the module they're inside.
        const up = pu.unitProgress;
        if (up) {
            parts.push(up.moduleCount > 1
                ? `${up.label} (${up.moduleIndex} of ${up.moduleCount})`
                : up.label);
        }
        if (currentMod.title) parts.push(currentMod.title);

        const currentLesson = session.currentLessonId && currentMod.lessons
            ? currentMod.lessons.find(l => l.lessonId === session.currentLessonId)
            : null;
        if (currentLesson?.title) parts.push(currentLesson.title);

        if (parts.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = `
            <i class="fas fa-book-open lt-breadcrumb-icon"></i>
            ${parts.map((p, i) =>
                (i > 0 ? '<span class="lt-breadcrumb-sep">\u203A</span>' : '') +
                (i === parts.length - 1
                    ? `<span class="lt-breadcrumb-lesson">${this._escapeHtml(p)}</span>`
                    : `<span>${this._escapeHtml(p)}</span>`)
            ).join('')}
        `;
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
