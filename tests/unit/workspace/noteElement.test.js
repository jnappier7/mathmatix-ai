const NoteElement = require('../../../public/js/living-workspace/dom/noteElement.js');

describe('noteElement.describe — interim IMAGE/GEOMETRY labelling', () => {
  it('image: shows the (gate-approved) query when no caption', () => {
    const d = NoteElement.describe({ type: 'image', semantic: { query: 'balance scale concept' } });
    expect(d.title).toBe('Picture');
    expect(d.text).toBe('balance scale concept');
    expect(d.icon).toBe('🖼');
  });

  it('image: caption wins over query (tutor\'s own words)', () => {
    const d = NoteElement.describe({ type: 'image', semantic: { query: 'x', caption: 'A balance scale' } });
    expect(d.text).toBe('A balance scale');
  });

  it('geometry: shows the diagram type', () => {
    const d = NoteElement.describe({ type: 'geometry', semantic: { diagramType: 'right triangle' } });
    expect(d.title).toBe('Figure');
    expect(d.text).toBe('right triangle');
    expect(d.icon).toBe('📐');
  });

  it('geometry: falls back to a params label, then a generic word', () => {
    expect(NoteElement.describe({ type: 'geometry', semantic: { params: { label: 'hexagon' } } }).text).toBe('hexagon');
    expect(NoteElement.describe({ type: 'geometry', semantic: {} }).text).toBe('figure');
  });

  it('never returns empty title/icon (no bare "[type]" leakage)', () => {
    const d = NoteElement.describe({ type: 'image', semantic: {} });
    expect(d.title).toBeTruthy();
    expect(d.icon).toBeTruthy();
    expect(d.text).toBe('image');
  });
});
