const { buildDiagramSpec, TYPES } = require('../../public/js/diagramSpec');

describe('diagramSpec — inscribed angle (correct by construction)', () => {
  it('exposes the supported types', () => {
    expect(TYPES).toContain('inscribed_angle');
  });

  it('builds a valid inscribed-angle spec where central = 2 × inscribed', () => {
    const s = buildDiagramSpec('inscribed_angle', { inscribedAngleDeg: 30 });
    expect(s.valid).toBe(true);
    expect(s.angles.inscribed.value).toBe(30);
    expect(s.angles.central.value).toBe(60); // theorem holds exactly
    expect(s.angles.inscribed.label).toBe('30°');
    expect(s.angles.central.label).toBe('60°');
  });

  it('places B at the bottom of the circle and A/C symmetric about the y-axis', () => {
    const s = buildDiagramSpec('inscribed_angle', { inscribedAngleDeg: 40, radius: 5 });
    expect(s.points.O).toEqual([0, 0]);
    expect(s.points.B).toEqual([0, -5]);            // bottom
    expect(s.points.A[0]).toBeCloseTo(-s.points.C[0], 4); // mirror across y-axis
    expect(s.points.A[1]).toBeCloseTo(s.points.C[1], 4);
    // all three on the circle of radius 5
    for (const p of [s.points.A, s.points.B, s.points.C]) {
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(5, 3);
    }
  });

  it('redaction hides the values (for the student\'s own problem)', () => {
    const s = buildDiagramSpec('inscribed_angle', { inscribedAngleDeg: 30 }, { redact: true });
    expect(s.valid).toBe(true);
    expect(s.angles.inscribed.value).toBeNull();
    expect(s.angles.central.value).toBeNull();
    expect(s.angles.inscribed.label).toBe('?');
    expect(s.angles.central.label).toBe('?');
    expect(s.caption).not.toMatch(/\d/); // no numbers leak in the caption
  });

  it('rejects out-of-range / missing / bad params', () => {
    expect(buildDiagramSpec('inscribed_angle', { inscribedAngleDeg: 0 }).valid).toBe(false);
    expect(buildDiagramSpec('inscribed_angle', { inscribedAngleDeg: 90 }).valid).toBe(false);
    expect(buildDiagramSpec('inscribed_angle', { inscribedAngleDeg: 120 }).valid).toBe(false);
    expect(buildDiagramSpec('inscribed_angle', {}).valid).toBe(false);
    expect(buildDiagramSpec('inscribed_angle', { inscribedAngleDeg: 30, radius: -1 }).valid).toBe(false);
  });

  it('rejects unknown diagram types', () => {
    const s = buildDiagramSpec('flux_capacitor', {});
    expect(s.valid).toBe(false);
    expect(s.errors[0]).toMatch(/unknown diagram type/);
  });
});

describe('diagramSpec — congruent triangles (correct by construction)', () => {
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  it('exposes the type', () => {
    expect(TYPES).toContain('congruent_triangles');
  });

  it('builds two triangles that ARE congruent (DEF ≅ ABC under the A→D,B→E,C→F correspondence)', () => {
    const s = buildDiagramSpec('congruent_triangles', {});
    expect(s.valid).toBe(true);
    const p = s.points;
    expect(Object.keys(p).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(s.triangles).toEqual([['A', 'B', 'C'], ['D', 'E', 'F']]);
    // corresponding sides are equal length -> the triangles are congruent
    expect(dist(p.A, p.B)).toBeCloseTo(dist(p.D, p.E), 6); // AB = DE
    expect(dist(p.B, p.C)).toBeCloseTo(dist(p.E, p.F), 6); // BC = EF
    expect(dist(p.C, p.A)).toBeCloseTo(dist(p.F, p.D), 6); // CA = FD
    // and it's genuinely scalene (marks are meaningful)
    expect(dist(p.A, p.B)).not.toBeCloseTo(dist(p.B, p.C), 2);
  });

  it('marks the SAS setup from the transcript: AB≅DE, BC≅EF (2 ticks), ∠B≅∠E', () => {
    const s = buildDiagramSpec('congruent_triangles', {
      markedSides: [['AB', 'DE'], ['BC', 'EF']],
      markedAngles: [['B', 'E']],
    });
    expect(s.valid).toBe(true);
    // group 0 -> 1 tick, group 1 -> 2 ticks
    const ab = s.sideMarks.find((m) => m.seg.join('') === 'AB');
    const de = s.sideMarks.find((m) => m.seg.join('') === 'DE');
    const bc = s.sideMarks.find((m) => m.seg.join('') === 'BC');
    const ef = s.sideMarks.find((m) => m.seg.join('') === 'EF');
    expect([ab.ticks, de.ticks]).toEqual([1, 1]);
    expect([bc.ticks, ef.ticks]).toEqual([2, 2]);
    // angle B's rays are the other two vertices of ITS triangle (A, C); E's are D, F
    const angB = s.angleMarks.find((m) => m.at === 'B');
    const angE = s.angleMarks.find((m) => m.at === 'E');
    expect(angB.rays.sort()).toEqual(['A', 'C']);
    expect(angE.rays.sort()).toEqual(['D', 'F']);
  });

  it('tick geometry: midpoint on the side, perp is a unit normal', () => {
    const s = buildDiagramSpec('congruent_triangles', { markedSides: [['BC']] });
    const bc = s.sideMarks[0];
    const p = s.points;
    expect(bc.mid).toEqual([(p.B[0] + p.C[0]) / 2, (p.B[1] + p.C[1]) / 2]);
    expect(Math.hypot(bc.perp[0], bc.perp[1])).toBeCloseTo(1, 4);
    // perpendicular to the side direction
    expect(bc.perp[0] * bc.along[0] + bc.perp[1] * bc.along[1]).toBeCloseTo(0, 4);
  });

  it('supports right-angle marks (HL)', () => {
    const s = buildDiagramSpec('congruent_triangles', { rightAngles: ['B', 'E'] });
    expect(s.rightAngleMarks.map((m) => m.at)).toEqual(['B', 'E']);
    expect(s.rightAngleMarks[0].rays.sort()).toEqual(['A', 'C']);
  });

  it('rejects a side that spans two different triangles or names an unknown vertex', () => {
    expect(buildDiagramSpec('congruent_triangles', { markedSides: [['AE']] }).valid).toBe(false); // A∈tri1, E∈tri2
    expect(buildDiagramSpec('congruent_triangles', { markedSides: [['AZ']] }).valid).toBe(false);
    expect(buildDiagramSpec('congruent_triangles', { markedAngles: [['Z']] }).valid).toBe(false);
  });

  it('NEVER names the postulate in the caption (that is the answer)', () => {
    const s = buildDiagramSpec('congruent_triangles', {
      markedSides: [['AB', 'DE'], ['BC', 'EF']], markedAngles: [['B', 'E']],
    });
    expect(s.caption).not.toMatch(/\b(SSS|SAS|ASA|AAS|HL)\b/i);
  });

  it('extent covers all six points with padding', () => {
    const s = buildDiagramSpec('congruent_triangles', {});
    const xs = Object.keys(s.points).map((k) => s.points[k][0]);
    const ys = Object.keys(s.points).map((k) => s.points[k][1]);
    expect(s.extent.xMin).toBeLessThan(Math.min(...xs));
    expect(s.extent.xMax).toBeGreaterThan(Math.max(...xs));
    expect(s.extent.yMin).toBeLessThan(Math.min(...ys));
    expect(s.extent.yMax).toBeGreaterThan(Math.max(...ys));
  });
});
