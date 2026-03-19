/* ============================================
   MOBILE CHAT NAVIGATION — MATHMATIX AI (v2)
   5-tab bottom nav with full-screen panels:
   Home · Chat · Actions · Progress · Profile
   ============================================ */

(function () {
    'use strict';

    // Only run on the chat page
    if (!document.body.classList.contains('landing-page-body')) return;

    var MOBILE_BP = 769;

    /* ---- Five-tab layout ---- */
    var NAV_ITEMS = [
        { action: 'home',     icon: 'fa-home',         label: 'Home' },
        { action: 'chat',     icon: 'fa-comment-dots',  label: 'Chat', active: true },
        { action: 'actions',  icon: 'fa-bolt',          label: 'Actions' },
        { action: 'progress', icon: 'fa-chart-line',    label: 'Progress' },
        { action: 'profile',  icon: 'fa-user-circle',   label: 'Profile' }
    ];

    var activeTab = 'chat';
    var panelsBuilt = {};
    var savedScrollPos = null;   // preserve chat scroll across tab switches
    var savedInputContent = '';  // preserve typed input across tab switches

    /* ---- helpers ---- */

    function isMobile() { return window.innerWidth < MOBILE_BP; }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function triggerClick(id) {
        var el = document.getElementById(id);
        if (el) el.click();
    }

    function getUserName() {
        // Try to get from existing DOM elements or session
        var el = document.querySelector('#sidebar-level');
        var nameEl = document.querySelector('.mp-profile-name');
        if (nameEl && nameEl.textContent) return nameEl.textContent;
        // Fallback: try localStorage or defaults
        try {
            var user = JSON.parse(localStorage.getItem('mathmatix_user') || '{}');
            return user.firstName || user.name || 'Student';
        } catch (e) { return 'Student'; }
    }

    function getStatValue(id, fallback) {
        var el = document.getElementById(id);
        return el ? el.textContent : (fallback || '0');
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

        nav.addEventListener('click', function (e) {
            var btn = e.target.closest('.chat-nav-item');
            if (!btn) return;
            switchTab(btn.dataset.action);
        });
    }

    function switchTab(action) {
        if (activeTab === action && action === 'chat') return;

        // Save chat state before leaving the chat tab
        if (activeTab === 'chat') {
            var box = document.getElementById('chat-messages-container');
            if (box) savedScrollPos = box.scrollTop;
            var input = document.getElementById('user-input');
            if (input) savedInputContent = input.innerHTML;
        }

        activeTab = action;

        // Update nav highlight
        var items = document.querySelectorAll('.chat-nav-item');
        items.forEach(function (item) {
            item.classList.toggle('active', item.dataset.action === action);
        });

        // Hide all panels
        var panels = document.querySelectorAll('.mobile-panel');
        panels.forEach(function (p) { p.classList.remove('active'); });

        // Remove panel-active classes
        document.body.classList.remove('mobile-panel-active', 'mobile-panel-chat');

        if (action === 'chat') {
            // Show main chat (no panel overlay)
            document.body.classList.add('mobile-panel-chat');

            // Restore chat state
            requestAnimationFrame(function () {
                var box = document.getElementById('chat-messages-container');
                if (box) {
                    // Restore saved position, or scroll to bottom if no saved state
                    box.scrollTop = savedScrollPos != null ? savedScrollPos : box.scrollHeight;
                }
                var input = document.getElementById('user-input');
                if (input) {
                    // Restore typed content if it was cleared
                    if (savedInputContent && !input.innerHTML.trim()) {
                        input.innerHTML = savedInputContent;
                    }
                    input.focus();
                }
            });
        } else {
            // Build and show the panel
            document.body.classList.add('mobile-panel-active');
            buildPanel(action);
            var panel = document.getElementById('mp-' + action);
            if (panel) panel.classList.add('active');
        }
    }

    /* ---- Panel builder dispatcher ---- */

    function buildPanel(name) {
        if (panelsBuilt[name]) {
            // Refresh data on re-open
            if (name === 'home') refreshHomePanel();
            if (name === 'progress') refreshProgressPanel();
            if (name === 'profile') refreshProfilePanel();
            return;
        }

        switch (name) {
            case 'home': buildHomePanel(); break;
            case 'actions': buildActionsPanel(); break;
            case 'progress': buildProgressPanel(); break;
            case 'profile': buildProfilePanel(); break;
        }
        panelsBuilt[name] = true;
    }

    /* ============================
       HOME PANEL
       ============================ */

    function buildHomePanel() {
        var panel = document.createElement('div');
        panel.id = 'mp-home';
        panel.className = 'mobile-panel';

        panel.innerHTML = ''
            + '<div class="mp-header">'
            + '  <img src="/images/mathmatix-ai-logo.png" alt="Mathmatix" class="mp-header-logo">'
            + '  <div class="mp-header-actions">'
            + '    <button class="mp-header-btn" id="mp-home-theme-btn" aria-label="Toggle theme"><i class="fas ' + (isDark() ? 'fa-sun' : 'fa-moon') + '"></i></button>'
            + '  </div>'
            + '</div>'
            + '<div class="mp-content" id="mp-home-content">'
            + '  <div class="mp-home-welcome">'
            + '    <h1 id="mp-home-greeting">Welcome back!</h1>'
            + '    <p>Ready to learn?</p>'
            + '  </div>'
            + '  <div id="mp-home-continue"></div>'
            + '  <div class="mp-quick-stats" id="mp-home-stats"></div>'
            + '  <div id="mp-home-quests"></div>'
            + '  <div id="mp-home-recent"></div>'
            + '</div>';

        document.body.appendChild(panel);

        // Theme toggle
        document.getElementById('mp-home-theme-btn').addEventListener('click', function () {
            triggerClick('theme-toggle-btn');
            setTimeout(function () {
                var icon = document.querySelector('#mp-home-theme-btn i');
                if (icon) icon.className = 'fas ' + (isDark() ? 'fa-sun' : 'fa-moon');
            }, 150);
        });

        refreshHomePanel();
    }

    function refreshHomePanel() {
        var name = getUserName();
        var greetEl = document.getElementById('mp-home-greeting');
        if (greetEl) greetEl.textContent = 'Welcome back, ' + name + '!';

        // Continue Learning Card
        var continueEl = document.getElementById('mp-home-continue');
        if (continueEl) {
            // Try to get current course info from the course progress bar
            var courseTitle = document.getElementById('course-progress-title');
            var courseModule = document.getElementById('course-progress-module');
            var coursePct = document.getElementById('course-progress-pct');

            var title = courseTitle ? courseTitle.textContent : '';
            var module = courseModule ? courseModule.textContent : '';
            var pct = coursePct ? courseTitle.textContent : '';

            // Also check sidebar courses for enrolled courses
            var courseItems = document.querySelectorAll('#course-sessions-list .sidebar-course-item');

            if (title || courseItems.length > 0) {
                var displayTitle = title || 'Your Course';
                var displayModule = module || 'Continue learning';
                var displayPct = parseInt(pct) || 0;

                // Get progress from the sidebar if available
                var progressFill = document.getElementById('sidebar-progress-fill');
                if (progressFill && !pct) {
                    displayPct = parseInt(progressFill.style.width) || 0;
                }

                continueEl.innerHTML = ''
                    + '<div class="mp-continue-card">'
                    + '  <div class="mp-continue-icon"><i class="fas fa-play"></i></div>'
                    + '  <h3>' + escHtml(displayTitle || 'Continue Learning') + '</h3>'
                    + '  <p class="mp-continue-sub">' + escHtml(displayModule || 'Pick up where you left off') + '</p>'
                    + '  <div class="mp-continue-progress">'
                    + '    <div class="mp-continue-bar"><div class="mp-continue-fill" style="width: ' + displayPct + '%;"></div></div>'
                    + '    <span class="mp-continue-pct">' + displayPct + '%</span>'
                    + '  </div>'
                    + '  <button class="mp-continue-btn" id="mp-home-continue-btn">'
                    + '    <i class="fas fa-play"></i> Continue'
                    + '  </button>'
                    + '</div>';

                document.getElementById('mp-home-continue-btn').addEventListener('click', function () {
                    switchTab('chat');
                });
            } else {
                continueEl.innerHTML = ''
                    + '<div class="mp-continue-card">'
                    + '  <div class="mp-continue-icon"><i class="fas fa-graduation-cap"></i></div>'
                    + '  <h3>Start Learning</h3>'
                    + '  <p class="mp-continue-sub">Enroll in a course or ask your AI tutor anything</p>'
                    + '  <button class="mp-continue-btn" id="mp-home-start-btn">'
                    + '    <i class="fas fa-play"></i> Start Chat'
                    + '  </button>'
                    + '</div>';

                document.getElementById('mp-home-start-btn').addEventListener('click', function () {
                    switchTab('chat');
                });
            }
        }

        // Quick Stats
        var statsEl = document.getElementById('mp-home-stats');
        if (statsEl) {
            var streak = getStatValue('drawer-streak-count', '0');
            var totalXP = getStatValue('drawer-total-xp', '0');
            var solved = getStatValue('drawer-total-problems', '0');

            statsEl.innerHTML = ''
                + '<div class="mp-quick-stat">'
                + '  <span class="mp-quick-stat-icon">&#128293;</span>'
                + '  <span class="mp-quick-stat-value">' + streak + '</span>'
                + '  <span class="mp-quick-stat-label">Day Streak</span>'
                + '</div>'
                + '<div class="mp-quick-stat">'
                + '  <span class="mp-quick-stat-icon">&#11088;</span>'
                + '  <span class="mp-quick-stat-value">' + totalXP + '</span>'
                + '  <span class="mp-quick-stat-label">Total XP</span>'
                + '</div>'
                + '<div class="mp-quick-stat">'
                + '  <span class="mp-quick-stat-icon">&#9989;</span>'
                + '  <span class="mp-quick-stat-value">' + solved + '</span>'
                + '  <span class="mp-quick-stat-label">Solved</span>'
                + '</div>';
        }

        // Daily Quests Section
        var questsEl = document.getElementById('mp-home-quests');
        if (questsEl) {
            var questsSource = document.getElementById('drawer-daily-quests-container') ||
                               document.getElementById('daily-quests-container');
            var questItems = questsSource ? questsSource.querySelectorAll('.quest-item, .daily-quest-item') : [];

            var questHtml = '<div class="mp-section-header">'
                + '<span class="mp-section-title"><i class="fas fa-tasks"></i> Daily Quests</span>'
                + '</div>';

            if (questItems.length > 0) {
                questItems.forEach(function (q, i) {
                    if (i >= 3) return; // Show max 3
                    var name = q.querySelector('.quest-name, .quest-title');
                    var progress = q.querySelector('.quest-progress-fill, .progress-fill');
                    var reward = q.querySelector('.quest-reward, .quest-xp');
                    var pctWidth = progress ? progress.style.width : '0%';

                    questHtml += '<div class="mp-quest-card">'
                        + '  <span class="mp-quest-icon">&#127919;</span>'
                        + '  <div class="mp-quest-info">'
                        + '    <div class="mp-quest-name">' + escHtml(name ? name.textContent : 'Quest') + '</div>'
                        + '    <div class="mp-quest-bar"><div class="mp-quest-bar-fill" style="width: ' + pctWidth + ';"></div></div>'
                        + '  </div>'
                        + '  <span class="mp-quest-reward">' + escHtml(reward ? reward.textContent : '+XP') + '</span>'
                        + '</div>';
                });
            } else {
                questHtml += '<div class="mp-quest-card">'
                    + '  <span class="mp-quest-icon">&#127919;</span>'
                    + '  <div class="mp-quest-info">'
                    + '    <div class="mp-quest-name">Complete a session to unlock quests</div>'
                    + '  </div>'
                    + '</div>';
            }

            questsEl.innerHTML = questHtml;
        }

        // Recent Progress
        var recentEl = document.getElementById('mp-home-recent');
        if (recentEl) {
            recentEl.innerHTML = '<div class="mp-section-header">'
                + '<span class="mp-section-title"><i class="fas fa-trophy"></i> Recent Progress</span>'
                + '<button class="mp-section-link" id="mp-home-see-progress">See All</button>'
                + '</div>'
                + '<div class="mp-recent-list" id="mp-home-recent-list">'
                + '  <div class="mp-recent-item">'
                + '    <div class="mp-recent-icon xp"><i class="fas fa-star"></i></div>'
                + '    <div class="mp-recent-text">'
                + '      <div class="mp-recent-title">Keep practicing to build your progress!</div>'
                + '      <div class="mp-recent-meta">Your activity will appear here</div>'
                + '    </div>'
                + '  </div>'
                + '</div>';

            var seeProgressBtn = document.getElementById('mp-home-see-progress');
            if (seeProgressBtn) {
                seeProgressBtn.addEventListener('click', function () {
                    switchTab('progress');
                });
            }
        }
    }

    /* ============================
       ACTIONS PANEL
       ============================ */

    function buildActionsPanel() {
        var panel = document.createElement('div');
        panel.id = 'mp-actions';
        panel.className = 'mobile-panel';

        panel.innerHTML = ''
            + '<div class="mp-header">'
            + '  <h2 class="mp-header-title">Actions</h2>'
            + '  <div class="mp-header-actions">'
            + '    <button class="mp-header-btn" id="mp-actions-search-btn" aria-label="Search"><i class="fas fa-search"></i></button>'
            + '  </div>'
            + '</div>'
            + '<div class="mp-content">'
            // Chat Tools section — equation entry + file upload front and center
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-pen-fancy"></i> Chat Tools</span>'
            + '  </div>'
            + '  <div class="mp-actions-grid">'
            // Insert Equation — Featured
            + '    <div class="mp-action-card mp-action-featured" id="mp-action-equation">'
            + '      <div class="mp-action-icon" style="background: linear-gradient(135deg, #12B3B3, #0E9494); color: white;"><i class="fas fa-square-root-variable"></i></div>'
            + '      <div class="mp-action-featured-info">'
            + '        <div class="mp-action-label">Insert Equation</div>'
            + '        <div class="mp-action-featured-desc">Use the math keyboard to type fractions, roots, and symbols</div>'
            + '      </div>'
            + '      <i class="fas fa-chevron-right mp-action-featured-arrow"></i>'
            + '    </div>'
            // Show Your Work — Featured
            + '    <div class="mp-action-card mp-action-featured" id="mp-action-show-work">'
            + '      <div class="mp-action-icon upload"><i class="fas fa-camera-retro"></i></div>'
            + '      <div class="mp-action-featured-info">'
            + '        <div class="mp-action-label">Show Your Work</div>'
            + '        <div class="mp-action-featured-desc">Take a photo or upload your work for AI feedback</div>'
            + '      </div>'
            + '      <i class="fas fa-chevron-right mp-action-featured-arrow"></i>'
            + '    </div>'
            // Attach File
            + '    <div class="mp-action-card" id="mp-action-attach">'
            + '      <div class="mp-action-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white;"><i class="fas fa-paperclip"></i></div>'
            + '      <div class="mp-action-label">Attach File</div>'
            + '    </div>'
            // Calculator
            + '    <div class="mp-action-card" id="mp-action-calculator">'
            + '      <div class="mp-action-icon calculator"><i class="fas fa-calculator"></i></div>'
            + '      <div class="mp-action-label">Calculator</div>'
            + '    </div>'
            + '  </div>'
            // Learning section
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-star"></i> Learning</span>'
            + '  </div>'
            + '  <div class="mp-actions-grid">'
            // Voice Tutor — Featured
            + '    <div class="mp-action-card mp-action-featured" id="mp-action-voice">'
            + '      <div class="mp-action-icon voice"><i class="fas fa-headset"></i></div>'
            + '      <div class="mp-action-featured-info">'
            + '        <div class="mp-action-label">Voice Tutor</div>'
            + '        <div class="mp-action-featured-desc">Talk with your AI math tutor in real-time</div>'
            + '      </div>'
            + '      <i class="fas fa-chevron-right mp-action-featured-arrow"></i>'
            + '    </div>'
            // Resources
            + '    <div class="mp-action-card" id="mp-action-resources">'
            + '      <div class="mp-action-icon resources"><i class="fas fa-book-open"></i></div>'
            + '      <div class="mp-action-label">Resources</div>'
            + '    </div>'
            // Browse Courses
            + '    <div class="mp-action-card" id="mp-action-courses">'
            + '      <div class="mp-action-icon courses"><i class="fas fa-graduation-cap"></i></div>'
            + '      <div class="mp-action-label">Browse Courses</div>'
            + '    </div>'
            + '  </div>'
            // More section
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-ellipsis-h"></i> More</span>'
            + '  </div>'
            + '  <div class="mp-actions-grid">'
            // Math Showdown
            + '    <div class="mp-action-card" id="mp-action-showdown">'
            + '      <div class="mp-action-icon showdown"><i class="fas fa-bolt"></i></div>'
            + '      <div class="mp-action-label">Math Showdown</div>'
            + '    </div>'
            // Starting Point (Screener)
            + '    <div class="mp-action-card" id="mp-action-screener">'
            + '      <div class="mp-action-icon screener"><i class="fas fa-crosshairs"></i></div>'
            + '      <div class="mp-action-label">Starting Point</div>'
            + '    </div>'
            // Feedback
            + '    <div class="mp-action-card" id="mp-action-feedback">'
            + '      <div class="mp-action-icon feedback"><i class="fas fa-comment-dots"></i></div>'
            + '      <div class="mp-action-label">Send Feedback</div>'
            + '    </div>'
            // Settings
            + '    <div class="mp-action-card" id="mp-action-settings">'
            + '      <div class="mp-action-icon" style="background: linear-gradient(135deg, #64748b, #475569); color: white;"><i class="fas fa-cog"></i></div>'
            + '      <div class="mp-action-label">Settings</div>'
            + '    </div>'
            + '  </div>'
            + '</div>';

        document.body.appendChild(panel);

        // Wire up action clicks

        // Chat Tools
        wireAction('mp-action-equation', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('insert-equation-btn'); }, 200);
        });
        wireAction('mp-action-show-work', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('camera-button'); }, 200);
        });
        wireAction('mp-action-attach', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('attach-button'); }, 200);
        });
        wireAction('mp-action-calculator', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('toggle-calculator-btn'); }, 200);
        });

        // Learning
        wireAction('mp-action-voice', function () {
            window.location.href = '/voice-tutor.html';
        });
        wireAction('mp-action-resources', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('open-resources-modal-btn'); }, 200);
        });
        wireAction('mp-action-courses', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('browse-courses-btn'); }, 200);
        });
        wireAction('mp-action-showdown', function () {
            window.location.href = '/math-showdown.html';
        });
        wireAction('mp-action-screener', function () {
            switchTab('chat');
            setTimeout(function () {
                var screenerBtn = document.getElementById('sidebar-starting-point-btn');
                if (screenerBtn) screenerBtn.click();
            }, 200);
        });
        wireAction('mp-action-feedback', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('open-feedback-modal-btn'); }, 200);
        });
        wireAction('mp-action-settings', function () {
            switchTab('chat');
            setTimeout(function () { triggerClick('open-settings-modal-btn'); }, 200);
        });
    }

    function wireAction(id, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    /* ============================
       PROGRESS PANEL
       ============================ */

    function buildProgressPanel() {
        var panel = document.createElement('div');
        panel.id = 'mp-progress';
        panel.className = 'mobile-panel';

        panel.innerHTML = ''
            + '<div class="mp-header">'
            + '  <h2 class="mp-header-title">Your Progress</h2>'
            + '  <div class="mp-header-actions">'
            + '    <button class="mp-header-btn" id="mp-progress-share-btn" aria-label="Share"><i class="fas fa-share-alt"></i></button>'
            + '  </div>'
            + '</div>'
            + '<div class="mp-content" id="mp-progress-content">'
            + '  <div class="mp-progress-hero" id="mp-progress-hero"></div>'
            + '  <div class="mp-stats-big" id="mp-progress-stats"></div>'
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-chart-line"></i> This Session</span>'
            + '  </div>'
            + '  <div class="mp-session-stats" id="mp-progress-session"></div>'
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-brain"></i> Skills</span>'
            + '  </div>'
            + '  <div class="mp-skill-list" id="mp-progress-skills"></div>'
            + '</div>';

        document.body.appendChild(panel);

        document.getElementById('mp-progress-share-btn').addEventListener('click', function () {
            triggerClick('share-progress-header-btn');
        });

        refreshProgressPanel();
    }

    function refreshProgressPanel() {
        // Hero - Level & XP
        var heroEl = document.getElementById('mp-progress-hero');
        if (heroEl) {
            var level = getStatValue('drawer-level', '1');
            var xp = getStatValue('drawer-xp', '0 / 100 XP');
            var progressFill = document.getElementById('drawer-progress-fill');
            var pctWidth = progressFill ? progressFill.style.width : '0%';

            heroEl.innerHTML = ''
                + '<div class="mp-progress-level">Level ' + level + '</div>'
                + '<div class="mp-progress-level-label">Keep learning to level up!</div>'
                + '<div class="mp-progress-bar-wrap">'
                + '  <div class="mp-progress-bar"><div class="mp-progress-bar-fill" style="width: ' + pctWidth + ';"></div></div>'
                + '  <span class="mp-progress-xp-text">' + xp + '</span>'
                + '</div>';
        }

        // Big Stats
        var statsEl = document.getElementById('mp-progress-stats');
        if (statsEl) {
            var streak = getStatValue('drawer-streak-count', '0');
            var totalXP = getStatValue('drawer-total-xp', '0');
            var solved = getStatValue('drawer-total-problems', '0');

            // Try to get mastered count from skill map
            var masteredSkills = document.querySelectorAll('.skill-mastered, [data-status="mastered"]');
            var mastered = masteredSkills.length || '—';

            statsEl.innerHTML = ''
                + '<div class="mp-stat-card">'
                + '  <span class="mp-stat-card-value">' + streak + '</span>'
                + '  <span class="mp-stat-card-label">Day Streak</span>'
                + '</div>'
                + '<div class="mp-stat-card">'
                + '  <span class="mp-stat-card-value">' + totalXP + '</span>'
                + '  <span class="mp-stat-card-label">Total XP</span>'
                + '</div>'
                + '<div class="mp-stat-card">'
                + '  <span class="mp-stat-card-value">' + solved + '</span>'
                + '  <span class="mp-stat-card-label">Problems Solved</span>'
                + '</div>'
                + '<div class="mp-stat-card">'
                + '  <span class="mp-stat-card-value">' + mastered + '</span>'
                + '  <span class="mp-stat-card-label">Skills Mastered</span>'
                + '</div>';
        }

        // Session Stats
        var sessionEl = document.getElementById('mp-progress-session');
        if (sessionEl) {
            var sessionXP = getStatValue('drawer-session-xp', '0');
            var sessionAcc = getStatValue('drawer-session-accuracy', '--');
            var sessionProblems = getStatValue('drawer-session-problems', '0/0');

            sessionEl.innerHTML = ''
                + '<div class="mp-session-stat">'
                + '  <span class="mp-session-stat-value">' + sessionXP + '</span>'
                + '  <span class="mp-session-stat-label">XP Earned</span>'
                + '</div>'
                + '<div class="mp-session-stat">'
                + '  <span class="mp-session-stat-value">' + sessionAcc + '</span>'
                + '  <span class="mp-session-stat-label">Accuracy</span>'
                + '</div>'
                + '<div class="mp-session-stat">'
                + '  <span class="mp-session-stat-value">' + sessionProblems + '</span>'
                + '  <span class="mp-session-stat-label">Problems</span>'
                + '</div>';
        }

        // Skills List - pull from skill map data if available
        var skillsEl = document.getElementById('mp-progress-skills');
        if (skillsEl) {
            var skillData = [];

            // Try to gather from window.skillMap or existing progress data
            if (window.skillMap && Array.isArray(window.skillMap)) {
                window.skillMap.forEach(function (s) {
                    skillData.push({
                        name: s.name || s.skill,
                        status: s.status || 'learning',
                        icon: s.status === 'mastered' ? 'fa-check-circle' : s.status === 'ready' ? 'fa-clock' : 'fa-spinner'
                    });
                });
            }

            if (skillData.length === 0) {
                // Fallback: try to get from existing drawer or progress page data
                var drawerSkills = document.querySelectorAll('.skill-item, .progress-skill-item');
                drawerSkills.forEach(function (el) {
                    var nameEl = el.querySelector('.skill-name, .skill-title');
                    var statusEl = el.querySelector('.skill-status, .skill-badge');
                    if (nameEl) {
                        var st = 'learning';
                        if (el.classList.contains('mastered') || (statusEl && statusEl.textContent.toLowerCase().indexOf('master') >= 0)) st = 'mastered';
                        else if (el.classList.contains('ready')) st = 'ready';
                        skillData.push({ name: nameEl.textContent, status: st });
                    }
                });
            }

            if (skillData.length > 0) {
                var skillHtml = '';
                skillData.slice(0, 15).forEach(function (s) {
                    var icon = s.status === 'mastered' ? 'fa-check-circle' : s.status === 'ready' ? 'fa-clock' : 'fa-spinner';
                    var statusLabel = s.status === 'mastered' ? 'Mastered' : s.status === 'ready' ? 'Ready to Learn' : 'Learning';
                    skillHtml += '<div class="mp-skill-item">'
                        + '  <div class="mp-skill-badge ' + s.status + '"><i class="fas ' + icon + '"></i></div>'
                        + '  <div class="mp-skill-info">'
                        + '    <div class="mp-skill-name">' + escHtml(s.name) + '</div>'
                        + '    <div class="mp-skill-status">' + statusLabel + '</div>'
                        + '  </div>'
                        + '</div>';
                });
                skillsEl.innerHTML = skillHtml;
            } else {
                skillsEl.innerHTML = '<div class="mp-empty-state">'
                    + '  <div class="mp-empty-state-icon"><i class="fas fa-brain"></i></div>'
                    + '  <div class="mp-empty-state-text">Complete math problems to start building your skill map!</div>'
                    + '</div>';
            }
        }
    }

    /* ============================
       PROFILE PANEL
       ============================ */

    function buildProfilePanel() {
        var panel = document.createElement('div');
        panel.id = 'mp-profile';
        panel.className = 'mobile-panel';

        panel.innerHTML = ''
            + '<div class="mp-header">'
            + '  <h2 class="mp-header-title">Profile</h2>'
            + '  <div class="mp-header-actions"></div>'
            + '</div>'
            + '<div class="mp-content" id="mp-profile-content">'
            + '  <div class="mp-profile-hero" id="mp-profile-hero"></div>'
            + '  <div class="mp-section-group" id="mp-profile-account-group"></div>'
            + '  <div class="mp-section-group" id="mp-profile-prefs-group"></div>'
            + '  <div class="mp-share-code-card" id="mp-profile-share"></div>'
            + '  <button class="mp-logout-btn" id="mp-profile-logout-btn">'
            + '    <i class="fas fa-sign-out-alt"></i> Log Out'
            + '  </button>'
            + '</div>';

        document.body.appendChild(panel);

        // Logout
        document.getElementById('mp-profile-logout-btn').addEventListener('click', function () {
            triggerClick('logoutBtn');
        });

        refreshProfilePanel();
    }

    function refreshProfilePanel() {
        var name = getUserName();
        var level = getStatValue('drawer-level', '1');

        // Try to get email/avatar
        var email = '';
        var avatarUrl = '';
        try {
            var user = JSON.parse(localStorage.getItem('mathmatix_user') || '{}');
            email = user.email || '';
            avatarUrl = user.avatar || user.avatarUrl || '';
        } catch (e) { /* ignore */ }

        // Hero
        var heroEl = document.getElementById('mp-profile-hero');
        if (heroEl) {
            var avatarContent = avatarUrl
                ? '<img src="' + escHtml(avatarUrl) + '" alt="Avatar">'
                : '<i class="fas fa-user"></i>';

            heroEl.innerHTML = ''
                + '<div class="mp-profile-avatar">' + avatarContent + '</div>'
                + '<h2 class="mp-profile-name">' + escHtml(name) + '</h2>'
                + (email ? '<p class="mp-profile-email">' + escHtml(email) + '</p>' : '')
                + '<span class="mp-profile-level-badge"><i class="fas fa-star"></i> Level ' + level + '</span>';
        }

        // Account Group
        var accountGroup = document.getElementById('mp-profile-account-group');
        if (accountGroup) {
            accountGroup.innerHTML = ''
                + '<button class="mp-profile-menu-item" id="mp-profile-settings-btn">'
                + '  <div class="mp-profile-menu-icon settings"><i class="fas fa-cog"></i></div>'
                + '  <div class="mp-profile-menu-text">'
                + '    <div class="mp-profile-menu-label">Settings</div>'
                + '    <div class="mp-profile-menu-desc">Account, password, preferences</div>'
                + '  </div>'
                + '  <i class="fas fa-chevron-right mp-profile-menu-arrow"></i>'
                + '</button>'
                + '<button class="mp-profile-menu-item" id="mp-profile-tutor-btn">'
                + '  <div class="mp-profile-menu-icon tutor"><i class="fas fa-user-graduate"></i></div>'
                + '  <div class="mp-profile-menu-text">'
                + '    <div class="mp-profile-menu-label">Change Tutor</div>'
                + '    <div class="mp-profile-menu-desc">Pick a different AI tutor</div>'
                + '  </div>'
                + '  <i class="fas fa-chevron-right mp-profile-menu-arrow"></i>'
                + '</button>';

            document.getElementById('mp-profile-settings-btn').addEventListener('click', function () {
                triggerClick('open-settings-modal-btn');
            });
            document.getElementById('mp-profile-tutor-btn').addEventListener('click', function () {
                var changeTutorBtn = document.getElementById('change-tutor-btn');
                if (changeTutorBtn) changeTutorBtn.click();
            });
        }

        // Preferences Group
        var prefsGroup = document.getElementById('mp-profile-prefs-group');
        if (prefsGroup) {
            prefsGroup.innerHTML = ''
                + '<button class="mp-profile-menu-item" id="mp-profile-theme-btn">'
                + '  <div class="mp-profile-menu-icon theme"><i class="fas ' + (isDark() ? 'fa-sun' : 'fa-moon') + '"></i></div>'
                + '  <div class="mp-profile-menu-text">'
                + '    <div class="mp-profile-menu-label">' + (isDark() ? 'Light Mode' : 'Dark Mode') + '</div>'
                + '    <div class="mp-profile-menu-desc">Switch appearance</div>'
                + '  </div>'
                + '  <i class="fas fa-chevron-right mp-profile-menu-arrow"></i>'
                + '</button>'
                + '<button class="mp-profile-menu-item" id="mp-profile-language-btn">'
                + '  <div class="mp-profile-menu-icon language"><i class="fas fa-globe"></i></div>'
                + '  <div class="mp-profile-menu-text">'
                + '    <div class="mp-profile-menu-label">Language</div>'
                + '    <div class="mp-profile-menu-desc">Tutoring language preference</div>'
                + '  </div>'
                + '  <i class="fas fa-chevron-right mp-profile-menu-arrow"></i>'
                + '</button>'
                + '<button class="mp-profile-menu-item" id="mp-profile-share-btn">'
                + '  <div class="mp-profile-menu-icon share"><i class="fas fa-share-alt"></i></div>'
                + '  <div class="mp-profile-menu-text">'
                + '    <div class="mp-profile-menu-label">Share Progress</div>'
                + '    <div class="mp-profile-menu-desc">Share with parent or teacher</div>'
                + '  </div>'
                + '  <i class="fas fa-chevron-right mp-profile-menu-arrow"></i>'
                + '</button>';

            document.getElementById('mp-profile-theme-btn').addEventListener('click', function () {
                triggerClick('theme-toggle-btn');
                setTimeout(function () { refreshProfilePanel(); }, 200);
            });
            document.getElementById('mp-profile-language-btn').addEventListener('click', function () {
                triggerClick('open-settings-modal-btn');
            });
            document.getElementById('mp-profile-share-btn').addEventListener('click', function () {
                triggerClick('share-progress-header-btn');
            });
        }

        // Share Code
        var shareEl = document.getElementById('mp-profile-share');
        if (shareEl) {
            var code = getStatValue('drawer-student-link-code-value', '') ||
                       getStatValue('student-link-code-value', '');

            if (code) {
                shareEl.innerHTML = ''
                    + '<span class="mp-share-code-label">Share Code</span>'
                    + '<span class="mp-share-code-value" id="mp-profile-code-copy">' + escHtml(code) + '</span>'
                    + '<span class="mp-share-code-hint">Tap to copy</span>';

                document.getElementById('mp-profile-code-copy').addEventListener('click', function () {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(code);
                        this.textContent = 'Copied!';
                        var self = this;
                        setTimeout(function () { self.textContent = code; }, 1500);
                    }
                });
            } else {
                shareEl.style.display = 'none';
            }
        }
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

    /* ---- Utility ---- */

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* ---- lifecycle ---- */

    function update() {
        if (isMobile()) {
            buildNav();
            buildWatermark();
            document.body.classList.add('has-chat-nav');
        } else {
            document.body.classList.remove('has-chat-nav');
            // Close any open panels when switching to desktop
            var panels = document.querySelectorAll('.mobile-panel');
            panels.forEach(function (p) { p.classList.remove('active'); });
            document.body.classList.remove('mobile-panel-active', 'mobile-panel-chat');
        }
    }

    // Keep theme in sync
    document.addEventListener('themechange', function () {
        if (panelsBuilt['profile']) refreshProfilePanel();
    });

    // ESC closes panels and goes back to chat
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && activeTab !== 'chat') {
            switchTab('chat');
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        update();
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(update, 100);
        });

        // Listen for stat updates and refresh panels
        var observer = new MutationObserver(function () {
            if (activeTab === 'home' && panelsBuilt['home']) refreshHomePanel();
            if (activeTab === 'progress' && panelsBuilt['progress']) refreshProgressPanel();
        });

        // Observe the right drawer stats for changes
        var drawerStats = document.getElementById('right-drawer');
        if (drawerStats) {
            observer.observe(drawerStats, { childList: true, subtree: true, characterData: true });
        }
    });
})();
