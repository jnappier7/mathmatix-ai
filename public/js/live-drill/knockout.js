// Knockout Arena — the arena, on a student's device and on the projector.
//
// The rules live on the server (utils/liveDrill/knockout.js). This file draws the arena and drives
// ONE car: the student's own. Everything that scores is a question put to the server — "I am at
// (x, y) touching orb c" — and the answer decides it. An orb's path is a pure function of time
// (`chipAt`, the same arithmetic the server runs), so no orb position is ever synced; other cars
// arrive ~3× a second in `cars` events and are eased toward where they were last seen.
//
// The look is our own: a night arena, neon lines on a dark floor, rocket cars with a boost flame.
// It is drawn entirely here (no image files), so a restyle is this file and nothing else.
//
// Phones are silent in class games (sound.js is the projector's), so feedback here is all visual,
// plus a short vibration where the browser allows one.
(function () {
  // ink = outside the walls; floor = the pitch; line = the neon; gold = this student's car; bot = everyone else's
  const COL = { ink: '#05070f', floorA: '#141c44', floorB: '#0a0f2a', line: '#35e0ff', foam: '#eef6ff', gold: '#ff9a1f', flame: '#ffd35a', coral: '#ff3d6e', chip: '#f4f8ff', bot: '#4aa8ff', good: '#5dff9b' };
  const FONT = '"Big Shoulders Display", "Atkinson Hyperlegible", system-ui, sans-serif';
  const TEXT = '"Atkinson Hyperlegible", system-ui, sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rf = (a, b) => a + Math.random() * (b - a);
  const CAR = 1.4; // how big a car is drawn (the hit test is the orb's, not the car's)
  // the projector paints every car its own colour, so the room can find its own
  const PAINT = ['#4aa8ff', '#ff5d8f', '#5dff9b', '#b388ff', '#ffd35a', '#3ce0d0', '#ff8a5c', '#9bd5ff', '#f77fe0', '#c3f73a'];
  const paintOf = (id) => { let n = 0; for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return PAINT[n % PAINT.length]; };
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** A value bouncing between lo and hi. Must match utils/liveDrill/knockout.js `bounce`. */
  function bounce(v, lo, hi) {
    const r = hi - lo;
    if (r <= 0) return lo;
    const u = (((v - lo) % (2 * r)) + 2 * r) % (2 * r);
    return lo + (u <= r ? u : 2 * r - u);
  }
  function chipAt(chip, world, at, margin) {
    const t = (at - chip.t0) / 1000;
    return { x: bounce(chip.x + chip.vx * t, margin, world.w - margin), y: bounce(chip.y + chip.vy * t, margin, world.h - margin) };
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /**
   * One arena on one canvas. `opts.me` (a player id) makes it a student's view: the camera follows
   * that car and the keys/touch steer it. Without it, it is the projector: the whole arena, every
   * car named, nothing steerable.
   */
  function mount(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const projector = !opts.me;
    const now = opts.serverNow;
    let st = null; // latest game state (st.knockout)
    let cw = 300; let ch = 300; let dpr = 1;
    let raf = 0; let last = 0; let alive = true;
    const cam = { x: 0, y: 0, s: 1, snap: true };
    const me = { x: 0, y: 0, vx: 0, vy: 0, ang: 0, swim: 0, dartT: 0, dartCd: 0, has: false };
    const others = new Map(); // id → { x, y, tx, ty, ang, swim, held, boost }
    let names = new Map();
    let roundN = 0; let spawnKey = '';
    const pending = new Set(); // chips with a grab in flight
    const stung = new Set(); // wrong orbs this car already hit this round
    const passed = new Set(); // right orbs it touched with its hands full (cleared if it drops)
    const gone = new Set(); // chips this screen knows are taken before the state says so
    let parts = []; let floats = []; let bubbles = []; let splash = null; let shake = 0; let popT = 9;
    let sentAt = 0; let sentX = 0; let sentY = 0;
    const keys = {};
    const joy = { on: false, id: -1, t0: 0, ox: 0, oy: 0, dx: 0, dy: 0 };

    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = r.width; ch = r.height;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      cam.snap = true;
    }

    const M = () => (st && st.knockout) || null;
    const R = () => { const m = M(); return m && m.round; };
    const T = () => (M() && M().tune) || { speed: 130, dartMult: 2.5, chipR: 40, eatDist: 32, margin: 50, slowMs: 2000 };

    function burst(x, y, color, n, speed) {
      if (calm()) return;
      for (let i = 0; i < n; i++) {
        const a = rf(0, Math.PI * 2); const v = rf(0.3, 1) * speed;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 1, life: rf(0.35, 0.8), color, r: rf(2, 4.5) });
      }
    }
    function say(text, color) { splash = { text, color, t: 0 }; }
    function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not allowed */ } }

    // ---------------- state in ----------------
    function update(next) {
      const prev = st;
      st = next;
      const m = M(); const r = R();
      if (!m || !r) return;
      if (r.n !== roundN) {
        roundN = r.n; pending.clear(); stung.clear(); passed.clear(); gone.clear(); popT = 0; floats = [];
      }
      for (const c of r.chips) if (!c.taken) gone.delete(c.id); // a chip someone dropped is back
      if (!projector) {
        // The server places a car when it enters the arena (kickoff, a comeback); after that the device owns it.
        const key = m.spawn ? `${m.spawn.round}:${st.gameNumber}` : '';
        if (m.in && m.spawn && (key !== spawnKey || !me.has)) {
          spawnKey = key; me.x = m.spawn.x; me.y = m.spawn.y; me.vx = me.vy = 0; me.has = true; cam.snap = true;
          if (prev && prev.knockout && !prev.knockout.in) { say('BACK IN!', COL.gold); burst(me.x, me.y, COL.gold, 18, 190); buzz(30); }
        }
        if (!m.in) me.has = false;
        me.x = clamp(me.x, 14, r.world.w - 14); me.y = clamp(me.y, 14, r.world.h - 14);
        // the round just closed: what happened to me
        if (prev && prev.knockout && prev.knockout.round && prev.knockout.round.n === r.n && !prev.knockout.round.closed && r.closed && m.in) {
          if (!m.held && !r.nobodyOut) say('SPARED!', COL.foam); // the clock ran out, and someone with fewer points went instead
        }
      } else {
        names = new Map((m.arena || []).map((f) => [f.id, f.name]));
        // a car that was knocked out blows where it was last seen
        for (const [id, o] of others) if (!names.has(id)) { burst(o.x, o.y, COL.flame, 22, 260); burst(o.x, o.y, COL.coral, 14, 160); others.delete(id); }
      }
    }

    function cars(frame) {
      const seen = new Set();
      for (const [id, x, y, held] of frame.cars || []) {
        if (id === opts.me) continue;
        seen.add(id);
        let o = others.get(id);
        if (!o) { o = { x, y, tx: x, ty: y, ang: 0, swim: rf(0, 6) }; others.set(id, o); if (projector) burst(x, y, COL.gold, 10, 120); }
        o.tx = x; o.ty = y; o.held = held;
      }
      for (const id of [...others.keys()]) if (!seen.has(id) && !projector) others.delete(id);
    }

    // ---------------- input (a student's view only) ----------------
    function input() {
      let dx = 0; let dy = 0; let k = 1;
      if (joy.on) { const m = Math.hypot(joy.dx, joy.dy); if (m > 6) { dx = joy.dx / m; dy = joy.dy / m; k = clamp(m / 36, 0.35, 1); } }
      if (keys.ArrowLeft || keys.a) dx -= 1;
      if (keys.ArrowRight || keys.d) dx += 1;
      if (keys.ArrowUp || keys.w) dy -= 1;
      if (keys.ArrowDown || keys.s) dy += 1;
      return { dx, dy, k };
    }
    const swimming = () => { const m = M(); return !projector && !!m && m.in && st.phase === 'live'; };
    const slowed = () => { const m = M(); return !!m && m.slowUntil > now(); };
    function dart() {
      if (!swimming() || me.dartCd > 0 || slowed()) return;
      const i = input();
      if (i.dx || i.dy) me.ang = Math.atan2(i.dy, i.dx);
      const v = T().speed * T().dartMult;
      me.vx = Math.cos(me.ang) * v; me.vy = Math.sin(me.ang) * v; me.dartT = 0.16; me.dartCd = 2.5;
    }
    const onDown = (e) => {
      if (!swimming()) return;
      if (joy.on && e.pointerId !== joy.id) { dart(); e.preventDefault(); return; }
      Object.assign(joy, { on: true, id: e.pointerId, t0: performance.now(), ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
      e.preventDefault();
    };
    const onMove = (e) => { if (joy.on && e.pointerId === joy.id) { joy.dx = e.clientX - joy.ox; joy.dy = e.clientY - joy.oy; } };
    const onUp = (e) => {
      if (e.pointerId !== joy.id) return;
      if (performance.now() - joy.t0 < 200 && Math.hypot(joy.dx, joy.dy) < 10) dart();
      joy.on = false; joy.dx = 0; joy.dy = 0;
    };
    const onKey = (e) => {
      if (!swimming() || canvas.offsetParent === null) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', ' '].includes(k)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.type === 'keydown') { if (k === ' ') { if (!e.repeat) dart(); } else keys[k] = true; } else keys[k] = false;
    };
    if (!projector) {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKey, true);
    }

    // ---------------- the one thing this device asks the server ----------------
    async function tryGrab(chip, r) {
      pending.add(chip.id);
      const round = r.n;
      try {
        const res = await opts.grab({ round, chip: chip.id, x: Math.round(me.x), y: Math.round(me.y) });
        if (round !== roundN) return;
        if (res.taken) { gone.add(chip.id); return; }
        if (res.again) { stung.add(chip.id); return; }
        if (res.safe) return;
        if (res.ok) {
          gone.add(chip.id);
          burst(me.x, me.y, COL.gold, 22, 230);
          say(res.first ? `FIRST! +${res.pts}` : `SAFE! +${res.pts}`, res.first ? COL.good : COL.gold);
          buzz(20);
        } else {
          stung.add(chip.id);
          burst(me.x, me.y, COL.coral, 16, 200); shake = 11; buzz(70);
          floats.push({ x: me.x, y: me.y - 24, text: `${res.text} = ${res.val}${res.cost ? `  −${res.cost}` : ''}`, color: COL.coral, t: 1.6 });
          if (opts.onWrong) opts.onWrong(res);
        }
      } catch (err) {
        // 409 "too far" or "round over": nothing happened; the chip can be tried again next frame
        if (err && err.status === 401 && opts.onGone) opts.onGone();
      } finally { setTimeout(() => pending.delete(chip.id), 250); }
    }

    // ---------------- simulate (own car + easing) ----------------
    function step(dt) {
      const m = M(); const r = R();
      const tune = T();
      popT += dt;
      for (const q of parts) { q.t -= dt / q.life; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; }
      parts = parts.filter((q) => q.t > 0);
      for (const f of floats) { f.t -= dt; f.y -= 22 * dt; }
      floats = floats.filter((f) => f.t > 0);
      for (const b of bubbles) b.t -= dt * 1.6;
      bubbles = bubbles.filter((b) => b.t > 0);
      if (splash) { splash.t += dt; if (splash.t > 1.1) splash = null; }
      shake *= 0.86;
      for (const o of others.values()) {
        const dx = o.tx - o.x; const dy = o.ty - o.y; const d = Math.hypot(dx, dy);
        o.swim += dt; o.boost = clamp(d / 45, 0, 1);
        if (d > 1.5) { const t = Math.atan2(dy, dx); o.ang += Math.atan2(Math.sin(t - o.ang), Math.cos(t - o.ang)) * Math.min(1, dt * 10); }
        o.x += dx * Math.min(1, dt * 6); o.y += dy * Math.min(1, dt * 6);
      }
      if (!swimming() || !r) return;
      me.dartCd = Math.max(0, me.dartCd - dt);
      const i = input();
      const speed = tune.speed * (slowed() ? 0.5 : 1) * (m.held ? tune.holdSlow || 1 : 1) * i.k; // carrying an orb is slower
      if (me.dartT > 0) me.dartT -= dt;
      else {
        const d = Math.hypot(i.dx, i.dy);
        const wx = d ? (i.dx / d) * speed : 0; const wy = d ? (i.dy / d) * speed : 0;
        const k = Math.min(1, 8 * dt);
        me.vx += (wx - me.vx) * k; me.vy += (wy - me.vy) * k;
      }
      me.x = clamp(me.x + me.vx * dt, 14, r.world.w - 14); me.y = clamp(me.y + me.vy * dt, 14, r.world.h - 14);
      const sp = Math.hypot(me.vx, me.vy);
      if (sp > 6) { const t = Math.atan2(me.vy, me.vx); const da = Math.atan2(Math.sin(t - me.ang), Math.cos(t - me.ang)); me.ang += da * Math.min(1, 14 * dt); }
      me.swim += dt;
      if (!calm() && (me.dartT > 0 || Math.random() < sp * dt * 0.012)) bubbles.push({ x: me.x - Math.cos(me.ang) * 12, y: me.y - Math.sin(me.ang) * 12, r: rf(1.2, 3.2), t: rf(0.5, 1) });

      // touching a chip is a claim; the server answers it. A car that has its orb is safe and claims nothing.
      if (!r.closed && m.held < (tune.maxHold || 1)) {
        const at = now();
        for (const c of r.chips) {
          if (c.taken || gone.has(c.id) || pending.has(c.id) || stung.has(c.id) || passed.has(c.id)) continue;
          const p = chipAt(c, r.world, at, tune.margin);
          if (Math.hypot(p.x - me.x, p.y - me.y) <= tune.eatDist) { tryGrab(c, r); break; }
        }
      }
      // tell the server where this car is: twice a second while it moves, a heartbeat when it rests
      const t = performance.now();
      const moved = Math.hypot(me.x - sentX, me.y - sentY);
      if ((moved > 4 && t - sentAt > 500) || t - sentAt > 2500) { sentAt = t; sentX = me.x; sentY = me.y; opts.pos(Math.round(me.x), Math.round(me.y)); }
      void m;
    }

    // ---------------- draw ----------------
    /** A rocket car from above: body, cabin glass, four wheels, and a boost flame that grows with speed. */
    function drawCar(x, y, ang, swim, color, held, label, big, boost) {
      ctx.save(); ctx.translate(x, y);
      ctx.save();
      ctx.rotate(ang);
      ctx.scale(CAR, CAR);
      const b = clamp(boost || 0, 0, 1);
      if (b > 0.05) {
        // the flame flickers on the car's own clock, so two cars never pulse together
        const len = 10 + b * 22 + Math.sin(swim * 9) * 3;
        const fl = ctx.createLinearGradient(-12, 0, -12 - len, 0);
        fl.addColorStop(0, COL.flame); fl.addColorStop(0.5, COL.gold); fl.addColorStop(1, 'rgba(255,61,110,0)');
        ctx.fillStyle = fl; ctx.beginPath(); ctx.moveTo(-12, -4.5); ctx.lineTo(-12 - len, 0); ctx.lineTo(-12, 4.5); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#0b0f1e';
      for (const [wx, wy] of [[-8, -8.5], [7, -8.5], [-8, 5.5], [7, 5.5]]) ctx.fillRect(wx - 3.5, wy, 7, 3);
      ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.fillStyle = color; rr(ctx, -13, -7, 27, 14, 5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(5,7,15,.78)'; rr(ctx, -3, -5, 10, 10, 3); ctx.fill(); // cabin glass
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(12, -5, 2, 3); ctx.fillRect(12, 2, 2, 3); // headlights
      ctx.fillStyle = 'rgba(5,7,15,.5)'; ctx.fillRect(-14, -6, 2.5, 12); // spoiler
      ctx.restore();
      if (held) {
        ctx.strokeStyle = COL.good; ctx.lineWidth = 2.5; ctx.shadowColor = COL.good; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        if (held > 1) {
          ctx.fillStyle = COL.good; ctx.beginPath(); ctx.arc(21, -19, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = COL.ink; ctx.font = `700 12px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(held, 21, -18.5);
        }
      }
      if (label) {
        ctx.font = `700 ${big ? 13 : 11}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        // a dark outline: with orbs this big a car's name often sits on one, white on white
        ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = COL.ink; ctx.strokeText(label, 0, 38);
        ctx.globalAlpha = 0.95; ctx.fillStyle = COL.foam; ctx.fillText(label, 0, 38); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function drawChip(c, r, at, tune) {
      const closed = r.closed;
      const taken = c.taken || gone.has(c.id);
      if (taken && !closed) return;
      const p = closed ? chipAt(c, r.world, Math.min(at, r.revealUntil ? r.revealUntil - 3000 : at), tune.margin) : chipAt(c, r.world, at, tune.margin);
      const R0 = tune.chipR;
      ctx.globalAlpha = taken ? 0.45 : 1;
      // a boost orb: a bright core you can read a fact on, inside a neon ring. Right and wrong look the same.
      ctx.shadowColor = COL.line; ctx.shadowBlur = taken ? 0 : 14;
      ctx.fillStyle = COL.chip; ctx.beginPath(); ctx.arc(p.x, p.y, R0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 4; ctx.strokeStyle = COL.line; ctx.stroke();
      // the fact fills the orb: ~0.6 of its radius per glyph height, a little less for a long one ("144÷12")
      ctx.fillStyle = COL.ink; ctx.font = `800 ${Math.round(R0 * (c.text.length > 5 ? 0.46 : c.text.length > 4 ? 0.52 : 0.62))}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.text, p.x, p.y + 1);
      ctx.globalAlpha = 1;
      if (closed) {
        ctx.lineWidth = 5; ctx.strokeStyle = c.ok ? COL.good : COL.coral; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, R0 + 4, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        if (!c.ok) {
          const label = `= ${c.val}${c.hits ? `  · ${c.hits} hit` : ''}`;
          ctx.font = `700 17px ${TEXT}`; ctx.lineWidth = 4; ctx.strokeStyle = COL.ink; ctx.strokeText(label, p.x, p.y + R0 + 20);
          ctx.fillStyle = COL.coral; ctx.fillText(label, p.x, p.y + R0 + 20);
        }
      }
    }

    function drawTarget(cx, cy, fs, target) {
      const num = String(target);
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${fs}px ${FONT}`; const nw = ctx.measureText(num).width;
      ctx.font = `600 ${fs * 0.42}px ${FONT}`; const lw = ctx.measureText('MAKE').width;
      const gap = fs * 0.22; const pad = fs * 0.4; const w = lw + gap + nw + pad * 2; const h = fs * 1.25;
      // a scoreboard slab: dark glass, neon edge, the number in white
      ctx.shadowColor = COL.line; ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(8,12,32,.94)'; rr(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.22); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(3, fs * 0.06); ctx.strokeStyle = COL.line; ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = COL.gold; ctx.fillText('MAKE', cx - w / 2 + pad, cy + fs * 0.05);
      ctx.fillStyle = COL.foam; ctx.font = `800 ${fs}px ${FONT}`; ctx.fillText(num, cx - w / 2 + pad + lw + gap, cy + fs * 0.05);
      ctx.textAlign = 'center';
      return h;
    }

    function banner(text, y, color) {
      ctx.font = `700 ${projector ? 20 : 15}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = Math.min(cw - 24, ctx.measureText(text).width + 28); const h = projector ? 44 : 36;
      ctx.fillStyle = 'rgba(8,12,32,.94)'; rr(ctx, cw / 2 - tw / 2, y - h / 2, tw, h, 10); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(53,224,255,.45)'; ctx.stroke();
      ctx.fillStyle = color; ctx.fillText(text, cw / 2, y + 1, cw - 44);
      return h;
    }

    function edgeArrow(x, y, color) {
      const sx = (x - cam.x) * cam.s + cw / 2; const sy = (y - cam.y) * cam.s + ch / 2;
      if (sx > 0 && sx < cw && sy > 0 && sy < ch) return;
      const px = clamp(sx, 20, cw - 20); const py = clamp(sy, 20, ch - 20);
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(sy - py, sx - px));
      ctx.fillStyle = color; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function draw(t) {
      const m = M(); const r = R();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COL.ink; ctx.fillRect(0, 0, cw, ch);
      if (!m || !r) return;
      const tune = T();
      const W = r.world.w; const H = r.world.h;
      const at = now();
      const follow = !projector && m.in;

      let tx = W / 2; let ty = H / 2; let ts = Math.min(cw / W, ch / H);
      if (follow) {
        // A phone shows less of the arena, bigger: an orb's fact has to be readable at arm's length.
        ts = Math.max(ts, Math.sqrt((cw * ch) / (Math.min(cw, ch) < 520 ? 240000 : 380000)));
        const vw = cw / ts; const vh = ch / ts;
        tx = vw >= W ? W / 2 : clamp(me.x, vw / 2 - 30, W - vw / 2 + 30);
        ty = vh >= H ? H / 2 : clamp(me.y, vh / 2 - 30, H - vh / 2 + 30);
      }
      if (cam.snap) { cam.x = tx; cam.y = ty; cam.s = ts; cam.snap = false; } else { cam.x += (tx - cam.x) * 0.14; cam.y += (ty - cam.y) * 0.14; cam.s += (ts - cam.s) * 0.2; }

      ctx.save();
      ctx.translate(cw / 2 + rf(-1, 1) * shake, ch / 2 + rf(-1, 1) * shake); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
      // the pitch: dark floor, a faint grid, a halfway line and a centre circle, and a glowing wall
      const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, COL.floorA); g.addColorStop(1, COL.floorB);
      ctx.fillStyle = g; rr(ctx, 0, 0, W, H, 60); ctx.fill();
      ctx.save(); rr(ctx, 0, 0, W, H, 60); ctx.clip();
      ctx.strokeStyle = 'rgba(53,224,255,.07)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 60; x < W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 60; y < H; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(53,224,255,.28)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.17, 0, Math.PI * 2); ctx.stroke();
      // the two ends glow in the two colours of the game
      const endGlow = (x0, x1, col) => { const e = ctx.createLinearGradient(x0, 0, x1, 0); e.addColorStop(0, col); e.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = e; ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), H); };
      endGlow(0, W * 0.16, 'rgba(255,154,31,.16)'); endGlow(W, W * 0.84, 'rgba(74,168,255,.16)');
      ctx.restore();
      ctx.shadowColor = COL.line; ctx.shadowBlur = 22; ctx.lineWidth = 6; ctx.strokeStyle = COL.line; rr(ctx, 0, 0, W, H, 60); ctx.stroke(); ctx.shadowBlur = 0;

      for (const c of r.chips) drawChip(c, r, at, tune);
      ctx.fillStyle = COL.gold;
      for (const b of bubbles) { ctx.globalAlpha = clamp(b.t, 0, 1) * 0.6; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const [id, o] of others) drawCar(o.x, o.y, o.ang, o.swim, projector ? paintOf(id) : COL.bot, o.held, projector ? names.get(id) || '' : '', projector, o.boost);
      if (follow) {
        if (slowed()) ctx.globalAlpha = 0.55;
        drawCar(me.x, me.y, me.ang, me.swim, COL.gold, m.held, 'YOU', false, me.dartT > 0 ? 1 : Math.hypot(me.vx, me.vy) / (tune.speed * 1.6));
        ctx.globalAlpha = 1;
        // boost meter under the car: refills in 2.5 s
        { const f = 1 - me.dartCd / 2.5; ctx.fillStyle = 'rgba(238,246,255,.2)'; rr(ctx, me.x - 16, me.y + 43, 32, 4, 2); ctx.fill(); ctx.fillStyle = f >= 1 ? COL.flame : COL.gold; rr(ctx, me.x - 16, me.y + 43, Math.max(4, 32 * f), 4, 2); ctx.fill(); }
        if (!m.held && !r.closed) {
          ctx.font = `700 14px ${TEXT}`; const tag = `= ${r.target}`; const tw = ctx.measureText(tag).width + 14;
          ctx.fillStyle = 'rgba(8,12,32,.88)'; rr(ctx, me.x - tw / 2, me.y - 50, tw, 20, 6); ctx.fill();
          ctx.fillStyle = COL.gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tag, me.x, me.y - 39);
        }
      }
      for (const q of parts) { ctx.globalAlpha = clamp(q.t, 0, 1); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.4 + q.t * 0.6), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const f of floats) {
        ctx.globalAlpha = clamp(f.t, 0, 1); ctx.font = `700 15px ${TEXT}`;
        ctx.lineWidth = 4; ctx.strokeStyle = COL.ink; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // ---- screen space ----
      const left = r.closesAt - at;
      const live = st.phase === 'live' && !r.closed;
      if (follow && live) {
        const open = r.chips.filter((c) => !c.taken && !gone.has(c.id));
        // point at the nearest orbs that are off the screen, right and wrong alike
        const far = open.map((c) => { const p = chipAt(c, r.world, at, tune.margin); return { p, d: Math.hypot(p.x - me.x, p.y - me.y) }; }).sort((a, b) => a.d - b.d).slice(0, 8);
        for (const f of far) edgeArrow(f.p.x, f.p.y, COL.chip);
        if (!m.held && left < 3000) {
          const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
          v.addColorStop(0, 'rgba(255,107,94,0)'); v.addColorStop(1, `rgba(255,107,94,${0.28 + (calm() ? 0 : 0.2 * Math.sin(t / 80))})`);
          ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
        }
      }
      const fsTop = projector ? clamp(Math.min(ch * 0.11, cw * 0.1), 40, 130) : clamp(cw * 0.12, 38, 64);
      const topY = (projector ? 10 : 38) + fsTop * 0.65;
      const k0 = clamp((popT - 0.45) / 0.3, 0, 1); const k = calm() ? 1 : k0 * k0 * (3 - 2 * k0);
      const fsBig = Math.min(fsTop * 1.9, cw * 0.26); const popY = Math.max(topY, ch * 0.24);
      const ph = drawTarget(cw / 2, topY + (popY - topY) * (1 - k), fsTop + (fsBig - fsTop) * (1 - k), r.target);
      // the round's clock: a bar under the number, red for the last three seconds
      const bw = Math.min(cw - 40, 320); const by = (projector ? 10 : 38) + fsTop * 1.3 + 8;
      if (live) {
        const frac = clamp(left / (r.closesAt - r.openedAt), 0, 1);
        ctx.fillStyle = 'rgba(234,247,244,.18)'; rr(ctx, cw / 2 - bw / 2, by, bw, 6, 3); ctx.fill();
        ctx.fillStyle = left < 3000 ? COL.coral : COL.gold; rr(ctx, cw / 2 - bw / 2, by, Math.max(6, bw * frac), 6, 3); ctx.fill();
      }
      // a student's arena can fill the whole phone, so it carries its own scoreboard: who is left, and the gate
      if (follow) {
        const gl = (m.gateAt || 0) - at;
        ctx.font = `700 13px ${TEXT}`; ctx.textBaseline = 'top';
        const tag = (text, x, align, color) => { const w = ctx.measureText(text).width + 14; const x0 = align === 'left' ? x : x - w; ctx.fillStyle = 'rgba(8,12,32,.82)'; rr(ctx, x0, 8, w, 22, 6); ctx.fill(); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, x0 + 7, 13); };
        tag(`${m.alive} left · ${m.pts} pts (#${m.rank})`, 8, 'left', COL.line);
        tag(gl > 0 ? `Gate ${Math.floor(gl / 60000)}:${String(Math.floor((gl % 60000) / 1000)).padStart(2, '0')}` : 'Sudden death', cw - 8, 'right', gl > 0 && gl > 15000 ? COL.foam : COL.coral);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      }
      let y = by + 34; void ph;
      if (r.closed) {
        const outs = r.out || [];
        const line = r.nobodyOut ? 'Nobody got an orb, so nobody is out' : outs.length ? `Out: ${outs.slice(0, projector ? 8 : 4).join(', ')}${outs.length > (projector ? 8 : 4) ? ` +${outs.length - (projector ? 8 : 4)}` : ''}` : 'Everyone got an orb';
        y += banner(line, y, COL.foam) + 6;
        if (projector && r.worst) banner(`Most-hit wrong orb: ${r.worst.text} = ${r.worst.val} (${r.worst.hits} ${r.worst.hits === 1 ? 'car' : 'cars'})`, y, COL.coral);
      }
      if (splash && !projector) {
        const p = splash.t; const sc = calm() ? 1 : p < 0.12 ? 0.5 + (p / 0.12) * 0.75 : 1.25 - Math.min(1, (p - 0.12) / 0.15) * 0.25;
        ctx.save(); ctx.translate(cw / 2, ch * 0.42); ctx.scale(sc, sc); ctx.globalAlpha = clamp((1.1 - p) / 0.3, 0, 1);
        ctx.transform(1, 0, -0.18, 1, 0, 0); // the announcer's slant
        ctx.font = `900 ${Math.min(60, cw * 0.15)}px ${FONT}`; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.strokeStyle = COL.ink; ctx.strokeText(splash.text, 0, 0);
        ctx.fillStyle = splash.color; ctx.fillText(splash.text, 0, 0); ctx.restore(); ctx.globalAlpha = 1;
      }
      if (joy.on && follow) {
        const rect = canvas.getBoundingClientRect(); const ox = joy.ox - rect.left; const oy = joy.oy - rect.top;
        const mag = Math.hypot(joy.dx, joy.dy) || 1; const kk = Math.min(mag, 36) / mag;
        ctx.strokeStyle = 'rgba(234,247,244,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy, 36, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(234,247,244,.4)'; ctx.beginPath(); ctx.arc(ox + joy.dx * kk, oy + joy.dy * kk, 14, 0, Math.PI * 2); ctx.fill();
      }
    }

    function frame(t) {
      if (!alive) return;
      const dt = Math.min(0.05, (t - last) / 1000 || 0);
      last = t;
      if (canvas.offsetParent !== null) {
        if (Math.abs(canvas.getBoundingClientRect().width - cw) > 1 || Math.abs(canvas.getBoundingClientRect().height - ch) > 1) resize();
        step(dt); draw(t);
      }
      raf = requestAnimationFrame(frame);
    }
    window.addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(frame);

    return {
      update, cars, say,
      stop() {
        alive = false; cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        if (!projector) {
          canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
          canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
          window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
        }
      },
    };
  }

  window.LiveDrillKnockout = { mount, chipAt, bounce };
})();
