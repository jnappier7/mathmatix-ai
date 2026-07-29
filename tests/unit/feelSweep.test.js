/**
 * The "feel sweep" (owner, 2026-07-29): honest thinking-status stages and the
 * session-roll recap card. The XP-chip suppression and coin awards live in
 * xpEngine.test.js and client code respectively.
 */
const { sessionRecapOf } = require('../../utils/activeConversation');

describe('sessionRecapOf — the closure beat is built from what really happened', () => {
  const conv = (over = {}) => ({
    currentTopic: 'Volume of Rectangular Prisms',
    activeMinutes: 23,
    messages: [
      { role: 'user', content: '12' },
      { role: 'assistant', content: 'right!', problemResult: 'correct' },
      { role: 'user', content: '9' },
      { role: 'assistant', content: 'not quite', problemResult: 'incorrect' },
      { role: 'assistant', content: 'and this one?', problemResult: 'correct' },
    ],
    ...over,
  });

  test('counts verified-correct solves, carries topic and minutes', () => {
    expect(sessionRecapOf(conv())).toEqual({ topic: 'Volume of Rectangular Prisms', solved: 2, minutes: 23 });
  });

  test('null for empty or workless sessions — no hollow recap cards', () => {
    expect(sessionRecapOf(null)).toBeNull();
    expect(sessionRecapOf({ messages: [] })).toBeNull();
    expect(sessionRecapOf(conv({ activeMinutes: 0, messages: [{ role: 'user', content: 'hi' }] }))).toBeNull();
  });

  test('student messages never count as solves', () => {
    const r = sessionRecapOf(conv({ messages: [{ role: 'user', content: 'x', problemResult: 'correct' }], activeMinutes: 5 }));
    expect(r.solved).toBe(0);
    expect(r.minutes).toBe(5);
  });
});

describe('thinking-status stages are wired end to end', () => {
  const fs = require('fs');
  const path = require('path');

  test('the pipeline emits real stage markers on the streaming path only', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
    expect(src).toContain("if (verificationCandidate) emitStatus('checking')");
    expect(src).toContain("emitStatus('writing')");
    expect(src).toMatch(/if \(!ctx\.stream \|\| !ctx\.res\) return;/);
  });

  test('the client maps stages to persona-aware labels and resets per send', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../public/js/script.js'), 'utf8');
    expect(src).toContain("event.type === 'status' && event.stage");
    expect(src).toContain('setThinkingStatus(event.stage)');
    expect(src).toContain('is checking your work');
    expect(src).toContain('if (show) setThinkingStatus(null)');
  });

  test('the XP chip renders only on earned turns (tier 2/3), never tier-1 participation', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../public/js/script.js'), 'utf8');
    expect(src).toContain('if (xp.tier2 > 0 || xp.tier3 > 0) {');
    expect(src).not.toMatch(/Inline XP attribution chip[\s\S]{0,400}if \(xp\.total > 0\)/);
  });
});
