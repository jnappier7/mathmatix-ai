// modules/gamification.js
// XP system, level celebrations, leaderboard, quests, tutor unlocks

import { triggerConfetti, showToast } from './helpers.js';

/**
 * Show level-up celebration modal with tutor video
 * Uses smallcele for regular levels, levelUp for milestone levels (every 5)
 */
export function showLevelUpCelebration(currentUser) {
    const modal = document.getElementById('levelup-celebration-modal');
    const video = document.getElementById('celebration-tutor-video');
    const titleEl = document.getElementById('celebration-title');
    const subtitleEl = document.getElementById('celebration-subtitle');

    if (!modal || !video || !currentUser || !currentUser.selectedTutorId) return;

    const tutorId = currentUser.selectedTutorId;
    const currentLevel = currentUser.level || 1;
    const isMilestone = currentLevel % 5 === 0;
    const videoType = isMilestone ? 'levelUp' : 'smallcele';
    const videoPath = `/videos/${tutorId}_${videoType}.mp4`;

    if (titleEl && subtitleEl) {
        if (isMilestone) {
            titleEl.textContent = `LEVEL ${currentLevel}!`;
            subtitleEl.textContent = "🎉 Milestone Achievement! 🎉";
        } else {
            titleEl.textContent = "LEVEL UP!";
            subtitleEl.textContent = "You're getting stronger!";
        }
    }

    video.src = videoPath;
    modal.style.display = 'flex';

    video.play().catch(err => {
        console.warn('Video playback failed:', err);
    });

    const dismissModal = () => {
        modal.classList.add('fade-out');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('fade-out');
            video.pause();
            video.src = '';
        }, 400);
    };

    video.addEventListener('ended', dismissModal, { once: true });
    setTimeout(dismissModal, 4000);
    modal.addEventListener('click', dismissModal, { once: true });
}

/**
 * Trigger floating XP animation text
 */
export function triggerXpAnimation(message, isLevelUp = false, isSpecialXp = false, currentUser = null) {
    const animationText = document.createElement('div');
    animationText.textContent = message;
    animationText.classList.add('xp-animation-text');
    if (isLevelUp) {
        animationText.classList.add('level-up-animation-text', 'animate-level-up');

        showLevelUpCelebration(currentUser);

        if (window.MathMatixSurvey) {
            window.MathMatixSurvey.trackMilestone('level_up');
        }

        const fireConfetti = () => {
            if (typeof confetti !== 'function') return;
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const brandColors = ['#12B3B3', '#FF3B7F', '#FFFFFF'];
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
            function randomInRange(min, max) { return Math.random() * (max - min) + min; }
            const interval = setInterval(function() {
                const timeLeft = animationEnd - Date.now();
                if (timeLeft <= 0) { return clearInterval(interval); }
                const particleCount = 50 * (timeLeft / duration);
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: brandColors }));
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: brandColors }));
            }, 250);
        };
        if (typeof confetti === 'function') {
            fireConfetti();
        } else if (window.ensureConfetti) {
            window.ensureConfetti().then(fireConfetti);
        }
    } else {
        animationText.classList.add('animate-xp');
        if (isSpecialXp) {
            animationText.classList.add('special-xp');
        }
    }
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        const rect = chatContainer.getBoundingClientRect();
        animationText.style.position = 'fixed';
        animationText.style.top = `${rect.top + (rect.height / 2)}px`;
        animationText.style.left = `${rect.left + (rect.width / 2)}px`;
        animationText.style.transform = 'translate(-50%, -50%)';
    }
    document.body.appendChild(animationText);
    setTimeout(() => { animationText.remove(); }, 3000);
}

/**
 * Update XP/level display in sidebar and legacy elements
 */
export function updateGamificationDisplay(currentUser) {
    if (!currentUser) return;

    const sidebarLevel = document.getElementById("sidebar-level");
    const sidebarXp = document.getElementById("sidebar-xp");
    const sidebarProgressFill = document.getElementById("sidebar-progress-fill");

    if (sidebarLevel && currentUser.level) {
        sidebarLevel.textContent = currentUser.level;
    }

    if (sidebarXp && currentUser.xpForCurrentLevel !== undefined && currentUser.xpForNextLevel !== undefined) {
        sidebarXp.textContent = `${currentUser.xpForCurrentLevel} / ${currentUser.xpForNextLevel} XP`;
    }

    if (sidebarProgressFill && currentUser.xpForCurrentLevel !== undefined && currentUser.xpForNextLevel !== undefined) {
        const percentage = (currentUser.xpForCurrentLevel / currentUser.xpForNextLevel) * 100;
        sidebarProgressFill.style.width = `${Math.min(100, percentage)}%`;
    }

    // Legacy elements
    const levelSpan = document.getElementById("current-level");
    const xpSpan = document.getElementById("current-xp");
    const xpBar = document.getElementById("xp-progress-bar");
    const xpNeededSpan = document.getElementById("xp-needed");

    if (levelSpan && currentUser.level) levelSpan.textContent = currentUser.level;
    if (xpSpan && currentUser.xpForCurrentLevel !== undefined) xpSpan.textContent = currentUser.xpForCurrentLevel;
    if (xpBar && currentUser.xpForCurrentLevel !== undefined) {
        xpBar.value = currentUser.xpForCurrentLevel;
        xpBar.max = currentUser.xpForNextLevel;
    }
    if (xpNeededSpan && currentUser.xpForNextLevel) {
        xpNeededSpan.textContent = currentUser.xpForNextLevel;
    }
}

/**
 * Fetch and display leaderboard data
 */
export async function fetchAndDisplayLeaderboard() {
    const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
    if (!leaderboardTableBody) return;
    leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
    try {
        const response = await fetch('/api/leaderboard', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load leaderboard');
        const students = await response.json();
        leaderboardTableBody.innerHTML = '';
        if (students.length === 0) {
            leaderboardTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available.</td></tr>';
            return;
        }
        students.forEach((student, index) => {
            const row = leaderboardTableBody.insertRow();
            row.innerHTML = `<td>${index + 1}</td><td>${student.name}</td><td>${student.level}</td><td>${student.xp}</td>`;
        });
    } catch (error) {
        console.error('Leaderboard error:', error);
        leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Could not load leaderboard.</td></tr>`;
    }
}

/**
 * Load and display daily quests and weekly challenges
 */
export async function loadQuestsAndChallenges() {
    if (typeof window.renderDailyQuests !== 'function' || typeof window.renderWeeklyChallenges !== 'function') {
        console.log('Quest rendering functions not available');
        return;
    }

    try {
        const questsRes = await fetch('/api/daily-quests', { credentials: 'include' });
        if (questsRes.ok) {
            const questsData = await questsRes.json();
            if (questsData && questsData.quests) {
                window.renderDailyQuests(questsData.quests);
            }
        }

        const challengesRes = await fetch('/api/weekly-challenges', { credentials: 'include' });
        if (challengesRes.ok) {
            const challengesData = await challengesRes.json();
            if (challengesData && challengesData.challenges) {
                window.renderWeeklyChallenges(challengesData.challenges);
            }
        }
    } catch (error) {
        console.error('Error loading quests/challenges:', error);
    }
}

/**
 * Show "what's coming next" teaser based on proximity to next unlock.
 * Fires after level-up or when XP is 80%+ toward next level.
 * Creates anticipation (dopamine loop) for the next reward.
 */
export function showUnlockProximityTeaser(currentUser) {
    if (!currentUser) return;
    const level = currentUser.level || 1;
    const xp = currentUser.xpForCurrentLevel || 0;
    const xpNeeded = currentUser.xpForNextLevel || 100;
    const percentage = xpNeeded > 0 ? (xp / xpNeeded) * 100 : 0;

    // Tease upcoming unlocks without revealing exact levels
    // Variable ratio — the student shouldn't know exactly when
    const upcomingUnlocks = [
        { minLevel: 2,  reward: 'Avatar Builder' },
        { minLevel: 5,  reward: 'a new tutor' },
        { minLevel: 8,  reward: 'a new tutor' },
        { minLevel: 13, reward: 'a new tutor' },
        { minLevel: 18, reward: 'a new tutor' },
        { minLevel: 22, reward: 'a new tutor' },
        { minLevel: 27, reward: 'a new tutor' },
        { minLevel: 32, reward: 'a new tutor' },
    ];

    // Find the next unlock range above current level
    const nextUnlock = upcomingUnlocks.find(u => u.minLevel > level);
    if (!nextUnlock) return;

    const distance = nextUnlock.minLevel - level;

    // Only tease when close — don't reveal the system
    if (distance <= 3) {
        const messages = [
            "Something's about to unlock... keep going!",
            "You're getting close to unlocking " + nextUnlock.reward + "!",
            "A surprise is right around the corner...",
            "Keep it up — good things are coming!",
        ];
        const msg = messages[level % messages.length];
        showToast(msg, 4000);
    }
}

/**
 * Show tutor unlock celebration (Mortal Kombat style reveal)
 */
export function showTutorUnlockCelebration(tutorIds) {
    if (!tutorIds || tutorIds.length === 0) return;

    let currentIndex = 0;

    function showNextTutor() {
        if (currentIndex >= tutorIds.length) {
            triggerConfetti();
            return;
        }

        const tutorId = tutorIds[currentIndex];
        const tutor = window.TUTOR_CONFIG[tutorId];
        if (!tutor) {
            currentIndex++;
            showNextTutor();
            return;
        }

        const unlockScreen = document.getElementById('tutor-unlock-screen');
        const unlockImage = document.getElementById('unlock-tutor-image');
        const unlockName = document.getElementById('unlock-tutor-name');
        const unlockCatchphrase = document.getElementById('unlock-tutor-catchphrase');
        const unlockSpecialty = document.getElementById('unlock-tutor-specialty');

        unlockImage.src = `/images/tutors/${tutor.image}`;
        unlockImage.alt = tutor.name;
        unlockName.textContent = tutor.name;
        unlockCatchphrase.textContent = `"${tutor.catchphrase}"`;
        unlockSpecialty.textContent = `Specialties: ${tutor.specialties}`;

        unlockScreen.style.display = 'flex';

        const dismissHandler = () => {
            unlockScreen.style.display = 'none';
            unlockScreen.removeEventListener('click', dismissHandler);
            currentIndex++;
            setTimeout(showNextTutor, 300);
        };

        unlockScreen.addEventListener('click', dismissHandler);

        setTimeout(() => {
            if (unlockScreen.style.display === 'flex') {
                unlockScreen.click();
            }
        }, 8000);
    }

    showNextTutor();
}

/**
 * Process gamification events from API response.
 * Shows toast notifications for completed quests/challenges and refreshes sidebar.
 *
 * @param {Object} gamification - { questsCompleted: [], challengesCompleted: [], xpAwarded: number }
 */
export function processGamificationEvents(gamification) {
    if (!gamification) return;

    // Show quest completion toasts
    if (gamification.questsCompleted && gamification.questsCompleted.length > 0) {
        for (const quest of gamification.questsCompleted) {
            showToast(`${quest.icon || '🎯'} Quest Complete: ${quest.name} (+${quest.xpEarned} XP)`, 5000);
        }
    }

    // Show challenge completion toasts
    if (gamification.challengesCompleted && gamification.challengesCompleted.length > 0) {
        for (const challenge of gamification.challengesCompleted) {
            showToast(`${challenge.icon || '⭐'} Challenge Complete: ${challenge.name} (+${challenge.xpEarned} XP)`, 6000);
            if (challenge.specialReward) {
                setTimeout(() => {
                    showToast(`🏆 Reward: ${challenge.specialReward}`, 5000);
                }, 1500);
            }
        }
        triggerConfetti();
    }

    // Refresh quest/challenge display in sidebar
    if ((gamification.questsCompleted?.length > 0) || (gamification.challengesCompleted?.length > 0)) {
        loadQuestsAndChallenges();
    }
}

/**
 * Process badge award from mastery chat response.
 * Shows automatic celebration when a badge is earned.
 *
 * @param {Object} badgeAwarded - { badgeId, badgeName, tier, xpBonus, totalBadges }
 */
export function processBadgeAward(badgeAwarded) {
    if (!badgeAwarded) return;

    triggerConfetti();

    const modal = document.createElement('div');
    modal.className = 'badge-celebration-modal';
    modal.innerHTML = `
        <div class="badge-celebration-content">
            <div class="badge-celebration-icon">🏆</div>
            <h2>Badge Earned!</h2>
            <h3>${badgeAwarded.badgeName}</h3>
            <p class="badge-tier">${badgeAwarded.tier} Tier</p>
            <p class="badge-xp">+${badgeAwarded.xpBonus} XP</p>
            <p class="badge-count">Total Badges: ${badgeAwarded.totalBadges}</p>
            <div class="badge-celebration-actions">
                <button onclick="this.closest('.badge-celebration-modal').remove(); window.location.href='/badge-map.html'">Choose Next Badge</button>
                <button onclick="this.closest('.badge-celebration-modal').remove()">Continue</button>
            </div>
        </div>
    `;
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);animation:fadeIn 0.3s ease';
    document.body.appendChild(modal);

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
        if (modal.parentNode) modal.remove();
    }, 15000);
}
