/* --- /js/mobile-poster-chat.js --- */
/* ============================================================
   mobile-poster-chat.js
   Drives the mobile "poster-chat hybrid":
   - builds the readability scrim over the fixed tutor poster
   - builds floating top chrome (Live pill / streak / hamburger)
   - builds the idle greeting overlay
   - builds the hamburger bottom-sheet menu
   - toggles body.mpc-has-messages so the scrim deepens and the
     greeting fades once a conversation begins

   Additive only. Wires to existing buttons/IDs — never replaces
   chat send/receive, voice, upload or equation logic. Replaces
   the retired 4-tab mobile-chat-nav.js.
   ============================================================ */

(function () {
  'use strict';

  // Chat page only.
  if (!document.body.classList.contains('cr-mode')) return;
  if (!document.getElementById('chat-messages-container')) return;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function trigger(id) {
    var t = document.getElementById(id);
    if (t) t.click();
  }

  /* ---- scrim --------------------------------------------------------- */
  // The scrim must live INSIDE the poster (.cr-tutor-hero), not as a body
  // sibling. mobile-fixes.css makes #app-layout-wrapper a z-index:1 stacking
  // context, which traps #chat-container's z-index — so a body-level scrim
  // paints OVER the chat instead of behind it. As a hero child it can only
  // ever darken the poster.
  function buildScrim() {
    if (document.querySelector('.mpc-scrim')) return;
    var host = document.querySelector('.cr-tutor-hero') || document.body;
    host.appendChild(el('div', 'mpc-scrim'));
  }

  /* ---- top chrome ---------------------------------------------------- */
  function buildTopbar() {
    if (document.getElementById('mpc-topbar')) return;
    var bar = el('nav', null,
      '<div class="mpc-live-pill">' +
        '<span class="mpc-live-dot"></span>' +
        '<span class="mpc-live-name">Live with Maya</span>' +
      '</div>' +
      '<div class="mpc-topbar-right">' +
        '<span class="mpc-streak" id="mpc-streak" style="display:none">' +
          '🔥 <span id="mpc-streak-value">0</span></span>' +
        '<button class="mpc-menu-btn" id="mpc-menu-btn" aria-label="Menu" aria-haspopup="true">' +
          '<i class="fas fa-bars"></i></button>' +
      '</div>');
    bar.id = 'mpc-topbar';
    bar.setAttribute('aria-label', 'Chat controls');
    document.body.appendChild(bar);

    document.getElementById('mpc-menu-btn')
      .addEventListener('click', openSheet);

    syncTutorName();
    syncStreak();
  }

  // Mirror the "Live with <tutor>" name from chat-redesign.js's #cr-tutor-name.
  function syncTutorName() {
    var src = document.getElementById('cr-tutor-name');
    var dst = document.querySelector('.mpc-live-name');
    if (!dst) return;
    var apply = function () {
      var name = (src && src.textContent || '').trim();
      if (name) dst.textContent = 'Live with ' + name;
    };
    apply();
    if (src) new MutationObserver(apply)
      .observe(src, { childList: true, characterData: true, subtree: true });
  }

  // Mirror the streak from the (hidden) #msb-streak gamification value.
  function syncStreak() {
    var src = document.getElementById('msb-streak');
    var wrap = document.getElementById('mpc-streak');
    var val = document.getElementById('mpc-streak-value');
    if (!wrap || !val) return;
    var apply = function () {
      var v = parseInt((src && src.textContent || '0').replace(/\D/g, ''), 10) || 0;
      val.textContent = v;
      wrap.style.display = v > 0 ? '' : 'none';
    };
    apply();
    if (src) new MutationObserver(apply)
      .observe(src, { childList: true, characterData: true, subtree: true });
  }

  /* ---- idle greeting ------------------------------------------------- */
  function buildGreeting() {
    if (document.getElementById('mpc-greeting')) return;
    var g = el('div', null,
      '<h2>Hey there 👋<br>What do you want to work on today?</h2>' +
      '<p>I’ll help you step by step.</p>');
    g.id = 'mpc-greeting';
    document.body.appendChild(g);

    // Personalise with the student's first name.
    fetch('/user', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var name = data && data.user && data.user.firstName;
        if (!name) return;
        var h2 = g.querySelector('h2');
        if (h2) h2.innerHTML =
          'Hey ' + name.replace(/[<>&]/g, '') + ' 👋<br>' +
          'What do you want to work on today?';
      })
      .catch(function () { /* keep generic greeting */ });
  }

  /* ---- bottom sheet -------------------------------------------------- */
  // label, subtitle, icon, and the action to run. Items whose target
  // is missing are skipped rather than rendered as dead links.
  var SHEET_ITEMS = [
    { icon: 'fa-user', label: 'Profile', sub: 'Your progress and account',
      run: function () { trigger('right-drawer-toggle'); } },
    { icon: 'fa-gear', label: 'Settings', sub: 'Preferences and notifications',
      need: 'open-settings-modal-btn',
      run: function () { trigger('open-settings-modal-btn'); } },
    { icon: 'fa-user-group', label: 'Switch Tutor', sub: 'Pick a different tutor',
      need: 'change-tutor-btn',
      run: function () { trigger('change-tutor-btn'); } },
    { icon: 'fa-circle-question', label: 'Help', sub: 'Get help or send feedback',
      run: function () { window.location.href = '/contact-support.html'; } },
    { icon: 'fa-right-from-bracket', label: 'Log out', sub: null, danger: true,
      need: 'logoutBtn',
      run: function () { trigger('logoutBtn'); } }
  ];

  function buildSheet() {
    if (document.getElementById('mpc-sheet')) return;

    var overlay = el('div'); overlay.id = 'mpc-sheet-overlay';
    var sheet = el('div'); sheet.id = 'mpc-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Menu');
    sheet.appendChild(el('div', 'mpc-sheet-grabber'));

    SHEET_ITEMS.forEach(function (item) {
      if (item.need && !document.getElementById(item.need)) return; // skip dead link
      var btn = el('button',
        'mpc-sheet-item' + (item.danger ? ' mpc-danger' : ''),
        '<span class="mpc-sheet-icon"><i class="fas ' + item.icon + '"></i></span>' +
        '<span class="mpc-sheet-label"><b>' + item.label + '</b>' +
          (item.sub ? '<span>' + item.sub + '</span>' : '') + '</span>' +
        (item.danger ? '' : '<i class="fas fa-chevron-right mpc-sheet-chevron"></i>'));
      btn.addEventListener('click', function () {
        closeSheet();
        setTimeout(item.run, 220); // let the sheet animate out first
      });
      sheet.appendChild(btn);
    });

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    overlay.addEventListener('click', closeSheet);

    // drag-down to dismiss
    var startY = null;
    sheet.addEventListener('touchstart', function (e) {
      startY = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (startY == null) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 0) sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    sheet.addEventListener('touchend', function (e) {
      if (startY == null) return;
      var dy = e.changedTouches[0].clientY - startY;
      sheet.style.transform = '';
      if (dy > 60) closeSheet();
      startY = null;
    }, { passive: true });
  }

  function openSheet() {
    var o = document.getElementById('mpc-sheet-overlay');
    var s = document.getElementById('mpc-sheet');
    if (!o || !s) return;
    o.classList.add('open');
    requestAnimationFrame(function () { s.classList.add('open'); });
  }
  function closeSheet() {
    var o = document.getElementById('mpc-sheet-overlay');
    var s = document.getElementById('mpc-sheet');
    if (!o || !s) return;
    s.classList.remove('open');
    o.classList.remove('open');
    s.style.transform = '';
  }

  /* ---- visual viewport tracker --------------------------------------- */
  // iOS Safari leaves a gap between the composer and the on-screen keyboard
  // because `100dvh` doesn't always recompute when the keyboard animates in.
  // Mirror the actual visible height into --app-height so the body can dock
  // to the keyboard. Falls back to 100dvh on browsers without VisualViewport.
  function trackViewport() {
    var vv = window.visualViewport;
    if (!vv) return;
    var update = function () {
      document.documentElement.style.setProperty('--app-height', vv.height + 'px');
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
  }

  /* ---- composer height tracker --------------------------------------- */
  // Publish the composer's measured height as --mm-composer-h on <html>.
  //
  // The idle greeting and the workspace FAB both have to sit ABOVE the
  // composer, and both used to encode its height as a literal (195px and 92px).
  // The composer is not a fixed height — the toolbar row, the math strip, the
  // equation palette and a wrapped multi-line input all change it, and the
  // bottom nav shifted the whole stack again — so those literals fell inside
  // the composer and the greeting's subtitle printed across the √x / camera /
  // mic / calculator icons. Measuring removes the guess: paired with
  // --mm-nav-h (bottom-nav.js), `nav + composer` is exactly the height of the
  // bottom chrome, whatever is currently in it.
  function trackComposer() {
    var ic = document.getElementById('input-container');
    if (!ic) return;
    var publish = function () {
      var h = ic.getBoundingClientRect().height;
      // A zero height means the composer is swapped out (voice mode) rather
      // than genuinely flat — keep the last good value so the greeting doesn't
      // snap to the bottom edge mid-transition.
      if (h > 0) {
        document.documentElement.style.setProperty('--mm-composer-h', h + 'px');
      }
    };
    publish();
    if (window.ResizeObserver) new ResizeObserver(publish).observe(ic);
    window.addEventListener('resize', publish);
    window.addEventListener('orientationchange', publish);
  }

  /* ---- idle <-> conversation state ----------------------------------- */
  // The greeting is a FIXED overlay, so anything rendered into the message
  // container paints underneath it. "Idle" therefore has to mean the container
  // is genuinely empty — not "has no .message".
  //
  // It used to test for `.message-container, .message`, which silently excluded
  // every non-message surface that injects here: the resume card, the status
  // card, the challenge/test-out card. Those render, the greeting never fades,
  // and the two headings paint on top of each other ("Good evening, Jason!"
  // under "Hey Jason 👋"). The container ships empty in chat.html and is
  // populated entirely by JS, so any element child is real content — a signal
  // that stays correct when the next card type is added.
  function watchMessages() {
    var box = document.getElementById('chat-messages-container');
    if (!box) return;
    var apply = function () {
      document.body.classList.toggle('mpc-has-messages', box.childElementCount > 0);
    };
    apply();
    new MutationObserver(apply).observe(box, { childList: true });
  }

  /* ---- boot ---------------------------------------------------------- */
  function init() {
    buildScrim();
    buildTopbar();
    buildGreeting();
    buildSheet();
    watchMessages();
    trackComposer();
    trackViewport();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

;
/* --- /js/inlineEquationBox.js --- */
/**
 * INLINE EQUATION BOX — MS Word-style math input (mobile + desktop)
 *
 * Core UX:
 * - Student types in a contenteditable div (normal text)
 * - Click √x button or press Alt+= to insert an inline equation box
 * - Inside the box: MathLive auto-builds fractions (/), superscripts (^),
 *   subscripts (_) as you type — no space bar needed for those
 * - Space bar handles autocorrect (\alpha → α) and sqrt(x) → radical
 * - Tab navigates between placeholders (numerator → denominator)
 * - Click/tap outside (or arrow-right past end) exits back to text
 * - Click/tap a sealed equation box to re-enter and edit
 *
 * Inspired by Microsoft Word's UnicodeMath / equation editor UX.
 * MathLive provides the core auto-building; this module handles the
 * inline embedding, lifecycle (active/sealed), and text integration.
 *
 * @module inlineEquationBox
 */

(function () {
  'use strict';

  // ─── CONFIGURATION ──────────────────────────────────────────────────

  // UnicodeMath autocorrect map: type \name + space → symbol
  const AUTOCORRECT = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\epsilon': 'ε', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
    '\\pi': 'π', '\\sigma': 'σ', '\\phi': 'φ', '\\omega': 'ω',
    '\\Delta': 'Δ', '\\Sigma': 'Σ', '\\Pi': 'Π', '\\Omega': 'Ω',
    '\\infty': '∞', '\\pm': '±', '\\mp': '∓',
    '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈',
    '\\times': '×', '\\div': '÷', '\\cdot': '·',
    '\\sqrt': '√', '\\cbrt': '∛',
    '\\int': '∫', '\\sum': '∑', '\\prod': '∏',
    '\\forall': '∀', '\\exists': '∃',
    '\\to': '→', '\\rightarrow': '→', '\\leftarrow': '←',
    '\\Rightarrow': '⇒', '\\Leftarrow': '⇐',
    '\\degree': '°', '\\circ': '°',
  };

  // ─── STATE ──────────────────────────────────────────────────────────
  let activeEquationBox = null;
  let inputEl = null; // the contenteditable #user-input
  let onSendCallback = null;
  let firstTimeTooltipShown = false;

  // ─── INITIALIZATION ─────────────────────────────────────────────────

  /**
   * Initialize the inline equation box system.
   * @param {HTMLElement} userInput - The contenteditable div
   * @param {Function} sendMessage - Callback to send the message
   */
  function init(userInput, sendMessage) {
    inputEl = userInput;
    onSendCallback = sendMessage;

    if (!inputEl) return;

    // NOTE: The √x button click is handled by script.js activateMathMode(),
    // which calls insertEquationBoxAtCursor() AND shows the EQ panel on mobile.
    // A duplicate handler here with stopImmediatePropagation() would steal
    // the click and prevent the EQ panel from appearing.

    // Keyboard shortcut: Alt+= to insert equation box (like MS Word)
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === '=') {
        e.preventDefault();
        // Only trigger if the main input is focused or we're in the chat area
        if (inputEl.contains(document.activeElement) || document.activeElement === inputEl) {
          insertEquationBoxAtCursor();
        }
      }
    });

    // Click/touch handler for re-entering existing equation boxes.
    // On mobile, touchend is more reliable than click for inline taps.
    inputEl.addEventListener('click', handleEquationBoxClick);
    inputEl.addEventListener('touchend', (e) => {
      const touch = e.changedTouches && e.changedTouches[0];
      if (!touch) return;
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const box = target && target.closest('.inline-eq-box.sealed');
      if (box && inputEl.contains(box)) {
        e.preventDefault();
        reopenEquationBox(box);
      }
    });

    // Prevent contenteditable from eating equation box elements
    inputEl.addEventListener('beforeinput', handleBeforeInput);
  }

  // ─── EQUATION BOX CREATION ──────────────────────────────────────────

  /**
   * Insert a new inline equation box at the current cursor position.
   * The box is a <math-field> element wrapped in a styled container.
   */
  function insertEquationBoxAtCursor() {
    if (!inputEl) return;

    // Ensure focus is on the input
    inputEl.focus();

    const box = createEquationBox();

    // Insert at cursor position
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);

      // Make sure we're inside the input element
      if (inputEl.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(box);

        // Move cursor inside the math-field
        const mathField = box.querySelector('math-field');
        if (mathField) {
          // Small delay to let MathLive initialize
          setTimeout(() => {
            mathField.focus();
            suppressNativeKeyboard(mathField);
          }, 50);
        }
      } else {
        // Cursor not in input — append to end
        inputEl.appendChild(box);
        const mathField = box.querySelector('math-field');
        if (mathField) {
          setTimeout(() => {
            mathField.focus();
            suppressNativeKeyboard(mathField);
          }, 50);
        }
      }
    } else {
      inputEl.appendChild(box);
      const mathField = box.querySelector('math-field');
      if (mathField) {
        setTimeout(() => {
          mathField.focus();
          suppressNativeKeyboard(mathField);
        }, 50);
      }
    }

    // Show first-time tooltip
    if (!firstTimeTooltipShown) {
      showFirstTimeTooltip(box);
    }
  }

  /**
   * Create a new equation box element.
   * @returns {HTMLElement} The equation box wrapper
   */
  function createEquationBox() {
    const wrapper = document.createElement('span');
    wrapper.className = 'inline-eq-box';
    wrapper.contentEditable = 'false'; // Prevent contenteditable from merging it

    const mathField = document.createElement('math-field');
    mathField.className = 'inline-eq-field';
    mathField.setAttribute('virtual-keyboard-mode', 'off');
    mathField.setAttribute('math-virtual-keyboard-policy', 'manual');
    mathField.setAttribute('smart-mode', 'true');

    wrapper.appendChild(mathField);

    // Wire up event handlers
    setupEquationBoxEvents(wrapper, mathField);

    activeEquationBox = wrapper;
    wrapper.classList.add('active');

    return wrapper;
  }

  // ─── EVENT HANDLING ─────────────────────────────────────────────────

  /**
   * Set up all event handlers for an equation box.
   */
  function setupEquationBoxEvents(wrapper, mathField) {
    // Space bar: auto-build trigger (UnicodeMath style)
    mathField.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        const handled = handleSpaceBuild(mathField);
        if (handled) {
          e.preventDefault();
        }
      }

      // Tab: navigate between placeholders or exit
      if (e.key === 'Tab') {
        e.preventDefault();
        if (!e.shiftKey) {
          // Try to move to next placeholder; if none, exit right
          const moved = mathField.executeCommand('moveToNextPlaceholder');
          if (!moved) {
            exitEquationBox(wrapper, 'right');
          }
        } else {
          const moved = mathField.executeCommand('moveToPreviousPlaceholder');
          if (!moved) {
            exitEquationBox(wrapper, 'left');
          }
        }
      }

      // Right arrow at end of equation → exit to text
      if (e.key === 'ArrowRight') {
        try {
          const pos = mathField.position;
          const lastPos = mathField.model?.lastOffset ?? 0;
          if (pos >= lastPos) {
            e.preventDefault();
            exitEquationBox(wrapper, 'right');
          }
        } catch (err) { /* MathLive API mismatch — ignore */ }
      }

      // Left arrow at start of equation → exit to text (left side)
      if (e.key === 'ArrowLeft') {
        try {
          const pos = mathField.position;
          if (pos <= 0) {
            e.preventDefault();
            exitEquationBox(wrapper, 'left');
          }
        } catch (err) { /* MathLive API mismatch — ignore */ }
      }

      // Backspace on empty equation → delete the box
      if (e.key === 'Backspace') {
        const val = mathField.value?.trim();
        if (!val) {
          e.preventDefault();
          deleteEquationBox(wrapper);
        }
      }

      // Enter → send the message
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sealEquationBox(wrapper);
        if (onSendCallback) onSendCallback();
      }

      // Escape → exit without deleting
      if (e.key === 'Escape') {
        e.preventDefault();
        exitEquationBox(wrapper, 'right');
      }
    });

    // Focus: mark as active
    mathField.addEventListener('focus', () => {
      activeEquationBox = wrapper;
      wrapper.classList.add('active');
      suppressNativeKeyboard(mathField);
    });

    // Blur: seal the box (render final state)
    mathField.addEventListener('blur', () => {
      // Small delay so click handlers can fire first
      setTimeout(() => {
        if (activeEquationBox === wrapper && !wrapper.contains(document.activeElement)) {
          sealEquationBox(wrapper);
        }
      }, 150);
    });
  }

  /**
   * Handle space bar as auto-build trigger (like MS Word).
   *
   * NOTE: MathLive already auto-builds fractions (/), superscripts (^),
   * and subscripts (_) as you type. We only handle things MathLive doesn't:
   * - Autocorrect codes: \alpha → α, \theta → θ, etc.
   * - \frac → fraction template with placeholders
   * - sqrt(expr) → radical structure
   *
   * @returns {boolean} true if the space was consumed by an auto-build
   */
  function handleSpaceBuild(mathField) {
    const value = mathField.value || '';

    // Check for autocorrect codes like \alpha, \theta, etc.
    // MathLive may handle some of these, but our map ensures coverage
    const autocorrectMatch = value.match(/\\[a-zA-Z]+$/);
    if (autocorrectMatch) {
      const code = autocorrectMatch[0];
      if (AUTOCORRECT[code]) {
        const before = value.slice(0, -code.length);
        mathField.value = before + AUTOCORRECT[code];
        // Move cursor to end
        try { mathField.position = mathField.model?.lastOffset ?? 0; } catch (e) {}
        return true;
      }

      // Handle \frac → insert fraction template with placeholders
      if (code === '\\frac') {
        const before = value.slice(0, -code.length);
        mathField.value = before;
        mathField.executeCommand(['insert', '\\frac{#0}{#1}']);
        return true;
      }
    }

    // Auto-build: sqrt(expr) or √(expr) → radical
    // MathLive doesn't auto-build from text "sqrt(x+1)" — we handle this
    const sqrtPattern = /(?:sqrt|√)\(([^()]+)\)$/;
    const sqrtMatch = value.match(sqrtPattern);
    if (sqrtMatch) {
      const radicand = sqrtMatch[1];
      const before = value.slice(0, sqrtMatch.index);
      mathField.value = before;
      mathField.executeCommand(['insert', `\\sqrt{${radicand}}`]);
      return true;
    }

    return false;
  }

  // ─── EQUATION BOX LIFECYCLE ─────────────────────────────────────────

  /**
   * Seal an equation box — render its final state and make it non-editable.
   * The box shows the rendered math. Tapping it re-opens for editing.
   */
  function sealEquationBox(wrapper) {
    if (!wrapper) return;
    const mathField = wrapper.querySelector('math-field');
    if (!mathField) return;

    const latex = mathField.value?.trim();

    // If empty, just delete the box
    if (!latex) {
      deleteEquationBox(wrapper);
      return;
    }

    wrapper.classList.remove('active');
    wrapper.classList.add('sealed');
    wrapper.setAttribute('data-latex', latex);

    if (activeEquationBox === wrapper) {
      activeEquationBox = null;
    }
  }

  /**
   * Re-open a sealed equation box for editing.
   */
  function reopenEquationBox(wrapper) {
    if (!wrapper) return;

    wrapper.classList.remove('sealed');
    wrapper.classList.add('active');
    activeEquationBox = wrapper;

    const mathField = wrapper.querySelector('math-field');
    if (mathField) {
      setTimeout(() => {
        mathField.focus();
        // Place cursor at end
        try { mathField.position = mathField.model?.lastOffset ?? 0; } catch (e) {}
        suppressNativeKeyboard(mathField);
      }, 50);
    }
  }

  /**
   * Exit an equation box and place cursor in the surrounding text.
   * @param {'left'|'right'} direction - Which side to place the text cursor
   */
  function exitEquationBox(wrapper, direction) {
    sealEquationBox(wrapper);

    if (!inputEl) return;

    // Place cursor adjacent to the box
    const sel = window.getSelection();
    const range = document.createRange();

    if (direction === 'right') {
      // Place cursor after the box
      // Ensure there's a text node after the box to place cursor in
      let nextNode = wrapper.nextSibling;
      if (!nextNode || nextNode.nodeType !== Node.TEXT_NODE) {
        nextNode = document.createTextNode('\u200B'); // zero-width space
        wrapper.parentNode.insertBefore(nextNode, wrapper.nextSibling);
      }
      range.setStart(nextNode, nextNode.nodeType === Node.TEXT_NODE ? Math.min(1, nextNode.length) : 0);
      range.collapse(true);
    } else {
      // Place cursor before the box
      let prevNode = wrapper.previousSibling;
      if (!prevNode || prevNode.nodeType !== Node.TEXT_NODE) {
        prevNode = document.createTextNode('\u200B');
        wrapper.parentNode.insertBefore(prevNode, wrapper);
      }
      range.setStart(prevNode, prevNode.length);
      range.collapse(true);
    }

    sel.removeAllRanges();
    sel.addRange(range);
    inputEl.focus();
  }

  /**
   * Delete an equation box and place cursor where it was.
   */
  function deleteEquationBox(wrapper) {
    if (!wrapper || !inputEl) return;

    const sel = window.getSelection();
    const range = document.createRange();

    // Place cursor where the box was
    let adjacentNode = wrapper.previousSibling || wrapper.nextSibling;
    if (!adjacentNode) {
      adjacentNode = document.createTextNode('');
      wrapper.parentNode.appendChild(adjacentNode);
    }

    if (adjacentNode.nodeType === Node.TEXT_NODE) {
      range.setStart(adjacentNode, adjacentNode === wrapper.previousSibling ? adjacentNode.length : 0);
    } else {
      range.setStartBefore(adjacentNode);
    }
    range.collapse(true);

    wrapper.remove();
    sel.removeAllRanges();
    sel.addRange(range);
    inputEl.focus();

    if (activeEquationBox === wrapper) {
      activeEquationBox = null;
    }
  }

  // ─── INPUT HANDLERS ─────────────────────────────────────────────────

  /**
   * Handle clicks on sealed equation boxes to re-open them.
   */
  function handleEquationBoxClick(e) {
    const box = e.target.closest('.inline-eq-box.sealed');
    if (box) {
      e.preventDefault();
      e.stopPropagation();
      reopenEquationBox(box);
    }
  }

  /**
   * Prevent contenteditable from mangling equation box content.
   */
  function handleBeforeInput(e) {
    // If typing in the main input next to a sealed equation box,
    // don't let the browser merge them
    if (e.inputType === 'deleteContentBackward') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        // Check if we're right after a sealed equation box
        if (node.nodeType === Node.TEXT_NODE && node.length === 0) {
          const prev = node.previousSibling;
          if (prev && prev.classList && prev.classList.contains('inline-eq-box')) {
            // Don't delete — reopen the equation for editing instead
            e.preventDefault();
            reopenEquationBox(prev);
          }
        }
      }
    }
  }

  /**
   * Suppress native mobile keyboard when focusing a math-field.
   * We want the math keyboard panel, not the OS keyboard.
   */
  function suppressNativeKeyboard(mathField) {
    if (window.innerWidth <= 768) {
      mathField.setAttribute('inputmode', 'none');
      mathField.mathVirtualKeyboardPolicy = 'manual';
      if (window.mathVirtualKeyboard) {
        try { window.mathVirtualKeyboard.visible = false; } catch (_) {}
      }

      // Patch the internal textarea in MathLive's shadow DOM.
      // Chrome/Safari may ignore inputmode on the outer custom element,
      // so we must also set it on the hidden <textarea> inside the shadow root.
      // MathLive may not have created it yet, so retry a few times and
      // fall back to a MutationObserver if needed.
      const patchShadowTextarea = () => {
        try {
          const shadow = mathField.shadowRoot;
          if (!shadow) return false;
          const ta = shadow.querySelector('textarea');
          if (ta) {
            ta.setAttribute('inputmode', 'none');
            ta.setAttribute('readonly', '');
            return true;
          }
        } catch (_) {}
        return false;
      };

      if (!patchShadowTextarea()) {
        // Retry with increasing delays — MathLive may still be initializing
        let retries = 0;
        const retryPatch = () => {
          if (patchShadowTextarea() || retries >= 5) return;
          retries++;
          setTimeout(retryPatch, retries * 50);
        };
        setTimeout(retryPatch, 30);

        // Last resort: watch for DOM changes in the shadow root
        try {
          const shadow = mathField.shadowRoot;
          if (shadow) {
            const observer = new MutationObserver(() => {
              if (patchShadowTextarea()) observer.disconnect();
            });
            observer.observe(shadow, { childList: true, subtree: true });
            // Auto-disconnect after 2s to avoid leaks
            setTimeout(() => observer.disconnect(), 2000);
          }
        } catch (_) {}
      }
    }
  }

  // ─── TOOLTIP ────────────────────────────────────────────────────────

  /**
   * Show a one-time tooltip teaching students the equation box controls.
   */
  function showFirstTimeTooltip(box) {
    const storageKey = 'inline-eq-tooltip-seen';
    try {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, '1');
    } catch (e) {
      // localStorage unavailable
    }

    firstTimeTooltipShown = true;

    const tip = document.createElement('div');
    tip.className = 'inline-eq-tooltip';
    tip.innerHTML =
      '<strong>Type math naturally.</strong> ' +
      'Space builds it: <code>1/2</code> → fraction, <code>x^2</code> → power. ' +
      'Use <code>( )</code> to group. Tap outside when done.';

    // Position above the equation box
    box.style.position = 'relative';
    box.appendChild(tip);

    const dismiss = () => { if (tip.parentElement) tip.remove(); };
    tip.addEventListener('click', dismiss);
    setTimeout(dismiss, 7000);
  }

  // ─── EXTRACTION ─────────────────────────────────────────────────────

  /**
   * Extract all equation box content from the input as LaTeX.
   * Call this before sending a message to get the math content.
   * @returns {string} The full input text with LaTeX math inline
   */
  function extractContent() {
    if (!inputEl) return '';

    // Seal any active equation box first
    if (activeEquationBox) {
      sealEquationBox(activeEquationBox);
    }

    let result = '';

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Clean up zero-width spaces
        result += node.textContent.replace(/\u200B/g, '');
      } else if (node.classList && node.classList.contains('inline-eq-box')) {
        const latex = node.getAttribute('data-latex') || '';
        if (latex) {
          result += `\\(${latex}\\)`;
        }
      } else if (node.classList && node.classList.contains('math-container')) {
        // Legacy math containers
        const latex = node.getAttribute('data-latex') || '';
        if (latex) {
          result += `\\(${latex}\\)`;
        }
      } else if (node.childNodes) {
        node.childNodes.forEach(walk);
      }
    }

    inputEl.childNodes.forEach(walk);
    return result.trim();
  }

  /**
   * Clear all equation boxes from the input.
   */
  function clear() {
    if (inputEl) {
      inputEl.querySelectorAll('.inline-eq-box').forEach(box => box.remove());
    }
    activeEquationBox = null;
  }

  /**
   * Check if an equation box is currently active (being edited).
   * @returns {boolean}
   */
  function isActive() {
    return activeEquationBox !== null && activeEquationBox.classList.contains('active');
  }

  /**
   * Get the active math-field element (for the math keyboard panel to target).
   * @returns {HTMLElement|null}
   */
  function getActiveMathField() {
    if (!activeEquationBox) return null;
    return activeEquationBox.querySelector('math-field');
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────

  window.InlineEquationBox = {
    init,
    insertEquationBoxAtCursor,
    extractContent,
    clear,
    isActive,
    getActiveMathField,
    sealAll: () => {
      if (inputEl) {
        inputEl.querySelectorAll('.inline-eq-box.active').forEach(sealEquationBox);
      }
    },
  };
})();

;
/* --- /js/mathmatixKeyboard.js --- */
/**
 * MATHMATIX EQUATION PANEL
 *
 * Lightweight math-input panel for mobile devices. The native keyboard
 * handles ALL regular text input (ABC, 123) — giving the student haptic
 * feedback, swipe-to-type, autocorrect, and double-space-to-period for free.
 *
 * This module provides ONLY the equation panel (EQ) that slides up when
 * the student needs to insert fractions, roots, Greek letters, trig
 * functions, integrals, etc.
 *
 * Flow:
 *   1. Student types normally with the native keyboard.
 *   2. Student taps √x → equation box appears + EQ panel slides up.
 *   3. Student taps math keys on the EQ panel.
 *   4. Student taps ABC → EQ panel hides, native keyboard returns.
 *
 * @module mathmatixKeyboard
 */
(function () {
  'use strict';

  // ─── STATE ──────────────────────────────────────────────────────────
  let textInput = null;       // The contenteditable #user-input
  let eqPanelEl = null;       // The EQ panel container DOM element
  let sendCallback = null;    // Function to call on send
  let initialized = false;

  // ─── DELETE REPEAT STATE ────────────────────────────────────────────
  let deleteRepeatTimer = null;
  let deleteRepeatDelay = 400;   // Initial delay before repeat (ms)
  let deleteRepeatRate = 80;     // Repeat interval, accelerates (ms)
  let activeKey = null;          // Currently pressed key element

  // ─── EQ LAYOUT ─────────────────────────────────────────────────────
  const EQ_LAYOUT = {
    rows: [
      [
        { label: '<span class="k-frac">⁄</span>', latex: '\\frac{#0}{#1}', hint: 'Frac' },
        { label: 'x<sup>n</sup>', latex: '#0^{#1}', hint: 'Pow' },
        { label: 'x<sub>n</sub>', latex: '#0_{#1}', hint: 'Sub' },
        { label: '√', latex: '\\sqrt{#0}', hint: 'Root' },
        { label: '<sup>n</sup>√', latex: '\\sqrt[#1]{#0}', hint: 'nRoot' },
        { label: '|x|', latex: '|#0|', hint: 'Abs' },
        { label: 'log', latex: '\\log_{#0}', hint: 'Log' },
        { label: 'ln', latex: '\\ln(', hint: 'Ln' },
      ],
      [
        { label: 'π', latex: '\\pi' },
        { label: 'θ', latex: '\\theta' },
        { label: '∞', latex: '\\infty' },
        { label: '±', latex: '\\pm' },
        { label: '≤', latex: '\\leq' },
        { label: '≥', latex: '\\geq' },
        { label: '≠', latex: '\\neq' },
        { label: '≈', latex: '\\approx' },
        { label: '°', latex: '\\degree' },
        { label: '⌫', action: 'delete' },
      ],
      [
        { label: 'α', latex: '\\alpha' },
        { label: 'β', latex: '\\beta' },
        { label: 'Δ', latex: '\\Delta' },
        { label: 'λ', latex: '\\lambda' },
        { label: 'σ', latex: '\\sigma' },
        { label: 'Σ', latex: '\\sum_{#0}^{#1}' },
        { label: '∫', latex: '\\int_{#0}^{#1}' },
        { label: 'lim', latex: '\\lim_{#0 \\to #1}', wide: true },
      ],
      [
        { label: 'sin', latex: '\\sin(', wide: true },
        { label: 'cos', latex: '\\cos(', wide: true },
        { label: 'tan', latex: '\\tan(', wide: true },
        { label: 'ABC', action: 'dismiss' },
        { label: '↵', action: 'enter', wide: true },
      ]
    ]
  };

  // ─── INITIALIZATION ──────────────────────────────────────────────────

  function init(opts) {
    if (initialized) return;
    textInput = opts.textInput;
    sendCallback = opts.onSend;
    if (!textInput || !opts.container) return;

    // Mark body for CSS hooks (MathLive suppression, eq box styling)
    document.body.classList.add('mx-keyboard-mode');

    // Build the EQ panel DOM
    eqPanelEl = buildEqPanel();
    opts.container.appendChild(eqPanelEl);

    // Suppress MathLive's own virtual keyboard globally
    if (window.mathVirtualKeyboard) {
      try { window.mathVirtualKeyboard.visible = false; } catch (_) {}
    }

    // Suppress native keyboard on math-fields that gain focus while EQ panel is open
    textInput.addEventListener('focusin', function (e) {
      if (!isEqPanelVisible()) return;
      if (e.target.tagName === 'MATH-FIELD' || e.target.closest('math-field')) {
        const mf = e.target.tagName === 'MATH-FIELD' ? e.target : e.target.closest('math-field');
        if (mf) suppressMathField(mf);
      }
    });

    // Height measurement
    requestAnimationFrame(updatePanelHeightVar);

    initialized = true;
    console.log('[MathmatixKeyboard] Initialized — hybrid mode (native KB + EQ panel)');
  }

  // ─── BUILD EQ PANEL ──────────────────────────────────────────────────

  function buildEqPanel() {
    const panel = document.createElement('div');
    panel.id = 'mx-keyboard';
    panel.className = 'mx-keyboard';

    const page = document.createElement('div');
    page.className = 'mx-kb-page';
    page.dataset.page = 'eq';
    page.style.display = '';

    EQ_LAYOUT.rows.forEach(function (row, rowIdx) {
      const rowEl = document.createElement('div');
      rowEl.className = 'mx-kb-row';
      if (rowIdx === EQ_LAYOUT.rows.length - 1) {
        rowEl.classList.add('mx-kb-row-bottom');
      }
      row.forEach(function (keyDef) {
        rowEl.appendChild(buildKey(keyDef));
      });
      page.appendChild(rowEl);
    });

    panel.appendChild(page);

    // Touch event delegation
    panel.addEventListener('touchstart', onTouchStart, { passive: false });
    panel.addEventListener('touchend', onTouchEnd, { passive: false });
    panel.addEventListener('touchcancel', onTouchCancel, { passive: false });
    panel.addEventListener('mousedown', onMouseDown);

    return panel;
  }

  function buildKey(keyDef) {
    var btn = document.createElement('button');
    btn.className = 'mx-key mx-key-eq';
    btn.setAttribute('tabindex', '-1');

    btn.innerHTML = keyDef.label;
    if (keyDef.hint) {
      btn.innerHTML += '<span class="mx-key-hint">' + keyDef.hint + '</span>';
    }
    if (keyDef.latex) btn.dataset.latex = keyDef.latex;
    if (keyDef.action) btn.dataset.action = keyDef.action;
    if (keyDef.wide) btn.classList.add('mx-key-wide');

    // Extra classes for action keys
    if (keyDef.action === 'delete') {
      btn.classList.add('mx-key-delete');
      btn.innerHTML = '<i class="fas fa-delete-left"></i>';
    }
    if (keyDef.action === 'enter') {
      btn.classList.add('mx-key-enter');
      btn.innerHTML = '<i class="fas fa-arrow-turn-down fa-flip-horizontal"></i>';
    }
    if (keyDef.action === 'dismiss') {
      btn.classList.add('mx-key-mode');
    }

    return btn;
  }

  // ─── SHOW / HIDE ─────────────────────────────────────────────────────

  function showEqPanel() {
    if (!eqPanelEl) return;
    if (eqPanelEl.classList.contains('mx-keyboard-visible')) return;

    // Suppress native keyboard on textInput and any active math-fields
    suppressNativeKeyboard();

    eqPanelEl.classList.add('mx-keyboard-visible');
    document.body.classList.add('mx-keyboard-active');

    setTimeout(updatePanelHeightVar, 280);

    // Scroll chat to bottom
    var chat = document.getElementById('chat-messages-container');
    if (chat) {
      requestAnimationFrame(function () { chat.scrollTop = chat.scrollHeight; });
    }
  }

  function hideEqPanel() {
    if (!eqPanelEl) return;
    eqPanelEl.classList.remove('mx-keyboard-visible');
    document.body.classList.remove('mx-keyboard-active');
    cancelDeleteRepeat();

    // Restore native keyboard ability
    restoreNativeKeyboard();
  }

  function isEqPanelVisible() {
    return !!(eqPanelEl && eqPanelEl.classList.contains('mx-keyboard-visible'));
  }

  // ─── NATIVE KEYBOARD MANAGEMENT ─────────────────────────────────────

  function suppressNativeKeyboard() {
    if (!textInput) return;
    textInput.setAttribute('inputmode', 'none');

    // Also suppress on any active math-fields inside the input
    var mf = getActiveEquationMathField();
    if (mf) suppressMathField(mf);
  }

  function suppressMathField(mf) {
    mf.setAttribute('inputmode', 'none');
    mf.mathVirtualKeyboardPolicy = 'manual';

    // Patch shadow DOM textarea — retry if MathLive hasn't created it yet
    var patchDone = false;
    function patchTA() {
      try {
        var ta = mf.shadowRoot && mf.shadowRoot.querySelector('textarea');
        if (ta) {
          ta.setAttribute('inputmode', 'none');
          ta.setAttribute('readonly', '');
          patchDone = true;
        }
      } catch (_) {}
      return patchDone;
    }

    if (!patchTA()) {
      // Retry with increasing delays
      var retries = 0;
      function retryPatch() {
        if (patchTA() || retries >= 5) return;
        retries++;
        setTimeout(retryPatch, retries * 50);
      }
      setTimeout(retryPatch, 30);
    }
  }

  function restoreNativeKeyboard() {
    if (!textInput) return;
    textInput.removeAttribute('inputmode');

    // Restore all math-fields
    textInput.querySelectorAll('math-field').forEach(function (mf) {
      mf.removeAttribute('inputmode');
      try {
        var ta = mf.shadowRoot && mf.shadowRoot.querySelector('textarea');
        if (ta) ta.removeAttribute('inputmode');
      } catch (_) {}
    });
  }

  // ─── TOUCH HANDLERS (simple taps — no swipe, no bubbles) ───────────

  function onTouchStart(e) {
    var touch = e.touches[0];
    var el = document.elementFromPoint(touch.clientX, touch.clientY);
    var keyEl = el ? el.closest('.mx-key') : null;
    if (!keyEl) return;
    e.preventDefault();

    activeKey = keyEl;
    keyEl.classList.add('mx-key-pressed');

    // Immediate delete + hold-to-repeat
    if (keyEl.dataset.action === 'delete') {
      deleteBackward();
      startDeleteRepeat();
    }
  }

  function onTouchEnd(e) {
    if (!activeKey) return;
    e.preventDefault();
    cancelDeleteRepeat();

    var key = activeKey;
    key.classList.remove('mx-key-pressed');
    activeKey = null;

    // Skip delete — already handled on touchstart
    if (key.dataset.action === 'delete') return;

    processKey(key);
  }

  function onTouchCancel() {
    if (activeKey) {
      activeKey.classList.remove('mx-key-pressed');
    }
    activeKey = null;
    cancelDeleteRepeat();
  }

  function onMouseDown(e) {
    var key = e.target.closest('.mx-key');
    if (!key) return;
    e.preventDefault();

    key.classList.add('mx-key-pressed');
    setTimeout(function () { key.classList.remove('mx-key-pressed'); }, 120);

    processKey(key);
  }

  // ─── KEY PROCESSING ──────────────────────────────────────────────────

  function processKey(key) {
    var action = key.dataset.action;
    var latex = key.dataset.latex;

    if (action) {
      switch (action) {
        case 'dismiss':
          hideEqPanel();
          // Re-focus to bring back native keyboard after a brief delay
          // (allows the EQ panel slide-out animation to start)
          setTimeout(function () {
            if (textInput) textInput.focus();
          }, 80);
          break;
        case 'delete':
          deleteBackward();
          break;
        case 'enter':
          if (sendCallback) sendCallback();
          break;
      }
      return;
    }

    if (latex) {
      var activeField = getActiveEquationMathField();
      if (activeField) {
        activeField.executeCommand(['insert', latex]);
        activeField.focus();
        // Keep native keyboard suppressed while EQ panel is open
        suppressMathField(activeField);
      } else {
        // No active equation box — create one with this LaTeX
        insertEquationWithLatex(latex);
      }
    }
  }

  // ─── DELETE ──────────────────────────────────────────────────────────

  function cancelDeleteRepeat() {
    if (deleteRepeatTimer) {
      clearTimeout(deleteRepeatTimer);
      deleteRepeatTimer = null;
    }
    deleteRepeatDelay = 400;
    deleteRepeatRate = 80;
  }

  function startDeleteRepeat() {
    cancelDeleteRepeat();
    deleteRepeatTimer = setTimeout(function repeatDelete() {
      deleteBackward();
      // Accelerate: reduce interval down to 30ms minimum
      deleteRepeatRate = Math.max(30, deleteRepeatRate - 8);
      deleteRepeatTimer = setTimeout(repeatDelete, deleteRepeatRate);
    }, deleteRepeatDelay);
  }

  // ─── TEXT MANIPULATION ───────────────────────────────────────────────

  function ensureFocus() {
    if (!textInput) return;

    // Prefer the active equation field if one exists
    var eqField = getActiveEquationMathField();
    if (eqField) {
      eqField.focus();
      return;
    }

    // Focus textInput (safe when EQ panel is open because inputmode='none'
    // prevents the native keyboard from appearing)
    if (document.activeElement !== textInput) {
      textInput.focus();
    }

    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !textInput.contains(sel.anchorNode)) {
      placeCursorAtEnd();
    }
  }

  function placeCursorAtEnd() {
    var range = document.createRange();
    range.selectNodeContents(textInput);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertChar(char) {
    ensureFocus();
    document.execCommand('insertText', false, char);
  }

  function deleteBackward() {
    // If there's an active inline equation box, delete from it
    var activeEqField = getActiveEquationMathField();
    if (activeEqField) {
      var val = (activeEqField.value || '').trim();
      if (val === '') {
        // Equation box is empty — remove the entire box
        var box = activeEqField.closest('.inline-eq-box');
        if (box) {
          box.remove();
          ensureFocus();
        }
      } else {
        activeEqField.executeCommand('deleteBackward');
      }
      return;
    }

    // Regular text deletion
    ensureFocus();
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);

    if (!range.collapsed) {
      document.execCommand('delete', false);
      return;
    }

    // Check if cursor is right after an inline equation box
    var node = range.startContainer;
    var offset = range.startOffset;

    if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
      var prev = node.childNodes[offset - 1];
      if (prev && prev.classList && prev.classList.contains('inline-eq-box')) {
        prev.remove();
        return;
      }
    } else if (node.nodeType === Node.TEXT_NODE && offset === 0) {
      var prevSib = node.previousSibling;
      if (prevSib && prevSib.classList && prevSib.classList.contains('inline-eq-box')) {
        prevSib.remove();
        return;
      }
    }

    document.execCommand('delete', false);
  }

  // ─── EQUATION HELPERS ────────────────────────────────────────────────

  function getActiveEquationMathField() {
    if (window.InlineEquationBox) {
      return window.InlineEquationBox.getActiveMathField();
    }
    return null;
  }

  function insertEquationWithLatex(latex) {
    if (!window.InlineEquationBox) return;

    // Ensure cursor is in textInput before inserting
    ensureFocus();
    window.InlineEquationBox.insertEquationBoxAtCursor();

    if (latex) {
      setTimeout(function () {
        var mf = window.InlineEquationBox.getActiveMathField();
        if (mf) {
          mf.executeCommand(['insert', latex]);
          mf.focus();
          // Keep native keyboard suppressed while EQ panel is open
          if (isEqPanelVisible()) {
            suppressMathField(mf);
          }
        }
      }, 80);
    }
  }

  // ─── HEIGHT MANAGEMENT ────────────────────────────────────────────────

  function updatePanelHeightVar() {
    if (!eqPanelEl) return;
    var h = eqPanelEl.offsetHeight;
    if (h > 0) {
      document.body.style.setProperty('--mx-kb-height', h + 'px');
    }
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────
  // Backward-compatible with the old full-keyboard API so script.js
  // callers (show, hide, isVisible, switchPage) continue to work.

  window.MathmatixKeyboard = {
    init: init,
    show: showEqPanel,
    hide: hideEqPanel,
    showEqPanel: showEqPanel,
    hideEqPanel: hideEqPanel,
    isVisible: isEqPanelVisible,
    isEqPanelVisible: isEqPanelVisible,
    switchPage: function (page) {
      if (page === 'eq') showEqPanel();
      else hideEqPanel();
    },
    getInput: function () { return textInput; },
  };

})();

;
/* --- /js/auto-expand-textarea.js --- */
/**
 * Auto-expanding textarea for mobile chat input
 * Expands as user types, up to max-height
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoExpand);
    } else {
        initAutoExpand();
    }

    function initAutoExpand() {
        const textarea = document.getElementById('user-input');

        if (!textarea) {
            console.log('Textarea not found for auto-expand');
            return;
        }

        /**
         * Auto-expand textarea based on content
         */
        function autoExpand() {
            // Reset height to auto to get the correct scrollHeight
            textarea.style.height = 'auto';

            // Get the scroll height (content height)
            const scrollHeight = textarea.scrollHeight;

            // Get computed styles to access CSS variables
            const computedStyle = window.getComputedStyle(textarea);
            const minHeight = parseInt(computedStyle.minHeight) || 44;
            const maxHeight = parseInt(computedStyle.maxHeight) || 120;

            // Set height to content height, respecting min/max bounds
            if (scrollHeight <= minHeight) {
                textarea.style.height = minHeight + 'px';
                textarea.style.overflowY = 'hidden';
            } else if (scrollHeight >= maxHeight) {
                textarea.style.height = maxHeight + 'px';
                textarea.style.overflowY = 'auto';
            } else {
                textarea.style.height = scrollHeight + 'px';
                textarea.style.overflowY = 'hidden';
            }
        }

        /**
         * Reset textarea to initial height
         */
        function resetHeight() {
            textarea.style.height = 'auto';
            const computedStyle = window.getComputedStyle(textarea);
            const minHeight = parseInt(computedStyle.minHeight) || 44;
            textarea.style.height = minHeight + 'px';
            textarea.style.overflowY = 'hidden';
        }

        // Auto-expand on input
        textarea.addEventListener('input', autoExpand);

        // Auto-expand on paste
        textarea.addEventListener('paste', function() {
            // Use setTimeout to allow paste content to be inserted first
            setTimeout(autoExpand, 0);
        });

        // Handle when user sends message (reset height)
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', function() {
                // Reset after a short delay to allow message to be processed
                setTimeout(resetHeight, 100);
            });
        }

        // Handle Enter key (non-shift) sends message
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Let the default handler send the message
                // Then reset height
                setTimeout(resetHeight, 100);
            }
        });

        // Reset on form reset or clear
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
                    if (textarea.value === '') {
                        resetHeight();
                    }
                }
            });
        });

        // Observe textarea value changes
        observer.observe(textarea, {
            attributes: true,
            attributeFilter: ['value']
        });

        // Also reset when textarea is cleared programmatically
        // Only apply custom value property to actual textarea elements
        if (textarea.tagName === 'TEXTAREA') {
            const originalValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
            Object.defineProperty(textarea, 'value', {
                get: function() {
                    return originalValue.get.call(this);
                },
                set: function(newValue) {
                    originalValue.set.call(this, newValue);
                    if (newValue === '') {
                        resetHeight();
                    } else {
                        setTimeout(autoExpand, 0);
                    }
                }
            });
        } else if (textarea.hasAttribute('contenteditable')) {
            // For contenteditable elements, use textContent
            Object.defineProperty(textarea, 'value', {
                get: function() {
                    return this.textContent || '';
                },
                set: function(newValue) {
                    this.textContent = newValue;
                    if (newValue === '') {
                        resetHeight();
                    } else {
                        setTimeout(autoExpand, 0);
                    }
                }
            });
        }

        // Initial height adjustment in case there's default content
        setTimeout(autoExpand, 0);

        // Handle window resize
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(autoExpand, 250);
        });
    }
})();

;
/* --- /js/chat-pinch-zoom.js --- */
/**
 * Pinch-to-Zoom Font Size Control for Chat Messages
 * Allows users to adjust chat font size with pinch gestures
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPinchZoom);
    } else {
        initPinchZoom();
    }

    function initPinchZoom() {
        const chatContainer = document.getElementById('chat-messages-container');

        if (!chatContainer) {
            console.log('Chat container not found for pinch zoom');
            return;
        }

        // Font size settings
        const MIN_FONT_SIZE = 0.8;  // 80% of base
        const MAX_FONT_SIZE = 1.5;  // 150% of base
        const DEFAULT_FONT_SIZE = 1.0;
        const STORAGE_KEY = 'mathmatix-chat-font-scale';

        // Load saved font scale or use default
        let currentScale;
        try { currentScale = parseFloat(StorageUtils.local.getItem(STORAGE_KEY)) || DEFAULT_FONT_SIZE; } catch (e) { currentScale = DEFAULT_FONT_SIZE; }

        // Apply saved scale on load — silent: applying the *stored* scale is
        // not a user gesture, so it must not flash the centred "%" indicator.
        applyFontScale(currentScale, false);

        // Show hint on first visit (mobile only)
        if (window.innerWidth <= 767 && !StorageUtils.local.getItem('pinch-zoom-hint-shown')) {
            showFirstTimeHint();
            StorageUtils.local.setItem('pinch-zoom-hint-shown', 'true');
        }

        // Pinch gesture variables
        let initialDistance = 0;
        let initialScale = currentScale;
        let isPinching = false;

        /**
         * Calculate distance between two touch points
         */
        function getDistance(touch1, touch2) {
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        /**
         * Apply font scale to chat messages
         */
        function applyFontScale(scale, showIndicator = true) {
            // Clamp scale to min/max
            scale = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, scale));
            currentScale = scale;

            // Apply scale using CSS custom property
            // CSS will multiply base font size (17px) by this scale factor
            chatContainer.style.setProperty('--chat-font-scale', scale);

            // Save to localStorage
            StorageUtils.local.setItem(STORAGE_KEY, scale.toString());

            // Show feedback indicator — only for live user gestures
            if (showIndicator) showScaleIndicator(scale);
        }

        /**
         * Show first-time hint about pinch-to-zoom
         */
        function showFirstTimeHint() {
            const hint = document.createElement('div');
            hint.className = 'pinch-zoom-hint';
            hint.innerHTML = '💡 Pinch to zoom chat text<br><small>Double-tap to reset</small>';
            document.body.appendChild(hint);

            // Remove after animation
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.parentNode.removeChild(hint);
                }
            }, 4500);
        }

        /**
         * Show visual feedback of current scale
         */
        function showScaleIndicator(scale) {
            // Remove existing indicator if present
            let indicator = document.getElementById('font-scale-indicator');

            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'font-scale-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(18, 179, 179, 0.95);
                    color: white;
                    padding: 20px 30px;
                    border-radius: 16px;
                    font-size: 1.5rem;
                    font-weight: 600;
                    z-index: 10000;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                `;
                document.body.appendChild(indicator);
            }

            // Update text
            const percentage = Math.round(scale * 100);
            indicator.textContent = `${percentage}%`;

            // Show indicator
            indicator.style.opacity = '1';

            // Clear existing timeout
            if (indicator.hideTimeout) {
                clearTimeout(indicator.hideTimeout);
            }

            // Hide after delay
            indicator.hideTimeout = setTimeout(() => {
                indicator.style.opacity = '0';
            }, 1000);
        }

        /**
         * Handle touch start
         */
        function handleTouchStart(e) {
            if (e.touches.length === 2) {
                isPinching = true;
                initialDistance = getDistance(e.touches[0], e.touches[1]);
                initialScale = currentScale;

                // Prevent default pinch-zoom behavior
                e.preventDefault();
            }
        }

        /**
         * Handle touch move
         */
        function handleTouchMove(e) {
            if (isPinching && e.touches.length === 2) {
                e.preventDefault();

                const currentDistance = getDistance(e.touches[0], e.touches[1]);
                const distanceRatio = currentDistance / initialDistance;

                // Calculate new scale (more sensitive scaling)
                const newScale = initialScale * distanceRatio;

                // Apply new scale
                applyFontScale(newScale);
            }
        }

        /**
         * Handle touch end
         */
        function handleTouchEnd(e) {
            if (e.touches.length < 2) {
                isPinching = false;
            }
        }

        // Add touch event listeners
        chatContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        chatContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        chatContainer.addEventListener('touchend', handleTouchEnd, { passive: false });
        chatContainer.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        // Add double-tap to reset
        let lastTap = 0;
        chatContainer.addEventListener('touchend', function(e) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;

            if (tapLength < 300 && tapLength > 0) {
                // Double tap detected
                if (e.target.closest('.message')) {
                    // Reset to default size
                    applyFontScale(DEFAULT_FONT_SIZE);
                }
            }
            lastTap = currentTime;
        });

        // Desktop: trackpad pinch + Ctrl/⌘ + scroll wheel.
        // Both arrive as a wheel event with ctrlKey set (a macOS trackpad pinch
        // is synthesized as ctrl+wheel). deltaY magnitude reflects pinch
        // intensity on a trackpad — many small events — and notch size on a
        // mouse — few large events. So scale BY the magnitude (continuous,
        // tracks the fingers) instead of a fixed step, but clamp per event so a
        // single mouse notch can't jump too far.
        chatContainer.addEventListener('wheel', function(e) {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();

                // Normalize line/page delta modes to roughly pixel scale.
                const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
                const delta = Math.max(-30, Math.min(30, e.deltaY * unit));

                // deltaY > 0 (pinch in / scroll down) shrinks text.
                applyFontScale(currentScale - delta * 0.004);
            }
        }, { passive: false });

        console.log('Pinch-to-zoom initialized for chat messages');
    }
})();

;
/* --- /js/file-upload.js --- */
// ============================================
// ELEGANT FILE UPLOAD SYSTEM
// ChatGPT/Claude-style experience
// ============================================

class FileUploadManager {
    constructor() {
        this.dragDropOverlay = document.getElementById('drag-drop-overlay');
        this.filePreviewModal = document.getElementById('file-preview-modal');
        this.attachButton = document.getElementById('attach-button');
        this.fileInput = document.getElementById('file-input');

        this.currentFile = null;
        this.currentPdfDoc = null;
        this.currentPdfPage = 1;

        this.init();
    }

    init() {
        this.setupDragAndDrop();
        this.setupFileInput();
        this.setupModalControls();
        console.log('✅ File Upload Manager initialized');
    }

    // ============================================
    // DRAG & DROP
    // ============================================

    setupDragAndDrop() {
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Show overlay on drag enter (OS files OR resource cards)
        chatContainer.addEventListener('dragenter', (e) => {
            if (e.dataTransfer.types.includes('Files') ||
                e.dataTransfer.types.includes('application/x-teacher-resource-id')) {
                this.showDragOverlay();
            }
        });

        // Hide overlay on drag leave (from overlay itself)
        this.dragDropOverlay.addEventListener('dragleave', (e) => {
            if (e.target === this.dragDropOverlay) {
                this.hideDragOverlay();
            }
        });

        // Handle drop (OS files OR resource cards dragged from the resources panel)
        this.dragDropOverlay.addEventListener('drop', (e) => {
            this.preventDefaults(e);
            this.hideDragOverlay();

            // Check for teacher-resource drag from the resources panel
            const resourceId = e.dataTransfer.getData('application/x-teacher-resource-id');
            if (resourceId) {
                const resourceName = e.dataTransfer.getData('application/x-teacher-resource-name') || 'Resource';
                if (typeof fetchAndUploadTeacherResource === 'function') {
                    fetchAndUploadTeacherResource(resourceId, resourceName);
                }
                return;
            }

            const files = [...e.dataTransfer.files];
            if (files.length > 0) {
                this.handleFile(files[0]); // Handle first file
            }
        });
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    showDragOverlay() {
        this.dragDropOverlay.classList.remove('hidden');
    }

    hideDragOverlay() {
        this.dragDropOverlay.classList.add('hidden');
    }

    // ============================================
    // FILE INPUT
    // ============================================

    setupFileInput() {
        if (this.attachButton && this.fileInput) {
            this.attachButton.addEventListener('click', () => {
                this.fileInput.click();
            });

            this.fileInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    this.handleFile(files[0]);
                }
                // Reset input
                this.fileInput.value = '';
            });
        }
    }

    // ============================================
    // FILE HANDLING
    // ============================================

    async handleFile(file) {
        // Claude-style: Attach immediately, no modal
        this.currentFile = file;

        console.log('[FileUploadManager] handleFile called with:', file.name, file.type);

        // Use existing file handling system from script.js
        if (typeof handleFileUpload === 'function') {
            console.log('[FileUploadManager] Calling handleFileUpload...');
            handleFileUpload([file]);
        } else {
            console.error('[FileUploadManager] ERROR: handleFileUpload function not found on window!');
        }

        // Focus input for user to add optional message
        const userInput = document.getElementById('user-input');
        if (userInput) {
            userInput.focus();
            // Add placeholder hint
            if (!userInput.value.trim()) {
                userInput.placeholder = 'Add a message (optional) or just hit send...';
            }
        }

        console.log('✅ File attached:', file.name);
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ============================================
    // IMAGE PREVIEW
    // ============================================

    async previewImage(file) {
        const img = document.getElementById('preview-image');
        const canvas = document.getElementById('preview-pdf-canvas');
        const pdfNav = document.getElementById('pdf-nav-controls');

        // Hide PDF elements, show image
        canvas.style.display = 'none';
        pdfNav.style.display = 'none';
        img.style.display = 'block';

        // Load image
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ============================================
    // PDF PREVIEW
    // ============================================

    async previewPDF(file) {
        const img = document.getElementById('preview-image');
        const canvas = document.getElementById('preview-pdf-canvas');
        const pdfNav = document.getElementById('pdf-nav-controls');

        // Hide image, show PDF elements
        img.style.display = 'none';
        canvas.style.display = 'block';
        pdfNav.style.display = 'flex';

        try {
            // Lazy load PDF.js library if not already loaded (19MB)
            if (!window.pdfLazyLoader || !window.pdfLazyLoader.isReady()) {
                const loadingMsg = document.createElement('div');
                loadingMsg.textContent = 'Loading PDF viewer...';
                loadingMsg.style.cssText = 'text-align: center; padding: 20px; color: #666;';
                canvas.parentElement.insertBefore(loadingMsg, canvas);

                try {
                    await window.pdfLazyLoader.load();
                    loadingMsg.remove();
                } catch (error) {
                    console.error('Failed to load PDF.js:', error);
                    if (typeof Notify !== 'undefined') {
                        Notify.error('Failed to load PDF viewer. Please refresh and try again.');
                    }
                    return;
                }
            }

            // Load PDF using pdfjs
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            this.currentPdfDoc = await loadingTask.promise;

            const totalPages = this.currentPdfDoc.numPages;
            document.getElementById('pdf-total-pages').textContent = totalPages;

            this.currentPdfPage = 1;
            await this.renderPDFPage(1);

        } catch (error) {
            console.error('Error loading PDF:', error);
            if (typeof Notify !== 'undefined') {
                Notify.error('Failed to load PDF. Please try again.');
            }
        }
    }

    async renderPDFPage(pageNum) {
        if (!this.currentPdfDoc) return;

        const page = await this.currentPdfDoc.getPage(pageNum);
        const canvas = document.getElementById('preview-pdf-canvas');
        const context = canvas.getContext('2d');

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        document.getElementById('pdf-current-page').textContent = pageNum;
        this.currentPdfPage = pageNum;
    }

    // ============================================
    // OCR PROCESSING
    // ============================================

    async processOCR(file) {
        const ocrLoading = document.getElementById('ocr-loading');
        const ocrResults = document.getElementById('ocr-results');
        const extractedTextArea = document.getElementById('ocr-extracted-text');

        // Show loading
        ocrLoading.style.display = 'flex';
        ocrResults.style.display = 'none';

        try {
            // Create form data
            const formData = new FormData();
            formData.append('file', file);

            // Call OCR endpoint
            const response = await csrfFetch('/api/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('OCR processing failed');
            }

            const data = await response.json();

            // Hide loading, show results
            ocrLoading.style.display = 'none';
            ocrResults.style.display = 'block';

            // Display extracted text
            const extractedText = data.extractedText || data.text || 'No text detected';
            extractedTextArea.value = extractedText;

            // Show confidence if available
            if (data.confidence) {
                const confidenceBadge = document.getElementById('ocr-confidence');
                confidenceBadge.textContent = `${Math.round(data.confidence * 100)}% confidence`;
            }

        } catch (error) {
            console.error('OCR error:', error);
            ocrLoading.style.display = 'none';
            ocrResults.style.display = 'block';
            extractedTextArea.value = 'OCR processing failed. You can still send the image for AI analysis.';
        }
    }

    // ============================================
    // MODAL CONTROLS
    // ============================================

    setupModalControls() {
        // Close button
        document.getElementById('close-file-preview')?.addEventListener('click', () => {
            this.closePreviewModal();
        });

        // Cancel button
        document.getElementById('cancel-upload')?.addEventListener('click', () => {
            this.closePreviewModal();
        });

        // Send button
        document.getElementById('send-with-file')?.addEventListener('click', () => {
            this.sendFileToAI();
        });

        // PDF navigation
        document.getElementById('pdf-prev-page')?.addEventListener('click', () => {
            if (this.currentPdfPage > 1) {
                this.renderPDFPage(this.currentPdfPage - 1);
            }
        });

        document.getElementById('pdf-next-page')?.addEventListener('click', () => {
            if (this.currentPdfDoc && this.currentPdfPage < this.currentPdfDoc.numPages) {
                this.renderPDFPage(this.currentPdfPage + 1);
            }
        });
    }

    closePreviewModal() {
        this.filePreviewModal.style.display = 'none';
        this.currentFile = null;
        this.currentPdfDoc = null;
        this.currentPdfPage = 1;

        // Reset displays
        document.getElementById('preview-image').style.display = 'none';
        document.getElementById('preview-pdf-canvas').style.display = 'none';
        document.getElementById('pdf-nav-controls').style.display = 'none';
        document.getElementById('ocr-loading').style.display = 'none';
        document.getElementById('ocr-results').style.display = 'none';
    }

    sendFileToAI() {
        if (!this.currentFile) return;

        // Get extracted text if available
        const extractedText = document.getElementById('ocr-extracted-text').value;

        // Set global attachedFile (from main script.js)
        if (window.attachedFile !== undefined) {
            window.attachedFile = this.currentFile;
        }

        // Show file pill
        if (typeof showFilePill === 'function') {
            showFilePill(this.currentFile.name);
        }

        // Set message input with extracted text or placeholder
        const userInput = document.getElementById('user-input');
        if (userInput && !userInput.value.trim()) {
            if (extractedText && extractedText !== 'OCR processing failed. You can still send the image for AI analysis.') {
                userInput.value = `Can you help me solve this?\n\n${extractedText}`;
            } else {
                userInput.value = 'Can you help me with this problem?';
            }
        }

        // Close modal
        this.closePreviewModal();

        // Focus input
        userInput.focus();
        userInput.select();

        console.log('✅ File attached and ready to send!');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.fileUploadManager = new FileUploadManager();
    });
} else {
    window.fileUploadManager = new FileUploadManager();
}

;
/* --- /js/phone-link.js --- */
/* public/js/phone-link.js
 *
 * Desktop side of "scan with your phone".
 *
 * Flow:
 *   1. Student clicks "Scan with phone" → POST /api/phone-link/create.
 *   2. We show a modal with a QR code + 4-digit PIN, and start polling
 *      /api/phone-link/pending.
 *   3. When the phone has uploaded, we fetch the image bytes, hand them to the
 *      existing file-upload manager (so the photo rides the normal /api/chat
 *      pipeline — worksheet guard, visual gate, moderation all apply), then
 *      tell the server to discard the pairing.
 *
 * This module is self-contained: it injects its own trigger button and modal,
 * so wiring it up is just a <script> include. It no-ops gracefully if the
 * chat surface (#hero-actions / fileUploadManager) isn't present.
 */
(function () {
  'use strict';

  var POLL_MS = 3000;
  var state = { pollTimer: null, expiryTimer: null, expiresAt: null, open: false };

  function fetchFn() { return window.csrfFetch || window.fetch; }

  // ---- Styling (scoped, injected once) ------------------------------------
  function injectStyles() {
    if (document.getElementById('phone-link-styles')) return;
    var css = ''
      + '.pl-overlay{position:fixed;inset:0;background:rgba(26,26,46,.55);display:flex;'
      + 'align-items:center;justify-content:center;z-index:10000;padding:20px;}'
      + '.pl-card{background:#fff;border-radius:18px;max-width:380px;width:100%;padding:26px 24px;'
      + 'text-align:center;box-shadow:0 18px 50px rgba(26,26,46,.3);font-family:inherit;color:#1a1a2e;}'
      + '.pl-card h3{margin:0 0 6px;font-size:1.2rem;}'
      + '.pl-card p{margin:0 0 16px;color:#6b7280;font-size:.9rem;}'
      + '.pl-qr{width:200px;height:200px;margin:6px auto 14px;display:block;border-radius:10px;}'
      + '.pl-pin{font-size:2rem;font-weight:800;letter-spacing:.35em;color:#12B3B3;margin:4px 0 2px;}'
      + '.pl-pin-label{font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;}'
      + '.pl-status{margin-top:16px;font-size:.88rem;color:#6b7280;min-height:1.2em;}'
      + '.pl-status.ok{color:#1f9d57;font-weight:600;}'
      + '.pl-status.err{color:#d64545;}'
      + '.pl-close{margin-top:18px;border:none;background:#eef1f7;color:#1a1a2e;border-radius:10px;'
      + 'padding:11px 18px;font-weight:600;cursor:pointer;width:100%;}'
      + '.pl-trigger i{margin-right:6px;}'
      + '.pl-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#12B3B3;'
      + 'margin-right:6px;animation:pl-pulse 1.2s infinite;}'
      + '@keyframes pl-pulse{0%,100%{opacity:.3}50%{opacity:1}}';
    var style = document.createElement('style');
    style.id = 'phone-link-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Modal --------------------------------------------------------------
  function buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'pl-overlay';
    overlay.id = 'pl-overlay';
    overlay.innerHTML =
      '<div class="pl-card" role="dialog" aria-modal="true" aria-label="Scan with your phone">'
      + '<h3>Scan with your phone</h3>'
      + '<p>Scan this code with your phone\'s camera, then enter the PIN below to send a photo.</p>'
      + '<img class="pl-qr" id="pl-qr" alt="QR code linking to the upload page" />'
      + '<div class="pl-pin-label">PIN</div>'
      + '<div class="pl-pin" id="pl-pin">····</div>'
      + '<div class="pl-status" id="pl-status"><span class="pl-dot"></span>Waiting for your photo…</div>'
      + '<button class="pl-close" id="pl-close">Cancel</button>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.getElementById('pl-close').addEventListener('click', closeModal);
    return overlay;
  }

  function setStatus(text, kind) {
    var el = document.getElementById('pl-status');
    if (!el) return;
    el.className = 'pl-status' + (kind ? ' ' + kind : '');
    el.innerHTML = (kind ? '' : '<span class="pl-dot"></span>') + text;
  }

  function closeModal() {
    stopPolling();
    if (state.expiryTimer) { clearTimeout(state.expiryTimer); state.expiryTimer = null; }
    var overlay = document.getElementById('pl-overlay');
    if (overlay) overlay.remove();
    state.open = false;
  }

  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  // ---- Core flow ----------------------------------------------------------
  async function openModal() {
    if (state.open) return;
    injectStyles();

    try {
      var res = await fetchFn()('/api/phone-link/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: window.currentConversationId || null })
      });
      var data = await res.json();
      if (!res.ok || !data.success) {
        alert((data && data.message) || 'Could not start phone pairing. Please try again.');
        return;
      }

      state.open = true;
      buildModal();
      var qr = document.getElementById('pl-qr');
      if (data.qrDataUrl) qr.src = data.qrDataUrl;
      else qr.replaceWith(linkFallback(data.linkUrl));
      document.getElementById('pl-pin').textContent = data.pin;

      state.expiresAt = new Date(data.expiresAt).getTime();
      scheduleExpiry();
      startPolling();
    } catch (err) {
      console.error('[PhoneLink] create failed', err);
      alert('Could not start phone pairing. Please try again.');
    }
  }

  function linkFallback(url) {
    var a = document.createElement('a');
    a.href = url; a.textContent = 'Open upload link';
    a.style.cssText = 'display:block;margin:10px 0;color:#12B3B3;word-break:break-all;';
    return a;
  }

  function scheduleExpiry() {
    var ms = state.expiresAt - Date.now();
    if (ms <= 0) { onExpired(); return; }
    state.expiryTimer = setTimeout(onExpired, ms);
  }

  function onExpired() {
    stopPolling();
    setStatus('This code expired. Close and try again.', 'err');
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(pollOnce, POLL_MS);
  }

  async function pollOnce() {
    try {
      var res = await fetchFn()('/api/phone-link/pending');
      if (!res.ok) return;
      var data = await res.json();
      var pending = (data && data.pending) || [];
      if (pending.length > 0) {
        stopPolling();
        await deliver(pending[0]);
      }
    } catch (err) {
      // Transient — keep polling.
      console.debug('[PhoneLink] poll error', err && err.message);
    }
  }

  // Pull the uploaded image and feed it into the existing chat upload path.
  async function deliver(item) {
    setStatus('Photo received — adding it to your chat…', 'ok');
    try {
      var res = await fetchFn()('/api/phone-link/image/' + encodeURIComponent(item.id));
      if (!res.ok) throw new Error('image fetch failed');
      var blob = await res.blob();
      var name = item.originalName || 'phone-photo.jpg';
      var file = new File([blob], name, { type: item.mimeType || blob.type || 'image/jpeg' });

      if (window.fileUploadManager && typeof window.fileUploadManager.handleFile === 'function') {
        window.fileUploadManager.handleFile(file);
      } else if (typeof window.handleFileUpload === 'function') {
        window.handleFileUpload([file]);
      } else {
        throw new Error('no upload handler available');
      }

      // Discard the server-side pairing now that we hold the bytes locally.
      fetchFn()('/api/phone-link/consume/' + encodeURIComponent(item.id), { method: 'POST' })
        .catch(function () { /* TTL will reap it anyway */ });

      closeModal();
      if (typeof window.Notify !== 'undefined' && window.Notify.success) {
        window.Notify.success('Photo added from your phone. Add a message or just hit send.');
      }
    } catch (err) {
      console.error('[PhoneLink] deliver failed', err);
      setStatus('Could not load the photo. Please try again.', 'err');
      startPolling();
    }
  }

  // ---- Trigger button -----------------------------------------------------
  function injectTrigger() {
    var host = document.getElementById('hero-actions');
    if (!host || document.getElementById('pl-trigger-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'pl-trigger-btn';
    btn.className = 'hero-action-btn pl-trigger';
    btn.setAttribute('aria-label', 'Scan with your phone');
    btn.innerHTML = '<i class="fas fa-qrcode"></i><span>Scan with phone</span>';
    btn.addEventListener('click', openModal);
    host.appendChild(btn);
  }

  function init() {
    injectTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for explicit wiring / testing.
  window.PhoneLink = { open: openModal, close: closeModal };
})();

;
/* --- /js/theme-toggle.js --- */
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
        return StorageUtils.local.getItem(STORAGE_KEY);
    }

    /**
     * Store theme preference
     * @param {string} theme
     */
    function storePreference(theme) {
        StorageUtils.local.setItem(STORAGE_KEY, theme);
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

        if (stored === 'system') {
            // User explicitly opted to follow the OS setting
            applyTheme(getSystemPreference(), false);
        } else if (THEMES.includes(stored)) {
            // Use stored preference
            applyTheme(stored, false);
        } else {
            // Default: light mode. We intentionally ignore the OS preference here
            // so light is the app default until the user chooses a theme themselves.
            applyTheme('light', false);
        }

        // Listen for system preference changes — only relevant when the user has
        // explicitly chosen to follow the OS ('system'). A brand-new/unset user
        // stays on light regardless of their OS theme.
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (getStoredPreference() === 'system') {
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
