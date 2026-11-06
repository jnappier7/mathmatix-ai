// Live Two-Minute Drill — stadium sound for the PROJECTOR (public/live-drill-host.html) and, muted
// until the student turns it on, for solo practice (public/drill.html — see LiveDrillSoundConfig
// below). Phones in a CLASS game stay silent on purpose: thirty phones beeping out of sync is noise.
//
// Everything is synthesized with Web Audio except the two recorded cheers (below) — a crowd's roar is
// the one sound synthesis never sold, and the owner supplied real ones. Browsers only
// let a page make sound after a click, so unlock() runs on the teacher's first click (Open lobby,
// Kick off, …). Three switches, each remembered on this device:
//   Sound — the master. Muted means silent, whatever the other two say.
//   Music — an original drumline + bass loop under the lobby and the game. OFF until turned on:
//           a room that's taking a test next door shouldn't get a marching band by surprise.
//   Crowd — a gym full of voices (a dozen synthesized speakers talking over each other, stray claps
//           and whoops) during play that gets busier as a ball nears the goal line, a REAL recorded
//           cheer on a touchdown (public/audio/live-drill/), and (Huddle) a cheer or a groan on the
//           reveal. On by default.
// The page says WHERE the game is with scene(); this module decides what that sounds like.
(function () {
  // The page says which room it is before loading this script (window.LiveDrillSoundConfig):
  //   the projector (default) — sound on, crowd on, remembered under mm-live-drill-*;
  //   solo practice (/drill)  — MUTED until the student turns it on, crowd (the murmur) off, its own
  //                             storage keys so a teacher's projector choice never bleeds into a kid's
  //                             phone, and cheers that follow the Sound switch alone: a personal best
  //                             deserves its cheer even with the murmur off.
  const CFG = window.LiveDrillSoundConfig || {};
  const PREFIX = CFG.storagePrefix || 'mm-live-drill';
  const KEYS = { muted: `${PREFIX}-muted`, music: `${PREFIX}-music`, crowd: `${PREFIX}-crowd` };
  const cheersFollowCrowd = CFG.cheersFollowCrowd !== false;
  const read = (k, dflt) => { try { const v = localStorage.getItem(k); return v == null ? dflt : v === '1'; } catch { return dflt; } };
  const save = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ } };

  let muted = read(KEYS.muted, CFG.defaultMuted === true);
  let musicOn = read(KEYS.music, false);
  let crowdOn = read(KEYS.crowd, CFG.defaultCrowd !== false);
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
      // The crowd bus goes through a limiter: a cheer of a dozen voices adds up coherently, and a
      // clipped crowd is a buzz, not a gym. (Guarded: the test's fake graph has no compressor.)
      if (ctx.createDynamicsCompressor) {
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -14; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.12;
        crowd.disconnect(master); crowd.connect(lim).connect(master);
      }
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      mix();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    loadSamples();
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
    if (murmur && murmur.bed) ramp(murmur.bed.filter.frequency, bedCutoff(), 1.2);
    if (c > 0) startMurmur(); else later(stopMurmur, 1300);
  }
  const pending = new Set();
  function later(fn, ms) {
    const t = setTimeout(() => { pending.delete(t); fn(); }, ms);
    pending.add(t);
  }

  // ---------------------------------------------------------------- recorded cheers
  // Two real crowd recordings (public/audio/live-drill/, picked by the owner 2026-11-04) carry the
  // moments synthesis can't: the roar on a touchdown, a pick six or the final (cheer-big, 6 s) and
  // the smaller cheer on a Huddle reveal the class mostly got, or a new king (cheer, 4.8 s). A third,
  // murmur.mp3, is the bed under play — a seamless loop built from those two (a grain cloud of their
  // bodies, low-passed for distance; scripts/buildCrowdMurmur.js), so it carries the same licence. They
  // load after the first click (fetch + decodeAudioData, same-origin, CSP mediaSrc 'self') and play
  // on the sfx bus at a slightly random speed so two touchdowns never sound like a loop. Until they
  // have loaded — or if they can't (offline, a blocked fetch, the test's fake graph) — the
  // synthesized roar in cheer() stands in, so a touchdown is never silent.
  const SAMPLES = { cheer: '/audio/live-drill/cheer.mp3', big: '/audio/live-drill/cheer-big.mp3', murmur: '/audio/live-drill/murmur.mp3' };
  const SAMPLE_LEVEL = { cheer: 0.55, big: 0.6 }; // both files peak near full scale; the horn sits at ~0.15 (big at 0.7 peaked 0.91 over the bed)
  // The murmur bed (murmur.mp3, 27 s) is a seamless loop over seconds 1–25 — a second of lead-in and
  // two of tail keep the loop point away from the codec's edges, so loopStart/loopEnd never hit padding.
  const MURMUR_LOOP = [1, 25];
  const MURMUR_LEVEL = 0.32; // the file peaks at −6 dBFS; this lands the calm bed near the old synth level
  const samples = {}; // name → AudioBuffer, once decoded
  let samplesRequested = false;
  function loadSamples() {
    if (samplesRequested || !ctx || typeof fetch !== 'function' || typeof ctx.decodeAudioData !== 'function') return;
    samplesRequested = true;
    for (const [name, url] of Object.entries(SAMPLES)) {
      fetch(url, { cache: 'force-cache' })
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((audio) => { samples[name] = audio; })
        .catch(() => { /* the synthesized roar stands in */ });
    }
  }
  /** Play a decoded recording with a soft edge at both ends. False if it isn't loaded (yet). */
  function playSample(name, { vol = 1, rate = 1, bus = sfx, fadeOut = 0.6 } = {}) {
    const buf = samples[name];
    if (!buf || !live()) return false;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const dur = buf.duration / rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.setValueAtTime(vol, t0 + Math.max(0.03, dur - fadeOut));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g).connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    return true;
  }
  const loaded = (name) => !!samples[name];

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
  // The synthesized murmur below is the STAND-IN for the recorded bed (startMurmur plays murmur.mp3
  // when it has loaded): it covers the first seconds before the file lands, and any device that can't
  // fetch it.
  // What a crowd is NOT: filtered noise. Noise through a band-pass is surf however you shape it.
  // The first cut (one band, a slow swell) was a beach; the second (four bands flickering at
  // syllable speed over a low-passed rumble) was still a beach in a wind — students said "ocean"
  // (owner, 2026-10-22 and 2026-11-04). The ear reads "voices" off two things noise never has:
  // PITCH — a harmonic fundamental, different for every speaker, that moves as they talk — and
  // FORMANTS — the two vowel resonances that jump every syllable. So the murmur is a dozen VOICES:
  // a sawtooth at a speaker's own fundamental (kids and adults, ~110–330 Hz) through two formant
  // band-passes that hop between vowels, gated into words — a few syllables at 4–6 a second, then
  // a pause to listen — each on its own clock, none in step with another. NO noise bed loops under
  // it; the room is the sum of the voices. Claps and whoops (noise bursts, pitched slides) are
  // scheduled at random out of the stands, more often as the game heats up (hype), which also
  // shortens everyone's pauses: a louder crowd is more people talking, not a bigger wave.
  const VOICE_F0 = [112, 128, 142, 158, 176, 196, 214, 236, 254, 272, 296, 318]; // twelve speakers
  const VOWELS = [[730, 1090], [660, 1720], [530, 1840], [390, 1990], [570, 840], [440, 1020], [300, 870]]; // F1, F2 in Hz
  const FORMANT_Q = [7, 9];
  const FORMANT_GAIN = [1.6, 3.2]; // a sawtooth's upper harmonics are quiet: the second formant needs make-up gain
  let murmur = null; // { nodes, voices, timers, bed?: { src, filter } }

  /** One speaker: oscillator → gate (the syllables) → two formant band-passes → (pan) → crowd. */
  function makeVoice(f0, idx) {
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f0;
    const gate = ctx.createGain(); gate.gain.value = 0.0001;
    osc.connect(gate);
    let out = ctx.createGain(); out.gain.value = 1;
    const formants = FORMANT_Q.map((q, j) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = VOWELS[0][j]; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = FORMANT_GAIN[j];
      gate.connect(f).connect(g).connect(out);
      return f;
    });
    if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = ((idx % 5) - 2) * 0.3; out.connect(pan); out = pan; }
    out.connect(crowd);
    osc.start();
    return { osc, gate, formants, f0, level: 0.11 + Math.random() * 0.07 };
  }

  function startMurmur() {
    if (murmur || !ctx) return;
    murmur = { nodes: [], voices: [], timers: new Set(), bed: null };
    if (samples.murmur) {
      // The real thing: the recorded bed, looping, through a low-pass that opens as the game heats
      // up (a crowd that leans in sounds closer). Started at a random point so two games never
      // share a phrase. The synthesized voices below are the stand-in until the file has loaded.
      const src = ctx.createBufferSource();
      src.buffer = samples.murmur; src.loop = true; src.loopStart = MURMUR_LOOP[0]; src.loopEnd = MURMUR_LOOP[1];
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = bedCutoff(); filter.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = MURMUR_LEVEL;
      src.connect(filter).connect(g).connect(crowd);
      src.start(0, MURMUR_LOOP[0] + Math.random() * (MURMUR_LOOP[1] - MURMUR_LOOP[0]));
      murmur.nodes.push(src); murmur.bed = { src, filter };
      // Nothing synthesized rides over the recording: a synthesized stomp-and-clap and pitched
      // whoops on top of real voices were what sounded fake ("a monkey playing a broken
      // accordion" — owner, 2026-11-05). The red zone is the recording, louder and closer.
      return;
    }
    VOICE_F0.forEach((f0, i) => {
      const v = makeVoice(f0 * (0.97 + Math.random() * 0.06), i);
      murmur.nodes.push(v.osc); murmur.voices.push(v);
      wait(Math.random() * 1200, () => speak(v)); // nobody starts talking on the same beat
    });
    stands();
  }
  /** How much of the bed's top end comes through: a far-off hum at midfield, right there at the goal line. */
  const bedCutoff = () => 1500 + 4500 * hype;
  function wait(ms, fn) {
    const t = setTimeout(() => { if (murmur) { murmur.timers.delete(t); fn(); } }, ms);
    murmur.timers.add(t);
  }
  /**
   * One speaker says a word — one to four syllables, each a vowel hop and a step of pitch — then
   * listens for a moment and says another. Statements settle in pitch; one in four lifts at the
   * end like a question. The whole word is scheduled on the audio clock, so a busy main thread
   * can't smear it.
   */
  function speak(v) {
    if (!murmur) return;
    const t0 = ctx.currentTime + 0.02;
    const syl = 1 + Math.floor(Math.random() * 4);
    const dur = 1 / (3.8 + Math.random() * 2.4); // 3.8–6.2 syllables a second
    const vol = v.level * (0.8 + 0.4 * Math.random()) * (0.7 + 0.5 * hype);
    const g = v.gate.gain; const fq = v.osc.frequency;
    g.cancelScheduledValues(t0); fq.cancelScheduledValues(t0);
    let t = t0;
    for (let i = 0; i < syl; i++) {
      const vow = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      v.formants.forEach((f, j) => f.frequency.setTargetAtTime(vow[j] * (0.9 + Math.random() * 0.2), t, 0.025));
      const last = i === syl - 1;
      const contour = (last && Math.random() < 0.25 ? 1.12 : 1.08 - (0.16 * i) / Math.max(1, syl - 1)) * (0.97 + Math.random() * 0.06);
      fq.setTargetAtTime(v.f0 * contour, t, 0.05);
      g.setTargetAtTime(vol * (i === 0 ? 1 : 0.75 + Math.random() * 0.35), t, 0.02); // ~30 ms onset
      g.setTargetAtTime(0.0001, t + dur * 0.62, 0.03); // and away before the next syllable lands
      t += dur;
    }
    // a stray consonant on about a third of the words — an "s", a "t" — is a short, high hiss
    if (Math.random() < 0.35) hiss({ at: t0 - 0.01, dur: 0.04 + Math.random() * 0.04, vol: vol * 0.35, type: 'bandpass', freq: 3500 + Math.random() * 2500, q: 1.2, bus: crowd });
    const pause = (0.25 + Math.random() * 1.6) / (0.7 + 0.9 * hype); // a hot room talks over itself
    wait((t - ctx.currentTime + pause) * 1000, () => speak(v));
  }
  /** A clap, a whoop, a "yeah" out of the stands — more of them as a drive nears the goal. */
  function stands() {
    if (!murmur) return;
    if (live() && CROWD_LEVEL[scene]) {
      const r = Math.random();
      if (r < 0.55) hiss({ dur: 0.05 + Math.random() * 0.04, vol: 0.05 + 0.05 * hype, freq: 900 + Math.random() * 900, q: 1.4, type: 'bandpass', bus: crowd });
      else if (r < 0.8) { const f = 300 + Math.random() * 260; tone({ freq: f, slideTo: f * (1.3 + Math.random() * 0.5), type: 'triangle', dur: 0.25 + Math.random() * 0.3, vol: 0.012 + 0.01 * hype, bus: crowd, filter: 2200 }); }
    }
    wait((500 + Math.random() * 1400) / (0.6 + hype), stands);
  }
  function stopMurmur() {
    if (!murmur || (crowdOn && !muted && CROWD_LEVEL[scene])) return;
    for (const t of murmur.timers) clearTimeout(t);
    for (const n of murmur.nodes) { try { n.stop(); } catch { /* already stopped */ } }
    murmur = null;
  }
  /** The stands go up: a roar, scattered claps, a few voices. Plays on the sfx bus so it's heard
   *  even in the lobby or the final, where the murmur is down. */
  function cheer(big) {
    if (!live() || (cheersFollowCrowd && !crowdOn)) return;
    // the real thing, when it has loaded — a touch of random speed so repeats aren't a loop
    if (playSample(big ? 'big' : 'cheer', { vol: SAMPLE_LEVEL[big ? 'big' : 'cheer'], rate: 0.96 + Math.random() * 0.08 })) return;
    const len = big ? 3.4 : 2.2;
    // the roar is mostly VOICES — a dozen "yeah"s sliding up at once — with a little breath of noise under it
    hiss({ dur: len, vol: big ? 0.22 : 0.14, type: 'bandpass', freq: 1300, q: 0.6, attack: 0.25 });
    hiss({ dur: len * 0.8, vol: big ? 0.1 : 0.07, type: 'bandpass', freq: 3000, q: 0.9, attack: 0.3 });
    const claps = big ? 22 : 12;
    for (let i = 0; i < claps; i++) hiss({ start: 0.15 + Math.random() * (len - 0.6), dur: 0.05, vol: 0.09, freq: 1200, q: 1.2, type: 'bandpass' });
    for (let i = 0; i < (big ? 12 : 7); i++) {
      const f = 240 + Math.random() * 420;
      tone({ start: Math.random() * 0.7, freq: f, slideTo: f * (1.4 + Math.random() * 0.4), type: 'sawtooth', dur: 0.6 + Math.random() * 0.5, vol: 0.012, filter: 1800 });
    }
  }
  /** "Ohhh": the stands sag. Huddle, when most of the class missed it. */
  function groan() {
    if (!live() || (cheersFollowCrowd && !crowdOn)) return;
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
    /** Whether the recorded cheers have loaded (false until the first click's fetch lands). */
    get recordedCheers() { return loaded('cheer') && loaded('big'); },
    /** Whether the recorded murmur bed has loaded (the synthesized voices stand in until then). */
    get recordedMurmur() { return loaded('murmur'); },
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
    /** Team Drive: a blitz — a quick whoosh down and a pad-on-pad thud. */
    blitz() {
      hiss({ dur: 0.28, vol: 0.3, type: 'bandpass', freq: 2600, slideTo: 500, q: 0.8, attack: 0.01 });
      tone({ freq: 110, type: 'sine', start: 0.2, dur: 0.22, vol: 0.35, slideTo: 55 });
      hiss({ start: 0.2, dur: 0.07, vol: 0.18, type: 'lowpass', freq: 240, q: 0.7, attack: 0.003 });
    },
    /** King of the Hill: a boulder rolls — a low rumble and a thud. */
    rumble() {
      hiss({ dur: 0.9, vol: 0.35, type: 'lowpass', freq: 380, slideTo: 120, q: 0.9, attack: 0.04 });
      tone({ freq: 70, type: 'sine', start: 0.55, dur: 0.35, vol: 0.4, slideTo: 40 });
    },
    /** Heist: a safe opens — two dial clicks and the bolt drops, then a bright ping. */
    safe() {
      [0, 0.11].forEach((s) => hiss({ start: s, dur: 0.03, vol: 0.16, type: 'bandpass', freq: 3200, q: 2, attack: 0.002 }));
      tone({ freq: 160, type: 'square', start: 0.24, dur: 0.12, vol: 0.14, slideTo: 90, filter: 900 });
      hiss({ start: 0.24, dur: 0.06, vol: 0.14, type: 'lowpass', freq: 400, q: 0.8, attack: 0.003 });
      tone({ freq: 1760, type: 'triangle', start: 0.42, dur: 0.5, vol: 0.1 });
      tone({ freq: 2637, type: 'sine', start: 0.46, dur: 0.45, vol: 0.05 });
    },
    /** Heist: a gadget fires — a smoke bomb's pop and the hiss as it spreads. */
    smoke() {
      tone({ freq: 90, type: 'sine', dur: 0.14, vol: 0.3, slideTo: 45 });
      hiss({ start: 0.08, dur: 1.1, vol: 0.2, type: 'bandpass', freq: 1800, slideTo: 600, q: 0.7, attack: 0.03 });
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
