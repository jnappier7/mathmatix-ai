// modules/gamification.js
// XP system, level celebrations, leaderboard, quests, tutor unlocks

import { triggerConfetti, showToast } from './helpers.js';

// Tutors with refreshed celebration video art. Anyone outside this set
// gets XP + confetti but no modal, so the legacy art doesn't ship alongside
// the new style. Re-add the others here once their new videos land.
const TUTORS_WITH_CELEBRATION_VIDEO = new Set([
    'bob',
    'maya',
    'mr-nappier',
    'ms-maria',
]);

/**
 * Show level-up celebration.
 *
 * Desktop prefers the in-place hero overlay — the tutor "comes to life" in
 * their portrait spot (owned by chat-redesign.js), which reads well because
 * the hero is large and permanently on screen there.
 *
 * Phones take the fullscreen modal instead. The mobile hero is a small docked
 * cam that now collapses to a pill for everything after the welcome, so an
 * "in-place" celebration would play inside a ~40px pill — or inside a hidden
 * element — which is worse than no celebration at all. Levelling up is the
 * payoff moment; on a phone it gets the whole screen.
 */
const PHONE_CELEBRATION_MQ = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 768px)')
    : null;

export function showLevelUpCelebration(currentUser) {
    if (!currentUser || !currentUser.selectedTutorId) return;
    const tutorId = currentUser.selectedTutorId;
    if (!TUTORS_WITH_CELEBRATION_VIDEO.has(tutorId)) return;

    const isPhone = !!(PHONE_CELEBRATION_MQ && PHONE_CELEBRATION_MQ.matches);

    if (!isPhone &&
        typeof window.playInPlaceCelebration === 'function' &&
        window.playInPlaceCelebration(tutorId)) {
        return;
    }

    // Fullscreen modal: phones always, and any surface without the hero panel.
    const modal = document.getElementById('levelup-celebration-modal');
    const video = document.getElementById('celebration-tutor-video');
    const titleEl = document.getElementById('celebration-title');
    const subtitleEl = document.getElementById('celebration-subtitle');
    if (!modal || !video) return;

    const currentLevel = currentUser.level || 1;
    const isMilestone = currentLevel % 5 === 0;
    const videoType = isMilestone ? 'levelUp' : 'smallcele';
    // smallcele ships as webm (~5× smaller than the mp4 exports) with the
    // mp4 kept as the Safari/legacy fallback; levelUp only has mp4.
    const preferWebm = videoType === 'smallcele' &&
        video.canPlayType && video.canPlayType('video/webm; codecs="vp9"');
    const videoPath = `/videos/${tutorId}_${videoType}.${preferWebm ? 'webm' : 'mp4'}?v=20260717`;

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
            // Above the celebration overlay (--mm-celebration-z: 100010), so
            // the confetti falls in FRONT of the video instead of behind an
            // opaque backdrop. 9999 predated the overlay having any z-index at
            // all, because it had no styles at all.
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100011 };
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

    // Coin balance (persistent sidebar counter). Set directly — the animated
    // count-up on a fresh award is handled separately by coinFx.showCoinReward.
    const sidebarCoins = document.getElementById("sidebar-coins");
    if (sidebarCoins && currentUser.wallet && currentUser.wallet.coins != null) {
        sidebarCoins.textContent = String(currentUser.wallet.coins);
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

    // QA P2: surface the COIN reward, not just XP — quests/challenges are a
    // primary coin faucet, but the UI only showed XP so students never saw
    // where coins come from.
    const rewardText = (xp, coins) => `+${xp} XP${coins > 0 ? ` · +${coins} 🪙` : ''}`;

    // Total coins earned across all completions this turn — drive one coin
    // celebration (fly-in + count-up + cha-ching) so the reward is felt, not
    // just read in a toast.
    let coinsThisTurn = 0;

    // Show quest completion toasts
    if (gamification.questsCompleted && gamification.questsCompleted.length > 0) {
        for (const quest of gamification.questsCompleted) {
            coinsThisTurn += quest.coinsEarned || 0;
            showToast(`${quest.icon || '🎯'} Quest Complete: ${quest.name} (${rewardText(quest.xpEarned, quest.coinsEarned)})`, 5000);
        }
    }

    // Show challenge completion toasts
    if (gamification.challengesCompleted && gamification.challengesCompleted.length > 0) {
        for (const challenge of gamification.challengesCompleted) {
            coinsThisTurn += challenge.coinsEarned || 0;
            showToast(`${challenge.icon || '⭐'} Challenge Complete: ${challenge.name} (${rewardText(challenge.xpEarned, challenge.coinsEarned)})`, 6000);
            if (challenge.specialReward) {
                setTimeout(() => {
                    showToast(`🏆 Reward: ${challenge.specialReward}`, 5000);
                }, 1500);
            }
        }
        triggerConfetti();
    }

    if (coinsThisTurn > 0 && typeof window.showCoinReward === 'function') {
        // Slight delay so it lands with the toast, not on top of the send action.
        setTimeout(() => window.showCoinReward(coinsThisTurn), 400);
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

    // Guard every field: not all badge sources populate name/tier (e.g. the
    // skill-practice path uses a numeric milestone, not a bronze/silver tier),
    // and interpolating an undefined value printed the literal word "undefined".
    const esc = (s) => { const d = document.createElement('span'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
    const name = badgeAwarded.badgeName || 'New Badge';
    const tier = badgeAwarded.tier;                 // may be absent — hide the line if so
    const xp = Number(badgeAwarded.xpBonus) || 0;
    const total = Number(badgeAwarded.totalBadges) || null;

    const modal = document.createElement('div');
    modal.className = 'badge-celebration-modal';
    // Self-contained styling — the .badge-celebration-* stylesheet (animations.css)
    // is NOT loaded on chat.html, so the modal must not depend on it.
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(10,15,26,0.72);font-family:Inter,system-ui,sans-serif';
    modal.innerHTML = `
        <div style="background:#fff;color:#18202b;border-radius:20px;padding:28px 32px;max-width:min(420px,calc(100vw - 32px));text-align:center;box-shadow:0 24px 70px rgba(0,0,0,0.4)">
            <div style="font-size:3rem;line-height:1">🏆</div>
            <h2 style="margin:8px 0 4px;font-size:1.5rem;color:#12b3b3">Badge Earned!</h2>
            <h3 style="margin:0 0 6px;font-size:1.2rem;font-weight:800">${esc(name)}</h3>
            ${tier ? `<p style="margin:0 0 6px;text-transform:capitalize;color:#5b6876;font-weight:700">${esc(tier)} Tier</p>` : ''}
            <p style="margin:6px 0;font-size:1.05rem;font-weight:800;color:#b8860b">+${xp} XP</p>
            ${total != null ? `<p style="margin:0 0 14px;color:#5b6876;font-size:0.9rem">Total Badges: ${total}</p>` : ''}
            <div style="display:flex;gap:10px;justify-content:center;margin-top:8px">
                <button data-badge-next style="background:#12b3b3;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer">Choose Next Badge</button>
                <button data-badge-continue style="background:#eef2f4;color:#5b6876;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer">Continue</button>
            </div>
        </div>
    `;
    modal.querySelector('[data-badge-next]').addEventListener('click', () => { modal.remove(); window.location.href = '/badge-map.html'; });
    modal.querySelector('[data-badge-continue]').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
        if (modal.parentNode) modal.remove();
    }, 15000);
}

/**
 * Display "What's Next?" suggestion card after key moments.
 * Shows the highest-priority suggestion as a subtle, dismissible card
 * anchored to the bottom of the chat area.
 *
 * @param {Object[]} nextActions - Array from API response: [{ type, icon, title, message, action }]
 */
export function showNextActionSuggestion(nextActions) {
    if (!nextActions || nextActions.length === 0) return;

    // Remove any existing suggestion card
    const existing = document.getElementById('next-action-card');
    if (existing) existing.remove();

    const suggestion = nextActions[0]; // Show the top priority suggestion

    const card = document.createElement('div');
    card.id = 'next-action-card';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 24px;
        max-width: 340px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 16px;
        z-index: 900;
        border-left: 4px solid #3498db;
        animation: nextActionSlideIn 0.4s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const actionButton = suggestion.action
        ? `<button id="next-action-btn" style="
            background: #3498db; color: white; border: none; padding: 8px 16px;
            border-radius: 8px; font-size: 0.85em; font-weight: 600; cursor: pointer;
            margin-top: 8px; transition: background 0.2s;
          ">Let's Go</button>`
        : '';

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; gap: 10px; align-items: flex-start; flex: 1;">
                <i class="fas ${suggestion.icon}" style="color: #3498db; font-size: 1.2em; margin-top: 2px;"></i>
                <div>
                    <div style="font-weight: 700; font-size: 0.9em; color: #2c3e50;">${suggestion.title}</div>
                    <div style="font-size: 0.82em; color: #5B6876; margin-top: 3px; line-height: 1.4;">${suggestion.message}</div>
                    ${actionButton}
                </div>
            </div>
            <button id="next-action-dismiss" aria-label="Dismiss suggestion" style="
                background: none; border: none; color: #95a5a6; cursor: pointer;
                font-size: 1.1em; padding: 0 0 0 8px; line-height: 1;
            ">&times;</button>
        </div>
    `;

    document.body.appendChild(card);

    // Dismiss button
    card.querySelector('#next-action-dismiss').addEventListener('click', () => {
        card.style.animation = 'nextActionSlideOut 0.3s ease forwards';
        setTimeout(() => card.remove(), 300);
    });

    // Action button
    const actionBtn = card.querySelector('#next-action-btn');
    if (actionBtn && suggestion.action) {
        actionBtn.addEventListener('click', () => {
            card.remove();
            if (suggestion.action.type === 'navigate' && suggestion.action.url) {
                window.location.href = suggestion.action.url;
            } else if (suggestion.action.type === 'view-quests') {
                // Toggle quests sidebar if available
                const questsPanel = document.getElementById('quests-panel') || document.getElementById('daily-quests-section');
                if (questsPanel) questsPanel.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // Auto-dismiss after 12 seconds
    setTimeout(() => {
        if (card.parentNode) {
            card.style.animation = 'nextActionSlideOut 0.3s ease forwards';
            setTimeout(() => { if (card.parentNode) card.remove(); }, 300);
        }
    }, 12000);
}
