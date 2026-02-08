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
        this.toolsExpanded = true;
        this.leaderboardExpanded = false;
        this.questsExpanded = false;
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

        // Tools expand/collapse
        const toolsToggle = document.querySelector('.tools-toggle');
        const toolsContent = document.getElementById('sidebar-tools');
        if (toolsToggle && toolsContent) {
            toolsToggle.addEventListener('click', () => this.toggleTools());
            // Start expanded
            toolsContent.classList.add('expanded');
            toolsToggle.classList.add('expanded');
        }

        // Leaderboard expand/collapse
        const leaderboardToggle = document.querySelector('.leaderboard-toggle');
        if (leaderboardToggle) {
            leaderboardToggle.addEventListener('click', () => this.toggleLeaderboard());
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

        // Load leaderboard data
        this.loadLeaderboard();

        // Load progress data
        this.loadProgress();

        console.log('✅ Sidebar ready');
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

    toggleLeaderboard() {
        this.leaderboardExpanded = !this.leaderboardExpanded;

        const leaderboardContent = document.getElementById('sidebar-leaderboard');
        const leaderboardToggle = document.querySelector('.leaderboard-toggle');

        if (this.leaderboardExpanded) {
            leaderboardContent.classList.add('expanded');
            leaderboardToggle.classList.add('expanded');
        } else {
            leaderboardContent.classList.remove('expanded');
            leaderboardToggle.classList.remove('expanded');
        }
    }

    async loadSessions() {
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'GET',
                credentials: 'include'
            });

            const data = await response.json();

            // Restore active conversation ID from server
            if (data.activeConversationId && !this.activeConversationId) {
                this.activeConversationId = data.activeConversationId;
                console.log('[Sidebar] Restored active conversation:', this.activeConversationId);

                // Store pending session data for script.js to load when ready
                // This avoids race condition where updateChatForSession may not exist yet
                window.pendingActiveSession = {
                    conversationId: data.activeConversationId,
                    conversation: data.conversations.find(c => c._id === data.activeConversationId)
                };
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

        // Add regular sessions
        if (regularSessions.length > 0) {
            if (pinnedSessions.length > 0) {
                const recentHeader = document.createElement('div');
                recentHeader.className = 'session-divider';
                recentHeader.innerHTML = '<span>Recent</span>';
                sessionsList.appendChild(recentHeader);
            }

            regularSessions.forEach(conv => this.renderSessionItem(conv, sessionsList, false));
        }

        // Show empty state if no conversations
        if (chatConversations.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'session-empty-state';
            emptyState.innerHTML = `
                <span style="color: #888; font-size: 13px; padding: 12px; display: block; text-align: center;">
                    No sessions yet. Click <strong>New Session</strong> to start!
                </span>
            `;
            sessionsList.appendChild(emptyState);
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
                        <button class="session-dropdown-item session-dropdown-danger" data-action="archive">
                            <i class="fas fa-archive"></i> Archive
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
                } else if (action === 'archive') {
                    this.archiveSession(conv._id);
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

    async archiveSession(conversationId) {
        if (!confirm('Archive this conversation? You can view it later in your history.')) {
            return;
        }

        try {
            await window.csrfFetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            await this.loadSessions(); // Reload sessions
        } catch (error) {
            console.error('[Sidebar] Failed to archive session:', error);
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

    async loadLeaderboard() {
        try {
            const response = await fetch('/api/leaderboard', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard');
            }

            const data = await response.json();
            // API returns array directly, or may be wrapped in { leaderboard: [...] }
            const leaderboard = Array.isArray(data) ? data : (data.leaderboard || []);
            this.renderLeaderboard(leaderboard);
        } catch (error) {
            console.error('[Sidebar] Error loading leaderboard:', error);
        }
    }

    renderLeaderboard(leaderboard) {
        const tbody = document.getElementById('sidebar-leaderboard-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        leaderboard.slice(0, 10).forEach((student, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-weight: 600;">#${index + 1}</td>
                <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${student.name || student.firstName || 'Student'}
                </td>
                <td>L${student.level || 1}</td>
                <td>${student.xp || student.totalXp || 0}</td>
            `;
            tbody.appendChild(row);
        });

        // Sync to mobile drawer
        const drawerTbody = document.getElementById('drawer-leaderboard-body');
        if (drawerTbody) {
            drawerTbody.innerHTML = tbody.innerHTML;
        }
    }

    async loadProgress() {
        if (!window.currentUser) return;

        const level = window.currentUser.level || 1;
        const xp = window.currentUser.totalXp || 0;
        const xpNeeded = window.currentUser.xpNeeded || 100;
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
