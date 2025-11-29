// public/js/teacher-live-feed.js
// Live Activity Feed for Teacher Dashboard

class TeacherLiveFeed {
    constructor() {
        this.activityFeedDiv = document.getElementById("activity-feed");
        this.refreshBtn = document.getElementById("refresh-feed-btn");
        this.pauseBtn = document.getElementById("pause-feed-btn");
        this.filterButtons = document.querySelectorAll('.filter-btn');

        this.isPaused = false;
        this.currentFilter = 'all';
        this.pollInterval = null;
        this.POLL_INTERVAL_MS = 30000; // 30 seconds

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startPolling();
        this.fetchLiveFeed(); // Initial load
    }

    setupEventListeners() {
        // Refresh button
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => {
                const icon = this.refreshBtn.querySelector('i');
                if (icon) icon.classList.add('fa-spin');
                this.fetchLiveFeed().finally(() => {
                    const icon = this.refreshBtn.querySelector('i');
                    if (icon) icon.classList.remove('fa-spin');
                });
            });
        }

        // Pause/Resume button
        if (this.pauseBtn) {
            this.pauseBtn.addEventListener('click', () => this.togglePause());
        }

        // Filter buttons
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.renderFeed(this.cachedFeed);
            });
        });
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const icon = this.pauseBtn.querySelector('i');

        if (this.isPaused) {
            this.stopPolling();
            if (icon) {
                icon.classList.remove('fa-pause');
                icon.classList.add('fa-play');
            }
            this.pauseBtn.title = 'Resume Updates';
            this.pauseBtn.classList.add('active');
        } else {
            this.startPolling();
            if (icon) {
                icon.classList.remove('fa-play');
                icon.classList.add('fa-pause');
            }
            this.pauseBtn.title = 'Pause Updates';
            this.pauseBtn.classList.remove('active');
        }
    }

    startPolling() {
        if (this.pollInterval) return;
        this.pollInterval = setInterval(() => {
            if (!this.isPaused) {
                this.fetchLiveFeed();
            }
        }, this.POLL_INTERVAL_MS);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    async fetchLiveFeed() {
        try {
            const response = await fetch('/api/teacher/live-feed', {
                credentials: 'include'
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    window.location.href = '/login.html';
                    return;
                }
                throw new Error('Failed to fetch live feed');
            }

            const feed = await response.json();
            this.cachedFeed = feed;
            this.renderFeed(feed);
        } catch (error) {
            console.error('Error fetching live feed:', error);
            this.showError('Unable to load activity feed. Retrying...');
        }
    }

    renderFeed(feed) {
        if (!feed || feed.length === 0) {
            this.showEmptyState();
            return;
        }

        // Apply filter
        let filteredFeed = feed;
        if (this.currentFilter === 'struggling') {
            filteredFeed = feed.filter(item => item.isStruggling);
        } else if (this.currentFilter === 'milestones') {
            filteredFeed = feed.filter(item =>
                item.alerts && item.alerts.some(a => a.type === 'milestone')
            );
        }

        if (filteredFeed.length === 0) {
            this.showEmptyState(`No ${this.currentFilter} activity`);
            return;
        }

        this.activityFeedDiv.innerHTML = filteredFeed.map(item => this.renderActivityItem(item)).join('');

        // Add click handlers for expanding alerts
        this.activityFeedDiv.querySelectorAll('.activity-item').forEach(el => {
            el.addEventListener('click', (e) => {
                // Don't expand if clicking on acknowledge button
                if (e.target.classList.contains('acknowledge-btn') || e.target.closest('.acknowledge-btn')) {
                    return;
                }
                this.toggleAlertDetails(el);
            });
        });

        // Add acknowledge button handlers
        this.activityFeedDiv.querySelectorAll('.acknowledge-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const conversationId = btn.dataset.conversationId;
                const alertIndex = btn.dataset.alertIndex;
                await this.acknowledgeAlert(conversationId, alertIndex);
            });
        });
    }

    renderActivityItem(item) {
        const duration = Math.floor(item.duration || 0);
        const accuracy = item.problemsAttempted > 0
            ? Math.round((item.problemsCorrect / item.problemsAttempted) * 100)
            : 0;

        // Determine alert class
        let alertClass = '';
        if (item.severity === 'high') {
            alertClass = 'alert-high';
        } else if (item.isStruggling) {
            alertClass = 'struggling';
        } else if (item.alerts && item.alerts.some(a => a.type === 'milestone')) {
            alertClass = 'milestone';
        }

        // Time ago
        const timeAgo = this.formatTimeAgo(new Date(item.lastActivity));

        // Unacknowledged alerts
        const unacknowledgedAlerts = item.alerts
            ? item.alerts.filter(a => !a.acknowledged).length
            : 0;

        return `
            <div class="activity-item ${alertClass}" data-student-id="${item.studentId}" data-conversation-id="${item.conversationId}">
                <div class="activity-header">
                    <div>
                        <span class="status-dot active"></span>
                        <span class="student-name">${item.studentName}</span>
                        ${unacknowledgedAlerts > 0 ? `<span class="alert-badge">${unacknowledgedAlerts}</span>` : ''}
                    </div>
                    <span class="activity-time">${timeAgo}</span>
                </div>

                <div class="activity-summary">
                    ${item.liveSummary || 'Active session in progress...'}
                </div>

                <div class="activity-meta">
                    ${item.currentTopic ? `<span class="meta-badge topic"><i class="fas fa-book"></i> ${item.currentTopic}</span>` : ''}
                    ${item.problemsAttempted > 0 ? `<span class="meta-badge problems">${item.problemsCorrect}/${item.problemsAttempted} correct</span>` : ''}
                    ${accuracy > 0 ? `<span class="meta-badge accuracy"><i class="fas fa-check-circle"></i> ${accuracy}%</span>` : ''}
                    ${item.isStruggling && item.strugglingWith ? `<span class="meta-badge struggling"><i class="fas fa-exclamation-triangle"></i> ${item.strugglingWith}</span>` : ''}
                    <span class="meta-badge"><i class="fas fa-clock"></i> ${duration} min</span>
                </div>

                ${this.renderAlertDetails(item)}
            </div>
        `;
    }

    renderAlertDetails(item) {
        if (!item.alerts || item.alerts.length === 0) {
            return '';
        }

        const alertsHTML = item.alerts.map((alert, index) => {
            const alertTypeIcon = alert.type === 'struggle' ? 'fa-exclamation-triangle' :
                                 alert.type === 'milestone' ? 'fa-trophy' :
                                 alert.type === 'extended-session' ? 'fa-clock' :
                                 'fa-info-circle';

            const alertTypeClass = alert.type === 'struggle' ? 'alert-struggle' :
                                   alert.type === 'milestone' ? 'alert-milestone' :
                                   'alert-info';

            return `
                <div class="alert-detail-item ${alertTypeClass} ${alert.acknowledged ? 'acknowledged' : ''}">
                    <div class="alert-content">
                        <i class="fas ${alertTypeIcon}"></i>
                        <span>${alert.message}</span>
                    </div>
                    ${!alert.acknowledged ? `
                        <button class="acknowledge-btn btn btn-sm btn-secondary"
                                data-conversation-id="${item.conversationId}"
                                data-alert-index="${index}">
                            <i class="fas fa-check"></i> Acknowledge
                        </button>
                    ` : `
                        <span class="acknowledged-label"><i class="fas fa-check-circle"></i> Acknowledged</span>
                    `}
                </div>
            `;
        }).join('');

        return `
            <div class="alert-details" style="display: none;">
                <div class="alert-details-header">
                    <strong><i class="fas fa-bell"></i> Alerts</strong>
                </div>
                ${alertsHTML}
            </div>
        `;
    }

    toggleAlertDetails(activityElement) {
        const alertDetails = activityElement.querySelector('.alert-details');
        if (!alertDetails) return;

        const isExpanded = alertDetails.style.display !== 'none';
        alertDetails.style.display = isExpanded ? 'none' : 'block';
        activityElement.classList.toggle('expanded', !isExpanded);
    }

    async acknowledgeAlert(conversationId, alertIndex) {
        try {
            const response = await fetch(`/api/teacher/alerts/${conversationId}/${alertIndex}/acknowledge`, {
                method: 'POST',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to acknowledge alert');
            }

            // Refresh the feed to show updated acknowledgment status
            await this.fetchLiveFeed();

        } catch (error) {
            console.error('Error acknowledging alert:', error);
            alert('Failed to acknowledge alert. Please try again.');
        }
    }

    formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 120) return '1 min ago';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
        if (seconds < 7200) return '1 hour ago';
        return `${Math.floor(seconds / 3600)} hours ago`;
    }

    showEmptyState(message = 'No active sessions') {
        this.activityFeedDiv.innerHTML = `
            <div class="feed-empty-state">
                <i class="fas fa-inbox"></i>
                <p>${message}</p>
            </div>
        `;
    }

    showError(message) {
        this.activityFeedDiv.innerHTML = `
            <div class="feed-empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>${message}</p>
            </div>
        `;
    }

    showStudentDetails(studentId) {
        // Trigger the existing "View History" functionality
        const viewHistoryBtn = document.querySelector(`[data-student-id="${studentId}"].view-history-btn`);
        if (viewHistoryBtn) {
            viewHistoryBtn.click();
        }
    }

    destroy() {
        this.stopPolling();
    }
}

// Initialize when DOM is ready
let liveFeed;
document.addEventListener('DOMContentLoaded', () => {
    liveFeed = new TeacherLiveFeed();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (liveFeed) {
        liveFeed.destroy();
    }
});
