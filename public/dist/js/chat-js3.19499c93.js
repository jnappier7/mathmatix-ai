/* --- /js/chat-board-integration.js --- */
// public/js/chat-board-integration.js
// CHAT-BOARD INTEGRATION: The board is the conversation. Chat is just air between sentences.
// Philosophy: If the board disappeared and the lesson still worked, you built a chatbot, not a tutor.

class ChatBoardController {
    constructor() {
        this.chatContainer = null;
        this.chatMessagesContainer = null;
        this.whiteboard = null;

        // State tracking
        this.currentTurn = 'student'; // 'student' | 'teacher'
        this.isTeaching = false; // AI actively teaching on board
        this.chatMinimized = false;
        this.boardIsActive = false;

        // Micro-chat constraints
        this.maxChatLength = 100; // characters - forces concise messages
        this.warningThreshold = 70; // warn AI when approaching limit

        // Spatial anchoring
        this.activeAnchors = new Map(); // messageId -> { targetObjectId, pointerId }
        this.anchorColors = {
            'teacher': '#12B3B3',
            'student': '#3b82f6',
            'error': '#ff6b6b',
            'hint': '#fbbf24'
        };

        console.log('✅ Chat-Board Controller initialized');
    }

    init(whiteboard) {
        this.whiteboard = whiteboard;
        this.chatContainer = document.getElementById('chat-container');
        this.chatMessagesContainer = document.getElementById('chat-messages-container');

        if (!this.chatContainer || !this.chatMessagesContainer) {
            console.warn('[ChatBoard] Chat containers not found');
            return;
        }

        this.setupChatStyles();
        this.setupBoardModeListeners();

        console.log('🎯 Chat-Board integration active');
    }

    // ============================================
    // CHAT LAYOUT MANAGEMENT
    // ============================================

    setupChatStyles() {
        // Ensure chat can collapse to minimal state
        if (!this.chatContainer) return;

        // Add data attributes for state management
        this.chatContainer.dataset.boardActive = 'false';
        this.chatContainer.dataset.minimized = 'false';

        // Add transition for smooth collapse
        this.chatContainer.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
    }

    /**
     * Auto-minimize chat when board teaching starts
     * Board takes 70% space, chat collapses to 30%
     */
    minimizeChat(animated = true) {
        if (this.chatMinimized) return;

        this.chatMinimized = true;
        this.chatContainer.dataset.minimized = 'true';

        // Collapse chat visually
        if (animated) {
            this.chatContainer.style.maxHeight = '30vh';
            this.chatContainer.style.opacity = '0.7';
        } else {
            this.chatContainer.style.maxHeight = '30vh';
            this.chatContainer.style.opacity = '0.7';
        }

        console.log('📉 Chat minimized - board is teaching');
    }

    /**
     * Restore chat when board teaching ends
     */
    expandChat(animated = true) {
        if (!this.chatMinimized) return;

        this.chatMinimized = false;
        this.chatContainer.dataset.minimized = 'false';

        if (animated) {
            this.chatContainer.style.maxHeight = '';
            this.chatContainer.style.opacity = '1';
        } else {
            this.chatContainer.style.maxHeight = '';
            this.chatContainer.style.opacity = '1';
        }

        console.log('📈 Chat expanded - student interaction');
    }

    /**
     * Pulse chat to draw attention (subtle, no dopamine abuse)
     */
    pulseChat() {
        if (!this.chatContainer) return;

        this.chatContainer.style.animation = 'gentle-pulse 0.5s ease';
        setTimeout(() => {
            this.chatContainer.style.animation = '';
        }, 500);
    }

    // ============================================
    // TURN-BASED INTERACTION
    // ============================================

    setupBoardModeListeners() {
        if (!this.whiteboard) return;

        // Listen for board mode changes
        const originalSetBoardMode = this.whiteboard.setBoardMode.bind(this.whiteboard);
        this.whiteboard.setBoardMode = (mode) => {
            originalSetBoardMode(mode);
            this.onBoardModeChange(mode);
        };

        // Listen for AI teaching behaviors
        this.setupTeachingListeners();
    }

    onBoardModeChange(mode) {
        console.log(`[ChatBoard] Board mode changed to: ${mode}`);

        if (mode === 'teacher') {
            this.currentTurn = 'teacher';
            this.isTeaching = true;
            this.boardIsActive = true;
            this.chatContainer.dataset.boardActive = 'true';
            this.minimizeChat(true);
        } else if (mode === 'student') {
            this.currentTurn = 'student';
            this.isTeaching = false;
            this.expandChat(true);
            // Pulse to invite interaction if needed
            if (this.boardIsActive) {
                this.pulseChat();
            }
        } else if (mode === 'collaborative') {
            // Stay in current state but allow switching
            this.expandChat(true);
        }
    }

    setupTeachingListeners() {
        // Hook into AI writing methods
        if (!this.whiteboard) return;

        const originalAIWrite = this.whiteboard.aiWritePartialStep.bind(this.whiteboard);
        this.whiteboard.aiWritePartialStep = async (text, x, y, pauseAfter) => {
            this.onAIStartsWriting();
            const result = await originalAIWrite(text, x, y, pauseAfter);
            this.onAIFinishesWriting();
            return result;
        };
    }

    onAIStartsWriting() {
        this.isTeaching = true;
        this.minimizeChat(true);
    }

    onAIFinishesWriting() {
        // Stay minimized during pause - silence is teaching
        // Will expand when mode changes to student
    }

    // ============================================
    // MICRO-CHAT CONSTRAINTS
    // ============================================

    /**
     * Enforce one-line, one-thought chat messages
     * Returns true if message passes constraints, false otherwise
     */
    validateChatMessage(text, type = 'ai') {
        if (!text) return false;

        const cleanText = text.replace(/\[.*?\]/g, '').trim(); // Remove markup
        const length = cleanText.length;

        // Check length constraint
        if (length > this.maxChatLength) {
            console.warn(`[ChatBoard] Message too long (${length}/${this.maxChatLength}): "${cleanText.substring(0, 50)}..."`);
            return false;
        }

        // Check for paragraph breaks (should be single thought)
        const lines = cleanText.split('\n').filter(l => l.trim());
        if (lines.length > 3) {
            console.warn('[ChatBoard] Message contains too many lines (should be 1-3)');
            return false;
        }

        return true;
    }

    /**
     * Format chat message to be concise and board-anchored
     */
    formatMicroChat(text, anchorTarget = null) {
        // Note: No truncation - AI should follow system instructions for conciseness
        return {
            text: text,
            anchorTarget: anchorTarget,
            timestamp: Date.now()
        };
    }

    /**
     * Suggested micro-chat templates for AI
     * These are examples of good chat messages
     */
    getMicroChatTemplates() {
        return {
            invite: [
                "Your turn.",
                "What comes next?",
                "Try it on the board.",
                "Your move."
            ],
            hint: [
                "Look at the sign.",
                "What cancels this?",
                "Check that step.",
                "Notice the pattern?"
            ],
            pause: [
                "Pause.",
                "See it?",
                "Watch this.",
                "One sec."
            ],
            redirect: [
                "Look here.",
                "Check the board.",
                "Try again here.",
                "Different approach?"
            ],
            praise: [
                "Nice.",
                "Good thinking.",
                "You got it.",
                "Exactly."
            ],
            error: [
                "Check this move.",
                "Not quite.",
                "Look again.",
                "Close, but..."
            ]
        };
    }

    // ============================================
    // SPATIAL ANCHORING
    // ============================================

    /**
     * Create visual anchor from chat message to board object
     * Every chat message must point to something specific
     */
    createSpatialAnchor(messageId, targetObjectId, anchorType = 'teacher') {
        if (!this.whiteboard || !this.whiteboard.semanticObjects.has(targetObjectId)) {
            console.warn(`[ChatBoard] Cannot anchor - object ${targetObjectId} not found`);
            return null;
        }

        const obj = this.whiteboard.semanticObjects.get(targetObjectId);
        const fabricObj = obj.fabricObject;

        // PHASE 2: Use enhanced visual pointer lines if available
        let pointer = null;
        const messageElement = document.getElementById(messageId);

        if (this.whiteboard.phase2 && this.whiteboard.phase2.createPointerLine && messageElement) {
            // Use Phase 2 enhanced pointer lines
            pointer = this.whiteboard.phase2.createPointerLine(messageElement, targetObjectId, anchorType);
        } else {
            // Fallback to basic pointer
            pointer = this.createPointerElementFallback(fabricObj, anchorType);
        }

        // Store anchor
        this.activeAnchors.set(messageId, {
            targetObjectId: targetObjectId,
            pointerId: pointer ? pointer.path?.id || pointer.id : null,
            type: anchorType,
            pointerRef: pointer
        });

        // Add subtle highlight to object
        this.whiteboard.highlightObject(targetObjectId, this.anchorColors[anchorType], 3000);

        console.log(`🎯 Created spatial anchor: message -> ${targetObjectId}`);

        return pointer;
    }

    createPointerElementFallback(fabricObj, anchorType) {
        // Fallback pointer (basic version)
        const pointer = document.createElement('div');
        pointer.className = 'spatial-anchor-pointer';
        pointer.style.cssText = `
            position: absolute;
            width: 3px;
            background: ${this.anchorColors[anchorType]};
            opacity: 0.6;
            pointer-events: none;
            z-index: 9999;
            transition: opacity 0.3s ease;
        `;
        pointer.id = `pointer-${Date.now()}-${Math.random()}`;

        // Position calculation would happen here
        document.body.appendChild(pointer);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            pointer.style.opacity = '0';
            setTimeout(() => pointer.remove(), 300);
        }, 3000);

        return pointer;
    }

    /**
     * Remove spatial anchor when message is no longer active
     */
    removeSpatialAnchor(messageId) {
        const anchor = this.activeAnchors.get(messageId);
        if (!anchor) return;

        const pointer = document.getElementById(anchor.pointerId);
        if (pointer) {
            pointer.style.opacity = '0';
            setTimeout(() => pointer.remove(), 300);
        }

        this.activeAnchors.delete(messageId);
    }

    // ============================================
    // CHAT MESSAGE ENHANCEMENT
    // ============================================

    /**
     * Enhance chat message with board context
     * Called after appendMessage in script.js
     */
    enhanceChatMessage(messageElement, sender, boardContext = null) {
        if (sender !== 'ai') return;

        // Add board-reference class
        if (boardContext && boardContext.targetObjectId) {
            messageElement.classList.add('board-anchored');
            messageElement.dataset.anchorTarget = boardContext.targetObjectId;

            // Create spatial anchor
            this.createSpatialAnchor(messageElement.id, boardContext.targetObjectId, boardContext.type || 'teacher');
        }

        // Add click handler to highlight referenced object
        if (boardContext && boardContext.targetObjectId) {
            messageElement.style.cursor = 'pointer';
            messageElement.addEventListener('click', () => {
                this.whiteboard.highlightObject(boardContext.targetObjectId, this.anchorColors.teacher, 2000);

                // Also open whiteboard if closed
                if (this.whiteboard.panel.classList.contains('is-hidden')) {
                    this.whiteboard.show();
                }
            });
        }
    }

    // ============================================
    // PUBLIC API FOR AI INTEGRATION
    // ============================================

    /**
     * Check if AI should use chat or board
     * Returns 'board' if board should be primary, 'chat' otherwise
     */
    getPreferredMedium(context = {}) {
        const { messageType, hasVisualElement, isError, needsExplanation } = context;

        // Errors: Board first (visual highlight), then micro-chat
        if (isError) return 'board';

        // Visual elements: Always board
        if (hasVisualElement) return 'board';

        // Explanations: Board if it can be shown visually
        if (needsExplanation && messageType !== 'concept-check') return 'board';

        // Concept checks, reflections: Chat is appropriate
        if (messageType === 'concept-check' || messageType === 'reflection') return 'chat';

        // Default: Board first
        return 'board';
    }

    /**
     * Prevent student from abusing chat as shortcut
     * Block "What's the next step?" type questions
     */
    validateStudentMessage(text) {
        const lowerText = text.toLowerCase();

        // Block shortcut-seeking patterns
        const shortcutPatterns = [
            /what'?s the next step/i,
            /tell me the answer/i,
            /just give me/i,
            /what do i do next/i,
            /how do i solve this/i
        ];

        for (const pattern of shortcutPatterns) {
            if (pattern.test(lowerText)) {
                console.log('[ChatBoard] Blocked shortcut-seeking message');
                return {
                    valid: false,
                    redirectMessage: "Try working through it on the board. I'll guide you step by step."
                };
            }
        }

        return { valid: true };
    }

    // ============================================
    // SYSTEM PROMPT INTEGRATION
    // ============================================

    /**
     * Get system prompt rules for AI behavior
     * This should be included in the AI's context
     */
    getSystemPromptRules() {
        return `
# CHAT-BOARD INTERACTION RULES

## Core Principle
The whiteboard IS the conversation. Chat messages are minimal air between sentences.
If the student is reading more than watching, the UX is failing.

## Chat Message Constraints
- Maximum length: ${this.maxChatLength} characters
- One line, one thought, one purpose
- Examples: "Your turn.", "What cancels this?", "Check that step."
- NO essays. NO step-by-step novels. NO paragraphs.

## When to Use Chat vs Board
1. **Teaching/Showing**: BOARD (write, circle, arrow)
2. **Hints**: BOARD first (visual), then micro-chat if needed
3. **Errors**: BOARD (highlight, circle), then micro-chat: "Check this move."
4. **Invitations**: Micro-chat after board action: "Your turn."
5. **Concept checks**: Chat (between board phases)
6. **Reflection**: Chat (after problem complete)

## Spatial Anchoring Required
Every chat message MUST reference something specific on the board.
Use [BOARD_REF:objectId] to link messages to board objects.
Examples:
- "Check that step." [BOARD_REF:eq_2]
- "What cancels this?" [BOARD_REF:eq_1]

## Turn-Based Rules
1. AI writes on board → pauses → "Your turn" → waits
2. Student writes → AI stays silent → Student commits
3. AI responds visually first, chat second
4. No interrupting student's board work

## Error Handling Sequence
1. Highlight mistake visually on board
2. Pause (silence is teaching)
3. Micro-chat: "Check this move."
4. Only explain if student asks or stalls

## Forbidden Patterns
- Never answer "What's the next step?" directly
- Never solve in chat what should be shown on board
- Never send multi-paragraph explanations
- Never use chat when board would be clearer

## Default State
Most of the time: Silent writing. No narration. The board speaks.
`;
    }
}

// ============================================
// GLOBAL INITIALIZATION
// ============================================

// Initialize when whiteboard is ready
window.ChatBoardController = ChatBoardController;

// Create global instance
window.chatBoardController = null;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for whiteboard to be initialized
    const checkWhiteboard = setInterval(() => {
        if (window.whiteboard && window.whiteboard.canvas) {
            window.chatBoardController = new ChatBoardController();
            window.chatBoardController.init(window.whiteboard);
            clearInterval(checkWhiteboard);
            console.log('✅ Chat-Board Controller ready');
        }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkWhiteboard), 10000);
});

// ============================================
// CSS INJECTION
// ============================================

const chatBoardStyles = document.createElement('style');
chatBoardStyles.textContent = `
/* Chat-Board Integration Styles */

/* Chat container collapse animation */
#chat-container[data-minimized="true"] {
    max-height: 30vh !important;
    opacity: 0.7 !important;
}

#chat-container[data-board-active="true"] {
    transition: max-height 0.3s ease, opacity 0.3s ease;
}

/* Gentle pulse animation */
@keyframes gentle-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
}

/* Board-anchored messages */
.message.board-anchored {
    border-left: 3px solid #12B3B3;
    position: relative;
    cursor: pointer;
    transition: background 0.2s ease;
}

.message.board-anchored:hover {
    background: rgba(18, 179, 179, 0.05);
}

.message.board-anchored::before {
    content: "📍";
    position: absolute;
    left: -20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    opacity: 0.6;
}

/* Spatial anchor pointers */
.spatial-anchor-pointer {
    animation: anchor-fade-in 0.3s ease;
}

@keyframes anchor-fade-in {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 0.6;
        transform: translateY(0);
    }
}

/* Board priority indicator */
#chat-container::before {
    content: "💬";
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 16px;
    opacity: 0.3;
    transition: opacity 0.3s ease;
    pointer-events: none;
}

#chat-container[data-board-active="true"]::before {
    content: "✏️";
    opacity: 0.6;
}
`;

document.head.appendChild(chatBoardStyles);

console.log('📋 Chat-Board integration styles loaded');

;
/* --- /js/floating-screener.js --- */
/**
 * FLOATING CAT SCREENER MODULE
 *
 * A draggable, resizable floating module for the adaptive placement test.
 * Moves the screener out of chat and into a dedicated UI component.
 */

class FloatingScreener {
  constructor() {
    this.container = document.getElementById('floating-screener');
    this.dragHandle = document.getElementById('screener-drag-handle');
    this.closeBtn = document.getElementById('close-screener-btn');
    this.sidebarBtn = document.getElementById('sidebar-starting-point-btn');

    // Screens
    this.instructionScreen = document.getElementById('screener-instruction-screen');
    this.questionScreen = document.getElementById('screener-question-screen');
    this.loadingScreen = document.getElementById('screener-loading-screen');
    this.resultsScreen = document.getElementById('screener-results-screen');

    // State
    this.isOpen = false;
    this.sessionId = null;
    this.currentProblem = null;
    this.selectedAnswer = null;
    this.submitting = false;
    this.textSize = 'medium'; // small, medium, large, xlarge

    // Drag state
    this.isDragging = false;
    this.currentX = 0;
    this.currentY = 0;
    this.initialX = 0;
    this.initialY = 0;
    this.xOffset = 0;
    this.yOffset = 0;

    // Assessment completed state
    this.assessmentCompleted = false;

    this.init();
  }

  init() {
    if (!this.container) {
      console.warn('[FloatingScreener] Container not found, skipping init');
      return;
    }

    this.setupEventListeners();
    this.checkAssessmentStatus();

    console.log('[FloatingScreener] Initialized');
  }

  setupEventListeners() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Sidebar button
    if (this.sidebarBtn) {
      this.sidebarBtn.addEventListener('click', () => this.open());
    }

    // Drag functionality
    if (this.dragHandle) {
      this.dragHandle.addEventListener('mousedown', (e) => this.dragStart(e));
      this.dragHandle.addEventListener('touchstart', (e) => this.dragStart(e));
    }

    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('touchmove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.dragEnd());
    document.addEventListener('touchend', () => this.dragEnd());

    // Text size controls
    const textSmaller = document.getElementById('screener-text-smaller');
    const textLarger = document.getElementById('screener-text-larger');

    if (textSmaller) {
      textSmaller.addEventListener('click', () => this.changeTextSize(-1));
    }
    if (textLarger) {
      textLarger.addEventListener('click', () => this.changeTextSize(1));
    }

    // Instruction screen buttons
    const startBtn = document.getElementById('screener-start-btn');
    const waitBtn = document.getElementById('screener-wait-btn');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startAssessment());
    }
    if (waitBtn) {
      waitBtn.addEventListener('click', () => this.close());
    }

    // Submit answer button
    const submitBtn = document.getElementById('screener-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer());
    }

    // Skip skill button
    const skipBtn = document.getElementById('screener-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion());
    }

    // Results continue button
    const continueBtn = document.getElementById('screener-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.finishAssessment());
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      // Escape to close
      if (e.key === 'Escape') {
        this.close();
        return;
      }

      // Only handle shortcuts on question screen
      if (!this.questionScreen?.classList.contains('active')) return;
      if (this.submitting) return;

      // A-F to select MC option (auto-submits via selectOption)
      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', 'E', 'F'].includes(key)) {
        const option = document.querySelector(`.mc-option[data-value="${key}"]`);
        if (option) {
          this.selectOption(option);
          e.preventDefault();
        }
      }
    });
  }

  async checkAssessmentStatus() {
    try {
      const response = await window.csrfFetch('/api/screener/status', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.assessmentCompleted = data.assessmentCompleted;
        this.startingPointOffered = data.startingPointOffered;
        this.assessmentExpired = data.assessmentExpired;
        this.growthCheckDue = data.growthCheckDue;
        this.currentGradeLevel = data.currentGradeLevel;
        this.updateSidebarButton();
      }
    } catch (error) {
      console.warn('[FloatingScreener] Could not check assessment status:', error);
    }
  }

  updateSidebarButton() {
    if (!this.sidebarBtn) return;

    // Reset classes
    this.sidebarBtn.classList.remove('needs-attention', 'completed', 'growth-due', 'expired');

    if (!this.assessmentCompleted || this.assessmentExpired) {
      // Needs initial assessment (or assessment expired - annual renewal)
      this.sidebarBtn.style.display = '';
      this.sidebarBtn.classList.add('needs-attention');
      this.sidebarBtn.title = this.assessmentExpired
        ? 'Starting Point - Annual renewal due'
        : 'Starting Point - Find your level';

      // Update button text
      const spanEl = this.sidebarBtn.querySelector('span');
      if (spanEl) {
        spanEl.textContent = 'Starting Point';
      }

      // The Tools section is collapsed by default, which hides this button.
      // The greeting tells new students to use the Starting Point button "in
      // the sidebar", so make sure it's actually visible there.
      this.revealInSidebar();
    } else if (this.growthCheckDue) {
      // Growth check is available (every 3 months)
      this.sidebarBtn.style.display = '';
      this.sidebarBtn.classList.add('growth-due');
      this.sidebarBtn.title = `Growth Check available - See how you've grown! (Current: ${this.currentGradeLevel || 'Unknown'})`;

      // Update button text
      const spanEl = this.sidebarBtn.querySelector('span');
      if (spanEl) {
        spanEl.textContent = 'Growth Check';
      }

      this.revealInSidebar();
    } else {
      // Assessment completed, not expired, growth check not due - hide the button
      this.sidebarBtn.style.display = 'none';
    }
  }

  // Make sure the sidebar's collapsible "Tools" section is open so the
  // Starting Point / Growth Check button is actually visible. Prefer the
  // Sidebar instance (keeps its internal state in sync); fall back to toggling
  // the DOM classes directly in case the sidebar isn't ready yet.
  revealInSidebar() {
    if (window.sidebar && typeof window.sidebar.expandTools === 'function') {
      window.sidebar.expandTools();
      return;
    }

    const toolsContent = document.getElementById('sidebar-tools');
    const toolsToggle = document.querySelector('.tools-toggle');
    if (toolsContent) toolsContent.classList.add('expanded');
    if (toolsToggle) toolsToggle.classList.add('expanded');
  }

  open() {
    // Determine what mode we're in
    if (this.growthCheckDue) {
      // Growth Check mode (quarterly)
      this.isGrowthCheck = true;
      this.showInstructions('growth-check');
    } else if (!this.assessmentCompleted || this.assessmentExpired) {
      // New assessment (first time) or expired (annual renewal)
      this.isGrowthCheck = false;
      this.showInstructions('starting-point');
    } else {
      // Assessment completed, not expired, no growth check due — block access
      return;
    }

    this.container.classList.add('active');
    this.isOpen = true;
    this.centerModule();
  }

  close() {
    this.container.classList.remove('active');
    this.isOpen = false;
    this.sessionId = null;
    this.currentProblem = null;
    this.selectedAnswer = null;
    this.submitting = false;
  }

  centerModule() {
    // On mobile, no transform needed (full-screen)
    if (window.innerWidth <= 768) {
      this.container.style.transform = 'none';
    } else {
      this.container.style.transform = 'translate(-50%, -50%)';
    }
    this.xOffset = 0;
    this.yOffset = 0;
  }

  // Drag functionality
  dragStart(e) {
    // Disable drag on mobile (full-screen mode)
    if (window.innerWidth <= 768) return;

    if (e.type === 'touchstart') {
      this.initialX = e.touches[0].clientX - this.xOffset;
      this.initialY = e.touches[0].clientY - this.yOffset;
    } else {
      this.initialX = e.clientX - this.xOffset;
      this.initialY = e.clientY - this.yOffset;
    }

    if (e.target === this.dragHandle || this.dragHandle.contains(e.target)) {
      this.isDragging = true;
    }
  }

  drag(e) {
    if (!this.isDragging) return;

    e.preventDefault();

    if (e.type === 'touchmove') {
      this.currentX = e.touches[0].clientX - this.initialX;
      this.currentY = e.touches[0].clientY - this.initialY;
    } else {
      this.currentX = e.clientX - this.initialX;
      this.currentY = e.clientY - this.initialY;
    }

    this.xOffset = this.currentX;
    this.yOffset = this.currentY;

    this.container.style.transform = `translate(calc(-50% + ${this.currentX}px), calc(-50% + ${this.currentY}px))`;
  }

  dragEnd() {
    this.isDragging = false;
  }

  // Text size
  changeTextSize(direction) {
    const sizes = ['small', 'medium', 'large', 'xlarge'];
    const currentIndex = sizes.indexOf(this.textSize);
    const newIndex = Math.max(0, Math.min(sizes.length - 1, currentIndex + direction));

    this.textSize = sizes[newIndex];

    const body = document.getElementById('screener-body');
    if (body) {
      body.className = 'screener-body text-size-' + this.textSize;
    }

    // Update button states
    document.getElementById('screener-text-smaller')?.classList.toggle('disabled', newIndex === 0);
    document.getElementById('screener-text-larger')?.classList.toggle('disabled', newIndex === sizes.length - 1);
  }

  // Screen management
  showScreen(screenName) {
    // Hide all screens
    [this.instructionScreen, this.questionScreen, this.loadingScreen, this.resultsScreen].forEach(screen => {
      if (screen) screen.classList.remove('active');
    });

    // Show requested screen
    switch (screenName) {
      case 'instruction':
        if (this.instructionScreen) this.instructionScreen.classList.add('active');
        break;
      case 'question':
        if (this.questionScreen) this.questionScreen.classList.add('active');
        break;
      case 'loading':
        if (this.loadingScreen) this.loadingScreen.classList.add('active');
        break;
      case 'results':
        if (this.resultsScreen) this.resultsScreen.classList.add('active');
        break;
    }
  }

  showInstructions(mode = 'starting-point') {
    this.showScreen('instruction');

    // Update instruction screen content based on mode
    const titleEl = document.querySelector('#screener-instruction-screen h2');
    const subtitleEl = document.querySelector('#screener-instruction-screen .subtitle');
    const whatIsEl = document.querySelector('#screener-instruction-screen .instruction-card h3');
    const descriptionEl = document.querySelector('#screener-instruction-screen .instruction-card p');
    const durationEl = document.querySelector('#screener-instruction-screen .duration span');
    const headerTitleEl = document.querySelector('.screener-title');

    if (mode === 'growth-check') {
      // Growth Check mode - shorter, focused assessment
      if (titleEl) titleEl.textContent = 'Growth Check';
      if (subtitleEl) subtitleEl.textContent = `Let's see how much you've grown since ${this.currentGradeLevel || 'your last assessment'}!`;
      if (whatIsEl) whatIsEl.innerHTML = '<i class="fas fa-chart-line"></i> What is this?';
      if (descriptionEl) descriptionEl.innerHTML = `This is a shorter assessment to measure your progress. We'll focus on skills you've been working on recently. <strong>There's no penalty for wrong answers</strong> - we just want to see how you've grown!`;
      if (durationEl) durationEl.innerHTML = '<strong>Time:</strong> Usually 5-15 minutes';
      if (headerTitleEl) headerTitleEl.innerHTML = '<i class="fas fa-chart-line"></i> Growth Check';
    } else {
      // Starting Point mode - full initial assessment
      if (titleEl) titleEl.textContent = 'Find Your Starting Point';
      if (subtitleEl) subtitleEl.textContent = "Let's figure out where you are, so we can help you get where you're going.";
      if (whatIsEl) whatIsEl.innerHTML = '<i class="fas fa-info-circle"></i> What is this?';
      if (descriptionEl) descriptionEl.innerHTML = `This short assessment helps us understand your current math level. It's <strong>not a test you can fail</strong> - we're just finding the best place to start your learning journey.`;
      if (durationEl) durationEl.innerHTML = '<strong>Time:</strong> Usually 10-30 minutes, depending on your level';
      if (headerTitleEl) headerTitleEl.innerHTML = '<i class="fas fa-crosshairs"></i> Starting Point';
    }
  }

  showLoading(message = 'Loading...') {
    const loadingText = document.getElementById('screener-loading-text');
    if (loadingText) {
      loadingText.textContent = message;
    }
    this.showScreen('loading');
  }

  // Utility: wait for a duration
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Flash the question card border green for correct answers
  flashCard(type) {
    return new Promise(resolve => {
      const card = document.querySelector('.question-card');
      if (!card) { resolve(); return; }

      card.classList.add(`flash-${type}`);
      setTimeout(() => {
        card.classList.remove(`flash-${type}`);
        resolve();
      }, 400);
    });
  }

  // Fetch next problem without showing a loading screen
  async fetchNextProblem() {
    const response = await window.csrfFetch(`/api/screener/next-problem?sessionId=${this.sessionId}`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get problem');
    }

    return data;
  }

  // Update progress bar from submit-answer response
  updateProgressBar(progress) {
    if (!progress) return;

    const fill = document.getElementById('screener-progress-fill');
    if (fill) {
      fill.style.width = `${progress.percentComplete || 0}%`;
    }
  }

  // Lock/unlock answer controls during submit
  setControlsLocked(locked) {
    const submitBtn = document.getElementById('screener-submit-btn');
    const skipBtn = document.getElementById('screener-skip-btn');
    if (submitBtn) submitBtn.disabled = locked;
    if (skipBtn) skipBtn.disabled = locked;

    // Disable MC option clicks
    document.querySelectorAll('.mc-option').forEach(opt => {
      opt.style.pointerEvents = locked ? 'none' : '';
    });
  }

  // Assessment flow
  async startAssessment() {
    this.showLoading(this.isGrowthCheck ? 'Starting growth check...' : 'Starting assessment...');

    try {
      const response = await window.csrfFetch('/api/screener/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          restart: this.assessmentCompleted && !this.isGrowthCheck,
          isGrowthCheck: this.isGrowthCheck
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.alreadyCompleted) {
          alert('You have already completed your assessment. Your results are saved.');
          this.close();
          return;
        }
        throw new Error(data.error || 'Failed to start assessment');
      }

      this.sessionId = data.sessionId;
      console.log('[FloatingScreener] Assessment started, sessionId:', this.sessionId);

      // Get first problem (loading spinner is already visible)
      const nextData = await this.fetchNextProblem();
      this.currentProblem = nextData.problem;
      this.selectedAnswer = null;
      this.renderProblem(nextData.problem);
      this.showScreen('question');

    } catch (error) {
      console.error('[FloatingScreener] Error starting assessment:', error);
      alert('Failed to start assessment. Please try again.');
      this.showInstructions();
    }
  }

  renderProblem(problem) {
    // Question number
    const questionNum = document.getElementById('screener-question-num');
    if (questionNum) {
      questionNum.textContent = `Question ${problem.questionNumber}`;
    }

    // Question content — render through the full markdown+KaTeX pipeline
    const questionContent = document.getElementById('screener-question-content');
    if (questionContent) {
      const formatted = this.formatProblemContent(problem.content);
      questionContent.innerHTML = window.renderMarkdownMath
        ? window.renderMarkdownMath(formatted)
        : formatted;
    }

    // Render options for MC questions
    const optionsContainer = document.getElementById('screener-options-container');
    if (optionsContainer && problem.answerType === 'multiple-choice' && problem.options) {
      const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
      optionsContainer.innerHTML = problem.options.map((option, index) => {
        // Handle both {label, text} format and plain string options
        const label = option.label || labels[index] || String.fromCharCode(65 + index);
        const text = option.text || option || '';
        return `
          <div class="mc-option" data-value="${label}" data-index="${index}">
            <span class="mc-option-label">${label}</span>
            <span class="mc-option-text">${this.formatOptionText(text)}</span>
          </div>
        `;
      }).join('');

      // Render math in option text through the full KaTeX pipeline
      if (window.renderMarkdownMath) {
        optionsContainer.querySelectorAll('.mc-option-text').forEach(span => {
          span.innerHTML = window.renderMarkdownMath(span.textContent);
        });
      }

      // Add click handlers
      optionsContainer.querySelectorAll('.mc-option').forEach(option => {
        option.addEventListener('click', () => this.selectOption(option));
      });

      optionsContainer.style.display = 'flex';

      // Hide submit button for MC — tap to answer
      const submitBtn = document.getElementById('screener-submit-btn');
      if (submitBtn) submitBtn.style.display = 'none';
    } else if (optionsContainer) {
      // Fallback for non-MC — show text input with submit button
      optionsContainer.innerHTML = `
        <input type="text" id="screener-answer-input" class="form-input" placeholder="Type your answer..." />
      `;
      optionsContainer.style.display = 'block';

      const submitBtn = document.getElementById('screener-submit-btn');
      if (submitBtn) {
        submitBtn.style.display = '';
        submitBtn.disabled = true;
      }

      // Enable submit when they type something
      const input = document.getElementById('screener-answer-input');
      if (input) {
        input.addEventListener('input', () => this.updateSubmitButton());
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            this.selectedAnswer = input.value.trim();
            this.submitAnswer();
          }
        });
      }
    }

    // Fallback: catch any remaining raw \( \) in text nodes
    if (window.renderMathInElement) {
      if (questionContent) window.renderMathInElement(questionContent);
      if (optionsContainer) window.renderMathInElement(optionsContainer);
    }
  }

  formatProblemContent(content) {
    if (!content) return '';

    // Escape HTML but preserve LaTeX
    let formatted = content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown-style bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Auto-wrap math expressions in LaTeX delimiters if not already wrapped
    // This handles content like "2^3 × 2^1" that should render as math
    if (!formatted.includes('\\(') && !formatted.includes('$')) {
      // Detect if content has math-like patterns
      const hasMathPatterns = /[\^_]|\d+\/\d+|×|÷|√|∑|∫|π|θ/.test(formatted);

      if (hasMathPatterns) {
        // Wrap the math portion in LaTeX delimiters
        // Replace common patterns with LaTeX equivalents
        formatted = formatted
          // Wrap expressions with exponents: 2^3, 3^x, x^2, 5x^2
          .replace(/(\w+)\^(\w+)/g, '\\($1^{$2}\\)')
          // Handle multiplication symbol
          .replace(/×/g, '\\times ')
          // Handle division symbol
          .replace(/÷/g, '\\div ')
          // Handle fractions like 1/2 (but not dates like 1/15)
          .replace(/(\d+)\/(\d+)(?!\d)/g, '\\(\\frac{$1}{$2}\\)')
          // Square root
          .replace(/√(\d+)/g, '\\(\\sqrt{$1}\\)');
      }
    }

    return formatted;
  }

  formatOptionText(text) {
    if (!text) return '';
    let formatted = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Auto-wrap math expressions in LaTeX delimiters for options too
    if (!formatted.includes('\\(') && !formatted.includes('$')) {
      const hasMathPatterns = /[\^_]|\d+\/\d+|×|÷|√/.test(formatted);
      if (hasMathPatterns) {
        formatted = formatted
          .replace(/(\w+)\^(\w+)/g, '\\($1^{$2}\\)')
          .replace(/×/g, '\\(\\times\\)')
          .replace(/÷/g, '\\(\\div\\)')
          .replace(/(\d+)\/(\d+)(?!\d)/g, '\\(\\frac{$1}{$2}\\)')
          .replace(/√(\d+)/g, '\\(\\sqrt{$1}\\)');
      }
    }
    return formatted;
  }

  selectOption(optionElement) {
    if (this.submitting) return;

    // Remove selection from all options
    document.querySelectorAll('.mc-option').forEach(opt => {
      opt.classList.remove('selected');
    });

    // Select this option
    optionElement.classList.add('selected');
    this.selectedAnswer = optionElement.dataset.value;

    // Auto-submit for MC — no extra click needed
    this.submitAnswer();
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('screener-submit-btn');
    if (!submitBtn) return;

    const hasAnswer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;
    submitBtn.disabled = !hasAnswer;
  }

  async submitAnswer() {
    const answer = this.selectedAnswer || document.getElementById('screener-answer-input')?.value;

    if (!answer || this.submitting) return;

    this.submitting = true;
    this.setControlsLocked(true);

    try {
      const response = await window.csrfFetch('/api/screener/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          problemId: this.currentProblem.problemId,
          answer: answer,
          responseTime: null
        })
      });

      if (!response.ok) {
        let errorMsg = 'Failed to submit answer';
        if (response.status === 429) {
          errorMsg = 'Too many requests. Please wait a moment and try again.';
        } else {
          try { const err = await response.json(); errorMsg = err.error || errorMsg; } catch {}
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      console.log('[FloatingScreener] Answer submitted:', data.correct ? 'correct' : 'miss');

      // Update progress bar
      this.updateProgressBar(data.progress);

      if (data.nextAction === 'continue') {
        // Start fetching next problem NOW (runs in parallel with flash)
        const nextProblemPromise = this.fetchNextProblem();

        // Green flash for correct, brief neutral pause for miss
        if (data.correct) {
          await this.flashCard('correct');
        } else {
          await this.wait(200);
        }

        // Render the prefetched problem (or wait if still loading)
        try {
          const nextData = await nextProblemPromise;
          this.currentProblem = nextData.problem;
          this.selectedAnswer = null;
          this.renderProblem(nextData.problem);
          this.showScreen('question');
        } catch (fetchError) {
          console.error('[FloatingScreener] Error prefetching next problem:', fetchError);
          alert('Failed to load next question. Please try again.');
          this.close();
        }

      } else if (data.nextAction === 'complete') {
        // Flash green for a correct final answer
        if (data.correct) {
          await this.flashCard('correct');
        }
        this.showResults(data);
      }

    } catch (error) {
      console.error('[FloatingScreener] Error submitting answer:', error);
      alert('Failed to submit answer. Please try again.');
      this.showScreen('question');
    } finally {
      this.submitting = false;
      this.setControlsLocked(false);
    }
  }

  async skipQuestion() {
    if (!this.currentProblem || this.submitting) return;

    this.submitting = true;
    this.setControlsLocked(true);

    try {
      const response = await window.csrfFetch('/api/screener/submit-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          problemId: this.currentProblem.problemId,
          answer: '__SKIP__',
          skipped: true,
          responseTime: null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to skip question');
      }

      console.log('[FloatingScreener] Question skipped, action:', data.nextAction);

      // Update progress bar
      this.updateProgressBar(data.progress);

      if (data.nextAction === 'continue') {
        // Fetch next problem and transition immediately (no flash for skips)
        const nextData = await this.fetchNextProblem();
        this.currentProblem = nextData.problem;
        this.selectedAnswer = null;
        this.renderProblem(nextData.problem);
        this.showScreen('question');
      } else if (data.nextAction === 'complete') {
        this.showResults(data);
      }

    } catch (error) {
      console.error('[FloatingScreener] Error skipping question:', error);
      alert('Failed to skip question. Please try again.');
      this.showScreen('question');
    } finally {
      this.submitting = false;
      this.setControlsLocked(false);
    }
  }

  async showResults(data) {
    this.showScreen('results');

    // Update grade level display (like STAR testing)
    const gradeLevelEl = document.getElementById('screener-result-grade-level');
    const descriptionEl = document.getElementById('screener-result-description');

    if (gradeLevelEl && data.report?.gradeLevel) {
      gradeLevelEl.textContent = data.report.gradeLevel;
    }

    if (descriptionEl && data.report?.gradeLevelDescription) {
      descriptionEl.textContent = data.report.gradeLevelDescription;
    }

    // Update result stats
    const accuracyEl = document.getElementById('screener-result-accuracy');
    const questionsEl = document.getElementById('screener-result-questions');
    const durationEl = document.getElementById('screener-result-duration');

    if (accuracyEl && data.report?.accuracy !== undefined) {
      // Backend already returns accuracy as percentage (0-100), not decimal
      accuracyEl.textContent = `${Math.round(data.report.accuracy)}%`;
    }

    if (questionsEl && data.report?.questionsAnswered !== undefined) {
      questionsEl.textContent = data.report.questionsAnswered;
    }

    if (durationEl && data.report?.duration !== undefined) {
      // Duration is in milliseconds, convert to readable format
      const totalSeconds = Math.round(data.report.duration / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (minutes > 0) {
        durationEl.textContent = seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} min`;
      } else {
        durationEl.textContent = `${seconds} sec`;
      }
    }
  }

  async finishAssessment() {
    this.showLoading('Saving results...');

    try {
      const response = await window.csrfFetch('/api/screener/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: this.sessionId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete assessment');
      }

      console.log('[FloatingScreener] Assessment completed');

      // Update state
      this.assessmentCompleted = true;
      this.updateSidebarButton();

      // Close the module
      this.close();

      // Show celebration or notification
      if (window.showNotification) {
        window.showNotification('Starting Point complete! Your learning path has been personalized.', 'success');
      }

      // Trigger confetti if available
      if (window.confetti) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

    } catch (error) {
      console.error('[FloatingScreener] Error completing assessment:', error);
      alert('Failed to save results. Please try again.');
      this.showScreen('results');
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.floatingScreener = new FloatingScreener();
});

// Global function to open screener from chat or other places
window.openStartingPoint = function() {
  if (window.floatingScreener) {
    window.floatingScreener.open();
  }
};

console.log('[FloatingScreener] Module loaded');

;
/* --- /js/floating-checkpoint.js --- */
/**
 * FLOATING CHECKPOINT MODULE
 *
 * Card-based assessment UI for course checkpoints.
 * Presents problems one at a time, grades server-side, shows results.
 * Reuses the floating-screener visual pattern but with checkpoint-specific logic.
 */

class FloatingCheckpoint {
  constructor() {
    this.container = document.getElementById('floating-checkpoint');
    this.isOpen = false;
    this.submitting = false;
    this.currentProblem = null;
    this.moduleTitle = '';
    this.totalProblems = 0;
    this.passThreshold = 70;

    // Drag state
    this._dragging = false;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.setupEventListeners();
    this.setupDrag();
    console.log('[FloatingCheckpoint] Initialized');
  }

  setupEventListeners() {
    // Close button
    const closeBtn = this.container.querySelector('.checkpoint-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Collapse button
    const collapseBtn = this.container.querySelector('.checkpoint-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => this.toggleCollapse());
    }

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Submit button
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer());
    }

    // Skip button
    const skipBtn = document.getElementById('checkpoint-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipQuestion());
    }

    // Answer input — submit on Enter
    const answerInput = document.getElementById('checkpoint-answer-input');
    if (answerInput) {
      answerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitAnswer();
        }
      });
      answerInput.addEventListener('input', () => this.updateSubmitButton());
    }

    // Continue button (after results)
    const continueBtn = document.getElementById('checkpoint-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.finishCheckpoint());
    }

    // Start button
    const startBtn = document.getElementById('checkpoint-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.startCheckpoint());
    }
  }

  // ── Drag support ──
  setupDrag() {
    const header = this.container.querySelector('.checkpoint-header-bar');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      // Don't drag when clicking buttons
      if (e.target.closest('button')) return;
      this._startDrag(e.clientX, e.clientY);
    });

    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      const touch = e.touches[0];
      this._startDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('mousemove', (e) => this._onDrag(e.clientX, e.clientY));
    document.addEventListener('touchmove', (e) => {
      if (!this._dragging) return;
      const touch = e.touches[0];
      this._onDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    document.addEventListener('mouseup', () => this._endDrag());
    document.addEventListener('touchend', () => this._endDrag());
  }

  _startDrag(clientX, clientY) {
    this._dragging = true;
    const rect = this.container.getBoundingClientRect();
    this._dragOffsetX = clientX - rect.left;
    this._dragOffsetY = clientY - rect.top;
    // Switch from centered positioning to absolute positioning
    this.container.style.transform = 'none';
    this.container.style.left = rect.left + 'px';
    this.container.style.top = rect.top + 'px';
  }

  _onDrag(clientX, clientY) {
    if (!this._dragging) return;
    let newLeft = clientX - this._dragOffsetX;
    let newTop = clientY - this._dragOffsetY;
    // Keep within viewport
    const rect = this.container.getBoundingClientRect();
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
    this.container.style.left = newLeft + 'px';
    this.container.style.top = newTop + 'px';
  }

  _endDrag() {
    this._dragging = false;
  }

  // ── Collapse support ──
  toggleCollapse() {
    this.container.classList.toggle('collapsed');
    const btn = this.container.querySelector('.checkpoint-collapse-btn i');
    if (btn) {
      const isCollapsed = this.container.classList.contains('collapsed');
      btn.className = isCollapsed ? 'fas fa-plus' : 'fas fa-minus';
    }
  }

  async open(moduleInfo) {
    if (!this.container) return;
    this.container.classList.add('active');
    this.container.classList.remove('collapsed');
    this.isOpen = true;
    this.showScreen('instruction');

    // Reset position to center
    this.container.style.left = '50%';
    this.container.style.top = '50%';
    this.container.style.transform = 'translate(-50%, -50%)';

    // Reset collapse button icon
    const btn = this.container.querySelector('.checkpoint-collapse-btn i');
    if (btn) btn.className = 'fas fa-minus';

    // Pre-populate instruction screen with module info if available
    const titleEl = document.getElementById('checkpoint-module-title');
    if (titleEl && moduleInfo?.title) {
      titleEl.textContent = moduleInfo.title;
    }
  }

  close() {
    if (!this.container) return;
    this.container.classList.remove('active', 'collapsed');
    this.isOpen = false;
  }

  showScreen(screenName) {
    const screens = this.container.querySelectorAll('.checkpoint-screen');
    screens.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`checkpoint-${screenName}-screen`);
    if (target) target.classList.add('active');
  }

  showLoading(text) {
    const loadingText = document.getElementById('checkpoint-loading-text');
    if (loadingText) loadingText.textContent = text || 'Loading...';
    this.showScreen('loading');
  }

  async startCheckpoint() {
    this.showLoading('Loading checkpoint...');

    try {
      const response = await window.csrfFetch('/api/checkpoint/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start checkpoint');
      }

      const data = await response.json();
      this.moduleTitle = data.moduleTitle;
      this.totalProblems = data.totalProblems;
      this.passThreshold = data.passThreshold;

      if (data.problem) {
        this.currentProblem = data.problem;
        this.renderProblem(data.problem);
        this.showScreen('question');
      } else {
        throw new Error('No problems available');
      }
    } catch (err) {
      console.error('[FloatingCheckpoint] Start error:', err);
      alert('Failed to start checkpoint: ' + err.message);
      this.close();
    }
  }

  renderProblem(problem) {
    // Question number
    const numEl = document.getElementById('checkpoint-question-num');
    if (numEl) numEl.textContent = `Problem ${problem.questionNumber} of ${problem.totalQuestions}`;

    // Points
    const ptsEl = document.getElementById('checkpoint-question-pts');
    if (ptsEl) ptsEl.textContent = `${problem.points} pt${problem.points !== 1 ? 's' : ''}`;

    // Skill tag
    const skillEl = document.getElementById('checkpoint-question-skill');
    if (skillEl) {
      skillEl.textContent = (problem.skill || '').replace(/-/g, ' ');
    }

    // Question content
    const contentEl = document.getElementById('checkpoint-question-content');
    if (contentEl) {
      contentEl.innerHTML = this.formatMath(problem.question);
    }

    // Progress bar
    this.updateProgressBar(problem.questionNumber - 1, problem.totalQuestions);

    // Clear answer input
    const input = document.getElementById('checkpoint-answer-input');
    if (input) {
      input.value = '';
      input.focus();
    }

    // Clear feedback
    const feedbackEl = document.getElementById('checkpoint-feedback');
    if (feedbackEl) {
      feedbackEl.classList.remove('active', 'correct', 'incorrect');
      feedbackEl.textContent = '';
    }

    // Show submit, hide next
    this.toggleButtons('submit');

    this.updateSubmitButton();

    // Render KaTeX
    if (window.renderMathInElement) {
      requestAnimationFrame(() => {
        window.renderMathInElement(contentEl, {
          delimiters: [
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
        });
      });
    }
  }

  formatMath(text) {
    if (!text) return '';
    let formatted = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert markdown bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Handle multi-part problems: (a), (b), (c) on new lines
    formatted = formatted.replace(/\(([a-d])\)\s/g, '<br><strong>($1)</strong> ');

    return formatted;
  }

  updateProgressBar(current, total) {
    const fill = document.getElementById('checkpoint-progress-fill');
    if (fill) {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      fill.style.width = `${pct}%`;
    }
  }

  updateSubmitButton() {
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    const input = document.getElementById('checkpoint-answer-input');
    if (submitBtn && input) {
      submitBtn.disabled = !input.value.trim();
    }
  }

  toggleButtons(mode) {
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    const skipBtn = document.getElementById('checkpoint-skip-btn');
    const nextBtn = document.getElementById('checkpoint-next-btn');
    const answerInput = document.getElementById('checkpoint-answer-input');

    if (mode === 'submit') {
      if (submitBtn) submitBtn.style.display = '';
      if (skipBtn) skipBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = 'none';
      if (answerInput) answerInput.disabled = false;
    } else if (mode === 'next') {
      if (submitBtn) submitBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = '';
      if (answerInput) answerInput.disabled = true;
    }
  }

  async submitAnswer() {
    const input = document.getElementById('checkpoint-answer-input');
    const answer = input?.value?.trim();
    if (!answer || this.submitting) return;

    this.submitting = true;
    const submitBtn = document.getElementById('checkpoint-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const response = await window.csrfFetch('/api/checkpoint/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answer }),
      });

      if (!response.ok) throw new Error('Failed to submit');
      const data = await response.json();
      this.handleResult(data);
    } catch (err) {
      console.error('[FloatingCheckpoint] Submit error:', err);
      alert('Failed to submit answer. Please try again.');
    } finally {
      this.submitting = false;
    }
  }

  async skipQuestion() {
    if (this.submitting) return;
    this.submitting = true;

    try {
      const response = await window.csrfFetch('/api/checkpoint/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ answer: '', skipped: true }),
      });

      if (!response.ok) throw new Error('Failed to skip');
      const data = await response.json();
      this.handleResult(data);
    } catch (err) {
      console.error('[FloatingCheckpoint] Skip error:', err);
    } finally {
      this.submitting = false;
    }
  }

  handleResult(data) {
    // Show feedback
    const feedbackEl = document.getElementById('checkpoint-feedback');
    if (feedbackEl) {
      feedbackEl.classList.add('active');
      if (data.correct) {
        feedbackEl.classList.add('correct');
        feedbackEl.classList.remove('incorrect');
        feedbackEl.innerHTML = '<i class="fas fa-check-circle"></i> Correct!';
      } else if (data.skipped) {
        feedbackEl.classList.add('incorrect');
        feedbackEl.classList.remove('correct');
        feedbackEl.innerHTML = '<i class="fas fa-forward"></i> Skipped';
      } else {
        feedbackEl.classList.add('incorrect');
        feedbackEl.classList.remove('correct');
        // Prefer LLM feedback (natural explanation), fall back to answer key
        const explanation = data.feedback
          ? `<div class="correct-answer-hint">${this.formatMath(data.feedback)}</div>`
          : data.correctAnswer
            ? `<div class="correct-answer-hint">${this.formatMath(data.correctAnswer)}</div>`
            : '';
        feedbackEl.innerHTML = `<i class="fas fa-times-circle"></i> Not quite.${explanation}`;

        // Render math in feedback
        if (window.renderMathInElement) {
          requestAnimationFrame(() => window.renderMathInElement(feedbackEl, {
            delimiters: [
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
            ],
            throwOnError: false,
          }));
        }
      }
    }

    // Update progress
    if (data.progress) {
      this.updateProgressBar(data.progress.answered, data.progress.total);
    }

    if (data.nextAction === 'complete') {
      // Show results after a brief pause
      setTimeout(() => this.showResultsScreen(data.summary), 1200);
    } else {
      // Show next button
      this.toggleButtons('next');
      const nextBtn = document.getElementById('checkpoint-next-btn');
      if (nextBtn) {
        nextBtn.onclick = () => {
          if (data.nextProblem) {
            this.currentProblem = data.nextProblem;
            this.renderProblem(data.nextProblem);
          }
        };
        nextBtn.focus();
      }
    }
  }

  showResultsScreen(summary) {
    this.showScreen('results');

    const scoreEl = document.getElementById('checkpoint-result-score');
    const statusEl = document.getElementById('checkpoint-result-status');
    const correctEl = document.getElementById('checkpoint-result-correct');
    const totalEl = document.getElementById('checkpoint-result-total');
    const durationEl = document.getElementById('checkpoint-result-duration');
    const breakdownEl = document.getElementById('checkpoint-skill-breakdown');

    if (scoreEl) scoreEl.textContent = `${summary.scorePercent}%`;
    if (statusEl) {
      statusEl.textContent = summary.passed ? 'Passed!' : 'Needs Review';
      statusEl.className = `result-status ${summary.passed ? 'passed' : 'needs-review'}`;
    }
    if (correctEl) correctEl.textContent = `${summary.correct}/${summary.totalProblems}`;
    if (totalEl) totalEl.textContent = `${summary.earnedPoints}/${summary.totalPoints} pts`;

    if (durationEl && summary.duration) {
      const mins = Math.floor(summary.duration / 60000);
      const secs = Math.round((summary.duration % 60000) / 1000);
      durationEl.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    // Skill breakdown
    if (breakdownEl && summary.skillBreakdown) {
      breakdownEl.innerHTML = summary.skillBreakdown.map(s => {
        const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
        const label = (s.skill || '').replace(/-/g, ' ');
        const status = pct >= 70 ? 'strong' : pct >= 40 ? 'developing' : 'needs-work';
        return `<div class="skill-row ${status}">
          <span class="skill-name">${label}</span>
          <span class="skill-score">${s.correct}/${s.total}</span>
          <div class="skill-bar"><div class="skill-bar-fill" style="width: ${pct}%"></div></div>
        </div>`;
      }).join('');
    }
  }

  async finishCheckpoint() {
    this.showLoading('Saving results...');

    try {
      const response = await window.csrfFetch('/api/checkpoint/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to complete');

      const data = await response.json();
      this.close();

      if (window.showNotification) {
        const msg = data.summary?.passed
          ? `Checkpoint complete! Score: ${data.summary.scorePercent}%. Moving to next module.`
          : `Checkpoint complete. Score: ${data.summary.scorePercent}%. Some areas need review.`;
        window.showNotification(msg, data.summary?.passed ? 'success' : 'info');
      }

      // Reload the page to refresh course state
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('[FloatingCheckpoint] Complete error:', err);
      alert('Failed to save results. Please try again.');
      this.showScreen('results');
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.floatingCheckpoint = new FloatingCheckpoint();
  });
} else {
  window.floatingCheckpoint = new FloatingCheckpoint();
}

;
/* --- /js/sidebar.js --- */
// ============================================
// COLLAPSIBLE SIDEBAR
// Modern sidebar with tools, leaderboard, progress
// Enhanced with session management features
// ============================================

class Sidebar {
    constructor() {
        this.isOpen = true; // Start open on desktop
        this.sidebar = null;
        this.toggle = null;
        this.sessionsExpanded = true;
        this.toolsExpanded = false;
        this.activeConversationId = null;
        this.conversations = []; // Cache for search
        this.searchTimeout = null;

        console.log('📂 Sidebar initializing...');
        this.init();
    }

    /**
     * Format a timestamp as relative time (e.g., "2 hours ago", "Yesterday")
     */
    formatRelativeTime(date) {
        if (!date) return '';

        const now = new Date();
        const then = new Date(date);
        const diffMs = now - then;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

        // Format as date for older sessions
        return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    init() {
        this.sidebar = document.getElementById('app-sidebar');
        this.toggle = document.getElementById('sidebar-toggle');

        if (!this.sidebar || !this.toggle) {
            console.error('[Sidebar] Sidebar elements not found');
            return;
        }

        // Set initial state based on screen size
        if (window.innerWidth < 768) {
            this.isOpen = false;
            this.sidebar.classList.add('collapsed');
            const wrapper = document.getElementById('app-layout-wrapper');
            if (wrapper) {
                wrapper.classList.add('sidebar-collapsed');
            }
        }

        // Toggle button click
        this.toggle.addEventListener('click', () => this.toggleSidebar());

        // Close sidebar when clicking outside on mobile
        if (window.innerWidth < 768) {
            document.addEventListener('click', (e) => {
                if (this.isOpen &&
                    !this.sidebar.contains(e.target) &&
                    !this.toggle.contains(e.target)) {
                    this.toggleSidebar();
                }
            });
        }

        // Sessions expand/collapse
        const sessionsToggle = document.querySelector('.sessions-toggle');
        const sessionsContent = document.getElementById('sidebar-sessions');
        if (sessionsToggle && sessionsContent) {
            sessionsToggle.addEventListener('click', () => this.toggleSessions());
            // Start expanded
            sessionsContent.classList.add('expanded');
            sessionsToggle.classList.add('expanded');
        }

        // Tools expand/collapse (collapsed by default to reduce clutter)
        const toolsToggle = document.querySelector('.tools-toggle');
        const toolsContent = document.getElementById('sidebar-tools');
        if (toolsToggle && toolsContent) {
            toolsToggle.addEventListener('click', () => this.toggleTools());
        }


        // New session button
        const newSessionBtn = document.getElementById('new-session-btn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => this.createNewSession());
        }

        // Session search input
        const searchInput = document.getElementById('session-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchSessions(e.target.value);
            });

            // Clear search on escape
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.renderSessions(this.conversations);
                }
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.session-actions')) {
                document.querySelectorAll('.session-dropdown.show').forEach(d => d.classList.remove('show'));
            }
        });

        // Tool button handlers
        this.setupToolHandlers();

        // Load sessions
        this.loadSessions();


        // Load progress data
        this.loadProgress();

        // Pi Day button — show/hide based on date, scroll to quests on click
        this.initPiDayButton();

        console.log('✅ Sidebar ready');
    }

    initPiDayButton() {
        const piSection = document.getElementById('sidebar-pi-day-section');
        const piBtn = document.getElementById('sidebar-pi-day-btn');
        if (!piSection || !piBtn) return;

        // Check if it's Pi Day via the quests API flag
        fetch('/api/daily-quests')
            .then(r => r.json())
            .then(data => {
                if (data.piDay) {
                    piSection.style.display = '';
                }
            })
            .catch(() => {});

        // Open Pi Day hub panel on click
        piBtn.addEventListener('click', () => this.openPiDayHub());

        // Close hub panel
        const closeBtn = document.getElementById('pi-day-hub-close');
        const backdrop = document.getElementById('pi-day-hub-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closePiDayHub());
        if (backdrop) backdrop.addEventListener('click', () => this.closePiDayHub());
    }

    async openPiDayHub() {
        const hub = document.getElementById('pi-day-hub');
        if (!hub) return;
        hub.style.display = '';

        // Load quests
        try {
            const questRes = await fetch('/api/daily-quests');
            const questData = await questRes.json();
            const questsEl = document.getElementById('pi-hub-quests');
            if (questData.success && questData.quests) {
                questsEl.innerHTML = questData.quests.map(q => {
                    const pct = Math.min((q.progress / q.targetCount) * 100, 100);
                    return `<div class="pi-hub-quest-item">
                        <span class="quest-icon">${q.icon}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${q.name}</div>
                            <div style="font-size:11px;color:#888;">${q.description}</div>
                            <div style="height:4px;background:#eee;border-radius:2px;margin-top:4px;">
                                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ff6b9d,#c850c0);border-radius:2px;"></div>
                            </div>
                        </div>
                        <span class="quest-xp">${q.completed ? '\u2705' : `+${Math.round(q.xpReward * (q.bonusMultiplier || 1))} XP`}</span>
                    </div>`;
                }).join('');
            }
        } catch (e) { console.error('Pi hub quests:', e); }

        // Load mini-lessons
        try {
            const lessonRes = await fetch('/api/daily-quests/pi-day-lessons');
            const lessonData = await lessonRes.json();
            const lessonsEl = document.getElementById('pi-hub-lessons');
            if (lessonData.success && lessonData.lessons && lessonData.lessons.length) {
                lessonsEl.innerHTML = lessonData.lessons.map(l => `
                    <button class="pi-hub-lesson-btn" data-prompt="${l.prompt.replace(/"/g, '&quot;')}">
                        <span style="font-size:18px;font-weight:900;">\u03C0</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${l.title}</div>
                            ${l.gradeBand !== 'all' ? `<div style="font-size:10px;color:#888;">Grades ${l.gradeBand}</div>` : ''}
                        </div>
                        <i class="fas fa-chevron-right" style="color:#ccc;font-size:11px;"></i>
                    </button>
                `).join('');
                // Attach click handlers
                lessonsEl.querySelectorAll('.pi-hub-lesson-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const prompt = btn.getAttribute('data-prompt');
                        this.closePiDayHub();
                        if (prompt && typeof window.sendMessage === 'function') {
                            window.sendMessage(prompt);
                        } else if (prompt) {
                            const input = document.getElementById('user-input') || document.getElementById('chat-input');
                            if (input) { input.value = prompt; input.focus(); input.dispatchEvent(new Event('input', { bubbles: true })); }
                        }
                    });
                });
            } else {
                lessonsEl.innerHTML = '<div style="font-size:12px;color:#888;">No lessons available.</div>';
            }
        } catch (e) { console.error('Pi hub lessons:', e); }

        // Load relevant courses (geometry, circle-related)
        try {
            const catRes = await fetch('/api/course-sessions/catalog');
            const catData = await catRes.json();
            const coursesEl = document.getElementById('pi-hub-courses');
            const courses = catData.catalog || catData.courses;
            if (catData.success && courses) {
                // Surface geometry + math courses that relate to circles/pi
                const piRelevant = ['geometry', '7th-grade-math', '6th-grade-math', 'grade-8-math', 'precalculus'];
                const matches = courses.filter(c => piRelevant.includes(c.courseId));
                if (matches.length) {
                    coursesEl.innerHTML = matches.map(c => `
                        <button class="pi-hub-course-btn" data-course-id="${c.courseId}">
                            <span class="course-icon">${c.icon || '\uD83D\uDCD0'}</span>
                            <div class="course-info">
                                <div class="course-name">${c.title || c.courseId}</div>
                                <div class="course-desc">${c.tagline || ''}</div>
                            </div>
                            <span style="font-size:10px;font-weight:700;color:#ff6b9d;background:rgba(255,107,157,0.12);padding:2px 7px;border-radius:10px;white-space:nowrap;">Free today!</span>
                        </button>
                    `).join('');
                    // Attach click handlers to enroll / open course
                    coursesEl.querySelectorAll('.pi-hub-course-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const courseId = btn.getAttribute('data-course-id');
                            this.closePiDayHub();
                            if (window.courseManager && typeof window.courseManager.enrollInCourse === 'function') {
                                window.courseManager.enrollInCourse(courseId, null);
                            } else {
                                // Fallback: open browse courses catalog
                                const browseBtn = document.getElementById('browse-courses-btn');
                                if (browseBtn) browseBtn.click();
                            }
                        });
                    });
                } else {
                    coursesEl.innerHTML = '<div style="font-size:12px;color:#888;">Browse all courses in the sidebar.</div>';
                }
            }
        } catch (e) { console.error('Pi hub courses:', e); }
    }

    closePiDayHub() {
        const hub = document.getElementById('pi-day-hub');
        if (hub) hub.style.display = 'none';
    }

    /**
     * Switch sidebar context between 'course' and 'general'.
     * In course mode, session list / leaderboard / quests are hidden
     * to reduce clutter — the student is focused on their course.
     */
    setContext(ctx) {
        if (!this.sidebar) return;
        if (ctx === 'course') {
            this.sidebar.classList.add('ctx-course');
        } else {
            this.sidebar.classList.remove('ctx-course');
        }
    }

    toggleSidebar() {
        this.isOpen = !this.isOpen;

        if (this.isOpen) {
            this.sidebar.classList.remove('collapsed');
            this.toggle.classList.add('sidebar-open');
            document.getElementById('app-layout-wrapper').classList.remove('sidebar-collapsed');
        } else {
            this.sidebar.classList.add('collapsed');
            this.toggle.classList.remove('sidebar-open');
            document.getElementById('app-layout-wrapper').classList.add('sidebar-collapsed');
        }
    }

    toggleSessions() {
        this.sessionsExpanded = !this.sessionsExpanded;

        const sessionsContent = document.getElementById('sidebar-sessions');
        const sessionsToggle = document.querySelector('.sessions-toggle');

        if (this.sessionsExpanded) {
            sessionsContent.classList.add('expanded');
            sessionsToggle.classList.add('expanded');
        } else {
            sessionsContent.classList.remove('expanded');
            sessionsToggle.classList.remove('expanded');
        }
    }

    toggleTools() {
        this.toolsExpanded = !this.toolsExpanded;

        const toolsContent = document.getElementById('sidebar-tools');
        const toolsToggle = document.querySelector('.tools-toggle');

        if (this.toolsExpanded) {
            toolsContent.classList.add('expanded');
            toolsToggle.classList.add('expanded');
        } else {
            toolsContent.classList.remove('expanded');
            toolsToggle.classList.remove('expanded');
        }
    }

    // Force the Tools section open (idempotent). Used when something inside
    // Tools needs to be visible — e.g. the glowing "Starting Point" button the
    // greeting points new students to. Without this it stays hidden inside the
    // collapsed-by-default section and the greeting refers to a button nobody
    // can see.
    expandTools() {
        const toolsContent = document.getElementById('sidebar-tools');
        const toolsToggle = document.querySelector('.tools-toggle');
        if (!toolsContent || !toolsToggle) return;

        this.toolsExpanded = true;
        toolsContent.classList.add('expanded');
        toolsToggle.classList.add('expanded');
    }

    async loadSessions() {
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'GET',
                credentials: 'include'
            });

            const data = await response.json();

            // Track active conversation for sidebar highlighting only.
            // We no longer auto-restore sessions on page load — new logins
            // always start in general chat. Users resume via sidebar click.
            if (data.activeConversationId && !this.activeConversationId) {
                this.activeConversationId = data.activeConversationId;
                console.log('[Sidebar] Noted active conversation:', this.activeConversationId);
            }

            this.renderSessions(data.conversations);

            // Check if assessment is needed
            if (data.assessmentNeeded) {
                this.showAssessmentPrompt();
            }
        } catch (error) {
            console.error('[Sidebar] Failed to load sessions:', error);
        }
    }

    renderSessions(conversations) {
        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        // Cache conversations for search
        this.conversations = conversations;
        this._sessionsShowAll = false;

        // Clear existing
        sessionsList.innerHTML = '';

        // Filter out assessment/mastery conversations from the list
        const chatConversations = conversations.filter(c =>
            c.conversationType === 'general' || c.conversationType === 'topic'
        );

        // Separate pinned and regular sessions
        const pinnedSessions = chatConversations.filter(c => c.isPinned);
        const regularSessions = chatConversations.filter(c => !c.isPinned);

        // Add pinned sessions header if any exist
        if (pinnedSessions.length > 0) {
            const pinnedHeader = document.createElement('div');
            pinnedHeader.className = 'session-divider';
            pinnedHeader.innerHTML = '<span><i class="fas fa-thumbtack"></i> Pinned</span>';
            sessionsList.appendChild(pinnedHeader);

            pinnedSessions.forEach(conv => this.renderSessionItem(conv, sessionsList, true));
        }

        // Add regular sessions (show only 3 by default)
        if (regularSessions.length > 0) {
            if (pinnedSessions.length > 0) {
                const recentHeader = document.createElement('div');
                recentHeader.className = 'session-divider';
                recentHeader.innerHTML = '<span>Recent</span>';
                sessionsList.appendChild(recentHeader);
            }

            const defaultShow = 3;
            regularSessions.slice(0, defaultShow).forEach(conv => this.renderSessionItem(conv, sessionsList, false));

            // "See more" button if there are more than 3 regular sessions
            if (regularSessions.length > defaultShow) {
                const seeMoreBtn = document.createElement('button');
                seeMoreBtn.className = 'sidebar-see-all-btn sessions-see-more-btn';
                seeMoreBtn.textContent = `See ${regularSessions.length - defaultShow} more`;
                seeMoreBtn.addEventListener('click', () => this.toggleAllSessions());
                sessionsList.appendChild(seeMoreBtn);
            }
        }

        // Show empty state if no conversations
        if (chatConversations.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'session-empty-state';
            emptyState.innerHTML = `
                <span style="color: #888; font-size: 13px; padding: 12px; display: block; text-align: center;">
                    No chats yet. Click <strong>New Chat</strong> to start!
                </span>
            `;
            sessionsList.appendChild(emptyState);
        }
    }

    /**
     * Toggle between showing 3 sessions and all sessions
     */
    toggleAllSessions() {
        this._sessionsShowAll = !this._sessionsShowAll;

        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        sessionsList.innerHTML = '';

        const chatConversations = this.conversations.filter(c =>
            c.conversationType === 'general' || c.conversationType === 'topic'
        );
        const pinnedSessions = chatConversations.filter(c => c.isPinned);
        const regularSessions = chatConversations.filter(c => !c.isPinned);

        if (pinnedSessions.length > 0) {
            const pinnedHeader = document.createElement('div');
            pinnedHeader.className = 'session-divider';
            pinnedHeader.innerHTML = '<span><i class="fas fa-thumbtack"></i> Pinned</span>';
            sessionsList.appendChild(pinnedHeader);
            pinnedSessions.forEach(conv => this.renderSessionItem(conv, sessionsList, true));
        }

        if (regularSessions.length > 0) {
            if (pinnedSessions.length > 0) {
                const recentHeader = document.createElement('div');
                recentHeader.className = 'session-divider';
                recentHeader.innerHTML = '<span>Recent</span>';
                sessionsList.appendChild(recentHeader);
            }

            const defaultShow = 3;
            const showCount = this._sessionsShowAll ? regularSessions.length : defaultShow;
            regularSessions.slice(0, showCount).forEach(conv => this.renderSessionItem(conv, sessionsList, false));

            if (regularSessions.length > defaultShow) {
                const seeMoreBtn = document.createElement('button');
                seeMoreBtn.className = 'sidebar-see-all-btn sessions-see-more-btn';
                seeMoreBtn.textContent = this._sessionsShowAll ? 'Show less' : `See ${regularSessions.length - defaultShow} more`;
                seeMoreBtn.addEventListener('click', () => this.toggleAllSessions());
                sessionsList.appendChild(seeMoreBtn);
            }
        }
    }

    /**
     * Render a single session item
     */
    renderSessionItem(conv, container, isPinned) {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-item' + (this.activeConversationId === conv._id ? ' active' : '');
        sessionItem.dataset.conversationId = conv._id;

        // Format stats if available
        let statsHtml = '';
        if (conv.stats && conv.stats.problemsAttempted > 0) {
            const accuracy = conv.stats.problemsCorrect > 0
                ? Math.round((conv.stats.problemsCorrect / conv.stats.problemsAttempted) * 100)
                : 0;
            statsHtml = `<span class="session-stats">${accuracy}% accuracy</span>`;
        }

        sessionItem.innerHTML = `
            <div class="session-main">
                <span class="session-emoji">${conv.topicEmoji || '💬'}</span>
                <div class="session-info">
                    <div class="session-name-row">
                        ${isPinned ? '<i class="fas fa-thumbtack session-pin-icon"></i>' : ''}
                        <span class="session-name">${this.escapeHtml(conv.name)}</span>
                    </div>
                    ${conv.lastMessage ? `
                        <span class="session-preview">${this.escapeHtml(conv.lastMessage.content)}</span>
                    ` : '<span class="session-preview">No messages yet</span>'}
                    ${statsHtml}
                </div>
            </div>
            <div class="session-meta">
                <span class="session-time">${this.formatRelativeTime(conv.lastActivity)}</span>
                ${conv.messageCount > 0 ? `<span class="session-count">${conv.messageCount}</span>` : ''}
                <div class="session-actions">
                    <button class="session-action-btn session-menu-btn" title="More options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="session-dropdown">
                        <button class="session-dropdown-item" data-action="rename">
                            <i class="fas fa-edit"></i> Rename
                        </button>
                        <button class="session-dropdown-item" data-action="pin">
                            <i class="fas fa-thumbtack"></i> ${isPinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button class="session-dropdown-item session-dropdown-danger" data-action="delete">
                            <i class="fas fa-trash-alt"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Main click handler
        sessionItem.addEventListener('click', (e) => {
            if (!e.target.closest('.session-actions')) {
                this.switchSession(conv._id);
            }
        });

        // Menu button handler
        const menuBtn = sessionItem.querySelector('.session-menu-btn');
        const dropdown = sessionItem.querySelector('.session-dropdown');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.session-dropdown.show').forEach(d => d.classList.remove('show'));
            dropdown.classList.toggle('show');
        });

        // Dropdown action handlers
        dropdown.querySelectorAll('.session-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                const action = item.dataset.action;

                if (action === 'rename') {
                    this.renameSession(conv._id, conv.name);
                } else if (action === 'pin') {
                    this.togglePinSession(conv._id);
                } else if (action === 'delete') {
                    this.deleteSession(conv._id);
                }
            });
        });

        container.appendChild(sessionItem);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Rename a session
     */
    async renameSession(conversationId, currentName) {
        const newName = prompt('Enter a new name for this session:', currentName);
        if (!newName || newName.trim() === '' || newName === currentName) return;

        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
                credentials: 'include'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to rename');
            }

            await this.loadSessions();
            console.log('[Sidebar] Session renamed successfully');
        } catch (error) {
            console.error('[Sidebar] Failed to rename session:', error);
            alert('Failed to rename session. Please try again.');
        }
    }

    /**
     * Toggle pin status for a session
     */
    async togglePinSession(conversationId) {
        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/pin`, {
                method: 'PATCH',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to update pin status');
            }

            await this.loadSessions();
            console.log('[Sidebar] Pin status toggled successfully');
        } catch (error) {
            console.error('[Sidebar] Failed to toggle pin:', error);
        }
    }

    /**
     * Search sessions
     */
    async searchSessions(query) {
        if (!query || query.trim() === '') {
            this.renderSessions(this.conversations);
            return;
        }

        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            try {
                const response = await window.csrfFetch(`/api/conversations/search?q=${encodeURIComponent(query)}`, {
                    method: 'GET',
                    credentials: 'include'
                });

                const data = await response.json();
                this.renderSearchResults(data.conversations, query);
            } catch (error) {
                console.error('[Sidebar] Search failed:', error);
            }
        }, 300);
    }

    /**
     * Render search results
     */
    renderSearchResults(results, query) {
        const sessionsList = document.getElementById('sessions-list');
        if (!sessionsList) return;

        sessionsList.innerHTML = '';

        if (results.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'session-no-results';
            noResults.innerHTML = `<i class="fas fa-search"></i><span>No sessions found for "${this.escapeHtml(query)}"</span>`;
            sessionsList.appendChild(noResults);
            return;
        }

        results.forEach(conv => {
            this.renderSessionItem(conv, sessionsList, conv.isPinned);
        });
    }

    /**
     * Create a new blank session immediately (Claude-like UX)
     */
    async createNewSession() {
        console.log('[Sidebar] createNewSession called');
        try {
            const response = await window.csrfFetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                credentials: 'include'
            });

            const data = await response.json();
            await this.loadSessions();
            this.switchSession(data.conversation._id);
        } catch (error) {
            console.error('[Sidebar] Failed to create new session:', error);
        }
    }

    async switchSession(conversationId) {
        console.log('[Sidebar] switchSession called with:', conversationId);
        try {
            const response = await window.csrfFetch(`/api/conversations/${conversationId}/switch`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await response.json();
            console.log('[Sidebar] Switch response:', data);

            // Update active session in UI
            document.querySelectorAll('.session-item').forEach(item => {
                item.classList.remove('active');
            });

            const activeItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }

            // Update chat view
            console.log('[Sidebar] updateChatForSession available:', typeof window.updateChatForSession);
            if (window.updateChatForSession) {
                window.updateChatForSession(data.conversation, data.messages);
            } else {
                console.error('[Sidebar] window.updateChatForSession is not defined!');
                // Fallback: reload page to switch session
                window.location.reload();
            }

            this.activeConversationId = conversationId;
        } catch (error) {
            console.error('[Sidebar] Failed to switch session:', error);
        }
    }

    async deleteSession(conversationId) {
        if (!confirm('Delete this chat? This cannot be undone.')) {
            return;
        }

        try {
            const wasActive = this.activeConversationId === conversationId;

            await window.csrfFetch(`/api/conversations/${conversationId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            // If we deleted the active chat, create a fresh session
            if (wasActive) {
                this.activeConversationId = null;
                await this.createNewSession();
            } else {
                await this.loadSessions();
            }
        } catch (error) {
            console.error('[Sidebar] Failed to delete session:', error);
        }
    }

    showAssessmentPrompt() {
        // Show a banner or notification that assessment is needed
        console.log('[Sidebar] Assessment needed - will show prompt in chat');
        if (window.showAssessmentPrompt) {
            window.showAssessmentPrompt();
        }
    }

    setupToolHandlers() {
        // Mastery Mode (shelved)
    }

    async loadProgress() {
        // Fetch user data if window.currentUser isn't available yet
        // (script.js runs as ES module so its currentUser is module-scoped)
        let user = window.currentUser;
        if (!user) {
            try {
                const res = await fetch('/user', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    user = data.user;
                }
            } catch (e) {
                console.warn('Sidebar: could not fetch user for progress', e);
            }
        }
        if (!user) return;

        const level = user.level || 1;
        // xpForCurrentLevel and xpForNextLevel are computed by the backend
        // (set on page load via /user endpoint and updated after each chat response)
        const xp = user.xpForCurrentLevel || 0;
        const xpNeeded = user.xpForNextLevel || 100;
        const progress = (xp / xpNeeded) * 100;

        // Update sidebar progress
        const levelEl = document.getElementById('sidebar-level');
        const xpEl = document.getElementById('sidebar-xp');
        const progressBar = document.getElementById('sidebar-progress-fill');

        if (levelEl) levelEl.textContent = level;
        if (xpEl) xpEl.textContent = `${xp} / ${xpNeeded} XP`;
        if (progressBar) progressBar.style.width = `${Math.min(progress, 100)}%`;

        // Update mobile drawer progress
        const drawerLevelEl = document.getElementById('drawer-level');
        const drawerXpEl = document.getElementById('drawer-xp');
        const drawerProgressBar = document.getElementById('drawer-progress-fill');

        if (drawerLevelEl) drawerLevelEl.textContent = level;
        if (drawerXpEl) drawerXpEl.textContent = `${xp} / ${xpNeeded} XP`;
        if (drawerProgressBar) drawerProgressBar.style.width = `${Math.min(progress, 100)}%`;

        // Update mobile drawer quick stats (streak, total XP, total solved)
        const drawerStreak = document.getElementById('drawer-streak-count');
        const drawerTotalXp = document.getElementById('drawer-total-xp');
        const drawerTotalProblems = document.getElementById('drawer-total-problems');

        if (drawerStreak) drawerStreak.textContent = user.dailyQuests?.currentStreak || user.currentStreak || 0;
        if (drawerTotalXp) drawerTotalXp.textContent = user.xp || 0;
        if (drawerTotalProblems) drawerTotalProblems.textContent = user.totalProblemsCorrect || 0;

        // Update link code in drawer
        const drawerLinkCode = document.getElementById('drawer-student-link-code-value');
        const sidebarLinkCode = document.getElementById('student-link-code-value');
        if (drawerLinkCode && sidebarLinkCode) {
            drawerLinkCode.textContent = sidebarLinkCode.textContent;
            drawerLinkCode.onclick = sidebarLinkCode.onclick;
        }
    }
}

// Wire the "invite a parent by email" action in the Share Progress drawer.
function wireParentInvite() {
    const btn = document.getElementById('drawer-invite-parent-btn');
    const input = document.getElementById('drawer-invite-parent-email');
    const status = document.getElementById('drawer-invite-parent-status');
    if (!btn || !input) return;

    const setStatus = (msg, ok) => {
        if (!status) return;
        status.style.display = 'block';
        status.style.color = ok ? '#0d9488' : '#c0392b';
        status.textContent = msg;
    };

    btn.addEventListener('click', async () => {
        const email = (input.value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setStatus('Please enter a valid email address.', false);
            return;
        }
        btn.disabled = true;
        setStatus('Sending…', true);
        try {
            const fetchFn = window.csrfFetch || window.fetch;
            const res = await fetchFn('/api/student/invite-parent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentEmail: email }),
                credentials: 'include'
            });
            const data = await res.json().catch(() => ({}));
            setStatus(data.message || (res.ok ? 'Invite sent!' : 'Could not send invite.'), res.ok);
            if (res.ok) input.value = '';
        } catch (e) {
            setStatus('Network error — please try again.', false);
        } finally {
            btn.disabled = false;
        }
    });
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar();
    wireParentInvite();
});

console.log('📂 Sidebar module loaded');

;
/* --- /js/courseCatalog.js --- */
// ============================================
// COURSE CATALOG & ENROLLMENT MANAGER
// Handles course browsing, enrollment, progress display,
// and switching between course sessions and general tutoring.
// Purely additive — never touches existing sidebar/session logic.
// ============================================

class CourseManager {
    constructor() {
        this.courseSessions = [];
        this.activeCourseSessionId = null;
        this.dropdownOpen = false;
        this._lastKnownModuleStatuses = {}; // moduleId → status, for detecting completions
        this._catalogCache = null; // Cache catalog data for client-side filtering
        this._catalogRecommended = null;
        this._activeFilter = 'All';
        this.init();
    }

    // --------------------------------------------------
    // Initialisation
    // --------------------------------------------------
    init() {
        // Reveal the "My Courses" sidebar entry point when the feature is on.
        // Flag default is set in chat.html (MM_FEATURES.courses); ?courses=0/1 overrides per session.
        const flagParams = new URLSearchParams(window.location.search);
        const urlCourses = flagParams.get('courses');
        const coursesOn = urlCourses !== null
            ? (urlCourses !== '0' && urlCourses !== 'false')
            : (window.MM_FEATURES ? window.MM_FEATURES.courses !== false : true);
        const coursesSection = document.getElementById('sidebar-courses-section');
        if (coursesSection && coursesOn) {
            coursesSection.style.display = '';
        }
        if (!coursesOn) return; // feature off — skip wiring entirely

        // Browse Courses button → open catalog modal
        const browseBtn = document.getElementById('browse-courses-btn');
        if (browseBtn) {
            browseBtn.addEventListener('click', () => this.openCatalog());
        }

        // Close catalog modal
        const closeBtn = document.getElementById('close-catalog-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeCatalog());
        }

        // Courses section expand/collapse
        const coursesToggle = document.getElementById('courses-toggle-btn');
        const coursesContent = document.getElementById('sidebar-courses');
        if (coursesToggle && coursesContent) {
            coursesToggle.addEventListener('click', () => {
                const expanded = coursesContent.classList.toggle('expanded');
                coursesToggle.classList.toggle('expanded', expanded);
            });
            // Start expanded
            coursesContent.classList.add('expanded');
            coursesToggle.classList.add('expanded');
        }

        // Close catalog when clicking overlay background
        const modal = document.getElementById('course-catalog-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeCatalog();
            });
        }

        // Next Lesson / Exit Course buttons
        const nextBtn = document.getElementById('course-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.onNextLesson());
        }

        const exitBtn = document.getElementById('course-exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', () => this.exitCourse());
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dropdownOpen &&
                !e.target.closest('#course-progress-wrapper')) {
                this.closeProgressDropdown();
            }
        });

        // Keyboard accessibility: Escape closes modals and dropdowns
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close confirmation modal first (highest priority)
                const confirmOverlay = document.querySelector('.course-confirm-overlay');
                if (confirmOverlay) {
                    confirmOverlay.remove();
                    return;
                }
                // Close catalog modal
                const catalogModal = document.getElementById('course-catalog-modal');
                if (catalogModal?.classList.contains('is-visible')) {
                    this.closeCatalog();
                    return;
                }
                // Close progress dropdown
                if (this.dropdownOpen) {
                    this.closeProgressDropdown();
                }
            }
        });

        // Load enrolled courses on startup
        this.loadMySessions();

        // Auto-open catalog if arriving via bottom nav (?courses=1)
        const params = new URLSearchParams(window.location.search);
        if (params.get('courses') === '1') {
            // Clean the URL so a refresh doesn't re-open
            history.replaceState(null, '', window.location.pathname);
            // Small delay to let the page finish loading
            setTimeout(() => this.openCatalog(), 300);
        }

        console.log('[CourseManager] Initialised');
    }

    // --------------------------------------------------
    // Sidebar: load the user's enrolled courses
    // --------------------------------------------------
    async loadMySessions() {
        try {
            const res = await csrfFetch('/api/course-sessions', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (!data.success) return;

            this.courseSessions = data.sessions || [];

            // Determine if there is an active course session
            // (the user model tracks this server-side; we infer from the list)
            this.renderSidebarCourses();

            // If there is an active course session tied to the current conversation,
            this.checkActiveProgressBar();
        } catch (err) {
            console.warn('[CourseManager] Failed to load sessions:', err);
        }
    }

    renderSidebarCourses() {
        const list = document.getElementById('course-sessions-list');
        if (!list) return;

        list.innerHTML = '';

        if (this.courseSessions.length === 0) {
            list.innerHTML = `<div style="padding: 8px 4px; color: #aaa; font-size: 13px;">
                No courses yet — browse below!
            </div>`;
            return;
        }

        // Check which conversation is currently active
        const currentConvId = window.currentConversationId || window.sidebar?.activeConversationId;

        this.courseSessions.forEach(s => {
            const item = document.createElement('div');
            const isActive = s.conversationId === currentConvId && s.status === 'active';
            item.className = 'course-sidebar-item' + (isActive ? ' active' : '') + (s.status === 'paused' ? ' paused' : '');
            item.dataset.sessionId = s._id;

            const pct = s.overallProgress || 0;
            const moduleDone = (s.modules || []).filter(m => m.status === 'completed').length;
            const moduleTotal = (s.modules || []).length;

            // Build breadcrumb from module/lesson data
            const currentMod = (s.modules || []).find(m => m.moduleId === s.currentModuleId);
            let modLabel = '';
            if (s.status === 'paused') {
                modLabel = 'Paused';
            } else if (currentMod) {
                const parts = [];
                if (currentMod.unit) parts.push(`Unit ${currentMod.unit}`);
                const curLesson = s.currentLessonId && currentMod.lessons
                    ? currentMod.lessons.find(l => l.lessonId === s.currentLessonId)
                    : null;
                if (curLesson?.title) {
                    parts.push(curLesson.title);
                } else if (currentMod.title) {
                    parts.push(currentMod.title);
                }
                modLabel = parts.join(' \u203A ');
            }

            item.innerHTML = `
                <div class="course-sidebar-row">
                    <div class="course-sidebar-icon">${s.status === 'paused' ? '⏸' : '📘'}</div>
                    <div class="course-sidebar-body">
                        <div class="course-sidebar-name">${this.escapeHtml(this.formatCourseName(s.courseName))}</div>
                        <div class="course-sidebar-module">${modLabel}</div>
                        <div class="course-sidebar-progress-track">
                            <div class="course-sidebar-progress-fill" style="width: ${pct}%"></div>
                        </div>
                        <div class="course-sidebar-stats">${moduleDone}/${moduleTotal} modules &middot; ${pct}%</div>
                    </div>
                    <button class="course-drop-x" title="Drop course" aria-label="Drop course">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            // Click row → activate course
            item.querySelector('.course-sidebar-row').addEventListener('click', (e) => {
                if (e.target.closest('.course-drop-x')) return;
                this.activateCourse(s._id);
            });

            // Click X → drop course
            item.querySelector('.course-drop-x').addEventListener('click', (e) => {
                e.stopPropagation();
                this.dropCourse(s._id);
            });

            list.appendChild(item);
        });
    }

    // --------------------------------------------------
    // Progress bar (shown at top of chat when inside a course conversation)
    // --------------------------------------------------
    async checkActiveProgressBar() {
        // Find if any session's conversationId matches the currently active conversation
        const currentConvId = window.currentConversationId || window.sidebar?.activeConversationId;
        if (!currentConvId) return;

        const match = this.courseSessions.find(
            s => s.conversationId === currentConvId && s.status === 'active'
        );

        const wrapper = document.getElementById('course-progress-wrapper');
        if (!wrapper) return;

        if (match) {
            this.activeCourseSessionId = match._id;
            this.updateProgressBar(match);
            wrapper.style.display = 'block';
            if (window.sidebar) window.sidebar.setContext('course');

            // Rehydrate the lesson progress tracker
            if (window.lessonTracker) {
                window.lessonTracker.rehydrate(match._id);
            }

            // Day-one diagnostic (e.g. ACT-prep practice test): when a student
            // loads straight into an already-active course, neither the enroll
            // splash nor an explicit activate fires — so surface the card here
            // too. Server gates it (returns null once they've taken it).
            this.maybeShowActiveDiagnostic(match._id);
        } else {
            wrapper.style.display = 'none';
            this.activeCourseSessionId = null;
            if (window.sidebar) window.sidebar.setContext('general');

            // Hide the lesson tracker when not in a course
            if (window.lessonTracker) {
                window.lessonTracker.hide();
            }
        }
    }

    updateProgressBar(session) {
        const title = document.getElementById('course-progress-title');
        const mod = document.getElementById('course-progress-module');
        const fill = document.getElementById('course-progress-fill');
        const pct = document.getElementById('course-progress-pct');

        if (title) title.textContent = session.courseName || '';
        if (fill) fill.style.width = `${session.overallProgress || 0}%`;
        if (pct) pct.textContent = `${session.overallProgress || 0}%`;

        // Build breadcrumb: Unit X > Lesson Title
        if (mod) {
            const currentMod = (session.modules || []).find(m => m.moduleId === session.currentModuleId);
            if (currentMod) {
                const lessonId = session.currentLessonId;
                const lesson = lessonId && currentMod.lessons
                    ? currentMod.lessons.find(l => l.lessonId === lessonId)
                    : null;
                const parts = [];
                if (currentMod.unit) parts.push(`Unit ${currentMod.unit}`);
                if (lesson?.title) {
                    parts.push(lesson.title);
                } else if (currentMod.title) {
                    parts.push(currentMod.title);
                }
                mod.textContent = parts.join(' \u203A ');
            } else {
                mod.textContent = '';
            }
        }
    }

    // --------------------------------------------------
    // Module completion detection & celebration
    // --------------------------------------------------
    detectCompletions(modules) {
        const newlyCompleted = [];

        modules.forEach(m => {
            const prev = this._lastKnownModuleStatuses[m.moduleId];
            if (m.status === 'completed' && prev && prev !== 'completed') {
                newlyCompleted.push(m);
            }
            this._lastKnownModuleStatuses[m.moduleId] = m.status;
        });

        // If this is the first load, just cache statuses — don't celebrate
        if (!this._progressLoadedOnce) {
            this._progressLoadedOnce = true;
            return;
        }

        // Celebrate each newly completed module
        newlyCompleted.forEach(m => this.celebrateModuleCompletion(m));
    }

    async celebrateModuleCompletion(mod) {
        // Call the complete-module endpoint to award XP and unlock next
        let xpAwarded = 0;
        let courseComplete = false;
        if (this.activeCourseSessionId) {
            try {
                const res = await csrfFetch(`/api/course-sessions/${this.activeCourseSessionId}/complete-module`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        moduleId: mod.moduleId,
                        checkpointPassed: mod.checkpointPassed || false
                    }),
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    xpAwarded = data.xpAwarded || 0;
                    courseComplete = data.courseComplete || false;
                }
            } catch (err) {
                console.warn('[CourseManager] Failed to record module completion:', err);
            }
        }

        // Fire confetti
        if (window.ensureConfetti) {
            await window.ensureConfetti();
        }
        if (typeof confetti === 'function') {
            const colors = ['#667eea', '#764ba2', '#22c55e', '#f59e0b', '#ffffff'];
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors });
            setTimeout(() => {
                confetti({ particleCount: 40, spread: 50, origin: { x: 0.2, y: 0.5 }, colors });
                confetti({ particleCount: 40, spread: 50, origin: { x: 0.8, y: 0.5 }, colors });
            }, 300);
        }

        // Show celebration card in chat
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const card = document.createElement('div');
        card.style.cssText = `
            margin: 16px auto; max-width: 440px; border-radius: 14px; overflow: hidden;
            box-shadow: 0 4px 16px rgba(34,197,94,0.2); animation: catalogSlideIn 0.4s ease;
            border: 2px solid ${courseComplete ? '#f59e0b' : '#22c55e'};
        `;

        const skills = (mod.skills || []).slice(0, 4);
        const skillsHtml = skills.length > 0
            ? skills.map(s => `<span style="display:inline-block; background:#f0fdf4; color:#16a34a; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; margin:2px;">${this.escapeHtml(s)}</span>`).join('')
            : '';

        const headerBg = courseComplete
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'linear-gradient(135deg, #22c55e, #16a34a)';
        const headerEmoji = courseComplete ? '🎓' : '🏆';
        const headerTitle = courseComplete ? 'Course Complete!' : 'Module Complete!';

        card.innerHTML = `
            <div style="background: ${headerBg}; padding: 20px; color: white; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 6px;">${headerEmoji}</div>
                <h3 style="margin: 0 0 2px; font-size: 17px; font-weight: 700;">${headerTitle}</h3>
                <p style="margin: 0; font-size: 14px; opacity: 0.95;">${this.escapeHtml(mod.title || mod.moduleId)}</p>
            </div>
            <div style="padding: 16px; background: white; text-align: center;">
                ${xpAwarded > 0 ? `<div style="font-size: 20px; font-weight: 800; color: #667eea; margin-bottom: 8px;">+${xpAwarded} XP</div>` : ''}
                ${skillsHtml ? `<div style="margin-bottom: 10px;">${skillsHtml}</div>` : ''}
                ${mod.checkpointPassed ? '<div style="font-size: 13px; color: #f59e0b; font-weight: 600; margin-bottom: 6px;"><i class="fas fa-medal"></i> Checkpoint Passed!</div>' : ''}
                <div style="font-size: 12px; color: #888; margin-top: 8px;">${courseComplete ? 'You did it! Time to celebrate.' : 'Keep going — you\'re building real momentum!'}</div>
            </div>
        `;

        chatBox.appendChild(card);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Extra confetti burst for course completion
        if (courseComplete && typeof confetti === 'function') {
            setTimeout(() => {
                for (let i = 0; i < 5; i++) {
                    setTimeout(() => {
                        confetti({ particleCount: 60, spread: 100, origin: { x: Math.random(), y: 0.3 }, colors: ['#f59e0b', '#667eea', '#22c55e'] });
                    }, i * 200);
                }
            }, 500);
        }
    }

    // --------------------------------------------------
    // Lesson transition card (subtle separator between lessons)
    // --------------------------------------------------
    showLessonTransition(transition) {
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const pct = transition.lessonsTotal > 0
            ? Math.round((transition.lessonsCompleted / transition.lessonsTotal) * 100)
            : 0;

        const card = document.createElement('div');
        card.className = 'lesson-transition-card';
        card.innerHTML = `
            <div class="lesson-transition-inner">
                <div class="lesson-transition-done">
                    <i class="fas fa-check-circle"></i>
                    <span>${this.escapeHtml(transition.completedLessonTitle)}</span>
                </div>
                <div class="lesson-transition-progress">
                    <div class="lesson-transition-track">
                        <div class="lesson-transition-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="lesson-transition-count">${transition.lessonsCompleted}/${transition.lessonsTotal} lessons</span>
                </div>
                <div class="lesson-transition-next">
                    <i class="fas fa-arrow-right"></i>
                    <span>Up next: <strong>${this.escapeHtml(transition.nextLessonTitle)}</strong></span>
                </div>
            </div>
        `;

        chatBox.appendChild(card);
        // Brief delay so the animation triggers after DOM insertion
        requestAnimationFrame(() => card.classList.add('visible'));
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --------------------------------------------------
    // Progress dropdown
    // --------------------------------------------------
    toggleProgressDropdown() {
        if (this.dropdownOpen) {
            this.closeProgressDropdown();
        } else {
            this.openProgressDropdown();
        }
    }

    async openProgressDropdown() {
        if (!this.activeCourseSessionId) return;

        const dropdown = document.getElementById('course-progress-dropdown');
        const arrow = document.getElementById('course-dropdown-arrow');
        if (!dropdown) return;

        // Fetch detailed progress
        try {
            const res = await csrfFetch(`/api/course-sessions/${this.activeCourseSessionId}/progress`, {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                // Detect newly completed modules
                this.detectCompletions(data.modules || []);

                this.renderModuleList(data);

                // Update breadcrumb from progress data
                const mod = document.getElementById('course-progress-module');
                if (mod && data.breadcrumb) {
                    const parts = [];
                    if (data.breadcrumb.unit) parts.push(`Unit ${data.breadcrumb.unit}`);
                    if (data.breadcrumb.lessonTitle) parts.push(data.breadcrumb.lessonTitle);
                    else if (data.breadcrumb.moduleName) parts.push(data.breadcrumb.moduleName);
                    mod.textContent = parts.join(' \u203A ');
                } else if (mod && data.next) {
                    mod.textContent = data.next.title || '';
                }

                // Update progress bar with latest data
                const fill = document.getElementById('course-progress-fill');
                const pct = document.getElementById('course-progress-pct');
                if (fill) fill.style.width = `${data.overallProgress || 0}%`;
                if (pct) pct.textContent = `${data.overallProgress || 0}%`;
            }
        } catch (err) {
            console.warn('[CourseManager] Failed to load progress:', err);
        }

        dropdown.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
        this.dropdownOpen = true;
    }

    closeProgressDropdown() {
        const dropdown = document.getElementById('course-progress-dropdown');
        const arrow = document.getElementById('course-dropdown-arrow');
        if (dropdown) dropdown.style.display = 'none';
        if (arrow) arrow.style.transform = '';
        this.dropdownOpen = false;
    }

    renderModuleList(data) {
        const list = document.getElementById('course-module-list');
        if (!list) return;

        list.innerHTML = '';

        const modules = data.modules || [];
        modules.forEach(m => {
            const el = document.createElement('div');
            el.className = 'module-item';

            // Status icon
            const iconMap = {
                completed:   'fa-check-circle',
                in_progress: 'fa-play-circle',
                available:   'fa-circle',
                locked:      'fa-lock'
            };
            const icon = iconMap[m.status] || 'fa-lock';
            const isCurrent = m.moduleId === data.currentModuleId;
            const unitLabel = m.unit ? `Unit ${m.unit}: ` : '';
            const lessonCount = m.lessons ? m.lessons.length : 0;
            const completedLessons = m.lessons ? m.lessons.filter(l => l.status === 'completed').length : 0;

            // Module header row
            let html = `
                <div class="module-header">
                    <i class="fas ${icon} module-icon ${m.status}"></i>
                    <div class="module-body">
                        <div class="module-title${isCurrent ? ' current' : ''}${m.status === 'locked' ? ' locked' : ''}">
                            ${unitLabel}${this.escapeHtml(m.title || m.moduleId)}
                        </div>
                        <div class="module-meta">
                            ${m.apWeight ? `<span class="module-badge ap">${m.apWeight}</span>` : ''}
                            ${lessonCount > 0 ? `<span class="module-badge lesson-count">${completedLessons}/${lessonCount} lessons</span>` : ''}
                        </div>
                        ${m.scaffoldProgress > 0 && m.status !== 'completed' ? `
                            <div class="module-scaffold-bar">
                                <div class="module-scaffold-fill" style="width: ${m.scaffoldProgress}%"></div>
                            </div>
                        ` : ''}
                    </div>
                    ${m.checkpointPassed ? '<i class="fas fa-medal module-checkpoint" title="Checkpoint passed"></i>' : ''}
                </div>`;

            // Lesson rows (only show for current/in-progress/available modules)
            if (m.lessons && m.lessons.length > 0 && (isCurrent || m.status === 'in_progress' || m.status === 'available')) {
                const sortedLessons = [...m.lessons].sort((a, b) => (a.order || 0) - (b.order || 0));
                sortedLessons.forEach(l => {
                    const lIconMap = {
                        completed:   'fa-check',
                        in_progress: 'fa-chevron-right',
                        available:   'fa-circle',
                        locked:      'fa-circle'
                    };
                    const lIcon = lIconMap[l.status] || 'fa-circle';
                    const isCurrentLesson = l.lessonId === data.currentLessonId;

                    html += `
                        <div class="module-lesson">
                            <i class="fas ${lIcon} module-lesson-icon ${l.status}"></i>
                            <span class="module-lesson-title${isCurrentLesson ? ' current' : ''}${l.status === 'locked' ? ' locked' : ''}">
                                ${this.escapeHtml(l.title || l.lessonId)}
                            </span>
                        </div>`;
                });
            }

            el.innerHTML = html;
            list.appendChild(el);
        });

        // Drop Course button at the bottom of the module list
        const dropRow = document.createElement('div');
        dropRow.className = 'module-list-footer';
        dropRow.innerHTML = `
            <button class="module-drop-btn">
                <i class="fas fa-sign-out-alt" style="margin-right:4px;"></i>Drop Course
            </button>
        `;
        dropRow.querySelector('.module-drop-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.activeCourseSessionId) {
                this.dropCourse(this.activeCourseSessionId);
            }
        });
        list.appendChild(dropRow);
    }

    // --------------------------------------------------
    // Catalog modal
    // --------------------------------------------------
    async openCatalog() {
        const modal = document.getElementById('course-catalog-modal');
        if (!modal) return;

        modal.classList.add('is-visible');

        const grid = document.getElementById('catalog-grid');
        if (grid) grid.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;">Loading courses...</div>';

        try {
            const res = await csrfFetch('/api/course-sessions/catalog', {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                this._catalogCache = data.catalog;
                this._catalogRecommended = data.recommended;
                this._activeFilter = 'All';
                this.renderCatalogWithSearch(data.catalog, data.recommended);
            }
        } catch (err) {
            console.error('[CourseManager] Failed to load catalog:', err);
            if (grid) grid.innerHTML = '<div style="text-align:center; padding:40px; color:#e74c3c;">Failed to load courses.</div>';
        }

        // Focus the search input for fast keyboard access
        setTimeout(() => {
            const searchInput = document.getElementById('catalog-search');
            if (searchInput) searchInput.focus();
        }, 300);
    }

    closeCatalog() {
        const modal = document.getElementById('course-catalog-modal');
        if (modal) modal.classList.remove('is-visible');
        // Remove the search bar so it's rebuilt fresh on next open
        const searchBar = document.getElementById('catalog-search-bar');
        if (searchBar) searchBar.remove();
        this._catalogCache = null;
    }

    /**
     * Render the search bar, filter pills, and catalog grid.
     * Replaces everything inside the catalog-grid parent container.
     */
    renderCatalogWithSearch(catalog, recommended) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        // Extract unique difficulty levels for filter pills
        const difficulties = ['All', ...new Set(catalog.map(c => c.difficulty).filter(Boolean))];

        // Build search bar + filter pills above the grid
        let searchContainer = document.getElementById('catalog-search-bar');
        if (!searchContainer) {
            searchContainer = document.createElement('div');
            searchContainer.id = 'catalog-search-bar';
            searchContainer.className = 'catalog-search-bar';
            grid.parentNode.insertBefore(searchContainer, grid);
        }

        searchContainer.innerHTML = `
            <div class="catalog-search-wrapper">
                <i class="fas fa-search"></i>
                <input type="text" id="catalog-search" class="catalog-search-input" placeholder="Search courses..." autocomplete="off">
            </div>
            <div class="catalog-filter-pills" id="catalog-filters">
                ${difficulties.map(d =>
                    `<button class="catalog-filter-pill${d === this._activeFilter ? ' active' : ''}" data-filter="${d}">${d}</button>`
                ).join('')}
            </div>
        `;

        // Wire up search input
        const searchInput = searchContainer.querySelector('#catalog-search');
        searchInput.addEventListener('input', () => this._filterCatalog());

        // Wire up filter pills
        searchContainer.querySelectorAll('.catalog-filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                this._activeFilter = pill.dataset.filter;
                searchContainer.querySelectorAll('.catalog-filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this._filterCatalog();
            });
        });

        // Render the grid with all courses
        this.renderCatalog(catalog, recommended);
    }

    /**
     * Client-side filtering of the cached catalog data.
     * Triggered by search input or filter pill click.
     */
    _filterCatalog() {
        if (!this._catalogCache) return;

        const searchInput = document.getElementById('catalog-search');
        const query = (searchInput?.value || '').toLowerCase().trim();

        let filtered = this._catalogCache;

        // Apply difficulty filter
        if (this._activeFilter && this._activeFilter !== 'All') {
            filtered = filtered.filter(c => c.difficulty === this._activeFilter);
        }

        // Apply text search
        if (query) {
            filtered = filtered.filter(c =>
                (c.title || '').toLowerCase().includes(query) ||
                (c.tagline || '').toLowerCase().includes(query) ||
                (c.group || '').toLowerCase().includes(query) ||
                (c.courseId || '').toLowerCase().includes(query)
            );
        }

        this.renderCatalog(filtered, this._catalogRecommended);
    }

    renderCatalog(catalog, recommended) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        grid.innerHTML = '';

        // Build a set of already-enrolled courseIds
        const enrolled = new Set(this.courseSessions.map(s => s.courseId));

        if (catalog.length === 0) {
            grid.innerHTML = `
                <div class="catalog-empty-state">
                    <i class="fas fa-search"></i>
                    <p>No courses match your search.</p>
                </div>`;
            return;
        }

        // Difficulty badge colors
        const diffColors = {
            'Foundational': { bg: '#ecfdf5', text: '#16a34a' },
            'Beginner': { bg: '#ecfdf5', text: '#16a34a' },
            'Intermediate': { bg: '#eff6ff', text: '#2563eb' },
            'Advanced': { bg: '#faf5ff', text: '#7c3aed' },
            'Applied': { bg: '#fef3c7', text: '#b45309' },
            'Test Prep': { bg: '#fefce8', text: '#ca8a04' }
        };

        // Estimated time per module (heuristic: ~45 min per module)
        const EST_MINUTES_PER_MODULE = 45;

        let lastGroup = '';
        catalog.forEach(course => {
            // Insert group header when group changes
            if (course.group && course.group !== lastGroup) {
                lastGroup = course.group;
                const header = document.createElement('div');
                header.style.cssText = 'grid-column: 1 / -1; padding: 12px 0 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 4px;';
                header.innerHTML = `<span style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #667eea;">${this.escapeHtml(course.group)}</span>`;
                grid.appendChild(header);
            }
            const card = document.createElement('div');
            const isRecommended = course.courseId === recommended;
            card.style.cssText = `border:1px solid ${isRecommended ? '#667eea' : '#e2e8f0'}; border-radius:12px; padding:16px; display:flex; gap:14px; transition:box-shadow 0.15s; position:relative;${isRecommended ? ' background: #f8f7ff;' : ''}`;
            card.onmouseover = () => { card.style.boxShadow = '0 4px 12px rgba(102,126,234,0.15)'; };
            card.onmouseout = () => { card.style.boxShadow = 'none'; };

            const isEnrolled = enrolled.has(course.courseId);
            const diff = diffColors[course.difficulty] || { bg: '#f1f5f9', text: '#64748b' };

            // Estimate total time for the course
            const totalMinutes = course.moduleCount * EST_MINUTES_PER_MODULE;
            const estTimeLabel = totalMinutes >= 60
                ? `~${Math.round(totalMinutes / 60)}h`
                : `~${totalMinutes}m`;

            card.innerHTML = `
                ${isRecommended ? '<div style="position:absolute; top:-8px; right:12px; background:linear-gradient(135deg, #667eea, #764ba2); color:white; padding:2px 10px; border-radius:10px; font-size:10px; font-weight:700;">RECOMMENDED</div>' : ''}
                <div style="min-width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #667eea, #764ba2); display:flex; align-items:center; justify-content:center; font-size:22px;">
                    ${course.icon || '\uD83D\uDCDA'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:700; font-size:15px; color:#333;">${this.escapeHtml(course.title)}</span>
                        ${course.difficulty ? `<span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:${diff.bg}; color:${diff.text};">${course.difficulty}</span>` : ''}
                        ${course.apWeight ? '<span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:#faf5ff; color:#7c3aed;">AP</span>' : ''}
                    </div>
                    ${course.tagline ? `<div style="font-size:13px; color:#555; margin-top:4px; line-height:1.4;">${this.escapeHtml(course.tagline)}</div>` : ''}
                    <div style="font-size:11px; color:#aaa; margin-top:4px; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                        <span>${course.moduleCount} modules</span>
                        <span style="color:#ddd;">&middot;</span>
                        <span><i class="fas fa-clock" style="font-size:9px; margin-right:2px;"></i>${estTimeLabel}</span>
                        ${course.prerequisites.length > 0 ? `<span style="color:#ddd;">&middot;</span><span>Prereq: ${course.prerequisites.join(', ')}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:4px;">
                    <button class="catalog-enroll-btn" data-course-id="${course.courseId}"
                        style="padding:8px 18px; border:none; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; white-space:nowrap;
                        ${isEnrolled
                            ? 'background:#f0f0f0; color:#888; cursor:default;'
                            : 'background:linear-gradient(135deg, #667eea, #764ba2); color:white;'
                        }"
                        ${isEnrolled ? 'disabled' : ''}>
                        ${isEnrolled ? '<i class="fas fa-check" style="margin-right:4px;"></i>Enrolled' : 'Enroll'}
                    </button>
                </div>
            `;

            // Wire up enroll button
            if (!isEnrolled) {
                const btn = card.querySelector('.catalog-enroll-btn');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.enrollInCourse(course.courseId, btn);
                });
            }

            grid.appendChild(card);
        });
    }

    // --------------------------------------------------
    // Enrollment
    // --------------------------------------------------
    async enrollInCourse(courseId, btnEl) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Enrolling...';
        }

        try {
            const res = await csrfFetch('/api/course-sessions/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId }),
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) {
                // If enrollment blocked by billing gate, show upgrade prompt
                if (res.status === 402 && data.upgradeRequired) {
                    this.closeCatalog();
                    if (window.showUpgradePrompt) {
                        window.showUpgradePrompt(data);
                    } else {
                        // Fallback: redirect to pricing page
                        window.location.href = '/pricing.html';
                    }
                } else {
                    this.showToast(data.message || 'Enrollment failed');
                }
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.textContent = 'Enroll';
                }
                return;
            }

            // Close catalog
            this.closeCatalog();

            // Refresh sidebar courses
            await this.loadMySessions();

            // Switch to the new course conversation
            if (data.conversationId && window.sidebar) {
                await window.sidebar.loadSessions();
                await window.sidebar.switchSession(data.conversationId);
            }

            // Show the progress bar
            this.activeCourseSessionId = data.session._id;
            this.updateProgressBar(data.session);
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'block';

            // Show welcome splash in the chat (with course tips for first-time, resume for returning)
            if (data.welcomeData) {
                this.showWelcomeSplash(data.welcomeData, data.resumed || false);
            } else {
                this.showToast(`Enrolled in ${data.session.courseName}! Let's get started.`);
            }

            // Begin teaching — UNLESS a required baseline (ACT practice test,
            // course pre-assessment) is pending. A course is prep and readiness,
            // so it must find out what the student already knows BEFORE it starts
            // teaching; otherwise it opens every student at module 1 ("what is a
            // real number") and the baseline never adapts the plan. The greeting
            // fires from onBaselineComplete() once the test is done.
            this.beginTeachingUnlessBaselinePending(data.welcomeData && data.welcomeData.diagnostic);

        } catch (err) {
            console.error('[CourseManager] Enrollment error:', err);
            this.showToast('Something went wrong. Please try again.');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Enroll';
            }
        }
    }

    // --------------------------------------------------
    // Activate a course (from sidebar click)
    // --------------------------------------------------
    async activateCourse(sessionId) {
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/activate`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) return;

            const session = data.session;

            // Switch sidebar to the course conversation
            if (session.conversationId && window.sidebar) {
                await window.sidebar.loadSessions();
                await window.sidebar.switchSession(session.conversationId);
            }

            // Show progress bar
            this.activeCourseSessionId = session._id;
            this.updateProgressBar(session);
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'block';

            // Switch sidebar to course context (hides sessions, leaderboard, quests)
            if (window.sidebar) window.sidebar.setContext('course');

            // Day-one diagnostic nudge for returning students (e.g. ACT-prep student
            // who never took the practice test) — shown as a standalone card.
            if (data.diagnostic) this.showDiagnosticCard(data.diagnostic);

            // Same gate as enroll: no teaching until a required baseline is done.
            this.beginTeachingUnlessBaselinePending(data.diagnostic);

        } catch (err) {
            console.error('[CourseManager] Failed to activate course:', err);
        }
    }

    // --------------------------------------------------
    // --------------------------------------------------
    // Begin teaching, unless a required baseline is still pending.
    //
    // The tutor greeting introduces module 1 and starts teaching. It must NOT
    // fire while a `required` diagnostic (ACT practice test, course
    // pre-assessment) is unanswered — the whole point of the baseline is to run
    // FIRST and adapt the plan. When one is pending we stay quiet and let the
    // diagnostic card lead; onBaselineComplete() fires the greeting afterward,
    // by which time the course has been retargeted to the student's real level.
    // --------------------------------------------------
    beginTeachingUnlessBaselinePending(diagnostic) {
        if (diagnostic && diagnostic.required) {
            this._baselinePending = true;
            // Registration step: for the ACT baseline, take the student straight
            // INTO the runner (which now lands on its Begin screen — no auto-timer)
            // instead of just holding the greeting behind a dismissible card. The
            // baseline becomes the door you walk through to reach the tutor, not a
            // nag you can skip. The greeting stays held until the runner finishes
            // and calls onBaselineComplete(); the welcome splash + its card remain
            // behind the modal as the fallback if the student closes it early.
            // Other required diagnostics keep the existing card-only behaviour.
            // `typeof` guard: this file is also loaded in node by the unit tests,
            // where `window` does not exist.
            if (diagnostic.type === 'act-practice' && typeof window !== 'undefined' && window.openActTest) {
                setTimeout(() => { try { window.openActTest(); } catch (e) {} }, 350);
            }
            return;
        }
        this._baselinePending = false;
        this.sendCourseGreeting();
    }

    // Called by the ACT test and the pre-assessment when their baseline finishes.
    // Fires the greeting that beginTeachingUnlessBaselinePending() held back, now
    // that the course knows the student's level. Guarded so a stray call (e.g. a
    // cancelled test) or a course that never gated cannot double-greet.
    onBaselineComplete() {
        if (!this._baselinePending) return;
        this._baselinePending = false;
        this.sendCourseGreeting();
    }

    // --------------------------------------------------
    // Silent Course Greeting
    // Calls /api/course-chat with isGreeting flag so the AI
    // greets the student with full course/module context.
    // No user message is shown — it appears tutor-initiated.
    // --------------------------------------------------
    async sendCourseGreeting() {
        try {
            // Show thinking indicator while greeting loads
            if (window.showThinkingIndicator) window.showThinkingIndicator(true);

            const res = await csrfFetch('/api/course-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isGreeting: true }),
                credentials: 'include'
            });

            if (window.showThinkingIndicator) window.showThinkingIndicator(false);

            const data = await res.json();

            // The server withheld the greeting because a required baseline is not
            // done. Show the baseline card and teach nothing — the server is the
            // source of truth here, so even if the client gate was bypassed (or
            // its bundle failed to load), no greeting is rendered or persisted.
            if (data.baselineRequired) {
                this._baselinePending = true;
                if (data.diagnostic) this.showDiagnosticCard(data.diagnostic);
                return;
            }

            // Server deferred the greeting: the tutor spoke seconds ago and the
            // student is mid-exchange — a second lesson start would collide with
            // the live one. Render nothing; the course resumes naturally on the
            // student's next turn.
            if (data.greetingDeferred) {
                console.log('[CourseManager] Course greeting deferred (active exchange)');
                return;
            }

            // If the current module is a checkpoint, open the card-based UI instead of chat
            if (data.isCheckpoint && window.floatingCheckpoint) {
                window.floatingCheckpoint.open({ title: data.checkpointTitle });
                return;
            }

            // The server may have started a fresh course sitting (a new login,
            // or an idle gap). The transcript on screen was painted by the
            // switchSession that ran before this request, so it can still be
            // showing the sitting we just left — appending the new greeting
            // under it is exactly the stacked-transcript view we're fixing.
            // Clear to the conversation the server actually wrote to.
            if (data.conversationId
                && (data.sessionRolled || String(data.conversationId) !== String(window.currentConversationId))
                && typeof window.updateChatForSession === 'function') {
                window.updateChatForSession({ _id: data.conversationId, conversationType: 'general' }, []);
            }

            if (data.text && window.appendMessage) {
                window.appendMessage(data.text, 'ai');
            }
            // Feed the lesson tracker from greeting response
            if (data.progressUpdate && window.lessonTracker) {
                window.lessonTracker.update(data.progressUpdate);
            }
        } catch (err) {
            if (window.showThinkingIndicator) window.showThinkingIndicator(false);
            console.error('[CourseManager] Course greeting failed:', err);
        }
    }

    // --------------------------------------------------
    // Exit Course (deactivate — return to general tutoring)
    // --------------------------------------------------
    async exitCourse() {
        this.closeProgressDropdown();

        const confirmed = await this.showConfirmation({
            icon: '📖',
            title: 'Exit this lesson?',
            message: 'Your progress is saved — you can pick up where you left off anytime.',
            confirmLabel: 'Exit Lesson',
            confirmClass: 'secondary',
            cancelLabel: 'Keep Learning'
        });

        if (!confirmed) return;

        try {
            await csrfFetch('/api/course-sessions/deactivate', {
                method: 'POST',
                credentials: 'include'
            });

            // Hide progress bar and lesson tracker
            const wrapper = document.getElementById('course-progress-wrapper');
            if (wrapper) wrapper.style.display = 'none';
            if (window.lessonTracker) window.lessonTracker.hide();
            this.activeCourseSessionId = null;

            // Switch sidebar back to general context
            if (window.sidebar) window.sidebar.setContext('general');

            // Start a fresh general chat session so the user isn't
            // left staring at stale course messages
            if (window.sidebar) {
                await window.sidebar.loadSessions();
                await window.sidebar.createNewSession();
            }

            this.showToast('Returned to general tutoring');
        } catch (err) {
            console.error('[CourseManager] Failed to exit course:', err);
        }
    }

    // --------------------------------------------------
    // Drop Course (remove from My Courses via X button)
    // --------------------------------------------------
    async dropCourse(sessionId) {
        const session = this.courseSessions.find(s => s._id === sessionId);
        const name = this.formatCourseName(session?.courseName || 'this course');

        const confirmed = await this.showConfirmation({
            icon: '👋',
            title: `Leave "${name}"?`,
            message: 'Your progress will be saved and you can re-enroll later.',
            confirmLabel: 'Leave Course',
            confirmClass: 'danger',
            cancelLabel: 'Stay Enrolled'
        });

        if (!confirmed) return;

        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/drop`, {
                method: 'POST',
                credentials: 'include'
            });

            const data = await res.json();
            if (!data.success) {
                this.showToast(data.message || 'Failed to leave course');
                return;
            }

            // If this was the active course, hide the progress bar
            if (this.activeCourseSessionId === sessionId) {
                const wrapper = document.getElementById('course-progress-wrapper');
                if (wrapper) wrapper.style.display = 'none';
                this.activeCourseSessionId = null;
                this.closeProgressDropdown();
            }

            // Refresh sidebar courses
            await this.loadMySessions();

            this.showToast(`Left "${name}"`);
        } catch (err) {
            console.error('[CourseManager] Failed to drop course:', err);
            this.showToast('Something went wrong');
        }
    }

    // --------------------------------------------------
    // Next Lesson (placeholder — advances module scaffold)
    // --------------------------------------------------
    onNextLesson() {
        // Prompt the AI to move on by injecting text and triggering send
        const input = document.getElementById('user-input');
        if (input) {
            input.textContent = "I'm ready for the next lesson!";
            input.focus();
            // Trigger submit via the send button
            const sendBtn = document.getElementById('send-button');
            if (sendBtn) sendBtn.click();
        }
        this.closeProgressDropdown();
    }

    // --------------------------------------------------
    // Day-one diagnostic card (e.g. ACT prep → "Take the Practice ACT"). The CTA
    // launches the practice test; the button removes whichever card container it
    // lives in (the welcome splash when embedded, or its own card when standalone).
    // --------------------------------------------------
    diagnosticCardHtml(diag) {
        if (!diag || !diag.type) return '';
        // type → the client launcher invoked by the CTA. Starting Point mirrors
        // the existing inline-CTA path (floatingScreener, falling back to
        // window.openStartingPoint). Unknown types render nothing.
        const sessionId = this.activeCourseSessionId || '';
        const launchers = {
            'act-practice': 'if (window.openActTest) { window.openActTest(); }',
            'starting-point': "if (window.floatingScreener) { Promise.resolve(window.floatingScreener.checkAssessmentStatus()).then(function(){ window.floatingScreener.open(); }).catch(function(){}); } else if (window.openStartingPoint) { window.openStartingPoint(); }",
            'course-preassessment': `if (window.openCoursePreAssessment) { window.openCoursePreAssessment('${sessionId}', { required: ${!!diag.required} }); }`,
        };
        const launch = launchers[diag.type];
        if (!launch) return '';
        // A REQUIRED diagnostic (the ACT baseline, a course pre-assessment) must
        // not remove its own card on click. If the student closes the test
        // without finishing, the card has to still be there — otherwise "required"
        // means "required until you click it once".
        const dismiss = diag.required
            ? ''
            : "(this.closest('.course-welcome-splash') || this.closest('.course-diagnostic-wrap') || this.closest('.course-diagnostic-card'))?.remove();";
        return `
            <div class="course-diagnostic-card" style="margin-top:16px; padding:16px; border-radius:12px; background:linear-gradient(135deg,#eef2ff,#faf5ff); border:1px solid #c7d2fe;">
                <div style="font-size:14px; font-weight:700; color:#4338ca; margin-bottom:6px;">
                    <i class="fas fa-clipboard-check" style="margin-right:6px;"></i>${this.escapeHtml(diag.title)}
                </div>
                <div style="font-size:12px; color:#555; line-height:1.5; margin-bottom:12px;">${this.escapeHtml(diag.body)}</div>
                ${diag.required ? '<div style="font-size:11px; font-weight:700; color:#b45309; margin-bottom:10px;"><i class="fas fa-lock" style="margin-right:5px;"></i>Start here — this sets your baseline.</div>' : ''}
                <button class="course-diagnostic-cta" onclick="${dismiss} ${launch}" style="
                    width:100%; padding:12px; border:none; border-radius:10px;
                    background:linear-gradient(135deg,#4f46e5,#7c3aed); color:white;
                    font-weight:700; font-size:14px; cursor:pointer;
                "><i class="fas fa-play" style="margin-right:6px;"></i>${this.escapeHtml(diag.cta)}</button>
            </div>`;
    }

    // Fetch + show the day-one diagnostic for an already-active course on page
    // load (checkActiveProgressBar). Non-fatal; the server returns null once the
    // student has completed the diagnostic, so the card stops appearing.
    async maybeShowActiveDiagnostic(sessionId) {
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/diagnostic`, {
                credentials: 'include'
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.diagnostic) this.showDiagnosticCard(data.diagnostic);
        } catch {
            /* non-fatal — diagnostic is a nudge, never blocks the course */
        }
    }

    // Show the diagnostic card on its own (returning students who re-open the
    // course from the sidebar, i.e. activateCourse — no welcome splash there).
    showDiagnosticCard(diag) {
        const html = this.diagnosticCardHtml(diag);
        if (!html) return;
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;
        if (chatBox.querySelector('.course-diagnostic-card')) return; // don't stack duplicates
        const wrap = document.createElement('div');
        wrap.className = 'course-diagnostic-wrap';
        wrap.style.cssText = 'margin:16px auto; max-width:520px; animation:catalogSlideIn 0.4s ease;';
        wrap.innerHTML = html;
        chatBox.appendChild(wrap);
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Welcome splash (shown in chat after enrollment)
    // --------------------------------------------------
    showWelcomeSplash(welcome, isResume = false) {
        const chatBox = document.getElementById('chat-messages-container');
        if (!chatBox) return;

        const splash = document.createElement('div');
        splash.className = 'course-welcome-splash';
        splash.style.cssText = `
            margin: 20px auto; max-width: 520px; border-radius: 16px; overflow: hidden;
            box-shadow: 0 4px 20px rgba(102,126,234,0.15); animation: catalogSlideIn 0.4s ease;
        `;

        // Build unit list (first 6)
        const units = (welcome.units || []);
        const unitListHtml = units.map((u, i) =>
            `<div style="display:flex; align-items:center; gap:8px; padding:6px 0;">
                <div style="width:24px; height:24px; border-radius:50%; background:${i === 0 ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#e2e8f0'}; color:${i === 0 ? 'white' : '#888'}; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">${i + 1}</div>
                <span style="font-size:13px; color:${i === 0 ? '#333' : '#666'}; font-weight:${i === 0 ? '600' : '400'};">${this.escapeHtml(u)}</span>
            </div>`
        ).join('');

        // Day-one diagnostic card (e.g. ACT prep → take a full practice ACT first),
        // embedded in the welcome splash. See diagnosticCardHtml().
        const diagnosticHtml = this.diagnosticCardHtml(welcome.diagnostic);

        // Course mini-tour tips (shown below the learning path for first-time enrollees)
        const courseTipsHtml = isResume ? '' : `
            <div class="course-tips" style="margin-top:16px; border-top:1px solid #f0f0f0; padding-top:14px;">
                <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#667eea; letter-spacing:0.05em; margin-bottom:10px;">
                    <i class="fas fa-lightbulb" style="margin-right:4px;"></i> How Courses Work
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">1</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">Your tutor leads the lesson</div>
                            <div style="font-size:12px; color:#777;">No need to pick a topic &mdash; your AI tutor teaches concepts, walks through examples, then gives you practice problems.</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">2</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">Progress bar tracks your journey</div>
                            <div style="font-size:12px; color:#777;">The bar at the top shows your current module and step. Click it to see all modules and your overall progress.</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, #667eea, #764ba2); color:white; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0;">3</div>
                        <div>
                            <div style="font-size:13px; font-weight:600; color:#333;">You advance by showing mastery</div>
                            <div style="font-size:12px; color:#777;">Solve practice problems correctly and your tutor will move you to the next step automatically. No rushing &mdash; go at your own pace.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        splash.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 24px; color: white; text-align: center;">
                <div style="font-size: 36px; margin-bottom: 8px;">${isResume ? '👋' : '🎓'}</div>
                <h2 style="margin: 0 0 4px; font-size: 20px; font-weight: 700;">${isResume ? 'Welcome Back!' : 'Welcome to'} ${this.escapeHtml(welcome.courseName)}</h2>
                <p style="margin: 0; opacity: 0.9; font-size: 13px;">${welcome.moduleCount} modules · Self-paced · AI-guided</p>
            </div>
            <div style="padding: 20px; background: white;">
                ${welcome.overview ? `<p style="font-size: 13px; color: #555; margin: 0 0 16px; line-height: 1.5;">${this.escapeHtml(welcome.overview)}</p>` : ''}
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.05em; margin-bottom: 8px;">Your Learning Path</div>
                ${unitListHtml}
                ${units.length < welcome.moduleCount ? `<div style="font-size: 12px; color: #aaa; padding: 4px 0 0 32px;">+${welcome.moduleCount - units.length} more modules</div>` : ''}
                ${courseTipsHtml}
                ${diagnosticHtml}
                <div style="margin-top: 16px; padding: 8px 12px; background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; font-size: 11px; color: #b45309; display: flex; align-items: flex-start; gap: 6px;">
                    <i class="fas fa-circle-exclamation" style="margin-top: 1px; flex-shrink: 0;"></i>
                    <span><strong>Disclaimer:</strong> These courses do not count for academic credit and are not meant to replace in-person instruction.</span>
                </div>
                <button onclick="this.closest('.course-welcome-splash').remove()" style="
                    margin-top: 16px; width: 100%; padding: 12px; border-radius: 10px;
                    ${diagnosticHtml
                        ? 'border: 1px solid #c7d2fe; background: white; color: #4f46e5;'
                        : 'border: none; background: linear-gradient(135deg, #667eea, #764ba2); color: white;'}
                    font-weight: 700; font-size: 14px; cursor: pointer;
                "><i class="fas fa-play" style="margin-right: 6px;"></i>${diagnosticHtml
                        ? `Skip for now — start ${this.escapeHtml(welcome.firstModuleTitle)}`
                        : (isResume ? 'Continue Learning' : `Start ${this.escapeHtml(welcome.firstModuleTitle)}`)}</button>
            </div>
        `;

        chatBox.appendChild(splash);
        splash.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --------------------------------------------------
    // Utilities
    // --------------------------------------------------
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /** Turn slug-style names like "ap-calculus-ab" into "AP Calculus AB" */
    formatCourseName(name) {
        if (!name) return '';
        // Already looks like a proper name (contains spaces and no hyphens between words)
        if (/[A-Z]/.test(name) && name.includes(' ')) return name;
        const UPPER = new Set(['ap', 'ab', 'bc', 'act', 'sat']);
        return name.split('-').map(w => UPPER.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: #333; color: white; padding: 12px 24px; border-radius: 10px;
            font-size: 14px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: fadeInUp 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Styled confirmation modal — replaces native confirm() dialogs.
     * Returns a Promise<boolean>.
     */
    showConfirmation({ icon = '', title = 'Are you sure?', message = '', confirmLabel = 'Confirm', confirmClass = 'primary', cancelLabel = 'Cancel' }) {
        return new Promise(resolve => {
            // Remove any existing confirmation
            document.querySelector('.course-confirm-overlay')?.remove();

            const overlay = document.createElement('div');
            overlay.className = 'course-confirm-overlay';
            overlay.innerHTML = `
                <div class="course-confirm-card">
                    ${icon ? `<div class="course-confirm-icon">${icon}</div>` : ''}
                    <div class="course-confirm-title">${this.escapeHtml(title)}</div>
                    <div class="course-confirm-message">${this.escapeHtml(message)}</div>
                    <div class="course-confirm-actions">
                        <button class="course-confirm-btn secondary" data-action="cancel">${this.escapeHtml(cancelLabel)}</button>
                        <button class="course-confirm-btn ${confirmClass}" data-action="confirm">${this.escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            `;

            // Close on overlay background click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve(false);
                }
            });

            // Button handlers
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });
            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                overlay.remove();
                resolve(true);
            });

            document.body.appendChild(overlay);

            // Auto-focus the cancel button (safe default)
            overlay.querySelector('[data-action="cancel"]').focus();
        });
    }
}

// Auto-initialise after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.courseManager = new CourseManager();
});

console.log('[CourseManager] Module loaded');

// Exposed for unit tests (node). Harmless in the browser, where `module` is
// undefined. The class is never auto-instantiated on require — that happens only
// inside the DOMContentLoaded handler above.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CourseManager };
}

;
/* --- /js/lessonTracker.js --- */
// ============================================
// LESSON PROGRESS TRACKER
// Renders a student-safe, calm progress UI from
// the server-authoritative progressUpdate payload.
// Called on every /api/course-chat response and
// on page load via the rehydration endpoint.
// ============================================

class LessonTracker {
    constructor() {
        this._lastUpdate = null;
        this._devMode = false; // Toggle via LessonTracker.dev()
        this._initialized = false;
    }

    // --------------------------------------------------
    // Public API
    // --------------------------------------------------

    /**
     * Update the tracker with a progressUpdate payload.
     * Called after every course-chat response.
     */
    update(progressUpdate) {
        if (!progressUpdate) return;
        this._lastUpdate = progressUpdate;
        this._render(progressUpdate);
    }

    /**
     * Rehydrate: fetch progress from server and render.
     * Called on page load, tab refocus, reconnect.
     */
    async rehydrate(sessionId) {
        if (!sessionId) return;
        this._sessionId = sessionId; // needed by the missed-number rail's jump call
        try {
            const res = await csrfFetch(`/api/course-sessions/${sessionId}/lesson-progress`, {
                method: 'GET',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success && data.progressUpdate) {
                this.update(data.progressUpdate);
            }
        } catch (err) {
            console.warn('[LessonTracker] Rehydration failed:', err);
        }
    }

    /**
     * Show the tracker (when entering a course).
     */
    show() {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper) wrapper.style.display = 'block';
    }

    /**
     * Hide the tracker (when exiting a course).
     */
    hide() {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    }

    /**
     * Toggle dev overlay for debugging.
     */
    static dev() {
        if (window.lessonTracker) {
            window.lessonTracker._devMode = !window.lessonTracker._devMode;
            if (window.lessonTracker._lastUpdate) {
                window.lessonTracker._render(window.lessonTracker._lastUpdate);
            }
            console.log(`[LessonTracker] Dev mode: ${window.lessonTracker._devMode ? 'ON' : 'OFF'}`);
        }
    }

    // --------------------------------------------------
    // Rendering
    // --------------------------------------------------

    _render(pu) {
        // ACT bootcamp: the course is a test→review→re-test loop, not a
        // gradual-release scaffold, so render the loop view instead of the
        // Warm-up/Learn/Practice stepper — for act-prep ALWAYS, even before the
        // first baseline (pre-baseline shows a "start your baseline" state).
        if (pu && pu.courseId === 'act-prep') {
            return this._renderBootcamp(pu);
        }
        // Not in bootcamp mode — restore the standard tracker chrome if the
        // bootcamp panel was showing.
        const bcPanel = document.getElementById('lt-bootcamp');
        if (bcPanel) bcPanel.style.display = 'none';
        const ltContainer = document.querySelector('#lesson-tracker-wrapper .lt-container');
        if (ltContainer) ltContainer.style.display = '';

        // Lesson breadcrumb (shows module > lesson context)
        this._renderBreadcrumb(pu);

        // Phase dots
        this._renderPhaseDots(pu.phaseGroups);

        // Main progress bar — use server-computed displayPct directly (no client math)
        const displayPct = pu.displayPct || 0;
        const fill = document.getElementById('lt-progress-fill');
        const stepText = document.getElementById('lt-step-label');
        const phaseText = document.getElementById('lt-phase-label');

        if (fill) {
            fill.style.width = `${displayPct}%`;
        }
        if (stepText) {
            stepText.textContent = pu.stepLabel || '';
        }
        if (phaseText) {
            phaseText.textContent = pu.phaseLabel || '';
        }

        // Details panel (expandable)
        this._renderDetails(pu);

        // Dev overlay
        this._renderDevOverlay(pu);

        // Ensure visibility
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (wrapper && wrapper.style.display === 'none') {
            wrapper.style.display = 'block';
        }
    }

    // ── ACT bootcamp loop view (replaces the scaffold stepper for act-prep) ──
    _renderBootcamp(pu) {
        const wrapper = document.getElementById('lesson-tracker-wrapper');
        if (!wrapper) return;
        const ltContainer = wrapper.querySelector('.lt-container');
        if (ltContainer) ltContainer.style.display = 'none';
        let panel = document.getElementById('lt-bootcamp');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'lt-bootcamp';
            panel.style.padding = '4px 0';
            wrapper.appendChild(panel);
        }
        panel.innerHTML = this._bootcampHtml(pu.bootcamp, pu.diagnosticPlan);
        panel.style.display = 'block';
        wrapper.style.display = 'block';
        this._wireBootcamp();
        this._loadBootcampScore();
    }

    _bootcampHtml(bc, dp) {
        bc = bc || {};
        const CAT = { 'integrating-essential-skills': 'Essential skills', 'number-quantity': 'Number & Quantity', algebra: 'Algebra', functions: 'Functions', geometry: 'Geometry', 'statistics-probability': 'Statistics & Probability' };
        const label = (c) => CAT[c] || String(c || '').replace(/-/g, ' ');
        const hasBaseline = !!bc.phase;   // bootcamp state only exists once a test is scored
        const total = Array.isArray(bc.queue) ? bc.queue.length : 0;
        const reviewed = Math.min(bc.index || 0, total);
        const pct = total ? Math.round((100 * reviewed) / total) : 0;
        const round = bc.round || 1;
        const isReview = bc.phase === 'review' && total > 0;
        const cur = isReview && Array.isArray(bc.queue) ? bc.queue[bc.index] : null;

        const step = (icon, name, state) => {
            const style = state === 'active'
                ? 'background:rgba(255,255,255,.22);color:#fff;font-weight:600'
                : state === 'done' ? 'color:rgba(255,255,255,.85)' : 'color:rgba(255,255,255,.5)';
            return `<div style="flex:1;text-align:center;padding:8px 4px;border-radius:8px;font-size:12px;${style}"><i class="fas ${icon}"></i> ${name}</div>`;
        };
        const loop = `<div style="display:flex;gap:6px;margin:10px 0 14px">
            ${step('fa-flag-checkered', 'Baseline', hasBaseline ? 'done' : 'active')}
            ${step('fa-bullseye', 'Review', isReview ? 'active' : (hasBaseline ? 'done' : 'todo'))}
            ${step('fa-clipboard-list', 'Re-test', bc.phase === 'reassess' ? 'active' : 'todo')}
            ${step('fa-chart-line', 'Compare', 'todo')}
          </div>`;

        const phaseCard = !hasBaseline ? `
            <div style="background:rgba(255,255,255,.14);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="color:#fff;font-size:13.5px;font-weight:500">Start with your baseline ACT — a full timed test that sets your starting score and shows exactly what to work on.</span>
              <button id="lt-bc-start" style="background:#fff;color:#5b3ea8;border:0;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer">Start baseline</button>
            </div>` : isReview ? `
            <div style="background:rgba(255,255,255,.14);border-radius:12px;padding:12px 14px">
              <div style="display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:14px;font-weight:600;margin-bottom:8px"><span>Going over what you missed</span><span style="font-weight:500;font-size:12.5px;opacity:.85">${reviewed} of ${total} done</span></div>
              <div style="height:7px;background:rgba(255,255,255,.22);border-radius:5px;overflow:hidden;margin-bottom:10px"><div style="width:${pct}%;height:100%;background:#fff;border-radius:5px"></div></div>
              ${this._numberRailHtml(bc)}
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="color:rgba(255,255,255,.9);font-size:12.5px">Up next: <strong>${cur && cur.position != null ? `#${cur.position} · ` : ''}${cur ? label(cur.category) : '—'}</strong></span>
                <button id="lt-bc-continue" style="background:#fff;color:#5b3ea8;border:0;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer">Continue in chat</button>
              </div>
            </div>` : `
            <div style="background:rgba(255,255,255,.14);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="color:#fff;font-size:13.5px;font-weight:500">You've reviewed your misses — take a fresh test to measure your gains.</span>
              <button id="lt-bc-retest" style="background:#fff;color:#5b3ea8;border:0;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer">Take a fresh test</button>
            </div>`;

        const chips = (dp && (dp.focusCategories || dp.masteredCategories)) ? `
            <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">
              ${(dp.focusCategories || []).map((c) => `<span style="background:rgba(255,255,255,.2);color:#fff;font-size:11.5px;padding:3px 9px;border-radius:20px">${label(c)}</span>`).join('')}
              ${(dp.masteredCategories || []).map((c) => `<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.75);font-size:11.5px;padding:3px 9px;border-radius:20px"><i class="fas fa-check" style="font-size:10px"></i> ${label(c)}</span>`).join('')}
            </div>` : '';

        return `
          <div style="background:linear-gradient(135deg,#667eea,#764ba2);border-radius:14px;padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="color:#fff;font-size:15px;font-weight:700">🎯 ACT bootcamp <span style="font-weight:500;font-size:12px;background:rgba(255,255,255,.2);padding:2px 9px;border-radius:20px;margin-left:4px">Round ${round}</span></span>
              <span id="lt-bc-score" style="color:#fff;font-size:13px;opacity:.9"></span>
            </div>
            ${loop}
            ${phaseCard}
            ${chips}
            ${hasBaseline ? `<div style="margin-top:12px;text-align:right"><a id="lt-bc-progress" href="#" style="color:#fff;font-size:12px;opacity:.9;text-decoration:none"><i class="fas fa-chart-line"></i> See your progress</a></div>` : ''}
          </div>`;
    }

    /**
     * The missed-number rail: every question they missed, as a clickable
     * number in test order ("maybe they missed 2, 4, 5, 12, 19, 23, 35…").
     * Review runs in order unless the student clicks a number to jump.
     * Renders nothing for queues that predate position-stamping — wrong
     * numbers would be worse than none.
     */
    _numberRailHtml(bc) {
        const queue = Array.isArray(bc.queue) ? bc.queue : [];
        if (!queue.length || !queue.some((q) => q && q.position != null)) return '';
        const idx = bc.index || 0;
        const chip = (q, i) => {
            if (q.position == null) return '';
            const isCur = i === idx;
            const done = q.status === 'reviewed';
            const style = isCur
                ? 'background:#fff;color:#5b3ea8;font-weight:700'
                : done
                    ? 'background:rgba(255,255,255,.08);color:rgba(255,255,255,.55);text-decoration:line-through'
                    : 'background:rgba(255,255,255,.2);color:#fff;cursor:pointer';
            const title = done ? 'Reviewed — click to revisit' : (isCur ? 'Up next' : 'Click to work this one next');
            return `<button data-bc-jump="${i}" title="${title}" style="border:0;border-radius:8px;min-width:30px;padding:4px 7px;font-size:12px;cursor:pointer;${style}">${q.position}</button>`;
        };
        return `<div style="margin-bottom:10px">
            <div style="color:rgba(255,255,255,.8);font-size:11.5px;margin-bottom:5px">Questions you missed — tap one to jump, or just keep going in order:</div>
            <div id="lt-bc-numbers" style="display:flex;flex-wrap:wrap;gap:5px">${queue.map(chip).join('')}</div>
          </div>`;
    }

    /** Repaint the bootcamp panel from a chat-turn payload (data.actBootcamp). */
    updateBootcamp(bc) {
        if (!bc || !this._lastUpdate) return;
        this._lastUpdate.bootcamp = bc;
        this._renderBootcamp(this._lastUpdate);
    }

    async _jumpTo(i) {
        if (!this._sessionId) return;
        try {
            const fetcher = window.csrfFetch || window.fetch;
            const res = await fetcher(`/api/course-sessions/${this._sessionId}/bootcamp/jump`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ index: i })
            });
            const data = await res.json();
            if (!data.success) return;
            this.updateBootcamp(data.bootcamp);
            const q = (data.bootcamp.queue || [])[i];
            // Pull the question into the conversation so the tutor presents it
            // this turn instead of waiting for the student to say something.
            if (q && q.position != null && typeof window.mmSendChatMessage === 'function') {
                window.mmSendChatMessage(`Let's go over question ${q.position}.`);
            }
        } catch (e) { console.warn('[LessonTracker] Jump failed:', e); }
    }

    _wireBootcamp() {
        const rail = document.getElementById('lt-bc-numbers');
        if (rail) rail.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-bc-jump]');
            if (btn) this._jumpTo(Number(btn.getAttribute('data-bc-jump')));
        });
        const cont = document.getElementById('lt-bc-continue');
        if (cont) cont.addEventListener('click', () => {
            const input = document.getElementById('user-input') || document.getElementById('chat-input');
            if (input) input.focus();
        });
        const retest = document.getElementById('lt-bc-retest');
        if (retest) retest.addEventListener('click', () => { if (window.openActTest) window.openActTest(); });
        const start = document.getElementById('lt-bc-start');
        if (start) start.addEventListener('click', () => { if (window.openActTest) window.openActTest(); });
        const prog = document.getElementById('lt-bc-progress');
        if (prog) prog.addEventListener('click', (e) => { e.preventDefault(); if (window.openActProgress) window.openActProgress(); });
    }

    async _loadBootcampScore() {
        try {
            const fetcher = window.csrfFetch || window.fetch;
            const r = await fetcher('/api/act-test/history').then((x) => x.json()).catch(() => null);
            const a = ((r && r.attempts) || []).filter((x) => x.scaledScore != null);
            const el = document.getElementById('lt-bc-score');
            if (!el || !a.length) return;
            if (a.length === 1) { el.textContent = `Score ${a[0].scaledScore}`; return; }
            const first = a[0].scaledScore, latest = a[a.length - 1].scaledScore, d = latest - first;
            el.innerHTML = `${first} &rarr; ${latest}${d > 0 ? ` <span style="background:rgba(255,255,255,.25);padding:1px 7px;border-radius:20px;font-size:11px">&#9650; +${d}</span>` : ''}`;
        } catch (e) { /* non-fatal */ }
    }

    _renderBreadcrumb(pu) {
        const container = document.getElementById('lt-breadcrumb');
        if (!container) return;

        // Build breadcrumb from course progress data
        // The lessonId in progressUpdate maps to the current lesson
        const session = window.courseManager?.courseSessions?.find(
            s => s._id === pu.sessionId
        );

        if (!session) {
            container.style.display = 'none';
            return;
        }

        const currentMod = (session.modules || []).find(
            m => m.moduleId === session.currentModuleId
        );

        if (!currentMod) {
            container.style.display = 'none';
            return;
        }

        const parts = [];
        if (currentMod.title) parts.push(currentMod.title);

        const currentLesson = session.currentLessonId && currentMod.lessons
            ? currentMod.lessons.find(l => l.lessonId === session.currentLessonId)
            : null;
        if (currentLesson?.title) parts.push(currentLesson.title);

        if (parts.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = `
            <i class="fas fa-book-open lt-breadcrumb-icon"></i>
            ${parts.map((p, i) =>
                (i > 0 ? '<span class="lt-breadcrumb-sep">\u203A</span>' : '') +
                (i === parts.length - 1
                    ? `<span class="lt-breadcrumb-lesson">${this._escapeHtml(p)}</span>`
                    : `<span>${this._escapeHtml(p)}</span>`)
            ).join('')}
        `;
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _renderPhaseDots(phaseGroups) {
        const container = document.getElementById('lt-phase-dots');
        if (!container || !phaseGroups) return;

        container.innerHTML = phaseGroups.map(pg => {
            let dotClass = 'lt-dot-future';
            let icon = '';
            if (pg.status === 'completed') {
                dotClass = 'lt-dot-completed';
                icon = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            } else if (pg.status === 'current') {
                dotClass = 'lt-dot-current';
                icon = '<div class="lt-dot-pulse"></div>';
            }

            return `
                <div class="lt-phase-group ${dotClass}" title="${pg.label}">
                    <div class="lt-dot">${icon}</div>
                    <span class="lt-dot-label">${pg.label}</span>
                </div>
            `;
        }).join('<div class="lt-dot-connector"></div>');
    }

    _renderDetails(pu) {
        const panel = document.getElementById('lt-details-panel');
        if (!panel) return;

        let html = `<div class="lt-detail-row"><span class="lt-detail-key">Phase</span><span class="lt-detail-val">${pu.phaseGroupLabel || ''}</span></div>`;

        if (pu.uiFlags?.showAccuracy && pu.problemsAttempted > 0) {
            html += `<div class="lt-detail-row"><span class="lt-detail-key">Accuracy</span><span class="lt-detail-val">${pu.problemsCorrect}/${pu.problemsAttempted} correct</span></div>`;
        }

        // Streak: count recent consecutive correct
        if (pu.problemsCorrect > 0) {
            html += `<div class="lt-detail-row"><span class="lt-detail-key">Progress</span><span class="lt-detail-val lt-streak">${pu.problemsCorrect} problem${pu.problemsCorrect !== 1 ? 's' : ''} solved</span></div>`;
        }

        panel.innerHTML = html;
    }

    _renderDevOverlay(pu) {
        let overlay = document.getElementById('lt-dev-overlay');
        if (!this._devMode) {
            if (overlay) overlay.style.display = 'none';
            return;
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'lt-dev-overlay';
            overlay.className = 'lt-dev-overlay';
            const wrapper = document.getElementById('lesson-tracker-wrapper');
            if (wrapper) wrapper.appendChild(overlay);
        }
        overlay.style.display = 'block';
        overlay.innerHTML = `<pre style="margin:0;font-size:10px;line-height:1.3;color:#8b5cf6;white-space:pre-wrap;">${JSON.stringify(pu, null, 2)}</pre>`;
    }
}

// --------------------------------------------------
// Tab refocus rehydration
// --------------------------------------------------
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.lessonTracker && window.courseManager?.activeCourseSessionId) {
        window.lessonTracker.rehydrate(window.courseManager.activeCourseSessionId);
    }
});

// Auto-initialise
document.addEventListener('DOMContentLoaded', () => {
    window.lessonTracker = new LessonTracker();

    // Wire up the details toggle
    const toggle = document.getElementById('lt-details-toggle');
    const panel = document.getElementById('lt-details-panel');
    if (toggle && panel) {
        toggle.addEventListener('click', () => {
            const expanded = panel.classList.toggle('expanded');
            toggle.classList.toggle('expanded', expanded);
        });
    }

    console.log('[LessonTracker] Initialised. Use LessonTracker.dev() to toggle debug overlay.');
});

console.log('[LessonTracker] Module loaded');
