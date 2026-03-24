# Master Mode: Frontend Integration Guide

This guide shows how to integrate the Master Mode badge system into your existing mastery mode UI.

---

## Quick Start: After Each Problem Attempt

**Step 1:** Record the attempt and update 4-pillar tracking

```javascript
// After student submits a problem
async function recordProblemAttempt(problemData) {
  const { skillId, correct, hintUsed, problemContext, responseTime, problemId } = problemData;

  // Call Master Mode API
  const response = await fetch('/api/mastery/record-mastery-attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skillId,
      correct,
      hintUsed,
      problemContext,  // 'numeric', 'graphical', 'word-problem', 'real-world'
      responseTime,    // seconds
      problemId
    })
  });

  const data = await response.json();

  // Step 2: Update progress ring UI
  updateProgressRing(data.skillMastery);

  // Step 3: Check for tier upgrade
  if (data.tierUpgrade) {
    showBadgeUpgradeCeremony(
      data.tierUpgrade.fromTier,
      data.tierUpgrade.toTier,
      skillId,
      () => {
        // After ceremony completes
        console.log('Badge upgraded!');
      }
    );
  }

  // Step 4: Check for strategy/habit badges
  checkForNewBadges(problemId);
}
```

**Step 2:** Update the progress ring visual

```javascript
function updateProgressRing(skillMastery) {
  const ringContainer = document.getElementById('mastery-progress-ring');

  // Create or update ring
  if (!ringContainer.hasChildNodes()) {
    createMasteryProgressRing(
      ringContainer,
      skillMastery.pillars,
      'fa-calculator'
    );
  } else {
    updateMasteryProgressRing(
      ringContainer,
      skillMastery.pillars
    );
  }

  // Update status message
  document.getElementById('mastery-message').textContent = skillMastery.message;

  // Update tier badge
  document.getElementById('current-tier').textContent =
    skillMastery.currentTier.toUpperCase();
}
```

**Step 3:** Check for newly earned badges

```javascript
async function checkForNewBadges(problemId) {
  // Get recent attempt history (last 20 attempts)
  const attemptHistory = getRecentAttempts(20);  // Your existing function

  const response = await fetch('/api/mastery/check-badge-detection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptHistory })
  });

  const data = await response.json();

  if (data.totalNewBadges > 0) {
    // Show badge notification
    showBadgeNotification(data.newBadges);
  }
}

function showBadgeNotification(newBadges) {
  // Strategy badges
  newBadges.strategy.forEach(badge => {
    showNotification({
      title: `Strategy Badge Unlocked!`,
      message: `${badge.badgeName}: ${badge.detectionReason}`,
      icon: 'fa-trophy',
      duration: 5000
    });
  });

  // Habit badges
  newBadges.habit.forEach(badge => {
    showNotification({
      title: `Habit Badge Earned!`,
      message: `${badge.badgeName}`,
      icon: 'fa-medal',
      duration: 5000
    });
  });
}
```

---

## Display Mastery Dashboard

Show student's overall Master Mode progress:

```javascript
async function loadMasteryDashboard() {
  const response = await fetch('/api/mastery/dashboard');
  const { dashboard } = await response.json();

  // Display badge counts
  document.getElementById('bronze-count').textContent = dashboard.skillBadges.tiers.bronze;
  document.getElementById('silver-count').textContent = dashboard.skillBadges.tiers.silver;
  document.getElementById('gold-count').textContent = dashboard.skillBadges.tiers.gold;
  document.getElementById('diamond-count').textContent = dashboard.skillBadges.tiers.diamond;

  // Display strategy/habit badges
  document.getElementById('strategy-badges').textContent =
    `${dashboard.strategyBadges.earned}/${dashboard.strategyBadges.total}`;
  document.getElementById('habit-badges').textContent =
    `${dashboard.habitBadges.earned}/${dashboard.habitBadges.total}`;

  // Display streaks
  document.getElementById('current-streak').textContent = dashboard.streaks.current;
  document.getElementById('longest-streak').textContent = dashboard.streaks.longest;

  // Display retention checks due
  if (dashboard.retentionChecks.due > 0) {
    showRetentionAlert(dashboard.retentionChecks.due);
  }
}
```

---

## Badge Gallery Pages

### Strategy Badges

```javascript
async function loadStrategyBadges() {
  const response = await fetch('/api/mastery/badges/strategy');
  const { badges, earnedCount, totalCount } = await response.json();

  const container = document.getElementById('strategy-badges-grid');
  container.innerHTML = '';

  badges.forEach(badge => {
    const card = createBadgeCard(badge);
    container.appendChild(card);
  });

  document.getElementById('strategy-progress').textContent =
    `${earnedCount}/${totalCount} earned`;
}

function createBadgeCard(badge) {
  const card = document.createElement('div');
  card.className = `badge-card ${badge.earned ? 'earned' : 'locked'}`;
  card.innerHTML = `
    <div class="badge-icon">
      <i class="fas ${badge.icon}"></i>
    </div>
    <div class="badge-name">${badge.badgeName}</div>
    <div class="badge-description">${badge.description}</div>
    ${badge.earned ? `
      <div class="earned-date">
        Earned ${new Date(badge.earnedDate).toLocaleDateString()}
      </div>
    ` : `
      <div class="locked-message">
        ${badge.triggerCriteria.requiredInstances} instances required
      </div>
    `}
  `;
  return card;
}
```

### Habit Badges

```javascript
async function loadHabitBadges() {
  const response = await fetch('/api/mastery/badges/habit');
  const { badges, earnedCount, totalCount, currentStreak, longestStreak } = await response.json();

  const container = document.getElementById('habit-badges-grid');
  container.innerHTML = '';

  // Show current streak prominently
  document.getElementById('streak-display').innerHTML = `
    <div class="streak-flame">
      <i class="fas fa-fire"></i>
      <span class="streak-number">${currentStreak}</span>
    </div>
    <div class="streak-label">Day Streak</div>
    <div class="best-streak">Best: ${longestStreak} days</div>
  `;

  badges.forEach(badge => {
    const card = createHabitBadgeCard(badge);
    container.appendChild(card);
  });
}

function createHabitBadgeCard(badge) {
  const card = document.createElement('div');
  card.className = `badge-card ${badge.earned ? 'earned' : 'locked'}`;

  let extraInfo = '';
  if (badge.earned && badge.reEarnable) {
    extraInfo = `<div class="badge-count">Earned ${badge.count}x</div>`;
  }
  if (badge.currentStreak > 0) {
    extraInfo += `<div class="current-streak">${badge.currentStreak} day streak</div>`;
  }

  card.innerHTML = `
    <div class="badge-icon">
      <i class="fas ${badge.icon}"></i>
    </div>
    <div class="badge-name">${badge.badgeName}</div>
    <div class="badge-category">${badge.category}</div>
    <div class="badge-description">${badge.description}</div>
    ${extraInfo}
  `;
  return card;
}
```

---

## Retention Check Flow

### Check for skills due

```javascript
async function checkRetentionDue() {
  const response = await fetch('/api/mastery/retention-checks-due');
  const { skillsDue, count } = await response.json();

  if (count > 0) {
    showRetentionPrompt(skillsDue);
  }
}

function showRetentionPrompt(skillsDue) {
  const modal = document.createElement('div');
  modal.className = 'retention-check-modal';
  modal.innerHTML = `
    <h3>Time for a Quick Tune-Up!</h3>
    <p>${skillsDue.length} skill${skillsDue.length > 1 ? 's' : ''} need${skillsDue.length === 1 ? 's' : ''} a refresh:</p>
    <ul>
      ${skillsDue.map(s => `
        <li>
          <strong>${s.skillName}</strong> (${s.currentTier} tier)
          <br>Last practiced ${s.daysSinceLastPractice} days ago
        </li>
      `).join('')}
    </ul>
    <button onclick="startRetentionCheck('${skillsDue[0].skillId}')">
      Start Refresh
    </button>
    <button onclick="closeModal()">Later</button>
  `;
  document.body.appendChild(modal);
}
```

### Perform retention check

```javascript
async function performRetentionCheck(skillId, attempts) {
  // After student completes 5 retention problems
  const correct = attempts.filter(a => a.correct).length;
  const total = attempts.length;

  const response = await fetch('/api/mastery/retention-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillId, correct, total })
  });

  const data = await response.json();

  if (data.passed) {
    showSuccessMessage(`Retention check passed! ${data.accuracy}% accuracy. Skill is still solid.`);
  } else {
    showWarningMessage(`Skill needs more practice. Let's do a quick review.`);
    // Launch review session for this skill
    startReviewSession(skillId);
  }
}
```

---

## Get Detailed Skill Status

Show detailed breakdown for a specific skill:

```javascript
async function showSkillDetails(skillId) {
  const response = await fetch(`/api/mastery/skill-mastery/${skillId}`);
  const { skillMastery } = await response.json();

  const modal = document.createElement('div');
  modal.className = 'skill-details-modal';
  modal.innerHTML = `
    <h3>${skillId}</h3>
    <div class="tier-badge ${skillMastery.currentTier}">
      ${skillMastery.currentTier.toUpperCase()}
    </div>
    <div class="mastery-score">Mastery: ${skillMastery.masteryScore}%</div>

    <h4>4 Pillars of Mastery</h4>

    <div class="pillar">
      <div class="pillar-name">Accuracy</div>
      <div class="pillar-bar">
        <div class="pillar-fill" style="width: ${skillMastery.pillars.accuracy.progress}%"></div>
      </div>
      <div class="pillar-details">
        ${skillMastery.pillars.accuracy.correct}/${skillMastery.pillars.accuracy.total} correct
        (${skillMastery.pillars.accuracy.percentage}%)
      </div>
    </div>

    <div class="pillar">
      <div class="pillar-name">Independence</div>
      <div class="pillar-bar">
        <div class="pillar-fill" style="width: ${skillMastery.pillars.independence.progress}%"></div>
      </div>
      <div class="pillar-details">
        ${skillMastery.pillars.independence.hintsUsed}/${skillMastery.pillars.independence.hintsAvailable} hints used
      </div>
    </div>

    <div class="pillar">
      <div class="pillar-name">Transfer</div>
      <div class="pillar-bar">
        <div class="pillar-fill" style="width: ${skillMastery.pillars.transfer.progress}%"></div>
      </div>
      <div class="pillar-details">
        ${skillMastery.pillars.transfer.contextsAttempted.length}/${skillMastery.pillars.transfer.contextsRequired} contexts
        <br>${skillMastery.pillars.transfer.contextsAttempted.join(', ')}
      </div>
    </div>

    <div class="pillar">
      <div class="pillar-name">Retention</div>
      <div class="pillar-bar">
        <div class="pillar-fill" style="width: ${skillMastery.pillars.retention.progress}%"></div>
      </div>
      <div class="pillar-details">
        ${skillMastery.pillars.retention.checks.length} check(s) completed
        ${skillMastery.pillars.retention.nextCheck ?
          `<br>Next check: ${new Date(skillMastery.pillars.retention.nextCheck).toLocaleDateString()}`
          : ''}
      </div>
    </div>

    <div class="status-message">${skillMastery.message}</div>
  `;

  document.body.appendChild(modal);
}
```

---

## HTML Structure Examples

### Mastery Dashboard Page

```html
<div class="mastery-dashboard">
  <h1>Master Mode Dashboard</h1>

  <!-- Streak Display -->
  <div id="streak-display" class="streak-section"></div>

  <!-- Skill Badges by Tier -->
  <section class="skill-badges">
    <h2>Skill Badges</h2>
    <div class="tier-counts">
      <div class="tier bronze">
        <i class="fas fa-medal"></i>
        <span id="bronze-count">0</span>
        <label>Bronze</label>
      </div>
      <div class="tier silver">
        <i class="fas fa-medal"></i>
        <span id="silver-count">0</span>
        <label>Silver</label>
      </div>
      <div class="tier gold">
        <i class="fas fa-medal"></i>
        <span id="gold-count">0</span>
        <label>Gold</label>
      </div>
      <div class="tier diamond">
        <i class="fas fa-gem"></i>
        <span id="diamond-count">0</span>
        <label>Diamond</label>
      </div>
    </div>
  </section>

  <!-- Strategy Badges -->
  <section class="strategy-badges">
    <h2>Strategy Badges</h2>
    <div class="badge-progress" id="strategy-progress"></div>
    <div id="strategy-badges-grid" class="badges-grid"></div>
  </section>

  <!-- Habit Badges -->
  <section class="habit-badges">
    <h2>Habit Badges</h2>
    <div class="badge-progress" id="habit-progress"></div>
    <div id="habit-badges-grid" class="badges-grid"></div>
  </section>
</div>
```

### Problem Page (with progress ring)

```html
<div class="problem-container">
  <!-- Problem content -->
  <div class="problem-text">...</div>

  <!-- Mastery Progress Ring -->
  <aside class="mastery-sidebar">
    <h3>Mastery Progress</h3>
    <div id="mastery-progress-ring"></div>
    <div id="current-tier" class="tier-badge">BRONZE</div>
    <div id="mastery-message" class="status-message">Getting started</div>

    <div class="pillar-labels">
      <div class="pillar-label">
        <span class="dot accuracy"></span> Accuracy
      </div>
      <div class="pillar-label">
        <span class="dot independence"></span> Independence
      </div>
      <div class="pillar-label">
        <span class="dot transfer"></span> Transfer
      </div>
      <div class="pillar-label">
        <span class="dot retention"></span> Retention
      </div>
    </div>
  </aside>
</div>

<!-- Include scripts -->
<script src="/js/masteryProgressRing.js"></script>
<script src="/js/badgeUpgradeCeremony.js"></script>
```

---

## CSS Starter Kit

```css
/* Progress Ring Colors */
.mastery-progress-ring-container {
  position: relative;
  margin: 20px auto;
}

.pillar-label {
  display: flex;
  align-items: center;
  margin: 8px 0;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 8px;
}

.dot.accuracy { background: #4caf50; }
.dot.independence { background: #2196f3; }
.dot.transfer { background: #9c27b0; }
.dot.retention { background: #ff9800; }

/* Tier Badges */
.tier-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 10px 0;
}

.tier-badge.bronze { background: #cd7f32; color: white; }
.tier-badge.silver { background: #c0c0c0; color: #333; }
.tier-badge.gold { background: #ffd700; color: #333; }
.tier-badge.diamond {
  background: linear-gradient(135deg, #b9f2ff, #e0f7ff);
  color: #00bcd4;
  box-shadow: 0 0 20px rgba(185, 242, 255, 0.5);
}

/* Badge Cards */
.badge-card {
  border: 2px solid #ddd;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  transition: all 0.3s;
}

.badge-card.earned {
  border-color: #4caf50;
  background: linear-gradient(to bottom, #fff, #f0fff0);
}

.badge-card.locked {
  opacity: 0.5;
  filter: grayscale(1);
}

.badge-icon {
  font-size: 48px;
  margin-bottom: 12px;
  color: #555;
}

.badge-card.earned .badge-icon {
  color: #4caf50;
}

/* Pillar Progress Bars */
.pillar-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin: 8px 0;
}

.pillar-fill {
  height: 100%;
  background: linear-gradient(to right, #4caf50, #8bc34a);
  transition: width 0.5s ease-out;
}
```

---

## Next Steps

1. **Wire up existing problem attempt flow** to call `recordProblemAttempt()`
2. **Add progress ring** to badge practice page
3. **Create badge gallery pages** for Strategy and Habit badges
4. **Add retention check reminders** to dashboard
5. **Integrate tier upgrade ceremony** into badge completion flow

The backend is ready. Start with step 1 and test each integration point.
