// ============================================
// WHITEBOARD PHASE 2 ENHANCEMENTS
// AI Presence, Visual Pointers, Region Overlays
// ============================================

/**
 * Phase 2 Enhancement Module
 * Adds visual enhancements to make AI teaching presence more obvious
 */

class WhiteboardPhase2Enhancements {
    constructor(whiteboard) {
        this.whiteboard = whiteboard;
        this.ghostCursor = null;
        this.ghostCursorTrail = [];
        this.pointerLines = [];
        this.regionOverlayVisible = false;
        this.regionOverlayElements = [];

        console.log('📐 Phase 2 Enhancements loading...');
        this.initialize();
    }

    initialize() {
        this.createGhostCursor();
        this.createPointerLineContainer();
        this.createRegionOverlay();
        this.setupControls();

        console.log('✅ Phase 2 Enhancements ready');
    }

    // ============================================
    // GHOST CURSOR SYSTEM
    // ============================================

    createGhostCursor() {
        // Create SVG ghost cursor element
        const cursorSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        cursorSVG.id = 'ai-ghost-cursor';
        cursorSVG.style.cssText = `
            position: absolute;
            width: 40px;
            height: 40px;
            pointer-events: none;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
            filter: drop-shadow(0 2px 4px rgba(18, 179, 179, 0.3));
        `;

        // Pen cursor icon (teal, stylized)
        cursorSVG.innerHTML = `
            <g transform="translate(5, 5)">
                <!-- Pen body -->
                <path d="M10 2 L2 10 L5 13 L13 5 Z"
                      fill="#12B3B3"
                      stroke="#0ea5a5"
                      stroke-width="1.5"/>
                <!-- Pen tip -->
                <circle cx="2" cy="10" r="3"
                        fill="#0ea5a5"
                        opacity="0.8"/>
                <!-- Writing point indicator -->
                <circle cx="0" cy="12" r="2"
                        fill="#12B3B3"
                        opacity="0.6">
                    <animate attributeName="opacity"
                             values="0.6;1;0.6"
                             dur="1.5s"
                             repeatCount="indefinite"/>
                </circle>
                <!-- Label -->
                <text x="16" y="8"
                      font-family="Arial, sans-serif"
                      font-size="10"
                      fill="#12B3B3"
                      font-weight="600">AI</text>
            </g>
        `;

        document.body.appendChild(cursorSVG);
        this.ghostCursor = cursorSVG;
    }

    showGhostCursor() {
        if (!this.ghostCursor) return;
        this.ghostCursor.style.opacity = '1';
        console.log('👻 Ghost cursor visible');
    }

    hideGhostCursor() {
        if (!this.ghostCursor) return;
        this.ghostCursor.style.opacity = '0';
        console.log('👻 Ghost cursor hidden');
    }

    /**
     * Smooth animated cursor movement
     * @param {number} x - Target X coordinate (canvas space)
     * @param {number} y - Target Y coordinate (canvas space)
     * @param {number} duration - Animation duration in ms
     */
    async moveGhostCursor(x, y, duration = 500) {
        if (!this.ghostCursor) return;

        // Convert canvas coordinates to screen coordinates
        const canvasRect = this.whiteboard.canvas.getElement().getBoundingClientRect();
        const screenX = canvasRect.left + x;
        const screenY = canvasRect.top + y;

        // Animate position
        this.ghostCursor.style.transition = `left ${duration}ms cubic-bezier(0.4, 0, 0.2, 1),
                                             top ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        this.ghostCursor.style.left = `${screenX}px`;
        this.ghostCursor.style.top = `${screenY}px`;

        // Add trail effect (optional)
        this.addCursorTrail(screenX, screenY);

        await this.sleep(duration);
    }

    addCursorTrail(x, y) {
        // Create fading trail dot
        const trail = document.createElement('div');
        trail.style.cssText = `
            position: absolute;
            left: ${x + 8}px;
            top: ${y + 8}px;
            width: 6px;
            height: 6px;
            background: #12B3B3;
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            opacity: 0.6;
            animation: trail-fade 1s ease-out forwards;
        `;

        document.body.appendChild(trail);
        this.ghostCursorTrail.push(trail);

        // Remove after animation
        setTimeout(() => {
            trail.remove();
            this.ghostCursorTrail = this.ghostCursorTrail.filter(t => t !== trail);
        }, 1000);
    }

    // ============================================
    // VISUAL POINTER LINES (Chat → Board)
    // ============================================

    createPointerLineContainer() {
        // Create SVG overlay for pointer lines
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'board-pointer-lines';
        svg.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 9998;
        `;

        document.body.appendChild(svg);
        this.pointerLineContainer = svg;
    }

    /**
     * Draw visual pointer from chat message to board object
     * @param {HTMLElement} chatMessage - Chat message element
     * @param {string} objectId - Semantic object ID on board
     * @param {string} type - Anchor type ('error', 'hint', 'teacher')
     * @returns {Object} Pointer line reference
     */
    createPointerLine(chatMessage, objectId, type = 'teacher') {
        if (!this.pointerLineContainer) return null;

        const obj = this.whiteboard.semanticObjects.get(objectId);
        if (!obj) {
            console.warn(`[Phase2] Object ${objectId} not found for pointer`);
            return null;
        }

        // Get positions
        const msgRect = chatMessage.getBoundingClientRect();
        const canvasRect = this.whiteboard.canvas.getElement().getBoundingClientRect();
        const fabricObj = obj.fabricObject;

        // Start: Right edge of chat message
        const startX = msgRect.right;
        const startY = msgRect.top + msgRect.height / 2;

        // End: Center of board object
        const endX = canvasRect.left + fabricObj.left + fabricObj.width / 2;
        const endY = canvasRect.top + fabricObj.top + fabricObj.height / 2;

        // Color based on type
        const colors = {
            'error': '#ff6b6b',
            'hint': '#fbbf24',
            'teacher': '#12B3B3',
            'student': '#3b82f6'
        };
        const color = colors[type] || colors.teacher;

        // Create SVG path (curved line)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // Control point for curve (midpoint offset)
        const controlX = startX + (endX - startX) * 0.5;
        const controlY = startY + (endY - startY) * 0.5 - 30; // Slight upward curve

        const pathData = `M ${startX} ${startY} Q ${controlX} ${controlY}, ${endX} ${endY}`;

        path.setAttribute('d', pathData);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0');
        path.setAttribute('stroke-dasharray', '5,5');
        path.style.transition = 'opacity 0.3s ease';

        // Add arrowhead at end
        const arrowSize = 8;
        const angle = Math.atan2(endY - controlY, endX - controlX);
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const arrowPoints = `
            ${endX},${endY}
            ${endX - arrowSize * Math.cos(angle - Math.PI / 6)},${endY - arrowSize * Math.sin(angle - Math.PI / 6)}
            ${endX - arrowSize * Math.cos(angle + Math.PI / 6)},${endY - arrowSize * Math.sin(angle + Math.PI / 6)}
        `;
        arrow.setAttribute('points', arrowPoints);
        arrow.setAttribute('fill', color);
        arrow.setAttribute('opacity', '0');
        arrow.style.transition = 'opacity 0.3s ease';

        this.pointerLineContainer.appendChild(path);
        this.pointerLineContainer.appendChild(arrow);

        // Animate in
        requestAnimationFrame(() => {
            path.setAttribute('opacity', '0.7');
            arrow.setAttribute('opacity', '0.8');
        });

        const pointerRef = {
            path: path,
            arrow: arrow,
            messageId: chatMessage.id,
            objectId: objectId
        };

        this.pointerLines.push(pointerRef);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            this.removePointerLine(pointerRef);
        }, 3000);

        return pointerRef;
    }

    removePointerLine(pointerRef) {
        if (!pointerRef) return;

        // Fade out
        pointerRef.path.setAttribute('opacity', '0');
        pointerRef.arrow.setAttribute('opacity', '0');

        setTimeout(() => {
            pointerRef.path.remove();
            pointerRef.arrow.remove();
            this.pointerLines = this.pointerLines.filter(p => p !== pointerRef);
        }, 300);
    }

    clearAllPointers() {
        this.pointerLines.forEach(pointer => {
            pointer.path.remove();
            pointer.arrow.remove();
        });
        this.pointerLines = [];
    }

    // ============================================
    // REGION OVERLAY SYSTEM
    // ============================================

    createRegionOverlay() {
        const canvas = this.whiteboard.canvas;
        if (!canvas) return;

        const canvasContainer = canvas.getElement().parentElement;

        // Create overlay container
        const overlayDiv = document.createElement('div');
        overlayDiv.id = 'region-overlay';
        overlayDiv.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 10;
        `;

        // Draw region boundaries
        const regions = this.whiteboard.regions;
        const width = canvas.width;
        const height = canvas.height;

        for (const [name, region] of Object.entries(regions)) {
            const regionDiv = document.createElement('div');
            regionDiv.className = 'region-overlay-box';
            regionDiv.style.cssText = `
                position: absolute;
                left: ${region.x * 100}%;
                top: ${region.y * 100}%;
                width: ${region.width * 100}%;
                height: ${region.height * 100}%;
                border: 2px dashed ${region.locked ? '#ef4444' : '#3b82f6'};
                background: ${region.locked ? 'rgba(239, 68, 68, 0.05)' : 'rgba(59, 130, 246, 0.05)'};
                box-sizing: border-box;
            `;

            // Add label
            const label = document.createElement('div');
            label.className = 'region-label';
            label.textContent = region.label;
            label.style.cssText = `
                position: absolute;
                top: 8px;
                left: 8px;
                background: ${region.locked ? '#ef4444' : '#3b82f6'};
                color: white;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;

            regionDiv.appendChild(label);
            overlayDiv.appendChild(regionDiv);
            this.regionOverlayElements.push(regionDiv);
        }

        canvasContainer.style.position = 'relative';
        canvasContainer.appendChild(overlayDiv);
        this.regionOverlay = overlayDiv;
    }

    toggleRegionOverlay() {
        if (!this.regionOverlay) return;

        this.regionOverlayVisible = !this.regionOverlayVisible;
        this.regionOverlay.style.opacity = this.regionOverlayVisible ? '1' : '0';

        console.log(`[Phase2] Region overlay ${this.regionOverlayVisible ? 'shown' : 'hidden'}`);

        return this.regionOverlayVisible;
    }

    showRegionOverlay() {
        if (!this.regionOverlay) return;
        this.regionOverlayVisible = true;
        this.regionOverlay.style.opacity = '1';
    }

    hideRegionOverlay() {
        if (!this.regionOverlay) return;
        this.regionOverlayVisible = false;
        this.regionOverlay.style.opacity = '0';
    }

    // ============================================
    // UI CONTROLS
    // ============================================

    setupControls() {
        // Add region toggle button to toolbar
        const toolbar = this.whiteboard.panel.querySelector('.whiteboard-toolbar');
        if (!toolbar) return;

        // Find or create actions section
        let actionsSection = toolbar.querySelector('.toolbar-section:last-child');
        if (!actionsSection) return;

        // Add region overlay toggle button
        const regionToggleBtn = document.createElement('button');
        regionToggleBtn.className = 'toolbar-btn';
        regionToggleBtn.id = 'region-overlay-toggle';
        regionToggleBtn.setAttribute('data-tooltip', 'Toggle Region Guides');
        regionToggleBtn.setAttribute('title', 'Show/Hide Board Regions');
        regionToggleBtn.innerHTML = '<i class="fas fa-border-all"></i>';
        regionToggleBtn.addEventListener('click', () => {
            const isVisible = this.toggleRegionOverlay();
            regionToggleBtn.classList.toggle('active', isVisible);
        });

        // Insert before download button
        const downloadBtn = actionsSection.querySelector('#download-btn');
        if (downloadBtn) {
            actionsSection.insertBefore(regionToggleBtn, downloadBtn);
        } else {
            actionsSection.appendChild(regionToggleBtn);
        }
    }

    // ============================================
    // UTILITIES
    // ============================================

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    cleanup() {
        // Remove all enhancements
        if (this.ghostCursor) this.ghostCursor.remove();
        if (this.pointerLineContainer) this.pointerLineContainer.remove();
        if (this.regionOverlay) this.regionOverlay.remove();

        this.ghostCursorTrail.forEach(trail => trail.remove());
        this.clearAllPointers();

        console.log('🧹 Phase 2 Enhancements cleaned up');
    }
}

// ============================================
// ENHANCED WHITEBOARD METHODS
// Replace the TODOs with actual implementations
// ============================================

// Extend MathmatixWhiteboard with Phase 2 capabilities
if (typeof MathmatixWhiteboard !== 'undefined') {
    // Store original methods
    const originalShowAIThinking = MathmatixWhiteboard.prototype.showAIThinking;
    const originalHideAIThinking = MathmatixWhiteboard.prototype.hideAIThinking;
    const originalMoveAICursor = MathmatixWhiteboard.prototype.moveAICursor;

    // Enhanced showAIThinking with ghost cursor
    MathmatixWhiteboard.prototype.showAIThinking = function() {
        originalShowAIThinking.call(this);
        if (this.phase2 && this.phase2.showGhostCursor) {
            this.phase2.showGhostCursor();
        }
    };

    // Enhanced hideAIThinking
    MathmatixWhiteboard.prototype.hideAIThinking = function() {
        originalHideAIThinking.call(this);
        if (this.phase2 && this.phase2.hideGhostCursor) {
            this.phase2.hideGhostCursor();
        }
    };

    // Enhanced moveAICursor with smooth animation
    MathmatixWhiteboard.prototype.moveAICursor = async function(x, y, duration = 500) {
        this.aiCursorPosition = { x, y };
        if (this.phase2 && this.phase2.moveGhostCursor) {
            await this.phase2.moveGhostCursor(x, y, duration);
        } else {
            await this.sleep(duration);
        }
    };

    console.log('✅ Enhanced whiteboard methods patched');
}

// ============================================
// CSS INJECTION
// ============================================

const phase2Styles = document.createElement('style');
phase2Styles.textContent = `
/* Ghost Cursor Trail Animation */
@keyframes trail-fade {
    0% {
        opacity: 0.6;
        transform: scale(1);
    }
    100% {
        opacity: 0;
        transform: scale(0.5);
    }
}

/* Region Overlay Animations */
.region-overlay-box {
    animation: region-pulse 2s ease-in-out infinite;
}

@keyframes region-pulse {
    0%, 100% {
        border-opacity: 0.4;
    }
    50% {
        border-opacity: 0.8;
    }
}

.region-label {
    animation: label-entrance 0.3s ease-out;
}

@keyframes label-entrance {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Pointer Line Pulsing */
@keyframes pointer-pulse {
    0%, 100% {
        stroke-opacity: 0.7;
    }
    50% {
        stroke-opacity: 1;
    }
}

/* Region Toggle Button Active State */
#region-overlay-toggle.active {
    background: #3b82f6;
    color: white;
}

/* Ghost Cursor Glow Effect */
#ai-ghost-cursor {
    animation: cursor-glow 2s ease-in-out infinite;
}

@keyframes cursor-glow {
    0%, 100% {
        filter: drop-shadow(0 2px 4px rgba(18, 179, 179, 0.3));
    }
    50% {
        filter: drop-shadow(0 4px 8px rgba(18, 179, 179, 0.6));
    }
}
`;

document.head.appendChild(phase2Styles);

// ============================================
// AUTO-INITIALIZATION
// ============================================

// Initialize Phase 2 when whiteboard is ready
document.addEventListener('DOMContentLoaded', () => {
    const checkWhiteboard = setInterval(() => {
        if (window.whiteboard && window.whiteboard.canvas) {
            window.whiteboard.phase2 = new WhiteboardPhase2Enhancements(window.whiteboard);
            clearInterval(checkWhiteboard);
            console.log('✅ Phase 2 Enhancements initialized');
        }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkWhiteboard), 10000);
});

console.log('📐 Whiteboard Phase 2 module loaded');
