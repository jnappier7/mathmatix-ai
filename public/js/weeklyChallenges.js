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
      const response = await fetch('/api/weekly-challenges/update', {
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
