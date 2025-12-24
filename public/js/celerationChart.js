// celerationChart.js - Standard Celeration Chart for Fact Fluency (Precision Teaching)

class CelerationChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.data = null;
    this.stats = null;
  }

  async loadData(operation, familyName) {
    try {
      const response = await fetch(`/api/celeration/${operation}/${familyName}`);
      const result = await response.json();

      if (result.success && result.hasData) {
        this.data = result.sessions;
        this.stats = result.stats;
        this.operation = result.operation;
        this.familyName = result.familyName;
        this.displayName = result.displayName;
        this.mastered = result.mastered;

        this.render();
        this.renderStats();
      } else {
        this.showNoData();
      }
    } catch (error) {
      console.error('Error loading celeration data:', error);
      this.showError();
    }
  }

  render() {
    if (!this.ctx || !this.data || this.data.length === 0) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 60;

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw background
    this.ctx.fillStyle = '#fafafa';
    this.ctx.fillRect(0, 0, width, height);

    // Calculate dimensions
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Semi-log scale for rate (log base 10)
    const minRate = 1; // Start at 1 digit/min
    const maxRate = 100; // Go up to 100 digits/min
    const logMin = Math.log10(minRate);
    const logMax = Math.log10(maxRate);
    const logRange = logMax - logMin;

    // Time scale (sessions)
    const sessionCount = this.data.length;
    const xScale = chartWidth / Math.max(sessionCount - 1, 1);

    // Helper: Convert rate to Y coordinate (log scale)
    const rateToY = (rate) => {
      const logRate = Math.log10(Math.max(rate, 0.1));
      const normalized = (logRate - logMin) / logRange;
      return padding + chartHeight - (normalized * chartHeight);
    };

    // Draw grid lines (at 1, 2, 5, 10, 20, 50, 100)
    const gridValues = [1, 2, 5, 10, 20, 50, 100];
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 1;

    gridValues.forEach(rate => {
      const y = rateToY(rate);
      this.ctx.beginPath();
      this.ctx.moveTo(padding, y);
      this.ctx.lineTo(width - padding, y);
      this.ctx.stroke();

      // Label
      this.ctx.fillStyle = '#666';
      this.ctx.font = '11px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(rate, padding - 5, y + 4);
    });

    // Draw aim line (fluency aim)
    const aimY = rateToY(this.stats.aim);
    this.ctx.strokeStyle = '#4caf50';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(padding, aimY);
    this.ctx.lineTo(width - padding, aimY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Aim label
    this.ctx.fillStyle = '#4caf50';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Aim: ${this.stats.aim}/min`, width - padding + 5, aimY + 4);

    // Draw celeration line (trend line)
    if (this.stats.celeration && this.data.length >= 2) {
      const firstSession = this.data[0];
      const lastSession = this.data[this.data.length - 1];

      // Calculate trend line based on celeration
      const weeksElapsed = (new Date(lastSession.date) - new Date(firstSession.date)) / (7 * 24 * 60 * 60 * 1000);
      const firstRate = firstSession.rate;
      const projectedLastRate = firstRate * Math.pow(this.stats.celeration, weeksElapsed);

      const x1 = padding;
      const y1 = rateToY(firstRate);
      const x2 = padding + (sessionCount - 1) * xScale;
      const y2 = rateToY(projectedLastRate);

      this.ctx.strokeStyle = '#667eea';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Draw data points and connecting line
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    this.data.forEach((session, i) => {
      const x = padding + i * xScale;
      const y = rateToY(session.rate);

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();

    // Draw data points
    this.data.forEach((session, i) => {
      const x = padding + i * xScale;
      const y = rateToY(session.rate);

      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, 2 * Math.PI);

      // Color based on accuracy
      if (session.accuracy >= 95) {
        this.ctx.fillStyle = '#4caf50'; // Green: excellent
      } else if (session.accuracy >= 85) {
        this.ctx.fillStyle = '#ff9800'; // Orange: good
      } else {
        this.ctx.fillStyle = '#f44336'; // Red: needs work
      }

      this.ctx.fill();
      this.ctx.strokeStyle = 'white';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    });

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

    // Axis labels
    this.ctx.fillStyle = '#333';
    this.ctx.font = 'bold 14px sans-serif';

    // Y-axis label
    this.ctx.save();
    this.ctx.translate(15, height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Correct Per Minute (Log Scale)', 0, 0);
    this.ctx.restore();

    // X-axis label
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Practice Sessions (Successive Calendar Days)', width / 2, height - 15);

    // Title
    this.ctx.font = 'bold 16px sans-serif';
    this.ctx.fillText(`Celeration Chart: ${this.displayName}`, width / 2, 25);

    // Legend
    this.drawLegend(width - padding - 180, padding + 40);
  }

  drawLegend(x, y) {
    const items = [
      { color: '#4caf50', label: '95%+ Accuracy' },
      { color: '#ff9800', label: '85-94% Accuracy' },
      { color: '#f44336', label: '<85% Accuracy' },
      { color: '#667eea', label: 'Celeration Trend', dashed: true }
    ];

    items.forEach((item, i) => {
      const itemY = y + i * 22;

      if (item.dashed) {
        this.ctx.strokeStyle = item.color;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(x, itemY);
        this.ctx.lineTo(x + 20, itemY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(x + 10, itemY, 5, 0, 2 * Math.PI);
        this.ctx.fillStyle = item.color;
        this.ctx.fill();
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }

      this.ctx.fillStyle = '#333';
      this.ctx.font = '11px sans-serif';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(item.label, x + 25, itemY + 4);
    });
  }

  renderStats() {
    const container = document.getElementById('celerationStats');
    if (!container || !this.stats) return;

    const celerationText = this.stats.celeration
      ? `×${this.stats.celeration.toFixed(2)} per week`
      : 'Need more data';

    const improvementText = this.stats.weeklyImprovement
      ? `+${this.stats.weeklyImprovement}% per week`
      : 'Calculating...';

    const projectedText = this.stats.projectedAimDate
      ? new Date(this.stats.projectedAimDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : this.stats.atAim ? 'At aim!' : 'Keep practicing';

    const statusColor = this.stats.atAim ? '#4caf50' : '#ff9800';
    const statusText = this.stats.atAim ? 'FLUENT!' : 'Building Fluency';

    container.innerHTML = `
      <div class="celeration-stats-grid">
        <div class="celeration-stat-card">
          <div class="stat-icon">🎯</div>
          <div class="stat-content">
            <div class="stat-label">Current Speed</div>
            <div class="stat-value">${this.stats.currentRate} /min</div>
            <div class="stat-subtext">Best: ${this.stats.bestRate} /min</div>
          </div>
        </div>

        <div class="celeration-stat-card">
          <div class="stat-icon">📈</div>
          <div class="stat-content">
            <div class="stat-label">Celeration</div>
            <div class="stat-value">${celerationText}</div>
            <div class="stat-subtext">${improvementText}</div>
          </div>
        </div>

        <div class="celeration-stat-card">
          <div class="stat-icon">🏁</div>
          <div class="stat-content">
            <div class="stat-label">Fluency Aim</div>
            <div class="stat-value">${this.stats.aim} /min</div>
            <div class="stat-subtext">Morningside standard</div>
          </div>
        </div>

        <div class="celeration-stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-content">
            <div class="stat-label">Projected Aim Date</div>
            <div class="stat-value-small">${projectedText}</div>
            <div class="stat-subtext">At current rate</div>
          </div>
        </div>

        <div class="celeration-stat-card">
          <div class="stat-icon">⭐</div>
          <div class="stat-content">
            <div class="stat-label">Status</div>
            <div class="stat-value" style="color: ${statusColor}">${statusText}</div>
            <div class="stat-subtext">${this.stats.totalSessions} sessions</div>
          </div>
        </div>

        <div class="celeration-stat-card ${this.mastered ? 'mastered' : ''}">
          <div class="stat-icon">${this.mastered ? '🏆' : '📚'}</div>
          <div class="stat-content">
            <div class="stat-label">Mastery</div>
            <div class="stat-value">${this.mastered ? 'MASTERED' : 'In Progress'}</div>
            <div class="stat-subtext">${this.mastered ? 'Keep it up!' : 'Keep practicing'}</div>
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
    const { currentRate, aim, celeration, atAim } = this.stats;

    if (atAim) {
      return `<strong>Excellent!</strong> You've reached the fluency aim of ${aim} digits per minute. You can recall these facts automatically, which frees up your brain to focus on more complex math. Keep practicing to maintain your speed!`;
    }

    if (!celeration) {
      return 'Complete more practice sessions to see your improvement rate. Consistent practice is key to building fluency!';
    }

    if (celeration >= 1.5) {
      return `<strong>Outstanding progress!</strong> Your speed is multiplying by ${celeration.toFixed(2)}× each week. At this rate, you're improving rapidly. This shows your practice is highly effective!`;
    } else if (celeration >= 1.2) {
      return `<strong>Good progress!</strong> Your speed is improving steadily at ${celeration.toFixed(2)}× per week. You're on the right track—keep up the consistent practice!`;
    } else if (celeration >= 1.0) {
      return `You're improving slightly. To speed up your progress, try: (1) practicing daily, (2) using flashcards between sessions, or (3) working on accuracy first, then speed.`;
    } else {
      return `Your speed isn't improving yet. This is normal at first! Focus on <strong>accuracy</strong> (95%+) before worrying about speed. Speed comes naturally once you know the facts.`;
    }
  }

  showNoData() {
    const container = document.getElementById('celerationContainer');
    if (container) {
      container.innerHTML = `
        <div class="no-data-message">
          <h3>No Celeration Data Yet</h3>
          <p>Complete at least 2 practice sessions to see your celeration chart!</p>
        </div>
      `;
    }
  }

  showError() {
    const container = document.getElementById('celerationContainer');
    if (container) {
      container.innerHTML = `
        <div class="error-message">
          <h3>Error Loading Chart</h3>
          <p>Please try again later.</p>
        </div>
      `;
    }
  }
}

// Student-friendly "Speed Progress" view (simplified celeration)
class SpeedProgressView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  async loadData(operation, familyName) {
    try {
      const response = await fetch(`/api/celeration/${operation}/${familyName}`);
      const result = await response.json();

      if (result.success && result.hasData) {
        this.data = result.sessions;
        this.stats = result.stats;
        this.displayName = result.displayName;
        this.render();
      }
    } catch (error) {
      console.error('Error loading speed progress:', error);
    }
  }

  render() {
    if (!this.container || !this.data) return;

    const improvement = this.stats.weeklyImprovement || 0;
    const emoji = improvement > 20 ? '🚀' : improvement > 10 ? '📈' : improvement > 0 ? '➡️' : '🔄';

    this.container.innerHTML = `
      <div class="speed-progress-card">
        <div class="speed-header">
          <h3>${emoji} Your Speed Progress</h3>
          <div class="speed-subtitle">${this.displayName}</div>
        </div>

        <div class="speed-gauge">
          <div class="gauge-current">
            <div class="gauge-value">${this.stats.currentRate}</div>
            <div class="gauge-label">digits/min</div>
          </div>
          <div class="gauge-arrow">→</div>
          <div class="gauge-goal">
            <div class="gauge-value">${this.stats.aim}</div>
            <div class="gauge-label">goal</div>
          </div>
        </div>

        <div class="speed-bar-container">
          <div class="speed-bar">
            <div class="speed-bar-fill" style="width: ${Math.min((this.stats.currentRate / this.stats.aim) * 100, 100)}%"></div>
          </div>
          <div class="speed-percentage">${Math.round((this.stats.currentRate / this.stats.aim) * 100)}% there!</div>
        </div>

        ${improvement > 0 ? `
          <div class="speed-improvement">
            <div class="improvement-badge">
              Getting ${improvement}% faster each week!
            </div>
          </div>
        ` : ''}

        ${this.stats.projectedAimDate && !this.stats.atAim ? `
          <div class="speed-projection">
            You'll reach your goal around <strong>${new Date(this.stats.projectedAimDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong> if you keep practicing!
          </div>
        ` : ''}

        ${this.stats.atAim ? `
          <div class="speed-success">
            🎉 You're FLUENT! You can recall these facts automatically!
          </div>
        ` : ''}
      </div>
    `;
  }
}

// Initialize on page load
let celerationChart;
let speedProgressView;

document.addEventListener('DOMContentLoaded', () => {
  // Check for celeration chart canvas
  const canvas = document.getElementById('celerationCanvas');
  if (canvas) {
    celerationChart = new CelerationChart('celerationCanvas');

    // Check for URL params
    const urlParams = new URLSearchParams(window.location.search);
    const operation = urlParams.get('operation');
    const family = urlParams.get('family');

    if (operation && family) {
      celerationChart.loadData(operation, family);
    }
  }

  // Check for speed progress view
  const speedContainer = document.getElementById('speedProgressContainer');
  if (speedContainer) {
    speedProgressView = new SpeedProgressView('speedProgressContainer');

    const urlParams = new URLSearchParams(window.location.search);
    const operation = urlParams.get('operation');
    const family = urlParams.get('family');

    if (operation && family) {
      speedProgressView.loadData(operation, family);
    }
  }
});
