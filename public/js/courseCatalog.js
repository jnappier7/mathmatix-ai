// ============================================
// COURSE CATALOG & ENROLLMENT MANAGER
// Handles course browsing, enrollment, progress display,
// and switching between course sessions and general tutoring.
// Purely additive — never touches existing sidebar/session logic.
// ============================================

class CourseManager {
    constructor() {
        this.courseSessions = [];
        this.activeCourseSessionId = null;
        this.dropdownOpen = false;
        this._lastKnownModuleStatuses = {}; // moduleId → status, for detecting completions
        this.init();
    }

    // --------------------------------------------------
    // Initialisation
    // --------------------------------------------------
    init() {
        // Browse Courses button → open catalog modal
        const browseBtn = document.getElementById('browse-courses-btn');
        if (browseBtn) {
            browseBtn.addEventListener('click', () => this.openCatalog());
        }

        // Close catalog modal
        const closeBtn = document.getElementById('close-catalog-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeCatalog());
        }

        // Courses section expand/collapse
        const coursesToggle = document.getElementById('courses-toggle-btn');
        const coursesContent = document.getElementById('sidebar-courses');
        if (coursesToggle && coursesContent) {
            coursesToggle.addEventListener('click', () => {
                const expanded = coursesContent.classList.toggle('expanded');
                coursesToggle.classList.toggle('expanded', expanded);
            });
            // Start expanded
            coursesContent.classList.add('expanded');
            coursesToggle.classList.add('expanded');
        }

        // Close catalog when clicking overlay background
        const modal = document.getElementById('course-catalog-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeCatalog();
            });
        }

        // Next Lesson / Exit Course buttons
        const nextBtn = document.getElementById('course-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.onNextLesson());
        }

        const exitBtn = document.getElementById('course-exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => this.exitCourse());
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dropdownOpen &&
                !e.target.closest('#course-progress-wrapper')) {
                this.closeProgressDropdown();
            }
        });

        // Nudge banner buttons
        const nudgeContinue = document.getElementById('nudge-continue-btn');
        if (nudgeContinue) {
            nudgeContinue.addEventListener('click', () => {
                const sessionId = nudgeContinue.dataset.sessionId;
                if (sessionId) this.activateCourse(sessionId);
                this.hideNudge();
            });
        }
        const nudgeDismiss = document.getElementById('nudge-dismiss-btn');
        if (nudgeDismiss) {
            nudgeDismiss.addEventListener('click', () => this.hideNudge());
        }

        // Load enrolled courses on startup
        this.loadMySessions();

        console.log('[CourseManager] Initialised');
    }

    // --------------------------------------------------
    // Sidebar: load the user's enrolled courses
    // --------------------------------------------------
    async loadMySessions() {
        try {
            const res = await csrfFetch('/api/course-sessions', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (!data.success) return;

            this.courseSessions = data.sessions || [];

            // Determine if there is an active course session
            // (the user model tracks this server-side; we infer from the list)
            this.renderSidebarCourses();

            // If there is an active course session tied to the current conversation,
            // show the progress bar — otherwise show the resume nudge
            this.checkActiveProgressBar();
            this.checkResumeNudge();
        } catch (err) {
            console.warn('[CourseManager] Failed to load sessions:', err);
        }
    }

    renderSidebarCourses() {
        const list = document.getElementById('course-sessions-list');
        if (!list) return;

        list.innerHTML = '';

        if (this.courseSessions.length === 0) {
            list.innerHTML = `<div style="padding: 8px 4px; color: #aaa; font-size: 13px;">
                No courses yet — browse below!
            </div>`;
            return;
        }

        // Check which conversation is currently active
        const currentConvId = window.currentConversationId || window.sidebar?.activeConversationId;

        this.courseSessions.forEach(s => {
            const item = document.createElement('div');
            const isActive = s.conversationId === currentConvId && s.status === 'active';
            item.className = 'course-sidebar-item' + (isActive ? ' active' : '') + (s.status === 'paused' ? ' paused' : '');
            item.dataset.sessionId = s._id;

            const pct = s.overallProgress || 0;
            const moduleDone = (s.modules || []).filter(m => m.status === 'completed').length;
            const moduleTotal = (s.modules || []).length;

            // Format current module name from slug: "mod-linear-equations" → "Linear Equations"
            const currentMod = s.currentModuleId || '';
            const modLabel = currentMod
                .replace(/^mod-/, '')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());

            item.innerHTML = `
                <div class="course-sidebar-row">
                    <div class="course-sidebar-icon">${s.status === 'paused' ? '⏸' : '📘'}</div>
                    <div class="course-sidebar-body">
                        <div class="course-sidebar-name">${this.escapeHtml(s.courseName)}</div>
                        <div class="course-sidebar-module">${s.status === 'paused' ? 'Paused' : modLabel}</div>
                        <div class="course-sidebar-progress-track">
                            <div class="course-sidebar-progress-fill" style="width: ${pct}%"></div>
                        </div>
                        <div class="course-sidebar-stats">${moduleDone}/${moduleTotal} modules &middot; ${pct}%</div>
                    </div>
                    <button class="course-drop-x" title="Drop course" aria-label="Drop course">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            // Click row → activate course
            item.querySelector('.course-sidebar-row').addEventListener('click', (e) => {
                if (e.target.closest('.course-drop-x')) return;
                this.activateCourse(s._id);
            });

            // Click X → drop course
            item.querySelector('.course-drop-x').addEventListener('click', (e) => {
                e.stopPropagation();
                this.dropCourse(s._id);
            });

            list.appendChild(item);
        });
    }

    // --------------------------------------------------
    // Progress bar (shown at top of chat when inside a course conversation)
    // --------------------------------------------------
    async checkActiveProgressBar() {
        // Find if any session's conversationId matches the currently active conversation
        const currentConvId = window.currentConversationId || window.sidebar?.activeConversationId;
        if (!currentConvId) return;

        const match = this.courseSessions.find(
            s => s.conversationId === currentConvId && s.status === 'active'
        );

        const wrapper = document.getElementById('course-progress-wrapper');
        if (!wrapper) return;

        if (match) {
            this.activeCourseSessionId = match._id;
            this.updateProgressBar(match);
            wrapper.style.display = 'block';
        } else {
            wrapper.style.display = 'none';
            this.activeCourseSessionId = null;
        }
    }

    updateProgressBar(session) {
        const title = document.getElementById('course-progress-title');
        const mod = document.getElementById('course-progress-module');
        const fill = document.getElementById('course-progress-fill');
        const pct = document.getElementById('course-progress-pct');

        if (title) title.textContent = session.courseName || '';
        if (fill) fill.style.width = `${session.overallProgress || 0}%`;
        if (pct) pct.textContent = `${session.overallProgress || 0}%`;

        // Find current module name
        const current = (session.modules || []).find(m => m.moduleId === session.currentModuleId);
        if (mod) mod.textContent = current ? `Module: ${session.currentModuleId}` : '';
    }

    // --------------------------------------------------
    // Resume nudge (shown when user has course but is in general chat)
    // --------------------------------------------------
    checkResumeNudge() {
        const nudge = document.getElementById('course-resume-nudge');
        if (!nudge) return;

        // Don't show if already dismissed this page load
        if (this._nudgeDismissed) {
            nudge.style.display = 'none';
            return;
        }

        // Don't show if progress bar is already visible (user IS in their course)
        if (this.activeCourseSessionId) {
            nudge.style.display = 'none';
            return;
        }

        // Find an active course to nudge about
        const activeCourse = this.courseSessions.find(s => s.status === 'active');
        if (!activeCourse) {
            nudge.style.display = 'none';
            return;
        }

        // Show the nudge
        const nameEl = document.getElementById('nudge-course-name');
        const progressEl = document.getElementById('nudge-course-progress');
        const continueBtn = document.getElementById('nudge-continue-btn');

        if (nameEl) nameEl.textContent = activeCourse.courseName;
        if (progressEl) progressEl.textContent = `${activeCourse.overallProgress || 0}% complete`;
        if (continueBtn) continueBtn.dataset.sessionId = activeCourse._id;

        nudge.style.display = 'block';
    }

    hideNudge() {
        const nudge = document.getElementById('course-resume-nudge');
        if (nudge) nudge.style.display = 'none';
        this._nudgeDismissed = true;
    }

    // --------------------------------------------------
    // Module completion detection & celebration
    // --------------------------------------------------
    detectCompletions(modules) {
        const newlyCompleted = [];

        modules.forEach(m => {
            const prev = this._lastKnownModuleStatuses[m.moduleId];
            if (m.status === 'completed' && prev && prev !== 'completed') {
                newlyCompleted.push(m);
            }
            this._lastKnownModuleStatuses[m.moduleId] = m.status;
        });

        // If this is the first load, just cache statuses — don't celebrate
        if (!this._progressLoadedOnce) {
            this._progressLoadedOnce = true;
            return;
        }

        // Celebrate each newly completed module
        newlyCompleted.forEach(m => this.celebrateModuleCompletion(m));
    }

    async celebrateModuleCompletion(mod) {
        // Call the complete-module endpoint to award XP and unlock next
        let xpAwarded = 0;
        let courseComplete = false;
        if (this.activeCourseSessionId) {
            try {
                const res = await csrfFetch(`/api/course-sessions/${this.activeCourseSessionId}/complete-module`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        moduleId: mod.moduleId,
                        checkpointPassed: mod.checkpointPassed || false
                    }),
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    xpAwarded = data.xpAwarded || 0;
                    courseComplete = data.courseComplete || false;
                }
            } catch (err) {
                console.warn('[CourseManager] Failed to record module completion:', err);
            }
        }

        // Fire confetti
        if (window.ensureConfetti) {
            await window.ensureConfetti();
        }
        if (typeof confetti === 'function') {
            const colors = ['#667eea', '#764ba2', '#22c55e', '#f59e0b', '#ffffff'];
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
            setTimeout(() => {
                confetti({ particleCount: 40, spread: 50, origin: { x: 0.2, y: 0.5 }, colors });
                confetti({ particleCount: 40, spread: 50, origin: { x: 0.8, y: 0.5 }, colors });
            }, 300);
        }

        // Show celebration card in chat
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const card = document.createElement('div');
        card.style.cssText = `
            margin: 16px auto; max-width: 440px; border-radius: 14px; overflow: hidden;
            box-shadow: 0 4px 16px rgba(34,197,94,0.2); animation: catalogSlideIn 0.4s ease;
            border: 2px solid ${courseComplete ? '#f59e0b' : '#22c55e'};
        `;

        const skills = (mod.skills || []).slice(0, 4);
        const skillsHtml = skills.length > 0
            ? skills.map(s => `<span style="display:inline-block; background:#f0fdf4; color:#16a34a; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; margin:2px;">${this.escapeHtml(s)}</span>`).join('')
            : '';

        const headerBg = courseComplete
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'linear-gradient(135deg, #22c55e, #16a34a)';
        const headerEmoji = courseComplete ? '🎓' : '🏆';
        const headerTitle = courseComplete ? 'Course Complete!' : 'Module Complete!';

        card.innerHTML = `
            <div style="background: ${headerBg}; padding: 20px; color: white; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 6px;">${headerEmoji}</div>
                <h3 style="margin: 0 0 2px; font-size: 17px; font-weight: 700;">${headerTitle}</h3>
                <p style="margin: 0; font-size: 14px; opacity: 0.95;">${this.escapeHtml(mod.title || mod.moduleId)}</p>
            </div>
            <div style="padding: 16px; background: white; text-align: center;">
                ${xpAwarded > 0 ? `<div style="font-size: 20px; font-weight: 800; color: #667eea; margin-bottom: 8px;">+${xpAwarded} XP</div>` : ''}
                ${skillsHtml ? `<div style="margin-bottom: 10px;">${skillsHtml}</div>` : ''}
                ${mod.checkpointPassed ? '<div style="font-size: 13px; color: #f59e0b; font-weight: 600; margin-bottom: 6px;"><i class="fas fa-medal"></i> Checkpoint Passed!</div>' : ''}
                <div style="font-size: 12px; color: #888; margin-top: 8px;">${courseComplete ? 'You did it! Time to celebrate.' : 'Keep going — you\'re building real momentum!'}</div>
            </div>
        `;

        chatBox.appendChild(card);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Extra confetti burst for course completion
        if (courseComplete && typeof confetti === 'function') {
            setTimeout(() => {
                for (let i = 0; i < 5; i++) {
                    setTimeout(() => {
                        confetti({ particleCount: 60, spread: 100, origin: { x: Math.random(), y: 0.3 }, colors: ['#f59e0b', '#667eea', '#22c55e'] });
                    }, i * 200);
                }
            }, 500);
        }
    }

    // --------------------------------------------------
    // Progress dropdown
    // --------------------------------------------------
    toggleProgressDropdown() {
        if (this.dropdownOpen) {
            this.closeProgressDropdown();
        } else {
            this.openProgressDropdown();
        }
    }

    async openProgressDropdown() {
        if (!this.activeCourseSessionId) return;

        const dropdown = document.getElementById('course-progress-dropdown');
        const arrow = document.getElementById('course-dropdown-arrow');
        if (!dropdown) return;

        // Fetch detailed progress
        try {
            const res = await csrfFetch(`/api/course-sessions/${this.activeCourseSessionId}/progress`, {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                // Detect newly completed modules
                this.detectCompletions(data.modules || []);

                this.renderModuleList(data);

                // Also update the bar title with the current module
                const mod = document.getElementById('course-progress-module');
                if (mod && data.next) {
                    mod.textContent = data.next.title || '';
                }

                // Update progress bar with latest data
                const fill = document.getElementById('course-progress-fill');
                const pct = document.getElementById('course-progress-pct');
                if (fill) fill.style.width = `${data.overallProgress || 0}%`;
                if (pct) pct.textContent = `${data.overallProgress || 0}%`;
            }
        } catch (err) {
            console.warn('[CourseManager] Failed to load progress:', err);
        }

        dropdown.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
        this.dropdownOpen = true;
    }

    closeProgressDropdown() {
        const dropdown = document.getElementById('course-progress-dropdown');
        const arrow = document.getElementById('course-dropdown-arrow');
        if (dropdown) dropdown.style.display = 'none';
        if (arrow) arrow.style.transform = '';
        this.dropdownOpen = false;
    }

    renderModuleList(data) {
        const list = document.getElementById('course-module-list');
        if (!list) return;

        list.innerHTML = '';

        const modules = data.modules || [];
        modules.forEach(m => {
            const el = document.createElement('div');
            el.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid #f0f0f0;';

            // Status icon
            let icon = '';
            let iconColor = '#ccc';
            if (m.status === 'completed') {
                icon = 'fa-check-circle';
                iconColor = '#22c55e';
            } else if (m.status === 'in_progress') {
                icon = 'fa-play-circle';
                iconColor = '#667eea';
            } else if (m.status === 'available') {
                icon = 'fa-circle';
                iconColor = '#667eea';
            } else {
                icon = 'fa-lock';
                iconColor = '#ccc';
            }

            const isCurrent = m.moduleId === data.currentModuleId;

            el.innerHTML = `
                <i class="fas ${icon}" style="color:${iconColor}; font-size:16px; min-width:20px;"></i>
                <div style="flex:1;">
                    <div style="font-size:13px; font-weight:${isCurrent ? '700' : '500'}; color:${m.status === 'locked' ? '#aaa' : '#333'};">
                        ${this.escapeHtml(m.title || m.moduleId)}
                    </div>
                    ${m.apWeight ? `<span style="font-size:10px; color:#764ba2; background:#f3f0ff; padding:1px 6px; border-radius:4px;">${m.apWeight}</span>` : ''}
                    ${m.scaffoldProgress > 0 && m.status !== 'completed' ? `
                        <div style="margin-top:3px; width:80px; height:3px; background:#e2e8f0; border-radius:2px;">
                            <div style="height:100%; width:${m.scaffoldProgress}%; background:#667eea; border-radius:2px;"></div>
                        </div>
                    ` : ''}
                </div>
                ${m.checkpointPassed ? '<i class="fas fa-medal" style="color:#f59e0b; font-size:12px;" title="Checkpoint passed"></i>' : ''}
            `;

            list.appendChild(el);
        });

        // Drop Course button at the bottom of the module list
        const dropRow = document.createElement('div');
        dropRow.style.cssText = 'padding:12px 4px 4px; border-top:1px solid #f0f0f0; margin-top:8px; text-align:center;';
        dropRow.innerHTML = `
            <button class="course-drop-btn" style="
                background:none; border:1px solid #e2e8f0; border-radius:8px;
                color:#999; font-size:12px; padding:6px 16px; cursor:pointer;
                transition:all 0.15s;
            " onmouseover="this.style.borderColor='#ef4444';this.style.color='#ef4444';"
               onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#999';">
                <i class="fas fa-sign-out-alt" style="margin-right:4px;"></i>Drop Course
            </button>
        `;
        dropRow.querySelector('.course-drop-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.activeCourseSessionId) {
                this.dropCourse(this.activeCourseSessionId);
            }
        });
        list.appendChild(dropRow);
    }

    // --------------------------------------------------
    // Catalog modal
    // --------------------------------------------------
    async openCatalog() {
        const modal = document.getElementById('course-catalog-modal');
        if (!modal) return;

        modal.classList.add('is-visible');

        const grid = document.getElementById('catalog-grid');
        if (grid) grid.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;">Loading courses...</div>';

        try {
            const res = await csrfFetch('/api/course-sessions/catalog', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                this.renderCatalog(data.catalog, data.recommended);
            }
        } catch (err) {
            console.error('[CourseManager] Failed to load catalog:', err);
            if (grid) grid.innerHTML = '<div style="text-align:center; padding:40px; color:#e74c3c;">Failed to load courses.</div>';
        }
    }

    closeCatalog() {
        const modal = document.getElementById('course-catalog-modal');
        if (modal) modal.classList.remove('is-visible');
    }

    renderCatalog(catalog, recommended) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        grid.innerHTML = '';

        // Build a set of already-enrolled courseIds
        const enrolled = new Set(this.courseSessions.map(s => s.courseId));

        if (catalog.length === 0) {
            grid.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;">No courses available yet.</div>';
            return;
        }

        // Difficulty badge colors
        const diffColors = {
            'Beginner': { bg: '#ecfdf5', text: '#16a34a' },
            'Intermediate': { bg: '#eff6ff', text: '#2563eb' },
            'Advanced': { bg: '#faf5ff', text: '#7c3aed' },
            'Test Prep': { bg: '#fefce8', text: '#ca8a04' }
        };

        catalog.forEach(course => {
            const card = document.createElement('div');
            const isRecommended = course.courseId === recommended;
            card.style.cssText = `border:1px solid ${isRecommended ? '#667eea' : '#e2e8f0'}; border-radius:12px; padding:16px; display:flex; gap:14px; transition:box-shadow 0.15s; position:relative;${isRecommended ? ' background: #f8f7ff;' : ''}`;
            card.onmouseover = () => { card.style.boxShadow = '0 4px 12px rgba(102,126,234,0.15)'; };
            card.onmouseout = () => { card.style.boxShadow = 'none'; };

            const isEnrolled = enrolled.has(course.courseId);
            const diff = diffColors[course.difficulty] || { bg: '#f1f5f9', text: '#64748b' };

            card.innerHTML = `
                ${isRecommended ? '<div style="position:absolute; top:-8px; right:12px; background:linear-gradient(135deg, #667eea, #764ba2); color:white; padding:2px 10px; border-radius:10px; font-size:10px; font-weight:700;">RECOMMENDED</div>' : ''}
                <div style="min-width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #667eea, #764ba2); display:flex; align-items:center; justify-content:center; font-size:22px;">
                    ${course.icon || '📚'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:700; font-size:15px; color:#333;">${this.escapeHtml(course.title)}</span>
                        ${course.difficulty ? `<span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:${diff.bg}; color:${diff.text};">${course.difficulty}</span>` : ''}
                        ${course.apWeight ? '<span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:#faf5ff; color:#7c3aed;">AP</span>' : ''}
                    </div>
                    ${course.tagline ? `<div style="font-size:13px; color:#555; margin-top:4px; line-height:1.4;">${this.escapeHtml(course.tagline)}</div>` : ''}
                    <div style="font-size:11px; color:#aaa; margin-top:4px;">
                        ${course.moduleCount} modules${course.prerequisites.length > 0 ? ' · Prereq: ' + course.prerequisites.join(', ') : ''}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:4px;">
                    <button class="catalog-enroll-btn" data-course-id="${course.courseId}"
                        style="padding:8px 18px; border:none; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; white-space:nowrap;
                        ${isEnrolled
                            ? 'background:#f0f0f0; color:#888; cursor:default;'
                            : 'background:linear-gradient(135deg, #667eea, #764ba2); color:white;'
                        }"
                        ${isEnrolled ? 'disabled' : ''}>
                        ${isEnrolled ? '<i class="fas fa-check" style="margin-right:4px;"></i>Enrolled' : 'Enroll'}
                    </button>
                </div>
            `;

            // Wire up enroll button
            if (!isEnrolled) {
                const btn = card.querySelector('.catalog-enroll-btn');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.enrollInCourse(course.courseId, btn);
                });
            }

            grid.appendChild(card);
        });
    }

    // --------------------------------------------------
    // Enrollment
    // --------------------------------------------------
    async enrollInCourse(courseId, btnEl) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Enrolling...';
        }

        try {
            const res = await csrfFetch('/api/course-sessions/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId }),
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) {
                alert(data.message || 'Enrollment failed');
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.textContent = 'Enroll';
                }
                return;
            }

            // Close catalog
            this.closeCatalog();

            // Refresh sidebar courses
            await this.loadMySessions();

            // Switch to the new course conversation
            if (data.conversationId && window.sidebar) {
                await window.sidebar.loadSessions();
                window.sidebar.switchSession(data.conversationId);
            }

            // Show the progress bar
            this.activeCourseSessionId = data.session._id;
            this.updateProgressBar(data.session);
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'block';

            // Hide nudge if showing
            this.hideNudge();

            // Show welcome splash in the chat (with course tips for first-time, resume for returning)
            if (data.welcomeData) {
                this.showWelcomeSplash(data.welcomeData, data.resumed || false);
            } else {
                this.showToast(`Enrolled in ${data.session.courseName}! Let's get started.`);
            }

        } catch (err) {
            console.error('[CourseManager] Enrollment error:', err);
            alert('Something went wrong. Please try again.');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Enroll';
            }
        }
    }

    // --------------------------------------------------
    // Activate a course (from sidebar click)
    // --------------------------------------------------
    async activateCourse(sessionId) {
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/activate`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) return;

            const session = data.session;

            // Switch sidebar to the course conversation
            if (session.conversationId && window.sidebar) {
                await window.sidebar.loadSessions();
                window.sidebar.switchSession(session.conversationId);
            }

            // Show progress bar
            this.activeCourseSessionId = session._id;
            this.updateProgressBar(session);
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'block';

        } catch (err) {
            console.error('[CourseManager] Failed to activate course:', err);
        }
    }

    // --------------------------------------------------
    // Exit Course (deactivate — return to general tutoring)
    // --------------------------------------------------
    async exitCourse() {
        this.closeProgressDropdown();

        try {
            await csrfFetch('/api/course-sessions/deactivate', {
                method: 'POST',
                credentials: 'include'
            });

            // Hide progress bar
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'none';
            this.activeCourseSessionId = null;

            this.showToast('Returned to general tutoring');
        } catch (err) {
            console.error('[CourseManager] Failed to exit course:', err);
        }
    }

    // --------------------------------------------------
    // Drop Course (unenroll — pauses the course session)
    // --------------------------------------------------
    async dropCourse(sessionId) {
        const session = this.courseSessions.find(s => s._id === sessionId);
        const name = session?.courseName || 'this course';

        if (!confirm(`Drop "${name}"?\n\nYour progress will be saved and you can re-enroll later.`)) {
            return;
        }

        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/drop`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) {
                alert(data.message || 'Failed to drop course');
                return;
            }

            // If this was the active course, hide the progress bar
            if (this.activeCourseSessionId === sessionId) {
                const wrapper = document.getElementById('course-progress-wrapper');
                if (wrapper) wrapper.style.display = 'none';
                this.activeCourseSessionId = null;
                this.closeProgressDropdown();
            }

            // Refresh sidebar courses
            await this.loadMySessions();

            this.showToast(`Dropped ${name}`);
        } catch (err) {
            console.error('[CourseManager] Failed to drop course:', err);
            alert('Something went wrong. Please try again.');
        }
    }

    // --------------------------------------------------
    // Next Lesson (placeholder — advances module scaffold)
    // --------------------------------------------------
    onNextLesson() {
        // Prompt the AI to move on by injecting text and triggering send
        const input = document.getElementById('user-input');
        if (input) {
            input.textContent = "I'm ready for the next lesson!";
            input.focus();
            // Trigger submit via the send button
            const sendBtn = document.getElementById('send-button');
            if (sendBtn) sendBtn.click();
        }
        this.closeProgressDropdown();
    }

    // --------------------------------------------------
    // Welcome splash (shown in chat after enrollment)
    // --------------------------------------------------
    showWelcomeSplash(welcome, isResume = false) {
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const splash = document.createElement('div');
        splash.className = 'course-welcome-splash';
        splash.style.cssText = `
            margin: 20px auto; max-width: 520px; border-radius: 16px; overflow: hidden;
            box-shadow: 0 4px 20px rgba(102,126,234,0.15); animation: catalogSlideIn 0.4s ease;
        `;

        // Build unit list (first 6)
        const units = (welcome.units || []);
        const unitListHtml = units.map((u, i) =>
            `<div style="display:flex; align-items:center; gap:8px; padding:6px 0;">
                <div style="width:24px; height:24px; border-radius:50%; background:${i === 0 ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#e2e8f0'}; color:${i === 0 ? 'white' : '#888'}; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">${i + 1}</div>
                <span style="font-size:13px; color:${i === 0 ? '#333' : '#666'}; font-weight:${i === 0 ? '600' : '400'};">${this.escapeHtml(u)}</span>
            </div>`
        ).join('');

        // Course mini-tour tips (shown below the learning path for first-time enrollees)
        const courseTipsHtml = isResume ? '' : `
            <div class="course-tips" style="margin-top:16px; border-top:1px solid #f0f0f0; padding-top:14px;">
                <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#667eea; letter-spacing:0.05em; margin-bottom:10px;">
                    <i class="fas fa-lightbulb" style="margin-right:4px;"></i> How Courses Work
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">1</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">Your tutor leads the lesson</div>
                            <div style="font-size:12px; color:#777;">No need to pick a topic &mdash; your AI tutor teaches concepts, walks through examples, then gives you practice problems.</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">2</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">Progress bar tracks your journey</div>
                            <div style="font-size:12px; color:#777;">The bar at the top shows your current module and step. Click it to see all modules and your overall progress.</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">3</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">You advance by showing mastery</div>
                            <div style="font-size:12px; color:#777;">Solve practice problems correctly and your tutor will move you to the next step automatically. No rushing &mdash; go at your own pace.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        splash.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 24px; color: white; text-align: center;">
                <div style="font-size: 36px; margin-bottom: 8px;">${isResume ? '👋' : '🎓'}</div>
                <h2 style="margin: 0 0 4px; font-size: 20px; font-weight: 700;">${isResume ? 'Welcome Back!' : 'Welcome to'} ${this.escapeHtml(welcome.courseName)}</h2>
                <p style="margin: 0; opacity: 0.9; font-size: 13px;">${welcome.moduleCount} modules · Self-paced · AI-guided</p>
            </div>
            <div style="padding: 20px; background: white;">
                ${welcome.overview ? `<p style="font-size: 13px; color: #555; margin: 0 0 16px; line-height: 1.5;">${this.escapeHtml(welcome.overview)}</p>` : ''}
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.05em; margin-bottom: 8px;">Your Learning Path</div>
                ${unitListHtml}
                ${units.length < welcome.moduleCount ? `<div style="font-size: 12px; color: #aaa; padding: 4px 0 0 32px;">+${welcome.moduleCount - units.length} more modules</div>` : ''}
                ${courseTipsHtml}
                <button onclick="this.closest('.course-welcome-splash').remove()" style="
                    margin-top: 16px; width: 100%; padding: 12px; border: none; border-radius: 10px;
                    background: linear-gradient(135deg, #667eea, #764ba2); color: white;
                    font-weight: 700; font-size: 14px; cursor: pointer;
                "><i class="fas fa-play" style="margin-right: 6px;"></i>${isResume ? 'Continue Learning' : `Start ${this.escapeHtml(welcome.firstModuleTitle)}`}</button>
            </div>
        `;

        chatBox.appendChild(splash);
        splash.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --------------------------------------------------
    // Utilities
    // --------------------------------------------------
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: #333; color: white; padding: 12px 24px; border-radius: 10px;
            font-size: 14px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: fadeInUp 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Auto-initialise after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.courseManager = new CourseManager();
});

console.log('[CourseManager] Module loaded');
