/* public/js/unified-upload.js
 *
 * One front door for uploads.
 *
 * Before: two toolbar buttons with two separate processes — a paperclip
 * ("Upload", → chat) and a camera ("Show your work", → grading modal). The
 * student had to pick the pipeline before they'd even taken the picture.
 *
 * After: a single entry (the camera button) opens a small capture menu —
 * Take a photo / Upload a file / Scan with phone. Every source lands in the
 * same chat attach tray, where the card classifies the image and suggests the
 * right one-tap action ("Check my work" vs "Help me with this"). See
 * decorateSmartCard() in script.js.
 *
 * This module is self-contained (injects its own menu + styles) and wires by
 * id, so chat.html only needs the <script> include. It no-ops gracefully if
 * the toolbar isn't present.
 */
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('unified-upload-styles')) return;
    var css = ''
      // Capture menu (popover above the toolbar button)
      + '.uu-menu{position:fixed;z-index:10050;background:#fff;border-radius:14px;'
      + 'box-shadow:0 12px 40px rgba(26,26,46,.22);padding:6px;min-width:220px;'
      + 'border:1px solid rgba(0,0,0,.06);animation:uu-pop .14s ease-out;}'
      + '.uu-item{display:flex;align-items:center;gap:12px;width:100%;border:none;'
      + 'background:transparent;padding:11px 12px;border-radius:10px;cursor:pointer;'
      + 'font-size:.95rem;color:#1a1a2e;text-align:left;font-family:inherit;}'
      + '.uu-item:hover{background:#f1f3f9;}'
      + '.uu-item i{width:20px;text-align:center;color:#12B3B3;font-size:1.05rem;}'
      + '.uu-item-sub{display:block;font-size:.74rem;color:#8a90a2;margin-top:1px;}'
      + '.uu-item-text{display:flex;flex-direction:column;line-height:1.15;}'
      + '@keyframes uu-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}'
      // Suggestion bar — full-width strip above the compose row (rendered by
      // script.js). Lives outside the thumbnail grid, so it never gets clipped.
      + '.smart-suggest-bar{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;'
      + 'padding:9px 13px;margin:8px 10px 0;border-radius:12px;'
      + 'background:rgba(18,179,179,.07);border:1px solid rgba(18,179,179,.22);'
      + 'animation:uu-pop .14s ease-out;}'
      + '.ssb-hint{flex:1 1 180px;min-width:140px;font-size:.84rem;color:#374151;line-height:1.3;'
      + 'display:flex;align-items:center;gap:7px;}'
      + '.ssb-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}'
      + '.fcs-chip{display:inline-flex;align-items:center;justify-content:center;'
      + 'gap:5px;border:1px solid #d7dbe6;background:#fff;color:#1a1a2e;border-radius:9px;'
      + 'padding:8px 12px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;'
      + 'white-space:nowrap;transition:background .12s,border-color .12s,box-shadow .12s;}'
      + '.fcs-chip:hover{background:#f1f3f9;}'
      + '.fcs-chip.fcs-suggested{background:linear-gradient(135deg,#12B3B3,#0e9a9a);'
      + 'border-color:transparent;color:#fff;box-shadow:0 3px 10px rgba(18,179,179,.32);}'
      + '.fcs-chip.fcs-suggested:hover{filter:brightness(1.04);background:linear-gradient(135deg,#12B3B3,#0e9a9a);}'
      + '.fcs-tag{flex:0 0 auto;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;'
      + 'background:rgba(255,255,255,.28);padding:2px 5px;border-radius:6px;}'
      // Subordinate opt-in: the gamified scored breakdown, visually quieter than
      // the two primary conversational chips.
      + '.fcs-scored{display:inline-flex;align-items:center;justify-content:center;gap:5px;'
      + 'background:none;border:none;color:#8a90a2;font-size:.72rem;font-weight:600;cursor:pointer;'
      + 'font-family:inherit;padding:2px 4px;margin-top:1px;text-decoration:underline;'
      + 'text-underline-offset:2px;}'
      + '.fcs-scored:hover{color:#12B3B3;}';
    var style = document.createElement('style');
    style.id = 'unified-upload-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Hidden input dedicated to the "Take a photo" action. On mobile, the
  // `capture` attribute opens the camera directly; on desktop it falls back to
  // the file picker (acceptable — desktops rarely have a relevant camera, and
  // "Upload a file" covers them).
  function ensureCameraInput() {
    var input = document.getElementById('uu-camera-input');
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'uu-camera-input';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) routeFile(file);
      input.value = '';
    });
    document.body.appendChild(input);
    return input;
  }

  // Hand a captured file to the existing chat attach tray, which classifies it
  // and renders the smart action chooser.
  function routeFile(file) {
    if (window.fileUploadManager && typeof window.fileUploadManager.handleFile === 'function') {
      window.fileUploadManager.handleFile(file);
    } else if (typeof window.handleFileUpload === 'function') {
      window.handleFileUpload([file]);
    } else {
      console.error('[unifiedUpload] no upload handler available');
    }
  }

  function closeMenu() {
    var menu = document.getElementById('uu-menu');
    if (menu) menu.remove();
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeydown, true);
  }

  function onOutsideClick(e) {
    var menu = document.getElementById('uu-menu');
    if (menu && !menu.contains(e.target) && e.target.id !== 'camera-button' && !e.target.closest('#camera-button')) {
      closeMenu();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeMenu();
  }

  function openMenu(anchor) {
    if (document.getElementById('uu-menu')) { closeMenu(); return; }
    injectStyles();

    var phoneAvailable = !!(window.PhoneLink && typeof window.PhoneLink.open === 'function');

    var menu = document.createElement('div');
    menu.className = 'uu-menu';
    menu.id = 'uu-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
        '<button class="uu-item" data-action="photo" role="menuitem">'
      + '<i class="fas fa-camera"></i><span class="uu-item-text">Take a photo'
      + '<span class="uu-item-sub">Snap your worksheet or a problem</span></span></button>'
      + '<button class="uu-item" data-action="upload" role="menuitem">'
      + '<i class="fas fa-image"></i><span class="uu-item-text">Upload a file'
      + '<span class="uu-item-sub">Photo or PDF from this device</span></span></button>'
      + (phoneAvailable
          ? '<button class="uu-item" data-action="phone" role="menuitem">'
            + '<i class="fas fa-qrcode"></i><span class="uu-item-text">Scan with phone'
            + '<span class="uu-item-sub">Use your phone\'s camera</span></span></button>'
          : '');
    document.body.appendChild(menu);

    // Position above the anchor button, left-aligned, clamped to the viewport.
    var r = anchor.getBoundingClientRect();
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8));
    var top = r.top - mh - 8;
    if (top < 8) top = r.bottom + 8; // flip below if no room above
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('.uu-item');
      if (!item) return;
      var action = item.getAttribute('data-action');
      closeMenu();
      if (action === 'photo') {
        ensureCameraInput().click();
      } else if (action === 'upload') {
        var fi = document.getElementById('file-input');
        if (fi) fi.click();
        else ensureCameraInput().click();
      } else if (action === 'phone') {
        window.PhoneLink.open();
      }
    });

    // Defer outside-click binding so this opening click doesn't immediately close it.
    setTimeout(function () {
      document.addEventListener('click', onOutsideClick, true);
      document.addEventListener('keydown', onKeydown, true);
    }, 0);
  }

  function init() {
    // Inject styles up front: the smart-card chips (rendered by script.js after
    // ANY upload, including drag-drop that never opens the menu) depend on the
    // .fcs-* rules, so they can't wait for the first menu open.
    injectStyles();

    // Collapse to a single entry: the camera button becomes the unified "add"
    // affordance; the separate paperclip is redundant now that the menu offers
    // "Upload a file".
    var attach = document.getElementById('attach-button');
    if (attach) attach.style.display = 'none';

    var camera = document.getElementById('camera-button');
    if (!camera) return;
    camera.setAttribute('data-tip', 'Add your math');
    camera.setAttribute('aria-label', 'Add a photo or file');
    camera.setAttribute('aria-haspopup', 'menu');
    camera.addEventListener('click', function (e) {
      e.preventDefault();
      openMenu(camera);
    });

    // Drag-and-drop (file-upload.js) still works and lands in the same smart
    // tray — no change needed there.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.UnifiedUpload = { open: function () { var c = document.getElementById('camera-button'); if (c) openMenu(c); } };
})();
