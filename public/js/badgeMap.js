/**
 * Badge Map Interface
 * Displays available badges organized by skill domain
 * Allows students to select badges to work toward
 */

let state = {
  badges: [],
  currentTheta: 0,
  activeBadge: null,
  currentFilter: 'all',
  domains: {}
};

const domainConfig = {
  'number-sense': {
    name: 'Number Sense',
    icon: '🔢',
    description: 'Understanding numbers and operations',
    color: '#4CAF50'
  },
  'algebra': {
    name: 'Algebra',
    icon: '📐',
    description: 'Expressions, equations, and patterns',
    color: '#2196F3'
  },
  'geometry': {
    name: 'Geometry',
    icon: '📏',
    description: 'Shapes, angles, and spatial reasoning',
    color: '#9C27B0'
  },
  'measurement': {
    name: 'Measurement',
    icon: '📊',
    description: 'Units, conversions, and data',
    color: '#FF9800'
  },
  'statistics': {
    name: 'Statistics & Probability',
    icon: '📈',
    description: 'Data analysis and chance',
    color: '#00BCD4'
  },
  'ratios': {
    name: 'Ratios & Proportions',
    icon: '⚖️',
    description: 'Relationships between quantities',
    color: '#E91E63'
  },
  'challenge': {
    name: 'Challenges',
    icon: '⚡',
    description: 'Speed, streaks, and special achievements',
    color: '#FF5722'
  },
  'meta': {
    name: 'Master Badges',
    icon: '👑',
    description: 'Complete domain mastery achievements',
    color: '#9C27B0'
  }
};

async function initialize() {
  try {
    // Fetch badge data from backend
    const response = await fetch('/api/mastery/available-badges', {
      credentials: 'include'
    });

    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        console.error('Authentication failed - redirecting to login');
        // Clear any stale mastery mode flags
        if (window.StorageUtils) {
          StorageUtils.session.removeItem('masteryModeActive');
          StorageUtils.session.removeItem('masteryPhase');
          StorageUtils.session.removeItem('activeBadgeId');
          StorageUtils.session.removeItem('screenerResults');
        }
        window.location.href = '/login.html';
        return;
      }
      throw new Error('Failed to fetch badges');
    }

    const data = await response.json();
    state.badges = data.badges;
    state.currentTheta = data.currentTheta || 0;
    state.activeBadge = data.activeBadge || null;

    // Organize badges by domain
    organizeBadgesByDomain();

    // Display ability level
    displayAbilityLevel();

    // Render badge map
    renderBadgeMap();

    // Setup filter tabs
    setupFilterTabs();

  } catch (error) {
    console.error('Error initializing badge map:', error);
    showError('Failed to load badge map. Please try again.');
  }
}

function organizeBadgesByDomain() {
  state.domains = {};

  state.badges.forEach(badge => {
    const domain = badge.domain || 'other';
    if (!state.domains[domain]) {
      state.domains[domain] = [];
    }
    state.domains[domain].push(badge);
  });

  // Sort badges within each domain by difficulty
  Object.keys(state.domains).forEach(domain => {
    state.domains[domain].sort((a, b) => {
      const tierOrder = { bronze: 1, silver: 2, gold: 3 };
      return (tierOrder[a.tier] || 0) - (tierOrder[b.tier] || 0);
    });
  });
}

function displayAbilityLevel() {
  const abilityFill = document.getElementById('ability-fill');
  const thetaDisplay = document.getElementById('theta-display');

  // Handle new users who haven't completed screener yet
  if (state.currentTheta === null || state.currentTheta === undefined || isNaN(state.currentTheta)) {
    abilityFill.style.width = '0%';
    thetaDisplay.textContent = 'Complete screener to see your level';
    thetaDisplay.style.fontSize = '14px'; // Make text smaller to fit
    return;
  }

  // Map theta (-3 to +3) to percentage (0% to 100%)
  const percentage = Math.min(100, Math.max(0, ((state.currentTheta + 3) / 6) * 100));

  abilityFill.style.width = `${percentage}%`;
  thetaDisplay.textContent = `θ = ${state.currentTheta.toFixed(1)}`;
  thetaDisplay.style.fontSize = ''; // Reset font size
}

function renderBadgeMap() {
  const content = document.getElementById('badge-content');

  if (Object.keys(state.domains).length === 0) {
    content.innerHTML = `
      <div class="loading">
        <div style="font-size: 48px; margin-bottom: 20px;">🎯</div>
        <p>No badges available yet. Complete the placement screener to unlock badges!</p>
      </div>
    `;
    return;
  }

  let html = '<div class="skill-domains">';

  // Render each domain
  Object.keys(state.domains).forEach(domainKey => {
    const domainInfo = domainConfig[domainKey] || {
      name: domainKey,
      icon: '📚',
      description: 'Math skills',
      color: '#666'
    };

    const badges = state.domains[domainKey];

    // Filter badges based on current filter
    const filteredBadges = badges.filter(badge => {
      if (state.currentFilter === 'all') return true;
      return badge.status === state.currentFilter;
    });

    // Skip domain if no badges match filter
    if (filteredBadges.length === 0) return;

    html += `
      <div class="domain">
        <div class="domain-header">
          <div class="domain-icon" style="color: ${domainInfo.color};">
            ${domainInfo.icon}
          </div>
          <div class="domain-title">
            <h2>${domainInfo.name}</h2>
            <p>${domainInfo.description}</p>
          </div>
        </div>
        <div class="badge-grid">
          ${filteredBadges.map(badge => renderBadgeCard(badge)).join('')}
        </div>
      </div>
    `;
  });

  html += '</div>';
  content.innerHTML = html;

  // Attach click handlers
  attachBadgeClickHandlers();
}

function renderBadgeCard(badge) {
  const isRecommended = badge.recommended || false;
  const progress = badge.progress || 0;

  let statusHTML = '';
  let statusClass = badge.status || 'available';

  switch (statusClass) {
    case 'available':
      statusHTML = '<i class="fas fa-star"></i> Ready to start';
      break;
    case 'locked':
      statusHTML = `<i class="fas fa-lock"></i> Requires θ ≥ ${badge.requiredTheta?.toFixed(1)}`;
      break;
    case 'in-progress':
      statusHTML = `<i class="fas fa-hourglass-half"></i> ${progress}% complete`;
      break;
    case 'completed':
      statusHTML = `<i class="fas fa-check-circle"></i> Mastered!`;
      break;
  }

  const tierEmoji = {
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇',
    platinum: '💎'
  };

  return `
    <div class="badge-card ${statusClass} ${isRecommended ? 'recommended-badge' : ''}"
         data-badge-id="${badge.badgeId}"
         data-status="${statusClass}">
      <div class="badge-tier ${badge.tier}">${tierEmoji[badge.tier] || '🏅'}</div>

      <div class="badge-header">
        <h3 class="badge-name">${badge.name}</h3>
        <p class="badge-skill">${badge.skillName || badge.skillId}</p>
      </div>

      <div class="badge-stats">
        <div class="stat">
          <div class="stat-value">${badge.requiredProblems || 5}</div>
          <div class="stat-label">Problems</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Math.round((badge.requiredAccuracy || 0.8) * 100)}%</div>
          <div class="stat-label">Accuracy</div>
        </div>
      </div>

      <p class="badge-description">${badge.description || 'Master this skill to earn the badge.'}</p>

      <div class="badge-status ${statusClass}">
        ${statusHTML}
      </div>

      ${statusClass === 'in-progress' ? `
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      ` : ''}
    </div>
  `;
}

function attachBadgeClickHandlers() {
  document.querySelectorAll('.badge-card').forEach(card => {
    card.addEventListener('click', () => {
      const badgeId = card.dataset.badgeId;
      const status = card.dataset.status;

      if (status === 'locked') {
        alert('This badge is locked. Improve your ability level to unlock it!');
        return;
      }

      if (status === 'completed') {
        alert('You\'ve already mastered this badge! Choose another to continue your journey.');
        return;
      }

      selectBadge(badgeId);
    });
  });
}

async function selectBadge(badgeId) {
  try {
    // Find the badge
    const badge = state.badges.find(b => b.badgeId === badgeId);
    if (!badge) {
      console.error('Badge not found:', badgeId);
      return;
    }

    // Confirm selection
    const confirmed = confirm(
      `Start working on "${badge.name}"?\n\n` +
      `You'll need to complete ${badge.requiredProblems} problems at ${Math.round((badge.requiredAccuracy || 0.8) * 100)}% accuracy.`
    );

    if (!confirmed) return;

    // Send selection to backend
    const response = await csrfFetch('/api/mastery/select-badge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ badgeId })
    });

    if (!response.ok) {
      throw new Error('Failed to select badge');
    }

    const data = await response.json();

    // Store badge info in sessionStorage
    if (window.StorageUtils) {
      StorageUtils.session.setItem('activeBadgeId', badgeId);
      StorageUtils.session.setItem('masteryPhase', 'badge-earning');
    }

    // Redirect to mastery mode interface to begin badge work
    window.location.href = '/mastery-chat.html';

  } catch (error) {
    console.error('Error selecting badge:', error);
    alert('Failed to select badge. Please try again.');
  }
}

function setupFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update filter
      state.currentFilter = tab.dataset.filter;

      // Re-render
      renderBadgeMap();
    });
  });
}

function showError(message) {
  const content = document.getElementById('badge-content');
  content.innerHTML = `
    <div class="loading">
      <div style="font-size: 48px; margin-bottom: 20px; color: #f44336;">⚠️</div>
      <p>${message}</p>
      <div style="margin-top: 30px; display: flex; gap: 15px; justify-content: center;">
        <button onclick="window.location.reload()" style="padding: 12px 24px; background: #12B3B3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500;">
          Try Again
        </button>
        <button onclick="window.location.href='/chat.html'" style="padding: 12px 24px; background: #666; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500;">
          Back to Chat
        </button>
      </div>
    </div>
  `;
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
