/* ============================================
   MOBILE CHAT NAVIGATION — MATHMATIX AI (v4)
   4-tab bottom nav with full-screen panels:
   Learn · Chat · Quests · Profile
   ============================================ */

(function () {
    'use strict';

    // Only run on the chat page
    if (!document.body.classList.contains('landing-page-body')) return;

    var MOBILE_BP = 769;

    /* ---- Four-tab layout ---- */
    var NAV_ITEMS = [
        { action: 'learn',   icon: 'fa-book-open',     label: 'Learn' },
        { action: 'chat',    icon: 'fa-comment-dots',   label: 'Chat', active: true },
        { action: 'quests',  icon: 'fa-trophy',         label: 'Quests' },
        { action: 'profile', icon: 'fa-user-circle',    label: 'Profile' }
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
        var nameEl = document.querySelector('.mp-profile-name');
        if (nameEl && nameEl.textContent) return nameEl.textContent;
        try {
            var user = JSON.parse(StorageUtils.local.getItem('mathmatix_user') || '{}');
            return user.firstName || user.name || 'Student';
        } catch (e) { return 'Student'; }
    }

    function getStatValue(id, fallback) {
        var el = document.getElementById(id);
        return el ? el.textContent : (fallback || '0');
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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
                    box.scrollTop = savedScrollPos != null ? savedScrollPos : box.scrollHeight;
                }
                var input = document.getElementById('user-input');
                if (input) {
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
            if (name === 'learn') refreshLearnPanel();
            if (name === 'quests') refreshQuestsPanel();
            if (name === 'profile') refreshProfilePanel();
            return;
        }

        switch (name) {
            case 'learn': buildLearnPanel(); break;
            case 'quests': buildQuestsPanel(); break;
            case 'profile': buildProfilePanel(); break;
        }
        panelsBuilt[name] = true;
    }

    /* ============================
       LEARN PANEL
       ============================ */

    function buildLearnPanel() {
        var panel = document.createElement('div');
        panel.id = 'mp-learn';
        panel.className = 'mobile-panel';

        panel.innerHTML = ''
            + '<div class="mp-header">'
            + '  <h2 class="mp-header-title">Learn</h2>'
            + '  <div class="mp-header-actions">'
            + '    <button class="mp-header-btn" id="mp-learn-theme-btn" aria-label="Toggle theme"><i class="fas ' + (isDark() ? 'fa-sun' : 'fa-moon') + '"></i></button>'
            + '  </div>'
            + '</div>'
            + '<div class="mp-content" id="mp-learn-content">'
            + '  <div id="mp-learn-continue"></div>'
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-star"></i> Learning</span>'
            + '  </div>'
            + '  <div class="mp-actions-grid" id="mp-learn-actions"></div>'
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-ellipsis-h"></i> More</span>'
            + '  </div>'
            + '  <div class="mp-actions-grid" id="mp-learn-more"></div>'
            + '</div>';

        document.body.appendChild(panel);

        // Theme toggle
        document.getElementById('mp-learn-theme-btn').addEventListener('click', function () {
            triggerClick('theme-toggle-btn');
            setTimeout(function () {
                var icon = document.querySelector('#mp-learn-theme-btn i');
                if (icon) icon.className = 'fas ' + (isDark() ? 'fa-sun' : 'fa-moon');
            }, 150);
        });

        // Learning actions grid
        var actionsEl = document.getElementById('mp-learn-actions');
        if (actionsEl) {
            actionsEl.innerHTML = ''
                // Voice Tutor — Featured
                + '<div class="mp-action-card mp-action-featured" id="mp-action-voice">'
                + '  <div class="mp-action-icon voice"><i class="fas fa-headset"></i></div>'
                + '  <div class="mp-action-featured-info">'
                + '    <div class="mp-action-label">Voice Tutor</div>'
                + '    <div class="mp-action-featured-desc">Talk with your AI math tutor in real-time</div>'
                + '  </div>'
                + '  <i class="fas fa-chevron-right mp-action-featured-arrow"></i>'
                + '</div>'
                // Browse Courses
                + '<div class="mp-action-card" id="mp-action-courses">'
                + '  <div class="mp-action-icon courses"><i class="fas fa-graduation-cap"></i></div>'
                + '  <div class="mp-action-label">Browse Courses</div>'
                + '</div>'
                // Resources
                + '<div class="mp-action-card" id="mp-action-resources">'
                + '  <div class="mp-action-icon resources"><i class="fas fa-book-open"></i></div>'
                + '  <div class="mp-action-label">Resources</div>'
                + '</div>';

            wireAction('mp-action-voice', function () {
                window.location.href = '/voice-tutor.html';
            });
            wireAction('mp-action-courses', function () {
                switchTab('chat');
                setTimeout(function () { triggerClick('browse-courses-btn'); }, 200);
            });
            wireAction('mp-action-resources', function () {
                switchTab('chat');
                setTimeout(function () { triggerClick('open-resources-modal-btn'); }, 200);
            });
        }

        // More actions grid
        var moreEl = document.getElementById('mp-learn-more');
        if (moreEl) {
            moreEl.innerHTML = ''
                // Math Showdown
                + '<div class="mp-action-card" id="mp-action-showdown">'
                + '  <div class="mp-action-icon showdown"><i class="fas fa-bolt"></i></div>'
                + '  <div class="mp-action-label">Math Showdown</div>'
                + '</div>'
                // Starting Point (Screener)
                + '<div class="mp-action-card" id="mp-action-screener">'
                + '  <div class="mp-action-icon screener"><i class="fas fa-crosshairs"></i></div>'
                + '  <div class="mp-action-label">Starting Point</div>'
                + '</div>'
                // Send Feedback
                + '<div class="mp-action-card" id="mp-action-feedback">'
                + '  <div class="mp-action-icon feedback"><i class="fas fa-comment-dots"></i></div>'
                + '  <div class="mp-action-label">Send Feedback</div>'
                + '</div>';

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
        }

        refreshLearnPanel();
    }

    function refreshLearnPanel() {
        // Continue Learning Card
        var continueEl = document.getElementById('mp-learn-continue');
        if (continueEl) {
            var courseTitle = document.getElementById('course-progress-title');
            var courseModule = document.getElementById('course-progress-module');
            var coursePct = document.getElementById('course-progress-pct');

            var title = courseTitle ? courseTitle.textContent : '';
            var module = courseModule ? courseModule.textContent : '';
            var pct = coursePct ? coursePct.textContent : '';

            var courseItems = document.querySelectorAll('#course-sessions-list .sidebar-course-item');

            if (title || courseItems.length > 0) {
                var displayTitle = title || 'Your Course';
                var displayModule = module || 'Continue learning';
                var displayPct = parseInt(pct) || 0;

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
                    + '  <button class="mp-continue-btn" id="mp-learn-continue-btn">'
                    + '    <i class="fas fa-play"></i> Continue'
                    + '  </button>'
                    + '</div>';

                document.getElementById('mp-learn-continue-btn').addEventListener('click', function () {
                    switchTab('chat');
                });
            } else {
                continueEl.innerHTML = ''
                    + '<div class="mp-continue-card">'
                    + '  <div class="mp-continue-icon"><i class="fas fa-graduation-cap"></i></div>'
                    + '  <h3>Start Learning</h3>'
                    + '  <p class="mp-continue-sub">Enroll in a course or ask your AI tutor anything</p>'
                    + '  <button class="mp-continue-btn" id="mp-learn-start-btn">'
                    + '    <i class="fas fa-play"></i> Start Chat'
                    + '  </button>'
                    + '</div>';

                document.getElementById('mp-learn-start-btn').addEventListener('click', function () {
                    switchTab('chat');
                });
            }
        }

    }

    function wireAction(id, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    /* ============================
       QUESTS PANEL
       ============================ */

    function buildQuestsPanel() {
        var panel = document.createElement('div');
        panel.id = 'mp-quests';
        panel.className = 'mobile-panel';

        panel.innerHTML = ''
            + '<div class="mp-header">'
            + '  <h2 class="mp-header-title">Quests & Challenges</h2>'
            + '  <div class="mp-header-actions">'
            + '    <button class="mp-header-btn" id="mp-quests-badges-btn" aria-label="Badge Map"><i class="fas fa-medal"></i></button>'
            + '  </div>'
            + '</div>'
            + '<div class="mp-content" id="mp-quests-content">'
            + '  <div class="mp-quests-streak-bar" id="mp-quests-streak"></div>'
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-tasks"></i> Daily Quests</span>'
            + '  </div>'
            + '  <div id="mp-quests-daily"></div>'
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-calendar-week"></i> Weekly Challenges</span>'
            + '  </div>'
            + '  <div id="mp-quests-weekly"></div>'
            + '  <div class="mp-section-header">'
            + '    <span class="mp-section-title"><i class="fas fa-medal"></i> Badges</span>'
            + '  </div>'
            + '  <div id="mp-quests-badges"></div>'
            + '</div>';

        document.body.appendChild(panel);

        // Badge Map button
        document.getElementById('mp-quests-badges-btn').addEventListener('click', function () {
            window.location.href = '/badge-map.html';
        });

        refreshQuestsPanel();
    }

    function refreshQuestsPanel() {
        // Streak Bar
        var streakEl = document.getElementById('mp-quests-streak');
        if (streakEl) {
            var streak = getStatValue('drawer-streak-count', '0');
            var totalXP = getStatValue('drawer-total-xp', '0');
            var sessionXP = getStatValue('drawer-session-xp', '0');

            streakEl.innerHTML = ''
                + '<div class="mp-streak-item">'
                + '  <span class="mp-streak-icon">&#128293;</span>'
                + '  <span class="mp-streak-value">' + streak + '</span>'
                + '  <span class="mp-streak-label">Day Streak</span>'
                + '</div>'
                + '<div class="mp-streak-item">'
                + '  <span class="mp-streak-icon">&#11088;</span>'
                + '  <span class="mp-streak-value">' + totalXP + '</span>'
                + '  <span class="mp-streak-label">Total XP</span>'
                + '</div>'
                + '<div class="mp-streak-item">'
                + '  <span class="mp-streak-icon">&#9889;</span>'
                + '  <span class="mp-streak-value">' + sessionXP + '</span>'
                + '  <span class="mp-streak-label">Session XP</span>'
                + '</div>';
        }

        // Daily Quests
        var dailyEl = document.getElementById('mp-quests-daily');
        if (dailyEl) {
            var questsSource = document.getElementById('drawer-daily-quests-container') ||
                               document.getElementById('daily-quests-container');
            var questItems = questsSource ? questsSource.querySelectorAll('.quest-item, .daily-quest-item') : [];

            if (questItems.length > 0) {
                var questHtml = '';
                questItems.forEach(function (q) {
                    var name = q.querySelector('.quest-name, .quest-title');
                    var desc = q.querySelector('.quest-description, .quest-desc');
                    var progress = q.querySelector('.quest-progress-fill, .progress-fill');
                    var reward = q.querySelector('.quest-reward, .quest-xp');
                    var pctWidth = progress ? progress.style.width : '0%';
                    var isComplete = q.classList.contains('completed') || q.classList.contains('quest-complete');

                    questHtml += '<div class="mp-quest-card' + (isComplete ? ' completed' : '') + '">'
                        + '  <span class="mp-quest-icon">' + (isComplete ? '&#9989;' : '&#127919;') + '</span>'
                        + '  <div class="mp-quest-info">'
                        + '    <div class="mp-quest-name">' + escHtml(name ? name.textContent : 'Quest') + '</div>'
                        + (desc ? '    <div class="mp-quest-desc">' + escHtml(desc.textContent) + '</div>' : '')
                        + '    <div class="mp-quest-bar"><div class="mp-quest-bar-fill" style="width: ' + pctWidth + ';"></div></div>'
                        + '  </div>'
                        + '  <span class="mp-quest-reward">' + escHtml(reward ? reward.textContent : '+XP') + '</span>'
                        + '</div>';
                });
                dailyEl.innerHTML = questHtml;
            } else {
                dailyEl.innerHTML = '<div class="mp-quest-card">'
                    + '  <span class="mp-quest-icon">&#127919;</span>'
                    + '  <div class="mp-quest-info">'
                    + '    <div class="mp-quest-name">Complete a session to unlock quests</div>'
                    + '  </div>'
                    + '</div>';
            }
        }

        // Weekly Challenges
        var weeklyEl = document.getElementById('mp-quests-weekly');
        if (weeklyEl) {
            var challengeSource = document.getElementById('drawer-weekly-challenges-container') ||
                                  document.getElementById('weekly-challenges-container');
            var challengeItems = challengeSource ? challengeSource.querySelectorAll('.challenge-item, .weekly-challenge-item') : [];

            if (challengeItems.length > 0) {
                var challengeHtml = '';
                challengeItems.forEach(function (c) {
                    var name = c.querySelector('.challenge-name, .challenge-title');
                    var desc = c.querySelector('.challenge-description, .challenge-desc');
                    var progress = c.querySelector('.challenge-progress-fill, .progress-fill');
                    var reward = c.querySelector('.challenge-reward, .challenge-xp');
                    var difficulty = c.querySelector('.challenge-difficulty');
                    var pctWidth = progress ? progress.style.width : '0%';
                    var isComplete = c.classList.contains('completed') || c.classList.contains('challenge-complete');

                    challengeHtml += '<div class="mp-challenge-card' + (isComplete ? ' completed' : '') + '">'
                        + '  <span class="mp-challenge-icon">' + (isComplete ? '&#9989;' : '&#9876;') + '</span>'
                        + '  <div class="mp-challenge-info">'
                        + '    <div class="mp-challenge-name">' + escHtml(name ? name.textContent : 'Challenge') + '</div>'
                        + (desc ? '    <div class="mp-challenge-desc">' + escHtml(desc.textContent) + '</div>' : '')
                        + (difficulty ? '    <span class="mp-challenge-difficulty">' + escHtml(difficulty.textContent) + '</span>' : '')
                        + '    <div class="mp-challenge-bar"><div class="mp-challenge-bar-fill" style="width: ' + pctWidth + ';"></div></div>'
                        + '  </div>'
                        + '  <span class="mp-challenge-reward">' + escHtml(reward ? reward.textContent : '+XP') + '</span>'
                        + '</div>';
                });
                weeklyEl.innerHTML = challengeHtml;
            } else {
                weeklyEl.innerHTML = '<div class="mp-challenge-card">'
                    + '  <span class="mp-challenge-icon">&#9876;</span>'
                    + '  <div class="mp-challenge-info">'
                    + '    <div class="mp-challenge-name">Weekly challenges refresh every Monday</div>'
                    + '  </div>'
                    + '</div>';
            }
        }

        // Badges section
        var badgesEl = document.getElementById('mp-quests-badges');
        if (badgesEl) {
            // Check for active badge progress
            var badgeWidget = document.querySelector('.badge-progress-widget, #badge-progress-container');
            var activeBadgeName = badgeWidget ? badgeWidget.querySelector('.badge-name, .badge-title') : null;
            var activeBadgeProgress = badgeWidget ? badgeWidget.querySelector('.badge-progress-fill, .progress-fill') : null;

            var badgeHtml = '';

            if (activeBadgeName) {
                var bpWidth = activeBadgeProgress ? activeBadgeProgress.style.width : '0%';
                badgeHtml += '<div class="mp-badge-active">'
                    + '  <div class="mp-badge-active-icon"><i class="fas fa-trophy"></i></div>'
                    + '  <div class="mp-badge-active-info">'
                    + '    <div class="mp-badge-active-label">Working On</div>'
                    + '    <div class="mp-badge-active-name">' + escHtml(activeBadgeName.textContent) + '</div>'
                    + '    <div class="mp-badge-active-bar"><div class="mp-badge-active-fill" style="width: ' + bpWidth + ';"></div></div>'
                    + '  </div>'
                    + '</div>';
            }

            badgeHtml += '<button class="mp-badge-map-btn" id="mp-quests-open-badges">'
                + '  <i class="fas fa-map"></i> View Badge Map'
                + '</button>';

            badgesEl.innerHTML = badgeHtml;

            document.getElementById('mp-quests-open-badges').addEventListener('click', function () {
                window.location.href = '/badge-map.html';
            });
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
            var user = JSON.parse(StorageUtils.local.getItem('mathmatix_user') || '{}');
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
            if (activeTab === 'learn' && panelsBuilt['learn']) refreshLearnPanel();
            if (activeTab === 'quests' && panelsBuilt['quests']) refreshQuestsPanel();
        });

        // Observe the right drawer stats for changes
        var drawerStats = document.getElementById('right-drawer');
        if (drawerStats) {
            observer.observe(drawerStats, { childList: true, subtree: true, characterData: true });
        }
    });
})();
