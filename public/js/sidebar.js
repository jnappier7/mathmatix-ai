// ============================================
// COLLAPSIBLE SIDEBAR
// Modern sidebar with tools, leaderboard, progress
// Enhanced with session management features
// ============================================

class Sidebar {
    constructor() {
        this.isOpen = true; // Start open on desktop
        this.sidebar = null;
        this.toggle = null;
        this.sessionsExpanded = true;
        this.toolsExpanded = false;
        this.activeConversationId = null;
        this.conversations = []; // Cache for search
        this.searchTimeout = null;

        console.log('📂 Sidebar initializing...');
        this.init();
    }

    /**
     * Format a timestamp as relative time (e.g., "2 hours ago", "Yesterday")
     */
    formatRelativeTime(date) {
        if (!date) return '';

        const now = new Date();
        const then = new Date(date);
        const diffMs = now - then;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

        // Format as date for older sessions
        return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    init() {
        this.sidebar = document.getElementById('app-sidebar');
        this.toggle = document.getElementById('sidebar-toggle');

        if (!this.sidebar || !this.toggle) {
            console.error('[Sidebar] Sidebar elements not found');
            return;
        }

        // Set initial state based on screen size
        if (window.innerWidth < 768) {
            this.isOpen = false;
            this.sidebar.classList.add('collapsed');
            const wrapper = document.getElementById('app-layout-wrapper');
            if (wrapper) {
                wrapper.classList.add('sidebar-collapsed');
            }
        }

        // Toggle button click
        this.toggle.addEventListener('click', () => this.toggleSidebar());

        // Close sidebar when clicking outside on mobile
        if (window.innerWidth < 768) {
            document.addEventListener('click', (e) => {
                if (this.isOpen &&
                    !this.sidebar.contains(e.target) &&
                    !this.toggle.contains(e.target)) {
                    this.toggleSidebar();
                }
            });
        }

        // Sessions expand/collapse
        const sessionsToggle = document.querySelector('.sessions-toggle');
        const sessionsContent = document.getElementById('sidebar-sessions');
        if (sessionsToggle && sessionsContent) {
            sessionsToggle.addEventListener('click', () => this.toggleSessions());
            // Start expanded
            sessionsContent.classList.add('expanded');
            sessionsToggle.classList.add('expanded');
        }

        // Tools expand/collapse (collapsed by default to reduce clutter)
        const toolsToggle = document.querySelector('.tools-toggle');
        const toolsContent = document.getElementById('sidebar-tools');
        if (toolsToggle && toolsContent) {
            toolsToggle.addEventListener('click', () => this.toggleTools());
        }


        // New session button
        const newSessionBtn = document.getElementById('new-session-btn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => this.createNewSession());
        }

        // Session search input
        const searchInput = document.getElementById('session-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchSessions(e.target.value);
            });

            // Clear search on escape
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.renderSessions(this.conversations);
                }
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.session-actions')) {
                document.querySelectorAll('.session-dropdown.show').forEach(d => d.classList.remove('show'));
            }
        });

        // Tool button handlers
        this.setupToolHandlers();

        // Load sessions
        this.loadSessions();


        // Load progress data
        this.loadProgress();

        // Pi Day button — show/hide based on date, scroll to quests on click
        this.initPiDayButton();

        console.log('✅ Sidebar ready');
    }

    initPiDayButton() {
        const piSection = document.getElementById('sidebar-pi-day-section');
        const piBtn = document.getElementById('sidebar-pi-day-btn');
        if (!piSection || !piBtn) return;

        // Check if it's Pi Day via the quests API flag
        fetch('/api/daily-quests')
            .then(r => r.json())
            .then(data => {
                if (data.piDay) {
                    piSection.style.display = '';
                }
            })
            .catch(() => {});

        // Open Pi Day hub panel on click
        piBtn.addEventListener('click', () => this.openPiDayHub());

        // Close hub panel
        const closeBtn = document.getElementById('pi-day-hub-close');
        const backdrop = document.getElementById('pi-day-hub-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closePiDayHub());
        if (backdrop) backdrop.addEventListener('click', () => this.closePiDayHub());
    }

    async openPiDayHub() {
        const hub = document.getElementById('pi-day-hub');
        if (!hub) return;
        hub.style.display = '';

        // Load quests
        try {
            const questRes = await fetch('/api/daily-quests');
            const questData = await questRes.json();
            const questsEl = document.getElementById('pi-hub-quests');
            if (questData.success && questData.quests) {
                questsEl.innerHTML = questData.quests.map(q => {
                    const pct = Math.min((q.progress / q.targetCount) * 100, 100);
                    return `<div class="pi-hub-quest-item">
                        <span class="quest-icon">${q.icon}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${q.name}</div>
                            <div style="font-size:11px;color:#888;">${q.description}</div>
                            <div style="height:4px;background:#eee;border-radius:2px;margin-top:4px;">
                                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ff6b9d,#c850c0);border-radius:2px;"></div>
                            </div>
                        </div>
                        <span class="quest-xp">${q.completed ? '\u2705' : `+${Math.round(q.xpReward * (q.bonusMultiplier || 1))} XP`}</span>
                    </div>`;
                }).join('');
            }
        } catch (e) { console.error('Pi hub quests:', e); }

        // Load mini-lessons
        try {
            const lessonRes = await fetch('/api/daily-quests/pi-day-lessons');
            const lessonData = await lessonRes.json();
            const lessonsEl = document.getElementById('pi-hub-lessons');
            if (lessonData.success && lessonData.lessons && lessonData.lessons.length) {
                lessonsEl.innerHTML = lessonData.lessons.map(l => `
                    <button class="pi-hub-lesson-btn" data-prompt="${l.prompt.replace(/"/g, '&quot;')}">
                        <span style="font-size:18px;font-weight:900;">\u03C0</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${l.title}</div>
                            ${l.gradeBand !== 'all' ? `<div style="font-size:10px;color:#888;">Grades ${l.gradeBand}</div>` : ''}
                        </div>
                        <i class="fas fa-chevron-right" style="color:#ccc;font-size:11px;"></i>
                    </button>
                `).join('');
                // Attach click handlers
                lessonsEl.querySelectorAll('.pi-hub-lesson-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const prompt = btn.getAttribute('data-prompt');
                        this.closePiDayHub();
                        if (prompt && typeof window.sendMessage === 'function') {
                            window.sendMessage(prompt);
                        } else if (prompt) {
                            const input = document.getElementById('user-input') || document.getElementById('chat-input');
                            if (input) { input.value = prompt; input.focus(); input.dispatchEvent(new Event('input', { bubbles: true })); }
                        }
                    });
                });
            } else {
                lessonsEl.innerHTML = '<div style="font-size:12px;color:#888;">No lessons available.</div>';
            }
        } catch (e) { console.error('Pi hub lessons:', e); }

        // Load relevant courses (geometry, circle-related)
        try {
            const catRes = await fetch('/api/course-sessions/catalog');
            const catData = await catRes.json();
            const coursesEl = document.getElementById('pi-hub-courses');
            const courses = catData.catalog || catData.courses;
            if (catData.success && courses) {
                // Surface geometry + math courses that relate to circles/pi
                const piRelevant = ['geometry', '7th-grade-math', '6th-grade-math', 'grade-8-math', 'precalculus'];
                const matches = courses.filter(c => piRelevant.includes(c.courseId));
                if (matches.length) {
                    coursesEl.innerHTML = matches.map(c => `
                        <button class="pi-hub-course-btn" data-course-id="${c.courseId}">
                            <span class="course-icon">${c.icon || '\uD83D\uDCD0'}</span>
                            <div class="course-info">
                                <div class="course-name">${c.title || c.courseId}</div>
                                <div class="course-desc">${c.tagline || ''}</div>
                            </div>
                            <span style="font-size:10px;font-weight:700;color:#ff6b9d;background:rgba(255,107,157,0.12);padding:2px 7px;border-radius:10px;white-space:nowrap;">Free today!</span>
                        </button>
                    `).join('');
                    // Attach click handlers to enroll / open course
                    coursesEl.querySelectorAll('.pi-hub-course-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const courseId = btn.getAttribute('data-course-id');
                            this.closePiDayHub();
                            if (window.courseManager && typeof window.courseManager.enrollInCourse === 'function') {
                                window.courseManager.enrollInCourse(courseId, null);
                            } else {
                                // Fallback: open browse courses catalog
                                const browseBtn = document.getElementById('browse-courses-btn');
                                if (browseBtn) browseBtn.click();
                            }
                        });
                    });
                } else {
                    coursesEl.innerHTML = '<div style="font-size:12px;color:#888;">Browse all courses in the sidebar.</div>';
                }
            }
        } catch (e) { console.error('Pi hub courses:', e); }
    }

    closePiDayHub() {
        const hub = document.getElementById('pi-day-hub');
        if (hub) hub.style.display = 'none';
    }

    /**
     * Switch sidebar context between 'course' and 'general'.
     * In course mode, session list / leaderboard / quests are hidden
     * to reduce clutter — the student is focused on their course.
     */
    setContext(ctx) {
        if (!this.sidebar) return;
        if (ctx === 'course') {
            this.sidebar.classList.add('ctx-course');
        } else {
            this.sidebar.classList.remove('ctx-course');
        }
    }

    toggleSidebar() {
        this.isOpen = !this.isOpen;

        if (this.isOpen) {
            this.sidebar.classList.remove('collapsed');
            this.toggle.classList.add('sidebar-open');
            document.getElementById('app-layout-wrapper').classList.remove('sidebar-collapsed');
        } else {
            this.sidebar.classList.add('collapsed');
            this.toggle.classList.remove('sidebar-open');
            document.getElementById('app-layout-wrapper').classList.add('sidebar-collapsed');
        }
    }

    toggleSessions() {
        this.sessionsExpanded = !this.sessionsExpanded;

        const sessionsContent = document.getElementById('sidebar-sessions');
        const sessionsToggle = document.querySelector('.sessions-toggle');

        if (this.sessionsExpanded) {
            sessionsContent.classList.add('expanded');
            sessionsToggle.classList.add('expanded');
        } else {
            sessionsContent.classList.remove('expanded');
            sessionsToggle.classList.remove('expanded');
        }
    }

    toggleTools() {
        this.toolsExpanded = !this.toolsExpanded;

        const toolsContent = document.getElementById('sidebar-tools');
        const toolsToggle = document.querySelector('.tools-toggle');

        if (this.toolsExpanded) {
            toolsContent.classList.add('expanded');
            toolsToggle.classList.add('expanded');
        } else {
            toolsContent.classList.remove('expanded');
            toolsToggle.classList.remove('expanded');
        }
    }

    async loadSessions() {
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'GET',
                credentials: 'include'
            });

            const data = await response.json();

            // Track active conversation for sidebar highlighting only.
            // We no longer auto-restore sessions on page load — new logins
            // always start in general chat. Users resume via sidebar click.
            if (data.activeConversationId && !this.activeConversationId) {
                this.activeConversationId = data.activeConversationId;
                console.log('[Sidebar] Noted active conversation:', this.activeConversationId);
            }

            this.renderSessions(data.conversations);

            // Check if assessment is needed
            if (data.assessmentNeeded) {
                this.showAssessmentPrompt();
            }
        } catch (error) {
            console.error('[Sidebar] Failed to load sessions:', error);
        }
    }

    renderSessions(conversations) {
        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        // Cache conversations for search
        this.conversations = conversations;
        this._sessionsShowAll = false;

        // Clear existing
        sessionsList.innerHTML = '';

        // Filter out assessment/mastery conversations from the list
        const chatConversations = conversations.filter(c =>
            c.conversationType === 'general' || c.conversationType === 'topic'
        );

        // Separate pinned and regular sessions
        const pinnedSessions = chatConversations.filter(c => c.isPinned);
        const regularSessions = chatConversations.filter(c => !c.isPinned);

        // Add pinned sessions header if any exist
        if (pinnedSessions.length > 0) {
            const pinnedHeader = document.createElement('div');
            pinnedHeader.className = 'session-divider';
            pinnedHeader.innerHTML = '<span><i class="fas fa-thumbtack"></i> Pinned</span>';
            sessionsList.appendChild(pinnedHeader);

            pinnedSessions.forEach(conv => this.renderSessionItem(conv, sessionsList, true));
        }

        // Add regular sessions (show only 3 by default)
        if (regularSessions.length > 0) {
            if (pinnedSessions.length > 0) {
                const recentHeader = document.createElement('div');
                recentHeader.className = 'session-divider';
                recentHeader.innerHTML = '<span>Recent</span>';
                sessionsList.appendChild(recentHeader);
            }

            const defaultShow = 3;
            regularSessions.slice(0, defaultShow).forEach(conv => this.renderSessionItem(conv, sessionsList, false));

            // "See more" button if there are more than 3 regular sessions
            if (regularSessions.length > defaultShow) {
                const seeMoreBtn = document.createElement('button');
                seeMoreBtn.className = 'sidebar-see-all-btn sessions-see-more-btn';
                seeMoreBtn.textContent = `See ${regularSessions.length - defaultShow} more`;
                seeMoreBtn.addEventListener('click', () => this.toggleAllSessions());
                sessionsList.appendChild(seeMoreBtn);
            }
        }

        // Show empty state if no conversations
        if (chatConversations.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'session-empty-state';
            emptyState.innerHTML = `
                <span style="color: #888; font-size: 13px; padding: 12px; display: block; text-align: center;">
                    No chats yet. Click <strong>New Chat</strong> to start!
                </span>
            `;
            sessionsList.appendChild(emptyState);
        }
    }

    /**
     * Toggle between showing 3 sessions and all sessions
     */
    toggleAllSessions() {
        this._sessionsShowAll = !this._sessionsShowAll;

        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        sessionsList.innerHTML = '';

        const chatConversations = this.conversations.filter(c =>
            c.conversationType === 'general' || c.conversationType === 'topic'
        );
        const pinnedSessions = chatConversations.filter(c => c.isPinned);
        const regularSessions = chatConversations.filter(c => !c.isPinned);

        if (pinnedSessions.length > 0) {
            const pinnedHeader = document.createElement('div');
            pinnedHeader.className = 'session-divider';
            pinnedHeader.innerHTML = '<span><i class="fas fa-thumbtack"></i> Pinned</span>';
            sessionsList.appendChild(pinnedHeader);
            pinnedSessions.forEach(conv => this.renderSessionItem(conv, sessionsList, true));
        }

        if (regularSessions.length > 0) {
            if (pinnedSessions.length > 0) {
                const recentHeader = document.createElement('div');
                recentHeader.className = 'session-divider';
                recentHeader.innerHTML = '<span>Recent</span>';
                sessionsList.appendChild(recentHeader);
            }

            const defaultShow = 3;
            const showCount = this._sessionsShowAll ? regularSessions.length : defaultShow;
            regularSessions.slice(0, showCount).forEach(conv => this.renderSessionItem(conv, sessionsList, false));

            if (regularSessions.length > defaultShow) {
                const seeMoreBtn = document.createElement('button');
                seeMoreBtn.className = 'sidebar-see-all-btn sessions-see-more-btn';
                seeMoreBtn.textContent = this._sessionsShowAll ? 'Show less' : `See ${regularSessions.length - defaultShow} more`;
                seeMoreBtn.addEventListener('click', () => this.toggleAllSessions());
                sessionsList.appendChild(seeMoreBtn);
            }
        }
    }

    /**
     * Render a single session item
     */
    renderSessionItem(conv, container, isPinned) {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-item' + (this.activeConversationId === conv._id ? ' active' : '');
        sessionItem.dataset.conversationId = conv._id;

        // Format stats if available
        let statsHtml = '';
        if (conv.stats && conv.stats.problemsAttempted > 0) {
            const accuracy = conv.stats.problemsCorrect > 0
                ? Math.round((conv.stats.problemsCorrect / conv.stats.problemsAttempted) * 100)
                : 0;
            statsHtml = `<span class="session-stats">${accuracy}% accuracy</span>`;
        }

        sessionItem.innerHTML = `
            <div class="session-main">
                <span class="session-emoji">${conv.topicEmoji || '💬'}</span>
                <div class="session-info">
                    <div class="session-name-row">
                        ${isPinned ? '<i class="fas fa-thumbtack session-pin-icon"></i>' : ''}
                        <span class="session-name">${this.escapeHtml(conv.name)}</span>
                    </div>
                    ${conv.lastMessage ? `
                        <span class="session-preview">${this.escapeHtml(conv.lastMessage.content)}</span>
                    ` : '<span class="session-preview">No messages yet</span>'}
                    ${statsHtml}
                </div>
            </div>
            <div class="session-meta">
                <span class="session-time">${this.formatRelativeTime(conv.lastActivity)}</span>
                ${conv.messageCount > 0 ? `<span class="session-count">${conv.messageCount}</span>` : ''}
                <div class="session-actions">
                    <button class="session-action-btn session-menu-btn" title="More options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="session-dropdown">
                        <button class="session-dropdown-item" data-action="rename">
                            <i class="fas fa-edit"></i> Rename
                        </button>
                        <button class="session-dropdown-item" data-action="pin">
                            <i class="fas fa-thumbtack"></i> ${isPinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button class="session-dropdown-item session-dropdown-danger" data-action="delete">
                            <i class="fas fa-trash-alt"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Main click handler
        sessionItem.addEventListener('click', (e) => {
            if (!e.target.closest('.session-actions')) {
                this.switchSession(conv._id);
            }
        });

        // Menu button handler
        const menuBtn = sessionItem.querySelector('.session-menu-btn');
        const dropdown = sessionItem.querySelector('.session-dropdown');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.session-dropdown.show').forEach(d => d.classList.remove('show'));
            dropdown.classList.toggle('show');
        });

        // Dropdown action handlers
        dropdown.querySelectorAll('.session-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                const action = item.dataset.action;

                if (action === 'rename') {
                    this.renameSession(conv._id, conv.name);
                } else if (action === 'pin') {
                    this.togglePinSession(conv._id);
                } else if (action === 'delete') {
                    this.deleteSession(conv._id);
                }
            });
        });

        container.appendChild(sessionItem);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Rename a session
     */
    async renameSession(conversationId, currentName) {
        const newName = prompt('Enter a new name for this session:', currentName);
        if (!newName || newName.trim() === '' || newName === currentName) return;

        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to rename');
            }

            await this.loadSessions();
            console.log('[Sidebar] Session renamed successfully');
        } catch (error) {
            console.error('[Sidebar] Failed to rename session:', error);
            alert('Failed to rename session. Please try again.');
        }
    }

    /**
     * Toggle pin status for a session
     */
    async togglePinSession(conversationId) {
        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/pin`, {
                method: 'PATCH',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to update pin status');
            }

            await this.loadSessions();
            console.log('[Sidebar] Pin status toggled successfully');
        } catch (error) {
            console.error('[Sidebar] Failed to toggle pin:', error);
        }
    }

    /**
     * Search sessions
     */
    async searchSessions(query) {
        if (!query || query.trim() === '') {
            this.renderSessions(this.conversations);
            return;
        }

        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            try {
                const response = await window.csrfFetch(`/api/conversations/search?q=${encodeURIComponent(query)}`, {
                    method: 'GET',
                    credentials: 'include'
                });

                const data = await response.json();
                this.renderSearchResults(data.conversations, query);
            } catch (error) {
                console.error('[Sidebar] Search failed:', error);
            }
        }, 300);
    }

    /**
     * Render search results
     */
    renderSearchResults(results, query) {
        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        sessionsList.innerHTML = '';

        if (results.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'session-no-results';
            noResults.innerHTML = `<i class="fas fa-search"></i><span>No sessions found for "${this.escapeHtml(query)}"</span>`;
            sessionsList.appendChild(noResults);
            return;
        }

        results.forEach(conv => {
            this.renderSessionItem(conv, sessionsList, conv.isPinned);
        });
    }

    /**
     * Create a new blank session immediately (Claude-like UX)
     */
    async createNewSession() {
        console.log('[Sidebar] createNewSession called');
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                credentials: 'include'
            });

            const data = await response.json();
            await this.loadSessions();
            this.switchSession(data.conversation._id);
        } catch (error) {
            console.error('[Sidebar] Failed to create new session:', error);
        }
    }

    async switchSession(conversationId) {
        console.log('[Sidebar] switchSession called with:', conversationId);
        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/switch`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await response.json();
            console.log('[Sidebar] Switch response:', data);

            // Update active session in UI
            document.querySelectorAll('.session-item').forEach(item => {
                item.classList.remove('active');
            });

            const activeItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }

            // Update chat view
            console.log('[Sidebar] updateChatForSession available:', typeof window.updateChatForSession);
            if (window.updateChatForSession) {
                window.updateChatForSession(data.conversation, data.messages);
            } else {
                console.error('[Sidebar] window.updateChatForSession is not defined!');
                // Fallback: reload page to switch session
                window.location.reload();
            }

            this.activeConversationId = conversationId;
        } catch (error) {
            console.error('[Sidebar] Failed to switch session:', error);
        }
    }

    async deleteSession(conversationId) {
        if (!confirm('Delete this chat? This cannot be undone.')) {
            return;
        }

        try {
            const wasActive = this.activeConversationId === conversationId;

            await window.csrfFetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            // If we deleted the active chat, create a fresh session
            if (wasActive) {
                this.activeConversationId = null;
                await this.createNewSession();
            } else {
                await this.loadSessions();
            }
        } catch (error) {
            console.error('[Sidebar] Failed to delete session:', error);
        }
    }

    showAssessmentPrompt() {
        // Show a banner or notification that assessment is needed
        console.log('[Sidebar] Assessment needed - will show prompt in chat');
        if (window.showAssessmentPrompt) {
            window.showAssessmentPrompt();
        }
    }

    setupToolHandlers() {
        // Mastery Mode
        const masteryBtn = document.getElementById('sidebar-mastery-btn');
        if (masteryBtn) {
            masteryBtn.addEventListener('click', () => {
                const mainMasteryBtn = document.getElementById('mastery-mode-btn');
                if (mainMasteryBtn) mainMasteryBtn.click();
            });
        }

        // Resources
        const resourcesBtn = document.getElementById('sidebar-resources-btn');
        if (resourcesBtn) {
            resourcesBtn.addEventListener('click', () => {
                const mainResourcesBtn = document.getElementById('open-resources-modal-btn');
                if (mainResourcesBtn) mainResourcesBtn.click();
            });
        }

        // WHITEBOARD SHELVED FOR BETA
        // const whiteboardBtn = document.getElementById('sidebar-whiteboard-btn');
        // if (whiteboardBtn) {
        //     whiteboardBtn.addEventListener('click', () => {
        //         const mainWhiteboardBtn = document.getElementById('toggle-whiteboard-btn');
        //         if (mainWhiteboardBtn) mainWhiteboardBtn.click();
        //     });
        // }

        // Calculator
        const calculatorBtn = document.getElementById('sidebar-calculator-btn');
        if (calculatorBtn) {
            calculatorBtn.addEventListener('click', () => {
                const mainCalculatorBtn = document.getElementById('toggle-calculator-btn');
                if (mainCalculatorBtn) mainCalculatorBtn.click();
            });
        }

        // Upload Work
        const uploadBtn = document.getElementById('sidebar-upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                const mainUploadBtn = document.getElementById('camera-button');
                if (mainUploadBtn) mainUploadBtn.click();
            });
        }

        // ALGEBRA TILES SHELVED FOR BETA
        // const algebraBtn = document.getElementById('sidebar-algebra-btn');
        // if (algebraBtn) {
        //     algebraBtn.addEventListener('click', () => {
        //         const mainAlgebraBtn = document.getElementById('algebra-tiles-btn');
        //         if (mainAlgebraBtn) mainAlgebraBtn.click();
        //     });
        // }
    }

    async loadProgress() {
        // Fetch user data if window.currentUser isn't available yet
        // (script.js runs as ES module so its currentUser is module-scoped)
        let user = window.currentUser;
        if (!user) {
            try {
                const res = await fetch('/user', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    user = data.user;
                }
            } catch (e) {
                console.warn('Sidebar: could not fetch user for progress', e);
            }
        }
        if (!user) return;

        const level = user.level || 1;
        // xpForCurrentLevel and xpForNextLevel are computed by the backend
        // (set on page load via /user endpoint and updated after each chat response)
        const xp = user.xpForCurrentLevel || 0;
        const xpNeeded = user.xpForNextLevel || 100;
        const progress = (xp / xpNeeded) * 100;

        // Update sidebar progress
        const levelEl = document.getElementById('sidebar-level');
        const xpEl = document.getElementById('sidebar-xp');
        const progressBar = document.getElementById('sidebar-progress-fill');

        if (levelEl) levelEl.textContent = level;
        if (xpEl) xpEl.textContent = `${xp} / ${xpNeeded} XP`;
        if (progressBar) progressBar.style.width = `${Math.min(progress, 100)}%`;

        // Update mobile drawer progress
        const drawerLevelEl = document.getElementById('drawer-level');
        const drawerXpEl = document.getElementById('drawer-xp');
        const drawerProgressBar = document.getElementById('drawer-progress-fill');

        if (drawerLevelEl) drawerLevelEl.textContent = level;
        if (drawerXpEl) drawerXpEl.textContent = `${xp} / ${xpNeeded} XP`;
        if (drawerProgressBar) drawerProgressBar.style.width = `${Math.min(progress, 100)}%`;

        // Update mobile drawer quick stats (streak, total XP, total solved)
        const drawerStreak = document.getElementById('drawer-streak-count');
        const drawerTotalXp = document.getElementById('drawer-total-xp');
        const drawerTotalProblems = document.getElementById('drawer-total-problems');

        if (drawerStreak) drawerStreak.textContent = user.currentStreak || 0;
        if (drawerTotalXp) drawerTotalXp.textContent = user.xp || 0;
        if (drawerTotalProblems) drawerTotalProblems.textContent = user.totalProblemsCorrect || 0;

        // Update link code in drawer
        const drawerLinkCode = document.getElementById('drawer-student-link-code-value');
        const sidebarLinkCode = document.getElementById('student-link-code-value');
        if (drawerLinkCode && sidebarLinkCode) {
            drawerLinkCode.textContent = sidebarLinkCode.textContent;
            drawerLinkCode.onclick = sidebarLinkCode.onclick;
        }
    }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar();
});

console.log('📂 Sidebar module loaded');
