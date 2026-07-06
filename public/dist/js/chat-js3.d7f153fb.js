/* --- /js/whiteboard.js --- */
// ============================================
// MATHMATIX WHITEBOARD - MODERN DRAWING SYSTEM
// ============================================

class MathmatixWhiteboard {
    constructor(canvasId, panelId) {
        this.canvasId = canvasId;
        this.panelId = panelId;
        this.canvas = null;
        this.panel = null;

        // Drawing state
        this.currentTool = 'pen';
        this.currentColor = '#000000';
        this.strokeWidth = 3;
        this.isDrawing = false;

        // COGNITIVE WORKSPACE: Three-mode system
        this.boardMode = 'student'; // 'teacher' (AI-driven), 'student' (student writes), 'collaborative' (turn-taking)
        this.arrowMode = 'end'; // 'none', 'start', 'end', 'both'

        // AI Presence system
        this.aiIsThinking = false;
        this.aiCursorPosition = { x: 0, y: 0 };
        this.aiAnimationQueue = [];

        // Spatial regions for intelligent organization
        this.regions = {
            working: { x: 0, y: 0, width: 0.6, height: 1, label: 'Working Area' },
            scratch: { x: 0.6, y: 0, width: 0.4, height: 0.7, label: 'Scratch Space' },
            given: { x: 0, y: 0, width: 1, height: 0.15, label: 'Given' },
            answer: { x: 0.6, y: 0.7, width: 0.4, height: 0.3, label: 'Answer', locked: true }
        };

        // Semantic objects (smart math entities)
        this.semanticObjects = new Map(); // id -> { type, data, fabricObject }
        this.objectIdCounter = 0;

        // Time-based replay
        this.timeline = [];
        this.timelineIndex = 0;
        this.isReplaying = false;

        // Panel state
        this.isDragging = false;
        this.isResizing = false;
        this.dragOffset = { x: 0, y: 0 };
        this.isMaximized = false;
        this.isMinimized = false;

        // History for undo/redo
        this.history = [];
        this.historyStep = 0;

        // Initialize
        this.init();
    }

    init() {
        const canvasElement = document.getElementById(this.canvasId);
        this.panel = document.getElementById(this.panelId);

        if (!canvasElement || !this.panel) {
            console.error('Whiteboard: Canvas or panel not found');
            return;
        }

        // Initialize Fabric.js canvas
        this.canvas = new fabric.Canvas(this.canvasId, {
            isDrawingMode: false,
            selection: true,
            backgroundColor: '#ffffff',
            preserveObjectStacking: true,
        });

        this.setupEventListeners();
        this.setupPanelControls();
        this.loadSavedLayout(); // Load saved position/size from localStorage
        this.resizeCanvas();
        this.saveState();

        // Initialize UX enhancements
        this.setupKeyboardShortcuts();
        this.setupContextMenu();
        this.setupFloatingToolbar();
        this.setupTouchGestures();
        this._clipboard = null; // For copy/paste

        // Initialize handwriting engine for natural AI drawing
        if (typeof HandwritingEngine !== 'undefined') {
            this.handwriting = new HandwritingEngine(this);
            console.log('✍️ Handwriting engine initialized for natural AI writing');
        } else {
            console.warn('⚠️ HandwritingEngine not available - will use static rendering');
        }

        console.log('✅ Mathmatix Whiteboard initialized with enhanced UX');
    }

    setupEventListeners() {
        // Canvas events
        this.canvas.on('mouse:down', (e) => this.onMouseDown(e));
        this.canvas.on('mouse:move', (e) => this.onMouseMove(e));
        this.canvas.on('mouse:up', (e) => this.onMouseUp(e));
        this.canvas.on('object:added', (e) => this.onObjectAdded(e));
        this.canvas.on('object:modified', (e) => this.onObjectModified(e));

        // Make drawn paths selectable after creation
        this.canvas.on('path:created', (e) => {
            if (e.path) {
                e.path.set({
                    selectable: true,
                    hasControls: true,
                    hasBorders: true
                });
                this.canvas.renderAll();
            }
        });

        // Resize observer
        const resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        resizeObserver.observe(this.panel);

        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());

        // Mode enforcement: block student drawing in teacher mode
        this.canvas.on('mouse:down', (e) => {
            if (this.boardMode === 'teacher' && !this.aiIsDrawing) {
                console.log('[Whiteboard] Teacher mode - student drawing disabled');
                return false;
            }
        });
    }

    setupPanelControls() {
        // Close button
        const closeBtn = this.panel.querySelector('#close-whiteboard-btn');
        if (closeBtn) {
            // Use mousedown with capture to ensure it fires before dragging
            closeBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, true);

            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                // Reset maximized state when closing
                this.panel.classList.remove('maximized');
                this.isMaximized = false;
                const openBtn = document.getElementById('open-whiteboard-btn');
                if (openBtn) openBtn.classList.remove('hidden');
            }, true);
        }

        // Minimize button
        const minimizeBtn = this.panel.querySelector('#minimize-whiteboard-btn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, true);

            minimizeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.minimize();
            }, true);
        }

        // Maximize button
        const maximizeBtn = this.panel.querySelector('#maximize-whiteboard-btn');
        if (maximizeBtn) {
            maximizeBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, true);

            maximizeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.maximize();
                const icon = maximizeBtn.querySelector('i');
                if (icon) {
                    icon.className = this.isMaximized ? 'fas fa-compress' : 'fas fa-expand';
                }
            }, true);
        }

        // Layout mode switcher
        const layoutModeBtn = this.panel.querySelector('#layout-mode-btn');
        const layoutModeMenu = this.panel.querySelector('#layout-mode-menu');
        if (layoutModeBtn && layoutModeMenu) {
            layoutModeBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, true);

            layoutModeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const currentDisplay = layoutModeMenu.style.display;
                layoutModeMenu.style.display = currentDisplay === 'none' || !currentDisplay ? 'block' : 'none';
            }, true);

            // Handle layout mode selection
            layoutModeMenu.querySelectorAll('.layout-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const mode = e.currentTarget.dataset.mode;
                    if (window.whiteboardChatLayout) {
                        window.whiteboardChatLayout.setLayoutMode(mode);
                    }
                    layoutModeMenu.style.display = 'none';
                });
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!layoutModeBtn.contains(e.target) && !layoutModeMenu.contains(e.target)) {
                    layoutModeMenu.style.display = 'none';
                }
            });
        }

        // Dragging
        const header = this.panel.querySelector('.whiteboard-header');
        if (header) {
            header.addEventListener('mousedown', (e) => this.startDragging(e));
        }

        document.addEventListener('mousemove', (e) => this.doDragging(e));
        document.addEventListener('mouseup', () => this.stopDragging());

        // Resize handle
        const resizeHandle = this.panel.querySelector('.whiteboard-resize-handle');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => this.startResizing(e));
        }

        document.addEventListener('mousemove', (e) => this.doResizing(e));
        document.addEventListener('mouseup', () => this.stopResizing());
    }

    // ============================================
    // DRAWING TOOLS
    // ============================================

    setTool(tool) {
        this.currentTool = tool;
        this.updateCanvasMode();
        this.updateModeIndicator();
    }

    updateCanvasMode() {
        switch (this.currentTool) {
            case 'pen':
            case 'highlighter':
                this.canvas.isDrawingMode = true;
                this.canvas.freeDrawingBrush.color = this.currentColor;
                this.canvas.freeDrawingBrush.width = this.strokeWidth;
                if (this.currentTool === 'highlighter') {
                    this.canvas.freeDrawingBrush.width = this.strokeWidth * 3;
                }
                break;

            case 'eraser':
                this.canvas.isDrawingMode = true;
                this.canvas.freeDrawingBrush.color = '#ffffff';
                this.canvas.freeDrawingBrush.width = this.strokeWidth * 2;
                break;

            case 'select':
                this.canvas.isDrawingMode = false;
                this.canvas.selection = true;
                break;

            default:
                this.canvas.isDrawingMode = false;
                this.canvas.selection = false;
        }
    }

    setColor(color) {
        this.currentColor = color;
        if (this.canvas.isDrawingMode && this.currentTool !== 'eraser') {
            this.canvas.freeDrawingBrush.color = color;
        }
    }

    setStrokeWidth(width) {
        this.strokeWidth = parseInt(width);
        if (this.canvas.isDrawingMode) {
            this.canvas.freeDrawingBrush.width = this.strokeWidth;
        }
    }

    // ============================================
    // SHAPE DRAWING
    // ============================================

    onMouseDown(e) {
        if (this.canvas.isDrawingMode || this.currentTool === 'select') return;

        this.isDrawing = true;
        const pointer = this.canvas.getPointer(e.e);
        this.startPoint = { x: pointer.x, y: pointer.y };

        // Create shape based on tool
        switch (this.currentTool) {
            case 'line':
                this.currentShape = new fabric.Line(
                    [pointer.x, pointer.y, pointer.x, pointer.y],
                    {
                        stroke: this.currentColor,
                        strokeWidth: this.strokeWidth,
                        selectable: false,
                    }
                );
                break;

            case 'arrow':
                this.currentShape = this.createArrow(pointer.x, pointer.y, pointer.x, pointer.y);
                break;

            case 'rectangle':
                this.currentShape = new fabric.Rect({
                    left: pointer.x,
                    top: pointer.y,
                    width: 0,
                    height: 0,
                    fill: 'transparent',
                    stroke: this.currentColor,
                    strokeWidth: this.strokeWidth,
                    selectable: false,
                });
                break;

            case 'circle':
                this.currentShape = new fabric.Circle({
                    left: pointer.x,
                    top: pointer.y,
                    radius: 0,
                    fill: 'transparent',
                    stroke: this.currentColor,
                    strokeWidth: this.strokeWidth,
                    selectable: false,
                });
                break;

            case 'triangle':
                this.currentShape = new fabric.Triangle({
                    left: pointer.x,
                    top: pointer.y,
                    width: 0,
                    height: 0,
                    fill: 'transparent',
                    stroke: this.currentColor,
                    strokeWidth: this.strokeWidth,
                    selectable: false,
                });
                break;

            case 'text':
                this.addText(pointer.x, pointer.y);
                this.isDrawing = false;
                return;
        }

        if (this.currentShape) {
            this.canvas.add(this.currentShape);
        }
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.currentShape) return;

        const pointer = this.canvas.getPointer(e.e);

        switch (this.currentTool) {
            case 'line':
                this.currentShape.set({
                    x2: pointer.x,
                    y2: pointer.y
                });
                break;

            case 'arrow':
                this.updateArrow(this.currentShape, this.startPoint.x, this.startPoint.y, pointer.x, pointer.y);
                break;

            case 'rectangle':
                const width = pointer.x - this.startPoint.x;
                const height = pointer.y - this.startPoint.y;
                this.currentShape.set({
                    width: Math.abs(width),
                    height: Math.abs(height),
                    left: width > 0 ? this.startPoint.x : pointer.x,
                    top: height > 0 ? this.startPoint.y : pointer.y,
                });
                break;

            case 'circle':
                const radius = Math.sqrt(
                    Math.pow(pointer.x - this.startPoint.x, 2) +
                    Math.pow(pointer.y - this.startPoint.y, 2)
                ) / 2;
                this.currentShape.set({ radius });
                break;

            case 'triangle':
                const triWidth = pointer.x - this.startPoint.x;
                const triHeight = pointer.y - this.startPoint.y;
                this.currentShape.set({
                    width: Math.abs(triWidth),
                    height: Math.abs(triHeight),
                });
                break;
        }

        this.canvas.renderAll();
    }

    onMouseUp(e) {
        if (this.isDrawing && this.currentShape) {
            this.currentShape.set({ selectable: true });
        }
        this.isDrawing = false;
        this.currentShape = null;
    }

    createArrow(x1, y1, x2, y2) {
        const line = new fabric.Line([x1, y1, x2, y2], {
            stroke: this.currentColor,
            strokeWidth: this.strokeWidth,
        });

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 15;
        const objects = [line];

        // Add arrowhead(s) based on mode
        if (this.arrowMode === 'end' || this.arrowMode === 'both') {
            const endHead = new fabric.Triangle({
                left: x2,
                top: y2,
                angle: (angle * 180 / Math.PI) + 90,
                width: headLength,
                height: headLength,
                fill: this.currentColor,
                originX: 'center',
                originY: 'center',
            });
            objects.push(endHead);
        }

        if (this.arrowMode === 'start' || this.arrowMode === 'both') {
            const startHead = new fabric.Triangle({
                left: x1,
                top: y1,
                angle: (angle * 180 / Math.PI) - 90,
                width: headLength,
                height: headLength,
                fill: this.currentColor,
                originX: 'center',
                originY: 'center',
            });
            objects.push(startHead);
        }

        return new fabric.Group(objects, { selectable: false });
    }

    updateArrow(arrow, x1, y1, x2, y2) {
        const objects = arrow.getObjects();
        const line = objects[0];

        line.set({ x2: x2 - x1, y2: y2 - y1 });

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 15;

        // Update arrowheads based on mode
        let headIndex = 1;

        if (this.arrowMode === 'end' || this.arrowMode === 'both') {
            if (objects[headIndex]) {
                objects[headIndex].set({
                    left: x2 - x1,
                    top: y2 - y1,
                    angle: (angle * 180 / Math.PI) + 90,
                });
                headIndex++;
            }
        }

        if (this.arrowMode === 'start' || this.arrowMode === 'both') {
            if (objects[headIndex]) {
                objects[headIndex].set({
                    left: 0,
                    top: 0,
                    angle: (angle * 180 / Math.PI) - 90,
                });
            }
        }

        arrow.addWithUpdate();
    }

    setArrowMode(mode) {
        if (['none', 'start', 'end', 'both'].includes(mode)) {
            this.arrowMode = mode;
            console.log(`Arrow mode set to: ${mode}`);
        }
    }

    addText(x, y) {
        const text = new fabric.IText('Text', {
            left: x,
            top: y,
            fontSize: 20,
            fill: this.currentColor,
            fontFamily: 'Arial',
        });
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        text.enterEditing();
    }

    // ============================================
    // MATH-SPECIFIC TOOLS
    // ============================================

    addCoordinateGrid(options = {}) {
        const {
            xMin = -10,
            xMax = 10,
            yMin = -10,
            yMax = 10,
            gridSize = 30,
            showLabels = true,
            gridColor = '#12B3B3'
        } = options;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        const grid = [];

        // Grid lines
        for (let i = xMin; i <= xMax; i++) {
            const x = centerX + (i * gridSize);
            grid.push(new fabric.Line([x, 0, x, height], {
                stroke: i === 0 ? '#666' : '#ddd',
                strokeWidth: i === 0 ? 2 : 1,
                selectable: false,
                evented: false,
            }));
        }

        for (let i = yMin; i <= yMax; i++) {
            const y = centerY - (i * gridSize);
            grid.push(new fabric.Line([0, y, width, y], {
                stroke: i === 0 ? '#666' : '#ddd',
                strokeWidth: i === 0 ? 2 : 1,
                selectable: false,
                evented: false,
            }));
        }

        // Labels
        if (showLabels) {
            for (let i = xMin; i <= xMax; i++) {
                if (i === 0) continue;
                const x = centerX + (i * gridSize);
                grid.push(new fabric.Text(i.toString(), {
                    left: x,
                    top: centerY + 5,
                    fontSize: 12,
                    fill: '#666',
                    selectable: false,
                    evented: false,
                }));
            }

            for (let i = yMin; i <= yMax; i++) {
                if (i === 0) continue;
                const y = centerY - (i * gridSize);
                grid.push(new fabric.Text(i.toString(), {
                    left: centerX + 5,
                    top: y,
                    fontSize: 12,
                    fill: '#666',
                    selectable: false,
                    evented: false,
                }));
            }
        }

        const gridGroup = new fabric.Group(grid, {
            selectable: false,
            evented: false,
        });

        this.canvas.add(gridGroup);
        this.canvas.sendToBack(gridGroup);
        this.canvas.renderAll();
    }

    plotFunction(funcString, options = {}) {
        const {
            xMin = -10,
            xMax = 10,
            color = '#12B3B3',
            strokeWidth = 3,
            samples = 200
        } = options;

        try {
            // Check if canvas is initialized
            if (!this.canvas) {
                console.error('Canvas not initialized. Cannot plot function.');
                return;
            }

            const width = this.canvas.width || this.canvas.getWidth();
            const height = this.canvas.height || this.canvas.getHeight();

            if (width === 0 || height === 0) {
                console.error(`Canvas has invalid dimensions: ${width}x${height}. Cannot plot function.`);
                return;
            }

            // Preprocess: Handle implicit multiplication (2x -> 2*x, 3x^2 -> 3*x^2, etc.)
            let processedFunc = funcString
                .replace(/(\d+)([a-zA-Z])/g, '$1*$2')  // 2x -> 2*x
                .replace(/\)([a-zA-Z])/g, ')*$1')       // )x -> )*x
                .replace(/([a-zA-Z])\(/g, '$1*(')       // x( -> x*(
                .replace(/\^/g, '**');                  // x^2 -> x**2

            console.log(`[Whiteboard] Plotting function: ${funcString} (processed: ${processedFunc})`);

            // Parse function (simple evaluation)
            const func = new Function('x', `return ${processedFunc}`);

            const centerX = width / 2;
            const centerY = height / 2;
            const gridSize = 30;

            const points = [];
            const step = (xMax - xMin) / samples;

            for (let x = xMin; x <= xMax; x += step) {
                try {
                    const y = func(x);
                    if (isFinite(y)) {
                        points.push({
                            x: centerX + (x * gridSize),
                            y: centerY - (y * gridSize)
                        });
                    }
                } catch (e) {
                    // Skip invalid points
                }
            }

            if (points.length < 2) {
                console.error(`Not enough valid points to plot for function: ${funcString}`);
                console.error(`Canvas dimensions: ${width}x${height}, Generated ${points.length} points`);
                console.error('Tip: Make sure the whiteboard is visible and has been initialized properly');
                return;
            }

            const polyline = new fabric.Polyline(points, {
                fill: '',
                stroke: color,
                strokeWidth: strokeWidth,
                selectable: false,
                evented: false,
            });

            this.canvas.add(polyline);
            this.canvas.renderAll();
            console.log(`✅ Plotted function with ${points.length} points`);
        } catch (error) {
            console.error('Error plotting function:', error);
        }
    }

    plotInequality(inequalityString, options = {}) {
        const {
            xMin = -10,
            xMax = 10,
            yMin = -10,
            yMax = 10,
            color = '#12B3B3',
            strokeWidth = 3,
            samples = 200
        } = options;

        try {
            // Parse inequality: y > 2x + 1, y <= x^2, etc.
            let operator, leftSide, rightSide;

            if (inequalityString.includes('>=')) {
                [leftSide, rightSide] = inequalityString.split('>=');
                operator = '>=';
            } else if (inequalityString.includes('<=')) {
                [leftSide, rightSide] = inequalityString.split('<=');
                operator = '<=';
            } else if (inequalityString.includes('>')) {
                [leftSide, rightSide] = inequalityString.split('>');
                operator = '>';
            } else if (inequalityString.includes('<')) {
                [leftSide, rightSide] = inequalityString.split('<');
                operator = '<';
            } else {
                console.error('No inequality operator found');
                return;
            }

            leftSide = leftSide.trim();
            rightSide = rightSide.trim();

            // For now, we assume left side is 'y' and right side is function of x
            if (leftSide !== 'y') {
                console.error('Currently only supports y on left side');
                return;
            }

            // Plot boundary line (solid for >= and <=, dashed for > and <)
            const lineStyle = (operator === '>=' || operator === '<=') ? [] : [10, 5];
            this.plotFunction(rightSide, {
                xMin, xMax,
                color: color,
                strokeWidth: strokeWidth,
                samples: samples
            });

            // Make the boundary line dashed if needed
            if (lineStyle.length > 0) {
                const objects = this.canvas.getObjects();
                const lastLine = objects[objects.length - 1];
                if (lastLine) {
                    lastLine.set({ strokeDashArray: lineStyle });
                }
            }

            // Create shading
            const width = this.canvas.width;
            const height = this.canvas.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const gridSize = 30;

            // Preprocess function
            let processedFunc = rightSide
                .replace(/(\d+)([a-zA-Z])/g, '$1*$2')
                .replace(/\)([a-zA-Z])/g, ')*$1')
                .replace(/([a-zA-Z])\(/g, '$1*(')
                .replace(/\^/g, '**');

            const func = new Function('x', `return ${processedFunc}`);

            // Create polygon for shading
            const shadingPoints = [];
            const step = (xMax - xMin) / samples;

            for (let x = xMin; x <= xMax; x += step) {
                try {
                    const y = func(x);
                    if (isFinite(y)) {
                        const canvasX = centerX + (x * gridSize);
                        const canvasY = centerY - (y * gridSize);
                        shadingPoints.push({ x: canvasX, y: canvasY });
                    }
                } catch (e) {
                    // Skip invalid points
                }
            }

            // Add boundary points based on operator direction
            const shadeAbove = (operator === '>' || operator === '>=');

            if (shadeAbove) {
                // Add top boundary
                shadingPoints.push({ x: centerX + (xMax * gridSize), y: 0 });
                shadingPoints.push({ x: centerX + (xMin * gridSize), y: 0 });
            } else {
                // Add bottom boundary
                shadingPoints.push({ x: centerX + (xMax * gridSize), y: height });
                shadingPoints.push({ x: centerX + (xMin * gridSize), y: height });
            }

            if (shadingPoints.length > 2) {
                const shading = new fabric.Polygon(shadingPoints, {
                    fill: color,
                    opacity: 0.2,
                    selectable: false,
                    evented: false,
                });

                this.canvas.add(shading);
                this.canvas.sendToBack(shading);
            }

            this.canvas.renderAll();
            console.log(`✅ Plotted inequality: ${inequalityString}`);
        } catch (error) {
            console.error('Error plotting inequality:', error);
        }
    }

    addProtractor(x, y) {
        // Create a simple protractor
        const protractor = new fabric.Circle({
            left: x,
            top: y,
            radius: 80,
            fill: 'transparent',
            stroke: '#333',
            strokeWidth: 2,
            startAngle: 0,
            endAngle: Math.PI,
        });

        // Add degree markings
        const marks = [];
        for (let i = 0; i <= 180; i += 10) {
            const angle = (i * Math.PI) / 180;
            const x1 = x + 80 + 80 * Math.cos(angle);
            const y1 = y + 80 + 80 * Math.sin(angle);
            const x2 = x + 80 + (i % 30 === 0 ? 65 : 70) * Math.cos(angle);
            const y2 = y + 80 + (i % 30 === 0 ? 65 : 70) * Math.sin(angle);

            marks.push(new fabric.Line([x1, y1, x2, y2], {
                stroke: '#333',
                strokeWidth: 1,
            }));

            if (i % 30 === 0) {
                marks.push(new fabric.Text(i.toString(), {
                    left: x + 80 + 55 * Math.cos(angle),
                    top: y + 80 + 55 * Math.sin(angle),
                    fontSize: 10,
                    fill: '#333',
                    originX: 'center',
                    originY: 'center',
                }));
            }
        }

        const protractorGroup = new fabric.Group([protractor, ...marks]);
        this.canvas.add(protractorGroup);
        this.canvas.renderAll();
    }

    // ============================================
    // CANVAS ACTIONS
    // ============================================

    clear() {
        this.canvas.clear();
        this.canvas.backgroundColor = '#ffffff';
        this.saveState();
        this.canvas.renderAll();
    }

    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            this.canvas.loadFromJSON(this.history[this.historyStep], () => {
                this.canvas.renderAll();
            });
        }
    }

    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            this.canvas.loadFromJSON(this.history[this.historyStep], () => {
                this.canvas.renderAll();
            });
        }
    }

    saveState() {
        const json = JSON.stringify(this.canvas.toJSON());
        this.history = this.history.slice(0, this.historyStep + 1);
        this.history.push(json);
        this.historyStep = this.history.length - 1;
    }

    onObjectAdded(e) {
        // Record to timeline for replay
        if (!this.isReplaying) {
            this.timeline.push({
                timestamp: Date.now(),
                action: 'add',
                object: e.target.toJSON(),
                mode: this.boardMode
            });
            this.saveState();
        }
    }

    onObjectModified(e) {
        // Record modifications to timeline
        if (!this.isReplaying) {
            this.timeline.push({
                timestamp: Date.now(),
                action: 'modify',
                object: e.target.toJSON(),
                mode: this.boardMode
            });
            this.saveState();
        }
    }

    deleteSelected() {
        const activeObjects = this.canvas.getActiveObjects();
        if (activeObjects.length) {
            activeObjects.forEach(obj => this.canvas.remove(obj));
            this.canvas.discardActiveObject();
            this.canvas.renderAll();
        }
    }

    downloadImage() {
        const dataURL = this.canvas.toDataURL({
            format: 'png',
            quality: 1,
        });
        const link = document.createElement('a');
        link.download = `mathmatix-whiteboard-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
    }

    setBackgroundImage(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            fabric.Image.fromURL(e.target.result, (img) => {
                // Scale image to fit canvas while maintaining aspect ratio
                const canvasAspect = this.canvas.width / this.canvas.height;
                const imgAspect = img.width / img.height;
                let scale;

                if (imgAspect > canvasAspect) {
                    scale = this.canvas.width / img.width;
                } else {
                    scale = this.canvas.height / img.height;
                }

                img.scale(scale);
                img.set({
                    left: 0,
                    top: 0,
                    selectable: false,
                    evented: false,
                    opacity: 0.7, // Slightly transparent so drawings show up better
                });

                // Set as background image
                this.canvas.setBackgroundImage(img, this.canvas.renderAll.bind(this.canvas));

                console.log('✅ Background image loaded');
            });
        };

        reader.readAsDataURL(file);
    }

    removeBackgroundImage() {
        this.canvas.setBackgroundImage(null, this.canvas.renderAll.bind(this.canvas));
        this.canvas.backgroundColor = '#ffffff';
        this.canvas.renderAll();
    }

    setPresetBackground(type) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        switch (type) {
            case 'none':
                this.removeBackgroundImage();
                break;

            case 'white':
                this.removeBackgroundImage();
                this.canvas.backgroundColor = '#ffffff';
                break;

            case 'black':
                this.removeBackgroundImage();
                this.canvas.backgroundColor = '#000000';
                break;

            case 'grid':
                // Uses existing coordinate grid method
                this.removeBackgroundImage();
                this.canvas.backgroundColor = '#ffffff';
                this.addCoordinateGrid();
                break;

            case 'lined':
                this.removeBackgroundImage();
                this.generateLinedPaper();
                break;

            case 'graph':
                this.removeBackgroundImage();
                this.generateGraphPaper();
                break;
        }

        this.canvas.renderAll();
    }

    generateLinedPaper() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const lineSpacing = 30;
        const marginLeft = 80;

        this.canvas.backgroundColor = '#fffff8'; // Slight cream color

        // Red margin line
        const marginLine = new fabric.Line([marginLeft, 0, marginLeft, height], {
            stroke: '#ff6b6b',
            strokeWidth: 2,
            selectable: false,
            evented: false,
        });
        this.canvas.add(marginLine);
        this.canvas.sendToBack(marginLine);

        // Horizontal lines
        for (let y = lineSpacing; y < height; y += lineSpacing) {
            const line = new fabric.Line([0, y, width, y], {
                stroke: '#b8dae8',
                strokeWidth: 1,
                selectable: false,
                evented: false,
            });
            this.canvas.add(line);
            this.canvas.sendToBack(line);
        }
    }

    generateGraphPaper() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const gridSize = 20;

        this.canvas.backgroundColor = '#ffffff';

        // Vertical lines
        for (let x = 0; x <= width; x += gridSize) {
            const line = new fabric.Line([x, 0, x, height], {
                stroke: '#e0e0e0',
                strokeWidth: 1,
                selectable: false,
                evented: false,
            });
            this.canvas.add(line);
            this.canvas.sendToBack(line);
        }

        // Horizontal lines
        for (let y = 0; y <= height; y += gridSize) {
            const line = new fabric.Line([0, y, width, y], {
                stroke: '#e0e0e0',
                strokeWidth: 1,
                selectable: false,
                evented: false,
            });
            this.canvas.add(line);
            this.canvas.sendToBack(line);
        }
    }

    // ============================================
    // PANEL CONTROLS
    // ============================================

    show() {
        this.panel.classList.remove('is-hidden');
        this.resizeCanvas();
    }

    hide() {
        this.panel.classList.add('is-hidden');

        // Clean up split-screen layout when hiding
        if (window.whiteboardChatLayout) {
            window.whiteboardChatLayout.onWhiteboardClose();
        }

        console.log('✅ Whiteboard hidden');
    }

    toggle() {
        if (this.panel.classList.contains('is-hidden')) {
            this.show();
        } else {
            this.hide();
        }
    }

    maximize() {
        this.panel.classList.toggle('maximized');
        this.isMaximized = !this.isMaximized;
        setTimeout(() => this.resizeCanvas(), 100);

        console.log(`✅ Whiteboard ${this.isMaximized ? 'maximized' : 'restored'}`);
    }

    minimize() {
        const wasMinimized = this.isMinimized;
        this.panel.classList.toggle('minimized');
        this.isMinimized = !this.isMinimized;

        // In split-screen mode, minimize should collapse to thin bar
        if (document.body.classList.contains('whiteboard-split-screen')) {
            this.panel.classList.toggle('collapsed', this.isMinimized);
            const chatContainer = document.getElementById('chat-container');
            if (chatContainer) {
                chatContainer.classList.toggle('whiteboard-collapsed', this.isMinimized);
            }
        }

        console.log(`✅ Whiteboard ${this.isMinimized ? 'minimized' : 'restored'}`);
    }

    startDragging(e) {
        // Don't drag if maximized or if clicking on buttons/controls
        if (this.isMaximized ||
            e.target.closest('.toolbar-btn') ||
            e.target.closest('.whiteboard-control-btn') ||
            e.target.closest('button')) {
            return;
        }
        this.isDragging = true;
        this.dragOffset = {
            x: e.clientX - this.panel.offsetLeft,
            y: e.clientY - this.panel.offsetTop
        };
        this.panel.style.cursor = 'grabbing';
    }

    doDragging(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        let newLeft = e.clientX - this.dragOffset.x;
        let newTop = e.clientY - this.dragOffset.y;

        // Boundary checking
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - this.panel.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - this.panel.offsetHeight));

        this.panel.style.left = newLeft + 'px';
        this.panel.style.top = newTop + 'px';
        this.panel.style.right = 'auto';
    }

    stopDragging() {
        this.isDragging = false;
        this.panel.style.cursor = '';
        this.saveLayout(); // Save position when dragging stops
    }

    startResizing(e) {
        if (this.isMaximized) return;
        e.preventDefault();
        e.stopPropagation();
        this.isResizing = true;
        this.resizeStart = {
            x: e.clientX,
            y: e.clientY,
            width: this.panel.offsetWidth,
            height: this.panel.offsetHeight
        };
    }

    doResizing(e) {
        if (!this.isResizing) return;
        e.preventDefault();

        const deltaX = e.clientX - this.resizeStart.x;
        const deltaY = e.clientY - this.resizeStart.y;

        const newWidth = Math.max(300, this.resizeStart.width + deltaX);
        const newHeight = Math.max(250, this.resizeStart.height + deltaY);

        this.panel.style.width = newWidth + 'px';
        this.panel.style.height = newHeight + 'px';

        this.resizeCanvas();
    }

    stopResizing() {
        this.isResizing = false;
        this.saveLayout(); // Save size when resizing stops
    }

    resizeCanvas() {
        if (!this.panel || !this.canvas) return;

        const header = this.panel.querySelector('.whiteboard-header');
        const toolbar = this.panel.querySelector('.whiteboard-toolbar');
        const headerHeight = header ? header.offsetHeight : 0;
        const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;

        const canvasWidth = this.panel.clientWidth;
        const canvasHeight = this.panel.clientHeight - headerHeight - toolbarHeight;

        this.canvas.setWidth(canvasWidth);
        this.canvas.setHeight(canvasHeight);
        this.canvas.renderAll();
    }

    updateModeIndicator() {
        const indicator = this.panel.querySelector('.canvas-mode-indicator');
        if (!indicator) return;

        const modeNames = {
            'pen': '✏️ Drawing',
            'eraser': '🧹 Erasing',
            'select': '👆 Select',
            'line': '📏 Line',
            'arrow': '➡️ Arrow',
            'rectangle': '▢ Rectangle',
            'circle': '⭕ Circle',
            'triangle': '△ Triangle',
            'text': '📝 Text',
        };

        indicator.textContent = modeNames[this.currentTool] || this.currentTool;
    }

    // ============================================
    // MODE MANAGEMENT (Three-Mode System)
    // ============================================

    setBoardMode(mode) {
        if (!['teacher', 'student', 'collaborative'].includes(mode)) {
            console.error('[Whiteboard] Invalid mode:', mode);
            return;
        }

        this.boardMode = mode;
        this.updateModeIndicator();

        // Update canvas interaction based on mode
        if (mode === 'teacher') {
            this.canvas.selection = false;
            this.canvas.isDrawingMode = false;
            console.log('🧠 Teacher Mode: AI controls the board');
        } else if (mode === 'student') {
            this.canvas.selection = true;
            this.setTool('pen'); // Default to pen for student
            console.log('✍️ Student Mode: You have control');
        } else {
            this.canvas.selection = true;
            console.log('🤝 Collaborative Mode: Turn-taking enabled');
        }
    }

    updateModeIndicator() {
        const indicator = this.panel.querySelector('.canvas-mode-indicator');
        if (!indicator) return;

        const modeEmojis = {
            'teacher': '🧠 Teacher Mode (AI Teaching)',
            'student': '✍️ Student Mode (Your Turn)',
            'collaborative': '🤝 Collaborative Mode'
        };

        indicator.textContent = modeEmojis[this.boardMode] || this.boardMode;
        indicator.style.background = this.boardMode === 'teacher'
            ? 'rgba(18, 179, 179, 0.9)'
            : this.boardMode === 'student'
            ? 'rgba(59, 130, 246, 0.9)'
            : 'rgba(139, 92, 246, 0.9)';
    }

    // ============================================
    // AI PRESENCE SYSTEM
    // ============================================

    showAIThinking() {
        this.aiIsThinking = true;
        // TODO: Add ghost cursor animation
        console.log('👻 AI is thinking...');
    }

    hideAIThinking() {
        this.aiIsThinking = false;
    }

    async moveAICursor(x, y, duration = 500) {
        // Animate AI cursor to position
        this.aiCursorPosition = { x, y };
        // TODO: Add smooth cursor movement animation
        await this.sleep(duration);
    }

    // ============================================
    // SEMANTIC OBJECTS (Smart Math Entities)
    // ============================================

    createSemanticEquation(latex, x, y, options = {}) {
        const id = `eq_${this.objectIdCounter++}`;

        const text = new fabric.IText(latex, {
            left: x,
            top: y,
            fontSize: options.fontSize || 24,
            fill: options.color || this.currentColor,
            fontFamily: options.handwritten ? 'Indie Flower, cursive' : 'Arial',
            selectable: this.boardMode !== 'teacher',
        });

        this.canvas.add(text);

        // Store semantic metadata
        this.semanticObjects.set(id, {
            type: 'equation',
            latex: latex,
            fabricObject: text,
            region: this.getRegionAt(x, y),
            createdBy: this.boardMode === 'teacher' ? 'ai' : 'student',
            timestamp: Date.now()
        });

        return id;
    }

    highlightObject(id, color = '#ff6b6b', duration = 2000) {
        const obj = this.semanticObjects.get(id);
        if (!obj) return;

        const fabricObj = obj.fabricObject;
        const originalColor = fabricObj.fill;

        // Add gentle halo effect
        fabricObj.set('shadow', {
            color: color,
            blur: 15,
            offsetX: 0,
            offsetY: 0
        });
        this.canvas.renderAll();

        // Fade out after duration
        setTimeout(() => {
            fabricObj.set('shadow', null);
            this.canvas.renderAll();
        }, duration);
    }

    addQuestionMark(objectId) {
        const obj = this.semanticObjects.get(objectId);
        if (!obj) return;

        const fabricObj = obj.fabricObject;
        const qMark = new fabric.Text('?', {
            left: fabricObj.left + fabricObj.width + 10,
            top: fabricObj.top,
            fontSize: 28,
            fill: '#ff6b6b',
            fontWeight: 'bold',
            selectable: false
        });

        this.canvas.add(qMark);
        return qMark;
    }

    // ============================================
    // SPATIAL INTELLIGENCE (Board Regions)
    // ============================================

    getRegionAt(x, y) {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const relX = x / canvasWidth;
        const relY = y / canvasHeight;

        for (const [name, region] of Object.entries(this.regions)) {
            if (relX >= region.x && relX <= region.x + region.width &&
                relY >= region.y && relY <= region.y + region.height) {
                return name;
            }
        }
        return 'working'; // default
    }

    getRegionBounds(regionName) {
        const region = this.regions[regionName];
        if (!region) return null;

        return {
            x: region.x * this.canvas.width,
            y: region.y * this.canvas.height,
            width: region.width * this.canvas.width,
            height: region.height * this.canvas.height
        };
    }

    moveToRegion(objectId, regionName) {
        const obj = this.semanticObjects.get(objectId);
        if (!obj) return;

        const bounds = this.getRegionBounds(regionName);
        if (!bounds) return;

        // Animate object to region
        obj.fabricObject.animate({
            left: bounds.x + 20,
            top: bounds.y + 20
        }, {
            duration: 500,
            onChange: this.canvas.renderAll.bind(this.canvas)
        });

        obj.region = regionName;
    }

    showRegionGuides() {
        // Visual overlay showing regions (for debugging/teaching)
        Object.entries(this.regions).forEach(([name, region]) => {
            const bounds = this.getRegionBounds(name);
            const rect = new fabric.Rect({
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                fill: 'transparent',
                stroke: '#12B3B3',
                strokeWidth: 2,
                strokeDashArray: [10, 5],
                selectable: false,
                evented: false,
                opacity: 0.3
            });

            const label = new fabric.Text(region.label, {
                left: bounds.x + 10,
                top: bounds.y + 10,
                fontSize: 14,
                fill: '#666',
                selectable: false,
                evented: false
            });

            this.canvas.add(rect);
            this.canvas.add(label);
        });

        this.canvas.renderAll();
    }

    // ============================================
    // AI TEACHING BEHAVIORS (Strategic Intelligence)
    // ============================================

    async aiWritePartialStep(text, x, y, pauseAfter = true) {
        // Teacher mode: AI writes, then pauses
        this.setBoardMode('teacher');
        this.showAIThinking();

        // Simulate handwriting speed
        const chars = text.split('');
        let displayText = '';

        const textObj = new fabric.IText('', {
            left: x,
            top: y,
            fontSize: 24,
            fill: '#2d3748',
            fontFamily: 'Indie Flower, cursive', // Handwritten feel
            selectable: false
        });
        this.canvas.add(textObj);

        for (const char of chars) {
            displayText += char;
            textObj.set('text', displayText);
            this.canvas.renderAll();
            await this.sleep(50); // Typing speed
        }

        this.hideAIThinking();

        if (pauseAfter) {
            // Intentional pause - silence is teaching
            await this.sleep(1500);
        }

        return textObj;
    }

    async aiDrawArrowToBlank(fromId, message = "Your turn") {
        const obj = this.semanticObjects.get(fromId);
        if (!obj) return;

        const fabricObj = obj.fabricObject;

        // Draw arrow pointing to blank space
        const arrow = this.createArrow(
            fabricObj.left + fabricObj.width + 20,
            fabricObj.top + fabricObj.height / 2,
            fabricObj.left + fabricObj.width + 100,
            fabricObj.top + fabricObj.height / 2
        );

        this.canvas.add(arrow);

        // Add prompt text
        if (message) {
            const prompt = new fabric.Text(message, {
                left: fabricObj.left + fabricObj.width + 110,
                top: fabricObj.top,
                fontSize: 18,
                fill: '#12B3B3',
                fontStyle: 'italic',
                selectable: false
            });
            this.canvas.add(prompt);
        }

        this.canvas.renderAll();

        // Switch to student mode - invite them to write
        this.setBoardMode('student');
    }

    async aiCircleWithQuestion(objectId, message = "Check this step") {
        const obj = this.semanticObjects.get(objectId);
        if (!obj) return;

        const fabricObj = obj.fabricObject;

        // Draw circle around the object
        const circle = new fabric.Circle({
            left: fabricObj.left - 10,
            top: fabricObj.top - 10,
            radius: Math.max(fabricObj.width, fabricObj.height) / 2 + 15,
            fill: 'transparent',
            stroke: '#ff6b6b',
            strokeWidth: 3,
            selectable: false
        });

        this.canvas.add(circle);

        // Add question mark
        this.addQuestionMark(objectId);

        // Add message if provided
        if (message) {
            const text = new fabric.Text(message, {
                left: fabricObj.left,
                top: fabricObj.top + fabricObj.height + 20,
                fontSize: 16,
                fill: '#ff6b6b',
                fontStyle: 'italic',
                selectable: false
            });
            this.canvas.add(text);
        }

        this.canvas.renderAll();
    }

    // ============================================
    // AI DRAWING METHODS (Enhanced)
    // ============================================

    async renderAIDrawing(sequence, delay = 300) {
        this.setBoardMode('teacher');
        this.show();

        for (const item of sequence) {
            await this.renderDrawingItem(item);
            await this.sleep(delay);
        }

        // After teaching, invite collaboration
        this.setBoardMode('collaborative');
    }

    async renderDrawingItem(item) {
        switch (item.type) {
            case 'grid':
                this.addCoordinateGrid({
                    xMin: item.xMin,
                    xMax: item.xMax,
                    yMin: item.yMin,
                    yMax: item.yMax,
                    gridSize: item.gridSize
                });
                break;

            case 'function':
                this.plotFunction(item.function, {
                    xMin: item.xMin,
                    xMax: item.xMax,
                    color: item.color
                });
                break;

            case 'line':
                // Use hand-drawn line if handwriting engine available
                if (this.handwriting && item.points.length === 4) {
                    const arrow = this.handwriting.drawHandDrawnArrow(
                        item.points[0], item.points[1],
                        item.points[2], item.points[3],
                        {
                            color: item.color || '#333',
                            strokeWidth: item.width || 2,
                            wobbleIntensity: 0.02
                        }
                    );
                    // Animate the arrow drawing
                    if (arrow && this.handwriting.animatePathDrawing) {
                        await this.handwriting.animatePathDrawing(arrow, 600);
                    }
                } else {
                    const line = new fabric.Line(item.points, {
                        stroke: item.color || '#333',
                        strokeWidth: item.width || 2,
                        selectable: false,
                        strokeLineCap: 'round',
                        strokeLineJoin: 'round'
                    });
                    this.canvas.add(line);
                }
                break;

            case 'text':
                // Use handwriting engine for natural, animated text
                if (this.handwriting && this.handwriting.writeText) {
                    await this.handwriting.writeText(item.content, item.position[0], item.position[1], {
                        fontSize: item.fontSize || 20,
                        color: item.color || '#2d3748',
                        fontFamily: 'Indie Flower, cursive',
                        selectable: false,
                        pauseAfter: true
                    });
                } else {
                    // Fallback to static text if handwriting engine not available
                    const text = new fabric.Text(item.content, {
                        left: item.position[0],
                        top: item.position[1],
                        fontSize: item.fontSize || 20,
                        fill: item.color || '#2d3748',
                        fontFamily: 'Indie Flower, cursive',
                        selectable: false,
                    });
                    this.canvas.add(text);
                }
                break;

            case 'circle':
                // Use hand-drawn circle if handwriting engine available and circle is large enough
                if (this.handwriting && item.radius > 10) {
                    const centerX = item.position[0] + item.radius;
                    const centerY = item.position[1] + item.radius;
                    const circlePath = this.handwriting.drawHandDrawnCircle(
                        centerX, centerY, item.radius,
                        {
                            color: item.stroke || '#12B3B3',
                            strokeWidth: item.strokeWidth || 2,
                            wobbleIntensity: 0.08
                        }
                    );
                    // Animate the circle drawing
                    if (circlePath && this.handwriting.animatePathDrawing) {
                        await this.handwriting.animatePathDrawing(circlePath, 800);
                    }
                } else {
                    const circle = new fabric.Circle({
                        left: item.position[0],
                        top: item.position[1],
                        radius: item.radius,
                        fill: item.fill || 'transparent',
                        stroke: item.stroke || '#12B3B3',
                        strokeWidth: item.strokeWidth || 2,
                        selectable: false,
                    });
                    this.canvas.add(circle);
                }
                break;

            case 'rectangle':
                const rect = new fabric.Rect({
                    left: item.position[0],
                    top: item.position[1],
                    width: item.width,
                    height: item.height,
                    fill: item.fill || 'transparent',
                    stroke: item.stroke || '#000',
                    strokeWidth: item.strokeWidth || 2,
                    selectable: false,
                });
                this.canvas.add(rect);
                break;
        }
        this.canvas.renderAll();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Draw a complete unit circle with angles, coordinates, and labels
     * @param {string} highlightAngle - Optional angle to highlight (e.g., "π/4", "45°")
     */
    async drawUnitCircle(highlightAngle = null) {
        this.show();
        this.setBoardMode('teacher');

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(this.canvas.width, this.canvas.height) * 0.35;

        // Clear canvas first
        this.canvas.clear();
        this.canvas.backgroundColor = '#ffffff';

        // Draw axes
        const axisColor = '#888';
        const axisWidth = 2;

        // X-axis
        this.canvas.add(new fabric.Line([centerX - radius * 1.3, centerY, centerX + radius * 1.3, centerY], {
            stroke: axisColor,
            strokeWidth: axisWidth,
            selectable: false
        }));

        // Y-axis
        this.canvas.add(new fabric.Line([centerX, centerY - radius * 1.3, centerX, centerY + radius * 1.3], {
            stroke: axisColor,
            strokeWidth: axisWidth,
            selectable: false
        }));

        // Draw the unit circle
        if (this.handwriting) {
            const circlePath = this.handwriting.drawHandDrawnCircle(centerX, centerY, radius, {
                color: '#12B3B3',
                strokeWidth: 3,
                wobbleIntensity: 0.05
            });
            if (circlePath && this.handwriting.animatePathDrawing) {
                await this.handwriting.animatePathDrawing(circlePath, 1200);
            }
        } else {
            this.canvas.add(new fabric.Circle({
                left: centerX - radius,
                top: centerY - radius,
                radius: radius,
                fill: 'transparent',
                stroke: '#12B3B3',
                strokeWidth: 3,
                selectable: false
            }));
        }

        await this.sleep(300);

        // Key angles on the unit circle (in radians)
        const angles = [
            { rad: 0, deg: '0°', label: '0', x: 1, y: 0 },
            { rad: Math.PI/6, deg: '30°', label: 'π/6', x: Math.sqrt(3)/2, y: 0.5 },
            { rad: Math.PI/4, deg: '45°', label: 'π/4', x: Math.sqrt(2)/2, y: Math.sqrt(2)/2 },
            { rad: Math.PI/3, deg: '60°', label: 'π/3', x: 0.5, y: Math.sqrt(3)/2 },
            { rad: Math.PI/2, deg: '90°', label: 'π/2', x: 0, y: 1 },
            { rad: 2*Math.PI/3, deg: '120°', label: '2π/3', x: -0.5, y: Math.sqrt(3)/2 },
            { rad: 3*Math.PI/4, deg: '135°', label: '3π/4', x: -Math.sqrt(2)/2, y: Math.sqrt(2)/2 },
            { rad: 5*Math.PI/6, deg: '150°', label: '5π/6', x: -Math.sqrt(3)/2, y: 0.5 },
            { rad: Math.PI, deg: '180°', label: 'π', x: -1, y: 0 },
            { rad: 7*Math.PI/6, deg: '210°', label: '7π/6', x: -Math.sqrt(3)/2, y: -0.5 },
            { rad: 5*Math.PI/4, deg: '225°', label: '5π/4', x: -Math.sqrt(2)/2, y: -Math.sqrt(2)/2 },
            { rad: 4*Math.PI/3, deg: '240°', label: '4π/3', x: -0.5, y: -Math.sqrt(3)/2 },
            { rad: 3*Math.PI/2, deg: '270°', label: '3π/2', x: 0, y: -1 },
            { rad: 5*Math.PI/3, deg: '300°', label: '5π/3', x: 0.5, y: -Math.sqrt(3)/2 },
            { rad: 7*Math.PI/4, deg: '315°', label: '7π/4', x: Math.sqrt(2)/2, y: -Math.sqrt(2)/2 },
            { rad: 11*Math.PI/6, deg: '330°', label: '11π/6', x: Math.sqrt(3)/2, y: -0.5 }
        ];

        // Draw points and labels for each angle
        for (const angle of angles) {
            const px = centerX + radius * angle.x;
            const py = centerY - radius * angle.y; // Negative because canvas Y is inverted

            // Draw point
            this.canvas.add(new fabric.Circle({
                left: px - 4,
                top: py - 4,
                radius: 4,
                fill: '#12B3B3',
                stroke: '#0a8888',
                strokeWidth: 1,
                selectable: false
            }));

            // Label positioning (outside the circle)
            const labelOffset = 40;
            const labelX = centerX + (radius + labelOffset) * angle.x;
            const labelY = centerY - (radius + labelOffset) * angle.y;

            // Add radian label
            if (this.handwriting) {
                await this.handwriting.writeText(angle.label, labelX - 15, labelY - 10, {
                    fontSize: 14,
                    color: '#2d3748',
                    fontFamily: 'Indie Flower, cursive',
                    selectable: false,
                    pauseAfter: false
                });
            } else {
                this.canvas.add(new fabric.Text(angle.label, {
                    left: labelX - 15,
                    top: labelY - 10,
                    fontSize: 14,
                    fill: '#2d3748',
                    fontFamily: 'Indie Flower, cursive',
                    selectable: false
                }));
            }

            await this.sleep(100);
        }

        // Add coordinate labels for key points
        await this.sleep(200);
        const coordLabels = [
            { x: centerX + radius, y: centerY + 20, text: '(1, 0)' },
            { x: centerX, y: centerY - radius - 20, text: '(0, 1)' },
            { x: centerX - radius - 30, y: centerY + 20, text: '(-1, 0)' },
            { x: centerX, y: centerY + radius + 30, text: '(0, -1)' }
        ];

        for (const coord of coordLabels) {
            if (this.handwriting) {
                await this.handwriting.writeText(coord.text, coord.x - 20, coord.y - 10, {
                    fontSize: 12,
                    color: '#555',
                    fontFamily: 'Indie Flower, cursive',
                    selectable: false,
                    pauseAfter: false
                });
            } else {
                this.canvas.add(new fabric.Text(coord.text, {
                    left: coord.x - 20,
                    top: coord.y - 10,
                    fontSize: 12,
                    fill: '#555',
                    fontFamily: 'Indie Flower, cursive',
                    selectable: false
                }));
            }
            await this.sleep(50);
        }

        // Switch to collaborative mode
        this.setBoardMode('collaborative');
        console.log('✅ Unit circle drawn successfully');
    }

    // ============================================
    // LAYOUT PERSISTENCE (LocalStorage)
    // ============================================

    saveLayout() {
        if (!this.panel || this.isMaximized) return;

        const layout = {
            width: this.panel.offsetWidth,
            height: this.panel.offsetHeight,
            left: this.panel.offsetLeft,
            top: this.panel.offsetTop
        };

        try {
            if (window.StorageUtils) {
                StorageUtils.local.setItem('whiteboardLayout', JSON.stringify(layout));
            }
        } catch (e) {
            console.warn('Failed to save whiteboard layout:', e);
        }
    }

    loadSavedLayout() {
        if (!this.panel) return;

        try {
            const saved = window.StorageUtils
                ? StorageUtils.local.getItem('whiteboardLayout')
                : null;
            if (!saved) return;

            const layout = JSON.parse(saved);

            // Apply saved layout (with bounds checking)
            if (layout.width && layout.height) {
                const maxWidth = window.innerWidth - 40;
                const maxHeight = window.innerHeight - 100;

                this.panel.style.width = Math.min(layout.width, maxWidth) + 'px';
                this.panel.style.height = Math.min(layout.height, maxHeight) + 'px';
            }

            if (layout.left !== undefined && layout.top !== undefined) {
                const maxLeft = window.innerWidth - this.panel.offsetWidth;
                const maxTop = window.innerHeight - this.panel.offsetHeight;

                this.panel.style.left = Math.max(0, Math.min(layout.left, maxLeft)) + 'px';
                this.panel.style.top = Math.max(0, Math.min(layout.top, maxTop)) + 'px';
                this.panel.style.right = 'auto'; // Override default right positioning
            }

            console.log('✅ Restored whiteboard layout from localStorage');
        } catch (e) {
            console.warn('Failed to load whiteboard layout:', e);
        }
    }

    resetLayout() {
        if (!this.panel) return;

        // Clear saved layout
        if (window.StorageUtils) {
            StorageUtils.local.removeItem('whiteboardLayout');
        }

        // Reset to default position and size
        this.panel.style.width = '650px';
        this.panel.style.height = '700px';
        this.panel.style.right = '20px';
        this.panel.style.top = '80px';
        this.panel.style.left = 'auto';

        this.resizeCanvas();
        console.log('✅ Reset whiteboard layout to defaults');
    }

    // ============================================
    // UX ENHANCEMENTS - EXPORT & SHARE
    // ============================================

    exportToPNG() {
        const dataURL = this.canvas.toDataURL({
            format: 'png',
            quality: 1.0,
            multiplier: 2 // 2x resolution for better quality
        });

        const link = document.createElement('a');
        link.download = `mathmatix-whiteboard-${Date.now()}.png`;
        link.href = dataURL;
        link.click();

        console.log('✅ Exported whiteboard as PNG');
    }

    exportToPDF() {
        // Use jsPDF if available
        if (typeof jsPDF !== 'undefined') {
            const dataURL = this.canvas.toDataURL({
                format: 'png',
                quality: 1.0
            });

            const pdf = new jsPDF({
                orientation: this.canvas.width > this.canvas.height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [this.canvas.width, this.canvas.height]
            });

            pdf.addImage(dataURL, 'PNG', 0, 0, this.canvas.width, this.canvas.height);
            pdf.save(`mathmatix-whiteboard-${Date.now()}.pdf`);

            console.log('✅ Exported whiteboard as PDF');
        } else {
            // Fallback to PNG if jsPDF not available
            console.warn('jsPDF not available, exporting as PNG instead');
            this.exportToPNG();
        }
    }

    copyToClipboard() {
        this.canvas.toBlob((blob) => {
            if (navigator.clipboard && navigator.clipboard.write) {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(() => {
                    console.log('✅ Copied whiteboard to clipboard');
                    this.showToast('Copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy to clipboard:', err);
                });
            } else {
                console.warn('Clipboard API not available');
                this.showToast('Clipboard not supported, use download instead');
            }
        });
    }

    // ============================================
    // KEYBOARD SHORTCUTS SYSTEM
    // ============================================

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in text
            // Check for INPUT, TEXTAREA, contenteditable elements, and the chat input
            if (e.target.tagName === 'INPUT' ||
                e.target.tagName === 'TEXTAREA' ||
                e.target.isContentEditable ||
                e.target.contentEditable === 'true' ||
                e.target.id === 'user-input') {
                return;
            }

            const ctrl = e.ctrlKey || e.metaKey;

            // Undo/Redo
            if (ctrl && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
            }
            // Delete
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject) {
                    e.preventDefault();
                    this.deleteSelected();
                }
            }
            // Select All
            else if (ctrl && e.key === 'a') {
                e.preventDefault();
                this.selectAll();
            }
            // Copy
            else if (ctrl && e.key === 'c') {
                e.preventDefault();
                this.copySelection();
            }
            // Paste
            else if (ctrl && e.key === 'v') {
                e.preventDefault();
                this.pasteSelection();
            }
            // Duplicate
            else if (ctrl && e.key === 'd') {
                e.preventDefault();
                this.duplicateSelection();
            }
            // Export
            else if (ctrl && e.key === 's') {
                e.preventDefault();
                this.exportToPNG();
            }
            // Show shortcuts help
            else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                e.preventDefault();
                this.toggleShortcutsPanel();
            }
            // Quick tool switching (1-9 keys)
            else if (!ctrl && !e.shiftKey && e.key >= '1' && e.key <= '9') {
                this.quickToolSwitch(parseInt(e.key));
            }
            // Escape - deselect
            else if (e.key === 'Escape') {
                this.canvas.discardActiveObject();
                this.canvas.renderAll();
            }
        });

        console.log('✅ Keyboard shortcuts enabled');
    }

    quickToolSwitch(number) {
        const tools = ['select', 'pen', 'highlighter', 'eraser', 'line', 'rectangle', 'circle', 'text'];
        if (number > 0 && number <= tools.length) {
            this.setTool(tools[number - 1]);
            document.getElementById(`tool-${tools[number - 1]}`)?.click();
        }
    }

    selectAll() {
        const selection = new fabric.ActiveSelection(this.canvas.getObjects(), {
            canvas: this.canvas,
        });
        this.canvas.setActiveObject(selection);
        this.canvas.requestRenderAll();
    }

    copySelection() {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            activeObject.clone((cloned) => {
                this._clipboard = cloned;
            });
            console.log('✅ Selection copied');
        }
    }

    pasteSelection() {
        if (this._clipboard) {
            this._clipboard.clone((clonedObj) => {
                this.canvas.discardActiveObject();
                clonedObj.set({
                    left: clonedObj.left + 10,
                    top: clonedObj.top + 10,
                    evented: true,
                });
                if (clonedObj.type === 'activeSelection') {
                    clonedObj.canvas = this.canvas;
                    clonedObj.forEachObject((obj) => {
                        this.canvas.add(obj);
                    });
                    clonedObj.setCoords();
                } else {
                    this.canvas.add(clonedObj);
                }
                this._clipboard.top += 10;
                this._clipboard.left += 10;
                this.canvas.setActiveObject(clonedObj);
                this.canvas.requestRenderAll();
            });
            console.log('✅ Selection pasted');
        }
    }

    duplicateSelection() {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            activeObject.clone((cloned) => {
                this.canvas.discardActiveObject();
                cloned.set({
                    left: cloned.left + 20,
                    top: cloned.top + 20,
                    evented: true,
                });
                if (cloned.type === 'activeSelection') {
                    cloned.canvas = this.canvas;
                    cloned.forEachObject((obj) => {
                        this.canvas.add(obj);
                    });
                    cloned.setCoords();
                } else {
                    this.canvas.add(cloned);
                }
                this.canvas.setActiveObject(cloned);
                this.canvas.requestRenderAll();
                this.saveState();
            });
            console.log('✅ Selection duplicated');
        }
    }

    toggleShortcutsPanel() {
        let panel = document.getElementById('shortcuts-help-panel');

        if (!panel) {
            panel = this.createShortcutsPanel();
            document.body.appendChild(panel);
        }

        if (panel.style.display === 'none' || !panel.style.display) {
            panel.style.display = 'flex';
        } else {
            panel.style.display = 'none';
        }
    }

    createShortcutsPanel() {
        const panel = document.createElement('div');
        panel.id = 'shortcuts-help-panel';
        panel.className = 'shortcuts-help-panel';
        panel.innerHTML = `
            <div class="shortcuts-content">
                <div class="shortcuts-header">
                    <h3>⌨️ Keyboard Shortcuts</h3>
                    <button class="close-shortcuts-btn">×</button>
                </div>
                <div class="shortcuts-grid">
                    <div class="shortcut-section">
                        <h4>General</h4>
                        <div class="shortcut-item"><kbd>?</kbd><span>Show this help</span></div>
                        <div class="shortcut-item"><kbd>Esc</kbd><span>Deselect</span></div>
                    </div>
                    <div class="shortcut-section">
                        <h4>Edit</h4>
                        <div class="shortcut-item"><kbd>Ctrl+Z</kbd><span>Undo</span></div>
                        <div class="shortcut-item"><kbd>Ctrl+Y</kbd><span>Redo</span></div>
                        <div class="shortcut-item"><kbd>Delete</kbd><span>Delete selected</span></div>
                        <div class="shortcut-item"><kbd>Ctrl+A</kbd><span>Select all</span></div>
                        <div class="shortcut-item"><kbd>Ctrl+C</kbd><span>Copy</span></div>
                        <div class="shortcut-item"><kbd>Ctrl+V</kbd><span>Paste</span></div>
                        <div class="shortcut-item"><kbd>Ctrl+D</kbd><span>Duplicate</span></div>
                    </div>
                    <div class="shortcut-section">
                        <h4>Tools</h4>
                        <div class="shortcut-item"><kbd>1</kbd><span>Select tool</span></div>
                        <div class="shortcut-item"><kbd>2</kbd><span>Pen</span></div>
                        <div class="shortcut-item"><kbd>3</kbd><span>Highlighter</span></div>
                        <div class="shortcut-item"><kbd>4</kbd><span>Eraser</span></div>
                        <div class="shortcut-item"><kbd>5</kbd><span>Line</span></div>
                        <div class="shortcut-item"><kbd>6</kbd><span>Rectangle</span></div>
                        <div class="shortcut-item"><kbd>7</kbd><span>Circle</span></div>
                        <div class="shortcut-item"><kbd>8</kbd><span>Text</span></div>
                    </div>
                    <div class="shortcut-section">
                        <h4>File</h4>
                        <div class="shortcut-item"><kbd>Ctrl+S</kbd><span>Export PNG</span></div>
                    </div>
                </div>
            </div>
        `;

        // Add close button event listener (CSP-compliant)
        const closeBtn = panel.querySelector('.close-shortcuts-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.style.display = 'none';
            });
        }

        return panel;
    }

    // ============================================
    // QUICK COLOR PRESETS
    // ============================================

    setupColorPresets() {
        const presetColors = [
            '#000000', // Black
            '#FF3B7F', // Hot Pink (brand)
            '#12B3B3', // Teal (brand)
            '#FF6B6B', // Red
            '#4ECDC4', // Turquoise
            '#45B7D1', // Blue
            '#FFA07A', // Orange
            '#98D8C8', // Mint
            '#FFD93D', // Yellow
            '#6C5CE7', // Purple
        ];

        return presetColors;
    }

    // ============================================
    // REGION OVERLAY TOGGLE
    // ============================================

    toggleRegionOverlay() {
        let overlay = document.getElementById('region-overlay');

        if (!overlay) {
            overlay = this.createRegionOverlay();
            this.panel.querySelector('.whiteboard-canvas-container').appendChild(overlay);
        }

        overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        console.log('✅ Region overlay toggled');
    }

    createRegionOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'region-overlay';
        overlay.className = 'region-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 100;
        `;

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        // Create region boxes
        Object.entries(this.regions).forEach(([key, region]) => {
            const box = document.createElement('div');
            box.className = 'region-box';
            box.style.cssText = `
                position: absolute;
                left: ${region.x * 100}%;
                top: ${region.y * 100}%;
                width: ${region.width * 100}%;
                height: ${region.height * 100}%;
                border: 2px dashed rgba(18, 179, 179, 0.5);
                background: rgba(18, 179, 179, 0.05);
                pointer-events: none;
            `;

            const label = document.createElement('div');
            label.className = 'region-label';
            label.textContent = region.label;
            label.style.cssText = `
                position: absolute;
                top: 5px;
                left: 5px;
                background: rgba(18, 179, 179, 0.9);
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
            `;

            box.appendChild(label);
            overlay.appendChild(box);
        });

        return overlay;
    }

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================

    showToast(message, duration = 3500) {
        let toast = document.getElementById('whiteboard-toast');

        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'whiteboard-toast';
            toast.className = 'whiteboard-toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    // ============================================
    // RADIAL CONTEXT MENU
    // ============================================

    setupContextMenu() {
        this.canvas.on('mouse:down', (e) => {
            // Right click
            if (e.e.button === 2) {
                e.e.preventDefault();
                this.showContextMenu(e.e.clientX, e.e.clientY, e.target);
            }
        });

        // Prevent default context menu
        document.getElementById(this.canvasId).addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    showContextMenu(x, y, target) {
        let menu = document.getElementById('radial-context-menu');

        if (!menu) {
            menu = this.createRadialContextMenu();
            document.body.appendChild(menu);
        }

        // Update menu items based on context
        const hasSelection = !!this.canvas.getActiveObject();

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.display = 'block';

        // Close menu on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 100);
    }

    createRadialContextMenu() {
        const menu = document.createElement('div');
        menu.id = 'radial-context-menu';
        menu.className = 'radial-context-menu';

        const items = [
            { icon: '✂️', label: 'Cut', action: () => this.cutSelection() },
            { icon: '📋', label: 'Copy', action: () => this.copySelection() },
            { icon: '📄', label: 'Paste', action: () => this.pasteSelection() },
            { icon: '🗑️', label: 'Delete', action: () => this.deleteSelected() },
            { icon: '👥', label: 'Duplicate', action: () => this.duplicateSelection() },
            { icon: '🎨', label: 'Colors', action: () => document.getElementById('color-picker').click() },
            { icon: '↩️', label: 'Undo', action: () => this.undo() },
            { icon: '↪️', label: 'Redo', action: () => this.redo() },
        ];

        items.forEach((item, i) => {
            const btn = document.createElement('button');
            btn.className = 'context-menu-item';
            btn.innerHTML = `<span class="context-icon">${item.icon}</span><span class="context-label">${item.label}</span>`;
            btn.onclick = () => {
                item.action();
                menu.style.display = 'none';
            };
            menu.appendChild(btn);
        });

        return menu;
    }

    cutSelection() {
        this.copySelection();
        this.deleteSelected();
    }

    // ============================================
    // FLOATING SELECTION TOOLBAR
    // ============================================

    setupFloatingToolbar() {
        this.canvas.on('selection:created', () => this.showFloatingToolbar());
        this.canvas.on('selection:updated', () => this.showFloatingToolbar());
        this.canvas.on('selection:cleared', () => this.hideFloatingToolbar());
    }

    showFloatingToolbar() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject) return;

        let toolbar = document.getElementById('floating-selection-toolbar');

        if (!toolbar) {
            toolbar = this.createFloatingToolbar();
            this.panel.appendChild(toolbar);
        }

        // Position toolbar above selection
        const bound = activeObject.getBoundingRect();
        const canvasContainer = this.panel.querySelector('.whiteboard-canvas-container');
        const containerRect = canvasContainer.getBoundingClientRect();

        toolbar.style.left = (bound.left + bound.width / 2 - 150) + 'px';
        toolbar.style.top = (bound.top - 50) + 'px';
        toolbar.style.display = 'flex';
    }

    hideFloatingToolbar() {
        const toolbar = document.getElementById('floating-selection-toolbar');
        if (toolbar) {
            toolbar.style.display = 'none';
        }
    }

    createFloatingToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = 'floating-selection-toolbar';
        toolbar.className = 'floating-selection-toolbar';

        const actions = [
            { icon: 'fa-copy', tooltip: 'Duplicate', action: () => this.duplicateSelection() },
            { icon: 'fa-trash', tooltip: 'Delete', action: () => this.deleteSelected() },
            { icon: 'fa-palette', tooltip: 'Color', action: () => this.changeSelectionColor() },
            { icon: 'fa-arrows-alt', tooltip: 'Bring to front', action: () => this.bringToFront() },
            { icon: 'fa-layer-group', tooltip: 'Send to back', action: () => this.sendToBack() },
        ];

        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = 'floating-toolbar-btn';
            btn.innerHTML = `<i class="fas ${action.icon}"></i>`;
            btn.title = action.tooltip;
            btn.onclick = (e) => {
                e.stopPropagation();
                action.action();
            };
            toolbar.appendChild(btn);
        });

        return toolbar;
    }

    changeSelectionColor() {
        const colorPicker = document.getElementById('color-picker');
        if (colorPicker) {
            colorPicker.click();
            colorPicker.addEventListener('change', () => {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject) {
                    if (activeObject.type === 'activeSelection') {
                        activeObject.forEachObject((obj) => {
                            obj.set('stroke', colorPicker.value);
                            if (obj.fill && obj.fill !== 'transparent') {
                                obj.set('fill', colorPicker.value);
                            }
                        });
                    } else {
                        activeObject.set('stroke', colorPicker.value);
                        if (activeObject.fill && activeObject.fill !== 'transparent') {
                            activeObject.set('fill', colorPicker.value);
                        }
                    }
                    this.canvas.renderAll();
                    this.saveState();
                }
            }, { once: true });
        }
    }

    bringToFront() {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            this.canvas.bringToFront(activeObject);
            this.canvas.renderAll();
            this.saveState();
        }
    }

    sendToBack() {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            this.canvas.sendToBack(activeObject);
            this.canvas.renderAll();
            this.saveState();
        }
    }

    // ============================================
    // ENHANCED TOUCH GESTURES
    // ============================================

    setupTouchGestures() {
        let lastTouchDistance = 0;
        let isPinching = false;

        this.canvas.on('touch:gesture', (e) => {
            if (e.e.touches && e.e.touches.length === 2) {
                isPinching = true;
                const touch1 = e.e.touches[0];
                const touch2 = e.e.touches[1];
                const distance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                    Math.pow(touch2.clientY - touch1.clientY, 2)
                );

                if (lastTouchDistance > 0) {
                    const delta = distance - lastTouchDistance;
                    const zoom = this.canvas.getZoom();
                    let newZoom = zoom * (1 + delta / 200);
                    newZoom = Math.max(0.5, Math.min(3, newZoom));
                    this.canvas.zoomToPoint({ x: e.self.x, y: e.self.y }, newZoom);
                }

                lastTouchDistance = distance;
                e.e.preventDefault();
            }
        });

        this.canvas.on('touch:drag', (e) => {
            if (!isPinching && e.e.touches && e.e.touches.length === 2) {
                // Pan with two fingers
                const touch = e.e.touches[0];
                const delta = new fabric.Point(
                    touch.clientX - this.lastPanPoint.x,
                    touch.clientY - this.lastPanPoint.y
                );
                this.canvas.relativePan(delta);
                this.lastPanPoint = { x: touch.clientX, y: touch.clientY };
            }
        });

        this.canvas.on('mouse:up', () => {
            isPinching = false;
            lastTouchDistance = 0;
        });

        this.lastPanPoint = { x: 0, y: 0 };
        console.log('✅ Touch gestures enabled');
    }
}

// Export for use in other scripts
window.MathmatixWhiteboard = MathmatixWhiteboard;

;
/* --- /js/whiteboard-handwriting.js --- */
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

;
/* --- /js/whiteboard-phase2.js --- */
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

;
/* --- /js/whiteboard-math-procedures.js --- */
// ============================================
// MATH PROCEDURES MODULE
// High-level commands for common math operations
// Long division, multiplication, fractions, equations, etc.
// ============================================

class MathProcedures {
    constructor(whiteboard, enhancer) {
        this.whiteboard = whiteboard;
        this.enhancer = enhancer;

        // Color scheme
        this.colors = {
            given: '#3b82f6',      // Blue - given numbers
            working: '#f59e0b',    // Amber - intermediate calculations
            result: '#10b981',     // Green - final answer
            carry: '#ef4444',      // Red - carries/borrows
            neutral: '#2d3748',    // Dark gray - labels
            emphasis: '#8b5cf6'    // Purple - emphasis
        };

        console.log('🔢 Math Procedures Module initialized');
    }

    // ============================================
    // LONG DIVISION
    // ============================================

    /**
     * Animated long division: 342 ÷ 6 = ?
     * @param {number} dividend - Number being divided (342)
     * @param {number} divisor - Number dividing by (6)
     * @param {string} mode - 'full' (complete solution) or 'partial' (first 1-2 steps only)
     */
    async showLongDivision(dividend, divisor, mode = 'full') {
        const region = this.enhancer.getAvailableRegion('topCenter');
        if (!region) {
            console.warn('[MathProc] No available region');
            return;
        }

        const startX = region.x + 50;
        const startY = region.y + 30;

        console.log(`🔢 Long Division: ${dividend} ÷ ${divisor} (${mode} mode)`);

        // Draw division bracket
        await this.drawDivisionBracket(startX, startY, dividend.toString(), divisor);
        await this.delay(500);

        // Perform division step by step
        const dividendStr = dividend.toString();
        const quotientDigits = [];
        let remainder = 0;
        let currentPosition = 0;
        let yOffset = startY + 40;

        // ANTI-CHEAT: Limit steps in partial mode (max 2 steps)
        const maxSteps = mode === 'partial' ? 2 : dividendStr.length;
        let stepsShown = 0;

        for (let i = 0; i < dividendStr.length && stepsShown < maxSteps; i++) {
            // Build current number
            const currentNum = remainder * 10 + parseInt(dividendStr[i]);

            if (currentNum >= divisor) {
                // Calculate quotient digit
                const quotientDigit = Math.floor(currentNum / divisor);
                quotientDigits.push(quotientDigit);

                // Write quotient digit above
                await this.addText(
                    startX + 60 + (quotientDigits.length - 1) * 20,
                    startY - 15,
                    quotientDigit.toString(),
                    this.colors.result,
                    22
                );
                await this.delay(400);

                // Show multiplication
                const product = quotientDigit * divisor;
                await this.addText(
                    startX + 10,
                    yOffset,
                    `${product}`,
                    this.colors.working,
                    18
                );
                await this.delay(300);

                // Draw subtraction line
                await this.drawLine(
                    startX + 5,
                    yOffset + 20,
                    startX + 40,
                    yOffset + 20,
                    this.colors.neutral
                );
                await this.delay(200);

                // Calculate and show remainder
                remainder = currentNum - product;
                await this.addText(
                    startX + 15,
                    yOffset + 25,
                    remainder.toString(),
                    this.colors.carry,
                    18
                );
                await this.delay(400);

                yOffset += 40;
                stepsShown++; // Count this as a completed step
            } else {
                remainder = currentNum;
                if (quotientDigits.length > 0) {
                    quotientDigits.push(0);
                    await this.addText(
                        startX + 60 + (quotientDigits.length - 1) * 20,
                        startY - 15,
                        '0',
                        this.colors.result,
                        22
                    );
                    stepsShown++; // Count zero placement as a step
                }
            }

            // Bring down next digit (if not last and not at max steps)
            if (i < dividendStr.length - 1 && stepsShown < maxSteps) {
                await this.drawArrow(
                    startX + 60 + (i + 1) * 15,
                    startY + 15,
                    startX + 20,
                    yOffset - 5,
                    this.colors.emphasis
                );
                await this.delay(300);
            }
        }

        // ANTI-CHEAT: Only show final answer in 'full' mode
        if (mode === 'full') {
            // Final answer emphasis
            if (remainder === 0) {
                await this.addText(
                    startX,
                    yOffset + 20,
                    `Answer: ${quotientDigits.join('')}`,
                    this.colors.result,
                    20
                );
            } else {
                await this.addText(
                    startX,
                    yOffset + 20,
                    `Answer: ${quotientDigits.join('')} R${remainder}`,
                    this.colors.result,
                    20
                );
            }
        } else {
            // Partial mode: Show "Your turn!" message instead of answer
            await this.addText(
                startX,
                yOffset + 20,
                '↑ Now you finish it!',
                this.colors.emphasis,
                20
            );
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Long division complete');
    }

    /**
     * Draw division bracket and initial numbers
     */
    async drawDivisionBracket(x, y, dividend, divisor) {
        // Divisor (outside)
        await this.addText(x, y, divisor.toString(), this.colors.given, 22);
        await this.delay(200);

        // Division symbol (bracket)
        await this.drawLine(x + 40, y, x + 40, y + 30, this.colors.neutral, 2);
        await this.drawLine(x + 40, y, x + 100, y, this.colors.neutral, 2);
        await this.delay(200);

        // Dividend (inside)
        await this.addText(x + 60, y + 5, dividend, this.colors.given, 22);
        await this.delay(300);
    }

    // ============================================
    // VERTICAL MULTIPLICATION
    // ============================================

    /**
     * Animated vertical multiplication: 23 × 47
     * @param {number} num1 - First number
     * @param {number} num2 - Second number
     */
    async showVerticalMultiplication(num1, num2) {
        const region = this.enhancer.getAvailableRegion('middleCenter');
        if (!region) return;

        const startX = region.x + 70;
        const startY = region.y + 30;

        console.log(`🔢 Vertical Multiplication: ${num1} × ${num2}`);

        // Write first number (right-aligned)
        await this.addText(startX, startY, num1.toString(), this.colors.given, 24);
        await this.delay(300);

        // Write multiplication symbol and second number
        await this.addText(startX - 20, startY + 30, '×', this.colors.neutral, 24);
        await this.addText(startX, startY + 30, num2.toString(), this.colors.given, 24);
        await this.delay(300);

        // Draw line
        await this.drawLine(startX - 25, startY + 55, startX + 80, startY + 55, this.colors.neutral, 2);
        await this.delay(400);

        // Calculate and show partial products
        const num2Str = num2.toString();
        const partialProducts = [];
        let yOffset = startY + 65;

        for (let i = num2Str.length - 1; i >= 0; i--) {
            const digit = parseInt(num2Str[i]);
            const place = num2Str.length - 1 - i;

            // Calculate partial product
            let partialProduct = num1 * digit;
            let carry = 0;

            // Show carries if any
            const product = num1 * digit;
            if (product >= 10) {
                const carryDigits = Math.floor(product / 10).toString();
                await this.addText(
                    startX + 10,
                    startY + 30 - 15,
                    carryDigits,
                    this.colors.carry,
                    14
                );
                await this.delay(200);
            }

            // Show partial product (with proper place value - add zeros)
            const partialWithZeros = partialProduct * Math.pow(10, place);
            partialProducts.push(partialWithZeros);

            await this.addText(
                startX - (place * 15),
                yOffset,
                partialWithZeros.toString(),
                this.colors.working,
                22
            );
            await this.delay(500);

            yOffset += 35;
        }

        // Draw final line
        await this.drawLine(startX - 25, yOffset - 5, startX + 80, yOffset - 5, this.colors.neutral, 2);
        await this.delay(300);

        // Calculate and show final sum
        const finalAnswer = partialProducts.reduce((a, b) => a + b, 0);
        await this.addText(startX, yOffset + 5, finalAnswer.toString(), this.colors.result, 26);
        await this.delay(300);

        // Box the answer
        if (this.whiteboard.handwriting) {
            await this.whiteboard.handwriting.drawHandDrawnCircle(
                startX + 40,
                yOffset + 15,
                35,
                { color: this.colors.result, strokeWidth: 3 }
            );
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Vertical multiplication complete');
    }

    // ============================================
    // FRACTION ADDITION
    // ============================================

    /**
     * Animated fraction addition: 3/4 + 1/6
     * @param {number} n1 - First numerator
     * @param {number} d1 - First denominator
     * @param {number} n2 - Second numerator
     * @param {number} d2 - Second denominator
     */
    async showFractionAddition(n1, d1, n2, d2) {
        const region = this.enhancer.getAvailableRegion('middleCenter');
        if (!region) return;

        const startX = region.x + 50;
        const startY = region.y + 50;

        console.log(`🔢 Fraction Addition: ${n1}/${d1} + ${n2}/${d2}`);

        // Original fractions
        await this.drawFraction(startX, startY, n1, d1, this.colors.given);
        await this.delay(300);

        await this.addText(startX + 40, startY + 10, '+', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 60, startY, n2, d2, this.colors.given);
        await this.delay(500);

        // Find LCD
        const lcd = this.findLCM(d1, d2);
        await this.addText(
            startX,
            startY + 50,
            `Common denominator: ${lcd}`,
            this.colors.working,
            16
        );
        await this.delay(500);

        // Convert fractions
        const newN1 = n1 * (lcd / d1);
        const newN2 = n2 * (lcd / d2);

        await this.addText(startX, startY + 75, '=', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 30, startY + 65, newN1, lcd, this.colors.working);
        await this.delay(300);

        await this.addText(startX + 70, startY + 75, '+', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 90, startY + 65, newN2, lcd, this.colors.working);
        await this.delay(500);

        // Add numerators
        const finalN = newN1 + newN2;

        await this.addText(startX, startY + 125, '=', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 30, startY + 115, finalN, lcd, this.colors.result, 26);
        await this.delay(300);

        // Simplify if possible
        const gcd = this.findGCD(finalN, lcd);
        if (gcd > 1) {
            const simplifiedN = finalN / gcd;
            const simplifiedD = lcd / gcd;

            await this.addText(
                startX + 100,
                startY + 125,
                `= ${simplifiedN}/${simplifiedD}`,
                this.colors.result,
                20
            );
            await this.delay(300);

            // Circle simplified answer
            if (this.whiteboard.handwriting) {
                await this.whiteboard.handwriting.drawHandDrawnCircle(
                    startX + 130,
                    startY + 125,
                    30,
                    { color: this.colors.result, strokeWidth: 3 }
                );
            }
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Fraction addition complete');
    }

    /**
     * Draw a fraction (numerator over denominator)
     */
    async drawFraction(x, y, numerator, denominator, color = '#2d3748', fontSize = 20) {
        // Numerator
        await this.addText(x, y, numerator.toString(), color, fontSize);

        // Fraction bar
        await this.drawLine(x - 5, y + 20, x + 30, y + 20, color, 2);

        // Denominator
        await this.addText(x, y + 25, denominator.toString(), color, fontSize);
    }

    // ============================================
    // EQUATION SOLVING
    // ============================================

    /**
     * Animated equation solving: 2x + 3 = 11
     * @param {string} equation - Equation string (e.g., "2x+3=11")
     */
    async solveEquation(equation) {
        const region = this.enhancer.getAvailableRegion('topCenter');
        if (!region) return;

        console.log(`🔢 Solving Equation: ${equation}`);

        // Parse equation (simple linear: ax + b = c or ax - b = c)
        const match = equation.match(/(\d*)x\s*([+-])\s*(\d+)\s*=\s*(\d+)/);
        if (!match) {
            console.warn('[MathProc] Could not parse equation:', equation);
            return;
        }

        const a = match[1] ? parseInt(match[1]) : 1;
        const sign = match[2];
        const b = parseInt(match[3]);
        const c = parseInt(match[4]);
        const bValue = sign === '+' ? b : -b;

        // Calculate equals sign alignment position
        // We want all equals signs to line up vertically
        const equalsX = region.x + 150; // Fixed X position for all equals signs
        let yPos = region.y + 30;
        const lineHeight = 45;

        // Step 1: Write original equation with step label
        const step1Left = equation.split('=')[0].trim();
        const step1Right = equation.split('=')[1].trim();

        await this.addText(region.x + 20, yPos, 'Original equation:', this.colors.working, 14);
        yPos += 25;

        // Write left side, equals sign, right side (aligned)
        await this.addText(equalsX - this.measureText(step1Left) - 10, yPos, step1Left, this.colors.given, 22);
        await this.addText(equalsX, yPos, '=', this.colors.given, 22);
        await this.addText(equalsX + 20, yPos, step1Right, this.colors.given, 22);
        await this.delay(800);
        yPos += lineHeight;

        // Step 2: Show operation (subtract/add b from both sides)
        const operation = bValue > 0 ? '-' : '+';
        const absB = Math.abs(bValue);
        const stepDescription = bValue > 0 ? `Subtract ${absB} from both sides` : `Add ${absB} to both sides`;

        await this.addText(region.x + 20, yPos, stepDescription, this.colors.working, 14);
        yPos += 25;

        const step2Left = `${a === 1 ? '' : a}x ${sign} ${b} ${operation} ${absB}`;
        const step2Right = `${c} ${operation} ${absB}`;

        await this.addText(equalsX - this.measureText(step2Left) - 10, yPos, step2Left, this.colors.working, 22);
        await this.addText(equalsX, yPos, '=', this.colors.working, 22);
        await this.addText(equalsX + 20, yPos, step2Right, this.colors.working, 22);
        await this.delay(800);
        yPos += lineHeight;

        // Step 3: Simplify
        await this.addText(region.x + 20, yPos, 'Simplify:', this.colors.working, 14);
        yPos += 25;

        const cMinusB = c - bValue;
        const step3Left = `${a === 1 ? '' : a}x`;
        const step3Right = `${cMinusB}`;

        await this.addText(equalsX - this.measureText(step3Left) - 10, yPos, step3Left, this.colors.working, 22);
        await this.addText(equalsX, yPos, '=', this.colors.working, 22);
        await this.addText(equalsX + 20, yPos, step3Right, this.colors.working, 22);
        await this.delay(800);
        yPos += lineHeight;

        // Step 4: Divide by coefficient (if a !== 1)
        if (a !== 1) {
            await this.addText(region.x + 20, yPos, `Divide both sides by ${a}:`, this.colors.working, 14);
            yPos += 25;

            const step4Left = `${a}x/${a}`;
            const step4Right = `${cMinusB}/${a}`;

            await this.addText(equalsX - this.measureText(step4Left) - 10, yPos, step4Left, this.colors.working, 22);
            await this.addText(equalsX, yPos, '=', this.colors.working, 22);
            await this.addText(equalsX + 20, yPos, step4Right, this.colors.working, 22);
            await this.delay(800);
            yPos += lineHeight;
        }

        // Step 5: Final answer
        await this.addText(region.x + 20, yPos, 'Solution:', this.colors.result, 14);
        yPos += 25;

        const x = a !== 1 ? cMinusB / a : cMinusB;
        const answerLeft = 'x';
        const answerRight = `${x}`;

        await this.addText(equalsX - this.measureText(answerLeft) - 10, yPos, answerLeft, this.colors.result, 26);
        await this.addText(equalsX, yPos, '=', this.colors.result, 26);
        await this.addText(equalsX + 20, yPos, answerRight, this.colors.result, 26);

        // Box the answer
        if (this.whiteboard.handwriting) {
            await this.delay(300);
            await this.whiteboard.handwriting.drawHandDrawnCircle(
                equalsX + 35,
                yPos + 10,
                30,
                { color: this.colors.result, strokeWidth: 3, wobbleIntensity: 0.08 }
            );
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Equation solving complete with aligned steps');
    }

    // Helper to measure text width (approximation)
    measureText(text) {
        // Rough estimate: 12px per character at font size 22
        return text.length * 10;
    }

    // ============================================
    // FRACTION MULTIPLICATION
    // ============================================

    /**
     * Animated fraction multiplication: 2/3 × 3/4
     * @param {number} n1 - First numerator
     * @param {number} d1 - First denominator
     * @param {number} n2 - Second numerator
     * @param {number} d2 - Second denominator
     */
    async showFractionMultiplication(n1, d1, n2, d2) {
        const region = this.enhancer.getAvailableRegion('middleCenter');
        if (!region) return;

        const startX = region.x + 50;
        const startY = region.y + 50;

        console.log(`🔢 Fraction Multiplication: ${n1}/${d1} × ${n2}/${d2}`);

        // Original fractions
        await this.drawFraction(startX, startY, n1, d1, this.colors.given);
        await this.delay(300);

        await this.addText(startX + 40, startY + 10, '×', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 60, startY, n2, d2, this.colors.given);
        await this.delay(500);

        // Multiply numerators and denominators
        const resultN = n1 * n2;
        const resultD = d1 * d2;

        await this.addText(startX, startY + 75, '=', this.colors.neutral, 24);
        await this.delay(200);

        await this.drawFraction(startX + 30, startY + 65, resultN, resultD, this.colors.working, 22);
        await this.delay(500);

        // Simplify
        const gcd = this.findGCD(resultN, resultD);
        if (gcd > 1) {
            const simplifiedN = resultN / gcd;
            const simplifiedD = resultD / gcd;

            await this.addText(
                startX + 90,
                startY + 75,
                `= ${simplifiedN}/${simplifiedD}`,
                this.colors.result,
                22
            );
            await this.delay(300);

            // Circle answer
            if (this.whiteboard.handwriting) {
                await this.whiteboard.handwriting.drawHandDrawnCircle(
                    startX + 120,
                    startY + 75,
                    30,
                    { color: this.colors.result, strokeWidth: 3 }
                );
            }
        } else {
            // Already simplified
            if (this.whiteboard.handwriting) {
                await this.whiteboard.handwriting.drawHandDrawnCircle(
                    startX + 40,
                    startY + 75,
                    30,
                    { color: this.colors.result, strokeWidth: 3 }
                );
            }
        }

        this.enhancer.markRegionOccupied(region);
        console.log('✅ Fraction multiplication complete');
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Add text to canvas
     */
    async addText(x, y, text, color = '#2d3748', fontSize = 18) {
        const textObj = new fabric.Text(text, {
            left: x,
            top: y,
            fontSize: fontSize,
            fill: color,
            fontFamily: 'Indie Flower, cursive',
            selectable: false
        });

        this.whiteboard.canvas.add(textObj);
        this.whiteboard.canvas.renderAll();
        return textObj;
    }

    /**
     * Draw a line
     */
    async drawLine(x1, y1, x2, y2, color = '#2d3748', strokeWidth = 2) {
        const line = new fabric.Line([x1, y1, x2, y2], {
            stroke: color,
            strokeWidth: strokeWidth,
            selectable: false,
            strokeLineCap: 'round'
        });

        this.whiteboard.canvas.add(line);
        this.whiteboard.canvas.renderAll();
        return line;
    }

    /**
     * Draw arrow
     */
    async drawArrow(x1, y1, x2, y2, color = '#12B3B3') {
        if (this.whiteboard.handwriting) {
            return this.whiteboard.handwriting.drawHandDrawnArrow(x1, y1, x2, y2, {
                color: color,
                strokeWidth: 2,
                wobbleIntensity: 0.02
            });
        }
    }

    /**
     * Find GCD (Greatest Common Divisor)
     */
    findGCD(a, b) {
        return b === 0 ? a : this.findGCD(b, a % b);
    }

    /**
     * Find LCM (Least Common Multiple)
     */
    findLCM(a, b) {
        return (a * b) / this.findGCD(a, b);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const checkDependencies = setInterval(() => {
        if (window.whiteboard && window.whiteboardEnhancer) {
            window.mathProcedures = new MathProcedures(window.whiteboard, window.whiteboardEnhancer);
            clearInterval(checkDependencies);
            console.log('✅ Math Procedures Module initialized');
        }
    }, 100);

    setTimeout(() => clearInterval(checkDependencies), 10000);
});

console.log('🔢 Math Procedures Module loaded');

;
/* --- /js/chat-board-integration.js --- */
// public/js/chat-board-integration.js
// CHAT-BOARD INTEGRATION: The board is the conversation. Chat is just air between sentences.
// Philosophy: If the board disappeared and the lesson still worked, you built a chatbot, not a tutor.

class ChatBoardController {
    constructor() {
        this.chatContainer = null;
        this.chatMessagesContainer = null;
        this.whiteboard = null;

        // State tracking
        this.currentTurn = 'student'; // 'student' | 'teacher'
        this.isTeaching = false; // AI actively teaching on board
        this.chatMinimized = false;
        this.boardIsActive = false;

        // Micro-chat constraints
        this.maxChatLength = 100; // characters - forces concise messages
        this.warningThreshold = 70; // warn AI when approaching limit

        // Spatial anchoring
        this.activeAnchors = new Map(); // messageId -> { targetObjectId, pointerId }
        this.anchorColors = {
            'teacher': '#12B3B3',
            'student': '#3b82f6',
            'error': '#ff6b6b',
            'hint': '#fbbf24'
        };

        console.log('✅ Chat-Board Controller initialized');
    }

    init(whiteboard) {
        this.whiteboard = whiteboard;
        this.chatContainer = document.getElementById('chat-container');
        this.chatMessagesContainer = document.getElementById('chat-messages-container');

        if (!this.chatContainer || !this.chatMessagesContainer) {
            console.warn('[ChatBoard] Chat containers not found');
            return;
        }

        this.setupChatStyles();
        this.setupBoardModeListeners();

        console.log('🎯 Chat-Board integration active');
    }

    // ============================================
    // CHAT LAYOUT MANAGEMENT
    // ============================================

    setupChatStyles() {
        // Ensure chat can collapse to minimal state
        if (!this.chatContainer) return;

        // Add data attributes for state management
        this.chatContainer.dataset.boardActive = 'false';
        this.chatContainer.dataset.minimized = 'false';

        // Add transition for smooth collapse
        this.chatContainer.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
    }

    /**
     * Auto-minimize chat when board teaching starts
     * Board takes 70% space, chat collapses to 30%
     */
    minimizeChat(animated = true) {
        if (this.chatMinimized) return;

        this.chatMinimized = true;
        this.chatContainer.dataset.minimized = 'true';

        // Collapse chat visually
        if (animated) {
            this.chatContainer.style.maxHeight = '30vh';
            this.chatContainer.style.opacity = '0.7';
        } else {
            this.chatContainer.style.maxHeight = '30vh';
            this.chatContainer.style.opacity = '0.7';
        }

        console.log('📉 Chat minimized - board is teaching');
    }

    /**
     * Restore chat when board teaching ends
     */
    expandChat(animated = true) {
        if (!this.chatMinimized) return;

        this.chatMinimized = false;
        this.chatContainer.dataset.minimized = 'false';

        if (animated) {
            this.chatContainer.style.maxHeight = '';
            this.chatContainer.style.opacity = '1';
        } else {
            this.chatContainer.style.maxHeight = '';
            this.chatContainer.style.opacity = '1';
        }

        console.log('📈 Chat expanded - student interaction');
    }

    /**
     * Pulse chat to draw attention (subtle, no dopamine abuse)
     */
    pulseChat() {
        if (!this.chatContainer) return;

        this.chatContainer.style.animation = 'gentle-pulse 0.5s ease';
        setTimeout(() => {
            this.chatContainer.style.animation = '';
        }, 500);
    }

    // ============================================
    // TURN-BASED INTERACTION
    // ============================================

    setupBoardModeListeners() {
        if (!this.whiteboard) return;

        // Listen for board mode changes
        const originalSetBoardMode = this.whiteboard.setBoardMode.bind(this.whiteboard);
        this.whiteboard.setBoardMode = (mode) => {
            originalSetBoardMode(mode);
            this.onBoardModeChange(mode);
        };

        // Listen for AI teaching behaviors
        this.setupTeachingListeners();
    }

    onBoardModeChange(mode) {
        console.log(`[ChatBoard] Board mode changed to: ${mode}`);

        if (mode === 'teacher') {
            this.currentTurn = 'teacher';
            this.isTeaching = true;
            this.boardIsActive = true;
            this.chatContainer.dataset.boardActive = 'true';
            this.minimizeChat(true);
        } else if (mode === 'student') {
            this.currentTurn = 'student';
            this.isTeaching = false;
            this.expandChat(true);
            // Pulse to invite interaction if needed
            if (this.boardIsActive) {
                this.pulseChat();
            }
        } else if (mode === 'collaborative') {
            // Stay in current state but allow switching
            this.expandChat(true);
        }
    }

    setupTeachingListeners() {
        // Hook into AI writing methods
        if (!this.whiteboard) return;

        const originalAIWrite = this.whiteboard.aiWritePartialStep.bind(this.whiteboard);
        this.whiteboard.aiWritePartialStep = async (text, x, y, pauseAfter) => {
            this.onAIStartsWriting();
            const result = await originalAIWrite(text, x, y, pauseAfter);
            this.onAIFinishesWriting();
            return result;
        };
    }

    onAIStartsWriting() {
        this.isTeaching = true;
        this.minimizeChat(true);
    }

    onAIFinishesWriting() {
        // Stay minimized during pause - silence is teaching
        // Will expand when mode changes to student
    }

    // ============================================
    // MICRO-CHAT CONSTRAINTS
    // ============================================

    /**
     * Enforce one-line, one-thought chat messages
     * Returns true if message passes constraints, false otherwise
     */
    validateChatMessage(text, type = 'ai') {
        if (!text) return false;

        const cleanText = text.replace(/\[.*?\]/g, '').trim(); // Remove markup
        const length = cleanText.length;

        // Check length constraint
        if (length > this.maxChatLength) {
            console.warn(`[ChatBoard] Message too long (${length}/${this.maxChatLength}): "${cleanText.substring(0, 50)}..."`);
            return false;
        }

        // Check for paragraph breaks (should be single thought)
        const lines = cleanText.split('\n').filter(l => l.trim());
        if (lines.length > 3) {
            console.warn('[ChatBoard] Message contains too many lines (should be 1-3)');
            return false;
        }

        return true;
    }

    /**
     * Format chat message to be concise and board-anchored
     */
    formatMicroChat(text, anchorTarget = null) {
        // Note: No truncation - AI should follow system instructions for conciseness
        return {
            text: text,
            anchorTarget: anchorTarget,
            timestamp: Date.now()
        };
    }

    /**
     * Suggested micro-chat templates for AI
     * These are examples of good chat messages
     */
    getMicroChatTemplates() {
        return {
            invite: [
                "Your turn.",
                "What comes next?",
                "Try it on the board.",
                "Your move."
            ],
            hint: [
                "Look at the sign.",
                "What cancels this?",
                "Check that step.",
                "Notice the pattern?"
            ],
            pause: [
                "Pause.",
                "See it?",
                "Watch this.",
                "One sec."
            ],
            redirect: [
                "Look here.",
                "Check the board.",
                "Try again here.",
                "Different approach?"
            ],
            praise: [
                "Nice.",
                "Good thinking.",
                "You got it.",
                "Exactly."
            ],
            error: [
                "Check this move.",
                "Not quite.",
                "Look again.",
                "Close, but..."
            ]
        };
    }

    // ============================================
    // SPATIAL ANCHORING
    // ============================================

    /**
     * Create visual anchor from chat message to board object
     * Every chat message must point to something specific
     */
    createSpatialAnchor(messageId, targetObjectId, anchorType = 'teacher') {
        if (!this.whiteboard || !this.whiteboard.semanticObjects.has(targetObjectId)) {
            console.warn(`[ChatBoard] Cannot anchor - object ${targetObjectId} not found`);
            return null;
        }

        const obj = this.whiteboard.semanticObjects.get(targetObjectId);
        const fabricObj = obj.fabricObject;

        // PHASE 2: Use enhanced visual pointer lines if available
        let pointer = null;
        const messageElement = document.getElementById(messageId);

        if (this.whiteboard.phase2 && this.whiteboard.phase2.createPointerLine && messageElement) {
            // Use Phase 2 enhanced pointer lines
            pointer = this.whiteboard.phase2.createPointerLine(messageElement, targetObjectId, anchorType);
        } else {
            // Fallback to basic pointer
            pointer = this.createPointerElementFallback(fabricObj, anchorType);
        }

        // Store anchor
        this.activeAnchors.set(messageId, {
            targetObjectId: targetObjectId,
            pointerId: pointer ? pointer.path?.id || pointer.id : null,
            type: anchorType,
            pointerRef: pointer
        });

        // Add subtle highlight to object
        this.whiteboard.highlightObject(targetObjectId, this.anchorColors[anchorType], 3000);

        console.log(`🎯 Created spatial anchor: message -> ${targetObjectId}`);

        return pointer;
    }

    createPointerElementFallback(fabricObj, anchorType) {
        // Fallback pointer (basic version)
        const pointer = document.createElement('div');
        pointer.className = 'spatial-anchor-pointer';
        pointer.style.cssText = `
            position: absolute;
            width: 3px;
            background: ${this.anchorColors[anchorType]};
            opacity: 0.6;
            pointer-events: none;
            z-index: 9999;
            transition: opacity 0.3s ease;
        `;
        pointer.id = `pointer-${Date.now()}-${Math.random()}`;

        // Position calculation would happen here
        document.body.appendChild(pointer);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            pointer.style.opacity = '0';
            setTimeout(() => pointer.remove(), 300);
        }, 3000);

        return pointer;
    }

    /**
     * Remove spatial anchor when message is no longer active
     */
    removeSpatialAnchor(messageId) {
        const anchor = this.activeAnchors.get(messageId);
        if (!anchor) return;

        const pointer = document.getElementById(anchor.pointerId);
        if (pointer) {
            pointer.style.opacity = '0';
            setTimeout(() => pointer.remove(), 300);
        }

        this.activeAnchors.delete(messageId);
    }

    // ============================================
    // CHAT MESSAGE ENHANCEMENT
    // ============================================

    /**
     * Enhance chat message with board context
     * Called after appendMessage in script.js
     */
    enhanceChatMessage(messageElement, sender, boardContext = null) {
        if (sender !== 'ai') return;

        // Add board-reference class
        if (boardContext && boardContext.targetObjectId) {
            messageElement.classList.add('board-anchored');
            messageElement.dataset.anchorTarget = boardContext.targetObjectId;

            // Create spatial anchor
            this.createSpatialAnchor(messageElement.id, boardContext.targetObjectId, boardContext.type || 'teacher');
        }

        // Add click handler to highlight referenced object
        if (boardContext && boardContext.targetObjectId) {
            messageElement.style.cursor = 'pointer';
            messageElement.addEventListener('click', () => {
                this.whiteboard.highlightObject(boardContext.targetObjectId, this.anchorColors.teacher, 2000);

                // Also open whiteboard if closed
                if (this.whiteboard.panel.classList.contains('is-hidden')) {
                    this.whiteboard.show();
                }
            });
        }
    }

    // ============================================
    // PUBLIC API FOR AI INTEGRATION
    // ============================================

    /**
     * Check if AI should use chat or board
     * Returns 'board' if board should be primary, 'chat' otherwise
     */
    getPreferredMedium(context = {}) {
        const { messageType, hasVisualElement, isError, needsExplanation } = context;

        // Errors: Board first (visual highlight), then micro-chat
        if (isError) return 'board';

        // Visual elements: Always board
        if (hasVisualElement) return 'board';

        // Explanations: Board if it can be shown visually
        if (needsExplanation && messageType !== 'concept-check') return 'board';

        // Concept checks, reflections: Chat is appropriate
        if (messageType === 'concept-check' || messageType === 'reflection') return 'chat';

        // Default: Board first
        return 'board';
    }

    /**
     * Prevent student from abusing chat as shortcut
     * Block "What's the next step?" type questions
     */
    validateStudentMessage(text) {
        const lowerText = text.toLowerCase();

        // Block shortcut-seeking patterns
        const shortcutPatterns = [
            /what'?s the next step/i,
            /tell me the answer/i,
            /just give me/i,
            /what do i do next/i,
            /how do i solve this/i
        ];

        for (const pattern of shortcutPatterns) {
            if (pattern.test(lowerText)) {
                console.log('[ChatBoard] Blocked shortcut-seeking message');
                return {
                    valid: false,
                    redirectMessage: "Try working through it on the board. I'll guide you step by step."
                };
            }
        }

        return { valid: true };
    }

    // ============================================
    // SYSTEM PROMPT INTEGRATION
    // ============================================

    /**
     * Get system prompt rules for AI behavior
     * This should be included in the AI's context
     */
    getSystemPromptRules() {
        return `
# CHAT-BOARD INTERACTION RULES

## Core Principle
The whiteboard IS the conversation. Chat messages are minimal air between sentences.
If the student is reading more than watching, the UX is failing.

## Chat Message Constraints
- Maximum length: ${this.maxChatLength} characters
- One line, one thought, one purpose
- Examples: "Your turn.", "What cancels this?", "Check that step."
- NO essays. NO step-by-step novels. NO paragraphs.

## When to Use Chat vs Board
1. **Teaching/Showing**: BOARD (write, circle, arrow)
2. **Hints**: BOARD first (visual), then micro-chat if needed
3. **Errors**: BOARD (highlight, circle), then micro-chat: "Check this move."
4. **Invitations**: Micro-chat after board action: "Your turn."
5. **Concept checks**: Chat (between board phases)
6. **Reflection**: Chat (after problem complete)

## Spatial Anchoring Required
Every chat message MUST reference something specific on the board.
Use [BOARD_REF:objectId] to link messages to board objects.
Examples:
- "Check that step." [BOARD_REF:eq_2]
- "What cancels this?" [BOARD_REF:eq_1]

## Turn-Based Rules
1. AI writes on board → pauses → "Your turn" → waits
2. Student writes → AI stays silent → Student commits
3. AI responds visually first, chat second
4. No interrupting student's board work

## Error Handling Sequence
1. Highlight mistake visually on board
2. Pause (silence is teaching)
3. Micro-chat: "Check this move."
4. Only explain if student asks or stalls

## Forbidden Patterns
- Never answer "What's the next step?" directly
- Never solve in chat what should be shown on board
- Never send multi-paragraph explanations
- Never use chat when board would be clearer

## Default State
Most of the time: Silent writing. No narration. The board speaks.
`;
    }
}

// ============================================
// GLOBAL INITIALIZATION
// ============================================

// Initialize when whiteboard is ready
window.ChatBoardController = ChatBoardController;

// Create global instance
window.chatBoardController = null;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for whiteboard to be initialized
    const checkWhiteboard = setInterval(() => {
        if (window.whiteboard && window.whiteboard.canvas) {
            window.chatBoardController = new ChatBoardController();
            window.chatBoardController.init(window.whiteboard);
            clearInterval(checkWhiteboard);
            console.log('✅ Chat-Board Controller ready');
        }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkWhiteboard), 10000);
});

// ============================================
// CSS INJECTION
// ============================================

const chatBoardStyles = document.createElement('style');
chatBoardStyles.textContent = `
/* Chat-Board Integration Styles */

/* Chat container collapse animation */
#chat-container[data-minimized="true"] {
    max-height: 30vh !important;
    opacity: 0.7 !important;
}

#chat-container[data-board-active="true"] {
    transition: max-height 0.3s ease, opacity 0.3s ease;
}

/* Gentle pulse animation */
@keyframes gentle-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
}

/* Board-anchored messages */
.message.board-anchored {
    border-left: 3px solid #12B3B3;
    position: relative;
    cursor: pointer;
    transition: background 0.2s ease;
}

.message.board-anchored:hover {
    background: rgba(18, 179, 179, 0.05);
}

.message.board-anchored::before {
    content: "📍";
    position: absolute;
    left: -20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    opacity: 0.6;
}

/* Spatial anchor pointers */
.spatial-anchor-pointer {
    animation: anchor-fade-in 0.3s ease;
}

@keyframes anchor-fade-in {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 0.6;
        transform: translateY(0);
    }
}

/* Board priority indicator */
#chat-container::before {
    content: "💬";
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 16px;
    opacity: 0.3;
    transition: opacity 0.3s ease;
    pointer-events: none;
}

#chat-container[data-board-active="true"]::before {
    content: "✏️";
    opacity: 0.6;
}
`;

document.head.appendChild(chatBoardStyles);

console.log('📋 Chat-Board integration styles loaded');

;
/* --- /js/floating-calculator.js --- */
// Floating Calcu-NOW-or-Later? Calculator - Enhanced Implementation
// Features: Cursor editing, ANS variable, keyboard input, table, error handling,
// mobile touch, expression validation, memory registers, copy/paste
// Plus: Drag support, teacher access control

class FloatingCalculator {
    constructor() {
        this.floatingCalc = document.getElementById('floating-calculator');
        this.toggleBtn = document.getElementById('toggle-calculator-btn');
        this.closeBtn = document.getElementById('close-calculator-btn');
        this.dragHandle = document.getElementById('calculator-drag-handle');
        this.sidebarCalcBtn = document.getElementById('sidebar-calculator-btn');

        // Display elements
        this.inputLine = document.getElementById('calc-input-line');
        this.resultLine = document.getElementById('calc-result-line');
        this.angleModeDisplay = document.getElementById('calc-angle-mode');
        this.hypIndicator = document.getElementById('calc-hyp-indicator');
        this.memoryIndicator = document.getElementById('calc-memory-indicator');
        this.historyDisplay = document.getElementById('calc-display-history');
        this.secondIndicator = document.getElementById('calc-2nd-indicator');
        this.enterBtn = this.floatingCalc ? this.floatingCalc.querySelector('[data-action="enter"]') : null;

        // Calculator state
        this.currentInput = '';
        this.cursorPos = 0;
        this.result = 0;
        this.memory = 0;
        this.ans = 0;
        this.angleMode = 'DEG';
        this.secondFunction = false;
        this.hypMode = false;
        this.fractionMode = false;
        this.lastResult = 0;
        this.waitingForOperand = false;
        this.history = [];
        this.historyIndex = -1;

        // Statistics state
        this.statMode = null;
        this.statData = { x: [], y: [] };
        this.dataEntryMode = false;
        this.currentDataVar = 'x';
        this.menuMode = null;
        this.menuCursor = 0;
        this.statVarMode = false;
        this.statVarIndex = 0;
        this.statVars = ['n', 'x̄', 'Σx', 'Σx²', 'σx', 'ȳ', 'Σy', 'Σy²', 'σy', 'Σxy', 'r', 'a', 'b'];

        // Memory registers (x1-x7)
        this.memoryRegisters = {};
        for (let i = 1; i <= 7; i++) this.memoryRegisters['x' + i] = 0;
        this.stoMode = false;
        this.rclMode = false;
        this.memRegCursor = 0;

        // Table mode
        this.tableMode = null;
        this.tableExpression = '';
        this.tableStart = 0;
        this.tableEnd = 10;
        this.tableStep = 1;
        this.tableResults = [];
        this.tableScrollIndex = 0;

        // Expression validation
        this.expressionValid = true;

        // Drag state
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;

        // Teacher access control
        this.calculatorAccess = 'always';
        this.calculatorNote = '';
        this.accessChecked = false;

        // Copy toast
        this.copyToast = null;
        this.createCopyToast();

        // Full history log for the history drawer
        this.fullHistory = [];

        // Scale state for resize
        this.calcScale = 1.0;
        this.minScale = 0.65;
        this.maxScale = 1.4;
        this.scaleStep = 0.1;

        this.initializeEventListeners();
        this.setupCopyPaste();
        this.setupMobileTouch();
        this.setupRippleEffect();
        this.setupHistoryDrawer();
        this.setupSendToChat();
        this.setupResizeControls();
        this.checkCalculatorAccess();
    }

    // ==================== TEACHER ACCESS CONTROL ====================

    async checkCalculatorAccess() {
        try {
            const response = await fetch('/api/calculator/access');
            const data = await response.json();
            if (data.success) {
                this.calculatorAccess = data.calculatorAccess;
                this.calculatorNote = data.calculatorNote || '';
                this.accessChecked = true;
                this.applyAccessRestrictions();
            }
        } catch (error) {
            console.warn('Could not check calculator access:', error);
            this.calculatorAccess = 'skill-based';
            this.accessChecked = true;
        }
    }

    applyAccessRestrictions() {
        const toolbarCalcBtn = document.getElementById('calculator-toolbar-btn');
        if (this.calculatorAccess === 'never') {
            if (this.sidebarCalcBtn) this.sidebarCalcBtn.style.display = 'none';
            if (this.toggleBtn) this.toggleBtn.style.display = 'none';
            if (toolbarCalcBtn) toolbarCalcBtn.style.display = 'none';
            this.hideCalculator();
        } else if (this.calculatorAccess === 'skill-based' || this.calculatorAccess === 'teacher-discretion') {
            if (this.sidebarCalcBtn) {
                this.sidebarCalcBtn.style.display = '';
                this.sidebarCalcBtn.title = this.calculatorAccess === 'skill-based'
                    ? 'Calculator (use for complex calculations only)'
                    : 'Calculator (teacher discretion)';
            }
            if (toolbarCalcBtn) toolbarCalcBtn.style.display = '';
        } else {
            if (this.sidebarCalcBtn) {
                this.sidebarCalcBtn.style.display = '';
                this.sidebarCalcBtn.title = 'Calculator';
            }
            if (toolbarCalcBtn) toolbarCalcBtn.style.display = '';
        }
    }

    toggleCalculator() {
        if (this.calculatorAccess === 'never') return;
        if (this.floatingCalc.style.display === 'none') this.showCalculator();
        else this.hideCalculator();
    }

    showCalculator() {
        this.floatingCalc.style.display = 'block';
        this._showBackdrop();
        if (this._isMobile()) {
            // Mobile uses bottom-sheet style (handled by CSS)
        } else {
            this.centerCalculator();
            // Animate open
            this.floatingCalc.classList.remove('calc-exiting');
            this.floatingCalc.classList.add('calc-entering');
            this.floatingCalc.addEventListener('animationend', () => {
                this.floatingCalc.classList.remove('calc-entering');
                // Re-apply user scale after animation
                this.applyScale();
            }, { once: true });
        }
    }

    hideCalculator() {
        if (!this._isMobile()) {
            this.floatingCalc.classList.remove('calc-entering');
            this.floatingCalc.classList.add('calc-exiting');
            this.floatingCalc.addEventListener('animationend', () => {
                this.floatingCalc.classList.remove('calc-exiting');
                this.floatingCalc.style.display = 'none';
            }, { once: true });
        } else {
            this.floatingCalc.style.display = 'none';
        }
        this._removeBackdrop();
    }

    centerCalculator() {
        const scaleStr = this.calcScale !== 1.0 ? ` scale(${this.calcScale})` : '';
        this.floatingCalc.style.transform = 'translateY(-50%)' + scaleStr;
        this.floatingCalc.style.right = '24px';
        this.floatingCalc.style.left = 'auto';
        this.xOffset = 0;
        this.yOffset = 0;
    }

    // ==================== MOBILE BOTTOM-SHEET ====================

    _isMobile() {
        return window.innerWidth <= 768;
    }

    _showBackdrop() {
        if (this._backdrop) return;
        this._backdrop = document.createElement('div');
        this._backdrop.className = 'calculator-backdrop';
        this._backdrop.addEventListener('click', (e) => {
            // Only dismiss if the click target is the backdrop itself,
            // not a touch event that was re-targeted from the calculator
            if (e.target === this._backdrop) this.hideCalculator();
        });
        document.body.appendChild(this._backdrop);
    }

    _removeBackdrop() {
        if (this._backdrop && this._backdrop.parentNode) {
            this._backdrop.parentNode.removeChild(this._backdrop);
        }
        this._backdrop = null;
    }

    _initMobileSwipe() {
        let startY = 0;
        let currentY = 0;

        this.dragHandle.addEventListener('touchstart', (e) => {
            if (!this._isMobile()) return;
            startY = e.touches[0].clientY;
            currentY = startY;
        }, { passive: true });

        this.dragHandle.addEventListener('touchmove', (e) => {
            if (!this._isMobile() || !startY) return;
            currentY = e.touches[0].clientY;
            const dy = currentY - startY;
            if (dy > 0) {
                this.floatingCalc.style.transform = `translateY(${dy}px)`;
            }
        }, { passive: true });

        this.dragHandle.addEventListener('touchend', () => {
            if (!this._isMobile()) { startY = 0; return; }
            const dy = currentY - startY;
            startY = 0;
            if (dy > 80) {
                this.hideCalculator();
            }
            this.floatingCalc.style.transform = '';
        }, { passive: true });
    }

    // ==================== DRAG ====================

    dragStart(e) {
        if (e.type === 'touchstart') {
            this.initialX = e.touches[0].clientX - this.xOffset;
            this.initialY = e.touches[0].clientY - this.yOffset;
        } else {
            this.initialX = e.clientX - this.xOffset;
            this.initialY = e.clientY - this.yOffset;
        }
        if (e.target === this.dragHandle || this.dragHandle.contains(e.target)) {
            this.isDragging = true;
        }
    }

    drag(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        if (e.type === 'touchmove') {
            this.currentX = e.touches[0].clientX - this.initialX;
            this.currentY = e.touches[0].clientY - this.initialY;
        } else {
            this.currentX = e.clientX - this.initialX;
            this.currentY = e.clientY - this.initialY;
        }
        this.xOffset = this.currentX;
        this.yOffset = this.currentY;
        const scaleStr = this.calcScale !== 1.0 ? ` scale(${this.calcScale})` : '';
        this.floatingCalc.style.transform = `translate(calc(-50% + ${this.currentX}px), calc(-50% + ${this.currentY}px))` + scaleStr;
    }

    dragEnd() { this.isDragging = false; }

    // ==================== CURSOR MANAGEMENT ====================

    insertAtCursor(text) {
        this.currentInput = this.currentInput.slice(0, this.cursorPos) + text + this.currentInput.slice(this.cursorPos);
        this.cursorPos += text.length;
    }

    insertPrefix(text) {
        if (this.waitingForOperand) {
            this.currentInput = '';
            this.cursorPos = 0;
            this.waitingForOperand = false;
        }
        this.insertAtCursor(text);
        this.updateDisplay();
    }

    deleteAtCursor() {
        if (this.cursorPos <= 0) return;
        const before = this.currentInput.substring(0, this.cursorPos);
        let len = 1;
        const fnTokens = ['atanh(', 'asinh(', 'acosh(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'abs(', 'ln('];
        for (const token of fnTokens) {
            if (before.endsWith(token)) { len = token.length; break; }
        }
        if (len === 1) {
            if (before.endsWith('10^(')) len = 4;
            else if (before.endsWith('e^(')) len = 3;
            else if (before.endsWith('▸n/d◂')) len = 5;
            else if (before.endsWith('nCr')) len = 3;
            else if (before.endsWith('nPr')) len = 3;
            else if (before.endsWith('Ans')) len = 3;
            else if (before.endsWith('ⁿ√')) len = 2;
            else if (before.endsWith('√(')) len = 2;
            else if (before.endsWith('(-')) len = 2;
        }
        this.currentInput = this.currentInput.slice(0, this.cursorPos - len) + this.currentInput.slice(this.cursorPos);
        this.cursorPos -= len;
    }

    moveCursorLeft() {
        if (this.cursorPos <= 0) return;
        const before = this.currentInput.substring(0, this.cursorPos);
        let len = 1;
        const fnTokens = ['atanh(', 'asinh(', 'acosh(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'abs(', 'ln('];
        for (const token of fnTokens) {
            if (before.endsWith(token)) { len = token.length; break; }
        }
        if (len === 1) {
            if (before.endsWith('10^(')) len = 4;
            else if (before.endsWith('e^(')) len = 3;
            else if (before.endsWith('▸n/d◂')) len = 5;
            else if (before.endsWith('nCr')) len = 3;
            else if (before.endsWith('nPr')) len = 3;
            else if (before.endsWith('Ans')) len = 3;
            else if (before.endsWith('ⁿ√')) len = 2;
            else if (before.endsWith('√(')) len = 2;
            else if (before.endsWith('(-')) len = 2;
        }
        this.cursorPos = Math.max(0, this.cursorPos - len);
    }

    moveCursorRight() {
        if (this.cursorPos >= this.currentInput.length) return;
        const after = this.currentInput.substring(this.cursorPos);
        let len = 1;
        const fnTokens = ['atanh(', 'asinh(', 'acosh(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'abs(', 'ln('];
        for (const token of fnTokens) {
            if (after.startsWith(token)) { len = token.length; break; }
        }
        if (len === 1) {
            if (after.startsWith('10^(')) len = 4;
            else if (after.startsWith('e^(')) len = 3;
            else if (after.startsWith('▸n/d◂')) len = 5;
            else if (after.startsWith('nCr')) len = 3;
            else if (after.startsWith('nPr')) len = 3;
            else if (after.startsWith('Ans')) len = 3;
            else if (after.startsWith('ⁿ√')) len = 2;
            else if (after.startsWith('√(')) len = 2;
            else if (after.startsWith('(-')) len = 2;
        }
        this.cursorPos = Math.min(this.currentInput.length, this.cursorPos + len);
    }

    // ==================== EVENT LISTENERS ====================

    initializeEventListeners() {
        if (this.toggleBtn) this.toggleBtn.addEventListener('click', () => this.toggleCalculator());
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.hideCalculator());

        // Toolbar calculator button (mobile compose bar)
        const toolbarCalcBtn = document.getElementById('calculator-toolbar-btn');
        if (toolbarCalcBtn) {
            toolbarCalcBtn.addEventListener('click', () => this.toggleCalculator());
        }

        // Drag (desktop only — mobile uses swipe-to-dismiss)
        this.dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
        if (!this._isMobile()) {
            this.dragHandle.addEventListener('touchstart', (e) => this.dragStart(e));
        }
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('touchmove', (e) => { if (!this._isMobile()) this.drag(e); });
        document.addEventListener('mouseup', () => this.dragEnd());
        document.addEventListener('touchend', () => this.dragEnd());

        // Mobile: swipe down on header to dismiss
        this._initMobileSwipe();

        // Prevent clicks inside the calculator from reaching document-level handlers
        this.floatingCalc.addEventListener('click', (e) => e.stopPropagation());
        this.floatingCalc.addEventListener('touchend', (e) => e.stopPropagation());

        // Calculator buttons
        this.floatingCalc.querySelectorAll('[data-num]').forEach(btn => {
            btn.addEventListener('click', () => this.handleNumber(btn.dataset.num));
        });
        this.floatingCalc.querySelectorAll('[data-op]').forEach(btn => {
            btn.addEventListener('click', () => this.handleOperator(btn.dataset.op));
        });
        this.floatingCalc.querySelectorAll('[data-fn]').forEach(btn => {
            btn.addEventListener('click', () => {
                const fn = this.secondFunction && btn.dataset.fn2 ? btn.dataset.fn2 : btn.dataset.fn;
                this.handleFunction(fn);
            });
        });
        this.floatingCalc.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => this.handleAction(btn.dataset.action));
        });

        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    // ==================== INPUT HANDLERS ====================

    handleNumber(num) {
        if (this.stoMode || this.rclMode) {
            const regNum = parseInt(num);
            if (regNum >= 1 && regNum <= 7) this.selectMemoryRegister(regNum);
            return;
        }
        if (this.tableMode === 'expr') { this.tableExpression += num; this.renderTableSetup(); return; }
        if (this.tableMode === 'start' || this.tableMode === 'end' || this.tableMode === 'step') {
            this.currentInput += num; this.renderTableSetup(); return;
        }
        if (this.dataEntryMode) {
            this.currentInput += num;
            this.cursorPos = this.currentInput.length;
            this.updateDisplay(); return;
        }
        if (this.waitingForOperand) {
            this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false;
        }
        this.insertAtCursor(num);
        this.updateDisplay();
        this.secondFunction = false;
    }

    handleOperator(op) {
        if (this.tableMode === 'expr') { this.tableExpression += op; this.renderTableSetup(); return; }

        const displayMap = { '+': '+', '-': '−', '−': '−', '×': '×', '÷': '÷', '*': '×', '/': '÷' };
        const displayOp = displayMap[op] || op;

        if (this.waitingForOperand) {
            this.currentInput = 'Ans' + displayOp;
            this.cursorPos = this.currentInput.length;
            this.waitingForOperand = false;
        } else if (this.currentInput) {
            const charBefore = this.cursorPos > 0 ? this.currentInput[this.cursorPos - 1] : '';
            if (['+', '−', '×', '÷'].includes(charBefore)) {
                this.currentInput = this.currentInput.slice(0, this.cursorPos - 1) + displayOp + this.currentInput.slice(this.cursorPos);
            } else {
                this.insertAtCursor(displayOp);
            }
        }
        this.updateDisplay();
        this.secondFunction = false;
    }

    handleFunction(fn) {
        if (this.tableMode === 'expr') {
            const ins = {
                'pi': 'π', 'power': '^', 'square': 'x²', 'sqrt': '√(',
                'lparen': '(', 'rparen': ')', 'decimal': '.', 'negative': '(-',
                'log': 'log(', 'ln': 'ln(', 'abs': 'abs(',
                'sin': 'sin(', 'cos': 'cos(', 'tan': 'tan(',
                'asin': 'asin(', 'acos': 'acos(', 'atan': 'atan(',
                'pow10': '10^(', 'exp': 'e^('
            };
            if (fn === 'negative') this.tableExpression += '(-';
            else if (ins[fn]) this.tableExpression += ins[fn];
            this.renderTableSetup(); return;
        }
        if (this.tableMode === 'start' || this.tableMode === 'end' || this.tableMode === 'step') {
            if (fn === 'decimal') {
                if (!this.currentInput.includes('.')) this.currentInput += this.currentInput === '' ? '0.' : '.';
                this.renderTableSetup(); return;
            }
            if (fn === 'negative') {
                this.currentInput = this.currentInput.startsWith('-') ? this.currentInput.slice(1) : '-' + this.currentInput;
                this.renderTableSetup(); return;
            }
            return;
        }

        switch(fn) {
            case 'sin': {
                const name = this.hypMode ? 'sinh(' : 'sin(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'cos': {
                const name = this.hypMode ? 'cosh(' : 'cos(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'tan': {
                const name = this.hypMode ? 'tanh(' : 'tan(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'asin': {
                const name = this.hypMode ? 'asinh(' : 'asin(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'acos': {
                const name = this.hypMode ? 'acosh(' : 'acos(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'atan': {
                const name = this.hypMode ? 'atanh(' : 'atan(';
                this.insertPrefix(name);
                this.hypMode = false; this.hypIndicator.textContent = '';
                break;
            }
            case 'sinh': this.insertPrefix('sinh('); break;
            case 'cosh': this.insertPrefix('cosh('); break;
            case 'tanh': this.insertPrefix('tanh('); break;
            case 'log': this.insertPrefix('log('); break;
            case 'pow10': this.insertPrefix('10^('); break;
            case 'ln': this.insertPrefix('ln('); break;
            case 'exp': this.insertPrefix('e^('); break;
            case 'square': this.applyFunction('square'); break;
            case 'sqrt': this.insertPrefix('√('); break;
            case 'power':
                if (this.waitingForOperand) {
                    this.currentInput = 'Ans^'; this.cursorPos = this.currentInput.length; this.waitingForOperand = false;
                } else { this.insertAtCursor('^'); }
                this.updateDisplay(); break;
            case 'nthroot':
                this.insertAtCursor('ⁿ√'); this.updateDisplay(); break;
            case 'reciprocal': this.applyFunction('reciprocal'); break;
            case 'pi':
                if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
                this.insertAtCursor('π'); this.updateDisplay(); break;
            case 'hyp':
                this.hypMode = !this.hypMode;
                this.hypIndicator.textContent = this.hypMode ? 'HYP' : ''; break;
            case 'ee':
                if (this.waitingForOperand) { this.currentInput = 'AnsE'; this.cursorPos = 4; this.waitingForOperand = false; }
                else if (this.currentInput) { this.insertAtCursor('E'); }
                else { this.currentInput = '1E'; this.cursorPos = 2; }
                this.updateDisplay(); break;
            case 'lparen':
                if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
                this.insertAtCursor('('); this.updateDisplay(); break;
            case 'rparen':
                this.insertAtCursor(')'); this.updateDisplay(); break;
            case 'prb': case 'prn':
                if (this.waitingForOperand) { this.currentInput = 'AnsnCr'; this.cursorPos = 6; this.waitingForOperand = false; }
                else { this.insertAtCursor('nCr'); }
                this.updateDisplay(); break;
            case 'nPr':
                if (this.waitingForOperand) { this.currentInput = 'AnsnPr'; this.cursorPos = 6; this.waitingForOperand = false; }
                else { this.insertAtCursor('nPr'); }
                this.updateDisplay(); break;
            case 'nd':
                this.insertAtCursor('▸n/d◂'); this.updateDisplay(); break;
            case 'abc':
                this.insertAtCursor('_'); this.updateDisplay(); break;
            case 'fd': case 'ud': case 'dec': case 'toggle':
                this.toggleFractionDisplay(); break;
            case 'factorial': this.applyFunction('factorial'); break;
            case 'decimal': this.handleDecimal(); break;
            case 'negative': this.toggleNegative(); break;
            case 'sto': this.storeMemory(); break;
            case 'rcl': this.recallMemory(); break;
            case 'percent': this.applyFunction('percent'); break;
            case 'comma': this.insertAtCursor(','); this.updateDisplay(); break;
            case 'abs': this.insertPrefix('abs('); break;
            case 'ans':
                if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
                this.insertAtCursor('Ans'); this.updateDisplay(); break;
            case 'table': this.openTable(); break;
        }
        if (fn !== 'hyp') this.secondFunction = false;
    }

    handleAction(action) {
        switch(action) {
            case '2nd':
                this.secondFunction = !this.secondFunction;
                this.updateSecondFunctionIndicator(); break;
            case 'mode': this.toggleAngleMode(); break;
            case 'stat':
                if (this.secondFunction) this.showStatMenu();
                else this.cycleStatMode();
                this.secondFunction = false; break;
            case 'data':
                if (this.secondFunction) this.showDataMenu();
                else this.enterDataMode();
                this.secondFunction = false; break;
            case 'statvar':
                if (this.secondFunction) this.exitStatMode();
                else this.enterStatVarMode();
                this.secondFunction = false; break;
            case 'arrow-up': this.handleArrowUp(); break;
            case 'arrow-down': this.handleArrowDown(); break;
            case 'arrow-left': this.handleArrowLeft(); break;
            case 'arrow-right': this.handleArrowRight(); break;
            case 'del':
                if (this.secondFunction) { this.secondFunction = false; }
                else { this.deleteAtCursor(); this.updateDisplay(); }
                break;
            case 'clear':
                if (this.tableMode) this.closeTable();
                else if (this.stoMode || this.rclMode) { this.stoMode = false; this.rclMode = false; this.updateDisplay(); }
                else this.clear();
                break;
            case 'enter': this.handleEnter(); break;
            case 'on': this.reset(); break;
        }
    }

    handleEnter() {
        if (this.stoMode || this.rclMode) { this.selectMemoryRegister(this.memRegCursor + 1); return; }
        if (this.tableMode === 'expr') {
            if (this.tableExpression) { this.tableMode = 'start'; this.currentInput = String(this.tableStart); this.renderTableSetup(); }
            return;
        }
        if (this.tableMode === 'start') {
            this.tableStart = parseFloat(this.currentInput) || 0;
            this.tableMode = 'end'; this.currentInput = String(this.tableEnd); this.renderTableSetup(); return;
        }
        if (this.tableMode === 'end') {
            this.tableEnd = parseFloat(this.currentInput) || 10;
            this.tableMode = 'step'; this.currentInput = String(this.tableStep); this.renderTableSetup(); return;
        }
        if (this.tableMode === 'step') {
            this.tableStep = parseFloat(this.currentInput) || 1;
            if (this.tableStep === 0) this.tableStep = 1;
            this.evaluateTable(); return;
        }
        if (this.tableMode === 'view') { this.closeTable(); return; }
        if (this.menuMode) this.selectMenuItem();
        else if (this.dataEntryMode) this.addDataPoint();
        else if (this.statVarMode) this.displayStatVar();
        else this.calculate();
    }

    handleKeyboard(e) {
        if (this.floatingCalc.style.display === 'none') return;
        const key = e.key;

        if (e.ctrlKey || e.metaKey) {
            if (key === 'c') { this.copyResult(); return; }
            if (key === 'v') return;
            return;
        }

        if (key >= '0' && key <= '9') { this.handleNumber(key); e.preventDefault(); return; }

        const opMap = { '+': '+', '-': '−', '*': '×', '/': '÷' };
        if (opMap[key]) { this.handleOperator(opMap[key]); e.preventDefault(); return; }

        switch(key) {
            case 'Enter': this.handleEnter(); e.preventDefault(); break;
            case 'Escape':
                if (this.tableMode) this.closeTable();
                else if (this.stoMode || this.rclMode) { this.stoMode = false; this.rclMode = false; this.updateDisplay(); }
                else this.clear();
                e.preventDefault(); break;
            case 'Backspace':
                if (this.tableMode === 'expr') { this.tableExpression = this.tableExpression.slice(0, -1); this.renderTableSetup(); }
                else if (['start','end','step'].includes(this.tableMode)) { this.currentInput = this.currentInput.slice(0, -1); this.renderTableSetup(); }
                else { this.deleteAtCursor(); this.updateDisplay(); }
                e.preventDefault(); break;
            case 'Delete':
                if (this.cursorPos < this.currentInput.length) { this.moveCursorRight(); this.deleteAtCursor(); this.updateDisplay(); }
                e.preventDefault(); break;
            case '.': this.handleDecimal(); e.preventDefault(); break;
            case '(': this.handleFunction('lparen'); e.preventDefault(); break;
            case ')': this.handleFunction('rparen'); e.preventDefault(); break;
            case '^': this.handleFunction('power'); e.preventDefault(); break;
            case '!': this.handleFunction('factorial'); e.preventDefault(); break;
            case 'p': this.handleFunction('pi'); e.preventDefault(); break;
            case 'a': this.handleFunction('ans'); e.preventDefault(); break;
            case 'x':
                if (this.tableMode === 'expr') { this.tableExpression += 'x'; this.renderTableSetup(); e.preventDefault(); }
                break;
            case 't':
                if (!this.currentInput && !this.tableMode) { this.openTable(); e.preventDefault(); }
                break;
            case 'Tab':
                this.secondFunction = !this.secondFunction;
                this.updateSecondFunctionIndicator(); e.preventDefault(); break;
            case 'Home': this.cursorPos = 0; this.updateDisplay(); e.preventDefault(); break;
            case 'End': this.cursorPos = this.currentInput.length; this.updateDisplay(); e.preventDefault(); break;
            case 'ArrowUp': this.handleArrowUp(); e.preventDefault(); break;
            case 'ArrowDown': this.handleArrowDown(); e.preventDefault(); break;
            case 'ArrowLeft': this.handleArrowLeft(); e.preventDefault(); break;
            case 'ArrowRight': this.handleArrowRight(); e.preventDefault(); break;
        }
    }

    // ==================== ARROW KEYS ====================

    handleArrowUp() {
        if (this.tableMode === 'view') { this.tableScrollIndex = Math.max(0, this.tableScrollIndex - 1); this.renderTableView(); return; }
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.max(0, this.memRegCursor - 1); this.renderMemorySelection(); return; }
        if (this.menuMode) { this.menuCursor = Math.max(0, this.menuCursor - 1); if (this.menuMode === 'STAT') this.showStatMenu(); return; }
        if (this.history.length > 0) {
            if (this.historyIndex < 0) this.historyIndex = this.history.length;
            this.historyIndex = Math.max(0, this.historyIndex - 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.cursorPos = this.currentInput.length;
            this.updateDisplay();
        }
    }

    handleArrowDown() {
        if (this.tableMode === 'view') { this.tableScrollIndex = Math.min(this.tableResults.length - 1, this.tableScrollIndex + 1); this.renderTableView(); return; }
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.min(6, this.memRegCursor + 1); this.renderMemorySelection(); return; }
        if (this.menuMode) { this.menuCursor = Math.min(1, this.menuCursor + 1); if (this.menuMode === 'STAT') this.showStatMenu(); return; }
        if (this.dataEntryMode && this.currentInput) { this.addDataPoint(); }
        else if (this.historyIndex >= 0) {
            this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1);
            this.currentInput = this.history[this.historyIndex].input;
            this.cursorPos = this.currentInput.length;
            this.updateDisplay();
        }
    }

    handleArrowLeft() {
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.max(0, this.memRegCursor - 1); this.renderMemorySelection(); return; }
        if (this.menuMode === 'STAT') { this.menuCursor = 0; this.showStatMenu(); return; }
        if (this.statVarMode) { this.statVarIndex = Math.max(0, this.statVarIndex - 1); this.displayStatVar(); return; }
        this.moveCursorLeft();
        this.updateDisplay();
    }

    handleArrowRight() {
        if (this.stoMode || this.rclMode) { this.memRegCursor = Math.min(6, this.memRegCursor + 1); this.renderMemorySelection(); return; }
        if (this.menuMode === 'STAT') { this.menuCursor = 1; this.showStatMenu(); return; }
        if (this.statVarMode) {
            const maxIndex = this.statMode === '2-VAR' ? 12 : 4;
            this.statVarIndex = Math.min(maxIndex, this.statVarIndex + 1);
            this.displayStatVar(); return;
        }
        this.moveCursorRight();
        this.updateDisplay();
    }

    // ==================== TRIG FUNCTIONS ====================

    applyTrigFunction(fn) {
        // Legacy support — trig is now prefix-based via safeEval
        const value = this.getCurrentValue();
        if (value === null) return;
        let result;
        const rad = this.angleMode === 'DEG' ? value * Math.PI / 180 : value;
        switch(fn) {
            case 'sin': result = Math.sin(rad); break;
            case 'cos': result = Math.cos(rad); break;
            case 'tan':
                if (this.angleMode === 'DEG' && value % 180 === 90) { this.showError('DOMAIN'); return; }
                result = Math.tan(rad); break;
            case 'asin':
                if (value < -1 || value > 1) { this.showError('DOMAIN'); return; }
                result = Math.asin(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'acos':
                if (value < -1 || value > 1) { this.showError('DOMAIN'); return; }
                result = Math.acos(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'atan':
                result = Math.atan(value);
                if (this.angleMode === 'DEG') result = result * 180 / Math.PI; break;
            case 'sinh': result = Math.sinh(value); break;
            case 'cosh': result = Math.cosh(value); break;
            case 'tanh': result = Math.tanh(value); break;
            case 'asinh': result = Math.asinh(value); break;
            case 'acosh':
                if (value < 1) { this.showError('DOMAIN'); return; }
                result = Math.acosh(value); break;
            case 'atanh':
                if (value <= -1 || value >= 1) { this.showError('DOMAIN'); return; }
                result = Math.atanh(value); break;
        }
        if (result !== undefined && !isFinite(result)) { this.showError('OVERFLOW'); return; }
        this.hypMode = false;
        this.hypIndicator.textContent = '';
        this.setResult(result);
    }

    // ==================== MATH FUNCTIONS ====================

    applyFunction(fn) {
        const value = this.getCurrentValue();
        if (value === null) return;
        let result;
        switch(fn) {
            case 'factorial':
                if (value < 0 || !Number.isInteger(value)) { this.showError('DOMAIN'); return; }
                if (value > 170) { this.showError('OVERFLOW'); return; }
                result = this.factorial(value); break;
            case 'percent': result = value / 100; break;
            case 'square': result = value * value; break;
            case 'reciprocal':
                if (value === 0) { this.showError('DIVIDE BY 0'); return; }
                result = 1 / value; break;
        }
        this.setResult(result);
    }

    factorial(n) {
        if (n < 0 || !Number.isInteger(n)) return NaN;
        if (n === 0 || n === 1) return 1;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
    }

    getCurrentValue() {
        if (!this.currentInput) return this.lastResult;
        const parts = this.currentInput.split(/[+\−×÷^(]/);
        const lastPart = parts[parts.length - 1].replace(/[)▸◂n/d]/g, '');
        if (lastPart === 'π') return Math.PI;
        if (lastPart === 'Ans') return this.ans;
        if (lastPart === '') return this.lastResult;
        const value = parseFloat(lastPart);
        return isNaN(value) ? this.lastResult : value;
    }

    setResult(value) {
        if (value === undefined || value === null) return;
        this.currentInput = '';
        this.cursorPos = 0;
        this.result = value;
        this.lastResult = value;
        this.resultLine.textContent = this.formatNumber(value);
        this.waitingForOperand = true;
        this.updateDisplay();
    }

    // ==================== DECIMAL / NEGATIVE ====================

    handleDecimal() {
        if (this.waitingForOperand) {
            this.currentInput = '0.'; this.cursorPos = 2; this.waitingForOperand = false;
            this.updateDisplay(); return;
        }
        const before = this.currentInput.slice(0, this.cursorPos);
        const parts = before.split(/[+\−×÷^(]/);
        const lastPart = parts[parts.length - 1];
        if (!lastPart.includes('.')) {
            this.insertAtCursor(lastPart === '' ? '0.' : '.');
            this.updateDisplay();
        }
    }

    toggleNegative() {
        if (this.waitingForOperand) {
            this.lastResult = -this.lastResult;
            this.result = this.lastResult;
            this.resultLine.textContent = this.formatNumber(this.lastResult);
            return;
        }
        if (this.currentInput) {
            const match = this.currentInput.match(/(.*?)(\(?\-?)(\d+\.?\d*E?[+\-]?\d*)$/);
            if (match) {
                const prefix = match[1], sign = match[2], num = match[3];
                if (sign === '(-' || sign === '-') this.currentInput = prefix + num;
                else this.currentInput = prefix + '(-' + num + ')';
                this.cursorPos = this.currentInput.length;
            } else {
                if (this.currentInput.startsWith('(-')) this.currentInput = this.currentInput.slice(2, -1);
                else this.currentInput = '(-' + this.currentInput + ')';
                this.cursorPos = this.currentInput.length;
            }
            this.updateDisplay();
        }
    }

    toggleAngleMode() {
        this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
        this.angleModeDisplay.textContent = this.angleMode;
    }

    // ==================== FRACTION DISPLAY ====================

    toggleFractionDisplay() {
        this.fractionMode = !this.fractionMode;
        if (this.fractionMode && this.lastResult) {
            this.resultLine.textContent = this.decimalToFraction(this.lastResult);
        } else {
            this.resultLine.textContent = this.formatNumber(this.lastResult);
        }
    }

    decimalToFraction(decimal) {
        if (Number.isInteger(decimal)) return decimal.toString();
        const sign = decimal < 0 ? '-' : '';
        decimal = Math.abs(decimal);
        const tolerance = 1.0e-8;
        let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = decimal, iterations = 0;
        do {
            let a = Math.floor(b), aux = h1;
            h1 = a * h1 + h2; h2 = aux;
            aux = k1; k1 = a * k1 + k2; k2 = aux;
            if (Math.abs(b - a) < tolerance) break;
            b = 1 / (b - a); iterations++;
        } while (Math.abs(decimal - h1 / k1) > decimal * tolerance && iterations < 100);
        if (k1 === 1) return sign + h1.toString();
        if (h1 > k1) {
            const whole = Math.floor(h1 / k1), rem = h1 % k1;
            if (rem === 0) return sign + whole.toString();
            return `${sign}${whole} ${rem}/${k1}`;
        }
        return `${sign}${h1}/${k1}`;
    }

    // ==================== MEMORY REGISTERS ====================

    storeMemory() {
        this.stoMode = true; this.rclMode = false; this.memRegCursor = 0;
        this.renderMemorySelection();
    }

    recallMemory() {
        this.rclMode = true; this.stoMode = false; this.memRegCursor = 0;
        this.renderMemorySelection();
    }

    selectMemoryRegister(regNum) {
        const regKey = 'x' + regNum;
        if (this.stoMode) {
            const value = this.waitingForOperand ? this.lastResult : this.getCurrentValue();
            if (value !== null) {
                this.memoryRegisters[regKey] = value;
                this.memoryIndicator.textContent = 'M';
                this.showMessage(`STO → ${regKey} = ${this.formatNumber(value)}`);
            }
            this.stoMode = false;
        } else if (this.rclMode) {
            const value = this.memoryRegisters[regKey];
            if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
            this.insertAtCursor(String(value));
            this.updateDisplay();
            this.rclMode = false;
        }
    }

    renderMemorySelection() {
        const mode = this.stoMode ? 'STO→' : 'RCL';
        let line1 = `${mode} `;
        for (let i = 0; i < 7; i++) {
            line1 += `${i === this.memRegCursor ? '▸' : ' '}x${i + 1} `;
        }
        const selectedKey = 'x' + (this.memRegCursor + 1);
        this.inputLine.textContent = line1;
        this.inputLine.classList.remove('mathprint');
        this.resultLine.textContent = `${selectedKey} = ${this.formatNumber(this.memoryRegisters[selectedKey])}`;
    }

    // ==================== TABLE FEATURE ====================

    openTable() {
        this.tableMode = 'expr'; this.tableExpression = '';
        this.tableStart = 0; this.tableEnd = 10; this.tableStep = 1;
        this.tableResults = []; this.tableScrollIndex = 0;
        this.renderTableSetup();
    }

    closeTable() {
        this.tableMode = null; this.currentInput = ''; this.cursorPos = 0;
        this.inputLine.classList.add('mathprint');
        this.updateDisplay();
    }

    renderTableSetup() {
        this.inputLine.classList.remove('mathprint');
        if (this.tableMode === 'expr') {
            this.inputLine.textContent = `f(x)= ${this.tableExpression}█`;
            this.resultLine.textContent = 'Enter expression with x';
        } else if (this.tableMode === 'start') {
            this.inputLine.textContent = `TblStart= ${this.currentInput}█`;
            this.resultLine.textContent = `f(x)= ${this.tableExpression}`;
        } else if (this.tableMode === 'end') {
            this.inputLine.textContent = `TblEnd= ${this.currentInput}█`;
            this.resultLine.textContent = `Start= ${this.tableStart}`;
        } else if (this.tableMode === 'step') {
            this.inputLine.textContent = `ΔTbl= ${this.currentInput}█`;
            this.resultLine.textContent = `${this.tableStart} → ${this.tableEnd}`;
        }
    }

    evaluateTable() {
        this.tableResults = [];
        const steps = Math.min(100, Math.abs((this.tableEnd - this.tableStart) / this.tableStep) + 1);
        for (let i = 0; i < steps; i++) {
            const x = this.tableStart + i * this.tableStep;
            if ((this.tableStep > 0 && x > this.tableEnd) || (this.tableStep < 0 && x < this.tableEnd)) break;
            try {
                let expr = this.tableExpression
                    .replace(/x²/g, 'x*x')
                    .replace(/x/g, `(${x})`).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
                    .replace(/π/g, `(${Math.PI})`).replace(/\^/g, '**');
                expr = expr.replace(/atanh\(/g, 'Math.atanh(')
                           .replace(/asinh\(/g, 'Math.asinh(')
                           .replace(/acosh\(/g, 'Math.acosh(')
                           .replace(/asin\(/g, 'Math.asin(')
                           .replace(/acos\(/g, 'Math.acos(')
                           .replace(/atan\(/g, 'Math.atan(')
                           .replace(/sinh\(/g, 'Math.sinh(')
                           .replace(/cosh\(/g, 'Math.cosh(')
                           .replace(/tanh\(/g, 'Math.tanh(')
                           .replace(/sin\(/g, 'Math.sin(')
                           .replace(/cos\(/g, 'Math.cos(')
                           .replace(/tan\(/g, 'Math.tan(')
                           .replace(/log\(/g, 'Math.log10(')
                           .replace(/ln\(/g, 'Math.log(')
                           .replace(/abs\(/g, 'Math.abs(')
                           .replace(/√\(/g, 'Math.sqrt(');
                expr = expr.replace(/(\d)\(/g, '$1*(').replace(/\)(\d)/g, ')*$1').replace(/\)\(/g, ')*(');
                const y = new Function('return ' + expr)();
                this.tableResults.push({ x, y: isFinite(y) ? y : NaN });
            } catch(e) { this.tableResults.push({ x, y: NaN }); }
        }
        if (this.tableResults.length === 0) { this.showError('SYNTAX'); this.closeTable(); return; }
        this.tableMode = 'view'; this.tableScrollIndex = 0;
        this.renderTableView();
    }

    renderTableView() {
        this.inputLine.classList.remove('mathprint');
        if (this.tableResults.length === 0) { this.inputLine.textContent = 'No results'; this.resultLine.textContent = ''; return; }
        const rows = [];
        for (let i = this.tableScrollIndex; i < Math.min(this.tableScrollIndex + 2, this.tableResults.length); i++) {
            const r = this.tableResults[i];
            rows.push(`x=${this.formatNumber(r.x)}  f(x)=${isNaN(r.y) ? 'ERR' : this.formatNumber(r.y)}`);
        }
        this.inputLine.textContent = rows[0] || '';
        this.resultLine.textContent = rows[1] || `[${this.tableScrollIndex + 1}/${this.tableResults.length}]`;
        if (this.historyDisplay) {
            const total = this.tableResults.length, pos = this.tableScrollIndex + 1;
            this.historyDisplay.innerHTML = `<div class="history-entry" style="opacity:0.7;justify-content:center;">TABLE: f(x)= ${this.escapeHtml(this.tableExpression)} [${pos}/${total}] ↑↓</div>`;
        }
    }

    // ==================== STATISTICS ====================

    showStatMenu() {
        this.menuMode = 'STAT';
        this.menuCursor = this.statMode === '2-VAR' ? 1 : 0;
        const opts = ['1-VAR', '2-VAR'];
        this.inputLine.textContent = opts.map((o, i) => i === this.menuCursor ? `▸${o}` : ` ${o}`).join('  ');
        this.inputLine.classList.remove('mathprint');
        this.resultLine.textContent = 'Select mode';
    }

    showDataMenu() {
        this.menuMode = 'DATA';
        this.inputLine.textContent = '▸CLRDATA';
        this.inputLine.classList.remove('mathprint');
        this.resultLine.textContent = 'Clear stat data?';
    }

    selectMenuItem() {
        if (this.menuMode === 'STAT') {
            this.statMode = this.menuCursor === 0 ? '1-VAR' : '2-VAR';
            this.showMessage(`${this.statMode} MODE`);
            this.menuMode = null;
        } else if (this.menuMode === 'DATA') {
            this.statData = { x: [], y: [] };
            this.showMessage('DATA CLEARED');
            this.menuMode = null;
        }
    }

    cycleStatMode() {
        if (!this.statMode) { this.statMode = '1-VAR'; this.showMessage('1-VAR MODE'); }
        else if (this.statMode === '1-VAR') { this.statMode = '2-VAR'; this.showMessage('2-VAR MODE'); }
        else { this.statMode = null; this.statData = { x: [], y: [] }; this.showMessage('STAT OFF'); }
    }

    enterDataMode() {
        if (!this.statMode) { this.showMessage('SELECT STAT MODE'); return; }
        this.dataEntryMode = true; this.currentInput = ''; this.cursorPos = 0;
        this.currentDataVar = 'x';
        this.showMessage(`DATA ENTRY ${this.statMode}`);
    }

    addDataPoint() {
        if (!this.dataEntryMode) return;
        const value = parseFloat(this.currentInput);
        if (isNaN(value)) { this.showError('DOMAIN'); return; }
        if (this.statMode === '1-VAR') {
            this.statData.x.push(value); this.currentInput = ''; this.cursorPos = 0;
            this.showMessage(`n = ${this.statData.x.length}`);
        } else if (this.statMode === '2-VAR') {
            if (this.currentDataVar === 'x') {
                this.statData.x.push(value); this.currentDataVar = 'y';
                this.currentInput = ''; this.cursorPos = 0; this.showMessage('Enter Y');
            } else {
                this.statData.y.push(value); this.currentDataVar = 'x';
                this.currentInput = ''; this.cursorPos = 0;
                this.showMessage(`n = ${this.statData.x.length}`);
            }
        }
        setTimeout(() => {
            if (this.dataEntryMode) {
                this.inputLine.textContent = this.currentInput || '';
                this.resultLine.textContent = `${this.statMode} | Enter ${this.currentDataVar.toUpperCase()}`;
            }
        }, 1500);
    }

    enterStatVarMode() {
        if (!this.statMode) { this.showMessage('NO STAT MODE'); return; }
        if (this.statData.x.length === 0) { this.showMessage('NO DATA'); return; }
        this.statVarMode = true; this.statVarIndex = 0;
        this.displayStatVar();
    }

    exitStatMode() {
        this.statMode = null; this.statData = { x: [], y: [] };
        this.statVarMode = false; this.dataEntryMode = false;
        this.showMessage('STAT OFF');
    }

    displayStatVar() {
        const varName = this.statVars[this.statVarIndex];
        const stats = this.calculateStatistics();
        if (!stats) { this.showMessage('NO DATA'); return; }
        const valueMap = { 'n': this.statData.x.length, 'x̄': stats.xMean, 'Σx': stats.xSum, 'Σx²': stats.xSumSq, 'σx': stats.xStd };
        if (this.statMode === '2-VAR') {
            Object.assign(valueMap, { 'ȳ': stats.yMean, 'Σy': stats.ySum, 'Σy²': stats.ySumSq, 'σy': stats.yStd, 'Σxy': stats.xySum, 'r': stats.r, 'a': stats.intercept, 'b': stats.slope });
        }
        const value = valueMap[varName];
        this.inputLine.textContent = `${varName} =`;
        this.inputLine.classList.remove('mathprint');
        if (value === undefined) { this.resultLine.textContent = 'N/A (2-VAR only)'; }
        else { this.resultLine.textContent = this.formatNumber(value); this.lastResult = value; }
    }

    calculateStatistics() {
        if (!this.statMode || this.statData.x.length === 0) return null;
        const stats = {}, n = this.statData.x.length, xData = this.statData.x;
        const xSum = xData.reduce((a, b) => a + b, 0);
        stats.xSum = xSum; stats.xMean = xSum / n;
        stats.xStd = Math.sqrt(xData.reduce((s, v) => s + Math.pow(v - stats.xMean, 2), 0) / n);
        stats.xSumSq = xData.reduce((s, v) => s + v * v, 0);
        if (this.statMode === '2-VAR' && this.statData.y.length === n) {
            const yData = this.statData.y, ySum = yData.reduce((a, b) => a + b, 0);
            stats.ySum = ySum; stats.yMean = ySum / n;
            stats.yStd = Math.sqrt(yData.reduce((s, v) => s + Math.pow(v - stats.yMean, 2), 0) / n);
            stats.ySumSq = yData.reduce((s, v) => s + v * v, 0);
            const xySum = xData.reduce((s, x, i) => s + x * yData[i], 0);
            stats.xySum = xySum;
            stats.slope = (n * xySum - xSum * ySum) / (n * stats.xSumSq - xSum * xSum);
            stats.intercept = (ySum - stats.slope * xSum) / n;
            const corrN = n * xySum - xSum * ySum;
            const corrD = Math.sqrt((n * stats.xSumSq - xSum * xSum) * (n * stats.ySumSq - ySum * ySum));
            stats.r = corrD !== 0 ? corrN / corrD : 0;
        }
        return stats;
    }

    // ==================== EXPRESSION EVALUATION ====================

    calculate() {
        if (!this.currentInput) return;
        try {
            let expr = this.currentInput;
            expr = expr.replace(/Ans/g, `(${this.ans})`);
            expr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
                .replace(/π/g, `(${Math.PI})`).replace(/\^/g, '**');
            expr = expr.replace(/▸n\/d◂/g, '/');
            expr = expr.replace(/(\d+\.?\d*)E([+\-]?\d+)/g, '($1*Math.pow(10,$2))');
            expr = expr.replace(/(\d+\.?\d*)nCr(\d+\.?\d*)/g, (_, n, r) => this.combination(parseFloat(n), parseFloat(r)));
            expr = expr.replace(/(\d+\.?\d*)nPr(\d+\.?\d*)/g, (_, n, r) => this.permutation(parseFloat(n), parseFloat(r)));

            // Nth roots (before √ conversion)
            expr = expr.replace(/(\d+\.?\d*)ⁿ√\(([^)]+)\)/g, 'Math.pow($2,1/$1)').replace(/(\d+\.?\d*)ⁿ√(\d+\.?\d*)/g, 'Math.pow($2,1/$1)');

            // √ symbol → sqrt function (safeEval defines it)
            expr = expr.replace(/√(\d+\.?\d*)/g, 'sqrt($1)');
            expr = expr.replace(/√/g, 'sqrt');

            // Implicit multiplication
            const fnPat = '(?:atanh|asinh|acosh|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|abs|sqrt)';
            expr = expr.replace(/(\d)\(/g, '$1*(');
            expr = expr.replace(/\)(\d)/g, ')*$1');
            expr = expr.replace(/\)\(/g, ')*(');
            expr = expr.replace(new RegExp('(\\d)(' + fnPat + '\\()', 'g'), '$1*$2');
            expr = expr.replace(new RegExp('\\)(' + fnPat + '\\()', 'g'), ')*$1');

            const result = this.safeEval(expr);
            if (isNaN(result)) { this.showError('SYNTAX'); return; }
            if (!isFinite(result)) {
                this.showError(expr.includes('/0') || expr.includes('/ 0') ? 'DIVIDE BY 0' : 'OVERFLOW');
                return;
            }

            this.history.push({ input: this.currentInput, result });
            this.historyIndex = -1;
            this.result = result;
            this.lastResult = result;
            this.ans = result;
            this.resultLine.textContent = this.formatNumber(result);
            this.waitingForOperand = true;
            this.cursorPos = 0;
            this.renderHistory();
            // Track in full history drawer
            this.fullHistory.unshift({ input: this.currentInput, result: this.formatNumber(result) });
            this.updateHistoryDrawer();
        } catch (error) {
            this.showError('SYNTAX');
        }
    }

    validateExpression() {
        if (!this.currentInput || this.waitingForOperand) {
            this.expressionValid = !this.currentInput;
            this.updateEnterButton(); return;
        }
        const input = this.currentInput;
        let parenBalance = 0;
        for (let i = 0; i < input.length; i++) {
            if (input[i] === '(') parenBalance++;
            else if (input[i] === ')') parenBalance--;
            if (parenBalance < 0) break;
        }
        const lastChar = input.slice(-1);
        const endsWithOp = ['+', '−', '×', '÷', '^', 'E'].includes(lastChar);
        const hasDoubleOp = /[+\−×÷]{2}/.test(input);
        this.expressionValid = parenBalance === 0 && !endsWithOp && !hasDoubleOp;
        this.updateEnterButton();

        if (parenBalance > 0 && this.secondIndicator) {
            this.secondIndicator.textContent = this.secondFunction ? '2ND' : `(×${parenBalance}`;
        } else if (!this.secondFunction && this.secondIndicator) {
            this.secondIndicator.textContent = '';
        }
    }

    updateEnterButton() {
        if (this.enterBtn) {
            this.enterBtn.style.opacity = this.expressionValid || this.waitingForOperand || !this.currentInput ? '1' : '0.6';
        }
    }

    combination(n, r) {
        n = Math.round(n); r = Math.round(r);
        if (n < r || n < 0 || r < 0) return NaN;
        return this.factorial(n) / (this.factorial(r) * this.factorial(n - r));
    }

    permutation(n, r) {
        n = Math.round(n); r = Math.round(r);
        if (n < r || n < 0 || r < 0) return NaN;
        return this.factorial(n) / this.factorial(n - r);
    }

    safeEval(expression) {
        // Strip allowed tokens for safety check
        const stripped = expression
            .replace(/Math\.(pow|sqrt|PI|E|sin|cos|tan|log|log10|exp|abs|asin|acos|atan|sinh|cosh|tanh|asinh|acosh|atanh)/g, '')
            .replace(/\b(atanh|asinh|acosh|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|abs|sqrt|e)\b/g, '')
            .replace(/\s/g, '');
        if (/[a-df-oq-zA-DF-OQ-Z_$]/.test(stripped)) throw new Error('Invalid');

        const isDeg = this.angleMode === 'DEG';
        try {
            return new Function('isDeg', `
                const _r = isDeg ? Math.PI/180 : 1;
                const _d = isDeg ? 180/Math.PI : 1;
                const sin = (v) => Math.sin(v * _r);
                const cos = (v) => Math.cos(v * _r);
                const tan = (v) => Math.tan(v * _r);
                const asin = (v) => Math.asin(v) * _d;
                const acos = (v) => Math.acos(v) * _d;
                const atan = (v) => Math.atan(v) * _d;
                const sinh = (v) => Math.sinh(v);
                const cosh = (v) => Math.cosh(v);
                const tanh = (v) => Math.tanh(v);
                const asinh = (v) => Math.asinh(v);
                const acosh = (v) => Math.acosh(v);
                const atanh = (v) => Math.atanh(v);
                const log = (v) => Math.log10(v);
                const ln = (v) => Math.log(v);
                const abs = (v) => Math.abs(v);
                const sqrt = (v) => Math.sqrt(v);
                const e = Math.E;
                return ${expression};
            `)(isDeg);
        } catch (err) {
            throw new Error('Invalid');
        }
    }

    // ==================== MATHPRINT RENDERING ====================

    renderMathPrint(text) {
        if (!text) return '';
        let html = this.escapeHtml(text);
        // Function name styling
        html = html.replace(/\b(atanh|asinh|acosh|asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|abs)\(/g,
            '<span class="mp-fn">$1</span>(');
        html = html.replace(/Ans/g, '<span class="mp-ans">Ans</span>');
        html = html.replace(/(\d+)▸n\/d◂(\d+)/g, '<span class="mp-frac"><span class="mp-num">$1</span><span class="mp-den">$2</span></span>');
        html = html.replace(/(\d+)▸n\/d◂/g, '<span class="mp-frac"><span class="mp-num">$1</span><span class="mp-den">_</span></span>');
        html = html.replace(/▸n\/d◂(\d+)/g, '<span class="mp-frac"><span class="mp-num">_</span><span class="mp-den">$1</span></span>');
        html = html.replace(/▸n\/d◂/g, '<span class="mp-frac"><span class="mp-num">_</span><span class="mp-den">_</span></span>');
        html = html.replace(/(\d+(?:\.\d+)?)\^(\d+(?:\.\d+)?)/g, '$1<span class="mp-sup">$2</span>');
        html = html.replace(/(\d+(?:\.\d+)?)\^/g, '$1<span class="mp-sup">_</span>');
        html = html.replace(/√\(([^)]+)\)/g, '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$1</span></span>');
        html = html.replace(/√(\d+\.?\d*)/g, '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$1</span></span>');
        html = html.replace(/(\d+)ⁿ√\(([^)]+)\)/g, '<span class="mp-nthroot"><span class="mp-index">$1</span><span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$2</span></span></span>');
        html = html.replace(/(\d+)ⁿ√(\d+\.?\d*)/g, '<span class="mp-nthroot"><span class="mp-index">$1</span><span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">$2</span></span></span>');
        html = html.replace(/ⁿ√/g, '<span class="mp-sqrt"><span class="mp-radical">√</span><span class="mp-radicand">_</span></span>');
        return html;
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return text.replace(/[&<>"]/g, c => map[c]);
    }

    // ==================== DISPLAY ====================

    renderHistory() {
        if (!this.historyDisplay) return;
        const recent = this.history.slice(-2);
        this.historyDisplay.innerHTML = recent.map(entry =>
            `<div class="history-entry"><div class="history-input">${this.escapeHtml(entry.input)}</div><div class="history-result">${this.formatNumber(entry.result)}</div></div>`
        ).join('');
    }

    formatNumber(num) {
        if (typeof num !== 'number' || isNaN(num)) return 'ERROR';
        if (Math.abs(num) < 1e-10 && num !== 0) return num.toExponential(6);
        if (Math.abs(num) > 9999999999) return num.toExponential(6);
        const rounded = Math.round(num * 1e10) / 1e10;
        const str = rounded.toString();
        if (str.replace(/[.\-]/g, '').length > 10) return num.toPrecision(10);
        return str;
    }

    showError(type) {
        const messages = { 'SYNTAX': 'SYNTAX ERROR', 'DOMAIN': 'DOMAIN ERROR', 'DIVIDE BY 0': 'DIVIDE BY 0', 'OVERFLOW': 'OVERFLOW', 'ARGUMENT': 'ARGUMENT ERROR' };
        this.resultLine.textContent = messages[type] || type;
        this.resultLine.classList.add('error');
        setTimeout(() => {
            this.resultLine.classList.remove('error');
            this.resultLine.textContent = '0';
            this.currentInput = ''; this.cursorPos = 0;
            this.waitingForOperand = false;
            this.updateDisplay();
        }, 2000);
    }

    showMessage(message) {
        this.inputLine.textContent = message;
        this.inputLine.classList.remove('mathprint');
        setTimeout(() => {
            if (!this.dataEntryMode && !this.statVarMode && !this.tableMode && !this.stoMode && !this.rclMode) {
                this.inputLine.classList.add('mathprint');
                this.updateDisplay();
            }
        }, 1500);
    }

    updateDisplay() {
        if (this.stoMode || this.rclMode) return;
        if (this.tableMode) return;

        if (this.currentInput) {
            const cursorAtEnd = this.cursorPos >= this.currentInput.length;
            if (cursorAtEnd) {
                this.inputLine.innerHTML = this.renderMathPrint(this.currentInput) + '<span class="cursor"></span>';
            } else {
                const left = this.currentInput.slice(0, this.cursorPos);
                const right = this.currentInput.slice(this.cursorPos);
                this.inputLine.innerHTML = this.escapeHtml(left) + '<span class="cursor"></span>' + this.escapeHtml(right);
            }
            this.inputLine.classList.add('mathprint');
        } else {
            this.inputLine.innerHTML = this.waitingForOperand ? '' : '<span class="cursor"></span>';
            this.inputLine.classList.add('mathprint');
        }
        if (!this.waitingForOperand && !this.currentInput) {
            this.resultLine.textContent = '0';
        }
        this.validateExpression();
    }

    clear() {
        this.currentInput = ''; this.cursorPos = 0;
        this.waitingForOperand = false; this.dataEntryMode = false;
        this.currentDataVar = 'x'; this.menuMode = null;
        this.statVarMode = false; this.stoMode = false; this.rclMode = false;
        this.resultLine.textContent = '0';
        this.resultLine.classList.remove('error');
        this.updateDisplay();
    }

    reset() {
        this.currentInput = ''; this.cursorPos = 0;
        this.result = 0; this.lastResult = 0; this.memory = 0; this.ans = 0;
        this.waitingForOperand = false; this.secondFunction = false;
        this.hypMode = false; this.fractionMode = false;
        this.statMode = null; this.statData = { x: [], y: [] };
        this.dataEntryMode = false; this.currentDataVar = 'x';
        this.menuMode = null; this.statVarMode = false;
        this.stoMode = false; this.rclMode = false;
        this.history = []; this.historyIndex = -1;
        this.tableMode = null;
        for (let i = 1; i <= 7; i++) this.memoryRegisters['x' + i] = 0;
        this.memoryIndicator.textContent = '';
        this.hypIndicator.textContent = '';
        this.angleModeDisplay.textContent = 'DEG'; this.angleMode = 'DEG';
        this.resultLine.textContent = '0';
        this.resultLine.classList.remove('error');
        if (this.historyDisplay) this.historyDisplay.innerHTML = '';
        if (this.secondIndicator) this.secondIndicator.textContent = '';
        this.updateDisplay();
        this.updateSecondFunctionIndicator();
    }

    updateSecondFunctionIndicator() {
        const btn2nd = this.floatingCalc.querySelector('[data-action="2nd"]');
        if (btn2nd) {
            btn2nd.style.background = this.secondFunction
                ? 'linear-gradient(145deg, #f39c12, #e67e22)'
                : 'linear-gradient(145deg, #3d566e, #2c3e50)';
        }
        if (this.secondIndicator) {
            this.secondIndicator.textContent = this.secondFunction ? '2ND' : '';
        }
    }

    // ==================== COPY/PASTE ====================

    createCopyToast() {
        if (!this.floatingCalc) return;
        this.copyToast = document.createElement('div');
        this.copyToast.className = 'copy-toast';
        this.copyToast.textContent = 'Copied!';
        this.floatingCalc.appendChild(this.copyToast);
    }

    setupCopyPaste() {
        if (!this.resultLine) return;
        this.resultLine.style.cursor = 'pointer';
        this.resultLine.title = 'Click to copy result';

        // Add visible copy button inside result line
        const copyBtn = document.createElement('button');
        copyBtn.className = 'calc-copy-btn';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.title = 'Copy result';
        this.resultLine.style.position = 'relative';
        this.resultLine.appendChild(copyBtn);

        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyResult();
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            }, 1200);
        });

        this.resultLine.addEventListener('click', () => this.copyResult());

        document.addEventListener('paste', (e) => {
            if (this.floatingCalc.style.display === 'none') return;
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (text) { this.handlePaste(text); e.preventDefault(); }
        });
    }

    copyResult() {
        const text = this.resultLine.textContent;
        if (!text || text === '0' || text.includes('ERROR')) return;
        navigator.clipboard.writeText(text).then(() => this.showCopyToast()).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            this.showCopyToast();
        });
    }

    showCopyToast() {
        if (!this.copyToast) return;
        this.copyToast.classList.add('visible');
        clearTimeout(this._copyToastTimeout);
        this._copyToastTimeout = setTimeout(() => this.copyToast.classList.remove('visible'), 1200);
    }

    handlePaste(text) {
        const cleaned = text.replace(/[^0-9a-z+\-*/().^πeE,√]/gi, '')
            .replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
        if (!cleaned) return;
        if (this.waitingForOperand) { this.currentInput = ''; this.cursorPos = 0; this.waitingForOperand = false; }
        this.insertAtCursor(cleaned);
        this.updateDisplay();
    }

    // ==================== MOBILE TOUCH ====================

    setupMobileTouch() {
        if (!this.floatingCalc) return;
        this.floatingCalc.style.touchAction = 'manipulation';
        this.floatingCalc.style.userSelect = 'none';
        this.floatingCalc.style.webkitUserSelect = 'none';

        this.floatingCalc.querySelectorAll('.calc-btn').forEach(btn => {
            btn.style.touchAction = 'manipulation';
            btn.addEventListener('touchstart', () => {
                if (navigator.vibrate) navigator.vibrate(10);
            }, { passive: true });
        });
    }

    // ==================== BUTTON RIPPLE EFFECT ====================

    setupRippleEffect() {
        if (!this.floatingCalc) return;
        this.floatingCalc.querySelectorAll('.calc-btn').forEach(btn => {
            btn.addEventListener('pointerdown', (e) => {
                const ripple = document.createElement('span');
                ripple.className = 'btn-ripple';
                const rect = btn.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
                ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
                btn.appendChild(ripple);
                ripple.addEventListener('animationend', () => ripple.remove());
            });
        });
    }

    // ==================== RESIZE CONTROLS ====================

    setupResizeControls() {
        if (!this.floatingCalc) return;
        const sizeUp = document.getElementById('calc-size-up');
        const sizeDown = document.getElementById('calc-size-down');
        const sizeReset = document.getElementById('calc-size-reset');

        if (sizeUp) sizeUp.addEventListener('click', (e) => { e.stopPropagation(); this.resizeCalc(this.scaleStep); });
        if (sizeDown) sizeDown.addEventListener('click', (e) => { e.stopPropagation(); this.resizeCalc(-this.scaleStep); });
        if (sizeReset) sizeReset.addEventListener('click', (e) => { e.stopPropagation(); this.resizeCalc(0); });
    }

    resizeCalc(delta) {
        if (this._isMobile()) return;
        if (delta === 0) {
            this.calcScale = 1.0;
        } else {
            this.calcScale = Math.max(this.minScale, Math.min(this.maxScale, this.calcScale + delta));
        }
        this.applyScale();
    }

    applyScale() {
        if (!this.floatingCalc) return;
        // Preserve any existing translate from drag, replace only the scale
        const currentTransform = this.floatingCalc.style.transform || '';
        // Strip existing scale() if any
        const withoutScale = currentTransform.replace(/\s*scale\([^)]*\)/g, '').trim();
        if (this.calcScale === 1.0) {
            this.floatingCalc.style.transform = withoutScale || '';
        } else {
            this.floatingCalc.style.transform = (withoutScale ? withoutScale + ' ' : '') + `scale(${this.calcScale})`;
        }
    }

    // ==================== HISTORY DRAWER ====================

    setupHistoryDrawer() {
        if (!this.floatingCalc) return;
        const body = this.floatingCalc.querySelector('.calculator-body');
        if (!body) return;

        // Create toggle button
        const toggle = document.createElement('button');
        toggle.className = 'calc-history-toggle';
        toggle.innerHTML = '<i class="fas fa-chevron-down"></i> History';
        toggle.title = 'Show calculation history';

        // Create drawer
        const drawer = document.createElement('div');
        drawer.className = 'calc-history-drawer';
        drawer.innerHTML = '<div class="calc-history-drawer-inner"></div>';

        // Insert after display container
        const displayContainer = body.querySelector('.display-container');
        if (displayContainer) {
            displayContainer.after(toggle, drawer);
        }

        this._historyDrawer = drawer;
        this._historyToggle = toggle;

        toggle.addEventListener('click', () => {
            const isOpen = drawer.classList.toggle('open');
            toggle.classList.toggle('open', isOpen);
            toggle.innerHTML = isOpen
                ? '<i class="fas fa-chevron-up"></i> History'
                : '<i class="fas fa-chevron-down"></i> History';
        });
    }

    updateHistoryDrawer() {
        if (!this._historyDrawer) return;
        const inner = this._historyDrawer.querySelector('.calc-history-drawer-inner');
        if (!inner) return;

        if (this.fullHistory.length === 0) {
            inner.innerHTML = '<div style="text-align:center;color:#999;padding:12px;font-size:11px;">No calculations yet</div>';
            return;
        }

        inner.innerHTML = this.fullHistory.slice(0, 20).map(entry => `
            <div class="calc-history-item" data-expr="${this.escapeHtml(entry.input)}" title="Click to reuse this expression">
                <span class="hist-expr">${this.escapeHtml(entry.input)}</span>
                <span class="hist-result">= ${this.escapeHtml(entry.result)}</span>
            </div>
        `).join('');

        // Click to reuse
        inner.querySelectorAll('.calc-history-item').forEach(item => {
            item.addEventListener('click', () => {
                const expr = item.dataset.expr;
                if (expr) {
                    this.currentInput = expr;
                    this.cursorPos = expr.length;
                    this.waitingForOperand = false;
                    this.updateDisplay();
                }
            });
        });
    }

    // ==================== SEND TO CHAT ====================

    setupSendToChat() {
        if (!this.floatingCalc) return;
        const body = this.floatingCalc.querySelector('.calculator-body');
        if (!body) return;

        const btn = document.createElement('button');
        btn.className = 'calc-send-to-chat';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Result to Chat';
        btn.title = 'Insert the current result into the chat input';
        body.appendChild(btn);

        btn.addEventListener('click', () => {
            const text = this.resultLine?.textContent;
            if (!text || text === '0' || text.includes('ERROR')) return;

            const chatInput = document.getElementById('user-input');
            if (chatInput) {
                // Append result to chat input
                const existing = chatInput.textContent.trim();
                chatInput.textContent = existing ? existing + ' ' + text : text;
                chatInput.focus();
                // Place cursor at end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(chatInput);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
            // Brief visual confirmation
            btn.innerHTML = '<i class="fas fa-check"></i> Sent!';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Result to Chat';
            }, 1200);
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.floatingCalc = new FloatingCalculator();
});

;
/* --- /js/floating-screener.js --- */
/**
 * FLOATING CAT SCREENER MODULE
 *
 * A draggable, resizable floating module for the adaptive placement test.
 * Moves the screener out of chat and into a dedicated UI component.
 */

class FloatingScreener {
  constructor() {
    this.container = document.getElementById('floating-screener');
    this.dragHandle = document.getElementById('screener-drag-handle');
    this.closeBtn = document.getElementById('close-screener-btn');
    this.sidebarBtn = document.getElementById('sidebar-starting-point-btn');

    // Screens
    this.instructionScreen = document.getElementById('screener-instruction-screen');
    this.questionScreen = document.getElementById('screener-question-screen');
    this.loadingScreen = document.getElementById('screener-loading-screen');
    this.resultsScreen = document.getElementById('screener-results-screen');

    // State
    this.isOpen = false;
    this.sessionId = null;
    this.currentProblem = null;
    this.selectedAnswer = null;
    this.submitting = false;
    this.textSize = 'medium'; // small, medium, large, xlarge

    // Drag state
    this.isDragging = false;
    this.currentX = 0;
    this.currentY = 0;
    this.initialX = 0;
    this.initialY = 0;
    this.xOffset = 0;
    this.yOffset = 0;

    // Assessment completed state
    this.assessmentCompleted = false;

    this.init();
  }

  init() {
    if (!this.container) {
      console.warn('[FloatingScreener] Container not found, skipping init');
      return;
    }

    this.setupEventListeners();
    this.checkAssessmentStatus();

    console.log('[FloatingScreener] Initialized');
  }

  setupEventListeners() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Sidebar button
    if (this.sidebarBtn) {
      this.sidebarBtn.addEventListener('click', () => this.open());
    }

    // Drag functionality
    if (this.dragHandle) {
      this.dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
      this.dragHandle.addEventListener('touchstart', (e) => this.dragStart(e));
    }

    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('touchmove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.dragEnd());
    document.addEventListener('touchend', () => this.dragEnd());

    // Text size controls
    const textSmaller = document.getElementById('screener-text-smaller');
    const textLarger = document.getElementById('screener-text-larger');

    if (textSmaller) {
      textSmaller.addEventListener('click', () => this.changeTextSize(-1));
    }
    if (textLarger) {
      textLarger.addEventListener('click', () => this.changeTextSize(1));
    }

    // Instruction screen buttons
    const startBtn = document.getElementById('screener-start-btn');
    const waitBtn = document.getElementById('screener-wait-btn');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startAssessment());
    }
    if (waitBtn) {
      waitBtn.addEventListener('click', () => this.close());
    }

    // Submit answer button
    const submitBtn = document.getElementById('screener-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer());
    }

    // Skip skill button
    const skipBtn = document.getElementById('screener-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion());
    }

    // Results continue button
    const continueBtn = document.getElementById('screener-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.finishAssessment());
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      // Escape to close
      if (e.key === 'Escape') {
        this.close();
        return;
      }

      // Only handle shortcuts on question screen
      if (!this.questionScreen?.classList.contains('active')) return;
      if (this.submitting) return;

      // A-F to select MC option (auto-submits via selectOption)
      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E', 'F'].includes(key)) {
        const option = document.querySelector(`.mc-option[data-value="${key}"]`);
        if (option) {
          this.selectOption(option);
          e.preventDefault();
        }
      }
    });
  }

  async checkAssessmentStatus() {
    try {
      const response = await window.csrfFetch('/api/screener/status', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.assessmentCompleted = data.assessmentCompleted;
        this.startingPointOffered = data.startingPointOffered;
        this.assessmentExpired = data.assessmentExpired;
        this.growthCheckDue = data.growthCheckDue;
        this.currentGradeLevel = data.currentGradeLevel;
        this.updateSidebarButton();
      }
    } catch (error) {
      console.warn('[FloatingScreener] Could not check assessment status:', error);
    }
  }

  updateSidebarButton() {
    if (!this.sidebarBtn) return;

    // Reset classes
    this.sidebarBtn.classList.remove('needs-attention', 'completed', 'growth-due', 'expired');

    if (!this.assessmentCompleted || this.assessmentExpired) {
      // Needs initial assessment (or assessment expired - annual renewal)
      this.sidebarBtn.style.display = '';
      this.sidebarBtn.classList.add('needs-attention');
      this.sidebarBtn.title = this.assessmentExpired
        ? 'Starting Point - Annual renewal due'
        : 'Starting Point - Find your level';

      // Update button text
      const spanEl = this.sidebarBtn.querySelector('span');
      if (spanEl) {
        spanEl.textContent = 'Starting Point';
      }

      // The Tools section is collapsed by default, which hides this button.
      // The greeting tells new students to use the Starting Point button "in
      // the sidebar", so make sure it's actually visible there.
      this.revealInSidebar();
    } else if (this.growthCheckDue) {
      // Growth check is available (every 3 months)
      this.sidebarBtn.style.display = '';
      this.sidebarBtn.classList.add('growth-due');
      this.sidebarBtn.title = `Growth Check available - See how you've grown! (Current: ${this.currentGradeLevel || 'Unknown'})`;

      // Update button text
      const spanEl = this.sidebarBtn.querySelector('span');
      if (spanEl) {
        spanEl.textContent = 'Growth Check';
      }

      this.revealInSidebar();
    } else {
      // Assessment completed, not expired, growth check not due - hide the button
      this.sidebarBtn.style.display = 'none';
    }
  }

  // Make sure the sidebar's collapsible "Tools" section is open so the
  // Starting Point / Growth Check button is actually visible. Prefer the
  // Sidebar instance (keeps its internal state in sync); fall back to toggling
  // the DOM classes directly in case the sidebar isn't ready yet.
  revealInSidebar() {
    if (window.sidebar && typeof window.sidebar.expandTools === 'function') {
      window.sidebar.expandTools();
      return;
    }

    const toolsContent = document.getElementById('sidebar-tools');
    const toolsToggle = document.querySelector('.tools-toggle');
    if (toolsContent) toolsContent.classList.add('expanded');
    if (toolsToggle) toolsToggle.classList.add('expanded');
  }

  open() {
    // Determine what mode we're in
    if (this.growthCheckDue) {
      // Growth Check mode (quarterly)
      this.isGrowthCheck = true;
      this.showInstructions('growth-check');
    } else if (!this.assessmentCompleted || this.assessmentExpired) {
      // New assessment (first time) or expired (annual renewal)
      this.isGrowthCheck = false;
      this.showInstructions('starting-point');
    } else {
      // Assessment completed, not expired, no growth check due — block access
      return;
    }

    this.container.classList.add('active');
    this.isOpen = true;
    this.centerModule();
  }

  close() {
    this.container.classList.remove('active');
    this.isOpen = false;
    this.sessionId = null;
    this.currentProblem = null;
    this.selectedAnswer = null;
    this.submitting = false;
  }

  centerModule() {
    // On mobile, no transform needed (full-screen)
    if (window.innerWidth <= 768) {
      this.container.style.transform = 'none';
    } else {
      this.container.style.transform = 'translate(-50%, -50%)';
    }
    this.xOffset = 0;
    this.yOffset = 0;
  }

  // Drag functionality
  dragStart(e) {
    // Disable drag on mobile (full-screen mode)
    if (window.innerWidth <= 768) return;

    if (e.type === 'touchstart') {
      this.initialX = e.touches[0].clientX - this.xOffset;
      this.initialY = e.touches[0].clientY - this.yOffset;
    } else {
      this.initialX = e.clientX - this.xOffset;
      this.initialY = e.clientY - this.yOffset;
    }

    if (e.target === this.dragHandle || this.dragHandle.contains(e.target)) {
      this.isDragging = true;
    }
  }

  drag(e) {
    if (!this.isDragging) return;

    e.preventDefault();

    if (e.type === 'touchmove') {
      this.currentX = e.touches[0].clientX - this.initialX;
      this.currentY = e.touches[0].clientY - this.initialY;
    } else {
      this.currentX = e.clientX - this.initialX;
      this.currentY = e.clientY - this.initialY;
    }

    this.xOffset = this.currentX;
    this.yOffset = this.currentY;

    this.container.style.transform = `translate(calc(-50% + ${this.currentX}px), calc(-50% + ${this.currentY}px))`;
  }

  dragEnd() {
    this.isDragging = false;
  }

  // Text size
  changeTextSize(direction) {
    const sizes = ['small', 'medium', 'large', 'xlarge'];
    const currentIndex = sizes.indexOf(this.textSize);
    const newIndex = Math.max(0, Math.min(sizes.length - 1, currentIndex + direction));

    this.textSize = sizes[newIndex];

    const body = document.getElementById('screener-body');
    if (body) {
      body.className = 'screener-body text-size-' + this.textSize;
    }

    // Update button states
    document.getElementById('screener-text-smaller')?.classList.toggle('disabled', newIndex === 0);
    document.getElementById('screener-text-larger')?.classList.toggle('disabled', newIndex === sizes.length - 1);
  }

  // Screen management
  showScreen(screenName) {
    // Hide all screens
    [this.instructionScreen, this.questionScreen, this.loadingScreen, this.resultsScreen].forEach(screen => {
      if (screen) screen.classList.remove('active');
    });

    // Show requested screen
    switch (screenName) {
      case 'instruction':
        if (this.instructionScreen) this.instructionScreen.classList.add('active');
        break;
      case 'question':
        if (this.questionScreen) this.questionScreen.classList.add('active');
        break;
      case 'loading':
        if (this.loadingScreen) this.loadingScreen.classList.add('active');
        break;
      case 'results':
        if (this.resultsScreen) this.resultsScreen.classList.add('active');
        break;
    }
  }

  showInstructions(mode = 'starting-point') {
    this.showScreen('instruction');

    // Update instruction screen content based on mode
    const titleEl = document.querySelector('#screener-instruction-screen h2');
    const subtitleEl = document.querySelector('#screener-instruction-screen .subtitle');
    const whatIsEl = document.querySelector('#screener-instruction-screen .instruction-card h3');
    const descriptionEl = document.querySelector('#screener-instruction-screen .instruction-card p');
    const durationEl = document.querySelector('#screener-instruction-screen .duration span');
    const headerTitleEl = document.querySelector('.screener-title');

    if (mode === 'growth-check') {
      // Growth Check mode - shorter, focused assessment
      if (titleEl) titleEl.textContent = 'Growth Check';
      if (subtitleEl) subtitleEl.textContent = `Let's see how much you've grown since ${this.currentGradeLevel || 'your last assessment'}!`;
      if (whatIsEl) whatIsEl.innerHTML = '<i class="fas fa-chart-line"></i> What is this?';
      if (descriptionEl) descriptionEl.innerHTML = `This is a shorter assessment to measure your progress. We'll focus on skills you've been working on recently. <strong>There's no penalty for wrong answers</strong> - we just want to see how you've grown!`;
      if (durationEl) durationEl.innerHTML = '<strong>Time:</strong> Usually 5-15 minutes';
      if (headerTitleEl) headerTitleEl.innerHTML = '<i class="fas fa-chart-line"></i> Growth Check';
    } else {
      // Starting Point mode - full initial assessment
      if (titleEl) titleEl.textContent = 'Find Your Starting Point';
      if (subtitleEl) subtitleEl.textContent = "Let's figure out where you are, so we can help you get where you're going.";
      if (whatIsEl) whatIsEl.innerHTML = '<i class="fas fa-info-circle"></i> What is this?';
      if (descriptionEl) descriptionEl.innerHTML = `This short assessment helps us understand your current math level. It's <strong>not a test you can fail</strong> - we're just finding the best place to start your learning journey.`;
      if (durationEl) durationEl.innerHTML = '<strong>Time:</strong> Usually 10-30 minutes, depending on your level';
      if (headerTitleEl) headerTitleEl.innerHTML = '<i class="fas fa-crosshairs"></i> Starting Point';
    }
  }

  showLoading(message = 'Loading...') {
    const loadingText = document.getElementById('screener-loading-text');
    if (loadingText) {
      loadingText.textContent = message;
    }
    this.showScreen('loading');
  }

  // Utility: wait for a duration
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Flash the question card border green for correct answers
  flashCard(type) {
    return new Promise(resolve => {
      const card = document.querySelector('.question-card');
      if (!card) { resolve(); return; }

      card.classList.add(`flash-${type}`);
      setTimeout(() => {
        card.classList.remove(`flash-${type}`);
        resolve();
      }, 400);
    });
  }

  // Fetch next problem without showing a loading screen
  async fetchNextProblem() {
    const response = await window.csrfFetch(`/api/screener/next-problem?sessionId=${this.sessionId}`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get problem');
    }

    return data;
  }

  // Update progress bar from submit-answer response
  updateProgressBar(progress) {
    if (!progress) return;

    const fill = document.getElementById('screener-progress-fill');
    if (fill) {
      fill.style.width = `${progress.percentComplete || 0}%`;
    }
  }

  // Lock/unlock answer controls during submit
  setControlsLocked(locked) {
    const submitBtn = document.getElementById('screener-submit-btn');
    const skipBtn = document.getElementById('screener-skip-btn');
    if (submitBtn) submitBtn.disabled = locked;
    if (skipBtn) skipBtn.disabled = locked;

    // Disable MC option clicks
    document.querySelectorAll('.mc-option').forEach(opt => {
      opt.style.pointerEvents = locked ? 'none' : '';
    });
  }

  // Assessment flow
  async startAssessment() {
    this.showLoading(this.isGrowthCheck ? 'Starting growth check...' : 'Starting assessment...');

    try {
      const response = await window.csrfFetch('/api/screener/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          restart: this.assessmentCompleted && !this.isGrowthCheck,
          isGrowthCheck: this.isGrowthCheck
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.alreadyCompleted) {
          alert('You have already completed your assessment. Your results are saved.');
          this.close();
          return;
        }
        throw new Error(data.error || 'Failed to start assessment');
      }

      this.sessionId = data.sessionId;
      console.log('[FloatingScreener] Assessment started, sessionId:', this.sessionId);

      // Get first problem (loading spinner is already visible)
      const nextData = await this.fetchNextProblem();
      this.currentProblem = nextData.problem;
      this.selectedAnswer = null;
      this.renderProblem(nextData.problem);
      this.showScreen('question');

    } catch (error) {
      console.error('[FloatingScreener] Error starting assessment:', error);
      alert('Failed to start assessment. Please try again.');
      this.showInstructions();
    }
  }

  renderProblem(problem) {
    // Question number
    const questionNum = document.getElementById('screener-question-num');
    if (questionNum) {
      questionNum.textContent = `Question ${problem.questionNumber}`;
    }

    // Question content — render through the full markdown+KaTeX pipeline
    const questionContent = document.getElementById('screener-question-content');
    if (questionContent) {
      const formatted = this.formatProblemContent(problem.content);
      questionContent.innerHTML = window.renderMarkdownMath
        ? window.renderMarkdownMath(formatted)
        : formatted;
    }

    // Render options for MC questions
    const optionsContainer = document.getElementById('screener-options-container');
    if (optionsContainer && problem.answerType === 'multiple-choice' && problem.options) {
      const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
      optionsContainer.innerHTML = problem.options.map((option, index) => {
        // Handle both {label, text} format and plain string options
        const label = option.label || labels[index] || String.fromCharCode(65 + index);
        const text = option.text || option || '';
        return `
          <div class="mc-option" data-value="${label}" data-index="${index}">
            <span class="mc-option-label">${label}</span>
            <span class="mc-option-text">${this.formatOptionText(text)}</span>
          </div>
        `;
      }).join('');

      // Render math in option text through the full KaTeX pipeline
      if (window.renderMarkdownMath) {
        optionsContainer.querySelectorAll('.mc-option-text').forEach(span => {
          span.innerHTML = window.renderMarkdownMath(span.textContent);
        });
      }

      // Add click handlers
      optionsContainer.querySelectorAll('.mc-option').forEach(option => {
        option.addEventListener('click', () => this.selectOption(option));
      });

      optionsContainer.style.display = 'flex';

      // Hide submit button for MC — tap to answer
      const submitBtn = document.getElementById('screener-submit-btn');
      if (submitBtn) submitBtn.style.display = 'none';
    } else if (optionsContainer) {
      // Fallback for non-MC — show text input with submit button
      optionsContainer.innerHTML = `
        <input type="text" id="screener-answer-input" class="form-input" placeholder="Type your answer..." />
      `;
      optionsContainer.style.display = 'block';

      const submitBtn = document.getElementById('screener-submit-btn');
      if (submitBtn) {
        submitBtn.style.display = '';
        submitBtn.disabled = true;
      }

      // Enable submit when they type something
      const input = document.getElementById('screener-answer-input');
      if (input) {
        input.addEventListener('input', () => this.updateSubmitButton());
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            this.selectedAnswer = input.value.trim();
            this.submitAnswer();
          }
        });
      }
    }

    // Fallback: catch any remaining raw \( \) in text nodes
    if (window.renderMathInElement) {
      if (questionContent) window.renderMathInElement(questionContent);
      if (optionsContainer) window.renderMathInElement(optionsContainer);
    }
  }

  formatProblemContent(content) {
    if (!content) return '';

    // Escape HTML but preserve LaTeX
    let formatted = content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown-style bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Auto-wrap math expressions in LaTeX delimiters if not already wrapped
    // This handles content like "2^3 × 2^1" that should render as math
    if (!formatted.includes('\\(') && !formatted.includes('$')) {
      // Detect if content has math-like patterns
      const hasMathPatterns = /[\^_]|\d+\/\d+|×|÷|√|∑|∫|π|θ/.test(formatted);

      if (hasMathPatterns) {
        // Wrap the math portion in LaTeX delimiters
        // Replace common patterns with LaTeX equivalents
        formatted = formatted
          // Wrap expressions with exponents: 2^3, 3^x, x^2, 5x^2
          .replace(/(\w+)\^(\w+)/g, '\\($1^{$2}\\)')
          // Handle multiplication symbol
          .replace(/×/g, '\\times ')
          // Handle division symbol
          .replace(/÷/g, '\\div ')
          // Handle fractions like 1/2 (but not dates like 1/15)
          .replace(/(\d+)\/(\d+)(?!\d)/g, '\\(\\frac{$1}{$2}\\)')
          // Square root
          .replace(/√(\d+)/g, '\\(\\sqrt{$1}\\)');
      }
    }

    return formatted;
  }

  formatOptionText(text) {
    if (!text) return '';
    let formatted = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Auto-wrap math expressions in LaTeX delimiters for options too
    if (!formatted.includes('\\(') && !formatted.includes('$')) {
      const hasMathPatterns = /[\^_]|\d+\/\d+|×|÷|√/.test(formatted);
      if (hasMathPatterns) {
        formatted = formatted
          .replace(/(\w+)\^(\w+)/g, '\\($1^{$2}\\)')
          .replace(/×/g, '\\(\\times\\)')
          .replace(/÷/g, '\\(\\div\\)')
          .replace(/(\d+)\/(\d+)(?!\d)/g, '\\(\\frac{$1}{$2}\\)')
          .replace(/√(\d+)/g, '\\(\\sqrt{$1}\\)');
      }
    }
    return formatted;
  }

  selectOption(optionElement) {
    if (this.submitting) return;

    // Remove selection from all options
    document.querySelectorAll('.mc-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    // Select this option
    optionElement.classList.add('selected');
    this.selectedAnswer = optionElement.dataset.value;

    // Auto-submit for MC — no extra click needed
    this.submitAnswer();
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('screener-submit-btn');
    if (!submitBtn) return;

    const hasAnswer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;
    submitBtn.disabled = !hasAnswer;
  }

  async submitAnswer() {
    const answer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;

    if (!answer || this.submitting) return;

    this.submitting = true;
    this.setControlsLocked(true);

    try {
      const response = await window.csrfFetch('/api/screener/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          problemId: this.currentProblem.problemId,
          answer: answer,
          responseTime: null
        })
      });

      if (!response.ok) {
        let errorMsg = 'Failed to submit answer';
        if (response.status === 429) {
          errorMsg = 'Too many requests. Please wait a moment and try again.';
        } else {
          try { const err = await response.json(); errorMsg = err.error || errorMsg; } catch {}
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      console.log('[FloatingScreener] Answer submitted:', data.correct ? 'correct' : 'miss');

      // Update progress bar
      this.updateProgressBar(data.progress);

      if (data.nextAction === 'continue') {
        // Start fetching next problem NOW (runs in parallel with flash)
        const nextProblemPromise = this.fetchNextProblem();

        // Green flash for correct, brief neutral pause for miss
        if (data.correct) {
          await this.flashCard('correct');
        } else {
          await this.wait(200);
        }

        // Render the prefetched problem (or wait if still loading)
        try {
          const nextData = await nextProblemPromise;
          this.currentProblem = nextData.problem;
          this.selectedAnswer = null;
          this.renderProblem(nextData.problem);
          this.showScreen('question');
        } catch (fetchError) {
          console.error('[FloatingScreener] Error prefetching next problem:', fetchError);
          alert('Failed to load next question. Please try again.');
          this.close();
        }

      } else if (data.nextAction === 'complete') {
        // Flash green for a correct final answer
        if (data.correct) {
          await this.flashCard('correct');
        }
        this.showResults(data);
      }

    } catch (error) {
      console.error('[FloatingScreener] Error submitting answer:', error);
      alert('Failed to submit answer. Please try again.');
      this.showScreen('question');
    } finally {
      this.submitting = false;
      this.setControlsLocked(false);
    }
  }

  async skipQuestion() {
    if (!this.currentProblem || this.submitting) return;

    this.submitting = true;
    this.setControlsLocked(true);

    try {
      const response = await window.csrfFetch('/api/screener/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          problemId: this.currentProblem.problemId,
          answer: '__SKIP__',
          skipped: true,
          responseTime: null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to skip question');
      }

      console.log('[FloatingScreener] Question skipped, action:', data.nextAction);

      // Update progress bar
      this.updateProgressBar(data.progress);

      if (data.nextAction === 'continue') {
        // Fetch next problem and transition immediately (no flash for skips)
        const nextData = await this.fetchNextProblem();
        this.currentProblem = nextData.problem;
        this.selectedAnswer = null;
        this.renderProblem(nextData.problem);
        this.showScreen('question');
      } else if (data.nextAction === 'complete') {
        this.showResults(data);
      }

    } catch (error) {
      console.error('[FloatingScreener] Error skipping question:', error);
      alert('Failed to skip question. Please try again.');
      this.showScreen('question');
    } finally {
      this.submitting = false;
      this.setControlsLocked(false);
    }
  }

  async showResults(data) {
    this.showScreen('results');

    // Update grade level display (like STAR testing)
    const gradeLevelEl = document.getElementById('screener-result-grade-level');
    const descriptionEl = document.getElementById('screener-result-description');

    if (gradeLevelEl && data.report?.gradeLevel) {
      gradeLevelEl.textContent = data.report.gradeLevel;
    }

    if (descriptionEl && data.report?.gradeLevelDescription) {
      descriptionEl.textContent = data.report.gradeLevelDescription;
    }

    // Update result stats
    const accuracyEl = document.getElementById('screener-result-accuracy');
    const questionsEl = document.getElementById('screener-result-questions');
    const durationEl = document.getElementById('screener-result-duration');

    if (accuracyEl && data.report?.accuracy !== undefined) {
      // Backend already returns accuracy as percentage (0-100), not decimal
      accuracyEl.textContent = `${Math.round(data.report.accuracy)}%`;
    }

    if (questionsEl && data.report?.questionsAnswered !== undefined) {
      questionsEl.textContent = data.report.questionsAnswered;
    }

    if (durationEl && data.report?.duration !== undefined) {
      // Duration is in milliseconds, convert to readable format
      const totalSeconds = Math.round(data.report.duration / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (minutes > 0) {
        durationEl.textContent = seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} min`;
      } else {
        durationEl.textContent = `${seconds} sec`;
      }
    }
  }

  async finishAssessment() {
    this.showLoading('Saving results...');

    try {
      const response = await window.csrfFetch('/api/screener/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete assessment');
      }

      console.log('[FloatingScreener] Assessment completed');

      // Update state
      this.assessmentCompleted = true;
      this.updateSidebarButton();

      // Close the module
      this.close();

      // Show celebration or notification
      if (window.showNotification) {
        window.showNotification('Starting Point complete! Your learning path has been personalized.', 'success');
      }

      // Trigger confetti if available
      if (window.confetti) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

    } catch (error) {
      console.error('[FloatingScreener] Error completing assessment:', error);
      alert('Failed to save results. Please try again.');
      this.showScreen('results');
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.floatingScreener = new FloatingScreener();
});

// Global function to open screener from chat or other places
window.openStartingPoint = function() {
  if (window.floatingScreener) {
    window.floatingScreener.open();
  }
};

console.log('[FloatingScreener] Module loaded');

;
/* --- /js/floating-checkpoint.js --- */
/**
 * FLOATING CHECKPOINT MODULE
 *
 * Card-based assessment UI for course checkpoints.
 * Presents problems one at a time, grades server-side, shows results.
 * Reuses the floating-screener visual pattern but with checkpoint-specific logic.
 */

class FloatingCheckpoint {
  constructor() {
    this.container = document.getElementById('floating-checkpoint');
    this.isOpen = false;
    this.submitting = false;
    this.currentProblem = null;
    this.moduleTitle = '';
    this.totalProblems = 0;
    this.passThreshold = 70;

    // Drag state
    this._dragging = false;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.setupEventListeners();
    this.setupDrag();
    console.log('[FloatingCheckpoint] Initialized');
  }

  setupEventListeners() {
    // Close button
    const closeBtn = this.container.querySelector('.checkpoint-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Collapse button
    const collapseBtn = this.container.querySelector('.checkpoint-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => this.toggleCollapse());
    }

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Submit button
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer());
    }

    // Skip button
    const skipBtn = document.getElementById('checkpoint-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion());
    }

    // Answer input — submit on Enter
    const answerInput = document.getElementById('checkpoint-answer-input');
    if (answerInput) {
      answerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitAnswer();
        }
      });
      answerInput.addEventListener('input', () => this.updateSubmitButton());
    }

    // Continue button (after results)
    const continueBtn = document.getElementById('checkpoint-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.finishCheckpoint());
    }

    // Start button
    const startBtn = document.getElementById('checkpoint-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.startCheckpoint());
    }
  }

  // ── Drag support ──
  setupDrag() {
    const header = this.container.querySelector('.checkpoint-header-bar');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      // Don't drag when clicking buttons
      if (e.target.closest('button')) return;
      this._startDrag(e.clientX, e.clientY);
    });

    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      const touch = e.touches[0];
      this._startDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('mousemove', (e) => this._onDrag(e.clientX, e.clientY));
    document.addEventListener('touchmove', (e) => {
      if (!this._dragging) return;
      const touch = e.touches[0];
      this._onDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('mouseup', () => this._endDrag());
    document.addEventListener('touchend', () => this._endDrag());
  }

  _startDrag(clientX, clientY) {
    this._dragging = true;
    const rect = this.container.getBoundingClientRect();
    this._dragOffsetX = clientX - rect.left;
    this._dragOffsetY = clientY - rect.top;
    // Switch from centered positioning to absolute positioning
    this.container.style.transform = 'none';
    this.container.style.left = rect.left + 'px';
    this.container.style.top = rect.top + 'px';
  }

  _onDrag(clientX, clientY) {
    if (!this._dragging) return;
    let newLeft = clientX - this._dragOffsetX;
    let newTop = clientY - this._dragOffsetY;
    // Keep within viewport
    const rect = this.container.getBoundingClientRect();
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
    this.container.style.left = newLeft + 'px';
    this.container.style.top = newTop + 'px';
  }

  _endDrag() {
    this._dragging = false;
  }

  // ── Collapse support ──
  toggleCollapse() {
    this.container.classList.toggle('collapsed');
    const btn = this.container.querySelector('.checkpoint-collapse-btn i');
    if (btn) {
      const isCollapsed = this.container.classList.contains('collapsed');
      btn.className = isCollapsed ? 'fas fa-plus' : 'fas fa-minus';
    }
  }

  async open(moduleInfo) {
    if (!this.container) return;
    this.container.classList.add('active');
    this.container.classList.remove('collapsed');
    this.isOpen = true;
    this.showScreen('instruction');

    // Reset position to center
    this.container.style.left = '50%';
    this.container.style.top = '50%';
    this.container.style.transform = 'translate(-50%, -50%)';

    // Reset collapse button icon
    const btn = this.container.querySelector('.checkpoint-collapse-btn i');
    if (btn) btn.className = 'fas fa-minus';

    // Pre-populate instruction screen with module info if available
    const titleEl = document.getElementById('checkpoint-module-title');
    if (titleEl && moduleInfo?.title) {
      titleEl.textContent = moduleInfo.title;
    }
  }

  close() {
    if (!this.container) return;
    this.container.classList.remove('active', 'collapsed');
    this.isOpen = false;
  }

  showScreen(screenName) {
    const screens = this.container.querySelectorAll('.checkpoint-screen');
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`checkpoint-${screenName}-screen`);
    if (target) target.classList.add('active');
  }

  showLoading(text) {
    const loadingText = document.getElementById('checkpoint-loading-text');
    if (loadingText) loadingText.textContent = text || 'Loading...';
    this.showScreen('loading');
  }

  async startCheckpoint() {
    this.showLoading('Loading checkpoint...');

    try {
      const response = await window.csrfFetch('/api/checkpoint/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start checkpoint');
      }

      const data = await response.json();
      this.moduleTitle = data.moduleTitle;
      this.totalProblems = data.totalProblems;
      this.passThreshold = data.passThreshold;

      if (data.problem) {
        this.currentProblem = data.problem;
        this.renderProblem(data.problem);
        this.showScreen('question');
      } else {
        throw new Error('No problems available');
      }
    } catch (err) {
      console.error('[FloatingCheckpoint] Start error:', err);
      alert('Failed to start checkpoint: ' + err.message);
      this.close();
    }
  }

  renderProblem(problem) {
    // Question number
    const numEl = document.getElementById('checkpoint-question-num');
    if (numEl) numEl.textContent = `Problem ${problem.questionNumber} of ${problem.totalQuestions}`;

    // Points
    const ptsEl = document.getElementById('checkpoint-question-pts');
    if (ptsEl) ptsEl.textContent = `${problem.points} pt${problem.points !== 1 ? 's' : ''}`;

    // Skill tag
    const skillEl = document.getElementById('checkpoint-question-skill');
    if (skillEl) {
      skillEl.textContent = (problem.skill || '').replace(/-/g, ' ');
    }

    // Question content
    const contentEl = document.getElementById('checkpoint-question-content');
    if (contentEl) {
      contentEl.innerHTML = this.formatMath(problem.question);
    }

    // Progress bar
    this.updateProgressBar(problem.questionNumber - 1, problem.totalQuestions);

    // Clear answer input
    const input = document.getElementById('checkpoint-answer-input');
    if (input) {
      input.value = '';
      input.focus();
    }

    // Clear feedback
    const feedbackEl = document.getElementById('checkpoint-feedback');
    if (feedbackEl) {
      feedbackEl.classList.remove('active', 'correct', 'incorrect');
      feedbackEl.textContent = '';
    }

    // Show submit, hide next
    this.toggleButtons('submit');

    this.updateSubmitButton();

    // Render KaTeX
    if (window.renderMathInElement) {
      requestAnimationFrame(() => {
        window.renderMathInElement(contentEl, {
          delimiters: [
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
        });
      });
    }
  }

  formatMath(text) {
    if (!text) return '';
    let formatted = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Handle multi-part problems: (a), (b), (c) on new lines
    formatted = formatted.replace(/\(([a-d])\)\s/g, '<br><strong>($1)</strong> ');

    return formatted;
  }

  updateProgressBar(current, total) {
    const fill = document.getElementById('checkpoint-progress-fill');
    if (fill) {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      fill.style.width = `${pct}%`;
    }
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    const input = document.getElementById('checkpoint-answer-input');
    if (submitBtn && input) {
      submitBtn.disabled = !input.value.trim();
    }
  }

  toggleButtons(mode) {
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    const skipBtn = document.getElementById('checkpoint-skip-btn');
    const nextBtn = document.getElementById('checkpoint-next-btn');
    const answerInput = document.getElementById('checkpoint-answer-input');

    if (mode === 'submit') {
      if (submitBtn) submitBtn.style.display = '';
      if (skipBtn) skipBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = 'none';
      if (answerInput) answerInput.disabled = false;
    } else if (mode === 'next') {
      if (submitBtn) submitBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = '';
      if (answerInput) answerInput.disabled = true;
    }
  }

  async submitAnswer() {
    const input = document.getElementById('checkpoint-answer-input');
    const answer = input?.value?.trim();
    if (!answer || this.submitting) return;

    this.submitting = true;
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const response = await window.csrfFetch('/api/checkpoint/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answer }),
      });

      if (!response.ok) throw new Error('Failed to submit');
      const data = await response.json();
      this.handleResult(data);
    } catch (err) {
      console.error('[FloatingCheckpoint] Submit error:', err);
      alert('Failed to submit answer. Please try again.');
    } finally {
      this.submitting = false;
    }
  }

  async skipQuestion() {
    if (this.submitting) return;
    this.submitting = true;

    try {
      const response = await window.csrfFetch('/api/checkpoint/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answer: '', skipped: true }),
      });

      if (!response.ok) throw new Error('Failed to skip');
      const data = await response.json();
      this.handleResult(data);
    } catch (err) {
      console.error('[FloatingCheckpoint] Skip error:', err);
    } finally {
      this.submitting = false;
    }
  }

  handleResult(data) {
    // Show feedback
    const feedbackEl = document.getElementById('checkpoint-feedback');
    if (feedbackEl) {
      feedbackEl.classList.add('active');
      if (data.correct) {
        feedbackEl.classList.add('correct');
        feedbackEl.classList.remove('incorrect');
        feedbackEl.innerHTML = '<i class="fas fa-check-circle"></i> Correct!';
      } else if (data.skipped) {
        feedbackEl.classList.add('incorrect');
        feedbackEl.classList.remove('correct');
        feedbackEl.innerHTML = '<i class="fas fa-forward"></i> Skipped';
      } else {
        feedbackEl.classList.add('incorrect');
        feedbackEl.classList.remove('correct');
        // Prefer LLM feedback (natural explanation), fall back to answer key
        const explanation = data.feedback
          ? `<div class="correct-answer-hint">${this.formatMath(data.feedback)}</div>`
          : data.correctAnswer
            ? `<div class="correct-answer-hint">${this.formatMath(data.correctAnswer)}</div>`
            : '';
        feedbackEl.innerHTML = `<i class="fas fa-times-circle"></i> Not quite.${explanation}`;

        // Render math in feedback
        if (window.renderMathInElement) {
          requestAnimationFrame(() => window.renderMathInElement(feedbackEl, {
            delimiters: [
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
            ],
            throwOnError: false,
          }));
        }
      }
    }

    // Update progress
    if (data.progress) {
      this.updateProgressBar(data.progress.answered, data.progress.total);
    }

    if (data.nextAction === 'complete') {
      // Show results after a brief pause
      setTimeout(() => this.showResultsScreen(data.summary), 1200);
    } else {
      // Show next button
      this.toggleButtons('next');
      const nextBtn = document.getElementById('checkpoint-next-btn');
      if (nextBtn) {
        nextBtn.onclick = () => {
          if (data.nextProblem) {
            this.currentProblem = data.nextProblem;
            this.renderProblem(data.nextProblem);
          }
        };
        nextBtn.focus();
      }
    }
  }

  showResultsScreen(summary) {
    this.showScreen('results');

    const scoreEl = document.getElementById('checkpoint-result-score');
    const statusEl = document.getElementById('checkpoint-result-status');
    const correctEl = document.getElementById('checkpoint-result-correct');
    const totalEl = document.getElementById('checkpoint-result-total');
    const durationEl = document.getElementById('checkpoint-result-duration');
    const breakdownEl = document.getElementById('checkpoint-skill-breakdown');

    if (scoreEl) scoreEl.textContent = `${summary.scorePercent}%`;
    if (statusEl) {
      statusEl.textContent = summary.passed ? 'Passed!' : 'Needs Review';
      statusEl.className = `result-status ${summary.passed ? 'passed' : 'needs-review'}`;
    }
    if (correctEl) correctEl.textContent = `${summary.correct}/${summary.totalProblems}`;
    if (totalEl) totalEl.textContent = `${summary.earnedPoints}/${summary.totalPoints} pts`;

    if (durationEl && summary.duration) {
      const mins = Math.floor(summary.duration / 60000);
      const secs = Math.round((summary.duration % 60000) / 1000);
      durationEl.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    // Skill breakdown
    if (breakdownEl && summary.skillBreakdown) {
      breakdownEl.innerHTML = summary.skillBreakdown.map(s => {
        const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
        const label = (s.skill || '').replace(/-/g, ' ');
        const status = pct >= 70 ? 'strong' : pct >= 40 ? 'developing' : 'needs-work';
        return `<div class="skill-row ${status}">
          <span class="skill-name">${label}</span>
          <span class="skill-score">${s.correct}/${s.total}</span>
          <div class="skill-bar"><div class="skill-bar-fill" style="width: ${pct}%"></div></div>
        </div>`;
      }).join('');
    }
  }

  async finishCheckpoint() {
    this.showLoading('Saving results...');

    try {
      const response = await window.csrfFetch('/api/checkpoint/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to complete');

      const data = await response.json();
      this.close();

      if (window.showNotification) {
        const msg = data.summary?.passed
          ? `Checkpoint complete! Score: ${data.summary.scorePercent}%. Moving to next module.`
          : `Checkpoint complete. Score: ${data.summary.scorePercent}%. Some areas need review.`;
        window.showNotification(msg, data.summary?.passed ? 'success' : 'info');
      }

      // Reload the page to refresh course state
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('[FloatingCheckpoint] Complete error:', err);
      alert('Failed to save results. Please try again.');
      this.showScreen('results');
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.floatingCheckpoint = new FloatingCheckpoint();
  });
} else {
  window.floatingCheckpoint = new FloatingCheckpoint();
}

;
/* --- /js/sidebar.js --- */
// ============================================
// COLLAPSIBLE SIDEBAR
// Modern sidebar with tools, leaderboard, progress
// Enhanced with session management features
// ============================================

class Sidebar {
    constructor() {
        this.isOpen = true; // Start open on desktop
        this.sidebar = null;
        this.toggle = null;
        this.sessionsExpanded = true;
        this.toolsExpanded = false;
        this.activeConversationId = null;
        this.conversations = []; // Cache for search
        this.searchTimeout = null;

        console.log('📂 Sidebar initializing...');
        this.init();
    }

    /**
     * Format a timestamp as relative time (e.g., "2 hours ago", "Yesterday")
     */
    formatRelativeTime(date) {
        if (!date) return '';

        const now = new Date();
        const then = new Date(date);
        const diffMs = now - then;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

        // Format as date for older sessions
        return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    init() {
        this.sidebar = document.getElementById('app-sidebar');
        this.toggle = document.getElementById('sidebar-toggle');

        if (!this.sidebar || !this.toggle) {
            console.error('[Sidebar] Sidebar elements not found');
            return;
        }

        // Set initial state based on screen size
        if (window.innerWidth < 768) {
            this.isOpen = false;
            this.sidebar.classList.add('collapsed');
            const wrapper = document.getElementById('app-layout-wrapper');
            if (wrapper) {
                wrapper.classList.add('sidebar-collapsed');
            }
        }

        // Toggle button click
        this.toggle.addEventListener('click', () => this.toggleSidebar());

        // Close sidebar when clicking outside on mobile
        if (window.innerWidth < 768) {
            document.addEventListener('click', (e) => {
                if (this.isOpen &&
                    !this.sidebar.contains(e.target) &&
                    !this.toggle.contains(e.target)) {
                    this.toggleSidebar();
                }
            });
        }

        // Sessions expand/collapse
        const sessionsToggle = document.querySelector('.sessions-toggle');
        const sessionsContent = document.getElementById('sidebar-sessions');
        if (sessionsToggle && sessionsContent) {
            sessionsToggle.addEventListener('click', () => this.toggleSessions());
            // Start expanded
            sessionsContent.classList.add('expanded');
            sessionsToggle.classList.add('expanded');
        }

        // Tools expand/collapse (collapsed by default to reduce clutter)
        const toolsToggle = document.querySelector('.tools-toggle');
        const toolsContent = document.getElementById('sidebar-tools');
        if (toolsToggle && toolsContent) {
            toolsToggle.addEventListener('click', () => this.toggleTools());
        }


        // New session button
        const newSessionBtn = document.getElementById('new-session-btn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => this.createNewSession());
        }

        // Session search input
        const searchInput = document.getElementById('session-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchSessions(e.target.value);
            });

            // Clear search on escape
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.renderSessions(this.conversations);
                }
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.session-actions')) {
                document.querySelectorAll('.session-dropdown.show').forEach(d => d.classList.remove('show'));
            }
        });

        // Tool button handlers
        this.setupToolHandlers();

        // Load sessions
        this.loadSessions();


        // Load progress data
        this.loadProgress();

        // Pi Day button — show/hide based on date, scroll to quests on click
        this.initPiDayButton();

        console.log('✅ Sidebar ready');
    }

    initPiDayButton() {
        const piSection = document.getElementById('sidebar-pi-day-section');
        const piBtn = document.getElementById('sidebar-pi-day-btn');
        if (!piSection || !piBtn) return;

        // Check if it's Pi Day via the quests API flag
        fetch('/api/daily-quests')
            .then(r => r.json())
            .then(data => {
                if (data.piDay) {
                    piSection.style.display = '';
                }
            })
            .catch(() => {});

        // Open Pi Day hub panel on click
        piBtn.addEventListener('click', () => this.openPiDayHub());

        // Close hub panel
        const closeBtn = document.getElementById('pi-day-hub-close');
        const backdrop = document.getElementById('pi-day-hub-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closePiDayHub());
        if (backdrop) backdrop.addEventListener('click', () => this.closePiDayHub());
    }

    async openPiDayHub() {
        const hub = document.getElementById('pi-day-hub');
        if (!hub) return;
        hub.style.display = '';

        // Load quests
        try {
            const questRes = await fetch('/api/daily-quests');
            const questData = await questRes.json();
            const questsEl = document.getElementById('pi-hub-quests');
            if (questData.success && questData.quests) {
                questsEl.innerHTML = questData.quests.map(q => {
                    const pct = Math.min((q.progress / q.targetCount) * 100, 100);
                    return `<div class="pi-hub-quest-item">
                        <span class="quest-icon">${q.icon}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${q.name}</div>
                            <div style="font-size:11px;color:#888;">${q.description}</div>
                            <div style="height:4px;background:#eee;border-radius:2px;margin-top:4px;">
                                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ff6b9d,#c850c0);border-radius:2px;"></div>
                            </div>
                        </div>
                        <span class="quest-xp">${q.completed ? '\u2705' : `+${Math.round(q.xpReward * (q.bonusMultiplier || 1))} XP`}</span>
                    </div>`;
                }).join('');
            }
        } catch (e) { console.error('Pi hub quests:', e); }

        // Load mini-lessons
        try {
            const lessonRes = await fetch('/api/daily-quests/pi-day-lessons');
            const lessonData = await lessonRes.json();
            const lessonsEl = document.getElementById('pi-hub-lessons');
            if (lessonData.success && lessonData.lessons && lessonData.lessons.length) {
                lessonsEl.innerHTML = lessonData.lessons.map(l => `
                    <button class="pi-hub-lesson-btn" data-prompt="${l.prompt.replace(/"/g, '&quot;')}">
                        <span style="font-size:18px;font-weight:900;">\u03C0</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${l.title}</div>
                            ${l.gradeBand !== 'all' ? `<div style="font-size:10px;color:#888;">Grades ${l.gradeBand}</div>` : ''}
                        </div>
                        <i class="fas fa-chevron-right" style="color:#ccc;font-size:11px;"></i>
                    </button>
                `).join('');
                // Attach click handlers
                lessonsEl.querySelectorAll('.pi-hub-lesson-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const prompt = btn.getAttribute('data-prompt');
                        this.closePiDayHub();
                        if (prompt && typeof window.sendMessage === 'function') {
                            window.sendMessage(prompt);
                        } else if (prompt) {
                            const input = document.getElementById('user-input') || document.getElementById('chat-input');
                            if (input) { input.value = prompt; input.focus(); input.dispatchEvent(new Event('input', { bubbles: true })); }
                        }
                    });
                });
            } else {
                lessonsEl.innerHTML = '<div style="font-size:12px;color:#888;">No lessons available.</div>';
            }
        } catch (e) { console.error('Pi hub lessons:', e); }

        // Load relevant courses (geometry, circle-related)
        try {
            const catRes = await fetch('/api/course-sessions/catalog');
            const catData = await catRes.json();
            const coursesEl = document.getElementById('pi-hub-courses');
            const courses = catData.catalog || catData.courses;
            if (catData.success && courses) {
                // Surface geometry + math courses that relate to circles/pi
                const piRelevant = ['geometry', '7th-grade-math', '6th-grade-math', 'grade-8-math', 'precalculus'];
                const matches = courses.filter(c => piRelevant.includes(c.courseId));
                if (matches.length) {
                    coursesEl.innerHTML = matches.map(c => `
                        <button class="pi-hub-course-btn" data-course-id="${c.courseId}">
                            <span class="course-icon">${c.icon || '\uD83D\uDCD0'}</span>
                            <div class="course-info">
                                <div class="course-name">${c.title || c.courseId}</div>
                                <div class="course-desc">${c.tagline || ''}</div>
                            </div>
                            <span style="font-size:10px;font-weight:700;color:#ff6b9d;background:rgba(255,107,157,0.12);padding:2px 7px;border-radius:10px;white-space:nowrap;">Free today!</span>
                        </button>
                    `).join('');
                    // Attach click handlers to enroll / open course
                    coursesEl.querySelectorAll('.pi-hub-course-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const courseId = btn.getAttribute('data-course-id');
                            this.closePiDayHub();
                            if (window.courseManager && typeof window.courseManager.enrollInCourse === 'function') {
                                window.courseManager.enrollInCourse(courseId, null);
                            } else {
                                // Fallback: open browse courses catalog
                                const browseBtn = document.getElementById('browse-courses-btn');
                                if (browseBtn) browseBtn.click();
                            }
                        });
                    });
                } else {
                    coursesEl.innerHTML = '<div style="font-size:12px;color:#888;">Browse all courses in the sidebar.</div>';
                }
            }
        } catch (e) { console.error('Pi hub courses:', e); }
    }

    closePiDayHub() {
        const hub = document.getElementById('pi-day-hub');
        if (hub) hub.style.display = 'none';
    }

    /**
     * Switch sidebar context between 'course' and 'general'.
     * In course mode, session list / leaderboard / quests are hidden
     * to reduce clutter — the student is focused on their course.
     */
    setContext(ctx) {
        if (!this.sidebar) return;
        if (ctx === 'course') {
            this.sidebar.classList.add('ctx-course');
        } else {
            this.sidebar.classList.remove('ctx-course');
        }
    }

    toggleSidebar() {
        this.isOpen = !this.isOpen;

        if (this.isOpen) {
            this.sidebar.classList.remove('collapsed');
            this.toggle.classList.add('sidebar-open');
            document.getElementById('app-layout-wrapper').classList.remove('sidebar-collapsed');
        } else {
            this.sidebar.classList.add('collapsed');
            this.toggle.classList.remove('sidebar-open');
            document.getElementById('app-layout-wrapper').classList.add('sidebar-collapsed');
        }
    }

    toggleSessions() {
        this.sessionsExpanded = !this.sessionsExpanded;

        const sessionsContent = document.getElementById('sidebar-sessions');
        const sessionsToggle = document.querySelector('.sessions-toggle');

        if (this.sessionsExpanded) {
            sessionsContent.classList.add('expanded');
            sessionsToggle.classList.add('expanded');
        } else {
            sessionsContent.classList.remove('expanded');
            sessionsToggle.classList.remove('expanded');
        }
    }

    toggleTools() {
        this.toolsExpanded = !this.toolsExpanded;

        const toolsContent = document.getElementById('sidebar-tools');
        const toolsToggle = document.querySelector('.tools-toggle');

        if (this.toolsExpanded) {
            toolsContent.classList.add('expanded');
            toolsToggle.classList.add('expanded');
        } else {
            toolsContent.classList.remove('expanded');
            toolsToggle.classList.remove('expanded');
        }
    }

    // Force the Tools section open (idempotent). Used when something inside
    // Tools needs to be visible — e.g. the glowing "Starting Point" button the
    // greeting points new students to. Without this it stays hidden inside the
    // collapsed-by-default section and the greeting refers to a button nobody
    // can see.
    expandTools() {
        const toolsContent = document.getElementById('sidebar-tools');
        const toolsToggle = document.querySelector('.tools-toggle');
        if (!toolsContent || !toolsToggle) return;

        this.toolsExpanded = true;
        toolsContent.classList.add('expanded');
        toolsToggle.classList.add('expanded');
    }

    async loadSessions() {
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'GET',
                credentials: 'include'
            });

            const data = await response.json();

            // Track active conversation for sidebar highlighting only.
            // We no longer auto-restore sessions on page load — new logins
            // always start in general chat. Users resume via sidebar click.
            if (data.activeConversationId && !this.activeConversationId) {
                this.activeConversationId = data.activeConversationId;
                console.log('[Sidebar] Noted active conversation:', this.activeConversationId);
            }

            this.renderSessions(data.conversations);

            // Check if assessment is needed
            if (data.assessmentNeeded) {
                this.showAssessmentPrompt();
            }
        } catch (error) {
            console.error('[Sidebar] Failed to load sessions:', error);
        }
    }

    renderSessions(conversations) {
        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        // Cache conversations for search
        this.conversations = conversations;
        this._sessionsShowAll = false;

        // Clear existing
        sessionsList.innerHTML = '';

        // Filter out assessment/mastery conversations from the list
        const chatConversations = conversations.filter(c =>
            c.conversationType === 'general' || c.conversationType === 'topic'
        );

        // Separate pinned and regular sessions
        const pinnedSessions = chatConversations.filter(c => c.isPinned);
        const regularSessions = chatConversations.filter(c => !c.isPinned);

        // Add pinned sessions header if any exist
        if (pinnedSessions.length > 0) {
            const pinnedHeader = document.createElement('div');
            pinnedHeader.className = 'session-divider';
            pinnedHeader.innerHTML = '<span><i class="fas fa-thumbtack"></i> Pinned</span>';
            sessionsList.appendChild(pinnedHeader);

            pinnedSessions.forEach(conv => this.renderSessionItem(conv, sessionsList, true));
        }

        // Add regular sessions (show only 3 by default)
        if (regularSessions.length > 0) {
            if (pinnedSessions.length > 0) {
                const recentHeader = document.createElement('div');
                recentHeader.className = 'session-divider';
                recentHeader.innerHTML = '<span>Recent</span>';
                sessionsList.appendChild(recentHeader);
            }

            const defaultShow = 3;
            regularSessions.slice(0, defaultShow).forEach(conv => this.renderSessionItem(conv, sessionsList, false));

            // "See more" button if there are more than 3 regular sessions
            if (regularSessions.length > defaultShow) {
                const seeMoreBtn = document.createElement('button');
                seeMoreBtn.className = 'sidebar-see-all-btn sessions-see-more-btn';
                seeMoreBtn.textContent = `See ${regularSessions.length - defaultShow} more`;
                seeMoreBtn.addEventListener('click', () => this.toggleAllSessions());
                sessionsList.appendChild(seeMoreBtn);
            }
        }

        // Show empty state if no conversations
        if (chatConversations.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'session-empty-state';
            emptyState.innerHTML = `
                <span style="color: #888; font-size: 13px; padding: 12px; display: block; text-align: center;">
                    No chats yet. Click <strong>New Chat</strong> to start!
                </span>
            `;
            sessionsList.appendChild(emptyState);
        }
    }

    /**
     * Toggle between showing 3 sessions and all sessions
     */
    toggleAllSessions() {
        this._sessionsShowAll = !this._sessionsShowAll;

        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        sessionsList.innerHTML = '';

        const chatConversations = this.conversations.filter(c =>
            c.conversationType === 'general' || c.conversationType === 'topic'
        );
        const pinnedSessions = chatConversations.filter(c => c.isPinned);
        const regularSessions = chatConversations.filter(c => !c.isPinned);

        if (pinnedSessions.length > 0) {
            const pinnedHeader = document.createElement('div');
            pinnedHeader.className = 'session-divider';
            pinnedHeader.innerHTML = '<span><i class="fas fa-thumbtack"></i> Pinned</span>';
            sessionsList.appendChild(pinnedHeader);
            pinnedSessions.forEach(conv => this.renderSessionItem(conv, sessionsList, true));
        }

        if (regularSessions.length > 0) {
            if (pinnedSessions.length > 0) {
                const recentHeader = document.createElement('div');
                recentHeader.className = 'session-divider';
                recentHeader.innerHTML = '<span>Recent</span>';
                sessionsList.appendChild(recentHeader);
            }

            const defaultShow = 3;
            const showCount = this._sessionsShowAll ? regularSessions.length : defaultShow;
            regularSessions.slice(0, showCount).forEach(conv => this.renderSessionItem(conv, sessionsList, false));

            if (regularSessions.length > defaultShow) {
                const seeMoreBtn = document.createElement('button');
                seeMoreBtn.className = 'sidebar-see-all-btn sessions-see-more-btn';
                seeMoreBtn.textContent = this._sessionsShowAll ? 'Show less' : `See ${regularSessions.length - defaultShow} more`;
                seeMoreBtn.addEventListener('click', () => this.toggleAllSessions());
                sessionsList.appendChild(seeMoreBtn);
            }
        }
    }

    /**
     * Render a single session item
     */
    renderSessionItem(conv, container, isPinned) {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-item' + (this.activeConversationId === conv._id ? ' active' : '');
        sessionItem.dataset.conversationId = conv._id;

        // Format stats if available
        let statsHtml = '';
        if (conv.stats && conv.stats.problemsAttempted > 0) {
            const accuracy = conv.stats.problemsCorrect > 0
                ? Math.round((conv.stats.problemsCorrect / conv.stats.problemsAttempted) * 100)
                : 0;
            statsHtml = `<span class="session-stats">${accuracy}% accuracy</span>`;
        }

        sessionItem.innerHTML = `
            <div class="session-main">
                <span class="session-emoji">${conv.topicEmoji || '💬'}</span>
                <div class="session-info">
                    <div class="session-name-row">
                        ${isPinned ? '<i class="fas fa-thumbtack session-pin-icon"></i>' : ''}
                        <span class="session-name">${this.escapeHtml(conv.name)}</span>
                    </div>
                    ${conv.lastMessage ? `
                        <span class="session-preview">${this.escapeHtml(conv.lastMessage.content)}</span>
                    ` : '<span class="session-preview">No messages yet</span>'}
                    ${statsHtml}
                </div>
            </div>
            <div class="session-meta">
                <span class="session-time">${this.formatRelativeTime(conv.lastActivity)}</span>
                ${conv.messageCount > 0 ? `<span class="session-count">${conv.messageCount}</span>` : ''}
                <div class="session-actions">
                    <button class="session-action-btn session-menu-btn" title="More options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="session-dropdown">
                        <button class="session-dropdown-item" data-action="rename">
                            <i class="fas fa-edit"></i> Rename
                        </button>
                        <button class="session-dropdown-item" data-action="pin">
                            <i class="fas fa-thumbtack"></i> ${isPinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button class="session-dropdown-item session-dropdown-danger" data-action="delete">
                            <i class="fas fa-trash-alt"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Main click handler
        sessionItem.addEventListener('click', (e) => {
            if (!e.target.closest('.session-actions')) {
                this.switchSession(conv._id);
            }
        });

        // Menu button handler
        const menuBtn = sessionItem.querySelector('.session-menu-btn');
        const dropdown = sessionItem.querySelector('.session-dropdown');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.session-dropdown.show').forEach(d => d.classList.remove('show'));
            dropdown.classList.toggle('show');
        });

        // Dropdown action handlers
        dropdown.querySelectorAll('.session-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                const action = item.dataset.action;

                if (action === 'rename') {
                    this.renameSession(conv._id, conv.name);
                } else if (action === 'pin') {
                    this.togglePinSession(conv._id);
                } else if (action === 'delete') {
                    this.deleteSession(conv._id);
                }
            });
        });

        container.appendChild(sessionItem);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Rename a session
     */
    async renameSession(conversationId, currentName) {
        const newName = prompt('Enter a new name for this session:', currentName);
        if (!newName || newName.trim() === '' || newName === currentName) return;

        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to rename');
            }

            await this.loadSessions();
            console.log('[Sidebar] Session renamed successfully');
        } catch (error) {
            console.error('[Sidebar] Failed to rename session:', error);
            alert('Failed to rename session. Please try again.');
        }
    }

    /**
     * Toggle pin status for a session
     */
    async togglePinSession(conversationId) {
        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/pin`, {
                method: 'PATCH',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to update pin status');
            }

            await this.loadSessions();
            console.log('[Sidebar] Pin status toggled successfully');
        } catch (error) {
            console.error('[Sidebar] Failed to toggle pin:', error);
        }
    }

    /**
     * Search sessions
     */
    async searchSessions(query) {
        if (!query || query.trim() === '') {
            this.renderSessions(this.conversations);
            return;
        }

        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            try {
                const response = await window.csrfFetch(`/api/conversations/search?q=${encodeURIComponent(query)}`, {
                    method: 'GET',
                    credentials: 'include'
                });

                const data = await response.json();
                this.renderSearchResults(data.conversations, query);
            } catch (error) {
                console.error('[Sidebar] Search failed:', error);
            }
        }, 300);
    }

    /**
     * Render search results
     */
    renderSearchResults(results, query) {
        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        sessionsList.innerHTML = '';

        if (results.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'session-no-results';
            noResults.innerHTML = `<i class="fas fa-search"></i><span>No sessions found for "${this.escapeHtml(query)}"</span>`;
            sessionsList.appendChild(noResults);
            return;
        }

        results.forEach(conv => {
            this.renderSessionItem(conv, sessionsList, conv.isPinned);
        });
    }

    /**
     * Create a new blank session immediately (Claude-like UX)
     */
    async createNewSession() {
        console.log('[Sidebar] createNewSession called');
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                credentials: 'include'
            });

            const data = await response.json();
            await this.loadSessions();
            this.switchSession(data.conversation._id);
        } catch (error) {
            console.error('[Sidebar] Failed to create new session:', error);
        }
    }

    async switchSession(conversationId) {
        console.log('[Sidebar] switchSession called with:', conversationId);
        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/switch`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await response.json();
            console.log('[Sidebar] Switch response:', data);

            // Update active session in UI
            document.querySelectorAll('.session-item').forEach(item => {
                item.classList.remove('active');
            });

            const activeItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }

            // Update chat view
            console.log('[Sidebar] updateChatForSession available:', typeof window.updateChatForSession);
            if (window.updateChatForSession) {
                window.updateChatForSession(data.conversation, data.messages);
            } else {
                console.error('[Sidebar] window.updateChatForSession is not defined!');
                // Fallback: reload page to switch session
                window.location.reload();
            }

            this.activeConversationId = conversationId;
        } catch (error) {
            console.error('[Sidebar] Failed to switch session:', error);
        }
    }

    async deleteSession(conversationId) {
        if (!confirm('Delete this chat? This cannot be undone.')) {
            return;
        }

        try {
            const wasActive = this.activeConversationId === conversationId;

            await window.csrfFetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            // If we deleted the active chat, create a fresh session
            if (wasActive) {
                this.activeConversationId = null;
                await this.createNewSession();
            } else {
                await this.loadSessions();
            }
        } catch (error) {
            console.error('[Sidebar] Failed to delete session:', error);
        }
    }

    showAssessmentPrompt() {
        // Show a banner or notification that assessment is needed
        console.log('[Sidebar] Assessment needed - will show prompt in chat');
        if (window.showAssessmentPrompt) {
            window.showAssessmentPrompt();
        }
    }

    setupToolHandlers() {
        // Mastery Mode (shelved)
    }

    async loadProgress() {
        // Fetch user data if window.currentUser isn't available yet
        // (script.js runs as ES module so its currentUser is module-scoped)
        let user = window.currentUser;
        if (!user) {
            try {
                const res = await fetch('/user', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    user = data.user;
                }
            } catch (e) {
                console.warn('Sidebar: could not fetch user for progress', e);
            }
        }
        if (!user) return;

        const level = user.level || 1;
        // xpForCurrentLevel and xpForNextLevel are computed by the backend
        // (set on page load via /user endpoint and updated after each chat response)
        const xp = user.xpForCurrentLevel || 0;
        const xpNeeded = user.xpForNextLevel || 100;
        const progress = (xp / xpNeeded) * 100;

        // Update sidebar progress
        const levelEl = document.getElementById('sidebar-level');
        const xpEl = document.getElementById('sidebar-xp');
        const progressBar = document.getElementById('sidebar-progress-fill');

        if (levelEl) levelEl.textContent = level;
        if (xpEl) xpEl.textContent = `${xp} / ${xpNeeded} XP`;
        if (progressBar) progressBar.style.width = `${Math.min(progress, 100)}%`;

        // Update mobile drawer progress
        const drawerLevelEl = document.getElementById('drawer-level');
        const drawerXpEl = document.getElementById('drawer-xp');
        const drawerProgressBar = document.getElementById('drawer-progress-fill');

        if (drawerLevelEl) drawerLevelEl.textContent = level;
        if (drawerXpEl) drawerXpEl.textContent = `${xp} / ${xpNeeded} XP`;
        if (drawerProgressBar) drawerProgressBar.style.width = `${Math.min(progress, 100)}%`;

        // Update mobile drawer quick stats (streak, total XP, total solved)
        const drawerStreak = document.getElementById('drawer-streak-count');
        const drawerTotalXp = document.getElementById('drawer-total-xp');
        const drawerTotalProblems = document.getElementById('drawer-total-problems');

        if (drawerStreak) drawerStreak.textContent = user.dailyQuests?.currentStreak || user.currentStreak || 0;
        if (drawerTotalXp) drawerTotalXp.textContent = user.xp || 0;
        if (drawerTotalProblems) drawerTotalProblems.textContent = user.totalProblemsCorrect || 0;

        // Update link code in drawer
        const drawerLinkCode = document.getElementById('drawer-student-link-code-value');
        const sidebarLinkCode = document.getElementById('student-link-code-value');
        if (drawerLinkCode && sidebarLinkCode) {
            drawerLinkCode.textContent = sidebarLinkCode.textContent;
            drawerLinkCode.onclick = sidebarLinkCode.onclick;
        }
    }
}

// Wire the "invite a parent by email" action in the Share Progress drawer.
function wireParentInvite() {
    const btn = document.getElementById('drawer-invite-parent-btn');
    const input = document.getElementById('drawer-invite-parent-email');
    const status = document.getElementById('drawer-invite-parent-status');
    if (!btn || !input) return;

    const setStatus = (msg, ok) => {
        if (!status) return;
        status.style.display = 'block';
        status.style.color = ok ? '#0d9488' : '#c0392b';
        status.textContent = msg;
    };

    btn.addEventListener('click', async () => {
        const email = (input.value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setStatus('Please enter a valid email address.', false);
            return;
        }
        btn.disabled = true;
        setStatus('Sending…', true);
        try {
            const fetchFn = window.csrfFetch || window.fetch;
            const res = await fetchFn('/api/student/invite-parent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentEmail: email }),
                credentials: 'include'
            });
            const data = await res.json().catch(() => ({}));
            setStatus(data.message || (res.ok ? 'Invite sent!' : 'Could not send invite.'), res.ok);
            if (res.ok) input.value = '';
        } catch (e) {
            setStatus('Network error — please try again.', false);
        } finally {
            btn.disabled = false;
        }
    });
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar();
    wireParentInvite();
});

console.log('📂 Sidebar module loaded');

;
/* --- /js/courseCatalog.js --- */
// ============================================
// COURSE CATALOG & ENROLLMENT MANAGER
// Handles course browsing, enrollment, progress display,
// and switching between course sessions and general tutoring.
// Purely additive — never touches existing sidebar/session logic.
// ============================================

class CourseManager {
    constructor() {
        this.courseSessions = [];
        this.activeCourseSessionId = null;
        this.dropdownOpen = false;
        this._lastKnownModuleStatuses = {}; // moduleId → status, for detecting completions
        this._catalogCache = null; // Cache catalog data for client-side filtering
        this._catalogRecommended = null;
        this._activeFilter = 'All';
        this.init();
    }

    // --------------------------------------------------
    // Initialisation
    // --------------------------------------------------
    init() {
        // Browse Courses button → open catalog modal
        const browseBtn = document.getElementById('browse-courses-btn');
        if (browseBtn) {
            browseBtn.addEventListener('click', () => this.openCatalog());
        }

        // Close catalog modal
        const closeBtn = document.getElementById('close-catalog-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeCatalog());
        }

        // Courses section expand/collapse
        const coursesToggle = document.getElementById('courses-toggle-btn');
        const coursesContent = document.getElementById('sidebar-courses');
        if (coursesToggle && coursesContent) {
            coursesToggle.addEventListener('click', () => {
                const expanded = coursesContent.classList.toggle('expanded');
                coursesToggle.classList.toggle('expanded', expanded);
            });
            // Start expanded
            coursesContent.classList.add('expanded');
            coursesToggle.classList.add('expanded');
        }

        // Close catalog when clicking overlay background
        const modal = document.getElementById('course-catalog-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeCatalog();
            });
        }

        // Next Lesson / Exit Course buttons
        const nextBtn = document.getElementById('course-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.onNextLesson());
        }

        const exitBtn = document.getElementById('course-exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => this.exitCourse());
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dropdownOpen &&
                !e.target.closest('#course-progress-wrapper')) {
                this.closeProgressDropdown();
            }
        });

        // Keyboard accessibility: Escape closes modals and dropdowns
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close confirmation modal first (highest priority)
                const confirmOverlay = document.querySelector('.course-confirm-overlay');
                if (confirmOverlay) {
                    confirmOverlay.remove();
                    return;
                }
                // Close catalog modal
                const catalogModal = document.getElementById('course-catalog-modal');
                if (catalogModal?.classList.contains('is-visible')) {
                    this.closeCatalog();
                    return;
                }
                // Close progress dropdown
                if (this.dropdownOpen) {
                    this.closeProgressDropdown();
                }
            }
        });

        // Load enrolled courses on startup
        this.loadMySessions();

        // Auto-open catalog if arriving via bottom nav (?courses=1)
        const params = new URLSearchParams(window.location.search);
        if (params.get('courses') === '1') {
            // Clean the URL so a refresh doesn't re-open
            history.replaceState(null, '', window.location.pathname);
            // Small delay to let the page finish loading
            setTimeout(() => this.openCatalog(), 300);
        }

        console.log('[CourseManager] Initialised');
    }

    // --------------------------------------------------
    // Sidebar: load the user's enrolled courses
    // --------------------------------------------------
    async loadMySessions() {
        try {
            const res = await csrfFetch('/api/course-sessions', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (!data.success) return;

            this.courseSessions = data.sessions || [];

            // Determine if there is an active course session
            // (the user model tracks this server-side; we infer from the list)
            this.renderSidebarCourses();

            // If there is an active course session tied to the current conversation,
            this.checkActiveProgressBar();
        } catch (err) {
            console.warn('[CourseManager] Failed to load sessions:', err);
        }
    }

    renderSidebarCourses() {
        const list = document.getElementById('course-sessions-list');
        if (!list) return;

        list.innerHTML = '';

        if (this.courseSessions.length === 0) {
            list.innerHTML = `<div style="padding: 8px 4px; color: #aaa; font-size: 13px;">
                No courses yet — browse below!
            </div>`;
            return;
        }

        // Check which conversation is currently active
        const currentConvId = window.currentConversationId || window.sidebar?.activeConversationId;

        this.courseSessions.forEach(s => {
            const item = document.createElement('div');
            const isActive = s.conversationId === currentConvId && s.status === 'active';
            item.className = 'course-sidebar-item' + (isActive ? ' active' : '') + (s.status === 'paused' ? ' paused' : '');
            item.dataset.sessionId = s._id;

            const pct = s.overallProgress || 0;
            const moduleDone = (s.modules || []).filter(m => m.status === 'completed').length;
            const moduleTotal = (s.modules || []).length;

            // Build breadcrumb from module/lesson data
            const currentMod = (s.modules || []).find(m => m.moduleId === s.currentModuleId);
            let modLabel = '';
            if (s.status === 'paused') {
                modLabel = 'Paused';
            } else if (currentMod) {
                const parts = [];
                if (currentMod.unit) parts.push(`Unit ${currentMod.unit}`);
                const curLesson = s.currentLessonId && currentMod.lessons
                    ? currentMod.lessons.find(l => l.lessonId === s.currentLessonId)
                    : null;
                if (curLesson?.title) {
                    parts.push(curLesson.title);
                } else if (currentMod.title) {
                    parts.push(currentMod.title);
                }
                modLabel = parts.join(' \u203A ');
            }

            item.innerHTML = `
                <div class="course-sidebar-row">
                    <div class="course-sidebar-icon">${s.status === 'paused' ? '⏸' : '📘'}</div>
                    <div class="course-sidebar-body">
                        <div class="course-sidebar-name">${this.escapeHtml(this.formatCourseName(s.courseName))}</div>
                        <div class="course-sidebar-module">${modLabel}</div>
                        <div class="course-sidebar-progress-track">
                            <div class="course-sidebar-progress-fill" style="width: ${pct}%"></div>
                        </div>
                        <div class="course-sidebar-stats">${moduleDone}/${moduleTotal} modules &middot; ${pct}%</div>
                    </div>
                    <button class="course-drop-x" title="Drop course" aria-label="Drop course">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            // Click row → activate course
            item.querySelector('.course-sidebar-row').addEventListener('click', (e) => {
                if (e.target.closest('.course-drop-x')) return;
                this.activateCourse(s._id);
            });

            // Click X → drop course
            item.querySelector('.course-drop-x').addEventListener('click', (e) => {
                e.stopPropagation();
                this.dropCourse(s._id);
            });

            list.appendChild(item);
        });
    }

    // --------------------------------------------------
    // Progress bar (shown at top of chat when inside a course conversation)
    // --------------------------------------------------
    async checkActiveProgressBar() {
        // Find if any session's conversationId matches the currently active conversation
        const currentConvId = window.currentConversationId || window.sidebar?.activeConversationId;
        if (!currentConvId) return;

        const match = this.courseSessions.find(
            s => s.conversationId === currentConvId && s.status === 'active'
        );

        const wrapper = document.getElementById('course-progress-wrapper');
        if (!wrapper) return;

        if (match) {
            this.activeCourseSessionId = match._id;
            this.updateProgressBar(match);
            wrapper.style.display = 'block';
            if (window.sidebar) window.sidebar.setContext('course');

            // Rehydrate the lesson progress tracker
            if (window.lessonTracker) {
                window.lessonTracker.rehydrate(match._id);
            }
        } else {
            wrapper.style.display = 'none';
            this.activeCourseSessionId = null;
            if (window.sidebar) window.sidebar.setContext('general');

            // Hide the lesson tracker when not in a course
            if (window.lessonTracker) {
                window.lessonTracker.hide();
            }
        }
    }

    updateProgressBar(session) {
        const title = document.getElementById('course-progress-title');
        const mod = document.getElementById('course-progress-module');
        const fill = document.getElementById('course-progress-fill');
        const pct = document.getElementById('course-progress-pct');

        if (title) title.textContent = session.courseName || '';
        if (fill) fill.style.width = `${session.overallProgress || 0}%`;
        if (pct) pct.textContent = `${session.overallProgress || 0}%`;

        // Build breadcrumb: Unit X > Lesson Title
        if (mod) {
            const currentMod = (session.modules || []).find(m => m.moduleId === session.currentModuleId);
            if (currentMod) {
                const lessonId = session.currentLessonId;
                const lesson = lessonId && currentMod.lessons
                    ? currentMod.lessons.find(l => l.lessonId === lessonId)
                    : null;
                const parts = [];
                if (currentMod.unit) parts.push(`Unit ${currentMod.unit}`);
                if (lesson?.title) {
                    parts.push(lesson.title);
                } else if (currentMod.title) {
                    parts.push(currentMod.title);
                }
                mod.textContent = parts.join(' \u203A ');
            } else {
                mod.textContent = '';
            }
        }
    }

    // --------------------------------------------------
    // Module completion detection & celebration
    // --------------------------------------------------
    detectCompletions(modules) {
        const newlyCompleted = [];

        modules.forEach(m => {
            const prev = this._lastKnownModuleStatuses[m.moduleId];
            if (m.status === 'completed' && prev && prev !== 'completed') {
                newlyCompleted.push(m);
            }
            this._lastKnownModuleStatuses[m.moduleId] = m.status;
        });

        // If this is the first load, just cache statuses — don't celebrate
        if (!this._progressLoadedOnce) {
            this._progressLoadedOnce = true;
            return;
        }

        // Celebrate each newly completed module
        newlyCompleted.forEach(m => this.celebrateModuleCompletion(m));
    }

    async celebrateModuleCompletion(mod) {
        // Call the complete-module endpoint to award XP and unlock next
        let xpAwarded = 0;
        let courseComplete = false;
        if (this.activeCourseSessionId) {
            try {
                const res = await csrfFetch(`/api/course-sessions/${this.activeCourseSessionId}/complete-module`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        moduleId: mod.moduleId,
                        checkpointPassed: mod.checkpointPassed || false
                    }),
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    xpAwarded = data.xpAwarded || 0;
                    courseComplete = data.courseComplete || false;
                }
            } catch (err) {
                console.warn('[CourseManager] Failed to record module completion:', err);
            }
        }

        // Fire confetti
        if (window.ensureConfetti) {
            await window.ensureConfetti();
        }
        if (typeof confetti === 'function') {
            const colors = ['#667eea', '#764ba2', '#22c55e', '#f59e0b', '#ffffff'];
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
            setTimeout(() => {
                confetti({ particleCount: 40, spread: 50, origin: { x: 0.2, y: 0.5 }, colors });
                confetti({ particleCount: 40, spread: 50, origin: { x: 0.8, y: 0.5 }, colors });
            }, 300);
        }

        // Show celebration card in chat
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const card = document.createElement('div');
        card.style.cssText = `
            margin: 16px auto; max-width: 440px; border-radius: 14px; overflow: hidden;
            box-shadow: 0 4px 16px rgba(34,197,94,0.2); animation: catalogSlideIn 0.4s ease;
            border: 2px solid ${courseComplete ? '#f59e0b' : '#22c55e'};
        `;

        const skills = (mod.skills || []).slice(0, 4);
        const skillsHtml = skills.length > 0
            ? skills.map(s => `<span style="display:inline-block; background:#f0fdf4; color:#16a34a; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; margin:2px;">${this.escapeHtml(s)}</span>`).join('')
            : '';

        const headerBg = courseComplete
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'linear-gradient(135deg, #22c55e, #16a34a)';
        const headerEmoji = courseComplete ? '🎓' : '🏆';
        const headerTitle = courseComplete ? 'Course Complete!' : 'Module Complete!';

        card.innerHTML = `
            <div style="background: ${headerBg}; padding: 20px; color: white; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 6px;">${headerEmoji}</div>
                <h3 style="margin: 0 0 2px; font-size: 17px; font-weight: 700;">${headerTitle}</h3>
                <p style="margin: 0; font-size: 14px; opacity: 0.95;">${this.escapeHtml(mod.title || mod.moduleId)}</p>
            </div>
            <div style="padding: 16px; background: white; text-align: center;">
                ${xpAwarded > 0 ? `<div style="font-size: 20px; font-weight: 800; color: #667eea; margin-bottom: 8px;">+${xpAwarded} XP</div>` : ''}
                ${skillsHtml ? `<div style="margin-bottom: 10px;">${skillsHtml}</div>` : ''}
                ${mod.checkpointPassed ? '<div style="font-size: 13px; color: #f59e0b; font-weight: 600; margin-bottom: 6px;"><i class="fas fa-medal"></i> Checkpoint Passed!</div>' : ''}
                <div style="font-size: 12px; color: #888; margin-top: 8px;">${courseComplete ? 'You did it! Time to celebrate.' : 'Keep going — you\'re building real momentum!'}</div>
            </div>
        `;

        chatBox.appendChild(card);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Extra confetti burst for course completion
        if (courseComplete && typeof confetti === 'function') {
            setTimeout(() => {
                for (let i = 0; i < 5; i++) {
                    setTimeout(() => {
                        confetti({ particleCount: 60, spread: 100, origin: { x: Math.random(), y: 0.3 }, colors: ['#f59e0b', '#667eea', '#22c55e'] });
                    }, i * 200);
                }
            }, 500);
        }
    }

    // --------------------------------------------------
    // Lesson transition card (subtle separator between lessons)
    // --------------------------------------------------
    showLessonTransition(transition) {
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const pct = transition.lessonsTotal > 0
            ? Math.round((transition.lessonsCompleted / transition.lessonsTotal) * 100)
            : 0;

        const card = document.createElement('div');
        card.className = 'lesson-transition-card';
        card.innerHTML = `
            <div class="lesson-transition-inner">
                <div class="lesson-transition-done">
                    <i class="fas fa-check-circle"></i>
                    <span>${this.escapeHtml(transition.completedLessonTitle)}</span>
                </div>
                <div class="lesson-transition-progress">
                    <div class="lesson-transition-track">
                        <div class="lesson-transition-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="lesson-transition-count">${transition.lessonsCompleted}/${transition.lessonsTotal} lessons</span>
                </div>
                <div class="lesson-transition-next">
                    <i class="fas fa-arrow-right"></i>
                    <span>Up next: <strong>${this.escapeHtml(transition.nextLessonTitle)}</strong></span>
                </div>
            </div>
        `;

        chatBox.appendChild(card);
        // Brief delay so the animation triggers after DOM insertion
        requestAnimationFrame(() => card.classList.add('visible'));
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --------------------------------------------------
    // Progress dropdown
    // --------------------------------------------------
    toggleProgressDropdown() {
        if (this.dropdownOpen) {
            this.closeProgressDropdown();
        } else {
            this.openProgressDropdown();
        }
    }

    async openProgressDropdown() {
        if (!this.activeCourseSessionId) return;

        const dropdown = document.getElementById('course-progress-dropdown');
        const arrow = document.getElementById('course-dropdown-arrow');
        if (!dropdown) return;

        // Fetch detailed progress
        try {
            const res = await csrfFetch(`/api/course-sessions/${this.activeCourseSessionId}/progress`, {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                // Detect newly completed modules
                this.detectCompletions(data.modules || []);

                this.renderModuleList(data);

                // Update breadcrumb from progress data
                const mod = document.getElementById('course-progress-module');
                if (mod && data.breadcrumb) {
                    const parts = [];
                    if (data.breadcrumb.unit) parts.push(`Unit ${data.breadcrumb.unit}`);
                    if (data.breadcrumb.lessonTitle) parts.push(data.breadcrumb.lessonTitle);
                    else if (data.breadcrumb.moduleName) parts.push(data.breadcrumb.moduleName);
                    mod.textContent = parts.join(' \u203A ');
                } else if (mod && data.next) {
                    mod.textContent = data.next.title || '';
                }

                // Update progress bar with latest data
                const fill = document.getElementById('course-progress-fill');
                const pct = document.getElementById('course-progress-pct');
                if (fill) fill.style.width = `${data.overallProgress || 0}%`;
                if (pct) pct.textContent = `${data.overallProgress || 0}%`;
            }
        } catch (err) {
            console.warn('[CourseManager] Failed to load progress:', err);
        }

        dropdown.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
        this.dropdownOpen = true;
    }

    closeProgressDropdown() {
        const dropdown = document.getElementById('course-progress-dropdown');
        const arrow = document.getElementById('course-dropdown-arrow');
        if (dropdown) dropdown.style.display = 'none';
        if (arrow) arrow.style.transform = '';
        this.dropdownOpen = false;
    }

    renderModuleList(data) {
        const list = document.getElementById('course-module-list');
        if (!list) return;

        list.innerHTML = '';

        const modules = data.modules || [];
        modules.forEach(m => {
            const el = document.createElement('div');
            el.className = 'module-item';

            // Status icon
            const iconMap = {
                completed:   'fa-check-circle',
                in_progress: 'fa-play-circle',
                available:   'fa-circle',
                locked:      'fa-lock'
            };
            const icon = iconMap[m.status] || 'fa-lock';
            const isCurrent = m.moduleId === data.currentModuleId;
            const unitLabel = m.unit ? `Unit ${m.unit}: ` : '';
            const lessonCount = m.lessons ? m.lessons.length : 0;
            const completedLessons = m.lessons ? m.lessons.filter(l => l.status === 'completed').length : 0;

            // Module header row
            let html = `
                <div class="module-header">
                    <i class="fas ${icon} module-icon ${m.status}"></i>
                    <div class="module-body">
                        <div class="module-title${isCurrent ? ' current' : ''}${m.status === 'locked' ? ' locked' : ''}">
                            ${unitLabel}${this.escapeHtml(m.title || m.moduleId)}
                        </div>
                        <div class="module-meta">
                            ${m.apWeight ? `<span class="module-badge ap">${m.apWeight}</span>` : ''}
                            ${lessonCount > 0 ? `<span class="module-badge lesson-count">${completedLessons}/${lessonCount} lessons</span>` : ''}
                        </div>
                        ${m.scaffoldProgress > 0 && m.status !== 'completed' ? `
                            <div class="module-scaffold-bar">
                                <div class="module-scaffold-fill" style="width: ${m.scaffoldProgress}%"></div>
                            </div>
                        ` : ''}
                    </div>
                    ${m.checkpointPassed ? '<i class="fas fa-medal module-checkpoint" title="Checkpoint passed"></i>' : ''}
                </div>`;

            // Lesson rows (only show for current/in-progress/available modules)
            if (m.lessons && m.lessons.length > 0 && (isCurrent || m.status === 'in_progress' || m.status === 'available')) {
                const sortedLessons = [...m.lessons].sort((a, b) => (a.order || 0) - (b.order || 0));
                sortedLessons.forEach(l => {
                    const lIconMap = {
                        completed:   'fa-check',
                        in_progress: 'fa-chevron-right',
                        available:   'fa-circle',
                        locked:      'fa-circle'
                    };
                    const lIcon = lIconMap[l.status] || 'fa-circle';
                    const isCurrentLesson = l.lessonId === data.currentLessonId;

                    html += `
                        <div class="module-lesson">
                            <i class="fas ${lIcon} module-lesson-icon ${l.status}"></i>
                            <span class="module-lesson-title${isCurrentLesson ? ' current' : ''}${l.status === 'locked' ? ' locked' : ''}">
                                ${this.escapeHtml(l.title || l.lessonId)}
                            </span>
                        </div>`;
                });
            }

            el.innerHTML = html;
            list.appendChild(el);
        });

        // Drop Course button at the bottom of the module list
        const dropRow = document.createElement('div');
        dropRow.className = 'module-list-footer';
        dropRow.innerHTML = `
            <button class="module-drop-btn">
                <i class="fas fa-sign-out-alt" style="margin-right:4px;"></i>Drop Course
            </button>
        `;
        dropRow.querySelector('.module-drop-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.activeCourseSessionId) {
                this.dropCourse(this.activeCourseSessionId);
            }
        });
        list.appendChild(dropRow);
    }

    // --------------------------------------------------
    // Catalog modal
    // --------------------------------------------------
    async openCatalog() {
        const modal = document.getElementById('course-catalog-modal');
        if (!modal) return;

        modal.classList.add('is-visible');

        const grid = document.getElementById('catalog-grid');
        if (grid) grid.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;">Loading courses...</div>';

        try {
            const res = await csrfFetch('/api/course-sessions/catalog', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                this._catalogCache = data.catalog;
                this._catalogRecommended = data.recommended;
                this._activeFilter = 'All';
                this.renderCatalogWithSearch(data.catalog, data.recommended);
            }
        } catch (err) {
            console.error('[CourseManager] Failed to load catalog:', err);
            if (grid) grid.innerHTML = '<div style="text-align:center; padding:40px; color:#e74c3c;">Failed to load courses.</div>';
        }

        // Focus the search input for fast keyboard access
        setTimeout(() => {
            const searchInput = document.getElementById('catalog-search');
            if (searchInput) searchInput.focus();
        }, 300);
    }

    closeCatalog() {
        const modal = document.getElementById('course-catalog-modal');
        if (modal) modal.classList.remove('is-visible');
        // Remove the search bar so it's rebuilt fresh on next open
        const searchBar = document.getElementById('catalog-search-bar');
        if (searchBar) searchBar.remove();
        this._catalogCache = null;
    }

    /**
     * Render the search bar, filter pills, and catalog grid.
     * Replaces everything inside the catalog-grid parent container.
     */
    renderCatalogWithSearch(catalog, recommended) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        // Extract unique difficulty levels for filter pills
        const difficulties = ['All', ...new Set(catalog.map(c => c.difficulty).filter(Boolean))];

        // Build search bar + filter pills above the grid
        let searchContainer = document.getElementById('catalog-search-bar');
        if (!searchContainer) {
            searchContainer = document.createElement('div');
            searchContainer.id = 'catalog-search-bar';
            searchContainer.className = 'catalog-search-bar';
            grid.parentNode.insertBefore(searchContainer, grid);
        }

        searchContainer.innerHTML = `
            <div class="catalog-search-wrapper">
                <i class="fas fa-search"></i>
                <input type="text" id="catalog-search" class="catalog-search-input" placeholder="Search courses..." autocomplete="off">
            </div>
            <div class="catalog-filter-pills" id="catalog-filters">
                ${difficulties.map(d =>
                    `<button class="catalog-filter-pill${d === this._activeFilter ? ' active' : ''}" data-filter="${d}">${d}</button>`
                ).join('')}
            </div>
        `;

        // Wire up search input
        const searchInput = searchContainer.querySelector('#catalog-search');
        searchInput.addEventListener('input', () => this._filterCatalog());

        // Wire up filter pills
        searchContainer.querySelectorAll('.catalog-filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                this._activeFilter = pill.dataset.filter;
                searchContainer.querySelectorAll('.catalog-filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this._filterCatalog();
            });
        });

        // Render the grid with all courses
        this.renderCatalog(catalog, recommended);
    }

    /**
     * Client-side filtering of the cached catalog data.
     * Triggered by search input or filter pill click.
     */
    _filterCatalog() {
        if (!this._catalogCache) return;

        const searchInput = document.getElementById('catalog-search');
        const query = (searchInput?.value || '').toLowerCase().trim();

        let filtered = this._catalogCache;

        // Apply difficulty filter
        if (this._activeFilter && this._activeFilter !== 'All') {
            filtered = filtered.filter(c => c.difficulty === this._activeFilter);
        }

        // Apply text search
        if (query) {
            filtered = filtered.filter(c =>
                (c.title || '').toLowerCase().includes(query) ||
                (c.tagline || '').toLowerCase().includes(query) ||
                (c.group || '').toLowerCase().includes(query) ||
                (c.courseId || '').toLowerCase().includes(query)
            );
        }

        this.renderCatalog(filtered, this._catalogRecommended);
    }

    renderCatalog(catalog, recommended) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        grid.innerHTML = '';

        // Build a set of already-enrolled courseIds
        const enrolled = new Set(this.courseSessions.map(s => s.courseId));

        if (catalog.length === 0) {
            grid.innerHTML = `
                <div class="catalog-empty-state">
                    <i class="fas fa-search"></i>
                    <p>No courses match your search.</p>
                </div>`;
            return;
        }

        // Difficulty badge colors
        const diffColors = {
            'Foundational': { bg: '#ecfdf5', text: '#16a34a' },
            'Beginner': { bg: '#ecfdf5', text: '#16a34a' },
            'Intermediate': { bg: '#eff6ff', text: '#2563eb' },
            'Advanced': { bg: '#faf5ff', text: '#7c3aed' },
            'Applied': { bg: '#fef3c7', text: '#b45309' },
            'Test Prep': { bg: '#fefce8', text: '#ca8a04' }
        };

        // Estimated time per module (heuristic: ~45 min per module)
        const EST_MINUTES_PER_MODULE = 45;

        let lastGroup = '';
        catalog.forEach(course => {
            // Insert group header when group changes
            if (course.group && course.group !== lastGroup) {
                lastGroup = course.group;
                const header = document.createElement('div');
                header.style.cssText = 'grid-column: 1 / -1; padding: 12px 0 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 4px;';
                header.innerHTML = `<span style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #667eea;">${this.escapeHtml(course.group)}</span>`;
                grid.appendChild(header);
            }
            const card = document.createElement('div');
            const isRecommended = course.courseId === recommended;
            card.style.cssText = `border:1px solid ${isRecommended ? '#667eea' : '#e2e8f0'}; border-radius:12px; padding:16px; display:flex; gap:14px; transition:box-shadow 0.15s; position:relative;${isRecommended ? ' background: #f8f7ff;' : ''}`;
            card.onmouseover = () => { card.style.boxShadow = '0 4px 12px rgba(102,126,234,0.15)'; };
            card.onmouseout = () => { card.style.boxShadow = 'none'; };

            const isEnrolled = enrolled.has(course.courseId);
            const diff = diffColors[course.difficulty] || { bg: '#f1f5f9', text: '#64748b' };

            // Estimate total time for the course
            const totalMinutes = course.moduleCount * EST_MINUTES_PER_MODULE;
            const estTimeLabel = totalMinutes >= 60
                ? `~${Math.round(totalMinutes / 60)}h`
                : `~${totalMinutes}m`;

            card.innerHTML = `
                ${isRecommended ? '<div style="position:absolute; top:-8px; right:12px; background:linear-gradient(135deg, #667eea, #764ba2); color:white; padding:2px 10px; border-radius:10px; font-size:10px; font-weight:700;">RECOMMENDED</div>' : ''}
                <div style="min-width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #667eea, #764ba2); display:flex; align-items:center; justify-content:center; font-size:22px;">
                    ${course.icon || '\uD83D\uDCDA'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:700; font-size:15px; color:#333;">${this.escapeHtml(course.title)}</span>
                        ${course.difficulty ? `<span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:${diff.bg}; color:${diff.text};">${course.difficulty}</span>` : ''}
                        ${course.apWeight ? '<span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:#faf5ff; color:#7c3aed;">AP</span>' : ''}
                    </div>
                    ${course.tagline ? `<div style="font-size:13px; color:#555; margin-top:4px; line-height:1.4;">${this.escapeHtml(course.tagline)}</div>` : ''}
                    <div style="font-size:11px; color:#aaa; margin-top:4px; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                        <span>${course.moduleCount} modules</span>
                        <span style="color:#ddd;">&middot;</span>
                        <span><i class="fas fa-clock" style="font-size:9px; margin-right:2px;"></i>${estTimeLabel}</span>
                        ${course.prerequisites.length > 0 ? `<span style="color:#ddd;">&middot;</span><span>Prereq: ${course.prerequisites.join(', ')}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:4px;">
                    <button class="catalog-enroll-btn" data-course-id="${course.courseId}"
                        style="padding:8px 18px; border:none; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; white-space:nowrap;
                        ${isEnrolled
                            ? 'background:#f0f0f0; color:#888; cursor:default;'
                            : 'background:linear-gradient(135deg, #667eea, #764ba2); color:white;'
                        }"
                        ${isEnrolled ? 'disabled' : ''}>
                        ${isEnrolled ? '<i class="fas fa-check" style="margin-right:4px;"></i>Enrolled' : 'Enroll'}
                    </button>
                </div>
            `;

            // Wire up enroll button
            if (!isEnrolled) {
                const btn = card.querySelector('.catalog-enroll-btn');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.enrollInCourse(course.courseId, btn);
                });
            }

            grid.appendChild(card);
        });
    }

    // --------------------------------------------------
    // Enrollment
    // --------------------------------------------------
    async enrollInCourse(courseId, btnEl) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Enrolling...';
        }

        try {
            const res = await csrfFetch('/api/course-sessions/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId }),
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) {
                // If enrollment blocked by billing gate, show upgrade prompt
                if (res.status === 402 && data.upgradeRequired) {
                    this.closeCatalog();
                    if (window.showUpgradePrompt) {
                        window.showUpgradePrompt(data);
                    } else {
                        // Fallback: redirect to pricing page
                        window.location.href = '/pricing.html';
                    }
                } else {
                    this.showToast(data.message || 'Enrollment failed');
                }
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.textContent = 'Enroll';
                }
                return;
            }

            // Close catalog
            this.closeCatalog();

            // Refresh sidebar courses
            await this.loadMySessions();

            // Switch to the new course conversation
            if (data.conversationId && window.sidebar) {
                await window.sidebar.loadSessions();
                await window.sidebar.switchSession(data.conversationId);
            }

            // Show the progress bar
            this.activeCourseSessionId = data.session._id;
            this.updateProgressBar(data.session);
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'block';

            // Show welcome splash in the chat (with course tips for first-time, resume for returning)
            if (data.welcomeData) {
                this.showWelcomeSplash(data.welcomeData, data.resumed || false);
            } else {
                this.showToast(`Enrolled in ${data.session.courseName}! Let's get started.`);
            }

            // Fire course greeting — AI introduces the first module
            this.sendCourseGreeting();

        } catch (err) {
            console.error('[CourseManager] Enrollment error:', err);
            this.showToast('Something went wrong. Please try again.');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Enroll';
            }
        }
    }

    // --------------------------------------------------
    // Activate a course (from sidebar click)
    // --------------------------------------------------
    async activateCourse(sessionId) {
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/activate`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) return;

            const session = data.session;

            // Switch sidebar to the course conversation
            if (session.conversationId && window.sidebar) {
                await window.sidebar.loadSessions();
                await window.sidebar.switchSession(session.conversationId);
            }

            // Show progress bar
            this.activeCourseSessionId = session._id;
            this.updateProgressBar(session);
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'block';

            // Switch sidebar to course context (hides sessions, leaderboard, quests)
            if (window.sidebar) window.sidebar.setContext('course');

            // Fire silent course greeting — AI introduces the course/module
            this.sendCourseGreeting();

        } catch (err) {
            console.error('[CourseManager] Failed to activate course:', err);
        }
    }

    // --------------------------------------------------
    // Silent Course Greeting
    // Calls /api/course-chat with isGreeting flag so the AI
    // greets the student with full course/module context.
    // No user message is shown — it appears tutor-initiated.
    // --------------------------------------------------
    async sendCourseGreeting() {
        try {
            // Show thinking indicator while greeting loads
            if (window.showThinkingIndicator) window.showThinkingIndicator(true);

            const res = await csrfFetch('/api/course-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isGreeting: true }),
                credentials: 'include'
            });

            if (window.showThinkingIndicator) window.showThinkingIndicator(false);

            const data = await res.json();

            // If the current module is a checkpoint, open the card-based UI instead of chat
            if (data.isCheckpoint && window.floatingCheckpoint) {
                window.floatingCheckpoint.open({ title: data.checkpointTitle });
                return;
            }

            if (data.text && window.appendMessage) {
                window.appendMessage(data.text, 'ai');
            }
            // Feed the lesson tracker from greeting response
            if (data.progressUpdate && window.lessonTracker) {
                window.lessonTracker.update(data.progressUpdate);
            }
        } catch (err) {
            if (window.showThinkingIndicator) window.showThinkingIndicator(false);
            console.error('[CourseManager] Course greeting failed:', err);
        }
    }

    // --------------------------------------------------
    // Exit Course (deactivate — return to general tutoring)
    // --------------------------------------------------
    async exitCourse() {
        this.closeProgressDropdown();

        const confirmed = await this.showConfirmation({
            icon: '📖',
            title: 'Exit this lesson?',
            message: 'Your progress is saved — you can pick up where you left off anytime.',
            confirmLabel: 'Exit Lesson',
            confirmClass: 'secondary',
            cancelLabel: 'Keep Learning'
        });

        if (!confirmed) return;

        try {
            await csrfFetch('/api/course-sessions/deactivate', {
                method: 'POST',
                credentials: 'include'
            });

            // Hide progress bar and lesson tracker
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'none';
            if (window.lessonTracker) window.lessonTracker.hide();
            this.activeCourseSessionId = null;

            // Switch sidebar back to general context
            if (window.sidebar) window.sidebar.setContext('general');

            // Start a fresh general chat session so the user isn't
            // left staring at stale course messages
            if (window.sidebar) {
                await window.sidebar.loadSessions();
                await window.sidebar.createNewSession();
            }

            this.showToast('Returned to general tutoring');
        } catch (err) {
            console.error('[CourseManager] Failed to exit course:', err);
        }
    }

    // --------------------------------------------------
    // Drop Course (remove from My Courses via X button)
    // --------------------------------------------------
    async dropCourse(sessionId) {
        const session = this.courseSessions.find(s => s._id === sessionId);
        const name = this.formatCourseName(session?.courseName || 'this course');

        const confirmed = await this.showConfirmation({
            icon: '👋',
            title: `Leave "${name}"?`,
            message: 'Your progress will be saved and you can re-enroll later.',
            confirmLabel: 'Leave Course',
            confirmClass: 'danger',
            cancelLabel: 'Stay Enrolled'
        });

        if (!confirmed) return;

        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/drop`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) {
                this.showToast(data.message || 'Failed to leave course');
                return;
            }

            // If this was the active course, hide the progress bar
            if (this.activeCourseSessionId === sessionId) {
                const wrapper = document.getElementById('course-progress-wrapper');
                if (wrapper) wrapper.style.display = 'none';
                this.activeCourseSessionId = null;
                this.closeProgressDropdown();
            }

            // Refresh sidebar courses
            await this.loadMySessions();

            this.showToast(`Left "${name}"`);
        } catch (err) {
            console.error('[CourseManager] Failed to drop course:', err);
            this.showToast('Something went wrong');
        }
    }

    // --------------------------------------------------
    // Next Lesson (placeholder — advances module scaffold)
    // --------------------------------------------------
    onNextLesson() {
        // Prompt the AI to move on by injecting text and triggering send
        const input = document.getElementById('user-input');
        if (input) {
            input.textContent = "I'm ready for the next lesson!";
            input.focus();
            // Trigger submit via the send button
            const sendBtn = document.getElementById('send-button');
            if (sendBtn) sendBtn.click();
        }
        this.closeProgressDropdown();
    }

    // --------------------------------------------------
    // Welcome splash (shown in chat after enrollment)
    // --------------------------------------------------
    showWelcomeSplash(welcome, isResume = false) {
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const splash = document.createElement('div');
        splash.className = 'course-welcome-splash';
        splash.style.cssText = `
            margin: 20px auto; max-width: 520px; border-radius: 16px; overflow: hidden;
            box-shadow: 0 4px 20px rgba(102,126,234,0.15); animation: catalogSlideIn 0.4s ease;
        `;

        // Build unit list (first 6)
        const units = (welcome.units || []);
        const unitListHtml = units.map((u, i) =>
            `<div style="display:flex; align-items:center; gap:8px; padding:6px 0;">
                <div style="width:24px; height:24px; border-radius:50%; background:${i === 0 ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#e2e8f0'}; color:${i === 0 ? 'white' : '#888'}; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">${i + 1}</div>
                <span style="font-size:13px; color:${i === 0 ? '#333' : '#666'}; font-weight:${i === 0 ? '600' : '400'};">${this.escapeHtml(u)}</span>
            </div>`
        ).join('');

        // Course mini-tour tips (shown below the learning path for first-time enrollees)
        const courseTipsHtml = isResume ? '' : `
            <div class="course-tips" style="margin-top:16px; border-top:1px solid #f0f0f0; padding-top:14px;">
                <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#667eea; letter-spacing:0.05em; margin-bottom:10px;">
                    <i class="fas fa-lightbulb" style="margin-right:4px;"></i> How Courses Work
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">1</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">Your tutor leads the lesson</div>
                            <div style="font-size:12px; color:#777;">No need to pick a topic &mdash; your AI tutor teaches concepts, walks through examples, then gives you practice problems.</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">2</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">Progress bar tracks your journey</div>
                            <div style="font-size:12px; color:#777;">The bar at the top shows your current module and step. Click it to see all modules and your overall progress.</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">3</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">You advance by showing mastery</div>
                            <div style="font-size:12px; color:#777;">Solve practice problems correctly and your tutor will move you to the next step automatically. No rushing &mdash; go at your own pace.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        splash.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 24px; color: white; text-align: center;">
                <div style="font-size: 36px; margin-bottom: 8px;">${isResume ? '👋' : '🎓'}</div>
                <h2 style="margin: 0 0 4px; font-size: 20px; font-weight: 700;">${isResume ? 'Welcome Back!' : 'Welcome to'} ${this.escapeHtml(welcome.courseName)}</h2>
                <p style="margin: 0; opacity: 0.9; font-size: 13px;">${welcome.moduleCount} modules · Self-paced · AI-guided</p>
            </div>
            <div style="padding: 20px; background: white;">
                ${welcome.overview ? `<p style="font-size: 13px; color: #555; margin: 0 0 16px; line-height: 1.5;">${this.escapeHtml(welcome.overview)}</p>` : ''}
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.05em; margin-bottom: 8px;">Your Learning Path</div>
                ${unitListHtml}
                ${units.length < welcome.moduleCount ? `<div style="font-size: 12px; color: #aaa; padding: 4px 0 0 32px;">+${welcome.moduleCount - units.length} more modules</div>` : ''}
                ${courseTipsHtml}
                <div style="margin-top: 16px; padding: 8px 12px; background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; font-size: 11px; color: #b45309; display: flex; align-items: flex-start; gap: 6px;">
                    <i class="fas fa-circle-exclamation" style="margin-top: 1px; flex-shrink: 0;"></i>
                    <span><strong>Disclaimer:</strong> These courses do not count for academic credit and are not meant to replace in-person instruction.</span>
                </div>
                <button onclick="this.closest('.course-welcome-splash').remove()" style="
                    margin-top: 16px; width: 100%; padding: 12px; border: none; border-radius: 10px;
                    background: linear-gradient(135deg, #667eea, #764ba2); color: white;
                    font-weight: 700; font-size: 14px; cursor: pointer;
                "><i class="fas fa-play" style="margin-right: 6px;"></i>${isResume ? 'Continue Learning' : `Start ${this.escapeHtml(welcome.firstModuleTitle)}`}</button>
            </div>
        `;

        chatBox.appendChild(splash);
        splash.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --------------------------------------------------
    // Utilities
    // --------------------------------------------------
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /** Turn slug-style names like "ap-calculus-ab" into "AP Calculus AB" */
    formatCourseName(name) {
        if (!name) return '';
        // Already looks like a proper name (contains spaces and no hyphens between words)
        if (/[A-Z]/.test(name) && name.includes(' ')) return name;
        const UPPER = new Set(['ap', 'ab', 'bc', 'act', 'sat']);
        return name.split('-').map(w => UPPER.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: #333; color: white; padding: 12px 24px; border-radius: 10px;
            font-size: 14px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: fadeInUp 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Styled confirmation modal — replaces native confirm() dialogs.
     * Returns a Promise<boolean>.
     */
    showConfirmation({ icon = '', title = 'Are you sure?', message = '', confirmLabel = 'Confirm', confirmClass = 'primary', cancelLabel = 'Cancel' }) {
        return new Promise(resolve => {
            // Remove any existing confirmation
            document.querySelector('.course-confirm-overlay')?.remove();

            const overlay = document.createElement('div');
            overlay.className = 'course-confirm-overlay';
            overlay.innerHTML = `
                <div class="course-confirm-card">
                    ${icon ? `<div class="course-confirm-icon">${icon}</div>` : ''}
                    <div class="course-confirm-title">${this.escapeHtml(title)}</div>
                    <div class="course-confirm-message">${this.escapeHtml(message)}</div>
                    <div class="course-confirm-actions">
                        <button class="course-confirm-btn secondary" data-action="cancel">${this.escapeHtml(cancelLabel)}</button>
                        <button class="course-confirm-btn ${confirmClass}" data-action="confirm">${this.escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            `;

            // Close on overlay background click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve(false);
                }
            });

            // Button handlers
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });
            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                overlay.remove();
                resolve(true);
            });

            document.body.appendChild(overlay);

            // Auto-focus the cancel button (safe default)
            overlay.querySelector('[data-action="cancel"]').focus();
        });
    }
}

// Auto-initialise after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.courseManager = new CourseManager();
});

console.log('[CourseManager] Module loaded');

;
/* --- /js/lessonTracker.js --- */
// ============================================
// LESSON PROGRESS TRACKER
// Renders a student-safe, calm progress UI from
// the server-authoritative progressUpdate payload.
// Called on every /api/course-chat response and
// on page load via the rehydration endpoint.
// ============================================

class LessonTracker {
    constructor() {
        this._lastUpdate = null;
        this._devMode = false; // Toggle via LessonTracker.dev()
        this._initialized = false;
    }

    // --------------------------------------------------
    // Public API
    // --------------------------------------------------

    /**
     * Update the tracker with a progressUpdate payload.
     * Called after every course-chat response.
     */
    update(progressUpdate) {
        if (!progressUpdate) return;
        this._lastUpdate = progressUpdate;
        this._render(progressUpdate);
    }

    /**
     * Rehydrate: fetch progress from server and render.
     * Called on page load, tab refocus, reconnect.
     */
    async rehydrate(sessionId) {
        if (!sessionId) return;
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/lesson-progress`, {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success && data.progressUpdate) {
                this.update(data.progressUpdate);
            }
        } catch (err) {
            console.warn('[LessonTracker] Rehydration failed:', err);
        }
    }

    /**
     * Show the tracker (when entering a course).
     */
    show() {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper) wrapper.style.display = 'block';
    }

    /**
     * Hide the tracker (when exiting a course).
     */
    hide() {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    }

    /**
     * Toggle dev overlay for debugging.
     */
    static dev() {
        if (window.lessonTracker) {
            window.lessonTracker._devMode = !window.lessonTracker._devMode;
            if (window.lessonTracker._lastUpdate) {
                window.lessonTracker._render(window.lessonTracker._lastUpdate);
            }
            console.log(`[LessonTracker] Dev mode: ${window.lessonTracker._devMode ? 'ON' : 'OFF'}`);
        }
    }

    // --------------------------------------------------
    // Rendering
    // --------------------------------------------------

    _render(pu) {
        // Lesson breadcrumb (shows module > lesson context)
        this._renderBreadcrumb(pu);

        // Phase dots
        this._renderPhaseDots(pu.phaseGroups);

        // Main progress bar — use server-computed displayPct directly (no client math)
        const displayPct = pu.displayPct || 0;
        const fill = document.getElementById('lt-progress-fill');
        const stepText = document.getElementById('lt-step-label');
        const phaseText = document.getElementById('lt-phase-label');

        if (fill) {
            fill.style.width = `${displayPct}%`;
        }
        if (stepText) {
            stepText.textContent = pu.stepLabel || '';
        }
        if (phaseText) {
            phaseText.textContent = pu.phaseLabel || '';
        }

        // Details panel (expandable)
        this._renderDetails(pu);

        // Dev overlay
        this._renderDevOverlay(pu);

        // Ensure visibility
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper && wrapper.style.display === 'none') {
            wrapper.style.display = 'block';
        }
    }

    _renderBreadcrumb(pu) {
        const container = document.getElementById('lt-breadcrumb');
        if (!container) return;

        // Build breadcrumb from course progress data
        // The lessonId in progressUpdate maps to the current lesson
        const session = window.courseManager?.courseSessions?.find(
            s => s._id === pu.sessionId
        );

        if (!session) {
            container.style.display = 'none';
            return;
        }

        const currentMod = (session.modules || []).find(
            m => m.moduleId === session.currentModuleId
        );

        if (!currentMod) {
            container.style.display = 'none';
            return;
        }

        const parts = [];
        if (currentMod.title) parts.push(currentMod.title);

        const currentLesson = session.currentLessonId && currentMod.lessons
            ? currentMod.lessons.find(l => l.lessonId === session.currentLessonId)
            : null;
        if (currentLesson?.title) parts.push(currentLesson.title);

        if (parts.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = `
            <i class="fas fa-book-open lt-breadcrumb-icon"></i>
            ${parts.map((p, i) =>
                (i > 0 ? '<span class="lt-breadcrumb-sep">\u203A</span>' : '') +
                (i === parts.length - 1
                    ? `<span class="lt-breadcrumb-lesson">${this._escapeHtml(p)}</span>`
                    : `<span>${this._escapeHtml(p)}</span>`)
            ).join('')}
        `;
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _renderPhaseDots(phaseGroups) {
        const container = document.getElementById('lt-phase-dots');
        if (!container || !phaseGroups) return;

        container.innerHTML = phaseGroups.map(pg => {
            let dotClass = 'lt-dot-future';
            let icon = '';
            if (pg.status === 'completed') {
                dotClass = 'lt-dot-completed';
                icon = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            } else if (pg.status === 'current') {
                dotClass = 'lt-dot-current';
                icon = '<div class="lt-dot-pulse"></div>';
            }

            return `
                <div class="lt-phase-group ${dotClass}" title="${pg.label}">
                    <div class="lt-dot">${icon}</div>
                    <span class="lt-dot-label">${pg.label}</span>
                </div>
            `;
        }).join('<div class="lt-dot-connector"></div>');
    }

    _renderDetails(pu) {
        const panel = document.getElementById('lt-details-panel');
        if (!panel) return;

        let html = `<div class="lt-detail-row"><span class="lt-detail-key">Phase</span><span class="lt-detail-val">${pu.phaseGroupLabel || ''}</span></div>`;

        if (pu.uiFlags?.showAccuracy && pu.problemsAttempted > 0) {
            html += `<div class="lt-detail-row"><span class="lt-detail-key">Accuracy</span><span class="lt-detail-val">${pu.problemsCorrect}/${pu.problemsAttempted} correct</span></div>`;
        }

        // Streak: count recent consecutive correct
        if (pu.problemsCorrect > 0) {
            html += `<div class="lt-detail-row"><span class="lt-detail-key">Progress</span><span class="lt-detail-val lt-streak">${pu.problemsCorrect} problem${pu.problemsCorrect !== 1 ? 's' : ''} solved</span></div>`;
        }

        panel.innerHTML = html;
    }

    _renderDevOverlay(pu) {
        let overlay = document.getElementById('lt-dev-overlay');
        if (!this._devMode) {
            if (overlay) overlay.style.display = 'none';
            return;
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'lt-dev-overlay';
            overlay.className = 'lt-dev-overlay';
            const wrapper = document.getElementById('lesson-tracker-wrapper');
            if (wrapper) wrapper.appendChild(overlay);
        }
        overlay.style.display = 'block';
        overlay.innerHTML = `<pre style="margin:0;font-size:10px;line-height:1.3;color:#8b5cf6;white-space:pre-wrap;">${JSON.stringify(pu, null, 2)}</pre>`;
    }
}

// --------------------------------------------------
// Tab refocus rehydration
// --------------------------------------------------
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.lessonTracker && window.courseManager?.activeCourseSessionId) {
        window.lessonTracker.rehydrate(window.courseManager.activeCourseSessionId);
    }
});

// Auto-initialise
document.addEventListener('DOMContentLoaded', () => {
    window.lessonTracker = new LessonTracker();

    // Wire up the details toggle
    const toggle = document.getElementById('lt-details-toggle');
    const panel = document.getElementById('lt-details-panel');
    if (toggle && panel) {
        toggle.addEventListener('click', () => {
            const expanded = panel.classList.toggle('expanded');
            toggle.classList.toggle('expanded', expanded);
        });
    }

    console.log('[LessonTracker] Initialised. Use LessonTracker.dev() to toggle debug overlay.');
});

console.log('[LessonTracker] Module loaded');
