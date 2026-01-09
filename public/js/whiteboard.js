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

        console.log('✅ Mathmatix Whiteboard initialized');
    }

    setupEventListeners() {
        // Canvas events
        this.canvas.on('mouse:down', (e) => this.onMouseDown(e));
        this.canvas.on('mouse:move', (e) => this.onMouseMove(e));
        this.canvas.on('mouse:up', (e) => this.onMouseUp(e));
        this.canvas.on('object:added', (e) => this.onObjectAdded(e));
        this.canvas.on('object:modified', (e) => this.onObjectModified(e));

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
            // Preprocess: Handle implicit multiplication (2x -> 2*x, 3x^2 -> 3*x^2, etc.)
            let processedFunc = funcString
                .replace(/(\d+)([a-zA-Z])/g, '$1*$2')  // 2x -> 2*x
                .replace(/\)([a-zA-Z])/g, ')*$1')       // )x -> )*x
                .replace(/([a-zA-Z])\(/g, '$1*(')       // x( -> x*(
                .replace(/\^/g, '**');                  // x^2 -> x**2

            // Parse function (simple evaluation)
            const func = new Function('x', `return ${processedFunc}`);

            const width = this.canvas.width;
            const height = this.canvas.height;
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
                console.error('Not enough valid points to plot');
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
        } catch (error) {
            console.error('Error plotting function:', error);
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
    }

    minimize() {
        this.panel.classList.toggle('minimized');
        this.isMinimized = !this.isMinimized;
    }

    startDragging(e) {
        if (this.isMaximized || e.target.closest('.toolbar-btn')) return;
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

    renderDrawingItem(item) {
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
                const line = new fabric.Line(item.points, {
                    stroke: item.color || '#000',
                    strokeWidth: item.width || 2,
                    selectable: false,
                });
                this.canvas.add(line);
                break;

            case 'text':
                const text = new fabric.Text(item.content, {
                    left: item.position[0],
                    top: item.position[1],
                    fontSize: item.fontSize || 16,
                    fill: item.color || '#000',
                    selectable: false,
                });
                this.canvas.add(text);
                break;

            case 'circle':
                const circle = new fabric.Circle({
                    left: item.position[0],
                    top: item.position[1],
                    radius: item.radius,
                    fill: item.fill || 'transparent',
                    stroke: item.stroke || '#000',
                    strokeWidth: item.strokeWidth || 2,
                    selectable: false,
                });
                this.canvas.add(circle);
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
}

// Export for use in other scripts
window.MathmatixWhiteboard = MathmatixWhiteboard;
