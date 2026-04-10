/**
 * MATHMATIX CUSTOM KEYBOARD
 *
 * Full custom keyboard for mobile that replaces the native keyboard.
 * Three pages — just like iOS:
 *   ABC → letters (QWERTY)
 *   123 → numbers, basic operators
 *   EQ  → math constructions, Greek, symbols
 *
 * Feeds into a MathLive math-field that renders everything live.
 * The student always sees what they're typing. No mode switch.
 *
 * @module mathmatixKeyboard
 */
(function () {
  'use strict';

  // ─── STATE ──────────────────────────────────────────────────────────
  let mathField = null;       // The MathLive <math-field> compose input
  let textInput = null;       // The original contenteditable (fallback/desktop)
  let keyboardEl = null;      // The keyboard container DOM element
  let currentPage = 'abc';    // 'abc' | '123' | 'eq'
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
   * @param {HTMLElement} opts.mathField - MathLive math-field element
   * @param {HTMLElement} opts.textInput - Original contenteditable (for desktop fallback)
   * @param {HTMLElement} opts.container - Where to mount the keyboard
   * @param {Function} opts.onSend - Callback when enter/send pressed
   */
  function init(opts) {
    if (initialized) return;
    // Only activate on mobile
    if (window.innerWidth > 768) return;

    mathField = opts.mathField;
    textInput = opts.textInput;
    sendCallback = opts.onSend;

    if (!mathField) return;

    // ─── PERSISTENT MODE CLASS ──────────────────────────────────────
    // This class stays on for the entire session. CSS uses it to
    // force-hide the old contenteditable (#user-input) with !important,
    // so no other script can accidentally re-show it.
    document.body.classList.add('mx-keyboard-mode');

    // Build the keyboard DOM
    keyboardEl = buildKeyboard();
    opts.container.appendChild(keyboardEl);

    // ─── REDIRECT FOCUS FROM OLD INPUT ──────────────────────────────
    // Many scripts call userInput.focus(). Intercept and redirect to
    // our math-field so the old contenteditable never gets focused.
    if (textInput) {
      textInput.addEventListener('focus', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mathField.focus();
      }, true);
      // Also make it inert so it truly cannot receive focus
      textInput.setAttribute('tabindex', '-1');
      textInput.setAttribute('contenteditable', 'false');
    }

    // ─── NATIVE KEYBOARD SUPPRESSION (multiple layers) ──────────────
    suppressNativeKeyboard();

    // Re-suppress on every focus
    mathField.addEventListener('focus', () => {
      suppressNativeKeyboard();
      show();
    });

    // MathLive may try to show its virtual keyboard — intercept
    if (window.mathVirtualKeyboard) {
      try {
        Object.defineProperty(window.mathVirtualKeyboard, 'visible', {
          get: () => false,
          set: () => {},       // silently swallow
          configurable: true,
        });
      } catch (_) { /* non-critical */ }
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

    // Show ABC page by default
    switchPage('abc');
    initialized = true;
  }

  /**
   * Apply every suppression trick we have. Called on init, focus, resume.
   *
   * iOS Safari ignores `inputmode="none"` on the outer <math-field>
   * custom element because MathLive creates its own <textarea> inside
   * a shadow DOM for actual text entry. We must find that inner
   * textarea and suppress it directly.
   */
  function suppressNativeKeyboard() {
    if (!mathField) return;

    // 1. Outer element attributes
    mathField.setAttribute('inputmode', 'none');
    mathField.mathVirtualKeyboardPolicy = 'manual';

    // 2. Kill MathLive's global virtual keyboard
    if (window.mathVirtualKeyboard) {
      try { window.mathVirtualKeyboard.visible = false; } catch (_) {}
    }

    // 3. Dive into MathLive's shadow DOM and suppress the internal textarea.
    //    This is the key fix for iOS Safari.
    try {
      const shadow = mathField.shadowRoot;
      if (shadow) {
        const innerTextarea = shadow.querySelector('textarea');
        if (innerTextarea) {
          innerTextarea.setAttribute('inputmode', 'none');
          innerTextarea.setAttribute('readonly', 'readonly');
          // Remove readonly after a tick so programmatic input still works
          // but the native keyboard never gets a chance to appear
          setTimeout(() => {
            innerTextarea.removeAttribute('readonly');
            // Re-apply inputmode in case the browser cleared it
            innerTextarea.setAttribute('inputmode', 'none');
          }, 50);
        }
      }
    } catch (_) { /* Shadow DOM access may fail in some browsers */ }

    // 4. Outer readonly trick as a fallback
    mathField.setAttribute('readonly', 'readonly');
    setTimeout(() => mathField.removeAttribute('readonly'), 20);
  }

  /** Measure keyboard and set --mx-kb-height on <body> */
  function updateKeyboardHeightVar() {
    if (!keyboardEl) return;
    const h = keyboardEl.offsetHeight;
    if (h > 0) {
      document.body.style.setProperty('--mx-kb-height', h + 'px');
    }
  }

  // ─── KEYBOARD CONSTRUCTION ──────────────────────────────────────────

  function buildKeyboard() {
    const kb = document.createElement('div');
    kb.id = 'mx-keyboard';
    kb.className = 'mx-keyboard';

    // Build all pages
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

      // Last row gets special class for bottom spacing
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
    e.preventDefault(); // Prevent native keyboard from showing

    // Visual feedback
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
    if (!mathField) return;

    const action = key.dataset.action;
    const latex = key.dataset.latex;
    const insert = key.dataset.insert;

    // Action keys
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
          mathField.executeCommand('deleteBackward');
          break;
        case 'space':
          mathField.executeCommand(['insert', ' ']);
          break;
        case 'enter':
          if (sendCallback) sendCallback();
          break;
      }
      mathField.focus();
      return;
    }

    // LaTeX insertion (EQ page)
    if (latex) {
      mathField.executeCommand(['insert', latex]);
      mathField.focus();
      return;
    }

    // Character insertion (ABC / 123 pages)
    if (insert) {
      let char = insert;
      if (shifted || capsLock) {
        char = char.toUpperCase();
      }
      // In MathLive, use typedText for regular text entry
      mathField.executeCommand(['typedText', char]);

      // Auto-unshift after one character (unless caps lock)
      if (shifted && !capsLock) {
        shifted = false;
        updateShiftDisplay();
      }

      mathField.focus();
    }
  }

  // ─── PAGE SWITCHING ─────────────────────────────────────────────────

  function switchPage(pageName) {
    currentPage = pageName;
    if (!keyboardEl) return;

    keyboardEl.querySelectorAll('.mx-kb-page').forEach(p => {
      p.style.display = p.dataset.page === pageName ? '' : 'none';
    });

    // Update active state on mode keys
    keyboardEl.querySelectorAll('.mx-key-mode, .mx-key-eq-switch').forEach(k => {
      k.classList.toggle('mx-key-active', k.dataset.action === pageName);
    });
  }

  // ─── SHIFT ──────────────────────────────────────────────────────────

  function toggleShift() {
    if (!shifted) {
      shifted = true;
      capsLock = false;
    } else if (shifted && !capsLock) {
      // Double-tap shift = caps lock
      capsLock = true;
    } else {
      shifted = false;
      capsLock = false;
    }
    updateShiftDisplay();
  }

  function updateShiftDisplay() {
    if (!keyboardEl) return;

    // Update shift key appearance
    const shiftKeys = keyboardEl.querySelectorAll('[data-action="shift"]');
    shiftKeys.forEach(k => {
      k.classList.toggle('mx-key-shift-active', shifted);
      k.classList.toggle('mx-key-caps-lock', capsLock);
    });

    // Update letter key labels
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
    if (!keyboardEl) return;
    keyboardEl.classList.add('mx-keyboard-visible');
    document.body.classList.add('mx-keyboard-active');
    suppressNativeKeyboard();
    // After slide-in animation, re-measure height (may differ by page)
    setTimeout(updateKeyboardHeightVar, 280);
    // Scroll chat to bottom so the latest message is visible
    const chat = document.getElementById('chat-messages-container');
    if (chat) {
      requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
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
    getField: () => mathField,
  };
})();
