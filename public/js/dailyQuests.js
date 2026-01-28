// dailyQuests.js - Frontend for Daily Quest System

class DailyQuestManager {
  constructor() {
    this.quests = [];
    this.streak = 0;
    this.longestStreak = 0;
    this.totalCompleted = 0;
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
        this.render();
      }
    } catch (error) {
      console.error('Error loading daily quests:', error);
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

    container.innerHTML = `
      <div class="daily-quests-widget">
        <!-- Header -->
        <div class="quest-header">
          <h3>
            <span class="quest-icon">📋</span>
            Daily Quests
            <span class="quest-counter">${completedCount}/${this.quests.length}</span>
          </h3>

          <div class="streak-badge ${this.streak > 0 ? 'active' : ''}">
            <span class="streak-icon">🔥</span>
            <span class="streak-number">${this.streak}</span>
            <span class="streak-label">day${this.streak !== 1 ? 's' : ''}</span>
          </div>
        </div>

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
          <span class="xp-badge">+${quest.xpReward} XP</span>
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
          <span>📋 Daily: ${completedCount}/${this.quests.length}</span>
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
          <div class="completion-reward">+${quest.xpEarned} XP</div>
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
