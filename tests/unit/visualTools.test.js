const {
  VISUAL_TOOLS,
  VISUAL_TOOL_NAMES,
  SPECS,
  resolveToolCall,
  resolveToolCalls,
  describeTools,
} = require('../../utils/visualTools');

describe('visualTools', () => {
  describe('VISUAL_TOOLS schema export', () => {
    it('is an array of OpenAI-shaped tool descriptors', () => {
      expect(Array.isArray(VISUAL_TOOLS)).toBe(true);
      expect(VISUAL_TOOLS.length).toBeGreaterThanOrEqual(10);
      for (const tool of VISUAL_TOOLS) {
        expect(tool.type).toBe('function');
        expect(typeof tool.function.name).toBe('string');
        expect(typeof tool.function.description).toBe('string');
        expect(tool.function.parameters.type).toBe('object');
      }
    });

    it('every spec has a unique name and at least one renderer', () => {
      const names = new Set();
      for (const [name, spec] of Object.entries(SPECS)) {
        expect(names.has(name)).toBe(false);
        names.add(name);
        const hasRenderer = spec.toTag || spec.toVisualCommand;
        expect(hasRenderer).toBeTruthy();
      }
    });

    it('includes the canonical visuals from the refactor spec', () => {
      const required = [
        'render_function_graph',
        'render_number_line',
        'render_algebra_tiles',
        'render_fraction_bars',
        'render_base_ten_blocks',
        'render_counters',
        'search_educational_image',
        'render_unit_circle',
      ];
      for (const name of required) {
        expect(VISUAL_TOOL_NAMES.has(name)).toBe(true);
      }
    });

    it('every function schema declares required params correctly', () => {
      for (const tool of VISUAL_TOOLS) {
        const { parameters } = tool.function;
        if (parameters.required) {
          for (const key of parameters.required) {
            expect(parameters.properties[key]).toBeDefined();
          }
        }
      }
    });
  });

  describe('resolveToolCall', () => {
    it('maps render_function_graph input to a legacy tag', () => {
      const { tag, visualCommand } = resolveToolCall('render_function_graph', {
        function: 'x^2',
        xMin: -5,
        xMax: 5,
        title: 'Parabola',
      });
      expect(tag).toBe('[FUNCTION_GRAPH:fn=x^2,xMin=-5,xMax=5,title="Parabola"]');
      expect(visualCommand).toBeNull();
    });

    it('omits optional params from render_function_graph tag when not given', () => {
      const { tag } = resolveToolCall('render_function_graph', {
        function: 'sin(x)',
      });
      expect(tag).toBe('[FUNCTION_GRAPH:fn=sin(x)]');
    });

    it('builds a NUMBER_LINE tag with optional points array', () => {
      const { tag } = resolveToolCall('render_number_line', {
        min: -5,
        max: 5,
        points: [0, 3],
        label: 'Example',
      });
      expect(tag).toBe('[NUMBER_LINE:min=-5,max=5,points=[0,3],label="Example"]');
    });

    it('algebra tiles routes to both the inline tag AND a sidecar command', () => {
      const { tag, visualCommand } = resolveToolCall('render_algebra_tiles', {
        expression: 'x^2+5x+6',
      });
      expect(tag).toBe('[ALGEBRA_TILES:x^2+5x+6]');
      expect(visualCommand).toEqual({
        channel: 'algebraTiles',
        command: { type: 'expression', expression: 'x^2+5x+6', autoOpen: true },
      });
    });

    it('fraction bars produces a manipulatives sidecar entry', () => {
      const { visualCommand } = resolveToolCall('render_fraction_bars', {
        numerator: 3,
        denominator: 4,
      });
      expect(visualCommand.channel).toBe('manipulatives');
      expect(visualCommand.command.type).toBe('fractionBars');
      expect(visualCommand.command.numerator).toBe(3);
      expect(visualCommand.command.denominator).toBe(4);
      expect(visualCommand.command.autoOpen).toBe(true);
    });

    it('base-10 blocks produces a manipulatives sidecar entry', () => {
      const { tag, visualCommand } = resolveToolCall('render_base_ten_blocks', {
        number: 345,
      });
      expect(tag).toBe('[BASE_TEN_BLOCKS:345]');
      expect(visualCommand.channel).toBe('manipulatives');
      expect(visualCommand.command.number).toBe(345);
    });

    it('unit circle tag omits angle when missing', () => {
      expect(resolveToolCall('render_unit_circle', {}).tag).toBe('[UNIT_CIRCLE]');
      expect(resolveToolCall('render_unit_circle', { angle: 45 }).tag).toBe(
        '[UNIT_CIRCLE:angle=45]'
      );
    });

    it('counters serializes positive and negative counts', () => {
      const { tag } = resolveToolCall('render_counters', { positive: 5, negative: 3 });
      expect(tag).toBe('[COUNTERS:positive=5,negative=3]');
    });

    it('search_educational_image stores a quoted query with optional category', () => {
      const { tag, visualCommand } = resolveToolCall('search_educational_image', {
        query: 'unit circle',
        category: 'trigonometry',
      });
      expect(tag).toBe('[SEARCH_IMAGE:query="unit circle",category=trigonometry]');
      expect(visualCommand.channel).toBe('images');
      expect(visualCommand.command.query).toBe('unit circle');
    });

    it('unknown tool returns nulls (no crash)', () => {
      const { tag, visualCommand } = resolveToolCall('does_not_exist', { x: 1 });
      expect(tag).toBeNull();
      expect(visualCommand).toBeNull();
    });
  });

  describe('resolveToolCalls', () => {
    const makeCall = (name, argsObj) => ({
      id: `call_${Math.random().toString(36).slice(2, 8)}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(argsObj) },
    });

    it('resolves multiple tool_calls into merged tags + sidecar visualCommands', () => {
      const toolCalls = [
        makeCall('render_function_graph', { function: 'x^2' }),
        makeCall('render_algebra_tiles', { expression: '2x+3' }),
        makeCall('render_fraction_bars', { numerator: 1, denominator: 4 }),
      ];
      const { tags, visualCommands, unknown } = resolveToolCalls(toolCalls);
      expect(tags).toHaveLength(3);
      expect(tags[0]).toContain('FUNCTION_GRAPH');
      expect(tags[1]).toContain('ALGEBRA_TILES');
      expect(tags[2]).toContain('FRACTION_BARS');
      expect(visualCommands.algebraTiles).toHaveLength(1);
      expect(visualCommands.manipulatives).toHaveLength(1);
      expect(unknown).toHaveLength(0);
    });

    it('records unknown tool names without throwing', () => {
      const toolCalls = [
        { id: 'a', type: 'function', function: { name: 'render_wormhole', arguments: '{}' } },
        { id: 'b', type: 'function', function: { name: 'render_function_graph', arguments: '{"function":"x"}' } },
      ];
      const { tags, unknown } = resolveToolCalls(toolCalls);
      expect(unknown).toEqual(['render_wormhole']);
      expect(tags).toHaveLength(1);
    });

    it('tolerates malformed JSON arguments', () => {
      const toolCalls = [
        { id: 'a', type: 'function', function: { name: 'render_function_graph', arguments: '{broken' } },
        { id: 'b', type: 'function', function: { name: 'render_function_graph', arguments: '{"function":"sin(x)"}' } },
      ];
      const { tags } = resolveToolCalls(toolCalls);
      // Malformed call is dropped; well-formed call still resolves
      expect(tags).toHaveLength(1);
      expect(tags[0]).toContain('sin(x)');
    });

    it('accepts already-parsed object arguments (some SDKs pre-parse)', () => {
      const toolCalls = [
        {
          id: 'a',
          type: 'function',
          function: { name: 'render_number_line', arguments: { min: 0, max: 10 } },
        },
      ];
      const { tags } = resolveToolCalls(toolCalls);
      expect(tags[0]).toBe('[NUMBER_LINE:min=0,max=10]');
    });

    it('returns empty structures for non-array input', () => {
      const r = resolveToolCalls(null);
      expect(r.tags).toEqual([]);
      expect(r.unknown).toEqual([]);
    });
  });

  describe('describeTools', () => {
    it('lists every tool with its required params and description', () => {
      const text = describeTools();
      for (const tool of VISUAL_TOOLS) {
        expect(text).toContain(tool.function.name);
      }
    });
  });
});
