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
        this.mode = 'user'; // 'user', 'ai', 'collaborative'

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
        this.resizeCanvas();
        this.saveState();

        console.log('✅ Mathmatix Whiteboard initialized');
    }

    setupEventListeners() {
        // Canvas events
        this.canvas.on('mouse:down', (e) => this.onMouseDown(e));
        this.canvas.on('mouse:move', (e) => this.onMouseMove(e));
        this.canvas.on('mouse:up', (e) => this.onMouseUp(e));
        this.canvas.on('object:added', () => this.onCanvasModified());

        // Resize observer
        const resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        resizeObserver.observe(this.panel);

        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());
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

        const arrowHead = new fabric.Triangle({
            left: x2,
            top: y2,
            angle: (angle * 180 / Math.PI) + 90,
            width: headLength,
            height: headLength,
            fill: this.currentColor,
            originX: 'center',
            originY: 'center',
        });

        return new fabric.Group([line, arrowHead], { selectable: false });
    }

    updateArrow(arrow, x1, y1, x2, y2) {
        const objects = arrow.getObjects();
        const line = objects[0];
        const head = objects[1];

        line.set({ x2: x2 - x1, y2: y2 - y1 });

        const angle = Math.atan2(y2 - y1, x2 - x1);
        head.set({
            left: x2 - x1,
            top: y2 - y1,
            angle: (angle * 180 / Math.PI) + 90,
        });

        arrow.addWithUpdate();
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
            showLabels = true
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
            color = '#667eea',
            strokeWidth = 3,
            samples = 200
        } = options;

        try {
            // Parse function (simple evaluation)
            const func = new Function('x', `return ${funcString.replace(/\^/g, '**')}`);

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

    onCanvasModified() {
        this.saveState();
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
    // AI DRAWING METHODS
    // ============================================

    async renderAIDrawing(sequence, delay = 300) {
        this.mode = 'ai';
        this.show();

        for (const item of sequence) {
            await this.renderDrawingItem(item);
            await this.sleep(delay);
        }

        this.mode = 'collaborative';
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
}

// Export for use in other scripts
window.MathmatixWhiteboard = MathmatixWhiteboard;
