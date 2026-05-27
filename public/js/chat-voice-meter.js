// chat-voice-meter.js
// Wire the "Live with <tutor>" pill's waveform to the real TTS playback.
//
// The pill's bars used to be a pure CSS keyframe animation (six spans
// with staggered heights). Now: when audio.js dispatches
// audioPlaybackStarted, we drive the bars from frequency data on the
// playback analyser. When playback ends, hand control back to the CSS
// keyframes so the pill keeps a subtle idle pulse.

import { createStripMeter } from './modules/voice-meter.js';

(function () {
  if (!document.body.classList.contains('cr-mode')) return;

  const container = document.querySelector('.cr-waveform');
  if (!container) return;

  const meter = createStripMeter(container);
  let raf = 0;
  let analyser = null;
  let buf = null;

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    analyser = null;
    buf = null;
    meter.idle();
  }

  function loop() {
    if (!analyser) return;
    analyser.getByteFrequencyData(buf);
    meter.update(buf);
    raf = requestAnimationFrame(loop);
  }

  document.addEventListener('audioPlaybackStarted', (e) => {
    const a = e && e.detail && e.detail.analyser;
    if (!a) return;
    analyser = a;
    buf = new Uint8Array(analyser.frequencyBinCount);
    if (raf) cancelAnimationFrame(raf);
    loop();
  });

  document.addEventListener('audioPlaybackEnded', stop);
})();
