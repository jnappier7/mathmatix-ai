/* ============================================
   MOBILE CHAT NAVIGATION — MATHMATIX AI
   Bottom nav bar + menu sheet + floating watermark for mobile chat.
   Creates DOM on the fly; wires into existing drawer / menu JS.
   ============================================ */

(function () {
    'use strict';

    // Only run on the chat page
    if (!document.body.classList.contains('landing-page-body')) return;

    var MOBILE_BP = 769;          // matches CSS max-width: 768px

    /* ---- Four-tab layout ----
       Explore  ·  Chat  ·  Progress  ·  Menu
       ------------------------------------ */
    var NAV_ITEMS = [
        { action: 'explore',  icon: 'fa-compass',      label: 'Explore' },
        { action: 'chat',     icon: 'fa-comment-dots',  label: 'Chat', active: true },
        { action: 'progress', icon: 'fa-chart-line',    label: 'Progress' },
        { action: 'menu',     icon: 'fa-bars',          label: 'Menu' }
    ];

    /* ---- Menu sheet items ---- */
    var MENU_ITEMS = [
        { id: 'menu-settings',  icon: 'fa-cog',          label: 'Settings',       action: 'open-settings'  },
        { id: 'menu-tools',     icon: 'fa-toolbox',      label: 'Tools',          action: 'open-tools'     },
        { id: 'menu-theme',     icon: 'fa-moon',         label: 'Dark Mode',      action: 'toggle-theme',  toggle: true },
        { id: 'menu-share',     icon: 'fa-share-alt',    label: 'Share Progress', action: 'share-progress' },
        { id: 'menu-feedback',  icon: 'fa-comment-dots', label: 'Send Feedback',  action: 'open-feedback'  },
        { id: 'menu-resources', icon: 'fa-book-open',    label: 'Resources',      action: 'open-resources' }
    ];

    /* ---- helpers ---- */

    function isMobile() { return window.innerWidth < MOBILE_BP; }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function syncThemeRow() {
        var icon = document.getElementById('menu-theme-icon');
        var label = document.getElementById('menu-theme-label');
        var toggle = document.getElementById('menu-theme-toggle');
        if (icon) icon.className = 'fas ' + (isDark() ? 'fa-sun' : 'fa-moon');
        if (label) label.textContent = isDark() ? 'Light Mode' : 'Dark Mode';
        if (toggle) toggle.checked = isDark();
    }

    function triggerClick(id) {
        var el = document.getElementById(id);
        if (el) el.click();
    }

    /* ---- bottom nav ---- */

    function buildNav() {
        if (document.getElementById('mobile-chat-nav')) return;

        var nav = document.createElement('nav');
        nav.id = 'mobile-chat-nav';
        nav.className = 'mobile-chat-nav';
        nav.setAttribute('aria-label', 'Mobile navigation');

        var html = '';
        NAV_ITEMS.forEach(function (item) {
            html += '<button class="chat-nav-item' + (item.active ? ' active' : '') + '"'
                + ' data-action="' + item.action + '"'
                + ' aria-label="' + item.label + '">'
                + '<i class="fas ' + item.icon + '"></i>'
                + '<span>' + item.label + '</span>'
                + '</button>';
        });
        nav.innerHTML = html;

        document.body.appendChild(nav);

        // Event delegation
        nav.addEventListener('click', function (e) {
            var btn = e.target.closest('.chat-nav-item');
            if (!btn) return;
            handleAction(btn.dataset.action);
        });
    }

    function handleAction(action) {
        switch (action) {
            case 'explore':
                triggerClick('left-drawer-toggle');
                break;
            case 'chat':
                var box = document.getElementById('chat-messages-container');
                if (box) box.scrollTop = box.scrollHeight;
                var input = document.getElementById('user-input');
                if (input) input.focus();
                break;
            case 'progress':
                triggerClick('right-drawer-toggle');
                break;
            case 'menu':
                openMenuSheet();
                break;
        }
    }

    /* ---- menu bottom sheet ---- */

    function buildMenuSheet() {
        if (document.getElementById('mobile-menu-overlay')) return;

        // Overlay
        var overlay = document.createElement('div');
        overlay.id = 'mobile-menu-overlay';
        overlay.className = 'mobile-menu-overlay';
        overlay.addEventListener('click', closeMenuSheet);
        document.body.appendChild(overlay);

        // Sheet
        var sheet = document.createElement('div');
        sheet.id = 'mobile-menu-sheet';
        sheet.className = 'mobile-menu-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-label', 'Menu');

        var html = '<div class="menu-sheet-handle"></div>';
        html += '<div class="menu-sheet-header">';
        html += '<span>Menu</span>';
        html += '<button class="menu-sheet-close" aria-label="Close menu"><i class="fas fa-times"></i></button>';
        html += '</div>';
        html += '<div class="menu-sheet-list">';

        MENU_ITEMS.forEach(function (item) {
            if (item.toggle) {
                // Theme toggle row
                html += '<div class="menu-sheet-item menu-sheet-toggle-row" data-menu-action="' + item.action + '">';
                html += '<div class="menu-sheet-item-left">';
                html += '<i id="menu-theme-icon" class="fas ' + (isDark() ? 'fa-sun' : item.icon) + '"></i>';
                html += '<span id="menu-theme-label">' + (isDark() ? 'Light Mode' : item.label) + '</span>';
                html += '</div>';
                html += '<label class="menu-toggle-switch">';
                html += '<input type="checkbox" id="menu-theme-toggle"' + (isDark() ? ' checked' : '') + '>';
                html += '<span class="menu-toggle-slider"></span>';
                html += '</label>';
                html += '</div>';
            } else {
                html += '<button class="menu-sheet-item" data-menu-action="' + item.action + '">';
                html += '<i class="fas ' + item.icon + '"></i>';
                html += '<span>' + item.label + '</span>';
                html += '<i class="fas fa-chevron-right menu-sheet-arrow"></i>';
                html += '</button>';
            }
        });

        html += '</div>';
        sheet.innerHTML = html;
        document.body.appendChild(sheet);

        // Wire up events
        sheet.querySelector('.menu-sheet-close').addEventListener('click', closeMenuSheet);

        sheet.addEventListener('click', function (e) {
            var item = e.target.closest('.menu-sheet-item');
            if (!item) return;
            var menuAction = item.dataset.menuAction;
            if (menuAction) handleMenuAction(menuAction);
        });

        // Theme toggle change
        var themeToggle = document.getElementById('menu-theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('change', function (e) {
                e.stopPropagation();
                triggerClick('theme-toggle-btn');
                setTimeout(syncThemeRow, 150);
            });
        }

        // Swipe-down to close
        var startY = 0;
        sheet.addEventListener('touchstart', function (e) {
            startY = e.touches[0].clientY;
        }, { passive: true });
        sheet.addEventListener('touchmove', function (e) {
            if (e.touches[0].clientY - startY > 60) closeMenuSheet();
        }, { passive: true });
    }

    function handleMenuAction(action) {
        switch (action) {
            case 'open-settings':
                closeMenuSheet();
                // triggerClick fires the settings.js click handler which opens the
                // modal AND loads account info + language preference
                setTimeout(function () { triggerClick('open-settings-modal-btn'); }, 280);
                break;
            case 'open-tools':
                closeMenuSheet();
                setTimeout(function () { triggerClick('more-tools-btn'); }, 280);
                break;
            case 'toggle-theme':
                triggerClick('theme-toggle-btn');
                setTimeout(syncThemeRow, 150);
                break;
            case 'share-progress':
                closeMenuSheet();
                setTimeout(function () { triggerClick('share-progress-header-btn'); }, 280);
                break;
            case 'open-feedback':
                closeMenuSheet();
                setTimeout(function () { triggerClick('open-feedback-modal-btn'); }, 280);
                break;
            case 'open-resources':
                closeMenuSheet();
                setTimeout(function () { triggerClick('open-resources-modal-btn'); }, 280);
                break;
        }
    }

    function openMenuSheet() {
        buildMenuSheet();
        syncThemeRow();
        var overlay = document.getElementById('mobile-menu-overlay');
        var sheet = document.getElementById('mobile-menu-sheet');
        if (!overlay || !sheet) return;

        sheet.style.display = 'block';
        overlay.classList.add('active');
        requestAnimationFrame(function () {
            sheet.classList.add('active');
        });
        document.body.style.overflow = 'hidden';
    }

    function closeMenuSheet() {
        var overlay = document.getElementById('mobile-menu-overlay');
        var sheet = document.getElementById('mobile-menu-sheet');
        if (!overlay || !sheet) return;

        sheet.classList.remove('active');
        overlay.classList.remove('active');
        setTimeout(function () {
            sheet.style.display = 'none';
        }, 300);
        document.body.style.overflow = '';
    }

    /* ---- watermark ---- */

    function buildWatermark() {
        if (document.getElementById('chat-watermark')) return;

        var wm = document.createElement('div');
        wm.id = 'chat-watermark';
        wm.setAttribute('aria-hidden', 'true');

        var img = document.createElement('img');
        img.src = '/images/mathmatix-ai-logo.png';
        img.alt = '';
        img.draggable = false;
        wm.appendChild(img);

        document.body.appendChild(wm);
    }

    /* ---- lifecycle ---- */

    function update() {
        if (isMobile()) {
            buildNav();
            buildWatermark();
            document.body.classList.add('has-chat-nav');
        } else {
            document.body.classList.remove('has-chat-nav');
            // Close menu sheet if open when switching to desktop
            closeMenuSheet();
        }
    }

    // Keep theme row in sync
    document.addEventListener('themechange', syncThemeRow);
    window.addEventListener('storage', function (e) {
        if (e.key === 'theme') syncThemeRow();
    });

    // ESC closes menu sheet
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenuSheet();
    });

    document.addEventListener('DOMContentLoaded', function () {
        update();
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(update, 100);
        });
    });
})();
