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

    this.lastActivity = Date.now();
    this.warningShown = false;
    this.heartbeatTimer = null;
    this.idleCheckTimer = null;
    this.warningTimer = null;
    this.sessionStartTime = Date.now();
    this.sessionData = {
      problemsAttempted: 0,
      problemsSolved: 0,
      hintsUsed: 0,
      timeSpent: 0,
      masteryProgress: null
    };

    this.init();
  }

  init() {
    // Track user activity
    this.setupActivityTrackers();

    // Start heartbeat
    this.startHeartbeat();

    // Start idle check
    this.startIdleCheck();

    // Handle page unload (tab/browser close)
    this.setupUnloadHandler();

    console.log('[SessionManager] Initialized - idle timeout: 20 min, warning: 2 min');
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

    this.lastActivity = now;

    // If user was idle and warning was shown, dismiss it
    if (this.warningShown) {
      this.dismissWarning();
    }

    // If user came back from being idle, send heartbeat immediately
    if (wasIdle) {
      this.sendHeartbeat();
    }
  }

  startHeartbeat() {
    // Send initial heartbeat
    this.sendHeartbeat();

    // Send heartbeat every 30 seconds
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  async sendHeartbeat() {
    try {
      const response = await csrfFetch('/api/session/heartbeat', {
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

      if (!response.ok) {
        console.error('[SessionManager] Heartbeat failed:', response.status);
      }
    } catch (error) {
      console.error('[SessionManager] Heartbeat error:', error);
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
    clearInterval(this.heartbeatTimer);
    clearInterval(this.idleCheckTimer);
    clearTimeout(this.warningTimer);

    // Calculate session duration
    this.sessionData.timeSpent = Date.now() - this.sessionStartTime;

    // Save mastery progress if on mastery page
    await this.saveMasteryProgress();

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

    // Redirect to login
    window.location.href = '/login.html';
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
    const stored = localStorage.getItem('masteryProgress');
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
    // Handle tab/browser close
    window.addEventListener('beforeunload', (e) => {
      // Use sendBeacon for reliable async request during page unload
      const payload = JSON.stringify({
        reason: 'browser_close',
        sessionData: {
          ...this.sessionData,
          timeSpent: Date.now() - this.sessionStartTime
        }
      });

      // Try to save mastery progress synchronously
      const masteryProgress = this.getMasteryProgressFromPage();
      if (masteryProgress) {
        navigator.sendBeacon('/api/session/save-mastery', JSON.stringify({ masteryProgress }));
      }

      // Send session end beacon
      navigator.sendBeacon('/api/session/end', payload);
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
