// Resume Card — "Welcome back" experience for returning students
// Shows streak, XP progress, last session context, and quick actions
// Injected into #chat-messages-container before the welcome message

(function () {
  'use strict';

  const CARD_ID = 'resume-card';

  // Time-of-day greeting
  function getTimeGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  // Relative time formatting
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  // Fetch both endpoints in parallel
  async function fetchResumeData() {
    const [returningRes, summaryRes] = await Promise.all([
      fetch('/api/conversations/returning-user-data', { credentials: 'include' }).catch(() => null),
      fetch('/api/student/progress/summary', { credentials: 'include' }).catch(() => null),
    ]);

    const returning = returningRes?.ok ? await returningRes.json() : null;
    const summary = summaryRes?.ok ? await summaryRes.json() : null;

    return { returning, summary };
  }

  // Build the streak flame display
  function streakHTML(count) {
    if (!count || count < 1) return '';
    const label = count === 1 ? 'day' : 'days';
    return `<div class="rc-streak"><span class="rc-streak-flame">🔥</span><span class="rc-streak-count">${count}</span><span class="rc-streak-label">${label}</span></div>`;
  }

  // Build XP progress bar
  function xpBarHTML(user) {
    if (!user || !user.level) return '';
    const level = user.level || 1;
    const xpCurrent = user.xpForCurrentLevel || 0;
    const xpNeeded = user.xpForNextLevel || 100;
    const pct = Math.min(Math.round((xpCurrent / xpNeeded) * 100), 100);
    return `
      <div class="rc-xp">
        <div class="rc-xp-label">
          <span class="rc-level">Lv. ${level}</span>
          <span class="rc-xp-text">${xpCurrent} / ${xpNeeded} XP</span>
        </div>
        <div class="rc-xp-track"><div class="rc-xp-fill" style="width: ${pct}%"></div></div>
      </div>`;
  }

  // Build weekly stats strip
  function weeklyStatsHTML(stats) {
    if (!stats) return '';
    const items = [];
    if (stats.problemsSolved != null && stats.problemsSolved > 0) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">${stats.problemsSolved}</span><span class="rc-stat-label">problems</span></div>`);
    }
    if (stats.accuracy != null) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">${stats.accuracy}%</span><span class="rc-stat-label">accuracy</span></div>`);
    }
    if (stats.xpEarned != null && stats.xpEarned > 0) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">+${stats.xpEarned}</span><span class="rc-stat-label">XP this week</span></div>`);
    }
    if (stats.skillsMastered != null && stats.skillsMastered > 0) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">${stats.skillsMastered}</span><span class="rc-stat-label">mastered</span></div>`);
    }
    if (items.length === 0) return '';
    return `<div class="rc-stats-strip">${items.join('')}</div>`;
  }

  // Build learning progress section
  function learningHTML(summary) {
    if (!summary) return '';
    const parts = [];

    if (summary.currentLearning) {
      const pct = summary.currentLearning.progress || 0;
      parts.push(`
        <div class="rc-learning-item">
          <div class="rc-learning-header">
            <span class="rc-learning-status">📖 Currently learning</span>
            <span class="rc-learning-pct">${pct}%</span>
          </div>
          <div class="rc-learning-name">${summary.currentLearning.displayName}</div>
          <div class="rc-learning-track"><div class="rc-learning-fill" style="width: ${pct}%"></div></div>
        </div>`);
    }

    if (summary.recentMastery) {
      parts.push(`
        <div class="rc-learning-item rc-mastery-item">
          <span class="rc-mastery-badge">⭐</span>
          <span>Recently mastered <strong>${summary.recentMastery.displayName}</strong></span>
        </div>`);
    }

    return parts.length > 0 ? `<div class="rc-learning">${parts.join('')}</div>` : '';
  }

  // Build recent session buttons
  function sessionsHTML(returning) {
    if (!returning?.isReturningUser) return '';

    const items = [];

    // Course in progress
    if (returning.courses?.length > 0) {
      const c = returning.courses[0];
      items.push(`
        <button class="rc-session-btn rc-session-course" data-course-id="${c.courseSessionId}">
          <span class="rc-session-emoji">📚</span>
          <div class="rc-session-info">
            <span class="rc-session-name">${c.courseName}</span>
            <span class="rc-session-meta">${c.currentModuleLabel} · ${c.overallProgress}%</span>
          </div>
          <span class="rc-session-arrow">→</span>
        </button>`);
    }

    // Recent sessions (top 3)
    const sessions = (returning.recentSessions || []).slice(0, 3);
    for (const s of sessions) {
      items.push(`
        <button class="rc-session-btn" data-session-id="${s._id}">
          <span class="rc-session-emoji">${s.topicEmoji}</span>
          <div class="rc-session-info">
            <span class="rc-session-name">${s.name}</span>
            <span class="rc-session-meta">${timeAgo(s.lastActivity)} · ${s.messageCount} messages</span>
          </div>
          <span class="rc-session-arrow">→</span>
        </button>`);
    }

    if (items.length === 0) return '';

    return `
      <div class="rc-sessions">
        <div class="rc-sessions-label">Pick up where you left off</div>
        ${items.join('')}
      </div>`;
  }

  // Build the full card
  function buildCard(data, user) {
    const { returning, summary } = data;
    const firstName = user?.firstName || user?.name?.split(' ')[0] || '';
    const greeting = `${getTimeGreeting()}${firstName ? ', ' + firstName : ''}!`;

    // Only show card if there's meaningful content
    const hasStreak = summary?.streak > 0;
    const hasSessions = returning?.isReturningUser && (returning.courses?.length > 0 || returning.recentSessions?.length > 0);
    const hasLearning = summary?.currentLearning || summary?.recentMastery;
    const hasStats = summary?.weeklyStats && (summary.weeklyStats.problemsSolved > 0 || summary.weeklyStats.xpEarned > 0);

    if (!hasSessions && !hasLearning && !hasStats && !hasStreak) return null;

    const html = `
      <div id="${CARD_ID}" class="rc-card" role="region" aria-label="Welcome back">
        <div class="rc-header">
          <div class="rc-greeting">${greeting}</div>
          <button class="rc-dismiss" id="rc-dismiss-btn" aria-label="Dismiss">&times;</button>
        </div>
        <div class="rc-body">
          <div class="rc-top-row">
            ${streakHTML(summary?.streak)}
            ${xpBarHTML(user)}
          </div>
          ${weeklyStatsHTML(summary?.weeklyStats)}
          ${learningHTML(summary)}
          ${sessionsHTML(returning)}
        </div>
      </div>`;

    return html;
  }

  // Dismiss with animation
  function dismissCard() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    card.classList.add('rc-dismissing');
    setTimeout(() => card.remove(), 300);
  }

  // Wire up session resume clicks
  function wireSessionClicks() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;

    card.querySelectorAll('.rc-session-btn[data-session-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sessionId = btn.dataset.sessionId;
        dismissCard();
        // Use sidebar's switchSession to load conversation properly
        if (window.sidebar?.switchSession) {
          window.sidebar.switchSession(sessionId);
        }
      });
    });

    card.querySelectorAll('.rc-session-btn[data-course-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dismissCard();
        // Resume course via course manager
        if (window.courseManager?.resumeCourse) {
          window.courseManager.resumeCourse();
        }
      });
    });
  }

  // Main: show resume card
  async function showResumeCard() {
    // Don't show if user isn't a student or data already loaded
    const user = window.currentUser;
    if (!user || user.role !== 'student') return;

    // Don't show if chat already has messages (e.g., trial carryover)
    const chatBox = document.getElementById('chat-messages-container');
    if (!chatBox || chatBox.children.length > 0) return;

    try {
      const data = await fetchResumeData();
      const cardHTML = buildCard(data, user);
      if (!cardHTML) return;

      // Insert at top of chat container
      chatBox.insertAdjacentHTML('afterbegin', cardHTML);

      // Wire up interactions
      const dismissBtn = document.getElementById('rc-dismiss-btn');
      if (dismissBtn) dismissBtn.addEventListener('click', dismissCard);
      wireSessionClicks();

      // Auto-dismiss after welcome message loads (card served its purpose)
      // Give them 30 seconds to interact before auto-dismissing
      setTimeout(() => {
        const card = document.getElementById(CARD_ID);
        if (card && !card.matches(':hover')) dismissCard();
      }, 30000);
    } catch (err) {
      // Silent fail — welcome message will show normally
      console.warn('[ResumeCard] Failed to load resume data:', err);
    }
  }

  // Expose globally so initializeApp can call it
  window.showResumeCard = showResumeCard;
})();
