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

  // Fetch endpoints in parallel
  async function fetchResumeData() {
    const [returningRes, summaryRes, mapRes] = await Promise.all([
      fetch('/api/conversations/returning-user-data', { credentials: 'include' }).catch(() => null),
      fetch('/api/student/progress/summary', { credentials: 'include' }).catch(() => null),
      fetch('/api/mastery/map', { credentials: 'include' }).catch(() => null),
    ]);

    const returning = returningRes?.ok ? await returningRes.json() : null;
    const summary = summaryRes?.ok ? await summaryRes.json() : null;
    const map = mapRes?.ok ? await mapRes.json() : null;

    // The graph frontier is the live "what's next" source. summary.nextReady
    // comes from a status bucket frozen at placement that never refills after a
    // mastery, so graduation could never surface a next skill. Fall back to the
    // closure engine's nearest attackable skill.
    if (summary && map?.nearest?.nextSkillId) {
      summary.graphNext = {
        skillId: map.nearest.nextSkillId,
        displayName: map.nearest.nextLabel || 'your next skill',
      };
    }

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

  // Escape text going into innerHTML
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // A CTA that types a prompt to the tutor and sends it (wired in wireCtaClicks)
  function ctaButton(label, prompt, kind) {
    const cls = kind === 'alt' ? 'rc-hero-alt' : 'rc-hero-cta';
    const arrow = kind === 'alt' ? '' : '<span class="rc-hero-arrow">→</span>';
    return `<button class="${cls}" data-rc-prompt="${esc(prompt)}">${esc(label)}${arrow}</button>`;
  }

  // Progress bar toward mastery of a skill
  function masteryBar(displayName, pct, labelText, isMastered) {
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    // Only the dedicated mastery state may say "mastered". A skill still in
    // progress must never claim the verdict just because its bar reached 100% —
    // that mislabel (a 'learning' skill reading "mastered · 100%") is exactly
    // the bug this guards against.
    const state = isMastered
      ? 'mastered'
      : (p >= 90 ? 'almost there' : (p >= 50 ? 'halfway to mastery' : 'building it up'));
    return `
      <div class="rc-hero-label">${esc(labelText || 'Working toward mastery')}</div>
      <div class="rc-hero-skill">${esc(displayName)}</div>
      <div class="rc-hero-track"><div class="rc-hero-fill" style="width: ${p}%"></div></div>
      <div class="rc-hero-progrow"><span>${state}</span><span>${p}%</span></div>`;
  }

  // State-aware hero — leads with the ONE thing that matters and ends with a
  // single next step. Framing is honest per lifecycle state: effort and growth,
  // never a verdict number. Driven by summary.cardState from the server.
  function heroHTML(summary) {
    if (!summary) return '';
    const learning = summary.currentLearning;
    const stats = summary.weeklyStats || {};
    const reviewDue = summary.reviewDue || 0;

    // FIRST SESSION — an invitation, never a wall of zeros.
    if (summary.cardState === 'first_session') {
      return `
        <div class="rc-hero">
          <div class="rc-hero-label">Your journey starts here</div>
          <div class="rc-hero-skill">A quick warm-up</div>
          <div class="rc-hero-copy">A few short problems so we can find the right place to start. No grades, no pressure.</div>
          ${ctaButton('Start the warm-up', "I'm ready for a warm-up.")}
        </div>`;
    }

    // MASTERY — celebrate, then open the next door.
    if (summary.cardState === 'mastery') {
      const mastered = summary.recentMastery;
      const next = summary.nextReady || summary.graphNext;
      return `
        <div class="rc-hero">
          <div class="rc-hero-badge">★ skill mastered</div>
          ${masteryBar(mastered ? mastered.displayName : 'Your skill', 100, 'You just mastered', true)}
          <div class="rc-hero-copy">Ready for something new.</div>
          ${next
            ? ctaButton(`Start ${next.displayName}`, `I'm ready to start ${next.displayName}.`)
            : ctaButton('Start something new', 'What should I work on next?')}
        </div>`;
    }

    // STRUGGLING — name the persistence, no percentage, gentler on-ramp.
    if (summary.cardState === 'struggling') {
      const solved = stats.problemsSolved || 0;
      return `
        <div class="rc-hero">
          ${learning ? masteryBar(learning.displayName, learning.progress, 'Working toward mastery') : ''}
          <div class="rc-hero-effort">You worked through <strong>${solved} tricky problem${solved === 1 ? '' : 's'}</strong> and didn't quit.</div>
          ${ctaButton('Review the tricky part together', 'Can we review the part I keep getting stuck on?')}
          ${ctaButton('or try an easier warm-up', 'Can we try an easier warm-up first?', 'alt')}
        </div>`;
    }

    // PROGRESS (default) — mastery bar + honest week + continue.
    const wins = stats.problemsCorrect || 0;
    const practiced = stats.problemsSolved || 0;
    const weekBlock = practiced > 0
      ? `<div class="rc-hero-week"><strong>${wins} first-try win${wins === 1 ? '' : 's'}</strong> · ${practiced} practiced this week</div>`
      : '';
    const parts = [];
    if (learning) {
      parts.push(masteryBar(learning.displayName, learning.progress, 'Working toward mastery'));
      parts.push(weekBlock);
      parts.push(ctaButton(`Continue ${learning.displayName}`, `Let's keep working on ${learning.displayName}.`));
    } else {
      parts.push(weekBlock);
      parts.push(ctaButton('Keep practicing', "Let's practice."));
    }
    if (reviewDue > 0) {
      parts.push(ctaButton(`${reviewDue} skill${reviewDue === 1 ? '' : 's'} ready to review`, "Let's review what I've learned.", 'alt'));
    }
    // The card is also an entry point to the ladder — a native link (not a chat
    // prompt), so it navigates to the skill map rather than messaging the tutor.
    parts.push('<a class="rc-hero-alt" href="/skill-map.html">See your skill map<span class="rc-hero-arrow">→</span></a>');
    return `<div class="rc-hero">${parts.join('')}</div>`;
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

    // Show the card whenever we have a lifecycle hero to render (any assessed
    // student — including the brand-new, no-activity first-session state), or
    // when there are sessions to resume.
    const hasHero = !!summary?.cardState;
    const hasSessions = returning?.isReturningUser && (returning.courses?.length > 0 || returning.recentSessions?.length > 0);

    if (!hasHero && !hasSessions) return null;

    const html = `
      <div id="${CARD_ID}" class="rc-card" role="region" aria-label="Welcome back">
        <div class="rc-header">
          <div class="rc-greeting">${greeting}</div>
          <button class="rc-dismiss" id="rc-dismiss-btn" aria-label="Dismiss">&times;</button>
        </div>
        <div class="rc-body">
          ${heroHTML(summary)}
          <div class="rc-top-row">
            ${streakHTML(summary?.streak)}
            ${xpBarHTML(user)}
          </div>
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
      wireCtaClicks();

      // Card stays until the user dismisses it or taps a session.
      // No auto-dismiss — let them read at their own pace.
    } catch (err) {
      // Silent fail — welcome message will show normally
      console.warn('[ResumeCard] Failed to load resume data:', err);
    }
  }

  // A CTA types its prompt into the chat and sends it, as if the student typed
  // it — reusing the chat's own input + send button (no private API).
  function wireCtaClicks() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    card.querySelectorAll('[data-rc-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-rc-prompt') || '';
        dismissCard();
        const input = document.getElementById('user-input');
        if (input) {
          input.textContent = prompt;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const sendBtn = document.getElementById('send-button');
        if (sendBtn && !sendBtn.disabled) sendBtn.click();
      });
    });
  }

  // Expose globally so initializeApp can call it
  if (typeof window !== 'undefined') window.showResumeCard = showResumeCard;

  // Testable surface (no-op in the browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { heroHTML };
  }
})();
