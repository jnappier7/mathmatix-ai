/* ============================================================
   numberLineElement.js — the number-line element (P13).

   Semantic model:
     semantic: {
       min, max,          // domain (numbers)
       step,              // tick spacing (default 1)
       points: [ { id, value, label? } ]   // draggable markers
     }

   Renders an SVG axis with ticks + labels and draggable point markers
   that SNAP to the nearest step. Header = reposition (InteractionController);
   the body owns the marker drag (bodies are left to the element). Dragging a
   marker emits onChange(pointId, newValue) — the same "client proposes,
   server disposes" contract as tiles: a value change can be sent as a
   StudentMove and verified (wire-up mirrors studentMoveClient; not required
   to render).

   Pure geometry (valueToX / xToValue / snap) is exported for headless tests.
   UMD-lite: require() in jest, window.LWS.NumberLineElement in the browser.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).NumberLineElement = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const PAD = 24;          // horizontal padding inside the svg
  const HEIGHT = 72;
  const AXIS_Y = 44;

  function clampNum(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // Domain value → svg x (px). width is the inner svg width.
  function valueToX(value, min, max, width) {
    if (max === min) return PAD;
    const frac = (value - min) / (max - min);
    return PAD + frac * (width - 2 * PAD);
  }
  // svg x (px) → domain value (unsnapped).
  function xToValue(x, min, max, width) {
    if (width <= 2 * PAD) return min;
    const frac = (x - PAD) / (width - 2 * PAD);
    return min + frac * (max - min);
  }
  // Snap a raw value to the nearest step within [min,max].
  function snap(value, min, max, step) {
    const s = step > 0 ? step : 1;
    const snapped = Math.round((value - min) / s) * s + min;
    return clampNum(Number(snapped.toFixed(6)), min, max);
  }

  function makeRenderer(hooks) {
    const onChange = (hooks && typeof hooks.onChange === 'function') ? hooks.onChange : function () {};
    const doc = typeof document !== 'undefined' ? document : null;

    return function numberLineFactory(element) {
      const card = doc.createElement('div');
      card.className = 'lws-nl-card';
      card.setAttribute('role', 'group');

      const header = doc.createElement('div');
      header.className = 'lws-nl-header';
      header.dataset.role = 'reposition-handle';
      header.textContent = 'Number line';

      const body = doc.createElement('div');
      body.className = 'lws-nl-body';
      body.dataset.role = 'content';

      card.appendChild(header);
      card.appendChild(body);

      let current = Object.assign({}, element);
      let width = 320;

      function sem() {
        const s = current.semantic || {};
        return {
          min: typeof s.min === 'number' ? s.min : -5,
          max: typeof s.max === 'number' ? s.max : 5,
          step: typeof s.step === 'number' && s.step > 0 ? s.step : 1,
          points: Array.isArray(s.points) ? s.points : [],
        };
      }

      function render() {
        const { min, max, step, points } = sem();
        body.textContent = '';
        const svg = doc.createElementNS(SVGNS, 'svg');
        svg.setAttribute('class', 'lws-nl-svg');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + HEIGHT);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(HEIGHT));

        // axis
        const axis = doc.createElementNS(SVGNS, 'line');
        axis.setAttribute('x1', String(PAD)); axis.setAttribute('y1', String(AXIS_Y));
        axis.setAttribute('x2', String(width - PAD)); axis.setAttribute('y2', String(AXIS_Y));
        axis.setAttribute('class', 'lws-nl-axis');
        svg.appendChild(axis);

        // ticks + labels
        for (let v = min; v <= max + 1e-9; v += step) {
          const x = valueToX(v, min, max, width);
          const tick = doc.createElementNS(SVGNS, 'line');
          tick.setAttribute('x1', String(x)); tick.setAttribute('y1', String(AXIS_Y - 5));
          tick.setAttribute('x2', String(x)); tick.setAttribute('y2', String(AXIS_Y + 5));
          tick.setAttribute('class', 'lws-nl-tick');
          svg.appendChild(tick);
          const lbl = doc.createElementNS(SVGNS, 'text');
          lbl.setAttribute('x', String(x)); lbl.setAttribute('y', String(AXIS_Y + 20));
          lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('class', 'lws-nl-label');
          lbl.textContent = String(Number(v.toFixed(6)));
          svg.appendChild(lbl);
        }

        // point markers (draggable)
        for (const p of points) {
          const cx = valueToX(clampNum(p.value, min, max), min, max, width);
          const marker = doc.createElementNS(SVGNS, 'circle');
          marker.setAttribute('cx', String(cx)); marker.setAttribute('cy', String(AXIS_Y));
          marker.setAttribute('r', '9'); marker.setAttribute('class', 'lws-nl-point');
          // Inline fill/stroke so the marker is on-brand regardless of how the
          // host page's CSS cascade treats class-selected SVG presentation.
          marker.style.fill = '#12b3b3'; marker.style.stroke = '#ffffff'; marker.style.strokeWidth = '2';
          marker.setAttribute('tabindex', '0');
          marker.setAttribute('role', 'slider');
          marker.setAttribute('aria-valuemin', String(min));
          marker.setAttribute('aria-valuemax', String(max));
          marker.setAttribute('aria-valuenow', String(p.value));
          marker.dataset.pointId = p.id;
          wirePointerDrag(marker, p, svg);
          wireKeyboard(marker, p);
          svg.appendChild(marker);
        }

        body.appendChild(svg);
      }

      function commit(p, marker, value) {
        const { min, max, step } = sem();
        const snapped = snap(value, min, max, step);
        p.value = snapped;
        marker.setAttribute('cx', String(valueToX(snapped, min, max, width)));
        marker.setAttribute('aria-valuenow', String(snapped));
        onChange(p.id, snapped, current);
      }

      function wirePointerDrag(marker, p, svg) {
        let drag = null;
        marker.addEventListener('pointerdown', function (e) {
          e.stopPropagation();
          marker.setPointerCapture && marker.setPointerCapture(e.pointerId);
          drag = true; marker.classList.add('is-dragging');
        });
        marker.addEventListener('pointermove', function (e) {
          if (!drag) return;
          const { min, max } = sem();
          const rect = svg.getBoundingClientRect();
          const localX = (e.clientX - rect.left) * (width / (rect.width || width));
          const raw = xToValue(localX, min, max, width);
          // live drag: follow the pointer (unsnapped) for smoothness
          marker.setAttribute('cx', String(clampNum(localX, PAD, width - PAD)));
          marker.dataset.rawValue = String(raw);
        });
        marker.addEventListener('pointerup', function () {
          if (!drag) return;
          drag = false; marker.classList.remove('is-dragging');
          commit(p, marker, parseFloat(marker.dataset.rawValue));
        });
      }

      function wireKeyboard(marker, p) {
        marker.addEventListener('keydown', function (e) {
          const { min, max, step } = sem();
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); commit(p, marker, p.value - step); }
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); commit(p, marker, p.value + step); }
        });
      }

      render();

      return {
        node: card,
        update: function (el) { current = Object.assign({}, el); render(); },
        destroy: function () {},
      };
    };
  }

  return { makeRenderer, valueToX, xToValue, snap };
});
