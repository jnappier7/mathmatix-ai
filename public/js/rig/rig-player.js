// public/js/rig/rig-player.js
// Browser runtime for layered PNG rigs: loads a rig package (rig.json +
// part images), evaluates animation clips via RigCore, and renders to any
// 2D canvas. Depends on rig-core.js (window.RigCore).
//
// Usage:
//   const player = await RigPlayer.load('/rigs/mr-nappier/');
//   player.attach(canvas);                  // starts the rAF loop
//   player.playBase(idleClip);              // looping base layer
//   player.playOverlay(celebrateClip);      // one-shot overlay on top
//
// Layering: base (usually a looping idle) is sampled first, overlays are
// sampled at their own local time and override base tracks. Finished
// non-looping overlays are dropped automatically.
(function (root) {
  'use strict';
  const Core = root.RigCore;
  if (!Core) throw new Error('rig-player.js requires rig-core.js to be loaded first');

  class RigPlayer {
    constructor(rig, images, baseUrl) {
      this.rig = rig;
      this.images = images; // { partName: HTMLImageElement }
      this.baseUrl = baseUrl;
      this.canvas = null;
      this.ctx = null;
      this.view = [0, 0, rig.canvas[0], rig.canvas[1]];
      this.background = null; // null = transparent
      this.base = null;       // { clip, start }  (clock seconds)
      this.overlays = [];     // [{ clip, start }]
      this.staticPose = null; // when set, replaces clip evaluation entirely
      this.clock = 0;
      this._raf = 0;
      this._lastTs = 0;
      this._alphaCache = {};  // partName -> {data, w, h, scale}
      this._blink = null;     // { next, until } for auto-blink
      this.onFrame = null;    // hook(pose, time) — after sampling, before draw
      this.secondaryMotion = true; // spring follow-through (rig.secondaryMotion)
      this.microMotion = true;     // moving-hold drift (rig.microMotion)
      this._springs = Core.newSpringState();
      this._springTime = null;
    }

    static async load(baseUrl, { fetchImpl } = {}) {
      const url = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
      const doFetch = fetchImpl || root.fetch.bind(root);
      const res = await doFetch(url + 'rig.json');
      if (!res.ok) throw new Error('RigPlayer: failed to load ' + url + 'rig.json (' + res.status + ')');
      const rig = await res.json();
      const dir = rig.partsDir ? url + rig.partsDir + '/' : url;
      const entries = await Promise.all(
        Object.entries(rig.parts).map(([name, part]) => new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([name, img]);
          img.onerror = () => reject(new Error('RigPlayer: failed to load part image ' + part.src));
          img.src = dir + part.src;
        }))
      );
      return new RigPlayer(rig, Object.fromEntries(entries), url);
    }

    // ------------------------------------------------------------ playback --
    playBase(clip) {
      this.staticPose = null;
      this.base = clip ? { clip, start: this.clock } : null;
    }

    playOverlay(clip, { restart = true } = {}) {
      if (!clip) return;
      this.staticPose = null;
      if (!restart && this.overlays.some((o) => o.clip === clip)) return;
      this.overlays = this.overlays.filter((o) => o.clip.name !== clip.name);
      this.overlays.push({ clip, start: this.clock });
    }

    clearOverlays() { this.overlays = []; }

    setStaticPose(pose) { this.staticPose = pose; }

    // Auto-blink convenience: closes both eye slots for ~140ms every few
    // seconds unless the current pose already drives them.
    setAutoBlink(on) {
      this._blink = on ? { next: this.clock + 1.5 + Math.random() * 2.5, until: 0 } : null;
    }

    samplePose(time) {
      if (this.staticPose) return this.staticPose;
      let pose = {};
      if (this.base) {
        pose = Core.sampleClip(this.base.clip, time - this.base.start);
      }
      this.overlays = this.overlays.filter((o) => {
        const local = time - o.start;
        const done = !o.clip.loop && local >= Core.clipDuration(o.clip);
        if (!done) pose = Core.composePose(pose, Core.sampleClip(o.clip, local));
        return !done;
      });
      if (this._blink) {
        if (time >= this._blink.next) {
          this._blink.until = time + 0.14;
          this._blink.next = time + 2.2 + Math.random() * 3.2;
        }
        if (time < this._blink.until
            && pose['slots.eye_L'] === undefined && pose['slots.eye_R'] === undefined) {
          pose['slots.eye_L'] = 'closed';
          pose['slots.eye_R'] = 'closed';
        }
      }
      return pose;
    }

    // ----------------------------------------------------------- rendering --
    // Maps the rig-space rect `view` into the canvas, letterboxed + centered.
    viewMatrix(canvasW, canvasH) {
      const [vx, vy, vw, vh] = this.view;
      const s = Math.min(canvasW / vw, canvasH / vh);
      return [s, 0, 0, s, (canvasW - vw * s) / 2 - vx * s, (canvasH - vh * s) / 2 - vy * s];
    }

    draw(ctx, pose, { clear = true } = {}) {
      const cw = ctx.canvas.width; const ch = ctx.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (clear) ctx.clearRect(0, 0, cw, ch);
      if (this.background) {
        ctx.fillStyle = this.background;
        ctx.fillRect(0, 0, cw, ch);
      }
      const vm = this.viewMatrix(cw, ch);
      const world = Core.computeWorldTransforms(this.rig, pose);
      const slotVis = Core.resolveSlotVisibility(this.rig, pose);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      for (const name of Core.drawOrder(this.rig)) {
        if (!Core.isPartVisible(this.rig, pose, name, slotVis)) continue;
        const node = world[name];
        if (node.opacity <= 0) continue;
        const m = Core.matMul(vm, node.matrix);
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.globalAlpha = Math.min(1, Math.max(0, node.opacity));
        ctx.drawImage(this.images[name], 0, 0);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Sampled pose plus the life layers (micro-motion, spring follow-through).
    // Springs are stateful: monotonic time steps advance them; a rewind or a
    // big jump (scrub, clip switch) resets them to the pose.
    enrichPose(pose, time) {
      let p = pose;
      if (this.microMotion && this.rig.microMotion) {
        p = Core.applyMicroMotion(this.rig, p, time);
      }
      if (this.secondaryMotion && this.rig.secondaryMotion) {
        const dt = this._springTime === null ? 0 : time - this._springTime;
        this._springTime = time;
        if (dt <= 0 || dt > 0.5) this._springs = Core.newSpringState();
        else p = Core.stepSecondaryMotion(this.rig, p, this._springs, dt);
      }
      return p;
    }

    renderAt(time, ctx) {
      const pose = this.enrichPose(this.samplePose(time), time);
      if (this.onFrame) this.onFrame(pose, time);
      this.draw(ctx || this.ctx, pose);
      return pose;
    }

    // --------------------------------------------------------- rAF driving --
    attach(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.start();
    }

    start() {
      if (this._raf) return;
      this._lastTs = 0;
      const loop = (ts) => {
        this._raf = requestAnimationFrame(loop);
        if (this._lastTs) this.clock += Math.min(0.1, (ts - this._lastTs) / 1000);
        this._lastTs = ts;
        if (this.ctx) this.renderAt(this.clock);
      };
      this._raf = requestAnimationFrame(loop);
    }

    pause() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
    }

    // ------------------------------------------------------------- picking --
    // Alpha-accurate hit test in canvas (client) pixel coordinates.
    // Returns the topmost part name or null.
    pickPart(pose, canvasX, canvasY, { minAlpha = 8 } = {}) {
      const world = Core.computeWorldTransforms(this.rig, pose);
      const slotVis = Core.resolveSlotVisibility(this.rig, pose);
      const vmInv = Core.matInvert(this.viewMatrix(this.canvas.width, this.canvas.height));
      if (!vmInv) return null;
      const [rx, ry] = Core.matApply(vmInv, canvasX, canvasY);
      const order = Core.drawOrder(this.rig).reverse(); // topmost first
      for (const name of order) {
        if (!Core.isPartVisible(this.rig, pose, name, slotVis)) continue;
        const inv = Core.matInvert(world[name].matrix);
        if (!inv) continue;
        const [px, py] = Core.matApply(inv, rx, ry);
        if (px < 0 || py < 0 || px >= this.rig.canvas[0] || py >= this.rig.canvas[1]) continue;
        if (this._alphaAt(name, px, py) >= minAlpha) return name;
      }
      return null;
    }

    _alphaAt(name, x, y) {
      let cache = this._alphaCache[name];
      if (!cache) {
        const SCALE = 4; // 256×384 alpha map per part — plenty for picking
        const w = Math.ceil(this.rig.canvas[0] / SCALE);
        const h = Math.ceil(this.rig.canvas[1] / SCALE);
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        const octx = off.getContext('2d', { willReadFrequently: true });
        octx.drawImage(this.images[name], 0, 0, w, h);
        cache = { data: octx.getImageData(0, 0, w, h).data, w, h, scale: SCALE };
        this._alphaCache[name] = cache;
      }
      const cx = Math.floor(x / cache.scale); const cy = Math.floor(y / cache.scale);
      if (cx < 0 || cy < 0 || cx >= cache.w || cy >= cache.h) return 0;
      return cache.data[(cy * cache.w + cx) * 4 + 3];
    }

    setFraming(key) {
      const f = this.rig.framings && this.rig.framings[key];
      if (f) this.view = [...f.view];
      else this.view = [0, 0, this.rig.canvas[0], this.rig.canvas[1]];
      return f || null;
    }
  }

  root.RigPlayer = RigPlayer;
})(typeof self !== 'undefined' ? self : this);
