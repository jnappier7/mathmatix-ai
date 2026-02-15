// js/parent-course.js
// Parent course player — lightweight chat interface for parent mini-courses.
// Uses /api/course-sessions and /api/course-chat endpoints.

(async function () {
    'use strict';

    // ── DOM refs ──────────────────────────────────────────
    const messagesEl     = document.getElementById('pc-messages');
    const welcomeEl      = document.getElementById('pc-welcome');
    const thinkingEl     = document.getElementById('pc-thinking');
    const inputEl        = document.getElementById('pc-input');
    const sendBtn        = document.getElementById('pc-send-btn');
    const courseTitleEl  = document.getElementById('pc-course-title');
    const courseDescEl   = document.getElementById('pc-course-desc');
    const progressPctEl  = document.getElementById('pc-progress-pct');
    const progressFillEl = document.getElementById('pc-progress-fill');
    const moduleListEl   = document.getElementById('pc-module-list');
    const moduleTitleEl  = document.getElementById('pc-module-title');
    const moduleSubEl    = document.getElementById('pc-module-subtitle');
    const sidebarEl      = document.getElementById('pc-sidebar');
    const overlayEl      = document.getElementById('pc-sidebar-overlay');
    const sidebarToggle  = document.getElementById('pc-sidebar-toggle');

    // ── State ─────────────────────────────────────────────
    let sessionId = null;
    let courseId  = null;
    let session   = null;
    let pathway   = null;
    let isProcessing = false;

    // ── Parse URL params ──────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('sessionId');
    courseId  = params.get('courseId');

    if (!sessionId && !courseId) {
        showError('No course specified. Please go back to the dashboard and select a course.');
        return;
    }

    // ── Mobile sidebar ────────────────────────────────────
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebarEl.classList.toggle('open');
            overlayEl.classList.toggle('visible');
        });
    }
    if (overlayEl) {
        overlayEl.addEventListener('click', () => {
            sidebarEl.classList.remove('open');
            overlayEl.classList.remove('visible');
        });
    }

    // ── Initialize ────────────────────────────────────────
    try {
        await initCourse();
    } catch (err) {
        console.error('[ParentCourse] Init failed:', err);
        showError('Could not load your course. Please try again from the dashboard.');
    }

    async function initCourse() {
        // 1. Find or activate the session
        if (sessionId) {
            // Activate this specific session
            await csrfFetch(`/api/course-sessions/${sessionId}/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
        } else if (courseId) {
            // Find an existing session for this courseId
            const sessRes = await csrfFetch('/api/course-sessions', { credentials: 'include' });
            const sessData = await sessRes.json();
            if (sessData.success && sessData.sessions) {
                const match = sessData.sessions.find(s => s.courseId === courseId && s.status === 'active');
                if (match) {
                    sessionId = match._id;
                    await csrfFetch(`/api/course-sessions/${sessionId}/activate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include'
                    });
                } else {
                    // No session exists — need to enroll
                    const enrollRes = await csrfFetch('/api/course-sessions/enroll', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ courseId })
                    });
                    const enrollData = await enrollRes.json();
                    if (!enrollData.success) {
                        showError(enrollData.message || 'Could not enroll in course.');
                        return;
                    }
                    sessionId = enrollData.session._id;
                }
            }
        }

        // 2. Load progress details
        const progRes = await csrfFetch(`/api/course-sessions/${sessionId}/progress`, { credentials: 'include' });
        const progData = await progRes.json();
        if (!progData.success) {
            showError('Could not load course progress.');
            return;
        }

        session = progData;
        courseId = progData.courseId;

        // 3. Load pathway for display
        try {
            const pathRes = await fetch(`/resources/${courseId}-pathway.json`);
            if (pathRes.ok) pathway = await pathRes.json();
        } catch (e) { /* pathway display is optional */ }

        // 4. Render sidebar
        renderSidebar();

        // 5. Hide welcome, send greeting
        welcomeEl.style.display = 'none';
        showThinking(true);
        await sendGreeting();
        showThinking(false);

        // 6. Enable input
        setupInput();
    }

    // ── Render sidebar ────────────────────────────────────
    function renderSidebar() {
        const name = session.courseName || pathway?.track || courseId;
        const desc = pathway?.overview || '';

        courseTitleEl.textContent = name;
        courseDescEl.textContent = desc;
        updateProgress(session.overallProgress || 0);

        // Module header
        const current = session.modules?.find(m => m.moduleId === session.currentModuleId);
        moduleTitleEl.textContent = current?.title || name;
        moduleSubEl.textContent = current ? `Topic ${(session.modules.indexOf(current) + 1)} of ${session.modules.length}` : '';

        // Module list
        moduleListEl.innerHTML = (session.modules || []).map(m => {
            let cls = '';
            let icon = '<i class="fas fa-lock pc-module-icon"></i>';
            if (m.status === 'completed') {
                cls = 'completed';
                icon = '<i class="fas fa-check-circle pc-module-icon"></i>';
            } else if (m.moduleId === session.currentModuleId) {
                cls = 'active';
                icon = '<i class="fas fa-circle-play pc-module-icon"></i>';
            } else if (m.status === 'available') {
                cls = '';
                icon = '<i class="far fa-circle pc-module-icon"></i>';
            } else {
                cls = 'locked';
            }
            return `<div class="pc-module-item ${cls}">
                ${icon}
                <span class="pc-module-title">${m.title || m.moduleId}</span>
            </div>`;
        }).join('');
    }

    function updateProgress(pct) {
        progressPctEl.textContent = `${pct}%`;
        progressFillEl.style.width = `${pct}%`;
    }

    // ── Greeting ──────────────────────────────────────────
    async function sendGreeting() {
        try {
            const res = await csrfFetch('/api/course-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ isGreeting: true })
            });

            const data = await res.json();
            if (data.text) {
                appendMessage(data.text, 'ai');
            }

            if (data.courseContext) {
                updateProgress(data.courseContext.overallProgress || 0);
            }
        } catch (err) {
            console.error('[ParentCourse] Greeting failed:', err);
            appendMessage("Welcome! Let's get started with your lesson. What would you like to learn about first?", 'ai');
        }
    }

    // ── Input handling ────────────────────────────────────
    function setupInput() {
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        sendBtn.addEventListener('click', handleSend);
    }

    async function handleSend() {
        const text = inputEl.textContent.trim();
        if (!text || isProcessing) return;

        inputEl.textContent = '';
        isProcessing = true;
        sendBtn.disabled = true;

        appendMessage(text, 'user');
        showThinking(true);

        try {
            const res = await csrfFetch('/api/course-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message: text })
            });

            const data = await res.json();
            showThinking(false);

            if (data.text) {
                appendMessage(data.text, 'ai');
            } else if (data.message) {
                appendMessage(data.message, 'ai');
            }

            // Handle course progress updates
            if (data.courseContext) {
                updateProgress(data.courseContext.overallProgress || 0);

                // Refresh module list if progress changed
                if (data.courseContext.overallProgress !== session.overallProgress) {
                    session.overallProgress = data.courseContext.overallProgress;
                    refreshProgress();
                }
            }
        } catch (err) {
            showThinking(false);
            console.error('[ParentCourse] Send failed:', err);
            appendMessage('Something went wrong. Please try again.', 'ai');
        } finally {
            isProcessing = false;
            sendBtn.disabled = false;
            inputEl.focus();
        }
    }

    // Refresh progress from server
    async function refreshProgress() {
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/progress`, { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                session = data;
                renderSidebar();
            }
        } catch (e) { /* silent */ }
    }

    // ── Message rendering ─────────────────────────────────
    function appendMessage(text, sender) {
        if (!text) return;

        const container = document.createElement('div');
        container.className = `message-container ${sender}`;

        const bubble = document.createElement('div');
        bubble.className = `pc-msg-bubble ${sender}`;

        if (sender === 'ai') {
            bubble.innerHTML = renderMarkdown(text);
        } else {
            bubble.textContent = text;
        }

        container.appendChild(bubble);
        messagesEl.appendChild(container);

        // LaTeX rendering for AI messages
        if (sender === 'ai') {
            renderMath(bubble);
        }

        // Scroll to bottom
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderMarkdown(text) {
        if (typeof marked === 'undefined' || !marked.parse) {
            return escapeHtml(text);
        }

        // Protect LaTeX blocks from markdown parsing
        const blocks = [];
        let processed = text
            .replace(/\\\[([\s\S]*?)\\\]/g, (m) => { blocks.push(m); return `@@LB${blocks.length - 1}@@`; })
            .replace(/\\\(([\s\S]*?)\\\)/g, (m) => { blocks.push(m); return `@@LB${blocks.length - 1}@@`; });

        let html = marked.parse(processed, { breaks: true });

        // Restore LaTeX blocks
        blocks.forEach((b, i) => { html = html.replace(`@@LB${i}@@`, b); });

        // Sanitize
        if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li',
                               'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'blockquote'],
                ALLOWED_ATTR: ['href', 'class', 'target', 'rel', 'style']
            });
        }

        return html;
    }

    function renderMath(element) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([element]).catch(() => {});
        } else if (window.ensureMathJax) {
            window.ensureMathJax().then(() => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([element]).catch(() => {});
                }
            });
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── UI helpers ────────────────────────────────────────
    function showThinking(show) {
        if (thinkingEl) {
            thinkingEl.classList.toggle('visible', show);
        }
        if (show) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    }

    function showError(msg) {
        if (welcomeEl) {
            welcomeEl.innerHTML = `
                <i class="fas fa-exclamation-circle" style="color: #e74c3c;"></i>
                <h3>Oops</h3>
                <p>${msg}</p>
                <a href="/parent-dashboard.html" style="margin-top: 16px; color: #e67e22;">Go to Dashboard</a>
            `;
        }
    }

})();
