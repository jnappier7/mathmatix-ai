// Live Two-Minute Drill — stadium sound for the PROJECTOR only (public/live-drill-host.html).
// Phones stay silent on purpose: thirty phones beeping out of sync is noise, not energy.
//
// Everything is synthesized with Web Audio — no files, nothing to load or license. Browsers only
// let a page make sound after a click, so unlock() runs on the teacher's first click (Open lobby,
// Kick off, …). Muting is remembered on this device.
(function () {
  const KEY = 'mm-live-drill-muted';
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** One shaped note: oscillator → envelope → out. */
  function note({ freq, type = 'sine', start = 0, dur = 0.2, vol = 0.2, slideTo }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const S = {
    unlock,
    get muted() { return muted; },
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* private mode */ }
    },
    /** Referee's whistle: kickoff. */
    whistle() {
      note({ freq: 2600, type: 'square', dur: 0.12, vol: 0.06 });
      note({ freq: 2800, type: 'square', start: 0.14, dur: 0.38, vol: 0.06 });
    },
    /** Stadium horn: touchdown. A brassy fifth, twice. */
    horn() {
      [0, 0.42].forEach((s) => {
        note({ freq: 196, type: 'sawtooth', start: s, dur: 0.36, vol: 0.12 });
        note({ freq: 294, type: 'sawtooth', start: s, dur: 0.36, vol: 0.09 });
        note({ freq: 392, type: 'square', start: s, dur: 0.36, vol: 0.04 });
      });
    },
    /** Clock tick for the last five seconds. */
    tick(last) { note({ freq: last ? 1320 : 990, type: 'triangle', dur: 0.08, vol: 0.18 }); },
    /** The reveal: three rising notes. */
    chime() { [660, 880, 1100].forEach((f, i) => note({ freq: f, type: 'triangle', start: i * 0.09, dur: 0.3, vol: 0.13 })); },
    /** End of the game. */
    buzzer() { note({ freq: 140, type: 'sawtooth', dur: 0.9, vol: 0.14, slideTo: 110 }); },
  };
  window.LiveDrillSound = S;
})();
