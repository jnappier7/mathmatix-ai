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

// Expose showUpgradePrompt globally so courseCatalog.js (non-module) can call it
window.showUpgradePrompt = showUpgradePrompt;

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
        // Skip auto-listen if a network error was recently encountered
        if (recog && recog.instance && !recog.isActive && !recog.networkErrorActive) {
            try {
                recog.instance.start();
                recog.isActive = true;
                const micBtn = document.getElementById('mic-button');
                if (micBtn) micBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            } catch(e) {
                console.error("Auto-listen could not be started:", e);
                showToast('Auto-listen could not start. Tap the mic to try again.', 3500);
            }
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
    window._speechRecognition = { instance: null, isActive: false, networkErrorActive: false };

    let speechNetworkRetries = 0;
    const SPEECH_MAX_RETRIES = 2;
    const SPEECH_RETRY_BASE_MS = 1500;
    let speechRetryTimer = null;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;         // Keep listening until user stops
        recognition.lang = 'en-US';
        recognition.interimResults = true;     // Show words as they're spoken
        recognition.maxAlternatives = 1;
        window._speechRecognition.instance = recognition;

        // Track finalized text so interim results can preview without duplication
        let _speechFinalizedText = '';
        let _speechSilenceTimer = null;
        const SPEECH_AUTO_STOP_MS = 3000; // Auto-stop after 3s of silence in continuous mode

        recognition.onresult = (event) => {
            // Reset silence auto-stop timer on every result
            clearTimeout(_speechSilenceTimer);
            _speechSilenceTimer = setTimeout(() => {
                // No new speech for 3s — auto-stop and keep text
                if (isRecognizing) {
                    try { recognition.stop(); } catch (_) {}
                }
            }, SPEECH_AUTO_STOP_MS);

            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            // Update finalized text and show interim preview
            if (finalTranscript) {
                _speechFinalizedText = finalTranscript;
            }
            userInput.textContent = _speechFinalizedText + interimTranscript;

            // Successful result — reset network retry counter
            speechNetworkRetries = 0;
            window._speechRecognition.networkErrorActive = false;
        };
        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);

            if (event.error === 'not-allowed') {
                isRecognizing = false;
                window._speechRecognition.isActive = false;
                if (micBtn) micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                showToast('Microphone access denied. Please check your browser permissions.', 5000);
            } else if (event.error === 'network') {
                isRecognizing = false;
                window._speechRecognition.isActive = false;
                if (micBtn) micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                window._speechRecognition.networkErrorActive = true;

                if (speechNetworkRetries < SPEECH_MAX_RETRIES) {
                    speechNetworkRetries++;
                    const delay = SPEECH_RETRY_BASE_MS * speechNetworkRetries;
                    clearTimeout(speechRetryTimer);
                    speechRetryTimer = setTimeout(() => {
                        try {
                            recognition.start();
                            isRecognizing = true;
                            window._speechRecognition.isActive = true;
                            if (micBtn) micBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
                        } catch (e) {
                            // recognition may already be started or unavailable
                            isRecognizing = false;
                            window._speechRecognition.isActive = false;
                        }
                    }, delay);
                } else {
                    // All retries exhausted — inform user once
                    speechNetworkRetries = 0;
                    showToast('Speech recognition unavailable. Check your connection and try again.', 5000);
                }
            } else if (event.error === 'no-speech') {
                // Silence timeout — not a real error, no toast needed
            } else if (event.error !== 'aborted') {
                isRecognizing = false;
                window._speechRecognition.isActive = false;
                if (micBtn) micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                showToast('Speech recognition error. Please try again.', 3000);
            }
        };
        recognition.onend = () => {
            isRecognizing = false;
            window._speechRecognition.isActive = false;
            clearTimeout(_speechSilenceTimer);
            _speechFinalizedText = '';
            if (micBtn) {
                micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                micBtn.classList.remove('mic-recording');
                micBtn.title = 'Voice Input';
            }
        };
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

            // Gate Voice Tutor button for non-premium users
            gateVoiceTutorButton(currentUser);

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

    /**
     * Lock the Voice Tutor sidebar button for non-premium users.
     * Premium = unlimited tier, school-licensed, or teacher/parent/admin role.
     */
    function gateVoiceTutorButton(user) {
        const btn = document.getElementById('sidebar-voice-tutor-btn');
        const lock = document.getElementById('voice-tutor-lock');
        if (!btn || !lock) return;

        const role = user.role || 'student';
        const hasPremiumRole = role === 'teacher' || role === 'parent' || role === 'admin';
        const hasUnlimited = user.subscriptionTier === 'unlimited';
        const hasSchoolLicense = !!user.schoolLicenseId;

        if (hasPremiumRole || hasUnlimited || hasSchoolLicense) return;

        // Non-premium: show lock, dim button, intercept click
        lock.style.display = '';
        btn.style.opacity = '0.65';
        btn.style.cursor = 'default';
        btn.title = 'Voice Tutor requires the Unlimited plan or a school license';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            showUpgradePrompt({
                premiumFeatureBlocked: true,
                feature: 'Voice chat',
                tier: user.subscriptionTier || 'free',
                upgradeRequired: true
            });
        });
    }

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
                    showToast('Code copied to clipboard!', 3500);
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
                            showToast('Code copied to clipboard!', 3500);
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
                body: JSON.stringify({ isGreeting: true, skipCourse: true })
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

    // ── Unified Markdown + Math renderer (marked + KaTeX) ──
    // Pipeline: protect LaTeX → marked.parse → restore with katex.renderToString
    // KaTeX renders synchronously — no FOUC, no debounce, no post-processing.
    //
    // Both `marked` and `katex` are loaded from CDN as global scripts.
    // Use `window.*` to access them reliably from this ES module.

    /**
     * Render a KaTeX math string to HTML. Returns raw LaTeX on error.
     */
    function renderKatex(math, displayMode) {
        if (!window.katex) return (displayMode ? '\\[' : '\\(') + math + (displayMode ? '\\]' : '\\)');
        try {
            return window.katex.renderToString(math, { displayMode, throwOnError: false, strict: false, trust: true });
        } catch (e) {
            console.warn('[KaTeX] render error:', e.message);
            return (displayMode ? '\\[' : '\\(') + math + (displayMode ? '\\]' : '\\)');
        }
    }

    /**
     * Render markdown + LaTeX → sanitized HTML.
     * Protect LaTeX from markdown, parse markdown, restore LaTeX as rendered KaTeX HTML.
     */
    function renderMarkdownMath(text) {
        if (!text) return '';

        // Access CDN globals explicitly via window
        const _marked = window.marked;
        const _DOMPurify = window.DOMPurify;

        if (!_marked || !_marked.parse) {
            console.warn('[renderMarkdownMath] marked not available, falling back to plain text');
            // Even without markdown, try to render KaTeX math
            let fallback = text;
            if (window.katex) {
                fallback = fallback.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderKatex(math, true));
                fallback = fallback.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => renderKatex(math, false));
            }
            return _DOMPurify ? _DOMPurify.sanitize(fallback) : fallback;
        }

        let processedText = text;

        // Protect LaTeX blocks from markdown parsing
        const latexBlocks = [];

        // Display math \[...\]
        processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
            const index = latexBlocks.length;
            latexBlocks.push({ math, display: true });
            return `@@LATEX_BLOCK_${index}@@`;
        });

        // Inline math \(...\)
        processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, (match, math) => {
            const index = latexBlocks.length;
            latexBlocks.push({ math, display: false });
            return `@@LATEX_BLOCK_${index}@@`;
        });

        // Protect inline visual HTML (SVG containers from inlineChatVisuals)
        const visualBlocks = [];
        processedText = processedText.replace(/<div class="icv-container[^"]*"[^>]*>[\s\S]*?<\/svg>\s*<\/div>/g, (match) => {
            const index = visualBlocks.length;
            visualBlocks.push(match);
            return `@@VISUAL_BLOCK_${index}@@`;
        });
        processedText = processedText.replace(/<div class="icv-container[^"]*"[^>]*>(?:(?!<svg)[\s\S])*?<\/div>\s*<\/div>/g, (match) => {
            const index = visualBlocks.length;
            visualBlocks.push(match);
            return `@@VISUAL_BLOCK_${index}@@`;
        });

        // Parse markdown
        let html = _marked.parse(processedText, { breaks: true });

        // Restore LaTeX blocks — render to KaTeX HTML inline (synchronous)
        latexBlocks.forEach((block, index) => {
            html = html.replace(`@@LATEX_BLOCK_${index}@@`, renderKatex(block.math, block.display));
        });

        // Restore visual blocks
        visualBlocks.forEach((block, index) => {
            html = html.replace(`@@VISUAL_BLOCK_${index}@@`, block);
        });

        // Sanitize — KaTeX output uses spans with classes + inline styles
        if (_DOMPurify) {
            html = _DOMPurify.sanitize(html, {
                ALLOWED_TAGS: [
                    // Markdown output
                    'p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'label',
                    // Form elements for interactive visuals
                    'input', 'button',
                    // SVG elements for charts/graphs
                    'svg', 'g', 'path', 'line', 'circle', 'rect', 'polygon', 'text', 'tspan',
                    // Images
                    'img',
                    // KaTeX uses math/semantics/annotation elements
                    'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms',
                    'mfrac', 'msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover',
                    'msqrt', 'mroot', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'mpadded',
                    'menclose', 'mglyph', 'mstyle', 'merror', 'mprescripts', 'mmultiscripts'
                ],
                ALLOWED_ATTR: [
                    'href', 'class', 'target', 'rel', 'id', 'style', 'title', 'alt', 'src',
                    // SVG attributes
                    'viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'preserveAspectRatio',
                    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
                    'text-anchor', 'font-size', 'font-weight', 'transform', 'transform-origin',
                    // Form/interactive attributes
                    'type', 'min', 'max', 'value', 'step', 'oninput', 'onclick',
                    // Data attributes for visuals
                    'data-config', 'data-diagram-id', 'data-value', 'data-label',
                    // KaTeX attributes
                    'aria-hidden', 'encoding', 'mathvariant', 'stretchy', 'fence',
                    'separator', 'lspace', 'rspace', 'accent', 'accentunder',
                    'columnalign', 'rowalign', 'columnspacing', 'rowspacing',
                    'columnlines', 'rowlines', 'frame', 'framespacing',
                    'displaystyle', 'scriptlevel', 'minsize', 'maxsize',
                    'xmlns'
                ]
            });
        }

        return html;
    }

    /**
     * Re-render any raw \(...\) or \[...\] text in a DOM element using KaTeX.
     * Used by equation editor insertion and step reveals.
     * Synchronous — no debounce needed.
     */
    function renderMathInElement(element) {
        if (!window.katex || !element) return;
        // Find text nodes containing \( or \[ and render them
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) textNodes.push(node);

        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            if (!text || (!text.includes('\\(') && !text.includes('\\['))) return;

            // Skip text nodes inside already-rendered KaTeX elements to prevent
            // double-rendering (e.g. annotation elements contain raw LaTeX source)
            let ancestor = textNode.parentElement;
            while (ancestor && ancestor !== element) {
                if (ancestor.classList && ancestor.classList.contains('katex')) return;
                ancestor = ancestor.parentElement;
            }

            const span = document.createElement('span');
            // Replace \(...\) and \[...\] with rendered KaTeX
            let html = text;
            html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderKatex(math, true));
            html = html.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => renderKatex(math, false));

            if (html !== text) {
                span.innerHTML = html;
                textNode.parentNode.replaceChild(span, textNode);
            }
        });
    }

    // autoConvertMathNotation removed — markdown-it-texmath handles \(...\)
    // and \[...\] delimiters natively. Server-side normalizeLatex converts
    // bare math ($...$, bare commands) to proper delimiters before we get here.
    // Keeping a no-op stub for backward compatibility with external callers.
    function autoConvertMathNotation(text) { return text; }
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
        bubble.dataset.rawText = text || ''; // Store raw text for TTS (avoids KaTeX DOM triple-read)
        if (isMasteryQuiz) { bubble.classList.add('mastery-quiz'); }

        // Add animation class for entrance
        bubble.classList.add('message-enter');

        const textNode = document.createElement('span');
        textNode.className = 'message-text';
        
        if (sender === 'ai') {
            // Single-pass markdown + KaTeX rendering
            textNode.innerHTML = renderMarkdownMath(text);
        } else {
            // User messages: render markdown+math too (for equations they type)
            textNode.innerHTML = renderMarkdownMath(text);
        }
        bubble.appendChild(textNode);

        // Handle Visual Step Breadcrumbs: [STEPS]...[/STEPS] with animated reveal
        if (sender === 'ai' && text && text.includes('[STEPS]')) {
            const stepsRegex = /\[STEPS\]([\s\S]*?)\[\/STEPS\]/g;
            let match;
            while ((match = stepsRegex.exec(text)) !== null) {
                const stepsContent = match[1].trim();
                const lines = stepsContent.split('\n').map(l => l.trim()).filter(l => l);

                if (lines.length > 0) {
                    const stepsId = `steps-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    const stepsContainer = document.createElement('div');
                    stepsContainer.className = 'visual-steps-container';
                    stepsContainer.id = stepsId;

                    // Build step elements (hidden initially except first)
                    const stepElements = [];
                    lines.forEach((line, index) => {
                        const isEquation = /[=+\-*/]|\\[a-z]+/.test(line);

                        const stepWrapper = document.createElement('div');
                        stepWrapper.className = 'step-reveal-item';
                        stepWrapper.dataset.stepIndex = index;
                        // First step visible, rest hidden
                        if (index > 0) {
                            stepWrapper.classList.add('step-hidden');
                        } else {
                            stepWrapper.classList.add('step-visible');
                        }

                        const lineDiv = document.createElement('div');
                        lineDiv.className = isEquation ? 'step-equation' : 'step-explanation';

                        if (isEquation && !line.includes('\\(')) {
                            lineDiv.innerHTML = `\\(${line}\\)`;
                        } else {
                            lineDiv.textContent = line;
                        }

                        stepWrapper.appendChild(lineDiv);
                        stepElements.push(stepWrapper);
                        stepsContainer.appendChild(stepWrapper);

                        // Add arrow (hidden until both steps are revealed)
                        if (index < lines.length - 1 && isEquation) {
                            const arrow = document.createElement('div');
                            arrow.className = 'step-arrow step-hidden';
                            arrow.dataset.stepIndex = index;
                            arrow.innerHTML = '↓';
                            stepsContainer.appendChild(arrow);
                        }
                    });

                    // Progress indicator and controls
                    const controlsDiv = document.createElement('div');
                    controlsDiv.className = 'step-controls';

                    const progressDiv = document.createElement('div');
                    progressDiv.className = 'step-progress';
                    progressDiv.innerHTML = `<span class="step-progress-text">Step 1 of ${lines.length}</span>`;
                    const progressBar = document.createElement('div');
                    progressBar.className = 'step-progress-bar';
                    progressBar.innerHTML = `<div class="step-progress-fill" style="width: ${(1 / lines.length) * 100}%"></div>`;
                    progressDiv.appendChild(progressBar);

                    const nextBtn = document.createElement('button');
                    nextBtn.className = 'step-next-btn';
                    nextBtn.innerHTML = 'Next Step <span class="step-next-arrow">→</span>';
                    nextBtn.dataset.currentStep = '0';
                    nextBtn.dataset.totalSteps = lines.length.toString();
                    nextBtn.dataset.stepsId = stepsId;

                    nextBtn.addEventListener('click', function() {
                        const current = parseInt(this.dataset.currentStep);
                        const total = parseInt(this.dataset.totalSteps);
                        const container = document.getElementById(this.dataset.stepsId);
                        if (!container) return;

                        const nextIndex = current + 1;
                        if (nextIndex >= total) return;

                        // Reveal the next step
                        const nextStep = container.querySelector(`.step-reveal-item[data-step-index="${nextIndex}"]`);
                        if (nextStep) {
                            nextStep.classList.remove('step-hidden');
                            nextStep.classList.add('step-visible', 'step-animate-in');
                        }

                        // Reveal the arrow before this step
                        const arrow = container.querySelector(`.step-arrow[data-step-index="${current}"]`);
                        if (arrow) {
                            arrow.classList.remove('step-hidden');
                            arrow.classList.add('step-visible', 'step-animate-in');
                        }

                        // Update progress
                        this.dataset.currentStep = nextIndex.toString();
                        const progressText = container.querySelector('.step-progress-text');
                        const progressFill = container.querySelector('.step-progress-fill');
                        if (progressText) progressText.textContent = `Step ${nextIndex + 1} of ${total}`;
                        if (progressFill) progressFill.style.width = `${((nextIndex + 1) / total) * 100}%`;

                        // Re-render math in the revealed step
                        if (nextStep && typeof renderMathInElement === 'function') {
                            renderMathInElement(nextStep);
                        }

                        // Last step reached - change button
                        if (nextIndex >= total - 1) {
                            this.innerHTML = 'All steps revealed ✓';
                            this.classList.add('step-btn-done');
                            this.disabled = true;
                        }

                        // Scroll to the new step
                        nextStep?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    });

                    controlsDiv.appendChild(progressDiv);
                    controlsDiv.appendChild(nextBtn);
                    stepsContainer.appendChild(controlsDiv);

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
            setTimeout(() => {
                try {
                    if (window.MathGraph) {
                        new MathGraph(graphContainer, {
                            fn: graphData.function,
                            xMin: graphData.xMin ?? -10,
                            xMax: graphData.xMax ?? 10,
                            yMin: graphData.yMin ?? null,
                            yMax: graphData.yMax ?? null,
                            interactive: true
                        });
                    } else {
                        graphContainer.innerHTML = '<div class="icv-error">Graph engine not loaded</div>';
                    }
                } catch (e) {
                    console.error("Graphing error:", e);
                    graphContainer.innerHTML = "Could not render graph.";
                }
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

        // Update watermark visibility based on message count
        updateChatWatermark();

        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Expose appendMessage, renderMathInElement, and renderMarkdownMath globally
    window.appendMessage = appendMessage;
    window.renderMathInElement = renderMathInElement;
    window.renderMarkdownMath = renderMarkdownMath;

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
            { text: "🔄 Explain differently", message: "Can you explain that a different way?" },
            { text: "🧒 Explain like I'm in 3rd grade", message: "Explain this like I'm in 3rd grade. Use simple words, fun examples, and make it really easy to understand." }
        ];
        showSuggestions(defaultSuggestions);
    }

    // Expose globally so we can call from other contexts
    window.showSuggestions = showSuggestions;
    window.hideSuggestions = hideSuggestions;

    // Helper function to start a streaming message (creates empty bubble)
    function startStreamingMessage() {
        if (!chatBox) return null;

        _streamRawText = ''; // Reset raw text accumulator

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

    // Accumulate raw text for streaming — we keep the raw source
    // and re-render the full text on each chunk. KaTeX is synchronous
    // so no debounce is needed.
    let _streamRawText = '';

    // Helper function to append a chunk to a streaming message
    function appendStreamingChunk(messageRef, chunk) {
        if (!messageRef || !messageRef.textNode) return;

        _streamRawText += chunk;

        // Single-pass render: markdown + KaTeX in one call, synchronous
        if (messageRef.bubble.classList.contains('ai')) {
            messageRef.textNode.innerHTML = renderMarkdownMath(_streamRawText);
        } else {
            messageRef.textNode.textContent = _streamRawText;
        }

        // Auto-scroll
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Finalize streaming message (add audio, reactions, etc.)
    function finalizeStreamingMessage(messageRef, fullText) {
        if (!messageRef || !messageRef.bubble) return;

        messageRef.bubble.classList.remove('streaming');
        messageRef.bubble.dataset.rawText = fullText || ''; // Store raw text for TTS (avoids KaTeX DOM triple-read)

        // Final clean render with the complete text — KaTeX is synchronous,
        // so no debounce or async needed. This catches any LaTeX delimiters
        // that were split across chunks during streaming.
        if (messageRef.textNode) {
            messageRef.textNode.innerHTML = renderMarkdownMath(fullText);
        }

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

    }

    // Helper function to extract text with LaTeX from contenteditable
    function extractMessageText(element) {
        let result = '';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let node;

        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) {
                // Skip text nodes that are inside math-container elements
                // (KaTeX creates spans when rendering, but we want the LaTeX source instead)
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
        // If math keyboard is active, grab its content first
        const mkFieldEl = document.getElementById('math-keyboard-field');
        const mkWrapperEl = document.getElementById('math-input-wrapper');
        let mathLatex = '';
        if (mkFieldEl && mkWrapperEl && mkWrapperEl.style.display !== 'none') {
            mathLatex = (mkFieldEl.value || '').trim();
        }

        let messageText = extractMessageText(userInput).trim();

        // Append math-field LaTeX (wrapped for rendering)
        if (mathLatex) {
            messageText = messageText ? messageText + ' \\(' + mathLatex + '\\)' : '\\(' + mathLatex + '\\)';
            mkFieldEl.value = '';
        }

        if (!messageText && attachedFiles.length === 0) return;

        // If math mode is on, deactivate without re-inserting (we already captured the value)
        if (typeof mathModeOn !== 'undefined' && mathModeOn && mkFieldEl) {
            mkFieldEl.value = ''; // already captured
            const mkPanelEl = document.getElementById('math-keyboard-panel');
            const mkHelperEl = document.getElementById('mk-helper-text');
            if (mkPanelEl) mkPanelEl.style.display = 'none';
            if (mkWrapperEl) mkWrapperEl.style.display = 'none';
            if (mkHelperEl) mkHelperEl.style.display = 'none';
            userInput.style.display = '';
            if (openEquationBtn) openEquationBtn.classList.remove('mk-active');
            mathModeOn = false;
        }

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
     * Show a user-friendly rate-limit countdown instead of raw "Too many requests" error.
     * Displays a single message with a live countdown timer and auto-removes when done.
     */
    function showRateLimitCountdown(retryAfterSec, container) {
        if (!container) return;
        // Remove any existing rate-limit banner to avoid duplicates
        const existing = container.querySelector('.rate-limit-countdown');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.className = 'message-container system-error rate-limit-countdown';
        let remaining = retryAfterSec;
        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = s % 60;
            return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
        };
        banner.innerHTML = `<div class="message system-error" style="text-align:center;">
            <i class="fas fa-clock" style="margin-right:6px;"></i>
            <span>You're sending messages too quickly. You can try again in <strong class="rl-timer">${formatTime(remaining)}</strong>.</span>
        </div>`;
        container.appendChild(banner);
        container.scrollTop = container.scrollHeight;

        const timerEl = banner.querySelector('.rl-timer');
        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(interval);
                banner.remove();
                return;
            }
            if (timerEl) timerEl.textContent = formatTime(remaining);
        }, 1000);
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

                response = await csrfFetch(`${chatEndpoint}?stream=true`, {
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

                // Handle rate limiting (429) — show countdown instead of raw error
                if (response.status === 429) {
                    showThinkingIndicator(false);
                    const retryAfterSec = errorData.retryAfter || 60;
                    showRateLimitCountdown(retryAfterSec, chatBox);
                    return;
                }

                const errorMessage = errorData.message || errorData.error || `Server error: ${response.status}`;
                throw new Error(errorMessage);
            }

            // Update free time indicator from response headers (AI processing time only)
            const freeRemainingHeader = response.headers.get('X-Free-Remaining-Seconds');
            if (freeRemainingHeader !== null && typeof updateFreeTimeIndicator === 'function') {
                const remaining = parseInt(freeRemainingHeader, 10);
                if (!isNaN(remaining)) {
                    updateFreeTimeIndicator({ secondsRemaining: remaining, limitReached: remaining <= 0 });
                }
            }

            // Check if response is SSE stream (text/event-stream)
            const contentType = response.headers.get('Content-Type') || '';
            let data;

            if (contentType.includes('text/event-stream')) {
                // Read SSE stream: show words as they arrive
                // Don't create the bubble yet — wait until first chunk arrives
                // to avoid showing a blank pill during pipeline processing.
                let streamRef = null;
                let fullText = '';
                let completeData = null;

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === 'chunk' && event.content) {
                                // Create the bubble on first real content
                                if (!streamRef) {
                                    showThinkingIndicator(false);
                                    streamRef = startStreamingMessage();
                                }
                                fullText += event.content;
                                appendStreamingChunk(streamRef, event.content);
                            } else if (event.type === 'replacement' && event.content) {
                                // Server sent a replacement (e.g., after streaming fallback)
                                if (!streamRef) {
                                    showThinkingIndicator(false);
                                    streamRef = startStreamingMessage();
                                }
                                fullText = event.content;
                                if (streamRef && streamRef.textNode) {
                                    streamRef.textNode.innerHTML = renderMarkdownMath(event.content);
                                }
                            } else if (event.type === 'complete' && event.data) {
                                completeData = event.data;
                            } else if (event.type === 'error') {
                                throw new Error(event.message || 'Stream error');
                            }
                        } catch (parseErr) {
                            if (parseErr.message === 'Stream error' || parseErr.message?.includes('Stream')) throw parseErr;
                            // Ignore malformed SSE lines
                        }
                    }
                }

                // Hide thinking indicator if no chunks arrived
                if (!streamRef) {
                    showThinkingIndicator(false);
                }

                // Use the complete data from the server, or build minimal data from streamed text
                data = completeData || { text: fullText };

                // Finalize the streaming message with the verified text from
                // the server (which ran normalizeLatex) instead of raw chunks
                if (streamRef) {
                    finalizeStreamingMessage(streamRef, data.text || fullText);
                }
            } else {
                // Non-streaming: parse JSON as before
                data = await response.json();
            }

            // Process AI response (same logic as original sendMessage)
            let aiText = data.text || '';
            const wasStreamed = contentType.includes('text/event-stream');
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

            // Only append if we didn't already stream the message into the DOM
            if (!wasStreamed) {
                appendMessage(aiText, "ai", graphData, data.isMasteryQuiz);
            } else if (hasInlineVisuals) {
                // Streaming already inserted the message, but visual commands
                // were processed after finalization. Re-render the streamed
                // message with the visual HTML so graphs/charts appear.
                const messageElements = document.querySelectorAll('.message.ai');
                const latestMessage = messageElements[messageElements.length - 1];
                if (latestMessage) {
                    const textNode = latestMessage.querySelector('.message-text');
                    if (textNode) {
                        textNode.innerHTML = renderMarkdownMath(aiText);
                    }
                }
            }

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

            if (data.drawingSequence && typeof renderDrawing === 'function') {
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

            // Passive sync: courseContext.overallProgress is in every course-chat response.
            // Update the bar even when no signal fired (handles page reloads, drift, etc.)
            if (!data.courseProgress && data.courseContext && data.courseContext.overallProgress != null) {
                const fill = document.getElementById('course-progress-fill');
                const pct  = document.getElementById('course-progress-pct');
                if (fill) fill.style.width = `${data.courseContext.overallProgress}%`;
                if (pct)  pct.textContent  = `${data.courseContext.overallProgress}%`;
            }

            // Lesson progress tracker: update on every course-chat response
            if (data.progressUpdate && window.lessonTracker) {
                window.lessonTracker.update(data.progressUpdate);
            }

            // Smart suggestion chips: prefer server-provided, fall back to client-side detection
            if (data.suggestions && data.suggestions.length > 0 && window.showSuggestions) {
                window._serverSuggestionsProvided = true;
                setTimeout(() => window.showSuggestions(data.suggestions), 500);
            }

        } catch (error) {
            console.error("Chat error:", error);

            let errorMessage = "I'm having trouble connecting.";
            let isRetryable = true;
            if (error.message) {
                if (error.message.includes('Mathpix') || error.message.includes('API credentials')) {
                    errorMessage = "There was an issue processing your file. Our OCR service may be temporarily unavailable.";
                    isRetryable = false; // File-specific errors need a different file
                } else if (error.message.includes('PDF processing failed') || error.message.includes('Image OCR failed')) {
                    errorMessage = `File processing error: ${error.message}`;
                    isRetryable = false;
                } else if (!error.message.includes('Server error')) {
                    errorMessage = error.message;
                }
            }

            // Show error with retry button
            const errorContainer = document.createElement('div');
            errorContainer.className = 'message-container system-error';
            const errorBubble = document.createElement('div');
            errorBubble.className = 'message system-error';
            errorBubble.innerHTML = `<span class="message-text">${errorMessage}</span>`;

            if (isRetryable) {
                const retryBtn = document.createElement('button');
                retryBtn.className = 'retry-btn';
                retryBtn.innerHTML = '<i class="fas fa-redo"></i> Try Again';
                retryBtn.addEventListener('click', () => {
                    errorContainer.remove();
                    queueMessage(queuedMsg.text, queuedMsg.files, queuedMsg.responseTime);
                });
                errorBubble.appendChild(retryBtn);
            }

            errorContainer.appendChild(errorBubble);
            if (chatBox) {
                chatBox.appendChild(errorContainer);
                chatBox.scrollTop = chatBox.scrollHeight;
            }
        } finally {
            showThinkingIndicator(false);
            if (!window._serverSuggestionsProvided) {
                setTimeout(() => showDefaultSuggestions(), 500);
            }
            window._serverSuggestionsProvided = false;
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
                        showToast('Failed to generate share code', 3500);
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

    // --- Equation palette open/close (mobile bottom-sheet aware) ---
    const isMobileView = () => window.innerWidth <= 768;
    let eqBackdrop = null;

    // Store the palette's original parent so we can restore it after mobile close
    const paletteOriginalParent = inlineEquationPalette ? inlineEquationPalette.parentElement : null;
    const paletteOriginalNextSibling = inlineEquationPalette ? inlineEquationPalette.nextElementSibling : null;

    function openEquationPalette() {
        if (!inlineEquationPalette) return;

        // On mobile, move palette to body so it escapes #input-container's
        // stacking context (z-index:100) — otherwise the backdrop (z-index:1000
        // on body) covers the palette and intercepts all taps.
        if (isMobileView()) {
            if (inlineEquationPalette.parentElement !== document.body) {
                document.body.appendChild(inlineEquationPalette);
            }

            if (!eqBackdrop) {
                eqBackdrop = document.createElement('div');
                eqBackdrop.className = 'equation-palette-backdrop';
                eqBackdrop.addEventListener('click', closeEquationPalette);
            }
            document.body.appendChild(eqBackdrop);

            // Disable MathLive virtual keyboard on mobile
            if (window.mathVirtualKeyboard) {
                window.mathVirtualKeyboard.visible = false;
            }
            inlineEquationPalette.querySelectorAll('math-field').forEach(mf => {
                mf.setAttribute('virtual-keyboard-mode', 'off');
            });
        }

        inlineEquationPalette.style.display = 'block';
        const field = getActiveMathField();
        if (field) setTimeout(() => field.focus(), 100);
    }

    function closeEquationPalette() {
        if (inlineEquationPalette) inlineEquationPalette.style.display = 'none';
        if (eqBackdrop && eqBackdrop.parentNode) {
            eqBackdrop.parentNode.removeChild(eqBackdrop);
        }
        // Restore palette to its original position in the DOM
        if (inlineEquationPalette && paletteOriginalParent && inlineEquationPalette.parentElement === document.body) {
            if (paletteOriginalNextSibling) {
                paletteOriginalParent.insertBefore(inlineEquationPalette, paletteOriginalNextSibling);
            } else {
                paletteOriginalParent.appendChild(inlineEquationPalette);
            }
        }
    }

    // Toggle inline palette
    if (openEquationBtn && inlineEquationPalette) {
        openEquationBtn.addEventListener('click', () => {
            const isVisible = inlineEquationPalette.style.display === 'block';
            if (isVisible) closeEquationPalette();
            else openEquationPalette();
        });
    }

    // Close inline palette
    if (closeInlinePaletteBtn) {
        closeInlinePaletteBtn.addEventListener('click', closeEquationPalette);
    }

    // Mobile: swipe-down to dismiss bottom sheet
    if (inlineEquationPalette) {
        let touchStartY = 0;
        let touchCurrentY = 0;

        inlineEquationPalette.addEventListener('touchstart', (e) => {
            // Only track swipe on the header (drag handle area)
            if (!e.target.closest('.equation-palette-header')) return;
            touchStartY = e.touches[0].clientY;
            touchCurrentY = touchStartY;
        }, { passive: true });

        inlineEquationPalette.addEventListener('touchmove', (e) => {
            if (!touchStartY) return;
            touchCurrentY = e.touches[0].clientY;
            const dy = touchCurrentY - touchStartY;
            // Only allow downward swipe
            if (dy > 0) {
                inlineEquationPalette.style.transform = `translateY(${dy}px)`;
            }
        }, { passive: true });

        inlineEquationPalette.addEventListener('touchend', () => {
            if (!touchStartY) {
                // Touch didn't start on the header — ignore
                return;
            }
            const dy = touchCurrentY - touchStartY;
            touchStartY = 0;
            touchCurrentY = 0;
            if (dy > 80) {
                // Swiped down enough — dismiss
                closeEquationPalette();
            }
            // Reset transform
            inlineEquationPalette.style.transform = '';
        }, { passive: true });
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

            closeEquationPalette();
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

                    // Render the math using KaTeX
                    renderMathInElement(mathContainer);

                    equationModal.classList.remove('is-visible');
                }
            });
        }
    }
    
    // ─── Math Keyboard Panel (inline, no overlay) ─────────────────────
    const mkPanel      = document.getElementById('math-keyboard-panel');
    const mkField      = document.getElementById('math-keyboard-field');
    const mkWrapper    = document.getElementById('math-input-wrapper');
    const mkDoneBtn    = document.getElementById('mk-done-btn');
    const mkHelperText = document.getElementById('mk-helper-text');
    const mkTabs       = mkPanel ? mkPanel.querySelectorAll('.mk-tab') : [];
    const mkPages      = mkPanel ? mkPanel.querySelectorAll('.mk-page') : [];
    let   mathModeOn   = false;

    function activateMathMode() {
        if (!mkPanel || !mkField || !mkWrapper || !userInput) return;
        mathModeOn = true;

        // Swap input: hide text input, show math field + wrapper
        userInput.style.display = 'none';
        mkWrapper.style.display = '';
        mkPanel.style.display = '';
        if (mkHelperText) mkHelperText.style.display = '';

        // Close old overlay palette if open
        if (typeof closeEquationPalette === 'function') closeEquationPalette();

        // Blur native keyboard on mobile, then focus math field
        if (window.innerWidth <= 768) {
            document.activeElement?.blur();
            setTimeout(() => mkField.focus(), 50);
        } else {
            mkField.focus();
        }

        // Highlight the √x tool button
        if (openEquationBtn) openEquationBtn.classList.add('mk-active');

        // Default to math tab
        switchMkTab('math');

        // Show first-time tooltip if never seen before
        showMathKeyboardTooltip();
    }

    function deactivateMathMode() {
        if (!mkPanel || !mkField || !mkWrapper || !userInput) return;

        // If math field has content, insert it into chat input before closing
        const latex = mkField.value?.trim();
        if (latex) {
            const mathContainer = document.createElement('span');
            mathContainer.className = 'math-container';
            mathContainer.setAttribute('data-latex', latex);
            mathContainer.textContent = `\\(${latex}\\)`;
            userInput.appendChild(mathContainer);
            userInput.appendChild(document.createTextNode(' '));
            if (typeof renderMathInElement === 'function') renderMathInElement(mathContainer);
            mkField.value = '';
        }

        mathModeOn = false;
        mkWrapper.style.display = 'none';
        mkPanel.style.display = 'none';
        if (mkHelperText) mkHelperText.style.display = 'none';
        userInput.style.display = '';
        userInput.focus();
        if (openEquationBtn) openEquationBtn.classList.remove('mk-active');
    }

    function switchMkTab(tabName) {
        mkTabs.forEach(t => t.classList.toggle('mk-tab-active', t.dataset.tab === tabName));
        mkPages.forEach(p => p.style.display = p.dataset.page === tabName ? '' : 'none');

        if (tabName === 'abc') {
            // Switch back to regular text input
            deactivateMathMode();
        } else {
            // Keep focus on math field when switching between 123 and math tabs
            if (mkField) mkField.focus();
        }
    }

    // Tab clicks
    mkTabs.forEach(tab => {
        tab.addEventListener('click', () => switchMkTab(tab.dataset.tab));
    });

    // Done button: insert equation and return to text mode
    if (mkDoneBtn) {
        mkDoneBtn.addEventListener('click', () => deactivateMathMode());
    }

    // √x tool button: toggle math mode
    if (openEquationBtn) {
        // On mobile, use the new math keyboard instead of the old palette
        openEquationBtn.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                e.stopImmediatePropagation(); // prevent old palette toggle
                if (mathModeOn) deactivateMathMode();
                else activateMathMode();
            }
        }, true); // capture phase to run before old handler
    }

    // Key presses on the math keyboard
    if (mkPanel) {
        mkPanel.addEventListener('click', (e) => {
            const key = e.target.closest('.mk-key');
            if (!key || !mkField) return;

            const insertLatex = key.dataset.insert;
            const command = key.dataset.command;

            if (command) {
                mkField.executeCommand(command);
            } else if (insertLatex) {
                mkField.executeCommand(['insert', insertLatex]);
            }
            mkField.focus();
        });
    }

    // Enter on math field = send, Shift+Enter = stay
    if (mkField) {
        mkField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // First-time tooltip: show once to teach users what the √x button does
    function showMathKeyboardTooltip() {
        const storageKey = 'mk-tooltip-seen';
        try {
            if (localStorage.getItem(storageKey)) return;
            localStorage.setItem(storageKey, '1');
        } catch (e) { return; }

        const tip = document.createElement('div');
        tip.className = 'mk-tooltip';
        tip.innerHTML = 'Tap the buttons below to build your equation. ' +
                        'Use <strong>Numbers</strong> for digits, <strong>Symbols</strong> for math. ' +
                        'Tap <strong>Done</strong> when finished.';

        // Insert above the math keyboard panel
        if (mkPanel && mkPanel.parentElement) {
            mkPanel.parentElement.insertBefore(tip, mkPanel);
        }

        // Auto-dismiss after 6 seconds or on tap
        const dismiss = () => { if (tip.parentElement) tip.remove(); };
        tip.addEventListener('click', dismiss);
        setTimeout(dismiss, 6000);
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
                showToast('When in doubt, draw it out! 📝', 3500);
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
            if (!recognition) {
                showToast('Speech recognition is not supported in this browser. Try Chrome.', 4000);
                return;
            }
            if (isRecognizing) {
                recognition.stop();
                micBtn.classList.remove('mic-recording');
            } else {
                // Manual tap resets network error state so user can retry
                speechNetworkRetries = 0;
                window._speechRecognition.networkErrorActive = false;
                clearTimeout(speechRetryTimer);
                recognition.start();
                isRecognizing = true;
                window._speechRecognition.isActive = true;
                micBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
                micBtn.classList.add('mic-recording');
                micBtn.title = 'Tap to stop recording';
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
            showToast(`Pasted ${files.length} image${files.length > 1 ? 's' : ''}`, 3500);
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

            // Check if this is a teacher resource dragged from the resources panel
            const resourceId = e.dataTransfer.getData('application/x-teacher-resource-id');
            if (resourceId) {
                const resourceName = e.dataTransfer.getData('application/x-teacher-resource-name') || 'Resource';
                fetchAndUploadTeacherResource(resourceId, resourceName);
                return;
            }

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files); // Handle all dropped files
                const fileCount = e.dataTransfer.files.length;
                showToast(`Added ${fileCount} file${fileCount > 1 ? 's' : ''}`, 3500);
                e.dataTransfer.clearData();
            }
        });
    }

    /**
     * Fetch a teacher resource by ID and feed it into the file upload pipeline,
     * exactly as if the student had dragged the PDF file from their computer.
     */
    async function fetchAndUploadTeacherResource(resourceId, resourceName) {
        showToast(`Loading "${resourceName}"...`, 2500);
        try {
            const response = await fetch(`/api/teacher-resources/download/${resourceId}`);
            if (!response.ok) throw new Error(`Server returned ${response.status}`);

            const blob = await response.blob();
            const mimeType = blob.type || 'application/pdf';

            // Build a proper filename — keep the extension if the resource name already has one
            const hasExt = /\.(pdf|png|jpg|jpeg|webp)$/i.test(resourceName);
            const filename = hasExt ? resourceName : `${resourceName}.pdf`;

            const file = new File([blob], filename, { type: mimeType });
            handleFileUpload([file]);
            showToast(`"${resourceName}" added to chat!`, 3500);
        } catch (err) {
            console.error('[TeacherResource] Failed to load resource for drag-drop:', err);
            showToast('Could not load the resource. Try "Ask Tutor About This" instead.', 3500);
        }
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
            showToast('Failed to save reaction', 3500);
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
