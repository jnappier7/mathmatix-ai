// public/js/textbook-mode.js
// Client-side handling for textbook mode toggle and chapter indicator

(function () {
  'use strict';

  let textbookModeEnabled = false;
  let activeChapterInfo = null;

  // ── DOM Elements ──
  const toggle = document.getElementById('textbook-mode-toggle');
  const tutorLabel = document.getElementById('textbook-label-tutor');
  const textbookLabel = document.getElementById('textbook-label-textbook');
  const chapterIndicator = document.getElementById('chapter-indicator');
  const chatContainer = document.getElementById('chat-messages-container');

  if (!toggle) return; // Textbook toggle not present in DOM

  // ── Initialize state from user profile ──
  async function initTextbookMode() {
    try {
      const res = await fetch('/user', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();

      textbookModeEnabled = (data.user && data.user.textbookMode) || false;
      toggle.checked = textbookModeEnabled;
      updateUI();

      if (textbookModeEnabled) {
        await loadChapterInfo();
      }
    } catch (err) {
      console.error('[TextbookMode] Init failed:', err);
    }
  }

  // ── Toggle handler ──
  toggle.addEventListener('change', async function () {
    const newState = toggle.checked;

    // Check if student is enrolled in a course (has a teacher)
    try {
      const profileRes = await fetch('/user', { credentials: 'same-origin' });
      const profileData = await profileRes.json();

      if (newState && !(profileData.user && profileData.user.teacherId)) {
        // Not enrolled — revert toggle and show prompt
        toggle.checked = false;
        showEnrollPrompt();
        return;
      }

      // Persist the setting
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ textbookMode: newState })
      });

      if (res.ok) {
        textbookModeEnabled = newState;
        updateUI();
        showModeMessage(newState);

        if (newState) {
          await loadChapterInfo();
        }
      } else {
        // Revert on failure
        toggle.checked = !newState;
      }
    } catch (err) {
      console.error('[TextbookMode] Toggle failed:', err);
      toggle.checked = !newState;
    }
  });

  // ── Update UI elements ──
  function updateUI() {
    // Update label highlights
    if (tutorLabel) {
      tutorLabel.classList.toggle('active', !textbookModeEnabled);
    }
    if (textbookLabel) {
      textbookLabel.classList.toggle('active', textbookModeEnabled);
    }

    // Toggle chapter indicator visibility
    if (chapterIndicator) {
      chapterIndicator.classList.toggle('visible', textbookModeEnabled && activeChapterInfo !== null);
    }

    // Toggle bubble styling on chat container
    if (chatContainer) {
      chatContainer.classList.toggle('textbook-mode-active', textbookModeEnabled);
    }
  }

  // ── Load chapter info for indicator badge ──
  async function loadChapterInfo() {
    try {
      const res = await fetch('/api/student/chapters', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();

      if (data.hasChapters && data.chapters.length > 0) {
        // Show the first available chapter (or the active one)
        activeChapterInfo = data.chapters[0];
        if (chapterIndicator) {
          const chapterText = chapterIndicator.querySelector('.chapter-indicator-text');
          if (chapterText) {
            chapterText.textContent = `Ch. ${activeChapterInfo.chapterNumber}: ${activeChapterInfo.chapterTitle}`;
          }
          chapterIndicator.classList.add('visible');
        }
      }
    } catch (err) {
      console.error('[TextbookMode] Failed to load chapters:', err);
    }
  }

  // ── Show mode change system message ──
  function showModeMessage(isTextbook) {
    if (!chatContainer) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'textbook-mode-system-message';

    if (isTextbook && activeChapterInfo) {
      msgDiv.innerHTML = `<i class="fas fa-book"></i> Textbook Mode — let's break down Ch. ${activeChapterInfo.chapterNumber} together.`;
    } else if (isTextbook) {
      msgDiv.innerHTML = '<i class="fas fa-book"></i> Textbook Mode — let\'s break down the chapter together.';
    } else {
      msgDiv.innerHTML = '<i class="fas fa-graduation-cap"></i> Tutor Mode — let\'s explore and problem-solve.';
    }

    chatContainer.appendChild(msgDiv);
    msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // ── Show enrollment prompt ──
  function showEnrollPrompt() {
    if (!chatContainer) return;

    const existing = chatContainer.querySelector('.textbook-enroll-prompt');
    if (existing) existing.remove();

    const promptDiv = document.createElement('div');
    promptDiv.className = 'textbook-enroll-prompt';
    promptDiv.innerHTML = `
      <p>You need to be enrolled in a course to use Textbook Mode.</p>
      <a href="/courses.html">Browse courses</a>
    `;

    chatContainer.appendChild(promptDiv);
    promptDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // ── Initialize on page load ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTextbookMode);
  } else {
    initTextbookMode();
  }

  // Expose for external use
  window.textbookMode = {
    isEnabled: () => textbookModeEnabled,
    getActiveChapter: () => activeChapterInfo
  };
})();
