/**
 * ALGEBRA TILES WORKSPACE
 *
 * Interactive manipulative tool for visual algebra learning
 * Supports: integer tiles, x, y, xy, x² tiles
 * Features: drag-and-drop, auto-cancellation, equation parsing
 */

class AlgebraTiles {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.workspace = null;
    this.tiles = [];
    this.tileIdCounter = 0;
    this.draggedTile = null;
    this.gridSize = 20; // Snap-to-grid size in pixels

    this.init();
  }

  init() {
    this.createWorkspace();
    this.setupEventListeners();
  }

  createWorkspace() {
    this.container.innerHTML = `
      <div class="algebra-tiles-modal" id="algebraTilesModal">
        <div class="algebra-tiles-content">
          <div class="algebra-tiles-header">
            <h2>🧮 Algebra Tiles</h2>
            <button class="close-btn" id="closeTilesBtn">&times;</button>
          </div>

          <div class="algebra-tiles-main">
            <!-- LEFT SIDEBAR: Compact controls + tile palette -->
            <div class="algebra-tiles-sidebar">
              <div class="equation-input-section">
                <input
                  type="text"
                  id="equationInput"
                  placeholder="Enter equation..."
                  class="equation-input"
                  title="Enter equation (e.g., 2x + 3, x² - 4x + 4)"
                />
                <button id="buildItBtn" class="build-it-btn">🚀</button>
                <button id="clearWorkspaceBtn" class="clear-btn">Clear</button>
              </div>

              <div class="mat-selector-section">
                <label for="matSelector">Mat:</label>
                <select id="matSelector" class="mat-selector">
                  <option value="none">None</option>
                  <option value="equation">Equation</option>
                  <option value="expression">Expression</option>
                  <option value="multiplication">Multiplication</option>
                  <option value="factoring">Factoring</option>
                  <option value="integer">Integer</option>
                </select>
              </div>

              <div class="mat-opacity-section">
                <label for="matOpacity">Opacity:</label>
                <input type="range" id="matOpacity" min="0" max="100" value="30" />
                <span id="matOpacityValue">30%</span>
              </div>

              <div class="tile-palette">
                <div class="palette-section">
                  <span class="palette-label">Integers</span>
                  <div class="palette-buttons">
                    <button class="tile-btn" data-type="positive-unit" title="Positive Unit (+1)">
                      <div class="tile-preview tile-positive-unit">+1</div>
                    </button>
                    <button class="tile-btn" data-type="negative-unit" title="Negative Unit (-1)">
                      <div class="tile-preview tile-negative-unit">-1</div>
                    </button>
                  </div>
                </div>

                <div class="palette-section">
                  <span class="palette-label">Variables</span>
                  <div class="palette-buttons">
                    <button class="tile-btn" data-type="x-positive" title="Positive x">
                      <div class="tile-preview tile-x-positive">x</div>
                    </button>
                    <button class="tile-btn" data-type="x-negative" title="Negative x">
                      <div class="tile-preview tile-x-negative">-x</div>
                    </button>
                    <button class="tile-btn" data-type="y-positive" title="Positive y">
                      <div class="tile-preview tile-y-positive">y</div>
                    </button>
                    <button class="tile-btn" data-type="y-negative" title="Negative y">
                      <div class="tile-preview tile-y-negative">-y</div>
                    </button>
                  </div>
                </div>

                <div class="palette-section">
                  <span class="palette-label">Products</span>
                  <div class="palette-buttons">
                    <button class="tile-btn" data-type="xy-positive" title="Positive xy">
                      <div class="tile-preview tile-xy-positive">xy</div>
                    </button>
                    <button class="tile-btn" data-type="xy-negative" title="Negative xy">
                      <div class="tile-preview tile-xy-negative">-xy</div>
                    </button>
                    <button class="tile-btn" data-type="x2-positive" title="Positive x²">
                      <div class="tile-preview tile-x2-positive">x²</div>
                    </button>
                    <button class="tile-btn" data-type="x2-negative" title="Negative x²">
                      <div class="tile-preview tile-x2-negative">-x²</div>
                    </button>
                  </div>
                </div>
              </div>

              <div class="expression-display" id="expressionDisplay">
                <strong>Expression:</strong> <span id="currentExpression">0</span>
              </div>
              <div class="tile-count" id="tileCount">
                <strong>Tiles:</strong> <span id="tileCountValue">0</span>
              </div>
              <button id="sendToAIBtn" class="send-to-ai-btn">📤 Send to AI</button>
            </div>

            <!-- RIGHT: Large workspace (bulk of space) -->
            <div class="algebra-tiles-workspace" id="tilesWorkspace">
              <div class="workspace-grid" id="workspaceGrid">
                <!-- Tiles will be added here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.workspace = document.getElementById('workspaceGrid');
  }

  setupEventListeners() {
    // Close button
    document.getElementById('closeTilesBtn').addEventListener('click', () => {
      this.close();
    });

    // Build It button
    document.getElementById('buildItBtn').addEventListener('click', () => {
      this.buildFromEquation();
    });

    // Clear workspace
    document.getElementById('clearWorkspaceBtn').addEventListener('click', () => {
      this.clearWorkspace();
    });

    // Send to AI button
    document.getElementById('sendToAIBtn').addEventListener('click', () => {
      this.sendToAI();
    });

    // Enter key in equation input
    document.getElementById('equationInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.buildFromEquation();
      }
    });

    // Tile palette buttons
    document.querySelectorAll('.tile-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tileType = btn.dataset.type;
        this.addTile(tileType, 100, 100); // Add at default position
      });
    });

    // Mat selector
    const matSelector = document.getElementById('matSelector');
    if (matSelector) {
      matSelector.addEventListener('change', (e) => {
        this.setMat(e.target.value);
      });
    }

    // Mat opacity slider
    const matOpacity = document.getElementById('matOpacity');
    const matOpacityValue = document.getElementById('matOpacityValue');
    if (matOpacity && matOpacityValue) {
      matOpacity.addEventListener('input', (e) => {
        const opacity = e.target.value;
        matOpacityValue.textContent = `${opacity}%`;
        this.setMatOpacity(opacity / 100);
      });
    }

    // Workspace drag listeners
    this.workspace.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Touch support
    this.workspace.addEventListener('touchstart', (e) => this.onTouchStart(e));
    document.addEventListener('touchmove', (e) => this.onTouchMove(e));
    document.addEventListener('touchend', (e) => this.onTouchEnd(e));
  }

  addTile(type, x, y) {
    const tile = {
      id: this.tileIdCounter++,
      type: type,
      x: this.snapToGrid(x),
      y: this.snapToGrid(y),
      value: this.getTileValue(type)
    };

    this.tiles.push(tile);
    this.renderTile(tile);
    this.updateExpression();
    this.checkForCancellation();
  }

  getTileValue(type) {
    const values = {
      'positive-unit': 1,
      'negative-unit': -1,
      'x-positive': 'x',
      'x-negative': '-x',
      'y-positive': 'y',
      'y-negative': '-y',
      'xy-positive': 'xy',
      'xy-negative': '-xy',
      'x2-positive': 'x²',
      'x2-negative': '-x²'
    };
    return values[type] || 0;
  }

  renderTile(tile) {
    const tileElement = document.createElement('div');
    tileElement.className = `workspace-tile tile-${tile.type}`;
    tileElement.dataset.tileId = tile.id;
    tileElement.style.left = `${tile.x}px`;
    tileElement.style.top = `${tile.y}px`;
    tileElement.innerHTML = this.getTileLabel(tile.type);
    tileElement.draggable = true;
    tileElement.title = 'Drag to move, click to flip positive/negative';

    // Add click handler for flipping positive/negative
    tileElement.addEventListener('click', (e) => {
      if (!this.draggedTile) {
        this.flipTile(tile.id);
      }
    });

    this.workspace.appendChild(tileElement);
  }

  flipTile(tileId) {
    const tile = this.tiles.find(t => t.id === tileId);
    if (!tile) return;

    // Mapping of tile types to their opposites
    const flipMap = {
      'positive-unit': 'negative-unit',
      'negative-unit': 'positive-unit',
      'x-positive': 'x-negative',
      'x-negative': 'x-positive',
      'y-positive': 'y-negative',
      'y-negative': 'y-positive',
      'xy-positive': 'xy-negative',
      'xy-negative': 'xy-positive',
      'x2-positive': 'x2-negative',
      'x2-negative': 'x2-positive'
    };

    const newType = flipMap[tile.type];
    if (newType) {
      tile.type = newType;
      tile.value = this.getTileValue(newType);

      // Animate flip
      const tileElement = this.workspace.querySelector(`[data-tile-id="${tileId}"]`);
      if (tileElement) {
        tileElement.style.animation = 'flipTile 0.3s ease';
        setTimeout(() => {
          this.renderWorkspace();
          this.updateExpression();
        }, 150);
      }
    }
  }

  getTileLabel(type) {
    const labels = {
      'positive-unit': '+1',
      'negative-unit': '-1',
      'x-positive': 'x',
      'x-negative': '-x',
      'y-positive': 'y',
      'y-negative': '-y',
      'xy-positive': 'xy',
      'xy-negative': '-xy',
      'x2-positive': 'x²',
      'x2-negative': '-x²'
    };
    return labels[type] || '';
  }

  onMouseDown(e) {
    if (e.target.classList.contains('workspace-tile')) {
      this.draggedTile = {
        element: e.target,
        id: parseInt(e.target.dataset.tileId),
        offsetX: e.clientX - e.target.offsetLeft,
        offsetY: e.clientY - e.target.offsetTop
      };
      e.target.classList.add('dragging');
    }
  }

  onMouseMove(e) {
    if (this.draggedTile) {
      const x = e.clientX - this.draggedTile.offsetX;
      const y = e.clientY - this.draggedTile.offsetY;

      this.draggedTile.element.style.left = `${x}px`;
      this.draggedTile.element.style.top = `${y}px`;
    }
  }

  onMouseUp(e) {
    if (this.draggedTile) {
      const x = parseInt(this.draggedTile.element.style.left);
      const y = parseInt(this.draggedTile.element.style.top);

      // Update tile position in data
      const tile = this.tiles.find(t => t.id === this.draggedTile.id);
      if (tile) {
        tile.x = this.snapToGrid(x);
        tile.y = this.snapToGrid(y);
        this.draggedTile.element.style.left = `${tile.x}px`;
        this.draggedTile.element.style.top = `${tile.y}px`;
      }

      this.draggedTile.element.classList.remove('dragging');
      this.draggedTile = null;

      this.checkForCancellation();
    }
  }

  onTouchStart(e) {
    if (e.target.classList.contains('workspace-tile')) {
      const touch = e.touches[0];
      this.draggedTile = {
        element: e.target,
        id: parseInt(e.target.dataset.tileId),
        offsetX: touch.clientX - e.target.offsetLeft,
        offsetY: touch.clientY - e.target.offsetTop
      };
      e.target.classList.add('dragging');
    }
  }

  onTouchMove(e) {
    if (this.draggedTile) {
      e.preventDefault();
      const touch = e.touches[0];
      const x = touch.clientX - this.draggedTile.offsetX;
      const y = touch.clientY - this.draggedTile.offsetY;

      this.draggedTile.element.style.left = `${x}px`;
      this.draggedTile.element.style.top = `${y}px`;
    }
  }

  onTouchEnd(e) {
    this.onMouseUp(e);
  }

  snapToGrid(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  checkForCancellation() {
    // Group tiles by position (within grid threshold)
    const positions = new Map();

    for (const tile of this.tiles) {
      const posKey = `${tile.x},${tile.y}`;
      if (!positions.has(posKey)) {
        positions.set(posKey, []);
      }
      positions.get(posKey).push(tile);
    }

    // Check each position for cancellation opportunities
    for (const [posKey, tilesAtPos] of positions) {
      if (tilesAtPos.length >= 2) {
        this.cancelTilesAtPosition(tilesAtPos);
      }
    }
  }

  cancelTilesAtPosition(tilesAtPos) {
    // Find opposite pairs that cancel
    const cancellationPairs = [
      ['positive-unit', 'negative-unit'],
      ['x-positive', 'x-negative'],
      ['y-positive', 'y-negative'],
      ['xy-positive', 'xy-negative'],
      ['x2-positive', 'x2-negative']
    ];

    for (const [pos, neg] of cancellationPairs) {
      const posTile = tilesAtPos.find(t => t.type === pos);
      const negTile = tilesAtPos.find(t => t.type === neg);

      if (posTile && negTile) {
        // Animate cancellation
        this.animateCancellation(posTile.id, negTile.id);

        // Remove tiles
        this.tiles = this.tiles.filter(t => t.id !== posTile.id && t.id !== negTile.id);
        this.renderWorkspace();
        this.updateExpression();

        // Recursive check for more cancellations
        setTimeout(() => this.checkForCancellation(), 300);
        return;
      }
    }
  }

  animateCancellation(id1, id2) {
    const el1 = this.workspace.querySelector(`[data-tile-id="${id1}"]`);
    const el2 = this.workspace.querySelector(`[data-tile-id="${id2}"]`);

    if (el1) el1.classList.add('canceling');
    if (el2) el2.classList.add('canceling');
  }

  buildFromEquation() {
    const equation = document.getElementById('equationInput').value.trim();
    if (!equation) {
      alert('Please enter an equation first!');
      return;
    }

    try {
      const parsed = this.parseEquation(equation);
      this.clearWorkspace();
      this.layoutTiles(parsed);
    } catch (error) {
      alert(`Error parsing equation: ${error.message}`);
    }
  }

  parseEquation(equation) {
    // Remove spaces
    equation = equation.replace(/\s+/g, '');

    const tiles = [];

    // Parse x² terms
    const x2Pattern = /([+-]?\d*)x²/g;
    let match;
    while ((match = x2Pattern.exec(equation)) !== null) {
      const coef = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : parseInt(match[1]);
      const type = coef >= 0 ? 'x2-positive' : 'x2-negative';
      for (let i = 0; i < Math.abs(coef); i++) {
        tiles.push(type);
      }
    }

    // Parse xy terms
    const xyPattern = /([+-]?\d*)xy/g;
    while ((match = xyPattern.exec(equation)) !== null) {
      const coef = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : parseInt(match[1]);
      const type = coef >= 0 ? 'xy-positive' : 'xy-negative';
      for (let i = 0; i < Math.abs(coef); i++) {
        tiles.push(type);
      }
    }

    // Parse x terms (but not x² or xy)
    const xPattern = /([+-]?\d*)x(?!²|y)/g;
    while ((match = xPattern.exec(equation)) !== null) {
      const coef = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : parseInt(match[1]);
      const type = coef >= 0 ? 'x-positive' : 'x-negative';
      for (let i = 0; i < Math.abs(coef); i++) {
        tiles.push(type);
      }
    }

    // Parse y terms (but not xy)
    const yPattern = /([+-]?\d*)y(?!x)/g;
    while ((match = yPattern.exec(equation)) !== null) {
      const coef = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : parseInt(match[1]);
      const type = coef >= 0 ? 'y-positive' : 'y-negative';
      for (let i = 0; i < Math.abs(coef); i++) {
        tiles.push(type);
      }
    }

    // Parse constant terms
    const constantPattern = /([+-]?\d+)(?![xy])/g;
    while ((match = constantPattern.exec(equation)) !== null) {
      const value = parseInt(match[1]);
      const type = value >= 0 ? 'positive-unit' : 'negative-unit';
      for (let i = 0; i < Math.abs(value); i++) {
        tiles.push(type);
      }
    }

    return tiles;
  }

  layoutTiles(tileTypes) {
    const startX = 50;
    const startY = 50;
    const spacing = 80;
    let currentX = startX;
    let currentY = startY;
    const maxPerRow = 8;
    let count = 0;

    for (const type of tileTypes) {
      this.addTile(type, currentX, currentY);

      currentX += spacing;
      count++;

      if (count % maxPerRow === 0) {
        currentX = startX;
        currentY += spacing;
      }
    }
  }

  clearWorkspace() {
    this.tiles = [];
    this.renderWorkspace();
    this.updateExpression();
  }

  renderWorkspace() {
    this.workspace.innerHTML = '';
    for (const tile of this.tiles) {
      this.renderTile(tile);
    }
  }

  updateExpression() {
    const counts = {
      'x²': 0,
      'xy': 0,
      'x': 0,
      'y': 0,
      'constant': 0
    };

    for (const tile of this.tiles) {
      if (tile.type === 'x2-positive') counts['x²']++;
      else if (tile.type === 'x2-negative') counts['x²']--;
      else if (tile.type === 'xy-positive') counts['xy']++;
      else if (tile.type === 'xy-negative') counts['xy']--;
      else if (tile.type === 'x-positive') counts['x']++;
      else if (tile.type === 'x-negative') counts['x']--;
      else if (tile.type === 'y-positive') counts['y']++;
      else if (tile.type === 'y-negative') counts['y']--;
      else if (tile.type === 'positive-unit') counts['constant']++;
      else if (tile.type === 'negative-unit') counts['constant']--;
    }

    const terms = [];
    if (counts['x²'] !== 0) terms.push(this.formatTerm(counts['x²'], 'x²'));
    if (counts['xy'] !== 0) terms.push(this.formatTerm(counts['xy'], 'xy'));
    if (counts['x'] !== 0) terms.push(this.formatTerm(counts['x'], 'x'));
    if (counts['y'] !== 0) terms.push(this.formatTerm(counts['y'], 'y'));
    if (counts['constant'] !== 0) terms.push(counts['constant'].toString());

    const expression = terms.length > 0 ? terms.join(' + ').replace(/\+ -/g, '- ') : '0';
    document.getElementById('currentExpression').textContent = expression;
    document.getElementById('tileCountValue').textContent = this.tiles.length;
  }

  formatTerm(coefficient, variable) {
    if (coefficient === 1) return variable;
    if (coefficient === -1) return `-${variable}`;
    return `${coefficient}${variable}`;
  }

  // ============================================
  // MAT SYSTEM
  // ============================================

  setMat(matType) {
    // Remove existing mat if any
    const existingMat = this.workspace.querySelector('.algebra-mat');
    if (existingMat) {
      existingMat.remove();
    }

    if (matType === 'none') return;

    // Create mat overlay
    const mat = document.createElement('div');
    mat.className = 'algebra-mat';
    mat.dataset.matType = matType;
    mat.style.opacity = document.getElementById('matOpacity')?.value / 100 || 0.3;

    // Render specific mat type
    switch (matType) {
      case 'equation':
        this.renderEquationMat(mat);
        break;
      case 'expression':
        this.renderExpressionMat(mat);
        break;
      case 'multiplication':
        this.renderMultiplicationMat(mat);
        break;
      case 'factoring':
        this.renderFactoringMat(mat);
        break;
      case 'integer':
        this.renderIntegerMat(mat);
        break;
    }

    this.workspace.appendChild(mat);
  }

  setMatOpacity(opacity) {
    const mat = this.workspace.querySelector('.algebra-mat');
    if (mat) {
      mat.style.opacity = opacity;
    }
  }

  renderEquationMat(mat) {
    mat.innerHTML = `
      <svg width="100%" height="100%" style="position: absolute; top: 0; left: 0; pointer-events: none;">
        <!-- Left side label -->
        <text x="25%" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#4a5568">LEFT SIDE</text>

        <!-- Right side label -->
        <text x="75%" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#4a5568">RIGHT SIDE</text>

        <!-- Vertical divider (equals sign) -->
        <line x1="50%" y1="50" x2="50%" y2="95%" stroke="#4a5568" stroke-width="3" stroke-dasharray="10,5"/>
        <text x="50%" y="50%" text-anchor="middle" font-size="32" font-weight="bold" fill="#2d3748">=</text>

        <!-- Left box -->
        <rect x="5%" y="50" width="40%" height="calc(100% - 70px)" fill="none" stroke="#cbd5e0" stroke-width="2" rx="8"/>

        <!-- Right box -->
        <rect x="55%" y="50" width="40%" height="calc(100% - 70px)" fill="none" stroke="#cbd5e0" stroke-width="2" rx="8"/>
      </svg>
    `;
  }

  renderExpressionMat(mat) {
    mat.innerHTML = `
      <svg width="100%" height="100%" style="position: absolute; top: 0; left: 0; pointer-events: none;">
        <!-- Title -->
        <text x="50%" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#4a5568">COMBINE LIKE TERMS</text>

        <!-- Zones for different term types -->
        <text x="20%" y="70" text-anchor="middle" font-size="14" fill="#4a5568">x² terms</text>
        <rect x="10%" y="80" width="20%" height="30%" fill="none" stroke="#cbd5e0" stroke-width="2" rx="6"/>

        <text x="50%" y="70" text-anchor="middle" font-size="14" fill="#4a5568">x terms</text>
        <rect x="40%" y="80" width="20%" height="30%" fill="none" stroke="#cbd5e0" stroke-width="2" rx="6"/>

        <text x="80%" y="70" text-anchor="middle" font-size="14" fill="#4a5568">Constants</text>
        <rect x="70%" y="80" width="20%" height="30%" fill="none" stroke="#cbd5e0" stroke-width="2" rx="6"/>

        <!-- Work area -->
        <text x="50%" y="calc(30% + 100px)" text-anchor="middle" font-size="14" fill="#4a5568">↓ Simplified Expression ↓</text>
        <rect x="25%" y="calc(30% + 120px)" width="50%" height="calc(70% - 140px)" fill="none" stroke="#48bb78" stroke-width="3" stroke-dasharray="8,4" rx="8"/>
      </svg>
    `;
  }

  renderMultiplicationMat(mat) {
    mat.innerHTML = `
      <svg width="100%" height="100%" style="position: absolute; top: 0; left: 0; pointer-events: none;">
        <!-- Title -->
        <text x="50%" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#4a5568">AREA MODEL (Width × Height)</text>

        <!-- Grid for area model -->
        <rect x="15%" y="15%" width="70%" height="70%" fill="none" stroke="#cbd5e0" stroke-width="3"/>

        <!-- Subdivisions (2x2 grid for FOIL) -->
        <line x1="50%" y1="15%" x2="50%" y2="85%" stroke="#cbd5e0" stroke-width="2" stroke-dasharray="5,3"/>
        <line x1="15%" y1="50%" x2="85%" y2="50%" stroke="#cbd5e0" stroke-width="2" stroke-dasharray="5,3"/>

        <!-- Labels -->
        <text x="30%" y="12%" text-anchor="middle" font-size="14" fill="#4a5568">Width →</text>
        <text x="12%" y="30%" text-anchor="middle" font-size="14" fill="#4a5568" transform="rotate(-90, 12%, 30%)">Height →</text>
      </svg>
    `;
  }

  renderFactoringMat(mat) {
    mat.innerHTML = `
      <svg width="100%" height="100%" style="position: absolute; top: 0; left: 0; pointer-events: none;">
        <!-- Title -->
        <text x="50%" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#4a5568">BUILD A RECTANGLE TO FACTOR</text>

        <!-- Work area with grid -->
        <rect x="20%" y="15%" width="60%" height="70%" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="8,4"/>

        <!-- Instructions -->
        <text x="50%" y="90%" text-anchor="middle" font-size="14" fill="#4a5568">Arrange tiles into a rectangle. Dimensions = factors!</text>
      </svg>
    `;
  }

  renderIntegerMat(mat) {
    mat.innerHTML = `
      <svg width="100%" height="100%" style="position: absolute; top: 0; left: 0; pointer-events: none;">
        <!-- Title -->
        <text x="50%" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#4a5568">ZERO PAIRS</text>

        <!-- Positive zone -->
        <text x="25%" y="60" text-anchor="middle" font-size="14" fill="#4a5568">Positive (+)</text>
        <rect x="10%" y="70" width="30%" height="calc(100% - 90px)" fill="rgba(72, 187, 120, 0.1)" stroke="#48bb78" stroke-width="2" rx="8"/>

        <!-- Negative zone -->
        <text x="75%" y="60" text-anchor="middle" font-size="14" fill="#4a5568">Negative (−)</text>
        <rect x="60%" y="70" width="30%" height="calc(100% - 90px)" fill="rgba(239, 68, 68, 0.1)" stroke="#ef4444" stroke-width="2" rx="8"/>

        <!-- Zero pair indicator -->
        <circle cx="50%" cy="50%" r="40" fill="none" stroke="#a0aec0" stroke-width="2" stroke-dasharray="5,3"/>
        <text x="50%" y="50%" text-anchor="middle" font-size="12" fill="#a0aec0">+1 and −1</text>
        <text x="50%" y="calc(50% + 15px)" text-anchor="middle" font-size="12" fill="#a0aec0">cancel to 0</text>
      </svg>
    `;
  }

  open() {
    document.getElementById('algebraTilesModal').classList.add('active');
  }

  close() {
    document.getElementById('algebraTilesModal').classList.remove('active');
  }

  sendToAI() {
    const expression = document.getElementById('currentExpression').textContent;

    if (expression === '0' || this.tiles.length === 0) {
      alert('Build an expression with tiles first!');
      return;
    }

    // Construct message for AI
    const message = `I built this expression with algebra tiles: ${expression}`;

    // Find the chat input and send message (works for both regular chat and mastery mode)
    const chatInput = document.getElementById('userInput') ||
                      document.getElementById('chatInput') ||
                      document.getElementById('mastery-input');
    const sendButton = document.getElementById('sendBtn') ||
                       document.getElementById('sendButton') ||
                       document.getElementById('mastery-send-btn');

    if (chatInput && sendButton) {
      chatInput.value = message;
      chatInput.focus();

      // Optional: auto-send or let user review
      // sendButton.click(); // Uncomment to auto-send

      // Close tiles modal so user can see chat
      this.close();

      // Show confirmation
      const expressionDisplay = document.getElementById('expressionDisplay');
      expressionDisplay.style.backgroundColor = '#d4edda';
      setTimeout(() => {
        expressionDisplay.style.backgroundColor = '';
      }, 1000);
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(message).then(() => {
        alert('Expression copied to clipboard! Paste it into the chat.');
      });
    }
  }
}

// Initialize algebra tiles when DOM is ready
let algebraTiles = null;

function initAlgebraTiles() {
  if (!algebraTiles) {
    algebraTiles = new AlgebraTiles('algebraTilesContainer');
  }
}

function openAlgebraTiles() {
  if (!algebraTiles) {
    initAlgebraTiles();
  }
  algebraTiles.open();
}

function closeAlgebraTiles() {
  if (algebraTiles) {
    algebraTiles.close();
  }
}

// Auto-initialize on DOM ready and hook up button
document.addEventListener('DOMContentLoaded', () => {
  // Initialize algebra tiles
  initAlgebraTiles();

  // Hook up button in chat page
  const algebraTilesBtn = document.getElementById('algebra-tiles-btn');
  if (algebraTilesBtn) {
    algebraTilesBtn.addEventListener('click', () => {
      openAlgebraTiles();
    });
  }
});
