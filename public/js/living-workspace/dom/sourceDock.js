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

  function SourceDock(container) {
    this.doc = container.ownerDocument || document;
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

  // Full-board read-only viewer, same pattern as the derivation's archive
  // overlay: it covers the board, never replaces it, Esc or Back returns.
  SourceDock.prototype.openSource = function (src, name) {
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
      var img = d.createElement('img');
      img.className = 'lws-sd-ov-img';
      img.alt = name;
      img.src = fileUrl(src.uploadId);

      var ctl = d.createElement('span'); ctl.className = 'lws-sd-ov-zoom';
      var zOut = d.createElement('button'); zOut.type = 'button'; zOut.textContent = '−'; zOut.setAttribute('aria-label', 'Zoom out');
      var zIn = d.createElement('button'); zIn.type = 'button'; zIn.textContent = '+'; zIn.setAttribute('aria-label', 'Zoom in');
      function applyZoom() {
        zoom = Math.max(0.5, Math.min(4, zoom));
        img.style.width = (zoom * 100) + '%';
        zOut.disabled = zoom <= 0.5;
        zIn.disabled = zoom >= 4;
      }
      zOut.addEventListener('click', function () { zoom -= 0.25; applyZoom(); });
      zIn.addEventListener('click', function () { zoom += 0.25; applyZoom(); });
      ctl.appendChild(zOut); ctl.appendChild(zIn);
      bar.appendChild(ctl);
      applyZoom();
      body.appendChild(img);
    }

    bar.appendChild(back);
    ov.appendChild(bar); ov.appendChild(body);
    this.el.container.appendChild(ov);
    this._overlay = ov;
    this._escHandler = function (ev) { if (ev.key === 'Escape') self.closeSource(); };
    d.addEventListener('keydown', this._escHandler);
    try { back.focus(); } catch (_) { /* not focusable yet */ }
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
