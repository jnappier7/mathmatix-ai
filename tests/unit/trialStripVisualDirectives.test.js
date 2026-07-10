// Unit tests for the trial reply's inline-visual-directive stripper.
// The trial client can't render [FUNCTION_GRAPH:...] and friends, so they must be
// removed server-side before the reply is sent — WITHOUT eating LaTeX math.

// Heavy deps pulled in when the route module loads — stub them out.
jest.mock('../../utils/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
jest.mock('../../utils/prompt', () => ({ generateSystemPrompt: jest.fn() }));
jest.mock('../../middleware/promptInjection', () => ({ sanitizeForAI: (s) => s }));
jest.mock('../../utils/ttsProvider', () => ({ isConfigured: () => false }));

const { stripVisualDirectives } = require('../../routes/trialChat');

describe('stripVisualDirectives', () => {
  test('removes a FUNCTION_GRAPH directive and keeps the surrounding prose', () => {
    const out = stripVisualDirectives(
      'Seeing the graph helps. [FUNCTION_GRAPH:fn=2x-5,title="Graph of 2x-5"] Let\'s go.'
    );
    expect(out).not.toMatch(/FUNCTION_GRAPH/);
    expect(out).not.toMatch(/[[\]]/);           // no stray brackets left
    expect(out).toContain('Seeing the graph helps.');
    expect(out).toContain("Let's go.");
  });

  test('handles nested brackets in directive params', () => {
    const out = stripVisualDirectives('Before [DIAGRAM:pts=[[0,0],[1,1]]] after');
    expect(out).not.toMatch(/DIAGRAM|[[\]]/);
    expect(out).toContain('Before');
    expect(out).toContain('after');
  });

  test('PRESERVES LaTeX display and inline math (backslash-guarded)', () => {
    const inp = 'The answer: \\[X = 4\\] and inline \\( y = 2x \\).';
    const out = stripVisualDirectives(inp);
    expect(out).toContain('\\[X = 4\\]'); // display math with an uppercase lead survives
    expect(out).toContain('\\( y = 2x \\)');
  });

  test('a reply that is ONLY a directive collapses to empty (caller supplies fallback)', () => {
    expect(stripVisualDirectives('[FUNCTION_GRAPH:fn=x^2]')).toBe('');
  });

  test('is a no-op on plain text', () => {
    expect(stripVisualDirectives('Nice work — what undoes the +7?')).toBe('Nice work — what undoes the +7?');
  });
});
