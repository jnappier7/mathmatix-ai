const {
  buildVisualDirective,
  matchTopic,
} = require('../../utils/pipeline/visualDirective');

// The tutor had the whole visual toolkit and never used it, because nothing
// ever ASKED. These pin the two grounds for asking — and, just as important,
// the silences that keep it from becoming decoration.
describe('buildVisualDirective — when the moment earns a picture', () => {
  it('asks on direct instruction (first encounter with a new skill)', () => {
    const d = buildVisualDirective({ action: 'direct_instruction' });
    expect(d).toMatch(/^DRAW IT:/);
    expect(d).toMatch(/teaching turn/);
  });

  it('asks on a representation switch — the action literally means "say it another way"', () => {
    expect(buildVisualDirective({ action: 'switch_representation' })).toMatch(/^DRAW IT:/);
  });

  it('asks when re-teaching a misconception and when bridging a prerequisite', () => {
    expect(buildVisualDirective({ action: 'reteach_misconception' })).toBeTruthy();
    expect(buildVisualDirective({ action: 'prerequisite_bridge' })).toBeTruthy();
  });

  it('asks when words have already missed twice, whatever the action', () => {
    const d = buildVisualDirective({ action: 'guide_incorrect', recentWrongCount: 2 });
    expect(d).toMatch(/Change the channel/);
  });

  it('stays quiet on one miss — a single wrong answer is not a channel problem', () => {
    expect(buildVisualDirective({ action: 'guide_incorrect', recentWrongCount: 1 })).toBeNull();
  });
});

describe('buildVisualDirective — when the math itself is visual', () => {
  it('asks on a spatial topic even outside a designated teaching moment', () => {
    const d = buildVisualDirective({ action: 'hint', skillName: 'Area of a Triangle' });
    expect(d).toMatch(/spatial by nature/);
  });

  it('names the specific tool, because "use a visual" against 40 tags produces nothing', () => {
    expect(buildVisualDirective({ action: 'hint', skillName: 'Inscribed Angles' }))
      .toContain('CIRCLE_DIAGRAM');
    expect(buildVisualDirective({ action: 'hint', studentText: 'how do I solve this system of equations' }))
      .toContain('SYSTEM_GRAPH');
    expect(buildVisualDirective({ action: 'hint', skillName: 'Adding Integers' }))
      .toContain('number_line');
    expect(buildVisualDirective({ action: 'hint', skillName: 'Factoring Trinomials' }))
      .toContain('TILES');
  });

  it('reads the student\'s own words, not just the tagged skill', () => {
    const d = buildVisualDirective({ action: 'hint', studentText: 'i dont get why the slope is negative' });
    expect(d).toContain('SLIDER_GRAPH');
  });

  it('falls back to a generic tool nudge on a teaching turn with no topic match', () => {
    const d = buildVisualDirective({ action: 'direct_instruction', skillName: 'Order of Operations' });
    expect(d).toMatch(/Pick the tool that fits/);
  });

  it('routes a circle to a circle diagram, never a function graph', () => {
    expect(matchTopic('Tangent and Secant Segments').tool).toMatch(/never a function graph/);
  });
});

describe('buildVisualDirective — the silences', () => {
  it('never asks when the student just got it right', () => {
    expect(buildVisualDirective({ action: 'confirm_correct', skillName: 'Graphing Lines' })).toBeNull();
    expect(buildVisualDirective({ action: 'affirm_then_probe', skillName: 'Circles' })).toBeNull();
    expect(buildVisualDirective({ action: 'acknowledge_progress', skillName: 'Area' })).toBeNull();
  });

  it('never asks on an off-topic redirect or a pure feelings turn', () => {
    expect(buildVisualDirective({ action: 'redirect_to_math', skillName: 'Triangles' })).toBeNull();
    expect(buildVisualDirective({ action: 'acknowledge_frustration', skillName: 'Slope' })).toBeNull();
  });

  it('points back at an existing visual instead of asking for a second one', () => {
    // A tutor who has already drawn the triangle taps the drawing; they do not
    // draw it again.
    const withoutBoard = buildVisualDirective({ action: 'direct_instruction', skillName: 'Triangles' });
    const withBoard = buildVisualDirective({ action: 'direct_instruction', skillName: 'Triangles', boardHasVisual: true });
    expect(withoutBoard).toBeTruthy();
    expect(withBoard).toBeNull();
  });

  it('stays quiet on an ordinary turn with no visual topic and no struggle', () => {
    expect(buildVisualDirective({ action: 'continue_conversation', studentText: 'ok cool' })).toBeNull();
    expect(buildVisualDirective({})).toBeNull();
  });
});

describe('buildVisualDirective — the student asking outranks the silences', () => {
  // "I can't picture it, can you show me?" reads as frustration to the decide
  // stage, and acknowledge_frustration is a NEVER_VISUAL silence — so the one
  // turn where the student explicitly asked for a picture was the one turn
  // guaranteed not to get one.
  it('asks when a "feelings" turn is actually a request to be shown', () => {
    const d = buildVisualDirective({
      action: 'acknowledge_frustration',
      skillName: 'Distributive Property',
      studentText: "i get that its the whole thing but i cant picture it. can you show me?",
    });
    expect(d).toBeTruthy();
    expect(d).toMatch(/ASKED to see it/);
  });

  it('asks on a plain conversational turn when the student says "draw it"', () => {
    expect(buildVisualDirective({
      action: 'continue_conversation',
      studentText: 'wait can you draw that for me',
    })).toBeTruthy();
  });

  it('still names the right tool when the ask arrives on a known topic', () => {
    const d = buildVisualDirective({
      action: 'check_understanding',
      skillName: 'Slope of a Line',
      studentText: 'show me what that looks like',
    });
    expect(d).toMatch(/FUNCTION_GRAPH|SLIDER_GRAPH/);
  });

  it('a board that already has the visual still wins — point, do not redraw', () => {
    expect(buildVisualDirective({
      action: 'acknowledge_frustration',
      skillName: 'Slope',
      studentText: 'can you show me?',
      boardHasVisual: true,
    })).toBeNull();
  });

  it('does not fire on prose that merely contains the words', () => {
    expect(buildVisualDirective({
      action: 'confirm_correct',
      studentText: 'my teacher will show me the test on friday i think',
    })).toBeNull();
  });
});

describe('buildVisualDirective — the anti-cheat carve-out', () => {
  it('always warns off plotting the student\'s own unsolved expression', () => {
    // The visual gate strips these server-side; saying so up front saves the
    // wasted emission and the literal-tag flash while it streams.
    const d = buildVisualDirective({ action: 'direct_instruction', skillName: 'Quadratics' });
    expect(d).toMatch(/unsolved expression/);
    expect(d).toMatch(/gate will strip it/);
  });

  it('asks the tutor to TALK about the picture it draws', () => {
    const d = buildVisualDirective({ action: 'worked_example', skillName: 'Volume of a Cylinder' });
    expect(d).toMatch(/A picture nobody talks about teaches nothing/);
  });
});

// Plurals and inflections: these patterns are matched against SKILL NAMES as
// often as student prose, and skill names are almost always plural
// ("Adding Integers", "Factoring Trinomials"). A bare \binteger\b misses
// every one of them — which is silence exactly where the ask was needed.
describe('matchTopic — inflections, and senses that collide', () => {
  it.each([
    ['Adding Integers', 'number_line'],
    ['Factoring Trinomials', 'TILES'],
    ['Equivalent Fractions', 'FRACTION'],
    ['Properties of Triangles', 'DIAGRAM:triangle'],
    ['Graphing Systems of Equations', 'SYSTEM_GRAPH'],
    ['Transformations of Functions', 'SLIDER_GRAPH'],
    ['Volume of Cylinders', 'labelled figure'],
    ['Inscribed Angles in Circles', 'CIRCLE_DIAGRAM'],
    ['Scatter Plots', 'FUNCTION_GRAPH'],
  ])('%s routes to %s', (skillName, expected) => {
    expect(matchTopic(skillName).tool).toContain(expected);
  });

  it('sends a calculus tangent line to a graph, not a circle diagram', () => {
    // Bare "tangent" in the circle pattern used to swallow this.
    expect(matchTopic('find the tangent line to the curve').tool).toContain('DERIVATIVE_GRAPH');
  });

  it('still sends a circle tangent to the circle diagram', () => {
    expect(matchTopic('tangent to the circle from an external point').tool)
      .toContain('CIRCLE_DIAGRAM');
  });

  it('does not fire on words that merely contain a topic term', () => {
    expect(matchTopic('march was a long month')).toBeNull();
    expect(matchTopic('what should i do next')).toBeNull();
  });
});
