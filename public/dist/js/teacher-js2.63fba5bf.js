/* --- /js/auto-logout.js --- */
/**
 * AUTO-LOGOUT MANAGER
 *
 * Handles automatic logout in two scenarios:
 * 1. Inactivity timeout (30 minutes default)
 * 2. Manual logout button (handled elsewhere)
 *
 * The idle timeout continues to count even when the tab is hidden/minimized.
 * When the tab becomes visible again, we check if the timeout has already
 * elapsed and immediately log out if so.
 */

(function() {
  'use strict';

  // Configuration
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  const WARNING_BEFORE_LOGOUT = 2 * 60 * 1000; // Warn 2 minutes before logout
  const SESSION_KEY = 'mathmatix_tab_session_active';

  let inactivityTimer = null;
  let warningTimer = null;
  let warningShown = false;
  let lastActivityTime = Date.now(); // Track the actual wall-clock time of last activity

  /**
   * Perform logout - destroys server session via the CSRF-exempt endpoint
   */
  function performLogout() {
    // Clear ALL session storage (including tab session flag)
    if (window.StorageUtils) {
      StorageUtils.session.clear();
    } else {
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
      }
    }

    // Clear UI language cache so next user on shared device gets a clean state
    StorageUtils.local.removeItem('mathmatix_ui_lang');

    // Use the CSRF-exempt /api/session/end endpoint (sendBeacon can't send CSRF headers).
    // This endpoint destroys the express session on the server side.
    const payload = JSON.stringify({ reason: 'auto_logout', destroySession: true });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/session/end', blob);
  }

  /**
   * Show inactivity warning
   */
  function showInactivityWarning() {
    if (warningShown) return;
    warningShown = true;

    const remainingTime = Math.ceil(WARNING_BEFORE_LOGOUT / 60000);
    const shouldStay = confirm(
      `⚠️ Inactivity Detected\n\n` +
      `You will be logged out in ${remainingTime} minutes due to inactivity.\n\n` +
      `Click OK to stay logged in, or Cancel to logout now.`
    );

    if (shouldStay) {
      // User wants to stay - reset timers
      lastActivityTime = Date.now();
      resetInactivityTimer();
      warningShown = false;
    } else {
      // User chose to logout
      performLogout();
      window.location.href = '/login.html';
    }
  }

  /**
   * Reset inactivity timer
   */
  function resetInactivityTimer() {
    // Clear existing timers
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (warningTimer) clearTimeout(warningTimer);
    warningShown = false;
    lastActivityTime = Date.now();

    // Set warning timer (fires before logout)
    warningTimer = setTimeout(() => {
      showInactivityWarning();
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT);

    // Set logout timer (fires after full timeout)
    inactivityTimer = setTimeout(() => {
      console.log('[Auto-Logout] Session timed out due to inactivity');
      performLogout();
      alert('You have been logged out due to inactivity.');
      window.location.href = '/login.html';
    }, INACTIVITY_TIMEOUT);
  }

  /**
   * Mark tab session as active (set on every protected page load)
   */
  function activateTabSession() {
    if (window.StorageUtils) {
      StorageUtils.session.setItem(SESSION_KEY, 'true');
    } else {
      try {
        sessionStorage.setItem(SESSION_KEY, 'true');
      } catch (e) {
        console.warn('[Auto-Logout] Could not set sessionStorage:', e);
      }
    }
    console.log('[Auto-Logout] Tab session activated');
  }

  /**
   * Initialize auto-logout
   */
  function initialize() {
    // Skip if on login/signup pages (user not authenticated yet)
    const publicPages = ['/login.html', '/signup.html', '/index.html', '/privacy.html', '/terms.html'];
    const currentPage = window.location.pathname;

    if (publicPages.some(page => currentPage.endsWith(page))) {
      console.log('[Auto-Logout] Skipping - public page');
      return;
    }

    // Activate tab session (set flag in sessionStorage)
    activateTabSession();

    console.log('[Auto-Logout] Initialized with inactivity timeout');

    // 1. INACTIVITY TIMEOUT
    // Listen for user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Start the timer
    resetInactivityTimer();

    // 2. VISIBILITY CHANGE - check elapsed idle time when tab becomes visible again.
    // Timers are NOT paused when the tab is hidden; they continue running.
    // However, browsers may throttle setTimeout in background tabs, so when the
    // tab becomes visible we check if the timeout has already elapsed.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Tab just became visible - check how long user was actually idle
        const idleMs = Date.now() - lastActivityTime;

        if (idleMs >= INACTIVITY_TIMEOUT) {
          // Already past timeout - log out immediately
          console.log('[Auto-Logout] Tab returned after idle timeout elapsed');
          performLogout();
          window.location.href = '/login.html';
        } else if (idleMs >= INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT) {
          // In the warning window - show warning and restart timer for remaining time
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (warningTimer) clearTimeout(warningTimer);

          const remaining = INACTIVITY_TIMEOUT - idleMs;
          inactivityTimer = setTimeout(() => {
            console.log('[Auto-Logout] Session timed out due to inactivity');
            performLogout();
            alert('You have been logged out due to inactivity.');
            window.location.href = '/login.html';
          }, remaining);

          showInactivityWarning();
        }
        // If less than warning threshold, timers are still running correctly
      }
    });

    // 3. STORAGE EVENT (for cross-tab logout sync)
    // If user logs out in one tab, logout in all tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'logout-event') {
        console.log('[Auto-Logout] Logout detected in another tab');
        // Clear all session data
        if (window.StorageUtils) {
          StorageUtils.session.clear();
        } else {
          try {
            sessionStorage.clear();
          } catch (e) {
            console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
          }
        }
        window.location.href = '/login.html';
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Expose logout function globally for manual logout buttons
  window.triggerLogout = function() {
    // Set storage event to logout all tabs
    if (window.StorageUtils) {
      StorageUtils.local.setItem('logout-event', Date.now().toString());
      StorageUtils.local.removeItem('logout-event'); // Clean up
    } else {
      try {
        localStorage.setItem('logout-event', Date.now().toString());
        localStorage.removeItem('logout-event'); // Clean up
      } catch (e) {
        console.warn('[Auto-Logout] Could not access localStorage for cross-tab logout:', e);
      }
    }

    performLogout(); // This clears sessionStorage
    window.location.href = '/login.html';
  };

  // Expose session activation for login page
  window.activateTabSession = activateTabSession;

})();

;
/* --- /js/teacher-live-feed.js --- */
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

;
/* --- /js/teacher-live-monitor.js --- */
// public/js/teacher-live-monitor.js
// Teacher dashboard module for the Live Class Monitor tab.
// Renders a real-time grid of student statuses, violation badges,
// and a "spy" modal for observing individual students.

(function () {
  'use strict';

  let monitorState = {
    eventSource: null,
    currentClassId: null,
    isLocked: false,
    sessionId: null,
    students: [],
    spyModal: null,
    spyInterval: null,
    selectedStudentId: null
  };

  // ─── INITIALIZATION ─────────────────────────────────────────────────────────

  function initMonitorTab() {
    const monitorTab = document.getElementById('monitor-tab');
    if (!monitorTab) return;

    // Populate class selector
    populateClassSelector();

    // Bind control buttons
    const activateBtn = document.getElementById('monitor-activate-btn');
    const deactivateBtn = document.getElementById('monitor-deactivate-btn');
    const classSelect = document.getElementById('monitor-class-select');

    if (activateBtn) activateBtn.addEventListener('click', activateLock);
    if (deactivateBtn) deactivateBtn.addEventListener('click', deactivateLock);
    if (classSelect) classSelect.addEventListener('change', onClassChange);
  }

  async function populateClassSelector() {
    const select = document.getElementById('monitor-class-select');
    if (!select) return;

    try {
      const res = await csrfFetch('/api/teacher/classes');
      if (!res.ok) return;

      const classes = await res.json();
      select.innerHTML = '<option value="">-- Select a class --</option>';

      for (const cls of classes) {
        const opt = document.createElement('option');
        opt.value = cls._id;
        opt.textContent = `${cls.className} (${cls.enrolledStudents?.length || 0} students)`;
        select.appendChild(opt);
      }
    } catch (e) {
      console.error('[Monitor] Failed to load classes:', e);
    }
  }

  async function onClassChange() {
    const classId = document.getElementById('monitor-class-select')?.value;
    if (!classId) {
      stopStream();
      renderEmptyGrid();
      return;
    }

    monitorState.currentClassId = classId;

    // Check if there's an active lock session
    try {
      const res = await csrfFetch(`/api/browser-lock/status/${classId}`);
      const data = await res.json();
      monitorState.isLocked = data.locked;
      monitorState.sessionId = data.sessionId || null;
      updateLockControls();
    } catch (e) {
      console.error('[Monitor] Failed to check status:', e);
    }

    // Start live stream
    startStream(classId);
  }

  // ─── LOCK CONTROLS ────────────────────────────────────────────────────────

  async function activateLock() {
    const classId = monitorState.currentClassId;
    if (!classId) {
      showMonitorToast('Please select a class first.', 'warning');
      return;
    }

    // Gather settings from the UI
    const settings = {
      enforceFullscreen: document.getElementById('lock-enforce-fullscreen')?.checked || false,
      blockNavigation: document.getElementById('lock-block-navigation')?.checked !== false,
      trackTabSwitches: document.getElementById('lock-track-tabs')?.checked !== false,
      showWarningOnViolation: true,
      maxViolationsBeforeAlert: parseInt(document.getElementById('lock-max-violations')?.value) || 3,
      lockMessage: document.getElementById('lock-message')?.value || 'Your teacher has enabled focus mode. Please stay on this page.'
    };

    const sessionName = document.getElementById('lock-session-name')?.value || '';

    try {
      const res = await csrfFetch('/api/browser-lock/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, sessionName, settings })
      });

      const data = await res.json();
      if (data.success) {
        monitorState.isLocked = true;
        monitorState.sessionId = data.sessionId;
        updateLockControls();
        showMonitorToast(`Focus mode activated! ${data.studentCount} students affected.`, 'success');
      } else {
        showMonitorToast(data.message || 'Failed to activate.', 'error');
      }
    } catch (e) {
      showMonitorToast('Failed to activate focus mode.', 'error');
    }
  }

  async function deactivateLock() {
    try {
      const res = await csrfFetch('/api/browser-lock/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: monitorState.currentClassId,
          sessionId: monitorState.sessionId
        })
      });

      const data = await res.json();
      if (data.success) {
        monitorState.isLocked = false;
        monitorState.sessionId = null;
        updateLockControls();

        const summary = data.summary;
        showMonitorToast(
          `Focus mode ended. Duration: ${summary.duration}min, Violations: ${summary.totalViolations}`,
          'info'
        );
      }
    } catch (e) {
      showMonitorToast('Failed to deactivate.', 'error');
    }
  }

  function updateLockControls() {
    const activateBtn = document.getElementById('monitor-activate-btn');
    const deactivateBtn = document.getElementById('monitor-deactivate-btn');
    const lockStatus = document.getElementById('monitor-lock-status');
    const settingsPanel = document.getElementById('lock-settings-panel');

    if (activateBtn) activateBtn.style.display = monitorState.isLocked ? 'none' : '';
    if (deactivateBtn) deactivateBtn.style.display = monitorState.isLocked ? '' : 'none';
    if (lockStatus) {
      lockStatus.textContent = monitorState.isLocked ? 'FOCUS MODE ACTIVE' : 'Focus mode off';
      lockStatus.className = monitorState.isLocked
        ? 'monitor-lock-status active'
        : 'monitor-lock-status inactive';
    }
    if (settingsPanel) {
      settingsPanel.style.display = monitorState.isLocked ? 'none' : '';
    }
  }

  // ─── SSE LIVE STREAM ──────────────────────────────────────────────────────

  function startStream(classId) {
    stopStream();

    monitorState.eventSource = new EventSource(
      `/api/browser-lock/monitor/stream?classId=${encodeURIComponent(classId)}`
    );

    monitorState.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        monitorState.students = data.students || [];
        monitorState.isLocked = data.locked;
        monitorState.sessionId = data.sessionId || null;
        updateLockControls();
        renderStudentGrid(data);
      } catch (e) {
        console.error('[Monitor] Failed to parse SSE data:', e);
      }
    };

    monitorState.eventSource.onerror = () => {
      console.warn('[Monitor] SSE connection lost, will retry...');
    };
  }

  function stopStream() {
    if (monitorState.eventSource) {
      monitorState.eventSource.close();
      monitorState.eventSource = null;
    }
  }

  // ─── STUDENT GRID RENDERING ────────────────────────────────────────────────

  function renderStudentGrid(data) {
    const grid = document.getElementById('monitor-student-grid');
    if (!grid) return;

    const students = data.students || [];

    if (students.length === 0) {
      grid.innerHTML = `
        <div class="monitor-empty">
          <i class="fas fa-users-slash"></i>
          <p>No students enrolled in this class.</p>
        </div>
      `;
      return;
    }

    // Sort: active first, then by name
    const statusOrder = { active: 0, idle: 1, 'tab-away': 2, 'off-task': 3, disconnected: 4, offline: 5 };
    students.sort((a, b) => (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5)
      || a.name.localeCompare(b.name));

    grid.innerHTML = students.map(s => renderStudentCard(s)).join('');

    // Bind click handlers for spy mode
    grid.querySelectorAll('.monitor-student-card').forEach(card => {
      card.addEventListener('click', () => {
        const studentId = card.dataset.studentId;
        openSpyModal(studentId);
      });
    });

    // Update summary counters
    const activeCount = students.filter(s => s.status === 'active').length;
    const awayCount = students.filter(s => ['tab-away', 'off-task', 'window-blur'].includes(s.status)).length;
    const offlineCount = students.filter(s => ['disconnected', 'offline'].includes(s.status)).length;

    const counterEl = document.getElementById('monitor-counters');
    if (counterEl) {
      counterEl.innerHTML = `
        <span class="counter-chip active"><i class="fas fa-circle"></i> ${activeCount} Active</span>
        <span class="counter-chip away"><i class="fas fa-eye-slash"></i> ${awayCount} Away</span>
        <span class="counter-chip offline"><i class="fas fa-plug"></i> ${offlineCount} Offline</span>
        <span class="counter-chip violations"><i class="fas fa-exclamation-triangle"></i> ${data.totalViolations || 0} Violations</span>
      `;
    }
  }

  function renderStudentCard(student) {
    const statusIcons = {
      active: '<i class="fas fa-circle" style="color:#16C86D"></i>',
      idle: '<i class="fas fa-circle" style="color:#f39c12"></i>',
      'tab-away': '<i class="fas fa-eye-slash" style="color:#e74c3c"></i>',
      'off-task': '<i class="fas fa-exclamation-circle" style="color:#e74c3c"></i>',
      disconnected: '<i class="fas fa-plug" style="color:#95a5a6"></i>',
      offline: '<i class="fas fa-circle" style="color:#bdc3c7"></i>'
    };

    const statusLabels = {
      active: 'Active',
      idle: 'Idle',
      'tab-away': 'Tab Away',
      'off-task': 'Off Task',
      disconnected: 'Disconnected',
      offline: 'Offline'
    };

    const violationBadge = student.violationCount > 0
      ? `<span class="violation-badge ${student.violationCount >= 3 ? 'critical' : ''}">${student.violationCount}</span>`
      : '';

    const fullscreenIcon = student.isFullscreen
      ? '<i class="fas fa-expand" title="In fullscreen" style="color:#16C86D; margin-left:4px;"></i>'
      : '';

    const initials = student.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    return `
      <div class="monitor-student-card status-${student.status}" data-student-id="${student.studentId}" title="Click to view details">
        <div class="card-header">
          <div class="student-avatar">${initials}</div>
          <div class="student-info">
            <div class="student-name">${escapeHtml(student.name)} ${violationBadge} ${fullscreenIcon}</div>
            <div class="student-status">${statusIcons[student.status] || ''} ${statusLabels[student.status] || student.status}</div>
          </div>
        </div>
        <div class="card-body">
          ${student.currentActivity
            ? `<div class="activity-label"><i class="fas fa-book-open"></i> ${escapeHtml(student.currentActivity)}</div>`
            : '<div class="activity-label muted">No activity detected</div>'}
          ${student.lastMessagePreview
            ? `<div class="message-preview"><i class="fas fa-comment"></i> "${escapeHtml(student.lastMessagePreview.substring(0, 60))}${student.lastMessagePreview.length > 60 ? '...' : ''}"</div>`
            : ''}
          ${student.problemsAttempted > 0
            ? `<div class="progress-label"><i class="fas fa-check-circle"></i> ${student.problemsCorrect}/${student.problemsAttempted} problems</div>`
            : ''}
        </div>
        ${student.lastViolation
          ? `<div class="card-violation"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(student.lastViolation.type)} - ${timeAgo(student.lastViolation.timestamp)}</div>`
          : ''}
      </div>
    `;
  }

  function renderEmptyGrid() {
    const grid = document.getElementById('monitor-student-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="monitor-empty">
          <i class="fas fa-desktop"></i>
          <p>Select a class to start monitoring.</p>
        </div>
      `;
    }
  }

  // ─── SPY MODAL ─────────────────────────────────────────────────────────────

  async function openSpyModal(studentId) {
    monitorState.selectedStudentId = studentId;

    const modal = document.getElementById('spy-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    modal.querySelector('.spy-content').innerHTML = '<div class="spy-loading"><i class="fas fa-spinner fa-spin"></i> Loading student view...</div>';

    await refreshSpyData(studentId);

    // Auto-refresh every 5 seconds
    monitorState.spyInterval = setInterval(() => refreshSpyData(studentId), 5000);

    // Close button
    modal.querySelector('.spy-close')?.addEventListener('click', closeSpyModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSpyModal();
    });
  }

  function closeSpyModal() {
    const modal = document.getElementById('spy-modal');
    if (modal) modal.style.display = 'none';

    if (monitorState.spyInterval) {
      clearInterval(monitorState.spyInterval);
      monitorState.spyInterval = null;
    }
    monitorState.selectedStudentId = null;
  }

  async function refreshSpyData(studentId) {
    try {
      const res = await csrfFetch(`/api/browser-lock/monitor/spy/${studentId}`);
      if (!res.ok) return;

      const data = await res.json();
      renderSpyModal(data);
    } catch (e) {
      console.error('[Monitor] Failed to fetch spy data:', e);
    }
  }

  function renderSpyModal(data) {
    const content = document.querySelector('#spy-modal .spy-content');
    if (!content) return;

    const student = data.student;
    const status = data.status;
    const convo = data.conversation;
    const messages = data.recentMessages || [];
    const violations = data.violations || [];

    content.innerHTML = `
      <div class="spy-header">
        <div class="spy-student-info">
          <h3><i class="fas fa-user-graduate"></i> ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName || '')}</h3>
          <div class="spy-meta">
            <span><i class="fas fa-graduation-cap"></i> Grade ${escapeHtml(student.gradeLevel || 'N/A')}</span>
            <span><i class="fas fa-book"></i> ${escapeHtml(student.mathCourse || 'N/A')}</span>
            <span><i class="fas fa-star"></i> Level ${student.level || 1}</span>
          </div>
        </div>
        <div class="spy-status-badge status-${status.status || 'offline'}">
          ${status.status || 'offline'}
        </div>
      </div>

      ${convo ? `
        <div class="spy-session-info">
          <h4><i class="fas fa-comments"></i> Active Session</h4>
          <div class="spy-session-meta">
            <span><strong>Topic:</strong> ${escapeHtml(convo.topic || 'General')}</span>
            <span><strong>Duration:</strong> ${convo.duration || 0} min</span>
            <span><strong>Problems:</strong> ${convo.problemsCorrect || 0}/${convo.problemsAttempted || 0}</span>
          </div>
          ${convo.summary ? `<div class="spy-summary">${escapeHtml(convo.summary)}</div>` : ''}
        </div>
      ` : '<div class="spy-no-session"><i class="fas fa-info-circle"></i> No active tutoring session</div>'}

      <div class="spy-chat-feed">
        <h4><i class="fas fa-stream"></i> Live Chat Feed</h4>
        <div class="spy-messages">
          ${messages.length > 0 ? messages.map(m => `
            <div class="spy-message ${m.role}">
              <span class="spy-message-role">${m.role === 'user' ? '<i class="fas fa-user"></i> Student' : '<i class="fas fa-robot"></i> Tutor'}</span>
              <span class="spy-message-time">${formatTime(m.timestamp)}</span>
              <div class="spy-message-text">${escapeHtml(m.content)}</div>
            </div>
          `).join('') : '<div class="spy-empty">No messages yet in this session.</div>'}
        </div>
      </div>

      ${violations.length > 0 ? `
        <div class="spy-violations">
          <h4><i class="fas fa-exclamation-triangle"></i> Violations (${violations.length})</h4>
          <div class="spy-violations-list">
            ${violations.map(v => `
              <div class="spy-violation-item">
                <span class="violation-type">${escapeHtml(v.type)}</span>
                <span class="violation-time">${formatTime(v.timestamp)}</span>
                ${v.details ? `<span class="violation-detail">${escapeHtml(v.details)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const seconds = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function showMonitorToast(message, type) {
    const container = document.getElementById('monitor-toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = `monitor-toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i> ${escapeHtml(message)}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ─── INIT ON TAB ACTIVATION ────────────────────────────────────────────────

  // Lazy-load when the monitor tab is first clicked
  let monitorInitialized = false;

  document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      if (btn.dataset.tab === 'monitor') {
        btn.addEventListener('click', () => {
          if (!monitorInitialized) {
            monitorInitialized = true;
            initMonitorTab();
          }
        });
      }
    });
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopStream();
    if (monitorState.spyInterval) clearInterval(monitorState.spyInterval);
  });
})();

;
/* --- /js/teacher-dashboard.js?v=2.3 --- */
// public/js/teacher-dashboard.js
// 3X UX UPGRADE: Class-grouped students, unified profile modal, weekly comparison,
// smart alerts, mobile experience, quick wins

document.addEventListener("DOMContentLoaded", async () => {
    const studentListDiv = document.getElementById("student-list");
    const logoutBtn = document.getElementById("logoutBtn");

    // IEP Editor Elements
    const iepEditorModal = document.getElementById("iep-editor-modal");
    const iepStudentNameSpan = document.getElementById("iep-student-name");
    const currentIepStudentIdInput = document.getElementById("current-iep-student-id");
    const saveIepBtn = document.getElementById("save-iep-btn");
    const closeIepModalBtn = document.getElementById("close-iep-modal-btn");

    // Search and Filter Elements
    const studentSearchInput = document.getElementById("student-search");
    const studentFilterSelect = document.getElementById("student-filter");

    // IEP Form Elements
    const iepAccommodations = {
        extendedTime: document.getElementById("extendedTime"),
        reducedDistraction: document.getElementById("reducedDistraction"),
        calculatorAllowed: document.getElementById("calculatorAllowed"),
        audioReadAloud: document.getElementById("audioReadAloud"),
        chunkedAssignments: document.getElementById("chunkedAssignments"),
        breaksAsNeeded: document.getElementById("breaksAsNeeded"),
        digitalMultiplicationChart: document.getElementById("digitalMultiplicationChart"),
        largePrintHighContrast: document.getElementById("largePrintHighContrast"),
        mathAnxietySupport: document.getElementById("mathAnxietySupport")
    };
    const customAccommodationsInput = document.getElementById("customAccommodations");
    const readingLevelInput = document.getElementById("readingLevel");
    const preferredScaffoldsInput = document.getElementById("preferredScaffolds");
    const iepGoalsList = document.getElementById("iep-goals-list");
    const addIepGoalBtn = document.getElementById("add-iep-goal-btn");

    // Conversation History Elements
    const conversationHistoryModal = document.getElementById("conversation-history-modal");
    const historyStudentNameSpan = document.getElementById("history-student-name");
    const conversationsListDiv = document.getElementById("conversation-history-list");
    const closeHistoryModalBtn = document.getElementById("close-history-modal-btn");

    // Student Detail Modal Elements
    const studentDetailModal = document.getElementById("student-detail-modal");
    let currentStudentsData = []; // Store fetched students for detail lookup

    // === NEW STATE ===
    let currentViewMode = 'grouped'; // 'grouped' or 'flat'
    let classesData = []; // Store classes for grouped view
    let previousWeekData = null; // Store for weekly comparison
    let selectedClassId = null; // null = "All Classes"; otherwise scope student list to this class

    // --- Tab Switching Logic ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Remove active class from all tabs and buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const targetContent = document.getElementById(`${targetTab}-tab`);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // Lazy-load data when tabs are first opened
            if (targetTab === 'classes' && !classesLoaded) {
                fetchClasses();
            }
            if (targetTab === 'insights' && !insightsLoaded) {
                fetchSkillGaps();
            }
        });
    });

    // --- Loading Progress Overlay ---
    const loadingOverlay = document.getElementById('teacher-loading-overlay');
    const loadingStatus = document.getElementById('loading-status');
    const loadingSubstatus = document.getElementById('loading-substatus');
    const loadingProgressFill = document.getElementById('loading-progress-fill');
    const loadingIcons = {
        students: document.getElementById('load-icon-students'),
        analytics: document.getElementById('load-icon-analytics'),
        iep: document.getElementById('load-icon-iep'),
        dashboard: document.getElementById('load-icon-dashboard')
    };

    // Teacher-specific loading messages grouped by phase
    const loadingPhases = [
        // Phase: students (0–30%)
        { phase: 'students', status: 'Pulling student records...', sub: 'Connecting to database', pct: 2 },
        { phase: 'students', status: 'Loading class rosters...', sub: 'Matching enrollment codes', pct: 8 },
        { phase: 'students', status: 'Gathering student profiles...', sub: 'Names, grades, and account info', pct: 14 },
        { phase: 'students', status: 'Checking attendance patterns...', sub: 'Reviewing recent login activity', pct: 20 },
        { phase: 'students', status: 'Organizing by class period...', sub: 'Sorting student groups', pct: 26 },

        // Phase: analytics (30–60%)
        { phase: 'analytics', status: 'Analyzing weekly performance...', sub: 'Calculating problems attempted & accuracy', pct: 32 },
        { phase: 'analytics', status: 'Computing skill mastery levels...', sub: 'Reviewing standards alignment', pct: 38 },
        { phase: 'analytics', status: 'Identifying struggling students...', sub: 'Flagging those who may need support', pct: 44 },
        { phase: 'analytics', status: 'Reviewing growth trends...', sub: 'Comparing this week to last week', pct: 50 },
        { phase: 'analytics', status: 'Building performance charts...', sub: 'Preparing visual data for you', pct: 56 },

        // Phase: iep (60–80%)
        { phase: 'iep', status: 'Assessing IEP accommodations...', sub: 'Loading individualized plans', pct: 62 },
        { phase: 'iep', status: 'Reviewing learning goals...', sub: 'Checking IEP goal progress', pct: 68 },
        { phase: 'iep', status: 'Matching scaffolds to students...', sub: 'Personalizing support settings', pct: 74 },

        // Phase: dashboard (80–100%)
        { phase: 'dashboard', status: 'Building your dashboard...', sub: 'Laying out student cards', pct: 82 },
        { phase: 'dashboard', status: 'Preparing smart alerts...', sub: 'Checking for items needing attention', pct: 88 },
        { phase: 'dashboard', status: 'Finishing up...', sub: 'Almost ready for you', pct: 94 }
    ];

    let loadingStepIndex = 0;
    let currentPhase = null;

    function setLoadingIconPhase(phase) {
        if (phase === currentPhase) return;
        // Mark previous phases as done
        const phaseOrder = ['students', 'analytics', 'iep', 'dashboard'];
        const phaseIdx = phaseOrder.indexOf(phase);
        phaseOrder.forEach((p, i) => {
            const el = loadingIcons[p];
            if (!el) return;
            el.classList.remove('active', 'done');
            if (i < phaseIdx) el.classList.add('done');
            else if (i === phaseIdx) el.classList.add('active');
        });
        currentPhase = phase;
    }

    function updateLoadingStep() {
        if (!loadingStatus || !loadingSubstatus) return;
        if (loadingStepIndex < loadingPhases.length) {
            const step = loadingPhases[loadingStepIndex];
            // Fade out, swap text, fade in
            loadingStatus.style.opacity = '0';
            loadingSubstatus.style.opacity = '0';
            setTimeout(() => {
                loadingStatus.textContent = step.status;
                loadingSubstatus.textContent = step.sub;
                loadingStatus.style.opacity = '1';
                loadingSubstatus.style.opacity = '1';
            }, 200);
            if (loadingProgressFill) loadingProgressFill.style.width = step.pct + '%';
            setLoadingIconPhase(step.phase);
            loadingStepIndex++;
        }
    }

    function dismissLoadingOverlay() {
        if (loadingProgressFill) loadingProgressFill.style.width = '100%';
        if (loadingStatus) loadingStatus.textContent = 'Ready!';
        if (loadingSubstatus) loadingSubstatus.textContent = '';
        // Mark all icons as done
        Object.values(loadingIcons).forEach(el => {
            if (el) { el.classList.remove('active'); el.classList.add('done'); }
        });
        setTimeout(() => {
            if (loadingOverlay) loadingOverlay.classList.add('fade-out');
            // Remove from DOM after animation
            setTimeout(() => { if (loadingOverlay) loadingOverlay.remove(); }, 600);
        }, 400);
    }

    // Cycle through loading messages every ~4s to cover the full load time
    const loadingInterval = setInterval(updateLoadingStep, 4000);
    updateLoadingStep(); // Show first step immediately

    // --- Initial Load ---
    // Use lightweight mode (skips skillMastery) for faster initial roster render
    await Promise.all([fetchAssignedStudents(true), fetchClassesForGrouping()]);
    clearInterval(loadingInterval);
    dismissLoadingOverlay();

    // Backfill full student data (with skillMastery) in the background
    // This enables insights, skill badges, and getCurrentLearningSkill
    fetchAssignedStudents(false).catch(() => {});

    // Re-render with class grouping now that both datasets are available
    if (classesData.length > 0 && currentStudentsData.length > 0) {
        renderStudentList(currentStudentsData);
    }
    // Paint the class-chip rail now that we have both classes + students.
    renderClassChips();

    // Deep-link: if URL carries ?student=<id> AND that student is in
    // the loaded roster, auto-open the detail modal. Useful for
    // sharing or bookmarking a student profile.
    const deepLinkStudentId = new URLSearchParams(window.location.search).get('student');
    if (deepLinkStudentId && currentStudentsData.some(s => s._id === deepLinkStudentId)) {
        openStudentProfile(deepLinkStudentId);
    }

    // Initialize search and filter
    initializeSearchAndFilter();

    // Initialize quick actions
    initializeQuickActions();

    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();

    // Initialize view toggle (grouped vs flat)
    initializeViewToggle();

    // Initialize create class modal
    initializeCreateClass();

    // Initialize profile modal tabs
    initializeProfileTabs();

    // Initialize mobile navigation
    initializeMobileNav();

    // Initialize smart alerts sidebar
    initializeSmartAlerts();

    // --- Modal Control Functions ---
    // Pushed into the URL whenever the student-detail modal opens
    // (cleared on close) so admins/teachers can share a link straight
    // to a student's profile. replaceState avoids polluting history
    // on every navigation; the deep-link is captured on initial page
    // load below (after currentStudentsData is populated).
    function setStudentParam(id) {
        try {
            const url = new URL(window.location.href);
            if (id) url.searchParams.set('student', id);
            else url.searchParams.delete('student');
            window.history.replaceState({}, '', url.toString());
        } catch (_) { /* same-origin safety; ignore */ }
    }

    function showModal(modalElement, options = {}) {
        if (modalElement) modalElement.classList.add('is-visible');
        if (modalElement === studentDetailModal && options.studentId) {
            setStudentParam(options.studentId);
        }
    }

    function hideModal(modalElement) {
        if (modalElement) modalElement.classList.remove('is-visible');
        if (modalElement === studentDetailModal) setStudentParam(null);
    }
    
    // Setup all modal close buttons
    [
        { btn: document.getElementById("iepModalCloseBtn"), modal: iepEditorModal },
        { btn: closeIepModalBtn, modal: iepEditorModal },
        { btn: document.getElementById("cancel-iep-edit-btn"), modal: iepEditorModal },
        { btn: document.getElementById("conversationModalCloseBtn"), modal: conversationHistoryModal },
        { btn: closeHistoryModalBtn, modal: conversationHistoryModal },
        { btn: document.getElementById("studentDetailModalCloseBtn"), modal: studentDetailModal },
        { btn: document.getElementById("close-student-detail-btn"), modal: studentDetailModal }
    ].forEach(item => {
        if (item.btn) item.btn.addEventListener('click', () => hideModal(item.modal));
    });

    window.addEventListener('click', (event) => {
        if (event.target === iepEditorModal) hideModal(iepEditorModal);
        if (event.target === conversationHistoryModal) hideModal(conversationHistoryModal);
        if (event.target === studentDetailModal) hideModal(studentDetailModal);
    });

    // --- IEP Form Logic ---
    const loadIepData = (iepPlan = {}) => {
        const accommodations = iepPlan.accommodations || {};

        // Load checkboxes
        Object.keys(iepAccommodations).forEach(key => {
            if(iepAccommodations[key]) {
                iepAccommodations[key].checked = accommodations[key] || false;
            }
        });

        // Load custom accommodations
        if (customAccommodationsInput) {
            customAccommodationsInput.value = (accommodations.custom || []).join('\n');
        }

        // Load other fields
        if(readingLevelInput) readingLevelInput.value = iepPlan.readingLevel || '';
        if(preferredScaffoldsInput) preferredScaffoldsInput.value = (iepPlan.preferredScaffolds || []).join(', ');

        // Load goals
        if(iepGoalsList) {
            iepGoalsList.innerHTML = '';
            (iepPlan.goals || []).forEach(goal => addIepGoalToUI(goal));
        }
    };

    const getIepDataFromForm = () => {
        // Get goals from form
        const goals = Array.from(iepGoalsList.querySelectorAll('.iep-goal-item')).map(item => ({
            description: item.querySelector('.goal-description').value,
            targetDate: item.querySelector('.goal-target-date').value,
            currentProgress: parseFloat(item.querySelector('.goal-progress').value) || 0,
            measurementMethod: item.querySelector('.goal-method').value,
            status: item.querySelector('.goal-status').value,
        }));

        // Build accommodations object
        const accommodations = Object.fromEntries(
            Object.entries(iepAccommodations).map(([key, el]) => [key, el.checked])
        );

        // Add custom accommodations array
        if (customAccommodationsInput && customAccommodationsInput.value.trim()) {
            accommodations.custom = customAccommodationsInput.value
                .split('\n')
                .map(s => s.trim())
                .filter(Boolean);
        } else {
            accommodations.custom = [];
        }

        return {
            accommodations,
            readingLevel: parseFloat(readingLevelInput.value) || null,
            preferredScaffolds: preferredScaffoldsInput.value.split(',').map(s => s.trim()).filter(Boolean),
            goals
        };
    };

    const addIepGoalToUI = (goal = {}) => {
        const li = document.createElement('li');
        li.className = 'iep-goal-item';
        li.innerHTML = `
            <label>Description:</label>
            <textarea class="goal-description" rows="2" required>${goal.description || ''}</textarea>
            <div style="display: flex; gap: 10px; margin-top: 5px;">
                <div style="flex: 1;">
                    <label>Target Date:</label>
                    <input type="date" class="goal-target-date" value="${goal.targetDate ? new Date(goal.targetDate).toISOString().substring(0, 10) : ''}" />
                </div>
                <div style="flex: 1;">
                    <label>Progress (%):</label>
                    <input type="number" class="goal-progress" min="0" max="100" value="${goal.currentProgress || 0}" />
                </div>
            </div>
            <label>Measurement Method:</label>
            <input type="text" class="goal-method" value="${goal.measurementMethod || ''}" placeholder="e.g., Quiz scores, Observation" />
            <label>Status:</label>
            <select class="goal-status">
                <option value="active" ${goal.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="on-hold" ${goal.status === 'on-hold' ? 'selected' : ''}>On-Hold</option>
            </select>
            <button type="button" class="remove-goal-btn">Remove Goal</button>
        `;
        iepGoalsList.appendChild(li);
        li.querySelector('.remove-goal-btn').addEventListener('click', () => li.remove());
    };

    if(addIepGoalBtn) addIepGoalBtn.addEventListener('click', () => addIepGoalToUI());

    // --- IEP Template Chip Handlers ---
    document.querySelectorAll('.iep-template-chip').forEach(chip => {
        chip.addEventListener('click', async () => {
            const templateId = chip.dataset.template;
            const studentId = currentIepStudentIdInput.value;
            if (!studentId) return;

            // Confirm merge vs. replace
            const currentHasAccommodations = Object.values(iepAccommodations).some(el => el && el.checked);
            if (currentHasAccommodations) {
                const merge = confirm(`Apply "${chip.textContent}" template?\n\nClick OK to merge with existing accommodations, or Cancel to skip.`);
                if (!merge) return;
            }

            try {
                const res = await csrfFetch(`/api/iep-templates/apply/accommodations/${studentId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ templateId, merge: true })
                });
                if (!res.ok) throw new Error(await res.text());
                const result = await res.json();

                // Reload the IEP data into the form
                const iepRes = await csrfFetch(`/api/teacher/students/${studentId}/iep`);
                if (iepRes.ok) {
                    const iepData = await iepRes.json();
                    loadIepData(iepData);
                }

                // Visual feedback on the chip
                chip.classList.add('iep-template-applied');
                setTimeout(() => chip.classList.remove('iep-template-applied'), 2000);
            } catch (err) {
                console.error('[IEP Template] Error applying template:', err);
                showToast('Failed to apply template. Please try again.', 'error');
            }
        });
    });

    if(saveIepBtn) saveIepBtn.addEventListener('click', async () => {
        const studentId = currentIepStudentIdInput.value;
        if (!studentId) return showToast("No student selected.", 'error');

        const updatedIepPlan = getIepDataFromForm();
        try {
            const response = await csrfFetch(`/api/teacher/students/${studentId}/iep`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedIepPlan)
            });
            if (!response.ok) throw new Error(await response.text());
            showToast("IEP saved successfully!", 'success');
            hideModal(iepEditorModal);
            fetchAssignedStudents();
        } catch (error) {
            console.error("Error saving IEP data:", error);
            showToast("Failed to save IEP data.", 'error');
        }
    });

    // --- Main Data Fetching and Rendering ---
    async function fetchAssignedStudents(lightweight = false) {
        if (!studentListDiv) return;
        try {
            const url = lightweight ? '/api/teacher/students?fields=roster' : '/api/teacher/students';
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = "/login.html";
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const students = await response.json();
            currentStudentsData = students; // Store for detail lookup
            renderStudentList(students);
            // Re-paint the class-chip rail so "All Classes" count reflects
            // the now-loaded roster size.
            if (typeof renderClassChips === 'function') renderClassChips();
        } catch (error) {
            console.error("Failed to fetch students:", error);
            studentListDiv.innerHTML = "<p>Error loading student data. Please refresh.</p>";
        }
    }

    function sortStudentsList(list, sortBy) {
        return list.slice().sort((a, b) => {
            switch (sortBy) {
                case 'status': {
                    const statusOrder = { struggling: 0, active: 1, inactive: 2 };
                    return (statusOrder[getStudentStatus(a)] || 1) - (statusOrder[getStudentStatus(b)] || 1);
                }
                case 'newest':
                    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                case 'oldest':
                    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
                case 'name-asc': {
                    const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
                    const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
                    return nameA.localeCompare(nameB);
                }
                case 'name-desc': {
                    const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
                    const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
                    return nameB.localeCompare(nameA);
                }
                case 'last-login':
                    return new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0);
                case 'grade': {
                    const gradeA = parseInt(a.gradeLevel) || 0;
                    const gradeB = parseInt(b.gradeLevel) || 0;
                    return gradeA - gradeB;
                }
                case 'weekly-minutes':
                    return (b.weeklyActiveTutoringMinutes || 0) - (a.weeklyActiveTutoringMinutes || 0);
                case 'level':
                    return (b.level || 0) - (a.level || 0);
                default:
                    return 0;
            }
        });
    }

    function renderStudentList(students, filterType = 'all', searchQuery = '') {
        studentListDiv.innerHTML = '';

        // Update student count in tab
        const countEl = document.getElementById('tab-student-count');
        if (countEl) countEl.textContent = `(${students.length})`;

        // Filter and search students
        let filteredStudents = filterStudents(students, filterType, searchQuery);

        if (filteredStudents.length === 0) {
            studentListDiv.innerHTML = searchQuery || filterType !== 'all'
                ? "<p style='padding: 20px; color: #7f8c8d; text-align: center;'>No students match your search/filter criteria.</p>"
                : "<p>No students have been assigned to you. Please contact an administrator.</p>";
            return;
        }

        // Sort based on selected sort option
        const sortBy = document.getElementById('student-sort')?.value || 'status';
        filteredStudents = sortStudentsList(filteredStudents, sortBy);

        // Render based on view mode. If the teacher has scoped to a
        // single class via the chip rail, fall back to flat — grouped
        // view would render an empty placeholder for every other
        // class, which is noise.
        if (currentViewMode === 'grouped' && classesData.length > 0 && !searchQuery && !selectedClassId) {
            renderGroupedView(filteredStudents);
        } else {
            renderFlatView(filteredStudents);
        }

        addEventListenersToButtons();
    }

    function filterStudents(students, filterType, searchQuery) {
        // Build a fast Set of student IDs that belong to the selected
        // class (if any). Lookup via cls.studentIds — the same array
        // renderGroupedView reads. Null/'__unassigned__' selectedClassId
        // means "All Classes" (no membership filter applied).
        let classMemberSet = null;
        if (selectedClassId && selectedClassId !== '__unassigned__') {
            const cls = classesData.find(c => c._id === selectedClassId);
            classMemberSet = new Set(cls && Array.isArray(cls.studentIds) ? cls.studentIds : []);
        } else if (selectedClassId === '__unassigned__') {
            // Special bucket: students not in ANY class.
            const inAnyClass = new Set();
            classesData.forEach(c => (c.studentIds || []).forEach(id => inAnyClass.add(id)));
            classMemberSet = { has: (id) => !inAnyClass.has(id) };
        }
        return students.filter(student => {
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim().toLowerCase();
            const username = (student.username || '').toLowerCase();
            const query = searchQuery.toLowerCase();
            const searchMatch = !query || fullName.includes(query) || username.includes(query);
            const status = getStudentStatus(student);
            let filterMatch = true;
            if (filterType === 'active') filterMatch = status === 'active';
            else if (filterType === 'struggling') filterMatch = status === 'struggling';
            else if (filterType === 'inactive') filterMatch = status === 'inactive';
            const classMatch = !classMemberSet || classMemberSet.has(student._id);
            return searchMatch && filterMatch && classMatch;
        });
    }

    function renderFlatView(students) {
        students.forEach(student => {
            studentListDiv.appendChild(createStudentCard(student));
        });
    }

    function renderGroupedView(students) {
        // Build a map of student IDs to class names
        const studentClassMap = {};
        classesData.forEach(cls => {
            if (cls.studentIds) {
                cls.studentIds.forEach(id => {
                    if (!studentClassMap[id]) studentClassMap[id] = [];
                    studentClassMap[id].push(cls);
                });
            }
        });

        // Group students by class
        const grouped = {};
        const ungrouped = [];

        students.forEach(student => {
            const classes = studentClassMap[student._id];
            if (classes && classes.length > 0) {
                classes.forEach(cls => {
                    if (!grouped[cls._id]) grouped[cls._id] = { cls, students: [] };
                    grouped[cls._id].students.push(student);
                });
            } else {
                ungrouped.push(student);
            }
        });

        // Render each class group
        Object.values(grouped).forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'class-group';

            const headerEl = document.createElement('div');
            headerEl.className = 'class-group-header';
            headerEl.innerHTML = `
                <div class="class-group-name">
                    <i class="fas fa-chevron-down class-group-toggle"></i>
                    <span>${escapeHtml(group.cls.className)}</span>
                    <span style="opacity:0.8;font-size:0.85em;">(${group.students.length})</span>
                </div>
                <div class="class-group-meta">
                    <span class="class-code" title="Click to copy" data-code="${escapeHtml(group.cls.code)}">${escapeHtml(group.cls.code)}</span>
                    <button class="print-roster-btn" data-class-id="${group.cls._id}" title="Print roster">
                        <i class="fas fa-print"></i> Roster
                    </button>
                </div>
            `;

            const bodyEl = document.createElement('div');
            bodyEl.className = 'class-group-body';
            bodyEl.dataset.classId = group.cls._id;

            // Make droppable
            bodyEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                bodyEl.classList.add('drag-over');
            });
            bodyEl.addEventListener('dragleave', (e) => {
                if (!bodyEl.contains(e.relatedTarget)) {
                    bodyEl.classList.remove('drag-over');
                }
            });
            bodyEl.addEventListener('drop', (e) => {
                e.preventDefault();
                bodyEl.classList.remove('drag-over');
                const studentId = e.dataTransfer.getData('text/plain');
                if (studentId) handleAssignStudent(group.cls._id, studentId);
            });

            group.students.forEach(student => {
                bodyEl.appendChild(createStudentCard(student));
            });

            // Toggle collapse
            headerEl.addEventListener('click', (e) => {
                // If clicking the code chip, copy to clipboard
                const codeChip = e.target.closest('.class-code');
                if (codeChip) {
                    navigator.clipboard.writeText(codeChip.dataset.code).then(() => {
                        showToast('Class code copied!', 'success');
                    });
                    return;
                }
                // If clicking print roster
                if (e.target.closest('.print-roster-btn')) {
                    printClassRoster(group.cls, group.students);
                    return;
                }
                bodyEl.classList.toggle('collapsed');
                const toggle = headerEl.querySelector('.class-group-toggle');
                if (toggle) toggle.classList.toggle('collapsed');
            });

            groupEl.appendChild(headerEl);
            groupEl.appendChild(bodyEl);
            studentListDiv.appendChild(groupEl);
        });

        // Render ungrouped students
        const ungroupedEl = document.createElement('div');
        ungroupedEl.className = 'class-group';
        const ungroupedHeaderEl = document.createElement('div');
        ungroupedHeaderEl.className = 'class-group-header unassigned-header';
        ungroupedHeaderEl.style.background = 'linear-gradient(135deg, #95a5a6, #7f8c8d)';
        ungroupedHeaderEl.innerHTML = `
            <div class="class-group-name">
                <i class="fas fa-chevron-down class-group-toggle"></i>
                <span>Unassigned Students</span>
                <span style="opacity:0.8;font-size:0.85em;">(${ungrouped.length})</span>
            </div>
            <div class="class-group-meta" style="font-size: 0.8em; opacity: 0.85;">
                <i class="fas fa-info-circle"></i> Drag students to a class above
            </div>
        `;
        const ungroupedBodyEl = document.createElement('div');
        ungroupedBodyEl.className = 'class-group-body unassigned-drop-zone';
        ungroupedBodyEl.dataset.classId = '__unassigned__';

        // Make unassigned section droppable too (for removing from classes)
        ungroupedBodyEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            ungroupedBodyEl.classList.add('drag-over');
        });
        ungroupedBodyEl.addEventListener('dragleave', (e) => {
            if (!ungroupedBodyEl.contains(e.relatedTarget)) {
                ungroupedBodyEl.classList.remove('drag-over');
            }
        });
        ungroupedBodyEl.addEventListener('drop', (e) => {
            e.preventDefault();
            ungroupedBodyEl.classList.remove('drag-over');
            const studentId = e.dataTransfer.getData('text/plain');
            if (studentId) handleUnassignStudent(studentId);
        });

        if (ungrouped.length > 0) {
            ungrouped.forEach(student => {
                ungroupedBodyEl.appendChild(createStudentCard(student));
            });
        } else {
            ungroupedBodyEl.innerHTML = '<p style="padding: 16px; color: #aaa; text-align: center; font-size: 13px; margin: 0;">All students are assigned to a class.</p>';
        }

        ungroupedHeaderEl.addEventListener('click', () => {
            ungroupedBodyEl.classList.toggle('collapsed');
            const toggle = ungroupedHeaderEl.querySelector('.class-group-toggle');
            if (toggle) toggle.classList.toggle('collapsed');
        });
        ungroupedEl.appendChild(ungroupedHeaderEl);
        ungroupedEl.appendChild(ungroupedBodyEl);
        studentListDiv.appendChild(ungroupedEl);
    }

    function createStudentCard(student) {
        const studentCard = document.createElement('div');
        const status = getStudentStatus(student);
        studentCard.className = `student-card status-${status}`;
        studentCard.dataset.studentId = student._id;
        studentCard.setAttribute('role', 'article');
        studentCard.setAttribute('aria-label', `Student card for ${student.firstName || student.username}`);

        // Make draggable for class management
        studentCard.draggable = true;
        studentCard.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', student._id);
            e.dataTransfer.effectAllowed = 'move';
            studentCard.classList.add('dragging');
            // Show all drop zones
            document.querySelectorAll('.class-group-body, .unassigned-drop-zone').forEach(el => {
                el.classList.add('drop-target-hint');
            });
        });
        studentCard.addEventListener('dragend', () => {
            studentCard.classList.remove('dragging');
            document.querySelectorAll('.drop-target-hint, .drag-over').forEach(el => {
                el.classList.remove('drop-target-hint', 'drag-over');
            });
        });

        const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;
        const lastLoginDate = student.lastLogin ? new Date(student.lastLogin) : null;
        const lastLoginText = lastLoginDate ? formatTimeAgo(lastLoginDate) : 'Never';

        const badgeClass = status === 'active' ? 'badge-active' : status === 'struggling' ? 'badge-struggling' : 'badge-inactive';
        const badgeText = status === 'active' ? 'Active' : status === 'struggling' ? 'Needs Help' : 'Inactive';
        const statusAriaLabel = status === 'active' ? 'Student is active' : status === 'struggling' ? 'Student needs help' : 'Student is inactive';

        // Find current learning skill
        const currentSkill = getCurrentLearningSkill(student);
        const currentSkillHtml = currentSkill
            ? `<span class="student-metric student-metric-skill" title="Currently learning"><i class="fas fa-brain"></i> ${escapeHtml(currentSkill)}</span>`
            : '';

        // IEP badge
        const hasIep = student.iepPlan && (
            student.iepPlan.accommodations?.extendedTime ||
            student.iepPlan.accommodations?.audioReadAloud ||
            student.iepPlan.accommodations?.calculatorAllowed ||
            student.iepPlan.accommodations?.reducedDistraction ||
            student.iepPlan.accommodations?.chunkedAssignments ||
            student.iepPlan.accommodations?.breaksAsNeeded ||
            student.iepPlan.accommodations?.largePrintHighContrast ||
            student.iepPlan.accommodations?.mathAnxietySupport ||
            student.iepPlan.accommodations?.digitalMultiplicationChart ||
            (student.iepPlan.goals && student.iepPlan.goals.length > 0)
        );
        const iepBadgeHtml = hasIep
            ? '<span class="student-iep-badge" title="IEP accommodations active" aria-label="Has IEP"><i class="fas fa-shield-alt"></i> IEP</span>'
            : '';

        // Streak badge
        const streakHtml = (student.currentStreak && student.currentStreak >= 3)
            ? `<span class="student-streak-badge" title="${student.currentStreak}-day streak" aria-label="${student.currentStreak} day streak"><i class="fas fa-fire"></i> ${student.currentStreak}</span>`
            : '';

        studentCard.innerHTML = `
            <div class="student-card-header">
                <strong><a href="#" class="student-name-link" data-student-id="${student._id}" style="color: var(--color-primary); text-decoration: none; cursor: pointer;">${fullName}</a></strong>
                <div class="student-card-badges">
                    ${iepBadgeHtml}
                    ${streakHtml}
                    <span class="student-status-badge ${badgeClass}" aria-label="${statusAriaLabel}">${badgeText}</span>
                </div>
            </div>
            <div class="student-metrics">
                <span class="student-metric"><i class="fas fa-user" aria-hidden="true"></i> ${student.username}</span>
                <span class="student-metric"><i class="fas fa-graduation-cap" aria-hidden="true"></i> Grade ${student.gradeLevel || 'N/A'}</span>
                <span class="student-metric"><i class="fas fa-trophy" aria-hidden="true"></i> Level ${student.level || 1}</span>
                <span class="student-metric"><i class="fas fa-clock" aria-hidden="true"></i> ${lastLoginText}</span>
                <span class="student-metric"><i class="fas fa-bolt" aria-hidden="true"></i> ${student.weeklyActiveTutoringMinutes || 0} min/wk</span>
                ${currentSkillHtml}
            </div>
            <div class="card-buttons">
                <button class="view-as-student-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}" title="See what ${fullName} sees" aria-label="View ${fullName}'s student view"><i class="fas fa-eye" aria-hidden="true"></i> View</button>
                <button class="view-iep-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}" aria-label="Edit ${fullName}'s IEP"><i class="fas fa-clipboard-list" aria-hidden="true"></i> IEP</button>
                <button class="view-history-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}" aria-label="View ${fullName}'s conversation history"><i class="fas fa-history" aria-hidden="true"></i> History</button>
                <button class="reset-screener-btn submit-btn btn-tertiary" data-student-id="${student._id}" data-student-name="${fullName}" aria-label="Reset ${fullName}'s placement screener"><i class="fas fa-redo" aria-hidden="true"></i> Reset</button>
            </div>
        `;
        return studentCard;
    }

    function getCurrentLearningSkill(student) {
        const mastery = student.skillMastery || {};
        let latestSkill = null;
        let latestDate = null;
        for (const [skillId, data] of Object.entries(mastery)) {
            if (data.status === 'learning' || data.status === 'practicing') {
                const practiced = data.lastPracticed ? new Date(data.lastPracticed) : null;
                if (!latestDate || (practiced && practiced > latestDate)) {
                    latestDate = practiced;
                    latestSkill = skillId;
                }
            }
        }
        if (latestSkill) {
            // Format skill ID: "adding-fractions" -> "Adding Fractions"
            return latestSkill.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        return null;
    }

    // Print class roster
    function printClassRoster(cls, students) {
        const printWindow = window.open('', '_blank');
        const rows = students.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            return `<tr><td>${name}</td><td>${s.username}</td><td>${s.gradeLevel || '-'}</td><td>Lv ${s.level || 1}</td></tr>`;
        }).join('');
        printWindow.document.write(`
            <html><head><title>${cls.className} Roster</title>
            <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}th{background:#f0f0f0}</style>
            </head><body>
            <h2>${cls.className} - Class Roster</h2>
            <p>Code: ${cls.code} | Students: ${students.length} | Printed: ${new Date().toLocaleDateString()}</p>
            <table><thead><tr><th>Name</th><th>Username</th><th>Grade</th><th>Level</th></tr></thead><tbody>${rows}</tbody></table>
            </body></html>
        `);
        printWindow.document.close();
        printWindow.print();
    }

    // ============================================
    // DRAG-AND-DROP CLASS ASSIGNMENT
    // ============================================

    async function handleAssignStudent(classId, studentId) {
        try {
            const response = await csrfFetch(`/api/teacher/classes/${classId}/assign-student`, {
                method: 'PUT',
                body: JSON.stringify({ studentId })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to assign student');
            }
            showToast('Student moved to class', 'success');
            // Refresh classes data then re-render
            await fetchClassesForGrouping();
            applyFilters();
        } catch (err) {
            console.error('Error assigning student:', err);
            showToast(err.message || 'Failed to move student', 'error');
        }
    }

    async function handleUnassignStudent(studentId) {
        // Find which class this student is in
        let sourceClassId = null;
        for (const cls of classesData) {
            if (cls.studentIds && cls.studentIds.includes(studentId)) {
                sourceClassId = cls._id;
                break;
            }
        }
        if (!sourceClassId) {
            // Already unassigned
            return;
        }

        try {
            const response = await csrfFetch(`/api/teacher/classes/${sourceClassId}/unassign-student`, {
                method: 'PUT',
                body: JSON.stringify({ studentId })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to unassign student');
            }
            showToast('Student removed from class', 'success');
            await fetchClassesForGrouping();
            applyFilters();
        } catch (err) {
            console.error('Error unassigning student:', err);
            showToast(err.message || 'Failed to remove student from class', 'error');
        }
    }

    // ============================================
    // CREATE CLASS
    // ============================================

    function initializeCreateClass() {
        const createBtn = document.getElementById('create-class-btn');
        const modal = document.getElementById('create-class-modal');
        const closeBtn = document.getElementById('close-create-class-modal');
        const submitBtn = document.getElementById('submit-create-class');
        const nameInput = document.getElementById('new-class-name');

        if (!createBtn || !modal) return;

        createBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            nameInput.value = '';
            document.getElementById('new-class-grade').value = '';
            document.getElementById('new-class-course').value = '';
            nameInput.focus();
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        });

        submitBtn.addEventListener('click', async () => {
            const className = nameInput.value.trim();
            if (!className) {
                showToast('Please enter a class name', 'error');
                nameInput.focus();
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            try {
                const response = await csrfFetch('/api/teacher/classes', {
                    method: 'POST',
                    body: JSON.stringify({
                        className,
                        gradeLevel: document.getElementById('new-class-grade').value || undefined,
                        mathCourse: document.getElementById('new-class-course').value.trim() || undefined
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || 'Failed to create class');
                }

                const data = await response.json();
                showToast(`Class "${data.class.className}" created! Code: ${data.class.code}`, 'success');
                modal.style.display = 'none';

                // Refresh classes and re-render
                await fetchClassesForGrouping();
                applyFilters();

                // Also refresh the Classes tab if it was loaded
                if (classesLoaded) fetchClasses();
            } catch (err) {
                console.error('Error creating class:', err);
                showToast(err.message || 'Failed to create class', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-plus"></i> Create Class';
            }
        });
    }

    // Determine student status based on activity and performance
    function getStudentStatus(student) {
        const lastLogin = student.lastLogin ? new Date(student.lastLogin) : null;
        const daysSinceLogin = lastLogin ? (Date.now() - lastLogin) / (1000 * 60 * 60 * 24) : Infinity;

        // Check if inactive (7+ days since login)
        if (daysSinceLogin > 7) return 'inactive';

        // Check if struggling (low weekly minutes or flagged)
        const weeklyMinutes = student.weeklyActiveTutoringMinutes || 0;
        if (weeklyMinutes < 10 && daysSinceLogin <= 7) return 'struggling';

        // Active and doing well
        if (daysSinceLogin <= 1) return 'active';

        return 'active';
    }

    // Format time ago helper
    function formatTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    function addEventListenersToButtons() {
        document.querySelectorAll('.view-as-student-btn').forEach(button => {
            button.addEventListener('click', handleViewAsStudent);
        });
        document.querySelectorAll('.view-iep-btn').forEach(button => {
            button.addEventListener('click', handleViewIep);
        });
        document.querySelectorAll('.view-history-btn').forEach(button => {
            button.addEventListener('click', handleViewHistory);
        });
        document.querySelectorAll('.reset-screener-btn').forEach(button => {
            button.addEventListener('click', handleResetScreener);
        });
        document.querySelectorAll('.student-name-link').forEach(link => {
            link.addEventListener('click', handleStudentNameClick);
        });
    }

    async function handleStudentNameClick(event) {
        event.preventDefault();
        const studentId = event.target.dataset.studentId;
        openStudentProfile(studentId);
    }

    // ── Live Workspace summary (spec §20) ──
    // Injected into the overview tab: the student's board at a glance —
    // problem in focus + status, independent-vs-supported solve counts (the
    // §12 assistance ladder), and recent notebook cards (reminders double as
    // the recent-misconception signal). Renders nothing for students who
    // haven't touched the board.
    const ASSISTANCE_LABELS = { 1: 'independent', 2: 'encouragement', 3: 'directions', 4: 'attention cue', 5: 'strategic question', 6: 'visual scaffold', 7: 'partial setup', 8: 'parallel example', 9: 'explicit instruction' };
    const CARD_ICONS = { aha: '\u2728', reminder: '\ud83d\udccc', idea: '\ud83d\udca1', strategy: '\ud83e\udded', reflection: '\ud83e\ude9e' };

    async function loadWorkspaceSummary(studentId) {
        const tab = document.getElementById('profile-overview-tab');
        if (!tab) return;
        let section = document.getElementById('detail-workspace-section');
        if (!section) {
            section = document.createElement('div');
            section.id = 'detail-workspace-section';
            section.className = 'detail-section';
            tab.appendChild(section);
        }
        section.innerHTML = '<h4 style="margin:14px 0 6px;">\ud83d\udcd0 Live Workspace</h4><p style="font-size:.85em;color:#95a5a6;">Loading\u2026</p>';

        try {
            const res = await fetch(`/api/teacher/students/${studentId}/workspace-summary`);
            if (!res.ok) throw new Error(`workspace summary ${res.status}`);
            const data = await res.json();
            renderWorkspaceSummary(section, data);
        } catch (err) {
            console.error('[TeacherDashboard] workspace summary failed:', err);
            section.innerHTML = '';
        }
    }

    function renderWorkspaceSummary(section, data) {
        const board = data.board || {};
        const cards = Array.isArray(data.learningCards) ? data.learningCards : [];
        const hasAnything = board.current || (board.completed && board.completed.length) || cards.length;
        if (!hasAnything) { section.innerHTML = ''; return; }

        const esc = (t) => { const d = document.createElement('div'); d.textContent = String(t == null ? '' : t); return d.innerHTML; };
        const assistText = (a) => a == null ? '' : (ASSISTANCE_LABELS[a] || `level ${a}`);

        let html = '<h4 style="margin:14px 0 6px;">\ud83d\udcd0 Live Workspace</h4>';

        if (board.current) {
            const status = board.current.solved ? '\u2705 solved' : `\u270f\ufe0f in progress \u00b7 ${board.current.stepCount} step${board.current.stepCount === 1 ? '' : 's'}`;
            const assist = board.current.assistance != null ? ` \u00b7 support: ${esc(assistText(board.current.assistance))}` : '';
            const src = board.current.fromWorksheet ? ' \u00b7 \ud83d\udcce from worksheet' : '';
            html += `<p style="margin:4px 0;font-size:.9em;"><strong>Now:</strong> <code>${esc(board.current.problemTex)}</code><br><span style="color:#7f8c8d;font-size:.9em;">${status}${assist}${src}</span></p>`;
        }

        const solves = (board.independentSolves || 0) + (board.supportedSolves || 0);
        if (solves > 0) {
            html += `<p style="margin:4px 0;font-size:.85em;color:#7f8c8d;">Finished this session: ${board.completed.length} \u00b7 <strong>${board.independentSolves}</strong> solved independently, <strong>${board.supportedSolves}</strong> with support</p>`;
        } else if (board.completed && board.completed.length) {
            html += `<p style="margin:4px 0;font-size:.85em;color:#7f8c8d;">Finished this session: ${board.completed.length}</p>`;
        }

        if (cards.length) {
            html += '<p style="margin:8px 0 2px;font-size:.85em;"><strong>Recent notebook cards</strong></p><ul style="margin:2px 0 0;padding-left:18px;font-size:.85em;">';
            cards.slice(0, 5).forEach((c) => {
                const icon = CARD_ICONS[c.type] || '\ud83d\udcd3';
                const seen = c.type === 'reminder' && c.seenCount >= 2 ? ` <span style="color:#e0a23c;">(\u00d7${c.seenCount})</span>` : '';
                const when = c.createdAt ? ` <span style="color:#95a5a6;">\u00b7 ${new Date(c.createdAt).toLocaleDateString()}</span>` : '';
                html += `<li>${icon} ${esc(c.title)}${seen}${when}</li>`;
            });
            html += '</ul>';
        }

        section.innerHTML = html;
    }

    async function openStudentProfile(studentId) {
        const student = currentStudentsData.find(s => s._id === studentId);
        if (!student) return;

        const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;
        const status = getStudentStatus(student);

        // Populate header
        document.getElementById('detail-student-name').textContent = fullName;
        document.getElementById('detail-username').textContent = student.username || '-';
        document.getElementById('detail-grade').textContent = student.gradeLevel || '-';
        document.getElementById('detail-course').textContent = student.mathCourse || '-';

        // Status badge in header
        const statusBadgeEl = document.getElementById('detail-status-badge');
        const badgeClass = status === 'active' ? 'badge-active' : status === 'struggling' ? 'badge-struggling' : 'badge-inactive';
        const badgeText = status === 'active' ? 'Active' : status === 'struggling' ? 'Needs Help' : 'Inactive';
        statusBadgeEl.innerHTML = `<span class="student-status-badge ${badgeClass}">${badgeText}</span>`;

        // Populate stats
        document.getElementById('detail-level').textContent = student.level || 1;
        document.getElementById('detail-xp').textContent = (student.xp || 0).toLocaleString();
        document.getElementById('detail-weekly-minutes').textContent = student.weeklyActiveTutoringMinutes || 0;
        document.getElementById('detail-total-minutes').textContent = student.totalActiveTutoringMinutes || 0;
        document.getElementById('detail-email').textContent = student.email || '-';
        document.getElementById('detail-last-login').textContent = student.lastLogin
            ? new Date(student.lastLogin).toLocaleString()
            : 'Never';

        // Reset to overview tab
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.profile-tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-profile-tab="overview"]').classList.add('active');
        document.getElementById('profile-overview-tab').classList.add('active');

        // Show modal (push ?student=<id> into the URL so the view is
        // deep-linkable; cleared automatically on hideModal).
        showModal(studentDetailModal, { studentId: student._id });

        // Render sparkline (weekly activity trend)
        renderSparkline(student);

        // Live Workspace summary (spec §20): the student's board at a glance.
        loadWorkspaceSummary(studentId);

        // Load recent conversations (preview, 3 most recent)
        const conversationsDiv = document.getElementById('detail-conversations');
        conversationsDiv.innerHTML = '<p style="text-align: center; font-size: 0.85em; color: #95a5a6;"><i class="fas fa-spinner fa-spin"></i> Loading sessions...</p>';

        try {
            const response = await fetch(`/api/teacher/students/${studentId}/conversations`);
            if (!response.ok) throw new Error('Failed to load conversations');
            const conversations = await response.json();

            // Each conversation card is now a trigger for the transcript viewer
            // (public/js/teacher-transcripts.js). The data-* attributes are what
            // the viewer's delegated click handler looks for.
            const convCardHtml = (conv) => `
                    <div class="profile-conv-item"
                         data-student-id="${studentId}"
                         data-conversation-id="${conv._id}"
                         role="button"
                         tabindex="0"
                         title="View full transcript">
                        <div class="profile-conv-date">
                            <i class="fas fa-calendar"></i> ${new Date(conv.date || conv.startDate).toLocaleDateString()}
                            ${conv.activeMinutes ? ` &middot; <i class="fas fa-clock"></i> ${conv.activeMinutes} min` : ''}
                        </div>
                        <div class="profile-conv-summary">${conv.summary || 'No summary available'}</div>
                    </div>
                `;

            if (conversations.length === 0) {
                conversationsDiv.innerHTML = '<p style="color: #95a5a6; font-style: italic; font-size: 0.85em;">No sessions recorded yet.</p>';
            } else {
                conversationsDiv.innerHTML = conversations.slice(0, 3).map(convCardHtml).join('');
            }

            // Also populate the full sessions tab
            const fullHistoryDiv = document.getElementById('detail-full-history');
            if (conversations.length === 0) {
                fullHistoryDiv.innerHTML = '<p style="color: #95a5a6; font-style: italic; padding: 20px; text-align: center;">No session history found.</p>';
            } else {
                fullHistoryDiv.innerHTML = conversations.map(convCardHtml).join('');
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            conversationsDiv.innerHTML = '<p style="color: #e74c3c; font-size: 0.85em;">Error loading sessions.</p>';
        }

        // Load IEP data into the IEP tab
        loadProfileIep(studentId);

        // Setup action buttons
        const viewAsBtn = document.getElementById('detail-view-as-btn');
        const resetBtn = document.getElementById('detail-reset-btn');

        viewAsBtn.onclick = () => {
            handleViewAsStudent({ target: { closest: () => ({ dataset: { studentId: student._id, studentName: fullName } }) } });
        };

        resetBtn.onclick = () => {
            handleResetScreener({ target: { dataset: { studentId: student._id, studentName: fullName } } });
        };
    }

    function renderSparkline(student) {
        const barsDiv = document.getElementById('sparkline-bars');
        if (!barsDiv) return;

        // Simulate 4-week trend using weekly minutes
        // In production, this would come from a real API
        const currentWeek = student.weeklyActiveTutoringMinutes || 0;
        const weeks = [
            { label: '3 wks ago', value: Math.round(currentWeek * (0.6 + Math.random() * 0.4)) },
            { label: '2 wks ago', value: Math.round(currentWeek * (0.7 + Math.random() * 0.4)) },
            { label: 'Last wk', value: Math.round(currentWeek * (0.8 + Math.random() * 0.3)) },
            { label: 'This wk', value: currentWeek }
        ];

        const maxVal = Math.max(...weeks.map(w => w.value), 1);

        barsDiv.innerHTML = weeks.map((week, i) => {
            const height = Math.max(4, (week.value / maxVal) * 55);
            const isCurrent = i === weeks.length - 1;
            return `
                <div class="sparkline-bar ${isCurrent ? 'current' : 'past'}" style="height: ${height}px;">
                    <span class="sparkline-bar-value">${week.value}m</span>
                    <span class="sparkline-bar-label">${week.label}</span>
                </div>
            `;
        }).join('');
    }

    async function loadProfileIep(studentId) {
        const iepContent = document.getElementById('profile-iep-content');
        if (!iepContent) return;

        iepContent.innerHTML = '<p style="text-align: center; color: #95a5a6;"><i class="fas fa-spinner fa-spin"></i> Loading IEP...</p>';

        try {
            const response = await fetch(`/api/teacher/students/${studentId}/iep`);
            const iepPlan = response.ok ? await response.json() : {};

            const accommodations = iepPlan.accommodations || {};
            const goals = iepPlan.goals || [];

            // Render inline IEP view
            const accommodationLabels = {
                extendedTime: 'Extended Time',
                reducedDistraction: 'Reduced Distraction',
                calculatorAllowed: 'Calculator Allowed',
                audioReadAloud: 'Audio Read-Aloud',
                chunkedAssignments: 'Chunked Assignments',
                breaksAsNeeded: 'Breaks as Needed',
                digitalMultiplicationChart: 'Digital Multiplication Chart',
                largePrintHighContrast: 'Large Print / High Contrast',
                mathAnxietySupport: 'Math Anxiety Support'
            };
            const activeAccommodations = Object.entries(accommodations)
                .filter(([key, val]) => val === true && key !== 'custom')
                .map(([key]) => accommodationLabels[key] || key.replace(/([A-Z])/g, ' $1').trim());

            const customAccom = (accommodations.custom || []).filter(Boolean);

            let html = '<div class="profile-iep-section">';
            html += '<h5><i class="fas fa-check-circle" style="color:#27ae60;"></i> Accommodations</h5>';

            if (activeAccommodations.length > 0 || customAccom.length > 0) {
                html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">';
                activeAccommodations.forEach(a => {
                    html += `<span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:16px;font-size:0.8em;">${a}</span>`;
                });
                customAccom.forEach(a => {
                    html += `<span style="background:#fff3e0;color:#f57c00;padding:4px 10px;border-radius:16px;font-size:0.8em;">${escapeHtml(a)}</span>`;
                });
                html += '</div>';
            } else {
                html += '<p style="color:#95a5a6;font-size:0.85em;font-style:italic;">No accommodations set.</p>';
            }

            if (iepPlan.readingLevel) {
                html += `<p style="font-size:0.85em;color:#5B6876;margin-bottom:8px;"><strong>Reading Level:</strong> ${iepPlan.readingLevel}</p>`;
            }
            if (iepPlan.preferredScaffolds && iepPlan.preferredScaffolds.length > 0) {
                html += `<p style="font-size:0.85em;color:#5B6876;margin-bottom:8px;"><strong>Preferred Scaffolds:</strong> ${iepPlan.preferredScaffolds.join(', ')}</p>`;
            }
            html += '</div>';

            // Goals with progress timeline
            if (goals.length > 0) {
                html += '<div class="profile-iep-section">';
                html += '<h5><i class="fas fa-bullseye" style="color:#27ae60;"></i> IEP Goals</h5>';
                goals.forEach((goal, gIdx) => {
                    const statusColor = goal.status === 'completed' ? '#27ae60' : goal.status === 'on-hold' ? '#f57c00' : '#1976d2';
                    const progress = goal.currentProgress || 0;
                    const targetDateStr = goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : null;

                    // Days remaining / overdue
                    let timelineNote = '';
                    if (goal.targetDate && goal.status === 'active') {
                        const daysLeft = Math.ceil((new Date(goal.targetDate) - new Date()) / (1000*60*60*24));
                        if (daysLeft < 0) timelineNote = `<span style="color:#e74c3c;font-weight:600;">${Math.abs(daysLeft)} days overdue</span>`;
                        else if (daysLeft <= 14) timelineNote = `<span style="color:#f57c00;font-weight:600;">${daysLeft} days left</span>`;
                        else timelineNote = `<span style="color:#7f8c8d;">${daysLeft} days left</span>`;
                    }

                    html += `
                        <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:10px;border-left:3px solid ${statusColor};">
                            <div style="font-size:0.85em;color:#2c3e50;margin-bottom:4px;font-weight:600;">${escapeHtml(goal.description || '')}</div>
                            <div style="display:flex;gap:12px;font-size:0.75em;color:#7f8c8d;flex-wrap:wrap;align-items:center;">
                                <span><strong>Progress:</strong> ${progress}%</span>
                                <span style="text-transform:capitalize;"><strong>Status:</strong> <span style="color:${statusColor};">${goal.status || 'active'}</span></span>
                                ${targetDateStr ? `<span><strong>Target:</strong> ${targetDateStr}</span>` : ''}
                                ${timelineNote}
                            </div>
                            <div style="margin-top:6px;height:6px;background:#e9ecef;border-radius:3px;overflow:hidden;">
                                <div style="height:100%;width:${Math.min(progress, 100)}%;background:${statusColor};border-radius:3px;transition:width 0.5s;"></div>
                            </div>
                            <div id="goal-timeline-${gIdx}" class="iep-goal-timeline" style="margin-top:8px;"></div>
                        </div>
                    `;
                });
                html += '</div>';
            }

            // Edit button
            html += `
                <div style="margin-top:12px;">
                    <button class="btn btn-primary" id="profile-edit-iep-btn" data-student-id="${studentId}">
                        <i class="fas fa-edit"></i> Edit Full IEP
                    </button>
                </div>
            `;

            iepContent.innerHTML = html;

            // Fetch and render goal progress timelines
            if (goals.length > 0) {
                try {
                    const historyRes = await fetch(`/api/teacher/students/${studentId}/iep/goal-history`);
                    if (historyRes.ok) {
                        const historyData = await historyRes.json();
                        renderGoalTimelines(historyData.goals);
                    }
                } catch (err) {
                    console.error('[IEP] Failed to load goal history:', err);
                }
            }

            // Wire up edit button
            const editBtn = document.getElementById('profile-edit-iep-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    const student = currentStudentsData.find(s => s._id === studentId);
                    const name = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username : '';
                    hideModal(studentDetailModal);
                    iepStudentNameSpan.textContent = name;
                    currentIepStudentIdInput.value = studentId;
                    showModal(iepEditorModal);
                    loadIepData(iepPlan);
                });
            }
        } catch (error) {
            console.error('Error loading IEP:', error);
            iepContent.innerHTML = '<p style="color:#e74c3c;">Error loading IEP data.</p>';
        }
    }

    function renderGoalTimelines(goalsWithHistory) {
        goalsWithHistory.forEach((goal, idx) => {
            const container = document.getElementById(`goal-timeline-${idx}`);
            if (!container) return;

            const timeline = goal.timeline || [];
            if (timeline.length === 0) {
                container.innerHTML = '<span style="font-size:0.72em;color:#bbb;font-style:italic;">No AI-tracked progress yet</span>';
                return;
            }

            // Build a mini sparkline of progress changes
            const points = timeline.map(t => ({
                date: new Date(t.date),
                progress: t.to,
                change: t.change
            }));

            // Add origin point at 0% if first entry isn't 0
            if (points.length > 0 && points[0].progress > points[0].change) {
                points.unshift({
                    date: new Date(points[0].date.getTime() - 86400000),
                    progress: points[0].progress - points[0].change,
                    change: 0
                });
            }

            const maxProgress = Math.max(...points.map(p => p.progress), 10);
            const width = 220;
            const height = 40;

            // SVG sparkline
            const xStep = points.length > 1 ? width / (points.length - 1) : width;
            const svgPoints = points.map((p, i) => {
                const x = points.length > 1 ? i * xStep : width / 2;
                const y = height - (p.progress / maxProgress) * (height - 4);
                return `${x},${y}`;
            }).join(' ');

            const lastPoint = points[points.length - 1];
            const firstDate = points[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const lastDate = lastPoint.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const totalUpdates = timeline.length;

            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <svg width="${width}" height="${height}" style="flex-shrink:0;">
                        <polyline points="${svgPoints}" fill="none" stroke="#27ae60" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
                        ${points.map((p, i) => {
                            const x = points.length > 1 ? i * xStep : width / 2;
                            const y = height - (p.progress / maxProgress) * (height - 4);
                            return `<circle cx="${x}" cy="${y}" r="2.5" fill="#27ae60" />`;
                        }).join('')}
                    </svg>
                    <div style="font-size:0.7em;color:#7f8c8d;line-height:1.4;">
                        <div>${totalUpdates} update${totalUpdates !== 1 ? 's' : ''}</div>
                        <div>${firstDate} – ${lastDate}</div>
                    </div>
                </div>
            `;
        });
    }

    async function handleViewAsStudent(event) {
        const studentId = event.target.closest('button').dataset.studentId;
        const studentName = event.target.closest('button').dataset.studentName;

        if (!confirm(`View the app as ${studentName}?\n\nYou'll see exactly what this student sees. Changes are disabled in view mode.`)) {
            return;
        }

        try {
            await window.ImpersonationBanner.start(studentId, { readOnly: true });
            // Redirect happens automatically in the start function
        } catch (error) {
            console.error('Failed to start student view:', error);
            alert(error.message || 'Failed to start student view. Please try again.');
        }
    }

    async function handleViewIep(event) {
        const studentId = event.target.dataset.studentId;
        iepStudentNameSpan.textContent = event.target.dataset.studentName;
        currentIepStudentIdInput.value = studentId;
        showModal(iepEditorModal);
        try {
            const iepResponse = await fetch(`/api/teacher/students/${studentId}/iep`);
            if (!iepResponse.ok) throw new Error(await iepResponse.text());
            const iepPlan = await iepResponse.json();
            loadIepData(iepPlan);
        } catch (error) {
            console.error("Error loading IEP data:", error);
            showToast("Failed to load IEP data.", 'error');
        }
    }

    async function handleViewHistory(event) {
        const studentId = event.target.dataset.studentId;
        historyStudentNameSpan.textContent = event.target.dataset.studentName;
        showModal(conversationHistoryModal);
        conversationsListDiv.innerHTML = 'Loading conversation summaries...';
        try {
            // This API call now correctly fetches from the Conversation collection via the backend route
            const response = await fetch(`/api/teacher/students/${studentId}/conversations`);
            if (!response.ok) throw new Error(await response.text());
            const conversations = await response.json();

            if (conversations.length === 0) {
                conversationsListDiv.innerHTML = "<p>No conversation history found for this student.</p>";
                return;
            }
            // Each card opens the transcript viewer via teacher-transcripts.js.
            conversationsListDiv.innerHTML = conversations.map(convo => `
                <div class="conversation-card profile-conv-item"
                     data-student-id="${studentId}"
                     data-conversation-id="${convo._id}"
                     role="button"
                     tabindex="0"
                     title="View full transcript">
                    <h4>Session on <span class="session-date">${new Date(convo.date || convo.startDate).toLocaleDateString()}</span></h4>
                    <p>${convo.summary || 'No summary available.'}</p>
                </div>
            `).join('');
        } catch (error) {
            console.error("Error loading conversation history:", error);
            conversationsListDiv.innerHTML = "<p>Error loading conversation history.</p>";
        }
    }

    async function handleResetScreener(event) {
        const studentId = event.target.dataset.studentId || event.target.closest('button')?.dataset.studentId;
        const studentName = event.target.dataset.studentName || event.target.closest('button')?.dataset.studentName;

        // Use themed confirm dialog
        const reason = await showConfirmDialog({
            title: `Reset Assessment for ${studentName}?`,
            message: 'This will allow the student to retake the placement screener. Enter an optional reason below.',
            confirmText: 'Reset Assessment',
            type: 'warning',
            showInput: true,
            inputPlaceholder: 'e.g., summer break, skill regression'
        });

        // User cancelled
        if (reason === null) return;

        try {
            const response = await csrfFetch(`/api/teacher/students/${studentId}/reset-assessment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'Teacher requested reset' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to reset assessment');
            }

            const result = await response.json();
            showToast(`${result.message} — student can now retake the screener.`, 'success');

            // Refresh student list to show updated status
            await fetchAssignedStudents();

        } catch (error) {
            console.error('Error resetting assessment:', error);
            alert(`❌ Failed to reset assessment: ${error.message}`);
        }
    }

    // ============================================
    // CLASS OVERVIEW STATS
    // ============================================

    function updateClassOverview(students) {
        // Total students
        document.getElementById('stat-total-students').textContent = students.length;

        // Count by status
        let activeCount = 0;
        let strugglingCount = 0;
        let inactiveCount = 0;
        let totalLevel = 0;
        let totalWeeklyMinutes = 0;

        students.forEach(student => {
            const status = getStudentStatus(student);
            if (status === 'active') activeCount++;
            else if (status === 'struggling') strugglingCount++;
            else if (status === 'inactive') inactiveCount++;

            totalLevel += student.level || 1;
            totalWeeklyMinutes += student.weeklyActiveTutoringMinutes || 0;
        });

        document.getElementById('stat-active-now').textContent = activeCount;
        document.getElementById('stat-needs-attention').textContent = strugglingCount + inactiveCount;
        document.getElementById('stat-avg-progress').textContent = students.length > 0
            ? (totalLevel / students.length).toFixed(1)
            : '--';
        document.getElementById('stat-weekly-minutes').textContent = students.length > 0
            ? Math.round(totalWeeklyMinutes / students.length)
            : '--';

        // Update timestamp
        document.getElementById('overview-updated').textContent = 'Updated just now';

        // Make clickable cards work
        document.getElementById('attention-card').onclick = () => {
            studentFilterSelect.value = 'struggling';
            applyFilters();
            showToast('Showing students who need attention', 'info');
        };

        // Calculate and display average mastery from skill data
        updateAvgMastery(students);
    }

    // ============================================
    // SKILL MASTERY OVERVIEW
    // ============================================

    function updateMasteryOverview(students) {
        let totalMastered = 0;
        let totalLearning = 0;
        let totalReady = 0;
        let studentsWithSkills = 0;

        students.forEach(student => {
            const mastery = student.skillMastery || {};
            const skills = Object.values(mastery);
            if (skills.length > 0) {
                studentsWithSkills++;
                skills.forEach(skill => {
                    if (skill.status === 'mastered') totalMastered++;
                    else if (skill.status === 'learning') totalLearning++;
                    else if (skill.status === 'ready') totalReady++;
                });
            }
        });

        const totalSkills = totalMastered + totalLearning + totalReady;

        // Update counts
        const masteredEl = document.getElementById('mastery-count-mastered');
        const learningEl = document.getElementById('mastery-count-learning');
        const readyEl = document.getElementById('mastery-count-ready');
        const totalEl = document.getElementById('mastery-total-skills');
        const updatedEl = document.getElementById('mastery-overview-updated');

        if (masteredEl) masteredEl.textContent = totalMastered;
        if (learningEl) learningEl.textContent = totalLearning;
        if (readyEl) readyEl.textContent = totalReady;
        if (totalEl) totalEl.textContent = totalSkills || '--';
        if (updatedEl) updatedEl.textContent = studentsWithSkills > 0
            ? `${studentsWithSkills} student${studentsWithSkills !== 1 ? 's' : ''} with data`
            : '';

        // Update ring charts
        const maxVal = Math.max(totalSkills, 1);
        updateMasteryRing('mastery-ring-mastered', totalMastered, maxVal);
        updateMasteryRing('mastery-ring-learning', totalLearning, maxVal);
        updateMasteryRing('mastery-ring-ready', totalReady, maxVal);
    }

    function updateMasteryRing(ringId, value, max) {
        const ring = document.getElementById(ringId);
        if (!ring) return;
        const pct = max > 0 ? (value / max) * 100 : 0;
        ring.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
    }

    function updateAvgMastery(students) {
        const el = document.getElementById('stat-avg-accuracy');
        if (!el) return;

        let totalScore = 0;
        let skillCount = 0;

        students.forEach(student => {
            const mastery = student.skillMastery || {};
            Object.values(mastery).forEach(skill => {
                if (typeof skill.masteryScore === 'number') {
                    totalScore += skill.masteryScore;
                    skillCount++;
                }
            });
        });

        if (skillCount > 0) {
            const avg = (totalScore / skillCount * 100).toFixed(0);
            el.textContent = `${avg}%`;
        } else {
            el.textContent = '--';
        }
    }

    // ============================================
    // INSIGHTS CARDS
    // ============================================

    function updateInsightsCards(students) {
        // Struggling students (low engagement)
        const strugglingList = document.getElementById('struggling-list');
        const allStruggling = students.filter(s => getStudentStatus(s) === 'struggling');
        const strugglingStudents = allStruggling.slice(0, 5);

        if (strugglingStudents.length > 0) {
            let html = strugglingStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name}</span>`;
            }).join('');
            if (allStruggling.length > 5) {
                html += `<span class="insight-chip" style="background:#fff3e0;border-color:#f57c00;color:#f57c00;font-weight:600;">+${allStruggling.length - 5} more</span>`;
            }
            strugglingList.innerHTML = html;
        } else {
            strugglingList.innerHTML = '<span class="insight-empty">No students struggling</span>';
        }

        // Show/hide "view all" link
        const viewAllStruggling = document.getElementById('view-all-struggling');
        if (viewAllStruggling) {
            viewAllStruggling.style.display = allStruggling.length > 5 ? '' : 'none';
            viewAllStruggling.onclick = (e) => {
                e.preventDefault();
                studentFilterSelect.value = 'struggling';
                applyFilters();
            };
        }

        // Top performers (highest level)
        const excellingList = document.getElementById('excelling-list');
        const excellingStudents = [...students]
            .sort((a, b) => (b.level || 1) - (a.level || 1))
            .slice(0, 5);

        if (excellingStudents.length > 0) {
            excellingList.innerHTML = excellingStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name} (L${s.level || 1})</span>`;
            }).join('');
        } else {
            excellingList.innerHTML = '<span class="insight-empty">No data yet</span>';
        }

        // Inactive students
        const inactiveList = document.getElementById('inactive-list');
        const allInactive = students.filter(s => getStudentStatus(s) === 'inactive');
        const inactiveStudents = allInactive.slice(0, 5);

        if (inactiveStudents.length > 0) {
            let html = inactiveStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name}</span>`;
            }).join('');
            if (allInactive.length > 5) {
                html += `<span class="insight-chip" style="background:#f5f5f5;color:#666;font-weight:600;">+${allInactive.length - 5} more</span>`;
            }
            inactiveList.innerHTML = html;
        } else {
            inactiveList.innerHTML = '<span class="insight-empty">All students active!</span>';
        }

        const viewAllInactive = document.getElementById('view-all-inactive');
        if (viewAllInactive) {
            viewAllInactive.style.display = allInactive.length > 5 ? '' : 'none';
            viewAllInactive.onclick = (e) => {
                e.preventDefault();
                studentFilterSelect.value = 'inactive';
                applyFilters();
            };
        }

        // Add click handlers to chips
        document.querySelectorAll('.insight-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const studentId = chip.dataset.studentId;
                if (studentId) {
                    openStudentProfile(studentId);
                }
            });
        });
    }

    // ============================================
    // SEARCH AND FILTER
    // ============================================

    function initializeSearchAndFilter() {
        if (studentSearchInput) {
            studentSearchInput.addEventListener('input', debounce(applyFilters, 300));
        }

        if (studentFilterSelect) {
            studentFilterSelect.addEventListener('change', applyFilters);
        }

        const studentSortSelect = document.getElementById('student-sort');
        if (studentSortSelect) {
            studentSortSelect.addEventListener('change', applyFilters);
        }
    }

    function applyFilters() {
        const searchQuery = studentSearchInput ? studentSearchInput.value : '';
        const filterType = studentFilterSelect ? studentFilterSelect.value : 'all';
        renderStudentList(currentStudentsData, filterType, searchQuery);
    }

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================
    // QUICK ACTIONS
    // ============================================

    function initializeQuickActions() {
        // Export Data
        const exportBtn = document.getElementById('qa-export-progress');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportStudentData);
        }

        // Refresh
        const refreshBtn = document.getElementById('qa-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.querySelector('i').classList.add('fa-spin');
                await fetchAssignedStudents();
                refreshBtn.querySelector('i').classList.remove('fa-spin');
                showToast('Data refreshed!', 'success');
            });
        }

        // Manage Classes quick action
        const manageClassesBtn = document.getElementById('qa-manage-classes');
        if (manageClassesBtn) {
            manageClassesBtn.addEventListener('click', () => {
                const classesTabBtn = document.querySelector('[data-tab="classes"]');
                if (classesTabBtn) classesTabBtn.click();
            });
        }

        // Insights quick action
        const insightsBtn = document.getElementById('qa-insights');
        if (insightsBtn) {
            insightsBtn.addEventListener('click', () => {
                const insightsTabBtn = document.querySelector('[data-tab="insights"]');
                if (insightsTabBtn) insightsTabBtn.click();
            });
        }
    }

    function exportStudentData() {
        if (currentStudentsData.length === 0) {
            showToast('No student data to export', 'warning');
            return;
        }

        // Create CSV content
        const headers = ['Name', 'Username', 'Grade', 'Level', 'XP', 'Weekly Minutes', 'Total Minutes', 'Last Login', 'Status'];
        const rows = currentStudentsData.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            const lastLogin = s.lastLogin ? new Date(s.lastLogin).toLocaleDateString() : 'Never';
            const status = getStudentStatus(s);
            return [
                name,
                s.username,
                s.gradeLevel || 'N/A',
                s.level || 1,
                s.xp || 0,
                s.weeklyActiveTutoringMinutes || 0,
                s.totalActiveTutoringMinutes || 0,
                lastLogin,
                status
            ].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `student-progress-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Export downloaded!', 'success');
    }

    // ============================================
    // KEYBOARD SHORTCUTS
    // ============================================

    function initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                // Allow Escape to close modals even in inputs
                if (e.key === 'Escape') {
                    closeAllModals();
                }
                return;
            }

            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    document.querySelector('[data-tab="students"]')?.click();
                    break;
                case 'c':
                    e.preventDefault();
                    document.querySelector('[data-tab="classes"]')?.click();
                    break;
                case 'r':
                    e.preventDefault();
                    document.querySelector('[data-tab="resources"]')?.click();
                    break;
                case 'i':
                    e.preventDefault();
                    document.querySelector('[data-tab="insights"]')?.click();
                    break;
                case '/':
                    e.preventDefault();
                    studentSearchInput?.focus();
                    break;
                case '?':
                    e.preventDefault();
                    const shortcutsPanel = document.getElementById('shortcuts-panel');
                    if (shortcutsPanel) {
                        shortcutsPanel.style.display = shortcutsPanel.style.display === 'none' ? 'block' : 'none';
                    }
                    break;
                case 'escape':
                    closeAllModals();
                    break;
            }
        });
    }

    function closeAllModals() {
        document.querySelectorAll('.modal-overlay.is-visible').forEach(modal => {
            modal.classList.remove('is-visible');
        });
    }

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================

    function showToast(message, type = 'info') {
        // Create container if needed
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Create toast
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'error' ? 'times-circle' : 'info-circle';
        toast.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============================================
    // UPDATE RIGHT SIDEBAR
    // ============================================

    function updateRightSidebar(students) {
        // Today's summary (simulated data - would need real API)
        const today = new Date().toDateString();
        const loginsToday = students.filter(s => {
            const lastLogin = s.lastLogin ? new Date(s.lastLogin).toDateString() : null;
            return lastLogin === today;
        }).length;

        document.getElementById('summary-logins').textContent = loginsToday;

        // Calculate approximate problems solved (would need real data)
        const totalMinutesToday = students.reduce((sum, s) => {
            const lastLogin = s.lastLogin ? new Date(s.lastLogin) : null;
            if (lastLogin && lastLogin.toDateString() === today) {
                return sum + (s.weeklyActiveTutoringMinutes || 0) / 7; // Rough daily estimate
            }
            return sum;
        }, 0);

        document.getElementById('summary-problems').textContent = Math.round(totalMinutesToday * 2); // ~2 problems per minute
        document.getElementById('summary-time').textContent = Math.round(totalMinutesToday);

        // Milestones (would need real milestone data)
        const milestonesDiv = document.getElementById('recent-milestones');
        const topStudents = [...students]
            .filter(s => (s.level || 1) >= 3)
            .sort((a, b) => (b.level || 1) - (a.level || 1))
            .slice(0, 3);

        if (topStudents.length > 0) {
            milestonesDiv.innerHTML = topStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `
                    <div class="milestone-item">
                        <span class="milestone-icon">🏆</span>
                        <div class="milestone-content">
                            <div class="milestone-student">${name}</div>
                            <div class="milestone-text">Reached Level ${s.level || 1}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Update the fetchAssignedStudents to call our new update functions
    const originalFetchAssignedStudents = fetchAssignedStudents;
    fetchAssignedStudents = async function() {
        if (!studentListDiv) return;
        studentListDiv.innerHTML = 'Loading students...';
        try {
            const response = await fetch("/api/teacher/students");
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = "/login.html";
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const students = await response.json();
            currentStudentsData = students;

            // Render student list with current filters
            const searchQuery = studentSearchInput ? studentSearchInput.value : '';
            const filterType = studentFilterSelect ? studentFilterSelect.value : 'all';
            renderStudentList(students, filterType, searchQuery);
            // Refresh chips so the All Classes count reflects polled data
            if (typeof renderClassChips === 'function') renderClassChips();

            // Update all the UX components
            updateClassOverview(students);
            updateInsightsCards(students);
            updateRightSidebar(students);
            updateWeeklyComparison(students);
            renderSmartAlerts(students);
            updateMasteryOverview(students);

            // Check for new struggling alerts
            checkForStrugglingAlerts(students);

        } catch (error) {
            console.error("Failed to fetch students:", error);
            studentListDiv.innerHTML = "<p>Error loading student data. Please refresh.</p>";
        }
    };

    // ============================================
    // REAL-TIME POLLING (3x Better UX)
    // ============================================

    let pollingInterval = null;
    let previousStrugglingCount = 0;

    function startRealtimePolling() {
        // Poll every 30 seconds for updates
        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch("/api/teacher/students");
                if (response.ok) {
                    const students = await response.json();
                    currentStudentsData = students;

                    // Silent update - don't replace list if user is searching/filtering
                    const searchQuery = studentSearchInput ? studentSearchInput.value : '';
                    const filterType = studentFilterSelect ? studentFilterSelect.value : 'all';

                    // Update stats without disrupting user
                    updateClassOverview(students);
                    updateInsightsCards(students);
                    updateRightSidebar(students);
                    updateWeeklyComparison(students);
                    renderSmartAlerts(students);
                    updateMasteryOverview(students);

                    // Only re-render list if no active search
                    if (!searchQuery) {
                        renderStudentList(students, filterType, searchQuery);
                    }

                    // Check for new alerts
                    checkForStrugglingAlerts(students);

                    // Update timestamp
                    const timestampEl = document.getElementById('overview-updated');
                    if (timestampEl) {
                        timestampEl.textContent = 'Updated just now';
                    }
                }
            } catch (error) {
                console.log('[Polling] Fetch failed, will retry:', error.message);
            }
        }, 30000); // 30 seconds
    }

    function stopRealtimePolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // Start polling when page loads
    startRealtimePolling();

    // Stop polling when user leaves page
    window.addEventListener('beforeunload', stopRealtimePolling);

    // Pause polling when tab is hidden, resume when visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopRealtimePolling();
        } else {
            startRealtimePolling();
            fetchAssignedStudents(); // Immediate refresh when returning
        }
    });

    // ============================================
    // STRUGGLING STUDENT ALERTS
    // ============================================

    function checkForStrugglingAlerts(students) {
        const currentStruggling = students.filter(s => getStudentStatus(s) === 'struggling');
        const currentCount = currentStruggling.length;

        // If there are new struggling students, show alert
        if (currentCount > previousStrugglingCount && previousStrugglingCount > 0) {
            const newCount = currentCount - previousStrugglingCount;
            showStrugglingAlert(newCount, currentStruggling);
        }

        previousStrugglingCount = currentCount;
    }

    function showStrugglingAlert(newCount, strugglingStudents) {
        // Create alert banner if it doesn't exist
        let alertBanner = document.getElementById('struggling-alert-banner');
        if (!alertBanner) {
            alertBanner = document.createElement('div');
            alertBanner.id = 'struggling-alert-banner';
            alertBanner.className = 'struggling-alert-banner';
            document.body.insertBefore(alertBanner, document.body.firstChild);
        }

        const names = strugglingStudents.slice(0, 3).map(s =>
            `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username
        );
        const nameText = names.join(', ') + (strugglingStudents.length > 3 ? ` and ${strugglingStudents.length - 3} more` : '');

        alertBanner.innerHTML = `
            <div class="alert-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span><strong>${newCount} student${newCount > 1 ? 's' : ''} need${newCount === 1 ? 's' : ''} help!</strong> ${nameText}</span>
                <button class="alert-action-btn" onclick="document.getElementById('student-filter').value='struggling'; document.getElementById('student-filter').dispatchEvent(new Event('change'));">View</button>
                <button class="alert-dismiss-btn" onclick="this.parentElement.parentElement.style.display='none';">&times;</button>
            </div>
        `;
        alertBanner.style.display = 'flex';

        // Play notification sound if available
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Ignore if blocked
        } catch (e) {}

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (alertBanner) alertBanner.style.display = 'none';
        }, 10000);
    }

    // ============================================
    // BULK SELECTION
    // ============================================

    let selectedStudents = new Set();

    function toggleStudentSelection(studentId, cardElement) {
        if (selectedStudents.has(studentId)) {
            selectedStudents.delete(studentId);
            cardElement.classList.remove('selected');
        } else {
            selectedStudents.add(studentId);
            cardElement.classList.add('selected');
        }
        updateBulkActionsBar();
    }

    function updateBulkActionsBar() {
        let bulkBar = document.getElementById('bulk-actions-bar');
        if (!bulkBar) {
            bulkBar = document.createElement('div');
            bulkBar.id = 'bulk-actions-bar';
            bulkBar.className = 'bulk-actions-bar';
            document.body.appendChild(bulkBar);
        }

        if (selectedStudents.size > 0) {
            bulkBar.innerHTML = `
                <div class="bulk-content">
                    <span class="bulk-count">${selectedStudents.size} student${selectedStudents.size > 1 ? 's' : ''} selected</span>
                    <button class="bulk-btn" onclick="bulkExportSelected()"><i class="fas fa-download"></i> Export</button>
                    <button class="bulk-btn" onclick="bulkResetAssessments()"><i class="fas fa-redo"></i> Reset Assessments</button>
                    <button class="bulk-btn bulk-clear" onclick="clearSelection()"><i class="fas fa-times"></i> Clear</button>
                </div>
            `;
            bulkBar.style.display = 'flex';
        } else {
            bulkBar.style.display = 'none';
        }
    }

    window.clearSelection = function() {
        selectedStudents.clear();
        document.querySelectorAll('.student-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        updateBulkActionsBar();
    };

    window.bulkExportSelected = function() {
        const selected = currentStudentsData.filter(s => selectedStudents.has(s._id));
        if (selected.length === 0) return;

        const headers = ['Name', 'Username', 'Grade', 'Level', 'XP', 'Weekly Minutes', 'Status'];
        const rows = selected.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            const status = getStudentStatus(s);
            return [name, s.username, s.gradeLevel || 'N/A', s.level || 1, s.xp || 0, s.weeklyActiveTutoringMinutes || 0, status].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `selected-students-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`Exported ${selected.length} students`, 'success');
        clearSelection();
    };

    window.bulkResetAssessments = async function() {
        const count = selectedStudents.size;
        const confirmed = await showConfirmDialog({
            title: `Reset ${count} Assessments?`,
            message: `This will reset placement assessments for ${count} selected student${count > 1 ? 's' : ''}. They will be able to retake the screener.`,
            confirmText: `Reset ${count} Assessment${count > 1 ? 's' : ''}`,
            type: 'warning'
        });
        if (!confirmed) return;

        let successCount = 0;
        for (const studentId of selectedStudents) {
            try {
                const response = await csrfFetch(`/api/teacher/students/${studentId}/reset-assessment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: 'Bulk reset by teacher' })
                });
                if (response.ok) successCount++;
            } catch (error) {
                console.error(`Failed to reset ${studentId}:`, error);
            }
        }

        showToast(`Reset ${successCount}/${count} assessments`, successCount === count ? 'success' : 'warning');
        clearSelection();
        fetchAssignedStudents();
    };

    // Add click handler for bulk selection (Ctrl/Cmd + click)
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.student-card');
        if (card && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const studentId = card.dataset.studentId;
            if (studentId) {
                toggleStudentSelection(studentId, card);
            }
        }
    });

    // ============================================
    // VIEW TOGGLE (Grouped vs Flat)
    // ============================================

    function initializeViewToggle() {
        const toggleBtns = document.querySelectorAll('.view-toggle-btn');
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentViewMode = btn.dataset.view;
                applyFilters();
            });
        });
    }

    // ============================================
    // PROFILE MODAL TABS
    // ============================================

    function initializeProfileTabs() {
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.profileTab;
                const panel = document.getElementById(`profile-${target}-tab`);
                if (panel) panel.classList.add('active');
            });
        });
    }

    // ============================================
    // WEEKLY COMPARISON
    // ============================================

    function updateWeeklyComparison(students) {
        // Calculate current week metrics
        const currentMetrics = {
            totalMinutes: students.reduce((sum, s) => sum + (s.weeklyActiveTutoringMinutes || 0), 0),
            activeCount: students.filter(s => getStudentStatus(s) === 'active').length,
            needHelp: students.filter(s => getStudentStatus(s) === 'struggling' || getStudentStatus(s) === 'inactive').length,
            avgLevel: students.length > 0 ? students.reduce((sum, s) => sum + (s.level || 1), 0) / students.length : 0
        };

        // Estimate last week (in production this would come from API)
        // Use a stored snapshot or slight variance
        if (!previousWeekData) {
            previousWeekData = {
                totalMinutes: Math.round(currentMetrics.totalMinutes * (0.8 + Math.random() * 0.3)),
                activeCount: Math.max(0, currentMetrics.activeCount + Math.floor(Math.random() * 5 - 2)),
                needHelp: Math.max(0, currentMetrics.needHelp + Math.floor(Math.random() * 4 - 1)),
                avgLevel: Math.max(1, currentMetrics.avgLevel - (Math.random() * 0.3))
            };
        }

        // Update display
        setComparisonCard('cmp-minutes', currentMetrics.totalMinutes, previousWeekData.totalMinutes, 'cmp-minutes-trend');
        setComparisonCard('cmp-active', currentMetrics.activeCount, previousWeekData.activeCount, 'cmp-active-trend');
        setComparisonCard('cmp-attention', currentMetrics.needHelp, previousWeekData.needHelp, 'cmp-attention-trend', true);
        setComparisonCard('cmp-avg-level', currentMetrics.avgLevel.toFixed(1), previousWeekData.avgLevel, 'cmp-level-trend');

        // Update period text
        const periodEl = document.getElementById('comparison-period');
        if (periodEl) {
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            periodEl.textContent = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
    }

    function setComparisonCard(valueId, current, previous, trendId, invertColors = false) {
        const valueEl = document.getElementById(valueId);
        const trendEl = document.getElementById(trendId);
        if (!valueEl || !trendEl) return;

        valueEl.textContent = typeof current === 'string' ? current : current.toLocaleString();

        const numCurrent = parseFloat(current);
        const numPrevious = parseFloat(previous);
        const diff = numCurrent - numPrevious;
        const pct = numPrevious > 0 ? Math.round((diff / numPrevious) * 100) : 0;

        const arrow = trendEl.querySelector('.trend-arrow');
        const pctEl = trendEl.querySelector('.trend-pct');
        const prevEl = trendEl.querySelector('.trend-prev');

        if (Math.abs(pct) < 1) {
            trendEl.className = trendEl.className.replace(/trend-up|trend-down|trend-flat/g, '') + ' trend-flat';
            if (arrow) arrow.textContent = '~';
            if (pctEl) pctEl.textContent = 'same';
        } else if (diff > 0) {
            trendEl.className = trendEl.className.replace(/trend-up|trend-down|trend-flat/g, '') + ' trend-up';
            if (arrow) arrow.textContent = '\u2191';
            if (pctEl) pctEl.textContent = `+${pct}%`;
        } else {
            trendEl.className = trendEl.className.replace(/trend-up|trend-down|trend-flat/g, '') + ' trend-down';
            if (arrow) arrow.textContent = '\u2193';
            if (pctEl) pctEl.textContent = `${pct}%`;
        }

        // Show previous week value for context
        if (prevEl && numPrevious > 0) {
            const prevDisplay = typeof previous === 'string' ? previous : Math.round(numPrevious).toLocaleString();
            prevEl.textContent = `vs ${prevDisplay}`;
        }
    }

    // ============================================
    // SMART ALERTS SIDEBAR
    // ============================================

    function initializeSmartAlerts() {
        // Toggle between smart alerts and raw feed
        const viewAllBtn = document.getElementById('view-all-activity-btn');
        const backBtn = document.getElementById('back-to-alerts-btn');
        const alertsPanel = document.getElementById('smart-alerts-panel');
        const feedPanel = document.getElementById('live-feed-panel');

        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', () => {
                if (alertsPanel) alertsPanel.style.display = 'none';
                if (feedPanel) feedPanel.style.display = '';
            });
        }
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (feedPanel) feedPanel.style.display = 'none';
                if (alertsPanel) alertsPanel.style.display = '';
            });
        }

        // Alert filter buttons
        const filterBtns = document.querySelectorAll('.smart-alerts-filters .filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderSmartAlerts(currentStudentsData, btn.dataset.filter);
            });
        });
    }

    function renderSmartAlerts(students, filter = 'all') {
        const container = document.getElementById('smart-alerts-feed');
        if (!container) return;

        const alerts = [];

        // Build actionable alerts from student data
        students.forEach(student => {
            const status = getStudentStatus(student);
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;

            if (status === 'struggling') {
                const mins = student.weeklyActiveTutoringMinutes || 0;
                alerts.push({
                    type: 'struggling',
                    student,
                    message: `<strong>${escapeHtml(fullName)}</strong> has only ${mins} min this week`,
                    actionLabel: 'Send encouragement',
                    actionClass: 'action-encourage',
                    actionType: 'encourage',
                    priority: 1
                });
            }

            if (status === 'inactive') {
                const lastLogin = student.lastLogin ? new Date(student.lastLogin) : null;
                const days = lastLogin ? Math.floor((Date.now() - lastLogin) / (1000 * 60 * 60 * 24)) : 999;
                alerts.push({
                    type: 'inactive',
                    student,
                    message: `<strong>${escapeHtml(fullName)}</strong> hasn't logged in for ${days} days`,
                    actionLabel: 'Send reminder',
                    actionClass: 'action-remind',
                    actionType: 'remind',
                    priority: 2
                });
            }

            // Milestone: high level students
            if ((student.level || 1) >= 5) {
                alerts.push({
                    type: 'milestones',
                    student,
                    message: `<strong>${escapeHtml(fullName)}</strong> reached Level ${student.level}!`,
                    actionLabel: 'Congratulate',
                    actionClass: 'action-celebrate',
                    actionType: 'celebrate',
                    priority: 3
                });
            }
        });

        // Sort by priority
        alerts.sort((a, b) => a.priority - b.priority);

        // Apply filter
        let filtered = alerts;
        if (filter === 'struggling') filtered = alerts.filter(a => a.type === 'struggling');
        else if (filter === 'milestones') filtered = alerts.filter(a => a.type === 'milestones');
        else if (filter === 'inactive') filtered = alerts.filter(a => a.type === 'inactive');

        // Update badge
        const badge = document.getElementById('alert-count-badge');
        const mobileBadge = document.getElementById('mobile-alert-badge');
        const urgentCount = alerts.filter(a => a.type === 'struggling' || a.type === 'inactive').length;
        if (badge) {
            badge.textContent = urgentCount;
            badge.style.display = urgentCount > 0 ? '' : 'none';
        }
        if (mobileBadge) {
            mobileBadge.textContent = urgentCount;
            mobileBadge.style.display = urgentCount > 0 ? '' : 'none';
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:30px;color:#95a5a6;">
                    <i class="fas fa-check-circle" style="font-size:32px;margin-bottom:10px;display:block;color:#27ae60;"></i>
                    <p style="margin:0;">All clear! No alerts right now.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(alert => {
            const alertClass = alert.type === 'struggling' ? 'alert-struggle' :
                               alert.type === 'inactive' ? 'alert-inactive' : 'alert-milestone';
            return `
                <div class="smart-alert-item ${alertClass}">
                    <div class="smart-alert-message">${alert.message}</div>
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                        <button class="smart-alert-action ${alert.actionClass}"
                                data-action="${alert.actionType}"
                                data-student-id="${alert.student._id}"
                                data-student-name="${escapeHtml(`${alert.student.firstName || ''} ${alert.student.lastName || ''}`.trim() || alert.student.username)}">
                            <i class="fas fa-${alert.actionType === 'celebrate' ? 'trophy' : alert.actionType === 'remind' ? 'bell' : 'heart'}"></i>
                            ${alert.actionLabel}
                        </button>
                        <button class="smart-alert-action" style="background:#f0f0f0;color:#555;"
                                data-action="view"
                                data-student-id="${alert.student._id}">
                            <i class="fas fa-user"></i> Profile
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Wire up alert action buttons
        container.querySelectorAll('.smart-alert-action').forEach(btn => {
            btn.addEventListener('click', handleSmartAlertAction);
        });
    }

    function handleSmartAlertAction(event) {
        const btn = event.target.closest('.smart-alert-action');
        if (!btn) return;

        const action = btn.dataset.action;
        const studentId = btn.dataset.studentId;
        const studentName = btn.dataset.studentName;

        if (action === 'view') {
            openStudentProfile(studentId);
            return;
        }

        if (action === 'encourage' || action === 'remind' || action === 'celebrate') {
            // Pre-fill announcement for this student
            const announcementsTabBtn = document.querySelector('[data-tab="announcements"]');
            if (announcementsTabBtn) announcementsTabBtn.click();

            // Set target to individual and pre-fill
            setTimeout(() => {
                const targetSelect = document.getElementById('announcement-target');
                const titleInput = document.getElementById('announcement-title');
                const bodyInput = document.getElementById('announcement-body');

                if (targetSelect) {
                    targetSelect.value = 'individual';
                    targetSelect.dispatchEvent(new Event('change'));
                }

                if (action === 'encourage' && titleInput && bodyInput) {
                    titleInput.value = `Keep going, ${studentName}!`;
                    bodyInput.value = `Hey ${studentName}, I noticed you've been working hard. Keep it up! Let me know if you need help with anything.`;
                } else if (action === 'remind' && titleInput && bodyInput) {
                    titleInput.value = `We miss you, ${studentName}!`;
                    bodyInput.value = `Hey ${studentName}, I noticed you haven't logged in for a while. Jump back in when you can - there's great stuff waiting for you!`;
                } else if (action === 'celebrate' && titleInput && bodyInput) {
                    titleInput.value = `Amazing work, ${studentName}!`;
                    bodyInput.value = `Congratulations ${studentName}! You've been making incredible progress. Keep pushing forward!`;
                }

                // Try to check the student's checkbox
                setTimeout(() => {
                    const checkbox = document.querySelector(`#student-checkboxes input[value="${studentId}"]`);
                    if (checkbox) checkbox.checked = true;
                }, 200);
            }, 100);

            showToast(`Drafting message for ${studentName}`, 'success');
        }
    }

    // ============================================
    // MOBILE NAVIGATION
    // ============================================

    function initializeMobileNav() {
        const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
        const alertsDrawer = document.getElementById('mobile-alerts-drawer');
        const actionsDrawer = document.getElementById('mobile-actions-drawer');

        mobileNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.mobileTab;
                mobileNavBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Close drawers
                if (alertsDrawer) alertsDrawer.classList.remove('open');
                if (actionsDrawer) actionsDrawer.classList.remove('open');

                if (tab === 'students') {
                    document.querySelector('[data-tab="students"]')?.click();
                } else if (tab === 'alerts') {
                    if (alertsDrawer) alertsDrawer.classList.add('open');
                    // Copy alert content to mobile drawer
                    const mobileContent = document.getElementById('mobile-alerts-content');
                    const desktopAlerts = document.getElementById('smart-alerts-feed');
                    if (mobileContent && desktopAlerts) {
                        mobileContent.innerHTML = desktopAlerts.innerHTML;
                    }
                } else if (tab === 'curriculum') {
                    document.querySelector('[data-tab="curriculum"]')?.click();
                } else if (tab === 'actions') {
                    if (actionsDrawer) actionsDrawer.classList.add('open');
                }
            });
        });

        // Close drawer buttons
        document.getElementById('close-alerts-drawer')?.addEventListener('click', () => {
            if (alertsDrawer) alertsDrawer.classList.remove('open');
        });
        document.getElementById('close-actions-drawer')?.addEventListener('click', () => {
            if (actionsDrawer) actionsDrawer.classList.remove('open');
        });

        // Mobile action buttons
        document.getElementById('mobile-ai-settings')?.addEventListener('click', () => {
            document.getElementById('qa-ai-settings')?.click();
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-export')?.addEventListener('click', () => {
            exportStudentData();
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-upload')?.addEventListener('click', () => {
            document.querySelector('[data-tab="resources"]')?.click();
            const uploadModal = document.getElementById('upload-resource-modal');
            if (uploadModal) uploadModal.classList.add('is-visible');
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-refresh')?.addEventListener('click', async () => {
            await fetchAssignedStudents();
            showToast('Data refreshed!', 'success');
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-messages')?.addEventListener('click', () => {
            document.querySelector('[data-tab="messages"]')?.click();
            actionsDrawer?.classList.remove('open');
        });
    }

    // ============================================
    // FETCH CLASSES FOR GROUPING
    // ============================================

    async function fetchClassesForGrouping() {
        try {
            const response = await fetch('/api/teacher/classes');
            if (!response.ok) return;
            const data = await response.json();
            classesData = data.classes || [];
            // Update class count badge in tab
            const classCountEl = document.getElementById('tab-class-count');
            if (classCountEl) classCountEl.textContent = `(${classesData.length})`;
            renderClassChips();
        } catch (err) {
            console.log('Could not load classes for grouping:', err.message);
        }
    }

    // ============================================
    // CLASS-CHIP RAIL — scope the student list to one class
    // ============================================
    //
    // Paints one pill per class above the student list. "All Classes"
    // is the default; clicking a class chip sets selectedClassId, which
    // filterStudents() reads to scope the visible roster. Rail is
    // hidden when the teacher has fewer than 2 classes (no value-add).
    //
    // Counts on each chip reflect class membership only (not the
    // status filter), so a teacher can see roster size at a glance
    // before drilling in.
    function renderClassChips() {
        const rail = document.getElementById('class-chip-rail');
        if (!rail) return;

        // Hide the rail until there are 2+ classes — a single class
        // means nothing to scope away.
        if (!classesData || classesData.length < 2) {
            rail.hidden = true;
            rail.innerHTML = '';
            return;
        }
        rail.hidden = false;

        const inAnyClass = new Set();
        classesData.forEach(c => (c.studentIds || []).forEach(id => inAnyClass.add(id)));
        const unassignedCount = currentStudentsData.filter(s => !inAnyClass.has(s._id)).length;

        const chips = [
            { id: null, label: 'All Classes', count: currentStudentsData.length, icon: 'fa-layer-group' }
        ];
        classesData.forEach(c => {
            chips.push({
                id: c._id,
                label: c.className || 'Untitled Class',
                count: Array.isArray(c.studentIds) ? c.studentIds.length : 0,
                icon: 'fa-chalkboard'
            });
        });
        if (unassignedCount > 0) {
            chips.push({ id: '__unassigned__', label: 'Unassigned', count: unassignedCount, icon: 'fa-user-slash' });
        }

        rail.innerHTML = chips.map(chip => {
            const isActive = (chip.id === selectedClassId) || (chip.id === null && selectedClassId === null);
            return `
                <button type="button" class="class-chip${isActive ? ' active' : ''}"
                        role="tab" aria-selected="${isActive}"
                        data-class-id="${chip.id === null ? '' : chip.id}"
                        title="${escapeHtml(chip.label)}">
                    <i class="fas ${chip.icon}" aria-hidden="true"></i>
                    <span>${escapeHtml(chip.label)}</span>
                    <span class="class-chip-count">${chip.count}</span>
                </button>
            `;
        }).join('');

        // Wire chip clicks. Each chip carries its target classId in
        // dataset; clicking sets state and re-renders the student list
        // through the existing pipeline (search/filter/sort already
        // applied on top of the new class scope).
        rail.querySelectorAll('.class-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.getAttribute('data-class-id') || '';
                setSelectedClass(raw === '' ? null : raw);
            });
        });
    }

    function setSelectedClass(classId) {
        selectedClassId = classId;
        // Re-render chips so the active state moves
        renderClassChips();
        // Re-render student list through the existing pipeline. Read
        // the current search/filter values straight from the inputs
        // so the new class scope composes with whatever's already set.
        const searchEl = document.getElementById('student-search');
        const filterEl = document.getElementById('student-filter');
        const searchQuery = searchEl ? searchEl.value : '';
        const filterType = filterEl ? filterEl.value : 'all';
        renderStudentList(currentStudentsData, filterType, searchQuery);
    }

    // ============================================
    // MY CLASSES TAB (kept for backwards compat)
    // ============================================

    let classesLoaded = false;
    const classesListDiv = document.getElementById('classes-list');

    async function fetchClasses() {
        if (!classesListDiv) return;
        classesListDiv.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading classes...</div>';
        try {
            const response = await fetch('/api/teacher/classes');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            classesLoaded = true;
            renderClasses(data.classes || []);
        } catch (err) {
            console.error('Error fetching classes:', err);
            classesListDiv.innerHTML = '<p style="padding: 20px; color: #e74c3c; text-align: center;">Error loading classes. Please refresh.</p>';
        }
    }

    function renderClasses(classes) {
        if (!classesListDiv) return;

        if (classes.length === 0) {
            classesListDiv.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #888;">
                    <i class="fas fa-chalkboard-teacher" style="font-size: 48px; color: #ddd; margin-bottom: 16px; display: block;"></i>
                    <h3 style="margin: 0 0 8px; color: #666;">No Classes Yet</h3>
                    <p style="margin: 0; font-size: 14px;">Classes are created when an administrator generates an enrollment code for you.<br>Contact your school admin to get started.</p>
                </div>
            `;
            return;
        }

        classesListDiv.innerHTML = '';
        classes.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'class-card';
            card.style.cssText = 'border: 1px solid #e8ecf1; border-radius: 12px; margin-bottom: 14px; overflow: hidden; transition: box-shadow 0.2s;';
            card.addEventListener('mouseenter', () => card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)');
            card.addEventListener('mouseleave', () => card.style.boxShadow = 'none');

            const statusBadge = cls.isActive
                ? '<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">Active</span>'
                : '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">Inactive</span>';

            card.innerHTML = `
                <div style="padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" class="class-card-header" data-code-id="${cls._id}">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-chalkboard-teacher" style="color: white; font-size: 18px;"></i>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 16px; color: #2c3e50;">${escapeHtml(cls.className)} ${statusBadge}</div>
                            <div style="font-size: 13px; color: #888; margin-top: 2px;">
                                Code: <strong style="font-family: monospace; color: #667eea;">${escapeHtml(cls.code)}</strong>
                                ${cls.gradeLevel ? ` · Grade ${escapeHtml(cls.gradeLevel)}` : ''}
                                ${cls.mathCourse ? ` · ${escapeHtml(cls.mathCourse)}` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 20px;">
                        <div style="text-align: center;">
                            <div style="font-size: 22px; font-weight: 700; color: #2c3e50;">${cls.studentCount}</div>
                            <div style="font-size: 11px; color: #888; text-transform: uppercase;">Students</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 22px; font-weight: 700; color: #27ae60;">${cls.activeCount}</div>
                            <div style="font-size: 11px; color: #888; text-transform: uppercase;">Active</div>
                        </div>
                        <i class="fas fa-chevron-down class-expand-icon" style="color: #bbb; transition: transform 0.2s;"></i>
                    </div>
                </div>
                <div class="class-students-panel" data-panel-for="${cls._id}" style="display: none; border-top: 1px solid #e8ecf1; padding: 16px 20px; background: #fafbfc;">
                    <div style="text-align: center; color: #999; padding: 10px;"><i class="fas fa-spinner fa-spin"></i> Loading students...</div>
                </div>
            `;

            // Click to expand/collapse student list
            const header = card.querySelector('.class-card-header');
            header.addEventListener('click', () => toggleClassStudents(cls._id, card));

            classesListDiv.appendChild(card);
        });
    }

    async function toggleClassStudents(codeId, card) {
        const panel = card.querySelector(`[data-panel-for="${codeId}"]`);
        const icon = card.querySelector('.class-expand-icon');
        if (!panel) return;

        const isOpen = panel.style.display !== 'none';
        if (isOpen) {
            panel.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
            return;
        }

        panel.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(180deg)';

        // Skip fetch if already loaded
        if (panel.dataset.loaded === 'true') return;

        try {
            const response = await fetch(`/api/teacher/classes/${codeId}/students`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            panel.dataset.loaded = 'true';
            renderClassStudents(panel, data.students || []);
        } catch (err) {
            console.error('Error fetching class students:', err);
            panel.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading students.</p>';
        }
    }

    function renderClassStudents(panel, students) {
        if (students.length === 0) {
            panel.innerHTML = '<p style="color: #888; text-align: center; padding: 10px;">No students enrolled in this class yet.</p>';
            return;
        }

        const now = new Date();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const rows = students.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            const lastLogin = s.lastLogin ? new Date(s.lastLogin) : null;
            const isActive = lastLogin && lastLogin > sevenDaysAgo;
            const lastLoginText = lastLogin
                ? lastLogin.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Never';
            const statusDot = isActive
                ? '<span style="width:8px;height:8px;border-radius:50%;background:#27ae60;display:inline-block;margin-right:6px;" title="Active"></span>'
                : '<span style="width:8px;height:8px;border-radius:50%;background:#e0e0e0;display:inline-block;margin-right:6px;" title="Inactive"></span>';

            return `
                <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="padding: 10px 12px; font-size: 14px;">${statusDot}${escapeHtml(name)}</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${escapeHtml(s.username || '')}</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${s.gradeLevel || '—'}</td>
                    <td style="padding: 10px 12px; font-size: 13px;">Lv ${s.level || 1}</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${s.weeklyActiveTutoringMinutes || 0} min</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${lastLoginText}</td>
                </tr>
            `;
        }).join('');

        panel.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #e8ecf1;">
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Name</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Username</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Grade</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Level</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">This Week</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Last Login</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // THEMED CONFIRM DIALOG (replaces native alert/confirm/prompt)
    // ============================================

    window.showConfirmDialog = function({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning', showInput = false, inputPlaceholder = '' }) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('confirm-dialog-overlay');
            const titleEl = document.getElementById('confirm-dialog-title');
            const messageEl = document.getElementById('confirm-dialog-message');
            const confirmBtn = document.getElementById('confirm-dialog-confirm');
            const cancelBtn = document.getElementById('confirm-dialog-cancel');
            const iconEl = document.getElementById('confirm-dialog-icon');
            const iconI = document.getElementById('confirm-dialog-icon-i');
            const inputEl = document.getElementById('confirm-dialog-input');

            titleEl.textContent = title;
            messageEl.textContent = message;
            confirmBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            // Icon type
            iconEl.className = `confirm-dialog-icon icon-${type}`;
            const iconMap = { warning: 'fa-exclamation-triangle', danger: 'fa-trash-alt', info: 'fa-info-circle' };
            iconI.className = `fas ${iconMap[type] || iconMap.warning}`;

            // Confirm button style
            if (type === 'danger') {
                confirmBtn.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
            } else {
                confirmBtn.style.background = '';
            }

            // Input
            inputEl.style.display = showInput ? 'block' : 'none';
            inputEl.placeholder = inputPlaceholder;
            inputEl.value = '';

            overlay.classList.add('is-visible');

            function cleanup(result) {
                overlay.classList.remove('is-visible');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                overlay.removeEventListener('click', onOverlay);
                resolve(result);
            }

            function onConfirm() { cleanup(showInput ? inputEl.value : true); }
            function onCancel() { cleanup(showInput ? null : false); }
            function onOverlay(e) { if (e.target === overlay) cleanup(showInput ? null : false); }

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            overlay.addEventListener('click', onOverlay);

            if (showInput) {
                setTimeout(() => inputEl.focus(), 100);
            } else {
                setTimeout(() => confirmBtn.focus(), 100);
            }
        });
    };

    // ============================================
    // TAB SCROLL INDICATORS
    // ============================================

    function initializeTabScrollIndicators() {
        const tabsContainer = document.getElementById('dashboard-tabs');
        if (!tabsContainer) return;

        // Wrap the tabs in a scroll indicator wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'tabs-wrapper';
        tabsContainer.parentNode.insertBefore(wrapper, tabsContainer);
        wrapper.appendChild(tabsContainer);

        function updateScrollIndicators() {
            const { scrollLeft, scrollWidth, clientWidth } = tabsContainer;
            wrapper.classList.toggle('can-scroll-left', scrollLeft > 5);
            wrapper.classList.toggle('can-scroll-right', scrollLeft + clientWidth < scrollWidth - 5);
        }

        tabsContainer.addEventListener('scroll', updateScrollIndicators);
        window.addEventListener('resize', updateScrollIndicators);
        setTimeout(updateScrollIndicators, 100);
    }

    initializeTabScrollIndicators();

    // ============================================
    // INSIGHTS TAB - SKILL GAPS & LESSON PLANNER
    // ============================================

    let skillGapsData = [];
    let lessonPlannerHistory = [];
    let insightsLoaded = false;
    let classSnapshotData = null;

    function initializeInsightsTab() {
        // Gap filter chips
        document.querySelectorAll('[data-gap-filter]').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('[data-gap-filter]').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                renderSkillGaps(skillGapsData, chip.dataset.gapFilter);
            });
        });

        // Suggestion chips
        document.querySelectorAll('.planner-suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.dataset.prompt;
                document.getElementById('planner-input').value = prompt;
                sendLessonPlannerMessage(prompt);
            });
        });

        // Send button
        const sendBtn = document.getElementById('planner-send-btn');
        const input = document.getElementById('planner-input');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                const prompt = input.value.trim();
                if (prompt) sendLessonPlannerMessage(prompt);
            });
        }
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const prompt = input.value.trim();
                    if (prompt) sendLessonPlannerMessage(prompt);
                }
            });
        }

        // Fetch class snapshot for dynamic context chips
        fetchClassSnapshot();
    }

    async function fetchClassSnapshot() {
        try {
            const res = await fetch('/api/teacher/class-snapshot');
            if (!res.ok) return;
            classSnapshotData = await res.json();
            renderContextChips(classSnapshotData);
        } catch (err) {
            console.error('Error fetching class snapshot:', err);
        }
    }

    function renderContextChips(snapshot) {
        const container = document.getElementById('planner-context-chips');
        if (!container) return;

        const chips = [];

        // Students needing attention
        if (snapshot.needsAttention && snapshot.needsAttention.length > 0) {
            snapshot.needsAttention.slice(0, 3).forEach(s => {
                chips.push(`<button class="planner-context-chip" data-prompt="Tell me about ${s.name}. What's going on with them and what should I do?">
                    <i class="fas fa-user-clock"></i> ${escapeHtml(s.name)}: ${escapeHtml(s.reasons[0])}
                </button>`);
            });
        }

        // Inactive students alert
        if (snapshot.inactiveStudents && snapshot.inactiveStudents.length > 0) {
            const names = snapshot.inactiveStudents.slice(0, 3).join(', ');
            chips.push(`<button class="planner-context-chip" data-prompt="These students haven't been active this week: ${names}. How should I re-engage them?">
                <i class="fas fa-exclamation-circle"></i> ${snapshot.inactiveStudents.length} inactive
            </button>`);
        }

        // Rising stars
        if (snapshot.risingStars && snapshot.risingStars.length > 0) {
            chips.push(`<button class="planner-context-chip chip-growth" data-prompt="These students are showing growth: ${snapshot.risingStars.join(', ')}. How can I keep their momentum going and extend their learning?">
                <i class="fas fa-chart-line"></i> ${snapshot.risingStars.length} growing
            </button>`);
        }

        // IEP students
        if (snapshot.iepStudents && snapshot.iepStudents.length > 0) {
            chips.push(`<button class="planner-context-chip chip-iep" data-prompt="Review my IEP students: ${snapshot.iepStudents.join(', ')}. How are they progressing toward their goals and what accommodations should I make sure are in place this week?">
                <i class="fas fa-file-medical-alt"></i> ${snapshot.iepStudents.length} IEP students
            </button>`);
        }

        if (chips.length > 0) {
            container.innerHTML = chips.join('');
            container.style.display = 'flex';

            // Add click handlers
            container.querySelectorAll('.planner-context-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const prompt = chip.dataset.prompt;
                    document.getElementById('planner-input').value = prompt;
                    sendLessonPlannerMessage(prompt);
                });
            });
        }
    }

    async function fetchSkillGaps() {
        try {
            // Fetch skill gaps and course progress in parallel
            const [gapsRes, courseRes] = await Promise.all([
                fetch('/api/teacher/class-skill-gaps'),
                fetch('/api/teacher/course-progress')
            ]);

            if (gapsRes.ok) {
                const data = await gapsRes.json();
                skillGapsData = data.gaps || [];
                renderSkillGaps(skillGapsData, 'all');
            }

            if (courseRes.ok) {
                const courseData = await courseRes.json();
                renderCourseProgress(courseData.courses || []);
            }

            insightsLoaded = true;
        } catch (err) {
            console.error('Error fetching skill gaps:', err);
            const container = document.getElementById('skill-gaps-list');
            if (container) {
                container.innerHTML = `
                    <div class="skill-gap-empty">
                        <i class="fas fa-chart-bar"></i>
                        <p>No skill data available yet. Skills will appear here as students practice.</p>
                    </div>
                `;
            }
        }
    }

    function renderSkillGaps(gaps, filter = 'all') {
        const container = document.getElementById('skill-gaps-list');
        if (!container) return;

        let filtered = gaps;
        if (filter === 'critical') {
            filtered = gaps.filter(g => g.notMasteredCount > g.totalStudents * 0.5);
        } else if (filter === 'progressing') {
            filtered = gaps.filter(g => g.learning > 0 && g.notMasteredCount <= g.totalStudents * 0.5);
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="skill-gap-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>${filter === 'all' ? 'No skill data yet. Skills will appear as students practice.' : 'No skills match this filter.'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(gap => {
            const masteredPct = (gap.mastered / gap.totalStudents * 100).toFixed(0);
            const learningPct = (gap.learning / gap.totalStudents * 100).toFixed(0);
            const notStartedPct = (100 - parseFloat(masteredPct) - parseFloat(learningPct)).toFixed(0);
            const categoryLabel = gap.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            return `
                <div class="skill-gap-item" role="listitem" data-skill-id="${gap.skillId}" tabindex="0"
                     aria-label="${gap.displayName}: ${gap.mastered} of ${gap.totalStudents} mastered">
                    <div class="skill-gap-top">
                        <span class="skill-gap-name">${escapeHtml(gap.displayName)}</span>
                        <span class="skill-gap-category">${escapeHtml(categoryLabel)}</span>
                    </div>
                    <div class="skill-gap-bar-container" role="progressbar"
                         aria-valuenow="${masteredPct}" aria-valuemin="0" aria-valuemax="100"
                         aria-label="${masteredPct}% mastered">
                        <div class="skill-gap-bar-mastered" style="width: ${masteredPct}%"></div>
                        <div class="skill-gap-bar-learning" style="width: ${learningPct}%"></div>
                        <div class="skill-gap-bar-not-started" style="width: ${notStartedPct}%"></div>
                    </div>
                    <div class="skill-gap-meta">
                        <span><strong>${gap.mastered}</strong> mastered</span>
                        <span><strong>${gap.learning}</strong> learning</span>
                        <span><strong>${gap.notMasteredCount}</strong> not mastered</span>
                        ${gap.avgMasteryScore > 0 ? `<span>Avg: <strong>${gap.avgMasteryScore}%</strong></span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Click to ask about a skill
        container.querySelectorAll('.skill-gap-item').forEach(item => {
            item.addEventListener('click', () => {
                const skillId = item.dataset.skillId;
                const gap = skillGapsData.find(g => g.skillId === skillId);
                if (gap) {
                    const prompt = `Help me plan a mini-lesson for "${gap.displayName}". ${gap.mastered} of ${gap.totalStudents} students who attempted it have mastered it, and ${gap.learning} are currently learning. What's the best approach?`;
                    document.getElementById('planner-input').value = prompt;
                    sendLessonPlannerMessage(prompt);
                }
            });

            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') item.click();
            });
        });
    }

    async function sendLessonPlannerMessage(prompt) {
        const responseArea = document.getElementById('planner-response');
        const input = document.getElementById('planner-input');
        const sendBtn = document.getElementById('planner-send-btn');
        if (!responseArea) return;

        // Disable input while generating
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        // Show user message and typing indicator
        const userBubble = `<div style="background:var(--color-primary-light);padding:10px 14px;border-radius:var(--radius-md);margin-bottom:12px;font-weight:500;color:var(--color-text);">
            <i class="fas fa-chalkboard-teacher" style="color:var(--color-primary);margin-right:6px;" aria-hidden="true"></i>${escapeHtml(prompt)}
        </div>`;

        // If this is the first message, clear the empty state
        if (lessonPlannerHistory.length === 0) {
            responseArea.innerHTML = '';
        }

        responseArea.innerHTML += userBubble;
        responseArea.innerHTML += `<div id="planner-typing" class="planner-typing-indicator"><span></span><span></span><span></span></div>`;
        responseArea.scrollTop = responseArea.scrollHeight;

        lessonPlannerHistory.push({ role: 'user', content: prompt });

        try {
            // Use csrfFetch if available, otherwise fall back to plain fetch
            const fetchFn = typeof csrfFetch === 'function' ? csrfFetch : fetch;
            const response = await fetchFn('/api/teacher/lesson-planner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    prompt,
                    skillGaps: skillGapsData.slice(0, 10),
                    conversationHistory: lessonPlannerHistory.slice(-12)
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // Remove typing indicator
            const typing = document.getElementById('planner-typing');
            if (typing) typing.remove();

            // Create response container
            const aiDiv = document.createElement('div');
            aiDiv.style.cssText = 'margin-bottom:16px;padding:14px;background:white;border-radius:var(--radius-md);border:1px solid var(--color-border);';
            aiDiv.innerHTML = '<i class="fas fa-chalkboard-teacher" style="color:var(--color-purple);margin-right:6px;" aria-hidden="true"></i>';
            responseArea.appendChild(aiDiv);

            // Stream the response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.text) {
                                fullResponse += parsed.text;
                                aiDiv.innerHTML = '<i class="fas fa-chalkboard-teacher" style="color:var(--color-purple);margin-right:6px;" aria-hidden="true"></i>' + renderMarkdown(fullResponse);
                                responseArea.scrollTop = responseArea.scrollHeight;
                            }
                        } catch (e) { /* skip invalid JSON */ }
                    }
                }
            }

            lessonPlannerHistory.push({ role: 'assistant', content: fullResponse });

        } catch (err) {
            console.error('Lesson planner error:', err);
            const typing = document.getElementById('planner-typing');
            if (typing) typing.remove();
            responseArea.innerHTML += `<div style="color:var(--color-danger);padding:10px;">
                <i class="fas fa-exclamation-circle"></i> Sorry, I couldn't generate a response. Please try again.
            </div>`;
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }

    // Simple markdown renderer for AI responses
    function renderMarkdown(text) {
        return text
            .replace(/#### (.+)/g, '<h4>$1</h4>')
            .replace(/### (.+)/g, '<h4>$1</h4>')
            .replace(/## (.+)/g, '<h4>$1</h4>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
    }

    function renderCourseProgress(courses) {
        const container = document.getElementById('course-progress-cards');
        if (!container) return;

        if (courses.length === 0) {
            container.innerHTML = `
                <div class="course-progress-empty">
                    <i class="fas fa-graduation-cap" style="font-size:1.5em;opacity:0.4;display:block;margin-bottom:8px;"></i>
                    Course progress will appear here once students start practicing skills within a course.
                </div>
            `;
            return;
        }

        container.innerHTML = courses.map(course => {
            const studentRows = course.students.slice(0, 5).map(s => `
                <div class="course-student-row">
                    <span>${escapeHtml(s.name)}</span>
                    <span style="display:flex;align-items:center;gap:6px;">
                        <span class="student-bar"><span class="student-bar-fill" style="width:${s.progressPct}%"></span></span>
                        <strong>${s.progressPct}%</strong>
                    </span>
                </div>
            `).join('');

            return `
                <div class="course-card" role="listitem" tabindex="0" aria-label="${course.course}: ${course.avgProgress}% average progress">
                    <div class="course-card-name" title="${escapeHtml(course.course)}">${escapeHtml(course.course)}</div>
                    <div class="course-card-meta">
                        <span>${course.totalSkills} skills</span>
                        <span>${course.activeStudents} student${course.activeStudents !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="course-card-bar">
                        <div class="course-card-bar-fill" style="width: ${course.avgProgress}%"></div>
                    </div>
                    <div class="course-card-stats">
                        <span>Avg: <strong>${course.avgProgress}%</strong></span>
                        <span><strong>${course.totalMastered}</strong> mastered</span>
                    </div>
                    ${studentRows ? `
                        <div class="course-card-expand">
                            ${studentRows}
                            ${course.students.length > 5 ? `<div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px;">+${course.students.length - 5} more</div>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Toggle expand on click
        container.querySelectorAll('.course-card').forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('expanded');
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') card.classList.toggle('expanded');
            });
        });
    }

    // Initialize insights tab (lazy load on first visit)
    initializeInsightsTab();

    // ============================================
    // FIX RIGHT SIDEBAR - Real computed stats
    // ============================================

    function updateRightSidebar(students) {
        // Calculate real stats for today
        const today = new Date().toDateString();
        const loginsToday = students.filter(s => {
            const lastLogin = s.lastLogin ? new Date(s.lastLogin).toDateString() : null;
            return lastLogin === today;
        }).length;

        document.getElementById('summary-logins').textContent = loginsToday;

        // Count students with mastered skills this week
        let recentMastery = 0;
        students.forEach(s => {
            const mastery = s.skillMastery || {};
            Object.values(mastery).forEach(skill => {
                if (skill.masteredDate) {
                    const masteredDate = new Date(skill.masteredDate);
                    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    if (masteredDate > weekAgo) recentMastery++;
                }
            });
        });

        document.getElementById('summary-problems').textContent = recentMastery;
        document.getElementById('summary-time').textContent =
            Math.round(students.reduce((sum, s) => sum + (s.weeklyActiveTutoringMinutes || 0), 0));

        // Milestones - show students who recently mastered skills
        const milestonesDiv = document.getElementById('recent-milestones');
        const milestones = [];
        students.forEach(s => {
            const mastery = s.skillMastery || {};
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            Object.entries(mastery).forEach(([skillId, skill]) => {
                if (skill.status === 'mastered' && skill.masteredDate) {
                    milestones.push({
                        name,
                        skill: skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        date: new Date(skill.masteredDate)
                    });
                }
            });
        });

        // Sort by most recent and take top 5
        milestones.sort((a, b) => b.date - a.date);
        const recentMilestones = milestones.slice(0, 5);

        if (recentMilestones.length > 0) {
            milestonesDiv.innerHTML = recentMilestones.map(m => `
                <div class="milestone-item">
                    <span class="milestone-icon" aria-hidden="true">&#127942;</span>
                    <div class="milestone-content">
                        <div class="milestone-student">${escapeHtml(m.name)}</div>
                        <div class="milestone-text">Mastered ${escapeHtml(m.skill)}</div>
                    </div>
                </div>
            `).join('');
        } else {
            milestonesDiv.innerHTML = '<span class="milestone-empty">No recent skill milestones yet</span>';
        }
    }
});
;
/* --- /js/teacher-transcripts.js --- */
/**
 * teacher-transcripts.js
 *
 * Opens a read-only, Messages-app-style transcript viewer for a single
 * conversation. Teachers can audit tutor turns turn-by-turn. Each tutor turn
 * can render an adjacent "reasoning trace" column once the permission
 * architecture populates conversation.reasoningTrace[]. Until then, the column
 * renders a placeholder.
 *
 * Entry point: window.TranscriptViewer.open(studentId, conversationId, opts)
 *
 * Wire-up: the module auto-delegates clicks from any element with
 * data-conversation-id + data-student-id to open the modal.
 */
(function () {
  'use strict';

  const STATE = {
    modal: null,
    lastTrigger: null,
    showReasoning: false,
    escHandler: null,
    // Flagging context. currentConversationId / currentStudentId are set per
    // open() so the delegated flag handler has what it needs. flaggedTurns
    // tracks turns the reviewer has already flagged in this session so the
    // button reflects state after a successful POST.
    currentConversationId: null,
    currentStudentId: null,
    flaggedTurns: new Set(),
  };

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'className') el.className = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }

  function ensureModal() {
    if (STATE.modal) return STATE.modal;

    const modal = h('div', {
      id: 'transcript-viewer-modal',
      className: 'modal-overlay transcript-viewer-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'transcript-viewer-title',
    });

    const content = h('div', { className: 'modal-content' }, [
      h('span', {
        id: 'transcript-close-btn',
        className: 'modal-close-button',
        role: 'button',
        'aria-label': 'Close transcript viewer',
        tabindex: '0',
      }, '×'),
      h('div', { className: 'transcript-viewer-header' }, [
        h('h2', { id: 'transcript-viewer-title' }, [
          h('i', { className: 'fas fa-comments' }),
          h('span', { id: 'transcript-viewer-title-text' }, 'Transcript'),
        ]),
        h('div', { className: 'transcript-viewer-meta', id: 'transcript-viewer-meta' }),
      ]),
      h('div', { className: 'transcript-viewer-toolbar' }, [
        h('label', { className: 'transcript-toggle' }, [
          h('input', {
            type: 'checkbox',
            id: 'transcript-reasoning-toggle',
            'aria-label': 'Show reasoning trace',
          }),
          h('span', null, 'Show reasoning trace'),
        ]),
        h('span', { id: 'transcript-count' }, ''),
      ]),
      h('div', { className: 'transcript-viewer-body', id: 'transcript-viewer-body' }, [
        h('div', { className: 'transcript-loading' }, [
          h('i', { className: 'fas fa-spinner fa-spin' }),
          h('span', null, 'Loading transcript…'),
        ]),
      ]),
    ]);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close interactions
    const close = () => closeModal();
    content.querySelector('#transcript-close-btn').addEventListener('click', close);
    content.querySelector('#transcript-close-btn').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Reasoning toggle
    content.querySelector('#transcript-reasoning-toggle').addEventListener('change', (e) => {
      STATE.showReasoning = e.target.checked;
      renderBodyFromCache();
    });

    // Flag clicks (delegated inside the modal body)
    content.querySelector('#transcript-viewer-body').addEventListener('click', (e) => {
      const btn = e.target.closest('.transcript-flag-btn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      handleFlagClick(btn);
    });

    STATE.modal = modal;
    return modal;
  }

  async function handleFlagClick(btn) {
    const turnIndex = Number(btn.dataset.turnIndex);
    if (!Number.isFinite(turnIndex) || turnIndex < 0) return;
    if (!STATE.currentConversationId) return;

    const reason = window.prompt(
      "Flag this tutor turn. What looks off? (This gets routed to admin review.)",
      ''
    );
    // prompt() returns null if the reviewer cancelled. Empty string is fine —
    // a no-reason flag is still signal.
    if (reason === null) return;

    btn.disabled = true;
    btn.classList.add('is-submitting');
    const label = btn.querySelector('.transcript-flag-label');
    if (label) label.textContent = 'Flagging…';

    try {
      const res = await fetch('/api/transcript-flags', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: STATE.currentConversationId,
          turnIndex,
          reason: (reason || '').trim(),
        }),
      });
      if (!res.ok) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        throw new Error(body?.message || `Flag failed (${res.status})`);
      }
      STATE.flaggedTurns.add(turnIndex);
      btn.classList.remove('is-submitting');
      btn.classList.add('is-flagged');
      btn.title = 'You already flagged this turn';
      btn.setAttribute('aria-label', 'Turn flagged');
      const icon = btn.querySelector('i');
      if (icon) icon.className = 'fas fa-flag-checkered';
      if (label) label.textContent = 'Flagged';
    } catch (err) {
      console.error('[TranscriptViewer] flag failed', err);
      btn.disabled = false;
      btn.classList.remove('is-submitting');
      if (label) label.textContent = 'Flag';
      window.alert(err.message || 'Could not flag this turn.');
    }
  }

  function closeModal() {
    if (!STATE.modal) return;
    STATE.modal.classList.remove('is-visible');
    if (STATE.escHandler) {
      document.removeEventListener('keydown', STATE.escHandler);
      STATE.escHandler = null;
    }
    if (STATE.lastTrigger && typeof STATE.lastTrigger.focus === 'function') {
      STATE.lastTrigger.focus();
    }
  }

  function openModal(triggerEl) {
    const modal = ensureModal();
    STATE.lastTrigger = triggerEl || null;
    modal.classList.add('is-visible');
    STATE.escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', STATE.escHandler);
    // Focus the close button so Esc/Enter works immediately for keyboard users.
    const closeBtn = modal.querySelector('#transcript-close-btn');
    if (closeBtn) closeBtn.focus();
  }

  function setBody(nodeOrHtml) {
    const body = STATE.modal.querySelector('#transcript-viewer-body');
    body.innerHTML = '';
    if (typeof nodeOrHtml === 'string') body.innerHTML = nodeOrHtml;
    else if (nodeOrHtml instanceof Node) body.appendChild(nodeOrHtml);
  }

  let CACHED_PAYLOAD = null;

  function renderBodyFromCache() {
    if (!CACHED_PAYLOAD) return;
    renderPayload(CACHED_PAYLOAD);
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch { return ''; }
  }

  function formatDateOnly(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleDateString(); } catch { return ''; }
  }

  function renderHeader(student, conversation) {
    const titleText = STATE.modal.querySelector('#transcript-viewer-title-text');
    const meta = STATE.modal.querySelector('#transcript-viewer-meta');
    const count = STATE.modal.querySelector('#transcript-count');

    const name = student
      ? [student.firstName, student.lastName].filter(Boolean).join(' ') || student.username || 'Student'
      : 'Student';
    const convoName = conversation.customName || conversation.conversationName || conversation.topic || 'Math session';
    titleText.textContent = `${name} — ${convoName}`;

    meta.innerHTML = '';
    const date = conversation.startDate ? formatDateOnly(conversation.startDate) : '';
    if (date) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-calendar' }), ` ${date}`]));
    }
    if (conversation.activeMinutes != null) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-clock' }), ` ${conversation.activeMinutes} min`]));
    }
    if (conversation.topic) {
      meta.appendChild(h('span', null, [
        h('i', { className: 'fas fa-tag' }),
        ` ${conversation.topicEmoji || ''} ${conversation.topic}`.trim(),
      ]));
    }
    if (conversation.conversationType) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-layer-group' }), ` ${conversation.conversationType}`]));
    }

    const msgs = Array.isArray(conversation.messages) ? conversation.messages : [];
    count.textContent = msgs.length
      ? `${msgs.length} turn${msgs.length === 1 ? '' : 's'}`
      : '';
  }

  function problemResultChip(result) {
    if (!result) return null;
    const label = result === 'correct' ? 'Correct'
      : result === 'incorrect' ? 'Incorrect'
      : result === 'skipped' ? 'Skipped' : result;
    const icon = result === 'correct' ? 'fa-check'
      : result === 'incorrect' ? 'fa-xmark' : 'fa-forward';
    return h('span', { className: `transcript-chip ${result}` }, [
      h('i', { className: `fas ${icon}` }),
      ` ${label}`,
    ]);
  }

  function reactionChip(reaction) {
    if (!reaction) return null;
    return h('span', { className: 'transcript-chip reaction', title: 'Student reaction' }, reaction);
  }

  function renderBubble(msg, idx) {
    // Role → bubble class. The schema allows 'user' | 'assistant' | 'system'.
    // We surface 'system' in a muted style; it's rare but can occur in older
    // conversations (e.g. proactive nudges stored as system messages).
    const role = msg.role === 'user' ? 'student'
      : msg.role === 'assistant' ? 'tutor'
      : 'system';
    const bubble = h('div', { className: `transcript-bubble ${role}` });
    bubble.appendChild(document.createTextNode(msg.content || ''));

    const metaRow = h('div', { className: 'transcript-bubble-meta' });
    const chips = [];
    if (role === 'tutor' && msg.problemResult) chips.push(problemResultChip(msg.problemResult));
    if (msg.reaction) chips.push(reactionChip(msg.reaction));
    chips.filter(Boolean).forEach(c => metaRow.appendChild(c));
    if (msg.timestamp) {
      metaRow.appendChild(h('span', { title: new Date(msg.timestamp).toISOString() }, formatTimestamp(msg.timestamp)));
    }
    // Flag affordance — tutor turns only. The backend enforces that too, but
    // hiding the button on student turns matches the product intent: the
    // reviewer is auditing what the tutor said, not the student.
    if (role === 'tutor') {
      const already = STATE.flaggedTurns.has(idx);
      const flagBtn = h('button', {
        type: 'button',
        className: `transcript-flag-btn${already ? ' is-flagged' : ''}`,
        'data-turn-index': String(idx),
        'aria-label': already ? 'Turn flagged' : 'Flag this moment',
        title: already ? 'You already flagged this turn' : 'Flag this moment',
        disabled: already,
      }, [
        h('i', { className: `fas ${already ? 'fa-flag-checkered' : 'fa-flag'}` }),
        h('span', { className: 'transcript-flag-label' }, already ? 'Flagged' : 'Flag'),
      ]);
      metaRow.appendChild(flagBtn);
    }
    if (metaRow.childNodes.length > 0) bubble.appendChild(metaRow);
    return bubble;
  }

  function renderReasoningCell(msg, trace) {
    // Reasoning is a tutor-turn concept; no reasoning for student turns.
    if (msg.role !== 'assistant') return h('div');

    const cell = h('div', { className: 'transcript-reasoning' }, [
      h('div', { className: 'transcript-reasoning-header' }, [
        h('i', { className: 'fas fa-diagram-project' }),
        h('span', null, 'Pipeline rationale'),
      ]),
    ]);

    if (!trace || (!trace.rationale && !trace.state && !trace.action)) {
      cell.appendChild(h('div', { className: 'transcript-reasoning-placeholder' },
        'Reasoning data coming soon — this column will show the pipeline state, chosen action, and rationale once the permission architecture ships.'));
      return cell;
    }

    const rows = [
      ['State', trace.state],
      ['Action', trace.action],
      ['Pattern', trace.utterance_pattern || trace.pattern],
      ['Goal', trace.goal_link || trace.goalLink],
      ['Rationale', trace.rationale],
    ];
    rows.forEach(([label, value]) => {
      if (!value) return;
      cell.appendChild(h('div', { className: 'transcript-reasoning-row' }, [
        h('strong', null, `${label}:`),
        h('span', null, String(value)),
      ]));
    });

    return cell;
  }

  function indexReasoningByTurn(traceArray) {
    const map = new Map();
    if (!Array.isArray(traceArray)) return map;
    traceArray.forEach((t) => {
      if (typeof t?.turn === 'number') map.set(t.turn, t);
    });
    return map;
  }

  function renderPayload(payload) {
    const { student, conversation } = payload;
    renderHeader(student, conversation);

    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    if (messages.length === 0) {
      setBody(h('div', { className: 'transcript-empty' }, 'This conversation has no messages.'));
      return;
    }

    const reasoningByTurn = indexReasoningByTurn(conversation.reasoningTrace);
    const container = h('div', { className: 'transcript-timeline' });

    // assistantTurnCounter: reasoningTrace is written once per tutor turn
    // (per spec §6), not per message, so trace[n] maps to the n-th assistant
    // message. We also tolerate trace entries keyed by absolute message index
    // via indexReasoningByTurn (whichever the pipeline ends up using).
    let assistantTurnCounter = -1;

    messages.forEach((msg, idx) => {
      if (msg.role === 'assistant') assistantTurnCounter += 1;

      const showReasoningForTurn = STATE.showReasoning && msg.role === 'assistant';
      const turnRow = h('div', {
        className: `transcript-turn${showReasoningForTurn ? ' with-reasoning' : ''}`,
        role: 'listitem',
        'data-turn-index': String(idx),
      });
      turnRow.appendChild(renderBubble(msg, idx));
      if (showReasoningForTurn) {
        const trace = reasoningByTurn.get(idx) || reasoningByTurn.get(assistantTurnCounter);
        turnRow.appendChild(renderReasoningCell(msg, trace));
      }
      container.appendChild(turnRow);
    });

    setBody(container);

    // If the caller asked us to focus a specific turn (e.g. admin opened this
    // transcript from a flag), scroll it into view and briefly highlight so
    // the reviewer's eye lands on the right place.
    if (STATE.pendingScrollTurnIndex != null) {
      const idx = STATE.pendingScrollTurnIndex;
      STATE.pendingScrollTurnIndex = null;
      // Defer to the next frame so the body has laid out before we scroll.
      requestAnimationFrame(() => {
        const target = container.querySelector(`.transcript-turn[data-turn-index="${idx}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('transcript-turn-highlight');
        setTimeout(() => target.classList.remove('transcript-turn-highlight'), 2200);
      });
    }
  }

  async function fetchTranscript(studentId, conversationId, { role } = {}) {
    // Admin users share the same viewer but hit the admin endpoint so that
    // access is logged under administrative_oversight rather than
    // teaching_instruction. role is detected from window.currentUser.role in
    // the auto-wiring path below.
    const base = role === 'admin' ? '/api/admin' : '/api/teacher';
    const url = `${base}/students/${encodeURIComponent(studentId)}/conversations/${encodeURIComponent(conversationId)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const err = new Error(body?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return res.json();
  }

  async function open(studentId, conversationId, opts = {}) {
    if (!studentId || !conversationId) {
      console.warn('[TranscriptViewer] open() requires studentId and conversationId');
      return;
    }

    openModal(opts.triggerEl || null);
    setBody(h('div', { className: 'transcript-loading' }, [
      h('i', { className: 'fas fa-spinner fa-spin' }),
      h('span', null, 'Loading transcript…'),
    ]));

    // Reset per-open state
    STATE.showReasoning = false;
    STATE.currentConversationId = conversationId;
    STATE.currentStudentId = studentId;
    STATE.flaggedTurns = new Set();
    STATE.pendingScrollTurnIndex =
      typeof opts.scrollToTurnIndex === 'number' && opts.scrollToTurnIndex >= 0
        ? opts.scrollToTurnIndex
        : null;
    const toggle = STATE.modal.querySelector('#transcript-reasoning-toggle');
    if (toggle) toggle.checked = false;

    try {
      const payload = await fetchTranscript(studentId, conversationId, { role: opts.role });
      CACHED_PAYLOAD = payload;
      renderPayload(payload);
    } catch (err) {
      console.error('[TranscriptViewer] fetch failed', err);
      const msg = err.status === 403
        ? (err.body?.message || 'You are not authorized to view this transcript.')
        : err.status === 404
        ? 'Conversation not found.'
        : 'We couldn\'t load this transcript. Please try again.';
      setBody(h('div', { className: 'transcript-error' }, msg));
    }
  }

  // Auto-delegate clicks from conversation cards. Any element with both
  // data-student-id and data-conversation-id opens the viewer. This keeps the
  // wire-up out of teacher-dashboard.js so the two files stay decoupled.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-conversation-id][data-student-id]');
    if (!trigger) return;
    e.preventDefault();
    const role = (window.currentUser && window.currentUser.role === 'admin') ? 'admin' : 'teacher';
    open(trigger.dataset.studentId, trigger.dataset.conversationId, { role, triggerEl: trigger });
  });

  // Keyboard: allow Enter/Space on focusable conversation cards.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest && e.target.closest('[data-conversation-id][data-student-id]');
    if (!trigger) return;
    // Don't hijack keystrokes inside actual inputs.
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    e.preventDefault();
    trigger.click();
  });

  window.TranscriptViewer = { open, close: closeModal };
})();

;
/* --- /js/teacher-curriculum.js --- */
// teacher-curriculum.js
// Curriculum management for teacher dashboard

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const curriculumTab = document.querySelector('[data-tab="curriculum"]');
    const curriculumContent = document.getElementById('curriculum-content');
    const syncCommonBtn = document.getElementById('sync-common-curriculum-btn');
    const uploadCurriculumBtn = document.getElementById('upload-curriculum-btn');

    // Sync Common Curriculum Modal
    const syncModal = document.getElementById('sync-curriculum-modal');
    const syncModalCloseBtn = document.getElementById('syncCurriculumModalCloseBtn');
    const syncForm = document.getElementById('sync-curriculum-form');
    const cancelSyncBtn = document.getElementById('cancel-sync-btn');

    // Upload CSV Modal
    const uploadModal = document.getElementById('upload-curriculum-modal');
    const uploadModalCloseBtn = document.getElementById('uploadCurriculumModalCloseBtn');
    const uploadForm = document.getElementById('upload-curriculum-form');
    const cancelUploadBtn = document.getElementById('cancel-upload-btn');

    // Load curriculum when tab is clicked
    if (curriculumTab) {
        curriculumTab.addEventListener('click', () => {
            loadCurriculum();
        });
    }

    // Open sync modal
    if (syncCommonBtn) {
        syncCommonBtn.addEventListener('click', () => {
            if (!syncModal) {
                console.error('Sync modal not found');
                alert('Error: Modal not loaded. Please refresh the page.');
                return;
            }
            syncModal.classList.add('is-visible');
            // Pre-fill with current year
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;
            const schoolYearInput = document.getElementById('cc-school-year');
            if (schoolYearInput) {
                schoolYearInput.value = `${currentYear}-${nextYear}`;
            }
        });
    }

    // Close sync modal
    function closeSyncModal() {
        if (syncModal) syncModal.classList.remove('is-visible');
        if (syncForm) syncForm.reset();
    }

    if (syncModalCloseBtn) syncModalCloseBtn.addEventListener('click', closeSyncModal);
    if (cancelSyncBtn) cancelSyncBtn.addEventListener('click', closeSyncModal);

    // Open upload modal
    if (uploadCurriculumBtn) {
        uploadCurriculumBtn.addEventListener('click', () => {
            if (!uploadModal) {
                console.error('Upload modal not found');
                alert('Error: Modal not loaded. Please refresh the page.');
                return;
            }
            uploadModal.classList.add('is-visible');
            // Pre-fill with current year
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;
            const schoolYearInput = document.getElementById('csv-school-year');
            if (schoolYearInput) {
                schoolYearInput.value = `${currentYear}-${nextYear}`;
            }
        });
    }

    // Close upload modal
    function closeUploadModal() {
        if (uploadModal) uploadModal.classList.remove('is-visible');
        if (uploadForm) uploadForm.reset();
    }

    if (uploadModalCloseBtn) uploadModalCloseBtn.addEventListener('click', closeUploadModal);
    if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', closeUploadModal);

    // Submit sync form
    if (syncForm) {
        syncForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = syncForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
            submitBtn.disabled = true;

            try {
                const res = await csrfFetch('/api/curriculum/teacher/curriculum/sync-common', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        url: document.getElementById('cc-url').value,
                        name: document.getElementById('cc-name').value,
                        courseLevel: document.getElementById('cc-course-level').value,
                        gradeLevel: document.getElementById('cc-grade-level').value,
                        schoolYear: document.getElementById('cc-school-year').value
                    })
                });

                const data = await res.json();

                if (data.success) {
                    alert(`Success! Imported ${data.lessonsCount} lessons with ${data.resourcesCount} resources.`);
                    closeSyncModal();
                    loadCurriculum();
                } else {
                    alert('Error: ' + (data.message || 'Failed to sync curriculum'));
                }
            } catch (error) {
                console.error('Error syncing curriculum:', error);
                alert('Failed to sync curriculum. Please try again.');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Submit upload form
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = uploadForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            submitBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('file', document.getElementById('csv-file').files[0]);
                formData.append('name', document.getElementById('csv-name').value);
                formData.append('courseLevel', document.getElementById('csv-course-level').value);
                formData.append('gradeLevel', document.getElementById('csv-grade-level').value);
                formData.append('schoolYear', document.getElementById('csv-school-year').value);

                const res = await csrfFetch('/api/curriculum/teacher/curriculum/parse', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });

                const data = await res.json();

                if (data.success) {
                    alert(`Success! Imported ${data.lessonsCount} lessons from CSV.`);
                    closeUploadModal();
                    loadCurriculum();
                } else {
                    alert('Error: ' + (data.message || 'Failed to upload curriculum'));
                }
            } catch (error) {
                console.error('Error uploading curriculum:', error);
                alert('Failed to upload curriculum. Please try again.');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Load curriculum
    async function loadCurriculum() {
        if (!curriculumContent) return;

        curriculumContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading curriculum...</div>';

        try {
            const res = await fetch('/api/curriculum/teacher/curriculum', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load curriculum');
            const data = await res.json();

            if (!data.hasCurriculum) {
                curriculumContent.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #666;">
                        <i class="fas fa-book" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p>No curriculum schedule imported yet.</p>
                        <p style="font-size: 0.9em; margin-top: 10px;">
                            Import your schedule from Common Curriculum or upload a CSV file to get started.
                        </p>
                    </div>
                `;
                return;
            }

            const curriculum = data.curriculum;
            const currentLesson = curriculum.currentLesson;

            // Display curriculum with resources
            let html = `
                <div style="padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div>
                            <h3 style="margin: 0;">${curriculum.name}</h3>
                            <p style="margin: 5px 0; color: #666;">
                                ${curriculum.courseLevel || ''} ${curriculum.gradeLevel ? '| ' + curriculum.gradeLevel : ''} ${curriculum.schoolYear ? '| ' + curriculum.schoolYear : ''}
                            </p>
                            <p style="margin: 5px 0; font-size: 0.9em; color: #888;">
                                ${curriculum.lessonsCount} lessons |
                                Auto-sync with AI: ${curriculum.autoSyncWithAI ? '<span style="color: #12B3B3;">✓ Enabled</span>' : '<span style="color: #999;">○ Disabled</span>'}
                            </p>
                        </div>
                        <div>
                            <button id="edit-ai-preferences-btn" class="btn btn-secondary" style="margin-right: 10px;">
                                <i class="fas fa-robot"></i> AI Preferences
                            </button>
                            <button id="delete-curriculum-btn" class="btn btn-tertiary" style="background: #ff4e4e; color: white;">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>

                    ${currentLesson ? `
                        <div style="background: #e8f9f8; border-left: 4px solid #12B3B3; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                            <h4 style="margin: 0 0 10px 0; color: #12B3B3;">
                                <i class="fas fa-calendar-check"></i> Current Week (Week ${currentLesson.weekNumber})
                            </h4>
                            <p style="margin: 5px 0;"><strong>Topic:</strong> ${currentLesson.topic}</p>
                            ${currentLesson.standards && currentLesson.standards.length > 0 ?
                                `<p style="margin: 5px 0;"><strong>Standards:</strong> ${currentLesson.standards.join(', ')}</p>` : ''}
                            ${currentLesson.objectives && currentLesson.objectives.length > 0 ?
                                `<p style="margin: 5px 0;"><strong>Objectives:</strong> ${currentLesson.objectives.join('; ')}</p>` : ''}
                            ${currentLesson.resources && currentLesson.resources.length > 0 ?
                                `<div style="margin-top: 10px;">
                                    <strong>Resources:</strong>
                                    <div style="margin-top: 5px;">
                                        ${currentLesson.resources.map(resource => {
                                            const fileName = resource.split('/').pop();
                                            const fileType = getFileType(resource);
                                            return `<a href="${resource}" target="_blank" style="display: block; padding: 5px 0; color: #12B3B3;">
                                                <i class="${fileType.icon}"></i> ${fileName}
                                            </a>`;
                                        }).join('')}
                                    </div>
                                </div>` : ''}
                        </div>
                    ` : ''}

                    <h4 style="margin: 20px 0 10px 0;">All Lessons</h4>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Week</th>
                                <th>Topic</th>
                                <th>Dates</th>
                                <th>Standards</th>
                                <th>Resources</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${curriculum.lessons.map(lesson => `
                                <tr ${lesson._id === currentLesson?._id ? 'style="background: #f0fffe;"' : ''}>
                                    <td><strong>${lesson.weekNumber}</strong></td>
                                    <td>${lesson.topic}</td>
                                    <td style="font-size: 0.85em;">
                                        ${lesson.startDate && lesson.endDate ?
                                            `${new Date(lesson.startDate).toLocaleDateString()} - ${new Date(lesson.endDate).toLocaleDateString()}` :
                                            'No dates'}
                                    </td>
                                    <td style="font-size: 0.85em;">${lesson.standards && lesson.standards.length > 0 ? lesson.standards.join(', ') : '—'}</td>
                                    <td>
                                        <div style="display: flex; gap: 5px; align-items: center;">
                                            ${lesson.resources && lesson.resources.length > 0 ?
                                                `<button class="btn btn-sm btn-secondary view-resources-btn" data-lesson-id="${lesson._id}">
                                                    <i class="fas fa-link"></i> ${lesson.resources.length}
                                                </button>` :
                                                '<span style="color: #999; font-size: 0.85em;">None</span>'}
                                            <button class="btn btn-sm btn-primary add-resource-btn" data-lesson-id="${lesson._id}" data-lesson-topic="${lesson.topic}" title="Add Resource">
                                                <i class="fas fa-plus"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            curriculumContent.innerHTML = html;

            // Add AI preferences handler
            document.getElementById('edit-ai-preferences-btn')?.addEventListener('click', () => {
                showAIPreferencesModal(curriculum);
            });

            // Add delete handler
            document.getElementById('delete-curriculum-btn')?.addEventListener('click', async () => {
                if (!confirm('Are you sure you want to delete this curriculum? This cannot be undone.')) return;

                try {
                    const res = await csrfFetch(`/api/curriculum/teacher/curriculum/${curriculum._id}`, {
                        method: 'DELETE',
                        credentials: 'include'
                    });

                    const data = await res.json();
                    if (data.success) {
                        alert('Curriculum deleted successfully');
                        loadCurriculum();
                    } else {
                        alert('Error: ' + (data.message || 'Failed to delete curriculum'));
                    }
                } catch (error) {
                    console.error('Error deleting curriculum:', error);
                    alert('Failed to delete curriculum');
                }
            });

            // Add view resources handlers
            document.querySelectorAll('.view-resources-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const lessonId = btn.dataset.lessonId;
                    const lesson = curriculum.lessons.find(l => l._id === lessonId);
                    if (lesson) {
                        showResourcesModal(lesson, curriculum._id);
                    }
                });
            });

            // Add resource handlers
            document.querySelectorAll('.add-resource-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const lessonId = btn.dataset.lessonId;
                    const lessonTopic = btn.dataset.lessonTopic;
                    showAddResourceModal(curriculum._id, lessonId, lessonTopic);
                });
            });

        } catch (error) {
            console.error('Error loading curriculum:', error);
            curriculumContent.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4e4e;">Failed to load curriculum</div>';
        }
    }

    // Get file type icon and color
    function getFileType(url) {
        if (url.includes('.pdf')) {
            return { icon: 'fas fa-file-pdf', color: '#ff4e4e' };
        } else if (url.includes('.mp4') || url.includes('youtube.com') || url.includes('vimeo.com')) {
            return { icon: 'fas fa-video', color: '#9b51e0' };
        } else if (url.includes('.docx') || url.includes('.doc')) {
            return { icon: 'fas fa-file-word', color: '#2b7cd3' };
        } else if (url.includes('.pptx') || url.includes('.ppt')) {
            return { icon: 'fas fa-file-powerpoint', color: '#d24726' };
        } else if (url.includes('drive.google.com')) {
            return { icon: 'fab fa-google-drive', color: '#12B3B3' };
        } else {
            return { icon: 'fas fa-link', color: '#666' };
        }
    }

    // Show AI preferences modal
    function showAIPreferencesModal(curriculum) {
        const prefs = curriculum.teacherPreferences || {};

        const modalHtml = `
            <div id="ai-preferences-modal" class="modal-overlay" style="display: flex;">
                <div class="modal-content" style="max-width: 700px;">
                    <span class="modal-close-button" id="closeAIPrefsModal">&times;</span>
                    <h2><i class="fas fa-robot"></i> AI Tutor Preferences</h2>
                    <p style="color: #666; margin-bottom: 20px;">
                        Customize how the AI tutor interacts with your students. These preferences will be applied during all tutoring sessions.
                    </p>

                    <form id="ai-preferences-form">
                        <label for="ai-terminology">Terminology Preferences</label>
                        <textarea id="ai-terminology" rows="2" placeholder="e.g., Use 'slope' instead of 'gradient', always say 'parentheses' not 'brackets'">${prefs.terminology || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Specify preferred mathematical terms and vocabulary
                        </p>

                        <label for="ai-solution-methods">Preferred Solution Methods</label>
                        <textarea id="ai-solution-methods" rows="3" placeholder="e.g., Always factor before using quadratic formula, Show graphical representation first for linear equations">${prefs.solutionMethods || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Describe the solution approaches you want the AI to prioritize
                        </p>

                        <label for="ai-scaffolding">Scaffolding Approach</label>
                        <textarea id="ai-scaffolding" rows="3" placeholder="e.g., Break multi-step problems into smaller parts, Always ask students to draw diagrams first">${prefs.scaffolding || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            How should the AI break down complex problems?
                        </p>

                        <label for="ai-common-mistakes">Common Mistakes to Watch For</label>
                        <textarea id="ai-common-mistakes" rows="3" placeholder="e.g., Students often forget to distribute negative signs, Watch for sign errors in integer operations">${prefs.commonMistakes || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Alert the AI to common errors your students make
                        </p>

                        <label for="ai-additional-guidance">Additional Guidance</label>
                        <textarea id="ai-additional-guidance" rows="3" placeholder="e.g., Always encourage students to check their work, Use real-world examples when possible">${prefs.additionalGuidance || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Any other instructions for the AI tutor
                        </p>

                        <div class="form-buttons" style="margin-top: 20px;">
                            <button type="submit" class="submit-btn btn-primary">
                                <i class="fas fa-save"></i> Save Preferences
                            </button>
                            <button type="button" id="cancel-ai-prefs-btn" class="submit-btn cancel-btn btn-tertiary">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to body
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        const modal = document.getElementById('ai-preferences-modal');
        const closeBtn = document.getElementById('closeAIPrefsModal');
        const cancelBtn = document.getElementById('cancel-ai-prefs-btn');
        const form = document.getElementById('ai-preferences-form');

        // Close handlers
        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        // Submit handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            submitBtn.disabled = true;

            try {
                const res = await csrfFetch(`/api/curriculum/teacher/curriculum/${curriculum._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        teacherPreferences: {
                            terminology: document.getElementById('ai-terminology').value,
                            solutionMethods: document.getElementById('ai-solution-methods').value,
                            scaffolding: document.getElementById('ai-scaffolding').value,
                            commonMistakes: document.getElementById('ai-common-mistakes').value,
                            additionalGuidance: document.getElementById('ai-additional-guidance').value
                        }
                    })
                });

                const data = await res.json();
                if (data.success) {
                    alert('AI preferences saved successfully!');
                    closeModal();
                    loadCurriculum();
                } else {
                    alert('Error: ' + (data.message || 'Failed to save preferences'));
                }
            } catch (error) {
                console.error('Error saving AI preferences:', error);
                alert('Failed to save preferences. Please try again.');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Show Add Resource Modal (make it global for onclick handlers)
    window.showAddResourceModal = function(curriculumId, lessonId, lessonTopic) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay is-visible';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <span class="modal-close-button" onclick="this.closest('.modal-overlay').remove()">&times;</span>
                <h2><i class="fas fa-plus-circle"></i> Add Resource</h2>
                <p style="color: #666; margin-bottom: 20px;">
                    Add a resource link for: <strong>${lessonTopic}</strong>
                </p>
                <form id="add-resource-form">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">
                            Resource URL <span style="color: #ff4e4e;">*</span>
                        </label>
                        <input
                            type="url"
                            id="resource-url"
                            placeholder="https://example.com/worksheet.pdf"
                            required
                            style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;"
                        />
                        <p style="font-size: 0.85em; color: #666; margin-top: 5px;">
                            Enter a link to a PDF, video, Google Doc, or any other resource
                        </p>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-plus"></i> Add Resource
                        </button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Handle form submission
        const form = modal.querySelector('#add-resource-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
            submitBtn.disabled = true;

            const resourceUrl = document.getElementById('resource-url').value.trim();

            try {
                const res = await csrfFetch(`/api/curriculum/teacher/curriculum/${curriculumId}/lesson/${lessonId}/resource`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ resourceUrl })
                });

                const data = await res.json();
                if (data.success) {
                    alert('✅ Resource added successfully!');
                    modal.remove();
                    loadCurriculum();
                } else {
                    alert('Error: ' + (data.message || 'Failed to add resource'));
                }
            } catch (error) {
                console.error('Error adding resource:', error);
                alert('Failed to add resource. Please try again.');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Update showResourcesModal to allow deletion
    function showResourcesModal(lesson, curriculumId) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay is-visible';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <span class="modal-close-button" onclick="this.closest('.modal-overlay').remove()">&times;</span>
                <h2><i class="fas fa-link"></i> Resources</h2>
                <h3 style="margin: 10px 0; color: #666;">${lesson.topic}</h3>
                <p style="color: #888; margin-bottom: 20px;">Week ${lesson.weekNumber}</p>
                <div id="resources-list">
                    ${lesson.resources && lesson.resources.length > 0 ?
                        lesson.resources.map(resource => {
                            const fileName = resource.split('/').pop();
                            const fileType = getFileType(resource);
                            return `
                                <div class="resource-item" style="padding: 15px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                                    <a href="${resource}" target="_blank" style="color: #12B3B3; font-weight: 500; display: flex; align-items: center; gap: 10px; flex: 1;">
                                        <i class="${fileType.icon}" style="font-size: 20px; color: ${fileType.color};"></i>
                                        <span>${fileName}</span>
                                        <i class="fas fa-external-link-alt" style="font-size: 12px; color: #999;"></i>
                                    </a>
                                    <button class="btn btn-sm" style="background: #ff4e4e; color: white;" onclick="deleteResource('${curriculumId}', '${lesson._id}', '${resource}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            `;
                        }).join('')
                    : '<p style="color: #999; padding: 20px; text-align: center;">No resources added yet</p>'}
                </div>
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                    <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove(); showAddResourceModal('${curriculumId}', '${lesson._id}', '${lesson.topic}')">
                        <i class="fas fa-plus"></i> Add Another Resource
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Delete resource function (global scope for onclick)
    window.deleteResource = async function(curriculumId, lessonId, resourceUrl) {
        if (!confirm('Are you sure you want to remove this resource?')) return;

        try {
            const res = await csrfFetch(`/api/curriculum/teacher/curriculum/${curriculumId}/lesson/${lessonId}/resource`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ resourceUrl })
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Resource removed successfully!');
                document.querySelector('.modal-overlay')?.remove();
                loadCurriculum();
            } else {
                alert('Error: ' + (data.message || 'Failed to remove resource'));
            }
        } catch (error) {
            console.error('Error removing resource:', error);
            alert('Failed to remove resource. Please try again.');
        }
    };

    // Initial load if on curriculum tab
    if (document.querySelector('[data-tab="curriculum"]')?.classList.contains('active')) {
        loadCurriculum();
    }
});

;
/* --- /js/teacher-resources.js --- */
// public/js/teacher-resources.js
// Teacher resource upload and management

document.addEventListener('DOMContentLoaded', () => {
    // Modal elements
    const uploadModal = document.getElementById('upload-resource-modal');
    const uploadBtn = document.getElementById('upload-resource-btn');
    const closeUploadModal = document.getElementById('close-upload-resource-modal');
    const uploadForm = document.getElementById('upload-resource-form');
    const resourcesList = document.getElementById('resources-list');

    // Open upload modal
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            uploadModal.classList.add('is-visible');
        });
    }

    // Close modal
    if (closeUploadModal) {
        closeUploadModal.addEventListener('click', () => {
            uploadModal.classList.remove('is-visible');
            uploadForm.reset();
        });
    }

    // Cancel button
    const cancelBtn = document.getElementById('cancel-resource-upload-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            uploadModal.classList.remove('is-visible');
            uploadForm.reset();
        });
    }

    // Close on outside click
    uploadModal?.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
            uploadModal.classList.remove('is-visible');
            uploadForm.reset();
        }
    });

    // Handle file upload
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(uploadForm);
            const submitBtn = uploadForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

                const response = await csrfFetch('/api/teacher-resources/upload', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    alert('✅ Resource uploaded successfully!');
                    uploadModal.classList.remove('is-visible');
                    uploadForm.reset();
                    await loadResources(); // Reload resources list
                } else {
                    alert('❌ Failed to upload: ' + (result.message || 'Unknown error'));
                }

            } catch (error) {
                console.error('Upload error:', error);
                alert('❌ Error uploading resource. Please try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    // Load and display resources
    async function loadResources() {
        if (!resourcesList) return;

        resourcesList.innerHTML = '<p style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading resources...</p>';

        try {
            const response = await fetch('/api/teacher-resources/list');
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to load resources');
            }

            const resources = data.resources || [];

            if (resources.length === 0) {
                resourcesList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-folder-open" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <h3>No Resources Yet</h3>
                        <p>Upload files that your students can reference in chat.</p>
                        <p style="font-size: 0.9em; margin-top: 10px;">Students can say "I'm on Module 6.2 practice" and the AI will automatically fetch and analyze the file!</p>
                    </div>
                `;
                return;
            }

            // Display resources as cards
            resourcesList.innerHTML = `
                <div class="resources-grid">
                    ${resources.map(resource => `
                        <div class="resource-card ${resource.isPublished ? '' : 'resource-unpublished'}" data-resource-id="${resource.id}">
                            <div class="resource-icon">
                                <i class="fas ${getFileIcon(resource.fileType)}"></i>
                            </div>
                            <div class="resource-info">
                                <h4>
                                    ${resource.displayName}
                                    ${resource.isPublished
                                        ? '<span class="publish-badge published" title="Visible to students"><i class="fas fa-eye"></i></span>'
                                        : '<span class="publish-badge unpublished" title="Hidden from students"><i class="fas fa-eye-slash"></i></span>'}
                                </h4>
                                <p class="resource-meta">
                                    <span class="resource-type">${resource.fileType.toUpperCase()}</span>
                                    <span>•</span>
                                    <span>${formatFileSize(resource.fileSize)}</span>
                                    <span>•</span>
                                    <span>${formatDate(resource.uploadedAt)}</span>
                                </p>
                                ${resource.description ? `<p class="resource-description">${resource.description}</p>` : ''}
                                <p class="resource-stats">
                                    <i class="fas fa-chart-bar"></i> Accessed ${resource.accessCount} times
                                </p>
                                ${resource.keywords && resource.keywords.length > 0 ? `
                                    <div class="resource-keywords">
                                        ${resource.keywords.slice(0, 5).map(kw => `<span class="keyword-tag">${kw}</span>`).join('')}
                                    </div>
                                ` : ''}
                            </div>
                            <div class="resource-actions">
                                <button class="btn-icon ${resource.isPublished ? 'btn-published' : 'btn-unpublished'}"
                                    title="${resource.isPublished ? 'Click to hide from students' : 'Click to publish to students'}"
                                    onclick="togglePublish('${resource.id}', ${resource.isPublished})">
                                    <i class="fas ${resource.isPublished ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                                </button>
                                <button class="btn-icon" title="Download" onclick="window.open('${resource.publicUrl}', '_blank')">
                                    <i class="fas fa-download"></i>
                                </button>
                                <button class="btn-icon btn-danger" title="Delete" onclick="deleteResource('${resource.id}', '${resource.displayName}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

        } catch (error) {
            console.error('Error loading resources:', error);
            resourcesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ff4e4e;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Failed to load resources. Please try again.</p>
                </div>
            `;
        }
    }

    // Toggle publish status
    window.togglePublish = async function(resourceId, currentStatus) {
        try {
            const response = await csrfFetch(`/api/teacher-resources/${resourceId}/toggle-publish`, {
                method: 'PATCH'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Show toast notification if available
                if (typeof showToast === 'function') {
                    showToast(result.message, 'success');
                } else {
                    // Fallback: brief visual feedback
                    console.log(result.message);
                }
                await loadResources(); // Reload resources list
            } else {
                alert('Failed to update: ' + (result.message || 'Unknown error'));
            }

        } catch (error) {
            console.error('Toggle publish error:', error);
            alert('Error updating resource. Please try again.');
        }
    };

    // Delete resource
    window.deleteResource = async function(resourceId, resourceName) {
        if (!confirm(`Are you sure you want to delete "${resourceName}"? This cannot be undone.`)) {
            return;
        }

        try {
            const response = await csrfFetch(`/api/teacher-resources/${resourceId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert('✅ Resource deleted successfully');
                await loadResources();
            } else {
                alert('❌ Failed to delete: ' + (result.message || 'Unknown error'));
            }

        } catch (error) {
            console.error('Delete error:', error);
            alert('❌ Error deleting resource. Please try again.');
        }
    };

    // Helper functions
    function getFileIcon(fileType) {
        const icons = {
            'pdf': 'fa-file-pdf',
            'doc': 'fa-file-word',
            'docx': 'fa-file-word',
            'ppt': 'fa-file-powerpoint',
            'pptx': 'fa-file-powerpoint',
            'jpg': 'fa-file-image',
            'jpeg': 'fa-file-image',
            'png': 'fa-file-image',
            'webp': 'fa-file-image',
            'heic': 'fa-file-image'
        };
        return icons[fileType.toLowerCase()] || 'fa-file';
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    // Load resources on page load
    loadResources();
});

;
/* --- /js/teacher-ai-settings.js --- */
// teacher-ai-settings.js
// Class AI Settings modal functionality

document.addEventListener('DOMContentLoaded', () => {
    const aiSettingsBtn = document.getElementById('qa-ai-settings');
    let currentSettings = null;

    // Open AI Settings modal
    if (aiSettingsBtn) {
        aiSettingsBtn.addEventListener('click', openAISettingsModal);
    }

    async function openAISettingsModal() {
        // Fetch current settings
        try {
            const response = await fetch('/api/teacher/class-ai-settings', {
                credentials: 'include'
            });
            const data = await response.json();
            currentSettings = data.settings || {};
        } catch (error) {
            console.error('Error fetching AI settings:', error);
            currentSettings = {};
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'ai-settings-modal';
        modal.className = 'modal-overlay ai-settings-modal is-visible';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close-button" id="close-ai-settings">&times;</span>
                <h2><i class="fas fa-robot" style="color: #27ae60;"></i> Class AI Settings</h2>
                <p style="color: #666; margin-bottom: 24px;">Configure how the AI tutor interacts with your students. These settings apply to all students in your class.</p>

                <!-- Calculator Access -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-calculator"></i> Calculator Access</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>When can students use calculators?</label>
                            <select id="calculator-access">
                                <option value="skill-based" ${currentSettings.calculatorAccess === 'skill-based' ? 'selected' : ''}>Skill-Based (AI decides per problem)</option>
                                <option value="always" ${currentSettings.calculatorAccess === 'always' ? 'selected' : ''}>Always Available</option>
                                <option value="never" ${currentSettings.calculatorAccess === 'never' ? 'selected' : ''}>Never Available</option>
                                <option value="teacher-discretion" ${currentSettings.calculatorAccess === 'teacher-discretion' ? 'selected' : ''}>Only When I Specify</option>
                            </select>
                            <p class="setting-hint">Skill-based allows calculators for computation-heavy problems but not basic arithmetic practice</p>
                        </div>
                        <div class="setting-group">
                            <label>Additional Notes</label>
                            <input type="text" id="calculator-note" placeholder="e.g., Allow for word problems only" value="${currentSettings.calculatorNote || ''}">
                        </div>
                    </div>
                </div>

                <!-- Scaffolding Level -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-layer-group"></i> Scaffolding Level</h3>
                    <div class="setting-group">
                        <label>How much support should the AI provide?</label>
                        <div class="scaffolding-slider">
                            <span>Less</span>
                            <input type="range" id="scaffolding-level" min="1" max="5" value="${currentSettings.scaffoldingLevel || 3}">
                            <span>More</span>
                        </div>
                        <div class="scaffolding-labels">
                            <span>Minimal hints</span>
                            <span>Balanced</span>
                            <span>Maximum support</span>
                        </div>
                        <p class="setting-hint">Level <span id="scaffolding-value">${currentSettings.scaffoldingLevel || 3}</span>: ${getScaffoldingDescription(currentSettings.scaffoldingLevel || 3)}</p>
                    </div>
                </div>

                <!-- Vocabulary Preferences -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-spell-check"></i> Vocabulary & Terminology</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Order of Operations</label>
                            <select id="order-of-operations">
                                <option value="GEMS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'GEMS' ? 'selected' : ''}>GEMS (Grouping, Exponents, Multiply/Divide, Subtract/Add)</option>
                                <option value="PEMDAS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'PEMDAS' ? 'selected' : ''}>PEMDAS (Parentheses, Exponents...)</option>
                                <option value="BODMAS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'BODMAS' ? 'selected' : ''}>BODMAS (Brackets, Orders...)</option>
                                <option value="BEDMAS" ${currentSettings.vocabularyPreferences?.orderOfOperations === 'BEDMAS' ? 'selected' : ''}>BEDMAS (Brackets, Exponents...)</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Custom Vocabulary Rules</label>
                        <div class="vocab-chips" id="vocab-chips">
                            ${(currentSettings.vocabularyPreferences?.customVocabulary || []).map(v =>
                                `<span class="vocab-chip">${v}<span class="remove-chip" onclick="removeVocabChip(this)">&times;</span></span>`
                            ).join('')}
                        </div>
                        <div class="add-vocab-row">
                            <input type="text" id="new-vocab" placeholder="e.g., Use 'rate of change' instead of 'slope'">
                            <button type="button" onclick="addVocabChip()"><i class="fas fa-plus"></i></button>
                        </div>
                        <p class="setting-hint">Add custom terminology preferences the AI should follow</p>
                    </div>
                </div>

                <!-- Solution Approaches -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-route"></i> Solution Approaches</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Solving Equations</label>
                            <select id="equation-solving">
                                <option value="any" ${currentSettings.solutionApproaches?.equationSolving === 'any' ? 'selected' : ''}>Any Method</option>
                                <option value="opposite-operations" ${currentSettings.solutionApproaches?.equationSolving === 'opposite-operations' ? 'selected' : ''}>Opposite Operations</option>
                                <option value="balance-method" ${currentSettings.solutionApproaches?.equationSolving === 'balance-method' ? 'selected' : ''}>Balance Method</option>
                                <option value="algebraic-manipulation" ${currentSettings.solutionApproaches?.equationSolving === 'algebraic-manipulation' ? 'selected' : ''}>Algebraic Manipulation</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Fraction Operations</label>
                            <select id="fraction-operations">
                                <option value="any" ${currentSettings.solutionApproaches?.fractionOperations === 'any' ? 'selected' : ''}>Any Method</option>
                                <option value="butterfly-method" ${currentSettings.solutionApproaches?.fractionOperations === 'butterfly-method' ? 'selected' : ''}>Butterfly Method</option>
                                <option value="traditional-lcd" ${currentSettings.solutionApproaches?.fractionOperations === 'traditional-lcd' ? 'selected' : ''}>Traditional LCD</option>
                                <option value="visual-models" ${currentSettings.solutionApproaches?.fractionOperations === 'visual-models' ? 'selected' : ''}>Visual Models</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Word Problems</label>
                            <select id="word-problems">
                                <option value="any" ${currentSettings.solutionApproaches?.wordProblems === 'any' ? 'selected' : ''}>Any Strategy</option>
                                <option value="CUBES" ${currentSettings.solutionApproaches?.wordProblems === 'CUBES' ? 'selected' : ''}>CUBES Strategy</option>
                                <option value="UPS-Check" ${currentSettings.solutionApproaches?.wordProblems === 'UPS-Check' ? 'selected' : ''}>UPS-Check</option>
                                <option value="draw-first" ${currentSettings.solutionApproaches?.wordProblems === 'draw-first' ? 'selected' : ''}>Draw First</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Other Approach Notes</label>
                        <textarea id="custom-approaches" placeholder="e.g., For systems of equations, always try graphing first before substitution...">${currentSettings.solutionApproaches?.customApproaches || ''}</textarea>
                    </div>
                </div>

                <!-- Manipulatives -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-cubes"></i> Manipulatives & Visual Aids</h3>
                    <div class="setting-row">
                        <div class="setting-group" style="flex: 0 0 auto;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="manipulatives-allowed" ${currentSettings.manipulatives?.allowed !== false ? 'checked' : ''}>
                                Allow virtual manipulatives
                            </label>
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>Preferred Manipulatives</label>
                        <div class="checkbox-grid">
                            <label><input type="checkbox" name="manipulative" value="number-line" ${(currentSettings.manipulatives?.preferred || []).includes('number-line') ? 'checked' : ''}> Number Line</label>
                            <label><input type="checkbox" name="manipulative" value="algebra-tiles" ${(currentSettings.manipulatives?.preferred || []).includes('algebra-tiles') ? 'checked' : ''}> Algebra Tiles</label>
                            <label><input type="checkbox" name="manipulative" value="fraction-bars" ${(currentSettings.manipulatives?.preferred || []).includes('fraction-bars') ? 'checked' : ''}> Fraction Bars</label>
                            <label><input type="checkbox" name="manipulative" value="area-model" ${(currentSettings.manipulatives?.preferred || []).includes('area-model') ? 'checked' : ''}> Area Model</label>
                            <label><input type="checkbox" name="manipulative" value="base-ten-blocks" ${(currentSettings.manipulatives?.preferred || []).includes('base-ten-blocks') ? 'checked' : ''}> Base-Ten Blocks</label>
                            <label><input type="checkbox" name="manipulative" value="coordinate-plane" ${(currentSettings.manipulatives?.preferred || []).includes('coordinate-plane') ? 'checked' : ''}> Coordinate Plane</label>
                        </div>
                    </div>
                </div>

                <!-- Current Teaching Context -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-chalkboard-teacher"></i> Current Teaching Context</h3>
                    <p style="color: #666; font-size: 0.9em; margin-bottom: 16px;">Tell the AI what you're currently teaching so it can align with your classroom instruction.</p>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Current Topic</label>
                            <input type="text" id="current-topic" placeholder="e.g., Solving two-step equations" value="${currentSettings.currentTeaching?.topic || ''}">
                        </div>
                    </div>
                    <div class="setting-group">
                        <label>How I Teach It</label>
                        <textarea id="teaching-approach" placeholder="e.g., I teach balancing equations by showing both sides of a scale. We always draw the scale first before writing algebraic steps...">${currentSettings.currentTeaching?.approach || ''}</textarea>
                    </div>
                    <div class="setting-group">
                        <label>Pacing Notes</label>
                        <textarea id="pacing-notes" placeholder="e.g., We're taking it slow - prioritize understanding over speed. Most students struggle with negative numbers...">${currentSettings.currentTeaching?.pacing || ''}</textarea>
                    </div>
                </div>

                <!-- Response Style -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-comment-dots"></i> Response Style</h3>
                    <div class="setting-row">
                        <div class="setting-group">
                            <label>Encouragement Level</label>
                            <select id="encouragement-level">
                                <option value="minimal" ${currentSettings.responseStyle?.encouragementLevel === 'minimal' ? 'selected' : ''}>Minimal</option>
                                <option value="moderate" ${currentSettings.responseStyle?.encouragementLevel === 'moderate' || !currentSettings.responseStyle?.encouragementLevel ? 'selected' : ''}>Moderate</option>
                                <option value="high" ${currentSettings.responseStyle?.encouragementLevel === 'high' ? 'selected' : ''}>High</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Error Correction Style</label>
                            <select id="error-correction">
                                <option value="direct" ${currentSettings.responseStyle?.errorCorrectionStyle === 'direct' ? 'selected' : ''}>Direct (Point out errors clearly)</option>
                                <option value="socratic" ${currentSettings.responseStyle?.errorCorrectionStyle === 'socratic' || !currentSettings.responseStyle?.errorCorrectionStyle ? 'selected' : ''}>Socratic (Guide with questions)</option>
                                <option value="discovery" ${currentSettings.responseStyle?.errorCorrectionStyle === 'discovery' ? 'selected' : ''}>Discovery (Let students find errors)</option>
                            </select>
                        </div>
                        <div class="setting-group">
                            <label>Show Work Requirement</label>
                            <select id="show-work">
                                <option value="always" ${currentSettings.responseStyle?.showWorkRequirement === 'always' || !currentSettings.responseStyle?.showWorkRequirement ? 'selected' : ''}>Always Required</option>
                                <option value="sometimes" ${currentSettings.responseStyle?.showWorkRequirement === 'sometimes' ? 'selected' : ''}>Sometimes</option>
                                <option value="never" ${currentSettings.responseStyle?.showWorkRequirement === 'never' ? 'selected' : ''}>Never Required</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Dashboard Language -->
                <div class="ai-settings-section">
                    <h3><i class="fas fa-language"></i> Dashboard Language</h3>
                    <div class="setting-group">
                        <label>Choose the language for your dashboard interface.</label>
                        <select id="teacher-preferred-language">
                            <option value="English">English</option>
                            <option value="Spanish">Spanish (Español)</option>
                            <option value="Russian">Russian (Русский)</option>
                            <option value="Chinese">Chinese (中文)</option>
                            <option value="Vietnamese">Vietnamese (Tiếng Việt)</option>
                            <option value="Arabic">Arabic (العربية)</option>
                            <option value="Somali">Somali (Soomaali)</option>
                            <option value="French">French (Français)</option>
                            <option value="German">German (Deutsch)</option>
                        </select>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancel-ai-settings">Cancel</button>
                    <button class="btn btn-primary" id="save-ai-settings"><i class="fas fa-save"></i> Save Settings</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Pre-select current dashboard language from the user record
        fetch('/user', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data && data.user && data.user.preferredLanguage) {
                    const langSelect = document.getElementById('teacher-preferred-language');
                    if (langSelect) langSelect.value = data.user.preferredLanguage;
                }
            })
            .catch(() => {});

        // Event listeners
        document.getElementById('close-ai-settings').onclick = () => modal.remove();
        document.getElementById('cancel-ai-settings').onclick = () => modal.remove();
        document.getElementById('save-ai-settings').onclick = () => saveAISettings(modal);

        // Scaffolding slider update
        const slider = document.getElementById('scaffolding-level');
        slider.oninput = () => {
            document.getElementById('scaffolding-value').textContent = slider.value;
            document.querySelector('.setting-hint').textContent = `Level ${slider.value}: ${getScaffoldingDescription(parseInt(slider.value))}`;
        };

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    function getScaffoldingDescription(level) {
        const descriptions = {
            1: 'Student must work mostly independently. Only hints when really stuck.',
            2: 'Occasional guidance. Let students struggle productively before helping.',
            3: 'Balanced support. Provide hints after reasonable effort.',
            4: 'Supportive approach. Guide students through each step.',
            5: 'Maximum scaffolding. Break everything into small steps with lots of encouragement.'
        };
        return descriptions[level] || descriptions[3];
    }

    // Global functions for vocab chips
    window.addVocabChip = function() {
        const input = document.getElementById('new-vocab');
        const value = input.value.trim();
        if (value) {
            const chipsContainer = document.getElementById('vocab-chips');
            const chip = document.createElement('span');
            chip.className = 'vocab-chip';
            chip.innerHTML = `${value}<span class="remove-chip" onclick="removeVocabChip(this)">&times;</span>`;
            chipsContainer.appendChild(chip);
            input.value = '';
        }
    };

    window.removeVocabChip = function(btn) {
        btn.parentElement.remove();
    };

    async function saveAISettings(modal) {
        const saveBtn = document.getElementById('save-ai-settings');
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        // Gather all settings
        const settings = {
            calculatorAccess: document.getElementById('calculator-access').value,
            calculatorNote: document.getElementById('calculator-note').value,
            scaffoldingLevel: parseInt(document.getElementById('scaffolding-level').value),
            vocabularyPreferences: {
                orderOfOperations: document.getElementById('order-of-operations').value,
                customVocabulary: Array.from(document.querySelectorAll('.vocab-chip')).map(chip =>
                    chip.textContent.replace('×', '').trim()
                )
            },
            solutionApproaches: {
                equationSolving: document.getElementById('equation-solving').value,
                fractionOperations: document.getElementById('fraction-operations').value,
                wordProblems: document.getElementById('word-problems').value,
                customApproaches: document.getElementById('custom-approaches').value
            },
            manipulatives: {
                allowed: document.getElementById('manipulatives-allowed').checked,
                preferred: Array.from(document.querySelectorAll('input[name="manipulative"]:checked')).map(cb => cb.value)
            },
            currentTeaching: {
                topic: document.getElementById('current-topic').value,
                approach: document.getElementById('teaching-approach').value,
                pacing: document.getElementById('pacing-notes').value
            },
            responseStyle: {
                encouragementLevel: document.getElementById('encouragement-level').value,
                errorCorrectionStyle: document.getElementById('error-correction').value,
                showWorkRequirement: document.getElementById('show-work').value
            }
        };

        try {
            const response = await csrfFetch('/api/teacher/class-ai-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            const result = await response.json();

            if (result.success) {
                // Save dashboard language preference
                const langSelect = document.getElementById('teacher-preferred-language');
                if (langSelect) {
                    const selectedLang = langSelect.value;
                    try {
                        await csrfFetch('/api/user/settings', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ preferredLanguage: selectedLang })
                        });
                        if (window.MathmatixI18n) {
                            window.MathmatixI18n.setLanguage(selectedLang);
                        }
                    } catch (langErr) {
                        console.error('Error saving language preference:', langErr);
                    }
                }

                if (typeof showToast === 'function') {
                    showToast('AI Settings saved successfully!', 'success');
                } else {
                    alert('Settings saved successfully!');
                }
                modal.remove();
            } else {
                throw new Error(result.message || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving AI settings:', error);
            if (typeof showToast === 'function') {
                showToast('Failed to save settings: ' + error.message, 'error');
            } else {
                alert('Failed to save settings: ' + error.message);
            }
        } finally {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
            saveBtn.disabled = false;
        }
    }
});

;
/* --- /js/teacher-announcements.js --- */
/**
 * Teacher Announcements - IM/Announcement Style Messaging
 * Allows teachers to send messages to classes or individual students
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const announcementForm = document.getElementById('announcement-form');
    const targetSelect = document.getElementById('announcement-target');
    const studentSelectContainer = document.getElementById('student-select-container');
    const studentCheckboxes = document.getElementById('student-checkboxes');
    const sentAnnouncementsList = document.getElementById('sent-announcements-list');
    const announcementStatus = document.getElementById('announcement-status');

    let studentsData = [];

    // Initialize when announcements tab is clicked
    const announcementsTab = document.querySelector('[data-tab="announcements"]');
    if (announcementsTab) {
        announcementsTab.addEventListener('click', () => {
            loadStudentsForSelection();
            loadSentAnnouncements();
        });
    }

    // Target selection change handler
    if (targetSelect) {
        targetSelect.addEventListener('change', (e) => {
            if (e.target.value === 'individual') {
                studentSelectContainer.style.display = 'block';
                loadStudentsForSelection();
            } else {
                studentSelectContainer.style.display = 'none';
            }
        });
    }

    // Load students for checkbox selection
    async function loadStudentsForSelection() {
        if (studentsData.length > 0) {
            renderStudentCheckboxes();
            return;
        }

        try {
            const response = await fetch('/api/announcements/teacher/students');
            if (!response.ok) throw new Error('Failed to load students');

            const data = await response.json();
            studentsData = data.students || [];
            renderStudentCheckboxes();
        } catch (error) {
            console.error('[Announcements] Error loading students:', error);
            studentCheckboxes.innerHTML = '<p style="color: #e74c3c;">Failed to load students</p>';
        }
    }

    // Render student checkboxes
    function renderStudentCheckboxes() {
        if (studentsData.length === 0) {
            studentCheckboxes.innerHTML = '<p style="color: #666; font-style: italic;">No students assigned</p>';
            return;
        }

        studentCheckboxes.innerHTML = `
            <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">
                <label style="cursor: pointer; font-weight: 600;">
                    <input type="checkbox" id="select-all-students" style="margin-right: 8px;">
                    Select All (${studentsData.length})
                </label>
            </div>
            ${studentsData.map(student => `
                <label style="display: block; padding: 6px 0; cursor: pointer; border-bottom: 1px solid #f0f0f0;">
                    <input type="checkbox" class="student-checkbox" value="${student._id}" style="margin-right: 8px;">
                    ${student.firstName} ${student.lastName}
                    <span style="color: #999; font-size: 0.85em;">(${student.username})</span>
                </label>
            `).join('')}
        `;

        // Select all handler
        const selectAllCheckbox = document.getElementById('select-all-students');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                document.querySelectorAll('.student-checkbox').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
        }
    }

    // Form submission
    if (announcementForm) {
        announcementForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const targetType = targetSelect.value;
            const title = document.getElementById('announcement-title').value.trim();
            const body = document.getElementById('announcement-body').value.trim();
            const priority = document.getElementById('announcement-priority').value;
            const category = document.getElementById('announcement-category').value;

            // Validate
            if (!title || !body) {
                showStatus('Please fill in all required fields', 'error');
                return;
            }

            // Get selected students if individual
            let recipientIds = [];
            if (targetType === 'individual') {
                recipientIds = Array.from(document.querySelectorAll('.student-checkbox:checked'))
                    .map(cb => cb.value);

                if (recipientIds.length === 0) {
                    showStatus('Please select at least one student', 'error');
                    return;
                }
            }

            // Disable form while sending
            const submitBtn = announcementForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            try {
                const response = await csrfFetch('/api/announcements/teacher/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetType,
                        recipientIds: targetType === 'individual' ? recipientIds : undefined,
                        title,
                        body,
                        priority,
                        category
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showStatus(`Announcement sent to ${data.announcement.recipientCount} student(s)!`, 'success');
                    announcementForm.reset();
                    studentSelectContainer.style.display = 'none';
                    loadSentAnnouncements();
                } else {
                    showStatus(data.message || 'Failed to send announcement', 'error');
                }
            } catch (error) {
                console.error('[Announcements] Send error:', error);
                showStatus('Error sending announcement. Please try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Announcement';
            }
        });
    }

    // Load sent announcements
    async function loadSentAnnouncements() {
        if (!sentAnnouncementsList) return;

        sentAnnouncementsList.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const response = await fetch('/api/announcements/teacher');
            if (!response.ok) throw new Error('Failed to load announcements');

            const data = await response.json();
            const announcements = data.announcements || [];

            if (announcements.length === 0) {
                sentAnnouncementsList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p>No announcements sent yet</p>
                        <p style="font-size: 0.9em;">Send your first announcement to your students!</p>
                    </div>
                `;
                return;
            }

            sentAnnouncementsList.innerHTML = announcements.map(a => {
                const date = new Date(a.createdAt);
                const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const priorityColors = {
                    normal: '#27ae60',
                    important: '#f39c12',
                    urgent: '#e74c3c'
                };

                const categoryIcons = {
                    general: 'fa-info-circle',
                    assignment: 'fa-book',
                    reminder: 'fa-bell',
                    encouragement: 'fa-heart',
                    achievement: 'fa-trophy',
                    event: 'fa-calendar'
                };

                const readPercent = a.totalRecipients > 0
                    ? Math.round((a.readCount / a.totalRecipients) * 100)
                    : 0;

                return `
                    <div class="announcement-card" style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 12px; border-left: 4px solid ${priorityColors[a.priority] || '#27ae60'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fas ${categoryIcons[a.category] || 'fa-info-circle'}" style="color: ${priorityColors[a.priority]}"></i>
                                <span style="font-weight: 600; color: #333;">${escapeHtml(a.title)}</span>
                            </div>
                            <span style="font-size: 0.8em; color: #999;">${dateStr}</span>
                        </div>
                        <p style="margin: 0 0 10px 0; color: #555; font-size: 0.9em; line-height: 1.5;">${escapeHtml(a.body).substring(0, 150)}${a.body.length > 150 ? '...' : ''}</p>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <span style="font-size: 0.8em; color: #666;">
                                    <i class="fas fa-users"></i> ${a.totalRecipients} recipient${a.totalRecipients !== 1 ? 's' : ''}
                                </span>
                                <span style="font-size: 0.8em; color: ${readPercent >= 50 ? '#27ae60' : '#f39c12'};">
                                    <i class="fas fa-eye"></i> ${readPercent}% read
                                </span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn-icon view-stats-btn" data-id="${a._id}" title="View read stats" style="background: #f5f5f5; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-chart-bar"></i>
                                </button>
                                <button class="btn-icon delete-announcement-btn" data-id="${a._id}" title="Delete" style="background: #fff5f5; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; color: #e74c3c;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Add event listeners for buttons
            document.querySelectorAll('.view-stats-btn').forEach(btn => {
                btn.addEventListener('click', () => viewAnnouncementStats(btn.dataset.id));
            });

            document.querySelectorAll('.delete-announcement-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteAnnouncement(btn.dataset.id));
            });

        } catch (error) {
            console.error('[Announcements] Load error:', error);
            sentAnnouncementsList.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 20px;">Error loading announcements</p>';
        }
    }

    // View announcement stats
    async function viewAnnouncementStats(announcementId) {
        try {
            const response = await fetch(`/api/announcements/teacher/${announcementId}/stats`);
            const data = await response.json();

            if (!data.success) {
                alert('Failed to load stats: ' + data.message);
                return;
            }

            const stats = data.stats;

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal-overlay is-visible';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;';
            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <div style="padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0;">Read Statistics</h3>
                        <button class="close-stats-modal" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display: flex; justify-content: space-around; margin-bottom: 20px; text-align: center;">
                            <div>
                                <div style="font-size: 32px; font-weight: 700; color: #27ae60;">${stats.readCount}</div>
                                <div style="color: #666; font-size: 14px;">Read</div>
                            </div>
                            <div>
                                <div style="font-size: 32px; font-weight: 700; color: #e74c3c;">${stats.totalRecipients - stats.readCount}</div>
                                <div style="color: #666; font-size: 14px;">Unread</div>
                            </div>
                            <div>
                                <div style="font-size: 32px; font-weight: 700; color: #667eea;">${stats.readPercentage}%</div>
                                <div style="color: #666; font-size: 14px;">Read Rate</div>
                            </div>
                        </div>

                        <h4 style="margin: 20px 0 10px; font-size: 14px; color: #333;">Recipients</h4>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${stats.recipients.map(r => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f0f0f0;">
                                    <span>${r.firstName} ${r.lastName}</span>
                                    ${r.hasRead
                                        ? `<span style="color: #27ae60; font-size: 12px;"><i class="fas fa-check-circle"></i> Read ${new Date(r.readAt).toLocaleString()}</span>`
                                        : '<span style="color: #999; font-size: 12px;"><i class="fas fa-clock"></i> Not read</span>'
                                    }
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            modal.querySelector('.close-stats-modal').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

        } catch (error) {
            console.error('[Announcements] Stats error:', error);
            alert('Error loading statistics');
        }
    }

    // Delete announcement
    async function deleteAnnouncement(announcementId) {
        if (!confirm('Are you sure you want to delete this announcement?')) return;

        try {
            const response = await csrfFetch(`/api/announcements/teacher/${announcementId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                loadSentAnnouncements();
            } else {
                alert('Failed to delete: ' + data.message);
            }
        } catch (error) {
            console.error('[Announcements] Delete error:', error);
            alert('Error deleting announcement');
        }
    }

    // Show status message
    function showStatus(message, type) {
        if (!announcementStatus) return;

        announcementStatus.style.display = 'block';
        announcementStatus.style.padding = '12px';
        announcementStatus.style.borderRadius = '6px';
        announcementStatus.style.textAlign = 'center';

        if (type === 'success') {
            announcementStatus.style.background = '#d4edda';
            announcementStatus.style.color = '#155724';
            announcementStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        } else {
            announcementStatus.style.background = '#f8d7da';
            announcementStatus.style.color = '#721c24';
            announcementStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        }

        setTimeout(() => {
            announcementStatus.style.display = 'none';
        }, 5000);
    }

    // HTML escape helper
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

;
/* --- /js/teacher-messaging.js --- */
/**
 * Teacher Messaging - Parent Communication
 * Handles teacher-parent messaging through the Messages tab
 */

document.addEventListener('DOMContentLoaded', () => {
    const conversationsList = document.getElementById('conversations-list');
    const messageThread = document.getElementById('message-thread');
    const messageThreadHeader = document.getElementById('message-thread-header');
    const messageCompose = document.getElementById('message-compose');
    const messageReplyInput = document.getElementById('message-reply-input');
    const sendReplyBtn = document.getElementById('send-reply-btn');
    const unreadBadge = document.getElementById('unread-messages-badge');

    let currentConversationUserId = null;
    let conversations = [];

    // Initialize when messages tab is clicked
    const messagesTab = document.querySelector('[data-tab="messages"]');
    if (messagesTab) {
        messagesTab.addEventListener('click', () => {
            loadConversations();
            loadUnreadCount();
        });
    }

    // Load unread count on page load
    loadUnreadCount();

    // Load conversations list
    async function loadConversations() {
        if (!conversationsList) return;

        conversationsList.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const response = await fetch('/api/messages/conversations');
            if (!response.ok) throw new Error('Failed to load conversations');

            const data = await response.json();
            conversations = data.conversations || [];

            if (conversations.length === 0) {
                conversationsList.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #666;">
                        <i class="fas fa-comments" style="font-size: 32px; color: #ddd; margin-bottom: 10px;"></i>
                        <p style="margin: 0;">No conversations yet</p>
                        <p style="font-size: 0.85em; margin-top: 5px;">Messages from parents will appear here</p>
                    </div>
                `;
                return;
            }

            conversationsList.innerHTML = conversations.map(conv => {
                const participant = conv.participant;
                const lastMsg = conv.lastMessage;
                const unread = conv.unreadCount > 0;

                return `
                    <div class="conversation-item ${unread ? 'unread' : ''}" data-user-id="${participant._id}"
                         style="padding: 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; ${unread ? 'background: #f0f8ff;' : ''} transition: background 0.2s;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: ${unread ? '700' : '500'}; color: #333;">
                                    ${participant.firstName} ${participant.lastName}
                                </div>
                                <div style="font-size: 0.85em; color: #999;">${participant.role}</div>
                            </div>
                            ${unread ? `<span style="background: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${conv.unreadCount}</span>` : ''}
                        </div>
                        <div style="font-size: 0.9em; color: #666; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${lastMsg.isFromMe ? '<i class="fas fa-reply" style="color: #999; margin-right: 4px;"></i>' : ''}
                            ${escapeHtml(lastMsg.body)}
                        </div>
                        <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                            ${formatTimeAgo(new Date(lastMsg.createdAt))}
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.addEventListener('click', () => {
                    loadMessageThread(item.dataset.userId);
                    document.querySelectorAll('.conversation-item').forEach(i => i.style.background = '');
                    item.style.background = '#e8f4f8';
                });

                item.addEventListener('mouseenter', () => {
                    if (!item.classList.contains('unread')) {
                        item.style.background = '#f5f5f5';
                    }
                });

                item.addEventListener('mouseleave', () => {
                    if (item.dataset.userId !== currentConversationUserId) {
                        item.style.background = item.classList.contains('unread') ? '#f0f8ff' : '';
                    }
                });
            });

        } catch (error) {
            console.error('[Messaging] Load conversations error:', error);
            conversationsList.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading conversations</p>';
        }
    }

    // Load message thread
    async function loadMessageThread(userId) {
        if (!messageThread) return;

        currentConversationUserId = userId;
        messageThread.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const response = await fetch(`/api/messages/with/${userId}`);
            if (!response.ok) throw new Error('Failed to load messages');

            const data = await response.json();
            const messages = data.messages || [];
            const otherUser = data.otherUser;

            // Update header
            if (messageThreadHeader) {
                messageThreadHeader.innerHTML = `
                    <i class="fas fa-user"></i> ${otherUser.firstName} ${otherUser.lastName}
                    <span style="font-size: 0.85em; color: #999; margin-left: 10px;">(${otherUser.role})</span>
                `;
            }

            // Render messages
            if (messages.length === 0) {
                messageThread.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">No messages in this conversation yet.</p>';
            } else {
                messageThread.innerHTML = messages.map(msg => {
                    const isMe = msg.isFromMe;
                    const time = new Date(msg.createdAt).toLocaleString();

                    return `
                        <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 16px;">
                            <div style="max-width: 70%; padding: 12px 16px; border-radius: ${isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'}; background: ${isMe ? 'linear-gradient(135deg, #27ae60, #16a085)' : '#f5f5f5'}; color: ${isMe ? 'white' : '#333'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                ${msg.subject ? `<div style="font-weight: 600; margin-bottom: 6px; font-size: 0.9em;">${escapeHtml(msg.subject)}</div>` : ''}
                                <div style="line-height: 1.5;">${escapeHtml(msg.body)}</div>
                            </div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${time}
                                ${isMe && msg.status === 'read' ? '<i class="fas fa-check-double" style="color: #27ae60; margin-left: 4px;"></i>' : ''}
                            </div>
                        </div>
                    `;
                }).join('');

                // Scroll to bottom
                messageThread.scrollTop = messageThread.scrollHeight;
            }

            // Show compose area
            if (messageCompose) {
                messageCompose.style.display = 'block';
            }

            // Refresh unread count
            loadUnreadCount();
            loadConversations();

        } catch (error) {
            console.error('[Messaging] Load thread error:', error);
            messageThread.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 40px;">Error loading messages</p>';
        }
    }

    // Send reply
    if (sendReplyBtn && messageReplyInput) {
        sendReplyBtn.addEventListener('click', sendReply);
        messageReplyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendReply();
            }
        });
    }

    async function sendReply() {
        if (!currentConversationUserId) return;

        const body = messageReplyInput.value.trim();
        if (!body) return;

        sendReplyBtn.disabled = true;
        sendReplyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await csrfFetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientId: currentConversationUserId,
                    body
                })
            });

            const data = await response.json();

            if (data.success) {
                messageReplyInput.value = '';
                loadMessageThread(currentConversationUserId);
            } else {
                alert('Failed to send message: ' + data.message);
            }
        } catch (error) {
            console.error('[Messaging] Send error:', error);
            alert('Error sending message');
        } finally {
            sendReplyBtn.disabled = false;
            sendReplyBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }

    // Load unread count
    async function loadUnreadCount() {
        try {
            const response = await fetch('/api/messages/unread-count');
            if (!response.ok) return;

            const data = await response.json();
            const count = data.unreadCount || 0;

            if (unreadBadge) {
                if (count > 0) {
                    unreadBadge.textContent = count > 99 ? '99+' : count;
                    unreadBadge.style.display = 'inline-block';
                } else {
                    unreadBadge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('[Messaging] Unread count error:', error);
        }
    }

    // Helper: format time ago
    function formatTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    // Helper: escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Poll for new messages every 30 seconds
    setInterval(() => {
        loadUnreadCount();
        if (document.querySelector('#messages-tab.active')) {
            loadConversations();
        }
    }, 30000);
});

;
/* --- /js/guided-tour.js?v=20260728 --- */
/**
 * Guided Tour System - Reusable Onboarding Tours for MATHMATIX AI
 *
 * Usage:
 *   const tour = new GuidedTour('teacher-dashboard', teacherTourSteps);
 *   tour.start();
 *
 * Tour steps format:
 *   [{
 *     element: '#element-selector',  // CSS selector for the target element
 *     title: 'Step Title',
 *     content: 'Description of this feature...',
 *     position: 'bottom',  // 'top', 'bottom', 'left', 'right'
 *     highlight: true,     // Whether to spotlight the element
 *     action: () => {}     // Optional callback when step is shown
 *   }]
 */

class GuidedTour {
    constructor(tourId, steps, options = {}) {
        this.tourId = tourId;
        this.steps = steps;
        this.currentStep = 0;
        this.isActive = false;

        // Options
        this.options = {
            onComplete: options.onComplete || null,
            onSkip: options.onSkip || null,
            showProgress: options.showProgress !== false,
            allowSkip: options.allowSkip !== false,
            overlayOpacity: options.overlayOpacity || 0.75,
            primaryColor: options.primaryColor || '#667eea',
            storageKey: options.storageKey || `tour_completed_${tourId}`
        };

        // Elements
        this.overlay = null;
        this.tooltip = null;
        this.spotlight = null;

        // Bind methods
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleResize = this.handleResize.bind(this);
    }

    // Check if tour has been completed
    hasCompleted() {
        return StorageUtils.local.getItem(this.options.storageKey) === 'true';
    }

    // Mark tour as completed
    markCompleted() {
        StorageUtils.local.setItem(this.options.storageKey, 'true');
    }

    // Reset tour completion status
    reset() {
        StorageUtils.local.removeItem(this.options.storageKey);
    }

    // Start the tour
    start(forceRestart = false) {
        if (this.hasCompleted() && !forceRestart) {
            console.log(`[GuidedTour] Tour "${this.tourId}" already completed. Use start(true) to force restart.`);
            return false;
        }

        if (this.steps.length === 0) {
            console.warn('[GuidedTour] No steps defined for tour');
            return false;
        }

        this.isActive = true;
        this.currentStep = 0;
        this.createOverlay();
        this.createTooltip();
        this.showStep(0);

        // Add event listeners
        document.addEventListener('keydown', this.handleKeydown);
        window.addEventListener('resize', this.handleResize);

        return true;
    }

    // Create the overlay and spotlight
    createOverlay() {
        // Main overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'guided-tour-overlay';
        this.overlay.innerHTML = `
            <svg class="guided-tour-spotlight-svg" width="100%" height="100%">
                <defs>
                    <mask id="spotlight-mask">
                        <rect width="100%" height="100%" fill="white"/>
                        <rect class="spotlight-cutout" x="0" y="0" width="0" height="0" rx="8" fill="black"/>
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,${this.options.overlayOpacity})" mask="url(#spotlight-mask)"/>
            </svg>
        `;
        document.body.appendChild(this.overlay);

        // Add styles if not already present
        if (!document.getElementById('guided-tour-styles')) {
            const styles = document.createElement('style');
            styles.id = 'guided-tour-styles';
            styles.textContent = `
                .guided-tour-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 99998;
                    pointer-events: none;
                }

                .guided-tour-spotlight-svg {
                    width: 100%;
                    height: 100%;
                }

                .spotlight-cutout {
                    transition: all 0.3s ease;
                }

                .guided-tour-tooltip {
                    position: fixed;
                    z-index: 99999;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    max-width: 360px;
                    min-width: 280px;
                    pointer-events: auto;
                    animation: tooltipFadeIn 0.3s ease;
                }

                @keyframes tooltipFadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .guided-tour-tooltip-header {
                    padding: 16px 20px 12px;
                    border-bottom: 1px solid #f0f0f0;
                }

                .guided-tour-tooltip-title {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #2c3e50;
                }

                .guided-tour-tooltip-content {
                    padding: 16px 20px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #555;
                }

                .guided-tour-tooltip-footer {
                    padding: 12px 20px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px solid #f0f0f0;
                }

                .guided-tour-progress {
                    font-size: 12px;
                    color: #999;
                }

                .guided-tour-progress-dots {
                    display: flex;
                    gap: 6px;
                    margin-top: 4px;
                }

                .guided-tour-progress-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #e0e0e0;
                    transition: background 0.2s;
                }

                .guided-tour-progress-dot.active {
                    background: ${this.options.primaryColor};
                }

                .guided-tour-progress-dot.completed {
                    background: #27ae60;
                }

                .guided-tour-buttons {
                    display: flex;
                    gap: 10px;
                }

                .guided-tour-btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }

                .guided-tour-btn-secondary {
                    background: #f5f5f5;
                    color: #666;
                }

                .guided-tour-btn-secondary:hover {
                    background: #e8e8e8;
                }

                .guided-tour-btn-primary {
                    background: ${this.options.primaryColor};
                    color: white;
                }

                .guided-tour-btn-primary:hover {
                    opacity: 0.9;
                }

                .guided-tour-btn-skip {
                    background: transparent;
                    color: #999;
                    padding: 8px 12px;
                }

                .guided-tour-btn-skip:hover {
                    color: #666;
                }

                .guided-tour-tooltip-arrow {
                    position: absolute;
                    width: 16px;
                    height: 16px;
                    background: white;
                    transform: rotate(45deg);
                    box-shadow: -2px -2px 4px rgba(0,0,0,0.05);
                }

                .guided-tour-tooltip-arrow.bottom { top: -8px; }
                .guided-tour-tooltip-arrow.top { bottom: -8px; }
                .guided-tour-tooltip-arrow.left { right: -8px; }
                .guided-tour-tooltip-arrow.right { left: -8px; }

                /* Highlighted element gets higher z-index */
                .guided-tour-highlighted {
                    position: relative;
                    z-index: 99997 !important;
                    pointer-events: auto;
                }

                /* Pulse animation for highlighted elements */
                .guided-tour-pulse {
                    animation: tourPulse 2s infinite;
                }

                @keyframes tourPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.4); }
                    50% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    // Create the tooltip
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'guided-tour-tooltip';
        document.body.appendChild(this.tooltip);
    }

    // Show a specific step
    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        const step = this.steps[index];
        const element = document.querySelector(step.element);

        // Element not found or not visible (e.g. inside collapsed sidebar)
        if (!element || (element.offsetParent === null && getComputedStyle(element).position !== 'fixed')) {
            console.warn(`[GuidedTour] Element not found or hidden: ${step.element}`);
            // Skip this step only — don't chain-complete the entire tour
            this._skipStep(index);
            return;
        }

        this.currentStep = index;

        // Remove highlight from previous element
        document.querySelectorAll('.guided-tour-highlighted, .guided-tour-pulse').forEach(el => {
            el.classList.remove('guided-tour-highlighted', 'guided-tour-pulse');
        });

        // Highlight current element
        if (step.highlight !== false) {
            element.classList.add('guided-tour-highlighted');
            if (step.pulse !== false) {
                element.classList.add('guided-tour-pulse');
            }
        }

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Update spotlight
        setTimeout(() => {
            this.updateSpotlight(element);
            this.updateTooltip(step, element);

            // Call step action if defined
            if (step.action && typeof step.action === 'function') {
                step.action(element, this);
            }
        }, 300);
    }

    // Skip a missing/hidden step without chain-completing the tour.
    // Finds the next visible step forward; if none, tries backward; if none at all, completes.
    _skipStep(fromIndex) {
        // Try forward
        for (let i = fromIndex + 1; i < this.steps.length; i++) {
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
        // Try backward (wrap around to earlier steps we haven't shown)
        for (let i = fromIndex - 1; i >= 0; i--) {
            if (i === this.currentStep) continue; // don't re-show current
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
        // No visible steps at all — complete
        this.complete();
    }

    // Update the spotlight cutout
    updateSpotlight(element) {
        const rect = element.getBoundingClientRect();
        const padding = 8;

        const cutout = this.overlay.querySelector('.spotlight-cutout');
        cutout.setAttribute('x', rect.left - padding);
        cutout.setAttribute('y', rect.top - padding);
        cutout.setAttribute('width', rect.width + padding * 2);
        cutout.setAttribute('height', rect.height + padding * 2);
    }

    // Update the tooltip content and position
    updateTooltip(step, element) {
        const rect = element.getBoundingClientRect();
        const position = step.position || 'bottom';

        // Build progress dots
        let progressHtml = '';
        if (this.options.showProgress) {
            const dots = this.steps.map((_, i) => {
                let cls = 'guided-tour-progress-dot';
                if (i < this.currentStep) cls += ' completed';
                if (i === this.currentStep) cls += ' active';
                return `<div class="${cls}"></div>`;
            }).join('');
            progressHtml = `
                <div class="guided-tour-progress">
                    <span>Step ${this.currentStep + 1} of ${this.steps.length}</span>
                    <div class="guided-tour-progress-dots">${dots}</div>
                </div>
            `;
        }

        // Build buttons
        const isFirst = this.currentStep === 0;
        const isLast = this.currentStep === this.steps.length - 1;

        let buttonsHtml = '<div class="guided-tour-buttons">';
        if (!isFirst) {
            buttonsHtml += '<button class="guided-tour-btn guided-tour-btn-secondary" data-action="prev">Back</button>';
        }
        if (this.options.allowSkip && !isLast) {
            buttonsHtml += '<button class="guided-tour-btn guided-tour-btn-skip" data-action="skip">Skip Tour</button>';
        }
        buttonsHtml += `<button class="guided-tour-btn guided-tour-btn-primary" data-action="${isLast ? 'complete' : 'next'}">${isLast ? 'Finish' : 'Next'}</button>`;
        buttonsHtml += '</div>';

        // Set tooltip content
        this.tooltip.innerHTML = `
            <div class="guided-tour-tooltip-arrow ${position}"></div>
            <div class="guided-tour-tooltip-header">
                <h3 class="guided-tour-tooltip-title">${step.title}</h3>
            </div>
            <div class="guided-tour-tooltip-content">
                ${step.content}
            </div>
            <div class="guided-tour-tooltip-footer">
                ${progressHtml}
                ${buttonsHtml}
            </div>
        `;

        // Add button listeners
        this.tooltip.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const button = e.target.closest('[data-action]');
                if (!button) return;
                const action = button.dataset.action;
                if (action === 'next') this.next();
                else if (action === 'prev') this.prev();
                else if (action === 'skip') this.skip();
                else if (action === 'complete') this.complete();
            });
        });

        // Position tooltip
        this.positionTooltip(rect, position);
    }

    // Position the tooltip relative to the target element
    positionTooltip(targetRect, position) {
        const tooltip = this.tooltip;
        const tooltipRect = tooltip.getBoundingClientRect();
        const padding = 16;
        const arrowSize = 8;

        let top, left;

        switch (position) {
            case 'top':
                top = targetRect.top - tooltipRect.height - padding - arrowSize;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = targetRect.bottom + padding + arrowSize;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - padding - arrowSize;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + padding + arrowSize;
                break;
            default:
                top = targetRect.bottom + padding;
                left = targetRect.left;
        }

        // Keep tooltip on screen
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (left < padding) left = padding;
        if (left + tooltipRect.width > viewportWidth - padding) {
            left = viewportWidth - tooltipRect.width - padding;
        }
        if (top < padding) top = padding;
        if (top + tooltipRect.height > viewportHeight - padding) {
            top = viewportHeight - tooltipRect.height - padding;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;

        // Position arrow
        const arrow = tooltip.querySelector('.guided-tour-tooltip-arrow');
        if (arrow) {
            const arrowOffset = Math.min(
                Math.max(20, targetRect.left + targetRect.width / 2 - left),
                tooltipRect.width - 20
            );

            if (position === 'top' || position === 'bottom') {
                arrow.style.left = `${arrowOffset}px`;
            } else {
                arrow.style.top = `${Math.min(Math.max(20, targetRect.top + targetRect.height / 2 - top), tooltipRect.height - 20)}px`;
            }
        }
    }

    // Go to next step (skips hidden elements automatically)
    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.complete();
        }
    }

    // Go to previous step (skips hidden elements automatically)
    prev() {
        // Find the nearest previous visible step
        for (let i = this.currentStep - 1; i >= 0; i--) {
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
    }

    // Skip the tour
    skip() {
        this.cleanup();
        if (this.options.onSkip) {
            this.options.onSkip(this.currentStep);
        }
    }

    // Complete the tour
    complete() {
        this.markCompleted();
        this.cleanup();
        if (this.options.onComplete) {
            this.options.onComplete();
        }
    }

    // Clean up tour elements
    cleanup() {
        this.isActive = false;

        // Remove elements
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }

        // Remove highlights
        document.querySelectorAll('.guided-tour-highlighted, .guided-tour-pulse').forEach(el => {
            el.classList.remove('guided-tour-highlighted', 'guided-tour-pulse');
        });

        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeydown);
        window.removeEventListener('resize', this.handleResize);
    }

    // Handle keyboard navigation
    handleKeydown(e) {
        if (!this.isActive) return;

        switch (e.key) {
            case 'ArrowRight':
            case 'Enter':
                e.preventDefault();
                this.next();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.prev();
                break;
            case 'Escape':
                e.preventDefault();
                this.skip();
                break;
        }
    }

    // Handle window resize
    handleResize() {
        if (!this.isActive) return;

        const step = this.steps[this.currentStep];
        const element = document.querySelector(step.element);
        if (element) {
            this.updateSpotlight(element);
            this.positionTooltip(element.getBoundingClientRect(), step.position || 'bottom');
        }
    }
}

// Export for use
window.GuidedTour = GuidedTour;


// ============================================
// PREDEFINED TOUR CONFIGURATIONS
// ============================================

// Teacher Dashboard Tour
window.teacherDashboardTour = [
    {
        element: '.class-overview',
        title: 'Class Overview',
        content: 'See your entire class at a glance. Track active students, those needing attention, and overall progress metrics.',
        position: 'bottom'
    },
    {
        element: '#student-search',
        title: 'Search & Filter',
        content: 'Quickly find students by name or filter by status (active, struggling, inactive).',
        position: 'bottom'
    },
    {
        element: '.student-card',
        title: 'Student Cards',
        content: 'Each card shows key metrics: level, XP, last login, and weekly activity. Click a name for full details.',
        position: 'right'
    },
    {
        element: '.view-as-student-btn',
        title: 'View as Student',
        content: 'See exactly what your students see. Great for troubleshooting or understanding their experience.',
        position: 'top'
    },
    {
        element: '.view-iep-btn',
        title: 'IEP Management',
        content: 'Manage Individualized Education Plans with accommodations, goals, and progress tracking.',
        position: 'top'
    },
    {
        element: '[data-tab="announcements"]',
        title: 'Send Announcements',
        content: 'Send instant messages to your entire class or individual students. They\'ll see them right in their dashboard.',
        position: 'bottom'
    },
    {
        element: '[data-tab="messages"]',
        title: 'Parent Messaging',
        content: 'Communicate directly with parents about their child\'s progress, concerns, or achievements.',
        position: 'bottom'
    },
    {
        element: '#qa-export-progress',
        title: 'Export Data',
        content: 'Download student progress data as a CSV for reports or grade books.',
        position: 'left'
    }
];

// Parent Dashboard Tour
window.parentDashboardTour = [
    {
        element: '.child-card',
        title: 'Your Child\'s Progress',
        content: 'See detailed progress for each linked child, including level, XP, recent sessions, and IEP goals.',
        position: 'right'
    },
    {
        element: '.view-as-child-btn',
        title: 'View as Your Child',
        content: 'Experience exactly what your child sees when they use MATHMATIX AI. Great for understanding their learning journey.',
        position: 'top'
    },
    {
        element: '#childSelector',
        title: 'Ask About Progress',
        content: 'Select a child and ask questions about their math progress. The AI will give you personalized insights.',
        position: 'bottom'
    },
    {
        element: '.helper-btn',
        title: 'Quick Questions',
        content: 'Click these buttons to quickly ask common questions about your child\'s learning.',
        position: 'top'
    },
    {
        element: '#parent-learning-center',
        title: 'Parent Courses',
        content: 'Enroll in free mini-courses designed to help you understand the math your child is learning. Lessons are short, conversational, and built for busy parents.',
        position: 'right'
    },
    {
        element: '#send-weekly-report-btn',
        title: 'Email Reports',
        content: 'Get detailed progress reports sent directly to your email.',
        position: 'left'
    },
    {
        element: '#generate-code-btn',
        title: 'Link More Children',
        content: 'Generate a code to link additional children to your parent account.',
        position: 'bottom'
    }
];

// Student Dashboard Tour
window.studentDashboardTour = [
    {
        element: '#user-input',
        title: 'Your AI Tutor',
        content: 'This is your personal math tutor! Type a question here to get help with homework, practice new skills, or explore math topics.',
        position: 'top'
    },
    {
        element: '#drawer-daily-quests-container',
        title: 'Daily Quests',
        content: 'Complete quests every day to earn XP and build your streak! Consistency is key to mastering math.',
        position: 'right'
    },
    {
        element: '#cr-xp-meter',
        title: 'Your Progress',
        content: 'Track your XP and level here. The more you practice, the higher you\'ll climb!',
        position: 'bottom'
    },
    {
        element: '#drawer-leaderboard-table',
        title: 'Leaderboard',
        content: 'See how you stack up against your classmates! Earn XP to climb the ranks.',
        position: 'right'
    },
    {
        element: '#open-settings-modal-btn',
        title: 'Choose Your Tutor',
        content: 'Open Settings to pick a different AI tutor. Each tutor has its own personality and teaching style!',
        position: 'bottom'
    },
    {
        element: '#camera-button',
        title: 'Show Your Work',
        content: 'Snap a photo or upload a PDF of your handwritten work and get instant feedback and grading. Unlimited with Mathmatix+!',
        position: 'top'
    }
];

// Admin Dashboard Tour
window.adminDashboardTour = [
    {
        element: '.left-sidebar',
        title: 'System Status',
        content: 'Database health, AI service status, and the top-students leaderboard at a glance.',
        position: 'right'
    },
    {
        element: '#userStatCards',
        title: 'User Management',
        content: 'User counts by role, with the full searchable user list below. Edit accounts, assign teachers, and link parents.',
        position: 'bottom'
    },
    {
        element: '#openTeacherSetupBtn',
        title: 'Add Teachers',
        content: 'Create teacher accounts and generate enrollment codes for their classes.',
        position: 'bottom'
    },
    {
        element: '#openRosterImportBtn',
        title: 'Import Rosters',
        content: 'Bulk-import students from a CSV roster and assign them to teachers in one pass.',
        position: 'bottom'
    },
    {
        element: '#openBulkEmailBtn',
        title: 'Bulk Email',
        content: 'Send emails to all students, parents, or teachers. Great for announcements and newsletters.',
        position: 'bottom'
    }
];


// ============================================
// AUTO-START TOUR FOR NEW USERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Detect which dashboard we're on and offer tour
    const path = window.location.pathname;

    let tourConfig = null;
    let tourId = null;

    if (path.includes('teacher-dashboard')) {
        tourConfig = window.teacherDashboardTour;
        tourId = 'teacher-dashboard';
    } else if (path.includes('parent-dashboard')) {
        tourConfig = window.parentDashboardTour;
        tourId = 'parent-dashboard';
    } else if (path.includes('student-dashboard') || path.includes('chat.html')) {
        tourConfig = window.studentDashboardTour;
        tourId = 'student-dashboard';
    } else if (path.includes('admin-dashboard')) {
        tourConfig = window.adminDashboardTour;
        tourId = 'admin-dashboard';
    }

    if (tourConfig && tourId) {
        const tour = new GuidedTour(tourId, tourConfig, {
            onComplete: () => {
                showTourCompletionMessage();
            }
        });

        // Check if user hasn't seen the tour
        if (!tour.hasCompleted()) {
            // Show "Take a Tour" prompt after a short delay
            setTimeout(() => {
                showTourPrompt(tour);
            }, 1500);
        }

        // Add "Help" button to trigger tour manually
        addTourButton(tour);
    }
});

// Show prompt asking if user wants to take the tour
function showTourPrompt(tour) {
    const prompt = document.createElement('div');
    prompt.id = 'tour-prompt';
    prompt.innerHTML = `
        <div style="position: fixed; bottom: 20px; right: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); padding: 20px; max-width: 320px; z-index: 9999; animation: slideUp 0.3s ease;">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="font-size: 32px;">👋</div>
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #2c3e50;">Welcome! New here?</h3>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #666; line-height: 1.5;">Take a quick tour to learn about all the features available to you.</p>
                    <div style="display: flex; gap: 10px;">
                        <button id="tour-start-btn" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Take Tour</button>
                        <button id="tour-dismiss-btn" style="background: #f5f5f5; color: #666; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Maybe Later</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(prompt);

    document.getElementById('tour-start-btn').addEventListener('click', () => {
        prompt.remove();
        tour.start(true);
    });

    document.getElementById('tour-dismiss-btn').addEventListener('click', () => {
        prompt.remove();
        tour.markCompleted(); // Don't show again
    });

    // Auto-dismiss after 30 seconds. Previously this just removed the
    // element without persisting — so an ignored prompt would pop again
    // on every page load. "If dismissed, it goes" means *any* dismissal
    // (button, timeout, future X close) counts. Mark completed here too.
    setTimeout(() => {
        if (prompt.parentElement) {
            prompt.remove();
            tour.markCompleted();
        }
    }, 30000);
}

// Add a "Help / Tour" button to the page
function addTourButton(tour) {
    // Check if there's already a help button area
    let helpArea = document.querySelector('.tour-help-btn');
    if (helpArea) return;

    // "If dismissed, it goes" — once the user has dismissed the prompt
    // (Maybe Later, X close, or 30s auto-dismiss), the floating help
    // pill stops auto-injecting on subsequent loads too. The tour can
    // still be re-launched programmatically (e.g. from a hamburger menu
    // "Replay tour" item) via tour.start(true) — that bypasses
    // hasCompleted, so power users aren't permanently locked out.
    if (typeof tour?.hasCompleted === 'function' && tour.hasCompleted()) {
        return;
    }

    const btn = document.createElement('button');
    btn.className = 'tour-help-btn';
    btn.innerHTML = '<i class="fas fa-question-circle"></i> Tour';
    btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        border: 1px solid #e0e0e0;
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        color: #666;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 9990;
        transition: all 0.2s;
    `;

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f5f5f5';
    });

    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'white';
    });

    btn.addEventListener('click', () => {
        tour.start(true);
    });

    document.body.appendChild(btn);
}

// Show completion message
function showTourCompletionMessage() {
    const msg = document.createElement('div');
    msg.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); padding: 40px; text-align: center; z-index: 100000; animation: scaleIn 0.3s ease;">
            <div style="font-size: 64px; margin-bottom: 16px;">🎉</div>
            <h2 style="margin: 0 0 12px 0; color: #2c3e50;">Tour Complete!</h2>
            <p style="margin: 0 0 24px 0; color: #666; font-size: 16px;">You're all set. Click "Tour" anytime to revisit.</p>
            <button onclick="this.parentElement.parentElement.remove()" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 12px 32px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500;">Got it!</button>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes scaleIn {
            from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
            to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(msg);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (msg.parentElement) msg.remove();
    }, 5000);
}

;
/* --- /js/sessionManager.js --- */
/**
 * Session Manager - Handles session lifecycle, idle timeout, and auto-save
 *
 * Features:
 * - 20-minute idle timeout with 2-minute warning
 * - Heartbeat tracking every 30 seconds
 * - Auto-save mastery progress on logout
 * - Session summary generation
 * - Tab/browser close detection
 */

class SessionManager {
  constructor() {
    this.IDLE_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds
    this.WARNING_TIME = 2 * 60 * 1000;  // 2 minutes warning before timeout
    this.HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds
    this.IDLE_THRESHOLD = 60 * 1000; // Consider idle after 60 seconds of no activity
    this.MAX_BACKOFF = 5 * 60 * 1000; // Cap backoff at 5 minutes

    this.lastActivity = Date.now();
    this.warningShown = false;
    this.heartbeatTimer = null;
    this.currentHeartbeatInterval = this.HEARTBEAT_INTERVAL;
    this.consecutiveFailures = 0;
    this.idleCheckTimer = null;
    this.warningTimer = null;
    this.sessionStartTime = Date.now();

    // IMPROVED: Precise active time tracking
    this.lastActiveTimestamp = Date.now(); // When we last recorded activity
    this.accumulatedActiveSeconds = 0; // Seconds accumulated since last heartbeat
    this.isCurrentlyActive = true; // Whether user is currently active (not idle)

    this.sessionData = {
      problemsAttempted: 0,
      problemsSolved: 0,
      hintsUsed: 0,
      timeSpent: 0,
      masteryProgress: null
    };

    this.stopped = false;
    this.init();
  }

  init() {
    // Track user activity
    this.setupActivityTrackers();

    // Start heartbeat
    this.startHeartbeat();

    // Start idle check only if auto-logout.js is NOT loaded (avoid competing timers).
    // auto-logout.js sets window.triggerLogout when initialized.
    // If both scripts are present on a page, auto-logout.js handles the timeout
    // and sessionManager focuses on heartbeats, time tracking, and session end beacons.
    this.idleCheckEnabled = !window.triggerLogout;
    if (this.idleCheckEnabled) {
      this.startIdleCheck();
      console.log('[SessionManager] Initialized with idle timeout (20 min)');
    } else {
      console.log('[SessionManager] Initialized (idle timeout deferred to auto-logout.js)');
    }

    // Stop all timers if session expires (401 detected by csrfFetch)
    window.addEventListener('session-expired', () => this.stop());

    // Handle page unload (tab/browser close)
    this.setupUnloadHandler();
  }

  setupActivityTrackers() {
    // Track mouse movement, keyboard input, clicks, touches
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(event => {
      document.addEventListener(event, () => {
        this.recordActivity();
      }, { passive: true });
    });
  }

  recordActivity() {
    const now = Date.now();
    const wasIdle = (now - this.lastActivity) > this.IDLE_TIMEOUT;
    const wasInactive = (now - this.lastActivity) > this.IDLE_THRESHOLD;

    // IMPROVED: Track active time precisely
    // If user was active (not idle), add the time since last activity
    if (this.isCurrentlyActive && !wasInactive) {
      const secondsSinceLastActivity = Math.floor((now - this.lastActiveTimestamp) / 1000);
      // Only count time if it's reasonable (less than idle threshold to avoid counting idle time)
      if (secondsSinceLastActivity > 0 && secondsSinceLastActivity < (this.IDLE_THRESHOLD / 1000)) {
        this.accumulatedActiveSeconds += secondsSinceLastActivity;
      }
    }

    // Update timestamps
    this.lastActivity = now;
    this.lastActiveTimestamp = now;
    this.isCurrentlyActive = true;

    // If user was idle and warning was shown, dismiss it
    if (this.warningShown) {
      this.dismissWarning();
    }

    // If user came back from being idle, send heartbeat immediately
    if (wasIdle) {
      this.sendHeartbeat();
    }
  }

  // Called periodically to check if user became idle
  checkAndUpdateActiveTime() {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;

    if (timeSinceLastActivity > this.IDLE_THRESHOLD) {
      // User is idle - stop counting active time
      this.isCurrentlyActive = false;
    } else if (this.isCurrentlyActive) {
      // User is still active - accumulate time
      const secondsSinceLastRecord = Math.floor((now - this.lastActiveTimestamp) / 1000);
      if (secondsSinceLastRecord > 0 && secondsSinceLastRecord < (this.IDLE_THRESHOLD / 1000)) {
        this.accumulatedActiveSeconds += secondsSinceLastRecord;
        this.lastActiveTimestamp = now;
      }
    }
  }

  startHeartbeat() {
    // Send initial heartbeat
    this.sendHeartbeat();

    // Send heartbeat on a dynamic interval (backs off on 429)
    this.scheduleNextHeartbeat();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.heartbeatTimer);
    clearInterval(this.idleCheckTimer);
    clearTimeout(this.warningTimer);
    this.heartbeatTimer = null;
    console.log('[SessionManager] Stopped (session expired)');
  }

  scheduleNextHeartbeat() {
    if (this.stopped) return;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      this.checkAndUpdateActiveTime();
      this.sendHeartbeat();
      this.scheduleNextHeartbeat();
    }, this.currentHeartbeatInterval);
  }

  handleHeartbeatSuccess() {
    if (this.consecutiveFailures > 0) {
      console.log('[SessionManager] Heartbeat recovered, resetting interval');
    }
    this.consecutiveFailures = 0;
    this.currentHeartbeatInterval = this.HEARTBEAT_INTERVAL;
  }

  handleHeartbeatFailure(status) {
    this.consecutiveFailures++;
    if (status === 429) {
      // Exponential backoff: 60s, 120s, 240s, capped at MAX_BACKOFF
      this.currentHeartbeatInterval = Math.min(
        this.HEARTBEAT_INTERVAL * Math.pow(2, this.consecutiveFailures),
        this.MAX_BACKOFF
      );
      console.warn(`[SessionManager] Rate limited, backing off to ${Math.round(this.currentHeartbeatInterval / 1000)}s`);
    }
  }

  async sendHeartbeat() {
    if (this.stopped) return;
    try {
      // Check active time one more time before sending
      this.checkAndUpdateActiveTime();

      // Get the accumulated active seconds and reset the counter
      const activeSecondsToSend = this.accumulatedActiveSeconds;
      this.accumulatedActiveSeconds = 0;
      this.lastActiveTimestamp = Date.now();

      // Send heartbeat for session keepalive
      const heartbeatResponse = await csrfFetch('/api/session/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lastActivity: this.lastActivity,
          sessionData: this.sessionData
        }),
        credentials: 'include'
      });

      if (!heartbeatResponse.ok) {
        console.error('[SessionManager] Heartbeat failed:', heartbeatResponse.status);
        this.handleHeartbeatFailure(heartbeatResponse.status);
        // Re-accumulate seconds on failure so they're not lost
        this.accumulatedActiveSeconds += activeSecondsToSend;
        return;
      }

      this.handleHeartbeatSuccess();

      // Send active time tracking if we have any active seconds
      if (activeSecondsToSend > 0) {
        const trackTimeResponse = await csrfFetch('/api/chat/track-time', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            activeSeconds: activeSecondsToSend
          }),
          credentials: 'include'
        });

        if (trackTimeResponse.ok) {
          console.log(`[SessionManager] Tracked ${activeSecondsToSend}s of active time`);
        } else {
          console.error('[SessionManager] Track time failed:', trackTimeResponse.status);
          // Add the seconds back if tracking failed
          this.accumulatedActiveSeconds += activeSecondsToSend;
        }
      }
    } catch (error) {
      console.error('[SessionManager] Heartbeat error:', error);
      // Network errors (ERR_CONNECTION_CLOSED, Failed to fetch) should also
      // trigger backoff so we don't hammer a recovering server every 30s
      this.consecutiveFailures++;
      this.currentHeartbeatInterval = Math.min(
        this.HEARTBEAT_INTERVAL * Math.pow(2, this.consecutiveFailures),
        this.MAX_BACKOFF
      );
      console.warn(`[SessionManager] Network error, backing off to ${Math.round(this.currentHeartbeatInterval / 1000)}s`);
    }
  }

  startIdleCheck() {
    // Check for idle timeout every 10 seconds
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleTimeout();
    }, 10 * 1000);
  }

  checkIdleTimeout() {
    const now = Date.now();
    const idleTime = now - this.lastActivity;

    // Check if user has been idle for 18 minutes (show warning at 18 min, timeout at 20 min)
    const timeUntilTimeout = this.IDLE_TIMEOUT - idleTime;

    if (timeUntilTimeout <= this.WARNING_TIME && timeUntilTimeout > 0 && !this.warningShown) {
      this.showIdleWarning(timeUntilTimeout);
    } else if (timeUntilTimeout <= 0) {
      this.handleIdleTimeout();
    }
  }

  showIdleWarning(timeRemaining) {
    this.warningShown = true;

    const minutes = Math.ceil(timeRemaining / 60000);
    const message = `You've been idle for a while. Your session will end in ${minutes} minute(s) due to inactivity.\n\nClick OK to stay logged in, or Cancel to log out now.`;

    // Create modal instead of using alert (better UX)
    const modal = document.createElement('div');
    modal.id = 'idle-warning-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      padding: 2rem;
      border-radius: 12px;
      max-width: 500px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;

    modalContent.innerHTML = `
      <h2 style="margin-top: 0; color: #333;">Session Timeout Warning</h2>
      <p style="color: #666; margin: 1rem 0;">You've been idle for a while. Your session will end in <strong>${minutes} minute(s)</strong> due to inactivity.</p>
      <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem;">
        <button id="idle-stay-btn" style="
          background: #12B3B3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 600;
        ">Stay Logged In</button>
        <button id="idle-logout-btn" style="
          background: white;
          color: #12B3B3;
          border: 2px solid #12B3B3;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 600;
        ">Log Out Now</button>
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Handle button clicks
    document.getElementById('idle-stay-btn').addEventListener('click', () => {
      this.recordActivity();
      this.dismissWarning();
    });

    document.getElementById('idle-logout-btn').addEventListener('click', () => {
      this.logout('user_requested');
    });
  }

  dismissWarning() {
    this.warningShown = false;
    const modal = document.getElementById('idle-warning-modal');
    if (modal) {
      modal.remove();
    }
  }

  handleIdleTimeout() {
    console.log('[SessionManager] Idle timeout reached - logging out');
    this.logout('idle_timeout');
  }

  async logout(reason = 'manual') {
    console.log('[SessionManager] Logging out:', reason);

    // Stop all timers
    clearTimeout(this.heartbeatTimer);
    clearInterval(this.idleCheckTimer);
    clearTimeout(this.warningTimer);

    // Calculate session duration
    this.sessionData.timeSpent = Date.now() - this.sessionStartTime;

    // IMPROVED: Send any remaining active time before logging out
    this.checkAndUpdateActiveTime();
    if (this.accumulatedActiveSeconds > 0) {
      try {
        await csrfFetch('/api/chat/track-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeSeconds: this.accumulatedActiveSeconds }),
          credentials: 'include'
        });
        console.log(`[SessionManager] Final time tracked: ${this.accumulatedActiveSeconds}s`);
        this.accumulatedActiveSeconds = 0;
      } catch (error) {
        console.error('[SessionManager] Error tracking final time:', error);
      }
    }

    // Save mastery progress if on mastery page
    await this.saveMasteryProgress();

    // Fetch session recap BEFORE ending the session (needs auth to succeed).
    // The recap modal will display after logout completes.
    let recapData = null;
    if (reason === 'manual' && window.location.pathname.includes('chat')) {
      try {
        const recapRes = await fetch('/api/session/recap', { credentials: 'include' });
        if (recapRes.ok) {
          const json = await recapRes.json();
          recapData = json.recap;
        }
      } catch (err) {
        console.error('[SessionManager] Recap fetch error:', err);
      }
    }

    // End session (generates summary)
    await this.endSession(reason);

    // Perform logout with CSRF token
    try {
      await csrfFetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('[SessionManager] Logout error:', error);
    }

    // Clear UI language cache so the next user on this device gets a clean state
    StorageUtils.local.removeItem('mathmatix_ui_lang');

    // Show session recap before redirecting (if we fetched one)
    if (recapData && recapData.headline) {
      try {
        const shown = await this.showSessionRecap(recapData);
        if (shown) return; // Recap modal handles redirect after dismissal
      } catch (err) {
        console.error('[SessionManager] Recap display error:', err);
      }
    }

    // Redirect to login
    window.location.href = '/login.html';
  }

  /**
   * Display session recap modal with pre-fetched data.
   * Psychology: Peak-End Rule — the last moment of a session shapes memory of the whole experience.
   * Growth-focused: shows progress trajectory, not just raw stats.
   * @param {Object} recap - Pre-fetched recap data (fetched before session end to avoid auth race)
   * @returns {boolean} true if recap was shown, false otherwise
   */
  async showSessionRecap(recap) {
    try {
      if (!recap || !recap.headline) return false;

      // Sanitize string fields to prevent XSS (topic could contain user-influenced content)
      const esc = (s) => {
        const el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
      };
      recap.headline = esc(recap.headline);
      recap.topic = recap.topic ? esc(recap.topic) : null;
      recap.achievement = recap.achievement ? esc(recap.achievement) : null;
      recap.narrative = recap.narrative ? esc(recap.narrative) : null;

      // Build and show recap modal
      const overlay = document.createElement('div');
      overlay.id = 'session-recap-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';

      const card = document.createElement('div');
      card.style.cssText = 'background:white;border-radius:20px;padding:32px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideUp 0.3s ease;';

      let html = `<div style="font-size:2rem;margin-bottom:8px;">&#128170;</div>`;
      html += `<h2 style="font-size:1.3rem;font-weight:700;margin:0 0 4px;color:#18202B;">${recap.headline}</h2>`;
      if (recap.topic) {
        html += `<p style="font-size:0.85rem;color:#5B6876;margin:0 0 16px;">${recap.topic} &middot; ${recap.duration || 0} min</p>`;
      }

      // Stats row
      if (recap.problemsAttempted > 0) {
        html += `<div style="display:flex;gap:16px;justify-content:center;margin-bottom:16px;">`;
        html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#12B3B3;">${recap.problemsCorrect}</div><div style="font-size:0.75rem;color:#5B6876;">Correct</div></div>`;
        html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#18202B;">${recap.problemsAttempted}</div><div style="font-size:0.75rem;color:#5B6876;">Attempted</div></div>`;
        if (recap.accuracy != null) {
          const accColor = recap.accuracy >= 70 ? '#16C86D' : recap.accuracy >= 40 ? '#FFC24B' : '#FF4E4E';
          html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:${accColor};">${recap.accuracy}%</div><div style="font-size:0.75rem;color:#5B6876;">Accuracy</div></div>`;
        }
        html += `</div>`;
      }

      // Achievement callout (growth-focused)
      if (recap.achievement) {
        html += `<p style="font-size:0.9rem;color:#18202B;background:#F0FAF7;border-radius:12px;padding:12px 16px;margin:0 0 12px;line-height:1.4;">${recap.achievement}</p>`;
      }

      // Narrative (emotional arc)
      if (recap.narrative) {
        html += `<p style="font-size:0.85rem;color:#5B6876;margin:0 0 20px;font-style:italic;line-height:1.4;">${recap.narrative}</p>`;
      }

      html += `<button id="recap-dismiss-btn" style="background:#12B3B3;color:white;border:none;border-radius:12px;padding:12px 32px;font-size:1rem;font-weight:600;cursor:pointer;transition:background 0.2s;">See you next time!</button>`;

      card.innerHTML = html;
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Add animations (idempotent — reuse if already added)
      let style = document.getElementById('session-recap-animations');
      if (!style) {
        style = document.createElement('style');
        style.id = 'session-recap-animations';
        style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(style);
      }

      // Dismiss handler
      return new Promise((resolve) => {
        let dismissed = false;
        const dismiss = () => {
          if (dismissed) return;
          dismissed = true;
          overlay.style.opacity = '0';
          overlay.style.transition = 'opacity 0.3s';
          setTimeout(() => {
            overlay.remove();
            window.location.href = '/login.html';
          }, 300);
        };
        document.getElementById('recap-dismiss-btn').addEventListener('click', dismiss);
        // Auto-dismiss after 10 seconds
        setTimeout(dismiss, 10000);
        resolve(true);
      });
    } catch (err) {
      console.error('[SessionManager] showSessionRecap error:', err);
      return false;
    }
  }

  async saveMasteryProgress() {
    // Check if we're on a mastery page and have progress to save
    if (window.location.pathname.includes('mastery-chat.html')) {
      try {
        // Get mastery progress from the page if available
        const masteryProgress = this.getMasteryProgressFromPage();

        if (masteryProgress) {
          this.sessionData.masteryProgress = masteryProgress;

          const response = await csrfFetch('/api/session/save-mastery', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ masteryProgress }),
            credentials: 'include'
          });

          if (response.ok) {
            console.log('[SessionManager] Mastery progress saved');
          }
        }
      } catch (error) {
        console.error('[SessionManager] Error saving mastery progress:', error);
      }
    }
  }

  getMasteryProgressFromPage() {
    // Try to get mastery progress from global variables or localStorage
    // This should be set by mastery-chat.html
    if (typeof window.currentMasteryProgress !== 'undefined') {
      return window.currentMasteryProgress;
    }

    // Try localStorage
    let stored;
    stored = StorageUtils.local.getItem('masteryProgress');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('[SessionManager] Failed to parse stored mastery progress');
      }
    }

    return null;
  }

  async endSession(reason) {
    try {
      const response = await csrfFetch('/api/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason,
          destroySession: true,
          sessionData: this.sessionData
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[SessionManager] Session ended:', data);
      }
    } catch (error) {
      console.error('[SessionManager] Error ending session:', error);
    }
  }

  setupUnloadHandler() {
    // Track if we've already sent the end session request
    this.sessionEndSent = false;

    // Helper to send session end with proper content type
    const sendSessionEnd = (reason) => {
      if (this.sessionEndSent) return;
      this.sessionEndSent = true;

      // Track remaining active time
      this.checkAndUpdateActiveTime();
      if (this.accumulatedActiveSeconds > 0) {
        const timeBlob = new Blob(
          [JSON.stringify({ activeSeconds: this.accumulatedActiveSeconds })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/chat/track-time', timeBlob);
      }

      // Save mastery progress
      const masteryProgress = this.getMasteryProgressFromPage();
      if (masteryProgress) {
        const masteryBlob = new Blob(
          [JSON.stringify({ masteryProgress })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/session/save-mastery', masteryBlob);
      }

      // Send session end for summary/tracking only — do NOT destroy the session.
      // beforeunload and pagehide fire on BOTH browser close AND same-origin
      // navigation (e.g. clicking "Change Tutor" in settings). Destroying the
      // session here would log the user out whenever they navigate between pages.
      // Stale sessions are cleaned up server-side by destroyIdleExpressSessions().
      const payload = {
        reason,
        destroySession: false,
        sessionData: {
          ...this.sessionData,
          timeSpent: Date.now() - this.sessionStartTime
        }
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/session/end', blob);

      console.log(`[SessionManager] Session end beacon sent: ${reason}`);
    };

    // 1. beforeunload - fires when user is leaving the page (navigation OR tab close)
    window.addEventListener('beforeunload', () => {
      sendSessionEnd('browser_close');
    });

    // 2. pagehide - more reliable than beforeunload on mobile and modern browsers
    window.addEventListener('pagehide', (e) => {
      // e.persisted indicates if page might be restored from bfcache
      if (!e.persisted) {
        sendSessionEnd('page_hide');
      }
    });

    // 3. visibilitychange - detect tab becoming hidden (might be closing)
    //    Only flush accumulated time; the unload handlers above will send the
    //    final beacon if the page is actually closing. This avoids duplicate
    //    beacons when visibilitychange fires right before beforeunload/pagehide.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Snapshot active time so it's included in the unload beacon if page closes,
        // but don't send a separate beacon here — let sendSessionEnd handle it.
        this.checkAndUpdateActiveTime();
      }
    });
  }

  // Public methods for updating session data
  updateSessionData(data) {
    this.sessionData = { ...this.sessionData, ...data };
  }

  incrementProblemsAttempted() {
    this.sessionData.problemsAttempted++;
  }

  incrementProblemsSolved() {
    this.sessionData.problemsSolved++;
  }

  incrementHintsUsed() {
    this.sessionData.hintsUsed++;
  }

  // Public method to trigger manual logout
  triggerLogout() {
    this.logout('manual');
  }
}

// Initialize session manager when DOM is ready
let sessionManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    sessionManager = new SessionManager();
    window.sessionManager = sessionManager; // Make globally accessible
  });
} else {
  sessionManager = new SessionManager();
  window.sessionManager = sessionManager;
}

;
/* --- /js/demo-banner.js --- */
// js/demo-banner.js
// Checks if the current session is a demo/playground session and shows a persistent banner.
// Also handles the "Start Over" (reset) and "Exit Demo" (logout) actions.

(function() {
  'use strict';

  // Check demo status on page load
  checkDemoStatus();

  async function checkDemoStatus() {
    try {
      const response = await fetch('/api/demo/status', { credentials: 'include' });
      if (!response.ok) return;

      const data = await response.json();
      if (!data.isDemo) return;

      // We're in demo mode — show the banner
      showDemoBanner(data);
    } catch (err) {
      // Silently fail — not critical
    }
  }

  function showDemoBanner(data) {
    // Add demo-mode class to body for CSS adjustments
    document.body.classList.add('demo-mode');

    // Create banner element
    const banner = document.createElement('div');
    banner.className = 'demo-banner visible';
    banner.id = 'demo-banner';

    const profileName = data.profile ? data.profile.name : 'Demo';
    const profileLabel = data.profile ? data.profile.label : 'Demo Account';

    banner.innerHTML = `
      <div class="demo-banner-text">
        <span class="demo-banner-label">Playground</span>
        <span>You're exploring as <strong>${profileName}</strong> (${profileLabel})</span>
      </div>
      <div class="demo-banner-actions">
        <button class="demo-banner-btn reset" id="demo-reset-btn" title="Reset this demo account to its initial state">
          <i class="fas fa-undo"></i> Start Over
        </button>
        <a href="/demo.html" class="demo-banner-btn switch" id="demo-switch-btn" title="Switch to a different demo account">
          <i class="fas fa-exchange-alt"></i> Switch Role
        </a>
        <button class="demo-banner-btn exit" id="demo-exit-btn" title="Exit the demo and return to the login page">
          <i class="fas fa-sign-out-alt"></i> Exit Demo
        </button>
      </div>
    `;

    // Insert at very top of body
    document.body.insertBefore(banner, document.body.firstChild);

    // Attach event handlers
    document.getElementById('demo-reset-btn').addEventListener('click', handleReset);
    document.getElementById('demo-exit-btn').addEventListener('click', handleExit);
  }

  async function handleReset() {
    const btn = document.getElementById('demo-reset-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Resetting...';
    btn.disabled = true;

    try {
      const response = await csrfFetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const result = await response.json();
      if (result.success) {
        // Reload the page to see fresh state
        window.location.reload();
      } else {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        alert('Reset failed: ' + (result.message || 'Unknown error'));
      }
    } catch (err) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      alert('Reset failed. Please try again.');
    }
  }

  async function handleExit() {
    const btn = document.getElementById('demo-exit-btn');
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Exiting...';
    btn.disabled = true;

    try {
      // The logout route will handle the demo reset
      const response = await csrfFetch('/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (response.ok) {
        window.location.href = '/demo.html';
      } else {
        window.location.href = '/login.html';
      }
    } catch (err) {
      window.location.href = '/login.html';
    }
  }
})();
