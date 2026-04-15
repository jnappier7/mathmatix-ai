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

    // Click handler for re-entering existing equation boxes
    inputEl.addEventListener('click', handleEquationBoxClick);

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
      // Also suppress the internal textarea in MathLive's shadow DOM
      // (Chrome/Safari may ignore inputmode on the outer custom element)
      try {
        const shadow = mathField.shadowRoot;
        if (shadow) {
          const ta = shadow.querySelector('textarea');
          if (ta) ta.setAttribute('inputmode', 'none');
        }
      } catch (_) {}
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
