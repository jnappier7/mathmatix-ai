// public/js/script.js - FINAL VERSION 6/24/25_14:50(CONSOLIDATED & REFINED - ALL CLIENT-SIDE FIXES)
console.log("LOG: M∆THM∆TIΧ Initialized");

// --- DECLARE ALL GLOBAL CONSTANTS (DOM Elements) ---
// These are accessed globally, so they must be declared at the top level
const chatBox = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const attachBtn = document.getElementById("attach-button");
const equationBtn = document.getElementById("insert-equation");
const fileInput = document.getElementById("file-input");
const mathModal = document.getElementById("equation-popup");
const insertMathBtn = document.getElementById("insert-latex");
const closeMathBtn = document.getElementById("close-equation-popup");
const mathEditor = document.getElementById("math-editor");
const switchTutorModal = document.getElementById("switch-tutor-modal");
const closeTutorModalBtn = document.getElementById("close-tutor-modal-btn");
const cancelSwitchTutorBtn = document.getElementById("cancel-switch-tutor");
const avatarContainer = document.getElementById('avatar-container'); // Declare globally

// Tab elements - Declared globally as they are accessed in tab switching logic
const modeTabs = document.getElementById('mode-tabs');
const tabButtons = document.querySelectorAll('.tab-button');
const chatPane = document.getElementById('chat-pane');
const lessonsPane = document.getElementById('lessons-pane');
const progressPane = document.getElementById('progress-pane');
const badgesPane = document.getElementById('badges-pane');
const settingsPane = document.getElementById('settings-pane');

// Settings pane elements - Declared globally as they are used by save/load functions
const tutorSelect = document.getElementById('tutor-select');
const toneSelect = document.getElementById('tone-select');
const styleSelect = document.getElementById('style-select');
const voiceModeEnabledCheckbox = document.getElementById('voice-mode-enabled');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const exportHistoryBtn = document.getElementById('export-history-btn');
const logoutSettingsBtn = document.getElementById('logout-settings-btn');

// Leaderboard elements - Declared globally
const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');


// --- DECLARE ALL GLOBAL LET VARIABLES ---
// These hold state and might be reassigned
let currentLevelSpan, currentXpSpan, xpNeededSpan, xpLevelDisplay, thinkingIndicator, logoutBtn, voiceModeToggle, currentAudio = null, isRecognitionActive = false, audioStopBtn, studentParentLinkDisplay, studentLinkCodeValue, recognition = null;
let currentUser = null; // Declare globally and allow reassignment
let isVoiceModeEnabled = localStorage.getItem('voiceMode') === 'true'; // Consistent naming
let isMathJaxReady = window.isMathJaxReady || false; // Check if MathJax has loaded
let currentChatHistory = []; // Needed for welcome message currentHistory parameter
const XP_PER_LEVEL = 100; // Define globally for XP calculations


// --- CORE HELPER FUNCTIONS (Globally Defined - BEFORE DOMContentLoaded) ---

// File Upload Function
function uploadSelectedFile(file) {
    console.log("LOG: uploadSelectedFile called for file:", file.name);
    if (!file) return;
    const fileSizeLimit = 5 * 1024 * 1024; // 5 MB
    if (file.size > fileSizeLimit) {
        window.appendMessage("File size exceeds 5MB limit.", "ai");
        return;
    }
    const acceptedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!acceptedTypes.includes(file.type)) {
        window.appendMessage("Only JPG, PNG, and PDF files are allowed.", "ai");
        return;
    }
    const formData = new FormData();
    formData.append("file", file);
    if (currentUser) formData.append("userId", currentUser._id);
    window.appendMessage(`Uploading: ${file.name}`, "user");
    showThinkingIndicator(true);
    fetch("/upload", { method: "POST", body: formData, credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.text) window.appendMessage(data.text, "ai");
            if (data.imageUrl) window.appendMessage(`<img src="${data.imageUrl}" class="chat-image" alt="Uploaded Content">`, "ai");
        })
        .catch(err => {
            console.error("Upload error:", err);
            window.appendMessage("Upload failed. Please try again.", "ai");
        })
        .finally(() => showThinkingIndicator(false));
}

// Audio Playback Function (Text-to-Speech)
async function speakText(textToSpeak, dynamicVoiceId = null) {
    console.log("LOG: speakText called for text:", textToSpeak.substring(0, Math.min(textToSpeak.length, 50)) + "...");
    if (currentAudio) stopAudioPlayback(); // Ensure current audio is stopped before new playback
    if (!textToSpeak) return; // Don't try to speak empty text
    let cleanedText = textToSpeak.replace(/\[MATH\].*?\[\/MATH\]/g, ' [equation] '); // Remove math tags for TTS
    cleanedText = cleanedText.replace(/\*/g, ''); // Remove emphasis asterisks

    const TUTOR_CONFIG_FRONTEND = window.TUTOR_CONFIG;
    // Fallback voiceId if dynamicVoiceId is null or TUTOR_CONFIG not loaded
    const voiceId = dynamicVoiceId || (TUTOR_CONFIG_FRONTEND ? TUTOR_CONFIG_FRONTEND['default'].voiceId : "2eFQnnNM32GDnZkCfkSm");

    try {
        const response = await fetch("/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: cleanedText, voiceId }),
        });
        if (!response.ok) throw new Error(`ElevenLabs TTS failed: ${response.statusText}`);
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudio = new Audio(audioUrl);
        currentAudio.play().catch(e => console.error("Error playing audio:", e)); // Catch play() errors
        if (audioStopBtn) audioStopBtn.style.display = 'inline-block'; // Show stop button
        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl); // Clean up
            currentAudio = null;
            if (audioStopBtn) audioStopBtn.style.display = 'none'; // Hide stop button
        };
    } catch (err) {
        console.error("Error fetching or playing speech:", err);
    }
}

// Stop Audio Playback Function
function stopAudioPlayback() {
    console.log("LOG: stopAudioPlayback called.");
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0; // Reset playback position
        currentAudio = null;
        if (audioStopBtn) audioStopBtn.style.display = 'none';
    }
}

// Function to Append Messages to Chat Box
window.appendMessage = function(message, sender = "user", voiceIdToUse = null) {
    console.log(`LOG: appendMessage called. Sender: ${sender}, Message: ${message.substring(0, Math.min(message.length, 50))}...`);
    const messageContent = String(message || ''); // Ensure message is a string
    const bubble = document.createElement("div");
    bubble.className = `message ${sender}`;
    const mathRegex = /\[MATH\](.*?)\[\/MATH\]/g;
    let processedMessage = messageContent;

    // Handle MathJax rendering
    if (messageContent.match(mathRegex)) {
        processedMessage = messageContent.replace(/\n/g, '<br>'); // Preserve newlines
        processedMessage = processedMessage.replace(mathRegex, (match, p1) => p1); // Extract LaTeX content
        bubble.innerHTML = processedMessage;
        if (isMathJaxReady && window.MathJax) {
            console.log("LOG: MathJax is ready, typesetting message.");
            window.MathJax.typesetPromise([bubble]).catch(err => console.error("MathJax typesetting failed:", err));
        } else {
             console.warn("WARN: MathJax not ready or window.MathJax not available for typesetting.");
        }
    } else {
        bubble.innerHTML = processedMessage.replace(/\n/g, '<br>');
    }

    // Add Speak button for AI messages
    if (sender === "ai") {
        const speakButton = document.createElement("button");
        speakButton.className = "speak-message-btn";
        speakButton.innerHTML = "🔊"; // Speaker emoji
        speakButton.title = "Read aloud";
        speakButton.onclick = () => {
            let textToSpeak = bubble.textContent; // Get plain text from the bubble
            speakText(textToSpeak, voiceIdToUse); // Use the global speakText function
        };
        bubble.prepend(speakButton); // Add button at the beginning of the bubble
    }

    // Append to chat box and scroll to bottom
    if (chatBox) {
        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
};

// Show/Hide Thinking Indicator
function showThinkingIndicator(show) {
    console.log(`LOG: showThinkingIndicator set to: ${show}`);
    if (thinkingIndicator) thinkingIndicator.style.display = show ? "flex" : "none";
}

// Award XP Function
window.awardXP = function(amount, isSpecial = false) {
    console.log(`LOG: Awarding ${amount} XP (Special: ${isSpecial})`);
    if (currentUser) {
        currentUser.xp = (currentUser.xp || 0) + amount; // Update XP on current user object
        updateGamifiedDashboard(currentUser.xp, currentUser.level, amount); // Update UI
    }
    triggerXpGainAnimation(amount, isSpecial); // Trigger animation
}

// Update XP/Level Display on Dashboard
function updateGamifiedDashboard(userXp, userLevel, specialXpAwarded = 0) {
    console.log(`LOG: updateGamifiedDashboard called with XP: ${userXp}, Level: ${userLevel}`);
    // Check if elements are available before updating
    if (!currentLevelSpan || !currentXpSpan || !xpNeededSpan || !xpLevelDisplay) {
        console.warn("WARN: Gamified dashboard elements not found. Cannot update dashboard UI.");
        return;
    }
    const oldLevel = parseInt(currentLevelSpan.textContent);
    currentLevelSpan.textContent = userLevel;
    const xpNeededForNextLevel = (userLevel) * XP_PER_LEVEL; // Calculate XP needed for next level
    currentXpSpan.textContent = userXp;
    xpNeededSpan.textContent = xpNeededForNextLevel;

    // Trigger animations based on changes
    if (userLevel > oldLevel) {
        console.log("LOG: Level up animation triggered.");
        triggerLevelUpAnimation(userLevel);
    } else if (specialXpAwarded > 0) {
        console.log("LOG: XP gain animation triggered.");
        triggerXpGainAnimation(specialXpAwarded, true);
    }
}

// XP Gain Animation
function triggerXpGainAnimation(amount, isSpecial = false) {
    console.log(`LOG: Triggering XP animation for ${amount} XP`);
    const xpAnim = document.createElement('div');
    xpAnim.textContent = `+${amount} XP`;
    xpAnim.classList.add('xp-animation-text');
    if (isSpecial) xpAnim.classList.add('special-xp');
    document.body.appendChild(xpAnim);

    // Position the animation near the XP display
    if (xpLevelDisplay) {
        const rect = xpLevelDisplay.getBoundingClientRect();
        xpAnim.style.left = `${rect.left + rect.width / 2}px`;
        xpAnim.style.top = `${rect.top}px`;
    } else {
        // Fallback positioning if XP display isn't found
        xpAnim.style.left = '50%';
        xpAnim.style.top = '50%';
        xpAnim.style.transform = 'translate(-50%, -50%)';
    }

    xpAnim.classList.add('animate-xp');
    xpAnim.onanimationend = () => xpAnim.remove(); // Remove element after animation
}

// Level Up Animation
function triggerLevelUpAnimation(newLevel) {
    console.log(`LOG: Triggering Level Up animation to Level ${newLevel}`);
    const levelAnim = document.createElement('div');
    levelAnim.textContent = `LEVEL UP! ${newLevel}!`;
    levelAnim.classList.add('level-up-animation-text');
    document.body.appendChild(levelAnim);

    if (xpLevelDisplay) {
        const rect = xpLevelDisplay.getBoundingClientRect();
        levelAnim.style.left = `${rect.left + rect.width / 2}px`;
        levelAnim.style.top = `${rect.top}px`;
    } else {
        levelAnim.style.left = '50%';
        levelAnim.style.top = '50%';
        levelAnim.style.transform = 'translate(-50%, -50%)';
    }

    levelAnim.classList.add('animate-level-up');
    levelAnim.onanimationend = () => levelAnim.remove();
}

// Fetch and Display Leaderboard Data
async function fetchAndDisplayLeaderboard() {
    console.log("LOG: fetchAndDisplayLeaderboard called.");
    // leaderboardTableBody is already globally defined as a const at the top

    if (!leaderboardTableBody) {
        console.warn("WARN: Leaderboard table body not found. Cannot update leaderboard.");
        return;
    }

    leaderboardTableBody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-4 text-gray-500">Loading leaderboard...</td>
        </tr>
    `;

    try {
        const response = await fetch('/api/leaderboard', { credentials: 'include' });

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 401 || response.status === 403) {
                console.warn(`WARN: Not authorized to view leaderboard: ${response.status}`);
                leaderboardTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center py-4 text-red-500">Not authorized to view leaderboard. Please log in.</td>
                    </tr>
                `;
                return;
            }
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const students = await response.json();
        leaderboardTableBody.innerHTML = '';

        if (students.length === 0) {
            leaderboardTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-4 text-gray-500">No students found for this leaderboard.</td>
                </tr>
            `;
            return;
        }

        students.forEach((student, index) => {
            const rank = index + 1;
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors duration-150';
            row.innerHTML = `
                <td class="py-3 px-4 text-sm text-gray-700 font-medium">${rank}</td>
                <td class="py-3 px-4 text-sm text-gray-700">${student.name || student.username || 'N/A'}</td> <td class="py-3 px-4 text-sm text-gray-700">${student.level || 1}</td> <td class="py-3 px-4 text-sm text-gray-700">${student.xp || 0}</td> `;
            leaderboardTableBody.appendChild(row);
        });
        console.log("LOG: Leaderboard data displayed successfully.");

    } catch (error) {
        console.error('ERROR: Error fetching leaderboard data:', error);
        leaderboardTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-red-500">Failed to load leaderboard. Please ensure you are logged in and authorized.</td>
            </tr>
        `;
    }
}

// Setup Speech Recognition API
function setupSpeechRecognition() {
    console.log("LOG: setupSpeechRecognition called.");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("WARN: Speech Recognition not supported in this browser.");
        if (micBtn) micBtn.style.display = 'none';
        if (voiceModeToggle) voiceModeToggle.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const speechResult = event.results[event.results.length - 1][0].transcript;
        console.log("LOG: Speech Result:", speechResult);
        input.value = speechResult;
        sendBtn.click(); // Automatically send message
        isRecognitionActive = false; // Stop recognition after sending
        recognition.stop();
        toggleHandsFreeMode(false); // Visually turn off hands-free after one use
    };

    recognition.onerror = (event) => {
        console.error("ERROR: Speech recognition error:", event.error);
        isRecognitionActive = false;
        toggleHandsFreeMode(false); // Turn off on error
    };

    recognition.onend = () => {
        console.log("LOG: Speech recognition ended.");
        if (isRecognitionActive) { // If it ended unexpectedly, restart if still "active"
            console.log("LOG: Restarting speech recognition (continuous mode).");
            recognition.start();
        }
    };
}

// Toggle Hands-Free Mode
function toggleHandsFreeMode(enable) {
    console.log(`LOG: toggleHandsFreeMode called. Enable: ${enable}`);
    isVoiceModeEnabled = enable;
    localStorage.setItem('voiceMode', enable);
    if (voiceModeToggle) {
        voiceModeToggle.classList.toggle('green', enable);
        const handsfreeLabel = document.getElementById('handsfree-label');
        if (handsfreeLabel) handsfreeLabel.textContent = `Hands-Free Mode: ${enable ? 'ON' : 'OFF'}`;
    }

    if (isVoiceModeEnabled) {
        if (recognition && !isRecognitionActive) {
            try {
                recognition.start();
                isRecognitionActive = true;
                console.log("LOG: Speech recognition started.");
            } catch (e) {
                console.error("ERROR: Error starting speech recognition:", e);
                isRecognitionActive = false;
                toggleHandsFreeMode(false); // Turn off if it fails to start
            }
        }
    } else {
        if (recognition && isRecognitionActive) {
            recognition.stop();
            isRecognitionActive = false;
            console.log("LOG: Speech recognition stopped.");
        }
    }
}

// Load Student Parent Link Code
function loadStudentParentLinkCode() {
    console.log("LOG: loadStudentParentLinkCode called.");
    if (!currentUser || currentUser.role !== 'student') {
        console.log("LOG: Not a student or no current user, skipping parent link code.");
        if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
        return;
    }
    
    fetch('/api/student/generate-invite-code', { method: 'POST', credentials: 'include' })
        .then(res => {
            if (!res.ok) { // Check for HTTP errors like 404, 500
                return res.text().then(text => { throw new new Error(`HTTP error! status: ${res.status} - ${text}`); });
            }
            return res.json(); // Attempt to parse as JSON
        })
        .then(data => {
            if (data.success && studentLinkCodeValue) {
                studentLinkCodeValue.textContent = data.code;
                if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'block';
                console.log("LOG: Parent invite code displayed:", data.code);
            } else {
                console.error("ERROR: Failed to generate/fetch parent invite code:", data.message || 'Unknown error');
                if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
            }
        })
        .catch(error => {
            console.error("ERROR: Error fetching parent invite code (catch block):", error);
            if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
        });
}

// Save User Settings
async function saveUserSettings() {
    console.log("LOG: saveUserSettings called.");
    if (!currentUser) {
        console.warn("WARN: No current user to save settings for.");
        return;
    }

    const updatedSettings = {
        selectedTutorId: tutorSelect ? tutorSelect.value : currentUser.selectedTutorId,
        voiceTone: toneSelect ? toneSelect.value : currentUser.voiceTone,
        learningStyle: styleSelect ? styleSelect.value : currentUser.learningStyle,
        isHandsFreeModeEnabled: voiceModeEnabledCheckbox ? voiceModeEnabledCheckbox.checked : isVoiceModeEnabled
    };

    try {
        const response = await fetch('/api/user/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedSettings)
        });
        if (response.ok) {
            currentUser = { ...currentUser, ...updatedSettings };
            localStorage.setItem('voiceMode', updatedSettings.isHandsFreeModeEnabled);
            isVoiceModeEnabled = updatedSettings.isHandsFreeModeEnabled;
            toggleHandsFreeMode(isVoiceModeEnabled);
            loadTutorImage();
            alert('Settings saved successfully!');
            console.log("LOG: Settings saved successfully:", updatedSettings);
        } else {
            const errorText = await response.text();
            console.error('ERROR: Failed to save settings. Status:', response.status, 'Error:', errorText);
            alert('Failed to save settings. Please try again.');
        }
    } catch (error) {
        console.error("ERROR: Error saving user settings:", error);
        alert('An error occurred while saving settings.');
    }
}

// Populate Tutor Options in Settings
function populateTutorOptions() {
    console.log("LOG: populateTutorOptions called.");
    const TUTOR_CONFIG_FRONTEND = window.TUTOR_CONFIG;
    if (tutorSelect && TUTOR_CONFIG_FRONTEND) {
        tutorSelect.innerHTML = '';
        for (const id in TUTOR_CONFIG_FRONTEND) {
            const tutor = TUTOR_CONFIG_FRONTEND[id];
            const option = document.createElement('option');
            option.value = id;
            option.textContent = tutor.name;
            tutorSelect.appendChild(option);
        }
        console.log("LOG: Tutor options populated in settings.");
    } else {
        console.warn("WARN: Tutor select element or config not found for populating options.");
    }
}

// Load User Settings into Form
function loadUserSettings() {
    console.log("LOG: loadUserSettings called.");
    if (currentUser) {
        if (tutorSelect) tutorSelect.value = currentUser.selectedTutorId || 'default';
        if (toneSelect) toneSelect.value = currentUser.voiceTone || 'friendly';
        if (styleSelect) styleSelect.value = currentUser.learningStyle || 'step';
        if (voiceModeEnabledCheckbox) voiceModeEnabledCheckbox.checked = isVoiceModeEnabled;
        console.log("LOG: User settings loaded into form.");
    } else {
        console.warn("WARN: Current user not available to load settings.");
    }
}

// Load Tutor Avatar Image
async function loadTutorImage() {
    console.log("LOG: loadTutorImage called.");
    // avatarContainer is globally defined as a const at the top, so it is available here.
    if (!avatarContainer || !currentUser || !currentUser.selectedTutorId) {
        console.log("LOG: loadTutorImage - Avatar container or current user/tutor ID not available. Clearing avatar.");
        if (avatarContainer) avatarContainer.innerHTML = '';
        return;
    }

    const TUTOR_CONFIG_FRONTEND = window.TUTOR_CONFIG;
    if (!TUTOR_CONFIG_FRONTEND) {
        console.error("ERROR: TUTOR_CONFIG_FRONTEND is not loaded in window scope.");
        return;
    }
    
    const tutorId = currentUser.selectedTutorId;
    const tutorConfig = TUTOR_CONFIG_FRONTEND[tutorId] || TUTOR_CONFIG_FRONTEND['default'];
    const tutorImageFileName = tutorConfig.image;

    if (tutorImageFileName) {
        avatarContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = `/images/${tutorImageFileName}`;
        img.alt = `Tutor ${tutorConfig.name}`;
        avatarContainer.appendChild(img);
        console.log(`LOG: loadTutorImage - Loaded image for tutor ${tutorConfig.name}: /images/${tutorImageFileName}`);
    } else {
        console.warn(`WARN: No image file found for selected tutorId: ${tutorId}. Using default.`);
        avatarContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = `/images/${TUTOR_CONFIG_FRONTEND['default'].image}`;
        img.alt = `Default Tutor`;
        avatarContainer.appendChild(img);
    }
}


// [FIXED] Global handleChatMessage function
window.handleChatMessage = async function(messageText) { // Removed currentUserData param, use global currentUser
    console.log("LOG: handleChatMessage called with:", messageText);
    window.appendMessage(messageText, "user");
    currentChatHistory.push({ role: 'user', content: messageText });
    
    showThinkingIndicator(true);

    try {
        const userId = currentUser ? currentUser._id : null; // Access global currentUser
        if (!userId) {
            console.error("ERROR: User ID not available for sending message (currentUser is null).");
            window.appendMessage("Error: Please log in to send messages.", "ai");
            showThinkingIndicator(false);
            return;
        }

        let isGuidedPathAnswer = false;
        // Pass global currentUser to guidedPath handler
        if (window.guidedPath && window.guidedPath.handleGuidedAnswer) {
            isGuidedPathAnswer = await window.guidedPath.handleGuidedAnswer(messageText, currentUser);
        }
        
        if (!isGuidedPathAnswer) {
            console.log("LOG: Message not handled by Guided Path. Sending to general chat AI.");
            const response = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: userId,
                    message: messageText,
                    role: currentUser.role, // Access global currentUser
                    chatHistory: currentChatHistory
                }),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Chat API failed: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            window.appendMessage(data.text, "ai", data.voiceId);
            currentChatHistory.push({ role: 'assistant', content: data.text });
            
            if (data.userXp !== undefined && data.userLevel !== undefined) {
                window.updateGamifiedDashboard(data.userXp, data.userLevel, data.specialXpAwarded);
            }
        }
    } catch (error) {
        console.error("ERROR: Failed to send message or get AI response:", error);
        window.appendMessage("Sorry, I'm having trouble connecting right now. Please try again.", "ai");
    } finally {
        showThinkingIndicator(false);
    }
};


// --- DOMContentLoaded: Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("LOG: M∆THM∆TIΧ Initialized"); // Re-added log for clarity on script execution order
    
    // Assign DOM elements to variables that were declared globally above
    currentLevelSpan = document.getElementById("current-level");
    // [FIXED] xpProgressBar does not exist on chat.html, so it's commented out
    // xpProgressBar = document.getElementById("xp-progress-bar"); 
    currentXpSpan = document.getElementById("current-xp");
    xpNeededSpan = document.getElementById("xp-needed");
    xpLevelDisplay = document.getElementById('xp-level-display');
    thinkingIndicator = document.getElementById("thinking-indicator");
    logoutBtn = document.getElementById("logoutBtn"); // Main logout button
    audioStopBtn = document.getElementById('audio-stop-button');
    voiceModeToggle = document.getElementById('handsfree-toggle'); // Correct element ID for Hands-Free toggle
    studentParentLinkDisplay = document.getElementById('student-parent-link-display');
    studentLinkCodeValue = document.getElementById('student-link-code-value');
    // avatarContainer is now initialized globally (at the top)


    // [FIXED] Initially disable send button until user data is loaded
    if (sendBtn) sendBtn.disabled = true;
    if (input) input.placeholder = "Loading chat...";

    // Other tool button listeners
    if (attachBtn) attachBtn.addEventListener("click", () => fileInput.click());
    if (fileInput) fileInput.addEventListener("change", () => uploadSelectedFile(fileInput.files[0]));

    if (equationBtn) equationBtn.addEventListener("click", () => {
        if (mathModal) mathModal.style.display = "block";
    });
    if (closeMathBtn) closeMathBtn.addEventListener("click", () => {
        if (mathModal) mathModal.style.display = "none";
    });
    if (insertMathBtn) insertMathBtn.addEventListener("click", () => {
        const math = mathEditor.value;
        if (math.trim()) input.value += ` [MATH]${math}[/MATH] `;
        if (mathModal) mathModal.style.display = "none";
    });
    
    // Hands-free toggle
    if (voiceModeToggle) {
        voiceModeToggle.addEventListener('click', () => toggleHandsFreeMode(!isVoiceModeEnabled));
        toggleHandsFreeMode(isVoiceModeEnabled); // Set initial state display
    }
    if (audioStopBtn) { // [FIXED] Add check for audioStopBtn
        audioStopBtn.addEventListener('click', stopAudioPlayback);
    } else {
        console.warn("WARN: audioStopBtn not found. Stop audio functionality will be unavailable.");
    }


    // Tab switching logic
    if (tabButtons && tabButtons.length > 0) { // Check if tabs exist
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                console.log(`LOG: Tab button clicked: ${tabId}`);

                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(pane => pane.style.display = 'none');

                button.classList.add('active');
                document.getElementById(tabId).style.display = 'flex';

                if (tabId === 'lessons-pane') {
                    if (window.guidedPath && currentUser) {
                        console.log("LOG: Loading Pathway Overview in Lessons tab.");
                        window.guidedPath.loadPathwayOverview(currentUser); 
                    } else {
                        console.warn("WARN: guidedPath.js not loaded or currentUser not available for Lessons tab.");
                    }
                } else if (tabId === 'progress-pane') {
                    document.getElementById('progress-summary').textContent = 'Loading XP and milestones... (Feature under development)';
                    console.log("LOG: Progress tab activated.");
                } else if (tabId === 'badges-pane') {
                    document.getElementById('badge-collection').textContent = 'No badges yet. Letâ€™s earn some! (Feature under development)';
                    console.log("LOG: Badges tab activated.");
                } else if (tabId === 'settings-pane') {
                    populateTutorOptions();
                    loadUserSettings();
                    console.log("LOG: Settings tab activated.");
                }
            });
        });
    } else {
        console.warn("WARN: No tab buttons found on page.");
    }

    // Event listeners for settings pane buttons
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveUserSettings();
    });

    if (exportHistoryBtn) exportHistoryBtn.addEventListener('click', () => {
        console.log("LOG: Export history button clicked (feature under development).");
        alert('Export chat history (Feature under development)');
    });
    
    if (logoutSettingsBtn) logoutSettingsBtn.addEventListener('click', () => {
        console.log("LOG: Logout from settings button clicked. Redirecting to /logout.");
        localStorage.removeItem("welcomeShown");
        localStorage.removeItem("voiceMode");
        window.location.href = "/logout";
    });

    // Logout button in chat pane
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            console.log("LOG: Logout from chat top bar button clicked. Redirecting to /logout.");
            localStorage.removeItem("welcomeShown");
            localStorage.removeItem("voiceMode");
            window.location.href = "/logout";
        });
    }

    // Initialize speech recognition
    setupSpeechRecognition();
    
    // --- User Data Fetch and Welcome Message Trigger ---
    console.log("LOG: Attempting to fetch user data and trigger welcome message.");
    
    const welcomeShownFlag = localStorage.getItem("welcomeShown");

    fetch("/user", { credentials: 'include' })
      .then(res => {
        console.log(`LOG: /user fetch response status: ${res.status}`);
        if (!res.ok) {
            console.error(`ERROR: /user fetch failed: Status ${res.status} - ${res.statusText}`);
            return res.json().then(errData => { throw new Error(`Fetch /user failed: ${errData.message || res.statusText}`); });
        }
        return res.json();
      })
      .then(data => {
        currentUser = data.user;
        window.currentUser = currentUser; // Expose globally for guidedPath.js
        console.log("LOG: Current user data loaded:", currentUser ? currentUser.username : 'N/A', 'Role:', currentUser ? currentUser.role : 'N/A');

        // [FIXED] AFTER currentUser is loaded, attach the chat input listeners and enable UI
        if (sendBtn && input) {
            sendBtn.disabled = false; // Enable send button
            input.placeholder = "Type your message here..."; // Reset placeholder
            sendBtn.addEventListener('click', () => {
                if (input.value.trim() !== "") {
                    window.handleChatMessage(input.value); // Use global currentUser indirectly
                    input.value = "";
                }
            });
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendBtn.click();
                }
            });
            console.log("LOG: Chat input listeners attached and enabled after user data loaded.");
        } else {
            console.warn("WARN: Chat input elements (sendBtn, input) not found.");
        }
        // End of new sendBtn/input listener block

        if (!currentUser) { 
            console.warn("WARN: currentUser is null/undefined after fetch /user. Redirecting to login.");
            window.location.href = "/login.html";
            return;
        }

        populateTutorOptions();
        loadUserSettings();

        if (currentUser.role === 'student') {
            if (!welcomeShownFlag) {
                console.log("LOG: Welcome message not shown yet for student. Attempting to fetch personalized welcome.");
                fetch(`/welcome?userId=${currentUser._id}&currentHistory=${JSON.stringify(currentChatHistory)}`, { credentials: 'include' })
                    .then(res => {
                        console.log(`LOG: /welcome fetch response status: ${res.status}`);
                        if (!res.ok) {
                            console.error(`ERROR: /welcome fetch failed: Status ${res.status} - ${res.statusText}`);
                            throw new Error('Failed to fetch personalized welcome from AI.');
                        }
                        return res.json();
                    })
                    .then(welcomeData => {
                        window.appendMessage(welcomeData.greeting, "ai", welcomeData.voiceId);
                        currentChatHistory.push({ role: 'assistant', content: welcomeData.greeting });
                        console.log("LOG: Personalized welcome message received and displayed. Setting welcomeShown flag.");
                        localStorage.setItem("welcomeShown", "true");
                    })
                    .catch(err => {
                        console.error("ERROR: Error fetching personalized welcome message from AI (Catch block):", err);
                        if (window.appendMessage) {
                            window.appendMessage("Hello! How can I help you today?", "ai");
                            currentChatHistory.push({ role: 'assistant', content: "Hello! How can I help you today!" });
                        } else {
                            console.error("CRITICAL: window.appendMessage is not defined. Cannot display fallback welcome.");
                        }
                        console.log("LOG: Fallback welcome message displayed. Setting welcomeShown flag despite error to prevent loop.");
                        localStorage.setItem("welcomeShown", "true");
                    });
            } else {
                console.log("LOG: Welcome message already shown for student. Skipping fetch.");
                if (currentChatHistory.length === 0 && window.appendMessage) {
                    window.appendMessage("Welcome back! What would you like to work on today?", "ai");
                    currentChatHistory.push({ role: 'assistant', content: "Welcome back! What would you like to work on today?" });
                }
            }
            window.updateGamifiedDashboard(currentUser.xp, currentUser.level);
            loadStudentParentLinkCode();
            loadTutorImage();

        } else if (currentUser.role === 'parent' || currentUser.role === 'teacher' || currentUser.role === 'admin') {
            console.log("LOG: Current user is non-student. Hiding student-specific UI elements or handling role-specific.");
            if (xpLevelDisplay) xpLevelDisplay.style.display = 'none';
            if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
            if (avatarContainer) avatarContainer.style.display = 'none';
        }
      })
      .catch(err => {
          console.error("ERROR: Authentication or User Fetch Error (Final Catch block):", err);
          console.log("LOG: Redirecting to /login.html due to fetch error or authentication issue.");
          window.location.href = "/login.html";
      });

    // Fetch leaderboard if the element exists on the page
    if (document.getElementById('leaderboardTable')) {
        console.log("LOG: Leaderboard table found. Initiating fetch.");
        fetchAndDisplayLeaderboard();
    } else {
        console.log("LOG: Leaderboard table not found on page. Skipping fetch.");
    }
});// JavaScript Document