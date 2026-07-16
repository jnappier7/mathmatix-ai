#!/usr/bin/env python3
"""
Renderer for the AP Calculus AB bootcamp figure library
(seeds/calc-ab/CALC_SPEC.md) -> clean inline SVG.

Kinds: fgraph (plot y=f(x)), pwlinear (piecewise-linear f/f' graphs),
slopefield (dy/dx = g(x,y) direction field), region (shaded area between two
curves), table (data table). Graph kinds use matplotlib (the exprs are real
numpy expressions in x); tables are drawn as crisp SVG.

Public API: render(kind, params) -> svg string (or None if unknown / on error).
"""

import io
import math

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

AXIS = "#334155"
CURVE = "#2563eb"
CURVE2 = "#dc2626"
FILL = "#93c5fd"
GRID = "#e2e8f0"


def _eval(expr, x, y=None):
    """Evaluate an authored expr (trusted content) over numpy arrays."""
    ns = {"np": np, "x": x, "math": math,
          "sin": np.sin, "cos": np.cos, "tan": np.tan, "exp": np.exp,
          "log": np.log, "ln": np.log, "sqrt": np.sqrt, "pi": np.pi, "e": np.e, "abs": np.abs}
    if y is not None:
        ns["y"] = y
    return eval(expr, {"__builtins__": {}}, ns)


def _fig(w=3.3, h=2.5):
    fig, ax = plt.subplots(figsize=(w, h))
    return fig, ax


def _finish(fig, ax, p, axes_through_origin=True):
    ax.set_xlim(p.get("xmin", -5), p.get("xmax", 5))
    ax.set_ylim(p.get("ymin", -5), p.get("ymax", 5))
    ax.grid(True, color=GRID, linewidth=0.6)
    if axes_through_origin:
        ax.axhline(0, color=AXIS, linewidth=1.1)
        ax.axvline(0, color=AXIS, linewidth=1.1)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(labelsize=6, colors=AXIS, length=2)
    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight")
    plt.close(fig)
    svg = buf.getvalue()
    i = svg.find("<svg")
    return svg[i:].strip() if i >= 0 else None


def _fgraph(p):
    fig, ax = _fig()
    xs = np.linspace(p.get("xmin", -5), p.get("xmax", 5), 800)
    with np.errstate(all="ignore"):
        ys = _eval(p["expr"], xs)
        ys = np.asarray(ys, dtype=float)
        # break the curve at asymptotes so no vertical spike is drawn
        lo, hi = p.get("ymin", -10), p.get("ymax", 10)
        pad = (hi - lo)
        ys[(ys < lo - pad) | (ys > hi + pad)] = np.nan
        dy = np.abs(np.diff(ys))
        ys[1:][dy > pad] = np.nan
    ax.plot(xs, ys, color=CURVE, linewidth=1.8)
    return _finish(fig, ax, p)


def _pwlinear(p):
    fig, ax = _fig()
    pts = p["pts"]
    xs = [q[0] for q in pts]
    ys = [q[1] for q in pts]
    ax.plot(xs, ys, color=CURVE, linewidth=1.9, marker="o", markersize=3.5)
    return _finish(fig, ax, p)


def _slopefield(p):
    fig, ax = _fig()
    step = p.get("step", 1)
    xs = np.arange(p.get("xmin", -3), p.get("xmax", 3) + 1e-9, step)
    ys = np.arange(p.get("ymin", -3), p.get("ymax", 3) + 1e-9, step)
    seg = step * 0.34
    for xv in xs:
        for yv in ys:
            with np.errstate(all="ignore"):
                m = float(_eval(p["expr"], np.array([xv]), np.array([yv]))[0])
            if not np.isfinite(m):
                continue
            ang = math.atan(m)
            dx, dy = seg * math.cos(ang), seg * math.sin(ang)
            ax.plot([xv - dx, xv + dx], [yv - dy, yv + dy], color=CURVE, linewidth=1.1)
    return _finish(fig, ax, p)


def _region(p):
    fig, ax = _fig()
    xs = np.linspace(p.get("xmin", -5), p.get("xmax", 5), 600)
    with np.errstate(all="ignore"):
        y1 = np.asarray(_eval(p["expr1"], xs), dtype=float) * np.ones_like(xs)
        y2 = np.asarray(_eval(p["expr2"], xs), dtype=float) * np.ones_like(xs)
    ax.plot(xs, y1, color=CURVE, linewidth=1.6)
    ax.plot(xs, y2, color=CURVE2, linewidth=1.6)
    a, b = p.get("a"), p.get("b")
    if a is not None and b is not None:
        xf = np.linspace(a, b, 300)
        with np.errstate(all="ignore"):
            f1 = np.asarray(_eval(p["expr1"], xf), dtype=float) * np.ones_like(xf)
            f2 = np.asarray(_eval(p["expr2"], xf), dtype=float) * np.ones_like(xf)
        ax.fill_between(xf, f1, f2, color=FILL, alpha=0.55)
    return _finish(fig, ax, p)


def _table(p):
    headers = p.get("headers", [])
    rows = p.get("rows", [])
    ncol = max(len(headers), max((len(r) for r in rows), default=1))
    nrow = len(rows) + 1
    ch, pad, fs = 24, 6, 11

    def cell(seq, c):
        return seq[c] if c < len(seq) else ""

    # Per-column width sized to the widest text in that column (header or cell).
    def textlen(s):
        return len(str(s))
    widths = []
    for c in range(ncol):
        maxchars = max([textlen(cell(headers, c))] + [textlen(cell(r, c)) for r in rows] + [1])
        widths.append(max(46, int(maxchars * fs * 0.62) + 14))
    xstart = [pad + sum(widths[:c]) for c in range(ncol + 1)]
    tw = sum(widths)
    W = tw + pad * 2
    H = ch * nrow + pad * 2
    ox = oy = pad
    b = []
    for r in range(nrow + 1):
        yy = oy + r * ch
        b.append(f'<line x1="{ox}" y1="{yy}" x2="{ox+tw}" y2="{yy}" stroke="{AXIS}" stroke-width="1"/>')
    for c in range(ncol + 1):
        b.append(f'<line x1="{xstart[c]}" y1="{oy}" x2="{xstart[c]}" y2="{oy+ch*nrow}" stroke="{AXIS}" stroke-width="1"/>')
    b.append(f'<rect x="{ox}" y="{oy}" width="{tw}" height="{ch}" fill="#eff6ff"/>')

    def esc(t):
        return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def cx(c):
        return xstart[c] + widths[c] / 2

    for c in range(len(headers)):
        b.append(f'<text x="{cx(c):.0f}" y="{oy+16}" text-anchor="middle" '
                 f'font-weight="600" fill="{AXIS}">{esc(headers[c])}</text>')
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            b.append(f'<text x="{cx(c):.0f}" y="{oy+(r+1)*ch+16:.0f}" text-anchor="middle" '
                     f'fill="{AXIS}">{esc(v)}</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
            f'font-family="system-ui,Arial,sans-serif" font-size="{fs}">{"".join(b)}</svg>')


_RENDERERS = {
    "fgraph": _fgraph, "pwlinear": _pwlinear, "slopefield": _slopefield,
    "region": _region, "table": _table,
}


def render(kind, params):
    fn = _RENDERERS.get(kind)
    if not fn or params is None:
        return None
    try:
        return fn(params)
    except Exception as e:
        print(f"  [warn] calc figure render failed ({kind}): {type(e).__name__}: {e}")
        try:
            plt.close("all")
        except Exception:
            pass
        return None


if __name__ == "__main__":
    import json, glob, os, tempfile
    cells = []
    for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "..", "seeds", "calc-ab", "calc_w*.json"))):
        d = json.load(open(f))
        figs = [(f"W{d['week']} Q{m['n']}", m["figure"]) for m in d["mc"] if m.get("figure")]
        if d["frq"].get("figure"):
            figs.append((f"W{d['week']} FRQ", d["frq"]["figure"]))
        for label, fig in figs:
            svg = render(fig["kind"], fig["params"])
            cells.append(f'<figure style="display:inline-block;border:1px solid #e2e8f0;margin:4px;padding:4px;vertical-align:top">'
                         f'<figcaption style="font:11px system-ui;color:#475569">{label} · {fig["kind"]}</figcaption>{svg or "RENDER FAILED"}</figure>')
    out = os.path.join(tempfile.gettempdir(), "calc-figures-preview.html")
    open(out, "w").write("<!doctype html><body style='background:#fff'>" + "".join(cells) + "</body>")
    print("wrote", out, "|", len(cells), "figures")
