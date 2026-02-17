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
