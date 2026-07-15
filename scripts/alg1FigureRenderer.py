#!/usr/bin/env python3
"""
Renderer for the fixed Algebra 1 figure library (seeds/alg1-assessments/ALG1_SPEC.md)
-> clean, self-contained SVG. Deterministic, no external drawing deps, so the
ingester can bake each figure into `Problem.svg` and the existing inline-visual
display shows it (same path the ACT matplotlib figures use).

Public API:
    render(kind, params) -> svg string (or None if kind unknown)

Supported student kinds: grid, numberline, line_graph, abs_graph, parabola,
mapping, points, story, table.
Key-only overlays: numberline_answer, grid_answer (parabola/abs_graph/table reuse
the student renderers).
"""

W, H, PAD = 260, 210, 26
AXIS = "#334155"
GRIDC = "#cbd5e1"
ACCENT = "#2563eb"
DOT = "#1d4ed8"
TEXTC = "#475569"


def _svg(body, w=W, h=H):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}" font-family="system-ui,Arial,sans-serif" '
            f'font-size="9">{body}</svg>')


def _num(v):
    return int(v) if float(v) == int(v) else round(float(v), 2)


class _Plane:
    """Maps data coords -> pixels for the graph-type figures."""

    def __init__(self, p):
        self.xmin = p.get("xmin", -10); self.xmax = p.get("xmax", 10)
        self.ymin = p.get("ymin", self.xmin); self.ymax = p.get("ymax", self.xmax)

    def sx(self, x):
        return PAD + (x - self.xmin) / (self.xmax - self.xmin) * (W - 2 * PAD)

    def sy(self, y):
        return H - PAD - (y - self.ymin) / (self.ymax - self.ymin) * (H - 2 * PAD)

    def grid(self):
        out = []
        x = int(self.xmin)
        while x <= self.xmax:
            px = self.sx(x)
            out.append(f'<line x1="{px:.1f}" y1="{PAD}" x2="{px:.1f}" y2="{H-PAD}" '
                       f'stroke="{GRIDC}" stroke-width="0.5"/>')
            x += 1
        y = int(self.ymin)
        while y <= self.ymax:
            py = self.sy(y)
            out.append(f'<line x1="{PAD}" y1="{py:.1f}" x2="{W-PAD}" y2="{py:.1f}" '
                       f'stroke="{GRIDC}" stroke-width="0.5"/>')
            y += 1
        # axes
        x0, y0 = self.sx(0), self.sy(0)
        if self.ymin <= 0 <= self.ymax:
            out.append(f'<line x1="{PAD}" y1="{y0:.1f}" x2="{W-PAD}" y2="{y0:.1f}" stroke="{AXIS}" stroke-width="1.3"/>')
        if self.xmin <= 0 <= self.xmax:
            out.append(f'<line x1="{x0:.1f}" y1="{PAD}" x2="{x0:.1f}" y2="{H-PAD}" stroke="{AXIS}" stroke-width="1.3"/>')
        return "".join(out)

    def clip_line(self, m, b):
        """Return the two endpoints of y=mx+b clipped to the visible window."""
        pts = []
        for x in (self.xmin, self.xmax):
            y = m * x + b
            if self.ymin <= y <= self.ymax:
                pts.append((x, y))
        for y in (self.ymin, self.ymax):
            if m != 0:
                x = (y - b) / m
                if self.xmin < x < self.xmax:
                    pts.append((x, y))
        # dedupe & keep two extremes
        uniq = sorted(set((round(a, 4), round(c, 4)) for a, c in pts))
        return uniq[:2] if len(uniq) >= 2 else None


def _grid(p):
    pl = _Plane(p)
    return _svg(pl.grid())


def _points(p):
    pl = _Plane(p)
    body = [pl.grid()]
    for x, y in p.get("pts", []):
        body.append(f'<circle cx="{pl.sx(x):.1f}" cy="{pl.sy(y):.1f}" r="3" fill="{DOT}"/>')
    return _svg("".join(body))


def _line_graph(p):
    pl = _Plane(p)
    body = [pl.grid()]
    ends = pl.clip_line(p.get("slope", 1), p.get("yint", 0))
    if ends:
        (x1, y1), (x2, y2) = ends
        body.append(f'<line x1="{pl.sx(x1):.1f}" y1="{pl.sy(y1):.1f}" x2="{pl.sx(x2):.1f}" '
                    f'y2="{pl.sy(y2):.1f}" stroke="{ACCENT}" stroke-width="2"/>')
    return _svg("".join(body))


def _polyline(pl, xs, fn):
    pts = []
    for x in xs:
        y = fn(x)
        if pl.ymin - 1 <= y <= pl.ymax + 1:
            pts.append(f"{pl.sx(x):.1f},{pl.sy(max(pl.ymin, min(pl.ymax, y))):.1f}")
    return pts


def _yfit(p, a, k):
    """When ymin/ymax aren't given for a curve, fit a window that shows the
    vertex (k) AND the x-axis (0), with headroom on the opening side for the arms."""
    if "ymin" in p and "ymax" in p:
        return dict(p)
    lo_core, hi_core = min(0, k), max(0, k)
    if a >= 0:  # opens up: arms rise
        ymin, ymax = lo_core - 2, hi_core + 14
    else:       # opens down: arms fall
        ymin, ymax = lo_core - 14, hi_core + 2
    return {**p, "ymin": ymin, "ymax": ymax}


def _abs_graph(p):
    a, h, k = p.get("a", 1), p.get("h", 0), p.get("k", 0)
    pl = _Plane(_yfit(p, a, k))
    xs = [pl.xmin + i * (pl.xmax - pl.xmin) / 120 for i in range(121)]
    pts = _polyline(pl, xs, lambda x: a * abs(x - h) + k)
    body = [pl.grid(), f'<polyline points="{" ".join(pts)}" fill="none" stroke="{ACCENT}" stroke-width="2"/>']
    body.append(f'<circle cx="{pl.sx(h):.1f}" cy="{pl.sy(k):.1f}" r="2.5" fill="{DOT}"/>')
    return _svg("".join(body))


def _parabola(p):
    a, h, k = p.get("a", 1), p.get("h", 0), p.get("k", 0)
    pl = _Plane(_yfit(p, a, k))
    xs = [pl.xmin + i * (pl.xmax - pl.xmin) / 160 for i in range(161)]
    pts = _polyline(pl, xs, lambda x: a * (x - h) ** 2 + k)
    body = [pl.grid(), f'<polyline points="{" ".join(pts)}" fill="none" stroke="{ACCENT}" stroke-width="2"/>']
    body.append(f'<circle cx="{pl.sx(h):.1f}" cy="{pl.sy(k):.1f}" r="2.5" fill="{DOT}"/>')
    return _svg("".join(body))


def _grid_answer(p):
    pl = _Plane(p)
    body = [pl.grid()]
    for ln in p.get("lines", []):
        ends = pl.clip_line(ln.get("slope", 1), ln.get("yint", 0))
        if ends:
            (x1, y1), (x2, y2) = ends
            body.append(f'<line x1="{pl.sx(x1):.1f}" y1="{pl.sy(y1):.1f}" x2="{pl.sx(x2):.1f}" '
                        f'y2="{pl.sy(y2):.1f}" stroke="{ACCENT}" stroke-width="2"/>')
    for x, y in p.get("points", []):
        body.append(f'<circle cx="{pl.sx(x):.1f}" cy="{pl.sy(y):.1f}" r="3" fill="{DOT}"/>')
    return _svg("".join(body))


def _numberline(p, point=None, closed=True, direction=None):
    lo, hi = p.get("min", -10), p.get("max", 10)
    y = H // 2
    span = W - 2 * PAD

    def sx(v):
        return PAD + (v - lo) / (hi - lo) * span

    body = [f'<line x1="{PAD}" y1="{y}" x2="{W-PAD}" y2="{y}" stroke="{AXIS}" stroke-width="1.4"/>']
    v = int(lo)
    while v <= hi:
        px = sx(v)
        body.append(f'<line x1="{px:.1f}" y1="{y-4}" x2="{px:.1f}" y2="{y+4}" stroke="{AXIS}" stroke-width="1"/>')
        body.append(f'<text x="{px:.1f}" y="{y+16}" text-anchor="middle" fill="{TEXTC}">{v}</text>')
        v += 1
    if point is not None:
        px = sx(point)
        if direction in ("left", "right"):
            x2 = PAD if direction == "left" else W - PAD
            body.append(f'<line x1="{px:.1f}" y1="{y}" x2="{x2}" y2="{y}" stroke="{ACCENT}" stroke-width="3"/>')
            head = x2 + (6 if direction == "left" else -6)
            body.append(f'<path d="M {x2} {y-4} L {x2} {y+4} L {head} {y} Z" fill="{ACCENT}"/>')
        fill = ACCENT if closed else "white"
        body.append(f'<circle cx="{px:.1f}" cy="{y}" r="4.5" fill="{fill}" stroke="{ACCENT}" stroke-width="2"/>')
    return _svg("".join(body))


def _numberline_answer(p):
    return _numberline(p, point=p.get("point"), closed=p.get("closed", True), direction=p.get("direction"))


def _mapping(p):
    xs, ys = p.get("x", []), p.get("y", [])
    arrows = p.get("arrows", [])
    lx, rx = 78, W - 78
    body = [f'<text x="{lx}" y="20" text-anchor="middle" fill="{TEXTC}" font-weight="600">x</text>',
            f'<text x="{rx}" y="20" text-anchor="middle" fill="{TEXTC}" font-weight="600">y</text>']

    def col_y(i, n):
        top, bot = 40, H - 24
        return top + (bot - top) * (i + 0.5) / max(1, n)

    lpos = [col_y(i, len(xs)) for i in range(len(xs))]
    rpos = [col_y(j, len(ys)) for j in range(len(ys))]
    for i, x in enumerate(xs):
        body.append(f'<circle cx="{lx}" cy="{lpos[i]:.1f}" r="12" fill="#eff6ff" stroke="{AXIS}"/>')
        body.append(f'<text x="{lx}" y="{lpos[i]+3:.1f}" text-anchor="middle" fill="{TEXTC}">{_num(x)}</text>')
    for j, y in enumerate(ys):
        body.append(f'<circle cx="{rx}" cy="{rpos[j]:.1f}" r="12" fill="#eff6ff" stroke="{AXIS}"/>')
        body.append(f'<text x="{rx}" y="{rpos[j]+3:.1f}" text-anchor="middle" fill="{TEXTC}">{_num(y)}</text>')
    for a in arrows:
        i, j = a[0], a[1]
        if i < len(lpos) and j < len(rpos):
            body.append(f'<line x1="{lx+13}" y1="{lpos[i]:.1f}" x2="{rx-13}" y2="{rpos[j]:.1f}" '
                        f'stroke="{ACCENT}" stroke-width="1.5" marker-end="url(#mh)"/>')
    defs = (f'<defs><marker id="mh" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">'
            f'<path d="M0,0 L6,3 L0,6 Z" fill="{ACCENT}"/></marker></defs>')
    return _svg(defs + "".join(body))


def _story(p):
    """Qualitative distance–time curve; segments are (run, rise) deltas."""
    segs = p.get("segments", [])
    x, y = 0, 0
    path = [(0, 0)]
    for dx, dy in segs:
        x += dx; y += dy
        path.append((x, y))
    xs = [q[0] for q in path]; ys = [q[1] for q in path]
    xmin, xmax = min(xs), max(xs); ymin, ymax = min(ys), max(ys)
    xr = (xmax - xmin) or 1; yr = (ymax - ymin) or 1

    def sx(v):
        return PAD + (v - xmin) / xr * (W - 2 * PAD)

    def sy(v):
        return H - PAD - (v - ymin) / yr * (H - 2 * PAD)

    body = [f'<line x1="{PAD}" y1="{H-PAD}" x2="{W-PAD}" y2="{H-PAD}" stroke="{AXIS}" stroke-width="1.3"/>',
            f'<line x1="{PAD}" y1="{PAD}" x2="{PAD}" y2="{H-PAD}" stroke="{AXIS}" stroke-width="1.3"/>',
            f'<text x="{W-PAD}" y="{H-PAD+14}" text-anchor="end" fill="{TEXTC}">time</text>',
            f'<text x="{PAD-4}" y="{PAD+2}" text-anchor="end" fill="{TEXTC}">distance</text>']
    pts = " ".join(f"{sx(a):.1f},{sy(b):.1f}" for a, b in path)
    body.append(f'<polyline points="{pts}" fill="none" stroke="{ACCENT}" stroke-width="2.2"/>')
    return _svg("".join(body))


def _table(p):
    headers = p.get("headers", [])
    rows = p.get("rows", [])
    ncol = max(len(headers), max((len(r) for r in rows), default=0)) or 1
    nrow = len(rows) + 1
    cw = min(58, (W - 20) // ncol)
    ch = 22
    tw = cw * ncol; th = ch * nrow
    ox = (W - tw) // 2; oy = (H - th) // 2
    body = []
    for r in range(nrow + 1):
        yy = oy + r * ch
        body.append(f'<line x1="{ox}" y1="{yy}" x2="{ox+tw}" y2="{yy}" stroke="{AXIS}" stroke-width="1"/>')
    for c in range(ncol + 1):
        xx = ox + c * cw
        body.append(f'<line x1="{xx}" y1="{oy}" x2="{xx}" y2="{oy+th}" stroke="{AXIS}" stroke-width="1"/>')
    body.append(f'<rect x="{ox}" y="{oy}" width="{tw}" height="{ch}" fill="#eff6ff"/>')
    for c, htxt in enumerate(headers):
        body.append(f'<text x="{ox+c*cw+cw/2:.1f}" y="{oy+15}" text-anchor="middle" fill="{TEXTC}" font-weight="600">{htxt}</text>')
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            body.append(f'<text x="{ox+c*cw+cw/2:.1f}" y="{oy+(r+1)*ch+15}" text-anchor="middle" fill="{TEXTC}">{_num(val) if isinstance(val,(int,float)) else val}</text>')
    return _svg("".join(body))


_RENDERERS = {
    "grid": _grid,
    "points": _points,
    "line_graph": _line_graph,
    "abs_graph": _abs_graph,
    "parabola": _parabola,
    "grid_answer": _grid_answer,
    "numberline": _numberline,
    "numberline_answer": _numberline_answer,
    "mapping": _mapping,
    "story": _story,
    "table": _table,
}


def render(kind, params):
    fn = _RENDERERS.get(kind)
    if not fn or params is None:
        return None
    try:
        return fn(params)
    except Exception as e:  # never let a bad figure break ingestion
        print(f"  [warn] figure render failed ({kind}): {type(e).__name__}: {e}")
        return None


if __name__ == "__main__":
    # Smoke test: render one of each kind to a combined preview HTML.
    import json, os
    samples = {
        "grid": {"xmin": -10, "xmax": 10, "ymin": -10, "ymax": 10},
        "numberline": {"min": -2, "max": 8},
        "numberline_answer": {"min": -6, "max": 6, "point": -3, "closed": True, "direction": "left"},
        "line_graph": {"slope": 2, "yint": -5, "xmin": -8, "xmax": 8},
        "abs_graph": {"a": 1, "h": 2, "k": -1, "xmin": -8, "xmax": 8},
        "parabola": {"a": 1, "h": 2, "k": -9, "xmin": -8, "xmax": 8},
        "points": {"pts": [[-2, 3], [0, 5], [1, 3], [4, -1]], "xmin": -6, "xmax": 6, "ymin": -6, "ymax": 6},
        "mapping": {"x": [-2, 1, 3], "y": [0, 4, 6], "arrows": [[0, 0], [1, 1], [1, 2], [2, 2]]},
        "story": {"segments": [[4, 4], [2, 0], [2, -4]]},
        "table": {"headers": ["x", "y"], "rows": [[-3, 5], [-1, 2], [2, 5], [4, 8]]},
        "grid_answer": {"lines": [{"slope": 2, "yint": -3}], "points": [[1, -1]], "xmin": -8, "xmax": 8, "ymin": -8, "ymax": 8},
    }
    import tempfile
    cells = "".join(f'<figure style="margin:6px;display:inline-block;border:1px solid #e2e8f0;padding:4px">'
                    f'<figcaption style="font:12px system-ui;color:#475569">{k}</figcaption>{render(k, v)}</figure>'
                    for k, v in samples.items())
    out = os.path.join(tempfile.gettempdir(), "alg1-figures-preview.html")
    open(out, "w").write(f'<!doctype html><body style="background:#fff">{cells}</body>')
    print("wrote", out)
