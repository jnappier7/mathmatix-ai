// Live Two-Minute Drill — stadium sound for the PROJECTOR only (public/live-drill-host.html).
// Phones stay silent on purpose: thirty phones beeping out of sync is noise, not energy.
//
// Everything is synthesized with Web Audio — no files, nothing to load or license. Browsers only
// let a page make sound after a click, so unlock() runs on the teacher's first click (Open lobby,
// Kick off, …). Three switches, each remembered on this device:
//   Sound — the master. Muted means silent, whatever the other two say.
//   Music — an original drumline + bass loop under the lobby and the game. OFF until turned on:
//           a room that's taking a test next door shouldn't get a marching band by surprise.
//   Crowd — a stadium murmur during play that builds as a ball nears the goal line, a cheer on a
//           touchdown, and (Huddle) a cheer or a groan on the reveal. On by default.
// The page says WHERE the game is with scene(); this module decides what that sounds like.
(function () {
  const KEYS = { muted: 'mm-live-drill-muted', music: 'mm-live-drill-music', crowd: 'mm-live-drill-crowd' };
  const read = (k, dflt) => { try { const v = localStorage.getItem(k); return v == null ? dflt : v === '1'; } catch { return dflt; } };
  const save = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ } };

  let muted = read(KEYS.muted, false);
  let musicOn = read(KEYS.music, false);
  let crowdOn = read(KEYS.crowd, true);
  let scene = 'setup';
  let hype = 0;

  let ctx = null;
  let master = null; let sfx = null; let music = null; let crowd = null;
  let noise = null; // 2 s of white noise, shared by every crowd and drum voice

  // Mix levels by scene. Music sits under the thinking and ducks hard for a reveal.
  const MUSIC_LEVEL = { setup: 0.6, lobby: 0.9, live: 0.55, reveal: 0.2 };
  const CROWD_LEVEL = { lobby: 0.25, live: 0.45, reveal: 0.45 };

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      master.gain.value = muted ? 0 : 1;
      [sfx, music, crowd] = [1, 0, 0].map((v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(master); return g; });
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      mix();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  const live = () => ctx && !muted;
  function ramp(param, v, secs = 0.4) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(v, t + secs);
  }

  /** Bring the music and crowd beds in line with the switches and the scene. */
  function mix() {
    if (!ctx) return;
    ramp(master.gain, muted ? 0 : 1, 0.15);
    const m = musicOn && !muted ? (MUSIC_LEVEL[scene] || 0) : 0;
    ramp(music.gain, m * 0.5, scene === 'reveal' ? 0.25 : 0.8);
    if (m > 0) startBand(); else later(stopBand, 900);
    const c = crowdOn && !muted ? (CROWD_LEVEL[scene] || 0) : 0;
    ramp(crowd.gain, c * (0.6 + 0.8 * hype), 1.2);
    if (c > 0) startMurmur(); else later(stopMurmur, 1300);
  }
  const pending = new Set();
  function later(fn, ms) {
    const t = setTimeout(() => { pending.delete(t); fn(); }, ms);
    pending.add(t);
  }

  // ---------------------------------------------------------------- one-shot voices

  /** One shaped note: oscillator → envelope → bus. `at` is an absolute context time. */
  function tone({ freq, type = 'sine', at, start = 0, dur = 0.2, vol = 0.2, slideTo, bus = sfx, filter }) {
    if (!live()) return;
    const t0 = at != null ? at : ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = osc;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; out = osc.connect(f); }
    out.connect(gain).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Filtered noise with an attack/decay envelope — snares, hats, claps, cheers. */
  function hiss({ at, start = 0, dur = 0.1, vol = 0.2, type = 'highpass', freq = 1000, q = 0.7, attack = 0.005, bus = sfx, slideTo }) {
    if (!live()) return;
    const t0 = at != null ? at : ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = dur > 1.9;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  // ---------------------------------------------------------------- the band (music bus)
  // An original 4-bar drumline groove in E minor at 128 bpm, sixteenth-note grid. A fill closes
  // every phrase so the loop reads as a cadence, not a metronome.
  const BPM = 128;
  const STEP = 60 / BPM / 4;
  const N = { B1: 61.74, C2: 65.41, D2: 73.42, E2: 82.41, G2: 98, A2: 110, E4: 329.63, G4: 392, B4: 493.88, D5: 587.33 };
  const BASS = [
    { 0: 'E2', 3: 'E2', 6: 'E2', 8: 'G2', 11: 'A2' },
    { 0: 'E2', 3: 'E2', 6: 'E2', 8: 'G2', 11: 'B1', 14: 'D2' },
    { 0: 'E2', 3: 'E2', 6: 'E2', 8: 'G2', 11: 'A2' },
    { 0: 'C2', 3: 'C2', 6: 'D2', 8: 'D2', 12: 'B1' },
  ];
  const KICK = [0, 6, 8, 11];
  let band = null; // { timer, next, step }

  function kick(t) {
    if (!live()) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g).connect(music);
    osc.start(t); osc.stop(t + 0.3);
  }
  function snare(t, vol = 0.5) {
    hiss({ at: t, dur: 0.14, vol, freq: 1800, bus: music });
    tone({ at: t, freq: 190, type: 'triangle', dur: 0.07, vol: vol * 0.5, bus: music });
  }
  function playStep(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const fill = bar === 3;
    if (fill ? s === 0 || s === 8 : KICK.includes(s)) kick(t);
    if (fill && s >= 8) snare(t, 0.22 + (s - 8) * 0.05);
    else if (s === 4 || s === 12) snare(t);
    if (s % 2 === 0 && !(fill && s >= 8)) hiss({ at: t, dur: s === 14 ? 0.12 : 0.035, vol: s % 4 === 0 ? 0.12 : 0.07, freq: 7000, bus: music });
    const b = BASS[bar][s];
    if (b) tone({ at: t, freq: N[b], type: 'sawtooth', dur: STEP * 2.2, vol: 0.32, filter: 520, bus: music });
    // stadium-organ stab on the downbeat of bars 1 and 3
    if (s === 0 && (bar === 0 || bar === 2)) ['E4', 'G4', 'B4'].forEach((k) => tone({ at: t, freq: N[k], type: 'square', dur: 0.16, vol: 0.035, filter: 2400, bus: music }));
    if (fill && s === 14) tone({ at: t, freq: N.D5, type: 'square', dur: 0.2, vol: 0.03, filter: 2400, bus: music });
  }
  function startBand() {
    if (band || !ctx) return;
    band = { next: ctx.currentTime + 0.06, step: 0, timer: null };
    const pump = () => {
      while (band.next < ctx.currentTime + 0.15) {
        playStep(band.step, band.next);
        band.step = (band.step + 1) % 64;
        band.next += STEP;
      }
    };
    band.timer = setInterval(pump, 30);
    pump();
  }
  function stopBand() {
    if (!band || (musicOn && !muted && MUSIC_LEVEL[scene])) return; // switched back on meanwhile
    clearInterval(band.timer);
    band = null;
  }

  // ---------------------------------------------------------------- the crowd (crowd bus)
  let murmur = null; // { src, lfo }
  function startMurmur() {
    if (murmur || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    const lo = ctx.createBiquadFilter(); lo.type = 'lowpass'; lo.frequency.value = 900;
    const hi = ctx.createBiquadFilter(); hi.type = 'highpass'; hi.frequency.value = 180;
    const g = ctx.createGain(); g.gain.value = 0.35;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.17; // a crowd breathes
    const depth = ctx.createGain(); depth.gain.value = 0.12;
    lfo.connect(depth).connect(g.gain);
    src.connect(lo).connect(hi).connect(g).connect(crowd);
    src.start(); lfo.start();
    murmur = { src, lfo };
  }
  function stopMurmur() {
    if (!murmur || (crowdOn && !muted && CROWD_LEVEL[scene])) return;
    try { murmur.src.stop(); murmur.lfo.stop(); } catch { /* already stopped */ }
    murmur = null;
  }
  /** The stands go up: a roar, scattered claps, a few voices. Plays on the sfx bus so it's heard
   *  even in the lobby or the final, where the murmur is down. */
  function cheer(big) {
    if (!crowdOn || !live()) return;
    const len = big ? 3.4 : 2.2;
    hiss({ dur: len, vol: big ? 0.32 : 0.2, type: 'bandpass', freq: 1300, q: 0.6, attack: 0.25 });
    hiss({ dur: len * 0.8, vol: big ? 0.16 : 0.1, type: 'bandpass', freq: 3000, q: 0.9, attack: 0.3 });
    const claps = big ? 22 : 12;
    for (let i = 0; i < claps; i++) hiss({ start: 0.15 + Math.random() * (len - 0.6), dur: 0.05, vol: 0.09, freq: 1200, q: 1.2, type: 'bandpass' });
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const f = 420 + Math.random() * 300;
      tone({ start: Math.random() * 0.7, freq: f, slideTo: f * 1.6, type: 'triangle', dur: 0.6 + Math.random() * 0.4, vol: 0.018 });
    }
  }
  /** "Ohhh": the stands sag. Huddle, when most of the class missed it. */
  function groan() {
    if (!crowdOn || !live()) return;
    hiss({ dur: 1.5, vol: 0.2, type: 'bandpass', freq: 520, slideTo: 260, q: 1.1, attack: 0.18 });
    [196, 233, 262].forEach((f, i) => tone({ start: 0.05 * i, freq: f, slideTo: f * 0.72, type: 'sawtooth', dur: 1.2, vol: 0.02, filter: 700 }));
  }

  const S = {
    unlock,
    get muted() { return muted; },
    get musicOn() { return musicOn; },
    get crowdOn() { return crowdOn; },
    get scene() { return scene; },
    setMuted(m) { muted = !!m; save(KEYS.muted, muted); mix(); },
    setMusic(on) { musicOn = !!on; save(KEYS.music, musicOn); mix(); },
    setCrowd(on) { crowdOn = !!on; save(KEYS.crowd, crowdOn); mix(); },
    /** Where the game is: 'setup' | 'lobby' | 'live' | 'reveal' | 'final'. */
    setScene(s) { if (s === scene) return; scene = s; mix(); },
    /** 0..1 — how close the game is to a score; the murmur builds with it. */
    setHype(h) {
      const v = Math.max(0, Math.min(1, Number(h) || 0));
      if (Math.abs(v - hype) < 0.05) return;
      hype = v; mix();
    },
    cheer,
    groan,
    /** Referee's whistle: kickoff. */
    whistle() {
      tone({ freq: 2600, type: 'square', dur: 0.12, vol: 0.06 });
      tone({ freq: 2800, type: 'square', start: 0.14, dur: 0.38, vol: 0.06 });
    },
    /** Stadium horn: touchdown. A brassy fifth, twice. */
    horn() {
      [0, 0.42].forEach((s) => {
        tone({ freq: 196, type: 'sawtooth', start: s, dur: 0.36, vol: 0.12 });
        tone({ freq: 294, type: 'sawtooth', start: s, dur: 0.36, vol: 0.09 });
        tone({ freq: 392, type: 'square', start: s, dur: 0.36, vol: 0.04 });
      });
    },
    /** Clock tick for the last five seconds. */
    tick(last) { tone({ freq: last ? 1320 : 990, type: 'triangle', dur: 0.08, vol: 0.18 }); },
    /** The reveal: three rising notes. */
    chime() { [660, 880, 1100].forEach((f, i) => tone({ freq: f, type: 'triangle', start: i * 0.09, dur: 0.3, vol: 0.13 })); },
    /** End of the game. */
    buzzer() { tone({ freq: 140, type: 'sawtooth', dur: 0.9, vol: 0.14, slideTo: 110 }); },
  };
  window.LiveDrillSound = S;
})();
