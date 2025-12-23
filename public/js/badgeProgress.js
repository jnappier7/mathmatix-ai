/**
 * Badge Progress Widget
 * Shows active badge progress in the chat interface
 */

let badgeProgressState = {
  activeBadge: null,
  checkInterval: null
};

/**
 * Initialize badge progress widget
 */
async function initializeBadgeProgress() {
  // Check for active badge on load
  await checkActiveBadge();

  // Check periodically for updates (every 5 seconds)
  badgeProgressState.checkInterval = setInterval(checkActiveBadge, 5000);
}

/**
 * Check if user has an active badge
 */
async function checkActiveBadge() {
  try {
    // Only show badge widget during mastery mode, not during normal tutoring
    const masteryPhase = sessionStorage.getItem('masteryPhase');
    if (!masteryPhase) {
      // Not in mastery mode - hide widget if it exists
      hideBadgeWidget();
      return;
    }

    const response = await fetch('/api/mastery/active-badge', {
      credentials: 'include'
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();

    if (data.activeBadge) {
      badgeProgressState.activeBadge = data.activeBadge;
      displayBadgeWidget(data.activeBadge);
    } else {
      badgeProgressState.activeBadge = null;
      hideBadgeWidget();
    }

  } catch (error) {
    console.error('Error checking active badge:', error);
  }
}

/**
 * Display the badge progress widget
 */
function displayBadgeWidget(badge) {
  let widget = document.getElementById('badge-progress-widget');
  let wasCollapsed = false;

  // Create widget if it doesn't exist
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'badge-progress-widget';
    widget.className = 'badge-progress-widget';
    document.body.appendChild(widget);
  } else {
    // Preserve collapsed state during updates
    wasCollapsed = widget.classList.contains('collapsed');
  }

  const progressPercent = badge.progress || 0;
  const accuracy = Math.round((badge.currentAccuracy || 0) * 100);
  const meetsRequirements = badge.meetsRequirements;

  widget.innerHTML = `
    <div class="badge-widget-header">
      <div class="badge-widget-title">
        <span class="badge-icon">🏆</span>
        <span class="badge-name">${badge.badgeName}</span>
      </div>
      <button class="badge-widget-close" onclick="toggleBadgeWidget()">
        <i class="fas ${wasCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
      </button>
    </div>

    <div class="badge-widget-content">
      <div class="badge-stat-row">
        <div class="badge-stat">
          <span class="badge-stat-label">Progress</span>
          <span class="badge-stat-value">${badge.problemsCompleted}/${badge.requiredProblems}</span>
        </div>
        <div class="badge-stat">
          <span class="badge-stat-label">Accuracy</span>
          <span class="badge-stat-value ${accuracy >= (badge.requiredAccuracy * 100) ? 'success' : 'warning'}">${accuracy}%</span>
        </div>
      </div>

      <div class="badge-progress-bar">
        <div class="badge-progress-fill" style="width: ${progressPercent}%"></div>
      </div>

      <div class="badge-requirements">
        <span class="requirement-label">Required:</span>
        <span class="requirement-value">${badge.requiredProblems} problems at ${Math.round(badge.requiredAccuracy * 100)}% accuracy</span>
      </div>

      ${meetsRequirements ? `
        <button class="btn-claim-badge" onclick="claimBadge()">
          <i class="fas fa-trophy"></i> Claim Your Badge!
        </button>
      ` : `
        <div class="badge-encouragement">
          ${badge.problemsCompleted < badge.requiredProblems
            ? `Keep going! ${badge.requiredProblems - badge.problemsCompleted} more problem${badge.requiredProblems - badge.problemsCompleted === 1 ? '' : 's'} to go!`
            : `You need ${Math.round(badge.requiredAccuracy * 100)}% accuracy. Keep practicing!`
          }
        </div>
      `}

      <button class="btn-view-badges" onclick="window.location.href='/badge-map.html'">
        View All Badges
      </button>
    </div>
  `;

  // Restore collapsed state after updating content
  if (wasCollapsed) {
    widget.classList.add('collapsed');
  }
}

/**
 * Hide the badge progress widget
 */
function hideBadgeWidget() {
  const widget = document.getElementById('badge-progress-widget');
  if (widget) {
    widget.remove();
  }
}

/**
 * Toggle widget collapsed state
 */
function toggleBadgeWidget() {
  const widget = document.getElementById('badge-progress-widget');
  if (widget) {
    widget.classList.toggle('collapsed');

    // Update icon
    const icon = widget.querySelector('.badge-widget-close i');
    if (widget.classList.contains('collapsed')) {
      icon.className = 'fas fa-chevron-up';
    } else {
      icon.className = 'fas fa-chevron-down';
    }
  }
}

/**
 * Claim badge when requirements are met
 */
async function claimBadge() {
  try {
    const response = await fetch('/api/mastery/complete-badge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Failed to claim badge');
      return;
    }

    const data = await response.json();

    // Show success message
    showBadgeEarnedModal(data);

    // Clear widget
    badgeProgressState.activeBadge = null;
    hideBadgeWidget();

  } catch (error) {
    console.error('Error claiming badge:', error);
    alert('Failed to claim badge. Please try again.');
  }
}

/**
 * Show badge earned celebration modal
 */
function showBadgeEarnedModal(data) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';

  modal.innerHTML = `
    <div class="modal-content badge-earned-modal">
      <div class="badge-celebration">
        <div class="celebration-icon">🎉</div>
        <h1>Badge Earned!</h1>
        <div class="earned-badge-icon">🏆</div>
        <h2>${data.badge}</h2>
        <p class="xp-bonus">+${data.xpBonus} XP</p>
        <p class="badge-count">Total Badges: ${data.totalBadges}</p>

        <div class="celebration-actions">
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove(); window.location.href='/badge-map.html'">
            Choose Next Badge
          </button>
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Continue Chatting
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Remove after 10 seconds if user doesn't click
  setTimeout(() => {
    if (modal.parentNode) {
      modal.remove();
    }
  }, 10000);
}

/**
 * Manually trigger badge progress check (call this after answering a problem)
 */
async function updateBadgeProgress() {
  await checkActiveBadge();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBadgeProgress);
} else {
  initializeBadgeProgress();
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
  window.updateBadgeProgress = updateBadgeProgress;
  window.toggleBadgeWidget = toggleBadgeWidget;
  window.claimBadge = claimBadge;
}
