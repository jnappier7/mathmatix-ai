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
