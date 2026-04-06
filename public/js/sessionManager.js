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
