// public/js/badgeUpgradeCeremony.js
// Master Mode: Badge Tier Upgrade Ceremony

/**
 * BADGE UPGRADE CEREMONY
 *
 * Ceremonial but brief (3.1 seconds total)
 * Shows when student upgrades from one tier to another
 *
 * Sequence:
 * 1. Pause (0.5s): Screen dims, focus on badge
 * 2. Ring Completion (0.3s): All segments fill to 100%
 * 3. Badge Morph (0.5s): Badge icon upgrades visually
 * 4. Text Reveal (0.8s): Tier name appears
 * 5. Celebrate (1.0s): Subtle confetti/sparkle effect
 * 6. Next Action (immediate): Show next step
 */

const TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  diamond: '#b9f2ff'
};

const TIER_MESSAGES = {
  'none-to-bronze': "You're getting the hang of this!\nKeep practicing with support.",
  'bronze-to-silver': "You can do this independently now.\nLet's add some variety.",
  'silver-to-gold': "This skill is now reliable.\nYou'll see it again. Don't panic.",
  'gold-to-diamond': "You can teach this now.\nIt's yours."
};

/**
 * Show badge upgrade ceremony
 */
function showBadgeUpgradeCeremony(fromTier, toTier, badgeName, skillId, onComplete) {
  // Create modal overlay
  const modal = createUpgradeModal();
  document.body.appendChild(modal);

  // Sequence of animations
  setTimeout(() => dimScreen(modal), 0);
  setTimeout(() => showRingCompletion(modal), 500);
  setTimeout(() => morphBadge(modal, fromTier, toTier), 800);
  setTimeout(() => revealText(modal, toTier, badgeName, fromTier), 1300);
  setTimeout(() => celebrate(modal, toTier), 2100);

  // Close modal after 3.1 seconds
  setTimeout(() => {
    closeModal(modal, onComplete);
  }, 3100);
}

/**
 * Create modal structure
 */
function createUpgradeModal() {
  const modal = document.createElement('div');
  modal.className = 'badge-upgrade-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    transition: background 0.5s ease;
  `;

  const content = document.createElement('div');
  content.className = 'upgrade-content';
  content.style.cssText = `
    position: relative;
    background: white;
    border-radius: 20px;
    padding: 40px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    transform: scale(0.8);
    opacity: 0;
    transition: all 0.5s ease;
  `;

  // Badge container
  const badgeContainer = document.createElement('div');
  badgeContainer.className = 'badge-container';
  badgeContainer.style.cssText = `
    margin: 20px auto;
    position: relative;
  `;

  // Progress ring (will be animated)
  const ringPlaceholder = document.createElement('div');
  ringPlaceholder.id = 'upgrade-ring-placeholder';
  badgeContainer.appendChild(ringPlaceholder);

  // Text container
  const textContainer = document.createElement('div');
  textContainer.className = 'upgrade-text-container';
  textContainer.style.cssText = `
    margin-top: 30px;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.8s ease;
  `;

  content.appendChild(badgeContainer);
  content.appendChild(textContainer);
  modal.appendChild(content);

  return modal;
}

/**
 * Step 1: Dim screen
 */
function dimScreen(modal) {
  const content = modal.querySelector('.upgrade-content');
  modal.style.background = 'rgba(0, 0, 0, 0.7)';
  content.style.transform = 'scale(1)';
  content.style.opacity = '1';
}

/**
 * Step 2: Show ring completion animation
 */
function showRingCompletion(modal) {
  const ringPlaceholder = modal.querySelector('#upgrade-ring-placeholder');

  // Create progress ring with all segments at 100%
  const pillarData = {
    accuracy: 100,
    independence: 100,
    transfer: 100,
    retention: 100
  };

  // Import and use the progress ring component
  if (typeof createMasteryProgressRing !== 'undefined') {
    createMasteryProgressRing(ringPlaceholder, pillarData, 'fa-trophy');
  } else {
    // Fallback: simple circle
    ringPlaceholder.innerHTML = `
      <div style="width: 120px; height: 120px; border-radius: 50%; border: 12px solid #4caf50; margin: 0 auto;"></div>
    `;
  }

  // Animate ring appearing
  ringPlaceholder.style.opacity = '0';
  ringPlaceholder.style.transform = 'scale(0.5)';
  ringPlaceholder.style.transition = 'all 0.3s ease-out';

  setTimeout(() => {
    ringPlaceholder.style.opacity = '1';
    ringPlaceholder.style.transform = 'scale(1)';
  }, 50);
}

/**
 * Step 3: Morph badge to new tier
 */
function morphBadge(modal, fromTier, toTier) {
  const badgeContainer = modal.querySelector('.badge-container');

  // Add glow effect
  badgeContainer.style.filter = `drop-shadow(0 0 20px ${TIER_COLORS[toTier]})`;

  // Pulse animation
  badgeContainer.style.animation = 'badge-pulse 0.5s ease-in-out';
}

/**
 * Step 4: Reveal tier name and message
 */
function revealText(modal, toTier, badgeName, fromTier) {
  const textContainer = modal.querySelector('.upgrade-text-container');

  const tierName = toTier.charAt(0).toUpperCase() + toTier.slice(1);
  const message = TIER_MESSAGES[`${fromTier}-to-${toTier}`] ||
                  `${badgeName} upgraded to ${tierName}!`;

  textContainer.innerHTML = `
    <div style="font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;">
      ${tierName} Tier
    </div>
    <div style="font-size: 18px; font-weight: 600; color: #333; line-height: 1.6; white-space: pre-line;">
      ${message}
    </div>
  `;

  // Animate text appearing
  setTimeout(() => {
    textContainer.style.opacity = '1';
    textContainer.style.transform = 'translateY(0)';
  }, 50);
}

/**
 * Step 5: Celebrate with subtle confetti/sparkles
 */
function celebrate(modal, toTier) {
  const content = modal.querySelector('.upgrade-content');

  // Create sparkle particles
  for (let i = 0; i < 15; i++) {
    const sparkle = createSparkle(TIER_COLORS[toTier]);
    content.appendChild(sparkle);

    // Random position and animation
    const angle = (Math.PI * 2 * i) / 15;
    const distance = 100 + Math.random() * 50;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    setTimeout(() => {
      sparkle.style.transform = `translate(${x}px, ${y}px) scale(0)`;
      sparkle.style.opacity = '0';
    }, 50);

    // Remove after animation
    setTimeout(() => {
      sparkle.remove();
    }, 1000);
  }
}

/**
 * Create sparkle particle
 */
function createSparkle(color) {
  const sparkle = document.createElement('div');
  sparkle.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: 8px;
    height: 8px;
    background: ${color};
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
    transition: all 1s ease-out;
  `;
  return sparkle;
}

/**
 * Close modal and trigger callback
 */
function closeModal(modal, onComplete) {
  const content = modal.querySelector('.upgrade-content');

  content.style.transform = 'scale(0.8)';
  content.style.opacity = '0';
  modal.style.background = 'rgba(0, 0, 0, 0)';

  setTimeout(() => {
    modal.remove();
    if (onComplete) onComplete();
  }, 500);
}

/**
 * Show simpler diamond badge celebration (special for mastery)
 */
function showDiamondCelebration(badgeName, skillId, onComplete) {
  const modal = createUpgradeModal();
  document.body.appendChild(modal);

  setTimeout(() => dimScreen(modal), 0);
  setTimeout(() => {
    const content = modal.querySelector('.upgrade-content');
    const textContainer = modal.querySelector('.upgrade-text-container');

    // Special diamond badge icon
    const badgeContainer = modal.querySelector('.badge-container');
    badgeContainer.innerHTML = `
      <div style="
        width: 120px;
        height: 120px;
        margin: 0 auto;
        background: linear-gradient(135deg, #b9f2ff, #e0f7ff);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 40px rgba(185, 242, 255, 0.8);
        animation: diamond-glow 2s infinite;
      ">
        <i class="fas fa-gem" style="font-size: 50px; color: #00bcd4;"></i>
      </div>
    `;

    textContainer.innerHTML = `
      <div style="font-size: 16px; color: #00bcd4; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;">
        Diamond Tier
      </div>
      <div style="font-size: 20px; font-weight: 600; color: #333; line-height: 1.6;">
        You can teach this now.<br>It's yours.
      </div>
    `;

    textContainer.style.opacity = '1';
    textContainer.style.transform = 'translateY(0)';
  }, 500);

  setTimeout(() => celebrate(modal, 'diamond'), 1000);

  setTimeout(() => {
    closeModal(modal, onComplete);
  }, 3500);
}

/**
 * Add CSS animations
 */
const style = document.createElement('style');
style.textContent = `
  @keyframes badge-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  @keyframes diamond-glow {
    0%, 100% {
      box-shadow: 0 0 40px rgba(185, 242, 255, 0.8);
    }
    50% {
      box-shadow: 0 0 60px rgba(185, 242, 255, 1);
    }
  }
`;
document.head.appendChild(style);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showBadgeUpgradeCeremony,
    showDiamondCelebration
  };
}
