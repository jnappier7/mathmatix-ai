/* ============================================================
   sourceDock.js — Source Cards v1: uploads live ON the board.

   Spec §5.1: uploaded materials must appear directly on the workspace,
   not disappear into an attachment menu or a separate tab. This dock is
   the supporting zone of the ratified zones layout (spec §14): a slim
   strip pinned to the bottom edge of the board holding one card per
   uploaded source. Clicking a card opens it full-board in a read-only
   overlay — images with zoom controls, PDFs through the browser's
   native viewer (page turns and zoom included) — beside, never instead
   of, the student's work.

   Bytes are served by /api/student/uploads/:id/file (auth + ownership
   enforced server-side); this module only ever handles {uploadId,
   fileType} references. The dock itself is a collapsed "My materials"
   tab (see SourceDock below) so it never covers the chat. Region selection and source↔problem linking
   (spec §5.3–5.4) build on top of this surface in a later slice.

   Browser-only view; the pure list logic lives in core/sourceList.js.
   ============================================================ */
(function (root) {
  'use strict';
  var LWS = (root.LWS = root.LWS || {});

  function fileUrl(uploadId) {
    return '/api/student/uploads/' + encodeURIComponent(uploadId) + '/file';
  }

  // The upload's DB record is written just AFTER the chat reply goes out, so
  // the first request for a brand-new card can 404. A single failed load used
  // to leave a broken-image glyph for good; retry with backoff instead, and
  // fall back to a clean placeholder if it never arrives.
  var RETRY_DELAYS = [800, 2000, 5000];
  function loadWithRetry(img, uploadId, onGiveUp) {
    var attempt = 0;
    img.addEventListener('error', function () {
      if (attempt >= RETRY_DELAYS.length) { if (onGiveUp) onGiveUp(); return; }
      var delay = RETRY_DELAYS[attempt++];
      setTimeout(function () { img.src = fileUrl(uploadId) + '?r=' + attempt; }, delay);
    });
    img.src = fileUrl(uploadId);
  }

  function prefersReducedMotion(win) {
    try { return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch { return false; }
  }

  // "My materials" is a TAB, not a strip: it rests collapsed as a small pill
  // (with a count) so it never sits over the conversation, opens into a panel
  // on click, and closes from its ✕, Esc, or a click anywhere else. New
  // uploads fly from the composer into the tab so the student sees where
  // their photos went.
  function SourceDock(container, opts) {
    opts = opts || {};
    this.doc = container.ownerDocument || document;
    // Called with (cropFile, region, src) when the student confirms a selected
    // problem region. The integration owns the send (it goes through chat, the
    // one path the tutor can see) — the dock never invents its own.
    this.onAskRegion = typeof opts.onAskRegion === 'function' ? opts.onAskRegion : null;
    // Returns the element new uploads fly FROM (the composer). Optional.
    this.flyFrom = typeof opts.flyFrom === 'function' ? opts.flyFrom : null;
    this._sources = [];
    this._seen = {};
    this._overlay = null;
    this._escHandler = null;
    this._outsideHandler = null;
    this._panelKeyHandler = null;

    var d = this.doc;
    var self = this;
    var dock = d.createElement('div');
    dock.className = 'lws-sd is-collapsed';
    dock.hidden = true;

    var head = d.createElement('button');
    head.type = 'button';
    head.className = 'lws-sd-head';
    head.setAttribute('aria-expanded', 'false');
    function span(cls, text, hidden) {
      var el = d.createElement('span');
      el.className = cls;
      el.textContent = text;
      if (hidden) el.setAttribute('aria-hidden', 'true');
      head.appendChild(el);
      return el;
    }
    span('lws-sd-head-ic', '📎', true);
    span('lws-sd-head-t', 'My materials');
    var countEl = span('lws-sd-count', '0', true);
    head.addEventListener('click', function () { self.toggle(); });

    var panel = d.createElement('div');
    panel.className = 'lws-sd-panel';

    var panelBar = d.createElement('div');
    panelBar.className = 'lws-sd-panel-bar';
    var panelTitle = d.createElement('span');
    panelTitle.className = 'lws-sd-panel-t';
    panelTitle.textContent = 'My materials';
    var close = d.createElement('button');
    close.type = 'button';
    close.className = 'lws-sd-close';
    close.setAttribute('aria-label', 'Close My materials');
    close.textContent = '✕';
    close.addEventListener('click', function () { self.collapse(); });
    panelBar.appendChild(panelTitle);
    panelBar.appendChild(close);

    var strip = d.createElement('div');
    strip.className = 'lws-sd-strip';
    strip.setAttribute('role', 'list');
    strip.setAttribute('aria-label', 'Uploaded materials');

    panel.appendChild(panelBar);
    panel.appendChild(strip);
    dock.appendChild(head);
    dock.appendChild(panel);
    container.appendChild(dock);
    this.el = { root: dock, head: head, panel: panel, strip: strip, count: countEl, container: container };
  }

  SourceDock.prototype.isOpen = function () {
    return !this.el.root.classList.contains('is-collapsed');
  };

  SourceDock.prototype.expand = function () {
    if (this.isOpen() || this._sources.length === 0) return;
    var self = this;
    var d = this.doc;
    this.el.root.classList.remove('is-collapsed');
    this.el.head.setAttribute('aria-expanded', 'true');
    this._outsideHandler = function (ev) {
      if (!self.el.root.contains(ev.target)) self.collapse();
    };
    this._panelKeyHandler = function (ev) {
      // The source viewer owns Esc while it is open.
      if (ev.key === 'Escape' && !self._overlay) self.collapse();
    };
    d.addEventListener('pointerdown', this._outsideHandler, true);
    d.addEventListener('keydown', this._panelKeyHandler);
  };

  SourceDock.prototype.collapse = function () {
    var d = this.doc;
    this.el.root.classList.add('is-collapsed');
    this.el.head.setAttribute('aria-expanded', 'false');
    if (this._outsideHandler) d.removeEventListener('pointerdown', this._outsideHandler, true);
    if (this._panelKeyHandler) d.removeEventListener('keydown', this._panelKeyHandler);
    this._outsideHandler = null;
    this._panelKeyHandler = null;
  };

  SourceDock.prototype.toggle = function () {
    if (this.isOpen()) this.collapse(); else this.expand();
  };

  // opts.animateNew: fly sources not seen before into the tab (live uploads).
  // History loads pass nothing — reopening a conversation shouldn't replay
  // every photo it ever had.
  SourceDock.prototype.setSources = function (sources, opts) {
    var self = this;
    var list = Array.isArray(sources) ? sources : [];
    var fresh = [];
    if (opts && opts.animateNew) {
      list.forEach(function (src) { if (src && src.uploadId && !self._seen[src.uploadId]) fresh.push(src); });
    }
    this._seen = {};
    list.forEach(function (src) { if (src && src.uploadId) self._seen[src.uploadId] = true; });
    this._sources = list;
    this._render();
    if (fresh.length) this._flyIn(fresh);
  };

  SourceDock.prototype.clear = function () {
    this.closeSource();
    this.collapse();
    this._sources = [];
    this._seen = {};
    this._render();
  };

  SourceDock.prototype._render = function () {
    var self = this;
    var d = this.doc;
    var strip = this.el.strip;
    strip.textContent = '';
    var count = this._sources.filter(function (s) { return s && s.uploadId; }).length;
    this.el.root.hidden = count === 0;
    this.el.count.textContent = String(count);
    this.el.head.setAttribute('aria-label', 'My materials, ' + count + (count === 1 ? ' item' : ' items'));
    if (count === 0) this.collapse();

    this._sources.forEach(function (src, i) {
      if (!src || !src.uploadId) return;
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'lws-sd-card';
      b.setAttribute('role', 'listitem');
      var name = (src.fileType === 'pdf' ? 'Worksheet PDF ' : 'Photo ') + (i + 1);
      b.setAttribute('aria-label', 'Open ' + name + ' on the board');
      b.title = 'Open ' + name;

      if (src.fileType === 'pdf') {
        var ic = d.createElement('span');
        ic.className = 'lws-sd-card-pdf';
        ic.textContent = 'PDF';
        b.appendChild(ic);
      } else {
        var img = d.createElement('img');
        img.className = 'lws-sd-card-img';
        img.alt = '';
        loadWithRetry(img, src.uploadId, function () {
          var ph = d.createElement('span');
          ph.className = 'lws-sd-card-ph';
          ph.textContent = '📷';
          if (img.parentNode) img.parentNode.replaceChild(ph, img);
        });
        b.appendChild(img);
      }
      var lab = d.createElement('span');
      lab.className = 'lws-sd-card-lab';
      lab.textContent = name;
      b.appendChild(lab);

      b.addEventListener('click', function () { self.collapse(); self.openSource(src, name); });
      strip.appendChild(b);
    });
  };

  // New uploads fly from the composer into the tab, then the tab pulses and
  // its count ticks up. Purely decorative: the tab is already updated, so a
  // missing origin or reduced motion just skips the flight.
  SourceDock.prototype._flyIn = function (fresh) {
    var d = this.doc;
    var win = d.defaultView;
    var head = this.el.head;
    function bump() {
      head.classList.remove('is-bump');
      void head.offsetWidth; // restart the animation
      head.classList.add('is-bump');
    }
    if (!win || prefersReducedMotion(win) || typeof head.getBoundingClientRect !== 'function') { bump(); return; }
    var to = head.getBoundingClientRect();
    var fromEl;
    try { fromEl = this.flyFrom ? this.flyFrom() : null; } catch { fromEl = null; }
    var from = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect()
      : this.el.container.getBoundingClientRect();
    if (!to.width || !from.width) { bump(); return; }

    var startX = from.left + from.width / 2 - 28;
    var startY = from.top + Math.min(from.height / 2, 60) - 22;
    var endX = to.left + 10;
    var endY = to.top + to.height / 2 - 22;

    fresh.slice(0, 6).forEach(function (src, i) {
      var ghost = d.createElement('div');
      ghost.className = 'lws-sd-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = src.fileType === 'pdf' ? 'PDF' : '📷';
      ghost.style.left = startX + 'px';
      ghost.style.top = startY + 'px';
      d.body.appendChild(ghost);
      var delay = i * 110;
      win.setTimeout(function () {
        ghost.style.transform = 'translate(' + (endX - startX) + 'px,' + (endY - startY) + 'px) scale(.35)';
        ghost.style.opacity = '0.15';
      }, 30 + delay);
      win.setTimeout(function () {
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
        bump();
      }, 720 + delay);
    });
  };

  // Full-board viewer, same pattern as the derivation's archive overlay: it
  // covers the board, never replaces it, Esc or Back returns. Images support
  // problem-region selection (spec §5.3): drag a box around a problem and ask
  // the tutor about exactly that. An optional `region` ({x,y,w,h}, normalized
  // 0–1) highlights where a linked problem came from (spec §5.4 back-link).
  SourceDock.prototype.openSource = function (src, name, region) {
    this.closeSource();
    var self = this;
    var d = this.doc;

    var ov = d.createElement('div');
    ov.className = 'lws-sd-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'false');
    ov.setAttribute('aria-label', name);

    var bar = d.createElement('div'); bar.className = 'lws-sd-ov-bar';
    var tag = d.createElement('span'); tag.className = 'lws-sd-ov-tag'; tag.textContent = name;
    var back = d.createElement('button');
    back.type = 'button'; back.className = 'lws-sd-ov-back';
    back.textContent = 'Back to my work';
    back.addEventListener('click', function () { self.closeSource(); });
    bar.appendChild(tag);

    var body = d.createElement('div'); body.className = 'lws-sd-ov-body';

    if (src.fileType === 'pdf') {
      // The browser's own PDF viewer supplies paging, zoom and search —
      // native capabilities the spec asks Source Cards to have (§5.2).
      var frame = d.createElement('iframe');
      frame.className = 'lws-sd-ov-frame';
      frame.title = name;
      frame.src = fileUrl(src.uploadId);
      body.appendChild(frame);
    } else {
      var zoom = 1;
      // Positioned wrap so the selection box and the region highlight can sit
      // over the image in normalized (percentage) coordinates — they stay
      // glued to the right spot at any zoom level.
      var wrap = d.createElement('div');
      wrap.className = 'lws-sd-ov-wrap';
      var img = d.createElement('img');
      img.className = 'lws-sd-ov-img';
      img.alt = name;
      loadWithRetry(img, src.uploadId, null);
      wrap.appendChild(img);

      if (region && region.w > 0 && region.h > 0) {
        var hl = d.createElement('div');
        hl.className = 'lws-sd-hl';
        hl.style.left = (region.x * 100) + '%';
        hl.style.top = (region.y * 100) + '%';
        hl.style.width = (region.w * 100) + '%';
        hl.style.height = (region.h * 100) + '%';
        wrap.appendChild(hl);
        // Bring the highlighted problem into view once the image has size.
        img.addEventListener('load', function () {
          try { hl.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) { /* older browsers */ }
        });
      }

      var ctl = d.createElement('span'); ctl.className = 'lws-sd-ov-zoom';
      var zOut = d.createElement('button'); zOut.type = 'button'; zOut.textContent = '−'; zOut.setAttribute('aria-label', 'Zoom out');
      var zIn = d.createElement('button'); zIn.type = 'button'; zIn.textContent = '+'; zIn.setAttribute('aria-label', 'Zoom in');
      function applyZoom() {
        zoom = Math.max(0.5, Math.min(4, zoom));
        wrap.style.width = (zoom * 100) + '%';
        zOut.disabled = zoom <= 0.5;
        zIn.disabled = zoom >= 4;
      }
      zOut.addEventListener('click', function () { zoom -= 0.25; applyZoom(); });
      zIn.addEventListener('click', function () { zoom += 0.25; applyZoom(); });
      ctl.appendChild(zOut); ctl.appendChild(zIn);
      bar.appendChild(ctl);

      // Problem-region selection: only offered when the integration provided
      // an ask hook (chat present) — the dock never invents a send path.
      if (typeof this.onAskRegion === 'function') {
        bar.appendChild(this._buildSelectControl(wrap, img, src));
      }

      applyZoom();
      body.appendChild(wrap);
    }

    bar.appendChild(back);
    ov.appendChild(bar); ov.appendChild(body);
    this.el.container.appendChild(ov);
    this._overlay = ov;
    this._escHandler = function (ev) { if (ev.key === 'Escape') self.closeSource(); };
    d.addEventListener('keydown', this._escHandler);
    try { back.focus(); } catch (_) { /* not focusable yet */ }
  };

  // "Select a problem" control: toggles a crosshair mode where dragging on
  // the image draws a box (pointer events — mouse and touch alike). Releasing
  // shows a confirm chip; confirming crops the region from the image's natural
  // pixels and hands it to onAskRegion with normalized coordinates.
  SourceDock.prototype._buildSelectControl = function (wrap, img, src) {
    var self = this;
    var d = this.doc;
    var btn = d.createElement('button');
    btn.type = 'button';
    btn.className = 'lws-sd-ov-select';
    btn.textContent = 'Select a problem';
    btn.setAttribute('aria-pressed', 'false');

    var selecting = false;
    var box = null;        // the live selection rect (normalized coords)
    var confirmEl = null;
    var start = null;

    function clearSelection() {
      if (box && box.el.parentNode) box.el.parentNode.removeChild(box.el);
      if (confirmEl && confirmEl.parentNode) confirmEl.parentNode.removeChild(confirmEl);
      box = null; confirmEl = null; start = null;
    }
    function setMode(on) {
      selecting = on;
      wrap.classList.toggle('is-selecting', on);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? 'Cancel selection' : 'Select a problem';
      if (!on) clearSelection();
    }
    btn.addEventListener('click', function () { setMode(!selecting); });

    function norm(ev) {
      var r = wrap.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return {
        x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
      };
    }
    function rectFrom(a, b) {
      var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      return { x: x, y: y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    }
    function paintBox(r) {
      if (!box) {
        var el = d.createElement('div');
        el.className = 'lws-sd-sel';
        wrap.appendChild(el);
        box = { el: el };
      }
      box.el.style.left = (r.x * 100) + '%';
      box.el.style.top = (r.y * 100) + '%';
      box.el.style.width = (r.w * 100) + '%';
      box.el.style.height = (r.h * 100) + '%';
      box.rect = r;
    }

    wrap.addEventListener('pointerdown', function (ev) {
      if (!selecting) return;
      ev.preventDefault();
      clearSelection();
      start = norm(ev);
      try { wrap.setPointerCapture(ev.pointerId); } catch (_) { /* unsupported */ }
    });
    wrap.addEventListener('pointermove', function (ev) {
      if (!selecting || !start) return;
      var p = norm(ev);
      if (p) paintBox(rectFrom(start, p));
    });
    wrap.addEventListener('pointerup', function (ev) {
      if (!selecting || !start) return;
      start = null;
      // Too small to be a problem — treat as a mis-tap, not a selection.
      if (!box || !box.rect || box.rect.w < 0.03 || box.rect.h < 0.02) { clearSelection(); return; }
      var r = box.rect;
      confirmEl = d.createElement('div');
      confirmEl.className = 'lws-sd-confirm';
      confirmEl.style.left = (r.x * 100) + '%';
      confirmEl.style.top = (Math.min(0.96, r.y + r.h) * 100) + '%';
      var go = d.createElement('button');
      go.type = 'button'; go.className = 'lws-sd-confirm-go';
      go.textContent = 'Ask my tutor about this';
      go.addEventListener('click', function () { self._askRegion(img, src, r); setMode(false); });
      var no = d.createElement('button');
      no.type = 'button'; no.className = 'lws-sd-confirm-no';
      no.textContent = '✕';
      no.setAttribute('aria-label', 'Clear selection');
      no.addEventListener('click', function () { clearSelection(); });
      confirmEl.appendChild(go); confirmEl.appendChild(no);
      wrap.appendChild(confirmEl);
      try { go.focus(); } catch (_) { /* fine */ }
    });

    return btn;
  };

  // Crop the selected region from the image's natural pixels and hand it off.
  // The crop rides to the tutor as a normal photo upload (OCR and all); the
  // region ref makes the resulting problem card link back here.
  SourceDock.prototype._askRegion = function (img, src, region) {
    var self = this;
    try {
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh) throw new Error('image not loaded');
      var canvas = this.doc.createElement('canvas');
      canvas.width = Math.max(1, Math.round(region.w * nw));
      canvas.height = Math.max(1, Math.round(region.h * nh));
      var ctx2d = canvas.getContext('2d');
      ctx2d.drawImage(img, region.x * nw, region.y * nh, region.w * nw, region.h * nh, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (!blob) { console.error('[LWS] region crop produced no blob'); return; }
        var file = new File([blob], 'worksheet-problem.jpg', { type: 'image/jpeg' });
        try { self.onAskRegion(file, region, src); } catch (e) { console.error('[LWS] onAskRegion failed', e); }
        self.closeSource();
      }, 'image/jpeg', 0.92);
    } catch (e) {
      console.error('[LWS] region crop failed', e);
    }
  };

  SourceDock.prototype.closeSource = function () {
    if (this._escHandler) {
      this.doc.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
  };

  LWS.SourceDock = SourceDock;
  if (typeof module !== 'undefined' && module.exports) module.exports = { SourceDock: SourceDock, _fileUrl: fileUrl };
})(typeof self !== 'undefined' ? self : this);
