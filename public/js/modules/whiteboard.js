// public/js/modules/whiteboard.js
// Whiteboard system — SHELVED FOR BETA
// Extracted from script.js to reduce file size.
// To re-enable: import and call initWhiteboardSystem() inside DOMContentLoaded.

import { showToast } from './helpers.js';

// Module-level state
let whiteboard = null;
let fabricCanvas = null;
let whiteboardState = {
    currentTool: 'pen',
    currentColor: '#000000',
    brushSize: 3,
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentShape: null
};

/**
 * Initialize the full whiteboard system.
 * Call this inside DOMContentLoaded when the feature is un-shelved.
 * @param {Object} deps - { getAttachedFile, setAttachedFile, showFilePill, getUserInput, getCurrentUser }
 * @returns {{ whiteboard, fabricCanvas }}
 */
export function initWhiteboardSystem(deps = {}) {
    initializeWhiteboard();
    return { whiteboard, fabricCanvas };
}

function initializeWhiteboard() {
    if (document.getElementById('tutor-canvas') && window.MathmatixWhiteboard) {
        whiteboard = new MathmatixWhiteboard('tutor-canvas', 'whiteboard-panel');
        window.whiteboard = whiteboard;
        fabricCanvas = whiteboard.canvas;

        setupWhiteboardToolbar();

        const toggleBtn = document.getElementById('toggle-whiteboard-btn');
        const whiteboardPanel = document.getElementById('whiteboard-panel');
        const openWhiteboardBtn = document.getElementById('open-whiteboard-btn');

        if (toggleBtn && whiteboardPanel) {
            toggleBtn.addEventListener('click', () => {
                const isHidden = whiteboardPanel.classList.contains('is-hidden');

                if (isHidden) {
                    if (window.whiteboard && typeof window.whiteboard.show === 'function') {
                        window.whiteboard.show();
                    } else {
                        whiteboardPanel.classList.remove('is-hidden');
                    }
                    if (openWhiteboardBtn) {
                        openWhiteboardBtn.classList.add('hidden');
                    }
                } else {
                    if (window.whiteboard && typeof window.whiteboard.hide === 'function') {
                        window.whiteboard.hide();
                    } else {
                        whiteboardPanel.classList.add('is-hidden');
                    }
                    if (openWhiteboardBtn) {
                        openWhiteboardBtn.classList.remove('hidden');
                    }
                }
            });
        }

        if (openWhiteboardBtn && whiteboardPanel) {
            openWhiteboardBtn.addEventListener('click', () => {
                if (window.whiteboard && typeof window.whiteboard.show === 'function') {
                    window.whiteboard.show();
                } else {
                    whiteboardPanel.classList.remove('is-hidden');
                }
                openWhiteboardBtn.classList.add('hidden');
            });
        }

        console.log('✅ Modern whiteboard initialized');
    }
}

function setupWhiteboardToolbar() {
    const tools = ['select', 'pen', 'highlighter', 'eraser', 'line', 'arrow',
                  'rectangle', 'circle', 'triangle', 'text'];

    tools.forEach(tool => {
        const btn = document.getElementById(`tool-${tool}`);
        if (btn) {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                whiteboard.setTool(tool);
            });
        }
    });

    // Arrow mode dropdown
    const arrowBtn = document.getElementById('tool-arrow');
    const arrowModeMenu = document.getElementById('arrow-mode-menu');

    if (arrowBtn && arrowModeMenu) {
        arrowBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            arrowModeMenu.style.display = arrowModeMenu.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (!arrowBtn.contains(e.target) && !arrowModeMenu.contains(e.target)) {
                arrowModeMenu.style.display = 'none';
            }
        });

        const arrowModeOptions = arrowModeMenu.querySelectorAll('.arrow-mode-option');
        arrowModeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const mode = option.getAttribute('data-mode');
                whiteboard.setArrowMode(mode);

                const modeIcons = {
                    'end': '→',
                    'start': '←',
                    'both': '↔',
                    'none': '—'
                };
                arrowBtn.setAttribute('data-tooltip', `Arrow (${modeIcons[mode]})`);
                arrowModeMenu.style.display = 'none';
            });
        });
    }

    // Math tools
    const gridBtn = document.getElementById('tool-grid');
    if (gridBtn) {
        gridBtn.addEventListener('click', () => {
            whiteboard.addCoordinateGrid();
        });
    }

    const graphBtn = document.getElementById('tool-graph');
    if (graphBtn) {
        graphBtn.addEventListener('click', () => {
            const funcStr = prompt('Enter function (e.g., x^2, 2x+1, Math.sin(x)):');
            if (funcStr) {
                whiteboard.addCoordinateGrid();
                whiteboard.plotFunction(funcStr);
            }
        });
    }

    const protractorBtn = document.getElementById('tool-protractor');
    if (protractorBtn) {
        protractorBtn.addEventListener('click', () => {
            whiteboard.addProtractor(whiteboard.canvas.width / 2, whiteboard.canvas.height / 2);
        });
    }

    // Background menu dropdown
    const backgroundMenuBtn = document.getElementById('background-menu-btn');
    const backgroundMenu = document.getElementById('background-menu');
    const bgUploadInput = document.getElementById('whiteboard-bg-upload');

    if (backgroundMenuBtn && backgroundMenu) {
        backgroundMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            backgroundMenu.style.display = backgroundMenu.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', (e) => {
            if (!backgroundMenuBtn.contains(e.target) && !backgroundMenu.contains(e.target)) {
                backgroundMenu.style.display = 'none';
            }
        });

        const bgOptions = backgroundMenu.querySelectorAll('.bg-option');
        bgOptions.forEach(option => {
            option.addEventListener('click', () => {
                const bgType = option.getAttribute('data-bg');

                if (bgType === 'upload') {
                    bgUploadInput.click();
                } else {
                    whiteboard.setPresetBackground(bgType);
                }

                backgroundMenu.style.display = 'none';
            });
        });

        if (bgUploadInput) {
            bgUploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (file.type.startsWith('image/')) {
                        whiteboard.setBackgroundImage(file);
                    } else if (file.type === 'application/pdf') {
                        alert('PDF support coming soon! For now, please convert to an image or take a screenshot.');
                    } else {
                        alert('Please upload an image file (PNG, JPG, etc.)');
                    }
                }
                bgUploadInput.value = '';
            });
        }
    }

    // Color picker
    const colorPicker = document.getElementById('color-picker');
    const colorDisplay = document.querySelector('.color-display');
    if (colorPicker && colorDisplay) {
        colorPicker.addEventListener('change', (e) => {
            whiteboard.setColor(e.target.value);
            colorDisplay.style.color = e.target.value;
        });
    }

    // Stroke width
    const strokeSlider = document.getElementById('stroke-width-slider');
    if (strokeSlider) {
        strokeSlider.addEventListener('input', (e) => {
            whiteboard.setStrokeWidth(e.target.value);
        });
    }

    // Action buttons
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => whiteboard.undo());
    }

    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) {
        redoBtn.addEventListener('click', () => whiteboard.redo());
    }

    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => whiteboard.deleteSelected());
    }

    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear entire whiteboard?')) {
                whiteboard.clear();
            }
        });
    }

    // Export menu with dropdown
    const downloadBtn = document.getElementById('download-btn');
    const exportMenu = document.getElementById('export-menu');
    if (downloadBtn && exportMenu) {
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
        });

        document.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const exportType = e.currentTarget.dataset.export;
                switch(exportType) {
                    case 'png':
                        whiteboard.exportToPNG();
                        break;
                    case 'pdf':
                        whiteboard.exportToPDF();
                        break;
                    case 'clipboard':
                        whiteboard.copyToClipboard();
                        break;
                }
                exportMenu.style.display = 'none';
            });
        });

        document.addEventListener('click', (e) => {
            if (!downloadBtn.contains(e.target) && !exportMenu.contains(e.target)) {
                exportMenu.style.display = 'none';
            }
        });
    }

    // Region overlay toggle
    const regionOverlayBtn = document.getElementById('region-overlay-btn');
    if (regionOverlayBtn) {
        regionOverlayBtn.addEventListener('click', () => {
            whiteboard.toggleRegionOverlay();
            regionOverlayBtn.classList.toggle('active');
        });
    }

    // Shortcuts help
    const shortcutsHelpBtn = document.getElementById('shortcuts-help-btn');
    if (shortcutsHelpBtn) {
        shortcutsHelpBtn.addEventListener('click', () => {
            whiteboard.toggleShortcutsPanel();
        });
    }

    const sendToAiBtn = document.getElementById('send-to-ai-btn');
    if (sendToAiBtn) {
        sendToAiBtn.addEventListener('click', async () => {
            try {
                const dataURL = whiteboard.canvas.toDataURL({
                    format: 'png',
                    quality: 1,
                    multiplier: 2
                });

                const response = await fetch(dataURL);
                const blob = await response.blob();

                if (!blob) {
                    alert('Failed to capture whiteboard. Please try again.');
                    return;
                }

                const file = new File([blob], 'whiteboard-drawing.png', { type: 'image/png' });

                if (window.handleFileUpload) {
                    window.handleFileUpload(file);
                } else {
                    console.error('handleFileUpload not found');
                }

                const userInput = document.getElementById('user-input');
                if (userInput && !userInput.textContent.trim()) {
                    userInput.textContent = 'Can you help me with this?';
                }

                if (userInput) {
                    userInput.focus();
                    userInput.select();
                }

                console.log('✅ Whiteboard screenshot attached! Click send when ready.');
            } catch (error) {
                console.error('Error capturing whiteboard:', error);
                alert('Failed to capture whiteboard. Please try again.');
            }
        });
    }

    const openWhiteboardBtn = document.getElementById('open-whiteboard-btn');
    if (openWhiteboardBtn) {
        openWhiteboardBtn.addEventListener('click', () => {
            whiteboard.show();
            openWhiteboardBtn.classList.add('hidden');
        });
    }
}

function updateDrawingMode() {
    if (whiteboardState.currentTool === 'pen') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.selection = false;
        fabricCanvas.freeDrawingBrush.color = whiteboardState.currentColor;
        fabricCanvas.freeDrawingBrush.width = whiteboardState.brushSize;
    } else if (whiteboardState.currentTool === 'eraser') {
        fabricCanvas.isDrawingMode = true;
        fabricCanvas.freeDrawingBrush.color = '#ffffff';
        fabricCanvas.freeDrawingBrush.width = whiteboardState.brushSize * 2;
        fabricCanvas.selection = false;
    } else {
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = false;
    }
}

function setupWhiteboardDrawing() {
    fabricCanvas.on('mouse:down', function(options) {
        if (fabricCanvas.isDrawingMode) return;

        const pointer = fabricCanvas.getPointer(options.e);
        whiteboardState.isDrawing = true;
        whiteboardState.startX = pointer.x;
        whiteboardState.startY = pointer.y;

        switch (whiteboardState.currentTool) {
            case 'line':
                whiteboardState.currentShape = new fabric.Line(
                    [pointer.x, pointer.y, pointer.x, pointer.y],
                    {
                        stroke: whiteboardState.currentColor,
                        strokeWidth: whiteboardState.brushSize,
                        selectable: false
                    }
                );
                fabricCanvas.add(whiteboardState.currentShape);
                break;

            case 'circle':
                whiteboardState.currentShape = new fabric.Circle({
                    left: pointer.x,
                    top: pointer.y,
                    radius: 1,
                    stroke: whiteboardState.currentColor,
                    strokeWidth: whiteboardState.brushSize,
                    fill: 'transparent',
                    selectable: false,
                    originX: 'center',
                    originY: 'center'
                });
                fabricCanvas.add(whiteboardState.currentShape);
                break;

            case 'rectangle':
                whiteboardState.currentShape = new fabric.Rect({
                    left: pointer.x,
                    top: pointer.y,
                    width: 1,
                    height: 1,
                    stroke: whiteboardState.currentColor,
                    strokeWidth: whiteboardState.brushSize,
                    fill: 'transparent',
                    selectable: false
                });
                fabricCanvas.add(whiteboardState.currentShape);
                break;

            case 'text':
                const text = prompt('Enter text:');
                if (text) {
                    const textObj = new fabric.Text(text, {
                        left: pointer.x,
                        top: pointer.y,
                        fill: whiteboardState.currentColor,
                        fontSize: whiteboardState.brushSize * 5,
                        selectable: false
                    });
                    fabricCanvas.add(textObj);
                }
                whiteboardState.isDrawing = false;
                break;
        }
    });

    fabricCanvas.on('mouse:move', function(options) {
        if (!whiteboardState.isDrawing || !whiteboardState.currentShape) return;

        const pointer = fabricCanvas.getPointer(options.e);

        switch (whiteboardState.currentTool) {
            case 'line':
                whiteboardState.currentShape.set({
                    x2: pointer.x,
                    y2: pointer.y
                });
                break;

            case 'circle':
                const radius = Math.sqrt(
                    Math.pow(pointer.x - whiteboardState.startX, 2) +
                    Math.pow(pointer.y - whiteboardState.startY, 2)
                );
                whiteboardState.currentShape.set({ radius: radius });
                break;

            case 'rectangle':
                whiteboardState.currentShape.set({
                    width: Math.abs(pointer.x - whiteboardState.startX),
                    height: Math.abs(pointer.y - whiteboardState.startY)
                });
                if (pointer.x < whiteboardState.startX) {
                    whiteboardState.currentShape.set({ left: pointer.x });
                }
                if (pointer.y < whiteboardState.startY) {
                    whiteboardState.currentShape.set({ top: pointer.y });
                }
                break;
        }

        fabricCanvas.renderAll();
    });

    fabricCanvas.on('mouse:up', function() {
        whiteboardState.isDrawing = false;
        whiteboardState.currentShape = null;
    });
}

async function shareWhiteboardWithAI() {
    if (!fabricCanvas) return;

    try {
        const imageData = fabricCanvas.toDataURL({
            format: 'png',
            quality: 0.8
        });

        const response = await fetch(imageData);
        const blob = await response.blob();
        const file = new File([blob], 'whiteboard.png', { type: 'image/png' });

        if (window.handleFileUpload) {
            window.handleFileUpload(file);
        }

        const filePillContainer = document.getElementById('file-pill-container');
        if (filePillContainer) {
            filePillContainer.innerHTML = `
                <div class="file-pill">
                    <span class="file-name">📋 Whiteboard snapshot</span>
                    <button class="remove-file-btn" onclick="removeAttachedFile()">×</button>
                </div>
            `;
        }

        const userInput = document.getElementById('user-input');
        if (userInput && !userInput.textContent.trim()) {
            userInput.textContent = "Can you help me with this problem I drew on the whiteboard?";
        }

        showToast('Whiteboard snapshot attached! Click send to share with AI.', 3000);
    } catch (error) {
        console.error('Error sharing whiteboard:', error);
        showToast('Failed to share whiteboard. Please try again.', 3000);
    }
}

function drawBackgroundTemplate(templateType) {
    if (!fabricCanvas) return;

    const objects = fabricCanvas.getObjects();
    objects.forEach(obj => {
        if (obj.isBackground) {
            fabricCanvas.remove(obj);
        }
    });

    if (templateType === 'none') {
        fabricCanvas.renderAll();
        return;
    }

    const width = fabricCanvas.width;
    const height = fabricCanvas.height;
    const gridColor = '#e0e0e0';
    const axisColor = '#12B3B3';
    const labelColor = '#666';

    switch (templateType) {
        case 'coordinate-grid':
            drawCoordinateGrid(width, height, gridColor, axisColor, labelColor);
            break;
        case 'number-line':
            drawNumberLine(width, height, axisColor, labelColor);
            break;
        case 'graph-paper':
            drawGraphPaper(width, height, gridColor);
            break;
        case 'algebra-tiles':
            drawAlgebraTilesMat(width, height, gridColor);
            break;
    }

    fabricCanvas.renderAll();
}

function drawCoordinateGrid(width, height, gridColor, axisColor, labelColor) {
    const centerX = width / 2;
    const centerY = height / 2;
    const spacing = Math.min(width, height) / 20;

    for (let i = -10; i <= 10; i++) {
        const x = centerX + (i * spacing);
        const vLine = new fabric.Line([x, 0, x, height], {
            stroke: gridColor,
            strokeWidth: 1,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(vLine);

        const y = centerY + (i * spacing);
        const hLine = new fabric.Line([0, y, width, y], {
            stroke: gridColor,
            strokeWidth: 1,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(hLine);
    }

    const xAxis = new fabric.Line([0, centerY, width, centerY], {
        stroke: axisColor,
        strokeWidth: 2,
        selectable: false,
        evented: false,
        isBackground: true
    });
    fabricCanvas.add(xAxis);

    const yAxis = new fabric.Line([centerX, 0, centerX, height], {
        stroke: axisColor,
        strokeWidth: 2,
        selectable: false,
        evented: false,
        isBackground: true
    });
    fabricCanvas.add(yAxis);

    for (let i = -10; i <= 10; i += 2) {
        if (i === 0) continue;

        const xLabelPos = centerX + (i * spacing);
        const xLabel = new fabric.Text(i.toString(), {
            left: xLabelPos,
            top: centerY + 5,
            fontSize: 12,
            fill: labelColor,
            selectable: false,
            evented: false,
            isBackground: true,
            originX: 'center'
        });
        fabricCanvas.add(xLabel);

        const yLabelPos = centerY - (i * spacing);
        const yLabel = new fabric.Text(i.toString(), {
            left: centerX - 20,
            top: yLabelPos,
            fontSize: 12,
            fill: labelColor,
            selectable: false,
            evented: false,
            isBackground: true,
            originY: 'center'
        });
        fabricCanvas.add(yLabel);
    }

    const origin = new fabric.Text('0', {
        left: centerX - 15,
        top: centerY + 5,
        fontSize: 12,
        fill: labelColor,
        selectable: false,
        evented: false,
        isBackground: true
    });
    fabricCanvas.add(origin);
}

function drawNumberLine(width, height, axisColor, labelColor) {
    const centerY = height / 2;
    const spacing = width / 22;
    const startX = spacing;
    const endX = width - spacing;
    const unit = (endX - startX) / 20;

    const line = new fabric.Line([startX, centerY, endX, centerY], {
        stroke: axisColor,
        strokeWidth: 3,
        selectable: false,
        evented: false,
        isBackground: true
    });
    fabricCanvas.add(line);

    for (let i = -10; i <= 10; i++) {
        const x = startX + (i + 10) * unit;
        const tickHeight = i % 5 === 0 ? 15 : 10;

        const tick = new fabric.Line([x, centerY - tickHeight, x, centerY + tickHeight], {
            stroke: axisColor,
            strokeWidth: 2,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(tick);

        if (i % 2 === 0) {
            const label = new fabric.Text(i.toString(), {
                left: x,
                top: centerY + 25,
                fontSize: 14,
                fill: labelColor,
                selectable: false,
                evented: false,
                isBackground: true,
                originX: 'center'
            });
            fabricCanvas.add(label);
        }
    }

    const arrowSize = 10;
    const leftArrow = new fabric.Triangle({
        left: startX - arrowSize,
        top: centerY,
        width: arrowSize,
        height: arrowSize,
        fill: axisColor,
        angle: -90,
        selectable: false,
        evented: false,
        isBackground: true,
        originX: 'center',
        originY: 'center'
    });
    fabricCanvas.add(leftArrow);

    const rightArrow = new fabric.Triangle({
        left: endX + arrowSize,
        top: centerY,
        width: arrowSize,
        height: arrowSize,
        fill: axisColor,
        angle: 90,
        selectable: false,
        evented: false,
        isBackground: true,
        originX: 'center',
        originY: 'center'
    });
    fabricCanvas.add(rightArrow);
}

function drawGraphPaper(width, height, gridColor) {
    const spacing = 20;

    for (let x = 0; x <= width; x += spacing) {
        const line = new fabric.Line([x, 0, x, height], {
            stroke: gridColor,
            strokeWidth: 1,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(line);
    }

    for (let y = 0; y <= height; y += spacing) {
        const line = new fabric.Line([0, y, width, y], {
            stroke: gridColor,
            strokeWidth: 1,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(line);
    }
}

function drawAlgebraTilesMat(width, height, gridColor) {
    const padding = 40;
    const matWidth = width - (2 * padding);
    const matHeight = height - (2 * padding);

    const border = new fabric.Rect({
        left: padding,
        top: padding,
        width: matWidth,
        height: matHeight,
        stroke: '#12B3B3',
        strokeWidth: 3,
        fill: 'transparent',
        selectable: false,
        evented: false,
        isBackground: true
    });
    fabricCanvas.add(border);

    const divider = new fabric.Line([padding, height / 2, width - padding, height / 2], {
        stroke: '#12B3B3',
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
        isBackground: true
    });
    fabricCanvas.add(divider);

    const posLabel = new fabric.Text('Positive', {
        left: width / 2,
        top: padding + 15,
        fontSize: 16,
        fill: '#16C86D',
        fontWeight: 'bold',
        selectable: false,
        evented: false,
        isBackground: true,
        originX: 'center'
    });
    fabricCanvas.add(posLabel);

    const negLabel = new fabric.Text('Negative', {
        left: width / 2,
        top: height / 2 + 15,
        fontSize: 16,
        fill: '#FF4E4E',
        fontWeight: 'bold',
        selectable: false,
        evented: false,
        isBackground: true,
        originX: 'center'
    });
    fabricCanvas.add(negLabel);

    const gridSpacing = 30;
    for (let x = padding; x <= width - padding; x += gridSpacing) {
        const line = new fabric.Line([x, padding, x, height - padding], {
            stroke: '#f0f0f0',
            strokeWidth: 1,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(line);
    }
    for (let y = padding; y <= height - padding; y += gridSpacing) {
        const line = new fabric.Line([padding, y, width - padding, y], {
            stroke: '#f0f0f0',
            strokeWidth: 1,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(line);
    }
}

function mathToCanvasCoords(mathX, mathY, mathMin = -10, mathMax = 10) {
    if (!fabricCanvas) return { x: 0, y: 0 };

    const canvasWidth = fabricCanvas.width;
    const canvasHeight = fabricCanvas.height;
    const padding = 40;

    const drawWidth = canvasWidth - (2 * padding);
    const drawHeight = canvasHeight - (2 * padding);

    const mathRange = mathMax - mathMin;
    const pixelX = padding + ((mathX - mathMin) / mathRange) * drawWidth;
    const pixelY = padding + ((mathMax - mathY) / mathRange) * drawHeight;

    return { x: pixelX, y: pixelY };
}

async function renderDrawing(sequence, delay = 500) {
    if (!whiteboard) return;
    await whiteboard.renderAIDrawing(sequence, delay);
}

export function makeElementDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = elmnt.querySelector(".dashboard-panel-header");

    if (header) {
        header.onmousedown = dragMouseDown;
    } else {
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}
