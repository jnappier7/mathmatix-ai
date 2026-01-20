// ============================================
// SPLIT-SCREEN RESIZER
// Draggable divider for whiteboard/tiles split-screen
// ============================================

class SplitScreenResizer {
  constructor() {
    this.isDragging = false;
    this.currentPosition = 50; // Default 50% split
    this.minWidth = 30; // Minimum 30% for either side
    this.maxWidth = 70; // Maximum 70% for either side

    this.divider = null;
    this.chatContainer = null;
    this.activePanel = null; // 'whiteboard' or 'tiles'

    console.log('📏 Split-Screen Resizer initialized');
  }

  /**
   * Enable resizable split for whiteboard
   */
  enableForWhiteboard() {
    this.activePanel = 'whiteboard';
    this.chatContainer = document.getElementById('chat-container');

    // Load saved position
    const savedPosition = localStorage.getItem('whiteboardSplitPosition');
    if (savedPosition) {
      this.currentPosition = parseFloat(savedPosition);
    }

    this.createDivider();
    this.applyLayout();

    console.log('📏 Resizable split enabled for whiteboard');
  }

  /**
   * Enable resizable split for algebra tiles
   */
  enableForTiles() {
    this.activePanel = 'tiles';
    this.chatContainer = document.getElementById('chat-container');

    // Load saved position (separate from whiteboard)
    const savedPosition = localStorage.getItem('tilesSplitPosition');
    if (savedPosition) {
      this.currentPosition = parseFloat(savedPosition);
    }

    this.createDivider();
    this.applyLayout();

    console.log('📏 Resizable split enabled for algebra tiles');
  }

  /**
   * Create the draggable divider element
   */
  createDivider() {
    // Remove existing divider if any
    const existing = document.getElementById('split-screen-divider');
    if (existing) {
      existing.remove();
    }

    // Create divider
    this.divider = document.createElement('div');
    this.divider.id = 'split-screen-divider';
    this.divider.className = 'split-screen-divider';
    this.divider.innerHTML = `
      <div class="divider-handle">
        <div class="divider-grip"></div>
      </div>
    `;

    // Add to body
    document.body.appendChild(this.divider);

    // Position divider
    this.updateDividerPosition();

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup drag event listeners
   */
  setupEventListeners() {
    if (!this.divider) return;

    // Mouse events
    this.divider.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => this.stopDrag());

    // Touch events for mobile
    this.divider.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
    document.addEventListener('touchend', () => this.stopDrag());

    // Double-click to reset to 50/50
    this.divider.addEventListener('dblclick', () => this.resetPosition());
  }

  /**
   * Start dragging
   */
  startDrag(e) {
    this.isDragging = true;
    this.divider.classList.add('dragging');
    document.body.classList.add('resizing-split');

    // Prevent text selection during drag
    e.preventDefault();
  }

  /**
   * Handle drag movement
   */
  onDrag(e) {
    if (!this.isDragging) return;

    e.preventDefault();

    // Get mouse/touch position
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;

    // Calculate percentage position
    const windowWidth = window.innerWidth;
    let newPosition = (clientX / windowWidth) * 100;

    // Clamp to min/max
    newPosition = Math.max(this.minWidth, Math.min(this.maxWidth, newPosition));

    // Update position
    this.currentPosition = newPosition;
    this.updateDividerPosition();
    this.applyLayout();
  }

  /**
   * Stop dragging
   */
  stopDrag() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.divider.classList.remove('dragging');
    document.body.classList.remove('resizing-split');

    // Save position to localStorage
    const key = this.activePanel === 'whiteboard' ? 'whiteboardSplitPosition' : 'tilesSplitPosition';
    localStorage.setItem(key, this.currentPosition.toString());

    console.log(`📏 Split position saved: ${this.currentPosition.toFixed(1)}%`);
  }

  /**
   * Reset to 50/50 split
   */
  resetPosition() {
    this.currentPosition = 50;
    this.updateDividerPosition();
    this.applyLayout();

    // Save reset position
    const key = this.activePanel === 'whiteboard' ? 'whiteboardSplitPosition' : 'tilesSplitPosition';
    localStorage.setItem(key, '50');

    console.log('📏 Split reset to 50/50');
  }

  /**
   * Update divider visual position
   */
  updateDividerPosition() {
    if (!this.divider) return;

    this.divider.style.left = `${this.currentPosition}%`;
  }

  /**
   * Apply layout changes to chat and panel
   */
  applyLayout() {
    if (!this.chatContainer) return;

    // Update chat container width
    this.chatContainer.style.width = `${this.currentPosition}%`;

    // Update whiteboard or tiles panel
    if (this.activePanel === 'whiteboard') {
      const whiteboardPanel = document.getElementById('whiteboard-panel');
      if (whiteboardPanel) {
        whiteboardPanel.style.left = `${this.currentPosition}%`;
        whiteboardPanel.style.width = `${100 - this.currentPosition}%`;
      }
    } else if (this.activePanel === 'tiles') {
      const tilesModal = document.querySelector('.algebra-tiles-modal');
      if (tilesModal) {
        tilesModal.style.left = `${this.currentPosition}%`;
        tilesModal.style.width = `${100 - this.currentPosition}%`;
      }
    }
  }

  /**
   * Disable resizable split and cleanup
   */
  disable() {
    if (this.divider) {
      this.divider.remove();
      this.divider = null;
    }

    // Reset chat container
    if (this.chatContainer) {
      this.chatContainer.style.width = '';
    }

    // Reset panel
    if (this.activePanel === 'whiteboard') {
      const whiteboardPanel = document.getElementById('whiteboard-panel');
      if (whiteboardPanel) {
        whiteboardPanel.style.left = '';
        whiteboardPanel.style.width = '';
      }
    } else if (this.activePanel === 'tiles') {
      const tilesModal = document.querySelector('.algebra-tiles-modal');
      if (tilesModal) {
        tilesModal.style.left = '';
        tilesModal.style.width = '';
      }
    }

    document.body.classList.remove('resizing-split');
    this.activePanel = null;

    console.log('📏 Resizable split disabled');
  }
}

// Create global instance
window.splitScreenResizer = new SplitScreenResizer();

console.log('✅ Split-Screen Resizer loaded');
