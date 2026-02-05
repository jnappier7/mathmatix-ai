/**
 * Student Announcements Inbox
 * Displays teacher announcements with unread notification badge
 */

(function() {
    'use strict';

    let unreadCount = 0;
    let announcementsData = [];
    let isModalOpen = false;

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', initStudentAnnouncements);

    function initStudentAnnouncements() {
        // Create announcement bell button in the UI
        createAnnouncementButton();

        // Load unread count
        loadUnreadCount();

        // Check for new announcements every 60 seconds
        setInterval(loadUnreadCount, 60000);
    }

    // Create the announcement bell button
    function createAnnouncementButton() {
        // Find a good spot to inject the button (usually in the header or nav area)
        const headerNav = document.querySelector('.main-header-nav') ||
                         document.querySelector('.header-nav') ||
                         document.querySelector('.user-controls');

        if (!headerNav) {
            // Create a floating button if no nav found
            createFloatingAnnouncementButton();
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'announcements-btn';
        btn.className = 'nav-btn';
        btn.title = 'Teacher Announcements';
        btn.innerHTML = `
            <i class="fas fa-bell"></i>
            <span id="announcements-badge" class="notification-badge" style="display: none;">0</span>
        `;
        btn.style.cssText = 'position: relative;';

        btn.addEventListener('click', openAnnouncementsModal);

        // Add badge styling
        addBadgeStyles();

        headerNav.insertBefore(btn, headerNav.firstChild);
    }

    // Create floating button for pages without header nav
    function createFloatingAnnouncementButton() {
        const btn = document.createElement('button');
        btn.id = 'announcements-btn';
        btn.title = 'Teacher Announcements';
        btn.innerHTML = `
            <i class="fas fa-bell"></i>
            <span id="announcements-badge" class="notification-badge" style="display: none;">0</span>
        `;
        btn.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 20px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            z-index: 9990;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
        });

        btn.addEventListener('click', openAnnouncementsModal);
        addBadgeStyles();

        document.body.appendChild(btn);
    }

    // Add badge CSS
    function addBadgeStyles() {
        if (document.getElementById('announcements-badge-styles')) return;

        const style = document.createElement('style');
        style.id = 'announcements-badge-styles';
        style.textContent = `
            .notification-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #e74c3c;
                color: white;
                font-size: 11px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 10px;
                min-width: 18px;
                text-align: center;
                animation: pulse 2s infinite;
            }

            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }

            .announcement-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: flex-start;
                padding-top: 80px;
                z-index: 10000;
                animation: fadeIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .announcement-modal {
                background: white;
                border-radius: 16px;
                max-width: 500px;
                width: 90%;
                max-height: 70vh;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: slideDown 0.3s ease;
            }

            @keyframes slideDown {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            .announcement-item {
                padding: 16px 20px;
                border-bottom: 1px solid #f0f0f0;
                cursor: pointer;
                transition: background 0.2s;
            }

            .announcement-item:hover {
                background: #f9f9f9;
            }

            .announcement-item.unread {
                background: #f0f8ff;
                border-left: 4px solid #667eea;
            }

            .announcement-item.urgent {
                border-left: 4px solid #e74c3c;
            }

            .announcement-item.important {
                border-left: 4px solid #f39c12;
            }

            .priority-badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                margin-left: 8px;
            }

            .priority-urgent {
                background: #fee;
                color: #e74c3c;
            }

            .priority-important {
                background: #fff8e6;
                color: #f39c12;
            }
        `;
        document.head.appendChild(style);
    }

    // Load unread count
    async function loadUnreadCount() {
        try {
            const response = await fetch('/api/announcements/student/unread-count');
            if (!response.ok) return;

            const data = await response.json();
            unreadCount = data.unreadCount || 0;

            const badge = document.getElementById('announcements-badge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    badge.style.display = 'inline-block';

                    // Animate the button if there are new announcements
                    const btn = document.getElementById('announcements-btn');
                    if (btn) {
                        btn.style.animation = 'none';
                        setTimeout(() => {
                            btn.style.animation = 'shake 0.5s ease';
                        }, 10);
                    }
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('[StudentAnnouncements] Error loading unread count:', error);
        }
    }

    // Open announcements modal
    async function openAnnouncementsModal() {
        if (isModalOpen) return;
        isModalOpen = true;

        // Create modal
        const overlay = document.createElement('div');
        overlay.className = 'announcement-modal-overlay';
        overlay.innerHTML = `
            <div class="announcement-modal">
                <div style="padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-bell" style="color: #667eea;"></i>
                        Teacher Announcements
                    </h3>
                    <button id="close-announcements-modal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">&times;</button>
                </div>
                <div id="announcements-content" style="max-height: 60vh; overflow-y: auto;">
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #667eea;"></i>
                    </div>
                </div>
                ${unreadCount > 0 ? `
                    <div style="padding: 12px 20px; border-top: 1px solid #e0e0e0; text-align: center;">
                        <button id="mark-all-read-btn" style="background: none; border: none; color: #667eea; cursor: pointer; font-size: 14px;">
                            <i class="fas fa-check-double"></i> Mark all as read
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(overlay);

        // Add event listeners
        overlay.querySelector('#close-announcements-modal').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const markAllBtn = overlay.querySelector('#mark-all-read-btn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', markAllAsRead);
        }

        // Load announcements
        await loadAnnouncements();

        function closeModal() {
            overlay.remove();
            isModalOpen = false;
        }
    }

    // Load announcements
    async function loadAnnouncements() {
        const content = document.getElementById('announcements-content');
        if (!content) return;

        try {
            const response = await fetch('/api/announcements/student?limit=30');
            if (!response.ok) throw new Error('Failed to load announcements');

            const data = await response.json();
            announcementsData = data.announcements || [];

            if (announcementsData.length === 0) {
                content.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p style="margin: 0;">No announcements yet</p>
                        <p style="font-size: 0.9em; margin-top: 8px;">Your teacher's messages will appear here</p>
                    </div>
                `;
                return;
            }

            content.innerHTML = announcementsData.map(a => {
                const date = new Date(a.createdAt);
                const dateStr = formatTimeAgo(date);
                const isUnread = !a.isRead;
                const teacherName = a.teacherId ? `${a.teacherId.firstName} ${a.teacherId.lastName}` : 'Teacher';

                const categoryIcons = {
                    general: 'fa-info-circle',
                    assignment: 'fa-book',
                    reminder: 'fa-bell',
                    encouragement: 'fa-heart',
                    achievement: 'fa-trophy',
                    event: 'fa-calendar'
                };

                let priorityBadge = '';
                if (a.priority === 'urgent') {
                    priorityBadge = '<span class="priority-badge priority-urgent">Urgent</span>';
                } else if (a.priority === 'important') {
                    priorityBadge = '<span class="priority-badge priority-important">Important</span>';
                }

                return `
                    <div class="announcement-item ${isUnread ? 'unread' : ''} ${a.priority}" data-id="${a._id}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fas ${categoryIcons[a.category] || 'fa-info-circle'}" style="color: #667eea;"></i>
                                <span style="font-weight: ${isUnread ? '700' : '500'}; color: #333;">
                                    ${escapeHtml(a.title)}
                                </span>
                                ${priorityBadge}
                            </div>
                            ${isUnread ? '<span style="width: 8px; height: 8px; background: #667eea; border-radius: 50%; flex-shrink: 0;"></span>' : ''}
                        </div>
                        <p style="margin: 0; color: #555; font-size: 0.9em; line-height: 1.5;">
                            ${escapeHtml(a.body)}
                        </p>
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.8em; color: #999;">
                            <span><i class="fas fa-user"></i> ${escapeHtml(teacherName)}</span>
                            <span>${dateStr}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers to mark as read
            content.querySelectorAll('.announcement-item.unread').forEach(item => {
                item.addEventListener('click', () => markAsRead(item.dataset.id, item));
            });

        } catch (error) {
            console.error('[StudentAnnouncements] Error loading announcements:', error);
            content.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 40px;">Error loading announcements</p>';
        }
    }

    // Mark single announcement as read
    async function markAsRead(announcementId, element) {
        try {
            await csrfFetch(`/api/announcements/student/${announcementId}/read`, {
                method: 'POST'
            });

            element.classList.remove('unread');
            element.querySelector('[style*="background: #667eea"]')?.remove();

            loadUnreadCount();
        } catch (error) {
            console.error('[StudentAnnouncements] Error marking as read:', error);
        }
    }

    // Mark all as read
    async function markAllAsRead() {
        try {
            await csrfFetch('/api/announcements/student/mark-all-read', {
                method: 'POST'
            });

            document.querySelectorAll('.announcement-item.unread').forEach(item => {
                item.classList.remove('unread');
            });

            const markAllBtn = document.getElementById('mark-all-read-btn');
            if (markAllBtn) {
                markAllBtn.innerHTML = '<i class="fas fa-check"></i> All marked as read';
                markAllBtn.disabled = true;
            }

            loadUnreadCount();
        } catch (error) {
            console.error('[StudentAnnouncements] Error marking all as read:', error);
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
        div.textContent = text || '';
        return div.innerHTML;
    }

    // Add shake animation
    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
    `;
    document.head.appendChild(shakeStyle);
})();
