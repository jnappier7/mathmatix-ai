// ============================================
// WHITEBOARD-CHAT ADAPTIVE LAYOUT MANAGER
// Ensures chat messages stay visible when whiteboard is open
// ============================================

class WhiteboardChatLayout {
    constructor() {
        this.mode = 'message-ticker'; // 'message-ticker' | 'split-screen' | 'pip' | 'compact'
        this.isWhiteboardOpen = false;
        this.latestAIMessage = null;
        this.messageTicker = null;
        this.pipWidget = null;

        console.log('📐 Whiteboard-Chat Layout Manager initialized');
    }

    init() {
        // Wait for whiteboard to be ready before creating ticker
        this.waitForWhiteboard().then(() => {
            // Create message ticker overlay
            this.createMessageTicker();

            // Create PIP widget (hidden by default)
            this.createPIPWidget();

            // Listen for whiteboard show/hide
            this.setupWhiteboardListeners();

            // Auto-detect best layout mode
            this.detectBestLayout();

            console.log(`✅ Layout mode: ${this.mode}`);
        });
    }

    // Wait for whiteboard panel to exist in DOM
    async waitForWhiteboard() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const panel = document.getElementById('whiteboard-panel');
                if (panel && window.whiteboard) {
                    clearInterval(checkInterval);
                    console.log('[Layout] Whiteboard panel ready');
                    resolve();
                }
            }, 100); // Check every 100ms

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn('[Layout] Whiteboard panel not found after 10s');
                resolve(); // Resolve anyway to prevent hanging
            }, 10000);
        });
    }

    // ============================================
    // WHITEBOARD LISTENERS
    // ============================================

    setupWhiteboardListeners() {
        // Hook into whiteboard show/hide
        if (window.whiteboard) {
            const originalShow = window.whiteboard.show.bind(window.whiteboard);
            const originalHide = window.whiteboard.hide.bind(window.whiteboard);

            window.whiteboard.show = () => {
                originalShow();
                this.onWhiteboardOpen();
            };

            window.whiteboard.hide = () => {
                originalHide();
                this.onWhiteboardClose();
            };
        }

        // Also listen for visual command execution
        document.addEventListener('visualCommandExecuted', (e) => {
            // Whiteboard was just used
            if (!this.isWhiteboardOpen && window.whiteboard && !window.whiteboard.panel.classList.contains('is-hidden')) {
                this.onWhiteboardOpen();
            }
        });
    }

    onWhiteboardOpen() {
        this.isWhiteboardOpen = true;
        document.body.classList.add('whiteboard-active');

        console.log('[Layout] Whiteboard opened, mode:', this.mode);

        // Ensure ticker exists if using ticker mode
        if (this.mode === 'message-ticker' && !this.messageTicker) {
            this.createMessageTicker();
        }

        // Apply layout mode
        switch (this.mode) {
            case 'message-ticker':
                // Always show ticker when whiteboard opens
                this.showMessageTicker();
                break;
            case 'split-screen':
                this.enableSplitScreen();
                break;
            case 'pip':
                this.showPIPWidget();
                break;
            case 'compact':
                this.enableCompactMode();
                break;
        }

        // Show helpful hint first time
        this.showLayoutHint();
    }

    onWhiteboardClose() {
        this.isWhiteboardOpen = false;
        document.body.classList.remove('whiteboard-active');
        document.body.classList.remove('whiteboard-split-screen');

        this.hideMessageTicker();
        this.hidePIPWidget();

        if (window.whiteboard?.panel) {
            window.whiteboard.panel.classList.remove('compact-mode');
        }

        console.log('[Layout] Whiteboard closed');
    }

    // ============================================
    // MESSAGE TICKER MODE
    // Shows latest AI message as banner on whiteboard
    // ============================================

    createMessageTicker() {
        const whiteboardPanel = document.getElementById('whiteboard-panel');
        if (!whiteboardPanel) {
            console.warn('[Layout] Cannot create ticker: whiteboard panel not found');
            return;
        }

        // Remove existing ticker if any
        const existing = document.getElementById('whiteboard-message-ticker');
        if (existing) {
            existing.remove();
        }

        this.messageTicker = document.createElement('div');
        this.messageTicker.id = 'whiteboard-message-ticker';
        this.messageTicker.innerHTML = `
            <span class="message-icon">💬</span>
            <div class="message-text"></div>
            <button class="dismiss-btn">×</button>
        `;

        // Insert AFTER the whiteboard header (first child)
        const header = whiteboardPanel.querySelector('.whiteboard-header');
        if (header && header.nextSibling) {
            whiteboardPanel.insertBefore(this.messageTicker, header.nextSibling);
        } else {
            // Fallback: prepend to panel
            whiteboardPanel.insertBefore(this.messageTicker, whiteboardPanel.firstChild);
        }

        // Add event listener to dismiss button (CSP-compliant)
        const dismissBtn = this.messageTicker.querySelector('.dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => this.dismissMessageTicker());
        }

        console.log('[Layout] Message ticker created');
    }

    showMessageTicker() {
        if (!this.messageTicker) return;

        // Get latest AI message from chat
        const latestMessage = this.getLatestAIMessage();
        if (!latestMessage) return;

        const messageText = this.messageTicker.querySelector('.message-text');
        messageText.textContent = latestMessage;

        this.messageTicker.classList.add('active');

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            this.dismissMessageTicker();
        }, 5000);
    }

    dismissMessageTicker() {
        if (this.messageTicker) {
            this.messageTicker.classList.remove('active');
        }
    }

    hideMessageTicker() {
        this.dismissMessageTicker();
    }

    // Update ticker when new AI message arrives
    updateMessageTicker(message) {
        if (!this.isWhiteboardOpen) return;
        if (this.mode !== 'message-ticker') return;

        this.latestAIMessage = message;
        this.showMessageTicker();
    }

    // ============================================
    // PIP (PICTURE-IN-PICTURE) MODE
    // Floating chat widget shows recent messages
    // ============================================

    createPIPWidget() {
        this.pipWidget = document.createElement('div');
        this.pipWidget.id = 'chat-pip-widget';
        this.pipWidget.style.display = 'none'; // Hidden by default
        this.pipWidget.innerHTML = `
            <div id="chat-pip-widget-header">
                <span>💬 Chat</span>
                <span style="font-size: 11px; opacity: 0.8;">Click to expand</span>
            </div>
            <div id="chat-pip-widget-messages"></div>
        `;

        document.body.appendChild(this.pipWidget);

        // Toggle collapsed state on header click
        const header = this.pipWidget.querySelector('#chat-pip-widget-header');
        header.addEventListener('click', () => {
            this.pipWidget.classList.toggle('collapsed');
        });
    }

    showPIPWidget() {
        if (!this.pipWidget) return;

        this.pipWidget.style.display = 'flex';

        // Load recent messages
        this.updatePIPMessages();
    }

    hidePIPWidget() {
        if (this.pipWidget) {
            this.pipWidget.style.display = 'none';
        }
    }

    updatePIPMessages() {
        if (!this.pipWidget) return;

        const messagesContainer = this.pipWidget.querySelector('#chat-pip-widget-messages');
        if (!messagesContainer) return;

        // Get last 3 messages from chat
        const recentMessages = this.getRecentMessages(3);

        messagesContainer.innerHTML = recentMessages.map(msg => `
            <div class="pip-message ${msg.role}">
                <strong>${msg.role === 'assistant' ? '🤖 Tutor' : '👤 You'}:</strong>
                ${msg.content}
            </div>
        `).join('');

        // Auto-scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ============================================
    // SPLIT-SCREEN MODE
    // Chat on left, whiteboard on right
    // ============================================

    enableSplitScreen() {
        document.body.classList.add('whiteboard-split-screen');
        console.log('[Layout] Split-screen mode enabled');
    }

    // ============================================
    // COMPACT MODE
    // Smaller whiteboard that doesn't block as much
    // ============================================

    enableCompactMode() {
        if (window.whiteboard?.panel) {
            window.whiteboard.panel.classList.add('compact-mode');
            console.log('[Layout] Compact mode enabled');
        }
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    getLatestAIMessage() {
        // Try multiple selectors for AI messages (different implementations)
        const selectors = [
            '.message.assistant',
            '.message.ai',
            '.ai-message',
            '[data-role="assistant"]',
            '[data-role="ai"]'
        ];

        let messages = [];
        for (const selector of selectors) {
            messages = document.querySelectorAll(selector);
            if (messages.length > 0) break;
        }

        if (messages.length === 0) {
            console.log('[Layout] No AI messages found in DOM');
            return null;
        }

        const latestMessage = messages[messages.length - 1];

        // Try multiple ways to get text content
        let textContent = latestMessage.querySelector('.message-text')?.textContent
            || latestMessage.querySelector('.message-content')?.textContent
            || latestMessage.textContent;

        if (!textContent) {
            console.log('[Layout] Could not extract text from AI message');
            return null;
        }

        // Truncate to 120 chars for ticker
        if (textContent.length > 120) {
            return textContent.substring(0, 117) + '...';
        }

        console.log('[Layout] Latest AI message:', textContent.substring(0, 50) + '...');
        return textContent;
    }

    getRecentMessages(count = 3) {
        const messages = document.querySelectorAll('.message');
        const recentMessages = Array.from(messages).slice(-count);

        return recentMessages.map(msg => {
            const role = msg.classList.contains('assistant') ? 'assistant' : 'user';
            const content = msg.querySelector('.message-text')?.textContent || '';
            return { role, content: content.substring(0, 100) };
        });
    }

    detectBestLayout() {
        const screenWidth = window.innerWidth;

        if (screenWidth < 1024) {
            // Mobile: Use compact mode
            this.mode = 'compact';
        } else if (screenWidth < 1400) {
            // Medium screens: Message ticker
            this.mode = 'message-ticker';
        } else {
            // Large screens: Split-screen
            this.mode = 'message-ticker'; // Default to ticker (less disruptive)
        }

        // Check user preference from localStorage
        const savedMode = localStorage.getItem('whiteboardChatLayoutMode');
        if (savedMode && ['message-ticker', 'split-screen', 'pip', 'compact'].includes(savedMode)) {
            this.mode = savedMode;
        }
    }

    setMode(mode) {
        if (!['message-ticker', 'split-screen', 'pip', 'compact'].includes(mode)) {
            console.warn('[Layout] Invalid mode:', mode);
            return;
        }

        this.mode = mode;
        localStorage.setItem('whiteboardChatLayoutMode', mode);

        console.log('[Layout] Mode set to:', mode);

        // If whiteboard is currently open, reapply layout
        if (this.isWhiteboardOpen) {
            this.onWhiteboardClose();
            setTimeout(() => this.onWhiteboardOpen(), 100);
        }
    }

    showLayoutHint() {
        // Check if user has seen this hint before
        if (localStorage.getItem('seenWhiteboardLayoutHint')) return;

        const hint = document.createElement('div');
        hint.className = 'whiteboard-layout-hint';
        hint.textContent = '💡 Tip: AI messages appear at the top of the whiteboard';

        document.body.appendChild(hint);

        // Mark as seen
        localStorage.setItem('seenWhiteboardLayoutHint', 'true');

        // Remove after animation
        setTimeout(() => {
            hint.remove();
        }, 3000);
    }

    // ============================================
    // DEBUG / TEST METHODS
    // ============================================

    /**
     * Manual test method - call from console
     * Usage: window.whiteboardChatLayout.testTicker()
     */
    testTicker() {
        console.log('[Layout] Testing ticker...');
        console.log('- Mode:', this.mode);
        console.log('- Whiteboard open:', this.isWhiteboardOpen);
        console.log('- Ticker exists:', !!this.messageTicker);

        if (!this.messageTicker) {
            console.log('Creating ticker...');
            this.createMessageTicker();
        }

        if (this.messageTicker) {
            const testMessage = "This is a test message to verify the ticker is working!";
            const messageText = this.messageTicker.querySelector('.message-text');
            if (messageText) {
                messageText.textContent = testMessage;
                this.messageTicker.classList.add('active');
                console.log('✅ Ticker should now be visible!');

                setTimeout(() => {
                    this.dismissMessageTicker();
                    console.log('Ticker dismissed');
                }, 5000);
            } else {
                console.error('❌ Could not find message-text element');
            }
        } else {
            console.error('❌ Failed to create ticker');
        }
    }

    /**
     * Force show ticker with current message
     */
    forceShowTicker() {
        this.isWhiteboardOpen = true;
        this.showMessageTicker();
    }

    /**
     * Set layout mode manually
     */
    setLayoutMode(mode) {
        const validModes = ['message-ticker', 'split-screen', 'pip', 'compact'];
        if (!validModes.includes(mode)) {
            console.error(`[Layout] Invalid mode: ${mode}`);
            return;
        }

        // Clear previous mode
        this.onWhiteboardClose();

        // Set new mode
        this.mode = mode;

        // Apply new mode if whiteboard is open
        if (this.isWhiteboardOpen || !window.whiteboard.panel.classList.contains('is-hidden')) {
            this.onWhiteboardOpen();
        }

        // Save preference to localStorage
        try {
            if (window.StorageUtils) {
                StorageUtils.local.setItem('whiteboardLayoutMode', mode);
            }
        } catch (e) {
            console.warn('[Layout] Could not save layout mode preference:', e);
        }

        console.log(`✅ [Layout] Mode changed to: ${mode}`);
    }
}

// Initialize globally
window.whiteboardChatLayout = new WhiteboardChatLayout();

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.whiteboardChatLayout.init();
    });
} else {
    window.whiteboardChatLayout.init();
}

// Listen for new AI messages and update display
document.addEventListener('newAIMessage', (e) => {
    if (e.detail && e.detail.message) {
        window.whiteboardChatLayout.updateMessageTicker(e.detail.message);

        if (window.whiteboardChatLayout.mode === 'pip') {
            window.whiteboardChatLayout.updatePIPMessages();
        }
    }
});

console.log('✅ Whiteboard-Chat Layout system loaded');
