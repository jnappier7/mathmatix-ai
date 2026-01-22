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
let isRapportBuilding = false; // Track if user is in rapport building phase

// Enhanced audio playback state
let audioState = {
    context: null,
    buffer: null,
    source: null,
    startTime: 0,
    pausedAt: 0,
    isPaused: false,
    isPlaying: false,
    playbackRate: 1.0,
    currentMessageId: null,
    currentText: null,
    currentVoiceId: null
};

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
            activeSeconds: activeSeconds
        };

        if (isFinal) {
            // Use sendBeacon for reliable delivery during page unload
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/chat/track-time', blob);
        } else {
            // Regular fetch for heartbeats
            await csrfFetch('/api/chat/track-time', {
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

// Get color for graph expressions (cycles through a palette)
function getGraphColor(index) {
    const colors = [
        '#2563eb', // blue
        '#dc2626', // red
        '#16a34a', // green
        '#9333ea', // purple
        '#ea580c', // orange
        '#0891b2', // cyan
        '#c026d3', // magenta
        '#65a30d'  // lime
    ];
    return colors[index % colors.length];
}

// Convert math expression to Desmos-compatible LaTeX
function convertToDesmosLaTeX(expr) {
    // If already in LaTeX format, return as-is
    if (expr.includes('\\frac') || expr.includes('\\sqrt')) {
        return expr;
    }

    let latex = expr.trim();

    // Handle fractions: (a/b) -> \frac{a}{b}
    // This handles nested parentheses properly
    latex = latex.replace(/\(([^()]+)\/([^()]+)\)/g, '\\frac{$1}{$2}');

    // Handle simple fractions without parens: a/b where a and b are simple terms
    latex = latex.replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}');

    // Handle implicit multiplication: 2x -> 2*x (Desmos handles this)
    // But remove explicit * signs as Desmos prefers implicit
    latex = latex.replace(/\*+/g, '');

    // Handle powers: x^2 -> x^{2}, x^10 -> x^{10}
    latex = latex.replace(/\^(\d+)/g, '^{$1}');
    latex = latex.replace(/\^([a-zA-Z])/g, '^{$1}');

    // Handle square roots: sqrt(x) -> \sqrt{x}
    latex = latex.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');

    // Handle trig functions
    latex = latex.replace(/sin\(/g, '\\sin(');
    latex = latex.replace(/cos\(/g, '\\cos(');
    latex = latex.replace(/tan\(/g, '\\tan(');

    // Handle absolute value: abs(x) -> |x| or \left|x\right|
    latex = latex.replace(/abs\(([^)]+)\)/g, '\\left|$1\\right|');

    // Clean up any double backslashes
    latex = latex.replace(/\\\\/g, '\\');

    return latex;
}

function generateSpeakableText(text) {
    if (!text) return '';
    if (!window.MathLive) return text.replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '');
    const latexRegex = /(\\\(|\\\[|\$\$)([\s\S]+?)(\\\)|\\\]|\$\$)/g;
    let result = '';
    let lastIndex = 0;
    text.replace(latexRegex, (match, openDelim, latexContent, closeDelim, offset) => {
        result += text.substring(lastIndex, offset);
        let speakableMath = MathLive.convertLatexToSpeakableText(latexContent, {
            textToSpeechRules: 'sre', textToSpeechRulesOptions: { domain: 'mathspeak', ruleset: 'mathspeak-brief' }
        });
        // Clean up unwanted TTS verbosity
        speakableMath = speakableMath
            .replace(/\bopen paren(thesis)?\b/gi, '')
            .replace(/\bclosed? paren(thesis)?\b/gi, '')
            .replace(/\bopen fraction\b/gi, '')
            .replace(/\bend fraction\b/gi, '')
            .replace(/\bstart fraction\b/gi, '')
            .replace(/\bfraction\s+(start|end|open|close)\b/gi, '')
            .replace(/\bsubscript\b/gi, '')
            .replace(/\bsuperscript\b/gi, '')
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .trim();
        result += ` ${speakableMath} `;
        lastIndex = offset + match.length;
    });
    if (lastIndex < text.length) { result += text.substring(lastIndex); }
    return result.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '');
}

/**
 * Show level-up celebration modal with tutor video
 * Uses smallcele for regular levels, levelUp for milestone levels (every 5)
 */
function showLevelUpCelebration() {
    const modal = document.getElementById('levelup-celebration-modal');
    const video = document.getElementById('celebration-tutor-video');
    const titleEl = document.getElementById('celebration-title');
    const subtitleEl = document.getElementById('celebration-subtitle');

    if (!modal || !video || !currentUser || !currentUser.selectedTutorId) return;

    // Get the tutor ID
    const tutorId = currentUser.selectedTutorId;

    // Determine which video to use based on level milestone
    const currentLevel = currentUser.level || 1;
    const isMilestone = currentLevel % 5 === 0;
    const videoType = isMilestone ? 'levelUp' : 'smallcele';
    const videoPath = `/videos/${tutorId}_${videoType}.mp4`;

    // Update celebration text based on milestone
    if (titleEl && subtitleEl) {
        if (isMilestone) {
            titleEl.textContent = `LEVEL ${currentLevel}!`;
            subtitleEl.textContent = "🎉 Milestone Achievement! 🎉";
        } else {
            titleEl.textContent = "LEVEL UP!";
            subtitleEl.textContent = "You're getting stronger!";
        }
    }

    // Set video source
    video.src = videoPath;

    // Show modal with animation
    modal.style.display = 'flex';

    // Play video
    video.play().catch(err => {
        console.warn('Video playback failed:', err);
    });

    // Auto-dismiss when video ends (or after 4 seconds as fallback)
    const dismissModal = () => {
        modal.classList.add('fade-out');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('fade-out');
            video.pause();
            video.src = '';
        }, 400);
    };

    video.addEventListener('ended', dismissModal, { once: true });
    setTimeout(dismissModal, 4000); // Fallback timeout

    // Allow click to dismiss
    modal.addEventListener('click', dismissModal, { once: true });
}

function triggerXpAnimation(message, isLevelUp = false, isSpecialXp = false) {
    const animationText = document.createElement('div');
    animationText.textContent = message;
    animationText.classList.add('xp-animation-text');
    if (isLevelUp) {
        animationText.classList.add('level-up-animation-text', 'animate-level-up');

        // Show celebration video modal
        showLevelUpCelebration();

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
    const voiceChatToggle = document.getElementById("voiceChatToggle");
    const changeTutorBtn = document.getElementById('change-tutor-btn');
    const stopAudioBtn = document.getElementById('stop-audio-btn');
    const pauseAudioBtn = document.getElementById('pause-audio-btn');
    const restartAudioBtn = document.getElementById('restart-audio-btn');
    const speedBtn = document.getElementById('speed-btn');
    const speedDropdown = document.getElementById('speed-dropdown');
    const speedControlContainer = document.getElementById('speed-control-container');
    const fullscreenDropzone = document.getElementById('app-layout-wrapper');
    const studentLinkCodeValue = document.getElementById('student-link-code-value');
    const shareProgressHeaderBtn = document.getElementById('share-progress-header-btn');
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
    let messageIndexCounter = 0; // Track message index for reactions
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.textContent += transcript;
        };
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

            // WHITEBOARD SHELVED FOR BETA
            // initializeWhiteboard();
            setupChatUI();
            await fetchAndDisplayParentCode();
            await getWelcomeMessage();
            await fetchAndDisplayLeaderboard();
            await loadQuestsAndChallenges();

            // Show default suggestions after welcome message
            setTimeout(() => showDefaultSuggestions(), 1000);
        } catch (error) {
            console.error("Initialization failed, redirecting to login.", error);
            window.location.href = "/login.html";
        }
    }
    
    function initializeWhiteboard() {
        if (document.getElementById('tutor-canvas') && window.MathmatixWhiteboard) {
            // Initialize the new whiteboard system
            whiteboard = new MathmatixWhiteboard('tutor-canvas', 'whiteboard-panel');
            window.whiteboard = whiteboard; // Make available globally for layout manager
            fabricCanvas = whiteboard.canvas; // Keep for backward compatibility

            // Setup toolbar button event listeners
            setupWhiteboardToolbar();

            // Setup toggle button
            const toggleBtn = document.getElementById('toggle-whiteboard-btn');
            const whiteboardPanel = document.getElementById('whiteboard-panel');
            const openWhiteboardBtn = document.getElementById('open-whiteboard-btn');

            if (toggleBtn && whiteboardPanel) {
                toggleBtn.addEventListener('click', () => {
                    const isHidden = whiteboardPanel.classList.contains('is-hidden');

                    if (isHidden) {
                        // Open whiteboard using proper method to trigger layout manager
                        if (window.whiteboard && typeof window.whiteboard.show === 'function') {
                            window.whiteboard.show();
                        } else {
                            // Fallback if whiteboard not fully initialized
                            whiteboardPanel.classList.remove('is-hidden');
                        }
                        if (openWhiteboardBtn) {
                            openWhiteboardBtn.classList.add('hidden');
                        }
                    } else {
                        // Close whiteboard using proper method to trigger layout manager
                        if (window.whiteboard && typeof window.whiteboard.hide === 'function') {
                            window.whiteboard.hide();
                        } else {
                            // Fallback if whiteboard not fully initialized
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
                    // Open whiteboard using proper method to trigger layout manager
                    if (window.whiteboard && typeof window.whiteboard.show === 'function') {
                        window.whiteboard.show();
                    } else {
                        // Fallback if whiteboard not fully initialized
                        whiteboardPanel.classList.remove('is-hidden');
                    }
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

        // Export menu with dropdown
        const downloadBtn = document.getElementById('download-btn');
        const exportMenu = document.getElementById('export-menu');
        if (downloadBtn && exportMenu) {
            // Toggle menu on click
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
            });

            // Handle export options
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

            // Close menu when clicking outside
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

                    // Use the proper file upload handler to add to attachedFiles array
                    if (window.handleFileUpload) {
                        window.handleFileUpload(file);
                    } else {
                        console.error('handleFileUpload not found - falling back to direct attachment');
                        attachedFile = file; // Fallback for backwards compatibility
                        showFilePill(file.name);
                    }

                    // Set placeholder message (user can edit or replace)
                    if (!userInput.textContent.trim()) {
                        userInput.textContent = 'Can you help me with this?';
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

        // Panel controls are now handled in whiteboard.js setupPanelControls()
        // Open whiteboard button (when closed)
        const openWhiteboardBtn = document.getElementById('open-whiteboard-btn');
        if (openWhiteboardBtn) {
            openWhiteboardBtn.addEventListener('click', () => {
                whiteboard.show();
                openWhiteboardBtn.classList.add('hidden');
            });
        }

        // Keyboard shortcuts now handled in whiteboard.js setupKeyboardShortcuts()
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
    function setupChatUI() {
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
                    const res = await csrfFetch('/api/student/generate-link-code', {
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

    /**
     * Check rapport building status
     * Sets global isRapportBuilding flag
     */
    async function checkRapportStatus() {
        try {
            const res = await fetch('/api/rapport/status', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                isRapportBuilding = !data.rapportComplete;
                console.log('[Rapport] Status:', data);
                return data;
            }
        } catch (error) {
            console.error('[Rapport] Failed to check status:', error);
        }
        isRapportBuilding = false;
        return null;
    }

    async function getWelcomeMessage() {
        try {
            // Check rapport building status first
            await checkRapportStatus();

            // Check if currently in mastery mode
            const inMasteryMode = window.StorageUtils
                ? StorageUtils.session.getItem('masteryModeActive') === 'true'
                : false;

            // Check if user just completed screener
            const screenerJustCompleted = window.StorageUtils
                ? StorageUtils.session.getItem('screenerJustCompleted')
                : null;
            const screenerResults = window.StorageUtils
                ? StorageUtils.session.getItem('screenerResults')
                : null;

            // Only show screener results if in mastery mode (before clearing)
            if (inMasteryMode && screenerJustCompleted === 'true' && screenerResults) {
                // User just finished screener - provide personalized welcome
                const results = JSON.parse(screenerResults);

                const message = `🎉 Great job completing the placement assessment!\n\n` +
                    `**Your Results:**\n` +
                    `• Level: θ = ${results.theta} (${results.percentile}th percentile)\n` +
                    `• Accuracy: ${results.accuracy}% on ${results.questionsAnswered} questions\n\n` +
                    `I've analyzed your responses and identified your strengths and areas for growth. ` +
                    `I'm here to help you learn at your own pace. What would you like to work on today?`;

                appendMessage(message, "ai");

                // Clear the flag so this only shows once
                if (window.StorageUtils) {
                    StorageUtils.session.removeItem('screenerJustCompleted');
                }
                return;
            }

            // Check if user just selected a badge to work on (only in mastery mode)
            const activeBadgeId = window.StorageUtils
                ? StorageUtils.session.getItem('activeBadgeId')
                : null;
            const masteryPhase = window.StorageUtils
                ? StorageUtils.session.getItem('masteryPhase')
                : null;

            // Only show badge welcome if in mastery mode
            if (inMasteryMode && activeBadgeId && masteryPhase) {
                // Fetch active badge details from backend
                try {
                    const badgeResponse = await fetch('/api/mastery/active-badge', {
                        credentials: 'include'
                    });

                    if (badgeResponse.ok) {
                        const badgeData = await badgeResponse.json();
                        const badge = badgeData.activeBadge;

                        if (badge) {
                            const tierEmoji = {
                                bronze: '🥉',
                                silver: '🥈',
                                gold: '🥇',
                                platinum: '💎'
                            };

                            const currentProgress = badge.progress || 0;
                            const currentAccuracy = badge.currentAccuracy
                                ? Math.round(badge.currentAccuracy * 100)
                                : 0;

                            let progressInfo = '';
                            if (badge.problemsCompleted > 0) {
                                progressInfo = `**Current Progress:**\n` +
                                    `• Problems: ${badge.problemsCompleted}/${badge.requiredProblems}\n` +
                                    `• Accuracy: ${currentAccuracy}%\n\n`;
                            }

                            const descriptionText = badge.description
                                ? `\n${badge.description}\n\n`
                                : '\n';

                            const message = `${tierEmoji[badge.tier] || '🏅'} Let's work on earning the **${badge.badgeName}** badge!` +
                                descriptionText +
                                `**Challenge Requirements:**\n` +
                                `• Complete ${badge.requiredProblems} problems\n` +
                                `• Maintain ${Math.round((badge.requiredAccuracy || 0.8) * 100)}% accuracy\n\n` +
                                progressInfo +
                                `I'll guide you through practice problems for **${badge.skillId}**. ` +
                                `Ready to ${badge.problemsCompleted > 0 ? 'continue' : 'start'}? Let me know!`;

                            appendMessage(message, "ai");

                            // Clear the flag so this only shows once
                            if (window.StorageUtils) {
                                StorageUtils.session.removeItem('activeBadgeId');
                            }
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Error fetching badge details:', error);
                    // Fall through to normal welcome message
                }
            }

            // Check if user is in any mastery mode phase
            // If so, skip the normal welcome message (they're in a structured journey)
            if (inMasteryMode && masteryPhase) {
                // User is in mastery mode - no generic welcome needed
                console.log('[Chat] User in mastery mode, skipping generic welcome');
                return;
            }

            // ========== AUTO-EXIT MASTERY MODE ==========
            // If user navigated to chat.html (regular chat), auto-exit mastery mode
            // This happens AFTER checking for mastery-specific welcomes above
            if (inMasteryMode && window.StorageUtils) {
                console.log('[Auto-Exit] Clearing mastery mode state (user returned to chat.html)');
                StorageUtils.session.removeItem('masteryModeActive');
                StorageUtils.session.removeItem('masteryPhase');
                StorageUtils.session.removeItem('activeBadgeId');

                // Update button appearance
                if (window.updateMasteryModeButton) {
                    window.updateMasteryModeButton();
                }
            }

            // AI-generated personalized welcome message
            const res = await fetch(`/api/welcome-message`, {credentials: 'include'});
            const data = await res.json();
            if (data.greeting) {
                appendMessage(data.greeting, "ai");
            }
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

        // Create message container with avatar
        const messageContainer = document.createElement("div");
        messageContainer.className = `message-container ${sender}`;

        // Add avatar for AI messages
        if (sender === 'ai' && currentUser && currentUser.selectedTutorId) {
            const avatar = document.createElement("div");
            avatar.className = "message-avatar";
            const tutor = TUTOR_CONFIG[currentUser.selectedTutorId] || TUTOR_CONFIG.default;
            avatar.innerHTML = `<img src="/images/tutor_avatars/${tutor.image}" alt="${tutor.name}" />`;
            messageContainer.appendChild(avatar);
        }

        // Add avatar for user messages
        if (sender === 'user' && currentUser && currentUser.selectedAvatarId && window.AVATAR_CONFIG) {
            const avatar = document.createElement("div");
            avatar.className = "message-avatar";
            const avatarConfig = window.AVATAR_CONFIG[currentUser.selectedAvatarId];
            if (avatarConfig) {
                const avatarImage = avatarConfig.image || 'default-avatar.png';
                avatar.innerHTML = `<img src="/images/avatars/${avatarImage}" alt="${avatarConfig.name}" />`;
            } else {
                // Fallback if avatar not found
                avatar.innerHTML = `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${currentUser.firstName?.charAt(0) || '?'}</div>`;
            }
            messageContainer.appendChild(avatar);
        }

        const bubble = document.createElement("div");
        bubble.className = `message ${sender}`;
        bubble.id = `message-${Date.now()}-${Math.random()}`;
        bubble.dataset.messageIndex = messageIndexCounter++; // Track index for reactions
        if (isMasteryQuiz) { bubble.classList.add('mastery-quiz'); }

        // Add animation class for entrance
        bubble.classList.add('message-enter');

        const textNode = document.createElement('span');
        textNode.className = 'message-text';
        
        if (sender === 'ai' && typeof marked !== 'undefined' && marked.parse) {
            // Protect entire LaTeX blocks from markdown parsing
            const latexBlocks = [];
            let protectedText = text;

            // Extract and protect display math \[...\]
            protectedText = protectedText.replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
                const index = latexBlocks.length;
                latexBlocks.push(match);
                return `@@LATEX_BLOCK_${index}@@`;
            });

            // Extract and protect inline math \(...\)
            protectedText = protectedText.replace(/\\\(([\s\S]*?)\\\)/g, (match) => {
                const index = latexBlocks.length;
                latexBlocks.push(match);
                return `@@LATEX_BLOCK_${index}@@`;
            });

            // Parse markdown with protected LaTeX
            const dirtyHtml = marked.parse(protectedText, { breaks: true });

            // Restore LaTeX blocks
            let finalHtml = dirtyHtml;
            latexBlocks.forEach((block, index) => {
                finalHtml = finalHtml.replace(`@@LATEX_BLOCK_${index}@@`, block);
            });

            // Sanitize HTML to prevent XSS attacks
            const sanitizedHtml = DOMPurify.sanitize(finalHtml, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span'],
                ALLOWED_ATTR: ['href', 'class', 'target', 'rel']
            });
            textNode.innerHTML = sanitizedHtml;
        } else {
            textNode.textContent = text;
        }
        bubble.appendChild(textNode);

        // Handle Visual Step Breadcrumbs: [STEPS]...[/STEPS]
        if (sender === 'ai' && text && text.includes('[STEPS]')) {
            const stepsRegex = /\[STEPS\]([\s\S]*?)\[\/STEPS\]/g;
            let match;
            while ((match = stepsRegex.exec(text)) !== null) {
                const stepsContent = match[1].trim();
                const lines = stepsContent.split('\n').map(l => l.trim()).filter(l => l);

                if (lines.length > 0) {
                    const stepsContainer = document.createElement('div');
                    stepsContainer.className = 'visual-steps-container';
                    stepsContainer.style.cssText = `
                        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                        border-left: 4px solid #3b82f6;
                        border-radius: 8px;
                        padding: 20px;
                        margin: 15px 0;
                        font-family: 'Courier New', monospace;
                        line-height: 2;
                    `;

                    lines.forEach((line, index) => {
                        // Check if line is an equation (contains = or math operators)
                        const isEquation = /[=+\-*/]|\\[a-z]+/.test(line);

                        const lineDiv = document.createElement('div');
                        lineDiv.style.cssText = `
                            margin: ${isEquation ? '8px 0' : '4px 0'};
                            padding: ${isEquation ? '8px 12px' : '4px 8px'};
                            ${isEquation ? 'background: white; border-radius: 6px; font-size: 1.1em; font-weight: 600;' : 'font-size: 0.9em; color: #1e40af; padding-left: 20px;'}
                        `;

                        // If it's an equation, wrap in LaTeX delimiters if not already
                        if (isEquation && !line.includes('\\(')) {
                            lineDiv.innerHTML = `\\(${line}\\)`;
                        } else {
                            lineDiv.textContent = line;
                        }

                        stepsContainer.appendChild(lineDiv);

                        // Add arrow between steps (but not after last equation or after explanatory text)
                        if (index < lines.length - 1 && isEquation) {
                            const arrow = document.createElement('div');
                            arrow.innerHTML = '↓';
                            arrow.style.cssText = `
                                text-align: center;
                                font-size: 1.5em;
                                color: #3b82f6;
                                margin: 4px 0;
                            `;
                            stepsContainer.appendChild(arrow);
                        }
                    });

                    bubble.appendChild(stepsContainer);
                }
            }
            // Remove [STEPS]...[/STEPS] tags from displayed text
            textNode.innerHTML = textNode.innerHTML.replace(stepsRegex, '');
        }

        // Handle Desmos Graphing: [DESMOS:expression]
        if (sender === 'ai' && text && text.includes('[DESMOS:') && typeof Desmos !== 'undefined') {
            const desmosRegex = /\[DESMOS:([^\]]+)\]/g;
            let match;
            const expressions = [];

            // Collect all Desmos expressions from the message
            while ((match = desmosRegex.exec(text)) !== null) {
                expressions.push(match[1].trim());
            }

            if (expressions.length > 0) {
                // Create Desmos calculator container
                const desmosContainer = document.createElement('div');
                const desmosId = `desmos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                desmosContainer.id = desmosId;
                desmosContainer.className = 'desmos-graph-container';
                desmosContainer.style.cssText = `
                    width: 100%;
                    max-width: 600px;
                    height: 400px;
                    margin: 15px 0;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    overflow: hidden;
                    background: white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                `;

                bubble.appendChild(desmosContainer);

                // Initialize Desmos calculator after a short delay
                setTimeout(() => {
                    try {
                        const calculator = Desmos.GraphingCalculator(document.getElementById(desmosId), {
                            expressions: true,
                            settingsMenu: true,
                            zoomButtons: true,
                            expressionsTopbar: true,
                            pointsOfInterest: true,
                            trace: true,
                            border: false,
                            lockViewport: false,
                            showGrid: true,
                            showXAxis: true,
                            showYAxis: true
                        });

                        // Add each expression to the calculator
                        expressions.forEach((expr, index) => {
                            // Parse expression and convert to LaTeX
                            let latex = convertToDesmosLaTeX(expr);

                            console.log(`[Desmos] Expression ${index}: "${expr}" -> "${latex}"`);

                            calculator.setExpression({
                                id: `expr-${index}`,
                                latex: latex,
                                color: getGraphColor(index),
                                lineStyle: Desmos.Styles.SOLID,
                                lineWidth: 2,
                                hidden: false
                            });
                        });

                        // Auto-zoom to fit the graphs
                        // Give it a moment to render before resetting viewport
                        setTimeout(() => {
                            // Don't reset viewport - let user control it
                            // calculator.setDefaultState();
                        }, 100);

                    } catch (error) {
                        console.error('Desmos initialization error:', error);
                        desmosContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Could not render graph. Please try again.</div>';
                    }
                }, 100);

                // Remove [DESMOS:...] tags from displayed text
                textNode.innerHTML = textNode.innerHTML.replace(desmosRegex, '');
            }
        }

        // Handle Color-Coded Highlights: [OLD:text] and [NEW:text]
        if (sender === 'ai' && textNode.innerHTML) {
            // Highlight removed/changed terms in red
            textNode.innerHTML = textNode.innerHTML.replace(/\[OLD:([^\]]+)\]/g,
                '<span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; text-decoration: line-through; font-weight: 600;">$1</span>');

            // Highlight new/added terms in green
            textNode.innerHTML = textNode.innerHTML.replace(/\[NEW:([^\]]+)\]/g,
                '<span style="background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-weight: 600;">$1</span>');

            // Highlight focus terms in blue (what we're working on)
            textNode.innerHTML = textNode.innerHTML.replace(/\[FOCUS:([^\]]+)\]/g,
                '<span style="background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 2px solid #3b82f6;">$1</span>');
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

        // Append bubble to messageContainer
        messageContainer.appendChild(bubble);

        // Append messageContainer to chatBox
        chatBox.appendChild(messageContainer);

        // Trigger entrance animation
        setTimeout(() => {
            bubble.classList.remove('message-enter');
            bubble.classList.add('message-entered');
        }, 10);

        // AUTO-START GHOST TIMER when AI asks a question
        if (sender === 'ai' && typeof autoStartGhostTimer === 'function') {
            autoStartGhostTimer(text);
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

    // Expose appendMessage and renderMathInElement globally
    window.appendMessage = appendMessage;
    window.renderMathInElement = renderMathInElement;

    // Quick Reply Suggestion Chips (contextual help)
    const suggestionsContainer = document.getElementById('suggestion-chips-container');

    function showSuggestions(suggestions) {
        if (!suggestionsContainer || !suggestions || suggestions.length === 0) return;

        // Clear existing chips
        suggestionsContainer.innerHTML = '';

        // Create chip elements
        suggestions.forEach(suggestion => {
            const chip = document.createElement('button');
            chip.className = 'suggestion-chip';
            chip.textContent = suggestion.text;
            chip.style.cssText = `
                background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
                border: 1px solid #d1d5db;
                border-radius: 20px;
                padding: 8px 16px;
                font-size: 13px;
                color: #374151;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
                font-weight: 500;
            `;

            // Hover effect
            chip.addEventListener('mouseenter', () => {
                chip.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                chip.style.color = 'white';
                chip.style.borderColor = '#8b5cf6';
                chip.style.transform = 'translateY(-2px)';
                chip.style.boxShadow = '0 4px 8px rgba(139, 92, 246, 0.3)';
            });

            chip.addEventListener('mouseleave', () => {
                chip.style.background = 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
                chip.style.color = '#374151';
                chip.style.borderColor = '#d1d5db';
                chip.style.transform = 'translateY(0)';
                chip.style.boxShadow = 'none';
            });

            // Click handler - fills input but doesn't auto-send
            chip.addEventListener('click', () => {
                if (userInput) {
                    userInput.textContent = suggestion.message;
                    userInput.focus();
                    // Trigger resize if needed
                    if (userInput.dispatchEvent) {
                        userInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                // Hide suggestions after selection
                hideSuggestions();
            });

            suggestionsContainer.appendChild(chip);
        });

        // Show with animation
        suggestionsContainer.style.display = 'flex';
        setTimeout(() => {
            suggestionsContainer.style.opacity = '1';
            suggestionsContainer.style.maxHeight = '100px';
        }, 10);
    }

    function hideSuggestions() {
        if (!suggestionsContainer) return;

        suggestionsContainer.style.opacity = '0';
        suggestionsContainer.style.maxHeight = '0';
        setTimeout(() => {
            suggestionsContainer.style.display = 'none';
        }, 300);
    }

    // Show default suggestions on load (these will become contextual later)
    function showDefaultSuggestions() {
        const defaultSuggestions = [
            { text: "💡 Give me a hint", message: "Can you give me a hint?" },
            { text: "📝 Show me an example", message: "Can you show me an example problem?" },
            { text: "🔄 Explain differently", message: "Can you explain that a different way?" }
        ];
        showSuggestions(defaultSuggestions);
    }

    // Expose globally so we can call from other contexts
    window.showSuggestions = showSuggestions;
    window.hideSuggestions = hideSuggestions;

    // Helper function to start a streaming message (creates empty bubble)
    function startStreamingMessage() {
        if (!chatBox) return null;

        const bubble = document.createElement("div");
        bubble.className = "message ai streaming";
        bubble.id = `message-${Date.now()}-${Math.random()}`;
        bubble.dataset.messageIndex = messageIndexCounter++;

        const textNode = document.createElement('span');
        textNode.className = 'message-text';
        textNode.textContent = ''; // Start empty
        bubble.appendChild(textNode);

        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;

        return { bubble, textNode };
    }

    // Helper function to append a chunk to a streaming message
    function appendStreamingChunk(messageRef, chunk) {
        if (!messageRef || !messageRef.textNode) return;

        const currentText = messageRef.textNode.textContent || '';
        const newText = currentText + chunk;

        // Update the text content
        messageRef.textNode.textContent = newText;

        // Re-parse markdown if it's an AI message
        if (messageRef.bubble.classList.contains('ai') && typeof marked !== 'undefined' && marked.parse) {
            // Protect entire LaTeX blocks from markdown parsing
            const latexBlocks = [];
            let protectedText = newText;

            // Extract and protect display math \[...\]
            protectedText = protectedText.replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
                const index = latexBlocks.length;
                latexBlocks.push(match);
                return `@@LATEX_BLOCK_${index}@@`;
            });

            // Extract and protect inline math \(...\)
            protectedText = protectedText.replace(/\\\(([\s\S]*?)\\\)/g, (match) => {
                const index = latexBlocks.length;
                latexBlocks.push(match);
                return `@@LATEX_BLOCK_${index}@@`;
            });

            // Parse markdown with protected LaTeX
            const dirtyHtml = marked.parse(protectedText, { breaks: true });

            // Restore LaTeX blocks
            let finalHtml = dirtyHtml;
            latexBlocks.forEach((block, index) => {
                finalHtml = finalHtml.replace(`@@LATEX_BLOCK_${index}@@`, block);
            });

            messageRef.textNode.innerHTML = finalHtml;
        }

        // Re-render math if MathJax is available
        if (window.renderMathInElement && messageRef.bubble) {
            setTimeout(() => renderMathInElement(messageRef.bubble), 0);
        }

        // Auto-scroll
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Finalize streaming message (add audio, reactions, etc.)
    function finalizeStreamingMessage(messageRef, fullText) {
        if (!messageRef || !messageRef.bubble) return;

        messageRef.bubble.classList.remove('streaming');

        // Add audio playback button
        if (typeof playAudio === 'function') {
            const playBtn = document.createElement("button");
            playBtn.className = "play-audio-btn";
            playBtn.innerHTML = '<i class="fas fa-play"></i><i class="fas fa-wave-square"></i><i class="fas fa-spinner"></i>';
            playBtn.setAttribute("title", "Play audio");
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playBtn.disabled = true;
                playBtn.classList.add('is-loading');
                const tutor = window.TUTOR_CONFIG?.[currentUser?.selectedTutorId] || window.TUTOR_CONFIG?.['default'];
                const speakableText = generateSpeakableText(fullText);
                playAudio(speakableText, tutor?.voiceId, messageRef.bubble.id);
            });
            messageRef.bubble.appendChild(playBtn);
        }

        // Add emoji reaction container (if updateReaction function exists)
        if (typeof updateReaction === 'function') {
            const reactionContainer = document.createElement('div');
            reactionContainer.className = 'reaction-container';
            const reactions = ['😊', '🤔', '😕', '🎉'];
            reactions.forEach(emoji => {
                const reactionBtn = document.createElement('button');
                reactionBtn.className = 'reaction-btn';
                reactionBtn.textContent = emoji;
                reactionBtn.title = `React with ${emoji}`;
                reactionBtn.onclick = async () => {
                    await updateReaction(messageRef.bubble.dataset.messageIndex, emoji);
                };
                reactionContainer.appendChild(reactionBtn);
            });
            messageRef.bubble.appendChild(reactionContainer);
        }

        // Final MathJax render to ensure all LaTeX is processed
        setTimeout(() => renderMathInElement(messageRef.bubble), 100);
    }

    // Helper function to extract text with LaTeX from contenteditable
    function extractMessageText(element) {
        let result = '';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let node;

        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) {
                // Skip text nodes that are inside math-container elements
                // (MathJax creates these when rendering, but we want the LaTeX source instead)
                let parent = node.parentElement;
                let insideMathContainer = false;
                while (parent && parent !== element) {
                    if (parent.classList && parent.classList.contains('math-container')) {
                        insideMathContainer = true;
                        break;
                    }
                    parent = parent.parentElement;
                }

                if (!insideMathContainer) {
                    result += node.textContent;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('math-container')) {
                const latex = node.getAttribute('data-latex');
                if (latex) {
                    result += `\\(${latex}\\)`;
                }
            }
        }

        return result;
    }

    async function sendMessage() {
    const messageText = extractMessageText(userInput).trim();
    if (!messageText && attachedFiles.length === 0) return;

    // CAPTURE RESPONSE TIME from ghost timer
    let responseTime = null;
    if (typeof getResponseTimeAndStop === 'function') {
        responseTime = getResponseTimeAndStop();
    }

    appendMessage(messageText, "user");
    userInput.textContent = "";
    userInput.setAttribute('data-placeholder', "Ask a math question..."); // Reset placeholder
    showThinkingIndicator(true);

    try {
        let response;

        // RAPPORT BUILDING MODE: Route to rapport endpoint
        if (isRapportBuilding && attachedFiles.length === 0) {
            response = await csrfFetch('/api/rapport/respond', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageText }),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.message || errorData.error || `Server error: ${response.status}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();

            // Update rapport status
            if (data.rapportComplete) {
                isRapportBuilding = false;
                console.log('[Rapport] Building complete!');
            }

            // Display AI response
            appendMessage(data.message, "ai");

            showThinkingIndicator(false);
            return;
        }

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
        
            formData.append('fileCount', attachedFiles.length);

            // Add response time if captured
            if (responseTime !== null) {
                formData.append('responseTime', responseTime);
            }

            // Clear files from UI immediately
            clearAllFiles();

            response = await csrfFetch("/api/chat-with-file", {
                method: "POST",
                body: formData,
                credentials: 'include'
            });
        } else {
            // Regular chat (no files)
            const payload = {
                message: messageText
            };

            if (responseTime !== null) {
                payload.responseTime = responseTime;
            }

            // Fetch without streaming - message appears all at once like real texting
            response = await csrfFetch("/api/chat", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
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

        // Process diagram commands and replace with inline images
        if (window.diagramDisplay) {
            try {
                aiText = await window.diagramDisplay.processMessage(aiText);
            } catch (error) {
                console.error('[Diagrams] Error processing diagrams:', error);
            }
        }

        appendMessage(aiText, "ai", graphData, data.isMasteryQuiz);

        // Notify whiteboard-chat layout manager about new AI message
        if (window.whiteboardChatLayout) {
            document.dispatchEvent(new CustomEvent('newAIMessage', {
                detail: { message: aiText }
            }));
        }

        // BOARD-FIRST CHAT INTEGRATION: Handle spatial anchoring if boardContext exists
        if (data.boardContext && window.chatBoardController) {
            const messageElements = document.querySelectorAll('.message.ai');
            const latestMessage = messageElements[messageElements.length - 1];
            if (latestMessage) {
                window.chatBoardController.enhanceChatMessage(latestMessage, 'ai', data.boardContext);
                console.log('[ChatBoard] Enhanced message with board context:', data.boardContext);
            }
        }

        if (data.drawingSequence) {
            renderDrawing(data.drawingSequence);
        }

        // Execute visual teaching commands (whiteboard, algebra tiles, images, manipulatives)
        if (data.visualCommands && window.visualTeachingHandler) {
            try {
                await window.visualTeachingHandler.executeCommands(data.visualCommands);
                console.log('[VisualTeaching] Executed commands:', data.visualCommands);
            } catch (error) {
                console.error('[VisualTeaching] Failed to execute commands:', error);
            }
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

            // Show XP notification in live feed
            if (typeof window.showXpNotification === 'function') {
                // Use xpAwarded if available, otherwise parse from specialXpAwarded
                const xpAmount = data.xpAwarded || (data.xpAmount || 10);
                const reason = data.specialXpAwarded.replace('🎉 ', '').replace('⭐ ', '').replace('🎊 ', '').split('!')[0];
                window.showXpNotification(xpAmount, reason);
            }
        } else if (data.xpAwarded && typeof window.showXpNotification === 'function') {
            // Show regular XP notification even without bonus
            window.showXpNotification(data.xpAwarded, 'Question answered');
        }

        // Smart streak tracking - only when AI explicitly signals problem correctness
        // Prevents false negatives from breaking streaks unfairly
        if (data.problemResult && typeof window.trackProblemAttempt === 'function') {
            // problemResult can be: 'correct', 'incorrect', 'partial'
            // Only track definitive correct/incorrect (skip partial/ambiguous)
            if (data.problemResult === 'correct') {
                window.trackProblemAttempt(true);
            } else if (data.problemResult === 'incorrect') {
                // Still show streak counter but don't break it harshly
                // Could add "Challenge this" button in future
                window.trackProblemAttempt(false);
            }
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

        // Show suggestions after response (even on error)
        setTimeout(() => showDefaultSuggestions(), 500);
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
        if (audioState.isPlaying || audioQueue.length === 0) {
            if (stopAudioBtn && !audioState.isPlaying) stopAudioBtn.style.display = 'none';
            return;
        }

        audioState.isPlaying = true;
        isPlaying = true; // Keep for backward compatibility

        // Update UI
        if (stopAudioBtn) stopAudioBtn.style.display = 'inline-flex';
        updateAudioControls();

        const { text, voiceId, messageId } = audioQueue.shift();
        const messageBubble = document.getElementById(messageId);
        const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;

        // Store current playback info
        audioState.currentMessageId = messageId;
        audioState.currentText = text;
        audioState.currentVoiceId = voiceId;

        try {
            const response = await csrfFetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voiceId })
            });
            if (!response.ok) throw new Error('Failed to fetch audio stream.');

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioState.context = audioContext;

            const audioBuffer = await response.arrayBuffer();
            await audioContext.decodeAudioData(audioBuffer, (buffer) => {
                audioState.buffer = buffer;
                startAudioPlayback(0, playButton);
            });
        } catch (error) {
            console.error('Audio playback error:', error);
            resetAudioState();
            if (playButton) {
                playButton.classList.remove('is-loading');
                playButton.classList.remove('is-playing');
                playButton.disabled = false;
            }
            processAudioQueue();
        }
    }

    function startAudioPlayback(offset = 0, playButton = null) {
        if (!audioState.buffer || !audioState.context) return;

        const source = audioState.context.createBufferSource();
        source.buffer = audioState.buffer;
        source.playbackRate.value = audioState.playbackRate;
        source.connect(audioState.context.destination);

        audioState.source = source;
        currentAudioSource = source; // Keep for backward compatibility
        audioState.startTime = audioState.context.currentTime - offset;
        audioState.isPaused = false;

        if (playButton) {
            playButton.classList.remove('is-loading');
            playButton.classList.add('is-playing');
        }

        source.start(0, offset);

        source.onended = () => {
            // Only process if not manually stopped
            if (audioState.isPlaying && !audioState.isPaused) {
                handleAudioEnded(playButton);
            }
        };

        updateAudioControls();
    }

    function handleAudioEnded(playButton) {
        resetAudioState();

        if (playButton) {
            playButton.classList.remove('is-playing');
            playButton.disabled = false;
        }

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
    }

    function pauseAudio() {
        if (!audioState.isPlaying || audioState.isPaused || !audioState.source) return;

        const elapsed = audioState.context.currentTime - audioState.startTime;
        audioState.pausedAt = elapsed;
        audioState.isPaused = true;

        audioState.source.stop();
        audioState.source = null;
        currentAudioSource = null;

        updateAudioControls();

        const messageBubble = document.getElementById(audioState.currentMessageId);
        const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;
        if (playButton) {
            playButton.classList.remove('is-playing');
            playButton.classList.add('is-paused');
        }
    }

    function resumeAudio() {
        if (!audioState.isPaused || !audioState.buffer) return;

        const messageBubble = document.getElementById(audioState.currentMessageId);
        const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;

        if (playButton) {
            playButton.classList.remove('is-paused');
        }

        startAudioPlayback(audioState.pausedAt, playButton);
    }

    function restartAudio() {
        if (!audioState.isPlaying && !audioState.isPaused) return;

        if (audioState.source) {
            audioState.source.stop();
            audioState.source = null;
            currentAudioSource = null;
        }

        const messageBubble = document.getElementById(audioState.currentMessageId);
        const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;

        audioState.pausedAt = 0;
        audioState.isPaused = false;

        startAudioPlayback(0, playButton);
    }

    function stopAudio() {
        if (audioState.source) {
            audioState.source.stop();
        }

        const messageBubble = document.getElementById(audioState.currentMessageId);
        const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;
        if (playButton) {
            playButton.classList.remove('is-playing', 'is-paused');
            playButton.disabled = false;
        }

        resetAudioState();
        updateAudioControls();
        processAudioQueue();
    }

    function changePlaybackSpeed(rate) {
        audioState.playbackRate = rate;

        // If currently playing, apply the new rate
        if (audioState.source && !audioState.isPaused) {
            audioState.source.playbackRate.value = rate;
        }

        // Save preference
        if (localStorage) {
            localStorage.setItem('ttsPlaybackRate', rate);
        }

        updateAudioControls();
    }

    function resetAudioState() {
        if (audioState.context) {
            audioState.context.close();
        }

        audioState.context = null;
        audioState.buffer = null;
        audioState.source = null;
        audioState.startTime = 0;
        audioState.pausedAt = 0;
        audioState.isPaused = false;
        audioState.isPlaying = false;
        audioState.currentMessageId = null;
        audioState.currentText = null;
        audioState.currentVoiceId = null;

        isPlaying = false; // Keep for backward compatibility
        currentAudioSource = null;

        updateAudioControls();
    }

    function updateAudioControls() {
        const pauseBtn = document.getElementById('pause-audio-btn');
        const restartBtn = document.getElementById('restart-audio-btn');
        const speedDisplay = document.getElementById('speed-display');
        const speedControlContainer = document.getElementById('speed-control-container');

        const isActive = audioState.isPlaying || audioState.isPaused;

        if (pauseBtn) {
            if (audioState.isPlaying && !audioState.isPaused) {
                pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                pauseBtn.title = 'Pause';
                pauseBtn.style.display = 'inline-flex';
            } else if (audioState.isPaused) {
                pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                pauseBtn.title = 'Resume';
                pauseBtn.style.display = 'inline-flex';
            } else {
                pauseBtn.style.display = 'none';
            }
        }

        if (restartBtn) {
            restartBtn.style.display = isActive ? 'inline-flex' : 'none';
        }

        if (speedDisplay) {
            speedDisplay.textContent = `${audioState.playbackRate}x`;
        }

        if (speedControlContainer) {
            speedControlContainer.style.display = isActive ? 'inline-block' : 'none';
        }

        if (stopAudioBtn) {
            stopAudioBtn.style.display = isActive ? 'inline-flex' : 'none';
        }
    }
    
    function updateGamificationDisplay() {
        // Sidebar progress display
        const sidebarLevel = document.getElementById("sidebar-level");
        const sidebarXp = document.getElementById("sidebar-xp");
        const sidebarProgressFill = document.getElementById("sidebar-progress-fill");

        if (sidebarLevel && currentUser.level) {
            sidebarLevel.textContent = currentUser.level;
        }

        if (sidebarXp && currentUser.xpForCurrentLevel !== undefined && currentUser.xpForNextLevel !== undefined) {
            sidebarXp.textContent = `${currentUser.xpForCurrentLevel} / ${currentUser.xpForNextLevel} XP`;
        }

        if (sidebarProgressFill && currentUser.xpForCurrentLevel !== undefined && currentUser.xpForNextLevel !== undefined) {
            const percentage = (currentUser.xpForCurrentLevel / currentUser.xpForNextLevel) * 100;
            sidebarProgressFill.style.width = `${Math.min(100, percentage)}%`;
        }

        // Also update any legacy elements if they exist
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

    /**
     * Load and display daily quests and weekly challenges
     */
    async function loadQuestsAndChallenges() {
        if (typeof window.renderDailyQuests !== 'function' || typeof window.renderWeeklyChallenges !== 'function') {
            console.log('Quest rendering functions not available');
            return;
        }

        try {
            // Fetch daily quests
            const questsRes = await fetch('/api/daily-quests', { credentials: 'include' });
            if (questsRes.ok) {
                const questsData = await questsRes.json();
                if (questsData && questsData.quests) {
                    window.renderDailyQuests(questsData.quests);
                }
            }

            // Fetch weekly challenges
            const challengesRes = await fetch('/api/weekly-challenges', { credentials: 'include' });
            if (challengesRes.ok) {
                const challengesData = await challengesRes.json();
                if (challengesData && challengesData.challenges) {
                    window.renderWeeklyChallenges(challengesData.challenges);
                }
            }
        } catch (error) {
            console.error('Error loading quests/challenges:', error);
        }
    }

    // --- Settings Modal Logic ---
    function openSettingsModal() {
        if (settingsModal && currentUser) {
            handsFreeToggle.checked = !!currentUser.preferences.handsFreeModeEnabled;
            autoplayTtsToggle.checked = !!currentUser.preferences.autoplayTtsHandsFree;
            voiceChatToggle.checked = currentUser.preferences.voiceChatEnabled !== false; // Default to true
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
    if (userInput) {
        userInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        // Hide suggestions when user starts typing
        userInput.addEventListener("input", () => {
            if (userInput.textContent.trim().length > 0) {
                hideSuggestions();
            }
        });
    }

    // Audio control event listeners
    if (stopAudioBtn) {
        stopAudioBtn.addEventListener('click', stopAudio);
    }
    if (pauseAudioBtn) {
        pauseAudioBtn.addEventListener('click', () => {
            if (audioState.isPaused) {
                resumeAudio();
            } else {
                pauseAudio();
            }
        });
    }
    if (restartAudioBtn) {
        restartAudioBtn.addEventListener('click', restartAudio);
    }
    if (speedBtn && speedDropdown) {
        speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            speedDropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            speedDropdown.classList.remove('show');
        });

        // Handle speed selection
        speedDropdown.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const speed = parseFloat(btn.getAttribute('data-speed'));
                changePlaybackSpeed(speed);

                // Update active state
                speedDropdown.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                speedDropdown.classList.remove('show');
            });
        });

        // Load saved playback speed
        const savedSpeed = localStorage.getItem('ttsPlaybackRate');
        if (savedSpeed) {
            const speed = parseFloat(savedSpeed);
            changePlaybackSpeed(speed);
            speedDropdown.querySelectorAll('button').forEach(btn => {
                if (parseFloat(btn.getAttribute('data-speed')) === speed) {
                    btn.classList.add('active');
                }
            });
        } else {
            // Mark 1x as active by default
            speedDropdown.querySelector('button[data-speed="1"]')?.classList.add('active');
        }
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);
    if (settingsModal) settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });

    // Share Progress button - copy link code to clipboard
    if (shareProgressHeaderBtn) {
        shareProgressHeaderBtn.addEventListener('click', async () => {
            if (currentUser && currentUser.role === 'student') {
                let code = currentUser.studentToParentLinkCode?.code;

                // Generate code if it doesn't exist
                if (!code) {
                    try {
                        const res = await csrfFetch('/api/student/generate-link-code', {
                            method: 'POST',
                            credentials: 'include'
                        });
                        const data = await res.json();
                        if (data.success && data.code) {
                            code = data.code;
                            currentUser.studentToParentLinkCode = { code: data.code, parentLinked: false };
                        }
                    } catch (err) {
                        console.error('Error generating parent link code:', err);
                        showToast('Failed to generate share code', 2000);
                        return;
                    }
                }

                // Copy to clipboard
                if (code) {
                    navigator.clipboard.writeText(code);
                    showToast(`Share code copied: ${code}`, 3000);
                }
            }
        });
    }

    // Settings toggle event listeners
    if (handsFreeToggle) {
        handsFreeToggle.addEventListener('change', async () => {
            await updateSettings({ handsFreeModeEnabled: handsFreeToggle.checked });
            if (currentUser) currentUser.preferences.handsFreeModeEnabled = handsFreeToggle.checked;
        });
    }
    if (autoplayTtsToggle) {
        autoplayTtsToggle.addEventListener('change', async () => {
            await updateSettings({ autoplayTtsHandsFree: autoplayTtsToggle.checked });
            if (currentUser) currentUser.preferences.autoplayTtsHandsFree = autoplayTtsToggle.checked;
        });
    }
    if (voiceChatToggle) {
        voiceChatToggle.addEventListener('change', async () => {
            await updateSettings({ voiceChatEnabled: voiceChatToggle.checked });
            if (currentUser) currentUser.preferences.voiceChatEnabled = voiceChatToggle.checked;

            // Show/hide voice orb
            if (window.voiceController) {
                const voiceContainer = document.getElementById('voice-chat-container');
                if (voiceContainer) {
                    voiceContainer.style.display = voiceChatToggle.checked ? 'flex' : 'none';
                }
            }
        });
    }

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
                // Create a container for the rendered math
                const mathContainer = document.createElement('span');
                mathContainer.className = 'math-container';
                mathContainer.setAttribute('data-latex', latex);
                mathContainer.textContent = `\\(${latex}\\)`;

                // Insert at cursor position or at the end
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && userInput.contains(selection.anchorNode)) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(mathContainer);
                    // Add a space after
                    const space = document.createTextNode(' ');
                    range.insertNode(space);
                    // Move cursor after the space
                    range.setStartAfter(space);
                    range.setEndAfter(space);
                    selection.removeAllRanges();
                    selection.addRange(range);
                } else {
                    userInput.appendChild(mathContainer);
                    userInput.appendChild(document.createTextNode(' '));
                }

                // Render the math using MathJax
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([mathContainer]).catch((err) => console.log('MathJax error:', err));
                }

                inlineMathEditor.value = ''; // Clear the editor
                inlineEquationPalette.style.display = 'none';
                userInput.focus();
            }
        });
    }

    // Make inline equation palette draggable
    if (inlineEquationPalette) {
        const paletteHeader = document.querySelector('.equation-palette-header');
        let isDraggingPalette = false;
        let paletteOffsetX = 0;
        let paletteOffsetY = 0;

        if (paletteHeader) {
            paletteHeader.addEventListener('mousedown', (e) => {
                // Don't drag if clicking on close button
                if (e.target.closest('.palette-close-btn')) return;

                isDraggingPalette = true;
                const rect = inlineEquationPalette.getBoundingClientRect();
                paletteOffsetX = e.clientX - rect.left;
                paletteOffsetY = e.clientY - rect.top;
                paletteHeader.style.cursor = 'grabbing';

                // Disable transform to allow free positioning
                inlineEquationPalette.style.transform = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDraggingPalette) return;
                e.preventDefault();

                let newX = e.clientX - paletteOffsetX;
                let newY = e.clientY - paletteOffsetY;

                // Keep within viewport bounds
                const maxX = window.innerWidth - inlineEquationPalette.offsetWidth;
                const maxY = window.innerHeight - inlineEquationPalette.offsetHeight;

                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));

                inlineEquationPalette.style.left = `${newX}px`;
                inlineEquationPalette.style.top = `${newY}px`;
            });

            document.addEventListener('mouseup', () => {
                if (isDraggingPalette) {
                    isDraggingPalette = false;
                    paletteHeader.style.cursor = 'move';
                }
            });
        }
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
                if (!isDraggingModal || !modalContent) return;

                e.preventDefault();

                let newX = e.clientX - modalOffsetX;
                let newY = e.clientY - modalOffsetY;

                // Keep modal within viewport
                newX = Math.max(0, Math.min(newX, window.innerWidth - modalContent.offsetWidth));
                newY = Math.max(0, Math.min(newY, window.innerHeight - modalContent.offsetHeight));

                modalContent.style.left = newX + 'px';
                modalContent.style.top = newY + 'px';
                modalContent.style.transform = 'none'; // Remove centering transform once dragged
            });

            document.addEventListener('mouseup', () => {
                if (isDraggingModal) {
                    isDraggingModal = false;
                    if (modalHeader) modalHeader.style.cursor = 'move';
                }
            });
        }

        if (closeEquationBtn) {
            closeEquationBtn.addEventListener('click', () => {
                equationModal.classList.remove('is-visible');
            });
        }

        if (cancelEquationBtn) {
            cancelEquationBtn.addEventListener('click', () => {
                equationModal.classList.remove('is-visible');
            });
        }

        if (insertLatexBtn) {
            insertLatexBtn.addEventListener('click', () => {
                if (mathEditor && userInput) {
                    const latex = mathEditor.value;
                    // Create a container for the rendered math
                    const mathContainer = document.createElement('span');
                    mathContainer.className = 'math-container';
                    mathContainer.setAttribute('data-latex', latex);
                    mathContainer.textContent = `\\(${latex}\\)`;

                    userInput.appendChild(mathContainer);
                    userInput.appendChild(document.createTextNode(' '));

                    // Render the math using MathJax
                    if (window.MathJax && window.MathJax.typesetPromise) {
                        window.MathJax.typesetPromise([mathContainer]).catch((err) => console.log('MathJax error:', err));
                    }

                    equationModal.classList.remove('is-visible');
                }
            });
        }
    }
    
    if (closeWhiteboardBtn) {
        closeWhiteboardBtn.addEventListener('click', () => {
            const whiteboardPanel = document.getElementById('whiteboard-panel');
            if (whiteboardPanel) {
                whiteboardPanel.classList.add('is-hidden');
                whiteboardPanel.classList.remove('collapsed');
                document.body.classList.remove('whiteboard-split-screen');
                const chatContainer = document.getElementById('chat-container');
                if (chatContainer) {
                    chatContainer.classList.remove('whiteboard-collapsed');
                }
                const openBtn = document.getElementById('open-whiteboard-btn');
                if (openBtn) openBtn.classList.remove('hidden');
            }
        });
    }

    // Handle minimize button - collapse to thin bar
    const minimizeWhiteboardBtn = document.getElementById('minimize-whiteboard-btn');
    if (minimizeWhiteboardBtn) {
        minimizeWhiteboardBtn.addEventListener('click', () => {
            const whiteboardPanel = document.getElementById('whiteboard-panel');
            const chatContainer = document.getElementById('chat-container');
            const icon = minimizeWhiteboardBtn.querySelector('i');

            if (whiteboardPanel && chatContainer) {
                const isCollapsed = whiteboardPanel.classList.contains('collapsed');

                if (isCollapsed) {
                    // Expand whiteboard
                    whiteboardPanel.classList.remove('collapsed');
                    chatContainer.classList.remove('whiteboard-collapsed');
                    if (icon) {
                        icon.className = 'fas fa-window-minimize';
                    }
                    minimizeWhiteboardBtn.setAttribute('title', 'Minimize');
                    minimizeWhiteboardBtn.setAttribute('data-tooltip', 'Minimize');
                } else {
                    // Collapse whiteboard to thin bar
                    whiteboardPanel.classList.add('collapsed');
                    chatContainer.classList.add('whiteboard-collapsed');
                    if (icon) {
                        icon.className = 'fas fa-window-maximize';
                    }
                    minimizeWhiteboardBtn.setAttribute('title', 'Expand');
                    minimizeWhiteboardBtn.setAttribute('data-tooltip', 'Expand');
                }
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

    // Camera capture button - now handled by show-your-work.js
    // const cameraBtn = document.getElementById('camera-button');
    // if (cameraBtn) {
    //     cameraBtn.addEventListener('click', async () => {
    //         try {
    //             // Create file input for camera
    //             const cameraInput = document.createElement('input');
    //             cameraInput.type = 'file';
    //             cameraInput.accept = 'image/*';
    //             cameraInput.capture = 'environment'; // Use rear camera on mobile

    //             cameraInput.addEventListener('change', (e) => {
    //                 if (e.target.files && e.target.files.length > 0) {
    //                     handleFileUpload(e.target.files);
    //                 }
    //             });

    //             cameraInput.click();
    //         } catch (error) {
    //             console.error('Camera error:', error);
    //             showToast('Camera not available', 2000);
    //         }
    //     });
    // }

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

    async function addReaction(messageBubble, reactionDisplay, emoji) {
        const messageIndex = parseInt(messageBubble.dataset.messageIndex);
        if (isNaN(messageIndex)) {
            console.error('Message index not found');
            return;
        }

        // Check if already has this reaction
        const existingReaction = reactionDisplay.querySelector('.reaction-emoji');
        const isRemoving = existingReaction && existingReaction.textContent === emoji;

        try {
            // Send to backend
            const response = await fetch('/api/chat/reaction', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    messageIndex,
                    reaction: isRemoving ? null : emoji
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save reaction');
            }

            // Update UI
            if (isRemoving) {
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
                    addReaction(messageBubble, reactionDisplay, emoji); // Remove on click
                });
                reactionDisplay.appendChild(reactionEmoji);
                reactionDisplay.classList.add('has-reaction');
            }
        } catch (error) {
            console.error('Error saving reaction:', error);
            showToast('Failed to save reaction', 2000);
        }
    }

    /**
     * Update chat display when switching sessions
     * Called by sidebar.js when user clicks on a session
     */
    window.updateChatForSession = function(conversation, messages) {
        console.log('[updateChatForSession] Switching to conversation:', conversation);

        // Clear current chat
        if (chatBox) {
            chatBox.innerHTML = '';
            messageIndexCounter = 0; // Reset message counter
        }

        // Display session header if it's a topic-based conversation
        if (conversation.conversationType === 'topic' && conversation.topic) {
            const headerDiv = document.createElement('div');
            headerDiv.className = 'session-header';
            headerDiv.style.cssText = `
                text-align: center;
                padding: 20px;
                margin: 20px 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 12px;
                color: white;
            `;
            headerDiv.innerHTML = `
                <h2 style="margin: 0; font-size: 1.5em;">
                    ${conversation.topicEmoji || '📚'} ${conversation.name || conversation.topic}
                </h2>
            `;
            chatBox.appendChild(headerDiv);
        }

        // Load and display messages
        if (messages && messages.length > 0) {
            messages.forEach(msg => {
                const sender = msg.role === 'user' ? 'user' : 'ai';
                appendMessage(msg.content, sender);
            });

            // Scroll to bottom
            setTimeout(() => {
                chatBox.scrollTop = chatBox.scrollHeight;
            }, 100);
        } else {
            // No messages yet - show welcome message
            if (conversation.conversationType === 'topic') {
                appendMessage(
                    `Welcome to your ${conversation.topic || 'topic'} session! 📚\n\n` +
                    `I'm here to help you learn and practice. What would you like to work on?`,
                    'ai'
                );
            }
        }

        console.log('[updateChatForSession] Loaded', messages?.length || 0, 'messages');
    };

    initializeApp();
});
