/**
 * ux-enhancements.js — UX/UI 3x Improvement Pack
 *
 * Features:
 * 1. Page transition progress bar
 * 2. Bottom nav bar for mobile
 * 3. Skeleton screens
 * 4. Structured problem cards in chat
 * 5. Enhanced badge unlock ceremony
 * 6. Dynamic contextual suggestion chips
 * 7. Client-side route prefetching
 * 8. Tutor-specific thinking indicator
 */

(function() {
  'use strict';

  // ============================================
  // 1. PAGE TRANSITION PROGRESS BAR
  // ============================================

  function initPageTransitionBar() {
    // Create the bar element
    const bar = document.createElement('div');
    bar.id = 'page-transition-bar';
    document.body.prepend(bar);

    // Trigger on internal link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      // Only trigger for internal navigation (not anchors, external, or javascript:)
      if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
          href.startsWith('http') || href.startsWith('mailto:') ||
          link.target === '_blank' || e.ctrlKey || e.metaKey) {
        return;
      }

      bar.className = 'active';
    });

    // Also trigger on form submissions
    document.addEventListener('submit', () => {
      bar.className = 'active';
    });

    // Complete the bar when page is about to unload
    window.addEventListener('beforeunload', () => {
      bar.classList.add('complete');
    });

    // If we arrived via a navigation, show a quick completion
    if (performance.navigation && performance.navigation.type === 1) {
      bar.style.width = '100%';
      bar.style.opacity = '1';
      setTimeout(() => {
        bar.style.transition = 'opacity 0.3s ease';
        bar.style.opacity = '0';
      }, 100);
    }
  }


  // ============================================
  // 2. MOBILE BOTTOM NAV BAR
  // ============================================

  function initBottomNav() {
    // Only show on mobile
    if (window.innerWidth > 768) return;

    // Don't add on login/signup pages
    const path = window.location.pathname;
    if (path.includes('login') || path.includes('signup') || path.includes('pick-tutor') ||
        path.includes('pick-avatar') || path.includes('complete-profile') ||
        path.includes('privacy') || path.includes('terms') ||
        path === '/' || path === '/index.html') {
      return;
    }

    const navItems = [
      { icon: 'fa-home', label: 'Home', href: '/student-dashboard.html', id: 'nav-home' },
      { icon: 'fa-comment', label: 'Chat', href: '/chat.html', id: 'nav-chat' },
      { icon: 'fa-chart-line', label: 'Progress', href: '/progress.html', id: 'nav-progress' },
      { icon: 'fa-graduation-cap', label: 'Courses', href: '/chat.html?courses=1', id: 'nav-courses' },
      { icon: 'fa-user-circle', label: 'Profile', href: '/student-dashboard.html#profile', id: 'nav-profile' }
    ];

    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');

    const inner = document.createElement('div');
    inner.className = 'mobile-bottom-nav-inner';

    navItems.forEach(item => {
      const link = document.createElement('a');
      link.href = item.href;
      link.className = 'bottom-nav-item';
      link.id = item.id;
      link.setAttribute('aria-label', item.label);

      // Detect active page (handle items sharing a path, e.g. Chat vs Courses)
      const hrefPath = item.href.split('?')[0];
      const hrefQuery = item.href.includes('?') ? item.href.split('?')[1] : '';
      const pathMatches = path === hrefPath || (hrefPath !== '/' && path.includes(hrefPath.replace('.html', '')));
      if (pathMatches) {
        // If this item has a query param, only activate when the param is present
        // If it doesn't, only activate when no other item's query param is present
        if (hrefQuery) {
          if (window.location.search.includes(hrefQuery)) link.classList.add('active');
        } else {
          // Don't activate if the URL has query params that belong to another nav item
          const hasSpecialParam = navItems.some(n => n.href.includes('?') && n.href.split('?')[0] === hrefPath && window.location.search.includes(n.href.split('?')[1]));
          if (!hasSpecialParam) link.classList.add('active');
        }
      }

      link.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.label}</span>`;
      inner.appendChild(link);
    });

    nav.appendChild(inner);
    document.body.appendChild(nav);
    document.body.classList.add('has-bottom-nav');
  }


  // ============================================
  // 3. SKELETON SCREENS
  // ============================================

  /**
   * Create a skeleton loading card
   * @param {string} type - 'card', 'chat-message', 'list-item'
   * @returns {HTMLElement}
   */
  function createSkeleton(type) {
    const el = document.createElement('div');

    switch (type) {
      case 'card':
        el.className = 'skeleton-card';
        el.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div class="skeleton skeleton-icon"></div>
            <div style="flex: 1;">
              <div class="skeleton skeleton-text medium"></div>
              <div class="skeleton skeleton-text short"></div>
            </div>
          </div>
          <div class="skeleton skeleton-bar" style="width: 100%;"></div>
          <div class="skeleton skeleton-btn"></div>
        `;
        break;

      case 'chat-message':
        el.className = 'skeleton-chat-message';
        el.innerHTML = `
          <div class="skeleton skeleton-avatar"></div>
          <div class="skeleton-message-body">
            <div class="skeleton skeleton-message-line" style="width: 85%;"></div>
            <div class="skeleton skeleton-message-line" style="width: 65%;"></div>
            <div class="skeleton skeleton-message-line" style="width: 45%;"></div>
          </div>
        `;
        break;

      case 'list-item':
        el.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px 0;';
        el.innerHTML = `
          <div class="skeleton" style="width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;"></div>
          <div style="flex: 1;">
            <div class="skeleton skeleton-text medium"></div>
          </div>
        `;
        break;
    }

    return el;
  }

  /**
   * Replace a container's content with skeleton loading state
   */
  function showSkeletons(container, type, count) {
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      container.appendChild(createSkeleton(type));
    }
  }

  /**
   * Auto-apply skeletons to elements with data-skeleton attribute
   */
  function initSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(el => {
      const type = el.dataset.skeleton || 'card';
      const count = parseInt(el.dataset.skeletonCount || '3', 10);
      if (el.children.length === 0 || el.dataset.skeletonActive === 'true') {
        showSkeletons(el, type, count);
      }
    });
  }


  // ============================================
  // 4. STRUCTURED PROBLEM CARDS
  // ============================================

  /**
   * Detect if a message contains a math problem and wrap it in a problem card.
   * Called after appendMessage renders content.
   */
  function enhanceProblemMessages() {
    // Patterns that indicate a math problem is being presented
    const problemPatterns = [
      /(?:solve|simplify|evaluate|factor|find|calculate|compute|graph|determine)\s*(?:the|this|:)/i,
      /what\s+is\s+\d/i,
      /\?\s*$/m,
      /try\s+this\s+(?:one|problem|question)/i,
      /here(?:'s| is)\s+(?:a|your|the)\s+(?:problem|question)/i,
      /problem\s*(?:\d|#|:)/i,
      /practice\s+problem/i,
    ];

    // Hook into appendMessage to check AI messages
    const originalAppendMessage = window.appendMessage;
    if (!originalAppendMessage) return;

    window.appendMessage = function(text, sender, graphData, isMasteryQuiz) {
      // Call original
      originalAppendMessage.call(this, text, sender, graphData, isMasteryQuiz);

      // Only enhance AI messages that look like problems
      if (sender !== 'ai' || !text) return;

      const isProblem = problemPatterns.some(pattern => pattern.test(text));
      if (!isProblem && !isMasteryQuiz) return;

      // Find the just-appended message
      const chatBox = document.getElementById('chat-messages-container');
      if (!chatBox) return;

      const messages = chatBox.querySelectorAll('.message.ai');
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.dataset.problemCardApplied) return;

      lastMessage.dataset.problemCardApplied = 'true';

      // Wrap the message text in a problem card structure
      const textNode = lastMessage.querySelector('.message-text');
      if (!textNode) return;

      // Create a problem card wrapper
      const card = document.createElement('div');
      card.className = 'problem-card';

      const header = document.createElement('div');
      header.className = 'problem-card-header';
      header.innerHTML = '<i class="fas fa-brain"></i> <span>Problem</span>';

      const body = document.createElement('div');
      body.className = 'problem-card-body';
      // Move all children from textNode into the card body
      while (textNode.firstChild) {
        body.appendChild(textNode.firstChild);
      }

      const actions = document.createElement('div');
      actions.className = 'problem-card-actions';
      actions.innerHTML = `
        <button class="problem-action-btn" onclick="if(window.showSuggestions) window.showSuggestions([{text:'Give me a hint', message:'Can you give me a hint?'}])">
          <i class="fas fa-lightbulb"></i> Hint
        </button>
        <button class="problem-action-btn" onclick="if(window.showSuggestions) window.showSuggestions([{text:'Show me an example', message:'Can you show me a similar example first?'}])">
          <i class="fas fa-book-open"></i> Example
        </button>
        <button class="problem-action-btn" onclick="if(window.showSuggestions) window.showSuggestions([{text:'Explain differently', message:'Can you explain this differently?'}])">
          <i class="fas fa-sync-alt"></i> Rephrase
        </button>
      `;

      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(actions);

      // Replace textNode content with the card
      textNode.innerHTML = '';
      textNode.appendChild(card);
    };
  }


  // ============================================
  // 5. ENHANCED BADGE CEREMONY
  // ============================================

  /**
   * Show a full-screen badge unlock ceremony
   * Replaces the simple modal with an immersive celebration
   */
  function showBadgeCeremony(badge) {
    const name = badge.name || badge.badgeName || badge.badge || 'Achievement Unlocked';
    const description = badge.description || 'You\'ve mastered a new skill!';
    const xp = badge.xpReward || badge.xpBonus || 500;
    const icon = badge.icon || 'fa-trophy';

    // Create ceremony overlay
    const overlay = document.createElement('div');
    overlay.className = 'badge-ceremony-overlay';
    overlay.innerHTML = `
      <div class="badge-ceremony-content">
        <div class="badge-ceremony-label">New Badge Unlocked</div>
        <div class="badge-ceremony-icon">
          <div class="badge-shimmer"></div>
          <i class="fas ${icon}"></i>
        </div>
        <div class="badge-ceremony-name">${name}</div>
        <div class="badge-ceremony-description">${description}</div>
        <div class="badge-ceremony-xp">+${xp} XP</div>
        <button class="badge-ceremony-dismiss">Continue</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Trigger confetti after badge pops in
    setTimeout(() => {
      if (window.ensureConfetti) {
        window.ensureConfetti().then(() => {
          if (typeof confetti === 'function') {
            // Center burst
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.5 },
              colors: ['#FFD700', '#FFA500', '#FF3B7F', '#12B3B3', '#16C86D']
            });
            // Side bursts
            setTimeout(() => {
              confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: ['#FFD700', '#12B3B3'] });
              confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: ['#FFD700', '#FF3B7F'] });
            }, 300);
          }
        });
      }
    }, 600);

    // Dismiss handlers
    const dismiss = () => {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.badge-ceremony-dismiss').addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    // Auto-dismiss after 8 seconds
    setTimeout(dismiss, 8000);
  }

  // Override existing badge celebration functions
  function hookBadgeCeremony() {
    // Override showBadgeCelebration from engagement-widgets.js
    const originalShowBadgeCelebration = window.showBadgeCelebration;
    window.showBadgeCelebration = function(badge) {
      showBadgeCeremony(badge);
    };

    // Override showBadgeEarnedModal from badgeProgress.js if it exists
    // We'll monkey-patch it when it becomes available
    const observer = new MutationObserver(() => {
      if (window.showBadgeEarnedModal && !window._badgeEarnedPatched) {
        window._badgeEarnedPatched = true;
        const original = window.showBadgeEarnedModal;
        window.showBadgeEarnedModal = function(data) {
          showBadgeCeremony({
            name: data.badge || data.badgeName,
            description: data.description || 'You\'ve mastered a new skill!',
            xpReward: data.xpBonus || data.xpReward || 500,
            icon: data.icon || 'fa-trophy'
          });
        };
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    // Stop observing after 10s to avoid long-running observer
    setTimeout(() => observer.disconnect(), 10000);
  }


  // ============================================
  // 6. DYNAMIC CONTEXTUAL SUGGESTION CHIPS
  // ============================================

  /**
   * Context-aware suggestion chip sets
   */
  const SUGGESTION_CONTEXTS = {
    greeting: [
      { text: 'Help me practice', message: 'I want to practice math problems' },
      { text: 'Homework help', message: 'Can you help me with my homework?' },
      { text: 'Explain a concept', message: 'Can you explain a math concept to me?' },
      { text: 'Start assessment', message: 'I want to find my starting point' }
    ],
    problem_solving: [
      { text: 'Give me a hint', message: 'Can you give me a hint?' },
      { text: 'Show an example', message: 'Can you show me a similar example first?' },
      { text: 'Explain differently', message: 'Can you explain that a different way?' },
      { text: 'I\'m stuck', message: 'I\'m stuck and need more help on this' }
    ],
    correct_answer: [
      { text: 'Next problem', message: 'I\'m ready for the next problem!' },
      { text: 'Harder please', message: 'Can you give me a harder problem?' },
      { text: 'Why does that work?', message: 'Why does that answer work? Can you explain the concept?' },
      { text: 'Review my learning', message: 'What have I learned so far today?' }
    ],
    incorrect_answer: [
      { text: 'Walk me through it', message: 'Can you walk me through the solution step by step?' },
      { text: 'Where did I go wrong?', message: 'Where did I go wrong in my thinking?' },
      { text: 'Try again', message: 'Let me try that problem again' },
      { text: 'Easier version', message: 'Can you give me an easier version of that problem?' }
    ],
    explanation: [
      { text: 'Got it, next topic', message: 'I understand! What\'s next?' },
      { text: 'Still confused', message: 'I\'m still a bit confused. Can you simplify?' },
      { text: 'Show me visually', message: 'Can you show me this visually or with a diagram?' },
      { text: 'Give me practice', message: 'I want to practice this concept' }
    ]
  };

  /**
   * Detect the context of the last AI message and show appropriate chips
   */
  function detectContextAndShowChips(aiText) {
    if (!aiText || !window.showSuggestions) return;

    const text = aiText.toLowerCase();

    let context = 'greeting';

    // Detect correct answer feedback
    if (/correct|right|great job|well done|perfect|excellent|awesome|nice work|that's it/i.test(text)) {
      context = 'correct_answer';
    }
    // Detect incorrect answer feedback
    else if (/not quite|incorrect|try again|that's not|close but|almost|let's look at that again/i.test(text)) {
      context = 'incorrect_answer';
    }
    // Detect problem presentation
    else if (/solve|simplify|evaluate|factor|find|calculate|what is.*\?|try this|problem/i.test(text)) {
      context = 'problem_solving';
    }
    // Detect explanation
    else if (/means that|because|think of it|for example|the reason|concept|when we|remember that/i.test(text)) {
      context = 'explanation';
    }

    const suggestions = SUGGESTION_CONTEXTS[context] || SUGGESTION_CONTEXTS.greeting;
    window.showSuggestions(suggestions);
  }

  /**
   * Hook into the AI response flow to auto-detect context
   */
  function hookDynamicSuggestions() {
    const originalAppend = window.appendMessage;
    if (!originalAppend) return;

    // Wrap appendMessage to detect context after AI messages
    const currentAppend = window.appendMessage;
    window.appendMessage = function(text, sender, graphData, isMasteryQuiz) {
      currentAppend.call(this, text, sender, graphData, isMasteryQuiz);

      // After AI message, detect context and show chips
      if (sender === 'ai' && text) {
        setTimeout(() => detectContextAndShowChips(text), 500);
      }
    };
  }


  // ============================================
  // 7. CLIENT-SIDE ROUTE PREFETCHING
  // ============================================

  function initPrefetching() {
    const prefetchedUrls = new Set();
    const currentPath = window.location.pathname;

    // Priority pages to prefetch based on current page
    const prefetchMap = {
      '/student-dashboard.html': ['/chat.html'],
      '/chat.html': ['/student-dashboard.html', '/progress.html'],
      '/progress.html': ['/chat.html', '/student-dashboard.html']
    };

    const toPrefetch = prefetchMap[currentPath] || [];

    // Prefetch after page load settles
    setTimeout(() => {
      toPrefetch.forEach(url => {
        if (prefetchedUrls.has(url)) return;
        prefetchedUrls.add(url);

        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = 'document';
        document.head.appendChild(link);
      });
    }, 2000);

    // Also prefetch on hover for any internal link
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') ||
          href.startsWith('javascript:') || prefetchedUrls.has(href)) {
        return;
      }

      prefetchedUrls.add(href);
      const prefetchLink = document.createElement('link');
      prefetchLink.rel = 'prefetch';
      prefetchLink.href = href;
      prefetchLink.as = 'document';
      document.head.appendChild(prefetchLink);
      link.dataset.prefetched = 'true';
    }, { passive: true });
  }


  // ============================================
  // 8. TUTOR-SPECIFIC THINKING INDICATOR
  // ============================================

  function enhanceThinkingIndicator() {
    const thinkingIndicator = document.getElementById('thinking-indicator');
    if (!thinkingIndicator) return;

    const tutorMessages = {
      'ms-rivera': 'Ms. Rivera is working out an example...',
      'coach-k': 'Coach K is checking your work...',
      'professor-chen': 'Professor Chen is preparing a solution...',
      'mr-j': 'Mr. J is thinking about the best approach...',
      'default': 'Your tutor is thinking...'
    };

    // Override showThinkingIndicator if it exists
    const originalShow = window.showThinkingIndicator;
    window.showThinkingIndicator = function(show) {
      if (originalShow) originalShow(show);

      if (show && thinkingIndicator) {
        // Get tutor ID from user data
        const tutorId = window.currentUser?.selectedTutorId || 'default';
        const message = tutorMessages[tutorId] || tutorMessages['default'];

        const textSpan = thinkingIndicator.querySelector('span:last-child');
        if (textSpan) {
          textSpan.textContent = message;
          textSpan.className = 'thinking-indicator-text';
        }
      }
    };
  }


  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    // Always init these (lightweight, non-destructive)
    initPageTransitionBar();
    initPrefetching();

    // DOM-dependent features
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }

  function onReady() {
    initBottomNav();
    initSkeletons();

    // Chat-specific enhancements (only on chat pages)
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer) {
      enhanceProblemMessages();
      hookDynamicSuggestions();
      enhanceThinkingIndicator();
    }

    // Hook badge ceremony globally
    hookBadgeCeremony();
  }

  // Expose utilities globally
  window.UXEnhancements = {
    showSkeletons,
    createSkeleton,
    showBadgeCeremony,
    detectContextAndShowChips,
    SUGGESTION_CONTEXTS
  };

  // Run
  init();

})();
