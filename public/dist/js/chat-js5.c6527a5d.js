/* --- /js/visualTabTagHandler.js --- */
/* ============================================================
   visualTabTagHandler.js — execute server-emitted <GRAPH> and
   <TILES> commands against the workspace right slot (Phase D).

   The chat pipeline ships a `visualTabCommands` array on the SSE
   `complete` event. Each command is one of:
     { tab: 'graph', fn: 'x^2 - 4', caption?: '...' }
     { tab: 'tiles', expression?: '2x + 3' }

   GRAPH switches the workspace to the Graph tab and plots the
   function (via window.MathWorkspace.showGraph), so the student
   can drag, zoom, and explore. The board-timeline <BOARD action=
   "graph"/> drops a static-ish card inside the board; this is
   the interactive version.

   TILES opens the algebra-tiles workspace (window.openAlgebraTiles).
   The expression= attribute is carried through for a future
   tile-layout-from-expression API; for now the legacy
   [ALGEBRA_TILES:expr] inline syntax handles seeded layouts and
   <TILES/> just launches the workspace.

   Multiple commands stagger so back-to-back tab switches don't
   whipsaw the workspace.
   ============================================================ */

(function () {
    'use strict';

    var STAGGER_MS = 400;

    function executeOne(command) {
        if (!command || typeof command.tab !== 'string') return;

        try {
            if (command.tab === 'graph') {
                if (!command.fn) return;
                if (!window.MathWorkspace || typeof window.MathWorkspace.showGraph !== 'function') {
                    console.warn('[VisualTabTagHandler] MathWorkspace.showGraph not available');
                    return;
                }
                var opts = {};
                if (command.caption) opts.caption = command.caption;
                window.MathWorkspace.showGraph(command.fn, opts);
                return;
            }

            if (command.tab === 'tiles') {
                if (typeof window.openAlgebraTiles === 'function') {
                    window.openAlgebraTiles();
                } else if (window.MathWorkspace && typeof window.MathWorkspace.showTool === 'function') {
                    // Fallback: switch to the Tiles launcher tab if the
                    // standalone workspace isn't bootstrapped yet.
                    window.MathWorkspace.showTool('tiles');
                } else {
                    console.warn('[VisualTabTagHandler] Tiles launcher not available');
                }
                // expression= is captured but not yet applied — the
                // standalone tiles workspace doesn't accept a seed
                // expression. Legacy [ALGEBRA_TILES:expr] handles that
                // path inside the chat bubble.
                return;
            }

            console.warn('[VisualTabTagHandler] Unknown tab', command.tab);
        } catch (err) {
            console.error('[VisualTabTagHandler] Failed to execute', command, err);
        }
    }

    /**
     * Run a batch of visual-tab commands. The pipeline caps the batch
     * at 2 so a single reply can't whipsaw through tabs; stagger lets
     * each switch settle visually before the next one.
     */
    function executeVisualTabCommands(commands) {
        if (!Array.isArray(commands) || commands.length === 0) return;
        commands.forEach(function (cmd, i) {
            setTimeout(function () { executeOne(cmd); }, i * STAGGER_MS);
        });
    }

    window.VisualTabTagHandler = { executeVisualTabCommands: executeVisualTabCommands };
})();

;
/* --- /js/dailyQuests.js --- */
// dailyQuests.js - Frontend for Daily Quest System

class DailyQuestManager {
  constructor() {
    this.quests = [];
    this.streak = 0;
    this.longestStreak = 0;
    this.totalCompleted = 0;
    this.piDay = false;
    this.piDayLessons = [];
  }

  async loadQuests() {
    try {
      const response = await fetch('/api/daily-quests');
      const data = await response.json();

      if (data.success) {
        this.quests = data.quests;
        this.streak = data.streak;
        this.longestStreak = data.longestStreak;
        this.totalCompleted = data.totalCompleted;
        this.piDay = data.piDay || false;

        // Load Pi Day minilessons if it's Pi Day
        if (this.piDay) {
          await this.loadPiDayLessons();
        }

        this.render();
      }
    } catch (error) {
      console.error('Error loading daily quests:', error);
    }
  }

  async loadPiDayLessons() {
    try {
      const response = await fetch('/api/daily-quests/pi-day-lessons');
      const data = await response.json();
      if (data.success && data.active) {
        this.piDayLessons = data.lessons || [];
      }
    } catch (error) {
      console.error('Error loading Pi Day lessons:', error);
    }
  }

  async updateProgress(action, data) {
    try {
      const response = await csrfFetch('/api/daily-quests/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data })
      });

      const result = await response.json();

      if (result.success) {
        this.quests = result.quests;
        this.streak = result.streak;
        this.render();

        // Show celebration if quests were completed
        if (result.completedQuests && result.completedQuests.length > 0) {
          result.completedQuests.forEach(quest => {
            this.showQuestCompletion(quest);
          });
        }
      }
    } catch (error) {
      console.error('Error updating quest progress:', error);
    }
  }

  render() {
    const container = document.getElementById('dailyQuestsContainer');
    if (!container) return;

    const allCompleted = this.quests.every(q => q.completed);
    const completedCount = this.quests.filter(q => q.completed).length;

    const questTitle = this.piDay ? 'Pi Day Quests' : 'Daily Quests';
    const questIcon = this.piDay ? '\u03C0' : '\uD83D\uDCCB';
    const piDayBanner = this.piDay ? `
          <div style="background:linear-gradient(135deg,#ff6b9d22,#c850c022);border:1px solid #ff6b9d44;border-radius:8px;padding:8px 12px;margin-bottom:12px;text-align:center;">
            <div style="font-weight:700;color:#ff6b9d;">Happy Pi Day! 3.14x XP Multiplier Active</div>
            <div style="font-size:12px;color:#888;">Complete all quests for bonus rewards</div>
          </div>` : '';

    container.innerHTML = `
      <div class="daily-quests-widget${this.piDay ? ' pi-day-theme' : ''}">
        <!-- Header -->
        <div class="quest-header">
          <h3>
            <span class="quest-icon">${questIcon}</span>
            ${questTitle}
            <span class="quest-counter">${completedCount}/${this.quests.length}</span>
          </h3>

          <div class="streak-badge ${this.streak > 0 ? 'active' : ''}">
            <span class="streak-icon">🔥</span>
            <span class="streak-number">${this.streak}</span>
            <span class="streak-label">day${this.streak !== 1 ? 's' : ''}</span>
          </div>
        </div>

        ${piDayBanner}

        ${allCompleted ? `
          <div class="all-quests-complete">
            <div class="completion-celebration">
              <div class="celebration-icon">🎉</div>
              <div class="celebration-text">
                <h4>All Quests Complete!</h4>
                <p>Amazing work today! Come back tomorrow for new challenges.</p>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Quest List -->
        <div class="quest-list">
          ${this.quests.map(quest => this.renderQuest(quest)).join('')}
        </div>

        ${this.piDay && this.piDayLessons.length > 0 ? `
          <div class="pi-day-lessons">
            <div style="font-weight:700;font-size:13px;margin:12px 0 8px;color:#ff6b9d;">
              \u03C0 Mini-Lessons
            </div>
            <div style="font-size:12px;color:#888;margin-bottom:8px;">Tap a topic to learn something amazing about pi!</div>
            ${this.piDayLessons.map(lesson => `
              <button class="pi-lesson-btn" data-prompt="${lesson.prompt.replace(/"/g, '&quot;')}"
                style="width:100%;padding:8px 12px;margin-bottom:4px;background:linear-gradient(135deg,#ff6b9d11,#c850c011);border:1px solid #ff6b9d33;border-radius:8px;cursor:pointer;text-align:left;font-size:13px;color:inherit;transition:all 0.15s;">
                <span style="margin-right:6px;">\u03C0</span>${lesson.title}
                ${lesson.gradeBand !== 'all' ? `<span style="font-size:10px;color:#888;margin-left:6px;">(Grades ${lesson.gradeBand})</span>` : ''}
              </button>
            `).join('')}
          </div>
        ` : ''}

        ${this.streak > 1 ? `
          <div class="streak-info">
            <div class="streak-message">
              <strong>${this.streak} day streak!</strong>
              ${this.streak === this.longestStreak ? '🏆 Personal best!' : ''}
            </div>
            <div class="streak-bonus">
              Bonus: +${Math.round(this.streak * 1)}% XP
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this.attachListeners();
  }

  renderQuest(quest) {
    const progress = Math.min((quest.progress / quest.targetCount) * 100, 100);
    const isCompleted = quest.completed;

    return `
      <div class="quest-item ${isCompleted ? 'completed' : ''}" data-quest-id="${quest.id}">
        <div class="quest-checkbox">
          ${isCompleted ? '✅' : '⬜'}
        </div>

        <div class="quest-content">
          <div class="quest-title">
            <span class="quest-emoji">${quest.icon}</span>
            <span class="quest-name">${quest.name}</span>
          </div>

          <div class="quest-description">${quest.description}</div>

          <div class="quest-progress-bar">
            <div class="progress-fill" style="width: ${progress}%">
              <span class="progress-text">${quest.progress}/${quest.targetCount}</span>
            </div>
          </div>
        </div>

        <div class="quest-reward">
          <span class="xp-badge">${quest.bonusMultiplier > 1 ? `+${Math.round(quest.xpReward * quest.bonusMultiplier)} XP` : `+${quest.xpReward} XP`}</span>
          ${quest.piDay ? '<span style="font-size:10px;color:#ff6b9d;display:block;">3.14x</span>' : ''}
        </div>
      </div>
    `;
  }

  renderCompact() {
    // Compact version for sidebar/dashboard
    const container = document.getElementById('dailyQuestsCompact');
    if (!container) return;

    const completedCount = this.quests.filter(q => q.completed).length;

    container.innerHTML = `
      <div class="quests-compact">
        <div class="compact-header">
          <span>${this.piDay ? '\u03C0 Pi Day' : '\uD83D\uDCCB Daily'}: ${completedCount}/${this.quests.length}</span>
          <span class="streak-compact">🔥 ${this.streak}</span>
        </div>
        <div class="compact-progress">
          <div class="compact-bar">
            <div class="compact-fill" style="width: ${(completedCount / this.quests.length) * 100}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  showQuestCompletion(quest) {
    // Create celebration notification
    const notification = document.createElement('div');
    notification.className = 'quest-completion-notification';
    notification.innerHTML = `
      <div class="completion-card">
        <div class="completion-icon">✨</div>
        <div class="completion-content">
          <h4>Quest Complete!</h4>
          <p>${quest.icon} ${quest.name}</p>
          <div class="completion-reward">+${quest.xpEarned} XP${quest.coinsEarned > 0 ? ` · +${quest.coinsEarned} 🪙` : ''}</div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);

    // Play sound effect if available
    if (typeof playSound === 'function') {
      playSound('quest-complete');
    }
  }

  attachListeners() {
    // Click to expand quest details
    const questItems = document.querySelectorAll('.quest-item');
    questItems.forEach(item => {
      item.addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    });

    // Pi Day minilesson buttons — send prompt to the AI tutor
    const lessonBtns = document.querySelectorAll('.pi-lesson-btn');
    lessonBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const prompt = btn.getAttribute('data-prompt');
        if (prompt && typeof window.sendMessage === 'function') {
          window.sendMessage(prompt);
        } else if (prompt) {
          // Fallback: populate the chat input
          const input = document.getElementById('user-input') || document.getElementById('chat-input');
          if (input) {
            input.value = prompt;
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      });
    });
  }

  // Integration methods for mastery mode events
  onProblemSolved(correct, skillId, timeTaken = 0) {
    this.updateProgress('problemSolved', {
      correct,
      skillId,
      timeTaken
    });
  }

  onSkillPracticed(skillId) {
    this.updateProgress('skillPracticed', { skillId });
  }

  onMasteryProgress(masteryGained) {
    this.updateProgress('masteryProgress', { masteryGained });
  }

  onSessionComplete(accuracy, problemsCorrect) {
    this.updateProgress('sessionComplete', { accuracy, problemsCorrect });
  }

  onNewSkillStarted(skillId) {
    this.updateProgress('newSkillStarted', { skillId });
  }
}

// Global instance
const dailyQuestManager = new DailyQuestManager();

// Auto-load on page load
document.addEventListener('DOMContentLoaded', () => {
  dailyQuestManager.loadQuests();
});

;
/* --- /js/weeklyChallenges.js --- */
// weeklyChallenges.js - Weekly Challenges Frontend

class WeeklyChallengeManager {
  constructor() {
    this.challenges = [];
    this.weekStart = null;
    this.weekEnd = null;
    this.hoursRemaining = 0;
    this.daysRemaining = 0;
  }

  async loadChallenges() {
    try {
      const response = await fetch('/api/weekly-challenges');
      const data = await response.json();

      if (data.success) {
        this.challenges = data.challenges;
        this.weekStart = new Date(data.weekStart);
        this.weekEnd = new Date(data.weekEnd);
        this.hoursRemaining = data.hoursRemaining;
        this.daysRemaining = data.daysRemaining;
        this.completedCount = data.completedCount;
        this.totalCount = data.totalCount;
        this.completedAllTime = data.completedAllTime;

        this.render();
      }
    } catch (error) {
      console.error('Error loading weekly challenges:', error);
    }
  }

  async updateProgress(event, data) {
    try {
      const response = await csrfFetch('/api/weekly-challenges/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data })
      });

      const result = await response.json();

      if (result.success) {
        this.challenges = result.challenges;
        this.render();

        // Show celebration if challenges were completed
        if (result.completedChallenges && result.completedChallenges.length > 0) {
          result.completedChallenges.forEach(challenge => {
            this.showChallengeCompletion(challenge);
          });
        }
      }
    } catch (error) {
      console.error('Error updating weekly challenges:', error);
    }
  }

  render() {
    const container = document.getElementById('weeklyChallengesContainer');
    if (!container) return;

    const allCompleted = this.challenges.every(c => c.completed);
    const difficultyColors = {
      'easy': '#4caf50',
      'medium': '#ff9800',
      'hard': '#f44336'
    };

    container.innerHTML = `
      <div class="weekly-challenges-widget">
        <!-- Header -->
        <div class="weekly-header">
          <div class="header-content">
            <h3>
              <span class="weekly-icon">🏆</span>
              Weekly Challenges
            </h3>
            <div class="weekly-timer ${this.daysRemaining <= 1 ? 'urgent' : ''}">
              <span class="timer-icon">⏰</span>
              <span class="timer-text">
                ${this.daysRemaining > 0
                  ? `${this.daysRemaining} day${this.daysRemaining !== 1 ? 's' : ''} left`
                  : `${this.hoursRemaining} hours left`
                }
              </span>
            </div>
          </div>

          <div class="progress-summary">
            <div class="summary-text">
              ${this.completedCount}/${this.totalCount} completed
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${(this.completedCount / this.totalCount) * 100}%"></div>
            </div>
          </div>
        </div>

        ${allCompleted ? `
          <div class="all-challenges-complete">
            <div class="completion-celebration-weekly">
              <div class="celebration-icon-lg">🎊</div>
              <div class="celebration-text-lg">
                <h4>All Weekly Challenges Complete!</h4>
                <p>You've conquered this week! Check back Monday for new challenges.</p>
                <div class="lifetime-stat">
                  <strong>${this.completedAllTime}</strong> total weekly challenges completed
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Challenges List -->
        <div class="challenges-list">
          ${this.challenges.map(challenge => this.renderChallenge(challenge, difficultyColors)).join('')}
        </div>

        <!-- Rewards Preview -->
        <div class="rewards-preview">
          <h4>🎁 Special Rewards</h4>
          <div class="rewards-grid">
            ${this.challenges.map(challenge => `
              <div class="reward-item ${challenge.completed ? 'earned' : ''}">
                <span class="reward-icon">${challenge.icon}</span>
                <span class="reward-text">${challenge.specialReward}</span>
                ${challenge.completed ? '<span class="reward-check">✅</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderChallenge(challenge, difficultyColors) {
    const progress = Math.min((challenge.progress / challenge.targetCount) * 100, 100);
    const isCompleted = challenge.completed;
    const difficultyColor = difficultyColors[challenge.difficulty] || '#888';

    return `
      <div class="weekly-challenge-item ${isCompleted ? 'completed' : ''}" data-challenge-id="${challenge.id}">
        <div class="challenge-badge">
          <div class="challenge-icon">${challenge.icon}</div>
          <div class="difficulty-indicator" style="background: ${difficultyColor}">
            ${challenge.difficulty}
          </div>
        </div>

        <div class="challenge-content">
          <div class="challenge-title-row">
            <h4 class="challenge-name">${challenge.name}</h4>
            ${isCompleted ? '<span class="completion-badge">✓ DONE</span>' : ''}
          </div>

          <p class="challenge-description">${challenge.description}</p>

          <div class="challenge-progress">
            <div class="progress-info">
              <span class="progress-current">${challenge.progress}</span>
              <span class="progress-separator">/</span>
              <span class="progress-total">${challenge.targetCount}</span>
            </div>
            <div class="challenge-progress-bar">
              <div class="challenge-progress-fill" style="width: ${progress}%; background: ${difficultyColor}">
              </div>
            </div>
          </div>
        </div>

        <div class="challenge-reward">
          <div class="xp-reward">+${challenge.xpReward} XP</div>
          <div class="special-reward-icon">🎁</div>
        </div>
      </div>
    `;
  }

  renderCompact() {
    // Compact version for sidebar
    const container = document.getElementById('weeklyChallengesCompact');
    if (!container) return;

    const completedCount = this.challenges.filter(c => c.completed).length;

    container.innerHTML = `
      <div class="challenges-compact">
        <div class="compact-header-weekly">
          <span>🏆 Weekly: ${completedCount}/${this.challenges.length}</span>
          <span class="days-left">${this.daysRemaining}d left</span>
        </div>
        <div class="compact-progress-weekly">
          <div class="compact-bar-weekly">
            <div class="compact-fill-weekly" style="width: ${(completedCount / this.challenges.length) * 100}%"></div>
          </div>
        </div>
      </div>
    `;
  }

  showChallengeCompletion(challenge) {
    // Create celebration notification
    const notification = document.createElement('div');
    notification.className = 'challenge-completion-notification';
    notification.innerHTML = `
      <div class="completion-card-weekly">
        <div class="completion-icon-animated">🏆</div>
        <div class="completion-content-weekly">
          <h4>Weekly Challenge Complete!</h4>
          <p>${challenge.icon} ${challenge.name}</p>
          <div class="completion-rewards">
            <div>+${challenge.xpEarned} XP</div>
            <div>🎁 ${challenge.specialReward}</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);

    // Remove after 4 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 4000);

    // Play sound effect if available
    if (typeof playSound === 'function') {
      playSound('challenge-complete');
    }
  }

  // Integration methods for mastery mode events
  onSkillMastered(skillId) {
    this.updateProgress('skillMastered', { skillId });
  }

  onProblemSolved(correct, timeTaken = 0) {
    this.updateProgress('problemSolved', { correct, timeTaken });
  }

  onDailyQuestCompleted(allQuestsCompleted) {
    this.updateProgress('dailyQuestCompleted', { allQuestsCompleted });
  }

  onDomainPracticed(domain) {
    this.updateProgress('domainPracticed', { domain });
  }

  onThetaImprovement(thetaGain) {
    this.updateProgress('thetaImprovement', { thetaGain });
  }

  onPeerHelped(peerId) {
    this.updateProgress('peerHelped', { peerId });
  }
}

// Global instance
const weeklyChallengeManager = new WeeklyChallengeManager();

// Auto-load on page load
document.addEventListener('DOMContentLoaded', () => {
  weeklyChallengeManager.loadChallenges();
});

;
/* --- /js/engagement-widgets.js --- */
/**
 * Engagement Widgets - XP Feed, Streak Counter, Quest Tracker, Badge Celebrations
 * Makes the existing quest/badge/XP systems visible and engaging
 */

// Session tracking
let sessionStats = {
    xpEarned: 0,
    problemsAttempted: 0,
    problemsCorrect: 0,
    currentStreak: 0,
    longestStreak: 0
};

// ============================================
// 1. LIVE XP FEED
// ============================================

/**
 * Show XP notification in live feed
 * @param {number} amount - XP amount
 * @param {string} reason - Reason for XP (e.g., "Aha Moment", "Great Persistence")
 */
window.showXpNotification = function(amount, reason) {
    const feed = document.getElementById('xp-feed');
    if (!feed) return;

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'xp-notification';

    // Add special class based on reason
    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes('aha')) {
        notification.classList.add('xp-aha-moment');
    } else if (reasonLower.includes('persist') || reasonLower.includes('resilien')) {
        notification.classList.add('xp-persistence');
    } else if (reasonLower.includes('reason') || reasonLower.includes('explain')) {
        notification.classList.add('xp-reasoning');
    } else if (reasonLower.includes('streak')) {
        notification.classList.add('xp-streak');
    }

    notification.innerHTML = `
        <span class="xp-notification-amount">+${amount} XP</span>
        <span class="xp-notification-reason">${reason}</span>
    `;

    // Add to feed
    feed.appendChild(notification);

    // Update session stats
    sessionStats.xpEarned += amount;
    updateSessionStats();

    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);

    // Limit to 5 notifications max
    while (feed.children.length > 5) {
        feed.firstChild.remove();
    }
};

// ============================================
// 2. STREAK COUNTER
// ============================================

/**
 * Update streak counter
 * @param {number} streak - Current streak count
 */
window.updateStreakCounter = function(streak) {
    const counter = document.getElementById('streak-counter');
    const numberEl = counter?.querySelector('.streak-number');
    const multiplierEl = counter?.querySelector('.streak-multiplier');

    // Phase C: shake whenever the streak actually goes UP (not on reset,
    // not on a no-op refresh). The shake lands on every visible streak
    // chip — legacy #streak-counter, mobile poster topbar pill .mpc-streak,
    // and desktop header chip #cr-streak-pill — via triggerStreakShake().
    const previousStreak = sessionStats.currentStreak || 0;
    const isIncrement = streak > previousStreak;

    if (!counter || !numberEl) {
        // Legacy counter element isn't on this page (e.g. chat-redesign
        // shell hides it). Still fire the shake for the chips that ARE
        // visible, then update the in-memory tally and return.
        if (isIncrement && typeof window.triggerStreakShake === 'function') {
            window.triggerStreakShake();
        }
        sessionStats.currentStreak = streak;
        if (streak > sessionStats.longestStreak) {
            sessionStats.longestStreak = streak;
        }
        return;
    }

    sessionStats.currentStreak = streak;
    if (streak > sessionStats.longestStreak) {
        sessionStats.longestStreak = streak;
    }

    if (streak > 0) {
        counter.style.display = 'flex';
        numberEl.textContent = streak;

        // Calculate multiplier (1.1x per streak, max 3x)
        const multiplier = Math.min(1 + (streak * 0.1), 3.0);
        if (multiplierEl) {
            multiplierEl.textContent = `${multiplier.toFixed(1)}x`;
        }

        if (isIncrement && typeof window.triggerStreakShake === 'function') {
            window.triggerStreakShake();
        }

        // Special animations at milestones
        if (streak === 5 || streak === 10 || streak === 15) {
            counter.style.animation = 'none';
            setTimeout(() => {
                counter.style.animation = 'streakPulse 2s ease-in-out infinite';
            }, 10);

            // Extra confetti at milestones
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 50,
                    spread: 60,
                    origin: { y: 0.8 },
                    colors: ['#FF6B6B', '#FFD93D', '#FFA500']
                });
            }
        }
    } else {
        counter.style.display = 'none';
    }
};

/**
 * Phase C — briefly shake all visible streak chips.
 *
 * Three streak surfaces coexist depending on which shell the chat
 * page is rendering: the legacy #streak-counter, the mobile
 * poster-chat hybrid's topbar pill (.mpc-streak), and the
 * chat-redesign desktop header chip (#cr-streak-pill). They're all
 * downstream of the same drawer value, but each owns its own paint.
 * This helper shakes whichever ones exist on the page without
 * requiring per-shell wiring.
 *
 * Idempotent: re-adding the class while it's already on does nothing
 * unless we first remove it. We restart the animation by toggling the
 * class via reflow so back-to-back increments still play.
 */
let _lastStreakShakeAt = 0;
window.triggerStreakShake = function () {
    // Dedupe rapid re-triggers (updateStreakCounter + the source
    // MutationObserver below can both fire on the same increment).
    // 200ms is well under the 650ms animation, so a real second
    // increment a moment later still plays its own shake.
    const now = Date.now();
    if (now - _lastStreakShakeAt < 200) return;
    _lastStreakShakeAt = now;

    const selectors = ['#streak-counter', '.mpc-streak', '#cr-streak-pill'];
    selectors.forEach(function (sel) {
        const els = document.querySelectorAll(sel);
        els.forEach(function (el) {
            el.classList.remove('cr-streak-shake');
            // Force a reflow so removing+re-adding the class restarts
            // the keyframe animation even if it was already running.
            void el.offsetWidth;
            el.classList.add('cr-streak-shake');
            setTimeout(function () {
                el.classList.remove('cr-streak-shake');
            }, 650);
        });
    });
};

// Mirror-path watcher: some streak increments arrive via the sidebar
// updating #msb-streak (the cross-shell source value) without ever
// calling updateStreakCounter. Watch that element directly so the
// shake fires regardless of which write path was taken.
(function watchStreakSource() {
    function attach() {
        const src = document.getElementById('msb-streak');
        if (!src) {
            // The source element isn't mounted yet (chat shell loads
            // async). Re-try once after DOM is ready, then give up —
            // some pages just don't have a streak source.
            return false;
        }
        let lastVal = parseInt((src.textContent || '0').replace(/\D/g, ''), 10) || 0;
        new MutationObserver(function () {
            const v = parseInt((src.textContent || '0').replace(/\D/g, ''), 10) || 0;
            if (v > lastVal && typeof window.triggerStreakShake === 'function') {
                window.triggerStreakShake();
            }
            lastVal = v;
        }).observe(src, { childList: true, characterData: true, subtree: true });
        return true;
    }
    if (typeof document === 'undefined') return;
    if (!attach()) {
        // Wait for DOMContentLoaded, try once more, then give up.
        document.addEventListener('DOMContentLoaded', attach, { once: true });
    }
})();

/**
 * Reset streak (called when student gets answer wrong)
 */
window.resetStreak = function() {
    updateStreakCounter(0);
};

// ============================================
// 3. SESSION STATS BAR
// ============================================

/**
 * Update session stats display
 */
function updateSessionStats() {
    const xpEl = document.getElementById('session-xp');
    const accuracyEl = document.getElementById('session-accuracy');
    const problemsEl = document.getElementById('session-problems');

    if (xpEl) xpEl.textContent = sessionStats.xpEarned;

    if (accuracyEl && sessionStats.problemsAttempted > 0) {
        const accuracy = Math.round((sessionStats.problemsCorrect / sessionStats.problemsAttempted) * 100);
        accuracyEl.textContent = `${accuracy}%`;
        accuracyEl.style.color = accuracy >= 80 ? '#4CAF50' : accuracy >= 60 ? '#FFA500' : '#FF6B6B';
    }

    if (problemsEl) {
        problemsEl.textContent = `${sessionStats.problemsCorrect}/${sessionStats.problemsAttempted}`;
    }

    // Sync to mobile drawer
    const drawerXpEl = document.getElementById('drawer-session-xp');
    const drawerAccuracyEl = document.getElementById('drawer-session-accuracy');
    const drawerProblemsEl = document.getElementById('drawer-session-problems');

    if (drawerXpEl) drawerXpEl.textContent = sessionStats.xpEarned;

    if (drawerAccuracyEl && sessionStats.problemsAttempted > 0) {
        const accuracy = Math.round((sessionStats.problemsCorrect / sessionStats.problemsAttempted) * 100);
        drawerAccuracyEl.textContent = `${accuracy}%`;
        drawerAccuracyEl.style.color = accuracy >= 80 ? '#4CAF50' : accuracy >= 60 ? '#FFA500' : '#FF6B6B';
    }

    if (drawerProblemsEl) {
        drawerProblemsEl.textContent = `${sessionStats.problemsCorrect}/${sessionStats.problemsAttempted}`;
    }
}

/**
 * Track problem attempt
 * @param {boolean} correct - Whether answer was correct
 */
window.trackProblemAttempt = function(correct) {
    sessionStats.problemsAttempted++;
    if (correct) {
        sessionStats.problemsCorrect++;
        sessionStats.currentStreak++;
        updateStreakCounter(sessionStats.currentStreak);
    } else {
        // Don't break streak immediately - show warning first
        if (sessionStats.currentStreak > 0) {
            showStreakWarning();
        }
        sessionStats.currentStreak = 0;
        updateStreakCounter(0);
    }
    updateSessionStats();
};

/**
 * Show warning when streak is about to break
 * Gives student a chance to contest if AI misjudged
 */
function showStreakWarning() {
    const counter = document.getElementById('streak-counter');
    if (!counter) return;

    // Flash red briefly as warning
    const originalBg = counter.style.background;
    counter.style.background = 'linear-gradient(135deg, #FF6B6B 0%, #FF3B3B 100%)';
    counter.style.transform = 'translateX(-50%) scale(0.9)';

    setTimeout(() => {
        counter.style.background = originalBg;
        counter.style.transform = 'translateX(-50%) scale(1)';
    }, 600);
}

/**
 * Restore last streak (undo incorrect evaluation)
 * Can be called if student contests the AI's judgment
 */
window.restoreStreak = function(streakValue) {
    sessionStats.currentStreak = streakValue;
    updateStreakCounter(streakValue);

    // Show notification
    if (typeof window.showXpNotification === 'function') {
        window.showXpNotification(0, '🔥 Streak Restored!');
    }
};

// ============================================
// 4. QUEST TRACKER
// ============================================

/**
 * Render daily quests in sidebar
 * @param {Array} quests - Array of quest objects
 */
window.renderDailyQuests = function(quests) {
    const container = document.getElementById('daily-quests-container');
    if (!container || !quests || quests.length === 0) return;

    const questsHTML = quests.map(quest => {
        const progressPercent = quest.targetCount > 0 ? Math.min((quest.progress / quest.targetCount) * 100, 100) : 0;
        return `
        <div class="quest-item ${quest.completed ? 'completed' : ''}">
            <div class="quest-name">${quest.name || quest.type || quest.title}</div>
            <div class="quest-description">${quest.description || getQuestDescription(quest.name)}</div>
            <div class="quest-progress-bar">
                <div class="quest-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="quest-progress-text">
                <span>${quest.progress || 0}/${quest.targetCount || 0}</span>
                <span class="quest-xp-reward">+${quest.xpReward || 50} XP</span>
            </div>
        </div>
    `}).join('');

    container.innerHTML = questsHTML;

    // Sync to mobile drawer
    const drawerContainer = document.getElementById('drawer-daily-quests-container');
    if (drawerContainer) {
        drawerContainer.innerHTML = questsHTML;
    }
};

/**
 * Render weekly challenges in sidebar
 * @param {Array} challenges - Array of challenge objects
 */
window.renderWeeklyChallenges = function(challenges) {
    const container = document.getElementById('weekly-challenges-container');
    if (!container || !challenges || challenges.length === 0) return;

    const challengesHTML = challenges.map(challenge => {
        const progressPercent = challenge.targetCount > 0 ? Math.min((challenge.progress / challenge.targetCount) * 100, 100) : 0;
        return `
        <div class="quest-item ${challenge.completed ? 'completed' : ''}">
            <div class="quest-name">⭐ ${challenge.name || challenge.type || challenge.title}</div>
            <div class="quest-description">${challenge.description || getQuestDescription(challenge.name)}</div>
            <div class="quest-progress-bar">
                <div class="quest-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="quest-progress-text">
                <span>${challenge.progress || 0}/${challenge.targetCount || 0}</span>
                <span class="quest-xp-reward">+${challenge.xpReward || 300} XP</span>
            </div>
        </div>
    `}).join('');

    container.innerHTML = challengesHTML;

    // Sync to mobile drawer
    const drawerContainer = document.getElementById('drawer-weekly-challenges-container');
    if (drawerContainer) {
        drawerContainer.innerHTML = challengesHTML;
    }
};

/**
 * Get quest description by type
 */
function getQuestDescription(type) {
    const descriptions = {
        'Problem Solver': 'Solve problems correctly',
        'Skill Builder': 'Practice different skills',
        'Streak Keeper': 'Maintain daily practice',
        'Mastery Hunter': 'Gain mastery on any skill',
        'Accuracy Ace': 'Maintain high accuracy',
        'Speedster': 'Solve problems quickly',
        'Perfectionist': 'Get problems correct in a row',
        'Explorer': 'Try a new skill',
        'Skill Master': 'Master new skills this week',
        'Accuracy Champion': 'Maintain weekly accuracy',
        'Math Marathoner': 'Solve many problems',
        'Perfect Week': 'Complete all daily quests',
        'Diverse Learner': 'Practice across domains',
        'Weekly Speedster': 'Solve problems under 1 minute',
        'Growth Mindset': 'Improve your ability score',
        'Helpful Helper': 'Help classmates via peer tutoring'
    };
    return descriptions[type] || 'Complete this challenge';
}

// ============================================
// 5. BADGE CELEBRATION MODAL
// ============================================

/**
 * Show badge unlock celebration
 * @param {Object} badge - Badge object with name, description, xpReward, icon
 */
window.showBadgeCelebration = function(badge) {
    const modal = document.getElementById('badge-celebration-modal');
    const iconEl = document.getElementById('badge-icon');
    const titleEl = document.getElementById('badge-title');
    const nameEl = document.getElementById('badge-name');
    const descEl = document.getElementById('badge-description');
    const xpEl = document.getElementById('badge-xp-reward');

    if (!modal) return;

    // Set badge icon
    if (iconEl) {
        iconEl.className = `fas ${badge.icon || 'fa-trophy'} badge-icon`;
    }

    // Set badge details
    if (titleEl) titleEl.textContent = 'NEW BADGE!';
    if (nameEl) nameEl.textContent = badge.name || badge.badgeName || 'Achievement Unlocked';
    if (descEl) descEl.textContent = badge.description || 'You\'ve mastered a new skill!';
    if (xpEl) xpEl.textContent = `+${badge.xpReward || 500} XP`;

    // Show modal
    modal.style.display = 'flex';

    // Confetti burst
    if (typeof confetti === 'function') {
        setTimeout(() => {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FFA500', '#FF6B6B']
            });
        }, 400);
    }

    // Dismiss on click
    const dismissModal = () => {
        modal.style.display = 'none';
    };

    modal.addEventListener('click', dismissModal, { once: true });
    setTimeout(dismissModal, 5000); // Auto-dismiss after 5 seconds
};

// ============================================
// 6. QUEST TOGGLE HANDLERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Daily quests toggle
    const questToggle = document.querySelector('.quest-toggle');
    const questsList = document.getElementById('sidebar-quests');

    if (questToggle && questsList) {
        questToggle.addEventListener('click', () => {
            questToggle.classList.toggle('active');
            const isActive = questToggle.classList.contains('active');
            questsList.style.maxHeight = isActive ? '600px' : '0';

            // Rotate chevron
            const icon = questToggle.querySelector('i');
            if (icon) {
                icon.style.transform = isActive ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    }

    // Weekly challenges toggle
    const weeklyToggle = document.querySelector('.quest-toggle-weekly');
    const weeklyChallenges = document.getElementById('weekly-challenges-container');

    if (weeklyToggle && weeklyChallenges) {
        weeklyToggle.addEventListener('click', () => {
            const isVisible = weeklyChallenges.style.display !== 'none';
            weeklyChallenges.style.display = isVisible ? 'none' : 'block';

            // Rotate chevron
            const icon = weeklyToggle.querySelector('i');
            if (icon) {
                icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        });
    }
});

// ============================================
// 7. INITIALIZE
// ============================================

console.log('✨ Engagement widgets loaded');
