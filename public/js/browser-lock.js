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
