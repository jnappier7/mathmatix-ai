/* --- /js/guided-tour.js?v=20260728 --- */
/**
 * Guided Tour System - Reusable Onboarding Tours for MATHMATIX AI
 *
 * Usage:
 *   const tour = new GuidedTour('teacher-dashboard', teacherTourSteps);
 *   tour.start();
 *
 * Tour steps format:
 *   [{
 *     element: '#element-selector',  // CSS selector for the target element
 *     title: 'Step Title',
 *     content: 'Description of this feature...',
 *     position: 'bottom',  // 'top', 'bottom', 'left', 'right'
 *     highlight: true,     // Whether to spotlight the element
 *     action: () => {}     // Optional callback when step is shown
 *   }]
 */

class GuidedTour {
    constructor(tourId, steps, options = {}) {
        this.tourId = tourId;
        this.steps = steps;
        this.currentStep = 0;
        this.isActive = false;

        // Options
        this.options = {
            onComplete: options.onComplete || null,
            onSkip: options.onSkip || null,
            showProgress: options.showProgress !== false,
            allowSkip: options.allowSkip !== false,
            overlayOpacity: options.overlayOpacity || 0.75,
            primaryColor: options.primaryColor || '#667eea',
            storageKey: options.storageKey || `tour_completed_${tourId}`
        };

        // Elements
        this.overlay = null;
        this.tooltip = null;
        this.spotlight = null;

        // Bind methods
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleResize = this.handleResize.bind(this);
    }

    // Check if tour has been completed
    hasCompleted() {
        return StorageUtils.local.getItem(this.options.storageKey) === 'true';
    }

    // Mark tour as completed
    markCompleted() {
        StorageUtils.local.setItem(this.options.storageKey, 'true');
    }

    // Reset tour completion status
    reset() {
        StorageUtils.local.removeItem(this.options.storageKey);
    }

    // Start the tour
    start(forceRestart = false) {
        if (this.hasCompleted() && !forceRestart) {
            console.log(`[GuidedTour] Tour "${this.tourId}" already completed. Use start(true) to force restart.`);
            return false;
        }

        if (this.steps.length === 0) {
            console.warn('[GuidedTour] No steps defined for tour');
            return false;
        }

        this.isActive = true;
        this.currentStep = 0;
        this.createOverlay();
        this.createTooltip();
        this.showStep(0);

        // Add event listeners
        document.addEventListener('keydown', this.handleKeydown);
        window.addEventListener('resize', this.handleResize);

        return true;
    }

    // Create the overlay and spotlight
    createOverlay() {
        // Main overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'guided-tour-overlay';
        this.overlay.innerHTML = `
            <svg class="guided-tour-spotlight-svg" width="100%" height="100%">
                <defs>
                    <mask id="spotlight-mask">
                        <rect width="100%" height="100%" fill="white"/>
                        <rect class="spotlight-cutout" x="0" y="0" width="0" height="0" rx="8" fill="black"/>
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,${this.options.overlayOpacity})" mask="url(#spotlight-mask)"/>
            </svg>
        `;
        document.body.appendChild(this.overlay);

        // Add styles if not already present
        if (!document.getElementById('guided-tour-styles')) {
            const styles = document.createElement('style');
            styles.id = 'guided-tour-styles';
            styles.textContent = `
                .guided-tour-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 99998;
                    pointer-events: none;
                }

                .guided-tour-spotlight-svg {
                    width: 100%;
                    height: 100%;
                }

                .spotlight-cutout {
                    transition: all 0.3s ease;
                }

                .guided-tour-tooltip {
                    position: fixed;
                    z-index: 99999;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    max-width: 360px;
                    min-width: 280px;
                    pointer-events: auto;
                    animation: tooltipFadeIn 0.3s ease;
                }

                @keyframes tooltipFadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .guided-tour-tooltip-header {
                    padding: 16px 20px 12px;
                    border-bottom: 1px solid #f0f0f0;
                }

                .guided-tour-tooltip-title {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #2c3e50;
                }

                .guided-tour-tooltip-content {
                    padding: 16px 20px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #555;
                }

                .guided-tour-tooltip-footer {
                    padding: 12px 20px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px solid #f0f0f0;
                }

                .guided-tour-progress {
                    font-size: 12px;
                    color: #999;
                }

                .guided-tour-progress-dots {
                    display: flex;
                    gap: 6px;
                    margin-top: 4px;
                }

                .guided-tour-progress-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #e0e0e0;
                    transition: background 0.2s;
                }

                .guided-tour-progress-dot.active {
                    background: ${this.options.primaryColor};
                }

                .guided-tour-progress-dot.completed {
                    background: #27ae60;
                }

                .guided-tour-buttons {
                    display: flex;
                    gap: 10px;
                }

                .guided-tour-btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }

                .guided-tour-btn-secondary {
                    background: #f5f5f5;
                    color: #666;
                }

                .guided-tour-btn-secondary:hover {
                    background: #e8e8e8;
                }

                .guided-tour-btn-primary {
                    background: ${this.options.primaryColor};
                    color: white;
                }

                .guided-tour-btn-primary:hover {
                    opacity: 0.9;
                }

                .guided-tour-btn-skip {
                    background: transparent;
                    color: #999;
                    padding: 8px 12px;
                }

                .guided-tour-btn-skip:hover {
                    color: #666;
                }

                .guided-tour-tooltip-arrow {
                    position: absolute;
                    width: 16px;
                    height: 16px;
                    background: white;
                    transform: rotate(45deg);
                    box-shadow: -2px -2px 4px rgba(0,0,0,0.05);
                }

                .guided-tour-tooltip-arrow.bottom { top: -8px; }
                .guided-tour-tooltip-arrow.top { bottom: -8px; }
                .guided-tour-tooltip-arrow.left { right: -8px; }
                .guided-tour-tooltip-arrow.right { left: -8px; }

                /* Highlighted element gets higher z-index */
                .guided-tour-highlighted {
                    position: relative;
                    z-index: 99997 !important;
                    pointer-events: auto;
                }

                /* Pulse animation for highlighted elements */
                .guided-tour-pulse {
                    animation: tourPulse 2s infinite;
                }

                @keyframes tourPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.4); }
                    50% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    // Create the tooltip
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'guided-tour-tooltip';
        document.body.appendChild(this.tooltip);
    }

    // Show a specific step
    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        const step = this.steps[index];
        const element = document.querySelector(step.element);

        // Element not found or not visible (e.g. inside collapsed sidebar)
        if (!element || (element.offsetParent === null && getComputedStyle(element).position !== 'fixed')) {
            console.warn(`[GuidedTour] Element not found or hidden: ${step.element}`);
            // Skip this step only — don't chain-complete the entire tour
            this._skipStep(index);
            return;
        }

        this.currentStep = index;

        // Remove highlight from previous element
        document.querySelectorAll('.guided-tour-highlighted, .guided-tour-pulse').forEach(el => {
            el.classList.remove('guided-tour-highlighted', 'guided-tour-pulse');
        });

        // Highlight current element
        if (step.highlight !== false) {
            element.classList.add('guided-tour-highlighted');
            if (step.pulse !== false) {
                element.classList.add('guided-tour-pulse');
            }
        }

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Update spotlight
        setTimeout(() => {
            this.updateSpotlight(element);
            this.updateTooltip(step, element);

            // Call step action if defined
            if (step.action && typeof step.action === 'function') {
                step.action(element, this);
            }
        }, 300);
    }

    // Skip a missing/hidden step without chain-completing the tour.
    // Finds the next visible step forward; if none, tries backward; if none at all, completes.
    _skipStep(fromIndex) {
        // Try forward
        for (let i = fromIndex + 1; i < this.steps.length; i++) {
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
        // Try backward (wrap around to earlier steps we haven't shown)
        for (let i = fromIndex - 1; i >= 0; i--) {
            if (i === this.currentStep) continue; // don't re-show current
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
        // No visible steps at all — complete
        this.complete();
    }

    // Update the spotlight cutout
    updateSpotlight(element) {
        const rect = element.getBoundingClientRect();
        const padding = 8;

        const cutout = this.overlay.querySelector('.spotlight-cutout');
        cutout.setAttribute('x', rect.left - padding);
        cutout.setAttribute('y', rect.top - padding);
        cutout.setAttribute('width', rect.width + padding * 2);
        cutout.setAttribute('height', rect.height + padding * 2);
    }

    // Update the tooltip content and position
    updateTooltip(step, element) {
        const rect = element.getBoundingClientRect();
        const position = step.position || 'bottom';

        // Build progress dots
        let progressHtml = '';
        if (this.options.showProgress) {
            const dots = this.steps.map((_, i) => {
                let cls = 'guided-tour-progress-dot';
                if (i < this.currentStep) cls += ' completed';
                if (i === this.currentStep) cls += ' active';
                return `<div class="${cls}"></div>`;
            }).join('');
            progressHtml = `
                <div class="guided-tour-progress">
                    <span>Step ${this.currentStep + 1} of ${this.steps.length}</span>
                    <div class="guided-tour-progress-dots">${dots}</div>
                </div>
            `;
        }

        // Build buttons
        const isFirst = this.currentStep === 0;
        const isLast = this.currentStep === this.steps.length - 1;

        let buttonsHtml = '<div class="guided-tour-buttons">';
        if (!isFirst) {
            buttonsHtml += '<button class="guided-tour-btn guided-tour-btn-secondary" data-action="prev">Back</button>';
        }
        if (this.options.allowSkip && !isLast) {
            buttonsHtml += '<button class="guided-tour-btn guided-tour-btn-skip" data-action="skip">Skip Tour</button>';
        }
        buttonsHtml += `<button class="guided-tour-btn guided-tour-btn-primary" data-action="${isLast ? 'complete' : 'next'}">${isLast ? 'Finish' : 'Next'}</button>`;
        buttonsHtml += '</div>';

        // Set tooltip content
        this.tooltip.innerHTML = `
            <div class="guided-tour-tooltip-arrow ${position}"></div>
            <div class="guided-tour-tooltip-header">
                <h3 class="guided-tour-tooltip-title">${step.title}</h3>
            </div>
            <div class="guided-tour-tooltip-content">
                ${step.content}
            </div>
            <div class="guided-tour-tooltip-footer">
                ${progressHtml}
                ${buttonsHtml}
            </div>
        `;

        // Add button listeners
        this.tooltip.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const button = e.target.closest('[data-action]');
                if (!button) return;
                const action = button.dataset.action;
                if (action === 'next') this.next();
                else if (action === 'prev') this.prev();
                else if (action === 'skip') this.skip();
                else if (action === 'complete') this.complete();
            });
        });

        // Position tooltip
        this.positionTooltip(rect, position);
    }

    // Position the tooltip relative to the target element
    positionTooltip(targetRect, position) {
        const tooltip = this.tooltip;
        const tooltipRect = tooltip.getBoundingClientRect();
        const padding = 16;
        const arrowSize = 8;

        let top, left;

        switch (position) {
            case 'top':
                top = targetRect.top - tooltipRect.height - padding - arrowSize;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = targetRect.bottom + padding + arrowSize;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - padding - arrowSize;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + padding + arrowSize;
                break;
            default:
                top = targetRect.bottom + padding;
                left = targetRect.left;
        }

        // Keep tooltip on screen
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (left < padding) left = padding;
        if (left + tooltipRect.width > viewportWidth - padding) {
            left = viewportWidth - tooltipRect.width - padding;
        }
        if (top < padding) top = padding;
        if (top + tooltipRect.height > viewportHeight - padding) {
            top = viewportHeight - tooltipRect.height - padding;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;

        // Position arrow
        const arrow = tooltip.querySelector('.guided-tour-tooltip-arrow');
        if (arrow) {
            const arrowOffset = Math.min(
                Math.max(20, targetRect.left + targetRect.width / 2 - left),
                tooltipRect.width - 20
            );

            if (position === 'top' || position === 'bottom') {
                arrow.style.left = `${arrowOffset}px`;
            } else {
                arrow.style.top = `${Math.min(Math.max(20, targetRect.top + targetRect.height / 2 - top), tooltipRect.height - 20)}px`;
            }
        }
    }

    // Go to next step (skips hidden elements automatically)
    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.complete();
        }
    }

    // Go to previous step (skips hidden elements automatically)
    prev() {
        // Find the nearest previous visible step
        for (let i = this.currentStep - 1; i >= 0; i--) {
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
    }

    // Skip the tour
    skip() {
        this.cleanup();
        if (this.options.onSkip) {
            this.options.onSkip(this.currentStep);
        }
    }

    // Complete the tour
    complete() {
        this.markCompleted();
        this.cleanup();
        if (this.options.onComplete) {
            this.options.onComplete();
        }
    }

    // Clean up tour elements
    cleanup() {
        this.isActive = false;

        // Remove elements
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }

        // Remove highlights
        document.querySelectorAll('.guided-tour-highlighted, .guided-tour-pulse').forEach(el => {
            el.classList.remove('guided-tour-highlighted', 'guided-tour-pulse');
        });

        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeydown);
        window.removeEventListener('resize', this.handleResize);
    }

    // Handle keyboard navigation
    handleKeydown(e) {
        if (!this.isActive) return;

        switch (e.key) {
            case 'ArrowRight':
            case 'Enter':
                e.preventDefault();
                this.next();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.prev();
                break;
            case 'Escape':
                e.preventDefault();
                this.skip();
                break;
        }
    }

    // Handle window resize
    handleResize() {
        if (!this.isActive) return;

        const step = this.steps[this.currentStep];
        const element = document.querySelector(step.element);
        if (element) {
            this.updateSpotlight(element);
            this.positionTooltip(element.getBoundingClientRect(), step.position || 'bottom');
        }
    }
}

// Export for use
window.GuidedTour = GuidedTour;


// ============================================
// PREDEFINED TOUR CONFIGURATIONS
// ============================================

// Teacher Dashboard Tour
window.teacherDashboardTour = [
    {
        element: '.class-overview',
        title: 'Class Overview',
        content: 'See your entire class at a glance. Track active students, those needing attention, and overall progress metrics.',
        position: 'bottom'
    },
    {
        element: '#student-search',
        title: 'Search & Filter',
        content: 'Quickly find students by name or filter by status (active, struggling, inactive).',
        position: 'bottom'
    },
    {
        element: '.student-card',
        title: 'Student Cards',
        content: 'Each card shows key metrics: level, XP, last login, and weekly activity. Click a name for full details.',
        position: 'right'
    },
    {
        element: '.view-as-student-btn',
        title: 'View as Student',
        content: 'See exactly what your students see. Great for troubleshooting or understanding their experience.',
        position: 'top'
    },
    {
        element: '.view-iep-btn',
        title: 'IEP Management',
        content: 'Manage Individualized Education Plans with accommodations, goals, and progress tracking.',
        position: 'top'
    },
    {
        element: '[data-tab="announcements"]',
        title: 'Send Announcements',
        content: 'Send instant messages to your entire class or individual students. They\'ll see them right in their dashboard.',
        position: 'bottom'
    },
    {
        element: '[data-tab="messages"]',
        title: 'Parent Messaging',
        content: 'Communicate directly with parents about their child\'s progress, concerns, or achievements.',
        position: 'bottom'
    },
    {
        element: '#qa-export-progress',
        title: 'Export Data',
        content: 'Download student progress data as a CSV for reports or grade books.',
        position: 'left'
    }
];

// Parent Dashboard Tour
window.parentDashboardTour = [
    {
        element: '.child-card',
        title: 'Your Child\'s Progress',
        content: 'See detailed progress for each linked child, including level, XP, recent sessions, and IEP goals.',
        position: 'right'
    },
    {
        element: '.view-as-child-btn',
        title: 'View as Your Child',
        content: 'Experience exactly what your child sees when they use MATHMATIX AI. Great for understanding their learning journey.',
        position: 'top'
    },
    {
        element: '#childSelector',
        title: 'Ask About Progress',
        content: 'Select a child and ask questions about their math progress. The AI will give you personalized insights.',
        position: 'bottom'
    },
    {
        element: '.helper-btn',
        title: 'Quick Questions',
        content: 'Click these buttons to quickly ask common questions about your child\'s learning.',
        position: 'top'
    },
    {
        element: '#parent-learning-center',
        title: 'Parent Courses',
        content: 'Enroll in free mini-courses designed to help you understand the math your child is learning. Lessons are short, conversational, and built for busy parents.',
        position: 'right'
    },
    {
        element: '#send-weekly-report-btn',
        title: 'Email Reports',
        content: 'Get detailed progress reports sent directly to your email.',
        position: 'left'
    },
    {
        element: '#generate-code-btn',
        title: 'Link More Children',
        content: 'Generate a code to link additional children to your parent account.',
        position: 'bottom'
    }
];

// Student Dashboard Tour
window.studentDashboardTour = [
    {
        element: '#user-input',
        title: 'Your AI Tutor',
        content: 'This is your personal math tutor! Type a question here to get help with homework, practice new skills, or explore math topics.',
        position: 'top'
    },
    {
        element: '#drawer-daily-quests-container',
        title: 'Daily Quests',
        content: 'Complete quests every day to earn XP and build your streak! Consistency is key to mastering math.',
        position: 'right'
    },
    {
        element: '#cr-xp-meter',
        title: 'Your Progress',
        content: 'Track your XP and level here. The more you practice, the higher you\'ll climb!',
        position: 'bottom'
    },
    {
        element: '#drawer-leaderboard-table',
        title: 'Leaderboard',
        content: 'See how you stack up against your classmates! Earn XP to climb the ranks.',
        position: 'right'
    },
    {
        element: '#open-settings-modal-btn',
        title: 'Choose Your Tutor',
        content: 'Open Settings to pick a different AI tutor. Each tutor has its own personality and teaching style!',
        position: 'bottom'
    },
    {
        element: '#camera-button',
        title: 'Show Your Work',
        content: 'Snap a photo or upload a PDF of your handwritten work and get instant feedback and grading. Unlimited with Mathmatix+!',
        position: 'top'
    }
];

// Admin Dashboard Tour
window.adminDashboardTour = [
    {
        element: '.left-sidebar',
        title: 'System Status',
        content: 'Database health, AI service status, and the top-students leaderboard at a glance.',
        position: 'right'
    },
    {
        element: '#userStatCards',
        title: 'User Management',
        content: 'User counts by role, with the full searchable user list below. Edit accounts, assign teachers, and link parents.',
        position: 'bottom'
    },
    {
        element: '#openTeacherSetupBtn',
        title: 'Add Teachers',
        content: 'Create teacher accounts and generate enrollment codes for their classes.',
        position: 'bottom'
    },
    {
        element: '#openRosterImportBtn',
        title: 'Import Rosters',
        content: 'Bulk-import students from a CSV roster and assign them to teachers in one pass.',
        position: 'bottom'
    },
    {
        element: '#openBulkEmailBtn',
        title: 'Bulk Email',
        content: 'Send emails to all students, parents, or teachers. Great for announcements and newsletters.',
        position: 'bottom'
    }
];


// ============================================
// AUTO-START TOUR FOR NEW USERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Detect which dashboard we're on and offer tour
    const path = window.location.pathname;

    let tourConfig = null;
    let tourId = null;

    if (path.includes('teacher-dashboard')) {
        tourConfig = window.teacherDashboardTour;
        tourId = 'teacher-dashboard';
    } else if (path.includes('parent-dashboard')) {
        tourConfig = window.parentDashboardTour;
        tourId = 'parent-dashboard';
    } else if (path.includes('student-dashboard') || path.includes('chat.html')) {
        tourConfig = window.studentDashboardTour;
        tourId = 'student-dashboard';
    } else if (path.includes('admin-dashboard')) {
        tourConfig = window.adminDashboardTour;
        tourId = 'admin-dashboard';
    }

    if (tourConfig && tourId) {
        const tour = new GuidedTour(tourId, tourConfig, {
            onComplete: () => {
                showTourCompletionMessage();
            }
        });

        // Check if user hasn't seen the tour
        if (!tour.hasCompleted()) {
            // Show "Take a Tour" prompt after a short delay
            setTimeout(() => {
                showTourPrompt(tour);
            }, 1500);
        }

        // Add "Help" button to trigger tour manually
        addTourButton(tour);
    }
});

// Show prompt asking if user wants to take the tour
function showTourPrompt(tour) {
    const prompt = document.createElement('div');
    prompt.id = 'tour-prompt';
    prompt.innerHTML = `
        <div style="position: fixed; bottom: 20px; right: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); padding: 20px; max-width: 320px; z-index: 9999; animation: slideUp 0.3s ease;">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="font-size: 32px;">👋</div>
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #2c3e50;">Welcome! New here?</h3>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #666; line-height: 1.5;">Take a quick tour to learn about all the features available to you.</p>
                    <div style="display: flex; gap: 10px;">
                        <button id="tour-start-btn" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Take Tour</button>
                        <button id="tour-dismiss-btn" style="background: #f5f5f5; color: #666; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Maybe Later</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(prompt);

    document.getElementById('tour-start-btn').addEventListener('click', () => {
        prompt.remove();
        tour.start(true);
    });

    document.getElementById('tour-dismiss-btn').addEventListener('click', () => {
        prompt.remove();
        tour.markCompleted(); // Don't show again
    });

    // Auto-dismiss after 30 seconds. Previously this just removed the
    // element without persisting — so an ignored prompt would pop again
    // on every page load. "If dismissed, it goes" means *any* dismissal
    // (button, timeout, future X close) counts. Mark completed here too.
    setTimeout(() => {
        if (prompt.parentElement) {
            prompt.remove();
            tour.markCompleted();
        }
    }, 30000);
}

// Add a "Help / Tour" button to the page
function addTourButton(tour) {
    // Check if there's already a help button area
    let helpArea = document.querySelector('.tour-help-btn');
    if (helpArea) return;

    // "If dismissed, it goes" — once the user has dismissed the prompt
    // (Maybe Later, X close, or 30s auto-dismiss), the floating help
    // pill stops auto-injecting on subsequent loads too. The tour can
    // still be re-launched programmatically (e.g. from a hamburger menu
    // "Replay tour" item) via tour.start(true) — that bypasses
    // hasCompleted, so power users aren't permanently locked out.
    if (typeof tour?.hasCompleted === 'function' && tour.hasCompleted()) {
        return;
    }

    const btn = document.createElement('button');
    btn.className = 'tour-help-btn';
    btn.innerHTML = '<i class="fas fa-question-circle"></i> Tour';
    btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        border: 1px solid #e0e0e0;
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        color: #666;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 9990;
        transition: all 0.2s;
    `;

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f5f5f5';
    });

    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'white';
    });

    btn.addEventListener('click', () => {
        tour.start(true);
    });

    document.body.appendChild(btn);
}

// Show completion message
function showTourCompletionMessage() {
    const msg = document.createElement('div');
    msg.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); padding: 40px; text-align: center; z-index: 100000; animation: scaleIn 0.3s ease;">
            <div style="font-size: 64px; margin-bottom: 16px;">🎉</div>
            <h2 style="margin: 0 0 12px 0; color: #2c3e50;">Tour Complete!</h2>
            <p style="margin: 0 0 24px 0; color: #666; font-size: 16px;">You're all set. Click "Tour" anytime to revisit.</p>
            <button onclick="this.parentElement.parentElement.remove()" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 12px 32px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500;">Got it!</button>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes scaleIn {
            from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
            to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(msg);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (msg.parentElement) msg.remove();
    }, 5000);
}

;
/* --- /js/idle-dialog.js --- */
/**
 * idle-dialog.js — the session-timeout dialog, as a real dialog.
 *
 * The idle warning used to be a native confirm() ("⚠️ Inactivity Detected …
 * Click OK to stay logged in, or Cancel to logout now") and the timeout notice
 * a native alert(). Both look like a browser error on an otherwise fully
 * styled product, and both are BLOCKING: confirm() freezes the event loop, so
 * the countdown the copy promises cannot tick, and a student who walks away
 * comes back to a frozen page whose logout fires the instant they dismiss it.
 *
 * This is the shared replacement. Two callers use it — auto-logout.js (the
 * 30-minute timer, the one chat runs) and sessionManager.js (the 20-minute
 * timer on pages auto-logout is not loaded on) — so the same event never shows
 * a student two different dialogs.
 *
 * Self-contained on purpose: it injects its own stylesheet and depends on no
 * page CSS, because it has to render identically on the seven pages that load
 * design-system.css and the eight that don't. Where the --cr-* tokens DO
 * exist it adopts them, so it follows the page's theme instead of fighting it.
 *
 *   MMIdleDialog.warn({ msRemaining, onStay, onSignOut })  -> live countdown
 *   MMIdleDialog.notice({ title, body, actionLabel, onAction, autoMs })
 *   MMIdleDialog.close()
 */
(function (root) {
  'use strict';

  var STYLE_ID = 'mm-idle-dialog-css';
  var CSS = [
    '.mm-idle{',
    // Adopt the page's design tokens when it has them; the fallbacks are the
    // light palette, which is what the token-less pages render in.
    '  --mmi-panel: var(--cr-bg-panel, #ffffff);',
    '  --mmi-ink: var(--cr-text, #18202b);',
    '  --mmi-dim: var(--cr-text-dim, #5b6876);',
    '  --mmi-accent: var(--cr-accent, #6c5ce7);',
    '  --mmi-accent-strong: var(--cr-accent-strong, #4d3dd1);',
    '  --mmi-warn: var(--cr-warning, #d97706);',
    '  --mmi-border: var(--cr-border-strong, rgba(16,24,40,.12));',
    '  position: fixed; inset: 0; z-index: 2147483000;',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 20px;',
    '  background: rgba(11,15,26,.55); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);',
    '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  animation: mm-idle-fade .18s ease both;',
    '}',
    '@keyframes mm-idle-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes mm-idle-rise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
    '.mm-idle-card{',
    '  width: 100%; max-width: 420px; box-sizing: border-box;',
    '  background: var(--mmi-panel); color: var(--mmi-ink);',
    '  border: 1px solid var(--mmi-border); border-radius: 18px;',
    '  padding: 26px 26px 22px; text-align: center;',
    '  box-shadow: 0 18px 48px rgba(0,0,0,.28);',
    '  animation: mm-idle-rise .22s cubic-bezier(.2,1,.3,1) both;',
    '}',
    '.mm-idle-ic{',
    '  width: 46px; height: 46px; margin: 0 auto 14px; border-radius: 50%;',
    '  display: flex; align-items: center; justify-content: center; font-size: 22px;',
    '  background: color-mix(in srgb, var(--mmi-warn) 16%, transparent);',
    '}',
    '.mm-idle-t{ margin: 0 0 8px; font-size: 19px; font-weight: 700; letter-spacing: -.01em; }',
    '.mm-idle-b{ margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--mmi-dim); }',
    '.mm-idle-count{',
    '  display: block; margin: 16px auto 4px;',
    '  font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums;',
    '  color: var(--mmi-ink); letter-spacing: .01em;',
    '}',
    '.mm-idle-acts{ display: flex; flex-direction: column; gap: 9px; margin-top: 20px; }',
    '.mm-idle-btn{',
    '  width: 100%; padding: 12px 18px; border-radius: 12px; cursor: pointer;',
    '  font: 600 14.5px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  border: 1px solid transparent; transition: filter .15s ease, background .15s ease;',
    '}',
    '.mm-idle-btn:focus-visible{ outline: 2px solid var(--mmi-accent); outline-offset: 2px; }',
    '.mm-idle-btn.is-primary{ background: var(--mmi-accent); color: #fff; }',
    '.mm-idle-btn.is-primary:hover{ background: var(--mmi-accent-strong); }',
    '.mm-idle-btn.is-ghost{ background: transparent; color: var(--mmi-dim); border-color: var(--mmi-border); }',
    '.mm-idle-btn.is-ghost:hover{ color: var(--mmi-ink); background: color-mix(in srgb, var(--mmi-ink) 6%, transparent); }',
    '.mm-idle-sr{ position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }',
    '@media (prefers-reduced-motion: reduce){ .mm-idle, .mm-idle-card{ animation: none; } }',
    '@media (max-width: 420px){ .mm-idle-card{ padding: 22px 18px 18px; } .mm-idle-count{ font-size: 26px; } }',
  ].join('\n');

  function injectCss(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  var open = null;   // { el, tick, restoreFocus, onEscape }

  function close() {
    if (!open) return;
    if (open.tick) clearInterval(open.tick);
    if (open.autoTimer) clearTimeout(open.autoTimer);
    document.removeEventListener('keydown', open.onKeydown, true);
    if (open.el.parentNode) open.el.parentNode.removeChild(open.el);
    var restore = open.restoreFocus;
    open = null;
    // Give focus back to whatever the student was on, so a keyboard user is
    // not dumped at the top of the document.
    try { if (restore && restore.focus) restore.focus(); } catch (_) { /* gone */ }
  }

  function mmss(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Build the shell. `buttons` is [{ label, kind, onClick }] in visual order;
   * the first is the one focus lands on, so it must always be the safe choice.
   */
  function build(opts) {
    close();
    var doc = document;
    injectCss(doc);

    var el = doc.createElement('div');
    el.className = 'mm-idle';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mm-idle-t');
    el.setAttribute('aria-describedby', 'mm-idle-b');

    var card = doc.createElement('div');
    card.className = 'mm-idle-card';

    var ic = doc.createElement('div');
    ic.className = 'mm-idle-ic';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = opts.icon || '⏳';

    var h = doc.createElement('h2');
    h.className = 'mm-idle-t'; h.id = 'mm-idle-t';
    h.textContent = opts.title;

    var p = doc.createElement('p');
    p.className = 'mm-idle-b'; p.id = 'mm-idle-b';
    p.textContent = opts.body;

    card.appendChild(ic); card.appendChild(h); card.appendChild(p);

    var count = null;
    var live = null;
    if (opts.countdown) {
      count = doc.createElement('strong');
      count.className = 'mm-idle-count';
      // The seconds tick once a second — announcing that would flood a screen
      // reader. The visual number is hidden from AT and a polite region below
      // carries the same information at whole-minute granularity instead.
      count.setAttribute('aria-hidden', 'true');
      live = doc.createElement('span');
      live.className = 'mm-idle-sr';
      live.setAttribute('aria-live', 'polite');
      card.appendChild(count); card.appendChild(live);
    }

    var acts = doc.createElement('div');
    acts.className = 'mm-idle-acts';
    var first = null;
    (opts.buttons || []).forEach(function (b) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'mm-idle-btn is-' + (b.kind || 'ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', function (ev) {
        // Never let the click reach the document-level activity listeners that
        // reset the very timer this dialog is asking about — the caller
        // decides what the answer means, not the click.
        ev.stopPropagation();
        var fn = b.onClick;
        close();
        if (fn) fn();
      });
      acts.appendChild(btn);
      if (!first) first = btn;
    });
    card.appendChild(acts);
    el.appendChild(card);

    // The scrim swallows clicks: dismissing by missing the card is not an
    // answer to "are you still there?".
    el.addEventListener('click', function (ev) { ev.stopPropagation(); });

    open = {
      el: el,
      restoreFocus: doc.activeElement,
      count: count,
      live: live,
      onKeydown: function (ev) {
        if (!open) return;
        if (ev.key === 'Escape') {
          // Escape takes the safe branch (stay signed in), never the
          // destructive one.
          ev.preventDefault(); ev.stopPropagation();
          if (first) first.click();
          return;
        }
        if (ev.key !== 'Tab') return;
        // Trap focus: the dialog is the only thing on the page that matters.
        var f = el.querySelectorAll('button');
        if (!f.length) return;
        var lo = f[0], hi = f[f.length - 1];
        if (ev.shiftKey && doc.activeElement === lo) { ev.preventDefault(); hi.focus(); }
        else if (!ev.shiftKey && doc.activeElement === hi) { ev.preventDefault(); lo.focus(); }
      },
    };

    doc.addEventListener('keydown', open.onKeydown, true);
    (doc.body || doc.documentElement).appendChild(el);
    if (first) first.focus();
    return open;
  }

  var api = {
    /**
     * The idle warning, with a countdown that actually counts down.
     * `msRemaining` is re-read from `getRemaining()` every second when the
     * caller supplies one, so the number stays honest if the page was
     * throttled in a background tab.
     */
    warn: function (opts) {
      opts = opts || {};
      var getRemaining = opts.getRemaining || function () { return opts.msRemaining || 0; };
      var state = build({
        icon: '⏳',
        title: opts.title || 'Still there?',
        body: opts.body || 'You’ve been idle for a while, so we’ll sign you out to keep your account safe.',
        countdown: true,
        buttons: [
          { label: opts.stayLabel || 'I’m still here', kind: 'primary', onClick: opts.onStay },
          { label: opts.signOutLabel || 'Sign out now', kind: 'ghost', onClick: opts.onSignOut },
        ],
      });

      var lastMinute = -1;
      function paint() {
        if (!open || open !== state) return;
        var ms = getRemaining();
        state.count.textContent = mmss(ms);
        var mins = Math.ceil(ms / 60000);
        if (mins !== lastMinute) {
          lastMinute = mins;
          state.live.textContent = mins > 1
            ? 'Signing out in about ' + mins + ' minutes.'
            : 'Signing out in less than a minute.';
        }
        if (ms <= 0) { clearInterval(state.tick); state.tick = null; }
      }
      paint();
      state.tick = setInterval(paint, 1000);
      return state;
    },

    /** A one-button notice — what alert() was doing, without blocking. */
    notice: function (opts) {
      opts = opts || {};
      var state = build({
        icon: opts.icon || '👋',
        title: opts.title || 'You’ve been signed out',
        body: opts.body || 'We signed you out after a long stretch of inactivity.',
        buttons: [{ label: opts.actionLabel || 'Sign in again', kind: 'primary', onClick: opts.onAction }],
      });
      // Don't strand someone who never clicks — the page behind them is dead.
      if (opts.autoMs && opts.onAction) {
        state.autoTimer = setTimeout(function () { close(); opts.onAction(); }, opts.autoMs);
      }
      return state;
    },

    close: close,
    isOpen: function () { return !!open; },
  };

  root.MMIdleDialog = api;
})(window);

;
/* --- /js/sessionManager.js --- */
/**
 * Session Manager - Handles session lifecycle, idle timeout, and auto-save
 *
 * Features:
 * - 20-minute idle timeout with 2-minute warning
 * - Heartbeat tracking every 30 seconds
 * - Auto-save mastery progress on logout
 * - Session summary generation
 * - Tab/browser close detection
 *
 * The idle warning renders through MMIdleDialog (js/idle-dialog.js), shared
 * with auto-logout.js. On pages that load both, auto-logout owns the timer and
 * this class's idle check stands down (see init) — but both must reach for the
 * same dialog, or the same event shows two different-looking prompts.
 */

// Events that count as answering "are you still there?". mousemove and scroll
// deliberately do not: the warning used to vanish as the pointer travelled
// toward its own buttons.
const DELIBERATE_ACTIVITY = new Set(['mousedown', 'keypress', 'touchstart', 'click']);

class SessionManager {
  constructor() {
    this.IDLE_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds
    this.WARNING_TIME = 2 * 60 * 1000;  // 2 minutes warning before timeout
    this.HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds
    this.IDLE_THRESHOLD = 60 * 1000; // Consider idle after 60 seconds of no activity
    this.MAX_BACKOFF = 5 * 60 * 1000; // Cap backoff at 5 minutes

    this.lastActivity = Date.now();
    this.warningShown = false;
    this.heartbeatTimer = null;
    this.currentHeartbeatInterval = this.HEARTBEAT_INTERVAL;
    this.consecutiveFailures = 0;
    this.idleCheckTimer = null;
    this.warningTimer = null;
    this.sessionStartTime = Date.now();

    // IMPROVED: Precise active time tracking
    this.lastActiveTimestamp = Date.now(); // When we last recorded activity
    this.accumulatedActiveSeconds = 0; // Seconds accumulated since last heartbeat
    this.isCurrentlyActive = true; // Whether user is currently active (not idle)

    this.sessionData = {
      problemsAttempted: 0,
      problemsSolved: 0,
      hintsUsed: 0,
      timeSpent: 0,
      masteryProgress: null
    };

    this.stopped = false;
    this.init();
  }

  init() {
    // Track user activity
    this.setupActivityTrackers();

    // Start heartbeat
    this.startHeartbeat();

    // Start idle check only if auto-logout.js is NOT loaded (avoid competing timers).
    // auto-logout.js sets window.triggerLogout when initialized.
    // If both scripts are present on a page, auto-logout.js handles the timeout
    // and sessionManager focuses on heartbeats, time tracking, and session end beacons.
    this.idleCheckEnabled = !window.triggerLogout;
    if (this.idleCheckEnabled) {
      this.startIdleCheck();
      console.log('[SessionManager] Initialized with idle timeout (20 min)');
    } else {
      console.log('[SessionManager] Initialized (idle timeout deferred to auto-logout.js)');
    }

    // Stop all timers if session expires (401 detected by csrfFetch)
    window.addEventListener('session-expired', () => this.stop());

    // Handle page unload (tab/browser close)
    this.setupUnloadHandler();
  }

  setupActivityTrackers() {
    // Track mouse movement, keyboard input, clicks, touches
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(event => {
      document.addEventListener(event, () => {
        this.recordActivity(event);
      }, { passive: true });
    });
  }

  recordActivity(eventType) {
    const now = Date.now();
    const wasIdle = (now - this.lastActivity) > this.IDLE_TIMEOUT;
    const wasInactive = (now - this.lastActivity) > this.IDLE_THRESHOLD;

    // IMPROVED: Track active time precisely
    // If user was active (not idle), add the time since last activity
    if (this.isCurrentlyActive && !wasInactive) {
      const secondsSinceLastActivity = Math.floor((now - this.lastActiveTimestamp) / 1000);
      // Only count time if it's reasonable (less than idle threshold to avoid counting idle time)
      if (secondsSinceLastActivity > 0 && secondsSinceLastActivity < (this.IDLE_THRESHOLD / 1000)) {
        this.accumulatedActiveSeconds += secondsSinceLastActivity;
      }
    }

    // Update timestamps
    this.lastActivity = now;
    this.lastActiveTimestamp = now;
    this.isCurrentlyActive = true;

    // If user was idle and warning was shown, dismiss it — but only on a
    // DELIBERATE action. A mousemove or a scroll is not an answer to "are you
    // still there?", and dismissing on those meant the dialog vanished as the
    // student moved the pointer toward its own buttons.
    if (this.warningShown && DELIBERATE_ACTIVITY.has(eventType || 'click')) {
      this.dismissWarning();
    }

    // If user came back from being idle, send heartbeat immediately
    if (wasIdle) {
      this.sendHeartbeat();
    }
  }

  // Called periodically to check if user became idle
  checkAndUpdateActiveTime() {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;

    if (timeSinceLastActivity > this.IDLE_THRESHOLD) {
      // User is idle - stop counting active time
      this.isCurrentlyActive = false;
    } else if (this.isCurrentlyActive) {
      // User is still active - accumulate time
      const secondsSinceLastRecord = Math.floor((now - this.lastActiveTimestamp) / 1000);
      if (secondsSinceLastRecord > 0 && secondsSinceLastRecord < (this.IDLE_THRESHOLD / 1000)) {
        this.accumulatedActiveSeconds += secondsSinceLastRecord;
        this.lastActiveTimestamp = now;
      }
    }
  }

  startHeartbeat() {
    // Send initial heartbeat
    this.sendHeartbeat();

    // Send heartbeat on a dynamic interval (backs off on 429)
    this.scheduleNextHeartbeat();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.heartbeatTimer);
    clearInterval(this.idleCheckTimer);
    clearTimeout(this.warningTimer);
    this.heartbeatTimer = null;
    console.log('[SessionManager] Stopped (session expired)');
  }

  scheduleNextHeartbeat() {
    if (this.stopped) return;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      this.checkAndUpdateActiveTime();
      this.sendHeartbeat();
      this.scheduleNextHeartbeat();
    }, this.currentHeartbeatInterval);
  }

  handleHeartbeatSuccess() {
    if (this.consecutiveFailures > 0) {
      console.log('[SessionManager] Heartbeat recovered, resetting interval');
    }
    this.consecutiveFailures = 0;
    this.currentHeartbeatInterval = this.HEARTBEAT_INTERVAL;
  }

  handleHeartbeatFailure(status) {
    this.consecutiveFailures++;
    if (status === 429) {
      // Exponential backoff: 60s, 120s, 240s, capped at MAX_BACKOFF
      this.currentHeartbeatInterval = Math.min(
        this.HEARTBEAT_INTERVAL * Math.pow(2, this.consecutiveFailures),
        this.MAX_BACKOFF
      );
      console.warn(`[SessionManager] Rate limited, backing off to ${Math.round(this.currentHeartbeatInterval / 1000)}s`);
    }
  }

  async sendHeartbeat() {
    if (this.stopped) return;
    try {
      // Check active time one more time before sending
      this.checkAndUpdateActiveTime();

      // Get the accumulated active seconds and reset the counter
      const activeSecondsToSend = this.accumulatedActiveSeconds;
      this.accumulatedActiveSeconds = 0;
      this.lastActiveTimestamp = Date.now();

      // Send heartbeat for session keepalive
      const heartbeatResponse = await csrfFetch('/api/session/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lastActivity: this.lastActivity,
          sessionData: this.sessionData
        }),
        credentials: 'include'
      });

      if (!heartbeatResponse.ok) {
        console.error('[SessionManager] Heartbeat failed:', heartbeatResponse.status);
        this.handleHeartbeatFailure(heartbeatResponse.status);
        // Re-accumulate seconds on failure so they're not lost
        this.accumulatedActiveSeconds += activeSecondsToSend;
        return;
      }

      this.handleHeartbeatSuccess();

      // Send active time tracking if we have any active seconds
      if (activeSecondsToSend > 0) {
        const trackTimeResponse = await csrfFetch('/api/chat/track-time', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            activeSeconds: activeSecondsToSend
          }),
          credentials: 'include'
        });

        if (trackTimeResponse.ok) {
          console.log(`[SessionManager] Tracked ${activeSecondsToSend}s of active time`);
        } else {
          console.error('[SessionManager] Track time failed:', trackTimeResponse.status);
          // Add the seconds back if tracking failed
          this.accumulatedActiveSeconds += activeSecondsToSend;
        }
      }
    } catch (error) {
      console.error('[SessionManager] Heartbeat error:', error);
      // Network errors (ERR_CONNECTION_CLOSED, Failed to fetch) should also
      // trigger backoff so we don't hammer a recovering server every 30s
      this.consecutiveFailures++;
      this.currentHeartbeatInterval = Math.min(
        this.HEARTBEAT_INTERVAL * Math.pow(2, this.consecutiveFailures),
        this.MAX_BACKOFF
      );
      console.warn(`[SessionManager] Network error, backing off to ${Math.round(this.currentHeartbeatInterval / 1000)}s`);
    }
  }

  startIdleCheck() {
    // Check for idle timeout every 10 seconds
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleTimeout();
    }, 10 * 1000);
  }

  checkIdleTimeout() {
    const now = Date.now();
    const idleTime = now - this.lastActivity;

    // Check if user has been idle for 18 minutes (show warning at 18 min, timeout at 20 min)
    const timeUntilTimeout = this.IDLE_TIMEOUT - idleTime;

    if (timeUntilTimeout <= this.WARNING_TIME && timeUntilTimeout > 0 && !this.warningShown) {
      this.showIdleWarning(timeUntilTimeout);
    } else if (timeUntilTimeout <= 0) {
      this.handleIdleTimeout();
    }
  }

  showIdleWarning(timeRemaining) {
    this.warningShown = true;

    const deadline = Date.now() + timeRemaining;
    const stay = () => { this.recordActivity('click'); this.dismissWarning(); };
    const signOut = () => this.logout('user_requested');

    // Shared with auto-logout.js so the same event never shows a student two
    // different dialogs. If the page didn't load it, fall back to confirm()
    // rather than dropping the warning.
    if (!window.MMIdleDialog) {
      const minutes = Math.ceil(timeRemaining / 60000);
      if (confirm(`You will be signed out in ${minutes} minute(s) due to inactivity.\n\nOK to stay signed in, Cancel to sign out now.`)) stay();
      else signOut();
      return;
    }

    window.MMIdleDialog.warn({
      getRemaining: () => deadline - Date.now(),
      onStay: stay,
      onSignOut: signOut,
    });
  }

  dismissWarning() {
    this.warningShown = false;
    if (window.MMIdleDialog) window.MMIdleDialog.close();
  }

  handleIdleTimeout() {
    console.log('[SessionManager] Idle timeout reached - logging out');
    this.logout('idle_timeout');
  }

  async logout(reason = 'manual') {
    console.log('[SessionManager] Logging out:', reason);

    // Stop all timers
    clearTimeout(this.heartbeatTimer);
    clearInterval(this.idleCheckTimer);
    clearTimeout(this.warningTimer);

    // Calculate session duration
    this.sessionData.timeSpent = Date.now() - this.sessionStartTime;

    // IMPROVED: Send any remaining active time before logging out
    this.checkAndUpdateActiveTime();
    if (this.accumulatedActiveSeconds > 0) {
      try {
        await csrfFetch('/api/chat/track-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeSeconds: this.accumulatedActiveSeconds }),
          credentials: 'include'
        });
        console.log(`[SessionManager] Final time tracked: ${this.accumulatedActiveSeconds}s`);
        this.accumulatedActiveSeconds = 0;
      } catch (error) {
        console.error('[SessionManager] Error tracking final time:', error);
      }
    }

    // Save mastery progress if on mastery page
    await this.saveMasteryProgress();

    // Fetch session recap BEFORE ending the session (needs auth to succeed).
    // The recap modal will display after logout completes.
    let recapData = null;
    if (reason === 'manual' && window.location.pathname.includes('chat')) {
      try {
        const recapRes = await fetch('/api/session/recap', { credentials: 'include' });
        if (recapRes.ok) {
          const json = await recapRes.json();
          recapData = json.recap;
        }
      } catch (err) {
        console.error('[SessionManager] Recap fetch error:', err);
      }
    }

    // End session (generates summary)
    await this.endSession(reason);

    // Perform logout with CSRF token
    try {
      await csrfFetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('[SessionManager] Logout error:', error);
    }

    // Clear UI language cache so the next user on this device gets a clean state
    StorageUtils.local.removeItem('mathmatix_ui_lang');

    // Show session recap before redirecting (if we fetched one)
    if (recapData && recapData.headline) {
      try {
        const shown = await this.showSessionRecap(recapData);
        if (shown) return; // Recap modal handles redirect after dismissal
      } catch (err) {
        console.error('[SessionManager] Recap display error:', err);
      }
    }

    // Redirect to login
    window.location.href = '/login.html';
  }

  /**
   * Display session recap modal with pre-fetched data.
   * Psychology: Peak-End Rule — the last moment of a session shapes memory of the whole experience.
   * Growth-focused: shows progress trajectory, not just raw stats.
   * @param {Object} recap - Pre-fetched recap data (fetched before session end to avoid auth race)
   * @returns {boolean} true if recap was shown, false otherwise
   */
  async showSessionRecap(recap) {
    try {
      if (!recap || !recap.headline) return false;

      // Sanitize string fields to prevent XSS (topic could contain user-influenced content)
      const esc = (s) => {
        const el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
      };
      recap.headline = esc(recap.headline);
      recap.topic = recap.topic ? esc(recap.topic) : null;
      recap.achievement = recap.achievement ? esc(recap.achievement) : null;
      recap.narrative = recap.narrative ? esc(recap.narrative) : null;

      // Build and show recap modal
      const overlay = document.createElement('div');
      overlay.id = 'session-recap-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';

      const card = document.createElement('div');
      card.style.cssText = 'background:white;border-radius:20px;padding:32px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideUp 0.3s ease;';

      let html = `<div style="font-size:2rem;margin-bottom:8px;">&#128170;</div>`;
      html += `<h2 style="font-size:1.3rem;font-weight:700;margin:0 0 4px;color:#18202B;">${recap.headline}</h2>`;
      if (recap.topic) {
        html += `<p style="font-size:0.85rem;color:#5B6876;margin:0 0 16px;">${recap.topic} &middot; ${recap.duration || 0} min</p>`;
      }

      // Stats row
      if (recap.problemsAttempted > 0) {
        html += `<div style="display:flex;gap:16px;justify-content:center;margin-bottom:16px;">`;
        html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#12B3B3;">${recap.problemsCorrect}</div><div style="font-size:0.75rem;color:#5B6876;">Correct</div></div>`;
        html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#18202B;">${recap.problemsAttempted}</div><div style="font-size:0.75rem;color:#5B6876;">Attempted</div></div>`;
        if (recap.accuracy != null) {
          const accColor = recap.accuracy >= 70 ? '#16C86D' : recap.accuracy >= 40 ? '#FFC24B' : '#FF4E4E';
          html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:${accColor};">${recap.accuracy}%</div><div style="font-size:0.75rem;color:#5B6876;">Accuracy</div></div>`;
        }
        html += `</div>`;
      }

      // Achievement callout (growth-focused)
      if (recap.achievement) {
        html += `<p style="font-size:0.9rem;color:#18202B;background:#F0FAF7;border-radius:12px;padding:12px 16px;margin:0 0 12px;line-height:1.4;">${recap.achievement}</p>`;
      }

      // Narrative (emotional arc)
      if (recap.narrative) {
        html += `<p style="font-size:0.85rem;color:#5B6876;margin:0 0 20px;font-style:italic;line-height:1.4;">${recap.narrative}</p>`;
      }

      html += `<button id="recap-dismiss-btn" style="background:#12B3B3;color:white;border:none;border-radius:12px;padding:12px 32px;font-size:1rem;font-weight:600;cursor:pointer;transition:background 0.2s;">See you next time!</button>`;

      card.innerHTML = html;
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Add animations (idempotent — reuse if already added)
      let style = document.getElementById('session-recap-animations');
      if (!style) {
        style = document.createElement('style');
        style.id = 'session-recap-animations';
        style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(style);
      }

      // Dismiss handler
      return new Promise((resolve) => {
        let dismissed = false;
        const dismiss = () => {
          if (dismissed) return;
          dismissed = true;
          overlay.style.opacity = '0';
          overlay.style.transition = 'opacity 0.3s';
          setTimeout(() => {
            overlay.remove();
            window.location.href = '/login.html';
          }, 300);
        };
        document.getElementById('recap-dismiss-btn').addEventListener('click', dismiss);
        // Auto-dismiss after 10 seconds
        setTimeout(dismiss, 10000);
        resolve(true);
      });
    } catch (err) {
      console.error('[SessionManager] showSessionRecap error:', err);
      return false;
    }
  }

  async saveMasteryProgress() {
    // Check if we're on a mastery page and have progress to save
    if (window.location.pathname.includes('mastery-chat.html')) {
      try {
        // Get mastery progress from the page if available
        const masteryProgress = this.getMasteryProgressFromPage();

        if (masteryProgress) {
          this.sessionData.masteryProgress = masteryProgress;

          const response = await csrfFetch('/api/session/save-mastery', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ masteryProgress }),
            credentials: 'include'
          });

          if (response.ok) {
            console.log('[SessionManager] Mastery progress saved');
          }
        }
      } catch (error) {
        console.error('[SessionManager] Error saving mastery progress:', error);
      }
    }
  }

  getMasteryProgressFromPage() {
    // Try to get mastery progress from global variables or localStorage
    // This should be set by mastery-chat.html
    if (typeof window.currentMasteryProgress !== 'undefined') {
      return window.currentMasteryProgress;
    }

    // Try localStorage
    let stored;
    stored = StorageUtils.local.getItem('masteryProgress');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('[SessionManager] Failed to parse stored mastery progress');
      }
    }

    return null;
  }

  async endSession(reason) {
    try {
      const response = await csrfFetch('/api/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason,
          destroySession: true,
          sessionData: this.sessionData
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[SessionManager] Session ended:', data);
      }
    } catch (error) {
      console.error('[SessionManager] Error ending session:', error);
    }
  }

  setupUnloadHandler() {
    // Track if we've already sent the end session request
    this.sessionEndSent = false;

    // Helper to send session end with proper content type
    const sendSessionEnd = (reason) => {
      if (this.sessionEndSent) return;
      this.sessionEndSent = true;

      // Track remaining active time
      this.checkAndUpdateActiveTime();
      if (this.accumulatedActiveSeconds > 0) {
        const timeBlob = new Blob(
          [JSON.stringify({ activeSeconds: this.accumulatedActiveSeconds })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/chat/track-time', timeBlob);
      }

      // Save mastery progress
      const masteryProgress = this.getMasteryProgressFromPage();
      if (masteryProgress) {
        const masteryBlob = new Blob(
          [JSON.stringify({ masteryProgress })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/session/save-mastery', masteryBlob);
      }

      // Send session end for summary/tracking only — do NOT destroy the session.
      // beforeunload and pagehide fire on BOTH browser close AND same-origin
      // navigation (e.g. clicking "Change Tutor" in settings). Destroying the
      // session here would log the user out whenever they navigate between pages.
      // Stale sessions are cleaned up server-side by destroyIdleExpressSessions().
      const payload = {
        reason,
        destroySession: false,
        sessionData: {
          ...this.sessionData,
          timeSpent: Date.now() - this.sessionStartTime
        }
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/session/end', blob);

      console.log(`[SessionManager] Session end beacon sent: ${reason}`);
    };

    // 1. beforeunload - fires when user is leaving the page (navigation OR tab close)
    window.addEventListener('beforeunload', () => {
      sendSessionEnd('browser_close');
    });

    // 2. pagehide - more reliable than beforeunload on mobile and modern browsers
    window.addEventListener('pagehide', (e) => {
      // e.persisted indicates if page might be restored from bfcache
      if (!e.persisted) {
        sendSessionEnd('page_hide');
      }
    });

    // 3. visibilitychange - detect tab becoming hidden (might be closing)
    //    Only flush accumulated time; the unload handlers above will send the
    //    final beacon if the page is actually closing. This avoids duplicate
    //    beacons when visibilitychange fires right before beforeunload/pagehide.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Snapshot active time so it's included in the unload beacon if page closes,
        // but don't send a separate beacon here — let sendSessionEnd handle it.
        this.checkAndUpdateActiveTime();
      }
    });
  }

  // Public methods for updating session data
  updateSessionData(data) {
    this.sessionData = { ...this.sessionData, ...data };
  }

  incrementProblemsAttempted() {
    this.sessionData.problemsAttempted++;
  }

  incrementProblemsSolved() {
    this.sessionData.problemsSolved++;
  }

  incrementHintsUsed() {
    this.sessionData.hintsUsed++;
  }

  // Public method to trigger manual logout
  triggerLogout() {
    this.logout('manual');
  }
}

// Initialize session manager when DOM is ready
let sessionManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    sessionManager = new SessionManager();
    window.sessionManager = sessionManager; // Make globally accessible
  });
} else {
  sessionManager = new SessionManager();
  window.sessionManager = sessionManager;
}

;
/* --- /js/demo-banner.js --- */
// js/demo-banner.js
// Checks if the current session is a demo/playground session and shows a persistent banner.
// Also handles the "Start Over" (reset) and "Exit Demo" (logout) actions.

(function() {
  'use strict';

  // Check demo status on page load
  checkDemoStatus();

  async function checkDemoStatus() {
    try {
      const response = await fetch('/api/demo/status', { credentials: 'include' });
      if (!response.ok) return;

      const data = await response.json();
      if (!data.isDemo) return;

      // We're in demo mode — show the banner
      showDemoBanner(data);
    } catch (err) {
      // Silently fail — not critical
    }
  }

  function showDemoBanner(data) {
    // Add demo-mode class to body for CSS adjustments
    document.body.classList.add('demo-mode');

    // Create banner element
    const banner = document.createElement('div');
    banner.className = 'demo-banner visible';
    banner.id = 'demo-banner';

    const profileName = data.profile ? data.profile.name : 'Demo';
    const profileLabel = data.profile ? data.profile.label : 'Demo Account';

    banner.innerHTML = `
      <div class="demo-banner-text">
        <span class="demo-banner-label">Playground</span>
        <span>You're exploring as <strong>${profileName}</strong> (${profileLabel})</span>
      </div>
      <div class="demo-banner-actions">
        <button class="demo-banner-btn reset" id="demo-reset-btn" title="Reset this demo account to its initial state">
          <i class="fas fa-undo"></i> Start Over
        </button>
        <a href="/demo.html" class="demo-banner-btn switch" id="demo-switch-btn" title="Switch to a different demo account">
          <i class="fas fa-exchange-alt"></i> Switch Role
        </a>
        <button class="demo-banner-btn exit" id="demo-exit-btn" title="Exit the demo and return to the login page">
          <i class="fas fa-sign-out-alt"></i> Exit Demo
        </button>
      </div>
    `;

    // Insert at very top of body
    document.body.insertBefore(banner, document.body.firstChild);

    // Attach event handlers
    document.getElementById('demo-reset-btn').addEventListener('click', handleReset);
    document.getElementById('demo-exit-btn').addEventListener('click', handleExit);
  }

  async function handleReset() {
    const btn = document.getElementById('demo-reset-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Resetting...';
    btn.disabled = true;

    try {
      const response = await csrfFetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const result = await response.json();
      if (result.success) {
        // Reload the page to see fresh state
        window.location.reload();
      } else {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        alert('Reset failed: ' + (result.message || 'Unknown error'));
      }
    } catch (err) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      alert('Reset failed. Please try again.');
    }
  }

  async function handleExit() {
    const btn = document.getElementById('demo-exit-btn');
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Exiting...';
    btn.disabled = true;

    try {
      // The logout route will handle the demo reset
      const response = await csrfFetch('/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (response.ok) {
        window.location.href = '/demo.html';
      } else {
        window.location.href = '/login.html';
      }
    } catch (err) {
      window.location.href = '/login.html';
    }
  }
})();
