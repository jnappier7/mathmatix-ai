// public/js/script.js

console.log("LOG: Mâˆ†THMâˆ†TIÎ§ AI Initialized");

// --- Global Variables ---
let currentUser = null;
let isPlaying = false;
let audioQueue = [];
let currentAudioSource = null;
let fabricCanvas = null;
let whiteboard = null; // New whiteboard instance
let attachedFile = null;

// Whiteboard state
let whiteboardState = {
    currentTool: 'pen',
    currentColor: '#000000',
    brushSize: 3,
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentShape: null
};

// --- Global Helper Functions ---
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function generateSpeakableText(text) {
    if (!text || !window.MathLive) return text.replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '');
    const latexRegex = /(\\\(|\\\[|\$\$)([\s\S]+?)(\\\)|\\\]|\$\$)/g;
    let result = '';
    let lastIndex = 0;
    text.replace(latexRegex, (match, openDelim, latexContent, closeDelim, offset) => {
        result += text.substring(lastIndex, offset);
        const speakableMath = MathLive.convertLatexToSpeakableText(latexContent, {
            textToSpeechRules: 'sre', textToSpeechRulesOptions: { domain: 'mathspeak', ruleset: 'mathspeak-brief' }
        });
        result += ` ${speakableMath} `;
        lastIndex = offset + match.length;
    });
    if (lastIndex < text.length) { result += text.substring(lastIndex); }
    return result.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '');
}

function triggerXpAnimation(message, isLevelUp = false, isSpecialXp = false) {
    const animationText = document.createElement('div');
    animationText.textContent = message;
    animationText.classList.add('xp-animation-text');
    if (isLevelUp) {
        animationText.classList.add('level-up-animation-text', 'animate-level-up');
        if (typeof confetti === 'function') {
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const brandColors = ['#12B3B3', '#FF3B7F', '#FFFFFF'];
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
            function randomInRange(min, max) { return Math.random() * (max - min) + min; }
            const interval = setInterval(function() {
                const timeLeft = animationEnd - Date.now();
                if (timeLeft <= 0) { return clearInterval(interval); }
                const particleCount = 50 * (timeLeft / duration);
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: brandColors }));
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: brandColors }));
            }, 250);
        }
    } else {
        animationText.classList.add('animate-xp');
        if (isSpecialXp) { animationText.classList.add('special-xp'); }
    }
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        const rect = chatContainer.getBoundingClientRect();
        animationText.style.position = 'fixed';
        animationText.style.top = `${rect.top + (rect.height / 2)}px`;
        animationText.style.left = `${rect.left + (rect.width / 2)}px`;
        animationText.style.transform = 'translate(-50%, -50%)';
    }
    document.body.appendChild(animationText);
    setTimeout(() => { animationText.remove(); }, 3000);
}

function showToast(message, duration = 3000) {
    const toast = document.createElement("div");
    toast.className = "toast-message";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            zIndex: 9999
        });
    }
}


// --- Main Application Logic ---
document.addEventListener("DOMContentLoaded", () => {
    // --- Element Caching ---
    const chatBox = document.getElementById("chat-messages-container");
    const userInput = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-button");
    const micBtn = document.getElementById("mic-button");
    const attachBtn = document.getElementById("attach-button");
    const fileInput = document.getElementById("file-input");
    const thinkingIndicator = document.getElementById("thinking-indicator");
    const settingsBtn = document.getElementById("open-settings-modal-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettingsBtn = document.getElementById("close-settings-modal-btn");
    const handsFreeToggle = document.getElementById("handsFreeToggle");
    const autoplayTtsToggle = document.getElementById("autoplayTtsToggle");
    const tutorSelectDropdown = document.getElementById('tutor-select-dropdown');
    const stopAudioBtn = document.getElementById('stop-audio-btn');
    const fullscreenDropzone = document.getElementById('app-layout-wrapper');
    const studentLinkCodeValue = document.getElementById('student-link-code-value');
    const equationModal = document.getElementById('equation-modal');
    const openEquationBtn = document.getElementById('insert-equation-btn');
    const closeEquationBtn = document.getElementById('close-equation-modal');
    const cancelEquationBtn = document.getElementById('cancel-latex-eq');
    const insertLatexBtn = document.getElementById('insert-latex-eq');
    const mathEditor = document.getElementById('math-editor');

    const whiteboardPanel = document.getElementById('whiteboard-panel');
    const closeWhiteboardBtn = document.getElementById('close-whiteboard-btn');
    const drawItOutBtn = document.getElementById('draw-it-out-btn');

    // --- Speech Recognition ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    let isRecognizing = false;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => { userInput.value += event.results[0][0].transcript; };
        recognition.onerror = (event) => { console.error("Speech recognition error:", event.error); isRecognizing = false; if (micBtn) micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; };
        recognition.onend = () => { isRecognizing = false; if (micBtn) micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; };
    }

    // --- Core Functions ---
    async function initializeApp() {
        try {
            const userRes = await fetch('/user', { credentials: 'include' });
            if (!userRes.ok) throw new Error('Not authenticated');
            const data = await userRes.json();
            currentUser = data.user;
            if (!currentUser) throw new Error('User not found');
            if (currentUser.needsProfileCompletion) return window.location.href = "/complete-profile.html";
            if (!currentUser.selectedTutorId && currentUser.role === 'student') return window.location.href = '/pick-tutor.html';
            
            initializeWhiteboard(); 
            setupChatUI();
            await fetchAndDisplayParentCode();
            await getWelcomeMessage();
            await fetchAndDisplayLeaderboard();
        } catch (error) {
            console.error("Initialization failed, redirecting to login.", error);
            window.location.href = "/login.html";
        }
    }
    
    function initializeWhiteboard() {
        if (document.getElementById('tutor-canvas') && window.MathmatixWhiteboard) {
            // Initialize the new whiteboard system
            whiteboard = new MathmatixWhiteboard('tutor-canvas', 'whiteboard-panel');
            fabricCanvas = whiteboard.canvas; // Keep for backward compatibility

            // Setup toolbar button event listeners
            setupWhiteboardToolbar();

            // Setup toggle button
            const toggleBtn = document.getElementById('toggle-whiteboard-btn');
            const whiteboardPanel = document.getElementById('whiteboard-panel');
            const openWhiteboardBtn = document.getElementById('open-whiteboard-btn');

            if (toggleBtn && whiteboardPanel) {
                toggleBtn.addEventListener('click', () => {
                    whiteboardPanel.classList.toggle('is-hidden');
                    if (openWhiteboardBtn) {
                        openWhiteboardBtn.classList.toggle('hidden');
                    }
                });
            }

            if (openWhiteboardBtn && whiteboardPanel) {
                openWhiteboardBtn.addEventListener('click', () => {
                    whiteboardPanel.classList.remove('is-hidden');
                    openWhiteboardBtn.classList.add('hidden');
                });
            }

            console.log('✅ Modern whiteboard initialized');
        }
    }

    function setupWhiteboardToolbar() {
        // Tool buttons
        const tools = ['select', 'pen', 'highlighter', 'eraser', 'line', 'arrow',
                      'rectangle', 'circle', 'triangle', 'text'];

        tools.forEach(tool => {
            const btn = document.getElementById(`tool-${tool}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    // Remove active class from all tool buttons
                    document.querySelectorAll('.toolbar-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    whiteboard.setTool(tool);
                });
            }
        });

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
                const funcStr = prompt('Enter function (e.g., x^2, 2*x+1, Math.sin(x)):');
                if (funcStr) {
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

        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => whiteboard.downloadImage());
        }

        // Panel controls
        const minimizeBtn = document.getElementById('minimize-whiteboard-btn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => whiteboard.minimize());
        }

        const maximizeBtn = document.getElementById('maximize-whiteboard-btn');
        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => whiteboard.maximize());
        }

        const openWhiteboardBtn = document.getElementById('open-whiteboard-btn');
        if (openWhiteboardBtn) {
            openWhiteboardBtn.addEventListener('click', () => {
                whiteboard.show();
                openWhiteboardBtn.classList.add('hidden');
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!whiteboard) return;

            // Ctrl/Cmd + Z = Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                whiteboard.undo();
            }

            // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
            if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
                e.preventDefault();
                whiteboard.redo();
            }

            // Delete/Backspace = Delete selected
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeElement = document.activeElement;
                if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    whiteboard.deleteSelected();
                }
            }
        });
    }

    function updateDrawingMode() {
        if (whiteboardState.currentTool === 'pen') {
            fabricCanvas.isDrawingMode = true;
            fabricCanvas.selection = false;
            fabricCanvas.freeDrawingBrush.color = whiteboardState.currentColor; // Restore current color
            fabricCanvas.freeDrawingBrush.width = whiteboardState.brushSize;
        } else if (whiteboardState.currentTool === 'eraser') {
            fabricCanvas.isDrawingMode = true;
            fabricCanvas.freeDrawingBrush.color = '#ffffff'; // White eraser
            fabricCanvas.freeDrawingBrush.width = whiteboardState.brushSize * 2; // Larger eraser
            fabricCanvas.selection = false;
        } else {
            // Shape tools (line, circle, rectangle, text)
            fabricCanvas.isDrawingMode = false;
            fabricCanvas.selection = false;
        }
    }

    function setupWhiteboardDrawing() {
        fabricCanvas.on('mouse:down', function(options) {
            if (fabricCanvas.isDrawingMode) return; // Let free drawing handle it

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
        if (!fabricCanvas || !currentUser) return;

        try {
            // Convert canvas to base64 image
            const imageData = fabricCanvas.toDataURL({
                format: 'png',
                quality: 0.8
            });

            // Convert base64 to blob
            const response = await fetch(imageData);
            const blob = await response.blob();
            const file = new File([blob], 'whiteboard.png', { type: 'image/png' });

            // Use the existing file upload mechanism
            attachedFile = file;

            // Create visual pill
            const filePillContainer = document.getElementById('file-pill-container');
            filePillContainer.innerHTML = `
                <div class="file-pill">
                    <span class="file-name">📋 Whiteboard snapshot</span>
                    <button class="remove-file-btn" onclick="removeAttachedFile()">×</button>
                </div>
            `;

            // Suggest a message
            const userInput = document.getElementById('user-input');
            if (userInput && !userInput.value.trim()) {
                userInput.value = "Can you help me with this problem I drew on the whiteboard?";
            }

            showToast('Whiteboard snapshot attached! Click send to share with AI.', 3000);
        } catch (error) {
            console.error('Error sharing whiteboard:', error);
            showToast('Failed to share whiteboard. Please try again.', 3000);
        }
    }

    function drawBackgroundTemplate(templateType) {
        if (!fabricCanvas) return;

        // Clear only background objects (preserve user drawings)
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
        const spacing = Math.min(width, height) / 20; // 20 units total (-10 to 10)

        // Draw grid lines
        for (let i = -10; i <= 10; i++) {
            // Vertical lines
            const x = centerX + (i * spacing);
            const vLine = new fabric.Line([x, 0, x, height], {
                stroke: gridColor,
                strokeWidth: 1,
                selectable: false,
                evented: false,
                isBackground: true
            });
            fabricCanvas.add(vLine);

            // Horizontal lines
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

        // Draw axes
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

        // Draw axis labels
        for (let i = -10; i <= 10; i += 2) {
            if (i === 0) continue;

            // X-axis labels
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

            // Y-axis labels
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

        // Origin label
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
        const spacing = width / 22; // Padding on sides
        const startX = spacing;
        const endX = width - spacing;
        const unit = (endX - startX) / 20;

        // Draw main line
        const line = new fabric.Line([startX, centerY, endX, centerY], {
            stroke: axisColor,
            strokeWidth: 3,
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(line);

        // Draw tick marks and labels
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

        // Add arrows
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
        const spacing = 20; // 20 pixels per square

        // Draw vertical lines
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

        // Draw horizontal lines
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

        // Draw mat border
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

        // Draw positive/negative divider (horizontal)
        const divider = new fabric.Line([padding, height / 2, width - padding, height / 2], {
            stroke: '#12B3B3',
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false,
            isBackground: true
        });
        fabricCanvas.add(divider);

        // Add labels
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

        // Draw light grid
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

    // Transform mathematical coordinates to canvas pixel coordinates
    function mathToCanvasCoords(mathX, mathY, mathMin = -10, mathMax = 10) {
        if (!fabricCanvas) return { x: 0, y: 0 };

        const canvasWidth = fabricCanvas.width;
        const canvasHeight = fabricCanvas.height;
        const padding = 40; // Padding from canvas edges

        // Available drawing area
        const drawWidth = canvasWidth - (2 * padding);
        const drawHeight = canvasHeight - (2 * padding);

        // Transform from math coordinates to pixel coordinates
        const mathRange = mathMax - mathMin;
        const pixelX = padding + ((mathX - mathMin) / mathRange) * drawWidth;
        const pixelY = padding + ((mathMax - mathY) / mathRange) * drawHeight; // Flip Y axis

        return { x: pixelX, y: pixelY };
    }

    async function renderDrawing(sequence, delay = 500) {
        if (!whiteboard) return;
        await whiteboard.renderAIDrawing(sequence, delay);
    }

    function makeElementDraggable(elmnt) {
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

    function updateTutorAvatar() {
        const studentAvatarContainer = document.getElementById("student-avatar");
        if (studentAvatarContainer && window.TUTOR_CONFIG && currentUser) {
            const tutor = window.TUTOR_CONFIG[currentUser.selectedTutorId] || window.TUTOR_CONFIG['default'];
            studentAvatarContainer.innerHTML = `<img src="/images/tutor_avatars/${tutor.image}" alt="${tutor.name}">`;
        }
    }

    function setupChatUI() {
        updateTutorAvatar();
        updateGamificationDisplay();
    }
    
    async function fetchAndDisplayParentCode() {
        if (currentUser.role === 'student' && studentLinkCodeValue) {
            if (currentUser.parent_link_code) {
                studentLinkCodeValue.textContent = currentUser.parent_link_code;
            } else {
                studentLinkCodeValue.textContent = "N/A";
            }
        }
    }

    async function getWelcomeMessage() {
        try {
            const res = await fetch(`/api/welcome-message?userId=${currentUser._id}`, {credentials: 'include'});
            const data = await res.json();
            if (data.greeting) appendMessage(data.greeting, "ai");
        } catch (error) {
            appendMessage("Hello! Let's solve some math problems.", "ai");
        }
    }

    function renderMathInElement(element) {
        if (window.MathLive && typeof window.MathLive.renderMathInElement === 'function') {
            window.MathLive.renderMathInElement(element);
        }
    }
    
  // ============================================
  // ELEGANT MULTI-FILE UPLOAD SYSTEM
  // ============================================

  let attachedFiles = []; // Array to hold multiple files
  const MAX_FILES = 10; // Maximum number of files per upload

  /**
   * Handle file upload - supports single or multiple files
   * @param {File|FileList} files - File or FileList object
   */
  function handleFileUpload(files) {
    if (!files) return;

    // Convert FileList to Array if needed
    const fileArray = files instanceof FileList ? Array.from(files) : [files];

    // Check if adding these files would exceed the limit
    if (attachedFiles.length + fileArray.length > MAX_FILES) {
      showToast(`Maximum ${MAX_FILES} files allowed. You have ${attachedFiles.length} files already.`, 3000);
      return;
    }

    // Validate and add files
    fileArray.forEach(file => {
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        showToast(`File too large: ${file.name} (max 10MB)`, 3000);
        return;
      }

      // Check file type
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        showToast(`Invalid file type: ${file.name}`, 3000);
        return;
      }

      // Add unique ID to file
      file.uploadId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Add to attached files
      attachedFiles.push(file);

      // Create file card
      createFileCard(file);
    });

    // Clear file input
    const fileInput = document.getElementById("file-input");
    if (fileInput) fileInput.value = "";
  }

  /**
   * Create a beautiful file card with preview
   * @param {File} file - File object with uploadId
   */
  function createFileCard(file) {
    const container = document.getElementById('file-grid-container');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'file-card';
    card.setAttribute('data-file-id', file.uploadId);

    const isPDF = file.type === 'application/pdf';

    if (isPDF) {
      // PDF icon
      card.innerHTML = `
        <div class="file-card-pdf-icon">
          <i class="fas fa-file-pdf"></i>
        </div>
        <div class="file-card-overlay">
          <span class="file-card-name">${escapeHtml(file.name)}</span>
          <button class="file-card-remove" onclick="removeFile('${file.uploadId}')" title="Remove">
            ×
          </button>
        </div>
      `;
    } else {
      // Image preview
      const reader = new FileReader();
      reader.onload = (e) => {
        card.innerHTML = `
          <img src="${e.target.result}" class="file-card-preview" alt="${escapeHtml(file.name)}"/>
          <div class="file-card-overlay">
            <span class="file-card-name">${escapeHtml(file.name)}</span>
            <button class="file-card-remove" onclick="removeFile('${file.uploadId}')" title="Remove">
              ×
            </button>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    }

    container.appendChild(card);
  }

  /**
   * Remove a file from the upload queue
   * @param {string} fileId - Upload ID of the file
   */
  window.removeFile = function(fileId) {
    // Remove from array
    attachedFiles = attachedFiles.filter(f => f.uploadId !== fileId);

    // Remove card with animation
    const card = document.querySelector(`[data-file-id="${fileId}"]`);
    if (card) {
      card.style.animation = 'fileCardExit 0.3s ease-out';
      setTimeout(() => card.remove(), 300);
    }
  };

  /**
   * Clear all attached files
   */
  function clearAllFiles() {
    attachedFiles = [];
    const container = document.getElementById('file-grid-container');
    if (container) container.innerHTML = '';
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Legacy function for backward compatibility
  function removeAttachedFile() {
    clearAllFiles();
  }
	
    function appendMessage(text, sender, graphData = null, isMasteryQuiz = false) {
        if (!text && !graphData) return;

        if (!chatBox) return;
        const bubble = document.createElement("div");
        bubble.className = `message ${sender}`;
        bubble.id = `message-${Date.now()}-${Math.random()}`;
        if (isMasteryQuiz) { bubble.classList.add('mastery-quiz'); }
        
        const textNode = document.createElement('span');
        textNode.className = 'message-text';
        
        if (sender === 'ai' && typeof marked === 'function') {
            const protectedText = text.replace(/\\\(/g, '@@LATEX_OPEN@@').replace(/\\\)/g, '@@LATEX_CLOSE@@').replace(/\\\[/g, '@@DLATEX_OPEN@@').replace(/\\\]/g, '@@DLATEX_CLOSE@@');
            const dirtyHtml = marked.parse(protectedText, { breaks: true });
            textNode.innerHTML = dirtyHtml.replace(/@@LATEX_OPEN@@/g, '\\(').replace(/@@LATEX_CLOSE@@/g, '\\)').replace(/@@DLATEX_OPEN@@/g, '\\[').replace(/@@DLATEX_CLOSE@@/g, '\\]');
        } else {
            textNode.textContent = text;
        }
        bubble.appendChild(textNode);
        
        if (graphData && window.functionPlot) {
             const graphContainer = document.createElement('div');
            const graphId = 'graph-container-' + Date.now();
            graphContainer.id = graphId;
            graphContainer.className = 'graph-render-area';
            bubble.appendChild(graphContainer);
            setTimeout(() => {
                try {
                    const plotWidth = chatBox.clientWidth > 150 ? chatBox.clientWidth - 80 : 250;
                    functionPlot({
                        target: '#' + graphId,
                        width: plotWidth,
                        height: 300,
                        grid: true,
                        data: [{ fn: graphData.function, graphType: 'polyline' }]
                    });
                } catch (e) { console.error("Graphing error:", e); graphContainer.innerHTML = "Could not render graph."; }
            }, 0);
        }
        
        if (sender === 'ai') {
            const playBtn = document.createElement("button");
            playBtn.className = "play-audio-btn";
            playBtn.innerHTML = '<i class="fas fa-play"></i><i class="fas fa-wave-square"></i><i class="fas fa-spinner"></i>';
            playBtn.setAttribute("title", "Play audio");
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playBtn.disabled = true;
                playBtn.classList.add('is-loading');
                const tutor = window.TUTOR_CONFIG[currentUser.selectedTutorId] || window.TUTOR_CONFIG['default'];
                const speakableText = generateSpeakableText(text);
                playAudio(speakableText, tutor.voiceId, bubble.id);
            });
            bubble.appendChild(playBtn);
        }

        chatBox.appendChild(bubble);

        if (sender === 'ai' && currentUser?.preferences?.handsFreeModeEnabled) {
            if (currentUser.preferences.autoplayTtsHandsFree && window.TUTOR_CONFIG) {
                 const playButtonForAutoplay = bubble.querySelector('.play-audio-btn');
                 if (playButtonForAutoplay) {
                    playButtonForAutoplay.disabled = true;
                    playButtonForAutoplay.classList.add('is-loading');
                 }
                 const tutor = window.TUTOR_CONFIG[currentUser.selectedTutorId] || window.TUTOR_CONFIG['default'];
                 const speakableText = generateSpeakableText(text);
                 playAudio(speakableText, tutor.voiceId, bubble.id);
            }
        }
        
        setTimeout(() => renderMathInElement(bubble), 0);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMessage() {
    const messageText = userInput.value.trim();
    if (!messageText && attachedFiles.length === 0) return;

    appendMessage(messageText, "user");
    userInput.value = "";
    showThinkingIndicator(true);

    try {
        let response;

        // Multi-file upload support
        if (attachedFiles.length > 0) {
            const formData = new FormData();

            // Append all files
            attachedFiles.forEach((file, index) => {
                formData.append(index === 0 ? 'file' : `file${index}`, file);
            });

            formData.append('message', messageText);
            formData.append('userId', currentUser._id);
            formData.append('fileCount', attachedFiles.length);

            // Clear files from UI immediately
            clearAllFiles();

            response = await fetch("/api/chat-with-file", {
                method: "POST",
                body: formData,
                credentials: 'include'
            });
        } else {
            response = await fetch("/api/chat", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser._id, message: messageText }),
                credentials: 'include'
            });
        }

        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        const data = await response.json();

        // The rest of this function handles the AI response and is mostly the same
        let aiText = data.text;
        let graphData = null;
        const graphRegex = /\[GRAPH:({.*})\]/;
        const graphMatch = aiText.match(graphRegex);
        if (graphMatch) {
            try {
                aiText = aiText.replace(graphRegex, "").trim();
                graphData = JSON.parse(graphMatch[1]);
            } catch (e) { console.error("Failed to parse graph JSON:", e); }
        }
        appendMessage(aiText, "ai", graphData, data.isMasteryQuiz);

        if (data.drawingSequence) {
            renderDrawing(data.drawingSequence);
        }

        if (data.newlyUnlockedTutors && data.newlyUnlockedTutors.length > 0) {
            const tutorS = data.newlyUnlockedTutors.length > 1 ? "s" : "";
            showToast(`🎉 You just unlocked ${data.newlyUnlockedTutors.length} new tutor${tutorS}!`, 5000);
            triggerConfetti();
        }
        
        if (data.userXp !== undefined) {
            currentUser.level = data.userLevel;
            currentUser.xpForCurrentLevel = data.userXp;
            currentUser.xpForNextLevel = data.xpNeeded;
            updateGamificationDisplay();
        }

        if (data.specialXpAwarded) {
            const isLevelUp = data.specialXpAwarded.includes('LEVEL_UP');
            triggerXpAnimation(data.specialXpAwarded, isLevelUp, !isLevelUp);
        }

    } catch (error) {
        console.error("Chat error:", error);
        appendMessage("I'm having trouble connecting. Please try again.", "system-error");
    } finally {
        showThinkingIndicator(false);
    }
}
    
    function showThinkingIndicator(show) {
        if (thinkingIndicator) thinkingIndicator.style.display = show ? "flex" : "none";
    }

    async function playAudio(text, voiceId, messageId) {
        if (!text || !window.AudioContext) return;
        audioQueue.push({ text, voiceId, messageId });
        processAudioQueue();
    }

    async function processAudioQueue() {
        if (isPlaying || audioQueue.length === 0) {
            if (stopAudioBtn) stopAudioBtn.style.display = 'none';
            return;
        }
        isPlaying = true;
        if (stopAudioBtn) stopAudioBtn.style.display = 'inline-flex';
        const { text, voiceId, messageId } = audioQueue.shift();
        const messageBubble = document.getElementById(messageId);
        const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;
        try {
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voiceId })
            });
            if (!response.ok) throw new Error('Failed to fetch audio stream.');
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createBufferSource();
            currentAudioSource = source;
            const audioBuffer = await response.arrayBuffer();
            await audioContext.decodeAudioData(audioBuffer, (buffer) => {
                if (playButton) {
                    playButton.classList.remove('is-loading');
                    playButton.classList.add('is-playing');
                }
                source.buffer = buffer;
                source.connect(audioContext.destination);
                source.start(0);
                source.onended = () => {
                    isPlaying = false;
                    currentAudioSource = null;
                    if (playButton) {
                        playButton.classList.remove('is-playing');
                        playButton.disabled = false;
                    }
                    audioContext.close();
                    if (currentUser?.preferences?.handsFreeModeEnabled && audioQueue.length === 0) {
                        if (recognition && !isRecognizing) {
                            try {
                                recognition.start();
                                isRecognizing = true;
                                if (micBtn) micBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
                            } catch(e) { console.error("Auto-listen could not be started:", e); }
                        }
                    }
                    processAudioQueue();
                };
            });
        } catch (error) {
            console.error('Audio playback error:', error);
            isPlaying = false;
            if (playButton) {
                playButton.classList.remove('is-loading');
                playButton.classList.remove('is-playing');
                playButton.disabled = false;
            }
            processAudioQueue();
        }
    }
    
    function updateGamificationDisplay() {
        const levelSpan = document.getElementById("current-level");
        const xpSpan = document.getElementById("current-xp");
        const xpBar = document.getElementById("xp-progress-bar");
        const xpNeededSpan = document.getElementById("xp-needed");

        if (levelSpan && currentUser.level) levelSpan.textContent = currentUser.level;
        if (xpSpan && currentUser.xpForCurrentLevel !== undefined) xpSpan.textContent = currentUser.xpForCurrentLevel;
        if (xpBar && currentUser.xpForCurrentLevel !== undefined) {
            xpBar.value = currentUser.xpForCurrentLevel;
            xpBar.max = currentUser.xpForNextLevel;
        }
        if (xpNeededSpan && currentUser.xpForNextLevel) {
            xpNeededSpan.textContent = currentUser.xpForNextLevel;
        }
    }

    async function fetchAndDisplayLeaderboard() {
        const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
        if (!leaderboardTableBody) return;
        leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
        try {
            const response = await fetch('/api/leaderboard', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load leaderboard');
            const students = await response.json();
            leaderboardTableBody.innerHTML = '';
            if (students.length === 0) {
                leaderboardTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available.</td></tr>';
                return;
            }
            students.forEach((student, index) => {
                const row = leaderboardTableBody.insertRow();
                row.innerHTML = `<td>${index + 1}</td><td>${student.name}</td><td>${student.level}</td><td>${student.xp}</td>`;
            });
        } catch (error) {
            console.error('Leaderboard error:', error);
            leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Could not load leaderboard.</td></tr>`;
        }
    }

    // --- Settings Modal Logic ---
    function openSettingsModal() {
        if (settingsModal && currentUser) {
            handsFreeToggle.checked = !!currentUser.preferences.handsFreeModeEnabled;
            autoplayTtsToggle.checked = !!currentUser.preferences.autoplayTtsHandsFree;
            if (tutorSelectDropdown && window.TUTOR_CONFIG) {
                tutorSelectDropdown.innerHTML = '';
                if (currentUser.unlockedItems && Array.isArray(currentUser.unlockedItems)) {
                    currentUser.unlockedItems.forEach(tutorId => {
                        const tutor = window.TUTOR_CONFIG[tutorId];
                        if (tutor) {
                            const option = document.createElement('option');
                            option.value = tutorId;
                            option.textContent = tutor.name;
                            if (tutorId === currentUser.selectedTutorId) {
                                option.selected = true;
                            }
                            tutorSelectDropdown.appendChild(option);
                        }
                    });
                }
            }
            settingsModal.classList.add('is-visible');
        }
    }

    function closeSettingsModal() { if (settingsModal) settingsModal.classList.remove('is-visible'); }

    async function updateSettings(setting) {
        if (!currentUser) return;
        try {
            const res = await fetch('/api/user/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(setting),
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Failed to save settings');
            const data = await res.json();
            if (data.success && data.user) {
                currentUser = data.user;
                console.log("LOG: Settings saved, local user updated.");
            }
        } catch (error) { console.error("Error saving settings:", error); }
    }

    // --- Event Listeners ---
    if (sendBtn) sendBtn.addEventListener("click", sendMessage);
    if (userInput) userInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);
    if (settingsModal) settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });
    
    if (openEquationBtn) {
        openEquationBtn.addEventListener('click', () => {
            if (equationModal) equationModal.classList.add('is-visible');
        });
    }

    if (closeEquationBtn) {
        closeEquationBtn.addEventListener('click', () => {
            if (equationModal) equationModal.classList.remove('is-visible');
        });
    }

    if (cancelEquationBtn) {
        cancelEquationBtn.addEventListener('click', () => {
            if (equationModal) equationModal.classList.remove('is-visible');
        });
    }

    if (insertLatexBtn) {
        insertLatexBtn.addEventListener('click', () => {
            if (mathEditor && userInput) {
                userInput.value += ` \\(${mathEditor.value}\\) `;
                equationModal.classList.remove('is-visible');
            }
        });
    }
    
    if (closeWhiteboardBtn) {
        closeWhiteboardBtn.addEventListener('click', () => {
            if (whiteboard) {
                whiteboard.hide();
                const openBtn = document.getElementById('open-whiteboard-btn');
                if (openBtn) openBtn.classList.remove('hidden');
            }
        });
    }

    if (drawItOutBtn) {
        drawItOutBtn.addEventListener('click', () => {
            if (whiteboardPanel) {
                whiteboardPanel.classList.remove('is-hidden');
                showToast('When in doubt, draw it out! 📝', 2000);
            }
        });
    }

    if (tutorSelectDropdown) {
        tutorSelectDropdown.addEventListener('change', async () => {
            const newTutorId = tutorSelectDropdown.value;
            if (newTutorId && newTutorId !== currentUser.selectedTutorId) {
                await updateSettings({ selectedTutorId: newTutorId });
                updateTutorAvatar();
            }
        });
    }

    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (!recognition) return;
            if (isRecognizing) {
                recognition.stop();
            } else {
                recognition.start();
                isRecognizing = true;
                micBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            }
        });
    }

    // ============================================
    // ENHANCED FILE UPLOAD EVENT LISTENERS
    // ============================================

    if (attachBtn) {
        attachBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files); // Support multiple files
            }
        });
    }

    // Camera capture button
    const cameraBtn = document.getElementById('camera-button');
    if (cameraBtn) {
        cameraBtn.addEventListener('click', async () => {
            try {
                // Create file input for camera
                const cameraInput = document.createElement('input');
                cameraInput.type = 'file';
                cameraInput.accept = 'image/*';
                cameraInput.capture = 'environment'; // Use rear camera on mobile

                cameraInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(e.target.files);
                    }
                });

                cameraInput.click();
            } catch (error) {
                console.error('Camera error:', error);
                showToast('Camera not available', 2000);
            }
        });
    }

    // Paste from clipboard support
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const files = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Handle image paste
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                if (blob) {
                    // Rename pasted image with timestamp
                    const file = new File([blob], `pasted-image-${Date.now()}.png`, {
                        type: blob.type
                    });
                    files.push(file);
                }
            }
        }

        if (files.length > 0) {
            handleFileUpload(files);
            showToast(`Pasted ${files.length} image${files.length > 1 ? 's' : ''}`, 2000);
            e.preventDefault();
        }
    });

    // Enhanced drag and drop - support multiple files
    if (fullscreenDropzone) {
        fullscreenDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fullscreenDropzone.classList.add('drag-active');
        });

        fullscreenDropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fullscreenDropzone.classList.remove('drag-active');
        });

        fullscreenDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fullscreenDropzone.classList.remove('drag-active');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files); // Handle all dropped files
                const fileCount = e.dataTransfer.files.length;
                showToast(`Added ${fileCount} file${fileCount > 1 ? 's' : ''}`, 2000);
                e.dataTransfer.clearData();
            }
        });
    }
    
    initializeApp();
});