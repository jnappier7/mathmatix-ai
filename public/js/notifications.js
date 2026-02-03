/**
 * Unified Notification System for MATHMATIX AI
 *
 * Provides consistent notification styling and behavior across all dashboards.
 * Supports: toast notifications, alerts, confirmation dialogs, and sound alerts.
 *
 * Usage:
 *   Notify.success('Task completed!')
 *   Notify.error('Something went wrong')
 *   Notify.warning('Please check your input')
 *   Notify.info('New message received')
 *   Notify.alert('Student needs help!', { sound: true, persistent: true })
 *   Notify.confirm('Are you sure?').then(confirmed => { ... })
 *
 * @module notifications
 */

(function(global) {
    'use strict';

    // Configuration
    const CONFIG = {
        position: 'top-right',           // top-right, top-left, bottom-right, bottom-left
        defaultDuration: 5000,           // 5 seconds
        maxNotifications: 5,             // Max visible at once
        animationDuration: 300,          // ms
        soundEnabled: true,
        soundVolume: 0.3
    };

    // Sound URLs (can be customized)
    const SOUNDS = {
        success: '/sounds/success.mp3',
        error: '/sounds/error.mp3',
        warning: '/sounds/warning.mp3',
        info: '/sounds/notification.mp3',
        alert: '/sounds/alert.mp3'
    };

    // Theme colors
    const THEMES = {
        success: { bg: 'linear-gradient(135deg, #27ae60, #2ecc71)', icon: 'fa-check-circle' },
        error: { bg: 'linear-gradient(135deg, #e74c3c, #c0392b)', icon: 'fa-exclamation-circle' },
        warning: { bg: 'linear-gradient(135deg, #f39c12, #e67e22)', icon: 'fa-exclamation-triangle' },
        info: { bg: 'linear-gradient(135deg, #3498db, #2980b9)', icon: 'fa-info-circle' },
        alert: { bg: 'linear-gradient(135deg, #ff4757, #ff6b6b)', icon: 'fa-bell' }
    };

    // Active notifications
    let activeNotifications = [];
    let notificationContainer = null;

    /**
     * Initialize the notification container
     */
    function initContainer() {
        if (notificationContainer) return notificationContainer;

        notificationContainer = document.createElement('div');
        notificationContainer.id = 'mathmatix-notifications';
        notificationContainer.style.cssText = `
            position: fixed;
            z-index: 99999;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
            width: 100%;
            padding: 15px;
            box-sizing: border-box;
        `;

        // Position based on config
        switch (CONFIG.position) {
            case 'top-left':
                notificationContainer.style.top = '0';
                notificationContainer.style.left = '0';
                break;
            case 'bottom-right':
                notificationContainer.style.bottom = '0';
                notificationContainer.style.right = '0';
                break;
            case 'bottom-left':
                notificationContainer.style.bottom = '0';
                notificationContainer.style.left = '0';
                break;
            default: // top-right
                notificationContainer.style.top = '0';
                notificationContainer.style.right = '0';
        }

        document.body.appendChild(notificationContainer);

        // Add styles
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            @keyframes notifySlideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes notifySlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            @keyframes notifyPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
            }
            .mathmatix-notification {
                pointer-events: auto;
                border-radius: 12px;
                padding: 16px 20px;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
                display: flex;
                align-items: flex-start;
                gap: 12px;
                animation: notifySlideIn ${CONFIG.animationDuration}ms ease;
                cursor: pointer;
                transition: transform 0.2s ease;
            }
            .mathmatix-notification:hover {
                transform: scale(1.02);
            }
            .mathmatix-notification.removing {
                animation: notifySlideOut ${CONFIG.animationDuration}ms ease forwards;
            }
            .mathmatix-notification.persistent {
                animation: notifySlideIn ${CONFIG.animationDuration}ms ease, notifyPulse 2s ease infinite;
            }
            .mathmatix-notification-icon {
                font-size: 1.4em;
                flex-shrink: 0;
            }
            .mathmatix-notification-content {
                flex: 1;
                min-width: 0;
            }
            .mathmatix-notification-title {
                font-weight: 600;
                font-size: 0.95em;
                margin-bottom: 4px;
            }
            .mathmatix-notification-message {
                font-size: 0.9em;
                opacity: 0.95;
                word-wrap: break-word;
            }
            .mathmatix-notification-close {
                background: none;
                border: none;
                color: white;
                opacity: 0.7;
                font-size: 1.2em;
                cursor: pointer;
                padding: 0;
                margin: -4px -4px 0 8px;
                transition: opacity 0.2s;
            }
            .mathmatix-notification-close:hover {
                opacity: 1;
            }
            .mathmatix-notification-actions {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }
            .mathmatix-notification-btn {
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 0.85em;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s;
            }
            .mathmatix-notification-btn-primary {
                background: rgba(255, 255, 255, 0.25);
                border: none;
                color: white;
            }
            .mathmatix-notification-btn-primary:hover {
                background: rgba(255, 255, 255, 0.35);
            }
            .mathmatix-notification-btn-secondary {
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.5);
                color: white;
            }
            .mathmatix-notification-btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            /* Confirm dialog overlay */
            .mathmatix-confirm-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100000;
                animation: fadeIn 0.2s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .mathmatix-confirm-dialog {
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: scaleIn 0.2s ease;
            }
            @keyframes scaleIn {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            .mathmatix-confirm-title {
                font-size: 1.2em;
                font-weight: 600;
                color: #333;
                margin-bottom: 8px;
            }
            .mathmatix-confirm-message {
                color: #666;
                margin-bottom: 20px;
                line-height: 1.5;
            }
            .mathmatix-confirm-buttons {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }
            .mathmatix-confirm-btn {
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 0.95em;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            .mathmatix-confirm-btn-cancel {
                background: #f0f0f0;
                border: none;
                color: #666;
            }
            .mathmatix-confirm-btn-cancel:hover {
                background: #e0e0e0;
            }
            .mathmatix-confirm-btn-confirm {
                background: var(--clr-primary-teal, #12B3B3);
                border: none;
                color: white;
            }
            .mathmatix-confirm-btn-confirm:hover {
                background: #109a9a;
            }
            .mathmatix-confirm-btn-danger {
                background: #e74c3c;
                border: none;
                color: white;
            }
            .mathmatix-confirm-btn-danger:hover {
                background: #c0392b;
            }
        `;
        document.head.appendChild(styleEl);

        return notificationContainer;
    }

    /**
     * Play notification sound
     * @param {string} type - Notification type
     */
    function playSound(type) {
        if (!CONFIG.soundEnabled) return;

        try {
            const soundUrl = SOUNDS[type] || SOUNDS.info;
            const audio = new Audio(soundUrl);
            audio.volume = CONFIG.soundVolume;
            audio.play().catch(() => {}); // Ignore autoplay restrictions
        } catch (e) {
            // Sound not available
        }
    }

    /**
     * Create and show a notification
     * @param {string} type - Notification type
     * @param {string} message - Message to display
     * @param {Object} options - Additional options
     * @returns {Object} Notification element
     */
    function show(type, message, options = {}) {
        initContainer();

        const theme = THEMES[type] || THEMES.info;
        const {
            title = null,
            duration = options.persistent ? 0 : CONFIG.defaultDuration,
            sound = false,
            persistent = false,
            actions = null,
            onClick = null
        } = options;

        // Limit active notifications
        while (activeNotifications.length >= CONFIG.maxNotifications) {
            const oldest = activeNotifications.shift();
            removeNotification(oldest, true);
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `mathmatix-notification ${persistent ? 'persistent' : ''}`;
        notification.style.background = theme.bg;

        notification.innerHTML = `
            <div class="mathmatix-notification-icon">
                <i class="fas ${theme.icon}"></i>
            </div>
            <div class="mathmatix-notification-content">
                ${title ? `<div class="mathmatix-notification-title">${title}</div>` : ''}
                <div class="mathmatix-notification-message">${message}</div>
                ${actions ? `<div class="mathmatix-notification-actions"></div>` : ''}
            </div>
            <button class="mathmatix-notification-close">&times;</button>
        `;

        // Add action buttons if provided
        if (actions) {
            const actionsContainer = notification.querySelector('.mathmatix-notification-actions');
            actions.forEach(action => {
                const btn = document.createElement('button');
                btn.className = `mathmatix-notification-btn mathmatix-notification-btn-${action.style || 'primary'}`;
                btn.textContent = action.label;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (action.onClick) action.onClick();
                    removeNotification(notification);
                };
                actionsContainer.appendChild(btn);
            });
        }

        // Click to dismiss
        notification.onclick = () => {
            if (onClick) onClick();
            removeNotification(notification);
        };

        // Close button
        notification.querySelector('.mathmatix-notification-close').onclick = (e) => {
            e.stopPropagation();
            removeNotification(notification);
        };

        // Add to container
        notificationContainer.appendChild(notification);
        activeNotifications.push(notification);

        // Play sound
        if (sound) {
            playSound(type);
        }

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => removeNotification(notification), duration);
        }

        return notification;
    }

    /**
     * Remove a notification
     * @param {HTMLElement} notification - Notification element
     * @param {boolean} immediate - Skip animation
     */
    function removeNotification(notification, immediate = false) {
        if (!notification || !notification.parentElement) return;

        if (immediate) {
            notification.remove();
        } else {
            notification.classList.add('removing');
            setTimeout(() => notification.remove(), CONFIG.animationDuration);
        }

        const index = activeNotifications.indexOf(notification);
        if (index > -1) {
            activeNotifications.splice(index, 1);
        }
    }

    /**
     * Show confirmation dialog
     * @param {string} message - Confirmation message
     * @param {Object} options - Options
     * @returns {Promise<boolean>} User's choice
     */
    function confirm(message, options = {}) {
        const {
            title = 'Confirm',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            danger = false
        } = options;

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'mathmatix-confirm-overlay';
            overlay.innerHTML = `
                <div class="mathmatix-confirm-dialog">
                    <div class="mathmatix-confirm-title">${title}</div>
                    <div class="mathmatix-confirm-message">${message}</div>
                    <div class="mathmatix-confirm-buttons">
                        <button class="mathmatix-confirm-btn mathmatix-confirm-btn-cancel">${cancelText}</button>
                        <button class="mathmatix-confirm-btn ${danger ? 'mathmatix-confirm-btn-danger' : 'mathmatix-confirm-btn-confirm'}">${confirmText}</button>
                    </div>
                </div>
            `;

            const close = (result) => {
                overlay.remove();
                resolve(result);
            };

            overlay.querySelector('.mathmatix-confirm-btn-cancel').onclick = () => close(false);
            overlay.querySelector('.mathmatix-confirm-btn:not(.mathmatix-confirm-btn-cancel)').onclick = () => close(true);
            overlay.onclick = (e) => {
                if (e.target === overlay) close(false);
            };

            document.body.appendChild(overlay);

            // Focus confirm button
            overlay.querySelector('.mathmatix-confirm-btn:not(.mathmatix-confirm-btn-cancel)').focus();
        });
    }

    /**
     * Clear all notifications
     */
    function clearAll() {
        activeNotifications.forEach(n => removeNotification(n, true));
        activeNotifications = [];
    }

    /**
     * Configure the notification system
     * @param {Object} options - Configuration options
     */
    function configure(options) {
        Object.assign(CONFIG, options);
    }

    // Public API
    const Notify = {
        success: (message, options) => show('success', message, options),
        error: (message, options) => show('error', message, options),
        warning: (message, options) => show('warning', message, options),
        info: (message, options) => show('info', message, options),
        alert: (message, options) => show('alert', message, { sound: true, ...options }),
        confirm,
        clearAll,
        configure,
        show
    };

    // Also expose as showToast for backwards compatibility
    global.showToast = (message, type = 'info') => {
        const typeMap = {
            'success': 'success',
            'error': 'error',
            'warning': 'warning',
            'info': 'info',
            'danger': 'error'
        };
        return show(typeMap[type] || 'info', message);
    };

    // Expose globally
    global.Notify = Notify;

})(typeof window !== 'undefined' ? window : global);
