// modules/voice-meter.js
// Audio-reactive meter renderers.
//
// Two shapes share one engine:
//   - Orb meter:   48 radial bars on a canvas (voice-tutor presence)
//   - Strip meter: N inline DOM bars whose heights track frequency bins
//                  (chat's "Live with <tutor>" pill)
//
// Callers own the AnalyserNode + drive .update(buffer) per frame. This
// module is pure rendering — no audio plumbing — so it can be reused
// against any source (mic MediaStream, BufferSourceNode, MediaElement).

const TEAL = { r: 18, g: 179, b: 179 };
const INDIGO = { r: 102, g: 126, b: 234 };

function rgba(c, a) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

/**
 * Draw a radial bar waveform to a 2D canvas.
 *
 * Lifted from voice-tutor-session.js so chat and voice-tutor can render
 * from the same code. Tuning (bars, radius, color) is overridable.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Uint8Array} freqData  result of analyser.getByteFrequencyData
 * @param {{ color?: {r,g,b}, bars?: number, baseRadius?: number, maxHeight?: number, slice?: number }} [opts]
 */
export function drawRadialWaveform(canvas, freqData, opts = {}) {
  if (!canvas || !freqData) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  const color = opts.color || TEAL;
  const bars = opts.bars || 48;
  const baseRadius = opts.baseRadius != null ? opts.baseRadius : 25;
  const maxHeight = opts.maxHeight != null ? opts.maxHeight : 35;
  // Voice band ≈ bottom ~40-50% of the spectrum; trims out high noise that
  // makes the viz look "jittery" without adding information.
  const slice = opts.slice || 0.5;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < bars; i++) {
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const freqIndex = Math.floor((i / bars) * freqData.length * slice);
    const value = (freqData[freqIndex] || 0) / 255;

    const r1 = baseRadius;
    const r2 = baseRadius + value * maxHeight;

    const x1 = cx + Math.cos(angle) * r1;
    const y1 = cy + Math.sin(angle) * r1;
    const x2 = cx + Math.cos(angle) * r2;
    const y2 = cy + Math.sin(angle) * r2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = rgba(color, 0.3 + value * 0.7);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
  glow.addColorStop(0, rgba(color, 0.12));
  glow.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
}

export const VOICE_METER_COLORS = { TEAL, INDIGO };

/**
 * Drive a row of inline DOM bars (the chat "Live" pill waveform) from
 * frequency data. Each child <span> of the container becomes one bar;
 * its height is animated via inline style. Falls back to a slow idle
 * pulse when no audio is flowing.
 *
 * @param {HTMLElement} container
 * @param {{ minHeight?: number, maxHeight?: number, slice?: number }} [opts]
 * @returns {{ update: (freqData: Uint8Array) => void, idle: () => void, dispose: () => void }}
 */
export function createStripMeter(container, opts = {}) {
  if (!container) return { update() {}, idle() {}, dispose() {} };

  const bars = Array.from(container.children).filter(n => n.nodeType === 1);
  const minHeight = opts.minHeight != null ? opts.minHeight : 20;
  const maxHeight = opts.maxHeight != null ? opts.maxHeight : 100;
  const slice = opts.slice || 0.5;

  function update(freqData) {
    if (!freqData) return;
    const usable = Math.floor(freqData.length * slice);
    const step = Math.max(1, Math.floor(usable / bars.length));
    for (let i = 0; i < bars.length; i++) {
      // Average a small bin window so adjacent bars don't twin from
      // hitting the same exact frequency index.
      let sum = 0;
      const start = i * step;
      const end = Math.min(usable, start + step);
      for (let j = start; j < end; j++) sum += freqData[j] || 0;
      const v = sum / Math.max(1, end - start) / 255;
      const pct = minHeight + v * (maxHeight - minHeight);
      // animation:'none' disables the CSS keyframe so inline height wins
      // (a paused animation still locks the property in some browsers).
      bars[i].style.animation = 'none';
      bars[i].style.height = pct + '%';
    }
  }

  function idle() {
    // Hand control back to the CSS keyframe animation. Clearing inline
    // styles lets the per-bar defaults from the stylesheet take over.
    bars.forEach(b => {
      b.style.animation = '';
      b.style.height = '';
    });
  }

  function dispose() {
    idle();
  }

  return { update, idle, dispose };
}
