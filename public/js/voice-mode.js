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

  function paintButton() {
    if (!btn) return;
    var on = isOn();
    btn.innerHTML = on
      ? '<i class="fas fa-keyboard" aria-hidden="true"></i> Type instead'
      : '<i class="fas fa-microphone" aria-hidden="true"></i> Talk to Maya';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function enter() {
    if (isOn()) return;
    document.body.classList.add('cr-voice');
    paintButton();

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

    var vc = window.voiceController;
    if (vc) {
      try { if (typeof vc.stopListening === 'function') vc.stopListening(); } catch (e) { /* noop */ }
      try { if (typeof vc.stopSpeaking === 'function') vc.stopSpeaking(); } catch (e) { /* noop */ }
    }
  }

  function toggle() { if (isOn()) { exit(); } else { enter(); } }

  function init() {
    var host = document.querySelector('.cr-header-extras');
    if (!host) return;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cr-voice-toggle';
    btn.addEventListener('click', toggle);
    host.insertBefore(btn, host.firstChild);
    paintButton();

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
