/* ============================================================
   equationElement.js — the equation element (spec §P4, "the spine").

   A DOM card rendered in the OverlayManager layer:
     • BODY typesets `semantic.latex` with KaTeX (crisp at any zoom —
       it's DOM text scaled by CSS transform, never a raster).
     • Editing swaps the body for a MathLive <math-field>; committing
       writes latex back through onEditCommit → the registry → snapshot,
       so a reload restores it.
     • HEADER is the reposition handle (data-role) so dragging the card
       moves it while dragging/typing in the body does NOT — the
       "editing doesn't drag the canvas" rule. (The InteractionController
       binds the actual drag; this element just zones the surfaces.)
     • describe() returns screen-reader text; the card carries aria.

   Degrades safely: no KaTeX → plain latex text; no MathLive → a plain
   <input>. Never throws on a bad latex string (KaTeX throwOnError:false).

   Browser-only. Global: window.LWS.EquationElement.
   ============================================================ */
(function (root) {
  'use strict';
  const LWS = (root.LWS = root.LWS || {});

  function typeset(target, latex) {
    const katex = root.katex;
    if (katex && typeof katex.render === 'function') {
      try { katex.render(latex || '', target, { throwOnError: false, displayMode: true }); return; }
      catch (_) { /* fall through to text */ }
    }
    target.textContent = latex || '';
  }

  // makeRenderer({ onEditCommit }) → factory(element, api) → renderer.
  // onEditCommit(id, latex) is called when an edit is committed.
  function makeRenderer(hooks = {}) {
    const onEditCommit = typeof hooks.onEditCommit === 'function' ? hooks.onEditCommit : function () {};

    return function equationFactory(element, api) {
      const doc = document;
      const card = doc.createElement('div');
      card.className = 'lws-eq-card';
      card.setAttribute('role', 'group');

      const header = doc.createElement('div');
      header.className = 'lws-eq-header';
      header.dataset.role = 'reposition-handle';        // InteractionController drag zone
      const grip = doc.createElement('span'); grip.className = 'lws-eq-grip'; grip.textContent = '⠿'; grip.setAttribute('aria-hidden', 'true');
      const title = doc.createElement('span'); title.className = 'lws-eq-title'; title.textContent = 'Equation';
      const editBtn = doc.createElement('button');
      editBtn.type = 'button'; editBtn.className = 'lws-eq-edit'; editBtn.textContent = '✎';
      editBtn.setAttribute('aria-label', 'Edit equation');
      header.appendChild(grip); header.appendChild(title); header.appendChild(editBtn);

      const body = doc.createElement('div');
      body.className = 'lws-eq-body';
      body.dataset.role = 'content';                    // NOT a drag zone

      card.appendChild(header);
      card.appendChild(body);

      let current = Object.assign({}, element);
      let editing = false;
      let field = null;

      function renderStatic() {
        typeset(body, current.semantic && current.semantic.latex);
        card.setAttribute('aria-label', describe());
      }

      function beginEdit() {
        if (editing) return;
        editing = true;
        body.textContent = '';
        const latex = (current.semantic && current.semantic.latex) || '';
        const hasMathLive = typeof root.customElements !== 'undefined'
          && typeof root.customElements.get === 'function'
          && !!root.customElements.get('math-field');
        if (hasMathLive) {
          field = doc.createElement('math-field');
          field.setAttribute('math-virtual-keyboard-policy', 'manual');
          field.value = latex;
          body.appendChild(field);
          field.focus && field.focus();
          field.addEventListener('change', commitEdit);      // MathLive fires change on Enter/blur
          field.addEventListener('blur', commitEdit);
        } else {
          field = doc.createElement('input');
          field.type = 'text'; field.className = 'lws-eq-input'; field.value = latex;
          body.appendChild(field);
          field.focus();
          field.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitEdit(); });
          field.addEventListener('blur', commitEdit);
        }
      }

      function commitEdit() {
        if (!editing || !field) return;
        const val = (typeof field.value === 'string') ? field.value : '';
        editing = false;
        field = null;
        // Write back only if changed; the registry update re-renders us.
        const prev = (current.semantic && current.semantic.latex) || '';
        current.semantic = Object.assign({}, current.semantic, { latex: val });
        renderStatic();
        if (val !== prev) onEditCommit(current.id, val);
      }

      editBtn.addEventListener('click', beginEdit);
      // Double-clicking the math also edits (but not the header).
      body.addEventListener('dblclick', beginEdit);

      renderStatic();

      return {
        node: card,
        update(el) {
          current = Object.assign({}, el);
          if (!editing) renderStatic();
        },
        destroy() {
          if (field) {
            field.removeEventListener('change', commitEdit);
            field.removeEventListener('blur', commitEdit);
          }
          editBtn.removeEventListener('click', beginEdit);
        },
        describe() {
          const latex = (current.semantic && current.semantic.latex) || '';
          const plain = (current.semantic && current.semantic.plain) || latex;
          return `Equation: ${plain}${current.provisional ? ', provisional' : ''}`;
        },
      };

      function describe() {
        const latex = (current.semantic && current.semantic.latex) || '';
        const plain = (current.semantic && current.semantic.plain) || latex;
        return `Equation: ${plain}`;
      }
    };
  }

  LWS.EquationElement = { makeRenderer };
})(typeof self !== 'undefined' ? self : this);
