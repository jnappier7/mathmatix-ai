// public/script.js - FINAL VERSION (PHASE 3, PATCHED)
console.log("LOG: M∆THM∆TIΧ Initialized");

// --- DECLARE ALL CONSTANTS ---
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

// --- DECLARE LET VARIABLES ---
let currentLevelSpan, xpProgressBar, currentXpSpan, xpNeededSpan, leaderboardPopup, xpLevelDisplay, thinkingIndicator, logoutBtn, dropzone, fullscreenDropzone, voiceModeToggle, currentAudio = null, isRecognitionActive = false, audioStopBtn, studentParentLinkDisplay, studentLinkCodeValue;

const XP_PER_LEVEL = 100;
let currentUser = null;
let isVoiceModeEnabled = localStorage.getItem('voiceMode') === 'true';
let isMathJaxReady = window.isMathJaxReady || false;

// --- CORE FUNCTIONS ---

function uploadSelectedFile(file) {
    if (!file) return;
    const fileSizeLimit = 5 * 1024 * 1024;
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

async function speakText(textToSpeak, dynamicVoiceId = null) {
    if (currentAudio) stopAudioPlayback();
    if (!textToSpeak) return;
    let cleanedText = textToSpeak.replace(/\[MATH\].*?\[\/MATH\]/g, ' [equation] ');
    const voiceId = dynamicVoiceId || "2eFQnnNM32GDnZkCfkSm";
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
        currentAudio.play().catch(e => console.error("Error playing audio:", e));
        if (audioStopBtn) audioStopBtn.style.display = 'inline-block';
        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            if (audioStopBtn) audioStopBtn.style.display = 'none';
        };
    } catch (err) {
        console.error("Error fetching or playing speech:", err);
    }
}

function stopAudioPlayback() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
        if (audioStopBtn) audioStopBtn.style.display = 'none';
    }
}

// THIS IS THE PATCHED SECTION
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

    if (sender === "ai") {
        const textToSpeak = bubble.textContent;
        if (textToSpeak.length > 0) {
            const speakButton = document.createElement("button");
            speakButton.className = "speak-message-btn";
            speakButton.innerHTML = "🔊";
            speakButton.title = "Read aloud";
            speakButton.onclick = () => speakText(textToSpeak, voiceIdToUse);
            bubble.prepend(speakButton);
        }
    }

    if (chatBox) {
        chatBox.appendChild(bubble);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
};

function showThinkingIndicator(show) {
    if (thinkingIndicator) thinkingIndicator.style.display = show ? "flex" : "none";
}

function updateGamifiedDashboard(userXp, userLevel, specialXpAwarded = 0) {
    if (!currentLevelSpan) return;
    const oldLevel = parseInt(currentLevelSpan.textContent);
    currentLevelSpan.textContent = userLevel;
    const xpNeededForNextLevel = (userLevel + 1) * XP_PER_LEVEL;
    currentXpSpan.textContent = userXp;
    xpNeededSpan.textContent = xpNeededForNextLevel;
    if (userLevel > oldLevel) triggerLevelUpAnimation(userLevel);
    else if (specialXpAwarded > 0) triggerXpGainAnimation(specialXpAwarded, true);
}

function triggerXpGainAnimation(amount, isSpecial = false) { /* ... */ }
function triggerLevelUpAnimation(newLevel) { /* ... */ }
async function fetchAndDisplayLeaderboard() { /* ... */ }

// --- DOMContentLoaded: Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    currentLevelSpan = document.getElementById("current-level");
    xpProgressBar = document.getElementById("xp-progress-bar");
    currentXpSpan = document.getElementById("current-xp");
    xpNeededSpan = document.getElementById("xp-needed");
    xpLevelDisplay = document.getElementById('xp-level-display');
    thinkingIndicator = document.getElementById("thinking-indicator");
    logoutBtn = document.getElementById("logoutBtn");
    audioStopBtn = document.getElementById('audio-stop-button');

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            fetch("/logout", { method: 'GET', credentials: 'include' })
                .then(() => { window.location.href = "/login.html"; })
                .catch(err => console.error("Logout failed:", err));
        });
    }

    if (attachBtn) attachBtn.addEventListener("click", () => fileInput.click());
    if (fileInput) fileInput.addEventListener("change", () => uploadSelectedFile(fileInput.files[0]));

    if (equationBtn) equationBtn.addEventListener("click", () => mathModal.style.display = "block");
    if (closeMathBtn) closeMathBtn.addEventListener("click", () => mathModal.style.display = "none");
    if (insertMathBtn) insertMathBtn.addEventListener("click", () => {
        const math = mathEditor.value;
        if (math.trim()) input.value += ` [MATH]${math}[/MATH] `;
        mathModal.style.display = "none";
    });

    // Fetch current user and personalized welcome
    fetch("/user", { credentials: 'include' })
      .then(res => res.json())
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

        if (currentUser.role === 'student') {
            fetch(`/welcome?userId=${currentUser._id}`, { credentials: 'include' })
                .then(res => res.json())
                .then(welcomeData => {
                    window.appendMessage(welcomeData.greeting, "ai", welcomeData.voiceId);
                })
                .catch(err => {
                    console.error("Error fetching welcome message:", err);
                    window.appendMessage("Hello! How can I help you today?", "ai");
                });
            updateGamifiedDashboard(currentUser.xp, currentUser.level);
        }
      })
      .catch(() => window.location.href = "/login.html");

    if (document.getElementById('leaderboardTable')) {
        fetchAndDisplayLeaderboard();
    }
});
