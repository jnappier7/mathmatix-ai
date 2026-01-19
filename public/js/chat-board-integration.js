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
