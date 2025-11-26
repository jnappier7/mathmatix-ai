// public/js/script.js

console.log("LOG: Mâˆ†THMâˆ†TIÎ§ AI Initialized");

// --- Global Variables ---
let currentUser = null;
let isPlaying = false;
let audioQueue = [];
let currentAudioSource = null;
let fabricCanvas = null;
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
        if (document.getElementById('tutor-canvas') && window.fabric) {
            fabricCanvas = new fabric.Canvas('tutor-canvas', {
                isDrawingMode: true,
                selection: false,
                backgroundColor: '#ffffff',
            });

            // Set default brush
            fabricCanvas.freeDrawingBrush.color = whiteboardState.currentColor;
            fabricCanvas.freeDrawingBrush.width = whiteboardState.brushSize;

            const resizeCanvas = () => {
                const parent = document.getElementById('whiteboard-panel');
                if (parent && fabricCanvas) {
                    const headerHeight = parent.querySelector('.dashboard-panel-header').offsetHeight;
                    const toolbarHeight = document.getElementById('whiteboard-toolbar').offsetHeight;
                    fabricCanvas.setWidth(parent.clientWidth);
                    fabricCanvas.setHeight(parent.clientHeight - headerHeight - toolbarHeight);
                    fabricCanvas.renderAll();
                }
            };
            new ResizeObserver(resizeCanvas).observe(document.getElementById('whiteboard-panel'));
            resizeCanvas();

            makeElementDraggable(whiteboardPanel);
            initializeWhiteboardControls();
            setupWhiteboardDrawing();
        }
    }

    function initializeWhiteboardControls() {
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                whiteboardState.currentTool = btn.dataset.tool;
                updateDrawingMode();
            });
        });

        // Color buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                whiteboardState.currentColor = btn.dataset.color;
                if (fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.color = whiteboardState.currentColor;
                }
            });
        });

        // Brush size control
        const brushSizeInput = document.getElementById('brush-size');
        const brushSizeValue = document.getElementById('brush-size-value');
        if (brushSizeInput && brushSizeValue) {
            brushSizeInput.addEventListener('input', (e) => {
                whiteboardState.brushSize = parseInt(e.target.value);
                brushSizeValue.textContent = whiteboardState.brushSize;
                if (fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.width = whiteboardState.brushSize;
                }
            });
        }

        // Clear button
        const clearBtn = document.getElementById('clear-whiteboard-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('Clear the whiteboard?')) {
                    fabricCanvas.clear();
                    fabricCanvas.backgroundColor = '#ffffff';
                    fabricCanvas.renderAll();
                }
            });
        }

        // Share button
        const shareBtn = document.getElementById('share-whiteboard-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', shareWhiteboardWithAI);
        }
    }

    function updateDrawingMode() {
        if (whiteboardState.currentTool === 'pen') {
            fabricCanvas.isDrawingMode = true;
            fabricCanvas.selection = false;
        } else if (whiteboardState.currentTool === 'eraser') {
            fabricCanvas.isDrawingMode = true;
            fabricCanvas.freeDrawingBrush.color = '#ffffff'; // White eraser
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
        if (!fabricCanvas || !whiteboardPanel) return;

        fabricCanvas.clear();
        fabricCanvas.backgroundColor = '#ffffff';
        whiteboardPanel.classList.remove('is-hidden');

        for (const item of sequence) {
            const color = item.color || 'black';
            const strokeWidth = item.width || 2;

            switch (item.type) {
                case 'line':
                    // Transform mathematical coordinates to canvas coordinates
                    const start = mathToCanvasCoords(item.points[0], item.points[1]);
                    const end = mathToCanvasCoords(item.points[2], item.points[3]);

                    const line = new fabric.Line([start.x, start.y, end.x, end.y], {
                        stroke: color,
                        strokeWidth: strokeWidth,
                        selectable: false,
                    });
                    fabricCanvas.add(line);
                    break;

                case 'circle':
                    // item.center = [x, y], item.radius = r
                    const center = mathToCanvasCoords(item.center[0], item.center[1]);
                    const scaledRadius = (item.radius / 20) * (fabricCanvas.width - 80); // Scale radius to canvas

                    const circle = new fabric.Circle({
                        left: center.x,
                        top: center.y,
                        radius: scaledRadius,
                        stroke: color,
                        strokeWidth: strokeWidth,
                        fill: item.fill || 'transparent',
                        selectable: false,
                        originX: 'center',
                        originY: 'center'
                    });
                    fabricCanvas.add(circle);
                    break;

                case 'rectangle':
                    // item.topLeft = [x, y], item.width, item.height
                    const topLeft = mathToCanvasCoords(item.topLeft[0], item.topLeft[1]);
                    const scaledWidth = (item.width / 20) * (fabricCanvas.width - 80);
                    const scaledHeight = (item.height / 20) * (fabricCanvas.height - 80);

                    const rect = new fabric.Rect({
                        left: topLeft.x,
                        top: topLeft.y,
                        width: scaledWidth,
                        height: scaledHeight,
                        stroke: color,
                        strokeWidth: strokeWidth,
                        fill: item.fill || 'transparent',
                        selectable: false
                    });
                    fabricCanvas.add(rect);
                    break;

                case 'text':
                    // Transform text position coordinates
                    const textPos = mathToCanvasCoords(item.position[0], item.position[1]);

                    const text = new fabric.Text(item.content, {
                        left: textPos.x,
                        top: textPos.y,
                        fontSize: item.fontSize || 16,
                        fill: color,
                        selectable: false,
                    });
                    fabricCanvas.add(text);
                    break;

                case 'point':
                    // Draw a point as a small circle
                    const pointPos = mathToCanvasCoords(item.position[0], item.position[1]);

                    const point = new fabric.Circle({
                        left: pointPos.x,
                        top: pointPos.y,
                        radius: 4,
                        fill: color,
                        selectable: false,
                        originX: 'center',
                        originY: 'center'
                    });
                    fabricCanvas.add(point);

                    // Add label if provided
                    if (item.label) {
                        const label = new fabric.Text(item.label, {
                            left: pointPos.x + 8,
                            top: pointPos.y - 8,
                            fontSize: 14,
                            fill: color,
                            selectable: false
                        });
                        fabricCanvas.add(label);
                    }
                    break;
            }
            fabricCanvas.renderAll();
            await sleep(delay);
        }
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
    
  // NEW handleFileUpload function
function handleFileUpload(file) {
    if (!file) return;

    // Store the file globally
    attachedFile = file;

    // Create the visual "pill"
    const filePillContainer = document.getElementById('file-pill-container');
    filePillContainer.innerHTML = `
        <div class="file-pill">
            <span class="file-name">${file.name}</span>
            <button class="remove-file-btn" onclick="removeAttachedFile()">×</button>
        </div>
    `;

    // Clear the file input so the same file can be uploaded again
    const fileInput = document.getElementById("file-input");
    if (fileInput) fileInput.value = "";
}

// Add this new function to remove the file
function removeAttachedFile() {
    attachedFile = null;
    const filePillContainer = document.getElementById('file-pill-container');
    filePillContainer.innerHTML = '';
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
    if (!messageText && !attachedFile) return;

    appendMessage(messageText, "user");
    userInput.value = "";
    showThinkingIndicator(true);

    try {
        let response;
        if (attachedFile) {
            const formData = new FormData();
            formData.append('file', attachedFile);
            formData.append('message', messageText);
            formData.append('userId', currentUser._id);
            removeAttachedFile(); // Clear the pill from the UI immediately

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
            if (whiteboardPanel) {
                whiteboardPanel.classList.add('is-hidden');
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

    if (attachBtn) {
        attachBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }

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
                handleFileUpload(e.dataTransfer.files[0]);
                e.dataTransfer.clearData();
            }
        });
    }
    
    initializeApp();
});