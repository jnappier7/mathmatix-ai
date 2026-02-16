// modules/session.js
// Session time tracking - heartbeat, visibility, active time

export const sessionTracker = {
    startTime: null,
    totalActiveSeconds: 0,
    lastHeartbeat: null,
    heartbeatInterval: null,
    isPageVisible: true,
    lastVisibilityChange: null
};

/**
 * Initialize session time tracking
 * @param {Function} getCurrentUser - Returns the current user object
 */
export function initSessionTracking(getCurrentUser) {
    sessionTracker.startTime = Date.now();
    sessionTracker.lastHeartbeat = Date.now();
    sessionTracker.lastVisibilityChange = Date.now();

    // Track page visibility (pause timer when tab is inactive)
    document.addEventListener('visibilitychange', () => {
        const now = Date.now();

        if (document.hidden) {
            if (sessionTracker.isPageVisible) {
                const activeSeconds = Math.floor((now - sessionTracker.lastVisibilityChange) / 1000);
                sessionTracker.totalActiveSeconds += activeSeconds;
            }
            sessionTracker.isPageVisible = false;
        } else {
            sessionTracker.isPageVisible = true;
            sessionTracker.lastVisibilityChange = now;
        }
    });

    // Send heartbeat every 30 seconds
    sessionTracker.heartbeatInterval = setInterval(() => {
        sendTimeHeartbeat(getCurrentUser);
    }, 30000);

    // Send final time on page unload
    window.addEventListener('beforeunload', () => {
        sendTimeHeartbeat(getCurrentUser, true);
    });

    // Also try pagehide for mobile browsers
    window.addEventListener('pagehide', () => {
        sendTimeHeartbeat(getCurrentUser, true);
    });
}

export function getActiveSeconds() {
    const now = Date.now();
    let totalSeconds = sessionTracker.totalActiveSeconds;

    if (sessionTracker.isPageVisible && sessionTracker.lastVisibilityChange) {
        const currentActiveSeconds = Math.floor((now - sessionTracker.lastVisibilityChange) / 1000);
        totalSeconds += currentActiveSeconds;
    }

    return totalSeconds;
}

export async function sendTimeHeartbeat(getCurrentUser, isFinal = false) {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser._id) return;

    const activeSeconds = getActiveSeconds();

    // Only send if we have at least 5 seconds of activity (avoid spam)
    if (activeSeconds < 5 && !isFinal) return;

    try {
        const payload = {
            activeSeconds: activeSeconds
        };

        if (isFinal) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/chat/track-time', blob);
        } else {
            await csrfFetch('/api/chat/track-time', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });
        }

        // Reset the counter after successful send
        sessionTracker.totalActiveSeconds = 0;
        sessionTracker.lastVisibilityChange = Date.now();
        sessionTracker.lastHeartbeat = Date.now();

    } catch (error) {
        console.error('Failed to send time tracking heartbeat:', error);
    }
}
