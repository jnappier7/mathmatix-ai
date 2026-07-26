/* ============================================================
   notebookPanel.js — the learning notebook ON the board (spec §15).

   A "📓 Notebook" pill pinned to the board's bottom-right (opposite the
   materials dock) opens a full-board overlay of the student's learning
   cards — AHA moments in their own words, "Watch for This" reminders,
   and, as capture grows, ideas/strategies/reflections. Searchable
   ("negative sign", "slope") and filterable by kind; cards can be
   removed (soft archive) without touching the evidence trail.

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
  };
  var FILTERS = [
    { key: '', icon: '📓', label: 'Everything' },
    { key: 'aha', icon: '✨', label: 'AHA' },
    { key: 'reminder', icon: '📌', label: 'Reminders' },
  ];

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
    container.appendChild(btn);
    this.el = { container: container, btn: btn };
  }

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

    var body = d.createElement('div'); body.className = 'lws-nb-body';
    body.setAttribute('aria-live', 'polite');

    ov.appendChild(bar); ov.appendChild(tools); ov.appendChild(body);
    this.el.container.appendChild(ov);
    this._overlay = ov;
    this._body = body;
    this._escHandler = function (ev) { if (ev.key === 'Escape') self.close(); };
    d.addEventListener('keydown', this._escHandler);
    try { search.focus(); } catch (_) { /* fine */ }

    this._reload();
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
        : 'Your AHA moments and reminders will collect here as you work.';
      body.appendChild(empty);
      return;
    }

    cards.forEach(function (card) {
      var meta = TYPE_META[card.type] || { icon: '📓', label: card.type };
      var el = d.createElement('article');
      el.className = 'lws-nb-card is-' + card.type;

      var head = d.createElement('div'); head.className = 'lws-nb-card-head';
      var kind = d.createElement('span'); kind.className = 'lws-nb-card-kind';
      kind.textContent = meta.icon + ' ' + meta.label;
      var when = d.createElement('span'); when.className = 'lws-nb-card-when';
      try { when.textContent = new Date(card.createdAt).toLocaleDateString(); } catch (_) { /* fine */ }
      var del = d.createElement('button');
      del.type = 'button'; del.className = 'lws-nb-card-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Remove this card from my notebook');
      del.addEventListener('click', function () {
        var csrfFetchFn = root.csrfFetch || fetch;
        csrfFetchFn('/api/notebook/' + encodeURIComponent(card._id) + '/archive', { method: 'PATCH', credentials: 'include' })
          .then(function () { if (el.parentNode) el.parentNode.removeChild(el); })
          .catch(function (err) { console.error('[LWS] archive card failed', err); });
      });
      head.appendChild(kind); head.appendChild(when); head.appendChild(del);

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
      body.appendChild(el);
    });
    void self;
  };

  NotebookPanel.prototype.close = function () {
    if (this._escHandler) {
      this.doc.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
    this._body = null;
  };

  LWS.NotebookPanel = NotebookPanel;
  if (typeof module !== 'undefined' && module.exports) module.exports = { NotebookPanel: NotebookPanel };
})(typeof self !== 'undefined' ? self : this);
