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
   fileType} references. Region selection and source↔problem linking
   (spec §5.3–5.4) build on top of this surface in a later slice.

   Browser-only view; the pure list logic lives in core/sourceList.js.
   ============================================================ */
(function (root) {
  'use strict';
  var LWS = (root.LWS = root.LWS || {});

  function fileUrl(uploadId) {
    return '/api/student/uploads/' + encodeURIComponent(uploadId) + '/file';
  }

  function SourceDock(container, opts) {
    opts = opts || {};
    this.doc = container.ownerDocument || document;
    // Called with (cropFile, region, src) when the student confirms a selected
    // problem region. The integration owns the send (it goes through chat, the
    // one path the tutor can see) — the dock never invents its own.
    this.onAskRegion = typeof opts.onAskRegion === 'function' ? opts.onAskRegion : null;
    this._sources = [];
    this._overlay = null;
    this._escHandler = null;

    var d = this.doc;
    var dock = d.createElement('div');
    dock.className = 'lws-sd';
    dock.hidden = true;

    var head = d.createElement('button');
    head.type = 'button';
    head.className = 'lws-sd-head';
    head.setAttribute('aria-expanded', 'true');
    head.innerHTML = '<span class="lws-sd-head-ic" aria-hidden="true">📎</span><span class="lws-sd-head-t">My materials</span>';
    var self = this;
    head.addEventListener('click', function () {
      var collapsed = dock.classList.toggle('is-collapsed');
      head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });

    var strip = d.createElement('div');
    strip.className = 'lws-sd-strip';
    strip.setAttribute('role', 'list');
    strip.setAttribute('aria-label', 'Uploaded materials');

    dock.appendChild(head);
    dock.appendChild(strip);
    container.appendChild(dock);
    this.el = { root: dock, strip: strip, container: container };
    void self; // bound handlers only
  }

  SourceDock.prototype.setSources = function (sources) {
    this._sources = Array.isArray(sources) ? sources : [];
    this._render();
  };

  SourceDock.prototype.clear = function () {
    this.closeSource();
    this._sources = [];
    this._render();
  };

  SourceDock.prototype._render = function () {
    var self = this;
    var d = this.doc;
    var strip = this.el.strip;
    strip.textContent = '';
    this.el.root.hidden = this._sources.length === 0;

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
        img.loading = 'lazy';
        img.src = fileUrl(src.uploadId);
        b.appendChild(img);
      }
      var lab = d.createElement('span');
      lab.className = 'lws-sd-card-lab';
      lab.textContent = name;
      b.appendChild(lab);

      b.addEventListener('click', function () { self.openSource(src, name); });
      strip.appendChild(b);
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
      img.src = fileUrl(src.uploadId);
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
  if (typeof module !== 'undefined' && module.exports) module.exports = { SourceDock: SourceDock };
})(typeof self !== 'undefined' ? self : this);
