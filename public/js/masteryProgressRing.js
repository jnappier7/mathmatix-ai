// public/js/masteryProgressRing.js
// Master Mode: 4-Pillar Progress Ring Component

/**
 * Creates a circular progress ring showing the 4 pillars of mastery
 *
 * Each pillar is a segment of the ring:
 * - Accuracy (top, 90° segment, green)
 * - Independence (right, 90° segment, blue)
 * - Transfer (bottom, 90° segment, purple)
 * - Retention (left, 90° segment, orange)
 *
 * Usage:
 *   const ring = createMasteryProgressRing(containerElement, pillarData, badgeIconUrl);
 *   updateMasteryProgressRing(ring, newPillarData);
 */

const PILLAR_COLORS = {
  accuracy: '#4caf50',      // Green
  independence: '#2196f3',  // Blue
  transfer: '#9c27b0',      // Purple
  retention: '#ff9800'      // Orange
};

const PILLAR_LABELS = {
  accuracy: 'Accuracy',
  independence: 'Independence',
  transfer: 'Transfer',
  retention: 'Retention'
};

/**
 * Create SVG progress ring
 */
function createMasteryProgressRing(container, pillarData, badgeIcon) {
  const size = 120;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Create container
  const ringContainer = document.createElement('div');
  ringContainer.className = 'mastery-progress-ring-container';
  ringContainer.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size}px;
    margin: 0 auto;
  `;

  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.style.transform = 'rotate(-90deg)';  // Start from top

  const center = size / 2;

  // Create 4 pillar segments
  const pillars = ['accuracy', 'independence', 'transfer', 'retention'];
  const segmentAngle = 90;  // 90° per segment

  pillars.forEach((pillar, index) => {
    const startAngle = index * segmentAngle;
    const progress = pillarData[pillar] || 0;  // 0-100

    // Background circle (gray)
    const bgCircle = createCircleSegment(
      center,
      center,
      radius,
      strokeWidth,
      startAngle,
      segmentAngle,
      '#e0e0e0'
    );
    bgCircle.classList.add('pillar-bg', `pillar-bg-${pillar}`);
    svg.appendChild(bgCircle);

    // Progress circle (colored)
    const progressCircle = createCircleSegment(
      center,
      center,
      radius,
      strokeWidth,
      startAngle,
      segmentAngle * (progress / 100),
      PILLAR_COLORS[pillar]
    );
    progressCircle.classList.add('pillar-progress', `pillar-progress-${pillar}`);
    progressCircle.style.transition = 'all 0.5s ease-out';
    svg.appendChild(progressCircle);
  });

  ringContainer.appendChild(svg);

  // Create center badge icon
  const badgeIconEl = document.createElement('div');
  badgeIconEl.className = 'mastery-badge-icon';
  badgeIconEl.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;

  if (badgeIcon) {
    if (badgeIcon.startsWith('fa-')) {
      // Font Awesome icon
      const icon = document.createElement('i');
      icon.className = `fas ${badgeIcon}`;
      icon.style.fontSize = '28px';
      icon.style.color = '#555';
      badgeIconEl.appendChild(icon);
    } else {
      // Image URL
      const img = document.createElement('img');
      img.src = badgeIcon;
      img.style.width = '50px';
      img.style.height = '50px';
      badgeIconEl.appendChild(img);
    }
  }

  ringContainer.appendChild(badgeIconEl);

  // Create tooltip overlay
  const tooltip = createRingTooltip(pillarData);
  ringContainer.appendChild(tooltip);

  // Add hover effect
  ringContainer.addEventListener('mouseenter', () => {
    tooltip.style.opacity = '1';
  });

  ringContainer.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
  });

  container.appendChild(ringContainer);

  return ringContainer;
}

/**
 * Create circular segment path
 */
function createCircleSegment(cx, cy, radius, strokeWidth, startAngle, arcAngle, color) {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = ((startAngle + arcAngle) * Math.PI) / 180;

  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);

  const largeArcFlag = arcAngle > 180 ? 1 : 0;

  const d = [
    `M ${x1} ${y1}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`
  ].join(' ');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', strokeWidth);
  path.setAttribute('stroke-linecap', 'round');

  return path;
}

/**
 * Create tooltip showing pillar details
 */
function createRingTooltip(pillarData) {
  const tooltip = document.createElement('div');
  tooltip.className = 'mastery-ring-tooltip';
  tooltip.style.cssText = `
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 10px;
    padding: 12px;
    background: rgba(0,0,0,0.85);
    color: white;
    border-radius: 8px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 10;
  `;

  const pillars = ['accuracy', 'independence', 'transfer', 'retention'];
  const rows = pillars.map(pillar => {
    const value = pillarData[pillar] || 0;
    const color = PILLAR_COLORS[pillar];
    return `
      <div style="display: flex; align-items: center; margin: 4px 0;">
        <div style="width: 8px; height: 8px; background: ${color}; border-radius: 50%; margin-right: 8px;"></div>
        <span style="margin-right: 8px;">${PILLAR_LABELS[pillar]}:</span>
        <strong>${value}%</strong>
      </div>
    `;
  });

  tooltip.innerHTML = rows.join('');

  return tooltip;
}

/**
 * Update progress ring with new data
 */
function updateMasteryProgressRing(ringContainer, pillarData, animationDelay = 0) {
  const svg = ringContainer.querySelector('svg');
  const size = 120;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const pillars = ['accuracy', 'independence', 'transfer', 'retention'];
  const segmentAngle = 90;

  pillars.forEach((pillar, index) => {
    const progressCircle = svg.querySelector(`.pillar-progress-${pillar}`);
    const startAngle = index * segmentAngle;
    const progress = pillarData[pillar] || 0;

    setTimeout(() => {
      const newSegment = createCircleSegment(
        center,
        center,
        radius,
        strokeWidth,
        startAngle,
        segmentAngle * (progress / 100),
        PILLAR_COLORS[pillar]
      );

      // Animate the change
      progressCircle.style.opacity = '0';
      setTimeout(() => {
        progressCircle.parentElement.replaceChild(newSegment, progressCircle);
        newSegment.classList.add('pillar-progress', `pillar-progress-${pillar}`);
        newSegment.style.transition = 'all 0.5s ease-out';
        newSegment.style.opacity = '0';
        setTimeout(() => {
          newSegment.style.opacity = '1';
        }, 10);
      }, 200);
    }, animationDelay + index * 100);
  });

  // Update tooltip
  const tooltip = ringContainer.querySelector('.mastery-ring-tooltip');
  if (tooltip) {
    const rows = pillars.map(pillar => {
      const value = pillarData[pillar] || 0;
      const color = PILLAR_COLORS[pillar];
      return `
        <div style="display: flex; align-items: center; margin: 4px 0;">
          <div style="width: 8px; height: 8px; background: ${color}; border-radius: 50%; margin-right: 8px;"></div>
          <span style="margin-right: 8px;">${PILLAR_LABELS[pillar]}:</span>
          <strong>${value}%</strong>
        </div>
      `;
    });
    tooltip.innerHTML = rows.join('');
  }
}

/**
 * Animate pillar completion (when a pillar reaches 100%)
 */
function celebratePillarCompletion(ringContainer, pillarName) {
  const progressCircle = ringContainer.querySelector(`.pillar-progress-${pillarName}`);
  if (!progressCircle) return;

  // Pulse animation
  progressCircle.style.filter = 'drop-shadow(0 0 10px ' + PILLAR_COLORS[pillarName] + ')';
  setTimeout(() => {
    progressCircle.style.filter = 'none';
  }, 1000);
}

/**
 * Get mastery status message based on progress
 */
function getMasteryStatusMessage(pillarData, tier) {
  const avgProgress = (pillarData.accuracy + pillarData.independence +
                       pillarData.transfer + pillarData.retention) / 4;

  if (avgProgress < 30) {
    return "Getting started";
  } else if (avgProgress < 50) {
    return "Making progress";
  } else if (avgProgress < 70) {
    return "Solid progress";
  } else if (avgProgress < 90) {
    return "Getting reliable";
  } else {
    return tier === 'diamond' ? "Mastered!" : "Nearly mastered";
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createMasteryProgressRing,
    updateMasteryProgressRing,
    celebratePillarCompletion,
    getMasteryStatusMessage
  };
}
