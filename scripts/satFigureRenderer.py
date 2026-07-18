#!/usr/bin/env python3
"""
Renderer for the Digital SAT Math figure library -> inline SVG.

Kinds: fgraph, table (delegated to scripts/calcFigureRenderer.py), plus SAT
staples: scatter (with optional line of best fit), bar chart, and geometry
(schematic labeled figures — right triangles and parallel-lines-with-transversal;
SAT geometry figures are "not to scale", so a clean labeled schematic is faithful).

Public API: render(kind, params) -> svg string (or None).
"""

import io
import math

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import calcFigureRenderer as calc   # reuse fgraph + table

AXIS = "#334155"
DOT = "#1d4ed8"
LINE = "#dc2626"
BAR = "#60a5fa"
GRID = "#e2e8f0"


def _mpl_svg(fig):
    buf = io.StringIO()
    fig.savefig(buf, format="svg", bbox_inches="tight")
    plt.close(fig)
    svg = buf.getvalue()
    i = svg.find("<svg")
    return svg[i:].strip() if i >= 0 else None


def _scatter(p):
    fig, ax = plt.subplots(figsize=(3.4, 2.6))
    pts = p.get("pts", [])
    xs = [q[0] for q in pts]
    ys = [q[1] for q in pts]
    ax.scatter(xs, ys, color=DOT, s=22, zorder=3)
    ln = p.get("line")
    if ln and xs:
        x0, x1 = min(xs), max(xs)
        m, b = ln.get("slope", 0), ln.get("yint", 0)
        ax.plot([x0, x1], [m * x0 + b, m * x1 + b], color=LINE, linewidth=1.6, zorder=2)
    ax.set_xlabel(p.get("xlabel", ""), fontsize=8)
    ax.set_ylabel(p.get("ylabel", ""), fontsize=8)
    ax.grid(True, color=GRID, linewidth=0.6)
    ax.tick_params(labelsize=7, colors=AXIS)
    for s in ax.spines.values():
        s.set_color(AXIS)
    return _mpl_svg(fig)


def _bar(p):
    fig, ax = plt.subplots(figsize=(3.4, 2.6))
    labels = p.get("labels", [])
    values = p.get("values", [])
    ax.bar(labels, values, color=BAR, edgecolor=AXIS, linewidth=0.6)
    ax.set_xlabel(p.get("xlabel", ""), fontsize=8)
    ax.set_ylabel(p.get("ylabel", ""), fontsize=8)
    ax.tick_params(labelsize=7, colors=AXIS)
    for s in ax.spines.values():
        s.set_color(AXIS)
    ax.grid(True, axis="y", color=GRID, linewidth=0.6)
    return _mpl_svg(fig)


# ── geometry (schematic SVG) ────────────────────────────────
def _svg(body, w=260, h=200):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'font-family="system-ui,Arial,sans-serif" font-size="11" fill="{AXIS}">{body}</svg>')


def _esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _label_from(labels, *keys):
    for k in keys:
        if k in labels:
            return labels[k]
    return None


def _geo_triangle(labels, marks):
    # A standard right triangle: right angle at bottom-left, legs on the axes.
    ax_, ay = 40, 160      # right-angle vertex (bottom-left)
    bx, by = 220, 160      # bottom-right
    cx, cy = 40, 40        # top-left
    body = [f'<polygon points="{ax_},{ay} {bx},{by} {cx},{cy}" fill="#eff6ff" stroke="{AXIS}" stroke-width="1.6"/>']
    # right-angle square at the right-angle vertex
    body.append(f'<path d="M {ax_+14} {ay} L {ax_+14} {ay-14} L {ax_} {ay-14}" fill="none" stroke="{AXIS}" stroke-width="1.2"/>')
    # side labels (descriptive keys only; A/B/C are vertex letters, handled below)
    horiz = _label_from(labels, "horizontal_leg", "base")
    vert = _label_from(labels, "vertical_leg", "height", "support")
    hyp = _label_from(labels, "hypotenuse")
    if horiz:
        body.append(f'<text x="{(ax_+bx)/2}" y="{ay+16}" text-anchor="middle">{_esc(horiz)}</text>')
    if vert:
        body.append(f'<text x="{ax_-6}" y="{(ay+cy)/2}" text-anchor="end">{_esc(vert)}</text>')
    if hyp:
        body.append(f'<text x="{(bx+cx)/2+8}" y="{(by+cy)/2-4}" text-anchor="start">{_esc(hyp)}</text>')
    ang = _label_from(labels, "angle")
    if ang:  # angle at the bottom-right vertex (between hypotenuse and horizontal)
        body.append(f'<text x="{bx-30}" y="{by-6}" text-anchor="end">{_esc(ang)}</text>')
    # vertex letters if given as A/B/C
    if set(("A", "B", "C")) & set(labels):
        for name, (x, y, dx, dy) in {"C": (cx, cy, -4, -4), "A": (ax_, ay, -4, 14), "B": (bx, by, 8, 14)}.items():
            if name in labels:
                body.append(f'<text x="{x+dx}" y="{y+dy}" text-anchor="middle" font-weight="600">{_esc(labels[name])}</text>')
    return _svg("".join(body))


def _geo_lines(labels, marks):
    # Two parallel lines cut by a transversal, with two labeled angles.
    body = []
    y1, y2 = 70, 130
    for y, key in ((y1, "line1"), (y2, "line2")):
        body.append(f'<line x1="20" y1="{y}" x2="240" y2="{y}" stroke="{AXIS}" stroke-width="1.6"/>')
        nm = labels.get(key)
        if nm:
            body.append(f'<text x="245" y="{y+4}">{_esc(nm)}</text>')
        # parallel arrow marks
        body.append(f'<path d="M 120 {y-4} L 126 {y} L 120 {y+4}" fill="none" stroke="{AXIS}" stroke-width="1"/>')
    # transversal
    body.append(f'<line x1="70" y1="40" x2="190" y2="160" stroke="{AXIS}" stroke-width="1.4"/>')
    if labels.get("transversal"):
        body.append(f'<text x="192" y="162">{_esc(labels["transversal"])}</text>')
    a1 = labels.get("angle1")
    a2 = labels.get("angle2")
    if a1:
        body.append(f'<text x="112" y="{y1-8}">{_esc(a1)}</text>')
    if a2:
        body.append(f'<text x="150" y="{y2+18}">{_esc(a2)}</text>')
    return _svg("".join(body))


def _geometry(p):
    shape = p.get("shape")
    labels = p.get("labels", {}) or {}
    marks = p.get("marks", {}) or {}
    if shape == "triangle":
        return _geo_triangle(labels, marks)
    if shape == "lines":
        return _geo_lines(labels, marks)
    # rectangle / circle / other → minimal labeled box fallback
    body = [f'<rect x="40" y="50" width="180" height="100" fill="#eff6ff" stroke="{AXIS}" stroke-width="1.6"/>']
    for i, (k, v) in enumerate(labels.items()):
        body.append(f'<text x="130" y="{70+i*16}" text-anchor="middle">{_esc(v)}</text>')
    return _svg("".join(body))


def render(kind, params):
    if kind in ("fgraph", "table"):
        return calc.render(kind, params)
    fn = {"scatter": _scatter, "bar": _bar, "geometry": _geometry}.get(kind)
    if not fn or params is None:
        return None
    try:
        return fn(params)
    except Exception as e:
        print(f"  [warn] sat figure render failed ({kind}): {type(e).__name__}: {e}")
        try:
            plt.close("all")
        except Exception:
            pass
        return None


if __name__ == "__main__":
    import json, glob, os, tempfile
    cells = []
    for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "..", "seeds", "sat-math", "sat_w*.json"))):
        d = json.load(open(f))
        for it in d["items"]:
            if it.get("figure"):
                fig = it["figure"]
                svg = render(fig["kind"], fig["params"])
                cells.append(f'<figure style="display:inline-block;border:1px solid #e2e8f0;margin:4px;padding:4px;vertical-align:top">'
                             f'<figcaption style="font:11px system-ui;color:#475569">W{d["week"]} Q{it["n"]} · {fig["kind"]}</figcaption>{svg or "FAILED"}</figure>')
    out = os.path.join(tempfile.gettempdir(), "sat-figures-preview.html")
    open(out, "w").write("<!doctype html><body style='background:#fff'>" + "".join(cells) + "</body>")
    print("wrote", out, "|", len(cells), "figures")
