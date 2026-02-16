// public/js/script.js

console.log("LOG: Mâˆ†THMâˆ†TIÎ§ AI Initialized");

// --- ES Module Imports ---
import { sleep, getGraphColor, generateSpeakableText, showToast, escapeHtml as escapeHtmlHelper, triggerConfetti } from './modules/helpers.js';
import { sessionTracker, initSessionTracking, getActiveSeconds, sendTimeHeartbeat } from './modules/session.js';
import { showLevelUpCelebration, triggerXpAnimation as _triggerXpAnimation, updateGamificationDisplay as _updateGamificationDisplay, fetchAndDisplayLeaderboard, loadQuestsAndChallenges, showTutorUnlockCelebration } from './modules/gamification.js';
import { checkBillingStatus, updateFreeTimeIndicator, showUpgradePrompt, initiateUpgrade } from './modules/billing.js';
import { audioState, audioQueue, playAudio, processAudioQueue, pauseAudio, resumeAudio, restartAudio, stopAudio, changePlaybackSpeed, resetAudioState, updateAudioControls } from './modules/audio.js';
import { createIepSystem } from './modules/iep.js';
import { createAssessmentSystem } from './modules/assessment.js';
// Whiteboard is shelved for beta — see modules/whiteboard.js to re-enable

// --- Global Variables ---
let currentUser = null;
let isPlaying = false;
let currentAudioSource = null;
let attachedFile = null;
let isRapportBuilding = false; // Track if user is in rapport building phase

// --- Message Queue State ---
let messageQueue = {
    queue: [],
    isProcessing: false,
    currentMessageId: 0
};

// Wrappers that pass currentUser to module functions
function triggerXpAnimation(message, isLevelUp, isSpecialXp) {
    _triggerXpAnimation(message, isLevelUp, isSpecialXp, currentUser);
}
function updateGamificationDisplay() {
    _updateGamificationDisplay(currentUser);
}

// Handle audio ended event from audio module (hands-free auto-listen)
// Note: recognition/isRecognizing are set up inside DOMContentLoaded, so
// we use window._speechRecognition as a bridge
document.addEventListener('audioPlaybackEnded', () => {
    if (currentUser?.preferences?.handsFreeModeEnabled && audioQueue.length === 0) {
        const recog = window._speechRecognition;
        if (recog && recog.instance && !recog.isActive) {
            try {
                recog.instance.start();
                recog.isActive = true;
                const micBtn = document.getElementById('mic-button');
                if (micBtn) micBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            } catch(e) { console.error("Auto-listen could not be started:", e); }
        }
    }
});

// Session tracking, helpers, audio, gamification, and billing are now
// imported from ES modules (see imports at top of file)

// Helpers, gamification, billing functions imported from modules above

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

    // Expose speech recognition state for audio module's hands-free auto-listen
    window._speechRecognition = { instance: null, isActive: false };

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        window._speechRecognition.instance = recognition;
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.textContent += transcript;
        };
        recognition.onerror = (event) => { console.error("Speech recognition error:", event.error); isRecognizing = false; window._speechRecognition.isActive = false; if (micBtn) micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; };
        recognition.onend = () => { isRecognizing = false; window._speechRecognition.isActive = false; if (micBtn) micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; };
    }

    // --- Watermark Helper Function ---
    /**
     * Toggle 'empty' class on chat container for logo watermark
     * Shows watermark at higher opacity when no messages, lower when messages exist
     */
    function updateChatWatermark() {
        if (!chatBox) return;

        const messages = chatBox.querySelectorAll('.message-container, .message');

        if (messages.length === 0) {
            chatBox.classList.add('empty');
        } else {
            chatBox.classList.remove('empty');
        }
    }

    // --- IEP Accommodation System (see modules/iep.js) ---
    const iep = createIepSystem({
        playAudio,
        generateSpeakableText,
        getCurrentUser: () => currentUser,
    });
    const { applyIepAccommodations, handleIepResponseFeatures, handleIepGoalUpdates } = iep;

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
            if (!currentUser.selectedAvatarId && currentUser.role === 'student') return window.location.href = '/pick-avatar.html';

            // Initialize session time tracking (pass getter for currentUser)
            initSessionTracking(() => currentUser);

            // Check billing status (free tier remaining time)
            checkBillingStatus();

            // Show upgrade success toast if redirected from Stripe
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('upgraded') === 'true') {
                showToast('Welcome to Premium! Unlimited tutoring unlocked.', 5000);
                window.history.replaceState({}, '', window.location.pathname);
            }

            // Apply IEP accommodations on load (reduced distraction, high contrast, etc.)
            applyIepAccommodations(currentUser);

            // WHITEBOARD SHELVED FOR BETA
            // initializeWhiteboard();
            setupChatUI();
            updateChatWatermark(); // Initialize watermark state (chat starts empty)
            await fetchAndDisplayParentCode();

            // --- RETURNING USER MODAL ---
            // For returning students, show a modal with options before loading chat.
            // They can: resume a course chat, start a fresh course session,
            // resume a recent general chat, or start a brand new session.
            let modalHandled = false;
            if (currentUser.role === 'student' && window.ReturningUserModal) {
                const returningModal = new window.ReturningUserModal();
                const choice = await returningModal.show(currentUser);
                console.log('[initializeApp] Returning user choice:', choice);

                if (choice.action === 'resume-chat') {
                    // Resume a specific general/topic chat
                    if (window.sidebar) {
                        await window.sidebar.loadSessions();
                        await window.sidebar.switchSession(choice.conversationId);
                    }
                    modalHandled = true;

                } else if (choice.action === 'resume-course') {
                    // Resume a specific course conversation
                    if (window.courseManager) {
                        await window.courseManager.activateCourse(choice.courseSessionId);
                    } else if (window.sidebar) {
                        await window.sidebar.loadSessions();
                        await window.sidebar.switchSession(choice.conversationId);
                    }
                    modalHandled = true;

                } else if (choice.action === 'new-course') {
                    // Start a fresh chat for the course at current lesson progress
                    try {
                        const res = await csrfFetch('/api/conversations/new-course-session', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ courseSessionId: choice.courseSessionId })
                        });
                        const data = await res.json();
                        if (data.success && data.conversation) {
                            // Load the fresh conversation into the chat
                            if (window.sidebar) {
                                await window.sidebar.loadSessions();
                            }
                            if (window.updateChatForSession) {
                                window.updateChatForSession(data.conversation, []);
                            }
                            // Fire course greeting so the AI introduces where they left off
                            if (window.courseManager) {
                                window.courseManager.activeCourseSessionId = data.courseSession._id;
                                await window.courseManager.loadMySessions();
                                await window.courseManager.sendCourseGreeting();
                            }
                        }
                    } catch (err) {
                        console.error('[initializeApp] Failed to create new course session:', err);
                    }
                    modalHandled = true;

                } else if (choice.action === 'new-general') {
                    // Start a fresh general session — fall through to normal welcome flow
                    modalHandled = false;
                }
                // choice.action === 'skip' → not a returning user, fall through
            }

            if (!modalHandled) {
                await getWelcomeMessage();
            }

            await fetchAndDisplayLeaderboard();
            await loadQuestsAndChallenges();

            // Show default suggestions after welcome message
            setTimeout(() => showDefaultSuggestions(), 1000);
        } catch (error) {
            console.error("Initialization failed, redirecting to login.", error);
            window.location.href = "/login.html";
        }
    }
    
    // WHITEBOARD SHELVED FOR BETA — see modules/whiteboard.js


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
            // New logins always start in general chat with a fresh session.
            // Clear any pending session from sidebar — users can click sidebar
            // to resume old conversations manually.
            window.pendingActiveSession = null;

            // Check if session messages were already loaded from sidebar
            // Skip welcome message if we restored an existing session
            if (window.sessionMessagesLoaded) {
                console.log('[Chat] Session messages already loaded, skipping welcome');
                window.sessionMessagesLoaded = false; // Reset for next time
                return;
            }

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

            // AI-initiated greeting via chat endpoint
            // The AI "initiates" the conversation using context about the student
            showThinkingIndicator(true);

            const res = await csrfFetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isGreeting: true })
            });

            const data = await res.json();
            showThinkingIndicator(false);

            if (data.text) {
                appendMessage(data.text, "ai");
            }
        } catch (error) {
            showThinkingIndicator(false);
            appendMessage("Hey! What do you need help with?", "ai");
        }
    }

    function renderMathInElement(element) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([element]).catch((err) => console.log('MathJax error:', err));
        } else if (window.ensureMathJax) {
            window.ensureMathJax().then(() => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([element]).catch((err) => console.log('MathJax error:', err));
                }
            });
        }
    }

    /**
     * Auto-convert common math notation to LaTeX for MathJax rendering
     * Converts patterns like x^2, a_n, sqrt(12) to \(x^2\), \(a_n\), \(\sqrt{12}\)
     */
    function autoConvertMathNotation(text) {
        if (!text) return text;

        // Skip if text already has LaTeX delimiters (AI already formatted it)
        if (text.includes('\\(') || text.includes('\\[') || text.includes('$')) {
            return text;
        }

        let result = text;

        // Convert sqrt(n) or sqrt{n} to \(\sqrt{n}\)
        result = result.replace(/\bsqrt\s*[\(\{]([^\)\}]+)[\)\}]/gi, '\\(\\sqrt{$1}\\)');

        // Convert variable^exponent patterns (e.g., x^2, y^3, a^n)
        // Match: letter(s) followed by ^ and a number or letter or (expression)
        result = result.replace(/\b([a-zA-Z]+)\^(\d+|\([^\)]+\)|[a-zA-Z])\b/g, '\\($1^{$2}\\)');

        // Convert variable_subscript patterns (e.g., a_n, x_1, a_i)
        // Match: letter(s) followed by _ and a number or letter
        result = result.replace(/\b([a-zA-Z]+)_(\d+|[a-zA-Z])\b/g, '\\($1_{$2}\\)');

        // Convert combined patterns like x_1^2
        result = result.replace(/\b([a-zA-Z]+)_(\d+|[a-zA-Z])\^(\d+|[a-zA-Z])\b/g, '\\($1_{$2}^{$3}\\)');

        // Convert pi to π symbol when standalone
        result = result.replace(/\bpi\b/gi, '\\(\\pi\\)');

        // Convert infinity
        result = result.replace(/\binfinity\b/gi, '\\(\\infty\\)');

        // Convert common fractions like 1/2, 3/4 (only simple numeric fractions)
        // Be careful not to match dates or other patterns
        result = result.replace(/(?<![\/\d])(\d+)\/(\d+)(?![\/\d])/g, '\\(\\frac{$1}{$2}\\)');

        return result;
    }

    // Expose for use elsewhere
    window.autoConvertMathNotation = autoConvertMathNotation;

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
        if (sender === 'user' && currentUser) {
            const avatar = document.createElement("div");
            avatar.className = "message-avatar";

            // Check for custom DiceBear avatar first
            if (currentUser.avatar?.dicebearUrl) {
                avatar.innerHTML = `<img src="${currentUser.avatar.dicebearUrl}" alt="My Avatar" />`;
            }
            // Fall back to pre-made avatar selection
            else if (currentUser.selectedAvatarId && window.AVATAR_CONFIG) {
                const avatarConfig = window.AVATAR_CONFIG[currentUser.selectedAvatarId];
                if (avatarConfig) {
                    const avatarImage = avatarConfig.image || 'default-avatar.png';
                    avatar.innerHTML = `<img src="/images/avatars/${avatarImage}" alt="${avatarConfig.name}" />`;
                } else {
                    // Fallback if avatar not found
                    avatar.innerHTML = `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${currentUser.firstName?.charAt(0) || '?'}</div>`;
                }
            }
            // Ultimate fallback - initial letter
            else {
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
            // Auto-convert common math notation (x^2, a_n, sqrt(12)) to LaTeX
            let processedText = autoConvertMathNotation(text);

            // Protect entire LaTeX blocks from markdown parsing
            const latexBlocks = [];
            let protectedText = processedText;

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

            // Extract and protect inline visual HTML (SVG containers from inlineChatVisuals)
            // These are already rendered HTML that shouldn't be parsed by marked
            // Pattern matches: <div class="icv-container...>...</div> (outermost container)
            const visualBlocks = [];
            protectedText = protectedText.replace(/<div class="icv-container[^"]*"[^>]*>[\s\S]*?<\/svg>\s*<\/div>/g, (match) => {
                const index = visualBlocks.length;
                visualBlocks.push(match);
                return `@@VISUAL_BLOCK_${index}@@`;
            });
            // Also protect non-SVG visuals (like fraction displays)
            protectedText = protectedText.replace(/<div class="icv-container[^"]*"[^>]*>(?:(?!<svg)[\s\S])*?<\/div>\s*<\/div>/g, (match) => {
                const index = visualBlocks.length;
                visualBlocks.push(match);
                return `@@VISUAL_BLOCK_${index}@@`;
            });

            // Parse markdown with protected LaTeX and visuals
            const dirtyHtml = marked.parse(protectedText, { breaks: true });

            // Restore LaTeX blocks
            let finalHtml = dirtyHtml;
            latexBlocks.forEach((block, index) => {
                finalHtml = finalHtml.replace(`@@LATEX_BLOCK_${index}@@`, block);
            });

            // Restore visual blocks
            visualBlocks.forEach((block, index) => {
                finalHtml = finalHtml.replace(`@@VISUAL_BLOCK_${index}@@`, block);
            });

            // Sanitize HTML to prevent XSS attacks
            // Extended to allow inline visual elements (SVG charts, graphs, etc.)
            const sanitizedHtml = DOMPurify.sanitize(finalHtml, {
                ALLOWED_TAGS: [
                    // Basic formatting
                    'p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'label',
                    // Form elements for interactive visuals
                    'input', 'button',
                    // SVG elements for charts/graphs
                    'svg', 'g', 'path', 'line', 'circle', 'rect', 'polygon', 'text', 'tspan',
                    // Images
                    'img'
                ],
                ALLOWED_ATTR: [
                    'href', 'class', 'target', 'rel', 'id', 'style', 'title', 'alt', 'src',
                    // SVG attributes
                    'viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
                    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
                    'text-anchor', 'font-size', 'font-weight', 'transform', 'transform-origin',
                    // Form/interactive attributes
                    'type', 'min', 'max', 'value', 'step', 'oninput', 'onclick',
                    // Data attributes for visuals
                    'data-config', 'data-diagram-id', 'data-value', 'data-label'
                ]
            });
            textNode.innerHTML = sanitizedHtml;
        } else {
            // For user messages, also auto-convert math notation
            const convertedText = autoConvertMathNotation(text);
            textNode.innerHTML = convertedText;
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

        if (graphData) {
             const graphContainer = document.createElement('div');
            const graphId = 'graph-container-' + Date.now();
            graphContainer.id = graphId;
            graphContainer.className = 'graph-render-area';
            bubble.appendChild(graphContainer);
            const renderGraph = () => {
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
            };
            if (window.functionPlot) {
                setTimeout(renderGraph, 0);
            } else if (window.ensureFunctionPlot) {
                window.ensureFunctionPlot().then(renderGraph);
            }
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

        // Add timestamp to message
        const timestamp = document.createElement('span');
        timestamp.className = 'message-timestamp';
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        timestamp.textContent = `${displayHours}:${minutes} ${ampm}`;
        bubble.appendChild(timestamp);

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

        // Update watermark visibility based on message count
        updateChatWatermark();

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
                    if (parent.classList && (parent.classList.contains('math-container') || parent.classList.contains('math-block-container'))) {
                        insideMathContainer = true;
                        break;
                    }
                    parent = parent.parentElement;
                }

                if (!insideMathContainer) {
                    result += node.textContent;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Multi-line math block: each .math-block-line becomes its own line
                if (node.classList.contains('math-block-container')) {
                    const lines = node.querySelectorAll('.math-block-line');
                    lines.forEach((line, i) => {
                        const latex = line.getAttribute('data-latex');
                        if (latex) {
                            if (i > 0) result += '\n';
                            result += `\\(${latex}\\)`;
                        }
                    });
                    // Skip the entire subtree (walker won't descend into already-handled children,
                    // but child text nodes might still appear — handled by insideMathContainer check)
                } else if (node.classList.contains('math-container') && !node.classList.contains('math-block-line')) {
                    const latex = node.getAttribute('data-latex');
                    if (latex) {
                        result += `\\(${latex}\\)`;
                    }
                }
            }
        }

        return result;
    }

    /**
     * Send a message - uses the message queue to handle back-to-back messages gracefully
     */
    function sendMessage() {
        const messageText = extractMessageText(userInput).trim();
        if (!messageText && attachedFiles.length === 0) return;

        // Capture response time from ghost timer
        let responseTime = null;
        if (typeof getResponseTimeAndStop === 'function') {
            responseTime = getResponseTimeAndStop();
        }

        // Clear input immediately for responsive UX
        userInput.textContent = "";
        userInput.setAttribute('data-placeholder', "Ask a math question...");

        // Copy attached files and clear them from UI
        const filesToSend = attachedFiles.length > 0 ? [...attachedFiles] : [];
        if (filesToSend.length > 0) {
            console.log(`[Frontend] Queuing ${filesToSend.length} file(s)`);
            clearAllFiles();
        }

        // Queue the message for processing
        queueMessage(messageText, filesToSend, responseTime);
    }
    
    function showThinkingIndicator(show) {
        if (thinkingIndicator) thinkingIndicator.style.display = show ? "flex" : "none";
    }

    /**
     * Queue a message for processing
     * Shows the message immediately as "queued" and processes when ready
     */
    function queueMessage(messageText, files, responseTime) {
        const queuedMessage = {
            id: ++messageQueue.currentMessageId,
            text: messageText,
            files: files ? [...files] : [],
            responseTime: responseTime,
            timestamp: Date.now()
        };

        messageQueue.queue.push(queuedMessage);
        console.log(`[MessageQueue] Message queued (ID: ${queuedMessage.id}, Queue length: ${messageQueue.queue.length})`);

        // Show queued message in UI with "queued" indicator if we're already processing
        if (messageQueue.isProcessing && messageText) {
            appendQueuedMessage(messageText, queuedMessage.id);
        }

        // Start processing if not already processing
        if (!messageQueue.isProcessing) {
            processMessageQueue();
        }
    }

    /**
     * Display a queued message in the chat with a visual indicator
     */
    function appendQueuedMessage(text, messageId) {
        if (!chatBox) return;

        // Create message container matching appendMessage structure
        const messageContainer = document.createElement("div");
        messageContainer.className = 'message-container user';
        messageContainer.setAttribute('data-queue-id', messageId);

        // Add user avatar (matching appendMessage logic)
        if (currentUser) {
            const avatar = document.createElement("div");
            avatar.className = "message-avatar";

            if (currentUser.avatar?.dicebearUrl) {
                avatar.innerHTML = `<img src="${currentUser.avatar.dicebearUrl}" alt="My Avatar" />`;
            } else if (currentUser.selectedAvatarId && window.AVATAR_CONFIG) {
                const avatarConfig = window.AVATAR_CONFIG[currentUser.selectedAvatarId];
                if (avatarConfig) {
                    const avatarImage = avatarConfig.image || 'default-avatar.png';
                    avatar.innerHTML = `<img src="/images/avatars/${avatarImage}" alt="${avatarConfig.name}" />`;
                } else {
                    avatar.innerHTML = `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${currentUser.firstName?.charAt(0) || '?'}</div>`;
                }
            } else {
                avatar.innerHTML = `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${currentUser.firstName?.charAt(0) || '?'}</div>`;
            }
            messageContainer.appendChild(avatar);
        }

        // Create the message bubble
        const bubble = document.createElement("div");
        bubble.className = 'message user queued';
        bubble.innerHTML = `
            <div class="queued-indicator">Queued - will send shortly</div>
            <span class="message-text">${text}</span>
        `;

        messageContainer.appendChild(bubble);
        chatBox.appendChild(messageContainer);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    /**
     * Process the message queue one message at a time
     */
    async function processMessageQueue() {
        if (messageQueue.isProcessing || messageQueue.queue.length === 0) {
            return;
        }

        messageQueue.isProcessing = true;

        while (messageQueue.queue.length > 0) {
            const message = messageQueue.queue.shift();
            console.log(`[MessageQueue] Processing message ID: ${message.id}`);

            // Remove queued indicator if this message was shown as queued
            const queuedElement = document.querySelector(`[data-queue-id="${message.id}"]`);
            if (queuedElement) {
                // Update to show it's being sent now
                const indicator = queuedElement.querySelector('.queued-indicator');
                if (indicator) {
                    indicator.textContent = 'Sending...';
                    indicator.style.color = '#4CAF50';
                }
            }

            try {
                await processQueuedMessage(message);
            } catch (error) {
                console.error('[MessageQueue] Error processing message:', error);
            }

            // Remove the queued message element (the real message was appended by processQueuedMessage)
            if (queuedElement) {
                queuedElement.remove();
            }
        }

        messageQueue.isProcessing = false;
        console.log('[MessageQueue] Queue empty, processing complete');
    }

    /**
     * Process a single queued message (the actual send logic)
     */
    async function processQueuedMessage(queuedMsg) {
        const messageText = queuedMsg.text;
        const responseTime = queuedMsg.responseTime;
        const queuedFiles = queuedMsg.files;

        // Only append if not already shown as queued
        const queuedElement = document.querySelector(`[data-queue-id="${queuedMsg.id}"]`);
        if (!queuedElement && messageText) {
            appendMessage(messageText, "user");
        } else if (queuedElement && messageText) {
            // Replace queued message with proper user message
            queuedElement.remove();
            appendMessage(messageText, "user");
        }

        showThinkingIndicator(true);

        try {
            let response;

            // RAPPORT BUILDING MODE: Route to rapport endpoint
            if (isRapportBuilding && queuedFiles.length === 0) {
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

                // If rapport is complete, show assessment pitch
                if (data.triggerAssessment) {
                    setTimeout(() => showAssessmentPitch(), 1000);
                }

                showThinkingIndicator(false);
                return;
            }

            // Multi-file upload support
            if (queuedFiles.length > 0) {
                console.log(`[Frontend] Sending ${queuedFiles.length} file(s) to /api/chat-with-file`);

                const formData = new FormData();

                // Append all files
                queuedFiles.forEach((file, index) => {
                    formData.append(index === 0 ? 'file' : `file${index}`, file);
                });

                formData.append('message', messageText);
                formData.append('fileCount', queuedFiles.length);

                if (responseTime !== null) {
                    formData.append('responseTime', responseTime);
                }

                response = await csrfFetch("/api/chat-with-file", {
                    method: "POST",
                    body: formData,
                    credentials: 'include'
                });
            } else {
                // Regular chat (no files)
                const payload = { message: messageText };

                if (responseTime !== null) {
                    payload.responseTime = responseTime;
                }

                // Route to dedicated course chat when in an active course session
                const isInCourse = window.courseManager && window.courseManager.activeCourseSessionId;
                const chatEndpoint = isInCourse ? '/api/course-chat' : '/api/chat';

                response = await csrfFetch(chatEndpoint, {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    credentials: 'include'
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // Handle usage limit (402) — show upgrade prompt instead of error
                if (response.status === 402 && (errorData.usageLimitReached || errorData.premiumFeatureBlocked)) {
                    showThinkingIndicator(false);
                    showUpgradePrompt(errorData);
                    return;
                }

                const errorMessage = errorData.message || errorData.error || `Server error: ${response.status}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();

            // Process AI response (same logic as original sendMessage)
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

            // Process diagram commands
            if (window.diagramDisplay) {
                try {
                    aiText = await window.diagramDisplay.processMessage(aiText);
                } catch (error) {
                    console.error('[Diagrams] Error processing diagrams:', error);
                }
            }

            // Process inline chat visuals
            let hasInlineVisuals = false;
            if (window.inlineChatVisuals) {
                try {
                    const visualResult = window.inlineChatVisuals.processMessage(aiText);
                    aiText = visualResult.html;
                    hasInlineVisuals = visualResult.hasVisuals;
                } catch (error) {
                    console.error('[InlineChatVisuals] Error processing visuals:', error);
                }
            }

            appendMessage(aiText, "ai", graphData, data.isMasteryQuiz);

            // Apply IEP accommodations to this response
            handleIepResponseFeatures(data.iepFeatures);

            // Show IEP goal progress notifications to student
            handleIepGoalUpdates(data.iepGoalUpdates);

            // Initialize inline visuals after message is in DOM
            if (hasInlineVisuals && window.inlineChatVisuals) {
                const messageElements = document.querySelectorAll('.message.ai');
                const latestMessage = messageElements[messageElements.length - 1];
                if (latestMessage) {
                    setTimeout(() => {
                        window.inlineChatVisuals.initializeVisuals(latestMessage);
                        renderMathInElement(latestMessage);
                    }, 100);
                }
            }

            // Render interactive graph tool if AI requested one
            if (data.graphTool && window.GraphTool) {
                const messageElements = document.querySelectorAll('.message.ai');
                const latestMessage = messageElements[messageElements.length - 1];
                if (latestMessage) {
                    const graphContainer = document.createElement('div');
                    graphContainer.className = 'graph-tool-container';
                    latestMessage.appendChild(graphContainer);

                    new GraphTool(graphContainer, {
                        ...data.graphTool,
                        onSubmit: (result) => {
                            // Send student's graph as a chat message
                            const msg = `[Graph Response] I plotted points (${result.points[0].x}, ${result.points[0].y}) and (${result.points[1].x}, ${result.points[1].y}). ` +
                                `Slope: ${result.slope != null ? result.slope : 'undefined'}. ` +
                                `Y-intercept: ${result.yIntercept != null ? result.yIntercept : 'N/A'}. ` +
                                `My line: ${result.equation}`;
                            // Insert into chat input and auto-send
                            const chatInput = document.getElementById('chat-input');
                            if (chatInput) {
                                chatInput.value = msg;
                                const sendBtn = document.querySelector('.send-button') || document.getElementById('send-button');
                                if (sendBtn) sendBtn.click();
                            }
                        }
                    });

                    // Scroll to show the graph
                    const chatBox = document.getElementById('chat-box');
                    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
                }
            }

            // Notify whiteboard-chat layout manager
            if (window.whiteboardChatLayout) {
                document.dispatchEvent(new CustomEvent('newAIMessage', { detail: { message: aiText } }));
            }

            // Board-first chat integration
            if (data.boardContext && window.chatBoardController) {
                const messageElements = document.querySelectorAll('.message.ai');
                const latestMessage = messageElements[messageElements.length - 1];
                if (latestMessage) {
                    window.chatBoardController.enhanceChatMessage(latestMessage, 'ai', data.boardContext);
                }
            }

            if (data.drawingSequence) {
                renderDrawing(data.drawingSequence);
            }

            // Execute visual teaching commands
            if (data.visualCommands && window.visualTeachingHandler) {
                try {
                    await window.visualTeachingHandler.executeCommands(data.visualCommands);
                } catch (error) {
                    console.error('[VisualTeaching] Failed to execute commands:', error);
                }
            }

            if (data.newlyUnlockedTutors && data.newlyUnlockedTutors.length > 0) {
                showTutorUnlockCelebration(data.newlyUnlockedTutors);
            }

            if (data.userXp !== undefined) {
                currentUser.level = data.userLevel;
                currentUser.xpForCurrentLevel = Math.max(0, data.userXp);
                currentUser.xpForNextLevel = data.xpNeeded;
                updateGamificationDisplay();
            }

            // Session stats tracker update
            if (data.problemResult && typeof window.trackProblemAttempt === 'function') {
                const isCorrect = data.problemResult === 'correct';
                window.trackProblemAttempt(isCorrect);
            }

            // XP Ladder display
            if (data.xpLadder) {
                const xp = data.xpLadder;

                if (xp.leveledUp) {
                    triggerXpAnimation(`LEVEL UP! Level ${data.userLevel}`, true, false);
                }

                if (xp.tier3 > 0 && xp.tier3Behavior) {
                    const behaviorLabels = {
                        'explained_reasoning': 'Great reasoning!',
                        'caught_own_error': 'Self-correction!',
                        'strategy_selection': 'Smart strategy!',
                        'persistence': 'Perseverance!',
                        'transfer': 'Knowledge transfer!',
                        'taught_back': 'Teaching mastery!'
                    };
                    const label = behaviorLabels[xp.tier3Behavior] || 'Exceptional!';
                    triggerXpAnimation(`+${xp.tier3} XP - ${label}`, false, true);

                    if (typeof window.showXpNotification === 'function') {
                        window.showXpNotification(xp.tier3, label);
                    }
                } else if (xp.tier2 > 0) {
                    const tier2Label = xp.tier2Type === 'clean' ? 'Clean solution!' : 'Correct!';
                    if (typeof window.showXpNotification === 'function') {
                        window.showXpNotification(xp.tier2, tier2Label);
                    }
                }

                if ((xp.tier1 > 0 || xp.tier2 > 0 || xp.tier3 > 0) && window.MathMatixSurvey) {
                    window.MathMatixSurvey.trackProblemSolved();
                }
            } else if (data.specialXpAwarded) {
                const isLevelUp = data.specialXpAwarded.includes('LEVEL_UP');
                triggerXpAnimation(data.specialXpAwarded, isLevelUp, !isLevelUp);
            }

            // Course progress updates (scaffold advance, module complete)
            if (data.courseProgress && window.courseManager) {
                const cp = data.courseProgress;
                if (cp.event === 'scaffold_advance') {
                    // Update the progress bar with blended overall progress
                    const fill = document.getElementById('course-progress-fill');
                    const pct = document.getElementById('course-progress-pct');
                    const mod = document.getElementById('course-progress-module');
                    const progressValue = cp.overallProgress != null ? cp.overallProgress : cp.scaffoldProgress;
                    if (fill && progressValue != null) {
                        fill.style.width = `${progressValue}%`;
                    }
                    if (pct && progressValue != null) pct.textContent = `${progressValue}%`;
                    // Show breadcrumb: Unit X › Lesson Title › Phase
                    if (mod) {
                        const parts = [];
                        if (cp.unit) parts.push(`Unit ${cp.unit}`);
                        if (cp.lessonTitle) parts.push(cp.lessonTitle);
                        if (cp.phase) parts.push(cp.phase);
                        mod.textContent = parts.length > 0 ? parts.join(' \u203A ') : (cp.stepTitle || '');
                    }
                    // Show lesson transition card when crossing a lesson boundary
                    if (cp.lessonTransition) {
                        window.courseManager.showLessonTransition(cp.lessonTransition);
                    }
                    console.log(`[Course] Scaffold advanced → step ${cp.scaffoldIndex + 1}/${cp.scaffoldTotal} (overall: ${cp.overallProgress}%)`);
                } else if (cp.event === 'module_complete') {
                    // Refresh the full progress display and trigger celebration
                    window.courseManager.loadMySessions();
                    window.courseManager.checkActiveProgressBar();
                    // Show XP notification for module completion
                    if (cp.xpAwarded && typeof window.showXpNotification === 'function') {
                        window.showXpNotification(cp.xpAwarded, 'Module Complete!');
                    }
                    // Trigger module celebration (confetti + card)
                    if (cp.moduleId) {
                        window.courseManager.celebrateModuleCompletion({
                            moduleId: cp.moduleId,
                            title: cp.moduleId,
                            xpAwarded: cp.xpAwarded || 0,
                            courseComplete: cp.courseComplete || false
                        });
                    }
                    console.log(`[Course] Module complete: ${cp.moduleId}, overall: ${cp.overallProgress}%`);
                }
            }

        } catch (error) {
            console.error("Chat error:", error);

            let errorMessage = "I'm having trouble connecting. Please try again.";
            if (error.message) {
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
            setTimeout(() => showDefaultSuggestions(), 500);
        }
    }

    // --- Assessment System (see modules/assessment.js) ---
    const assessment = createAssessmentSystem({
        appendMessage,
        showThinkingIndicator,
        getChatBox: () => chatBox,
    });
    const { showAssessmentPitch } = assessment;


    // Audio, gamification display, leaderboard, and quests are now in ES modules
    // (see imports at top of file)

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
            const res = await csrfFetch('/api/user/settings', {
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

    // Inline Equation Palette (MS Word-like) — Multi-line support
    const inlineEquationPalette = document.getElementById('inline-equation-palette');
    const mathLinesContainer = document.getElementById('math-lines-container');
    const addMathLineBtn = document.getElementById('add-math-line');
    const insertInlineEqBtn = document.getElementById('insert-inline-equation');
    const closeInlinePaletteBtn = document.getElementById('close-inline-palette');

    // Helper: get all math-field elements in the multi-line container
    function getMathLineFields() {
        if (!mathLinesContainer) return [];
        return Array.from(mathLinesContainer.querySelectorAll('.math-line-field'));
    }

    // Helper: get the currently focused math-field (or the last one)
    function getActiveMathField() {
        const fields = getMathLineFields();
        const focused = fields.find(f => f === document.activeElement || f.contains(document.activeElement));
        return focused || fields[fields.length - 1] || null;
    }

    // Helper: update remove-button visibility (hide if only 1 line)
    function updateRemoveButtons() {
        if (!mathLinesContainer) return;
        const rows = mathLinesContainer.querySelectorAll('.math-line-row');
        rows.forEach(row => {
            const btn = row.querySelector('.math-line-remove');
            if (btn) btn.style.display = rows.length > 1 ? '' : 'none';
        });
    }

    // Add a new math line
    function addMathLine() {
        if (!mathLinesContainer) return;
        const row = document.createElement('div');
        row.className = 'math-line-row';
        row.innerHTML = `<math-field class="inline-math-field math-line-field"></math-field>` +
                         `<button class="math-line-remove" title="Remove line">&times;</button>`;
        row.querySelector('.math-line-remove').addEventListener('click', () => {
            row.remove();
            updateRemoveButtons();
            const fields = getMathLineFields();
            if (fields.length) fields[fields.length - 1].focus();
        });
        // Enter = insert, Shift+Enter = add line
        const field = row.querySelector('.math-line-field');
        if (field) {
            field.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) { addMathLine(); }
                    else if (insertInlineEqBtn) { insertInlineEqBtn.click(); }
                }
            });
        }
        mathLinesContainer.appendChild(row);
        updateRemoveButtons();
        if (field) setTimeout(() => field.focus(), 50);
    }

    // Wire up Enter/Shift+Enter on the initial math-field
    if (mathLinesContainer) {
        const firstField = mathLinesContainer.querySelector('.math-line-field');
        if (firstField) {
            firstField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) { addMathLine(); }
                    else if (insertInlineEqBtn) { insertInlineEqBtn.click(); }
                }
            });
        }
    }

    // Wire up "Add Line" button
    if (addMathLineBtn) {
        addMathLineBtn.addEventListener('click', addMathLine);
    }

    // Wire up the initial remove button (for the first row)
    if (mathLinesContainer) {
        const firstRemove = mathLinesContainer.querySelector('.math-line-remove');
        if (firstRemove) {
            firstRemove.addEventListener('click', () => {
                const rows = mathLinesContainer.querySelectorAll('.math-line-row');
                if (rows.length > 1) {
                    firstRemove.closest('.math-line-row').remove();
                    updateRemoveButtons();
                }
            });
        }
    }

    // Toggle inline palette instead of modal
    if (openEquationBtn && inlineEquationPalette) {
        openEquationBtn.addEventListener('click', () => {
            const isVisible = inlineEquationPalette.style.display === 'block';
            inlineEquationPalette.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                const field = getActiveMathField();
                if (field) setTimeout(() => field.focus(), 100);
            }
        });
    }

    // Close inline palette
    if (closeInlinePaletteBtn) {
        closeInlinePaletteBtn.addEventListener('click', () => {
            if (inlineEquationPalette) inlineEquationPalette.style.display = 'none';
        });
    }

    // Handle symbol button clicks (both .symbol-btn and .script-btn)
    document.querySelectorAll('.symbol-btn, .script-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const latex = btn.getAttribute('data-latex');
            const activeField = getActiveMathField();
            if (activeField && latex) {
                activeField.executeCommand(['insert', latex]);
                activeField.focus();
            }
        });
    });

    // Insert equation(s) into chat input — supports multiple lines
    if (insertInlineEqBtn && userInput) {
        insertInlineEqBtn.addEventListener('click', () => {
            const fields = getMathLineFields();
            const lines = fields.map(f => f.value).filter(v => v && v.trim());
            if (lines.length === 0) return;

            // Build a multi-line math block
            const block = document.createElement('div');
            block.className = 'math-block-container';

            lines.forEach((latex, i) => {
                const line = document.createElement('div');
                line.className = 'math-container math-block-line';
                line.setAttribute('data-latex', latex);
                line.textContent = `\\(${latex}\\)`;
                block.appendChild(line);
            });

            // Append block to chat input
            userInput.appendChild(block);
            userInput.appendChild(document.createTextNode(' '));

            // Render all math in the block
            renderMathInElement(block);

            // Clear all fields and reset to single line
            fields.forEach(f => { f.value = ''; });
            while (mathLinesContainer && mathLinesContainer.children.length > 1) {
                mathLinesContainer.removeChild(mathLinesContainer.lastChild);
            }
            updateRemoveButtons();

            inlineEquationPalette.style.display = 'none';
            userInput.focus();
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
                    renderMathInElement(mathContainer);

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
                window._speechRecognition.isActive = true;
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
    // Tutor unlock celebration is now in modules/gamification.js

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
            const response = await csrfFetch('/api/chat/reaction', {
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

        // Track current conversation ID globally
        window.currentConversationId = conversation._id;

        // Clear current chat
        if (chatBox) {
            chatBox.innerHTML = '';
            messageIndexCounter = 0; // Reset message counter
            updateChatWatermark(); // Mark chat as empty for watermark
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
            // No messages yet — show a static welcome placeholder.
            // Course greetings are handled by the caller (activateCourse / enrollInCourse)
            // so we do NOT send one here to avoid duplicate greetings.
            if (conversation.conversationType === 'topic') {
                appendMessage(
                    `Welcome to your ${conversation.topic || 'topic'} session! 📚\n\n` +
                    `I'm here to help you learn and practice. What would you like to work on?`,
                    'ai'
                );
            }
            // For course and general conversations, the caller handles the greeting
        }

        console.log('[updateChatForSession] Loaded', messages?.length || 0, 'messages');
    };

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initializeApp();
});
