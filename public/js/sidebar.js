// ============================================
// COLLAPSIBLE SIDEBAR
// Modern sidebar with tools, leaderboard, progress
// ============================================

class Sidebar {
    constructor() {
        this.isOpen = true; // Start open on desktop
        this.sidebar = null;
        this.toggle = null;
        this.leaderboardExpanded = false;

        console.log('📂 Sidebar initializing...');
        this.init();
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
        }

        // Toggle button click
        this.toggle.addEventListener('click', () => this.toggleSidebar());

        // Leaderboard expand/collapse
        const leaderboardToggle = document.querySelector('.leaderboard-toggle');
        if (leaderboardToggle) {
            leaderboardToggle.addEventListener('click', () => this.toggleLeaderboard());
        }

        // Tool button handlers
        this.setupToolHandlers();

        // Load leaderboard data
        this.loadLeaderboard();

        // Load progress data
        this.loadProgress();

        console.log('✅ Sidebar ready');
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

    toggleLeaderboard() {
        this.leaderboardExpanded = !this.leaderboardExpanded;

        const leaderboardContent = document.getElementById('sidebar-leaderboard');
        const leaderboardToggle = document.querySelector('.leaderboard-toggle');

        if (this.leaderboardExpanded) {
            leaderboardContent.classList.add('expanded');
            leaderboardToggle.classList.add('expanded');
        } else {
            leaderboardContent.classList.remove('expanded');
            leaderboardToggle.classList.remove('expanded');
        }
    }

    setupToolHandlers() {
        // Mastery Mode
        const masteryBtn = document.getElementById('sidebar-mastery-btn');
        if (masteryBtn) {
            masteryBtn.addEventListener('click', () => {
                const mainMasteryBtn = document.getElementById('mastery-mode-btn');
                if (mainMasteryBtn) mainMasteryBtn.click();
            });
        }

        // Resources
        const resourcesBtn = document.getElementById('sidebar-resources-btn');
        if (resourcesBtn) {
            resourcesBtn.addEventListener('click', () => {
                const mainResourcesBtn = document.getElementById('open-resources-modal-btn');
                if (mainResourcesBtn) mainResourcesBtn.click();
            });
        }

        // Whiteboard
        const whiteboardBtn = document.getElementById('sidebar-whiteboard-btn');
        if (whiteboardBtn) {
            whiteboardBtn.addEventListener('click', () => {
                const mainWhiteboardBtn = document.getElementById('toggle-whiteboard-btn');
                if (mainWhiteboardBtn) mainWhiteboardBtn.click();
            });
        }

        // Calculator
        const calculatorBtn = document.getElementById('sidebar-calculator-btn');
        if (calculatorBtn) {
            calculatorBtn.addEventListener('click', () => {
                const mainCalculatorBtn = document.getElementById('toggle-calculator-btn');
                if (mainCalculatorBtn) mainCalculatorBtn.click();
            });
        }

        // Graphing Calculator
        const graphingBtn = document.getElementById('sidebar-graphing-btn');
        if (graphingBtn) {
            graphingBtn.addEventListener('click', () => {
                const mainGraphingBtn = document.getElementById('open-graphing-calc-btn');
                if (mainGraphingBtn) mainGraphingBtn.click();
            });
        }

        // Upload Work
        const uploadBtn = document.getElementById('sidebar-upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                const mainUploadBtn = document.getElementById('camera-button');
                if (mainUploadBtn) mainUploadBtn.click();
            });
        }

        // Algebra Tiles
        const algebraBtn = document.getElementById('sidebar-algebra-btn');
        if (algebraBtn) {
            algebraBtn.addEventListener('click', () => {
                const mainAlgebraBtn = document.getElementById('algebra-tiles-btn');
                if (mainAlgebraBtn) mainAlgebraBtn.click();
            });
        }
    }

    async loadLeaderboard() {
        try {
            const response = await fetch('/api/leaderboard', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard');
            }

            const data = await response.json();
            this.renderLeaderboard(data.leaderboard || []);
        } catch (error) {
            console.error('[Sidebar] Error loading leaderboard:', error);
        }
    }

    renderLeaderboard(leaderboard) {
        const tbody = document.getElementById('sidebar-leaderboard-body');
        if (!tbody) return;

        tbody.innerHTML = '';

        leaderboard.slice(0, 10).forEach((student, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-weight: 600;">#${index + 1}</td>
                <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${student.firstName || 'Student'}
                </td>
                <td>L${student.level || 1}</td>
                <td>${student.totalXp || 0}</td>
            `;
            tbody.appendChild(row);
        });
    }

    async loadProgress() {
        if (!window.currentUser) return;

        const level = window.currentUser.level || 1;
        const xp = window.currentUser.totalXp || 0;
        const xpNeeded = window.currentUser.xpNeeded || 100;
        const progress = (xp / xpNeeded) * 100;

        // Update sidebar progress
        const levelEl = document.getElementById('sidebar-level');
        const xpEl = document.getElementById('sidebar-xp');
        const progressBar = document.getElementById('sidebar-progress-fill');

        if (levelEl) levelEl.textContent = level;
        if (xpEl) xpEl.textContent = `${xp} / ${xpNeeded} XP`;
        if (progressBar) progressBar.style.width = `${Math.min(progress, 100)}%`;
    }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    window.sidebar = new Sidebar();
});

console.log('📂 Sidebar module loaded');
