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

    if (!counter || !numberEl) return;

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
