// public/js/script.js - FINAL VERSION (CHAT DISPLAY FIX)
console.log("LOG: M∆THM∆TIΧ Initialized");

// --- DECLARE ALL CONSTANTS ---
// [FIX] Corrected chatBox ID to match chat.html
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

// --- DECLARE LET VARIABLES (assigned in DOMContentLoaded) ---
let currentLevelSpan, xpProgressBar, currentXpSpan, xpNeededSpan, leaderboardPopup, xpLevelDisplay, thinkingIndicator, logoutBtn, voiceModeToggle, currentAudio = null, audioStopBtn, studentParentLinkDisplay, studentLinkCodeValue;
let currentChatHistory = []; // Array to store messages for AI context

const XP_PER_LEVEL = 100; // XP needed to advance a level
let currentUser = null; // Will be populated by fetchCurrentUser function
let isMathJaxReady = window.isMathJaxReady || false;

// Voice Mode & Speech Recognition Variables
let isHandsFreeModeEnabled = localStorage.getItem('handsFreeMode') === 'true'; // Separate flag for hands-free
let recognition = null; // Web Speech API SpeechRecognition object
let isRecognitionActive = false; // Flag for mic status (actively listening)
let isSpeaking = false; // Flag for when AI is speaking


// --- CORE FUNCTIONS ---

// Function to handle file uploads (from attach button)
function uploadSelectedFile(file) {
    if (!file) return;
    const fileSizeLimit = 5 * 1024 * 1024; // 5 MB limit
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

    fetch("/upload", {
        method: "POST",
        body: formData,
        credentials: 'include'
    })
    .then(res => res.json())
    .then(data => {
        window.appendMessage(data.text, "ai", data.voiceId);
        currentChatHistory.push({ role: 'user', content: `Uploaded file: ${file.name}` });
        currentChatHistory.push({ role: 'assistant', content: data.text });
    })
    .catch(err => {
        console.error("Upload error:", err);
        window.appendMessage("Upload failed. Please try again.", "ai");
    })
    .finally(() => {
        showThinkingIndicator(false);
        fileInput.value = '';
    });
}

// Function to convert text to speech using a backend endpoint
async function speakText(textToSpeak, dynamicVoiceId = null) {
    stopAudioPlayback(); // Stop any currently playing audio
    if (!textToSpeak) return;

    let cleanedText = textToSpeak.replace(/\[MATH\].*?\[\/MATH\]/g, ' [equation] ');
    const voiceId = dynamicVoiceId || "2eFQnnNM32GDnZkCfkSm"; // Default ElevenLabs voice ID

    try {
        isSpeaking = true; // Set speaking flag
        const response = await fetch("/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: cleanedText, voiceId }),
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs TTS failed: ${response.statusText}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudio = new Audio(audioUrl);

        currentAudio.play().catch(e => console.error("Error playing audio:", e));

        if (audioStopBtn) audioStopBtn.style.display = 'inline-block';

        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            isSpeaking = false; // Clear speaking flag
            if (audioStopBtn) audioStopBtn.style.display = 'none';

            // [NEW] If Hands-Free is enabled, automatically activate mic after AI finishes speaking
            if (isHandsFreeModeEnabled) {
                startSpeechRecognition();
            }
        };
    } catch (err) {
        console.error("Error fetching or playing speech:", err);
        isSpeaking = false; // Ensure flag is reset on error
        if (audioStopBtn) audioStopBtn.style.display = 'none';
    }
}

// Function to stop current audio playback
function stopAudioPlayback() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        URL.revokeObjectURL(currentAudio.src); // Clean up Object URL
        currentAudio = null;
        isSpeaking = false; // Clear speaking flag
        if (audioStopBtn) audioStopBtn.style.display = 'none';
    }
}

// Function to append messages to the chat interface (AI or User)
window.appendMessage = function(message, sender = "user", voiceIdToUse = null) {
    const messageContent = String(message || '');
    const bubble = document.createElement("div");
    bubble.className = `message ${sender}`;

    const mathRegex = /\[MATH\](.*?)\[\/MATH\]/g;
    const matches = [...messageContent.matchAll(mathRegex)];

    if (matches.length > 0) {
        let renderedHtml = messageContent.replace(/\n/g, '<br>');
        matches.forEach(match => {
            const fullTag = match[0];
            const mathLatex = match[1];
            renderedHtml = renderedHtml.replace(fullTag, `<span class="math-render">${mathLatex}</span>`);
        });
        bubble.innerHTML = renderedHtml;

        if (isMathJaxReady && window.MathJax) {
            MathJax.typesetPromise([bubble]).catch(err => console.error("MathJax typesetting failed:", err));
        }
    } else {
        bubble.innerHTML = messageContent.replace(/\n/g, '<br>');
    }

    // Always add speak button for AI messages
    if (sender === "ai") {
        const textToSpeak = bubble.textContent;
        if (textToSpeak.length > 0) {
            const speakButton = document.createElement("button");
            speakButton.className = "speak-message-btn";
            speakButton.innerHTML = "🔊";
            speakButton.title = "Read aloud";
            speakButton.onclick = (e) => {
                e.stopPropagation();
                speakText(textToSpeak, voiceIdToUse);
            };
            bubble.prepend(speakButton);
        }
        // If Hands-Free is enabled, automatically speak AI message
        if (isHandsFreeModeEnabled) {
            speakText(textToSpeak, voiceIdToUse);
        }
    }

    if (chatBox) { // chatBox now correctly points to "chat-container-inner"
        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
};

// Function to show/hide the "thinking..." indicator
function showThinkingIndicator(show) {
    if (thinkingIndicator) thinkingIndicator.style.display = show ? "flex" : "none";
}

// Function to update XP and Level display on the dashboard
window.updateGamifiedDashboard = function(userXp, userLevel, specialXpAwarded = 0) {
    if (!currentLevelSpan || !currentXpSpan || !xpNeededSpan) {
        console.warn("Gamification dashboard elements not found.");
        return;
    }

    const oldLevel = parseInt(currentLevelSpan.textContent);
    
    currentLevelSpan.textContent = userLevel;
    const xpNeededForNextLevel = (userLevel + 1) * XP_PER_LEVEL;
    currentXpSpan.textContent = userXp;
    xpNeededSpan.textContent = xpNeededForNextLevel;

    if (xpProgressBar) {
        const progressPercent = (userXp / xpNeededForNextLevel) * 100;
        xpProgressBar.style.width = `${Math.min(progressPercent, 100)}%`;
    }

    if (userLevel > oldLevel) {
        triggerLevelUpAnimation(userLevel);
    } else if (specialXpAwarded > 0) {
        triggerXpGainAnimation(specialXpAwarded, true);
    }
}

// Function to trigger XP gain animation
function triggerXpGainAnimation(amount, isSpecial = false) {
    const animationElement = document.createElement('div');
    animationElement.textContent = `+${amount} XP!`;
    animationElement.classList.add('xp-animation-text');
    if (isSpecial) animationElement.classList.add('special-xp');

    const xpDisplayRect = xpLevelDisplay.getBoundingClientRect();
    animationElement.style.top = `${xpDisplayRect.top + xpDisplayRect.height / 2 - 20}px`;
    animationElement.style.left = `${xpDisplayRect.left + xpDisplayRect.width / 2 - 30}px`;

    document.body.appendChild(animationElement);
    animationElement.classList.add('animate-xp');
    animationElement.onanimationend = () => animationElement.remove();
}

// Function to trigger Level Up animation
function triggerLevelUpAnimation(newLevel) {
    const animationElement = document.createElement('div');
    animationElement.textContent = `Level Up! Level ${newLevel}!`;
    animationElement.classList.add('level-up-animation-text');

    animationElement.style.top = `50%`;
    animationElement.style.left = `50%`;
    animationElement.style.transform = `translate(-50%, -50%)`;

    document.body.appendChild(animationElement);
    animationElement.classList.add('animate-level-up');
    animationElement.onanimationend = () => animationElement.remove();
}

// Function to fetch and display leaderboard data
async function fetchAndDisplayLeaderboard() {
    leaderboardPopup = document.getElementById("leaderboard-content");
    if (!leaderboardPopup) return;

    try {
        const response = await fetch("/leaderboard", { credentials: 'include' });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                console.warn("Not authorized to view leaderboard, redirecting to login.");
                window.location.href = "/login.html";
                return;
            }
            throw new Error("Failed to fetch leaderboard.");
        }
        const leaderboardData = await response.json();
        
        const leaderboardTableBody = document.querySelector("#leaderboardTable tbody");
        if (leaderboardTableBody) {
            leaderboardTableBody.innerHTML = '';
            leaderboardData.forEach((entry, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${entry.firstName || entry.username || 'N/A'}</td>
                    <td>${entry.level || 1}</td>
                    <td>${entry.xp || 0}</td>
                `;
                leaderboardTableBody.appendChild(row);
            });
        }
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        if (leaderboardPopup) leaderboardPopup.innerHTML = '<p style="text-align:center; color: red;">Error loading leaderboard.</p>';
    }
}

// Function to load and display student-parent link code (for students)
async function loadStudentParentLinkCode() {
    studentParentLinkDisplay = document.getElementById("student-parent-link-display");
    studentLinkCodeValue = document.getElementById("student-link-code-value");

    if (!studentParentLinkDisplay || !studentLinkCodeValue || currentUser.role !== 'student') {
        if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`/user/${currentUser._id}/link-code`, { credentials: 'include' });
        if (!res.ok) {
            if (res.status === 404 || res.status === 200 && (await res.clone().json()).message === 'Student account is already linked to a parent.') {
                studentParentLinkDisplay.style.display = 'none';
                return;
            }
            throw new Error('Failed to fetch student link code.');
        }
        const data = await res.json();
        
        if (data.code && !data.parentLinked) {
            studentLinkCodeValue.textContent = data.code;
            studentParentLinkDisplay.style.display = 'block';
        } else {
            studentParentLinkDisplay.style.display = 'none';
        }
    } catch (error) {
        console.error("Error loading student link code:", error);
        if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
    }
}

// Function to load and display the selected tutor's image in the avatar container
async function loadTutorImage() {
    const avatarContainer = document.getElementById('student-avatar');
    if (!avatarContainer || !currentUser || !currentUser.selectedTutorId) {
        if (avatarContainer) avatarContainer.innerHTML = '';
        return;
    }

    const tutorImageMap = {
        'mr-nappier': 'mr-nappier.png',
        'mr-lee': 'mr-lee.png',
        'dr-jones': 'dr-jones.png',
        'prof-davies': 'prof-davies.png',
        'ms-alex': 'ms-alex.png',
        'maya': 'maya.png',
        'ms-maria': 'ms-maria.png',
        'bob': 'bob.png',
        'ms-rashida': 'ms-rashida.png'
    };

    const tutorId = currentUser.selectedTutorId;
    const tutorImageFileName = tutorImageMap[tutorId];

    if (tutorImageFileName) {
        avatarContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = `/images/${tutorImageFileName}`;
        img.alt = `Tutor ${tutorId}`;
        avatarContainer.appendChild(img);
    } else {
        console.warn(`No image file found for selected tutorId: ${tutorId}. Please check tutorImageMap and /public/images/ folder.`);
        avatarContainer.innerHTML = '';
    }
}


// --- DOMContentLoaded: Initial Setup and Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    currentLevelSpan = document.getElementById("current-level");
    xpProgressBar = document.getElementById("xp-progress-bar");
    currentXpSpan = document.getElementById("current-xp");
    xpNeededSpan = document.getElementById("xp-needed");
    xpLevelDisplay = document.getElementById('xp-level-display');
    thinkingIndicator = document.getElementById("thinking-indicator");
    logoutBtn = document.getElementById("logoutBtn");
    audioStopBtn = document.getElementById('audio-stop-button');
    voiceModeToggle = document.getElementById('handsfree-toggle');

    // --- Core Event Listeners ---

    // Logout Button
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            fetch("/logout", { method: 'POST', credentials: 'include' })
                .then(res => {
                    if (res.ok) {
                        window.location.href = "/login.html";
                    } else {
                        alert('Logout failed.');
                    }
                })
                .catch(err => {
                    console.error("Logout error:", err);
                    alert("An error occurred during logout.");
                });
        });
    }

    // Attach File Button
    if (attachBtn) attachBtn.addEventListener("click", () => fileInput.click());
    if (fileInput) fileInput.addEventListener("change", () => uploadSelectedFile(fileInput.files[0]));

    // Equation Editor Buttons
    if (equationBtn) equationBtn.addEventListener("click", () => {
        if (mathModal) {
            mathModal.style.display = "block";
            if (mathEditor) mathEditor.value = '';
        }
    });
    if (closeMathBtn) closeMathBtn.addEventListener("click", () => {
        if (mathModal) mathModal.style.display = "none";
    });
    if (insertMathBtn) insertMathBtn.addEventListener("click", () => {
        if (mathEditor && input) {
            const math = mathEditor.value;
            if (math.trim()) input.value += ` [MATH]${math}[/MATH] `;
            if (mathModal) mathModal.style.display = "none";
            input.focus();
        }
    });

    // Audio Stop Button
    if (audioStopBtn) {
        audioStopBtn.addEventListener('click', stopAudioPlayback);
    }

    // Voice Mode Toggle (Hands-Free Mode)
    if (voiceModeToggle) {
        const handsfreeLabel = document.getElementById('handsfree-label');
        voiceModeToggle.classList.toggle('green', isHandsFreeModeEnabled);
        handsfreeLabel.textContent = `Hands-Free Mode: ${isHandsFreeModeEnabled ? 'ON' : 'OFF'}`;

        voiceModeToggle.addEventListener('click', () => {
            isHandsFreeModeEnabled = !isHandsFreeModeEnabled;
            localStorage.setItem('handsFreeMode', isHandsFreeModeEnabled); // Changed to 'handsFreeMode'
            voiceModeToggle.classList.toggle('green', isHandsFreeModeEnabled);
            handsfreeLabel.textContent = `Hands-Free Mode: ${isHandsFreeModeEnabled ? 'ON' : 'OFF'}`;
            if (!isHandsFreeModeEnabled) {
                stopAudioPlayback(); // Stop any speech when turning off hands-free
                stopSpeechRecognition(); // Stop listening when turning off hands-free
            }
        });
    }

    // [NEW] Speech-to-Text (Mic Button) - Initial setup & listener
    // This part should be initialized only once, maybe within its own function
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition not supported in this browser.");
        if (micBtn) micBtn.style.display = 'none'; // Hide mic button if not supported
    } else {
        recognition = new SpeechRecognition();
        recognition.continuous = false; // Only get one result at a time for manual press
        recognition.interimResults = false; // Only return final results
        recognition.lang = 'en-US'; // Set language

        recognition.onstart = () => {
            isRecognitionActive = true;
            micBtn.classList.add('mic-active'); // Add class for visual feedback
            console.log('Speech recognition started...');
        };

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            input.value = speechResult; // Put recognized text into input field
            sendBtn.click(); // Automatically send the message
        };

        recognition.onerror = (event) => {
            isRecognitionActive = false;
            micBtn.classList.remove('mic-active'); // Remove class
            console.error('Speech recognition error:', event.error);
            // Optionally provide user feedback:
            // window.appendMessage("Speech input error. Please try again.", "ai");
        };

        recognition.onend = () => {
            isRecognitionActive = false;
            micBtn.classList.remove('mic-active'); // Remove class
            console.log('Speech recognition ended.');
            // [NEW] If hands-free is enabled and we're not currently speaking, re-activate mic
            if (isHandsFreeModeEnabled && !isSpeaking) {
                // Short delay to prevent immediate restart if button was manually pressed
                // or if it ended due to system event
                setTimeout(startSpeechRecognition, 200); 
            }
        };

        if (micBtn) {
            micBtn.addEventListener('mousedown', () => { // Use mousedown for push-to-talk feel
                stopAudioPlayback(); // Stop AI speech if user starts talking
                startSpeechRecognition();
            });
            micBtn.addEventListener('mouseup', () => { // Use mouseup to stop listening
                stopSpeechRecognition();
            });
            // For mobile or touch devices:
            micBtn.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Prevent scrolling
                stopAudioPlayback();
                startSpeechRecognition();
            });
            micBtn.addEventListener('touchend', () => {
                stopSpeechRecognition();
            });
        }
    }

    // Helper functions for STT control
    function startSpeechRecognition() {
        if (!isRecognitionActive && recognition) {
            recognition.start();
        }
    }
    function stopSpeechRecognition() {
        if (isRecognitionActive && recognition) {
            recognition.stop();
        }
    }


    // Send Message on Enter Key Press (in input textarea)
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });
    }


    // --- Initial Data Fetch & UI Initialization ---

    // Fetch current user data and initialize UI based on their role
    fetch("/user", { credentials: 'include' }) // Fetch user details from backend
      .then(res => {
        if (!res.ok) {
            throw new Error('Not authenticated');
        }
        return res.json();
      })
      .then(data => {
        if (data.redirect && window.location.pathname !== data.redirect) {
            window.location.href = data.redirect;
            return;
        }
        currentUser = data.user;
        if (!currentUser) {
            window.location.href = "/login.html";
            return;
        }

        // Initialize UI based on current user's role
        if (currentUser.role === 'student') {
            // Fetch personalized welcome message for students
            fetch(`/welcome?userId=${currentUser._id}`, { credentials: 'include' })
                .then(res => res.json())
                .then(welcomeData => {
                    window.appendMessage(welcomeData.greeting, "ai", welcomeData.voiceId);
                    // NEW: Append welcome message to history AFTER it's displayed
                    currentChatHistory.push({ role: 'assistant', content: welcomeData.greeting }); 
                })
                .catch(err => {
                    console.error("Error fetching welcome message:", err);
                    window.appendMessage("Hello! How can I help you today?", "ai"); // Generic welcome
                    currentChatHistory.push({ role: 'assistant', content: "Hello! How can I help you today?" });
                });
            
            // Update gamified dashboard elements for students
            window.updateGamifiedDashboard(currentUser.xp, currentUser.level);
            // Load and display student's parent link code if applicable
            loadStudentParentLinkCode();
            // Load and display the student's selected tutor image
            loadTutorImage();
        } else if (currentUser.role === 'parent') {
            // Hide student-specific UI elements if not applicable for parents
            if (xpLevelDisplay) xpLevelDisplay.style.display = 'none';
            if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
            const avatarContainer = document.getElementById('student-avatar'); 
            if (avatarContainer) avatarContainer.style.display = 'none'; 
            // Potentially load parent-specific dashboard components or redirect to parent dashboard
        } else {
            // For teacher/admin roles if they somehow land on chat.html
            // Hide all student/parent specific widgets
            if (xpLevelDisplay) xpLevelDisplay.style.display = 'none';
            if (studentParentLinkDisplay) studentParentLinkDisplay.style.display = 'none';
            const avatarContainer = document.getElementById('student-avatar');
            if (avatarContainer) avatarContainer.style.display = 'none';
            console.warn("Non-student/parent role accessed chat.html. Consider redirecting.");
        }
      })
      .catch(err => {
          // General error handler for authentication or user fetch issues
          console.error("Authentication or User Fetch Error:", err);
          window.location.href = "/login.html";
      });

    // Fetch and display leaderboard if the element exists
    if (document.getElementById('leaderboardTable')) {
        fetchAndDisplayLeaderboard();
    }

    // --- Logic for Guided Path (moved from chat.html) ---
    // Using a dynamic import to ensure guidedPath.js is loaded AFTER script.js's DOMContentLoaded
    // By moving this here, we ensure currentUser is set.
    import('/js/guidedPath.js')
        .then(({ handleGuidedAnswer, resumeGuidedPath, startGuidedPath }) => {
            let loadedCourseData = null; // Scope this locally

            // Event listener for main chat send button (now handles guided path)
            sendBtn.addEventListener('click', async () => {
                const userInput = input.value.trim();
                if (userInput === '') return;

                if (!currentUser?._id) { // Use currentUser from script.js scope
                    console.error("❌ currentUser not loaded.");
                    window.appendMessage("User session not initialized. Please reload the page.", "ai");
                    return;
                }

                stopSpeechRecognition(); // Stop mic if user sends message manually
                stopAudioPlayback(); // Stop speech if user sends message manually

                window.appendMessage(userInput, 'user');
                input.value = ''; 

                // Add user's message to currentChatHistory
                currentChatHistory.push({ role: 'user', content: userInput });

                const handledByGuidedPath = await handleGuidedAnswer(userInput, loadedCourseData, currentChatHistory); // Pass history to guidedPath

                if (!handledByGuidedPath) {
                    window.showThinkingIndicator(true);
                    try {
                        const response = await fetch("/chat", { // Assuming /chat endpoint
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            // [CHANGE] Pass conversation history to the main chat endpoint
                            body: JSON.stringify({ userId: currentUser._id, message: userInput, role: currentUser.role, chatHistory: currentChatHistory }),
                        });
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || 'Chat API request failed');

                        window.appendMessage(data.text, "ai", data.voiceId);
                        // Add AI's response to currentChatHistory
                        currentChatHistory.push({ role: 'assistant', content: data.text });

                        if (data.userXp !== undefined) {
                            window.updateGamifiedDashboard(data.userXp, data.userLevel, data.specialXpAwarded);
                        }
                        if (data.imageUrl) {
                            window.appendMessage(`<img src="${data.imageUrl}" class="chat-image">`, "ai");
                        }
                    } catch (err) {
                        console.error("Free-form chat error:", err);
                        window.appendMessage("An error occurred. Please try again.", "ai");
                    } finally {
                        window.showThinkingIndicator(false);
                    }
                }
            });

            // Initial load for guided path (only if on chat.html and mode is guided)
            const urlParams = new URLSearchParams(window.location.search);
            const mode = urlParams.get('mode');
            const courseId = urlParams.get('courseId');

            fetch('/resources/ready-for-algebra-1-pathway.json')
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    return res.json();
                })
                .then(courseData => {
                    loadedCourseData = courseData; // Set loaded data for use in handleGuidedAnswer
                    if (mode === 'guided' && courseId === 'ready-for-algebra-1') {
                        const courseCardsContainer = document.getElementById('course-cards-container');
                        const lessonHeader = document.getElementById('lesson-header');

                        if (courseCardsContainer) courseCardsContainer.style.display = 'none';
                        if (lessonHeader) lessonHeader.style.display = 'block';
                        resumeGuidedPath(courseId, loadedCourseData);
                    } else {
                        // Render course card for non-guided mode (or initial landing)
                        renderCourseCard(loadedCourseData);
                        const lessonHeader = document.getElementById('lesson-header');
                        if (lessonHeader) lessonHeader.style.display = 'none';
                    }
                })
                .catch(error => {
                    console.error("❌ Error loading course data for guided path:", error);
                    window.appendMessage("Error loading course data for guided path. Some features may be unavailable.", "ai");
                });

            // Helper function for rendering course cards (moved from chat.html)
            function renderCourseCard(courseData) {
                const container = document.getElementById('course-cards-container');
                if (!container) return; 
                const course = courseData; 
                const progressPercent = 0;
                const progressBarHtml = `
                    <div class="progress-circle-container">
                        <div class="progress-circle" style="background: conic-gradient(#4CAF50 ${progressPercent * 3.6}deg, #e0e0e0 ${progressPercent * 3.6}deg);">
                            <div class="progress-circle-inner">${progressPercent}%</div>
                        </div>
                    </div>`;
                const card = document.createElement('div');
                card.className = 'course-card'; 
                card.innerHTML = `<h3>📘 ${course.track}</h3>${progressBarHtml}<button class="enroll-btn">Enroll / Resume Pathway</button>`;
                card.querySelector('.enroll-btn').addEventListener('click', () => {
                    container.style.display = 'none';
                    startGuidedPath(course.track.toLowerCase().replace(/ /g, '-'), loadedCourseData);
                });
                container.appendChild(card);
            }
        })
        .catch(error => {
            console.error("Error loading guidedPath.js module:", error);
            // Fallback for chat sending if guidedPath.js fails to load
            sendBtn.addEventListener('click', async () => {
                const userInput = input.value.trim();
                if (userInput === '') return;
                if (!currentUser?._id) {
                    window.appendMessage("User session not initialized. Please reload the page.", "ai");
                    return;
                }
                window.appendMessage(userInput, 'user');
                input.value = '';
                window.showThinkingIndicator(true);
                try {
                    const response = await fetch("/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: currentUser._id, message: userInput, role: 'student' }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Chat API request failed');
                    window.appendMessage(data.text, "ai", data.voiceId);
                    if (data.userXp !== undefined) {
                        window.updateGamifiedDashboard(data.userXp, data.userLevel, data.specialXpAwarded);
                    }
                    if (data.imageUrl) {
                        window.appendMessage(`<img src="${data.imageUrl}" class="chat-image">`, "ai");
                    }
                } catch (err) {
                    console.error("Free-form chat error (fallback):", err);
                    window.appendMessage("An error occurred. Please try again.", "ai");
                } finally {
                    window.showThinkingIndicator(false);
                }
            });
        });
});