/* public/js/phone-link.js
 *
 * Desktop side of "scan with your phone".
 *
 * Flow:
 *   1. Student clicks "Scan with phone" → POST /api/phone-link/create.
 *   2. We show a modal with a QR code + 4-digit PIN, and start polling
 *      /api/phone-link/pending.
 *   3. When the phone has uploaded, we fetch the image bytes, hand them to the
 *      existing file-upload manager (so the photo rides the normal /api/chat
 *      pipeline — worksheet guard, visual gate, moderation all apply), then
 *      tell the server to discard the pairing.
 *
 * This module is self-contained: it injects its own trigger button and modal,
 * so wiring it up is just a <script> include. It no-ops gracefully if the
 * chat surface (#hero-actions / fileUploadManager) isn't present.
 */
(function () {
  'use strict';

  var POLL_MS = 3000;
  var state = { pollTimer: null, expiryTimer: null, expiresAt: null, open: false };

  function fetchFn() { return window.csrfFetch || window.fetch; }

  // ---- Styling (scoped, injected once) ------------------------------------
  function injectStyles() {
    if (document.getElementById('phone-link-styles')) return;
    var css = ''
      + '.pl-overlay{position:fixed;inset:0;background:rgba(26,26,46,.55);display:flex;'
      + 'align-items:center;justify-content:center;z-index:10000;padding:20px;}'
      + '.pl-card{background:#fff;border-radius:18px;max-width:380px;width:100%;padding:26px 24px;'
      + 'text-align:center;box-shadow:0 18px 50px rgba(26,26,46,.3);font-family:inherit;color:#1a1a2e;}'
      + '.pl-card h3{margin:0 0 6px;font-size:1.2rem;}'
      + '.pl-card p{margin:0 0 16px;color:#6b7280;font-size:.9rem;}'
      + '.pl-qr{width:200px;height:200px;margin:6px auto 14px;display:block;border-radius:10px;}'
      + '.pl-pin{font-size:2rem;font-weight:800;letter-spacing:.35em;color:#12B3B3;margin:4px 0 2px;}'
      + '.pl-pin-label{font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;}'
      + '.pl-status{margin-top:16px;font-size:.88rem;color:#6b7280;min-height:1.2em;}'
      + '.pl-status.ok{color:#1f9d57;font-weight:600;}'
      + '.pl-status.err{color:#d64545;}'
      + '.pl-close{margin-top:18px;border:none;background:#eef1f7;color:#1a1a2e;border-radius:10px;'
      + 'padding:11px 18px;font-weight:600;cursor:pointer;width:100%;}'
      + '.pl-trigger i{margin-right:6px;}'
      + '.pl-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#12B3B3;'
      + 'margin-right:6px;animation:pl-pulse 1.2s infinite;}'
      + '@keyframes pl-pulse{0%,100%{opacity:.3}50%{opacity:1}}';
    var style = document.createElement('style');
    style.id = 'phone-link-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Modal --------------------------------------------------------------
  function buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'pl-overlay';
    overlay.id = 'pl-overlay';
    overlay.innerHTML =
      '<div class="pl-card" role="dialog" aria-modal="true" aria-label="Scan with your phone">'
      + '<h3>Scan with your phone</h3>'
      + '<p>Scan this code with your phone\'s camera, then enter the PIN below to send a photo.</p>'
      + '<img class="pl-qr" id="pl-qr" alt="QR code linking to the upload page" />'
      + '<div class="pl-pin-label">PIN</div>'
      + '<div class="pl-pin" id="pl-pin">····</div>'
      + '<div class="pl-status" id="pl-status"><span class="pl-dot"></span>Waiting for your photo…</div>'
      + '<button class="pl-close" id="pl-close">Cancel</button>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.getElementById('pl-close').addEventListener('click', closeModal);
    return overlay;
  }

  function setStatus(text, kind) {
    var el = document.getElementById('pl-status');
    if (!el) return;
    el.className = 'pl-status' + (kind ? ' ' + kind : '');
    el.innerHTML = (kind ? '' : '<span class="pl-dot"></span>') + text;
  }

  function closeModal() {
    stopPolling();
    if (state.expiryTimer) { clearTimeout(state.expiryTimer); state.expiryTimer = null; }
    var overlay = document.getElementById('pl-overlay');
    if (overlay) overlay.remove();
    state.open = false;
  }

  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  // ---- Core flow ----------------------------------------------------------
  async function openModal() {
    if (state.open) return;
    injectStyles();

    try {
      var res = await fetchFn()('/api/phone-link/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: window.currentConversationId || null })
      });
      var data = await res.json();
      if (!res.ok || !data.success) {
        alert((data && data.message) || 'Could not start phone pairing. Please try again.');
        return;
      }

      state.open = true;
      buildModal();
      var qr = document.getElementById('pl-qr');
      if (data.qrDataUrl) qr.src = data.qrDataUrl;
      else qr.replaceWith(linkFallback(data.linkUrl));
      document.getElementById('pl-pin').textContent = data.pin;

      state.expiresAt = new Date(data.expiresAt).getTime();
      scheduleExpiry();
      startPolling();
    } catch (err) {
      console.error('[PhoneLink] create failed', err);
      alert('Could not start phone pairing. Please try again.');
    }
  }

  function linkFallback(url) {
    var a = document.createElement('a');
    a.href = url; a.textContent = 'Open upload link';
    a.style.cssText = 'display:block;margin:10px 0;color:#12B3B3;word-break:break-all;';
    return a;
  }

  function scheduleExpiry() {
    var ms = state.expiresAt - Date.now();
    if (ms <= 0) { onExpired(); return; }
    state.expiryTimer = setTimeout(onExpired, ms);
  }

  function onExpired() {
    stopPolling();
    setStatus('This code expired. Close and try again.', 'err');
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(pollOnce, POLL_MS);
  }

  async function pollOnce() {
    try {
      var res = await fetchFn()('/api/phone-link/pending');
      if (!res.ok) return;
      var data = await res.json();
      var pending = (data && data.pending) || [];
      if (pending.length > 0) {
        stopPolling();
        await deliver(pending[0]);
      }
    } catch (err) {
      // Transient — keep polling.
      console.debug('[PhoneLink] poll error', err && err.message);
    }
  }

  // Pull the uploaded image and feed it into the existing chat upload path.
  async function deliver(item) {
    setStatus('Photo received — adding it to your chat…', 'ok');
    try {
      var res = await fetchFn()('/api/phone-link/image/' + encodeURIComponent(item.id));
      if (!res.ok) throw new Error('image fetch failed');
      var blob = await res.blob();
      var name = item.originalName || 'phone-photo.jpg';
      var file = new File([blob], name, { type: item.mimeType || blob.type || 'image/jpeg' });

      if (window.fileUploadManager && typeof window.fileUploadManager.handleFile === 'function') {
        window.fileUploadManager.handleFile(file);
      } else if (typeof window.handleFileUpload === 'function') {
        window.handleFileUpload([file]);
      } else {
        throw new Error('no upload handler available');
      }

      // Discard the server-side pairing now that we hold the bytes locally.
      fetchFn()('/api/phone-link/consume/' + encodeURIComponent(item.id), { method: 'POST' })
        .catch(function () { /* TTL will reap it anyway */ });

      closeModal();
      if (typeof window.Notify !== 'undefined' && window.Notify.success) {
        window.Notify.success('Photo added from your phone. Add a message or just hit send.');
      }
    } catch (err) {
      console.error('[PhoneLink] deliver failed', err);
      setStatus('Could not load the photo. Please try again.', 'err');
      startPolling();
    }
  }

  // ---- Trigger button -----------------------------------------------------
  function injectTrigger() {
    var host = document.getElementById('hero-actions');
    if (!host || document.getElementById('pl-trigger-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'pl-trigger-btn';
    btn.className = 'hero-action-btn pl-trigger';
    btn.setAttribute('aria-label', 'Scan with your phone');
    btn.innerHTML = '<i class="fas fa-qrcode"></i><span>Scan with phone</span>';
    btn.addEventListener('click', openModal);
    host.appendChild(btn);
  }

  function init() {
    injectTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for explicit wiring / testing.
  window.PhoneLink = { open: openModal, close: closeModal };
})();
