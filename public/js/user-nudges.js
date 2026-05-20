// public/js/user-nudges.js
//
// Renders system nudges (starting-point screener re-offer, growth check
// due) on the student dashboard. Fetches from /api/nudges on load,
// renders a small banner per nudge, and POSTs dismissals so the snooze
// cooldown can apply server-side.
//
// Server contract (see utils/userNudges.js):
//   nudge = {
//     type, severity, title, message,
//     action: { label, href },
//     dismissible, autoLaunch, meta
//   }

(function () {
  'use strict';

  const CONTAINER_ID = 'user-nudges-container';

  function csrfHeader() {
    // Reuse the existing CSRF helper if loaded.
    if (typeof window.getCSRFHeaders === 'function') return window.getCSRFHeaders();
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? { 'X-CSRF-Token': meta.getAttribute('content') } : {};
  }

  function severityColor(severity) {
    switch (severity) {
      case 'overdue': return { bg: '#fef2f2', border: '#dc2626', icon: '⚠️' };
      case 'due':     return { bg: '#fffbeb', border: '#d97706', icon: '⏰' };
      default:        return { bg: '#eff6ff', border: '#2563eb', icon: '💡' };
    }
  }

  function buildBanner(nudge) {
    const c = severityColor(nudge.severity);
    const el = document.createElement('div');
    el.className = 'nudge-banner';
    el.dataset.type = nudge.type;
    el.dataset.severity = nudge.severity;
    el.setAttribute('role', 'status');
    el.style.cssText = `
      display: flex; align-items: center; gap: 16px;
      background: ${c.bg};
      border-left: 4px solid ${c.border};
      padding: 14px 18px; border-radius: 8px;
      margin: 0 0 12px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    `;

    const icon = document.createElement('div');
    icon.textContent = c.icon;
    icon.style.cssText = 'font-size: 22px; flex-shrink: 0;';

    const body = document.createElement('div');
    body.style.cssText = 'flex: 1; min-width: 0;';
    const title = document.createElement('div');
    title.textContent = nudge.title;
    title.style.cssText = 'font-weight: 600; color: #1f2937; margin-bottom: 2px;';
    const message = document.createElement('div');
    message.textContent = nudge.message;
    message.style.cssText = 'color: #4b5563; font-size: 14px; line-height: 1.4;';
    body.appendChild(title);
    body.appendChild(message);

    const action = document.createElement('a');
    action.href = nudge.action.href;
    action.textContent = nudge.action.label;
    action.style.cssText = `
      background: ${c.border}; color: white; text-decoration: none;
      padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 14px;
      white-space: nowrap; flex-shrink: 0;
    `;

    el.appendChild(icon);
    el.appendChild(body);
    el.appendChild(action);

    if (nudge.dismissible) {
      const dismiss = document.createElement('button');
      dismiss.setAttribute('aria-label', 'Dismiss');
      dismiss.textContent = '×';
      dismiss.style.cssText = `
        background: transparent; border: none; cursor: pointer;
        color: #6b7280; font-size: 24px; line-height: 1; padding: 4px 8px;
        flex-shrink: 0;
      `;
      dismiss.addEventListener('click', async () => {
        el.remove();
        try {
          await fetch(`/api/nudges/${encodeURIComponent(nudge.type)}/dismiss`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...csrfHeader() },
          });
        } catch (err) {
          console.warn('[nudges] dismiss request failed:', err);
        }
      });
      el.appendChild(dismiss);
    }

    return el;
  }

  function ensureContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;

    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.style.cssText = 'margin: 0 0 1rem 0;';

    // Insert at the top of #dashboard-content, before .dashboard-header
    const dashContent = document.getElementById('dashboard-content');
    if (dashContent) {
      dashContent.insertBefore(container, dashContent.firstChild);
      return container;
    }

    // Fallback: prepend to <main>
    const main = document.querySelector('main') || document.body;
    main.insertBefore(container, main.firstChild);
    return container;
  }

  function render(nudges) {
    if (!Array.isArray(nudges) || nudges.length === 0) return;
    const container = ensureContainer();
    container.innerHTML = '';
    for (const nudge of nudges) {
      container.appendChild(buildBanner(nudge));
    }
  }

  async function loadAndRender() {
    try {
      const res = await fetch('/api/nudges', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      render(data.nudges || []);
    } catch (err) {
      // Non-fatal — the dashboard works fine without nudges.
      console.warn('[nudges] load failed:', err);
    }
  }

  // Expose for callers that already have nudges in hand (e.g. login response
  // can call window.UserNudges.render(loginResponse.nudges) without an
  // extra fetch).
  window.UserNudges = { render, loadAndRender };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAndRender);
  } else {
    loadAndRender();
  }
})();
