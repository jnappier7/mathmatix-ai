// ============================================
// WHITEBOARD PHASE 3: HANDWRITING ENGINE
// Natural, human-like AI writing with variations
// ============================================

/**
 * Phase 3 Handwriting Enhancement Module
 * Makes AI writing look natural with position jitter, rotation, timing variations
 */

class HandwritingEngine {
    constructor(whiteboard) {
        this.whiteboard = whiteboard;

        // Handwriting parameters (tunable for different "personalities")
        this.params = {
            // Position variations
            jitterX: 1.5,        // Horizontal position variance (px)
            jitterY: 1.0,        // Vertical position variance (px)

            // Rotation variations
            rotationRange: 2,    // Rotation variance (degrees)

            // Speed variations
            baseSpeed: 50,       // Base ms per character
            speedVariance: 20,   // Speed variance (±ms)

            // Hesitation
            hesitationChance: 0.15,  // 15% chance of pause
            hesitationDuration: 150, // Duration of pause (ms)

            // Word spacing
            spaceMultiplier: 2.0,    // Pause after space (multiplier)

            // Punctuation pauses
            commaPause: 100,         // Pause after comma
            periodPause: 200,        // Pause after period

            // Pressure simulation (size variations)
            pressureVariance: 0.08,  // Font size variance (±8%)

            // Line imperfections
            lineWobble: 0.5,         // Line position variance (px)

            // Natural acceleration/deceleration
            accelerate: true,        // Start slow, speed up
            decelerate: true         // Slow down at end
        };

        // State tracking
        this.isWriting = false;
        this.currentWritingSession = null;

        console.log('✍️ Handwriting Engine initialized');
    }

    // ============================================
    // CHARACTER-BY-CHARACTER WRITING
    // ============================================

    /**
     * Enhanced character-by-character writing with natural variations
     * @param {string} text - Text to write
     * @param {number} x - Starting X position
     * @param {number} y - Starting Y position
     * @param {Object} options - Writing options
     * @returns {Object} Fabric text object
     */
    async writeText(text, x, y, options = {}) {
        this.isWriting = true;

        const {
            fontSize = 24,
            color = '#2d3748',
            fontFamily = 'Indie Flower, cursive',
            selectable = false,
            pauseAfter = true
        } = options;

        // Create text object
        const textObj = new fabric.IText('', {
            left: x,
            top: y,
            fontSize: fontSize,
            fill: color,
            fontFamily: fontFamily,
            selectable: selectable
        });

        this.whiteboard.canvas.add(textObj);

        // Character-by-character animation with variations
        const chars = text.split('');
        let displayText = '';

        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            const isSpace = char === ' ';
            const isComma = char === ',';
            const isPeriod = char === '.';
            const isLastChar = i === chars.length - 1;

            // Add character
            displayText += char;

            // Apply natural variations
            this.applyCharacterVariations(textObj, displayText, i, chars.length);

            // Update display
            textObj.set('text', displayText);
            this.whiteboard.canvas.renderAll();

            // Calculate pause duration with variations
            let pauseDuration = this.calculatePauseDuration(i, chars.length, char);

            // Natural hesitations (thinking pauses)
            if (Math.random() < this.params.hesitationChance && !isSpace) {
                pauseDuration += this.params.hesitationDuration;
                console.log(`✍️ [Hesitation at char ${i}]`);
            }

            // Longer pause after spaces (natural word separation)
            if (isSpace) {
                pauseDuration *= this.params.spaceMultiplier;
            }

            // Punctuation pauses
            if (isComma) pauseDuration += this.params.commaPause;
            if (isPeriod) pauseDuration += this.params.periodPause;

            await this.sleep(pauseDuration);
        }

        // Final pause (thinking/reflecting)
        if (pauseAfter) {
            await this.sleep(1500);
        }

        this.isWriting = false;
        return textObj;
    }

    /**
     * Apply natural variations to character rendering
     */
    applyCharacterVariations(textObj, displayText, charIndex, totalChars) {
        // Position jitter (hand isn't perfectly steady)
        const jitterX = (Math.random() - 0.5) * this.params.jitterX;
        const jitterY = (Math.random() - 0.5) * this.params.jitterY;

        textObj.set({
            left: textObj.left + jitterX,
            top: textObj.top + jitterY
        });

        // Slight rotation (natural hand angle variations)
        const rotation = (Math.random() - 0.5) * this.params.rotationRange;
        textObj.set('angle', rotation);

        // Pressure simulation (font size micro-variations)
        const pressureVariation = 1 + (Math.random() - 0.5) * this.params.pressureVariance;
        const variedSize = textObj.fontSize * pressureVariation;
        textObj.set('fontSize', Math.round(variedSize));

        // Slight opacity variation (pen pressure)
        const opacityVariation = 0.95 + Math.random() * 0.05; // 95-100%
        textObj.set('opacity', opacityVariation);
    }

    /**
     * Calculate pause duration with natural speed variations
     */
    calculatePauseDuration(charIndex, totalChars, char) {
        let baseDuration = this.params.baseSpeed;

        // Natural acceleration/deceleration
        const progress = charIndex / totalChars;

        if (this.params.accelerate && progress < 0.15) {
            // Start slow (first 15%)
            const factor = 1 + (0.15 - progress) * 2; // 1.0 to 1.3x
            baseDuration *= factor;
        }

        if (this.params.decelerate && progress > 0.85) {
            // Slow down at end (last 15%)
            const factor = 1 + (progress - 0.85) * 2; // 1.0 to 1.3x
            baseDuration *= factor;
        }

        // Random variance (natural speed fluctuations)
        const variance = (Math.random() - 0.5) * this.params.speedVariance;
        baseDuration += variance;

        return Math.max(20, baseDuration); // Never faster than 20ms
    }

    // ============================================
    // HAND-DRAWN SHAPES
    // ============================================

    /**
     * Draw hand-drawn style circle (imperfect, wobbly)
     * @param {number} centerX - Center X coordinate
     * @param {number} centerY - Center Y coordinate
     * @param {number} radius - Circle radius
     * @param {Object} options - Drawing options
     * @returns {Object} Fabric path object
     */
    drawHandDrawnCircle(centerX, centerY, radius, options = {}) {
        const {
            color = '#ff6b6b',
            strokeWidth = 2,
            wobbleIntensity = 0.08 // 8% position variance
        } = options;

        // Generate points around circle with imperfections
        const points = [];
        const segments = 64; // Smooth curve

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;

            // Add wobble to radius (hand-drawn imperfection)
            const wobble = 1 + (Math.random() - 0.5) * wobbleIntensity;
            const r = radius * wobble;

            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;

            points.push({ x, y });
        }

        // Create smooth path through points
        const pathData = this.pointsToSmoothPath(points, true);

        const path = new fabric.Path(pathData, {
            fill: 'transparent',
            stroke: color,
            strokeWidth: strokeWidth,
            selectable: false,
            strokeLineCap: 'round',
            strokeLineJoin: 'round'
        });

        this.whiteboard.canvas.add(path);
        this.whiteboard.canvas.renderAll();

        return path;
    }

    /**
     * Draw hand-drawn style arrow (slightly curved, imperfect)
     * @param {number} x1 - Start X
     * @param {number} y1 - Start Y
     * @param {number} x2 - End X
     * @param {number} y2 - End Y
     * @param {Object} options - Drawing options
     * @returns {Object} Fabric group with line and arrowhead
     */
    drawHandDrawnArrow(x1, y1, x2, y2, options = {}) {
        const {
            color = '#12B3B3',
            strokeWidth = 3,
            wobbleIntensity = 0.02
        } = options;

        // Generate points along line with slight wobble
        const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const segments = Math.max(8, Math.floor(distance / 20)); // More segments for longer lines
        const points = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;

            // Linear interpolation
            let x = x1 + (x2 - x1) * t;
            let y = y1 + (y2 - y1) * t;

            // Add perpendicular wobble (natural hand shake)
            const perpAngle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
            const wobble = (Math.random() - 0.5) * distance * wobbleIntensity;
            x += Math.cos(perpAngle) * wobble;
            y += Math.sin(perpAngle) * wobble;

            points.push({ x, y });
        }

        // Create smooth path
        const pathData = this.pointsToSmoothPath(points, false);

        const line = new fabric.Path(pathData, {
            fill: 'transparent',
            stroke: color,
            strokeWidth: strokeWidth,
            selectable: false,
            strokeLineCap: 'round',
            strokeLineJoin: 'round'
        });

        // Arrowhead (slightly imperfect triangle)
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowSize = 12;

        // Arrow points with slight wobble
        const wobble1 = (Math.random() - 0.5) * 2;
        const wobble2 = (Math.random() - 0.5) * 2;

        const arrowPoints = [
            { x: x2, y: y2 },
            {
                x: x2 - arrowSize * Math.cos(angle - Math.PI / 6) + wobble1,
                y: y2 - arrowSize * Math.sin(angle - Math.PI / 6) + wobble1
            },
            {
                x: x2 - arrowSize * Math.cos(angle + Math.PI / 6) + wobble2,
                y: y2 - arrowSize * Math.sin(angle + Math.PI / 6) + wobble2
            }
        ];

        const arrowHead = new fabric.Polygon(arrowPoints, {
            fill: color,
            selectable: false
        });

        const group = new fabric.Group([line, arrowHead], {
            selectable: false
        });

        this.whiteboard.canvas.add(group);
        this.whiteboard.canvas.renderAll();

        return group;
    }

    /**
     * Draw hand-drawn style underline (slightly wavy)
     * @param {Object} textObj - Fabric text object to underline
     * @param {Object} options - Drawing options
     * @returns {Object} Fabric path object
     */
    drawHandDrawnUnderline(textObj, options = {}) {
        const {
            color = '#3b82f6',
            strokeWidth = 2,
            waveIntensity = 0.03
        } = options;

        const x1 = textObj.left;
        const y = textObj.top + textObj.height + 3;
        const x2 = textObj.left + textObj.width;

        // Generate wavy points
        const points = [];
        const segments = Math.max(10, Math.floor(textObj.width / 15));

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = x1 + (x2 - x1) * t;

            // Slight wave (natural hand motion)
            const wave = Math.sin(t * Math.PI * 4) * textObj.height * waveIntensity;
            const wobble = (Math.random() - 0.5) * 1.5;

            points.push({ x, y: y + wave + wobble });
        }

        const pathData = this.pointsToSmoothPath(points, false);

        const underline = new fabric.Path(pathData, {
            fill: 'transparent',
            stroke: color,
            strokeWidth: strokeWidth,
            selectable: false,
            strokeLineCap: 'round'
        });

        this.whiteboard.canvas.add(underline);
        this.whiteboard.canvas.renderAll();

        return underline;
    }

    // ============================================
    // UTILITIES
    // ============================================

    /**
     * Convert array of points to smooth SVG path using quadratic curves
     * @param {Array} points - Array of {x, y} points
     * @param {boolean} closed - Whether path should be closed
     * @returns {string} SVG path data
     */
    pointsToSmoothPath(points, closed = false) {
        if (points.length < 2) return '';

        let path = `M ${points[0].x} ${points[0].y}`;

        // Use quadratic curves for smoothness
        for (let i = 1; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];

            // Control point is current point
            // End point is midpoint between current and next
            const midX = (current.x + next.x) / 2;
            const midY = (current.y + next.y) / 2;

            path += ` Q ${current.x} ${current.y}, ${midX} ${midY}`;
        }

        // Last segment
        if (points.length > 1) {
            const last = points[points.length - 1];
            path += ` T ${last.x} ${last.y}`;
        }

        if (closed) {
            path += ' Z';
        }

        return path;
    }

    /**
     * Animate drawing of a path (reveal over time)
     * @param {Object} path - Fabric path object
     * @param {number} duration - Animation duration (ms)
     */
    async animatePathDrawing(path, duration = 1000) {
        const totalLength = path.path.length;
        const steps = Math.min(60, totalLength); // 60fps equivalent
        const stepDuration = duration / steps;

        for (let i = 1; i <= steps; i++) {
            const progress = i / steps;

            // Use stroke-dasharray to reveal path gradually
            const visibleLength = totalLength * progress;
            path.set({
                strokeDashArray: [visibleLength, totalLength - visibleLength]
            });

            this.whiteboard.canvas.renderAll();
            await this.sleep(stepDuration);
        }

        // Clear dash array when complete
        path.set({ strokeDashArray: null });
        this.whiteboard.canvas.renderAll();
    }

    /**
     * Create handwriting "signature" effect
     * Quick flourish at end of writing
     */
    async addWritingFlourish(x, y) {
        // Small quick line as if finishing a signature
        const flourishLength = 15;
        const angle = Math.random() * Math.PI / 4 - Math.PI / 8; // ±22.5 degrees

        const x2 = x + Math.cos(angle) * flourishLength;
        const y2 = y + Math.sin(angle) * flourishLength;

        const flourish = new fabric.Line([x, y, x2, y2], {
            stroke: '#12B3B3',
            strokeWidth: 1,
            opacity: 0.4,
            selectable: false
        });

        this.whiteboard.canvas.add(flourish);
        this.whiteboard.canvas.renderAll();

        // Fade out
        await this.sleep(300);
        flourish.set('opacity', 0);
        this.whiteboard.canvas.renderAll();

        await this.sleep(300);
        this.whiteboard.canvas.remove(flourish);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // PRESETS
    // ============================================

    /**
     * Load handwriting personality preset
     * @param {string} personality - 'careful', 'confident', 'excited', 'thoughtful'
     */
    setPersonality(personality) {
        const presets = {
            careful: {
                baseSpeed: 70,
                speedVariance: 10,
                jitterX: 0.8,
                jitterY: 0.5,
                rotationRange: 1,
                hesitationChance: 0.25
            },
            confident: {
                baseSpeed: 40,
                speedVariance: 25,
                jitterX: 2.0,
                jitterY: 1.5,
                rotationRange: 3,
                hesitationChance: 0.05
            },
            excited: {
                baseSpeed: 30,
                speedVariance: 30,
                jitterX: 2.5,
                jitterY: 2.0,
                rotationRange: 4,
                hesitationChance: 0.02
            },
            thoughtful: {
                baseSpeed: 85,
                speedVariance: 15,
                jitterX: 1.0,
                jitterY: 0.8,
                rotationRange: 1.5,
                hesitationChance: 0.35
            }
        };

        if (presets[personality]) {
            Object.assign(this.params, presets[personality]);
            console.log(`✍️ Handwriting personality set to: ${personality}`);
        }
    }
}

// ============================================
// ENHANCED WHITEBOARD INTEGRATION
// ============================================

// Extend MathmatixWhiteboard with handwriting capabilities
if (typeof MathmatixWhiteboard !== 'undefined') {
    // Store original method
    const originalAIWritePartialStep = MathmatixWhiteboard.prototype.aiWritePartialStep;

    // Enhanced aiWritePartialStep with handwriting engine
    MathmatixWhiteboard.prototype.aiWritePartialStep = async function(text, x, y, pauseAfter = true) {
        this.setBoardMode('teacher');
        this.showAIThinking();

        let textObj;

        if (this.handwriting) {
            // Use handwriting engine
            textObj = await this.handwriting.writeText(text, x, y, {
                fontSize: 24,
                color: '#2d3748',
                fontFamily: 'Indie Flower, cursive',
                selectable: false,
                pauseAfter: pauseAfter
            });
        } else {
            // Fallback to original method
            textObj = await originalAIWritePartialStep.call(this, text, x, y, pauseAfter);
        }

        this.hideAIThinking();
        return textObj;
    };

    // Add handwriting circle method
    MathmatixWhiteboard.prototype.aiDrawHandwrittenCircle = function(objectId, message = "Check this step") {
        if (!this.handwriting) {
            console.warn('[Handwriting] Engine not initialized');
            return;
        }

        const obj = this.semanticObjects.get(objectId);
        if (!obj) return;

        const fabricObj = obj.fabricObject;
        const centerX = fabricObj.left + fabricObj.width / 2;
        const centerY = fabricObj.top + fabricObj.height / 2;
        const radius = Math.max(fabricObj.width, fabricObj.height) / 2 + 15;

        // Draw hand-drawn circle
        const circle = this.handwriting.drawHandDrawnCircle(centerX, centerY, radius, {
            color: '#ff6b6b',
            strokeWidth: 3
        });

        // Add message if provided
        if (message) {
            const text = new fabric.Text(message, {
                left: centerX - 50,
                top: fabricObj.top + fabricObj.height + 25,
                fontSize: 16,
                fill: '#ff6b6b',
                fontFamily: 'Indie Flower, cursive',
                fontStyle: 'italic',
                selectable: false
            });
            this.canvas.add(text);
        }

        return circle;
    };

    // Add handwriting arrow method
    MathmatixWhiteboard.prototype.aiDrawHandwrittenArrow = function(fromId, toX, toY, message = "Your turn") {
        if (!this.handwriting) {
            console.warn('[Handwriting] Engine not initialized');
            return;
        }

        const obj = this.semanticObjects.get(fromId);
        if (!obj) return;

        const fabricObj = obj.fabricObject;
        const startX = fabricObj.left + fabricObj.width + 20;
        const startY = fabricObj.top + fabricObj.height / 2;

        // Draw hand-drawn arrow
        const arrow = this.handwriting.drawHandDrawnArrow(startX, startY, toX, toY, {
            color: '#12B3B3',
            strokeWidth: 3
        });

        // Add message
        if (message) {
            const text = new fabric.Text(message, {
                left: toX + 10,
                top: toY - 10,
                fontSize: 18,
                fill: '#12B3B3',
                fontFamily: 'Indie Flower, cursive',
                fontStyle: 'italic',
                selectable: false
            });
            this.canvas.add(text);
        }

        return arrow;
    };

    console.log('✅ Enhanced whiteboard with handwriting methods');
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const checkWhiteboard = setInterval(() => {
        if (window.whiteboard && window.whiteboard.canvas) {
            window.whiteboard.handwriting = new HandwritingEngine(window.whiteboard);

            // Set default personality (can be changed based on tutor)
            window.whiteboard.handwriting.setPersonality('confident');

            clearInterval(checkWhiteboard);
            console.log('✅ Handwriting Engine initialized');
        }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkWhiteboard), 10000);
});

console.log('✍️ Handwriting Engine module loaded');
