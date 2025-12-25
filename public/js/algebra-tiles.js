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
    this.selectedTiles = new Set(); // BUGFIX: Initialize selectedTiles for multiselect
    this.selectionBox = null; // For drag-to-select rectangle
    this.isDraggingSelection = false;

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
              <!-- MODE SELECTOR -->
              <div class="mode-selector-section">
                <label for="modeSelector">Mode:</label>
                <select id="modeSelector" class="mode-selector">
                  <option value="algebra">Algebra Tiles</option>
                  <option value="baseten">Base Ten Blocks</option>
                  <option value="fractions">Fraction Bars</option>
                  <option value="numberline">Number Line</option>
                </select>
              </div>

              <!-- ANNOTATION TOOLS -->
              <div class="tool-palette-section">
                <span class="palette-label">Tools</span>
                <div class="tool-buttons">
                  <button class="tool-btn active" data-tool="select" title="Select/Move">
                    <i class="fas fa-mouse-pointer"></i>
                  </button>
                  <button class="tool-btn" data-tool="text" title="Add Text">
                    <i class="fas fa-font"></i>
                  </button>
                  <button class="tool-btn" data-tool="arrow" title="Draw Arrow">
                    <i class="fas fa-arrow-right"></i>
                  </button>
                  <button class="tool-btn" data-tool="circle" title="Draw Circle">
                    <i class="far fa-circle"></i>
                  </button>
                  <button class="tool-btn" data-tool="eraser" title="Eraser">
                    <i class="fas fa-eraser"></i>
                  </button>
                </div>
              </div>

              <!-- UNDO/REDO -->
              <div class="history-controls">
                <button id="undoBtn" class="history-btn" title="Undo" disabled>
                  <i class="fas fa-undo"></i>
                </button>
                <button id="redoBtn" class="history-btn" title="Redo" disabled>
                  <i class="fas fa-redo"></i>
                </button>
              </div>

              <div class="equation-input-section">
                <input
                  type="text"
                  id="equationInput"
                  placeholder="Enter equation (e.g., 2x + 3 = 15)"
                  class="equation-input"
                  title="Type an expression and click Build It!"
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

              <div class="tile-palette" id="tilePalette">
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

              <!-- TRASH ZONE -->
              <div class="trash-zone" id="trashZone">
                <i class="fas fa-trash-alt"></i>
                <span>Drag here to delete</span>
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
    this.currentMode = 'algebra';
    this.currentTool = 'select';
    this.history = [];
    this.historyIndex = -1;
  }

  setupEventListeners() {
    // Close button
    document.getElementById('closeTilesBtn').addEventListener('click', () => {
      this.close();
    });

    // Mode selector
    document.getElementById('modeSelector').addEventListener('change', (e) => {
      this.switchMode(e.target.value);
    });

    // Tool selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectTool(btn.dataset.tool);
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Undo/Redo
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('redoBtn').addEventListener('click', () => this.redo());

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

    // Trash zone drag events
    const trashZone = document.getElementById('trashZone');
    trashZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      trashZone.classList.add('drag-over');
    });
    trashZone.addEventListener('dragleave', () => {
      trashZone.classList.remove('drag-over');
    });
    trashZone.addEventListener('drop', (e) => {
      e.preventDefault();
      trashZone.classList.remove('drag-over');
      if (this.draggedTile) {
        this.deleteTile(this.draggedTile);
      }
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
      // Algebra tiles
      'positive-unit': 1,
      'negative-unit': -1,
      'x-positive': 'x',
      'x-negative': '-x',
      'y-positive': 'y',
      'y-negative': '-y',
      'xy-positive': 'xy',
      'xy-negative': '-xy',
      'x2-positive': 'x²',
      'x2-negative': '-x²',
      // Base ten blocks
      'hundred': 100,
      'ten': 10,
      'one': 1,
      // Fractions
      'whole': '1',
      'half': '1/2',
      'third': '1/3',
      'fourth': '1/4',
      'fifth': '1/5',
      'sixth': '1/6',
      'eighth': '1/8',
      'tenth': '1/10',
      'twelfth': '1/12',
      // Number line
      'positive-counter': '+1',
      'negative-counter': '-1'
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
      const tileId = parseInt(e.target.dataset.tileId);

      // Multi-select with Shift/Ctrl/Cmd
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (this.selectedTiles.has(tileId)) {
          this.selectedTiles.delete(tileId);
          e.target.classList.remove('selected');
        } else {
          this.selectedTiles.add(tileId);
          e.target.classList.add('selected');
        }
        return;
      }

      // If clicking a selected tile, drag all selected tiles
      const tilesToDrag = this.selectedTiles.has(tileId)
        ? Array.from(this.selectedTiles)
        : [tileId];

      // Get workspace bounds for correct offset calculation
      const workspaceRect = this.workspace.getBoundingClientRect();

      this.draggedTile = {
        element: e.target,
        ids: tilesToDrag,
        startX: e.clientX,
        startY: e.clientY,
        initialPositions: new Map()
      };

      // Store initial positions for all dragged tiles
      tilesToDrag.forEach(id => {
        const tile = this.tiles.find(t => t.id === id);
        const element = document.querySelector(`[data-tile-id="${id}"]`);
        if (tile && element) {
          this.draggedTile.initialPositions.set(id, { x: tile.x, y: tile.y });
          element.classList.add('dragging');
        }
      });
    } else if (e.target === this.workspace || e.target.id === 'workspaceGrid') {
      // Clicked on empty workspace - start selection rectangle
      const rect = this.workspace.getBoundingClientRect();
      this.selectionBox = {
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        currentX: e.clientX - rect.left,
        currentY: e.clientY - rect.top,
        element: null
      };

      // Create visual selection box
      const selectionRect = document.createElement('div');
      selectionRect.className = 'selection-rectangle';
      selectionRect.style.position = 'absolute';
      selectionRect.style.border = '2px dashed #667eea';
      selectionRect.style.background = 'rgba(102, 126, 234, 0.1)';
      selectionRect.style.pointerEvents = 'none';
      selectionRect.style.zIndex = '1000';
      this.workspace.appendChild(selectionRect);
      this.selectionBox.element = selectionRect;
      this.isDraggingSelection = true;

      // Clear previous selection if no modifier key
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        this.selectedTiles.clear();
        document.querySelectorAll('.workspace-tile.selected').forEach(el => {
          el.classList.remove('selected');
        });
      }
    }
  }

  onMouseMove(e) {
    // Use requestAnimationFrame for smooth dragging
    if (!this.rafScheduled) {
      this.rafScheduled = true;
      requestAnimationFrame(() => {
        this.rafScheduled = false;
        this.handleMouseMove(e);
      });
    }
    this.lastMouseEvent = e;
  }

  handleMouseMove(e) {
    const event = this.lastMouseEvent || e;

    if (this.draggedTile) {
      // Calculate how far the mouse has moved since drag started
      const deltaX = event.clientX - this.draggedTile.startX;
      const deltaY = event.clientY - this.draggedTile.startY;

      // Move all dragged tiles together (optimized)
      this.draggedTile.ids.forEach(id => {
        const element = document.querySelector(`[data-tile-id="${id}"]`);
        if (element) {
          element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        }
      });
    } else if (this.isDraggingSelection && this.selectionBox) {
      // Update selection rectangle
      const rect = this.workspace.getBoundingClientRect();
      this.selectionBox.currentX = event.clientX - rect.left;
      this.selectionBox.currentY = event.clientY - rect.top;

      const left = Math.min(this.selectionBox.startX, this.selectionBox.currentX);
      const top = Math.min(this.selectionBox.startY, this.selectionBox.currentY);
      const width = Math.abs(this.selectionBox.currentX - this.selectionBox.startX);
      const height = Math.abs(this.selectionBox.currentY - this.selectionBox.startY);

      if (this.selectionBox.element) {
        this.selectionBox.element.style.left = `${left}px`;
        this.selectionBox.element.style.top = `${top}px`;
        this.selectionBox.element.style.width = `${width}px`;
        this.selectionBox.element.style.height = `${height}px`;
      }

      // Highlight tiles within selection
      this.tiles.forEach(tile => {
        const element = document.querySelector(`[data-tile-id="${tile.id}"]`);
        if (!element) return;

        const tileRect = element.getBoundingClientRect();
        const workspaceRect = this.workspace.getBoundingClientRect();
        const tileLeft = tileRect.left - workspaceRect.left;
        const tileTop = tileRect.top - workspaceRect.top;
        const tileRight = tileLeft + tileRect.width;
        const tileBottom = tileTop + tileRect.height;

        // Check if tile intersects with selection box
        const intersects = !(tileRight < left || tileLeft > left + width ||
                            tileBottom < top || tileTop > top + height);

        if (intersects) {
          element.classList.add('selecting');
        } else {
          element.classList.remove('selecting');
        }
      });
    }
  }

  onMouseUp(e) {
    if (this.draggedTile) {
      // Update positions for all dragged tiles (convert transform to position)
      this.draggedTile.ids.forEach(id => {
        const element = document.querySelector(`[data-tile-id="${id}"]`);
        const tile = this.tiles.find(t => t.id === id);
        const initialPos = this.draggedTile.initialPositions.get(id);

        if (element && tile && initialPos) {
          // Extract translate values from transform
          const transform = element.style.transform;
          const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);

          if (match) {
            const deltaX = parseFloat(match[1]);
            const deltaY = parseFloat(match[2]);

            tile.x = this.snapToGrid(initialPos.x + deltaX);
            tile.y = this.snapToGrid(initialPos.y + deltaY);
          } else {
            // Fallback to current position
            tile.x = this.snapToGrid(parseInt(element.style.left) || tile.x);
            tile.y = this.snapToGrid(parseInt(element.style.top) || tile.y);
          }

          element.style.left = `${tile.x}px`;
          element.style.top = `${tile.y}px`;
          element.style.transform = ''; // Clear transform
          element.classList.remove('dragging');
        }
      });

      // Clear selection after drag
      this.selectedTiles.clear();
      document.querySelectorAll('.workspace-tile.selected').forEach(el => {
        el.classList.remove('selected');
      });

      this.draggedTile = null;
      this.checkForCancellation();
      this.checkForZeroPairs(); // Magic zero-pair animation!
    } else if (this.isDraggingSelection && this.selectionBox) {
      // Finalize selection rectangle
      document.querySelectorAll('.workspace-tile.selecting').forEach(el => {
        const tileId = parseInt(el.dataset.tileId);
        this.selectedTiles.add(tileId);
        el.classList.remove('selecting');
        el.classList.add('selected');
      });

      // Remove selection rectangle
      if (this.selectionBox.element) {
        this.selectionBox.element.remove();
      }

      this.selectionBox = null;
      this.isDraggingSelection = false;
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

  // NEW: Check for zero pairs when tiles are close together (dragged near each other)
  checkForZeroPairs() {
    const pairDistance = 60; // Pixels - how close tiles need to be
    const pairs = [
      ['positive-unit', 'negative-unit'],
      ['x-positive', 'x-negative'],
      ['y-positive', 'y-negative'],
      ['xy-positive', 'xy-negative'],
      ['x2-positive', 'x2-negative'],
      ['positive-counter', 'negative-counter'] // Number line counters
    ];

    const pairsToAnimate = [];

    for (const [posType, negType] of pairs) {
      const posTiles = this.tiles.filter(t => t.type === posType);
      const negTiles = this.tiles.filter(t => t.type === negType);

      // Check each positive tile against negative tiles
      posTiles.forEach(posTile => {
        negTiles.forEach(negTile => {
          // Skip if already paired
          if (pairsToAnimate.some(p => p.tile1.id === posTile.id || p.tile2.id === posTile.id ||
                                        p.tile1.id === negTile.id || p.tile2.id === negTile.id)) {
            return;
          }

          // Calculate distance
          const dx = posTile.x - negTile.x;
          const dy = posTile.y - negTile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < pairDistance) {
            // They're close! Add to pairs to animate
            pairsToAnimate.push({ tile1: posTile, tile2: negTile });
          }
        });
      });
    }

    // Animate all pairs found
    pairsToAnimate.forEach(pair => {
      this.animateZeroPair(pair.tile1, pair.tile2);
    });
  }

  animateZeroPair(tile1, tile2) {
    const el1 = document.querySelector(`[data-tile-id="${tile1.id}"]`);
    const el2 = document.querySelector(`[data-tile-id="${tile2.id}"]`);

    if (el1 && el2) {
      // Add zero-pair animation class
      el1.classList.add('zero-pairing');
      el2.classList.add('zero-pairing');

      // Calculate midpoint
      const midX = (tile1.x + tile2.x) / 2;
      const midY = (tile1.y + tile2.y) / 2;

      // Animate both tiles to midpoint, then explode
      el1.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
      el2.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';

      el1.style.left = `${midX}px`;
      el1.style.top = `${midY}px`;
      el2.style.left = `${midX}px`;
      el2.style.top = `${midY}px`;

      // After meeting, explode/vanish
      setTimeout(() => {
        el1.style.transition = 'all 0.2s ease-out';
        el2.style.transition = 'all 0.2s ease-out';
        el1.style.transform = 'scale(1.5)';
        el2.style.transform = 'scale(1.5)';
        el1.style.opacity = '0';
        el2.style.opacity = '0';

        setTimeout(() => {
          // Remove from DOM and data
          this.tiles = this.tiles.filter(t => t.id !== tile1.id && t.id !== tile2.id);
          el1.remove();
          el2.remove();
          this.updateExpression();
        }, 200);
      }, 300);
    }
  }

  buildFromEquation() {
    const input = document.getElementById('equationInput').value.trim();
    if (!input) {
      alert('Please enter an expression first!');
      return;
    }

    try {
      // Route to appropriate parser based on current mode
      if (this.currentMode === 'algebra') {
        this.buildAlgebraTiles(input);
      } else if (this.currentMode === 'baseten') {
        this.buildBaseTen(input);
      } else if (this.currentMode === 'fractions') {
        this.buildFractions(input);
      } else if (this.currentMode === 'numberline') {
        this.buildNumberLine(input);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }

  // ============================================
  // ALGEBRA TILES BUILDER
  // ============================================

  buildAlgebraTiles(input) {
    this.clearWorkspace();

    // Auto-select mat based on input
    const matSelector = document.getElementById('matSelector');
    if (input.includes('=')) {
      // Has equals sign → Equation mat
      matSelector.value = 'equation';
      this.setMat('equation');

      // Parse and layout left and right sides separately
      const [leftSide, rightSide] = input.split('=').map(s => s.trim());
      const leftTiles = this.parseAlgebraExpression(leftSide);
      const rightTiles = this.parseAlgebraExpression(rightSide);

      this.layoutTilesInZone(leftTiles, 'left');
      this.layoutTilesInZone(rightTiles, 'right');
    } else if (input.includes('*') || input.includes('(')) {
      // Has multiplication → Multiplication mat
      matSelector.value = 'multiplication';
      this.setMat('multiplication');
      const parsed = this.parseAlgebraExpression(input);
      this.layoutTiles(parsed);
    } else {
      // Simple expression
      const parsed = this.parseAlgebraExpression(input);
      this.layoutTiles(parsed);
    }
  }

  parseAlgebraExpression(equation) {
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

  // ============================================
  // BASE TEN BLOCKS BUILDER
  // ============================================

  buildBaseTen(input) {
    // Parse number (e.g., "245", "1567")
    const num = parseInt(input.replace(/[^\d]/g, ''));
    if (isNaN(num) || num < 0) {
      throw new Error('Please enter a positive number (e.g., 245, 1567)');
    }

    this.clearWorkspace();

    // Break down into place values
    const hundreds = Math.floor(num / 100);
    const tens = Math.floor((num % 100) / 10);
    const ones = num % 10;

    const tiles = [];

    // Add hundreds blocks
    for (let i = 0; i < hundreds; i++) {
      tiles.push('hundred');
    }
    // Add tens blocks
    for (let i = 0; i < tens; i++) {
      tiles.push('ten');
    }
    // Add ones blocks
    for (let i = 0; i < ones; i++) {
      tiles.push('one');
    }

    this.layoutTiles(tiles);
  }

  // ============================================
  // FRACTION BARS BUILDER
  // ============================================

  buildFractions(input) {
    // Parse fractions (e.g., "1/2", "3/4 + 1/8", "2/3")
    const fractionPattern = /(\d+)\/(\d+)/g;
    const tiles = [];
    let match;

    while ((match = fractionPattern.exec(input)) !== null) {
      const numerator = parseInt(match[1]);
      const denominator = parseInt(match[2]);

      // Map denominator to tile type
      const denominatorMap = {
        1: 'whole',
        2: 'half',
        3: 'third',
        4: 'fourth',
        5: 'fifth',
        6: 'sixth',
        8: 'eighth',
        10: 'tenth',
        12: 'twelfth'
      };

      const tileType = denominatorMap[denominator];
      if (!tileType) {
        throw new Error(`Fraction 1/${denominator} not supported. Available: 1/2, 1/3, 1/4, 1/5, 1/6, 1/8, 1/10, 1/12`);
      }

      // Add tiles for numerator count
      for (let i = 0; i < numerator; i++) {
        tiles.push(tileType);
      }
    }

    if (tiles.length === 0) {
      throw new Error('No fractions found. Use format: 1/2, 3/4, 2/3 + 1/6');
    }

    this.clearWorkspace();
    this.layoutTiles(tiles);
  }

  // ============================================
  // NUMBER LINE BUILDER
  // ============================================

  buildNumberLine(input) {
    // Parse integer expression (e.g., "-7", "5 + 3", "-4 - 2")
    // Remove spaces and evaluate
    const cleaned = input.replace(/\s+/g, '');

    // Simple parsing for addition/subtraction
    let value = 0;
    try {
      // Basic evaluation - split by + and -
      const parts = cleaned.split(/([+-])/);
      let current = '';

      for (const part of parts) {
        if (part === '+' || part === '-') {
          if (current) {
            value += parseInt(current);
          }
          current = part;
        } else {
          current += part;
        }
      }
      if (current) {
        value += parseInt(current);
      }
    } catch (e) {
      value = parseInt(cleaned);
    }

    if (isNaN(value)) {
      throw new Error('Please enter an integer or expression (e.g., -7, 5 + 3, -4 - 2)');
    }

    this.clearWorkspace();

    const tiles = [];
    const type = value >= 0 ? 'positive-counter' : 'negative-counter';
    for (let i = 0; i < Math.abs(value); i++) {
      tiles.push(type);
    }

    this.layoutTiles(tiles);
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

  // NEW: Layout tiles in specific zones (left/right for equation mat)
  layoutTilesInZone(tileTypes, zone) {
    // Get workspace dimensions to calculate zone boundaries
    const workspaceWidth = this.workspace.offsetWidth || 800;
    const workspaceHeight = this.workspace.offsetHeight || 600;

    // Define zone parameters
    let startX, endX;
    if (zone === 'left') {
      startX = workspaceWidth * 0.08; // 8% from left (inside left box)
      endX = workspaceWidth * 0.42;   // 42% from left (before equals sign at 50%)
    } else if (zone === 'right') {
      startX = workspaceWidth * 0.58; // 58% from left (after equals sign)
      endX = workspaceWidth * 0.92;   // 92% from left (inside right box)
    } else {
      // Default to center
      startX = 50;
      endX = workspaceWidth - 50;
    }

    const startY = 80;  // Below the zone labels
    const spacing = 70;  // Space between tiles
    const maxWidth = endX - startX;
    const tilesPerRow = Math.floor(maxWidth / spacing);

    let currentX = startX;
    let currentY = startY;
    let count = 0;

    for (const type of tileTypes) {
      this.addTile(type, currentX, currentY);

      currentX += spacing;
      count++;

      if (count % tilesPerRow === 0) {
        currentX = startX;
        currentY += spacing;
      }
    }
  }

  clearWorkspace() {
    this.saveState(); // Save to history before clearing
    this.tiles = [];
    this.renderWorkspace();
    this.updateExpression();
  }

  renderWorkspace() {
    this.workspace.innerHTML = '';
    for (const tile of this.tiles) {
      this.renderTile(tile);
    }

    // Re-render mat if one was selected
    const matSelector = document.getElementById('matSelector');
    if (matSelector && matSelector.value !== 'none') {
      this.setMat(matSelector.value);
    }
  }

  deleteTile(tileElement) {
    const tileId = parseInt(tileElement.dataset.tileId);
    this.saveState(); // Save to history
    this.tiles = this.tiles.filter(t => t.id !== tileId);
    tileElement.remove();
    this.updateExpression();
  }

  // ============================================
  // MODE SWITCHING
  // ============================================

  switchMode(mode) {
    this.currentMode = mode;
    this.clearWorkspace();
    this.renderPaletteForMode(mode);

    // Update header title
    const titles = {
      algebra: '🧮 Algebra Tiles',
      baseten: '📊 Base Ten Blocks',
      fractions: '🍰 Fraction Bars',
      numberline: '📏 Number Line'
    };
    document.querySelector('.algebra-tiles-header h2').textContent = titles[mode] || '🧮 Algebra Tiles';

    // Update input placeholder
    const placeholders = {
      algebra: 'Enter equation (e.g., 2x + 3 = 15)',
      baseten: 'Enter number (e.g., 245, 1567)',
      fractions: 'Enter fractions (e.g., 1/2, 3/4 + 1/8)',
      numberline: 'Enter integer (e.g., -7, 5 + 3)'
    };
    const input = document.getElementById('equationInput');
    if (input) {
      input.placeholder = placeholders[mode] || 'Enter expression...';
    }
  }

  renderPaletteForMode(mode) {
    const palette = document.getElementById('tilePalette');

    if (mode === 'algebra') {
      this.renderAlgebraTilesPalette(palette);
    } else if (mode === 'baseten') {
      this.renderBaseTenPalette(palette);
    } else if (mode === 'fractions') {
      this.renderFractionsPalette(palette);
    } else if (mode === 'numberline') {
      this.renderNumberLinePalette(palette);
    }

    // Re-attach tile button listeners
    document.querySelectorAll('.tile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tileType = btn.dataset.type;
        this.addTile(tileType, 100, 100);
      });
    });
  }

  renderAlgebraTilesPalette(palette) {
    palette.innerHTML = `
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
    `;
  }

  renderBaseTenPalette(palette) {
    palette.innerHTML = `
      <div class="palette-section">
        <span class="palette-label">Base 10</span>
        <div class="palette-buttons">
          <button class="tile-btn" data-type="hundred" title="Hundred (100)">
            <div class="tile-preview tile-hundred">100</div>
          </button>
          <button class="tile-btn" data-type="ten" title="Ten (10)">
            <div class="tile-preview tile-ten">10</div>
          </button>
          <button class="tile-btn" data-type="one" title="One (1)">
            <div class="tile-preview tile-one">1</div>
          </button>
        </div>
      </div>
    `;
  }

  renderFractionsPalette(palette) {
    palette.innerHTML = `
      <div class="palette-section">
        <span class="palette-label">Fractions</span>
        <div class="palette-buttons palette-fractions">
          <button class="tile-btn" data-type="whole" title="Whole (1)">
            <div class="tile-preview tile-whole">1</div>
          </button>
          <button class="tile-btn" data-type="half" title="Half (1/2)">
            <div class="tile-preview tile-half">1/2</div>
          </button>
          <button class="tile-btn" data-type="third" title="Third (1/3)">
            <div class="tile-preview tile-third">1/3</div>
          </button>
          <button class="tile-btn" data-type="fourth" title="Fourth (1/4)">
            <div class="tile-preview tile-fourth">1/4</div>
          </button>
          <button class="tile-btn" data-type="fifth" title="Fifth (1/5)">
            <div class="tile-preview tile-fifth">1/5</div>
          </button>
          <button class="tile-btn" data-type="sixth" title="Sixth (1/6)">
            <div class="tile-preview tile-sixth">1/6</div>
          </button>
          <button class="tile-btn" data-type="eighth" title="Eighth (1/8)">
            <div class="tile-preview tile-eighth">1/8</div>
          </button>
          <button class="tile-btn" data-type="tenth" title="Tenth (1/10)">
            <div class="tile-preview tile-tenth">1/10</div>
          </button>
          <button class="tile-btn" data-type="twelfth" title="Twelfth (1/12)">
            <div class="tile-preview tile-twelfth">1/12</div>
          </button>
        </div>
      </div>
    `;
  }

  renderNumberLinePalette(palette) {
    palette.innerHTML = `
      <div class="palette-section">
        <span class="palette-label">Counters</span>
        <div class="palette-buttons">
          <button class="tile-btn" data-type="positive-counter" title="Positive Counter">
            <div class="tile-preview tile-positive-counter">+</div>
          </button>
          <button class="tile-btn" data-type="negative-counter" title="Negative Counter">
            <div class="tile-preview tile-negative-counter">−</div>
          </button>
        </div>
      </div>
    `;
  }

  // ============================================
  // ANNOTATION TOOLS
  // ============================================

  selectTool(tool) {
    this.currentTool = tool;
    this.workspace.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }

  // ============================================
  // UNDO/REDO SYSTEM
  // ============================================

  saveState() {
    // Remove any states after current position (if we've undone)
    this.history = this.history.slice(0, this.historyIndex + 1);

    // Save current state
    const state = {
      tiles: JSON.parse(JSON.stringify(this.tiles)),
      mode: this.currentMode
    };
    this.history.push(state);
    this.historyIndex++;

    // Limit history to 50 states
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIndex--;
    }

    this.updateHistoryButtons();
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreState(this.history[this.historyIndex]);
      this.updateHistoryButtons();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreState(this.history[this.historyIndex]);
      this.updateHistoryButtons();
    }
  }

  restoreState(state) {
    this.tiles = JSON.parse(JSON.stringify(state.tiles));
    this.currentMode = state.mode;
    this.renderWorkspace();
    this.updateExpression();
  }

  updateHistoryButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
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
