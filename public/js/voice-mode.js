/* ============================================================
   voice-mode.js — voice as a layout mode of the chat page

   Adds the missing access point: a header toggle that flips
   body.cr-voice. Entering voice mode reflows the stage (see
   voice-mode.css) and starts the voice engine; exiting restores
   the text layout and stops it.

   The voice engine itself is voice-controller.js (window.
   voiceController) — this file only frames it as a first-class
   mode and gives it an entry point.
   ============================================================ */

(function () {
  'use strict';

  var btn = null;

  function isOn() { return document.body.classList.contains('cr-voice'); }

  // Read the active tutor's display name from the live element that
  // chat-redesign.js's applyTutor() writes into. Falls back to a
  // generic label when the page hasn't bound a tutor yet (e.g. very
  // early in load, before user data resolves). Using textContent
  // means the tutor name is always treated as plain text — no XSS
  // surface even if the config ever sources a name from the server.
  function getActiveTutorName() {
    var el = document.getElementById('cr-tutor-name');
    var name = el ? (el.textContent || '').trim() : '';
    if (!name || name.toLowerCase() === 'tutor') return null;
    return name;
  }

  function paintButton() {
    if (!btn) return;
    var on = isOn();
    var tutorName = getActiveTutorName();

    // Build with DOM nodes (not innerHTML + concatenation) so the
    // tutor name is safely escaped no matter what.
    btn.innerHTML = '';
    var icon = document.createElement('i');
    icon.className = on ? 'fas fa-keyboard' : 'fas fa-microphone';
    icon.setAttribute('aria-hidden', 'true');
    btn.appendChild(icon);

    var label;
    if (on) {
      label = ' Type instead';
    } else if (tutorName) {
      label = ' Talk to ' + tutorName;
    } else {
      label = ' Voice mode';
    }
    btn.appendChild(document.createTextNode(label));
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // Re-paint the button whenever the active tutor name changes so the
  // label tracks tutor switches (chat-redesign.js's applyTutor mutates
  // #cr-tutor-name; this observer is the cleanest contract — no event
  // coupling required).
  function watchTutorName() {
    var el = document.getElementById('cr-tutor-name');
    if (!el || typeof MutationObserver !== 'function') return;
    try {
      new MutationObserver(paintButton).observe(el, {
        childList: true,
        characterData: true,
        subtree: true
      });
    } catch (_) { /* observer unsupported — label stays at initial paint */ }
  }

  // The composer's headset button (#voice-mode-btn) is the primary entry
  // into voice — it toggles voice in place (no separate page). It reads
  // "talk" when idle and "end" once voice mode is on.
  function paintComposerEntry() {
    var b = document.getElementById('voice-mode-btn');
    if (!b) return;
    var on = isOn();
    var label = on ? 'End voice mode' : 'Talk to your tutor';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function enter() {
    if (isOn()) return;
    document.body.classList.add('cr-voice');
    paintButton();
    paintComposerEntry();

    // Kick off the voice engine. The click that called enter() is a
    // user gesture, so getUserMedia inside startListening() is allowed.
    var vc = window.voiceController;
    if (vc && !vc.isListening && typeof vc.startListening === 'function') {
      Promise.resolve()
        .then(function () { return vc.startListening(); })
        .catch(function () { /* mic denied or unavailable — mode still usable */ });
    }
  }

  function exit() {
    if (!isOn()) return;
    document.body.classList.remove('cr-voice');
    paintButton();
    paintComposerEntry();

    var vc = window.voiceController;
    if (vc) {
      try { if (typeof vc.stopListening === 'function') vc.stopListening(); } catch (e) { /* noop */ }
      try { if (typeof vc.stopSpeaking === 'function') vc.stopSpeaking(); } catch (e) { /* noop */ }
    }
  }

  function toggle() { if (isOn()) { exit(); } else { enter(); } }

  // Open the unified upload menu (Take a photo / Upload a file / Scan with
  // phone) from voice mode, where the composer's camera/paperclip buttons are
  // hidden. unified-upload.js owns that flow now; we pass our own button as the
  // anchor so the popover positions next to the voice control instead of the
  // hidden camera button (whose rect is 0×0 while the composer is display:none,
  // which would strand the menu in the top-left corner). Falls back to clicking
  // the legacy buttons on older builds without unified upload.
  function openShowYourWork() {
    var self = document.getElementById('mpc-voice-work');
    if (window.UnifiedUpload && typeof window.UnifiedUpload.open === 'function') {
      window.UnifiedUpload.open(self);
      return;
    }
    var cam = document.getElementById('camera-button');
    if (cam) { cam.click(); return; }
    var attach = document.getElementById('attach-button');
    if (attach) attach.click();
  }

  // Expose a tiny API so other surfaces (mobile nav, etc.) can open voice
  // without knowing the internals. There is no separate voice page anymore.
  window.voiceMode = { toggle: toggle, enter: enter, exit: exit, isOn: isOn };

  // Wire a voice entry button to the in-place toggle. If this is the
  // paywall-locked sidebar entry (its lock icon is showing), stand down and
  // let script.js's upgrade-prompt handler take the click instead.
  function bindEntry(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      var lock = document.getElementById('voice-tutor-lock');
      if (lock && getComputedStyle(lock).display !== 'none') return;
      e.preventDefault();
      toggle();
    });
  }

  function init() {
    // Every voice entry toggles voice in place — there's no separate voice
    // page now. The composer headset is the primary entry; the sidebar
    // "Voice Tutor" button is a second, paywall-gated one.
    bindEntry('voice-mode-btn');
    bindEntry('sidebar-voice-tutor-btn');
    paintComposerEntry();

    // Mobile control dock: on phones the composer is swapped for a dock
    // (mobile-poster-chat.css). The orb is the mic; this is the way out.
    // CSS shows it only when body.cr-voice on mobile, so it's harmless to
    // create unconditionally here.
    if (!document.getElementById('mpc-voice-end')) {
      var endBtn = document.createElement('button');
      endBtn.type = 'button';
      endBtn.id = 'mpc-voice-end';
      endBtn.title = 'End voice';
      endBtn.setAttribute('aria-label', 'End voice');
      endBtn.innerHTML = '<i class="fas fa-phone-slash" aria-hidden="true"></i>';
      endBtn.addEventListener('click', exit);
      document.body.appendChild(endBtn);
    }

    // Voice-mode "show your work / upload" control. The composer's paperclip
    // and camera buttons are hidden in voice mode, so this flanks the mic as
    // the way to snap or upload work without leaving the call. CSS reveals it
    // only when body.cr-voice (mirrors #mpc-voice-end), so creating it
    // unconditionally here is harmless.
    if (!document.getElementById('mpc-voice-work')) {
      var workBtn = document.createElement('button');
      workBtn.type = 'button';
      workBtn.id = 'mpc-voice-work';
      workBtn.title = 'Show your work / upload';
      workBtn.setAttribute('aria-label', 'Show your work or upload');
      workBtn.innerHTML = '<i class="fas fa-camera-retro" aria-hidden="true"></i>';
      workBtn.addEventListener('click', openShowYourWork);
      document.body.appendChild(workBtn);
    }

    var host = document.querySelector('.cr-header-extras');
    if (host) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cr-voice-toggle';
      btn.addEventListener('click', toggle);
      host.insertBefore(btn, host.firstChild);
      paintButton();
      watchTutorName();
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOn()) exit();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
