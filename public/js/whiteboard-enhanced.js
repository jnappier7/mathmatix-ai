// ============================================
// WHITEBOARD ENHANCEMENTS - 3X BETTER
// Smart canvas management, high-level commands, visual emphasis
// ============================================

class WhiteboardEnhancer {
    constructor(whiteboard) {
        this.whiteboard = whiteboard;
        this.canvasState = {
            regions: {
                topLeft: { x: 50, y: 50, width: 200, height: 150, occupied: false },
                topCenter: { x: 270, y: 50, width: 200, height: 150, occupied: false },
                topRight: { x: 490, y: 50, width: 200, height: 150, occupied: false },
                middleLeft: { x: 50, y: 220, width: 200, height: 150, occupied: false },
                middleCenter: { x: 270, y: 220, width: 200, height: 150, occupied: false },
                middleRight: { x: 490, y: 220, width: 200, height: 150, occupied: false },
                bottomLeft: { x: 50, y: 390, width: 200, height: 100, occupied: false },
                bottomCenter: { x: 270, y: 390, width: 200, height: 100, occupied: false },
                bottomRight: { x: 490, y: 390, width: 200, height: 100, occupied: false }
            },
            elements: [],
            lastPosition: { x: 50, y: 50 }
        };

        // Visual emphasis colors
        this.colors = {
            given: '#3b82f6',      // Blue for given information
            unknown: '#ef4444',    // Red for unknowns/questions
            emphasis: '#f59e0b',   // Amber for emphasis
            correct: '#10b981',    // Green for correct answers
            neutral: '#2d3748'     // Dark gray for neutral content
        };

        console.log('✨ Whiteboard Enhancer initialized');
    }

    // ============================================
    // HIGH-LEVEL GEOMETRY COMMANDS
    // ============================================

    /**
     * Create a perfectly formatted triangle problem
     * @param {Object} angles - {A: 30, B: 70, C: '?'} or {A: 30, B: '?', C: 50}
     * @param {string} type - 'find-angle', 'find-side', 'prove'
     */
    async createTriangleProblem(angles, type = 'find-angle') {
        const region = this.getAvailableRegion('middleCenter');

        if (!region) {
            console.warn('[Enhancer] No available region for triangle');
            return;
        }

        // Calculate good triangle vertices within region
        const centerX = region.x + region.width / 2;
        const centerY = region.y + region.height / 2;
        const size = Math.min(region.width, region.height) * 0.7;

        // Vertices for a nice-looking triangle
        const vertices = {
            A: { x: centerX - size/2, y: centerY + size/3 },
            B: { x: centerX + size/2, y: centerY + size/3 },
            C: { x: centerX, y: centerY - size/2 }
        };

        // Draw triangle with hand-drawn style
        if (this.whiteboard.handwriting) {
            // Draw sides sequentially
            await this.drawHandDrawnLine(vertices.A.x, vertices.A.y, vertices.B.x, vertices.B.y);
            await this.delay(300);
            await this.drawHandDrawnLine(vertices.B.x, vertices.B.y, vertices.C.x, vertices.C.y);
            await this.delay(300);
            await this.drawHandDrawnLine(vertices.C.x, vertices.C.y, vertices.A.x, vertices.A.y);
            await this.delay(500);
        }

        // Label vertices
        await this.addLabel(vertices.A.x - 15, vertices.A.y + 15, 'A', this.colors.neutral);
        await this.delay(200);
        await this.addLabel(vertices.B.x + 15, vertices.B.y + 15, 'B', this.colors.neutral);
        await this.delay(200);
        await this.addLabel(vertices.C.x, vertices.C.y - 20, 'C', this.colors.neutral);
        await this.delay(400);

        // Add angle labels with appropriate colors
        const angleLabels = [];

        // Angle A (bottom left)
        if (angles.A !== undefined) {
            const color = angles.A === '?' ? this.colors.unknown : this.colors.given;
            const text = angles.A === '?' ? '?' : `${angles.A}°`;
            await this.addLabel(vertices.A.x + 25, vertices.A.y - 10, text, color, 18);
            angleLabels.push({ vertex: 'A', value: angles.A, color });
        }

        await this.delay(200);

        // Angle B (bottom right)
        if (angles.B !== undefined) {
            const color = angles.B === '?' ? this.colors.unknown : this.colors.given;
            const text = angles.B === '?' ? '?' : `${angles.B}°`;
            await this.addLabel(vertices.B.x - 35, vertices.B.y - 10, text, color, 18);
            angleLabels.push({ vertex: 'B', value: angles.B, color });
        }

        await this.delay(200);

        // Angle C (top)
        if (angles.C !== undefined) {
            const color = angles.C === '?' ? this.colors.unknown : this.colors.given;
            const text = angles.C === '?' ? '?' : `${angles.C}°`;
            await this.addLabel(vertices.C.x, vertices.C.y + 25, text, color, 18);
            angleLabels.push({ vertex: 'C', value: angles.C, color });
        }

        // Mark region as occupied
        this.markRegionOccupied(region);

        console.log('✅ Triangle problem created with sequential animation');
        return { vertices, angleLabels, region };
    }

    /**
     * Draw a hand-drawn line segment
     */
    async drawHandDrawnLine(x1, y1, x2, y2, color = '#2d3748') {
        if (this.whiteboard.handwriting) {
            return this.whiteboard.handwriting.drawHandDrawnArrow(x1, y1, x2, y2, {
                color: color,
                strokeWidth: 2,
                wobbleIntensity: 0.02
            });
        } else {
            // Fallback
            const line = new fabric.Line([x1, y1, x2, y2], {
                stroke: color,
                strokeWidth: 2,
                selectable: false,
                strokeLineCap: 'round'
            });
            this.whiteboard.canvas.add(line);
            this.whiteboard.canvas.renderAll();
            return line;
        }
    }

    /**
     * Add label with handwritten style
     */
    async addLabel(x, y, text, color = '#2d3748', fontSize = 16) {
        const label = new fabric.Text(text, {
            left: x,
            top: y,
            fontSize: fontSize,
            fill: color,
            fontFamily: 'Indie Flower, cursive',
            selectable: false,
            fontWeight: text === '?' ? 'bold' : 'normal'
        });

        this.whiteboard.canvas.add(label);
        this.whiteboard.canvas.renderAll();

        // Track element
        this.canvasState.elements.push({ type: 'label', x, y, text, object: label });

        return label;
    }

    /**
     * Create animated circle to emphasize something
     */
    async emphasizeElement(x, y, radius = 30, color = '#f59e0b') {
        if (this.whiteboard.handwriting) {
            const circle = this.whiteboard.handwriting.drawHandDrawnCircle(x, y, radius, {
                color: color,
                strokeWidth: 3,
                wobbleIntensity: 0.08
            });

            // Animate opacity
            circle.set('opacity', 0);
            this.whiteboard.canvas.renderAll();

            // Fade in
            for (let i = 0; i <= 10; i++) {
                circle.set('opacity', i / 10);
                this.whiteboard.canvas.renderAll();
                await this.delay(30);
            }

            return circle;
        }
    }

    /**
     * Draw arrow pointing to something with message
     */
    async pointTo(fromX, fromY, toX, toY, message = '', color = '#12B3B3') {
        if (this.whiteboard.handwriting) {
            await this.whiteboard.handwriting.drawHandDrawnArrow(fromX, fromY, toX, toY, {
                color: color,
                strokeWidth: 3,
                wobbleIntensity: 0.02
            });

            if (message) {
                await this.delay(200);
                await this.addLabel(fromX - 50, fromY - 20, message, color, 14);
            }
        }
    }

    // ============================================
    // CANVAS STATE MANAGEMENT
    // ============================================

    /**
     * Get available region for drawing
     */
    getAvailableRegion(preferred = 'middleCenter') {
        // Try preferred region first
        if (this.canvasState.regions[preferred] && !this.canvasState.regions[preferred].occupied) {
            return this.canvasState.regions[preferred];
        }

        // Find any available region
        for (const [name, region] of Object.entries(this.canvasState.regions)) {
            if (!region.occupied) {
                return region;
            }
        }

        console.warn('[Enhancer] All regions occupied, clearing canvas recommended');
        return null;
    }

    /**
     * Mark region as occupied
     */
    markRegionOccupied(region) {
        for (const [name, r] of Object.entries(this.canvasState.regions)) {
            if (r === region) {
                r.occupied = true;
                console.log(`📍 Region ${name} marked as occupied`);
                break;
            }
        }
    }

    /**
     * Clear canvas and reset regions
     */
    clearCanvas() {
        if (this.whiteboard.canvas) {
            this.whiteboard.canvas.clear();

            // Reset all regions
            for (const region of Object.values(this.canvasState.regions)) {
                region.occupied = false;
            }

            this.canvasState.elements = [];
            console.log('🧹 Canvas cleared, regions reset');
        }
    }

    /**
     * Get smart position for next element
     */
    getSmartPosition(width = 100, height = 50) {
        // Find available region
        const region = this.getAvailableRegion();

        if (region) {
            return {
                x: region.x + (region.width - width) / 2,
                y: region.y + (region.height - height) / 2,
                region: region
            };
        }

        // Fallback to incrementing position
        const x = this.canvasState.lastPosition.x;
        const y = this.canvasState.lastPosition.y + 100;

        this.canvasState.lastPosition = { x, y };

        return { x, y, region: null };
    }

    // ============================================
    // UTILITIES
    // ============================================

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// INITIALIZE ENHANCER
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const checkWhiteboard = setInterval(() => {
        if (window.whiteboard && window.whiteboard.canvas) {
            window.whiteboardEnhancer = new WhiteboardEnhancer(window.whiteboard);
            clearInterval(checkWhiteboard);
            console.log('✅ Whiteboard Enhancer initialized');
        }
    }, 100);

    setTimeout(() => clearInterval(checkWhiteboard), 10000);
});

console.log('✨ Whiteboard Enhancement module loaded');
