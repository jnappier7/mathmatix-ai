# Animation Studio — rigged tutor animations

**Page:** `/animation-studio.html` (static, no build step — plain scripts, no Vite entry)
**Purpose:** author high-quality rigged animations for tutor characters from layered-PNG
rig packages, and export them as WebM videos (the tutor-cam format in
`public/videos/`) or as clip JSON for live playback via the `RigPlayer` runtime.

## Pieces

| File | What it is |
|------|------------|
| `public/rigs/<id>/rig.json` | Rig definition: parts (`src`, `pivot`, `z`, `parent`, `bbox`, `hidden`), virtual `root`, expression `slots`, export `framings`. |
| `public/rigs/<id>/parts/*.png` | Full-canvas-aligned layers (Mr. Nappier: 26 parts @ 1024×1536). |
| `public/rigs/<id>/clips/*.json` | Preset clips (`index.json` lists them). Shipped: idle, talk, celebrate, wave, nod, thinking. |
| `public/js/rig/rig-core.js` | Pure animation math (UMD, no DOM): easing, keyframe sampling, clip layering, slot resolution, FK matrix composition. Unit-tested in `tests/unit/rigCore.test.js`. |
| `public/js/rig/rig-player.js` | Browser runtime: loads a rig, plays a looping **base** clip with one-shot **overlays** on top, auto-blink, alpha-accurate part picking. Renders to any 2D canvas. |
| `public/js/animation-studio.js` | The studio app (timeline, inspector, viewport, undo, export). |

## Clip format (what the runtime plays)

```json
{
  "name": "celebrate", "duration": 1.4, "loop": false, "fps": 30,
  "tracks": {
    "forearm_L.rotation": [ { "t": 0, "v": 0, "e": "outBack" }, { "t": 0.32, "v": -58 } ],
    "slots.mouth":        [ { "t": 0, "v": "ah", "e": "step" } ]
  }
}
```

- Track names: `<part>.<prop>` (props: `rotation` deg CW, `x`/`y` px, `scaleX`/`scaleY`,
  `opacity`) or `slots.<slot>` (string states, always stepped). `root.<prop>` moves the
  whole character.
- `e` is the easing **out of** that key (see `RigCore.EASINGS`; default `inOutCubic`).
- Looping clips wrap; one-shot clips clamp at their last pose.
- Layering: overlays override base tracks per-track — e.g. play `idle` as base and
  `talk` or `celebrate` as an overlay, which is exactly what the studio's
  "Idle underlay" toggle and export option preview.

## Runtime usage (e.g. a live tutor cam)

```html
<script src="/js/rig/rig-core.js"></script>
<script src="/js/rig/rig-player.js"></script>
<script>
  const player = await RigPlayer.load('/rigs/mr-nappier/');
  player.setFraming('cam32');          // tutor-cam 3:2 crop from rig.json
  player.attach(canvas);               // starts its own rAF loop
  player.setAutoBlink(true);
  player.playBase(idleClip);           // fetched clip JSON
  player.playOverlay(celebrateClip);   // one-shot, auto-removed when done
</script>
```

## Studio workflow

1. Pick a clip (presets are marked ●; edits autosave to `localStorage` and can be
   reset to the shipped version via the delete button).
2. Click a part in the viewport (alpha-accurate picking) or the part tree; drag to
   rotate about its pivot, Shift-drag to translate. With **Auto-key** on, edits key
   at the playhead. Slots (eyes/mouth/brows) key as stepped state swaps.
3. Timeline: drag keys, double-click a row to add a key, select a key to change its
   easing/time/value. Onion skin ghosts neighboring keyframe poses.
4. Export: **Clip JSON** for the runtime, **PNG** frame, or **🎬 WebM** (VP9, framing
   presets from `rig.json`, optional idle-underlay composite + deterministic auto-blink)
   — drop the WebM next to the existing tutor videos in `public/videos/`.

## Rig authoring notes (Mr. Nappier v3)

- Parent chain: `root → torso → head → face parts`, `torso → upper_arm → forearm → hand`,
  `root → thigh → shin → foot`. Slot variants (`lid_closed_*`, `mouth_ah`,
  `brow_raised_*`) are `hidden` parts toggled by slots.
- **Keep shoulder rotations small (≲ 20°).** The torso sprite has the shoulders and
  short-sleeve caps baked in and draws *above* the arms, so big `upper_arm` angles slide
  the arm out from under the baked sleeve. Expressive gestures come from the elbows
  (`forearm` ±40–95°) — see `celebrate.json` / `wave.json`.
- Elbow/knee overlap inside the sprites is thin; if a joint shows a seam at a big
  angle, back the angle off or nudge the child's `x`/`y` a couple of px at that key.
- To add a rig: drop `public/rigs/<id>/` with the same structure and add it to the
  `RIGS` list at the top of `public/js/animation-studio.js`.
