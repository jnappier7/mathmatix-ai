// public/js/animation-studio.js
// Rig Animation Studio: keyframe editor + renderer for layered PNG rigs.
// Author clips on the timeline, preview them layered on the idle loop
// exactly like the runtime plays them, and export WebM videos (the format
// the chat tutor-cam ships) or clip JSON for the RigPlayer runtime.
// Depends on rig-core.js (RigCore) and rig-player.js (RigPlayer).
(function () {
  'use strict';
  /* global RigPlayer */
  const Core = window.RigCore;

  const RIGS = [
    { id: 'mr-nappier', label: 'Mr. Nappier' },
  ];
  const CHANNEL_META = {
    rotation: { label: 'rotation', min: -180, max: 180, step: 0.5, unit: '°' },
    x: { label: 'x', min: -300, max: 300, step: 1, unit: 'px' },
    y: { label: 'y', min: -300, max: 300, step: 1, unit: 'px' },
    scaleX: { label: 'scale X', min: 0, max: 2, step: 0.005, unit: '×' },
    scaleY: { label: 'scale Y', min: 0, max: 2, step: 0.005, unit: '×' },
    opacity: { label: 'opacity', min: 0, max: 1, step: 0.01, unit: '' },
  };
  const STORAGE_PREFIX = 'mmxAnimStudio:';
  const EPS = 1e-4;

  // ------------------------------------------------------------------ state
  const S = {
    rigId: null,
    player: null,          // RigPlayer (rendering + picking, not self-driving)
    idleClip: null,        // preset idle for underlay preview / export
    presets: {},           // name -> pristine preset clip (server copies)
    clips: {},             // name -> clip (library: presets + user clips)
    clip: null,            // the clip being edited
    time: 0,
    playing: false,
    autoKey: true,
    snap: true,
    onion: false,
    idleUnder: false,
    background: '#ffffff', // 'checker' | css color
    selectedPart: null,
    selectedKeys: [],      // [{ track, t }]
    undoStack: [],
    redoStack: [],
    undoTag: null,
    dirtySaveTimer: 0,
    timelineRows: [],      // rebuilt on layout: [{track, y}]
  };

  const $ = (id) => document.getElementById(id);
  const els = {};
  ['rigSelect', 'clipSelect', 'btnNewClip', 'btnDupClip', 'btnRenameClip', 'btnDeleteClip',
    'btnImport', 'importFile', 'btnDownload', 'btnSnapshot', 'btnExport', 'btnHelp',
    'partTree', 'slotPanel', 'framingSelect', 'bgSelect', 'onionToggle', 'baseToggle',
    'btnZoomFit', 'btnZoom100', 'zoomLabel', 'viewportHost', 'viewport', 'viewportHint',
    'inspectorEmpty', 'inspector', 'inspPartName', 'channelRows', 'btnResetPart',
    'keyEmpty', 'keyEditor', 'keyInfo', 'keyEasing', 'keyTime', 'keyValue', 'keyValueField',
    'btnDeleteKeys', 'clipDuration', 'clipFps', 'clipLoop',
    'btnToStart', 'btnPlay', 'btnStepBack', 'btnStepFwd', 'timeLabel',
    'autoKeyToggle', 'snapToggle', 'btnKeyPose', 'btnUndo', 'btnRedo',
    'timelineHost', 'timeline',
    'exportModal', 'exportFraming', 'exportFps', 'exportBg', 'exportLoops', 'exportBase',
    'exportBlink', 'exportStatus', 'btnExportCancel', 'btnExportGo',
    'helpModal', 'btnHelpClose',
  ].forEach((id) => { els[id] = $(id); });

  // ------------------------------------------------------------- clip utils
  const fps = () => (S.clip && S.clip.fps) || 30;
  const snapT = (t) => {
    const clamped = Math.max(0, Math.min(t, S.clip.duration));
    return S.snap ? Math.round(clamped * fps()) / fps() : clamped;
  };

  function getTrack(name) { return S.clip.tracks[name]; }

  function upsertKey(track, t, v, easing) {
    let keys = S.clip.tracks[track];
    if (!keys) { keys = []; S.clip.tracks[track] = keys; }
    const existing = keys.find((k) => Math.abs(k.t - t) < EPS);
    if (existing) {
      existing.v = v;
      if (easing !== undefined) existing.e = easing;
    } else {
      const key = { t, v };
      if (easing !== undefined) key.e = easing;
      else if (typeof v === 'string') key.e = 'step';
      keys.push(key);
      keys.sort((a, b) => a.t - b.t);
    }
    scheduleSave();
  }

  function deleteKey(track, t) {
    const keys = S.clip.tracks[track];
    if (!keys) return;
    const i = keys.findIndex((k) => Math.abs(k.t - t) < EPS);
    if (i >= 0) keys.splice(i, 1);
    if (keys.length === 0) delete S.clip.tracks[track];
    scheduleSave();
  }

  function keyAt(track, t) {
    const keys = S.clip.tracks[track];
    return keys && keys.find((k) => Math.abs(k.t - t) < EPS);
  }

  // The pose being edited (this clip only, clamped/wrapped to its duration).
  function editPose(t) { return Core.sampleClip(S.clip, t === undefined ? S.time : t); }

  // What the viewport shows: optionally layered on the looping idle.
  function displayPose(t) {
    const at = t === undefined ? S.time : t;
    const own = editPose(at);
    if (S.idleUnder && S.idleClip && S.clip.name !== S.idleClip.name) {
      return Core.composePose(Core.sampleClip(S.idleClip, at), own);
    }
    return own;
  }

  function channelValue(part, prop, t) {
    const track = getTrack(part + '.' + prop);
    if (track && track.length) return Core.sampleTrack(track, t === undefined ? S.time : t);
    return Core.CHANNEL_DEFAULTS[prop];
  }

  function slotState(slot, t) {
    const track = getTrack('slots.' + slot);
    if (track && track.length) return Core.sampleTrack(track, t === undefined ? S.time : t);
    return S.player.rig.slots[slot].default;
  }

  // Set a channel value; keys at the playhead (or t=0 for a fresh track
  // when auto-key is off, acting as a constant).
  function setChannel(part, prop, value) {
    const name = part + '.' + prop;
    const keys = getTrack(name);
    const t = (S.autoKey || (keys && keys.length)) ? snapT(S.time) : 0;
    upsertKey(name, t, value);
    refreshSoon();
  }

  function setSlot(slot, state) {
    const name = 'slots.' + slot;
    const keys = getTrack(name);
    const t = (S.autoKey || (keys && keys.length)) ? snapT(S.time) : 0;
    upsertKey(name, t, state, 'step');
    refreshSoon();
  }

  // ---------------------------------------------------------------- undo/redo
  function pushUndo(tag) {
    if (tag && tag === S.undoTag) return; // one snapshot per gesture
    S.undoTag = tag || null;
    S.undoStack.push(JSON.stringify(S.clip));
    if (S.undoStack.length > 80) S.undoStack.shift();
    S.redoStack.length = 0;
  }
  function endGesture() { S.undoTag = null; }

  function undo() {
    if (!S.undoStack.length) return;
    S.redoStack.push(JSON.stringify(S.clip));
    restoreClip(JSON.parse(S.undoStack.pop()));
  }
  function redo() {
    if (!S.redoStack.length) return;
    S.undoStack.push(JSON.stringify(S.clip));
    restoreClip(JSON.parse(S.redoStack.pop()));
  }
  function restoreClip(clip) {
    S.clips[clip.name] = clip;
    S.clip = clip;
    S.selectedKeys = [];
    scheduleSave();
    refreshAll();
  }

  // -------------------------------------------------------------- persistence
  function storageKey() { return STORAGE_PREFIX + S.rigId; }

  function scheduleSave() {
    clearTimeout(S.dirtySaveTimer);
    S.dirtySaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey(), JSON.stringify({ clips: S.clips }));
      } catch { /* storage full — non-fatal */ }
    }, 400);
  }

  function loadStoredClips() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return {};
      return JSON.parse(raw).clips || {};
    } catch { return {}; }
  }

  // ------------------------------------------------------------------- boot
  async function boot() {
    els.rigSelect.innerHTML = '';
    for (const rig of RIGS) {
      const opt = document.createElement('option');
      opt.value = rig.id; opt.textContent = rig.label;
      els.rigSelect.appendChild(opt);
    }
    await loadRig(RIGS[0].id);
    bindUI();
    requestAnimationFrame(frame);
  }

  async function loadRig(rigId) {
    S.rigId = rigId;
    S.player = await RigPlayer.load('/rigs/' + rigId + '/');
    S.player.canvas = els.viewport;
    S.player.ctx = els.viewport.getContext('2d');

    // presets from the server, then user library on top
    S.presets = {};
    try {
      const index = await (await fetch('/rigs/' + rigId + '/clips/index.json')).json();
      const loaded = await Promise.all(index.clips.map(async (name) => {
        const res = await fetch('/rigs/' + rigId + '/clips/' + name + '.json');
        return res.ok ? res.json() : null;
      }));
      for (const clip of loaded) if (clip) S.presets[clip.name] = clip;
    } catch { /* no presets — fine */ }

    S.clips = {};
    for (const [name, clip] of Object.entries(S.presets)) {
      S.clips[name] = JSON.parse(JSON.stringify(clip));
    }
    Object.assign(S.clips, loadStoredClips());
    S.idleClip = S.presets.idle || S.clips.idle || null;

    selectClip(S.clips.idle ? 'idle' : Object.keys(S.clips)[0]);
    buildFramingSelect();
    buildPartTree();
    buildSlotPanel();
    fitView();
  }

  function selectClip(name) {
    if (!S.clips[name]) {
      const clip = Core.newClip(name);
      clip.fps = 30;
      S.clips[name] = clip;
    }
    S.clip = S.clips[name];
    S.time = 0;
    S.playing = false;
    S.selectedKeys = [];
    S.undoStack.length = 0;
    S.redoStack.length = 0;
    buildClipSelect();
    refreshAll();
  }

  function buildClipSelect() {
    els.clipSelect.innerHTML = '';
    for (const name of Object.keys(S.clips).sort()) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name + (S.presets[name] ? ' ●' : '');
      if (S.clip && name === S.clip.name) opt.selected = true;
      els.clipSelect.appendChild(opt);
    }
  }

  function buildFramingSelect() {
    const framings = S.player.rig.framings || {};
    for (const sel of [els.framingSelect, els.exportFraming]) {
      sel.innerHTML = '';
      for (const [key, f] of Object.entries(framings)) {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = f.label || key;
        sel.appendChild(opt);
      }
    }
    els.framingSelect.value = 'full';
    if (framings.cam32) els.exportFraming.value = 'cam32';
  }

  // -------------------------------------------------------------- part tree
  function buildPartTree() {
    const rig = S.player.rig;
    const children = { root: [] };
    for (const [name, part] of Object.entries(rig.parts)) {
      if (part.hidden) continue; // slot variants are driven via slots
      (children[part.parent || 'root'] = children[part.parent || 'root'] || []).push(name);
      children[name] = children[name] || [];
    }
    els.partTree.innerHTML = '';
    const add = (name, depth) => {
      const node = document.createElement('div');
      node.className = 'pt-node';
      node.dataset.part = name;
      node.style.paddingLeft = 6 + depth * 14 + 'px';
      const label = document.createElement('span');
      label.textContent = name;
      const keys = document.createElement('span');
      keys.className = 'pt-keys';
      node.append(label, keys);
      node.addEventListener('click', () => { selectPart(name); });
      els.partTree.appendChild(node);
      for (const child of (children[name] || []).sort()) add(child, depth + 1);
    };
    add('root', 0);
  }

  function updatePartTree() {
    for (const node of els.partTree.children) {
      const part = node.dataset.part;
      node.classList.toggle('selected', part === S.selectedPart);
      let count = 0;
      for (const [track, keys] of Object.entries(S.clip.tracks)) {
        if (track.startsWith(part + '.')) count += keys.length;
      }
      node.querySelector('.pt-keys').textContent = count ? `◆${count}` : '';
    }
  }

  function selectPart(name) {
    S.selectedPart = name;
    refreshAll();
  }

  // ------------------------------------------------------------- slot panel
  function buildSlotPanel() {
    els.slotPanel.innerHTML = '';
    const slots = S.player.rig.slots || {};
    for (const [slotName, slot] of Object.entries(slots)) {
      const row = document.createElement('div');
      row.className = 'slot-row';
      const label = document.createElement('span');
      label.textContent = slotName;
      const sel = document.createElement('select');
      for (const state of Object.keys(slot.states)) {
        const opt = document.createElement('option');
        opt.value = state; opt.textContent = state;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        pushUndo();
        setSlot(slotName, sel.value);
      });
      const keyBtn = document.createElement('button');
      keyBtn.className = 'key-btn';
      keyBtn.textContent = '◆';
      keyBtn.title = 'Key this slot at the playhead';
      keyBtn.addEventListener('click', () => {
        pushUndo();
        const name = 'slots.' + slotName;
        const t = snapT(S.time);
        if (keyAt(name, t)) deleteKey(name, t);
        else upsertKey(name, t, sel.value, 'step');
        refreshSoon();
      });
      row.append(label, sel, keyBtn);
      row.dataset.slot = slotName;
      els.slotPanel.appendChild(row);
    }
  }

  function updateSlotPanel() {
    for (const row of els.slotPanel.children) {
      const slotName = row.dataset.slot;
      const sel = row.querySelector('select');
      if (document.activeElement !== sel) sel.value = slotState(slotName);
      const btn = row.querySelector('.key-btn');
      const track = getTrack('slots.' + slotName);
      btn.classList.toggle('keyed', !!(track && track.length));
    }
  }

  // -------------------------------------------------------------- inspector
  function buildInspector() {
    els.channelRows.innerHTML = '';
    for (const prop of Core.CHANNELS) {
      const meta = CHANNEL_META[prop];
      const row = document.createElement('div');
      row.className = 'ch-row';
      row.dataset.prop = prop;

      const label = document.createElement('label');
      label.textContent = meta.label;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = meta.min; slider.max = meta.max; slider.step = meta.step;

      const num = document.createElement('input');
      num.type = 'number';
      num.step = meta.step;

      const keyBtn = document.createElement('button');
      keyBtn.className = 'ch-key';
      keyBtn.textContent = '◆';
      keyBtn.title = 'Toggle a keyframe at the playhead';

      slider.addEventListener('pointerdown', () => pushUndo('slider:' + prop));
      slider.addEventListener('input', () => {
        num.value = slider.value;
        setChannel(S.selectedPart, prop, parseFloat(slider.value));
      });
      slider.addEventListener('change', endGesture);
      num.addEventListener('change', () => {
        const v = parseFloat(num.value);
        if (!Number.isFinite(v)) return;
        pushUndo();
        setChannel(S.selectedPart, prop, v);
      });
      keyBtn.addEventListener('click', () => {
        pushUndo();
        const name = S.selectedPart + '.' + prop;
        const t = snapT(S.time);
        if (keyAt(name, t)) deleteKey(name, t);
        else upsertKey(name, t, channelValue(S.selectedPart, prop));
        refreshSoon();
      });

      row.append(label, slider, num, keyBtn);
      els.channelRows.appendChild(row);
    }
  }

  function updateInspector() {
    const part = S.selectedPart;
    els.inspectorEmpty.hidden = !!part;
    els.inspector.hidden = !part;
    if (!part) return;
    els.inspPartName.textContent = part;
    for (const row of els.channelRows.children) {
      const prop = row.dataset.prop;
      const v = channelValue(part, prop);
      const [, slider, num, keyBtn] = row.children;
      if (document.activeElement !== slider) slider.value = v;
      if (document.activeElement !== num) num.value = Math.round(v * 1000) / 1000;
      const track = getTrack(part + '.' + prop);
      keyBtn.classList.toggle('keyed', !!(track && track.length));
      keyBtn.classList.toggle('on-key', !!keyAt(part + '.' + prop, snapT(S.time)));
    }
  }

  function updateKeyEditor() {
    const sel = S.selectedKeys;
    els.keyEmpty.hidden = sel.length > 0;
    els.keyEditor.hidden = sel.length === 0;
    if (!sel.length) return;
    const { track, t } = sel[sel.length - 1];
    const key = keyAt(track, t);
    if (!key) { S.selectedKeys = []; updateKeyEditor(); return; }
    els.keyInfo.textContent = `${track} — ${sel.length > 1 ? sel.length + ' keys' : 't=' + key.t.toFixed(2) + 's'}`;
    if (document.activeElement !== els.keyEasing) {
      els.keyEasing.value = key.e || (typeof key.v === 'string' ? 'step' : Core.DEFAULT_EASING);
    }
    if (document.activeElement !== els.keyTime) els.keyTime.value = Math.round(key.t * 1000) / 1000;
    const numeric = typeof key.v === 'number';
    els.keyValueField.style.display = numeric ? '' : 'none';
    if (numeric && document.activeElement !== els.keyValue) {
      els.keyValue.value = Math.round(key.v * 1000) / 1000;
    }
  }

  // ------------------------------------------------------------- viewport --
  let dpr = window.devicePixelRatio || 1;

  function resizeViewport() {
    dpr = window.devicePixelRatio || 1;
    const host = els.viewportHost;
    const w = Math.max(1, Math.round(host.clientWidth * dpr));
    const h = Math.max(1, Math.round(host.clientHeight * dpr));
    if (els.viewport.width !== w || els.viewport.height !== h) {
      els.viewport.width = w; els.viewport.height = h;
    }
  }

  function fitView() {
    const rig = S.player.rig;
    const pad = 40;
    S.player.view = [-pad, -pad, rig.canvas[0] + pad * 2, rig.canvas[1] + pad * 2];
  }

  function currentScale() {
    const vm = S.player.viewMatrix(els.viewport.width, els.viewport.height);
    return vm[0] / dpr; // rig px -> css px
  }

  function drawChecker(ctx) {
    const w = ctx.canvas.width; const h = ctx.canvas.height;
    const size = 16 * dpr;
    ctx.fillStyle = '#242a33'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c333e';
    for (let y = 0; y < h; y += size) {
      for (let x = ((y / size) % 2) * size; x < w; x += size * 2) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  let onionCanvas = null;
  function renderPoseGhost(ctx, pose, alpha) {
    if (!onionCanvas) onionCanvas = document.createElement('canvas');
    if (onionCanvas.width !== ctx.canvas.width || onionCanvas.height !== ctx.canvas.height) {
      onionCanvas.width = ctx.canvas.width; onionCanvas.height = ctx.canvas.height;
    }
    const octx = onionCanvas.getContext('2d');
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, onionCanvas.width, onionCanvas.height);
    S.player.draw(octx, pose, { clear: false });
    ctx.globalAlpha = alpha;
    ctx.drawImage(onionCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }

  function allKeyTimes() {
    const times = new Set();
    for (const keys of Object.values(S.clip.tracks)) {
      for (const k of keys) times.add(Math.round(k.t * 1000) / 1000);
    }
    return [...times].sort((a, b) => a - b);
  }

  function renderViewport() {
    resizeViewport();
    const ctx = S.player.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (S.background === 'checker') drawChecker(ctx);
    else { ctx.fillStyle = S.background; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }

    if (S.onion && !S.playing) {
      const times = allKeyTimes();
      const prev = [...times].reverse().find((t) => t < S.time - EPS);
      const next = times.find((t) => t > S.time + EPS);
      if (prev !== undefined) renderPoseGhost(ctx, displayPose(prev), 0.25);
      if (next !== undefined) renderPoseGhost(ctx, displayPose(next), 0.18);
    }

    const pose = displayPose();
    S.player.draw(ctx, pose, { clear: false });
    drawSelection(ctx, pose);
    els.zoomLabel.textContent = Math.round(currentScale() * 100) + '%';
  }

  function drawSelection(ctx, pose) {
    const part = S.selectedPart;
    if (!part || part === 'root' || S.playing) return;
    const rig = S.player.rig;
    const def = rig.parts[part];
    if (!def) return;
    const world = Core.computeWorldTransforms(rig, pose);
    const vm = S.player.viewMatrix(ctx.canvas.width, ctx.canvas.height);
    const m = Core.matMul(vm, world[part].matrix);
    const [x1, y1, x2, y2] = def.bbox || [0, 0, rig.canvas[0], rig.canvas[1]];
    const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
      .map(([x, y]) => Core.matApply(m, x, y));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = '#5b9dd9';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // pivot marker
    const [px, py] = Core.matApply(m, def.pivot[0], def.pivot[1]);
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(px, py, 6 * dpr, 0, Math.PI * 2);
    ctx.moveTo(px - 10 * dpr, py); ctx.lineTo(px + 10 * dpr, py);
    ctx.moveTo(px, py - 10 * dpr); ctx.lineTo(px, py + 10 * dpr);
    ctx.stroke();
    ctx.restore();
  }

  // viewport interactions: pick/rotate/translate/pan/zoom
  const drag = { mode: null };

  function canvasPoint(ev) {
    const rect = els.viewport.getBoundingClientRect();
    return [(ev.clientX - rect.left) * dpr, (ev.clientY - rect.top) * dpr];
  }

  // pointer position in the selected part's PARENT space
  function parentSpacePoint(part, pose, cx, cy) {
    const rig = S.player.rig;
    const world = Core.computeWorldTransforms(rig, pose);
    const parentName = rig.parts[part].parent || 'root';
    const parentWorld = parentName === 'root' ? world.root : world[parentName];
    const vm = S.player.viewMatrix(els.viewport.width, els.viewport.height);
    const inv = Core.matInvert(Core.matMul(vm, parentWorld.matrix));
    return inv ? Core.matApply(inv, cx, cy) : null;
  }

  // setPointerCapture can throw for synthetic pointers (e.g. automation);
  // capture is a nicety, never let it kill the handler.
  function capturePointer(el, ev) {
    try { el.setPointerCapture(ev.pointerId); } catch { /* no-op */ }
  }

  els.viewport.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    capturePointer(els.viewport, ev);
    const [cx, cy] = canvasPoint(ev);
    if (ev.button === 1 || ev.altKey) {
      drag.mode = 'pan';
      drag.last = [cx, cy];
      els.viewport.classList.add('dragging');
      return;
    }
    const pose = displayPose();
    const hit = S.player.pickPart(pose, cx, cy);
    if (hit) {
      if (S.selectedPart !== hit) selectPart(hit);
      const part = hit;
      const p = parentSpacePoint(part, pose, cx, cy);
      if (!p) return;
      const def = S.player.rig.parts[part];
      const rot0 = channelValue(part, 'rotation');
      const x0 = channelValue(part, 'x');
      const y0 = channelValue(part, 'y');
      const pivotParent = [def.pivot[0] + x0, def.pivot[1] + y0];
      drag.mode = ev.shiftKey ? 'move' : 'rotate';
      drag.part = part;
      drag.start = { p, rot0, x0, y0, pivotParent };
      drag.moved = false;
      els.viewport.classList.add('dragging');
    } else {
      S.selectedPart = null;
      refreshAll();
    }
  });

  els.viewport.addEventListener('pointermove', (ev) => {
    if (!drag.mode) return;
    const [cx, cy] = canvasPoint(ev);
    if (drag.mode === 'pan') {
      const vm = S.player.viewMatrix(els.viewport.width, els.viewport.height);
      const scale = vm[0];
      S.player.view[0] -= (cx - drag.last[0]) / scale;
      S.player.view[1] -= (cy - drag.last[1]) / scale;
      drag.last = [cx, cy];
      return;
    }
    const pose = displayPose();
    const p = parentSpacePoint(drag.part, pose, cx, cy);
    if (!p) return;
    if (!drag.moved) {
      drag.moved = true;
      pushUndo('viewport-drag');
    }
    if (drag.mode === 'rotate') {
      const { pivotParent, p: p0, rot0 } = drag.start;
      const a0 = Math.atan2(p0[1] - pivotParent[1], p0[0] - pivotParent[0]);
      const a1 = Math.atan2(p[1] - pivotParent[1], p[0] - pivotParent[0]);
      let delta = (a1 - a0) * 180 / Math.PI;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      setChannel(drag.part, 'rotation', Math.round((rot0 + delta) * 10) / 10);
    } else if (drag.mode === 'move') {
      const { p: p0, x0, y0 } = drag.start;
      setChannel(drag.part, 'x', Math.round(x0 + p[0] - p0[0]));
      setChannel(drag.part, 'y', Math.round(y0 + p[1] - p0[1]));
    }
  });

  const endDrag = () => {
    drag.mode = null;
    els.viewport.classList.remove('dragging');
    endGesture();
  };
  els.viewport.addEventListener('pointerup', endDrag);
  els.viewport.addEventListener('pointercancel', endDrag);

  els.viewport.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const [cx, cy] = canvasPoint(ev);
    const vm = S.player.viewMatrix(els.viewport.width, els.viewport.height);
    const inv = Core.matInvert(vm);
    if (!inv) return;
    const [rx, ry] = Core.matApply(inv, cx, cy);
    const factor = Math.exp(ev.deltaY * 0.0012);
    const v = S.player.view;
    const nw = Math.min(Math.max(v[2] * factor, 80), 8000);
    const nh = nw * (v[3] / v[2]);
    v[0] = rx - (rx - v[0]) * (nw / v[2]);
    v[1] = ry - (ry - v[1]) * (nh / v[3]);
    v[2] = nw; v[3] = nh;
  }, { passive: false });

  // ------------------------------------------------------------- timeline --
  const TL = { rulerH: 26, rowH: 22, gutter: 170, pad: 12 };

  function trackOrder() {
    const rig = S.player.rig;
    const partRank = { root: 0 };
    Object.keys(rig.parts).forEach((name, i) => { partRank[name] = i + 1; });
    const propRank = { rotation: 0, x: 1, y: 2, scaleX: 3, scaleY: 4, opacity: 5 };
    return Object.keys(S.clip.tracks).sort((a, b) => {
      const sa = a.startsWith('slots.'); const sb = b.startsWith('slots.');
      if (sa !== sb) return sa ? 1 : -1;
      if (sa) return a.localeCompare(b);
      const [pa, ca] = a.split('.'); const [pb, cb] = b.split('.');
      if (pa !== pb) return (partRank[pa] ?? 99) - (partRank[pb] ?? 99);
      return (propRank[ca] ?? 9) - (propRank[cb] ?? 9);
    });
  }

  const timeToX = (t, w) => TL.gutter + (t / S.clip.duration) * (w - TL.gutter - TL.pad);
  const xToTime = (x, w) => ((x - TL.gutter) / (w - TL.gutter - TL.pad)) * S.clip.duration;

  function renderTimeline() {
    const host = els.timelineHost;
    const canvas = els.timeline;
    const tracks = trackOrder();
    S.timelineRows = tracks;
    const cssW = host.clientWidth;
    const cssH = TL.rulerH + Math.max(tracks.length, 5) * TL.rowH + 8;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = '11px system-ui, sans-serif';

    // ruler
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, cssW, TL.rulerH);
    const dur = S.clip.duration;
    const frameW = (cssW - TL.gutter - TL.pad) / (dur * fps());
    const labelEvery = dur > 6 ? 1 : 0.5;
    for (let f = 0; f <= Math.round(dur * fps()); f++) {
      const t = f / fps();
      const x = timeToX(t, cssW);
      const major = Math.abs(t / labelEvery - Math.round(t / labelEvery)) < EPS;
      if (frameW > 3 || major) {
        ctx.strokeStyle = major ? '#4a5665' : '#2b3442';
        ctx.beginPath();
        ctx.moveTo(x, major ? 8 : 16);
        ctx.lineTo(x, TL.rulerH);
        ctx.stroke();
      }
      if (major) {
        ctx.fillStyle = '#8b98a9';
        ctx.fillText(t.toFixed(1) + 's', x + 3, 12);
      }
    }

    // rows
    tracks.forEach((track, i) => {
      const y = TL.rulerH + i * TL.rowH;
      ctx.fillStyle = i % 2 ? '#1b212b' : '#181e27';
      ctx.fillRect(0, y, cssW, TL.rowH);
      const isSelPart = S.selectedPart && track.startsWith(S.selectedPart + '.');
      ctx.fillStyle = isSelPart ? '#9fc5e8' : '#8b98a9';
      ctx.fillText(track, 8, y + 15, TL.gutter - 16);
      ctx.strokeStyle = '#232b36';
      ctx.beginPath();
      ctx.moveTo(TL.gutter, y + TL.rowH / 2);
      ctx.lineTo(cssW - TL.pad, y + TL.rowH / 2);
      ctx.stroke();
      for (const key of S.clip.tracks[track]) {
        const x = timeToX(key.t, cssW);
        const cy = y + TL.rowH / 2;
        const selected = S.selectedKeys.some((s) => s.track === track && Math.abs(s.t - key.t) < EPS);
        ctx.fillStyle = selected ? '#ffffff' : '#f5c542';
        ctx.beginPath();
        ctx.moveTo(x, cy - 5.5);
        ctx.lineTo(x + 5.5, cy);
        ctx.lineTo(x, cy + 5.5);
        ctx.lineTo(x - 5.5, cy);
        ctx.closePath();
        ctx.fill();
        if (selected) { ctx.strokeStyle = '#f5c542'; ctx.stroke(); }
      }
    });

    // gutter divider + playhead
    ctx.strokeStyle = '#2b3442';
    ctx.beginPath(); ctx.moveTo(TL.gutter, 0); ctx.lineTo(TL.gutter, cssH); ctx.stroke();
    const px = timeToX(Math.min(S.time, dur), cssW);
    ctx.strokeStyle = '#ff5f5f';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, cssH); ctx.stroke();
    ctx.fillStyle = '#ff5f5f';
    ctx.beginPath();
    ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1;
  }

  const tlDrag = { mode: null };

  function timelineHit(ev) {
    const rect = els.timeline.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const cssW = els.timelineHost.clientWidth;
    const row = Math.floor((y - TL.rulerH) / TL.rowH);
    const track = row >= 0 && row < S.timelineRows.length ? S.timelineRows[row] : null;
    let key = null;
    if (track) {
      for (const k of S.clip.tracks[track]) {
        if (Math.abs(timeToX(k.t, cssW) - x) < 7) { key = k; break; }
      }
    }
    return { x, y, cssW, track, key };
  }

  els.timeline.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    capturePointer(els.timeline, ev);
    const hit = timelineHit(ev);
    if (hit.key) {
      const entry = { track: hit.track, t: hit.key.t };
      const already = S.selectedKeys.some((s) => s.track === entry.track && Math.abs(s.t - entry.t) < EPS);
      if (ev.shiftKey) {
        if (already) S.selectedKeys = S.selectedKeys.filter((s) => !(s.track === entry.track && Math.abs(s.t - entry.t) < EPS));
        else S.selectedKeys.push(entry);
      } else if (!already) {
        S.selectedKeys = [entry];
      }
      tlDrag.mode = 'keys';
      tlDrag.startX = hit.x;
      tlDrag.cssW = hit.cssW;
      tlDrag.orig = S.selectedKeys.map((s) => ({ ...s }));
      tlDrag.moved = false;
      const part = hit.track.split('.')[0];
      if (part !== 'slots' && S.selectedPart !== part) S.selectedPart = part;
      refreshAll();
    } else {
      tlDrag.mode = 'scrub';
      tlDrag.cssW = hit.cssW;
      S.playing = false;
      S.time = snapT(Math.max(0, Math.min(xToTime(hit.x, hit.cssW), S.clip.duration)));
      if (!ev.shiftKey) S.selectedKeys = [];
      refreshSoon();
    }
  });

  els.timeline.addEventListener('pointermove', (ev) => {
    if (!tlDrag.mode) return;
    const rect = els.timeline.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    if (tlDrag.mode === 'scrub') {
      S.time = snapT(Math.max(0, Math.min(xToTime(x, tlDrag.cssW), S.clip.duration)));
      refreshSoon();
      return;
    }
    // move selected keys
    let dt = xToTime(x, tlDrag.cssW) - xToTime(tlDrag.startX, tlDrag.cssW);
    if (S.snap) dt = Math.round(dt * fps()) / fps();
    if (Math.abs(dt) < EPS) return;
    if (!tlDrag.moved) { tlDrag.moved = true; pushUndo('tl-drag'); }
    // reset to gesture-start layout, then apply dt
    for (let i = 0; i < tlDrag.orig.length; i++) {
      const o = tlDrag.orig[i];
      const cur = S.selectedKeys[i];
      const key = keyAt(cur.track, cur.t);
      if (!key) continue;
      const nt = Math.max(0, Math.min(o.t + dt, S.clip.duration));
      key.t = nt;
      cur.t = nt;
    }
    for (const s of new Set(S.selectedKeys.map((s) => s.track))) {
      S.clip.tracks[s].sort((a, b) => a.t - b.t);
    }
    scheduleSave();
    refreshSoon();
  });

  const endTlDrag = () => { tlDrag.mode = null; endGesture(); };
  els.timeline.addEventListener('pointerup', endTlDrag);
  els.timeline.addEventListener('pointercancel', endTlDrag);

  els.timeline.addEventListener('dblclick', (ev) => {
    const hit = timelineHit(ev);
    if (!hit.track || hit.key) return;
    pushUndo();
    const t = snapT(Math.max(0, Math.min(xToTime(hit.x, hit.cssW), S.clip.duration)));
    const cur = Core.sampleTrack(S.clip.tracks[hit.track], t);
    upsertKey(hit.track, t, cur);
    S.selectedKeys = [{ track: hit.track, t }];
    refreshSoon();
  });

  // ------------------------------------------------------------ transport --
  function setPlaying(on) {
    S.playing = on;
    els.btnPlay.textContent = on ? '⏸' : '▶';
    if (on && !S.clip.loop && S.time >= S.clip.duration - EPS) S.time = 0;
  }

  function stepFrames(n) {
    setPlaying(false);
    S.time = snapT(Math.max(0, Math.min(S.time + n / fps(), S.clip.duration)));
    refreshSoon();
  }

  function keySelectedPose() {
    if (!S.selectedPart) return;
    pushUndo();
    const t = snapT(S.time);
    for (const prop of Core.CHANNELS) {
      const v = channelValue(S.selectedPart, prop);
      const hasTrack = !!getTrack(S.selectedPart + '.' + prop);
      if (hasTrack || Math.abs(v - Core.CHANNEL_DEFAULTS[prop]) > EPS) {
        upsertKey(S.selectedPart + '.' + prop, t, v);
      }
    }
    refreshSoon();
  }

  function deleteSelectedKeys() {
    if (!S.selectedKeys.length) return;
    pushUndo();
    for (const s of S.selectedKeys) deleteKey(s.track, s.t);
    S.selectedKeys = [];
    refreshSoon();
  }

  // ------------------------------------------------------------ main loop --
  let lastTs = 0;
  let needsUiRefresh = true;
  function refreshSoon() { needsUiRefresh = true; }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (S.playing) {
      S.time += dt;
      if (S.time > S.clip.duration) {
        if (S.clip.loop) S.time %= S.clip.duration;
        else { S.time = S.clip.duration; setPlaying(false); }
      }
      needsUiRefresh = true;
    }
    renderViewport();
    if (needsUiRefresh) {
      needsUiRefresh = false;
      renderTimeline();
      updateInspector();
      updateSlotPanel();
      updatePartTree();
      updateKeyEditor();
      els.timeLabel.textContent = S.time.toFixed(2) + 's · f' + Math.round(S.time * fps());
    }
  }

  function refreshAll() {
    if (els.clipDuration !== document.activeElement) els.clipDuration.value = S.clip.duration;
    if (els.clipFps !== document.activeElement) els.clipFps.value = fps();
    els.clipLoop.checked = !!S.clip.loop;
    buildClipSelect();
    refreshSoon();
  }

  // ---------------------------------------------------------------- export --
  let exporting = false;

  async function exportWebM() {
    if (exporting) return;
    const rig = S.player.rig;
    const framing = rig.framings[els.exportFraming.value]
      || { width: rig.canvas[0], height: rig.canvas[1], view: [0, 0, rig.canvas[0], rig.canvas[1]] };
    const outFps = parseInt(els.exportFps.value, 10) || 30;
    const loops = Math.max(1, parseInt(els.exportLoops.value, 10) || 1);
    const withBase = els.exportBase.checked;
    const withBlink = els.exportBlink.checked;
    const bg = els.exportBg.value;
    const duration = Core.clipDuration(S.clip) * (S.clip.loop ? loops : 1);
    const totalFrames = Math.max(1, Math.round(duration * outFps));

    const canvas = document.createElement('canvas');
    canvas.width = framing.width; canvas.height = framing.height;
    const ctx = canvas.getContext('2d');
    const savedView = [...S.player.view];
    S.player.view = [...framing.view];

    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) {
      els.exportStatus.textContent = 'MediaRecorder WebM is not supported in this browser.';
      S.player.view = savedView;
      return;
    }

    exporting = true;
    els.btnExportGo.disabled = true;
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();

    const poseAt = (t) => {
      let pose = withBase && S.idleClip && S.clip.name !== S.idleClip.name
        ? Core.composePose(Core.sampleClip(S.idleClip, t), Core.sampleClip(S.clip, t))
        : Core.sampleClip(S.clip, t);
      if (withBlink && pose['slots.eye_L'] === undefined && pose['slots.eye_R'] === undefined) {
        // deterministic blink: 140ms every 2.8s, first at 1.2s
        const phase = (t - 1.2) % 2.8;
        if (t >= 1.2 && phase >= 0 && phase < 0.14) {
          pose = { ...pose, 'slots.eye_L': 'closed', 'slots.eye_R': 'closed' };
        }
      }
      return pose;
    };

    const frameDelay = 1000 / outFps;
    for (let i = 0; i <= totalFrames; i++) {
      const t = Math.min(i / outFps, duration);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      S.player.draw(ctx, poseAt(t), { clear: false });
      track.requestFrame();
      els.exportStatus.textContent = `Rendering frame ${i + 1} / ${totalFrames + 1}…`;
      // real-time pacing keeps MediaRecorder timestamps at the target fps
      await new Promise((r) => setTimeout(r, frameDelay));
    }
    recorder.stop();
    await done;
    S.player.view = savedView;
    exporting = false;
    els.btnExportGo.disabled = false;

    const blob = new Blob(chunks, { type: 'video/webm' });
    downloadBlob(blob, `${S.rigId}_${S.clip.name}.webm`);
    els.exportStatus.textContent =
      `Done — ${(blob.size / 1024).toFixed(0)} KB, ${duration.toFixed(2)}s @ ${outFps}fps (${mime.includes('vp9') ? 'VP9' : 'VP8'}).`;
  }

  function snapshotPng() {
    const rig = S.player.rig;
    const framingKey = els.framingSelect.value;
    const framing = rig.framings[framingKey]
      || { width: rig.canvas[0], height: rig.canvas[1], view: [0, 0, rig.canvas[0], rig.canvas[1]] };
    const canvas = document.createElement('canvas');
    canvas.width = framing.width; canvas.height = framing.height;
    const ctx = canvas.getContext('2d');
    const savedView = [...S.player.view];
    S.player.view = [...framing.view];
    if (S.background !== 'checker') {
      ctx.fillStyle = S.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    S.player.draw(ctx, displayPose(), { clear: false });
    S.player.view = savedView;
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${S.rigId}_${S.clip.name}_f${Math.round(S.time * fps())}.png`);
    }, 'image/png');
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // --------------------------------------------------------------- UI wiring
  function bindUI() {
    // easing options
    for (const name of Object.keys(Core.EASINGS)) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      els.keyEasing.appendChild(opt);
    }
    buildInspector();

    els.clipSelect.addEventListener('change', () => selectClip(els.clipSelect.value));

    els.btnNewClip.addEventListener('click', () => {
      const name = prompt('New clip name:', 'my-clip');
      if (!name) return;
      if (S.clips[name] && !confirm(`"${name}" exists — overwrite?`)) return;
      const clip = Core.newClip(name.trim());
      clip.fps = 30;
      S.clips[clip.name] = clip;
      scheduleSave();
      selectClip(clip.name);
    });

    els.btnDupClip.addEventListener('click', () => {
      const name = prompt('Duplicate as:', S.clip.name + '-copy');
      if (!name) return;
      const copy = JSON.parse(JSON.stringify(S.clip));
      copy.name = name.trim();
      S.clips[copy.name] = copy;
      scheduleSave();
      selectClip(copy.name);
    });

    els.btnRenameClip.addEventListener('click', () => {
      const name = prompt('Rename clip to:', S.clip.name);
      if (!name || name.trim() === S.clip.name) return;
      delete S.clips[S.clip.name];
      S.clip.name = name.trim();
      S.clips[S.clip.name] = S.clip;
      scheduleSave();
      buildClipSelect();
    });

    els.btnDeleteClip.addEventListener('click', () => {
      const name = S.clip.name;
      const isPreset = !!S.presets[name];
      const msg = isPreset
        ? `Reset preset "${name}" to the shipped version?`
        : `Delete clip "${name}"? This cannot be undone.`;
      if (!confirm(msg)) return;
      if (isPreset) {
        S.clips[name] = JSON.parse(JSON.stringify(S.presets[name]));
      } else {
        delete S.clips[name];
      }
      scheduleSave();
      selectClip(S.clips[name] ? name : Object.keys(S.clips).sort()[0]);
    });

    els.btnDownload.addEventListener('click', () => {
      const errors = Core.validateClip(S.clip, S.player.rig);
      if (errors.length && !confirm('Clip has issues:\n' + errors.join('\n') + '\n\nDownload anyway?')) return;
      const blob = new Blob([JSON.stringify(S.clip, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${S.clip.name}.json`);
    });

    els.btnImport.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', async () => {
      const file = els.importFile.files[0];
      els.importFile.value = '';
      if (!file) return;
      try {
        const clip = JSON.parse(await file.text());
        const errors = Core.validateClip(clip, S.player.rig);
        if (errors.length) { alert('Invalid clip:\n' + errors.join('\n')); return; }
        clip.name = clip.name || file.name.replace(/\.json$/i, '');
        if (S.clips[clip.name] && !confirm(`"${clip.name}" exists — overwrite?`)) return;
        S.clips[clip.name] = clip;
        scheduleSave();
        selectClip(clip.name);
      } catch {
        alert('Could not parse that file as clip JSON.');
      }
    });

    els.btnSnapshot.addEventListener('click', snapshotPng);
    els.btnExport.addEventListener('click', () => {
      els.exportStatus.textContent = '';
      els.exportModal.hidden = false;
    });
    els.btnExportCancel.addEventListener('click', () => { if (!exporting) els.exportModal.hidden = true; });
    els.btnExportGo.addEventListener('click', () => exportWebM().catch((e) => {
      exporting = false;
      els.btnExportGo.disabled = false;
      els.exportStatus.textContent = 'Export failed: ' + e.message;
    }));

    els.btnHelp.addEventListener('click', () => { els.helpModal.hidden = false; });
    els.btnHelpClose.addEventListener('click', () => { els.helpModal.hidden = true; });

    els.framingSelect.addEventListener('change', () => {
      const f = S.player.rig.framings[els.framingSelect.value];
      if (f) S.player.view = [...f.view];
      else fitView();
    });
    els.bgSelect.addEventListener('change', () => { S.background = els.bgSelect.value; });
    els.onionToggle.addEventListener('change', () => { S.onion = els.onionToggle.checked; });
    els.baseToggle.addEventListener('change', () => { S.idleUnder = els.baseToggle.checked; });
    els.btnZoomFit.addEventListener('click', fitView);
    els.btnZoom100.addEventListener('click', () => {
      const w = els.viewport.width / dpr;
      const h = els.viewport.height / dpr;
      const v = S.player.view;
      const cx = v[0] + v[2] / 2; const cy = v[1] + v[3] / 2;
      S.player.view = [cx - w / 2, cy - h / 2, w, h];
    });

    els.btnResetPart.addEventListener('click', () => {
      if (!S.selectedPart) return;
      pushUndo();
      for (const track of Object.keys(S.clip.tracks)) {
        if (track.startsWith(S.selectedPart + '.')) delete S.clip.tracks[track];
      }
      S.selectedKeys = S.selectedKeys.filter((s) => !s.track.startsWith(S.selectedPart + '.'));
      scheduleSave();
      refreshSoon();
    });

    // keyframe editor
    els.keyEasing.addEventListener('change', () => {
      pushUndo();
      for (const s of S.selectedKeys) {
        const key = keyAt(s.track, s.t);
        if (key) key.e = els.keyEasing.value;
      }
      scheduleSave();
    });
    els.keyTime.addEventListener('change', () => {
      const nt = parseFloat(els.keyTime.value);
      if (!Number.isFinite(nt) || S.selectedKeys.length !== 1) return;
      pushUndo();
      const s = S.selectedKeys[0];
      const key = keyAt(s.track, s.t);
      if (!key) return;
      key.t = Math.max(0, Math.min(nt, S.clip.duration));
      S.clip.tracks[s.track].sort((a, b) => a.t - b.t);
      s.t = key.t;
      scheduleSave();
      refreshSoon();
    });
    els.keyValue.addEventListener('change', () => {
      const v = parseFloat(els.keyValue.value);
      if (!Number.isFinite(v)) return;
      pushUndo();
      for (const s of S.selectedKeys) {
        const key = keyAt(s.track, s.t);
        if (key && typeof key.v === 'number') key.v = v;
      }
      scheduleSave();
      refreshSoon();
    });
    els.btnDeleteKeys.addEventListener('click', deleteSelectedKeys);

    // clip props
    els.clipDuration.addEventListener('change', () => {
      const d = parseFloat(els.clipDuration.value);
      if (!Number.isFinite(d) || d <= 0) return;
      pushUndo();
      S.clip.duration = d;
      S.time = Math.min(S.time, d);
      scheduleSave();
      refreshSoon();
    });
    els.clipFps.addEventListener('change', () => {
      const f = parseInt(els.clipFps.value, 10);
      if (!Number.isFinite(f) || f < 1) return;
      S.clip.fps = f;
      scheduleSave();
      refreshSoon();
    });
    els.clipLoop.addEventListener('change', () => {
      S.clip.loop = els.clipLoop.checked;
      scheduleSave();
    });

    // transport
    els.btnPlay.addEventListener('click', () => setPlaying(!S.playing));
    els.btnToStart.addEventListener('click', () => { S.time = 0; refreshSoon(); });
    els.btnStepBack.addEventListener('click', () => stepFrames(-1));
    els.btnStepFwd.addEventListener('click', () => stepFrames(1));
    els.autoKeyToggle.addEventListener('change', () => { S.autoKey = els.autoKeyToggle.checked; });
    els.snapToggle.addEventListener('change', () => { S.snap = els.snapToggle.checked; });
    els.btnKeyPose.addEventListener('click', keySelectedPose);
    els.btnUndo.addEventListener('click', () => { undo(); });
    els.btnRedo.addEventListener('click', () => { redo(); });

    // keyboard
    window.addEventListener('keydown', (ev) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (ev.code === 'Space') { ev.preventDefault(); setPlaying(!S.playing); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepFrames(ev.shiftKey ? -10 : -1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); stepFrames(ev.shiftKey ? 10 : 1); }
      else if (ev.key === 'Home') { ev.preventDefault(); S.time = 0; refreshSoon(); }
      else if (ev.key === 'k' || ev.key === 'K') { keySelectedPose(); }
      else if (ev.key === 'Delete' || ev.key === 'Backspace') { deleteSelectedKeys(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo(); else undo();
      }
    });

    new ResizeObserver(refreshSoon).observe(els.viewportHost);
    new ResizeObserver(refreshSoon).observe(els.timelineHost);
  }

  boot().catch((e) => {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:system-ui;color:#dbe4ee;background:#14181f;height:100vh">' +
      '<h2>Animation Studio failed to load</h2><pre>' + (e && e.message) + '</pre></div>';
    throw e;
  });
})();
