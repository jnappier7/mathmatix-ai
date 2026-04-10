/**
 * MATHMATIX CUSTOM KEYBOARD
 *
 * Full custom keyboard for mobile that replaces the native keyboard.
 * Three pages — just like iOS:
 *   ABC → letters (QWERTY)  → types into the contenteditable
 *   123 → numbers, operators → types into the contenteditable
 *   EQ  → math constructions → inserts inline equation boxes (MathLive)
 *
 * The student always sees what they're typing in the same full-width
 * "Ask a math question..." input. No mode switch, no separate field.
 *
 * @module mathmatixKeyboard
 */
(function () {
  'use strict';

  // ─── STATE ──────────────────────────────────────────────────────────
  let textInput = null;       // The contenteditable #user-input
  let keyboardEl = null;      // The keyboard container DOM element
  let currentPage = 'abc';    // 'abc' | '123' | 'eq' | 'symbols'
  let shifted = false;        // Shift state for ABC page
  let capsLock = false;       // Caps lock state
  let sendCallback = null;    // Function to call on send
  let initialized = false;

  // ─── KEYBOARD LAYOUTS ───────────────────────────────────────────────

  const LAYOUTS = {
    abc: {
      rows: [
        ['q','w','e','r','t','y','u','i','o','p'],
        ['a','s','d','f','g','h','j','k','l'],
        ['⇧','z','x','c','v','b','n','m','⌫'],
        ['123','EQ','space','.',',','↵']
      ]
    },
    '123': {
      rows: [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['-','/',':',';','(',')','$','&','@','"'],
        ['#+=' , '.', ',', '?', '!', "'", '⌫'],
        ['ABC','EQ','space','.',',','↵']
      ]
    },
    symbols: {
      rows: [
        ['[',']','{','}','#','%','^','*','+','='],
        ['_','\\','|','~','<','>','€','£','¥','•'],
        ['123','.',',','?','!','"','⌫'],
        ['ABC','EQ','space','.',',','↵']
      ]
    },
    eq: {
      rows: [
        [
          { label: '<span class="k-frac">⁄</span>', latex: '\\frac{#0}{#1}', hint: 'Frac', wide: false },
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
          { label: 'ABC', action: 'abc' },
          { label: '123', action: '123' },
          { label: '↵', action: 'enter', wide: true },
        ]
      ]
    }
  };

  // ─── INITIALIZATION ─────────────────────────────────────────────────

  /**
   * Initialize the custom keyboard.
   * @param {Object} opts
   * @param {HTMLElement} opts.textInput - The contenteditable #user-input
   * @param {HTMLElement} opts.container - Where to mount the keyboard
   * @param {Function} opts.onSend - Callback when enter/send pressed
   */
  function init(opts) {
    if (initialized) return;
    if (window.innerWidth > 768) return;

    textInput = opts.textInput;
    sendCallback = opts.onSend;

    if (!textInput) return;

    // ─── PERSISTENT MODE CLASS ──────────────────────────────────────
    document.body.classList.add('mx-keyboard-mode');

    // Build the keyboard DOM
    keyboardEl = buildKeyboard();
    opts.container.appendChild(keyboardEl);

    // ─── NATIVE KEYBOARD SUPPRESSION ────────────────────────────────
    suppressNativeKeyboard();

    // Show keyboard when contenteditable gets focus
    textInput.addEventListener('focus', () => {
      suppressNativeKeyboard();
      show();
    });

    // Also show keyboard when contenteditable is tapped (even if already focused)
    textInput.addEventListener('touchstart', () => {
      suppressNativeKeyboard();
      show();
    });

    // Show keyboard when ANY math-field inside the contenteditable gets focus
    // (inline equation boxes create math-fields that steal focus from textInput)
    textInput.addEventListener('focusin', (e) => {
      if (e.target.tagName === 'MATH-FIELD' || e.target.closest('math-field')) {
        suppressNativeKeyboard();
        // Also suppress on the math-field itself
        const mf = e.target.tagName === 'MATH-FIELD' ? e.target : e.target.closest('math-field');
        if (mf) {
          mf.setAttribute('inputmode', 'none');
          mf.mathVirtualKeyboardPolicy = 'manual';
          try {
            const shadow = mf.shadowRoot;
            if (shadow) {
              const ta = shadow.querySelector('textarea');
              if (ta) ta.setAttribute('inputmode', 'none');
            }
          } catch (_) {}
        }
        show();
      }
    });

    // Show keyboard when the entire compose bar is tapped
    const composeBar = textInput.closest('.imessage-compose-bar') || textInput.closest('.imessage-input-row');
    if (composeBar) {
      composeBar.addEventListener('touchstart', (e) => {
        // Don't intercept button taps (send, mic, etc.)
        if (e.target.closest('button') && !e.target.closest('#user-input')) return;
        show();
      });
    }

    // Re-suppress after orientation change or app-switch-back
    window.addEventListener('orientationchange', () => {
      setTimeout(suppressNativeKeyboard, 300);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isVisible()) {
        suppressNativeKeyboard();
      }
    });

    // ─── KEYBOARD HEIGHT → CSS VARIABLE ─────────────────────────────
    requestAnimationFrame(() => {
      updateKeyboardHeightVar();
    });

    switchPage('abc');
    initialized = true;

    console.log('[MathmatixKeyboard] Initialized on mobile');
  }

  /** Suppress native keyboard on the contenteditable */
  function suppressNativeKeyboard() {
    if (!textInput) return;
    textInput.setAttribute('inputmode', 'none');
    // Prevent any MathLive virtual keyboard from popping up
    if (window.mathVirtualKeyboard) {
      try { window.mathVirtualKeyboard.visible = false; } catch (_) {}
    }
  }

  /** Measure keyboard and set --mx-kb-height on <body> */
  function updateKeyboardHeightVar() {
    if (!keyboardEl) return;
    const h = keyboardEl.offsetHeight;
    if (h > 0) {
      document.body.style.setProperty('--mx-kb-height', h + 'px');
    }
  }

  // ─── CONTENTEDITABLE TEXT INSERTION ──────────────────────────────────

  /** Ensure the contenteditable has focus and cursor is at end if needed */
  function ensureFocus() {
    if (!textInput) return;
    if (document.activeElement !== textInput) {
      textInput.focus();
    }
    // If there's no selection inside textInput, place cursor at end
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !textInput.contains(sel.anchorNode)) {
      placeCursorAtEnd();
    }
  }

  /** Place cursor at end of contenteditable */
  function placeCursorAtEnd() {
    const range = document.createRange();
    range.selectNodeContents(textInput);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Insert a character at the current cursor position in contenteditable */
  function insertChar(char) {
    ensureFocus();
    // execCommand('insertText') is the most reliable way to insert
    // into contenteditable, respecting cursor position and undo stack.
    document.execCommand('insertText', false, char);
  }

  /** Delete one character backward in contenteditable */
  function deleteBackward() {
    ensureFocus();

    // If there's an active inline equation box, delete from it
    const activeEqField = getActiveEquationMathField();
    if (activeEqField) {
      const val = (activeEqField.value || '').trim();
      if (val === '') {
        // Equation box is empty — remove the entire box
        const box = activeEqField.closest('.inline-eq-box');
        if (box) {
          box.remove();
          ensureFocus();
        }
      } else {
        activeEqField.executeCommand('deleteBackward');
      }
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    if (!range.collapsed) {
      // Selection exists — delete it
      document.execCommand('delete', false);
      return;
    }

    // Check if cursor is right after an inline equation box
    const node = range.startContainer;
    const offset = range.startOffset;

    if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
      const prev = node.childNodes[offset - 1];
      if (prev && prev.classList && prev.classList.contains('inline-eq-box')) {
        prev.remove();
        return;
      }
    } else if (node.nodeType === Node.TEXT_NODE && offset === 0) {
      const prev = node.previousSibling;
      if (prev && prev.classList && prev.classList.contains('inline-eq-box')) {
        prev.remove();
        return;
      }
    }

    // Normal backspace
    document.execCommand('delete', false);
  }

  // ─── EQUATION BOX HELPERS ───────────────────────────────────────────

  /** Get the currently active inline equation box's math-field (if any) */
  function getActiveEquationMathField() {
    if (window.InlineEquationBox) {
      return window.InlineEquationBox.getActiveMathField();
    }
    return null;
  }

  /**
   * Insert an inline equation box at cursor, optionally pre-filled
   * with LaTeX. Uses the InlineEquationBox module.
   */
  function insertEquationWithLatex(latex) {
    if (!window.InlineEquationBox) return;

    // Insert a fresh equation box at cursor
    window.InlineEquationBox.insertEquationBoxAtCursor();

    // If we have LaTeX to pre-fill, wait for the math-field to initialize
    // then insert the LaTeX
    if (latex) {
      setTimeout(() => {
        const mf = window.InlineEquationBox.getActiveMathField();
        if (mf) {
          mf.executeCommand(['insert', latex]);
          mf.focus();
          // Suppress native keyboard on this math-field too
          mf.setAttribute('inputmode', 'none');
          if (mf.shadowRoot) {
            const ta = mf.shadowRoot.querySelector('textarea');
            if (ta) ta.setAttribute('inputmode', 'none');
          }
        }
      }, 80);
    }
  }

  // ─── KEYBOARD CONSTRUCTION ──────────────────────────────────────────

  function buildKeyboard() {
    const kb = document.createElement('div');
    kb.id = 'mx-keyboard';
    kb.className = 'mx-keyboard';

    kb.appendChild(buildPage('abc'));
    kb.appendChild(buildPage('123'));
    kb.appendChild(buildPage('symbols'));
    kb.appendChild(buildPage('eq'));

    // Event delegation for all key presses
    kb.addEventListener('touchstart', handleKeyTouch, { passive: false });
    kb.addEventListener('mousedown', handleKeyMouse);

    return kb;
  }

  function buildPage(pageName) {
    const page = document.createElement('div');
    page.className = 'mx-kb-page';
    page.dataset.page = pageName;
    page.style.display = 'none';

    const layout = LAYOUTS[pageName];

    layout.rows.forEach((row, rowIdx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'mx-kb-row';

      if (rowIdx === layout.rows.length - 1) {
        rowEl.classList.add('mx-kb-row-bottom');
      }

      row.forEach(keyDef => {
        const key = buildKey(keyDef, pageName);
        rowEl.appendChild(key);
      });

      page.appendChild(rowEl);
    });

    return page;
  }

  function buildKey(keyDef, pageName) {
    const btn = document.createElement('button');
    btn.className = 'mx-key';
    // Prevent button from stealing focus from contenteditable
    btn.setAttribute('tabindex', '-1');

    // EQ page has object definitions
    if (typeof keyDef === 'object') {
      btn.innerHTML = keyDef.label;
      if (keyDef.hint) {
        btn.innerHTML += `<span class="mx-key-hint">${keyDef.hint}</span>`;
      }
      if (keyDef.latex) {
        btn.dataset.latex = keyDef.latex;
      }
      if (keyDef.action) {
        btn.dataset.action = keyDef.action;
      }
      if (keyDef.wide) {
        btn.classList.add('mx-key-wide');
      }
      btn.classList.add('mx-key-eq');
      return btn;
    }

    // String definitions (ABC, 123 pages)
    const label = keyDef;
    btn.dataset.key = label;

    switch (label) {
      case 'space':
        btn.textContent = '';
        btn.classList.add('mx-key-space');
        btn.dataset.action = 'space';
        break;
      case '⇧':
        btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        btn.classList.add('mx-key-shift');
        btn.dataset.action = 'shift';
        break;
      case '⌫':
        btn.innerHTML = '<i class="fas fa-delete-left"></i>';
        btn.classList.add('mx-key-delete');
        btn.dataset.action = 'delete';
        break;
      case '↵':
        btn.innerHTML = '<i class="fas fa-arrow-turn-down fa-flip-horizontal"></i>';
        btn.classList.add('mx-key-enter');
        btn.dataset.action = 'enter';
        break;
      case 'ABC':
        btn.textContent = 'ABC';
        btn.classList.add('mx-key-mode');
        btn.dataset.action = 'abc';
        break;
      case '123':
        btn.textContent = '123';
        btn.classList.add('mx-key-mode');
        btn.dataset.action = '123';
        break;
      case 'EQ':
        btn.textContent = 'EQ';
        btn.classList.add('mx-key-mode', 'mx-key-eq-switch');
        btn.dataset.action = 'eq';
        break;
      case '#+=':
        btn.textContent = '#+=';
        btn.classList.add('mx-key-mode');
        btn.dataset.action = 'symbols';
        break;
      default:
        btn.textContent = label;
        btn.dataset.insert = label;
        break;
    }

    return btn;
  }

  // ─── KEY HANDLING ───────────────────────────────────────────────────

  function handleKeyTouch(e) {
    const key = e.target.closest('.mx-key');
    if (!key) return;
    e.preventDefault(); // Prevent native keyboard + focus steal

    key.classList.add('mx-key-pressed');
    setTimeout(() => key.classList.remove('mx-key-pressed'), 120);

    processKey(key);
  }

  function handleKeyMouse(e) {
    const key = e.target.closest('.mx-key');
    if (!key) return;
    e.preventDefault();

    key.classList.add('mx-key-pressed');
    setTimeout(() => key.classList.remove('mx-key-pressed'), 120);

    processKey(key);
  }

  function processKey(key) {
    if (!textInput) return;

    const action = key.dataset.action;
    const latex = key.dataset.latex;
    const insert = key.dataset.insert;

    // ─── ACTION KEYS ────────────────────────────────────────────────
    if (action) {
      switch (action) {
        case 'abc':
          switchPage('abc');
          break;
        case '123':
          switchPage('123');
          break;
        case 'eq':
          switchPage('eq');
          break;
        case 'symbols':
          switchPage('symbols');
          break;
        case 'shift':
          toggleShift();
          break;
        case 'delete':
          deleteBackward();
          break;
        case 'space': {
          // If inside an inline equation box, insert space there
          const eqField = getActiveEquationMathField();
          if (eqField) {
            eqField.executeCommand(['insert', ' ']);
          } else {
            insertChar(' ');
          }
          break;
        }
        case 'enter':
          if (sendCallback) sendCallback();
          break;
      }
      return;
    }

    // ─── LATEX INSERTION (EQ page) ──────────────────────────────────
    if (latex) {
      // Check if there's an active inline equation box — insert there
      const activeField = getActiveEquationMathField();
      if (activeField) {
        activeField.executeCommand(['insert', latex]);
        activeField.focus();
      } else {
        // No active equation box — create one with this LaTeX
        insertEquationWithLatex(latex);
      }
      return;
    }

    // ─── CHARACTER INSERTION (ABC / 123 pages) ──────────────────────
    if (insert) {
      let char = insert;
      if (shifted || capsLock) {
        char = char.toUpperCase();
      }

      // If inside an active equation box, type there
      const eqField = getActiveEquationMathField();
      if (eqField) {
        eqField.executeCommand(['typedText', char]);
      } else {
        // Type into the contenteditable
        insertChar(char);
      }

      // Auto-unshift after one character (unless caps lock)
      if (shifted && !capsLock) {
        shifted = false;
        updateShiftDisplay();
      }
    }
  }

  // ─── PAGE SWITCHING ─────────────────────────────────────────────────

  function switchPage(pageName) {
    currentPage = pageName;
    if (!keyboardEl) return;

    keyboardEl.querySelectorAll('.mx-kb-page').forEach(p => {
      p.style.display = p.dataset.page === pageName ? '' : 'none';
    });

    keyboardEl.querySelectorAll('.mx-key-mode, .mx-key-eq-switch').forEach(k => {
      k.classList.toggle('mx-key-active', k.dataset.action === pageName);
    });

    // Re-measure height (EQ page may be taller)
    setTimeout(updateKeyboardHeightVar, 50);
  }

  // ─── SHIFT ──────────────────────────────────────────────────────────

  function toggleShift() {
    if (!shifted) {
      shifted = true;
      capsLock = false;
    } else if (shifted && !capsLock) {
      capsLock = true;
    } else {
      shifted = false;
      capsLock = false;
    }
    updateShiftDisplay();
  }

  function updateShiftDisplay() {
    if (!keyboardEl) return;

    const shiftKeys = keyboardEl.querySelectorAll('[data-action="shift"]');
    shiftKeys.forEach(k => {
      k.classList.toggle('mx-key-shift-active', shifted);
      k.classList.toggle('mx-key-caps-lock', capsLock);
    });

    const abcPage = keyboardEl.querySelector('[data-page="abc"]');
    if (abcPage) {
      abcPage.querySelectorAll('[data-insert]').forEach(k => {
        const base = k.dataset.insert;
        if (base.length === 1 && base.match(/[a-z]/)) {
          k.textContent = (shifted || capsLock) ? base.toUpperCase() : base;
        }
      });
    }
  }

  // ─── SHOW / HIDE ───────────────────────────────────────────────────

  function show() {
    if (!keyboardEl) {
      console.warn('[MathmatixKeyboard] show() called but keyboardEl is null');
      return;
    }
    const wasVisible = keyboardEl.classList.contains('mx-keyboard-visible');
    keyboardEl.classList.add('mx-keyboard-visible');
    document.body.classList.add('mx-keyboard-active');
    suppressNativeKeyboard();
    if (!wasVisible) {
      // Only measure and scroll on first show, not every focus
      setTimeout(updateKeyboardHeightVar, 280);
      const chat = document.getElementById('chat-messages-container');
      if (chat) {
        requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
      }
    }
  }

  function hide() {
    if (!keyboardEl) return;
    keyboardEl.classList.remove('mx-keyboard-visible');
    document.body.classList.remove('mx-keyboard-active');
  }

  function isVisible() {
    return keyboardEl && keyboardEl.classList.contains('mx-keyboard-visible');
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────

  window.MathmatixKeyboard = {
    init,
    show,
    hide,
    isVisible,
    switchPage,
    getInput: () => textInput,
  };
})();
