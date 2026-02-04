/**
 * Teacher Messaging - Parent Communication
 * Handles teacher-parent messaging through the Messages tab
 */

document.addEventListener('DOMContentLoaded', () => {
    const conversationsList = document.getElementById('conversations-list');
    const messageThread = document.getElementById('message-thread');
    const messageThreadHeader = document.getElementById('message-thread-header');
    const messageCompose = document.getElementById('message-compose');
    const messageReplyInput = document.getElementById('message-reply-input');
    const sendReplyBtn = document.getElementById('send-reply-btn');
    const unreadBadge = document.getElementById('unread-messages-badge');

    let currentConversationUserId = null;
    let conversations = [];

    // Initialize when messages tab is clicked
    const messagesTab = document.querySelector('[data-tab="messages"]');
    if (messagesTab) {
        messagesTab.addEventListener('click', () => {
            loadConversations();
            loadUnreadCount();
        });
    }

    // Load unread count on page load
    loadUnreadCount();

    // Load conversations list
    async function loadConversations() {
        if (!conversationsList) return;

        conversationsList.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const response = await fetch('/api/messages/conversations');
            if (!response.ok) throw new Error('Failed to load conversations');

            const data = await response.json();
            conversations = data.conversations || [];

            if (conversations.length === 0) {
                conversationsList.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #666;">
                        <i class="fas fa-comments" style="font-size: 32px; color: #ddd; margin-bottom: 10px;"></i>
                        <p style="margin: 0;">No conversations yet</p>
                        <p style="font-size: 0.85em; margin-top: 5px;">Messages from parents will appear here</p>
                    </div>
                `;
                return;
            }

            conversationsList.innerHTML = conversations.map(conv => {
                const participant = conv.participant;
                const lastMsg = conv.lastMessage;
                const unread = conv.unreadCount > 0;

                return `
                    <div class="conversation-item ${unread ? 'unread' : ''}" data-user-id="${participant._id}"
                         style="padding: 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; ${unread ? 'background: #f0f8ff;' : ''} transition: background 0.2s;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: ${unread ? '700' : '500'}; color: #333;">
                                    ${participant.firstName} ${participant.lastName}
                                </div>
                                <div style="font-size: 0.85em; color: #999;">${participant.role}</div>
                            </div>
                            ${unread ? `<span style="background: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${conv.unreadCount}</span>` : ''}
                        </div>
                        <div style="font-size: 0.9em; color: #666; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${lastMsg.isFromMe ? '<i class="fas fa-reply" style="color: #999; margin-right: 4px;"></i>' : ''}
                            ${escapeHtml(lastMsg.body)}
                        </div>
                        <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                            ${formatTimeAgo(new Date(lastMsg.createdAt))}
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.addEventListener('click', () => {
                    loadMessageThread(item.dataset.userId);
                    document.querySelectorAll('.conversation-item').forEach(i => i.style.background = '');
                    item.style.background = '#e8f4f8';
                });

                item.addEventListener('mouseenter', () => {
                    if (!item.classList.contains('unread')) {
                        item.style.background = '#f5f5f5';
                    }
                });

                item.addEventListener('mouseleave', () => {
                    if (item.dataset.userId !== currentConversationUserId) {
                        item.style.background = item.classList.contains('unread') ? '#f0f8ff' : '';
                    }
                });
            });

        } catch (error) {
            console.error('[Messaging] Load conversations error:', error);
            conversationsList.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading conversations</p>';
        }
    }

    // Load message thread
    async function loadMessageThread(userId) {
        if (!messageThread) return;

        currentConversationUserId = userId;
        messageThread.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const response = await fetch(`/api/messages/with/${userId}`);
            if (!response.ok) throw new Error('Failed to load messages');

            const data = await response.json();
            const messages = data.messages || [];
            const otherUser = data.otherUser;

            // Update header
            if (messageThreadHeader) {
                messageThreadHeader.innerHTML = `
                    <i class="fas fa-user"></i> ${otherUser.firstName} ${otherUser.lastName}
                    <span style="font-size: 0.85em; color: #999; margin-left: 10px;">(${otherUser.role})</span>
                `;
            }

            // Render messages
            if (messages.length === 0) {
                messageThread.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">No messages in this conversation yet.</p>';
            } else {
                messageThread.innerHTML = messages.map(msg => {
                    const isMe = msg.isFromMe;
                    const time = new Date(msg.createdAt).toLocaleString();

                    return `
                        <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 16px;">
                            <div style="max-width: 70%; padding: 12px 16px; border-radius: ${isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'}; background: ${isMe ? 'linear-gradient(135deg, #27ae60, #16a085)' : '#f5f5f5'}; color: ${isMe ? 'white' : '#333'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                ${msg.subject ? `<div style="font-weight: 600; margin-bottom: 6px; font-size: 0.9em;">${escapeHtml(msg.subject)}</div>` : ''}
                                <div style="line-height: 1.5;">${escapeHtml(msg.body)}</div>
                            </div>
                            <div style="font-size: 0.75em; color: #999; margin-top: 4px;">
                                ${time}
                                ${isMe && msg.status === 'read' ? '<i class="fas fa-check-double" style="color: #27ae60; margin-left: 4px;"></i>' : ''}
                            </div>
                        </div>
                    `;
                }).join('');

                // Scroll to bottom
                messageThread.scrollTop = messageThread.scrollHeight;
            }

            // Show compose area
            if (messageCompose) {
                messageCompose.style.display = 'block';
            }

            // Refresh unread count
            loadUnreadCount();
            loadConversations();

        } catch (error) {
            console.error('[Messaging] Load thread error:', error);
            messageThread.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 40px;">Error loading messages</p>';
        }
    }

    // Send reply
    if (sendReplyBtn && messageReplyInput) {
        sendReplyBtn.addEventListener('click', sendReply);
        messageReplyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendReply();
            }
        });
    }

    async function sendReply() {
        if (!currentConversationUserId) return;

        const body = messageReplyInput.value.trim();
        if (!body) return;

        sendReplyBtn.disabled = true;
        sendReplyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await csrfFetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientId: currentConversationUserId,
                    body
                })
            });

            const data = await response.json();

            if (data.success) {
                messageReplyInput.value = '';
                loadMessageThread(currentConversationUserId);
            } else {
                alert('Failed to send message: ' + data.message);
            }
        } catch (error) {
            console.error('[Messaging] Send error:', error);
            alert('Error sending message');
        } finally {
            sendReplyBtn.disabled = false;
            sendReplyBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }

    // Load unread count
    async function loadUnreadCount() {
        try {
            const response = await fetch('/api/messages/unread-count');
            if (!response.ok) return;

            const data = await response.json();
            const count = data.unreadCount || 0;

            if (unreadBadge) {
                if (count > 0) {
                    unreadBadge.textContent = count > 99 ? '99+' : count;
                    unreadBadge.style.display = 'inline-block';
                } else {
                    unreadBadge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('[Messaging] Unread count error:', error);
        }
    }

    // Helper: format time ago
    function formatTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    // Helper: escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Poll for new messages every 30 seconds
    setInterval(() => {
        loadUnreadCount();
        if (document.querySelector('#messages-tab.active')) {
            loadConversations();
        }
    }, 30000);
});
