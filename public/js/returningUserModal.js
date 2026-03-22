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
        this._sessionsShowAll = false;
    }

    /**
     * Check if user qualifies as returning and show modal if so.
     * Returns a promise that resolves with the user's choice:
     *   { action: 'new-general' }
     *   { action: 'new-course', courseSessionId: '...' }
     *   { action: 'resume-chat', conversationId: '...' }
     *   { action: 'browse-courses' }
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

            // Render smart resume hero
            this.renderHero();

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

            // Show modal using the is-visible class (matches other modals)
            this.modal.classList.add('is-visible');
        });
    }

    renderHero() {
        const section = document.getElementById('returning-hero-section');
        if (!section) return;

        const sessions = this.data.recentSessions || [];
        const courses = this.data.courses || [];
        const latestSession = sessions[0] || null;
        const latestCourse = courses[0] || null;

        if (!latestSession && !latestCourse) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        section.innerHTML = '';

        const label = document.createElement('div');
        label.className = 'returning-section-label';
        label.innerHTML = '<i class="fas fa-bolt"></i> Pick up where you left off';
        section.appendChild(label);

        // Primary: most recent tutoring session
        if (latestSession) {
            const card = document.createElement('div');
            card.className = 'returning-hero-card returning-hero-primary';
            card.innerHTML = `
                <span class="returning-hero-emoji">${latestSession.topicEmoji || '💬'}</span>
                <div class="returning-hero-info">
                    <div class="returning-hero-name">${this.escapeHtml(latestSession.name)}</div>
                    <div class="returning-hero-meta">${this.escapeHtml(latestSession.lastMessage || '')}</div>
                </div>
                <div class="returning-hero-action">
                    <span class="returning-hero-time">${this.formatRelativeTime(latestSession.lastActivity)}</span>
                    <i class="fas fa-arrow-right"></i>
                </div>
            `;
            card.addEventListener('click', () => {
                this.close();
                this.resolveChoice({
                    action: 'resume-chat',
                    conversationId: latestSession._id
                });
            });
            section.appendChild(card);
        }

        // Secondary: most recent course OR browse courses
        if (latestCourse) {
            const statusLabel = latestCourse.status === 'paused'
                ? 'Paused'
                : latestCourse.currentModuleLabel || 'In Progress';

            const card = document.createElement('div');
            card.className = 'returning-hero-card returning-hero-secondary';
            card.innerHTML = `
                <span class="returning-hero-emoji">📘</span>
                <div class="returning-hero-info">
                    <div class="returning-hero-name">${this.escapeHtml(latestCourse.courseName)}</div>
                    <div class="returning-hero-meta">${this.escapeHtml(statusLabel)} &middot; ${latestCourse.overallProgress}%</div>
                </div>
                <div class="returning-hero-action">
                    <i class="fas fa-arrow-right"></i>
                </div>
            `;
            card.addEventListener('click', () => {
                this.close();
                this.resolveChoice({
                    action: 'new-course',
                    courseSessionId: latestCourse.courseSessionId
                });
            });
            section.appendChild(card);
        } else {
            const card = document.createElement('div');
            card.className = 'returning-hero-card returning-hero-secondary';
            card.innerHTML = `
                <span class="returning-hero-emoji">📚</span>
                <div class="returning-hero-info">
                    <div class="returning-hero-name">Browse Courses</div>
                    <div class="returning-hero-meta">Explore structured lessons and curricula</div>
                </div>
                <div class="returning-hero-action">
                    <i class="fas fa-arrow-right"></i>
                </div>
            `;
            card.addEventListener('click', () => {
                this.close();
                this.resolveChoice({ action: 'browse-courses' });
            });
            section.appendChild(card);
        }
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
                        <div class="returning-course-meta">${this.escapeHtml(statusLabel)} &middot; ${course.overallProgress}%</div>
                    </div>
                    <div class="returning-course-progress">
                        <div class="returning-course-progress-bar">
                            <div class="returning-course-progress-fill" style="width: ${course.overallProgress}%"></div>
                        </div>
                    </div>
                    <button class="returning-course-continue-btn" data-session-id="${course.courseSessionId}">
                        <i class="fas fa-play"></i> Continue
                    </button>
                </div>
            `;

            // Wire up "Continue" button — starts a fresh conversation at current module
            const continueBtn = card.querySelector('.returning-course-continue-btn');
            continueBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
                this.resolveChoice({
                    action: 'new-course',
                    courseSessionId: course.courseSessionId
                });
            });

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

        const defaultShow = 3;
        const sessionsToShow = this._sessionsShowAll ? sessions : sessions.slice(0, defaultShow);

        sessionsToShow.forEach(session => {
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

        // "See more" / "Show less" toggle
        if (sessions.length > defaultShow) {
            const seeMoreBtn = document.createElement('button');
            seeMoreBtn.className = 'returning-see-more-btn';
            seeMoreBtn.textContent = this._sessionsShowAll
                ? 'Show less'
                : `See ${sessions.length - defaultShow} more`;
            seeMoreBtn.addEventListener('click', () => {
                this._sessionsShowAll = !this._sessionsShowAll;
                this.renderSessions();
            });
            list.appendChild(seeMoreBtn);
        }
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
            this.modal.classList.remove('is-visible');
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
