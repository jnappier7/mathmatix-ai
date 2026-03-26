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
            switch (cmd.type) {
                case 'drawing':
                    // Show as inline thumbnail instead of auto-opening full whiteboard
                    if (window.createDrawingThumbnail && cmd.sequence) {
                        const messages = document.querySelectorAll('.message.ai');
                        const lastMessage = messages[messages.length - 1];
                        if (lastMessage) {
                            const thumbnail = window.createDrawingThumbnail(cmd.sequence);
                            lastMessage.appendChild(thumbnail);
                            break;
                        }
                    }
                    // Fallback: open whiteboard directly
                    if (cmd.autoOpen) this.openWhiteboard();
                    await this.drawOnWhiteboard(cmd.sequence);
                    break;
                case 'write':
                    if (cmd.autoOpen) this.openWhiteboard();
                    await this.writeOnWhiteboard(cmd.text);
                    break;
                case 'equation':
                    if (cmd.autoOpen) this.openWhiteboard();
                    await this.writeEquation(cmd.latex);
                    break;
                case 'clear':
                    this.clearWhiteboard();
                    break;
                case 'triangle_problem':
                    if (cmd.autoOpen) this.openWhiteboard();
                    await this.createTriangleProblem(cmd.angles);
                    break;
                case 'unit_circle':
                    await this.createUnitCircle(cmd.highlightAngle);
                    break;
                case 'emphasize':
                    await this.emphasizePoint(cmd.x, cmd.y, cmd.radius);
                    break;
                case 'point_to':
                    await this.pointToLocation(cmd.fromX, cmd.fromY, cmd.toX, cmd.toY, cmd.message);
                    break;
                case 'long_division':
                    await this.showLongDivision(cmd.dividend, cmd.divisor, cmd.mode);
                    break;
                case 'multiply_vertical':
                    await this.showMultiplyVertical(cmd.num1, cmd.num2, cmd.mode);
                    break;
                case 'fraction_add':
                    await this.showFractionAdd(cmd.n1, cmd.d1, cmd.n2, cmd.d2, cmd.mode);
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
                case 'solve':
                    await this.solveEquationWithTiles(cmd.equation, cmd.mode);
                    break;
                case 'factor':
                    await this.factorWithTiles(cmd.expression);
                    break;
                case 'demo':
                    await this.demonstrateOperation(cmd.operation);
                    break;
                case 'move':
                    await this.moveTiles(cmd.tileType, cmd.fromX, cmd.fromY, cmd.toX, cmd.toY);
                    break;
                case 'highlight':
                    await this.highlightTiles(cmd.tileType, cmd.x, cmd.y);
                    break;
                case 'annotate':
                    await this.annotateTiles(cmd.x, cmd.y, cmd.text);
                    break;
                case 'clear':
                    await this.clearTiles();
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
        commands.forEach(async (cmd) => {
            if (cmd.type === 'search') {
                // Fetch from safe image search API
                await this.searchAndDisplayImage(cmd.query, cmd.category);
            } else if (cmd.inline) {
                this.displayInlineImage(cmd.url, cmd.caption || cmd.concept);
            }
        });
    }

    async searchAndDisplayImage(query, category) {
        try {
            const params = new URLSearchParams({ q: query });
            if (category) params.append('category', category);

            const response = await fetch(`/api/images/search?${params}`);
            if (!response.ok) return;

            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const img = data.results[0];
                this.displayInlineImage(
                    img.thumbnail || img.url,
                    img.title || query,
                    img.source
                );
            }
        } catch (error) {
            console.warn('[VisualTeaching] Image search failed:', error.message);
        }
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
                case 'counters':
                    this.showCounters(cmd.positive, cmd.negative, cmd.label);
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

    async createUnitCircle(highlightAngle = null) {
        console.log('⭕ Creating unit circle', highlightAngle ? `(highlighting ${highlightAngle})` : '');

        if (window.whiteboard && typeof window.whiteboard.drawUnitCircle === 'function') {
            await window.whiteboard.drawUnitCircle(highlightAngle);
        } else {
            console.warn('[VisualTeaching] Unit circle drawing not available');
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

    async showLongDivision(dividend, divisor, mode = 'full') {
        console.log('🔢 Long Division:', dividend, '÷', divisor, `(${mode} mode)`);

        if (window.mathProcedures) {
            await window.mathProcedures.showLongDivision(dividend, divisor, mode);
        } else {
            console.warn('[VisualTeaching] Math Procedures module not available');
        }
    }

    async showMultiplyVertical(num1, num2, mode = 'full') {
        console.log('🔢 Vertical Multiplication:', num1, '×', num2, `(${mode} mode)`);

        if (window.mathProcedures) {
            await window.mathProcedures.showVerticalMultiplication(num1, num2, mode);
        } else {
            console.warn('[VisualTeaching] Math Procedures module not available');
        }
    }

    async showFractionAdd(n1, d1, n2, d2, mode = 'full') {
        console.log('🔢 Fraction Addition:', `${n1}/${d1} + ${n2}/${d2}`, `(${mode} mode)`);

        if (window.mathProcedures) {
            await window.mathProcedures.showFractionAddition(n1, d1, n2, d2, mode);
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

    async solveEquationWithTiles(equation, mode = 'guided') {
        console.log(`🧮 AI solving equation with tiles: ${equation} (${mode} mode)`);

        this.openAlgebraTiles();
        await this.delay(300);

        if (window.algebraTiles && typeof window.algebraTiles.solveEquationWithTiles === 'function') {
            await window.algebraTiles.solveEquationWithTiles(equation, mode);
            console.log('✅ Equation solving demo complete');
        } else {
            // Fallback: just show the equation on tiles
            console.warn('[VisualTeaching] solveEquationWithTiles not available, falling back to expression');
            await this.showAlgebraTilesExpression(equation);
        }
    }

    async factorWithTiles(expression) {
        console.log(`🧮 AI factoring with tiles: ${expression}`);

        this.openAlgebraTiles();
        await this.delay(300);

        if (window.algebraTiles && typeof window.algebraTiles.demonstrateFactoring === 'function') {
            await window.algebraTiles.demonstrateFactoring(expression);
            console.log('✅ Factoring demo complete');
        } else {
            // Fallback: just show the expression on tiles
            console.warn('[VisualTeaching] demonstrateFactoring not available, falling back to expression');
            await this.showAlgebraTilesExpression(expression);
        }
    }

    async showAlgebraTilesExpression(expression) {
        console.log('🟦 Showing algebra tiles for:', expression);

        // Wait a moment for the modal to open if it was just triggered
        await this.delay(100);

        // If AlgebraTiles class is available globally
        if (window.algebraTiles && typeof window.algebraTiles.buildAlgebraTiles === 'function') {
            // Ensure we're in algebra mode
            if (window.algebraTiles.currentMode !== 'algebra') {
                const algebraModeBtn = document.querySelector('[data-mode="algebra"]');
                if (algebraModeBtn) algebraModeBtn.click();
            }

            // Build tiles from expression
            window.algebraTiles.buildAlgebraTiles(expression);
            console.log('✅ Successfully built algebra tiles for:', expression);
        } else {
            console.warn('[VisualTeaching] Algebra tiles not initialized or buildAlgebraTiles method unavailable');
        }
    }

    async demonstrateOperation(operation) {
        console.log('🟦 Demonstrating operation:', operation);
        // Implementation depends on algebra tiles API
    }

    async moveTiles(tileType, fromX, fromY, toX, toY) {
        console.log(`🟦 Moving ${tileType} tiles from (${fromX},${fromY}) to (${toX},${toY})`);

        await this.delay(100);

        if (window.algebraTiles && typeof window.algebraTiles.moveTilesByType === 'function') {
            window.algebraTiles.moveTilesByType(tileType, fromX, fromY, toX, toY);
        } else {
            console.warn('[VisualTeaching] Algebra tiles moveTilesByType method not available');
        }
    }

    async highlightTiles(tileType, x, y) {
        console.log(`🟦 Highlighting ${tileType} tiles at (${x},${y})`);

        await this.delay(100);

        if (window.algebraTiles && typeof window.algebraTiles.highlightTilesAt === 'function') {
            window.algebraTiles.highlightTilesAt(tileType, x, y);
        } else {
            console.warn('[VisualTeaching] Algebra tiles highlightTilesAt method not available');
        }
    }

    async annotateTiles(x, y, text) {
        console.log(`🟦 Annotating tiles at (${x},${y}): "${text}"`);

        await this.delay(100);

        if (window.algebraTiles && typeof window.algebraTiles.addAnnotation === 'function') {
            window.algebraTiles.addAnnotation(x, y, text);
        } else {
            console.warn('[VisualTeaching] Algebra tiles addAnnotation method not available');
        }
    }

    async clearTiles() {
        console.log('🟦 Clearing all tiles');

        if (window.algebraTiles && typeof window.algebraTiles.clearWorkspace === 'function') {
            window.algebraTiles.clearWorkspace();
        } else {
            console.warn('[VisualTeaching] Algebra tiles clearWorkspace method not available');
        }
    }

    // ==================== IMAGE METHODS ====================

    displayInlineImage(url, caption, source) {
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
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.style.cssText = `
            width: 100%;
            max-width: 500px;
            display: block;
            border-radius: 8px;
        `;
        img.onerror = () => {
            const fallback = document.createElement('p');
            fallback.style.cssText = 'color: #666; font-style: italic;';
            fallback.textContent = 'Image not available: ' + caption;
            imageContainer.innerHTML = '';
            imageContainer.appendChild(fallback);
        };

        // iMessage-style: thumbnail preview, click to enlarge
        img.style.cssText = `
            max-width: 200px;
            max-height: 160px;
            object-fit: cover;
            display: block;
            border-radius: 12px;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        `;
        img.addEventListener('mouseenter', () => {
            img.style.transform = 'scale(1.03)';
            img.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
        });
        img.addEventListener('mouseleave', () => {
            img.style.transform = '';
            img.style.boxShadow = '';
        });
        img.addEventListener('click', () => {
            this.showImageLightbox(url, caption, source);
        });

        imageContainer.style.cssText = `
            margin-top: 12px;
            display: inline-block;
            border-radius: 12px;
            overflow: hidden;
            background: #f3f4f6;
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        `;

        imageContainer.appendChild(img);

        // Caption + source below thumbnail
        if (caption || source) {
            const metaEl = document.createElement('div');
            metaEl.style.cssText = `
                padding: 6px 10px;
                font-size: 11px;
                color: #86868b;
                background: #f9fafb;
            `;
            if (caption) {
                metaEl.textContent = caption.length > 60 ? caption.slice(0, 57) + '...' : caption;
            }
            if (source) {
                const srcSpan = document.createElement('span');
                srcSpan.textContent = ` — ${source}`;
                srcSpan.style.color = '#b0b0b0';
                metaEl.appendChild(srcSpan);
            }
            imageContainer.appendChild(metaEl);
        }

        lastMessage.appendChild(imageContainer);
        console.log('🖼️ Displayed image thumbnail:', caption || url);
    }

    /**
     * Show full-size image in a lightbox overlay (click to enlarge)
     */
    showImageLightbox(url, caption, source) {
        // Remove existing lightbox if any
        const existing = document.getElementById('visual-teaching-lightbox');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'visual-teaching-lightbox';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.8);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            animation: vtl-fade-in 0.2s ease;
            padding: 20px;
        `;

        const img = document.createElement('img');
        img.src = url;
        img.alt = caption || '';
        img.referrerPolicy = 'no-referrer';
        img.style.cssText = `
            max-width: 90vw;
            max-height: 80vh;
            object-fit: contain;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        `;

        overlay.appendChild(img);

        if (caption || source) {
            const captionEl = document.createElement('p');
            captionEl.style.cssText = `
                color: #fff;
                font-size: 14px;
                margin-top: 12px;
                text-align: center;
                max-width: 600px;
            `;
            captionEl.textContent = caption || '';
            if (source) {
                const srcSpan = document.createElement('span');
                srcSpan.textContent = ` — ${source}`;
                srcSpan.style.color = 'rgba(255,255,255,0.6)';
                captionEl.appendChild(srcSpan);
            }
            overlay.appendChild(captionEl);
        }

        // Close on click or Escape
        overlay.addEventListener('click', () => overlay.remove());
        const onEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', onEscape);
            }
        };
        document.addEventListener('keydown', onEscape);

        // Add fade-in animation
        if (!document.getElementById('vtl-styles')) {
            const style = document.createElement('style');
            style.id = 'vtl-styles';
            style.textContent = `@keyframes vtl-fade-in { from { opacity: 0; } to { opacity: 1; } }`;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);
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

    showCounters(positive, negative, label) {
        console.log(`🟡🔴 Showing counters: +${positive}, -${negative}`);

        const messages = document.querySelectorAll('.message.ai');
        if (messages.length === 0) return;

        const lastMessage = messages[messages.length - 1];

        // Use InlineChatVisuals if available for consistent rendering
        if (window.inlineChatVisuals && typeof window.inlineChatVisuals.createCounters === 'function') {
            const labelStr = label ? `,label="${label}"` : '';
            const paramStr = `positive=${positive},negative=${negative},animate=true${labelStr}`;
            const html = window.inlineChatVisuals.createCounters(paramStr);

            const container = document.createElement('div');
            container.innerHTML = html;
            lastMessage.appendChild(container.firstElementChild);

            // Initialize interactivity
            window.inlineChatVisuals.initInteractiveCounters(lastMessage);
        } else {
            // Fallback: simple counter display
            const counterViz = this.createSimpleCountersHTML(positive, negative, label);
            lastMessage.appendChild(counterViz);
        }
    }

    createSimpleCountersHTML(positive, negative, label) {
        const container = document.createElement('div');
        container.className = 'counter-visual';
        container.style.cssText = `
            margin-top: 15px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 12px;
        `;

        let html = label ? `<div style="font-weight:600;margin-bottom:10px;text-align:center">${this.escapeHtml(label)}</div>` : '';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">';

        for (let i = 0; i < positive; i++) {
            html += `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(145deg,#fbbf24,#f59e0b);border:2px solid #d97706;display:flex;align-items:center;justify-content:center;font-weight:700;color:#78350f;font-size:18px">+</div>`;
        }
        for (let i = 0; i < negative; i++) {
            html += `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(145deg,#f87171,#ef4444);border:2px solid #dc2626;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:18px">−</div>`;
        }

        html += '</div>';
        html += `<div style="text-align:center;margin-top:10px;font-weight:600;font-size:16px">${positive} + (−${negative}) = ${positive - negative}</div>`;

        container.innerHTML = html;
        return container;
    }

    // ==================== UTILITY METHODS ====================

    escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize globally
window.visualTeachingHandler = new VisualTeachingHandler();
console.log('✅ Visual Teaching Handler ready');
