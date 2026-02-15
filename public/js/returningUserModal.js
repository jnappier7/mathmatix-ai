// ============================================
// RETURNING USER WELCOME MODAL
// Shows returning users a modal on login with
// options to resume course chats, start fresh
// sessions, or pick up recent conversations.
// ============================================

class ReturningUserModal {
    constructor() {
        this.modal = null;
        this.data = null;
        this.resolveChoice = null; // Promise resolver for the user's choice
    }

    /**
     * Check if user qualifies as returning and show modal if so.
     * Returns a promise that resolves with the user's choice:
     *   { action: 'new-general' }
     *   { action: 'new-course', courseSessionId: '...' }
     *   { action: 'resume-chat', conversationId: '...' }
     *   { action: 'resume-course', courseSessionId: '...', conversationId: '...' }
     *   { action: 'skip' } — if not a returning user
     */
    async show(currentUser) {
        try {
            const res = await window.csrfFetch('/api/conversations/returning-user-data', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();

            if (!data.isReturningUser) {
                return { action: 'skip' };
            }

            // Check if there's anything to show (courses or sessions with messages)
            const hasCourses = data.courses && data.courses.length > 0;
            const hasSessions = data.recentSessions && data.recentSessions.length > 0;

            if (!hasCourses && !hasSessions) {
                return { action: 'skip' };
            }

            this.data = data;
            return this.render(currentUser);
        } catch (err) {
            console.error('[ReturningUserModal] Failed to load data:', err);
            return { action: 'skip' };
        }
    }

    /**
     * Render the modal and return a promise for the user's choice.
     */
    render(currentUser) {
        return new Promise((resolve) => {
            this.resolveChoice = resolve;
            this.modal = document.getElementById('returning-user-modal');
            if (!this.modal) {
                resolve({ action: 'skip' });
                return;
            }

            // Set greeting
            const greeting = document.getElementById('returning-user-greeting');
            if (greeting) {
                const name = currentUser?.firstName || 'there';
                const hour = new Date().getHours();
                let timeGreeting = 'Hey';
                if (hour < 12) timeGreeting = 'Good morning';
                else if (hour >= 17) timeGreeting = 'Good evening';
                greeting.textContent = `${timeGreeting}, ${name}!`;
            }

            // Render courses
            this.renderCourses();

            // Render recent sessions
            this.renderSessions();

            // Wire up "Start Fresh Session" button
            const newBtn = document.getElementById('returning-new-general-btn');
            if (newBtn) {
                newBtn.addEventListener('click', () => {
                    this.close();
                    resolve({ action: 'new-general' });
                });
            }

            // Show modal
            this.modal.style.display = 'flex';
        });
    }

    renderCourses() {
        const section = document.getElementById('returning-user-courses');
        const list = document.getElementById('returning-courses-list');
        if (!section || !list) return;

        const courses = this.data.courses || [];
        if (courses.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = '';

        courses.forEach(course => {
            const card = document.createElement('div');
            card.className = 'returning-course-card';

            const statusLabel = course.status === 'paused' ? 'Paused' : course.currentModuleLabel || 'In Progress';

            card.innerHTML = `
                <div class="returning-course-header">
                    <div class="returning-course-icon">📘</div>
                    <div class="returning-course-info">
                        <div class="returning-course-name">${this.escapeHtml(course.courseName)}</div>
                        <div class="returning-course-meta">${this.escapeHtml(statusLabel)}</div>
                    </div>
                    <div class="returning-course-progress">
                        <div class="returning-course-progress-bar">
                            <div class="returning-course-progress-fill" style="width: ${course.overallProgress}%"></div>
                        </div>
                        <span class="returning-course-progress-pct">${course.overallProgress}%</span>
                    </div>
                </div>
                <div class="returning-course-body">
                    <div class="returning-course-actions">
                        <button class="returning-course-new-btn" data-session-id="${course.courseSessionId}">
                            <i class="fas fa-play"></i> New Lesson Session
                        </button>
                    </div>
                    <div class="returning-course-chats"></div>
                </div>
            `;

            // Wire up "New Lesson Session" button
            const newBtn = card.querySelector('.returning-course-new-btn');
            newBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
                this.resolveChoice({
                    action: 'new-course',
                    courseSessionId: course.courseSessionId
                });
            });

            // Add existing course chats
            const chatsContainer = card.querySelector('.returning-course-chats');
            if (course.conversations && course.conversations.length > 0) {
                const divider = document.createElement('div');
                divider.className = 'returning-chat-divider';
                divider.textContent = 'Or continue a chat:';
                chatsContainer.appendChild(divider);

                course.conversations.forEach(conv => {
                    const chatItem = this.createChatItem(conv, () => {
                        this.close();
                        this.resolveChoice({
                            action: 'resume-course',
                            courseSessionId: course.courseSessionId,
                            conversationId: conv._id
                        });
                    });
                    chatsContainer.appendChild(chatItem);
                });
            }

            list.appendChild(card);
        });
    }

    renderSessions() {
        const section = document.getElementById('returning-user-sessions');
        const list = document.getElementById('returning-sessions-list');
        if (!section || !list) return;

        const sessions = this.data.recentSessions || [];
        if (sessions.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = '';

        sessions.forEach(session => {
            const chatItem = this.createChatItem(
                {
                    _id: session._id,
                    name: session.name,
                    lastMessage: session.lastMessage,
                    lastActivity: session.lastActivity,
                    emoji: session.topicEmoji || '💬'
                },
                () => {
                    this.close();
                    this.resolveChoice({
                        action: 'resume-chat',
                        conversationId: session._id
                    });
                }
            );
            list.appendChild(chatItem);
        });
    }

    createChatItem(conv, onClick) {
        const item = document.createElement('div');
        item.className = 'returning-chat-item';

        item.innerHTML = `
            <span class="returning-chat-emoji">${conv.emoji || '📘'}</span>
            <div class="returning-chat-info">
                <div class="returning-chat-name">${this.escapeHtml(conv.name)}</div>
                ${conv.lastMessage ? `<div class="returning-chat-preview">${this.escapeHtml(conv.lastMessage)}</div>` : ''}
            </div>
            <span class="returning-chat-time">${this.formatRelativeTime(conv.lastActivity)}</span>
        `;

        item.addEventListener('click', onClick);
        return item;
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }

    formatRelativeTime(date) {
        if (!date) return '';
        const now = new Date();
        const then = new Date(date);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export as global
window.ReturningUserModal = ReturningUserModal;

console.log('[ReturningUserModal] Module loaded');
