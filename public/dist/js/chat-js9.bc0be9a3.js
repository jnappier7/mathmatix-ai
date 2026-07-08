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
/* --- /js/feedback.js --- */
// public/js/feedback.js
// Feedback modal and form handling

(function() {
    const feedbackModal = document.getElementById('feedback-modal');
    const openFeedbackBtn = document.getElementById('open-feedback-modal-btn');
    const closeFeedbackBtn = document.getElementById('close-feedback-modal-btn');
    const cancelFeedbackBtn = document.getElementById('cancel-feedback-btn');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackMessage = document.getElementById('feedback-message');
    const feedbackDescription = document.getElementById('feedback-description');
    const charCount = document.getElementById('char-count');

    function openModal() {
        feedbackModal.classList.add('is-visible');
        feedbackForm.reset();
        feedbackMessage.style.display = 'none';
    }

    function closeModal() {
        feedbackModal.classList.remove('is-visible');
    }

    function showMessage(message, isError = false) {
        feedbackMessage.textContent = message;
        feedbackMessage.style.display = 'block';
        feedbackMessage.style.background = isError ? '#fee2e2' : '#d1fae5';
        feedbackMessage.style.color = isError ? '#991b1b' : '#065f46';
        feedbackMessage.style.border = `1px solid ${isError ? '#fca5a5' : '#86efac'}`;
    }

    async function submitFeedback(e) {
        e.preventDefault();

        const type = document.getElementById('feedback-type').value;
        const subject = document.getElementById('feedback-subject').value.trim();
        const description = document.getElementById('feedback-description').value.trim();
        const priority = document.getElementById('feedback-priority').value;

        // Validation
        if (!type || !subject || !description) {
            showMessage('Please fill in all required fields.', true);
            return;
        }

        const submitBtn = document.getElementById('submit-feedback-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        try {
            const response = await window.csrfFetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    subject,
                    description,
                    priority,
                    url: window.location.href
                }),
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showMessage('✓ Thank you! Your feedback has been submitted successfully.', false);
                feedbackForm.reset();

                // Close modal after 2 seconds
                setTimeout(() => {
                    closeModal();
                }, 2000);
            } else {
                showMessage(data.message || 'Failed to submit feedback. Please try again.', true);
            }
        } catch (error) {
            console.error('Feedback submission error:', error);
            showMessage('Network error. Please check your connection and try again.', true);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';
        }
    }

    function updateCharCount() {
        const count = feedbackDescription.value.length;
        charCount.textContent = count;

        if (count > 1900) {
            charCount.style.color = '#ff0000';
        } else if (count > 1700) {
            charCount.style.color = '#ff9900';
        } else {
            charCount.style.color = '#999';
        }
    }

    // Event listeners
    if (openFeedbackBtn) {
        openFeedbackBtn.addEventListener('click', openModal);
    }

    if (closeFeedbackBtn) {
        closeFeedbackBtn.addEventListener('click', closeModal);
    }

    if (cancelFeedbackBtn) {
        cancelFeedbackBtn.addEventListener('click', closeModal);
    }

    if (feedbackForm) {
        feedbackForm.addEventListener('submit', submitFeedback);
    }

    if (feedbackDescription) {
        feedbackDescription.addEventListener('input', updateCharCount);
    }

    // Close modal when clicking outside
    if (feedbackModal) {
        feedbackModal.addEventListener('click', (e) => {
            if (e.target === feedbackModal) {
                closeModal();
            }
        });
    }

    console.log('✅ Feedback module loaded');
})();

;
/* --- /js/tour.js --- */
// tour.js - First-time user tour (chat.html)
// Uses direct style manipulation to avoid CSS specificity issues.
(function() {
  'use strict';

  const tourSteps = [
    {
      title: 'Welcome to MathMatix AI!',
      icon: 'fa-graduation-cap',
      content: `
        <p>Your personal AI math tutor is ready. Let's take a 30-second tour.</p>
      `
    },
    {
      title: 'Ask Anything',
      icon: 'fa-comments',
      content: `
        <p>Type a math question below and your tutor will walk you through it step by step.</p>
        <div class="tour-highlight">
          <strong>Try it:</strong> "How do I solve 2x + 5 = 15?"
        </div>
        <p>You can also <strong>upload a photo</strong> of a worksheet or use <strong>voice chat</strong>.</p>
      `
    },
    {
      title: 'Your Toolkit',
      icon: 'fa-calculator',
      content: `
        <p>Open the <strong>sidebar</strong> on the left for:</p>
        <ul>
          <li><i class="fas fa-calculator"></i> <strong>Calculator</strong> &mdash; scientific + graphing</li>
          <li><i class="fas fa-camera-retro"></i> <strong>Upload</strong> &mdash; snap homework, worksheets, or notes</li>
          <li><i class="fas fa-graduation-cap"></i> <strong>Courses</strong> &mdash; enroll in a self-paced course</li>
        </ul>
      `
    },
    {
      title: 'Level Up!',
      icon: 'fa-bolt',
      content: `
        <p>Every problem you solve earns <strong>XP</strong>. Level up, earn badges, and climb the leaderboard.</p>
        <div class="tour-highlight">
          <strong>Tip:</strong> Show your work and explain your reasoning &mdash; you'll earn bonus XP for great math thinking!
        </div>
      `
    }
  ];

  let currentStep = 0;
  let isOpen = false;

  // DOM refs (populated in initTour)
  const el = {};

  function initTour() {
    el.modal = document.getElementById('tour-modal');
    el.stepContent = document.getElementById('tour-step-content');
    el.currentStepSpan = document.getElementById('tour-current-step');
    el.totalStepsSpan = document.getElementById('tour-total-steps');
    el.progressFill = document.getElementById('tour-progress-fill');
    el.prevBtn = document.getElementById('tour-prev-btn');
    el.nextBtn = document.getElementById('tour-next-btn');
    el.finishBtn = document.getElementById('tour-finish-btn');
    el.skipBtn = document.getElementById('tour-skip-btn');

    if (!el.modal || !el.nextBtn) {
      console.warn('[Tour] Modal elements not found');
      return;
    }

    el.totalStepsSpan.textContent = tourSteps.length;

    // Button handlers with stopPropagation to prevent overlay/parent interference
    el.prevBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); goTo(currentStep - 1); });
    el.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); goTo(currentStep + 1); });
    el.finishBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); finish(true); });
    el.skipBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); finish(false); });

    // Block overlay background click from closing (stop propagation at content level)
    const tourContent = el.modal.querySelector('.tour-content');
    if (tourContent) {
      tourContent.addEventListener('click', (e) => e.stopPropagation());
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (currentStep < tourSteps.length - 1) goTo(currentStep + 1);
        else finish(true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStep > 0) goTo(currentStep - 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });

    checkTourStatus();
  }

  async function checkTourStatus() {
    try {
      const response = await fetch('/api/user/tour-status', { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data.tourCompleted && !data.tourDismissed) {
        // Delay so the page fully initializes first
        setTimeout(showTour, 1500);
      }
    } catch (err) {
      console.error('[Tour] Status check failed:', err);
    }
  }

  function showTour() {
    if (!el.modal || isOpen) return;
    currentStep = 0;
    renderStep();
    // Use direct style to bypass any CSS specificity issues
    el.modal.style.display = 'flex';
    el.modal.classList.add('is-visible');
    isOpen = true;
  }

  function closeTour() {
    if (!el.modal) return;
    el.modal.style.display = 'none';
    el.modal.classList.remove('is-visible');
    isOpen = false;
  }

  function goTo(step) {
    if (step < 0 || step >= tourSteps.length) return;
    currentStep = step;
    renderStep();
  }

  function renderStep() {
    const step = tourSteps[currentStep];

    el.stepContent.innerHTML = `
      <div class="tour-icon"><i class="fas ${step.icon}"></i></div>
      <h3>${step.title}</h3>
      ${step.content}
    `;

    el.currentStepSpan.textContent = currentStep + 1;
    el.progressFill.style.width = `${((currentStep + 1) / tourSteps.length) * 100}%`;

    el.prevBtn.style.display = currentStep > 0 ? 'inline-flex' : 'none';
    el.nextBtn.style.display = currentStep < tourSteps.length - 1 ? 'inline-flex' : 'none';
    el.finishBtn.style.display = currentStep === tourSteps.length - 1 ? 'inline-flex' : 'none';
  }

  async function finish(completed) {
    closeTour();
    try {
      await csrfFetch('/api/user/tour-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed, dismissed: !completed })
      });
    } catch (err) {
      console.error('[Tour] Failed to save status:', err);
    }
    if (completed) {
      // Confetti celebration
      if (typeof confetti !== 'undefined') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
      const chatInput = document.getElementById('user-input');
      if (chatInput) {
        setTimeout(() => {
          chatInput.focus();
          chatInput.placeholder = "Ask me anything about math! Try: 'How do I solve 2x + 5 = 15?'";
        }, 400);
      }
    }
  }

  // Public API
  window.MathMatixTour = { show: showTour, init: initTour };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTour);
  } else {
    initTour();
  }
})();

;
/* --- /js/survey.js --- */
// survey.js - Smart feedback survey with meaningful triggers
(function() {
  'use strict';

  // Survey configuration
  const CONFIG = {
    MIN_SESSION_DURATION: 20,        // Minimum 20 minutes before eligible
    MIN_PROBLEMS_FOR_TRIGGER: 5,     // Trigger after solving 5+ problems
    DAILY_FREQUENCY_HOURS: 24,       // Show at most once per day
    QUICK_SURVEY_THRESHOLD_HOURS: 48, // Show quick version if responded within 48h
    CHECK_INTERVAL: 120000           // Check every 2 minutes for problem-based triggers
  };

  // Survey state
  let sessionStartTime = Date.now();
  let surveyShown = false;
  let problemsSolvedThisSession = 0;
  let checkInterval = null;
  let originalFormHTML = null;
  let isQuickMode = false;
  let cachedSurveyStatus = null;

  // DOM elements
  const elements = {
    modal: null,
    form: null,
    closeBtn: null,
    dismissBtn: null,
    submitBtn: null,
    frequencyToggle: null,
    feedbackTextarea: null,
    charCount: null
  };

  // Initialize survey
  function initSurvey() {
    elements.modal = document.getElementById('survey-modal');
    elements.form = document.getElementById('survey-form');
    elements.closeBtn = document.getElementById('close-survey-modal-btn');
    elements.dismissBtn = document.getElementById('survey-dismiss-btn');
    elements.submitBtn = document.getElementById('survey-submit-btn');
    elements.frequencyToggle = document.getElementById('survey-frequency-toggle');
    elements.feedbackTextarea = document.getElementById('survey-feedback');
    elements.charCount = document.getElementById('feedback-char-count');

    if (!elements.modal) {
      console.warn('Survey modal not found in DOM');
      return;
    }

    // Store original form HTML for restoration
    const content = elements.modal.querySelector('.survey-content');
    if (content) {
      originalFormHTML = content.innerHTML;
    }

    // Attach event listeners
    elements.closeBtn.addEventListener('click', handleDismiss);
    elements.dismissBtn.addEventListener('click', handleDismiss);
    elements.form.addEventListener('submit', handleSubmit);
    if (elements.feedbackTextarea) {
      elements.feedbackTextarea.addEventListener('input', updateCharCount);
    }

    setupStarRating();
    sessionStartTime = Date.now();

    // Listen for problem completion events
    document.addEventListener('problemSolved', handleProblemSolved);
    document.addEventListener('milestoneReached', handleMilestone);

    // Periodic check for time-based eligibility
    checkInterval = setInterval(checkTimeBasedEligibility, CONFIG.CHECK_INTERVAL);

    // Show survey on tab switch (after being away)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Pre-fetch survey status for faster checks
    prefetchSurveyStatus();
  }

  // Pre-fetch survey status on init
  async function prefetchSurveyStatus() {
    try {
      const response = await fetch('/api/user/survey-status');
      if (response.ok) {
        cachedSurveyStatus = await response.json();
      }
    } catch (error) {
      console.error('Error prefetching survey status:', error);
    }
  }

  // Get current session duration in minutes
  function getSessionDuration() {
    return Math.floor((Date.now() - sessionStartTime) / 60000);
  }

  // Handle problem solved event - this is the main trigger
  async function handleProblemSolved(e) {
    problemsSolvedThisSession++;

    // Trigger survey after solving enough problems (if eligible today)
    if (problemsSolvedThisSession >= CONFIG.MIN_PROBLEMS_FOR_TRIGGER && !surveyShown) {
      await checkAndShowSurvey('problems_completed');
    }
  }

  // Handle milestone events (level up, streak, achievement)
  async function handleMilestone(e) {
    if (!surveyShown && getSessionDuration() >= CONFIG.MIN_SESSION_DURATION) {
      await checkAndShowSurvey('milestone');
    }
  }

  // Check time-based eligibility (fallback for long sessions without problem completion)
  async function checkTimeBasedEligibility() {
    if (surveyShown) return;

    const duration = getSessionDuration();

    // After 40 minutes with no problems solved, check if we should show
    if (duration >= 40 && problemsSolvedThisSession === 0) {
      await checkAndShowSurvey('time_based');
    }
  }

  // Handle visibility change (returning to tab)
  let hiddenTime = null;

  async function handleVisibilityChange() {
    if (document.hidden) {
      hiddenTime = Date.now();
    } else {
      // Returning to tab after 5+ minutes away
      if (hiddenTime && (Date.now() - hiddenTime) > 300000) {
        const duration = getSessionDuration();

        if (!surveyShown && duration >= CONFIG.MIN_SESSION_DURATION) {
          await checkAndShowSurvey('tab_return');
        }
      }
      hiddenTime = null;
    }
  }

  // Main survey check and show logic
  async function checkAndShowSurvey(trigger) {
    if (surveyShown) return;

    try {
      // Use cached status or fetch fresh
      let data = cachedSurveyStatus;
      if (!data) {
        const response = await fetch('/api/user/survey-status');
        if (!response.ok) return;
        data = await response.json();
      }

      if (shouldShowSurvey(data)) {
        // Determine if we should show quick mode
        const hoursSinceLastResponse = data.lastRespondedAt
          ? (Date.now() - new Date(data.lastRespondedAt).getTime()) / (1000 * 60 * 60)
          : Infinity;

        isQuickMode = hoursSinceLastResponse < CONFIG.QUICK_SURVEY_THRESHOLD_HOURS && data.responsesCount > 0;

        showSurvey(trigger);
      }
    } catch (error) {
      console.error('Error checking survey eligibility:', error);
    }
  }

  // Determine if survey should be shown based on user preferences
  function shouldShowSurvey(data) {
    if (!data.enabled) return false;
    if (data.frequency === 'never') return false;

    const now = Date.now();
    const lastShown = data.lastShownAt ? new Date(data.lastShownAt).getTime() : 0;
    const hoursSinceLastShown = (now - lastShown) / (1000 * 60 * 60);

    switch (data.frequency) {
      case 'every-session':
        return true;
      case 'daily':
        return hoursSinceLastShown >= CONFIG.DAILY_FREQUENCY_HOURS;
      case 'weekly':
        return hoursSinceLastShown >= (CONFIG.DAILY_FREQUENCY_HOURS * 7);
      default:
        return hoursSinceLastShown >= CONFIG.DAILY_FREQUENCY_HOURS;
    }
  }

  // Show survey modal
  function showSurvey(trigger) {
    if (!elements.modal || surveyShown) return;

    surveyShown = true;

    // Apply quick mode if applicable
    if (isQuickMode) {
      applyQuickMode();
    }

    elements.modal.classList.add('is-visible');
    trackSurveyShown(trigger);
  }

  // Apply quick survey mode - simplified form
  function applyQuickMode() {
    const content = elements.modal.querySelector('.survey-content');
    if (!content) return;

    // Update header
    const header = content.querySelector('.survey-header');
    if (header) {
      header.innerHTML = `
        <h2><i class="fas fa-bolt"></i> Quick Check-in</h2>
        <p class="survey-subtitle">Still going well? (1-tap feedback)</p>
      `;
    }

    // Hide optional sections, keep just star rating and expand option
    const optionalSections = content.querySelectorAll('.form-group');
    optionalSections.forEach((section, index) => {
      // Keep first (star rating), hide others initially
      if (index > 0) {
        section.classList.add('quick-mode-hidden');
        section.style.display = 'none';
      }
    });

    // Add expand button after star rating
    const starRating = content.querySelector('.star-rating');
    if (starRating && !content.querySelector('.expand-survey-btn')) {
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'btn btn-link expand-survey-btn';
      expandBtn.innerHTML = '<i class="fas fa-plus"></i> Add more details';
      expandBtn.addEventListener('click', expandQuickSurvey);
      starRating.parentNode.insertAdjacentElement('afterend', expandBtn);
    }
  }

  // Expand quick survey to full form
  function expandQuickSurvey() {
    const content = elements.modal.querySelector('.survey-content');
    const hiddenSections = content.querySelectorAll('.quick-mode-hidden');
    hiddenSections.forEach(section => {
      section.classList.remove('quick-mode-hidden');
      section.style.display = '';
    });

    const expandBtn = content.querySelector('.expand-survey-btn');
    if (expandBtn) {
      expandBtn.remove();
    }

    isQuickMode = false;
  }

  // Hide survey modal
  function hideSurvey() {
    if (elements.modal) {
      elements.modal.classList.remove('is-visible');
    }
  }

  // Handle dismiss button
  async function handleDismiss() {
    hideSurvey();
    await trackSurveyDismissed();
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(elements.form);
    const surveyData = {
      sessionDuration: getSessionDuration(),
      problemsSolved: problemsSolvedThisSession,
      rating: parseInt(formData.get('rating')) || null,
      experience: formData.get('experience') || '',
      helpfulness: parseInt(formData.get('helpfulness')) || null,
      difficulty: parseInt(formData.get('difficulty')) || null,
      feedback: formData.get('feedback') || '',
      bugs: formData.get('bugs') || '',
      features: formData.get('features') || '',
      willingness: parseInt(formData.get('willingness')) || null,
      frequencyPreference: elements.frequencyToggle?.checked ? 'weekly' : null,
      isQuickResponse: isQuickMode
    };

    // Validate required fields
    if (!surveyData.rating) {
      alert('Please rate your session with stars (1-5) before submitting.');
      const starRating = document.querySelector('.star-rating');
      if (starRating) {
        starRating.scrollIntoView({ behavior: 'smooth', block: 'center' });
        starRating.style.animation = 'pulse 0.5s ease-in-out';
        setTimeout(() => { starRating.style.animation = ''; }, 500);
      }
      return;
    }

    // Show loading state
    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    elements.modal.querySelector('.survey-content').classList.add('submitting');

    try {
      const response = await csrfFetch('/api/user/survey-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(surveyData)
      });

      if (!response.ok) {
        throw new Error('Failed to submit survey');
      }

      showSuccessMessage();

      setTimeout(() => {
        hideSurvey();
        resetForm();
      }, 2000);

    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Failed to submit feedback. Please try again.');
      elements.submitBtn.disabled = false;
      elements.submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';
      elements.modal.querySelector('.survey-content').classList.remove('submitting');
    }
  }

  // Show success message
  function showSuccessMessage() {
    const content = elements.modal.querySelector('.survey-content');
    content.innerHTML = `
      <div class="survey-success">
        <i class="fas fa-check-circle"></i>
        <h3>Thank You!</h3>
        <p>Your feedback helps us improve MathMatix AI for everyone.</p>
      </div>
    `;
    content.classList.remove('submitting');

    if (typeof confetti !== 'undefined') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
    }
  }

  // Reset form to initial state
  function resetForm() {
    const content = elements.modal.querySelector('.survey-content');
    if (content && content.querySelector('.survey-success') && originalFormHTML) {
      content.innerHTML = originalFormHTML;

      // Re-attach event listeners
      elements.form = document.getElementById('survey-form');
      elements.closeBtn = document.getElementById('close-survey-modal-btn');
      elements.dismissBtn = document.getElementById('survey-dismiss-btn');
      elements.submitBtn = document.getElementById('survey-submit-btn');
      elements.frequencyToggle = document.getElementById('survey-frequency-toggle');
      elements.feedbackTextarea = document.getElementById('survey-feedback');
      elements.charCount = document.getElementById('feedback-char-count');

      elements.closeBtn.addEventListener('click', handleDismiss);
      elements.dismissBtn.addEventListener('click', handleDismiss);
      elements.form.addEventListener('submit', handleSubmit);
      if (elements.feedbackTextarea) {
        elements.feedbackTextarea.addEventListener('input', updateCharCount);
      }

      setupStarRating();
    }

    if (elements.form) elements.form.reset();
    if (elements.charCount) updateCharCount();
    if (elements.submitBtn) {
      elements.submitBtn.disabled = false;
      elements.submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';
    }

    isQuickMode = false;
  }

  // Update character counter
  function updateCharCount() {
    if (!elements.feedbackTextarea || !elements.charCount) return;

    const length = elements.feedbackTextarea.value.length;
    elements.charCount.textContent = length;

    if (length > 900) {
      elements.charCount.style.color = '#f44336';
    } else if (length > 700) {
      elements.charCount.style.color = '#ff9800';
    } else {
      elements.charCount.style.color = '#888';
    }
  }

  // Setup star rating interactions
  function setupStarRating() {
    const starLabels = document.querySelectorAll('.star-rating label');
    const starInputs = document.querySelectorAll('.star-rating input');

    starLabels.forEach(label => {
      label.addEventListener('click', () => {
        const input = label.previousElementSibling;
        if (input && input.type === 'radio') {
          input.checked = true;
          updateStarDisplay();
        }
      });
    });

    starInputs.forEach(input => {
      input.addEventListener('change', updateStarDisplay);
    });
  }

  // Update star display based on selected rating
  function updateStarDisplay() {
    const checkedInput = document.querySelector('.star-rating input:checked');
    const allLabels = document.querySelectorAll('.star-rating label');

    allLabels.forEach(label => { label.style.color = '#ddd'; });

    if (checkedInput) {
      const rating = parseInt(checkedInput.value);
      allLabels.forEach(label => {
        const labelRating = parseInt(label.previousElementSibling?.value || 0);
        if (labelRating <= rating) {
          label.style.color = '#ffc107';
        }
      });
    }
  }

  // Track that survey was shown
  async function trackSurveyShown(trigger) {
    try {
      await csrfFetch('/api/user/survey-shown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shownAt: new Date().toISOString(),
          trigger: trigger || 'unknown',
          problemsSolved: problemsSolvedThisSession,
          sessionDuration: getSessionDuration()
        })
      });
    } catch (error) {
      console.error('Error tracking survey shown:', error);
    }
  }

  // Track that survey was dismissed
  async function trackSurveyDismissed() {
    try {
      await csrfFetch('/api/user/survey-dismissed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error tracking survey dismissed:', error);
    }
  }

  // Public API
  window.MathMatixSurvey = {
    show: () => showSurvey('manual'),
    hide: hideSurvey,
    init: initSurvey,
    trackProblemSolved: () => {
      document.dispatchEvent(new CustomEvent('problemSolved'));
    },
    trackMilestone: (type) => {
      document.dispatchEvent(new CustomEvent('milestoneReached', { detail: { type } }));
    }
  };

  // Cleanup on page unload
  window.addEventListener('unload', () => {
    if (checkInterval) clearInterval(checkInterval);
  });

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSurvey);
  } else {
    initSurvey();
  }

})();

;
/* --- /js/student-announcements.js --- */
/**
 * Student Announcements Inbox
 * Displays teacher announcements with unread notification badge
 */

(function() {
    'use strict';

    let unreadCount = 0;
    let announcementsData = [];
    let isModalOpen = false;
    let pollTimer = null;
    let consecutiveFailures = 0;
    const BASE_POLL_INTERVAL = 60000;
    const MAX_POLL_INTERVAL = 300000;

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', initStudentAnnouncements);

    function initStudentAnnouncements() {
        // Announcement bell disabled — revisit when announcement system is production-ready
        return;
    }

    function schedulePoll() {
        if (pollTimer) clearTimeout(pollTimer);
        if (window.__sessionExpired) return;
        const interval = Math.min(
            BASE_POLL_INTERVAL * Math.pow(2, consecutiveFailures),
            MAX_POLL_INTERVAL
        );
        pollTimer = setTimeout(async () => {
            await loadUnreadCount();
            schedulePoll();
        }, interval);
    }

    // Create the announcement bell button
    function createAnnouncementButton() {
        // Find a good spot to inject the button (usually in the header or nav area)
        const headerNav = document.querySelector('.main-header-nav') ||
                         document.querySelector('.header-nav') ||
                         document.querySelector('.user-controls');

        if (!headerNav) {
            // Create a floating button if no nav found
            createFloatingAnnouncementButton();
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'announcements-btn';
        btn.className = 'nav-btn';
        btn.title = 'Teacher Announcements';
        btn.innerHTML = `
            <i class="fas fa-bell"></i>
            <span id="announcements-badge" class="notification-badge" style="display: none;">0</span>
        `;
        btn.style.cssText = 'position: relative;';

        btn.addEventListener('click', openAnnouncementsModal);

        // Add badge styling
        addBadgeStyles();

        headerNav.insertBefore(btn, headerNav.firstChild);
    }

    // Create floating button for pages without header nav
    function createFloatingAnnouncementButton() {
        const btn = document.createElement('button');
        btn.id = 'announcements-btn';
        btn.title = 'Teacher Announcements';
        btn.innerHTML = `
            <i class="fas fa-bell"></i>
            <span id="announcements-badge" class="notification-badge" style="display: none;">0</span>
        `;
        btn.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 20px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            z-index: 9990;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
        });

        btn.addEventListener('click', openAnnouncementsModal);
        addBadgeStyles();

        document.body.appendChild(btn);
    }

    // Add badge CSS
    function addBadgeStyles() {
        if (document.getElementById('announcements-badge-styles')) return;

        const style = document.createElement('style');
        style.id = 'announcements-badge-styles';
        style.textContent = `
            .notification-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #e74c3c;
                color: white;
                font-size: 11px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 10px;
                min-width: 18px;
                text-align: center;
                animation: pulse 2s infinite;
            }

            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }

            .announcement-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: flex-start;
                padding-top: 80px;
                z-index: 10000;
                animation: fadeIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .announcement-modal {
                background: white;
                border-radius: 16px;
                max-width: 500px;
                width: 90%;
                max-height: 70vh;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: slideDown 0.3s ease;
            }

            @keyframes slideDown {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            .announcement-item {
                padding: 16px 20px;
                border-bottom: 1px solid #f0f0f0;
                cursor: pointer;
                transition: background 0.2s;
            }

            .announcement-item:hover {
                background: #f9f9f9;
            }

            .announcement-item.unread {
                background: #f0f8ff;
                border-left: 4px solid #667eea;
            }

            .announcement-item.urgent {
                border-left: 4px solid #e74c3c;
            }

            .announcement-item.important {
                border-left: 4px solid #f39c12;
            }

            .priority-badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                margin-left: 8px;
            }

            .priority-urgent {
                background: #fee;
                color: #e74c3c;
            }

            .priority-important {
                background: #fff8e6;
                color: #f39c12;
            }
        `;
        document.head.appendChild(style);
    }

    // Load unread count
    async function loadUnreadCount() {
        if (window.__sessionExpired) return;
        try {
            const response = await fetch('/api/announcements/student/unread-count');
            if (!response.ok) {
                if (response.status === 401) {
                    if (pollTimer) clearTimeout(pollTimer);
                    if (typeof handleSessionExpired === 'function') handleSessionExpired();
                    return;
                }
                if (response.status === 429) consecutiveFailures++;
                return;
            }
            consecutiveFailures = 0;

            const data = await response.json();
            unreadCount = data.unreadCount || 0;

            const badge = document.getElementById('announcements-badge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    badge.style.display = 'inline-block';

                    // Animate the button if there are new announcements
                    const btn = document.getElementById('announcements-btn');
                    if (btn) {
                        btn.style.animation = 'none';
                        setTimeout(() => {
                            btn.style.animation = 'shake 0.5s ease';
                        }, 10);
                    }
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('[StudentAnnouncements] Error loading unread count:', error);
            // Network errors (ERR_CONNECTION_CLOSED, Failed to fetch) should
            // trigger backoff so we don't hammer a recovering server
            consecutiveFailures++;
        }
    }

    // Open announcements modal
    async function openAnnouncementsModal() {
        if (isModalOpen) return;
        isModalOpen = true;

        // Create modal
        const overlay = document.createElement('div');
        overlay.className = 'announcement-modal-overlay';
        overlay.innerHTML = `
            <div class="announcement-modal">
                <div style="padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-bell" style="color: #667eea;"></i>
                        Teacher Announcements
                    </h3>
                    <button id="close-announcements-modal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">&times;</button>
                </div>
                <div id="announcements-content" style="max-height: 60vh; overflow-y: auto;">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #667eea;"></i>
                    </div>
                </div>
                ${unreadCount > 0 ? `
                    <div style="padding: 12px 20px; border-top: 1px solid #e0e0e0; text-align: center;">
                        <button id="mark-all-read-btn" style="background: none; border: none; color: #667eea; cursor: pointer; font-size: 14px;">
                            <i class="fas fa-check-double"></i> Mark all as read
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(overlay);

        // Add event listeners
        overlay.querySelector('#close-announcements-modal').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const markAllBtn = overlay.querySelector('#mark-all-read-btn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', markAllAsRead);
        }

        // Load announcements
        await loadAnnouncements();

        function closeModal() {
            overlay.remove();
            isModalOpen = false;
        }
    }

    // Load announcements
    async function loadAnnouncements() {
        const content = document.getElementById('announcements-content');
        if (!content) return;

        try {
            const response = await fetch('/api/announcements/student?limit=30');
            if (!response.ok) throw new Error('Failed to load announcements');

            const data = await response.json();
            announcementsData = data.announcements || [];

            if (announcementsData.length === 0) {
                content.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p style="margin: 0;">No announcements yet</p>
                        <p style="font-size: 0.9em; margin-top: 8px;">Your teacher's messages will appear here</p>
                    </div>
                `;
                return;
            }

            content.innerHTML = announcementsData.map(a => {
                const date = new Date(a.createdAt);
                const dateStr = formatTimeAgo(date);
                const isUnread = !a.isRead;
                const teacherName = a.teacherId ? `${a.teacherId.firstName} ${a.teacherId.lastName}` : 'Teacher';

                const categoryIcons = {
                    general: 'fa-info-circle',
                    assignment: 'fa-book',
                    reminder: 'fa-bell',
                    encouragement: 'fa-heart',
                    achievement: 'fa-trophy',
                    event: 'fa-calendar'
                };

                let priorityBadge = '';
                if (a.priority === 'urgent') {
                    priorityBadge = '<span class="priority-badge priority-urgent">Urgent</span>';
                } else if (a.priority === 'important') {
                    priorityBadge = '<span class="priority-badge priority-important">Important</span>';
                }

                return `
                    <div class="announcement-item ${isUnread ? 'unread' : ''} ${a.priority}" data-id="${a._id}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fas ${categoryIcons[a.category] || 'fa-info-circle'}" style="color: #667eea;"></i>
                                <span style="font-weight: ${isUnread ? '700' : '500'}; color: #333;">
                                    ${escapeHtml(a.title)}
                                </span>
                                ${priorityBadge}
                            </div>
                            ${isUnread ? '<span style="width: 8px; height: 8px; background: #667eea; border-radius: 50%; flex-shrink: 0;"></span>' : ''}
                        </div>
                        <p style="margin: 0; color: #555; font-size: 0.9em; line-height: 1.5;">
                            ${escapeHtml(a.body)}
                        </p>
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.8em; color: #999;">
                            <span><i class="fas fa-user"></i> ${escapeHtml(teacherName)}</span>
                            <span>${dateStr}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers to mark as read
            content.querySelectorAll('.announcement-item.unread').forEach(item => {
                item.addEventListener('click', () => markAsRead(item.dataset.id, item));
            });

        } catch (error) {
            console.error('[StudentAnnouncements] Error loading announcements:', error);
            content.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 40px;">Error loading announcements</p>';
        }
    }

    // Mark single announcement as read
    async function markAsRead(announcementId, element) {
        try {
            await csrfFetch(`/api/announcements/student/${announcementId}/read`, {
                method: 'POST'
            });

            element.classList.remove('unread');
            element.querySelector('[style*="background: #667eea"]')?.remove();

            loadUnreadCount();
        } catch (error) {
            console.error('[StudentAnnouncements] Error marking as read:', error);
        }
    }

    // Mark all as read
    async function markAllAsRead() {
        try {
            await csrfFetch('/api/announcements/student/mark-all-read', {
                method: 'POST'
            });

            document.querySelectorAll('.announcement-item.unread').forEach(item => {
                item.classList.remove('unread');
            });

            const markAllBtn = document.getElementById('mark-all-read-btn');
            if (markAllBtn) {
                markAllBtn.innerHTML = '<i class="fas fa-check"></i> All marked as read';
                markAllBtn.disabled = true;
            }

            loadUnreadCount();
        } catch (error) {
            console.error('[StudentAnnouncements] Error marking all as read:', error);
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
        div.textContent = text || '';
        return div.innerHTML;
    }

    // Add shake animation
    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
    `;
    document.head.appendChild(shakeStyle);
})();

;
/* --- /js/guided-tour.js --- */
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
        content: 'NEW! Send instant messages to your entire class or individual students. They\'ll see them right in their dashboard.',
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
        element: '[data-tab="messages"]',
        title: 'Teacher Communication',
        content: 'Send and receive messages from your child\'s teacher. Stay informed about their progress.',
        position: 'bottom'
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
        element: '#daily-quests-container',
        title: 'Daily Quests',
        content: 'Complete quests every day to earn XP and build your streak! Consistency is key to mastering math.',
        position: 'right'
    },
    {
        element: '.sidebar-progress',
        title: 'Your Progress',
        content: 'Track your XP and level here. The more you practice, the higher you\'ll climb!',
        position: 'right'
    },
    {
        element: '#sidebar-leaderboard',
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
        content: 'Snap a photo or upload a PDF of your handwritten work and get instant feedback and grading. Available for Unlimited users!',
        position: 'top'
    }
];

// Admin Dashboard Tour
window.adminDashboardTour = [
    {
        element: '.admin-stats-grid',
        title: 'System Overview',
        content: 'Monitor key metrics: total users, active sessions, and system health at a glance.',
        position: 'bottom'
    },
    {
        element: '[data-tab="users"]',
        title: 'User Management',
        content: 'Create, edit, and manage all user accounts. Assign teachers, link parents, and more.',
        position: 'bottom'
    },
    {
        element: '[data-tab="teachers"]',
        title: 'Teacher Management',
        content: 'View all teachers, their class sizes, and student progress statistics.',
        position: 'bottom'
    },
    {
        element: '[data-tab="email"]',
        title: 'Bulk Email',
        content: 'NEW! Send emails to all students, parents, teachers, or specific classes. Great for announcements and newsletters.',
        position: 'bottom'
    },
    {
        element: '.create-teacher-btn',
        title: 'Add Teachers',
        content: 'Quickly create new teacher accounts and generate enrollment codes for their classes.',
        position: 'left'
    },
    {
        element: '[data-tab="feedback"]',
        title: 'User Feedback',
        content: 'Review bug reports and feature requests from users.',
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
/* --- /js/ux-enhancements.js --- */
/**
 * ux-enhancements.js — UX/UI 3x Improvement Pack
 *
 * Features:
 * 1. Page transition progress bar
 * 2. Bottom nav bar for mobile
 * 3. Skeleton screens
 * 4. Structured problem cards in chat
 * 5. Enhanced badge unlock ceremony
 * 6. Dynamic contextual suggestion chips
 * 7. Client-side route prefetching
 * 8. Tutor-specific thinking indicator
 */

(function() {
  'use strict';

  // ============================================
  // 1. PAGE TRANSITION PROGRESS BAR
  // ============================================

  function initPageTransitionBar() {
    // Create the bar element
    const bar = document.createElement('div');
    bar.id = 'page-transition-bar';
    document.body.prepend(bar);

    // Trigger on internal link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      // Only trigger for internal navigation (not anchors, external, or javascript:)
      if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
          href.startsWith('http') || href.startsWith('mailto:') ||
          link.target === '_blank' || e.ctrlKey || e.metaKey) {
        return;
      }

      bar.className = 'active';
    });

    // Also trigger on form submissions
    document.addEventListener('submit', () => {
      bar.className = 'active';
    });

    // Complete the bar when page is about to unload
    window.addEventListener('beforeunload', () => {
      bar.classList.add('complete');
    });

    // If we arrived via a navigation, show a quick completion
    if (performance.navigation && performance.navigation.type === 1) {
      bar.style.width = '100%';
      bar.style.opacity = '1';
      setTimeout(() => {
        bar.style.transition = 'opacity 0.3s ease';
        bar.style.opacity = '0';
      }, 100);
    }
  }


  // ============================================
  // 2. MOBILE BOTTOM NAV BAR
  // ============================================

  function initBottomNav() {
    // Only show on mobile
    if (window.innerWidth > 768) return;

    // Don't add on login/signup pages
    const path = window.location.pathname;
    if (path.includes('login') || path.includes('signup') || path.includes('pick-tutor') ||
        path.includes('pick-avatar') || path.includes('complete-profile') ||
        path.includes('privacy') || path.includes('terms') ||
        path === '/' || path === '/index.html') {
      return;
    }

    // Chat page uses its own in-page nav (mobile-chat-nav.js) that preserves
    // chat state across tab switches. Don't add the page-navigating nav there.
    if (document.body.classList.contains('landing-page-body')) {
      return;
    }

    const navItems = [
      { icon: 'fa-home', label: 'Home', href: '/student-dashboard.html', id: 'nav-home' },
      { icon: 'fa-comment', label: 'Chat', href: '/chat.html', id: 'nav-chat' },
      { icon: 'fa-chart-line', label: 'Progress', href: '/progress.html', id: 'nav-progress' },
      { icon: 'fa-graduation-cap', label: 'Courses', href: '/chat.html?courses=1', id: 'nav-courses' },
      { icon: 'fa-user-circle', label: 'Profile', href: '/student-dashboard.html#profile', id: 'nav-profile' }
    ];

    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');

    const inner = document.createElement('div');
    inner.className = 'mobile-bottom-nav-inner';

    navItems.forEach(item => {
      const link = document.createElement('a');
      link.href = item.href;
      link.className = 'bottom-nav-item';
      link.id = item.id;
      link.setAttribute('aria-label', item.label);

      // Detect active page (handle items sharing a path, e.g. Chat vs Courses)
      const hrefPath = item.href.split('?')[0];
      const hrefQuery = item.href.includes('?') ? item.href.split('?')[1] : '';
      const pathMatches = path === hrefPath || (hrefPath !== '/' && path.includes(hrefPath.replace('.html', '')));
      if (pathMatches) {
        // If this item has a query param, only activate when the param is present
        // If it doesn't, only activate when no other item's query param is present
        if (hrefQuery) {
          if (window.location.search.includes(hrefQuery)) link.classList.add('active');
        } else {
          // Don't activate if the URL has query params that belong to another nav item
          const hasSpecialParam = navItems.some(n => n.href.includes('?') && n.href.split('?')[0] === hrefPath && window.location.search.includes(n.href.split('?')[1]));
          if (!hasSpecialParam) link.classList.add('active');
        }
      }

      link.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.label}</span>`;
      inner.appendChild(link);
    });

    nav.appendChild(inner);
    document.body.appendChild(nav);
    document.body.classList.add('has-bottom-nav');
  }


  // ============================================
  // 3. SKELETON SCREENS
  // ============================================

  /**
   * Create a skeleton loading card
   * @param {string} type - 'card', 'chat-message', 'list-item'
   * @returns {HTMLElement}
   */
  function createSkeleton(type) {
    const el = document.createElement('div');

    switch (type) {
      case 'card':
        el.className = 'skeleton-card';
        el.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div class="skeleton skeleton-icon"></div>
            <div style="flex: 1;">
              <div class="skeleton skeleton-text medium"></div>
              <div class="skeleton skeleton-text short"></div>
            </div>
          </div>
          <div class="skeleton skeleton-bar" style="width: 100%;"></div>
          <div class="skeleton skeleton-btn"></div>
        `;
        break;

      case 'chat-message':
        el.className = 'skeleton-chat-message';
        el.innerHTML = `
          <div class="skeleton skeleton-avatar"></div>
          <div class="skeleton-message-body">
            <div class="skeleton skeleton-message-line" style="width: 85%;"></div>
            <div class="skeleton skeleton-message-line" style="width: 65%;"></div>
            <div class="skeleton skeleton-message-line" style="width: 45%;"></div>
          </div>
        `;
        break;

      case 'list-item':
        el.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px 0;';
        el.innerHTML = `
          <div class="skeleton" style="width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;"></div>
          <div style="flex: 1;">
            <div class="skeleton skeleton-text medium"></div>
          </div>
        `;
        break;
    }

    return el;
  }

  /**
   * Replace a container's content with skeleton loading state
   */
  function showSkeletons(container, type, count) {
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      container.appendChild(createSkeleton(type));
    }
  }

  /**
   * Auto-apply skeletons to elements with data-skeleton attribute
   */
  function initSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      const type = el.dataset.skeleton || 'card';
      const count = parseInt(el.dataset.skeletonCount || '3', 10);
      if (el.children.length === 0 || el.dataset.skeletonActive === 'true') {
        showSkeletons(el, type, count);
      }
    });
  }


  // ============================================
  // 4. STRUCTURED PROBLEM CARDS
  // ============================================

  /**
   * Detect if a message contains a math problem and wrap it in a problem card.
   * Called after appendMessage renders content.
   */
  function enhanceProblemMessages() {
    // Patterns that indicate a math problem is being presented
    const problemPatterns = [
      /(?:solve|simplify|evaluate|factor|find|calculate|compute|graph|determine)\s*(?:the|this|:)/i,
      /what\s+is\s+\d/i,
      /\?\s*$/m,
      /try\s+this\s+(?:one|problem|question)/i,
      /here(?:'s| is)\s+(?:a|your|the)\s+(?:problem|question)/i,
      /problem\s*(?:\d|#|:)/i,
      /practice\s+problem/i,
    ];

    // Hook into appendMessage to check AI messages
    const originalAppendMessage = window.appendMessage;
    if (!originalAppendMessage) return;

    window.appendMessage = function(text, sender, graphData, isMasteryQuiz) {
      // Call original
      originalAppendMessage.call(this, text, sender, graphData, isMasteryQuiz);

      // Only enhance AI messages that look like problems
      if (sender !== 'ai' || !text) return;

      const isProblem = problemPatterns.some(pattern => pattern.test(text));
      if (!isProblem && !isMasteryQuiz) return;

      // Find the just-appended message
      const chatBox = document.getElementById('chat-messages-container');
      if (!chatBox) return;

      const messages = chatBox.querySelectorAll('.message.ai');
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.dataset.problemCardApplied) return;

      lastMessage.dataset.problemCardApplied = 'true';

      // Wrap the message text in a problem card structure
      const textNode = lastMessage.querySelector('.message-text');
      if (!textNode) return;

      // Create a problem card wrapper
      const card = document.createElement('div');
      card.className = 'problem-card';

      const header = document.createElement('div');
      header.className = 'problem-card-header';
      header.innerHTML = '<i class="fas fa-brain"></i> <span>Problem</span>';

      const body = document.createElement('div');
      body.className = 'problem-card-body';
      // Move all children from textNode into the card body
      while (textNode.firstChild) {
        body.appendChild(textNode.firstChild);
      }

      const actions = document.createElement('div');
      actions.className = 'problem-card-actions';
      actions.innerHTML = `
        <button class="problem-action-btn" onclick="if(window.showSuggestions) window.showSuggestions([{text:'Give me a hint', message:'Can you give me a hint?'}])">
          <i class="fas fa-lightbulb"></i> Hint
        </button>
        <button class="problem-action-btn" onclick="if(window.showSuggestions) window.showSuggestions([{text:'Show me an example', message:'Can you show me a similar example first?'}])">
          <i class="fas fa-book-open"></i> Example
        </button>
        <button class="problem-action-btn" onclick="if(window.showSuggestions) window.showSuggestions([{text:'Explain differently', message:'Can you explain this differently?'}])">
          <i class="fas fa-sync-alt"></i> Rephrase
        </button>
      `;

      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(actions);

      // Replace textNode content with the card
      textNode.innerHTML = '';
      textNode.appendChild(card);
    };
  }


  // ============================================
  // 5. ENHANCED BADGE CEREMONY
  // ============================================

  /**
   * Show a full-screen badge unlock ceremony
   * Replaces the simple modal with an immersive celebration
   */
  function showBadgeCeremony(badge) {
    const name = badge.name || badge.badgeName || badge.badge || 'Achievement Unlocked';
    const description = badge.description || 'You\'ve mastered a new skill!';
    const xp = badge.xpReward || badge.xpBonus || 500;
    const icon = badge.icon || 'fa-trophy';

    // Create ceremony overlay
    const overlay = document.createElement('div');
    overlay.className = 'badge-ceremony-overlay';
    overlay.innerHTML = `
      <div class="badge-ceremony-content">
        <div class="badge-ceremony-label">New Badge Unlocked</div>
        <div class="badge-ceremony-icon">
          <div class="badge-shimmer"></div>
          <i class="fas ${icon}"></i>
        </div>
        <div class="badge-ceremony-name">${name}</div>
        <div class="badge-ceremony-description">${description}</div>
        <div class="badge-ceremony-xp">+${xp} XP</div>
        <button class="badge-ceremony-dismiss">Continue</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Trigger confetti after badge pops in
    setTimeout(() => {
      if (window.ensureConfetti) {
        window.ensureConfetti().then(() => {
          if (typeof confetti === 'function') {
            // Center burst
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.5 },
              colors: ['#FFD700', '#FFA500', '#FF3B7F', '#12B3B3', '#16C86D']
            });
            // Side bursts
            setTimeout(() => {
              confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: ['#FFD700', '#12B3B3'] });
              confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: ['#FFD700', '#FF3B7F'] });
            }, 300);
          }
        });
      }
    }, 600);

    // Dismiss handlers
    const dismiss = () => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.badge-ceremony-dismiss').addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    // Auto-dismiss after 8 seconds
    setTimeout(dismiss, 8000);
  }

  // Override existing badge celebration functions
  function hookBadgeCeremony() {
    // Override showBadgeCelebration from engagement-widgets.js
    const originalShowBadgeCelebration = window.showBadgeCelebration;
    window.showBadgeCelebration = function(badge) {
      showBadgeCeremony(badge);
    };

    // Override showBadgeEarnedModal from badgeProgress.js if it exists
    // We'll monkey-patch it when it becomes available
    const observer = new MutationObserver(() => {
      if (window.showBadgeEarnedModal && !window._badgeEarnedPatched) {
        window._badgeEarnedPatched = true;
        const original = window.showBadgeEarnedModal;
        window.showBadgeEarnedModal = function(data) {
          showBadgeCeremony({
            name: data.badge || data.badgeName,
            description: data.description || 'You\'ve mastered a new skill!',
            xpReward: data.xpBonus || data.xpReward || 500,
            icon: data.icon || 'fa-trophy'
          });
        };
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    // Stop observing after 10s to avoid long-running observer
    setTimeout(() => observer.disconnect(), 10000);
  }


  // ============================================
  // 6. DYNAMIC CONTEXTUAL SUGGESTION CHIPS
  // ============================================

  /**
   * Context-aware suggestion chip sets
   */
  const SUGGESTION_CONTEXTS = {
    greeting: [
      { text: 'Help me practice', message: 'I want to practice math problems' },
      { text: 'Homework help', message: 'Can you help me with my homework?' },
      { text: 'Explain a concept', message: 'Can you explain a math concept to me?' },
      { text: "I've got this!", message: 'I think I know this skill, can you quiz me to be sure?' }
    ],
    problem_solving: [
      { text: 'Give me a hint', message: 'Can you give me a hint?' },
      { text: 'Show an example', message: 'Can you show me a similar example first?' },
      { text: 'Explain differently', message: 'Can you explain that a different way?' },
      { text: 'I\'m stuck', message: 'I\'m stuck and need more help on this' }
    ],
    correct_answer: [
      { text: 'Next problem', message: 'I\'m ready for the next problem!' },
      { text: 'Harder please', message: 'Can you give me a harder problem?' },
      { text: 'Why does that work?', message: 'Why does that answer work? Can you explain the concept?' },
      { text: 'Review my learning', message: 'What have I learned so far today?' }
    ],
    incorrect_answer: [
      { text: 'Walk me through it', message: 'Can you walk me through the solution step by step?' },
      { text: 'Where did I go wrong?', message: 'Where did I go wrong in my thinking?' },
      { text: 'Try again', message: 'Let me try that problem again' },
      { text: 'Easier version', message: 'Can you give me an easier version of that problem?' }
    ],
    explanation: [
      { text: 'Got it, next topic', message: 'I understand! What\'s next?' },
      { text: 'Still confused', message: 'I\'m still a bit confused. Can you simplify?' },
      { text: 'Show me visually', message: 'Can you show me this visually or with a diagram?' },
      { text: 'Give me practice', message: 'I want to practice this concept' }
    ]
  };

  /**
   * Detect the context of the last AI message and show appropriate chips
   */
  function detectContextAndShowChips(aiText) {
    if (!aiText || !window.showSuggestions) return;

    const text = aiText.toLowerCase();

    let context = 'greeting';

    // Detect correct answer feedback
    if (/correct|right|great job|well done|perfect|excellent|awesome|nice work|that's it/i.test(text)) {
      context = 'correct_answer';
    }
    // Detect incorrect answer feedback
    else if (/not quite|incorrect|try again|that's not|close but|almost|let's look at that again/i.test(text)) {
      context = 'incorrect_answer';
    }
    // Detect problem presentation
    else if (/solve|simplify|evaluate|factor|find|calculate|what is.*\?|try this|problem/i.test(text)) {
      context = 'problem_solving';
    }
    // Detect explanation
    else if (/means that|because|think of it|for example|the reason|concept|when we|remember that/i.test(text)) {
      context = 'explanation';
    }

    const suggestions = SUGGESTION_CONTEXTS[context] || SUGGESTION_CONTEXTS.greeting;
    window.showSuggestions(suggestions);
  }

  /**
   * Hook into the AI response flow to auto-detect context.
   * Only fires regex-based fallback when server hasn't provided smart suggestions.
   */
  function hookDynamicSuggestions() {
    const originalAppend = window.appendMessage;
    if (!originalAppend) return;

    // Track whether server provided suggestions for this response cycle
    window._serverSuggestionsProvided = false;

    const currentAppend = window.appendMessage;
    window.appendMessage = function(text, sender, graphData, isMasteryQuiz) {
      currentAppend.call(this, text, sender, graphData, isMasteryQuiz);

      // After AI message, use regex fallback only if server didn't provide suggestions
      if (sender === 'ai' && text) {
        setTimeout(() => {
          if (!window._serverSuggestionsProvided) {
            detectContextAndShowChips(text);
          }
          // Reset the flag for the next response cycle
          window._serverSuggestionsProvided = false;
        }, 600); // Slightly longer delay than server path (500ms) so server wins
      }
    };
  }


  // ============================================
  // 7. CLIENT-SIDE ROUTE PREFETCHING
  // ============================================

  function initPrefetching() {
    const prefetchedUrls = new Set();
    const currentPath = window.location.pathname;

    // Priority pages to prefetch based on current page
    const prefetchMap = {
      '/student-dashboard.html': ['/chat.html'],
      '/chat.html': ['/student-dashboard.html', '/progress.html'],
      '/progress.html': ['/chat.html', '/student-dashboard.html']
    };

    const toPrefetch = prefetchMap[currentPath] || [];

    // Prefetch after page load settles
    setTimeout(() => {
      toPrefetch.forEach(url => {
        if (prefetchedUrls.has(url)) return;
        prefetchedUrls.add(url);

        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = 'document';
        document.head.appendChild(link);
      });
    }, 2000);

    // Also prefetch on hover for any internal link
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') ||
          href.startsWith('javascript:') || prefetchedUrls.has(href)) {
        return;
      }

      prefetchedUrls.add(href);
      const prefetchLink = document.createElement('link');
      prefetchLink.rel = 'prefetch';
      prefetchLink.href = href;
      prefetchLink.as = 'document';
      document.head.appendChild(prefetchLink);
      link.dataset.prefetched = 'true';
    }, { passive: true });
  }


  // ============================================
  // 8. TUTOR-SPECIFIC THINKING INDICATOR
  // ============================================

  function enhanceThinkingIndicator() {
    const thinkingIndicator = document.getElementById('thinking-indicator');
    if (!thinkingIndicator) return;

    const tutorMessages = {
      'ms-rivera': 'Ms. Rivera is working out an example...',
      'coach-k': 'Coach K is checking your work...',
      'professor-chen': 'Professor Chen is preparing a solution...',
      'mr-j': 'Mr. J is thinking about the best approach...',
      'default': 'Your tutor is thinking...'
    };

    // Override showThinkingIndicator if it exists
    const originalShow = window.showThinkingIndicator;
    window.showThinkingIndicator = function(show) {
      if (originalShow) originalShow(show);

      if (show && thinkingIndicator) {
        // Get tutor ID from user data
        const tutorId = window.currentUser?.selectedTutorId || 'default';
        const message = tutorMessages[tutorId] || tutorMessages['default'];

        const textSpan = thinkingIndicator.querySelector('span:last-child');
        if (textSpan) {
          textSpan.textContent = message;
          textSpan.className = 'thinking-indicator-text';
        }
      }
    };
  }


  // ============================================
  // 9. ACCESSIBILITY ENHANCEMENTS
  // ============================================

  /**
   * Enhance modals with ARIA attributes for screen readers
   */
  function enhanceModalAccessibility() {
    // Add role="dialog" and aria-modal to all modal overlays
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      if (!modal.getAttribute('role')) {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
      }

      // Set aria-labelledby if a heading exists inside
      const heading = modal.querySelector('h2, h3, .modal-title');
      if (heading && !modal.getAttribute('aria-labelledby')) {
        if (!heading.id) heading.id = 'modal-title-' + Math.random().toString(36).substr(2, 6);
        modal.setAttribute('aria-labelledby', heading.id);
      }
    });

    // Add aria-live region for chat messages
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer && !chatContainer.getAttribute('aria-live')) {
      chatContainer.setAttribute('aria-live', 'polite');
      chatContainer.setAttribute('aria-relevant', 'additions');
      chatContainer.setAttribute('role', 'log');
    }

    // Add aria-label to close buttons that only have "×"
    document.querySelectorAll('.modal-close-button').forEach(btn => {
      if (!btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', 'Close dialog');
      }
    });
  }

  /**
   * Trap keyboard focus inside open modals
   */
  function initModalFocusTrap() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;

      const activeModal = document.querySelector('.modal-overlay.is-visible');
      if (!activeModal) return;

      const focusable = activeModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const activeModal = document.querySelector('.modal-overlay.is-visible');
      if (activeModal) {
        const closeBtn = activeModal.querySelector('.modal-close-button');
        if (closeBtn) closeBtn.click();
      }
    });
  }


  // ============================================
  // 10. LIGHTWEIGHT TOAST (CSS-DRIVEN)
  // ============================================

  /**
   * Show a lightweight CSS-driven toast notification.
   * Uses the classes from ux-enhancements.css.
   */
  function showCSSToast(message, options = {}) {
    const {
      type = 'info',
      title = null,
      duration = 4000,
      icon = null
    } = options;

    // Ensure container exists
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'false');
      document.body.appendChild(container);
    }

    const iconMap = {
      success: 'fa-check',
      error: 'fa-times',
      warning: 'fa-exclamation',
      info: 'fa-info',
      xp: 'fa-star'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.style.setProperty('--toast-duration', `${duration}ms`);
    toast.innerHTML = `
      <div class="toast-icon"><i class="fas ${icon || iconMap[type] || iconMap.info}"></i></div>
      <div class="toast-body">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-dismiss" aria-label="Dismiss">&times;</button>
      <div class="toast-progress"></div>
    `;

    // Dismiss handler
    const dismiss = () => {
      toast.classList.add('toast-exiting');
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector('.toast-dismiss').addEventListener('click', dismiss);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    container.appendChild(toast);
    return toast;
  }


  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    // Always init these (lightweight, non-destructive)
    initPageTransitionBar();
    initPrefetching();

    // DOM-dependent features
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }

  function onReady() {
    initBottomNav();
    initSkeletons();

    // Accessibility enhancements
    enhanceModalAccessibility();
    initModalFocusTrap();

    // Chat-specific enhancements (only on chat pages)
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer) {
      enhanceProblemMessages();
      hookDynamicSuggestions();
      enhanceThinkingIndicator();
    }

    // Hook badge ceremony globally
    hookBadgeCeremony();

    // Re-enhance modals when new ones are added dynamically
    const bodyObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && (node.classList?.contains('modal-overlay') || node.querySelector?.('.modal-overlay'))) {
            enhanceModalAccessibility();
            break;
          }
        }
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Expose utilities globally
  window.UXEnhancements = {
    showSkeletons,
    createSkeleton,
    showBadgeCeremony,
    detectContextAndShowChips,
    showCSSToast,
    SUGGESTION_CONTEXTS
  };

  // Run
  init();

})();

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

;
/* --- /js/browser-lock.js --- */
// public/js/browser-lock.js
// Student-side browser lock module.
// Detects tab switches, navigation attempts, fullscreen exits, and reports
// them to the server. Shows a warning overlay when the student is off-task.

(function () {
  'use strict';

  const BASE_POLL_INTERVAL = 30000; // Check lock status every 30 seconds
  const MAX_POLL_INTERVAL = 300000; // Cap backoff at 5 minutes
  const HEARTBEAT_INTERVAL = 15000; // Heartbeat every 15 seconds when locked

  let lockState = {
    locked: false,
    sessionId: null,
    settings: {},
    heartbeatTimer: null,
    pollTimer: null,
    overlay: null,
    violationCount: 0,
    tabSwitchStart: null,
    consecutivePollFailures: 0
  };

  // ─── INITIALIZATION ─────────────────────────────────────────────────────────

  async function checkLockStatus() {
    try {
      const res = await fetch('/api/browser-lock/check', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 429) lockState.consecutivePollFailures++;
        return;
      }

      lockState.consecutivePollFailures = 0;
      const data = await res.json();
      if (data.locked) {
        activateLock(data);
      } else if (lockState.locked) {
        deactivateLock();
      }
    } catch (e) {
      lockState.consecutivePollFailures++;
      console.warn('[BrowserLock] Failed to check status:', e.message);
    }
  }

  function activateLock(data) {
    lockState.locked = true;
    lockState.sessionId = data.sessionId;
    lockState.settings = data.settings || {};

    // Set up detection listeners
    setupVisibilityDetection();
    setupNavigationDetection();
    setupFullscreenDetection();
    setupDevToolsDetection();

    // Start heartbeat
    startHeartbeat();

    // Request fullscreen if enforced
    if (lockState.settings.enforceFullscreen) {
      requestFullscreen();
    }

    // Show a brief notification that focus mode is active
    showFocusBanner(data.sessionName || 'Focus Session');

    console.log('[BrowserLock] Focus mode activated:', data.sessionName);
  }

  function deactivateLock() {
    lockState.locked = false;
    lockState.sessionId = null;

    // Remove listeners
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('fullscreenchange', onFullscreenChange);

    // Stop heartbeat
    if (lockState.heartbeatTimer) {
      clearInterval(lockState.heartbeatTimer);
      lockState.heartbeatTimer = null;
    }

    // Remove overlay and banner
    removeOverlay();
    removeFocusBanner();

    console.log('[BrowserLock] Focus mode deactivated');
  }

  // ─── VISIBILITY (TAB SWITCH) DETECTION ──────────────────────────────────────

  function onVisibilityChange() {
    if (!lockState.locked) return;

    if (document.hidden) {
      lockState.tabSwitchStart = Date.now();
      reportViolation('tab-switch', 'Student switched away from tab');
    } else {
      // Student returned
      const awayDuration = lockState.tabSwitchStart
        ? Math.round((Date.now() - lockState.tabSwitchStart) / 1000)
        : 0;
      lockState.tabSwitchStart = null;

      if (awayDuration > 2) {
        reportViolation('tab-switch', `Switched away for ${awayDuration} seconds`);
      }

      // Update status back to active
      sendHeartbeat('active');
      showReturnWarning(awayDuration);
    }
  }

  function setupVisibilityDetection() {
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Also detect window blur (covers alt-tab, clicking outside browser)
    window.addEventListener('blur', () => {
      if (!lockState.locked) return;
      // Only report if page is still visible (blur without tab switch = window blur)
      if (!document.hidden) {
        reportViolation('window-blur', 'Window lost focus');
      }
    });
  }

  // ─── NAVIGATION DETECTION ──────────────────────────────────────────────────

  function onBeforeUnload(e) {
    if (!lockState.locked || !lockState.settings.blockNavigation) return;

    reportViolation('navigation-attempt', 'Attempted to leave page');

    // Show browser's built-in "are you sure?" dialog
    e.preventDefault();
    e.returnValue = lockState.settings.lockMessage || 'Your teacher has enabled focus mode.';
    return e.returnValue;
  }

  function setupNavigationDetection() {
    window.addEventListener('beforeunload', onBeforeUnload);

    // Intercept link clicks to allowed pages only
    document.addEventListener('click', (e) => {
      if (!lockState.locked) return;
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      // Allow internal tool links (calculator, whiteboard)
      const allowedPaths = ['/chat.html'];
      if (lockState.settings.allowCalculator) allowedPaths.push('/calculator.html');
      if (lockState.settings.allowWhiteboard) allowedPaths.push('/canvas.html');

      if (!allowedPaths.some(p => href.startsWith(p)) && !href.startsWith('#') && !href.startsWith('javascript:')) {
        e.preventDefault();
        showOverlay('Navigation is restricted during focus mode.');
        reportViolation('navigation-attempt', `Tried to navigate to: ${href}`);
      }
    });
  }

  // ─── FULLSCREEN DETECTION ──────────────────────────────────────────────────

  function onFullscreenChange() {
    if (!lockState.locked || !lockState.settings.enforceFullscreen) return;

    if (!document.fullscreenElement) {
      reportViolation('fullscreen-exit', 'Exited fullscreen mode');
      // Re-request fullscreen after a brief delay
      setTimeout(() => {
        if (lockState.locked && lockState.settings.enforceFullscreen) {
          requestFullscreen();
        }
      }, 1000);
    }
  }

  function setupFullscreenDetection() {
    document.addEventListener('fullscreenchange', onFullscreenChange);
  }

  function requestFullscreen() {
    const el = document.documentElement;
    const requestFn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (requestFn) {
      requestFn.call(el).catch(() => {
        // Fullscreen request requires user gesture — will try again on next click
        document.addEventListener('click', function fullscreenRetry() {
          if (lockState.locked && lockState.settings.enforceFullscreen) {
            requestFn.call(el).catch(() => {});
          }
          document.removeEventListener('click', fullscreenRetry);
        }, { once: true });
      });
    }
  }

  // ─── DEV TOOLS DETECTION ───────────────────────────────────────────────────

  function setupDevToolsDetection() {
    // Detect devtools via window size differential (not foolproof but a deterrent)
    let devtoolsOpen = false;
    const threshold = 160;

    const check = () => {
      if (!lockState.locked) return;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;

      if ((widthDiff || heightDiff) && !devtoolsOpen) {
        devtoolsOpen = true;
        reportViolation('devtools-open', 'DevTools may have been opened');
      } else if (!widthDiff && !heightDiff) {
        devtoolsOpen = false;
      }
    };

    setInterval(check, 2000);
  }

  // ─── HEARTBEAT ─────────────────────────────────────────────────────────────

  function startHeartbeat() {
    // Send immediately
    sendHeartbeat('active');

    // Then on interval
    lockState.heartbeatTimer = setInterval(() => {
      const status = document.hidden ? 'tab-away' : 'active';
      sendHeartbeat(status);
    }, HEARTBEAT_INTERVAL);
  }

  async function sendHeartbeat(status) {
    if (!lockState.locked) return;

    try {
      // Gather current activity info
      const currentActivity = getCurrentActivity();
      const lastMessagePreview = getLastMessagePreview();

      const payload = {
        sessionId: lockState.sessionId,
        status,
        currentActivity,
        currentPage: window.location.pathname,
        lastMessagePreview,
        isFullscreen: !!document.fullscreenElement
      };

      // Use sendBeacon if page is hidden to ensure delivery
      if (document.hidden) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/browser-lock/heartbeat', blob);
      } else {
        await fetch('/api/browser-lock/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
      }
    } catch (e) {
      // Silently fail — next heartbeat will retry
    }
  }

  // ─── VIOLATION REPORTING ───────────────────────────────────────────────────

  async function reportViolation(type, details) {
    if (!lockState.locked) return;

    lockState.violationCount++;

    try {
      const res = await fetch('/api/browser-lock/violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: lockState.sessionId,
          type,
          details
        }),
        credentials: 'include'
      });

      const data = await res.json();

      if (data.warning) {
        showOverlay(data.warning);
      }
    } catch (e) {
      console.warn('[BrowserLock] Failed to report violation:', e.message);
    }
  }

  // ─── ACTIVITY DETECTION HELPERS ────────────────────────────────────────────

  function getCurrentActivity() {
    // Try to detect what the student is working on
    const topicEl = document.querySelector('.current-topic, #current-topic, .topic-label');
    if (topicEl) return topicEl.textContent.trim();

    // Check page title or path
    const path = window.location.pathname;
    if (path.includes('chat')) return 'AI Tutoring Session';
    if (path.includes('screener')) return 'Placement Assessment';
    if (path.includes('calculator')) return 'Using Calculator';
    if (path.includes('canvas') || path.includes('whiteboard')) return 'Using Whiteboard';
    if (path.includes('mastery')) return 'Mastery Practice';
    if (path.includes('fluency')) return 'Fact Fluency Practice';
    return 'On platform';
  }

  function getLastMessagePreview() {
    // Get the last student message from the chat
    const messages = document.querySelectorAll('.user-message, .message.user, [data-role="user"]');
    if (messages.length === 0) return '';

    const lastMsg = messages[messages.length - 1];
    const text = lastMsg.textContent || lastMsg.innerText || '';
    return text.substring(0, 100);
  }

  // ─── UI OVERLAYS ──────────────────────────────────────────────────────────

  function showOverlay(message) {
    removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'browser-lock-overlay';
    overlay.innerHTML = `
      <div class="browser-lock-warning">
        <div class="browser-lock-icon"><i class="fas fa-eye"></i></div>
        <h3>Focus Mode Active</h3>
        <p>${escapeHtml(message)}</p>
        <div class="browser-lock-violations">
          Violations: <strong>${lockState.violationCount}</strong>
        </div>
        <button class="browser-lock-dismiss" onclick="this.closest('#browser-lock-overlay').remove()">
          Return to Work
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
    }, 5000);
  }

  function removeOverlay() {
    const existing = document.getElementById('browser-lock-overlay');
    if (existing) existing.remove();
  }

  function showFocusBanner(sessionName) {
    removeFocusBanner();

    const banner = document.createElement('div');
    banner.id = 'browser-lock-banner';
    banner.innerHTML = `
      <i class="fas fa-lock"></i>
      <span><strong>Focus Mode:</strong> ${escapeHtml(sessionName)}</span>
    `;
    document.body.appendChild(banner);
  }

  function removeFocusBanner() {
    const existing = document.getElementById('browser-lock-banner');
    if (existing) existing.remove();
  }

  function showReturnWarning(awaySeconds) {
    if (awaySeconds < 3) return;

    const toast = document.createElement('div');
    toast.className = 'browser-lock-toast';
    toast.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      You were away for ${awaySeconds} second${awaySeconds !== 1 ? 's' : ''}. Your teacher can see this.
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── POLL FOR LOCK STATUS CHANGES ──────────────────────────────────────────

  function schedulePoll() {
    if (lockState.pollTimer) clearTimeout(lockState.pollTimer);
    const interval = Math.min(
      BASE_POLL_INTERVAL * Math.pow(2, lockState.consecutivePollFailures),
      MAX_POLL_INTERVAL
    );
    lockState.pollTimer = setTimeout(async () => {
      await checkLockStatus();
      schedulePoll();
    }, interval);
  }

  // Initial check on page load, then start polling
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkLockStatus();
      schedulePoll();
    });
  } else {
    checkLockStatus();
    schedulePoll();
  }

  // Expose for debugging
  window.__browserLock = lockState;
})();
