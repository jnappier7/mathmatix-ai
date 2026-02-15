/* ============================================
   MOBILE CHAT NAVIGATION — MATHMATIX AI
   Bottom nav bar + floating watermark for mobile chat.
   Creates DOM on the fly; wires into existing drawer / menu JS.
   ============================================ */

(function () {
    'use strict';

    // Only run on the chat page
    if (!document.body.classList.contains('landing-page-body')) return;

    var MOBILE_BP = 769;          // matches CSS max-width: 768px
    var NAV_ITEMS = [
        { action: 'sessions', icon: 'fa-comments',     label: 'Sessions' },
        { action: 'tools',    icon: 'fa-toolbox',      label: 'Tools' },
        { action: 'chat',     icon: 'fa-comment-dots',  label: 'Chat', active: true },
        { action: 'theme',    icon: 'fa-moon',          label: 'Theme', id: 'chat-nav-theme-icon' },
        { action: 'profile',  icon: 'fa-user-circle',   label: 'Profile' }
    ];

    /* ---- helpers ---- */

    function isMobile() { return window.innerWidth < MOBILE_BP; }

    function syncThemeIcon() {
        var icon = document.getElementById('chat-nav-theme-icon');
        if (!icon) return;
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        icon.className = 'fas ' + (dark ? 'fa-sun' : 'fa-moon');
        // Update the label too
        var label = icon.parentElement && icon.parentElement.querySelector('span');
        if (label) label.textContent = dark ? 'Light' : 'Dark';
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
                + '<i class="fas ' + item.icon + '"' + (item.id ? ' id="' + item.id + '"' : '') + '></i>'
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

        syncThemeIcon();
    }

    function handleAction(action) {
        switch (action) {
            case 'sessions':
                triggerClick('left-drawer-toggle');
                break;
            case 'tools':
                triggerClick('more-tools-btn');
                break;
            case 'chat':
                var box = document.getElementById('chat-messages-container');
                if (box) box.scrollTop = box.scrollHeight;
                var input = document.getElementById('user-input');
                if (input) input.focus();
                break;
            case 'theme':
                triggerClick('theme-toggle-btn');
                setTimeout(syncThemeIcon, 150);
                break;
            case 'profile':
                triggerClick('right-drawer-toggle');
                break;
        }
    }

    function triggerClick(id) {
        var el = document.getElementById(id);
        if (el) el.click();
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
        }
    }

    // Keep theme icon in sync
    document.addEventListener('themechange', syncThemeIcon);
    // Also catch manual storage updates (cross-tab)
    window.addEventListener('storage', function (e) {
        if (e.key === 'theme') syncThemeIcon();
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
