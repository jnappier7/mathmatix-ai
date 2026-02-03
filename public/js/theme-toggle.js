/**
 * Theme Toggle - Dark/Light Mode Switcher for MATHMATIX AI
 *
 * Features:
 * - Respects system preference (prefers-color-scheme)
 * - Persists user preference in localStorage
 * - Smooth transition animation
 * - Auto-syncs across tabs
 *
 * Usage:
 *   ThemeToggle.toggle()       // Toggle between light/dark
 *   ThemeToggle.setTheme('dark')  // Set specific theme
 *   ThemeToggle.getTheme()     // Get current theme
 *   ThemeToggle.init()         // Initialize (called automatically)
 *
 * @module theme-toggle
 */

(function(global) {
    'use strict';

    const STORAGE_KEY = 'mathmatix-theme';
    const THEMES = ['light', 'dark'];
    const TRANSITION_DURATION = 300;

    /**
     * Get the system's preferred color scheme
     * @returns {string} 'dark' or 'light'
     */
    function getSystemPreference() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    /**
     * Get stored theme preference
     * @returns {string|null}
     */
    function getStoredPreference() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    /**
     * Store theme preference
     * @param {string} theme
     */
    function storePreference(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {
            // localStorage not available
        }
    }

    /**
     * Apply theme to document
     * @param {string} theme
     * @param {boolean} animate - Whether to animate the transition
     */
    function applyTheme(theme, animate = true) {
        const html = document.documentElement;

        if (animate) {
            // Add transition class for smooth animation
            html.classList.add('theme-transitioning');
        }

        // Set the theme
        html.setAttribute('data-theme', theme);

        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#0A1118' : '#FFFFFF');
        }

        if (animate) {
            // Remove transition class after animation
            setTimeout(() => {
                html.classList.remove('theme-transitioning');
            }, TRANSITION_DURATION);
        }

        // Dispatch custom event for components that need to react
        const event = new CustomEvent('themechange', { detail: { theme } });
        document.dispatchEvent(event);
    }

    /**
     * Get current theme
     * @returns {string} 'dark' or 'light'
     */
    function getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    /**
     * Set theme
     * @param {string} theme - 'dark', 'light', or 'system'
     */
    function setTheme(theme) {
        if (theme === 'system') {
            storePreference('system');
            applyTheme(getSystemPreference());
        } else if (THEMES.includes(theme)) {
            storePreference(theme);
            applyTheme(theme);
        }
    }

    /**
     * Toggle between light and dark theme
     * @returns {string} The new theme
     */
    function toggle() {
        const current = getTheme();
        const newTheme = current === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        return newTheme;
    }

    /**
     * Initialize theme system
     */
    function init() {
        // Check for stored preference
        const stored = getStoredPreference();

        if (stored === 'system' || stored === null) {
            // Use system preference
            applyTheme(getSystemPreference(), false);
        } else if (THEMES.includes(stored)) {
            // Use stored preference
            applyTheme(stored, false);
        } else {
            // Default to light
            applyTheme('light', false);
        }

        // Listen for system preference changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                const stored = getStoredPreference();
                if (stored === 'system' || stored === null) {
                    applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }

        // Sync across tabs
        window.addEventListener('storage', (e) => {
            if (e.key === STORAGE_KEY && e.newValue) {
                if (e.newValue === 'system') {
                    applyTheme(getSystemPreference());
                } else if (THEMES.includes(e.newValue)) {
                    applyTheme(e.newValue);
                }
            }
        });
    }

    /**
     * Create a toggle button element
     * @param {Object} options - Button options
     * @returns {HTMLElement} The toggle button
     */
    function createToggleButton(options = {}) {
        const {
            className = 'theme-toggle-btn',
            lightIcon = '<i class="fas fa-sun"></i>',
            darkIcon = '<i class="fas fa-moon"></i>',
            ariaLabel = 'Toggle dark mode'
        } = options;

        const button = document.createElement('button');
        button.className = className;
        button.setAttribute('aria-label', ariaLabel);
        button.setAttribute('type', 'button');

        // Add default styling
        button.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            font-size: 1.2em;
            color: inherit;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        function updateIcon() {
            const theme = getTheme();
            button.innerHTML = theme === 'dark' ? lightIcon : darkIcon;
            button.setAttribute('aria-pressed', theme === 'dark');
        }

        button.addEventListener('click', () => {
            toggle();
            updateIcon();
        });

        // Update on theme change from other sources
        document.addEventListener('themechange', updateIcon);

        // Initial icon
        updateIcon();

        return button;
    }

    // Public API
    const ThemeToggle = {
        init,
        toggle,
        setTheme,
        getTheme,
        createToggleButton,
        THEMES
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose globally
    global.ThemeToggle = ThemeToggle;

})(typeof window !== 'undefined' ? window : global);
