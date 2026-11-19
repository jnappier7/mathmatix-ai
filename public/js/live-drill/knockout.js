// Knockout Arena — the arena, on a student's device and on the projector.
//
// The rules live on the server (utils/liveDrill/knockout.js). This file draws the arena and drives
// ONE car: the student's own. Everything that scores is a question put to the server — "I am at
// (x, y) touching orb c" — and the answer decides it. An orb's path is a pure function of time
// (`chipAt`, the same arithmetic the server runs), so no orb position is ever synced; other cars
// arrive ~3× a second in `cars` events (position AND velocity) and are led forward between reports.
//
// THE WHOLE ARENA, on every screen (owner, 2026-11-19: "they should be able to see the whole arena
// view from their screen. The zoom was too much"). A student's view is fitted, not a camera chasing
// their car. A portrait phone turns the arena a quarter so its long side runs down the screen — that
// is half again as big as fitting it crosswise — and steering is turned with it, so a drag still
// goes where the finger goes. Text (facts, names, "YOU") is always drawn upright. A fact is never
// drawn smaller than `MIN_FACT_PX` on screen.
//
// BUMPER CARS. Each device bounces its own car off the cars it sees: pushed apart, the closing
// speed traded as between two equal masses, never less than `bump.kick`, then a short coast before
// the steering takes over. The other car is knocked back on this screen too, until its own report
// (from its own bounce) arrives. A safe car — holding its orb — is a ghost (`bump.ghostSafe`).
//
// POWER-UPS. Every so often a gold power-up orb pops in and drifts like a fact orb for a few seconds:
// +100, +50, or ⚡ (a speed charge). Driving into one is a claim the server rules, like an orb. A
// charge is spent with the BOOST button, space, or a second finger. Gold, never white: a power-up
// must never be mistaken for an answer.
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
  const CAR = 1.4; // how big a car is drawn (a bump's radius is `tune.bump.r`)
  const MIN_FACT_PX = 12; // the smallest a fact is drawn on screen, whatever the arena's scale
  const EDGE = 14; // a car's centre stays this far inside the wall
  // the projector paints every car its own colour, so the room can find its own
  const PAINT = ['#4aa8ff', '#ff5d8f', '#5dff9b', '#b388ff', '#ffd35a', '#3ce0d0', '#ff8a5c', '#9bd5ff', '#f77fe0', '#c3f73a'];
  const paintOf = (id) => { let n = 0; for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return PAINT[n % PAINT.length]; };
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DEFAULT_TUNE = {
    speed: 130, topMult: 2.5, chipR: 40, eatDist: 32, margin: 50, slowMs: 2000, maxHold: 1, holdSlow: 1,
    boost: { max: 2, mult: 2.2, ms: 1200 },
    power: { r: 30, eat: 38, pts: { pts50: 50, pts100: 100 } },
    bump: { r: 17, kick: 170, e: 0.9, stunMs: 260, ghostSafe: true },
  };

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

  /**
   * How a world fits a screen. `top`/`bottom` are bands kept clear for the HUD. A portrait screen
   * turns a landscape arena a quarter when that draws it bigger. Pure, so the tests can check it.
   */
  function fitView(cw, ch, world, o = {}) {
    const top = o.top || 0; const bottom = o.bottom || 0; const pad = o.pad == null ? 8 : o.pad;
    const aw = Math.max(1, cw - 2 * pad); const ah = Math.max(1, ch - top - bottom - 2 * pad);
    const flat = Math.min(aw / world.w, ah / world.h);
    const turned = Math.min(ah / world.w, aw / world.h);
    const turn = !!o.canTurn && turned > flat * 1.05;
    return { s: turn ? turned : flat, rot: turn ? Math.PI / 2 : 0, cx: cw / 2, cy: top + pad + ah / 2 };
  }
  /** A screen direction as an arena direction, for an arena turned by `rot`. */
  function screenToWorld(dx, dy, rot) {
    if (!rot) return { dx, dy };
    const c = Math.cos(-rot); const s = Math.sin(-rot);
    return { dx: dx * c - dy * s, dy: dx * s + dy * c };
  }

  /**
   * One car's bounce off another, as this car's own device makes it (equal masses). Moves and
   * returns `me` ({ x, y, vx, vy }); `other` is { x, y, vx, vy }. Pure, so the tests can check it.
   */
  function bumpOff(me, other, b, top) {
    let nx = me.x - other.x; let ny = me.y - other.y; let d = Math.hypot(nx, ny);
    const R2 = b.r * 2;
    if (d >= R2) return null;
    if (d < 0.01) { nx = 1; ny = 0; d = 0; } else { nx /= d; ny /= d; }
    me.x += nx * (R2 - d); me.y += ny * (R2 - d); // never left inside another car
    const rel = (me.vx - (other.vx || 0)) * nx + (me.vy - (other.vy || 0)) * ny;
    if (rel < 0) { const j = (-(1 + b.e) * rel) / 2; me.vx += nx * j; me.vy += ny * j; }
    const vn = me.vx * nx + me.vy * ny;
    if (vn < b.kick) { me.vx += nx * (b.kick - vn); me.vy += ny * (b.kick - vn); }
    const sp = Math.hypot(me.vx, me.vy);
    if (sp > top) { me.vx *= top / sp; me.vy *= top / sp; }
    return { nx, ny };
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /**
   * One arena on one canvas. `opts.me` (a player id) makes it a student's view: their car is
   * steered here and highlighted. Without it, it is the projector: every car named, nothing steerable.
   */
  function mount(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const projector = !opts.me;
    const now = opts.serverNow;
    let st = null; // latest game state (st.knockout)
    let cw = 300; let ch = 300; let dpr = 1;
    let raf = 0; let last = 0; let alive = true;
    let view = { s: 1, rot: 0, cx: 150, cy: 150 };
    const me = { x: 0, y: 0, vx: 0, vy: 0, ang: 0, swim: 0, boostT: 0, stunT: 0, has: false };
    const others = new Map(); // id → { x, y (drawn) · rx, ry, rvx, rvy, seenAt (reported) · kx, ky, bx, by (a bump seen here) · hitT, ang, swim, held, boostOn }
    let names = new Map();
    let roundN = 0; let spawnKey = '';
    const pending = new Set(); // chips / power-ups with a claim in flight
    const stung = new Set(); // wrong orbs this car already hit this round
    const passed = new Set(); // right orbs it touched with its hands full (cleared if it drops)
    const gone = new Set(); // chips / power-ups this screen knows are taken before the state says so
    const fullSeen = new Set(); // ⚡ power-ups this car drove into with a full tank (told once)
    const seenPower = new Map(); // power-up id → taken? (so its pop-in and its taking are each shown once)
    let charges = 0; let firedAt = 0; let hintAt = 0;
    let parts = []; let floats = []; let bubbles = []; let splash = null; let shake = 0; let popT = 9;
    let sentAt = 0; let sentX = 0; let sentY = 0; let sentVx = 0; let sentVy = 0;
    let hud = false; // projector: draw who is left and the gate on the canvas (its side panel is hidden)
    const sparked = new Map(); // projector: a pair of cars → when they last threw sparks
    let btn = null; // the BOOST button, in screen pixels
    const keys = {};
    const joy = { on: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };

    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = r.width; ch = r.height;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }

    const M = () => (st && st.knockout) || null;
    const R = () => { const m = M(); return m && m.round; };
    const T = () => { const t = (M() && M().tune) || {}; return { ...DEFAULT_TUNE, ...t, boost: { ...DEFAULT_TUNE.boost, ...(t.boost || {}) }, bump: { ...DEFAULT_TUNE.bump, ...(t.bump || {}) }, power: { ...DEFAULT_TUNE.power, ...(t.power || {}) } }; };

    function burst(x, y, color, n, speed) {
      if (calm()) return;
      for (let i = 0; i < n; i++) {
        const a = rf(0, Math.PI * 2); const v = rf(0.3, 1) * speed;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 1, life: rf(0.35, 0.8), color, r: rf(2, 4.5) });
      }
    }
    function say(text, color) { splash = { text, color, t: 0 }; }
    function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not allowed */ } }
    function floatAt(x, y, text, color, life = 1.4) { floats.push({ x, y, rise: 26, text, color, t: life }); }
    function float(text, color, life = 1.4) { floatAt(me.x, me.y, text, color, life); }
    /** What a power-up is, in a word: "+100", "+50", "⚡". */
    const powerLabel = (kind) => (kind === 'speed' ? '⚡' : `+${(T().power.pts || {})[kind] || ''}`);
    function hint(text) { const t = performance.now(); if (t - hintAt < 1200) return; hintAt = t; float(text, COL.foam); }

    // ---------------- state in ----------------
    function update(next) {
      const prev = st;
      st = next;
      const m = M(); const r = R();
      if (!m || !r) return;
      if (r.n !== roundN) {
        roundN = r.n; pending.clear(); stung.clear(); passed.clear(); gone.clear(); fullSeen.clear(); seenPower.clear(); popT = 0; floats = [];
      }
      for (const c of r.chips) if (!c.taken) gone.delete(c.id); // a chip someone dropped is back
      // a power-up pops in with a ring of sparks; when someone takes it, every screen says who and what
      const at = now();
      for (const p of r.powerups || []) {
        const was = seenPower.get(p.id);
        if (was === undefined && !p.taken) { const q = chipAt(p, r.world, at, T().margin); burst(q.x, q.y, COL.flame, 18, 200); }
        if (p.taken && !was && p.by && (projector || p.by !== myName())) {
          const q = chipAt(p, r.world, at, T().margin);
          floatAt(q.x, q.y, `${powerLabel(p.kind)} ${p.by}`, COL.flame, 1.8); burst(q.x, q.y, COL.flame, 14, 180);
        }
        seenPower.set(p.id, !!p.taken);
      }
      if (!projector) {
        // The server places a car when it enters the arena (kickoff, a comeback); after that the device owns it.
        const key = m.spawn ? `${m.spawn.round}:${st.gameNumber}` : '';
        if (m.in && m.spawn && (key !== spawnKey || !me.has)) {
          spawnKey = key; me.x = m.spawn.x; me.y = m.spawn.y; me.vx = me.vy = 0; me.boostT = 0; me.stunT = 0; me.has = true;
          if (prev && prev.knockout && !prev.knockout.in) { say('BACK IN!', COL.gold); burst(me.x, me.y, COL.gold, 18, 190); buzz(30); }
        }
        if (!m.in) { me.has = false; me.boostT = 0; }
        me.x = clamp(me.x, EDGE, r.world.w - EDGE); me.y = clamp(me.y, EDGE, r.world.h - EDGE);
        // charges: the server's count, except just after a boost was spent here (its answer may not be in yet)
        const theirs = m.boosts || 0;
        charges = performance.now() - firedAt > 1500 ? theirs : Math.min(charges, theirs);
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
      const t = performance.now();
      for (const [id, x, y, held, vx = 0, vy = 0, boosting = 0] of frame.cars || []) {
        if (id === opts.me) continue;
        seen.add(id);
        let o = others.get(id);
        if (!o) { o = { x, y, ang: 0, swim: rf(0, 6), kx: 0, ky: 0, bx: 0, by: 0, hitT: 0 }; others.set(id, o); if (projector) burst(x, y, COL.gold, 10, 120); }
        Object.assign(o, { rx: x, ry: y, rvx: vx, rvy: vy, seenAt: t, held, boostOn: !!boosting });
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
      // steering is in screen directions; a turned arena turns it back into arena ones
      return { ...screenToWorld(dx, dy, view.rot), k };
    }
    const swimming = () => { const m = M(); return !projector && !!m && m.in && st.phase === 'live'; };
    const slowed = () => { const m = M(); return !!m && m.slowUntil > now(); };

    /** Spend a ⚡ charge. */
    function fireBoost() {
      if (!swimming()) return;
      if (me.boostT > 0) return; // already boosting: never spend a second charge by accident
      if (slowed()) { hint('Slowed — no boost'); return; }
      if (charges < 1) { hint('Drive over a ⚡ to boost'); return; }
      const b = T().boost;
      charges--; firedAt = performance.now();
      const i = input();
      if (i.dx || i.dy) me.ang = Math.atan2(i.dy, i.dx);
      me.boostT = b.ms / 1000; me.stunT = 0;
      burst(me.x - Math.cos(me.ang) * 14, me.y - Math.sin(me.ang) * 14, COL.flame, 16, 210); buzz(15);
      if (opts.boost) Promise.resolve(opts.boost({ x: Math.round(me.x), y: Math.round(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy) })).catch(() => {});
    }
    const inBtn = (e) => {
      if (!btn) return false;
      const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
      return x >= btn.x - 6 && x <= btn.x + btn.w + 6 && y >= btn.y - 6 && y <= btn.y + btn.h + 6;
    };
    const onDown = (e) => {
      if (!swimming()) return;
      if (inBtn(e) || (joy.on && e.pointerId !== joy.id)) { fireBoost(); e.preventDefault(); return; } // the button, or a second finger
      Object.assign(joy, { on: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
      e.preventDefault();
    };
    const onMove = (e) => { if (joy.on && e.pointerId === joy.id) { joy.dx = e.clientX - joy.ox; joy.dy = e.clientY - joy.oy; } };
    // (a quick tap no longer boosts: a charge is precious now, and a tap is how a drag starts)
    const onUp = (e) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.dx = 0; joy.dy = 0; };
    const onKey = (e) => {
      if (!swimming() || canvas.offsetParent === null) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', ' '].includes(k)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.type === 'keydown') { if (k === ' ') { if (!e.repeat) fireBoost(); } else keys[k] = true; } else keys[k] = false;
    };
    if (!projector) {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKey, true);
    }

    // ---------------- what this device asks the server ----------------
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
          float(`${res.text} = ${res.val}${res.cost ? `  −${res.cost}` : ''}`, COL.coral, 1.6);
          if (opts.onWrong) opts.onWrong(res);
        }
      } catch (err) {
        // 409 "too far" or "round over": nothing happened; the chip can be tried again next frame
        if (err && err.status === 401 && opts.onGone) opts.onGone();
      } finally { setTimeout(() => pending.delete(chip.id), 250); }
    }

    const myName = () => (st && st.me && st.me.name) || '';
    async function tryPower(item, r) {
      pending.add(item.id);
      const round = r.n;
      try {
        const res = await opts.grab({ round, power: item.id, x: Math.round(me.x), y: Math.round(me.y) });
        if (round !== roundN) return;
        if (res.taken) { gone.add(item.id); return; }
        if (res.full) { charges = res.boosts; fullSeen.add(item.id); return; }
        if (res.power) {
          gone.add(item.id); seenPower.set(item.id, true); charges = res.boosts;
          burst(me.x, me.y, COL.flame, 22, 230); buzz(15);
          if (res.power === 'speed') float('+⚡ BOOST', COL.flame, 1.3);
          else say(`+${res.pts}!`, COL.flame);
        }
      } catch (err) {
        if (err && err.status === 409) gone.add(item.id); // it was gone by the time the claim landed
        if (err && err.status === 401 && opts.onGone) opts.onGone();
      } finally { setTimeout(() => pending.delete(item.id), 250); }
    }

    /** Where this car is, and how fast: twice a second while it moves, at once after a bump, a heartbeat at rest. */
    function sendPos(force) {
      const t = performance.now();
      const moved = Math.hypot(me.x - sentX, me.y - sentY);
      const turned = Math.hypot(me.vx - sentVx, me.vy - sentVy) > 45; // a stop or a sharp turn: the other screens are leading the car the old way
      if (((force || turned) && t - sentAt > 200) || (moved > 4 && t - sentAt > 500) || t - sentAt > 2500) {
        sentAt = t; sentX = me.x; sentY = me.y; sentVx = me.vx; sentVy = me.vy;
        opts.pos(Math.round(me.x), Math.round(me.y), Math.round(me.vx), Math.round(me.vy));
      }
    }

    // ---------------- simulate (own car, the others led and eased) ----------------
    function collide(m, tune) {
      const b = tune.bump;
      if (b.ghostSafe && m.held) return false; // a safe car is a ghost
      const top = tune.speed * tune.topMult * 0.95; // under the server's grab allowance, always
      let hit = false;
      for (const o of others.values()) {
        if (b.ghostSafe && o.held) continue;
        const was = o.hitT > 0;
        const v0 = { vx: me.vx, vy: me.vy };
        const n = bumpOff(me, { x: o.x, y: o.y, vx: o.rvx, vy: o.rvy }, b, top);
        if (!n) continue;
        if (was) { me.vx = v0.vx; me.vy = v0.vy; continue; } // still touching from the last bump: kept apart, not bounced again
        me.stunT = b.stunMs / 1000; o.hitT = 0.3;
        // on this screen the other car is knocked back too, until its own report arrives
        o.kx -= n.nx * b.kick * 1.2; o.ky -= n.ny * b.kick * 1.2;
        const cx = me.x - n.nx * b.r; const cy = me.y - n.ny * b.r;
        burst(cx, cy, COL.flame, 12, 230); burst(cx, cy, COL.foam, 6, 150);
        if (!calm()) shake = Math.max(shake, 6);
        hit = true;
      }
      return hit;
    }

    function step(dt) {
      const m = M(); const r = R();
      const tune = T();
      popT += dt;
      for (const q of parts) { q.t -= dt / q.life; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; }
      parts = parts.filter((q) => q.t > 0);
      for (const f of floats) { f.t -= dt; f.rise += 22 * dt; }
      floats = floats.filter((f) => f.t > 0);
      for (const b of bubbles) b.t -= dt * 1.6;
      bubbles = bubbles.filter((b) => b.t > 0);
      if (splash) { splash.t += dt; if (splash.t > 1.1) splash = null; }
      shake *= 0.86;
      const tNow = performance.now();
      for (const o of others.values()) {
        // lead the car from its last report by its reported speed (a little way: a stale report must not fly off)
        const age = Math.min(0.35, (tNow - (o.seenAt || tNow)) / 1000);
        let tx = o.rx + (o.rvx || 0) * age; let ty = o.ry + (o.rvy || 0) * age;
        o.bx += o.kx * dt; o.by += o.ky * dt;
        const kd = Math.max(0, 1 - 6 * dt); o.kx *= kd; o.ky *= kd;
        const bd = Math.max(0, 1 - 2.5 * dt); o.bx *= bd; o.by *= bd;
        tx += o.bx; ty += o.by;
        if (r) { tx = clamp(tx, EDGE, r.world.w - EDGE); ty = clamp(ty, EDGE, r.world.h - EDGE); }
        const dx = tx - o.x; const dy = ty - o.y; const d = Math.hypot(dx, dy);
        o.swim += dt; o.hitT = Math.max(0, o.hitT - dt);
        o.boost = o.boostOn ? 1 : clamp(Math.hypot(o.rvx || 0, o.rvy || 0) / (tune.speed * 1.6), 0, 1);
        if (d > 1.5) { const t = Math.atan2(dy, dx); o.ang += Math.atan2(Math.sin(t - o.ang), Math.cos(t - o.ang)) * Math.min(1, dt * 10); }
        o.x += dx * Math.min(1, dt * 10); o.y += dy * Math.min(1, dt * 10);
      }
      // the projector: two cars that meet throw sparks (each device does the bouncing; this is the room's view of it)
      if (projector && !calm() && others.size > 1) {
        const list = [...others.entries()];
        const R2 = tune.bump.r * 2;
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const [ia, a] = list[i]; const [ib, b] = list[j];
            if (tune.bump.ghostSafe && (a.held || b.held)) continue;
            if (Math.hypot(a.x - b.x, a.y - b.y) >= R2) continue;
            const key = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`;
            if (tNow - (sparked.get(key) || 0) < 450) continue;
            sparked.set(key, tNow);
            burst((a.x + b.x) / 2, (a.y + b.y) / 2, COL.flame, 14, 220); burst((a.x + b.x) / 2, (a.y + b.y) / 2, COL.foam, 6, 150);
          }
        }
      }
      if (!swimming() || !r) return;
      me.boostT = Math.max(0, me.boostT - dt); me.stunT = Math.max(0, me.stunT - dt);
      const i = input();
      const d = Math.hypot(i.dx, i.dy);
      if (me.stunT > 0) {
        // a bounced car coasts: the bump carries it before the steering takes over again
        const f = Math.max(0, 1 - 2.2 * dt); me.vx *= f; me.vy *= f;
      } else if (me.boostT > 0) {
        const dx = d ? i.dx / d : Math.cos(me.ang); const dy = d ? i.dy / d : Math.sin(me.ang);
        const v = tune.speed * tune.boost.mult; const k = Math.min(1, 10 * dt);
        me.vx += (dx * v - me.vx) * k; me.vy += (dy * v - me.vy) * k;
      } else {
        const speed = tune.speed * (slowed() ? 0.5 : 1) * (m.held ? tune.holdSlow || 1 : 1) * i.k; // carrying an orb is slower
        const wx = d ? (i.dx / d) * speed : 0; const wy = d ? (i.dy / d) * speed : 0;
        const k = Math.min(1, 8 * dt);
        me.vx += (wx - me.vx) * k; me.vy += (wy - me.vy) * k;
      }
      me.x += me.vx * dt; me.y += me.vy * dt;
      // the wall gives a little bounce back
      const W = r.world.w; const H = r.world.h;
      if (me.x < EDGE) { me.x = EDGE; if (me.vx < 0) me.vx *= -0.5; } else if (me.x > W - EDGE) { me.x = W - EDGE; if (me.vx > 0) me.vx *= -0.5; }
      if (me.y < EDGE) { me.y = EDGE; if (me.vy < 0) me.vy *= -0.5; } else if (me.y > H - EDGE) { me.y = H - EDGE; if (me.vy > 0) me.vy *= -0.5; }
      const bumped = collide(m, tune);
      if (bumped) { buzz(25); me.x = clamp(me.x, EDGE, W - EDGE); me.y = clamp(me.y, EDGE, H - EDGE); }
      const sp = Math.hypot(me.vx, me.vy);
      if (sp > 6) { const t = Math.atan2(me.vy, me.vx); const da = Math.atan2(Math.sin(t - me.ang), Math.cos(t - me.ang)); me.ang += da * Math.min(1, 14 * dt); }
      me.swim += dt;
      if (!calm() && (me.boostT > 0 || Math.random() < sp * dt * 0.012)) bubbles.push({ x: me.x - Math.cos(me.ang) * 14, y: me.y - Math.sin(me.ang) * 14, r: rf(1.2, 3.2), t: rf(0.5, 1) });

      if (!r.closed) {
        const at = now();
        // touching a chip is a claim; the server answers it. A car that has its orb is safe and claims nothing.
        if (m.held < (tune.maxHold || 1)) {
          for (const c of r.chips) {
            if (c.taken || gone.has(c.id) || pending.has(c.id) || stung.has(c.id) || passed.has(c.id)) continue;
            const p = chipAt(c, r.world, at, tune.margin);
            if (Math.hypot(p.x - me.x, p.y - me.y) <= tune.eatDist) { tryGrab(c, r); break; }
          }
        }
        // a power-up: take it — unless it is a ⚡ and the tank is full (then it is left for someone else)
        for (const p of r.powerups || []) {
          if (p.taken || gone.has(p.id) || pending.has(p.id) || at >= p.until) continue;
          const q = chipAt(p, r.world, at, tune.margin);
          if (Math.hypot(q.x - me.x, q.y - me.y) > tune.power.eat) { fullSeen.delete(p.id); continue; }
          if (p.kind === 'speed' && charges >= tune.boost.max) { if (!fullSeen.has(p.id)) { fullSeen.add(p.id); float('Boost tank full', COL.flame, 1.1); } continue; }
          tryPower(p, r); break;
        }
      }
      sendPos(bumped);
    }

    // ---------------- draw ----------------
    /** Draw at a point of the arena with the text the right way up, however the arena is turned. */
    function upright(x, y, fn) { ctx.save(); ctx.translate(x, y); if (view.rot) ctx.rotate(-view.rot); fn(); ctx.restore(); }

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
      if (view.rot) ctx.rotate(-view.rot); // everything below reads upright
      if (held) {
        ctx.strokeStyle = COL.good; ctx.lineWidth = 2.5; ctx.shadowColor = COL.good; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        if (held > 1) {
          ctx.fillStyle = COL.good; ctx.beginPath(); ctx.arc(21, -19, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = COL.ink; ctx.font = `700 12px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(held, 21, -18.5);
        }
      }
      if (label) {
        // a name never shrinks below a readable size on screen
        const fs = Math.max(big ? 13 : 11, (big ? 13 : 12) / view.s);
        ctx.font = `700 ${fs}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        // a dark outline: with orbs this big a car's name often sits on one, white on white
        ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = COL.ink; ctx.strokeText(label, 0, 26 + fs);
        ctx.globalAlpha *= 0.95; ctx.fillStyle = COL.foam; ctx.fillText(label, 0, 26 + fs);
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
      // a fact orb: a bright core you can read a fact on, inside a neon ring. Right and wrong look the same.
      ctx.shadowColor = COL.line; ctx.shadowBlur = taken ? 0 : 14;
      ctx.fillStyle = COL.chip; ctx.beginPath(); ctx.arc(p.x, p.y, R0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 4; ctx.strokeStyle = COL.line; ctx.stroke();
      // the fact fills the orb: ~0.6 of its radius per glyph height, a little less for a long one ("144÷12"),
      // and never below MIN_FACT_PX on screen (a long one is squeezed to fit the orb rather than shrunk)
      const fs = Math.max(R0 * (c.text.length > 5 ? 0.46 : c.text.length > 4 ? 0.52 : 0.62), MIN_FACT_PX / view.s);
      upright(p.x, p.y, () => {
        ctx.fillStyle = COL.ink; ctx.font = `800 ${Math.round(fs)}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.text, 0, 1, R0 * 1.85);
      });
      ctx.globalAlpha = 1;
      if (closed) {
        ctx.lineWidth = 5; ctx.strokeStyle = c.ok ? COL.good : COL.coral; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, R0 + 4, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        if (!c.ok) {
          const label = `= ${c.val}${c.hits ? `  · ${c.hits} hit` : ''}`;
          upright(p.x, p.y, () => {
            ctx.font = `700 ${Math.max(17, 13 / view.s)}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 4; ctx.strokeStyle = COL.ink; ctx.strokeText(label, 0, R0 + 20);
            ctx.fillStyle = COL.coral; ctx.fillText(label, 0, R0 + 20);
          });
        }
      }
    }

    /**
     * A power-up orb: dark glass in a gold ring, its prize in gold — "+100", "+50", or a bolt — so it never
     * reads as a fact. It pulses, and in its last two seconds it blinks: grab it before it goes.
     */
    function drawPowerUp(p, r, at, t, tune) {
      const R0 = tune.power.r;
      const q = chipAt(p, r.world, at, tune.margin);
      const left = p.until - at;
      if (left < 2000 && !calm() && Math.floor(t / 140) % 2) return; // blink out
      const born = clamp((at - p.t0) / 300, 0, 1); // it pops in: grows from nothing in 0.3 s
      const pulse = (calm() ? 1 : 1 + Math.sin(t / 200 + p.x) * 0.06) * (calm() ? 1 : 0.4 + 0.6 * born);
      upright(q.x, q.y, () => {
        ctx.scale(pulse, pulse);
        ctx.shadowColor = COL.flame; ctx.shadowBlur = 22;
        const g = ctx.createRadialGradient(0, -R0 * 0.3, R0 * 0.1, 0, 0, R0);
        g.addColorStop(0, '#5a3a08'); g.addColorStop(1, '#1e1203');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.lineWidth = 4.5; ctx.strokeStyle = COL.flame; ctx.stroke();
        // the time it has left, as a ring running down
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,211,90,.55)';
        ctx.beginPath(); ctx.arc(0, 0, R0 + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(left / Math.max(1, p.until - p.t0), 0, 1)); ctx.stroke();
        ctx.fillStyle = COL.flame;
        if (p.kind === 'speed') {
          const k = R0 / 24;
          ctx.beginPath(); ctx.moveTo(4 * k, -16 * k); ctx.lineTo(-9 * k, 3 * k); ctx.lineTo(-1 * k, 3 * k); ctx.lineTo(-4 * k, 16 * k); ctx.lineTo(9 * k, -4 * k); ctx.lineTo(1 * k, -4 * k); ctx.closePath(); ctx.fill();
        } else {
          const label = powerLabel(p.kind);
          const fs = Math.max(R0 * (label.length > 3 ? 0.62 : 0.72), MIN_FACT_PX / view.s);
          ctx.font = `900 ${Math.round(fs)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, 0, 2, R0 * 1.8);
        }
      });
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

    /** A small dark tag in a top corner of the screen. */
    function tag(text, x, align, color, size) {
      ctx.font = `700 ${size}px ${TEXT}`; ctx.textBaseline = 'top';
      const w = ctx.measureText(text).width + size; const h = size + 9; const x0 = align === 'left' ? x : x - w;
      ctx.fillStyle = 'rgba(8,12,32,.82)'; rr(ctx, x0, 8, w, h, 6); ctx.fill();
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, x0 + size / 2, 8 + 4.5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    }
    const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

    // Where the number to make sits: centred over the arena, or (a wide screen) in the strip beside it.
    const fsTopOf = () => (projector ? clamp(Math.min(ch * 0.11, cw * 0.1), 40, 130) : clamp(Math.min(cw, ch) * 0.11, 34, 60));
    const BTN = { w: 132, h: 54 };
    const TAGS = 40; // the two corner tags (who is left, the gate)
    let slot = { x: 0, fs: 40, top0: 10, bar: 320 }; // the target slab: its centre x, font size, top, clock-bar width

    /** How wide the target slab is drawn at font size `fs` (drawTarget's own arithmetic). */
    function slabW(fs, target) {
      ctx.font = `800 ${fs}px ${FONT}`; const nw = ctx.measureText(String(target)).width;
      ctx.font = `600 ${fs * 0.42}px ${FONT}`; const lw = ctx.measureText('MAKE').width;
      return lw + fs * 0.22 + nw + fs * 0.8;
    }

    function layout(world, target) {
      const fsTop = fsTopOf();
      if (projector) { view = fitView(cw, ch, world, { pad: 0 }); btn = null; slot = { x: cw / 2, fs: fsTop, top0: 10, bar: Math.min(cw - 40, 320) }; return; }
      // A wide screen (a Chromebook): the arena takes the full height, the number goes in the left strip and the
      // button in the right one. Otherwise the number gets a band on top and the button a band below if it needs one.
      const wide = fitView(cw, ch, world, { top: TAGS, canTurn: true });
      const strip = (cw - (wide.rot ? world.h : world.w) * wide.s) / 2;
      const fsSide = Math.min(fsTop, 54);
      if (strip >= Math.max(slabW(fsSide, target), BTN.w) + 24) {
        view = wide;
        slot = { x: strip / 2, fs: fsSide, top0: TAGS + 8, bar: Math.min(strip - 24, 320) };
      } else {
        const top = 58 + fsTop * 1.3;
        let v = fitView(cw, ch, world, { top, canTurn: true });
        if ((cw - (v.rot ? world.h : world.w) * v.s) / 2 < BTN.w + 20) v = fitView(cw, ch, world, { top, bottom: BTN.h + 16, canTurn: true });
        view = v;
        slot = { x: cw / 2, fs: fsTop, top0: 38, bar: Math.min(cw - 40, 320) };
      }
      btn = { x: cw - BTN.w - 12, y: ch - BTN.h - 12, w: BTN.w, h: BTN.h };
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
      layout(r.world, r.target);

      ctx.save();
      const sx = shake > 0.3 ? rf(-1, 1) * shake : 0; const sy = shake > 0.3 ? rf(-1, 1) * shake : 0;
      ctx.translate(view.cx + sx, view.cy + sy); ctx.rotate(view.rot); ctx.scale(view.s, view.s); ctx.translate(-W / 2, -H / 2);
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
      // power-ups on top: they are there for a few seconds, and an orb drifting over one must not hide it
      if (!r.closed) for (const p of r.powerups || []) if (!p.taken && !gone.has(p.id) && at < p.until) drawPowerUp(p, r, at, t, tune);
      ctx.fillStyle = COL.gold;
      for (const b of bubbles) { ctx.globalAlpha = clamp(b.t, 0, 1) * 0.6; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      const ghost = tune.bump.ghostSafe;
      for (const [id, o] of others) {
        ctx.globalAlpha = ghost && o.held ? 0.5 : 1; // a safe car is a ghost: see-through
        drawCar(o.x, o.y, o.ang, o.swim, projector ? paintOf(id) : COL.bot, o.held, projector ? names.get(id) || '' : '', projector, o.boost);
      }
      ctx.globalAlpha = 1;
      if (follow) {
        // with the whole arena on a phone, your car is small: a ring that breathes says which one is yours
        const pr = 30 + (calm() ? 0 : Math.sin(t / 260) * 4);
        ctx.strokeStyle = COL.gold; ctx.lineWidth = Math.max(2.5, 2 / view.s); ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(me.x, me.y, pr, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.globalAlpha = (slowed() ? 0.55 : 1) * (ghost && m.held ? 0.7 : 1);
        // "YOU" for the first seconds of a round, to find your car; after that the ring does it without covering an orb
        drawCar(me.x, me.y, me.ang, me.swim, COL.gold, m.held, popT < 3.5 ? 'YOU' : '', false, me.boostT > 0 ? 1 : Math.hypot(me.vx, me.vy) / (tune.speed * 1.6));
        ctx.globalAlpha = 1;
        upright(me.x, me.y, () => {
          // the charges, under the car
          const n = tune.boost.max; const gap = Math.max(16, 14 / view.s); const pr2 = Math.max(5, 4 / view.s);
          for (let k = 0; k < n; k++) {
            const x = (k - (n - 1) / 2) * gap; const y = 28 + pr2;
            ctx.beginPath(); ctx.arc(x, y, pr2, 0, Math.PI * 2);
            if (k < charges) { ctx.fillStyle = COL.flame; ctx.fill(); } else { ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(238,246,255,.45)'; ctx.stroke(); }
          }
        });
      }
      for (const q of parts) { ctx.globalAlpha = clamp(q.t, 0, 1); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.4 + q.t * 0.6), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const f of floats) {
        upright(f.x, f.y, () => {
          const fs = Math.max(15, 13 / view.s);
          ctx.globalAlpha = clamp(f.t, 0, 1); ctx.font = `700 ${fs}px ${TEXT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4; ctx.strokeStyle = COL.ink; ctx.strokeText(f.text, 0, -f.rise / Math.min(1, view.s)); ctx.fillStyle = f.color; ctx.fillText(f.text, 0, -f.rise / Math.min(1, view.s));
        });
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // ---- screen space ----
      const left = r.closesAt - at;
      const live = st.phase === 'live' && !r.closed;
      if (follow && live && !m.held && left < 3000) {
        const v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
        v.addColorStop(0, 'rgba(255,107,94,0)'); v.addColorStop(1, `rgba(255,107,94,${0.28 + (calm() ? 0 : 0.2 * Math.sin(t / 80))})`);
        ctx.fillStyle = v; ctx.fillRect(0, 0, cw, ch);
      }
      const fsTop = slot.fs;
      const top0 = slot.top0;
      const topY = top0 + fsTop * 0.65;
      // a new number pops big in the middle of the screen, then settles into its place
      const k0 = clamp((popT - 0.45) / 0.3, 0, 1); const k = calm() ? 1 : k0 * k0 * (3 - 2 * k0);
      const fsBig = Math.min(fsTop * 1.9, cw * 0.26); const popY = Math.max(topY, ch * 0.24);
      drawTarget(slot.x + (cw / 2 - slot.x) * (1 - k), topY + (popY - topY) * (1 - k), fsTop + (fsBig - fsTop) * (1 - k), r.target);
      // the round's clock: a bar under the number, red for the last three seconds
      const bw = slot.bar; const by = top0 + fsTop * 1.3 + 8;
      if (live) {
        const frac = clamp(left / (r.closesAt - r.openedAt), 0, 1);
        ctx.fillStyle = 'rgba(234,247,244,.18)'; rr(ctx, slot.x - bw / 2, by, bw, 6, 3); ctx.fill();
        ctx.fillStyle = left < 3000 ? COL.coral : COL.gold; rr(ctx, slot.x - bw / 2, by, Math.max(6, bw * frac), 6, 3); ctx.fill();
      }
      // a student's arena can fill the whole phone, so it carries its own scoreboard: who is left, and the gate.
      // The projector draws the same when its side panel is hidden.
      const gl = (m.gateAt || 0) - at;
      const gate = gl > 0 ? `Gate ${mmss(gl)}` : 'Sudden death';
      const gateCol = gl > 15000 ? COL.foam : COL.coral;
      if (follow) {
        tag(`${m.alive} left · ${m.pts} pts (#${m.rank})`, 8, 'left', COL.line, 13);
        tag(gate, cw - 8, 'right', gateCol, 13);
      } else if (projector && hud) {
        const fs = clamp(ch * 0.03, 16, 28);
        tag(`${m.alive} of ${m.of} still driving`, 10, 'left', COL.line, fs);
        tag(m.gateOpen ? `Comebacks open · ${gate}` : 'Gate closed — last car wins', cw - 10, 'right', gateCol, fs);
      }
      let y = by + 34;
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
      // the BOOST button: bright with a charge, dim without (a tap on it then says how to get one)
      if (follow && st.phase === 'live' && btn) {
        const on = charges > 0 && !slowed() && me.boostT <= 0;
        ctx.globalAlpha = on || me.boostT > 0 ? 1 : 0.55;
        ctx.fillStyle = on ? 'rgba(64,38,4,.95)' : 'rgba(8,12,32,.88)'; rr(ctx, btn.x, btn.y, btn.w, btn.h, 14); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = on || me.boostT > 0 ? COL.flame : 'rgba(238,246,255,.35)';
        if (on) { ctx.shadowColor = COL.flame; ctx.shadowBlur = calm() ? 0 : 10 + Math.sin(t / 200) * 6; }
        ctx.stroke(); ctx.shadowBlur = 0;
        if (me.boostT > 0) { ctx.fillStyle = 'rgba(255,211,90,.35)'; rr(ctx, btn.x + 4, btn.y + btn.h - 10, (btn.w - 8) * (me.boostT / (tune.boost.ms / 1000)), 6, 3); ctx.fill(); }
        ctx.fillStyle = on || me.boostT > 0 ? COL.flame : COL.foam; ctx.font = `800 21px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`⚡ BOOST ×${charges}`, btn.x + btn.w / 2, btn.y + btn.h / 2 - (me.boostT > 0 ? 3 : 0));
        ctx.globalAlpha = 1;
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
      /** Projector: draw who is left and the gate on the canvas (the page has hidden its side panel). */
      hud(on) { hud = !!on; },
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

  if (typeof window !== 'undefined') window.LiveDrillKnockout = { mount, chipAt, bounce, fitView, screenToWorld, bumpOff };
  if (typeof module !== 'undefined' && module.exports) module.exports = { chipAt, bounce, fitView, screenToWorld, bumpOff };
})();
