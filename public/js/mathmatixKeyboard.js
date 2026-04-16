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
