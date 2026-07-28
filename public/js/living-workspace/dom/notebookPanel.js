/* ============================================================
   notebookPanel.js — the learning notebook ON the board (spec §15).

   A "📓 Notebook" pill pinned to the board's bottom-right (opposite the
   materials dock) opens a full-board overlay of the student's learning
   cards — AHA moments in their own words, "Watch for This" reminders,
   and, as capture grows, ideas/strategies/reflections. Searchable
   ("negative sign", "slope") and filterable by kind; cards can be
   removed (soft archive) without touching the evidence trail.

   THE STUDENT OWNS THIS NOTEBOOK. Beyond what the tutor captures they can
   write their own notes ("+ Add note"), edit them later, and drag any chat
   message onto the 📓 pill to keep it — the drop just prefills the same
   composer. Their notes render as a distinct kind (📝, green rail) so it
   stays obvious which words are theirs and which are the tutor's. Only
   their own notes are editable; the server enforces that (routes/notebook.js).

   Reads GET /api/notebook (own cards only; auth server-side). Same
   overlay contract as the source viewer and the archive rail: it covers
   the board, never replaces it; Esc or Back returns to the work.
   Browser-only view.
   ============================================================ */
(function (root) {
  'use strict';
  var LWS = (root.LWS = root.LWS || {});

  var TYPE_META = {
    aha: { icon: '✨', label: 'AHA moments' },
    reminder: { icon: '📌', label: 'Watch for This' },
    idea: { icon: '💡', label: 'Ideas' },
    strategy: { icon: '🧭', label: 'Strategies' },
    reflection: { icon: '🪞', label: 'Reflections' },
    note: { icon: '📝', label: 'My note' },
  };
  var FILTERS = [
    { key: '', icon: '📓', label: 'Everything' },
    { key: 'note', icon: '📝', label: 'My notes' },
    { key: 'aha', icon: '✨', label: 'AHA' },
    { key: 'reminder', icon: '📌', label: 'Reminders' },
  ];

  var TITLE_MAX = 160;
  var BODY_MAX = 2000;

  function csrfFetch(url, opts) {
    var fn = root.csrfFetch || fetch;
    return fn(url, opts);
  }

  // A dropped chat message is one blob of text; the composer wants a headline
  // and a body. Use the first sentence/line as the title and keep the whole
  // thing as the body, so nothing the student dragged is silently discarded.
  function titleFromText(text) {
    var first = String(text == null ? '' : text).trim().split('\n')[0];
    var stop = first.search(/[.!?]\s/);
    if (stop > 12) first = first.slice(0, stop + 1);
    return first.slice(0, TITLE_MAX);
  }

  // The text a drag is carrying, whatever set it. Chat sets text/plain.
  function droppedText(ev) {
    try { return (ev.dataTransfer && ev.dataTransfer.getData('text/plain')) || ''; }
    catch (_) { return ''; }
  }

  function NotebookPanel(container) {
    this.doc = container.ownerDocument || document;
    this._overlay = null;
    this._escHandler = null;
    this._type = '';
    this._q = '';

    var d = this.doc;
    var btn = d.createElement('button');
    btn.type = 'button';
    btn.className = 'lws-nb-btn';
    btn.innerHTML = '<span aria-hidden="true">📓</span><span>Notebook</span>';
    btn.setAttribute('aria-label', 'Open my learning notebook');
    var self = this;
    btn.addEventListener('click', function () { self.open(); });

    // Drop a chat message here to keep it (see script.js's drag chip). The
    // pill is the target even when the notebook is closed — that IS the
    // gesture: drag out of the conversation, onto the notebook, done.
    btn.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
      btn.classList.add('is-drop');
    });
    btn.addEventListener('dragleave', function () { btn.classList.remove('is-drop'); });
    btn.addEventListener('drop', function (ev) {
      ev.preventDefault();
      btn.classList.remove('is-drop');
      self.captureText(droppedText(ev));
    });

    container.appendChild(btn);
    this.el = { container: container, btn: btn };
  }

  // Open the notebook with the composer prefilled from `text` — the landing
  // point for both a dropped chat bubble and the chip's plain click. The
  // student still confirms; nothing is written behind their back.
  NotebookPanel.prototype.captureText = function (text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return;
    if (!this._overlay) this.open();
    this._openComposer({ title: titleFromText(t), body: t.slice(0, BODY_MAX) });
  };

  NotebookPanel.prototype._fetch = function (cb) {
    var params = new URLSearchParams();
    if (this._type) params.set('type', this._type);
    if (this._q) params.set('q', this._q);
    var url = '/api/notebook' + (params.toString() ? '?' + params.toString() : '');
    fetch(url, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { cards: [] }; })
      .then(function (data) { cb(Array.isArray(data.cards) ? data.cards : []); })
      .catch(function (err) { console.error('[LWS] notebook fetch failed', err); cb([]); });
  };

  NotebookPanel.prototype.open = function () {
    this.close();
    var self = this;
    var d = this.doc;

    var ov = d.createElement('div');
    ov.className = 'lws-nb-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'false');
    ov.setAttribute('aria-label', 'My learning notebook');

    var bar = d.createElement('div'); bar.className = 'lws-sd-ov-bar';
    var tag = d.createElement('span'); tag.className = 'lws-sd-ov-tag'; tag.textContent = 'My notebook';
    var back = d.createElement('button');
    back.type = 'button'; back.className = 'lws-sd-ov-back';
    back.textContent = 'Back to my work';
    back.addEventListener('click', function () { self.close(); });
    bar.appendChild(tag); bar.appendChild(back);

    var tools = d.createElement('div'); tools.className = 'lws-nb-tools';
    var search = d.createElement('input');
    search.type = 'search';
    search.className = 'lws-nb-search';
    search.placeholder = 'Search… ("negative sign", "slope")';
    search.setAttribute('aria-label', 'Search my notebook');
    var debounce = null;
    search.addEventListener('input', function () {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(function () { self._q = search.value.trim(); self._reload(); }, 250);
    });
    tools.appendChild(search);

    var chips = d.createElement('div'); chips.className = 'lws-nb-chips';
    chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Filter by kind');
    FILTERS.forEach(function (f) {
      var c = d.createElement('button');
      c.type = 'button';
      c.className = 'lws-nb-chip' + (self._type === f.key ? ' is-on' : '');
      c.textContent = f.icon + ' ' + f.label;
      c.setAttribute('aria-pressed', self._type === f.key ? 'true' : 'false');
      c.addEventListener('click', function () {
        self._type = f.key;
        var all = chips.querySelectorAll('.lws-nb-chip');
        for (var i = 0; i < all.length; i++) { all[i].classList.remove('is-on'); all[i].setAttribute('aria-pressed', 'false'); }
        c.classList.add('is-on'); c.setAttribute('aria-pressed', 'true');
        self._reload();
      });
      chips.appendChild(c);
    });
    tools.appendChild(chips);

    var add = d.createElement('button');
    add.type = 'button';
    add.className = 'lws-nb-add';
    add.textContent = '+ Add note';
    add.setAttribute('aria-label', 'Write my own note');
    add.addEventListener('click', function () { self._openComposer(null); });
    tools.appendChild(add);

    var composer = d.createElement('div'); composer.className = 'lws-nb-composer-slot';

    var body = d.createElement('div'); body.className = 'lws-nb-body';
    body.setAttribute('aria-live', 'polite');

    // The whole open notebook is a drop target too, not just the pill —
    // once it's open, dropping onto the pill behind it is fiddly.
    ov.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
      ov.classList.add('is-drop');
    });
    ov.addEventListener('dragleave', function (ev) {
      if (ev.target === ov) ov.classList.remove('is-drop');
    });
    ov.addEventListener('drop', function (ev) {
      ev.preventDefault();
      ov.classList.remove('is-drop');
      self.captureText(droppedText(ev));
    });

    ov.appendChild(bar); ov.appendChild(tools); ov.appendChild(composer); ov.appendChild(body);
    this.el.container.appendChild(ov);
    this._overlay = ov;
    this._composerSlot = composer;
    this._body = body;
    this._escHandler = function (ev) { if (ev.key === 'Escape') self.close(); };
    d.addEventListener('keydown', this._escHandler);
    try { search.focus(); } catch (_) { /* fine */ }

    this._reload();
  };

  // One editor widget, two callers: the "+ Add note" composer and the inline
  // edit on a note the student already saved. `onSave(values, done)` gets a
  // `done(ok)` callback so the caller owns the network round-trip and the
  // editor only owns the disabled/error state.
  NotebookPanel.prototype._buildEditor = function (values, saveLabel, onSave, onCancel) {
    var d = this.doc;
    var v = values || {};

    var form = d.createElement('form');
    form.className = 'lws-nb-editor';

    var title = d.createElement('input');
    title.type = 'text';
    title.className = 'lws-nb-editor-title';
    title.maxLength = TITLE_MAX;
    title.placeholder = 'Title — what is this about?';
    title.setAttribute('aria-label', 'Note title');
    title.value = v.title || '';

    var body = d.createElement('textarea');
    body.className = 'lws-nb-editor-body';
    body.maxLength = BODY_MAX;
    body.rows = 4;
    body.placeholder = 'Your note…';
    body.setAttribute('aria-label', 'Note body');
    body.value = v.body || '';

    var row = d.createElement('div'); row.className = 'lws-nb-editor-row';
    var err = d.createElement('span'); err.className = 'lws-nb-editor-err'; err.setAttribute('role', 'alert');
    var save = d.createElement('button');
    save.type = 'submit'; save.className = 'lws-nb-editor-save'; save.textContent = saveLabel;
    var cancel = d.createElement('button');
    cancel.type = 'button'; cancel.className = 'lws-nb-editor-cancel'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { onCancel(); });
    row.appendChild(err); row.appendChild(cancel); row.appendChild(save);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var payload = { title: title.value.trim(), body: body.value.trim() };
      if (!payload.title && !payload.body) {
        err.textContent = 'Write something first.';
        try { title.focus(); } catch (_) { /* fine */ }
        return;
      }
      err.textContent = '';
      save.disabled = true;
      onSave(payload, function (ok) {
        save.disabled = false;
        if (!ok) err.textContent = 'Could not save — try again.';
      });
    });
    // Esc inside the editor closes the editor, not the whole notebook.
    form.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); onCancel(); }
    });

    form.appendChild(title); form.appendChild(body); form.appendChild(row);
    return { form: form, titleInput: title };
  };

  NotebookPanel.prototype._openComposer = function (prefill) {
    var self = this;
    var slot = this._composerSlot;
    if (!slot) return;
    slot.textContent = '';

    var ed = this._buildEditor(prefill, 'Save note', function (payload, done) {
      csrfFetch('/api/notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'note', title: payload.title, body: payload.body }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error('save failed (' + r.status + ')');
          done(true);
          self._closeComposer();
          // Re-read rather than splice the new card in: the active filter or
          // search may legitimately exclude it, and a locally-inserted card
          // that vanishes on the next reload is worse than never showing it.
          self._reload();
        })
        .catch(function (err) { console.error('[LWS] note save failed', err); done(false); });
    }, function () { self._closeComposer(); });

    slot.appendChild(ed.form);
    try { ed.titleInput.focus(); } catch (_) { /* fine */ }
  };

  NotebookPanel.prototype._closeComposer = function () {
    if (this._composerSlot) this._composerSlot.textContent = '';
  };

  NotebookPanel.prototype._reload = function () {
    var self = this;
    var body = this._body;
    if (!body) return;
    body.textContent = 'Loading…';
    this._fetch(function (cards) {
      if (!self._body) return;   // closed mid-flight
      self._renderCards(cards);
    });
  };

  NotebookPanel.prototype._renderCards = function (cards) {
    var self = this;
    var d = this.doc;
    var body = this._body;
    body.textContent = '';

    if (!cards.length) {
      var empty = d.createElement('div');
      empty.className = 'lws-nb-empty';
      empty.textContent = this._q || this._type
        ? 'Nothing here matches — try a different search.'
        : 'Your AHA moments and reminders collect here as you work — and you can add your own notes any time, or drag a message from the chat onto the 📓 pill.';
      body.appendChild(empty);
      return;
    }

    cards.forEach(function (card) {
      body.appendChild(self._renderCard(card));
    });
  };

  NotebookPanel.prototype._renderCard = function (card) {
    var self = this;
    var d = this.doc;
    var meta = TYPE_META[card.type] || { icon: '📓', label: card.type };
    var mine = card.source === 'student';

    var el = d.createElement('article');
    el.className = 'lws-nb-card is-' + card.type + (mine ? ' is-mine' : '');

    var head = d.createElement('div'); head.className = 'lws-nb-card-head';
    var kind = d.createElement('span'); kind.className = 'lws-nb-card-kind';
    kind.textContent = meta.icon + ' ' + meta.label;
    var when = d.createElement('span'); when.className = 'lws-nb-card-when';
    try { when.textContent = new Date(card.createdAt).toLocaleDateString(); } catch (_) { /* fine */ }
    head.appendChild(kind); head.appendChild(when);

    // Editing is offered only on the student's own words. The tutor's capture
    // cards stay read-only here and on the server — see routes/notebook.js.
    if (mine) {
      var edit = d.createElement('button');
      edit.type = 'button'; edit.className = 'lws-nb-card-edit';
      edit.textContent = '✎';
      edit.setAttribute('aria-label', 'Edit this note');
      edit.addEventListener('click', function () { self._editCard(card, el); });
      head.appendChild(edit);
    }

    var del = d.createElement('button');
    del.type = 'button'; del.className = 'lws-nb-card-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', mine ? 'Delete this note' : 'Remove this card from my notebook');
    del.addEventListener('click', function () {
      csrfFetch('/api/notebook/' + encodeURIComponent(card._id) + '/archive', { method: 'PATCH', credentials: 'include' })
        .then(function () { if (el.parentNode) el.parentNode.removeChild(el); })
        .catch(function (err) { console.error('[LWS] archive card failed', err); });
    });
    head.appendChild(del);

    var title = d.createElement('h3'); title.className = 'lws-nb-card-title';
    title.textContent = card.title || '';

    el.appendChild(head);
    el.appendChild(title);
    if (card.body) {
      var bodyEl = d.createElement('p'); bodyEl.className = 'lws-nb-card-body';
      bodyEl.textContent = card.body;
      el.appendChild(bodyEl);
    }
    if (card.problemTex) {
      var prob = d.createElement('p'); prob.className = 'lws-nb-card-prob';
      prob.textContent = 'Problem: ' + card.problemTex;
      el.appendChild(prob);
    }
    if (card.type === 'reminder' && (card.seenCount || 0) >= 2) {
      var seen = d.createElement('p'); seen.className = 'lws-nb-card-seen';
      seen.textContent = 'Spotted ' + card.seenCount + ' times';
      el.appendChild(seen);
    }
    return el;
  };

  // Swap a saved note for an editor in place; on save, swap the freshly
  // returned card back in. No full reload — the rest of the grid shouldn't
  // flicker because one card was edited.
  NotebookPanel.prototype._editCard = function (card, el) {
    var self = this;
    if (el.querySelector('.lws-nb-editor')) return;   // already editing

    function restore(next) {
      var fresh = self._renderCard(next);
      if (el.parentNode) el.parentNode.replaceChild(fresh, el);
    }

    var ed = this._buildEditor({ title: card.title, body: card.body }, 'Save changes', function (payload, done) {
      csrfFetch('/api/notebook/' + encodeURIComponent(card._id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          if (!r.ok) throw new Error('edit failed (' + r.status + ')');
          return r.json();
        })
        .then(function (data) {
          done(true);
          var next = (data && data.card) || card;
          // The PATCH response omits fields the card view uses (problemTex,
          // seenCount) — carry the originals so re-rendering isn't a downgrade.
          restore(Object.assign({}, card, next));
        })
        .catch(function (err) { console.error('[LWS] note edit failed', err); done(false); });
    }, function () { restore(card); });

    el.textContent = '';
    el.appendChild(ed.form);
    try { ed.titleInput.focus(); } catch (_) { /* fine */ }
  };

  NotebookPanel.prototype.close = function () {
    if (this._escHandler) {
      this.doc.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
    this._composerSlot = null;
    this._body = null;
  };

  LWS.NotebookPanel = NotebookPanel;
  if (typeof module !== 'undefined' && module.exports) module.exports = { NotebookPanel: NotebookPanel };
})(typeof self !== 'undefined' ? self : this);
