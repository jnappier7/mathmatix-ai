/**
 * VISUAL TOOLS — Structured tool definitions for LLM-driven visual rendering.
 *
 * Replaces text-tag parsing (e.g. "[FUNCTION_GRAPH:fn=x^2]") with OpenAI
 * function-calling. The model emits structured tool_calls with validated JSON
 * arguments, which we deterministically map to either:
 *   (a) the legacy inline bracket-tag the frontend already parses
 *   (b) a visualCommands sidecar entry (whiteboard / algebraTiles / etc.)
 *
 * Rolled out behind the ENABLE_VISUAL_TOOLS flag. When disabled, the
 * existing tag-parsing pipeline runs unchanged.
 *
 * @module visualTools
 */

// ---------------------------------------------------------------------------
// Tool specs: one entry per visual. Each spec includes:
//   - `function`:  OpenAI tool schema (name, description, parameters)
//   - `toTag(input)` → string | null  : legacy bracket tag for inline rendering
//   - `toVisualCommand(input)` → { channel, command } | null : sidecar entry
// At least one of `toTag` / `toVisualCommand` must be non-null.
// ---------------------------------------------------------------------------

const SPECS = {
  render_function_graph: {
    function: {
      name: 'render_function_graph',
      description:
        'Plot a mathematical function on a coordinate plane. Use when explaining function behavior, transformations, or comparing functions (e.g. student asks "show me x^2" or you are teaching parabolas).',
      parameters: {
        type: 'object',
        properties: {
          function: {
            type: 'string',
            description:
              'Function in standard math notation using x as the variable. Examples: "x^2", "sin(x)", "2*x+3", "(x^2-4)/(x-2)".',
          },
          xMin: { type: 'number', description: 'Minimum x value (default -10).' },
          xMax: { type: 'number', description: 'Maximum x value (default 10).' },
          yMin: { type: 'number', description: 'Optional minimum y value.' },
          yMax: { type: 'number', description: 'Optional maximum y value.' },
          title: { type: 'string', description: 'Optional caption, e.g. "y = x^2".' },
        },
        required: ['function'],
      },
    },
    toTag(input) {
      const parts = [`fn=${input.function}`];
      if (typeof input.xMin === 'number') parts.push(`xMin=${input.xMin}`);
      if (typeof input.xMax === 'number') parts.push(`xMax=${input.xMax}`);
      if (typeof input.yMin === 'number') parts.push(`yMin=${input.yMin}`);
      if (typeof input.yMax === 'number') parts.push(`yMax=${input.yMax}`);
      if (input.title) parts.push(`title="${input.title}"`);
      return `[FUNCTION_GRAPH:${parts.join(',')}]`;
    },
    toVisualCommand: null,
  },

  render_number_line: {
    function: {
      name: 'render_number_line',
      description:
        'Render a number line. Use for integer arithmetic, inequalities, fraction placement, absolute value, or when the student says "show me a number line".',
      parameters: {
        type: 'object',
        properties: {
          min: { type: 'number', description: 'Leftmost value.' },
          max: { type: 'number', description: 'Rightmost value.' },
          points: {
            type: 'array',
            items: { type: 'number' },
            description: 'Optional list of values to mark on the line.',
          },
          label: { type: 'string', description: 'Optional caption.' },
        },
        required: ['min', 'max'],
      },
    },
    toTag(input) {
      const parts = [`min=${input.min}`, `max=${input.max}`];
      if (Array.isArray(input.points) && input.points.length > 0) {
        parts.push(`points=[${input.points.join(',')}]`);
      }
      if (input.label) parts.push(`label="${input.label}"`);
      return `[NUMBER_LINE:${parts.join(',')}]`;
    },
    toVisualCommand: null,
  },

  render_fraction: {
    function: {
      name: 'render_fraction',
      description:
        'Visualize a fraction as a circle or bar. Use when teaching fraction meaning, comparison, or equivalent fractions.',
      parameters: {
        type: 'object',
        properties: {
          numerator: { type: 'integer' },
          denominator: { type: 'integer' },
          shape: {
            type: 'string',
            enum: ['circle', 'bar'],
            description: 'Rendering shape (default "circle").',
          },
        },
        required: ['numerator', 'denominator'],
      },
    },
    toTag(input) {
      const parts = [
        `numerator=${input.numerator}`,
        `denominator=${input.denominator}`,
        `type=${input.shape || 'circle'}`,
      ];
      return `[FRACTION:${parts.join(',')}]`;
    },
    toVisualCommand: null,
  },

  render_algebra_tiles: {
    function: {
      name: 'render_algebra_tiles',
      description:
        'Show algebra tiles for an expression like "2x+3" or "x^2-x-6". Use when teaching factoring, combining like terms, or representing polynomials visually.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Polynomial expression, e.g. "x^2+5x+6" or "2x+3".',
          },
        },
        required: ['expression'],
      },
    },
    toTag(input) {
      return `[ALGEBRA_TILES:${input.expression}]`;
    },
    toVisualCommand(input) {
      return {
        channel: 'algebraTiles',
        command: { type: 'expression', expression: input.expression, autoOpen: true },
      };
    },
  },

  render_fraction_bars: {
    function: {
      name: 'render_fraction_bars',
      description:
        'Show fraction bars on the manipulatives board. Use when teaching fractions, equivalent fractions, or comparing fractions.',
      parameters: {
        type: 'object',
        properties: {
          numerator: { type: 'integer' },
          denominator: { type: 'integer' },
        },
        required: ['numerator', 'denominator'],
      },
    },
    toTag(input) {
      return `[FRACTION_BARS:${input.numerator},${input.denominator}]`;
    },
    toVisualCommand(input) {
      return {
        channel: 'manipulatives',
        command: {
          type: 'fractionBars',
          numerator: input.numerator,
          denominator: input.denominator,
          autoOpen: true,
        },
      };
    },
  },

  render_base_ten_blocks: {
    function: {
      name: 'render_base_ten_blocks',
      description:
        'Show base-10 blocks for a number. Use for place value, addition with regrouping, multi-digit operations.',
      parameters: {
        type: 'object',
        properties: {
          number: { type: 'integer', description: 'Whole number to decompose.' },
        },
        required: ['number'],
      },
    },
    toTag(input) {
      return `[BASE_TEN_BLOCKS:${input.number}]`;
    },
    toVisualCommand(input) {
      return {
        channel: 'manipulatives',
        command: { type: 'baseTenBlocks', number: input.number, autoOpen: true },
      };
    },
  },

  render_counters: {
    function: {
      name: 'render_counters',
      description:
        'Show positive and negative counters with zero-pair cancellation. Use for integer operations and opposites.',
      parameters: {
        type: 'object',
        properties: {
          positive: { type: 'integer', minimum: 0 },
          negative: { type: 'integer', minimum: 0 },
        },
        required: ['positive', 'negative'],
      },
    },
    toTag(input) {
      return `[COUNTERS:positive=${input.positive},negative=${input.negative}]`;
    },
    toVisualCommand: null,
  },

  render_unit_circle: {
    function: {
      name: 'render_unit_circle',
      description:
        'Render the unit circle. Use for trig angle/coordinate mapping, sine/cosine definitions, reference angles.',
      parameters: {
        type: 'object',
        properties: {
          angle: {
            type: 'number',
            description: 'Optional angle in degrees to highlight.',
          },
        },
      },
    },
    toTag(input) {
      if (typeof input.angle === 'number') {
        return `[UNIT_CIRCLE:angle=${input.angle}]`;
      }
      return `[UNIT_CIRCLE]`;
    },
    toVisualCommand: null,
  },

  render_points_plot: {
    function: {
      name: 'render_points_plot',
      description:
        'Plot points on a coordinate plane. Use when teaching coordinates, ordered pairs, or plotting data.',
      parameters: {
        type: 'object',
        properties: {
          points: {
            type: 'array',
            description: 'Array of [x, y] pairs.',
            items: {
              type: 'array',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
          },
        },
        required: ['points'],
      },
    },
    toTag(input) {
      const rendered = input.points
        .map((p) => `(${p[0]},${p[1]})`)
        .join(',');
      return `[POINTS:points=${rendered}]`;
    },
    toVisualCommand: null,
  },

  search_educational_image: {
    function: {
      name: 'search_educational_image',
      description:
        'Find a canonical educational image (diagram, real-world picture) from whitelisted edu sources. Use for concepts that benefit from a diagram the student would see in a textbook (geometric shapes, scientific visualizations).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Concise search query.' },
          category: {
            type: 'string',
            description: 'Optional domain hint (e.g. "geometry", "chemistry").',
          },
        },
        required: ['query'],
      },
    },
    toTag(input) {
      const parts = [`query="${input.query}"`];
      if (input.category) parts.push(`category=${input.category}`);
      return `[SEARCH_IMAGE:${parts.join(',')}]`;
    },
    toVisualCommand(input) {
      return {
        channel: 'images',
        command: {
          type: 'search',
          query: input.query,
          category: input.category || null,
          inline: true,
        },
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** OpenAI tool definitions (pass directly as `tools` parameter). */
const VISUAL_TOOLS = Object.values(SPECS).map((spec) => ({
  type: 'function',
  function: spec.function,
}));

/** Set of canonical tool names. */
const VISUAL_TOOL_NAMES = new Set(Object.keys(SPECS));

/**
 * Resolve a single tool call into {tag, visualCommand}.
 * @param {string} name - Tool name from the LLM.
 * @param {Object} input - Validated argument object.
 * @returns {{ tag: string | null, visualCommand: { channel: string, command: Object } | null }}
 */
function resolveToolCall(name, input) {
  const spec = SPECS[name];
  if (!spec) {
    return { tag: null, visualCommand: null };
  }
  const safeInput = input || {};
  const tag = spec.toTag ? spec.toTag(safeInput) : null;
  const visualCommand = spec.toVisualCommand ? spec.toVisualCommand(safeInput) : null;
  return { tag, visualCommand };
}

/**
 * Resolve an array of tool_calls (as returned by OpenAI) into merged outputs.
 * Each tool_call is `{ id, type: 'function', function: { name, arguments } }`
 * where `arguments` is a JSON string. Malformed JSON is skipped with a warning.
 *
 * @param {Array} toolCalls
 * @returns {{ tags: string[], visualCommands: { whiteboard:[], algebraTiles:[], images:[], manipulatives:[] }, unknown: string[] }}
 */
function resolveToolCalls(toolCalls) {
  const tags = [];
  const visualCommands = {
    whiteboard: [],
    algebraTiles: [],
    images: [],
    manipulatives: [],
  };
  const unknown = [];

  if (!Array.isArray(toolCalls)) {
    return { tags, visualCommands, unknown };
  }

  for (const call of toolCalls) {
    const fnName = call?.function?.name;
    if (!fnName) continue;

    if (!VISUAL_TOOL_NAMES.has(fnName)) {
      unknown.push(fnName);
      continue;
    }

    let parsed = {};
    try {
      const raw = call.function.arguments;
      if (typeof raw === 'string' && raw.trim().length > 0) {
        parsed = JSON.parse(raw);
      } else if (raw && typeof raw === 'object') {
        parsed = raw;
      }
    } catch (err) {
      console.warn(`[visualTools] Malformed arguments for ${fnName}: ${err.message}`);
      continue;
    }

    const { tag, visualCommand } = resolveToolCall(fnName, parsed);
    if (tag) tags.push(tag);
    if (visualCommand && visualCommands[visualCommand.channel]) {
      visualCommands[visualCommand.channel].push(visualCommand.command);
    }
  }

  return { tags, visualCommands, unknown };
}

/**
 * Short human-readable description of available tools, for injection into
 * a system prompt. Keeps the model aware that tools exist even before the
 * provider surfaces the tool schema.
 */
function describeTools() {
  const lines = VISUAL_TOOLS.map((t) => {
    const required = t.function.parameters.required || [];
    return `- ${t.function.name}(${required.join(', ')}): ${t.function.description}`;
  });
  return [
    'VISUAL TOOLS AVAILABLE (structured function calls — prefer these over text tags when emitting visuals):',
    ...lines,
  ].join('\n');
}

module.exports = {
  VISUAL_TOOLS,
  VISUAL_TOOL_NAMES,
  SPECS,
  resolveToolCall,
  resolveToolCalls,
  describeTools,
};
