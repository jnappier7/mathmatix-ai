// ============================================
// COLLAPSIBLE SIDEBAR
// Modern sidebar with tools, leaderboard, progress
// ============================================

class Sidebar {
    constructor() {
        this.isOpen = true; // Start open on desktop
        this.sidebar = null;
        this.toggle = null;
        this.sessionsExpanded = true;
        this.toolsExpanded = true;
        this.leaderboardExpanded = false;
        this.activeConversationId = null;

        console.log('📂 Sidebar initializing...');
        this.init();
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
        }

        // Toggle button click
        this.toggle.addEventListener('click', () => this.toggleSidebar());

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

        // New topic button
        const newTopicBtn = document.getElementById('new-topic-btn');
        if (newTopicBtn) {
            newTopicBtn.addEventListener('click', () => this.createNewTopic());
        }

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

        // Clear existing (except general chat)
        sessionsList.innerHTML = '';

        // Add general chat (always first)
        const generalChat = document.createElement('button');
        generalChat.className = 'session-item active';
        generalChat.innerHTML = `
            <span class="session-emoji">💬</span>
            <span class="session-name">General Chat</span>
        `;
        generalChat.addEventListener('click', () => this.switchToGeneralChat());
        sessionsList.appendChild(generalChat);

        // Add topic-based conversations
        conversations.forEach(conv => {
            if (conv.conversationType === 'topic' && conv.topic) {
                const sessionItem = document.createElement('button');
                sessionItem.className = 'session-item';
                sessionItem.dataset.conversationId = conv._id;
                sessionItem.innerHTML = `
                    <span class="session-emoji">${conv.topicEmoji || '📚'}</span>
                    <span class="session-name">${conv.name}</span>
                    <button class="session-delete" title="Archive">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                sessionItem.addEventListener('click', (e) => {
                    if (!e.target.closest('.session-delete')) {
                        this.switchSession(conv._id);
                    }
                });

                const deleteBtn = sessionItem.querySelector('.session-delete');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.archiveSession(conv._id);
                });

                sessionsList.appendChild(sessionItem);
            }
        });
    }

    async createNewTopic() {
        const topic = prompt('Enter a topic name (e.g., "Fractions", "Algebra", "Geometry"):');
        if (!topic || topic.trim() === '') return;

        const emojiMap = {
            'fractions': '🍰',
            'algebra': '📐',
            'geometry': '📏',
            'calculus': '📊',
            'trigonometry': '📈',
            'statistics': '📊',
            'probability': '🎲',
            'word problems': '📝',
            'equations': '➕'
        };

        const topicLower = topic.toLowerCase();
        const topicEmoji = emojiMap[topicLower] || '📚';

        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, topicEmoji }),
                credentials: 'include'
            });

            const data = await response.json();
            await this.loadSessions(); // Reload to show new topic
            this.switchSession(data.conversation._id); // Switch to new topic
        } catch (error) {
            console.error('[Sidebar] Failed to create topic:', error);
            alert('Failed to create new topic. Please try again.');
        }
    }

    async switchSession(conversationId) {
        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/switch`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await response.json();

            // Update active session in UI
            document.querySelectorAll('.session-item').forEach(item => {
                item.classList.remove('active');
            });

            const activeItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }

            // Update chat view
            if (window.updateChatForSession) {
                window.updateChatForSession(data.conversation, data.messages);
            }

            this.activeConversationId = conversationId;
        } catch (error) {
            console.error('[Sidebar] Failed to switch session:', error);
        }
    }

    async switchToGeneralChat() {
        // Clear active conversation (will create new general conversation)
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'GET',
                credentials: 'include'
            });

            const data = await response.json();
            const generalConv = data.conversations.find(c => c.conversationType === 'general');

            if (generalConv) {
                this.switchSession(generalConv._id);
            } else {
                // Reload page to create new general conversation
                window.location.reload();
            }
        } catch (error) {
            console.error('[Sidebar] Failed to switch to general chat:', error);
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

        // Whiteboard
        const whiteboardBtn = document.getElementById('sidebar-whiteboard-btn');
        if (whiteboardBtn) {
            whiteboardBtn.addEventListener('click', () => {
                const mainWhiteboardBtn = document.getElementById('toggle-whiteboard-btn');
                if (mainWhiteboardBtn) mainWhiteboardBtn.click();
            });
        }

        // Calculator
        const calculatorBtn = document.getElementById('sidebar-calculator-btn');
        if (calculatorBtn) {
            calculatorBtn.addEventListener('click', () => {
                const mainCalculatorBtn = document.getElementById('toggle-calculator-btn');
                if (mainCalculatorBtn) mainCalculatorBtn.click();
            });
        }

        // Graphing Calculator
        const graphingBtn = document.getElementById('sidebar-graphing-btn');
        if (graphingBtn) {
            graphingBtn.addEventListener('click', () => {
                const mainGraphingBtn = document.getElementById('open-graphing-calc-btn');
                if (mainGraphingBtn) mainGraphingBtn.click();
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

        // Algebra Tiles
        const algebraBtn = document.getElementById('sidebar-algebra-btn');
        if (algebraBtn) {
            algebraBtn.addEventListener('click', () => {
                const mainAlgebraBtn = document.getElementById('algebra-tiles-btn');
                if (mainAlgebraBtn) mainAlgebraBtn.click();
            });
        }
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
            this.renderLeaderboard(data.leaderboard || []);
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
                    ${student.firstName || 'Student'}
                </td>
                <td>L${student.level || 1}</td>
                <td>${student.totalXp || 0}</td>
            `;
            tbody.appendChild(row);
        });
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
    }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar();
});

console.log('📂 Sidebar module loaded');
