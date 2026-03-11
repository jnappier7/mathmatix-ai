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

    const languageSelect = document.getElementById('pc-language-select');

    // ── State ─────────────────────────────────────────────
    let sessionId = null;
    let courseId  = null;
    let session   = null;
    let pathway   = null;
    let isProcessing = false;
    let currentAudio = null; // For TTS playback

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

        // 4b. Initialize language selector from user profile
        initLanguageSelector();

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

    // ── KaTeX rendering ─────────────────────────────────
    function renderKatex(math, displayMode) {
        if (!window.katex) return (displayMode ? '\\[' : '\\(') + math + (displayMode ? '\\]' : '\\)');
        try {
            return window.katex.renderToString(math, { displayMode, throwOnError: false, strict: false, trust: true });
        } catch (e) {
            console.warn('[KaTeX] render error:', e.message);
            return (displayMode ? '\\[' : '\\(') + math + (displayMode ? '\\]' : '\\)');
        }
    }

    function renderMarkdownMath(text) {
        if (!text) return '';
        const _marked = window.marked;
        const _DOMPurify = window.DOMPurify;

        if (!_marked || !_marked.parse) {
            let fallback = escapeHtml(text);
            if (window.katex) {
                fallback = fallback.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => renderKatex(m, true));
                fallback = fallback.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => renderKatex(m, false));
            }
            return _DOMPurify ? _DOMPurify.sanitize(fallback) : fallback;
        }

        let processed = text;
        const latexBlocks = [];

        // Protect display math \[...\]
        processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
            latexBlocks.push({ math, display: true });
            return `@@LATEX_BLOCK_${latexBlocks.length - 1}@@`;
        });

        // Protect inline math \(...\)
        processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
            latexBlocks.push({ math, display: false });
            return `@@LATEX_BLOCK_${latexBlocks.length - 1}@@`;
        });

        let html = _marked.parse(processed, { breaks: true });

        // Restore LaTeX as rendered KaTeX HTML
        latexBlocks.forEach((block, i) => {
            html = html.replace(`@@LATEX_BLOCK_${i}@@`, renderKatex(block.math, block.display));
        });

        if (_DOMPurify) {
            html = _DOMPurify.sanitize(html, {
                ALLOWED_TAGS: [
                    'p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div',
                    'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms',
                    'mfrac', 'msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover',
                    'msqrt', 'mroot', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'mpadded',
                    'menclose', 'mglyph', 'mstyle', 'merror', 'mprescripts', 'mmultiscripts'
                ],
                ALLOWED_ATTR: [
                    'href', 'class', 'target', 'rel', 'style',
                    'aria-hidden', 'encoding', 'mathvariant', 'stretchy', 'fence',
                    'separator', 'lspace', 'rspace', 'accent', 'accentunder',
                    'columnalign', 'rowalign', 'columnspacing', 'rowspacing',
                    'columnlines', 'rowlines', 'frame', 'framespacing',
                    'displaystyle', 'scriptlevel', 'minsize', 'maxsize', 'xmlns'
                ]
            });
        }

        return html;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ── TTS (text-to-speech) ─────────────────────────────
    function cleanTextForSpeech(text) {
        if (!text) return '';
        return text
            .replace(/\\\[([\s\S]*?)\\\]/g, '') // remove display math
            .replace(/\\\(([\s\S]*?)\\\)/g, '') // remove inline math
            .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
            .replace(/_(.+?)_/g, '$1')           // italic
            .replace(/`(.+?)`/g, '$1')           // code
            .replace(/#{1,6}\s*/g, '')           // headings
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
            .replace(/```[\s\S]*?```/g, '')      // code blocks
            .replace(/\n{2,}/g, '. ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function playTTS(text, button) {
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
            document.querySelectorAll('.play-audio-btn.is-playing').forEach(b => b.classList.remove('is-playing'));
        }

        const speakableText = cleanTextForSpeech(text);
        if (!speakableText) return;

        button.classList.add('is-loading');
        button.disabled = true;

        try {
            const res = await csrfFetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ text: speakableText })
            });

            if (res.status === 403) {
                // COPPA fallback: use browser speech synthesis
                button.classList.remove('is-loading');
                button.classList.add('is-playing');
                button.disabled = false;
                const utterance = new SpeechSynthesisUtterance(speakableText);
                utterance.onend = () => { button.classList.remove('is-playing'); currentAudio = null; };
                utterance.onerror = () => { button.classList.remove('is-playing'); currentAudio = null; };
                window.speechSynthesis.speak(utterance);
                currentAudio = { pause: () => window.speechSynthesis.cancel() };
                return;
            }

            if (!res.ok) throw new Error('TTS request failed');

            // Success — response is audio binary
            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            currentAudio = audio;

            button.classList.remove('is-loading');
            button.classList.add('is-playing');
            button.disabled = false;

            audio.onended = () => {
                button.classList.remove('is-playing');
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
            };
            audio.onerror = () => {
                button.classList.remove('is-playing', 'is-loading');
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
            };
            audio.play();
        } catch (err) {
            console.error('[ParentCourse] TTS error:', err);
            button.classList.remove('is-loading', 'is-playing');
            button.disabled = false;
        }
    }

    // ── Language selector ────────────────────────────────
    async function initLanguageSelector() {
        if (!languageSelect) return;
        try {
            const res = await fetch('/user', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                const lang = data.user?.parentLanguage || data.user?.preferredLanguage || 'English';
                languageSelect.value = lang;
            }
        } catch (e) { /* use default */ }

        languageSelect.addEventListener('change', async () => {
            const lang = languageSelect.value;
            try {
                await csrfFetch('/api/user/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ preferredLanguage: lang, parentLanguage: lang })
                });
            } catch (e) {
                console.error('[ParentCourse] Language update failed:', e);
            }
        });
    }

    // ── Message rendering ─────────────────────────────────
    function appendMessage(text, sender) {
        if (!text) return;

        const container = document.createElement('div');
        container.className = `message-container ${sender}`;

        const bubble = document.createElement('div');
        bubble.className = `pc-msg-bubble ${sender}`;

        if (sender === 'ai') {
            bubble.innerHTML = renderMarkdownMath(text);

            // Add TTS play button
            const playBtn = document.createElement('button');
            playBtn.className = 'play-audio-btn';
            playBtn.innerHTML = '<i class="fas fa-play"></i><i class="fas fa-wave-square"></i><i class="fas fa-spinner"></i>';
            playBtn.title = 'Play audio';
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playTTS(text, playBtn);
            });
            bubble.appendChild(playBtn);
        } else {
            bubble.textContent = text;
        }

        container.appendChild(bubble);
        messagesEl.appendChild(container);

        // Scroll to bottom
        messagesEl.scrollTop = messagesEl.scrollHeight;
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
