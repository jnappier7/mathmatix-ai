// Mobile Stats Bar — syncs XP, level, and streak to the persistent bar
// Also wires up hero action buttons (Upload Homework, Show Your Work)
(function () {
  'use strict';

  // --- Stats Bar: Mirror data from drawer elements ---
  function syncStatsBar() {
    const msbLevel = document.getElementById('msb-level');
    const msbStreak = document.getElementById('msb-streak');
    const msbXp = document.getElementById('msb-xp');
    const msbXpFill = document.getElementById('msb-xp-fill');

    // Pull from drawer (already updated by sidebar.js)
    const drawerLevel = document.getElementById('drawer-level');
    const drawerStreak = document.getElementById('drawer-streak-count');
    const drawerTotalXp = document.getElementById('drawer-total-xp');
    const drawerProgressFill = document.getElementById('drawer-progress-fill');

    if (msbLevel && drawerLevel) msbLevel.textContent = drawerLevel.textContent;
    if (msbStreak && drawerStreak) msbStreak.textContent = drawerStreak.textContent;
    if (msbXp && drawerTotalXp) msbXp.textContent = drawerTotalXp.textContent;
    if (msbXpFill && drawerProgressFill) {
      msbXpFill.style.width = drawerProgressFill.style.width;
    }
  }

  // Observe drawer changes so stats bar stays in sync
  function observeDrawerChanges() {
    const targets = [
      'drawer-level', 'drawer-streak-count',
      'drawer-total-xp', 'drawer-progress-fill'
    ];

    const observer = new MutationObserver(syncStatsBar);

    targets.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        observer.observe(el, {
          childList: true,
          characterData: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style']
        });
      }
    });
  }

  // --- Hero Action Buttons ---
  function wireHeroButtons() {
    var uploadBtn = document.getElementById('hero-upload-btn');
    var attachBtn = document.getElementById('attach-button');

    // Upload / Photo → trigger the existing attach button (handles both files and camera)
    if (uploadBtn && attachBtn) {
      uploadBtn.addEventListener('click', function () {
        attachBtn.click();
      });
    }
  }

  // --- Hide hero actions after first message sent ---
  function watchForFirstMessage() {
    var chatBox = document.getElementById('chat-messages-container');
    var heroActions = document.getElementById('hero-actions');
    if (!chatBox || !heroActions) return;

    var observer = new MutationObserver(function () {
      // If chat has messages beyond the resume card, hide hero buttons
      var messages = chatBox.querySelectorAll('.message-container, .message');
      if (messages.length > 0) {
        heroActions.classList.add('hero-hidden');
      }
    });

    observer.observe(chatBox, { childList: true });
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    // Initial sync after a small delay (sidebar loads data async)
    setTimeout(syncStatsBar, 1500);
    setTimeout(syncStatsBar, 4000);
    observeDrawerChanges();
    wireHeroButtons();
    watchForFirstMessage();
  });
})();
