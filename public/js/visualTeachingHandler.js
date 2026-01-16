// ============================================
// VISUAL TEACHING HANDLER (Frontend)
// Execute visual teaching commands from AI
// ============================================

class VisualTeachingHandler {
    constructor() {
        this.whiteboard = null;
        this.algebraTiles = null;
        console.log('📐 Visual Teaching Handler initialized');
    }

    /**
     * Execute all visual commands from AI response
     * @param {Object} visualCommands - Parsed visual commands
     */
    async executeCommands(visualCommands) {
        if (!visualCommands) return;

        // Execute whiteboard commands
        if (visualCommands.whiteboard && visualCommands.whiteboard.length > 0) {
            await this.executeWhiteboardCommands(visualCommands.whiteboard);
        }

        // Execute algebra tiles commands
        if (visualCommands.algebraTiles && visualCommands.algebraTiles.length > 0) {
            await this.executeAlgebraTilesCommands(visualCommands.algebraTiles);
        }

        // Execute image commands
        if (visualCommands.images && visualCommands.images.length > 0) {
            this.executeImageCommands(visualCommands.images);
        }

        // Execute manipulatives commands
        if (visualCommands.manipulatives && visualCommands.manipulatives.length > 0) {
            this.executeManipulativesCommands(visualCommands.manipulatives);
        }
    }

    /**
     * Execute whiteboard commands
     * @param {Array} commands - Whiteboard command list
     */
    async executeWhiteboardCommands(commands) {
        for (const cmd of commands) {
            if (cmd.autoOpen) {
                this.openWhiteboard();
            }

            switch (cmd.type) {
                case 'drawing':
                    await this.drawOnWhiteboard(cmd.sequence);
                    break;
                case 'write':
                    await this.writeOnWhiteboard(cmd.text);
                    break;
                case 'equation':
                    await this.writeEquation(cmd.latex);
                    break;
                case 'clear':
                    this.clearWhiteboard();
                    break;
                case 'triangle_problem':
                    await this.createTriangleProblem(cmd.angles);
                    break;
                case 'emphasize':
                    await this.emphasizePoint(cmd.x, cmd.y, cmd.radius);
                    break;
                case 'point_to':
                    await this.pointToLocation(cmd.fromX, cmd.fromY, cmd.toX, cmd.toY, cmd.message);
                    break;
                case 'long_division':
                    await this.showLongDivision(cmd.dividend, cmd.divisor);
                    break;
                case 'multiply_vertical':
                    await this.showMultiplyVertical(cmd.num1, cmd.num2);
                    break;
                case 'fraction_add':
                    await this.showFractionAdd(cmd.n1, cmd.d1, cmd.n2, cmd.d2);
                    break;
                case 'fraction_multiply':
                    await this.showFractionMultiply(cmd.n1, cmd.d1, cmd.n2, cmd.d2);
                    break;
                case 'equation_solve':
                    await this.solveEquation(cmd.equation);
                    break;
            }

            // Small delay between commands
            await this.delay(300);
        }
    }

    /**
     * Execute algebra tiles commands
     * @param {Array} commands - Algebra tiles command list
     */
    async executeAlgebraTilesCommands(commands) {
        for (const cmd of commands) {
            if (cmd.autoOpen) {
                this.openAlgebraTiles();
            }

            switch (cmd.type) {
                case 'expression':
                    await this.showAlgebraTilesExpression(cmd.expression);
                    break;
                case 'demo':
                    await this.demonstrateOperation(cmd.operation);
                    break;
            }

            await this.delay(500);
        }
    }

    /**
     * Execute image commands
     * @param {Array} commands - Image command list
     */
    executeImageCommands(commands) {
        commands.forEach(cmd => {
            if (cmd.inline) {
                this.displayInlineImage(cmd.url, cmd.caption || cmd.concept);
            }
        });
    }

    /**
     * Execute manipulative commands
     * @param {Array} commands - Manipulative command list
     */
    executeManipulativesCommands(commands) {
        commands.forEach(cmd => {
            switch (cmd.type) {
                case 'numberLine':
                    this.showNumberLine(cmd.min, cmd.max, cmd.mark);
                    break;
                case 'fractionBars':
                    this.showFractionBars(cmd.numerator, cmd.denominator);
                    break;
                case 'baseTenBlocks':
                    this.showBaseTenBlocks(cmd.number);
                    break;
            }
        });
    }

    // ==================== WHITEBOARD METHODS ====================

    openWhiteboard() {
        const whiteboardPanel = document.getElementById('whiteboard-panel');
        if (whiteboardPanel && whiteboardPanel.classList.contains('is-hidden')) {
            const toggleBtn = document.getElementById('toggle-whiteboard-btn');
            if (toggleBtn) toggleBtn.click();
            console.log('📐 Opened whiteboard');
        }
    }

    async drawOnWhiteboard(sequence) {
        if (!window.whiteboard) {
            console.warn('[VisualTeaching] Whiteboard not initialized');
            return;
        }

        console.log('📐 Drawing on whiteboard:', sequence);

        // Use existing renderDrawing function if available
        if (typeof window.renderDrawing === 'function') {
            window.renderDrawing(sequence);
        }
    }

    async writeOnWhiteboard(text) {
        if (!window.whiteboard) return;

        console.log('✍️ Writing on whiteboard with handwriting:', text);

        // Use handwriting engine if available
        if (window.whiteboard.handwriting && typeof window.whiteboard.handwriting.writeText === 'function') {
            // Use handwritten text with natural marker strokes
            await window.whiteboard.handwriting.writeText(text, 50, 50, {
                fontSize: 24,
                color: '#2d3748',
                fontFamily: 'Indie Flower, cursive',
                selectable: false,
                pauseAfter: true
            });
        } else {
            // Fallback to regular text if handwriting engine not available
            const canvas = window.fabricCanvas || window.whiteboard.canvas;
            if (canvas) {
                const textObj = new fabric.Text(text, {
                    left: 50,
                    top: 50,
                    fontSize: 24,
                    fill: '#2d3748',
                    fontFamily: 'Indie Flower, cursive'
                });
                canvas.add(textObj);
                canvas.renderAll();
            }
        }
    }

    async writeEquation(latex) {
        console.log('📐 Writing equation:', latex);
        await this.writeOnWhiteboard(`Equation: ${latex}`);
    }

    clearWhiteboard() {
        if (window.fabricCanvas) {
            window.fabricCanvas.clear();
            console.log('📐 Cleared whiteboard');
        }

        // Reset canvas state in enhancer if available
        if (window.whiteboardEnhancer) {
            window.whiteboardEnhancer.clearCanvas();
        }
    }

    async createTriangleProblem(angles) {
        console.log('📐 Creating triangle problem:', angles);

        if (window.whiteboardEnhancer) {
            await window.whiteboardEnhancer.createTriangleProblem(angles);
        } else {
            console.warn('[VisualTeaching] Whiteboard enhancer not available');
        }
    }

    async emphasizePoint(x, y, radius) {
        console.log('⭕ Emphasizing point:', x, y);

        if (window.whiteboardEnhancer) {
            await window.whiteboardEnhancer.emphasizeElement(x, y, radius);
        }
    }

    async pointToLocation(fromX, fromY, toX, toY, message) {
        console.log('👉 Pointing to location:', toX, toY);

        if (window.whiteboardEnhancer) {
            await window.whiteboardEnhancer.pointTo(fromX, fromY, toX, toY, message);
        }
    }

    async showLongDivision(dividend, divisor) {
        console.log('🔢 Long Division:', dividend, '÷', divisor);

        if (window.mathProcedures) {
            await window.mathProcedures.showLongDivision(dividend, divisor);
        } else {
            console.warn('[VisualTeaching] Math Procedures module not available');
        }
    }

    async showMultiplyVertical(num1, num2) {
        console.log('🔢 Vertical Multiplication:', num1, '×', num2);

        if (window.mathProcedures) {
            await window.mathProcedures.showVerticalMultiplication(num1, num2);
        } else {
            console.warn('[VisualTeaching] Math Procedures module not available');
        }
    }

    async showFractionAdd(n1, d1, n2, d2) {
        console.log('🔢 Fraction Addition:', `${n1}/${d1} + ${n2}/${d2}`);

        if (window.mathProcedures) {
            await window.mathProcedures.showFractionAddition(n1, d1, n2, d2);
        } else {
            console.warn('[VisualTeaching] Math Procedures module not available');
        }
    }

    async showFractionMultiply(n1, d1, n2, d2) {
        console.log('🔢 Fraction Multiplication:', `${n1}/${d1} × ${n2}/${d2}`);

        if (window.mathProcedures) {
            await window.mathProcedures.showFractionMultiplication(n1, d1, n2, d2);
        } else {
            console.warn('[VisualTeaching] Math Procedures module not available');
        }
    }

    async solveEquation(equation) {
        console.log('🔢 Solving Equation:', equation);

        if (window.mathProcedures) {
            await window.mathProcedures.solveEquation(equation);
        } else {
            console.warn('[VisualTeaching] Math Procedures module not available');
        }
    }

    // ==================== ALGEBRA TILES METHODS ====================

    openAlgebraTiles() {
        const algebraBtn = document.getElementById('algebra-tiles-btn') ||
                          document.getElementById('sidebar-algebra-btn');
        if (algebraBtn) {
            algebraBtn.click();
            console.log('🟦 Opened algebra tiles');
        }
    }

    async showAlgebraTilesExpression(expression) {
        console.log('🟦 Showing algebra tiles for:', expression);

        // If AlgebraTiles class is available globally
        if (window.algebraTiles && typeof window.algebraTiles.parseExpression === 'function') {
            window.algebraTiles.parseExpression(expression);
        }
    }

    async demonstrateOperation(operation) {
        console.log('🟦 Demonstrating operation:', operation);
        // Implementation depends on algebra tiles API
    }

    // ==================== IMAGE METHODS ====================

    displayInlineImage(url, caption) {
        // Find the last AI message and append image
        const messages = document.querySelectorAll('.message.ai');
        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];

        const imageContainer = document.createElement('div');
        imageContainer.className = 'visual-teaching-image';
        imageContainer.style.cssText = `
            margin-top: 15px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;

        const img = document.createElement('img');
        img.src = url;
        img.alt = caption;
        img.style.cssText = `
            width: 100%;
            max-width: 500px;
            display: block;
            border-radius: 8px;
        `;
        img.onerror = () => {
            imageContainer.innerHTML = `<p style="color: #666; font-style: italic;">Image not available: ${caption}</p>`;
        };

        imageContainer.appendChild(img);

        if (caption) {
            const captionEl = document.createElement('p');
            captionEl.textContent = caption;
            captionEl.style.cssText = `
                margin-top: 8px;
                font-size: 13px;
                color: #666;
                font-style: italic;
                text-align: center;
            `;
            imageContainer.appendChild(captionEl);
        }

        lastMessage.appendChild(imageContainer);
        console.log('🖼️ Displayed image:', caption || url);
    }

    // ==================== MANIPULATIVES METHODS ====================

    showNumberLine(min, max, mark) {
        console.log(`📏 Showing number line: ${min} to ${max}, marking ${mark}`);

        // Create inline number line visualization
        const messages = document.querySelectorAll('.message.ai');
        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];

        const numberLine = this.createNumberLineHTML(min, max, mark);
        lastMessage.appendChild(numberLine);
    }

    createNumberLineHTML(min, max, mark) {
        const container = document.createElement('div');
        container.className = 'number-line-visual';
        container.style.cssText = `
            margin-top: 15px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 8px;
        `;

        // Create SVG number line
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100');
        svg.setAttribute('viewBox', '0 0 500 100');

        // Draw line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '50');
        line.setAttribute('y1', '50');
        line.setAttribute('x2', '450');
        line.setAttribute('y2', '50');
        line.setAttribute('stroke', '#333');
        line.setAttribute('stroke-width', '3');
        svg.appendChild(line);

        // Draw ticks and labels
        const range = max - min;
        const step = Math.ceil(range / 10);

        for (let i = min; i <= max; i += step) {
            const x = 50 + ((i - min) / range) * 400;

            // Tick mark
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', x);
            tick.setAttribute('y1', '45');
            tick.setAttribute('x2', x);
            tick.setAttribute('y2', '55');
            tick.setAttribute('stroke', '#333');
            tick.setAttribute('stroke-width', '2');
            svg.appendChild(tick);

            // Label
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', '75');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '12');
            text.textContent = i;
            svg.appendChild(text);
        }

        // Mark specific number if provided
        if (mark !== null) {
            const markX = 50 + ((mark - min) / range) * 400;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', markX);
            circle.setAttribute('cy', '50');
            circle.setAttribute('r', '8');
            circle.setAttribute('fill', '#667eea');
            svg.appendChild(circle);
        }

        container.appendChild(svg);
        return container;
    }

    showFractionBars(numerator, denominator) {
        console.log(`🍰 Showing fraction bars: ${numerator}/${denominator}`);

        const messages = document.querySelectorAll('.message.ai');
        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];
        const fractionViz = this.createFractionBarsHTML(numerator, denominator);
        lastMessage.appendChild(fractionViz);
    }

    createFractionBarsHTML(numerator, denominator) {
        const container = document.createElement('div');
        container.className = 'fraction-bars-visual';
        container.style.cssText = `
            margin-top: 15px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 8px;
        `;

        const barWidth = Math.min(400, window.innerWidth - 100);
        const partWidth = barWidth / denominator;

        for (let i = 0; i < denominator; i++) {
            const part = document.createElement('div');
            part.style.cssText = `
                display: inline-block;
                width: ${partWidth}px;
                height: 40px;
                border: 2px solid #333;
                background: ${i < numerator ? '#667eea' : '#ffffff'};
                box-sizing: border-box;
            `;
            container.appendChild(part);
        }

        const label = document.createElement('p');
        label.textContent = `${numerator}/${denominator}`;
        label.style.cssText = 'text-align: center; margin-top: 10px; font-weight: bold;';
        container.appendChild(label);

        return container;
    }

    showBaseTenBlocks(number) {
        console.log(`🔢 Showing base-10 blocks for: ${number}`);
        // Implementation for base-10 blocks visualization
    }

    // ==================== UTILITY METHODS ====================

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize globally
window.visualTeachingHandler = new VisualTeachingHandler();
console.log('✅ Visual Teaching Handler ready');
