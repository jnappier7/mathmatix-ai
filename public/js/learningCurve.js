// learningCurve.js - Learning Curve Visualization & IRT Transparency

class LearningCurveVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.data = null;
    this.stats = null;
  }

  async loadSkillCurve(skillId) {
    try {
      const response = await fetch(`/api/learning-curve/${skillId}`);
      const result = await response.json();

      if (result.success && result.hasData) {
        this.data = result.curveData;
        this.stats = result.stats;
        this.skillInfo = {
          skillId: result.skillId,
          displayName: result.displayName,
          currentTheta: result.currentTheta,
          currentSE: result.currentSE,
          masteryScore: result.masteryScore,
          status: result.status
        };

        this.render();
        this.renderStats();
      } else {
        this.showNoData();
      }
    } catch (error) {
      console.error('Error loading learning curve:', error);
      this.showError();
    }
  }

  async loadOverview() {
    try {
      const response = await fetch('/api/learning-curve/overview');
      const result = await response.json();

      if (result.success) {
        this.renderOverview(result.skills);
      }
    } catch (error) {
      console.error('Error loading overview:', error);
    }
  }

  render() {
    if (!this.ctx || !this.data || this.data.length === 0) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 40;

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw background
    this.ctx.fillStyle = '#f8f9fa';
    this.ctx.fillRect(0, 0, width, height);

    // Calculate scales
    const dataWidth = width - 2 * padding;
    const dataHeight = height - 2 * padding;

    const minTheta = Math.min(...this.data.map(d => d.theta)) - 0.5;
    const maxTheta = Math.max(...this.data.map(d => d.theta)) + 0.5;
    const thetaRange = maxTheta - minTheta;

    const xScale = dataWidth / (this.data.length - 1);
    const yScale = dataHeight / thetaRange;

    // Draw grid lines
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (dataHeight / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(padding, y);
      this.ctx.lineTo(width - padding, y);
      this.ctx.stroke();
    }

    // Draw zero line (if in range)
    if (minTheta <= 0 && maxTheta >= 0) {
      const zeroY = padding + dataHeight - (0 - minTheta) * yScale;
      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(padding, zeroY);
      this.ctx.lineTo(width - padding, zeroY);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Label zero line
      this.ctx.fillStyle = '#333';
      this.ctx.font = '12px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.fillText('θ = 0', padding - 5, zeroY + 4);
    }

    // Draw confidence interval
    this.ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
    this.ctx.beginPath();

    for (let i = 0; i < this.data.length; i++) {
      const x = padding + i * xScale;
      const theta = this.data[i].theta;
      const se = this.data[i].standardError;
      const yUpper = padding + dataHeight - (theta + se - minTheta) * yScale;

      if (i === 0) {
        this.ctx.moveTo(x, yUpper);
      } else {
        this.ctx.lineTo(x, yUpper);
      }
    }

    for (let i = this.data.length - 1; i >= 0; i--) {
      const x = padding + i * xScale;
      const theta = this.data[i].theta;
      const se = this.data[i].standardError;
      const yLower = padding + dataHeight - (theta - se - minTheta) * yScale;
      this.ctx.lineTo(x, yLower);
    }

    this.ctx.closePath();
    this.ctx.fill();

    // Draw learning curve
    this.ctx.strokeStyle = '#667eea';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();

    for (let i = 0; i < this.data.length; i++) {
      const x = padding + i * xScale;
      const y = padding + dataHeight - (this.data[i].theta - minTheta) * yScale;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();

    // Draw data points
    for (let i = 0; i < this.data.length; i++) {
      const x = padding + i * xScale;
      const y = padding + dataHeight - (this.data[i].theta - minTheta) * yScale;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
      this.ctx.fillStyle = this.data[i].correct ? '#4caf50' : '#f44336';
      this.ctx.fill();
      this.ctx.strokeStyle = 'white';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }

    // Draw axes
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;

    // Y-axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding, padding);
    this.ctx.lineTo(padding, height - padding);
    this.ctx.stroke();

    // X-axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding, height - padding);
    this.ctx.lineTo(width - padding, height - padding);
    this.ctx.stroke();

    // Y-axis labels
    this.ctx.fillStyle = '#333';
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const theta = minTheta + (thetaRange / 4) * i;
      const y = padding + dataHeight - (dataHeight / 4) * i;
      this.ctx.fillText(theta.toFixed(1), padding - 5, y + 4);
    }

    // Axis titles
    this.ctx.font = 'bold 14px sans-serif';
    this.ctx.textAlign = 'center';

    // Y-axis title
    this.ctx.save();
    this.ctx.translate(15, height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText('Ability (θ)', 0, 0);
    this.ctx.restore();

    // X-axis title
    this.ctx.fillText('Practice Attempts', width / 2, height - 10);

    // Legend
    this.drawLegend(width - padding - 150, padding + 10);
  }

  drawLegend(x, y) {
    // Correct point
    this.ctx.beginPath();
    this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
    this.ctx.fillStyle = '#4caf50';
    this.ctx.fill();

    this.ctx.fillStyle = '#333';
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Correct', x + 10, y + 4);

    // Incorrect point
    this.ctx.beginPath();
    this.ctx.arc(x, y + 20, 4, 0, 2 * Math.PI);
    this.ctx.fillStyle = '#f44336';
    this.ctx.fill();

    this.ctx.fillStyle = '#333';
    this.ctx.fillText('Incorrect', x + 10, y + 24);

    // Confidence interval
    this.ctx.fillStyle = 'rgba(102, 126, 234, 0.3)';
    this.ctx.fillRect(x - 4, y + 36, 8, 8);

    this.ctx.fillStyle = '#333';
    this.ctx.fillText('Confidence', x + 10, y + 44);
  }

  renderStats() {
    const container = document.getElementById('learningCurveStats');
    if (!container || !this.stats || !this.skillInfo) return;

    const thetaColor = this.skillInfo.currentTheta >= 0 ? '#4caf50' : '#f44336';
    const statusEmoji = {
      'locked': '🔒',
      'ready': '📝',
      'learning': '📚',
      'mastered': '🏆',
      'needs-review': '🔄'
    };

    container.innerHTML = `
      <div class="curve-stats-grid">
        <div class="stat-card">
          <div class="stat-icon">🎯</div>
          <div class="stat-content">
            <div class="stat-label">Current Ability</div>
            <div class="stat-value" style="color: ${thetaColor}">
              θ = ${this.skillInfo.currentTheta.toFixed(2)}
            </div>
            <div class="stat-subtext">
              ± ${this.skillInfo.currentSE.toFixed(2)} (95% confidence)
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📈</div>
          <div class="stat-content">
            <div class="stat-label">Growth</div>
            <div class="stat-value" style="color: #667eea">
              ${this.stats.thetaGrowth >= 0 ? '+' : ''}${this.stats.thetaGrowth}
            </div>
            <div class="stat-subtext">
              ${this.stats.confidenceImprovement}% more confident
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-label">Accuracy</div>
            <div class="stat-value">${this.stats.accuracy}%</div>
            <div class="stat-subtext">
              ${this.stats.correctAttempts}/${this.stats.totalAttempts} correct
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">${statusEmoji[this.skillInfo.status] || '📚'}</div>
          <div class="stat-content">
            <div class="stat-label">Status</div>
            <div class="stat-value">${this.skillInfo.status}</div>
            <div class="stat-subtext">
              ${Math.round(this.skillInfo.masteryScore * 100)}% mastery
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">⏱️</div>
          <div class="stat-content">
            <div class="stat-label">Practice Time</div>
            <div class="stat-value">${this.stats.practiceTime} min</div>
            <div class="stat-subtext">
              ${this.stats.totalAttempts} attempts
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🎓</div>
          <div class="stat-content">
            <div class="stat-label">Skill</div>
            <div class="stat-value-small">${this.skillInfo.displayName}</div>
            <div class="stat-subtext">
              Keep practicing!
            </div>
          </div>
        </div>
      </div>

      <div class="interpretation-card">
        <h4>📊 What This Means</h4>
        <p>${this.getInterpretation()}</p>
      </div>
    `;
  }

  getInterpretation() {
    const theta = this.skillInfo.currentTheta;
    const growth = this.stats.thetaGrowth;
    const accuracy = this.stats.accuracy;

    let interpretation = '';

    // Ability interpretation
    if (theta > 1.5) {
      interpretation += 'You have <strong>advanced ability</strong> in this skill. ';
    } else if (theta > 0.5) {
      interpretation += 'You have <strong>strong ability</strong> in this skill. ';
    } else if (theta > -0.5) {
      interpretation += 'You have <strong>moderate ability</strong> in this skill. ';
    } else {
      interpretation += 'You\'re still <strong>building foundations</strong> in this skill. ';
    }

    // Growth interpretation
    if (growth > 1.0) {
      interpretation += 'Your ability has grown <strong>significantly</strong>! ';
    } else if (growth > 0.5) {
      interpretation += 'You\'ve made <strong>solid progress</strong>. ';
    } else if (growth > 0) {
      interpretation += 'You\'re <strong>gradually improving</strong>. ';
    }

    // Accuracy interpretation
    if (accuracy >= 90) {
      interpretation += 'Your <strong>excellent accuracy</strong> shows deep understanding.';
    } else if (accuracy >= 70) {
      interpretation += 'Your <strong>good accuracy</strong> shows you\'re on the right track.';
    } else {
      interpretation += 'Keep practicing to <strong>build consistency</strong>.';
    }

    return interpretation;
  }

  renderOverview(skills) {
    const container = document.getElementById('skillsOverview');
    if (!container) return;

    if (skills.length === 0) {
      container.innerHTML = `
        <div class="no-skills-message">
          <p>Start practicing skills to see your learning curves!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="skills-grid">
        ${skills.map(skill => this.renderSkillCard(skill)).join('')}
      </div>
    `;
  }

  renderSkillCard(skill) {
    const thetaColor = skill.currentTheta >= 0 ? '#4caf50' : '#f44336';
    const growthIcon = skill.growth >= 0 ? '📈' : '📉';
    const growthColor = skill.growth >= 0 ? '#4caf50' : '#f44336';

    return `
      <div class="skill-overview-card" onclick="window.location.href='/learning-curve.html?skill=${skill.skillId}'">
        <div class="skill-card-header">
          <h4>${skill.displayName}</h4>
          <div class="skill-status">${skill.status}</div>
        </div>

        <div class="skill-card-stats">
          <div class="mini-stat">
            <span class="mini-label">Ability</span>
            <span class="mini-value" style="color: ${thetaColor}">
              θ = ${skill.currentTheta.toFixed(1)}
            </span>
          </div>

          <div class="mini-stat">
            <span class="mini-label">Growth ${growthIcon}</span>
            <span class="mini-value" style="color: ${growthColor}">
              ${skill.growth >= 0 ? '+' : ''}${skill.growth.toFixed(1)}
            </span>
          </div>

          <div class="mini-stat">
            <span class="mini-label">Mastery</span>
            <span class="mini-value">
              ${Math.round(skill.masteryScore * 100)}%
            </span>
          </div>
        </div>

        <div class="skill-card-footer">
          <span>${skill.practiceCount} attempts</span>
          <span>→ View Curve</span>
        </div>
      </div>
    `;
  }

  showNoData() {
    const container = document.getElementById('learningCurveContainer');
    if (container) {
      container.innerHTML = `
        <div class="no-data-message">
          <h3>No Practice Data Yet</h3>
          <p>Start practicing this skill to see your learning curve!</p>
        </div>
      `;
    }
  }

  showError() {
    const container = document.getElementById('learningCurveContainer');
    if (container) {
      container.innerHTML = `
        <div class="error-message">
          <h3>Error Loading Data</h3>
          <p>Please try again later.</p>
        </div>
      `;
    }
  }
}

// Initialize on page load
let curveVisualizer;

document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on the learning curve page
  const canvas = document.getElementById('learningCurveCanvas');
  if (canvas) {
    curveVisualizer = new LearningCurveVisualizer('learningCurveCanvas');

    // Check for skillId in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const skillId = urlParams.get('skill');

    if (skillId) {
      curveVisualizer.loadSkillCurve(skillId);
    }
  }

  // Check if we're on the overview page
  const overviewContainer = document.getElementById('skillsOverview');
  if (overviewContainer) {
    if (!curveVisualizer) {
      curveVisualizer = new LearningCurveVisualizer(null);
    }
    curveVisualizer.loadOverview();
  }
});
