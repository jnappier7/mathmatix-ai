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

// --- Session Time Tracking ---
let sessionTracker = {
    startTime: null,
    totalActiveSeconds: 0,
    lastHeartbeat: null,
    heartbeatInterval: null,
    isPageVisible: true,
    lastVisibilityChange: null
};

function initSessionTracking() {
    sessionTracker.startTime = Date.now();
    sessionTracker.lastHeartbeat = Date.now();
    sessionTracker.lastVisibilityChange = Date.now();

    // Track page visibility (pause timer when tab is inactive)
    document.addEventListener('visibilitychange', () => {
        const now = Date.now();

        if (document.hidden) {
            // Tab became inactive - record active time
            if (sessionTracker.isPageVisible) {
                const activeSeconds = Math.floor((now - sessionTracker.lastVisibilityChange) / 1000);
                sessionTracker.totalActiveSeconds += activeSeconds;
            }
            sessionTracker.isPageVisible = false;
        } else {
            // Tab became active again
            sessionTracker.isPageVisible = true;
            sessionTracker.lastVisibilityChange = now;
        }
    });

    // Send heartbeat every 30 seconds
    sessionTracker.heartbeatInterval = setInterval(() => {
        sendTimeHeartbeat();
    }, 30000); // 30 seconds

    // Send final time on page unload
    window.addEventListener('beforeunload', () => {
        sendTimeHeartbeat(true);
    });

    // Also try pagehide for mobile browsers
    window.addEventListener('pagehide', () => {
        sendTimeHeartbeat(true);
    });
}

function getActiveSeconds() {
    const now = Date.now();
    let totalSeconds = sessionTracker.totalActiveSeconds;

    // Add current active period if page is visible
    if (sessionTracker.isPageVisible && sessionTracker.lastVisibilityChange) {
        const currentActiveSeconds = Math.floor((now - sessionTracker.lastVisibilityChange) / 1000);
        totalSeconds += currentActiveSeconds;
    }

    return totalSeconds;
}

async function sendTimeHeartbeat(isFinal = false) {
    if (!currentUser || !currentUser._id) return;

    const activeSeconds = getActiveSeconds();

    // Only send if we have at least 5 seconds of activity (avoid spam)
    if (activeSeconds < 5 && !isFinal) return;

    try {
        const payload = {
            userId: currentUser._id,
            activeSeconds: activeSeconds
        };

        if (isFinal) {
            // Use sendBeacon for reliable delivery during page unload
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/chat/track-time', blob);
        } else {
            // Regular fetch for heartbeats
            await fetch('/api/chat/track-time', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });
        }

        // Reset the counter after successful send
        sessionTracker.totalActiveSeconds = 0;
        sessionTracker.lastVisibilityChange = Date.now();
        sessionTracker.lastHeartbeat = Date.now();

    } catch (error) {
        console.error('Failed to send time tracking heartbeat:', error);
    }
}

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

        // 🎬 Trigger tutor level-up animation with smooth crossfade
        if (typeof playTutorAnimation === 'function') {
            playTutorAnimation('levelUp');
            // Will automatically crossfade back to idle when animation ends
        }

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
        if (isSpecialXp) {
            animationText.classList.add('special-xp');

            // 🎬 Trigger tutor celebration animation for bonus XP
            if (typeof playTutorAnimation === 'function') {
                playTutorAnimation('smallcele');
            }
        }
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
    const changeTutorBtn = document.getElementById('change-tutor-btn');
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

            // Initialize session time tracking
            initSessionTracking();

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

        // Arrow mode dropdown
        const arrowBtn = document.getElementById('tool-arrow');
        const arrowModeMenu = document.getElementById('arrow-mode-menu');

        if (arrowBtn && arrowModeMenu) {
            // Right-click to open mode menu
            arrowBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                arrowModeMenu.style.display = arrowModeMenu.style.display === 'none' ? 'block' : 'none';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!arrowBtn.contains(e.target) && !arrowModeMenu.contains(e.target)) {
                    arrowModeMenu.style.display = 'none';
                }
            });

            // Handle arrow mode selection
            const arrowModeOptions = arrowModeMenu.querySelectorAll('.arrow-mode-option');
            arrowModeOptions.forEach(option => {
                option.addEventListener('click', () => {
                    const mode = option.getAttribute('data-mode');
                    whiteboard.setArrowMode(mode);

                    // Update tooltip to show current mode
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
                    // Automatically add coordinate grid if not present
                    whiteboard.addCoordinateGrid();
                    // Then plot the function
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
            // Toggle dropdown
            backgroundMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                backgroundMenu.style.display = backgroundMenu.style.display === 'none' ? 'block' : 'none';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!backgroundMenuBtn.contains(e.target) && !backgroundMenu.contains(e.target)) {
                    backgroundMenu.style.display = 'none';
                }
            });

            // Handle background option clicks
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

            // File upload handler
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
                    // Reset input
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

        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => whiteboard.downloadImage());
        }

        const sendToAiBtn = document.getElementById('send-to-ai-btn');
        if (sendToAiBtn) {
            sendToAiBtn.addEventListener('click', async () => {
                try {
                    // Convert Fabric.js canvas to data URL
                    const dataURL = whiteboard.canvas.toDataURL({
                        format: 'png',
                        quality: 1,
                        multiplier: 2 // Higher resolution for better OCR
                    });

                    // Convert data URL to blob
                    const response = await fetch(dataURL);
                    const blob = await response.blob();

                    if (!blob) {
                        alert('Failed to capture whiteboard. Please try again.');
                        return;
                    }

                    // Create file from blob
                    const file = new File([blob], 'whiteboard-drawing.png', { type: 'image/png' });

                    // Attach file and show preview in input area
                    attachedFile = file;
                    showFilePill(file.name);

                    // Set placeholder message (user can edit or replace)
                    if (!userInput.value.trim()) {
                        userInput.value = 'Can you help me with this?';
                    }

                    // Focus input so user can type or send
                    userInput.focus();
                    userInput.select();

                    console.log('✅ Whiteboard screenshot attached! Click send when ready.');
                } catch (error) {
                    console.error('Error capturing whiteboard:', error);
                    alert('Failed to capture whiteboard. Please try again.');
                }
            });
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

    // ============================================
    // ANIMATED TUTOR AVATAR SYSTEM
    // ============================================

    let currentTutorVideo = null;
    let tutorVideoState = 'idle';

    function updateTutorAvatar() {
        const studentAvatarContainer = document.getElementById("student-avatar");
        if (studentAvatarContainer && window.TUTOR_CONFIG && currentUser) {
            const tutor = window.TUTOR_CONFIG[currentUser.selectedTutorId] || window.TUTOR_CONFIG['default'];

            // Set data attribute for unique tutor animations
            studentAvatarContainer.setAttribute('data-tutor', currentUser.selectedTutorId);

            // Set initial state to idle
            studentAvatarContainer.className = 'idle';

            // Check if this tutor has animated videos
            const tutorsWithAnimations = ['mr-nappier', 'maya', 'bob', 'ms-maria'];
            const hasAnimations = tutorsWithAnimations.includes(currentUser.selectedTutorId);

            if (hasAnimations) {
                // Create dual-video system for seamless crossfades
                studentAvatarContainer.innerHTML = `
                    <video id="tutor-video"
                           class="tutor-animated-avatar"
                           autoplay
                           loop
                           muted
                           playsinline>
                        <source src="/videos/${currentUser.selectedTutorId}_idle.mp4" type="video/mp4">
                    </video>
                    <video id="tutor-video-secondary"
                           muted
                           playsinline>
                    </video>
                `;

                currentTutorVideo = document.getElementById('tutor-video');
                tutorVideoState = 'idle';

                // Set up video event listeners
                if (currentTutorVideo) {
                    currentTutorVideo.addEventListener('ended', handleVideoEnded);
                }
            } else {
                // Use static image for other tutors (with CSS animations)
                studentAvatarContainer.innerHTML = `<img src="/images/tutor_avatars/${tutor.image}" alt="${tutor.name}">`;
                currentTutorVideo = null;
            }
        }
    }

    /**
     * Set tutor state for animations
     * @param {string} state - 'idle', 'speaking', or 'level-up'
     */
    window.setTutorState = function(state) {
        const studentAvatarContainer = document.getElementById("student-avatar");
        if (!studentAvatarContainer) return;

        // Update state class
        studentAvatarContainer.className = state;
    };

    /**
     * Play a specific tutor animation with seamless crossfade
     * @param {string} animation - 'idle', 'levelUp', or 'smallcele'
     */
    window.playTutorAnimation = function(animation) {
        if (!currentTutorVideo || !currentUser) return;

        // Get current tutor ID
        const tutorId = currentUser.selectedTutorId;

        const animations = {
            'idle': `/videos/${tutorId}_idle.mp4`,
            'levelUp': `/videos/${tutorId}_levelUp.mp4`,
            'smallcele': `/videos/${tutorId}_smallcele.mp4`
        };

        const videoPath = animations[animation];
        if (!videoPath) return;

        tutorVideoState = animation;

        // Get secondary video element for crossfade
        const secondaryVideo = document.getElementById('tutor-video-secondary');
        if (!secondaryVideo) {
            // Fallback to simple transition if secondary video not available
            currentTutorVideo.src = videoPath;
            currentTutorVideo.loop = (animation === 'idle');
            currentTutorVideo.play();
            return;
        }

        // Seamless crossfade technique:
        // 1. Load new video in secondary element
        secondaryVideo.src = videoPath;
        secondaryVideo.loop = (animation === 'idle');

        // 2. Preload and prepare
        secondaryVideo.load();

        // 3. When ready, crossfade
        secondaryVideo.addEventListener('canplay', function onCanPlay() {
            secondaryVideo.removeEventListener('canplay', onCanPlay);

            // Start playing the new video
            secondaryVideo.play();

            // Crossfade: fade out primary, fade in secondary
            currentTutorVideo.style.opacity = '0';
            secondaryVideo.style.opacity = '1';

            // After transition, swap videos
            setTimeout(() => {
                // Swap the videos
                currentTutorVideo.src = videoPath;
                currentTutorVideo.loop = (animation === 'idle');
                currentTutorVideo.play();
                currentTutorVideo.style.opacity = '1';

                // Reset secondary
                secondaryVideo.style.opacity = '0';
                secondaryVideo.pause();
                secondaryVideo.src = '';

                // Update event listener
                currentTutorVideo.removeEventListener('ended', handleVideoEnded);
                currentTutorVideo.addEventListener('ended', handleVideoEnded);
            }, 500); // Match CSS transition duration
        });
    };

    /**
     * Handle video ended event - return to idle after celebrations
     */
    function handleVideoEnded() {
        if (tutorVideoState !== 'idle') {
            playTutorAnimation('idle');
        }
    }

    function setupChatUI() {
        updateTutorAvatar();
        updateGamificationDisplay();
    }
    
    async function fetchAndDisplayParentCode() {
        if (currentUser.role === 'student' && studentLinkCodeValue) {
            // Check if student has a link code already
            if (currentUser.studentToParentLinkCode && currentUser.studentToParentLinkCode.code) {
                studentLinkCodeValue.textContent = currentUser.studentToParentLinkCode.code;
                // Make it clickable to copy
                studentLinkCodeValue.style.cursor = 'pointer';
                studentLinkCodeValue.onclick = () => {
                    navigator.clipboard.writeText(currentUser.studentToParentLinkCode.code);
                    showToast('Code copied to clipboard!', 2000);
                };
            } else {
                // No code exists, generate one
                try {
                    const res = await fetch('/api/student/generate-link-code', {
                        method: 'POST',
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (data.success && data.code) {
                        studentLinkCodeValue.textContent = data.code;
                        // Update currentUser object
                        currentUser.studentToParentLinkCode = { code: data.code, parentLinked: false };
                        // Make it clickable to copy
                        studentLinkCodeValue.style.cursor = 'pointer';
                        studentLinkCodeValue.onclick = () => {
                            navigator.clipboard.writeText(data.code);
                            showToast('Code copied to clipboard!', 2000);
                        };
                    } else {
                        studentLinkCodeValue.textContent = "Error generating code";
                    }
                } catch (err) {
                    console.error('Error generating parent link code:', err);
                    studentLinkCodeValue.textContent = "Error generating code";
                }
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
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([element]).catch((err) => console.log('MathJax error:', err));
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
  window.handleFileUpload = function(files) {
    console.log('[handleFileUpload] Called with files:', files);
    if (!files) {
      console.warn('[handleFileUpload] No files provided');
      return;
    }

    // Convert FileList or Array to Array if needed
    // Handle both FileList (from input) and Array (from drag-drop/file-upload.js)
    let fileArray;
    if (files instanceof FileList) {
      fileArray = Array.from(files);
    } else if (Array.isArray(files)) {
      fileArray = files; // Already an array, don't wrap again!
    } else {
      fileArray = [files]; // Single file, wrap it
    }
    console.log('[handleFileUpload] Processing', fileArray.length, 'file(s)');
    console.log('[handleFileUpload] fileArray:', fileArray);
    console.log('[handleFileUpload] About to enter forEach loop...');

    // Check if adding these files would exceed the limit
    if (attachedFiles.length + fileArray.length > MAX_FILES) {
      showToast(`Maximum ${MAX_FILES} files allowed. You have ${attachedFiles.length} files already.`, 3000);
      return;
    }

    // Validate and add files
    console.log('[handleFileUpload] Starting forEach on', fileArray.length, 'files');
    fileArray.forEach((file, index) => {
      console.log(`[handleFileUpload] forEach iteration ${index + 1}/${fileArray.length}`);
      console.log('[handleFileUpload] Validating file:', file.name, 'Type:', file.type, 'Size:', file.size);

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        console.warn('[handleFileUpload] File too large:', file.name, file.size);
        showToast(`File too large: ${file.name} (max 10MB)`, 3000);
        return;
      }

      // Check file type - added image/svg+xml for SVG support
      const validTypes = [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/heic',
        'image/svg+xml',  // Added SVG support
        'application/pdf'
      ];
      if (!validTypes.includes(file.type)) {
        console.warn('[handleFileUpload] Invalid file type:', file.name, file.type);
        showToast(`Invalid file type: ${file.name} (${file.type}). Please upload images (PNG, JPG, WebP, SVG) or PDFs.`, 4000);
        return;
      }

      console.log('[handleFileUpload] ✅ File passed validation:', file.name);

      // Add unique ID to file
      file.uploadId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Add to attached files
      attachedFiles.push(file);
      console.log('[handleFileUpload] Added file to attachedFiles. Total files:', attachedFiles.length);

      // Create file card
      console.log('[handleFileUpload] Calling createFileCard for:', file.name);
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
    console.log('[createFileCard] Called for file:', file.name, 'Type:', file.type);
    const container = document.getElementById('file-grid-container');
    if (!container) {
      console.error('[createFileCard] ERROR: file-grid-container not found in DOM!');
      return;
    }
    console.log('[createFileCard] Container found:', container);

    const card = document.createElement('div');
    card.className = 'file-card';
    card.setAttribute('data-file-id', file.uploadId);

    const isPDF = file.type === 'application/pdf';

    // Helper function to format file size
    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    };

    if (isPDF) {
      // PDF card with icon and info
      card.innerHTML = `
        <button class="file-card-remove" onclick="removeFile('${file.uploadId}')" title="Remove">×</button>
        <div class="file-card-pdf-icon">
          <i class="fas fa-file-pdf"></i>
        </div>
        <div class="file-card-info">
          <span class="file-card-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="file-card-size">${formatSize(file.size)}</span>
        </div>
      `;
    } else {
      // Image preview card
      card.style.padding = '0'; // Remove padding for images
      const reader = new FileReader();
      reader.onload = (e) => {
        card.innerHTML = `
          <button class="file-card-remove" onclick="removeFile('${file.uploadId}')" title="Remove">×</button>
          <img src="${e.target.result}" class="file-card-preview" alt="${escapeHtml(file.name)}" title="${escapeHtml(file.name)}"/>
        `;
      };
      reader.readAsDataURL(file);
    }

    container.appendChild(card);
    console.log('[createFileCard] Card appended to container. Container children:', container.children.length);

    // Force container to be visible (in case :empty CSS isn't updating)
    container.style.display = 'grid';
    console.log('[createFileCard] Forced container display to grid');
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

  // Show file pill for attached file
  function showFilePill(fileName) {
    const fileGridContainer = document.getElementById('file-grid-container');
    if (!fileGridContainer) return;

    fileGridContainer.innerHTML = `
      <div class="file-pill">
        <span class="file-name">📎 ${escapeHtml(fileName)}</span>
        <button class="remove-file-btn" onclick="removeAttachedFile()">×</button>
      </div>
    `;
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

        // Handle Desmos graphs: [DESMOS:y=2x+3]
        if (sender === 'ai' && text && text.includes('[DESMOS:')) {
            const desmosRegex = /\[DESMOS:([^\]]+)\]/g;
            let match;
            while ((match = desmosRegex.exec(text)) !== null) {
                const expression = match[1].trim();
                const desmosContainer = document.createElement('div');
                const desmosId = 'desmos-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                desmosContainer.id = desmosId;
                desmosContainer.className = 'desmos-graph';
                desmosContainer.style.width = '100%';
                desmosContainer.style.height = '400px';
                desmosContainer.style.marginTop = '10px';
                desmosContainer.style.borderRadius = '8px';
                desmosContainer.style.border = '1px solid #e0e0e0';
                bubble.appendChild(desmosContainer);

                setTimeout(() => {
                    if (window.Desmos) {
                        const calculator = Desmos.GraphingCalculator(document.getElementById(desmosId), {
                            expressionsCollapsed: true,
                            settingsMenu: false,
                            zoomButtons: true
                        });
                        calculator.setExpression({ latex: expression });
                    }
                }, 100);
            }
            // Remove [DESMOS:...] tags from displayed text
            textNode.innerHTML = textNode.innerHTML.replace(desmosRegex, '');
        }

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

            // Add emoji reaction functionality
            const reactionContainer = document.createElement('div');
            reactionContainer.className = 'message-reaction-container';

            const reactionDisplay = document.createElement('div');
            reactionDisplay.className = 'reaction-display';
            reactionContainer.appendChild(reactionDisplay);

            const reactionBtn = document.createElement('button');
            reactionBtn.className = 'reaction-add-btn';
            reactionBtn.innerHTML = '<i class="far fa-smile"></i>';
            reactionBtn.setAttribute('title', 'Add reaction');
            reactionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showEmojiPicker(bubble, reactionDisplay);
            });
            reactionContainer.appendChild(reactionBtn);

            bubble.appendChild(reactionContainer);
        }

        chatBox.appendChild(bubble);

        // 🎬 Trigger speaking animation when AI responds
        if (sender === 'ai') {
            if (typeof playTutorAnimation === 'function') {
                // Play smallcele animation - will automatically crossfade back to idle when done
                playTutorAnimation('smallcele');
            }
        }

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
    userInput.placeholder = "Type your message..."; // Reset placeholder
    showThinkingIndicator(true);

    try {
        let response;

        // Multi-file upload support
        if (attachedFiles.length > 0) {
            console.log(`[Frontend] Sending ${attachedFiles.length} file(s) to /api/chat-with-file`);
            console.log(`[Frontend] Files:`, attachedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));

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

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.message || errorData.error || `Server error: ${response.status}`;
            throw new Error(errorMessage);
        }
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
            // Show dramatic unlock screen for each tutor
            showTutorUnlockCelebration(data.newlyUnlockedTutors);
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

        // Show specific error message if available, otherwise generic message
        let errorMessage = "I'm having trouble connecting. Please try again.";
        if (error.message) {
            // Check if it's a specific error we can help with
            if (error.message.includes('Mathpix') || error.message.includes('API credentials')) {
                errorMessage = "There was an issue processing your file. Our OCR service may be temporarily unavailable. Please try again later or contact support.";
            } else if (error.message.includes('PDF processing failed') || error.message.includes('Image OCR failed')) {
                errorMessage = `File processing error: ${error.message}. Please try a different file or contact support if the issue persists.`;
            } else if (!error.message.includes('Server error')) {
                errorMessage = error.message;
            }
        }

        appendMessage(errorMessage, "system-error");
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
            // Tutor change button handled separately below
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
    
    // Inline Equation Palette (MS Word-like)
    const inlineEquationPalette = document.getElementById('inline-equation-palette');
    const inlineMathEditor = document.getElementById('inline-math-editor');
    const insertInlineEqBtn = document.getElementById('insert-inline-equation');
    const closeInlinePaletteBtn = document.getElementById('close-inline-palette');

    // Toggle inline palette instead of modal
    if (openEquationBtn && inlineEquationPalette) {
        openEquationBtn.addEventListener('click', () => {
            const isVisible = inlineEquationPalette.style.display === 'block';
            inlineEquationPalette.style.display = isVisible ? 'none' : 'block';
            if (!isVisible && inlineMathEditor) {
                // Focus the math editor when opening
                setTimeout(() => inlineMathEditor.focus(), 100);
            }
        });
    }

    // Close inline palette
    if (closeInlinePaletteBtn) {
        closeInlinePaletteBtn.addEventListener('click', () => {
            if (inlineEquationPalette) inlineEquationPalette.style.display = 'none';
        });
    }

    // Handle symbol button clicks
    document.querySelectorAll('.symbol-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const latex = btn.getAttribute('data-latex');
            if (inlineMathEditor && latex) {
                inlineMathEditor.executeCommand(['insert', latex]);
                inlineMathEditor.focus();
            }
        });
    });

    // Insert equation into chat input
    if (insertInlineEqBtn && inlineMathEditor && userInput) {
        insertInlineEqBtn.addEventListener('click', () => {
            const latex = inlineMathEditor.value;
            if (latex) {
                userInput.value += ` \\(${latex}\\) `;
                inlineMathEditor.value = ''; // Clear the editor
                inlineEquationPalette.style.display = 'none';
                userInput.focus();
            }
        });
    }

    // Equation Modal with Draggable Functionality (kept for legacy support)
    let isDraggingModal = false;
    let modalOffsetX = 0;
    let modalOffsetY = 0;

    // Make equation modal draggable
    if (equationModal) {
        const modalContent = equationModal.querySelector('.modal-content');
        const modalHeader = equationModal.querySelector('.modal-header-eq');

        if (modalHeader && modalContent) {
            modalHeader.style.cursor = 'move';

            modalHeader.addEventListener('mousedown', (e) => {
                isDraggingModal = true;
                const rect = modalContent.getBoundingClientRect();
                modalOffsetX = e.clientX - rect.left;
                modalOffsetY = e.clientY - rect.top;
                modalHeader.style.cursor = 'grabbing';
            });

            document.addEventListener('mousemove', (e) => {
                if (isDraggingModal && modalContent) {
                    e.preventDefault();
                    let newX = e.clientX - modalOffsetX;
                    let newY = e.clientY - modalOffsetY;

                    // Keep modal within viewport
                    newX = Math.max(0, Math.min(newX, window.innerWidth - modalContent.offsetWidth));
                    newY = Math.max(0, Math.min(newY, window.innerHeight - modalContent.offsetHeight));

                    modalContent.style.left = newX + 'px';
                    modalContent.style.top = newY + 'px';
                    modalContent.style.transform = 'none'; // Remove centering transform
                }
            });

            document.addEventListener('mouseup', () => {
                if (isDraggingModal) {
                    isDraggingModal = false;
                    modalHeader.style.cursor = 'move';
                }
            });
        }
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

    if (changeTutorBtn) {
        changeTutorBtn.addEventListener('click', () => {
            window.location.href = '/pick-tutor.html';
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
    // FILE UPLOAD EVENT LISTENERS
    // Note: Attach button and file input are handled by FileUploadManager in file-upload.js
    // ============================================

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

    // ============================================
    // TUTOR UNLOCK CELEBRATION
    // ============================================
    function showTutorUnlockCelebration(tutorIds) {
        if (!tutorIds || tutorIds.length === 0) return;

        let currentIndex = 0;

        function showNextTutor() {
            if (currentIndex >= tutorIds.length) {
                triggerConfetti();
                return;
            }

            const tutorId = tutorIds[currentIndex];
            const tutor = window.TUTOR_CONFIG[tutorId];
            if (!tutor) {
                currentIndex++;
                showNextTutor();
                return;
            }

            const unlockScreen = document.getElementById('tutor-unlock-screen');
            const unlockImage = document.getElementById('unlock-tutor-image');
            const unlockName = document.getElementById('unlock-tutor-name');
            const unlockCatchphrase = document.getElementById('unlock-tutor-catchphrase');
            const unlockSpecialty = document.getElementById('unlock-tutor-specialty');

            // Set tutor info
            unlockImage.src = `/images/tutors/${tutor.image}`;
            unlockImage.alt = tutor.name;
            unlockName.textContent = tutor.name;
            unlockCatchphrase.textContent = `"${tutor.catchphrase}"`;
            unlockSpecialty.textContent = `Specialties: ${tutor.specialties}`;

            // Show overlay
            unlockScreen.style.display = 'flex';

            // Play sound effect (optional - if you have one)
            // You could add a dramatic sound here

            // Click to dismiss
            const dismissHandler = () => {
                unlockScreen.style.display = 'none';
                unlockScreen.removeEventListener('click', dismissHandler);
                currentIndex++;
                // Small delay before showing next tutor
                setTimeout(showNextTutor, 300);
            };

            unlockScreen.addEventListener('click', dismissHandler);

            // Auto-dismiss after 8 seconds if not clicked
            setTimeout(() => {
                if (unlockScreen.style.display === 'flex') {
                    unlockScreen.click();
                }
            }, 8000);
        }

        showNextTutor();
    }

    // ============================================
    // EMOJI REACTION SYSTEM
    // ============================================
    const REACTION_EMOJIS = ['❤️', '👍', '😂', '🔥', '🎉', '💯'];

    function showEmojiPicker(messageBubble, reactionDisplay) {
        // Remove any existing picker
        const existingPicker = document.querySelector('.emoji-picker-popup');
        if (existingPicker) existingPicker.remove();

        // Create picker
        const picker = document.createElement('div');
        picker.className = 'emoji-picker-popup';

        REACTION_EMOJIS.forEach(emoji => {
            const emojiBtn = document.createElement('button');
            emojiBtn.className = 'emoji-option';
            emojiBtn.textContent = emoji;
            emojiBtn.addEventListener('click', () => {
                addReaction(messageBubble, reactionDisplay, emoji);
                picker.remove();
            });
            picker.appendChild(emojiBtn);
        });

        messageBubble.appendChild(picker);

        // Close picker when clicking outside
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!picker.contains(e.target)) {
                    picker.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
    }

    function addReaction(messageBubble, reactionDisplay, emoji) {
        // Check if already has this reaction
        const existingReaction = reactionDisplay.querySelector('.reaction-emoji');
        if (existingReaction && existingReaction.textContent === emoji) {
            // Remove reaction
            existingReaction.remove();
            reactionDisplay.classList.remove('has-reaction');
        } else {
            // Clear previous reaction and add new one
            reactionDisplay.innerHTML = '';
            const reactionEmoji = document.createElement('span');
            reactionEmoji.className = 'reaction-emoji';
            reactionEmoji.textContent = emoji;
            reactionEmoji.addEventListener('click', () => {
                reactionEmoji.remove();
                reactionDisplay.classList.remove('has-reaction');
            });
            reactionDisplay.appendChild(reactionEmoji);
            reactionDisplay.classList.add('has-reaction');
        }
    }

    // ============================================
    // DESMOS GRAPHING CALCULATOR MODAL
    // ============================================
    const openGraphingCalcBtn = document.getElementById('open-graphing-calc-btn');
    const closeGraphingCalcBtn = document.getElementById('close-graphing-calc-modal');
    const graphingCalcModal = document.getElementById('graphing-calc-modal');
    const sendDesmosToAiBtn = document.getElementById('send-desmos-to-ai');
    let desmosCalculator = null;

    if (openGraphingCalcBtn && graphingCalcModal) {
        openGraphingCalcBtn.addEventListener('click', () => {
            graphingCalcModal.style.display = 'flex';

            // Initialize Desmos calculator on first open
            if (!desmosCalculator && window.Desmos) {
                const container = document.getElementById('desmos-calculator-container');
                if (container) {
                    desmosCalculator = Desmos.GraphingCalculator(container, {
                        expressions: true,
                        settingsMenu: true,
                        zoomButtons: true,
                        expressionsTopbar: true,
                        border: false
                    });
                }
            }
        });

        // Close modal on X button
        if (closeGraphingCalcBtn) {
            closeGraphingCalcBtn.addEventListener('click', () => {
                graphingCalcModal.style.display = 'none';
            });
        }

        // Close modal on overlay click
        graphingCalcModal.addEventListener('click', (e) => {
            if (e.target === graphingCalcModal) {
                graphingCalcModal.style.display = 'none';
            }
        });

        // Send Desmos graph to AI
        if (sendDesmosToAiBtn) {
            sendDesmosToAiBtn.addEventListener('click', async () => {
                if (!desmosCalculator) {
                    showToast('Please create a graph first', 2000);
                    return;
                }

                try {
                    // Get calculator state (all expressions)
                    const state = desmosCalculator.getState();
                    const expressions = state.expressions.list
                        .filter(expr => expr.latex) // Only expressions with LaTeX
                        .map(expr => expr.latex)
                        .join('\n');

                    if (!expressions) {
                        showToast('No expressions to send', 2000);
                        return;
                    }

                    // Capture screenshot
                    const screenshotDataUrl = desmosCalculator.screenshot({
                        width: 1200,
                        height: 800,
                        targetPixelRatio: 2
                    });

                    // Convert data URL to blob
                    const response = await fetch(screenshotDataUrl);
                    const blob = await response.blob();
                    const file = new File([blob], `desmos-graph-${Date.now()}.png`, { type: 'image/png' });

                    // Add file to attachments
                    file.uploadId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    attachedFiles.push(file);
                    createFileCard(file);

                    // Set message text with expressions
                    const userInput = document.getElementById('user-input');
                    if (userInput) {
                        userInput.value = `Here's my graph:\n${expressions}`;
                    }

                    // Close modal
                    graphingCalcModal.style.display = 'none';

                    showToast('Graph added to chat', 2000);
                } catch (error) {
                    console.error('Error sending Desmos to AI:', error);
                    showToast('Failed to capture graph', 2000);
                }
            });
        }
    }

    initializeApp();
});