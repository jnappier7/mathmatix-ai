/**
 * conceptModelTokenRenderer.js — the DISCRETE substrate for WorkBoard concept
 * models (CONCEPT_MODELS.md: "two rendering engines, one spec").
 *
 * Where conceptModelRenderer.js draws continuous geometry with JSXGraph, this
 * draws discrete, draggable CHIPS for integer/algebra-tile reasoning — inline in
 * a board card, summoned with intent, not the heavyweight algebra-tiles.js modal.
 *
 * The flagship is `integer_counters`: type an expression -> chips appear (yellow
 * = +1, red = −1) -> drag a red onto a yellow to make a ZERO PAIR (they cancel)
 * -> what's left is the answer. The keystone "measure, never assert" property
 * holds here too: the Sum readout is COMPUTED from the chips on the mat, never
 * typed — and it stays the same as zero pairs cancel, which is the whole point.
 *
 * All correctness/structure lives in window.ConceptModelSpec (pure, tested): the
 * validator, and expandIntegerExpression (the expression -> chip-count math).
 * This file only draws and wires the drag-to-cancel interaction. No external
 * deps — no JSXGraph, no network.
 */
(function () {
  'use strict';

  var CHIP = 38;          // chip diameter (px)
  var GAP = 8;            // gap between chips in the spawn layout
  var ANNIHILATE_DIST = 30; // center-to-center px to count as a zero-pair overlap

  // Spec colors -> {bg, border, text}. Falls back to using the literal color.
  var COLORS = {
    yellow: { bg: '#FFD24A', border: '#E0A800', text: '#5a4500' },
    red: { bg: '#FF6B6B', border: '#E04C4C', text: '#5a0000' }
  };

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function signedInt(n) {
    if (!isFinite(n)) return '—';
    n = Math.round(n);
    return n > 0 ? '+' + n : String(n); // +3, 0, -2
  }

  function render(container, spec, opts) {
    opts = opts || {};
    if (!container) return false;
    var CMS = window.ConceptModelSpec;
    if (CMS && CMS.validateModelSpec) {
      var check = CMS.validateModelSpec(spec);
      if (!check.valid) {
        container.textContent = "Couldn't build that model.";
        if (window.console) console.warn('[ConceptModelToken] invalid spec', spec.model, check.errors);
        return false;
      }
    }
    container.innerHTML = '';

    // Chip TYPES from the spec (value + color + label). For integer counters
    // there are two: +1 (yellow) and −1 (red).
    var tokens = spec.tokens || [];
    var posType = tokens.filter(function (t) { return t.value > 0; })[0] || null;
    var negType = tokens.filter(function (t) { return t.value < 0; })[0] || null;
    var maxTokens = (CMS && CMS.MAX_TOKENS) || 60;

    // ── DOM scaffold ────────────────────────────────────────────────────────
    var root = el('div', 'cr-cm cr-cm--tokens');
    if (spec.title) { var t = el('div', 'cr-cm-title'); t.textContent = spec.title; root.appendChild(t); }
    var promptText = opts.prompt || spec.prompt;
    if (promptText) { var pf = el('div', 'cr-cm-prompt'); pf.textContent = promptText; root.appendChild(pf); }

    var readoutRow = el('div', 'cr-cm-readouts');
    var readoutHost = el('div', 'cr-cm-readout');
    var readoutMath = el('span', 'cr-cm-readout-math');
    readoutHost.appendChild(readoutMath);
    readoutRow.appendChild(readoutHost);
    root.appendChild(readoutRow);

    var mat = el('div', 'cr-cm-mat');
    root.appendChild(mat);

    var inputRow = null, inputField = null;
    if (spec.input) {
      inputRow = el('div', 'cr-cm-token-input');
      inputField = document.createElement('input');
      inputField.type = 'text';
      inputField.className = 'cr-cm-token-field';
      inputField.placeholder = spec.input.placeholder || 'e.g. -7 + 10';
      inputField.setAttribute('aria-label', 'expression to build with counters');
      var buildBtn = el('button', 'cr-cm-choice-btn cr-cm-token-build');
      buildBtn.type = 'button'; buildBtn.textContent = 'Build';
      var clearBtn = el('button', 'cr-cm-choice-btn cr-cm-token-clear');
      clearBtn.type = 'button'; clearBtn.textContent = 'Clear';
      inputRow.appendChild(inputField);
      inputRow.appendChild(buildBtn);
      inputRow.appendChild(clearBtn);
      root.appendChild(inputRow);

      buildBtn.addEventListener('click', buildFromInput);
      clearBtn.addEventListener('click', function () { clearChips(); renderReadout(); });
      inputField.addEventListener('keydown', function (e) { if (e.key === 'Enter') buildFromInput(); });
    }

    container.appendChild(root);

    // ── chip state + the live measure ─────────────────────────────────────────
    var chips = [];      // { id, value, el, x, y }
    var chipId = 0;
    var hasAnnihilate = (spec.rules || []).some(function (r) {
      return r.when === 'overlap-opposite' && r.do === 'annihilate';
    });

    function net() { return chips.reduce(function (s, c) { return s + c.value; }, 0); }

    function renderReadout() {
      var template = (spec.readout && spec.readout.text) || 'Sum: {net}';
      var fmt = spec.readout && spec.readout.format;
      var n = net();
      readoutMath.textContent = template.replace(/\{net\}/g, fmt === 'signedInt' ? signedInt(n) : String(Math.round(n)));
    }

    function colorOf(type) { return COLORS[type.color] || { bg: type.color, border: '#0003', text: '#000' }; }

    function clearChips() {
      chips.forEach(function (c) { if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el); });
      chips = [];
    }

    function matWidth() { return mat.clientWidth || 320; }

    function addChip(type, x, y) {
      var c = colorOf(type);
      var node = el('div', 'cr-cm-chip');
      node.style.width = node.style.height = CHIP + 'px';
      node.style.background = c.bg;
      node.style.borderColor = c.border;
      node.style.color = c.text;
      node.textContent = type.label != null ? type.label : (type.value > 0 ? '+' : '−');
      node.style.left = x + 'px';
      node.style.top = y + 'px';
      mat.appendChild(node);
      var chip = { id: ++chipId, value: type.value, el: node, x: x, y: y };
      chips.push(chip);
      attachDrag(chip);
      return chip;
    }

    // Lay a count of one chip type out in a row-major grid, starting at (x0,y0).
    function layout(count, type, x0, y0) {
      var cols = Math.max(1, Math.floor((matWidth() - GAP) / (CHIP + GAP)));
      for (var i = 0; i < count; i++) {
        var col = i % cols, rowi = Math.floor(i / cols);
        addChip(type, x0 + col * (CHIP + GAP), y0 + rowi * (CHIP + GAP));
      }
    }

    function spawn(positives, negatives) {
      clearChips();
      // Yellows in the top band; reds in a lower band — so the two stacks read as
      // separate quantities before the student starts cancelling.
      if (posType) layout(positives, posType, GAP, GAP);
      var posRows = posType ? Math.ceil(positives / Math.max(1, Math.floor((matWidth() - GAP) / (CHIP + GAP)))) : 0;
      var redY = GAP + posRows * (CHIP + GAP) + GAP;
      if (negType) layout(negatives, negType, GAP, redY);
      renderReadout();
    }

    function buildFromInput() {
      if (!inputField) return;
      var parsed = CMS && CMS.expandIntegerExpression(inputField.value);
      if (!parsed) { flashInvalid(); return; }
      if (parsed.positives + parsed.negatives > maxTokens) { flashInvalid('Too many counters — try smaller numbers.'); return; }
      spawn(parsed.positives, parsed.negatives);
    }

    function flashInvalid(msg) {
      inputField.classList.add('is-invalid');
      inputField.title = msg || 'Enter integers to add/subtract, e.g. -7 + 10';
      setTimeout(function () { inputField.classList.remove('is-invalid'); }, 800);
    }

    // ── drag-to-cancel (the zero-pair interaction) ────────────────────────────
    function attachDrag(chip) {
      var node = chip.el;
      var startX, startY, originX, originY, dragging = false;
      node.addEventListener('pointerdown', function (e) {
        dragging = true;
        node.classList.add('is-dragging');
        node.setPointerCapture(e.pointerId);
        startX = e.clientX; startY = e.clientY;
        originX = chip.x; originY = chip.y;
        e.preventDefault();
      });
      node.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var w = matWidth(), h = mat.clientHeight || 220;
        chip.x = Math.max(0, Math.min(w - CHIP, originX + (e.clientX - startX)));
        chip.y = Math.max(0, Math.min(h - CHIP, originY + (e.clientY - startY)));
        node.style.left = chip.x + 'px';
        node.style.top = chip.y + 'px';
      });
      function end() {
        if (!dragging) return;
        dragging = false;
        node.classList.remove('is-dragging');
        if (hasAnnihilate) tryAnnihilate(chip);
      }
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
    }

    // If `chip` overlaps an OPPOSITE-sign chip, the two make a zero pair and
    // cancel. The Sum is unchanged by this (it removes +1 and −1 together) — the
    // chips just collapse toward the answer.
    function tryAnnihilate(chip) {
      var partner = null, best = ANNIHILATE_DIST;
      for (var i = 0; i < chips.length; i++) {
        var o = chips[i];
        if (o === chip || (o.value > 0) === (chip.value > 0)) continue; // same sign
        var dx = (o.x - chip.x), dy = (o.y - chip.y);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) { best = d; partner = o; }
      }
      if (partner) { removeChip(chip); removeChip(partner); renderReadout(); }
    }

    function removeChip(chip) {
      var i = chips.indexOf(chip);
      if (i !== -1) chips.splice(i, 1);
      if (chip.el && chip.el.parentNode) chip.el.parentNode.removeChild(chip.el);
    }

    // ── initial paint ─────────────────────────────────────────────────────────
    // Start populated from the placeholder so the model is alive on arrival
    // (like the slider models start with a line drawn).
    var seed = spec.input && spec.input.placeholder;
    var seedParsed = seed && CMS && CMS.expandIntegerExpression(seed);
    if (seedParsed && seedParsed.positives + seedParsed.negatives <= maxTokens) {
      if (inputField) inputField.value = seed;
      // Defer one frame so mat.clientWidth is known for the grid layout.
      requestAnimationFrame(function () { spawn(seedParsed.positives, seedParsed.negatives); });
    }
    renderReadout();
    return true;
  }

  if (typeof window !== 'undefined') {
    window.ConceptModelTokenRenderer = { render: render };
  }
})();
