// public/js/script.js

console.log("LOG: M∆THM∆TIΧ AI Initialized");

// --- Global Variables ---
let currentUser = null;
let isPlaying = false; 
let audioQueue = [];
let currentAudioSource = null;

// --- Global Helper Functions ---
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
    const studentParentLinkDisplay = document.getElementById('student-parent-link-display');
    const generateLinkCodeBtn = document.getElementById('generate-link-code-btn');
    const linkCodeContainer = document.getElementById('link-code-container');
    const studentLinkCodeValue = document.getElementById('student-link-code-value');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const equationModal = document.getElementById('equation-modal');
    const openEquationBtn = document.getElementById('insert-equation-btn');
    const closeEquationBtn = document.getElementById('close-equation-modal');
    const cancelEquationBtn = document.getElementById('cancel-latex-eq');
    const insertLatexBtn = document.getElementById('insert-latex-eq');
    const mathEditor = document.getElementById('math-editor');
    const userInputForEq = document.getElementById('user-input');

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
            
            setupChatUI();
            await getWelcomeMessage();
            await fetchAndDisplayLeaderboard();
        } catch (error) {
            console.error("Initialization failed, redirecting to login.", error);
            window.location.href = "/login.html";
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
        if (currentUser.role === 'student' && studentParentLinkDisplay) {
            studentParentLinkDisplay.style.display = 'block';
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

    function appendMessage(text, sender, graphData = null, isMasteryQuiz = false) {
        if (!chatBox) return;
        const bubble = document.createElement("div");
        bubble.className = `message ${sender}`;
        bubble.id = `message-${Date.now()}-${Math.random()}`;
        if (isMasteryQuiz) { bubble.classList.add('mastery-quiz'); }
        
        const textNode = document.createElement('span');
        textNode.className = 'message-text';
        if (sender === 'ai' && typeof marked === 'function') {
            textNode.innerHTML = marked.parse(text, { breaks: true });
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
                    functionPlot({
                        target: '#' + graphId,
                        width: bubble.clientWidth > 100 ? bubble.clientWidth - 40 : 250,
                        height: 300, grid: true,
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
        if (!messageText) return;
        appendMessage(messageText, "user");
        userInput.value = "";
        showThinkingIndicator(true);
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser._id, message: messageText }),
                credentials: 'include'
            });
            if (!res.ok) throw new Error(`Server responded with ${res.status}`);
            const data = await res.json();
            let aiText = data.text;
            let graphData = null;
            const graphRegex = /\[GRAPH:({.*})\]/;
            const graphMatch = aiText.match(graphRegex);
            if (graphMatch) {
                try {
                    aiText = aiText.replace(graphRegex, "").trim();
                    graphData = JSON.parse(graphMatch[1]);
                } catch (e) { console.error("Failed to parse graph JSON:", e); graphData = null; }
            }
            appendMessage(aiText, "ai", graphData, data.isMasteryQuiz);
            if (data.userXp !== undefined) {
                currentUser.xp = data.userXp;
                currentUser.level = data.userLevel;
                updateGamificationDisplay();
            }
            if (data.specialXpAwarded) {
                const isLevelUp = data.specialXpAwarded.includes('LEVEL_UP');
                const message = isLevelUp ? data.specialXpAwarded : `+${data.specialXpAwarded}`;
                triggerXpAnimation(message, isLevelUp, !isLevelUp);
            }
        } catch (error) {
            console.error("Chat error:", error);
            appendMessage("I'm having trouble connecting right now. Please try again in a moment.", "ai");
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
        if (levelSpan) levelSpan.textContent = currentUser.level;
        if (xpSpan) xpSpan.textContent = currentUser.xp;
        if (xpBar) {
            xpBar.value = currentUser.xp;
            xpBar.max = window.BRAND_CONFIG?.xpPerLevel || 100;
        }
        if (xpNeededSpan && window.BRAND_CONFIG) {
            xpNeededSpan.textContent = window.BRAND_CONFIG.xpPerLevel || 100;
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
                if (currentUser.unlockedTutors && Array.isArray(currentUser.unlockedTutors)) {
                    currentUser.unlockedTutors.forEach(tutorId => {
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
    if (tutorSelectDropdown) {
        tutorSelectDropdown.addEventListener('change', async () => {
            const newTutorId = tutorSelectDropdown.value;
            if (newTutorId && newTutorId !== currentUser.selectedTutorId) {
                await updateSettings({ selectedTutorId: newTutorId });
                updateTutorAvatar();
            }
        });
    }
    // ... other listeners would be added here in a similar fashion ...
    
    initializeApp();
});