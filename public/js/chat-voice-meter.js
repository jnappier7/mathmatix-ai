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

  // Voice-reactive glow: the same frequency data that drives the pill bars
  // also drives a light halo behind the tutor portrait, via the --voice-amp
  // custom property on .cr-tutor-hero. Reduced-motion is honoured by simply
  // never writing it — the glow then rests at its faint CSS baseline.
  const hero = document.querySelector('.cr-tutor-hero');
  const reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let amp = 0;

  function setAmp(v) {
    if (!hero) return;
    amp = v;
    hero.style.setProperty('--voice-amp', v.toFixed(3));
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    analyser = null;
    buf = null;
    setAmp(0);
    meter.idle();
  }

  function loop() {
    // Self-terminate if the audio context was closed under us. stopAudio()
    // in modules/audio.js closes the context without dispatching
    // audioPlaybackEnded, so without this check the loop would keep polling
    // a dead analyser and the bars would freeze at floor value instead of
    // returning to the CSS keyframe pulse.
    if (!analyser || (analyser.context && analyser.context.state === 'closed')) {
      stop();
      return;
    }
    analyser.getByteFrequencyData(buf);
    meter.update(buf);

    // Collapse the voice band (low half of the spectrum) to a single RMS
    // envelope and ease it onto the glow. Fast attack / slow release reads
    // as "breathing" rather than strobing; the ×1.6 lift keeps quiet speech
    // visible. smoothingTimeConstant on the analyser already pre-smooths.
    if (hero && !reduceMotion) {
      const usable = Math.floor(buf.length * 0.5) || buf.length;
      let sum = 0;
      for (let i = 0; i < usable; i++) { const v = buf[i] / 255; sum += v * v; }
      const rms = Math.sqrt(sum / usable);
      const target = Math.min(1, rms * 1.6);
      setAmp(amp + (target - amp) * (target > amp ? 0.45 : 0.18));
    }

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
