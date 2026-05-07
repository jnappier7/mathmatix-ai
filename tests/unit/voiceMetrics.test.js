// tests/unit/voiceMetrics.test.js
const { newTurn, record, snapshot, aggregate, COST } = require('../../utils/voiceMetrics');

describe('voiceMetrics', () => {
  function fixture(overrides = {}) {
    const t = newTurn('sess-1', 'user-1', 'tutor-1');
    t.t_user_speech_end = 1000;
    t.t_first_audio_chunk = 1300;       // 300ms TTFA
    t.t_first_llm_token = 1100;
    t.t_turn_end = 2000;
    t.sttSecondsBilled = 5;
    t.llmInputTokens = 100;
    t.llmOutputTokens = 50;
    t.ttsChars = 200;
    return Object.assign(t, overrides);
  }

  test('newTurn returns a turn with required fields', () => {
    const t = newTurn('sess', 'u1', 'alex');
    expect(t.sessionId).toBe('sess');
    expect(t.userId).toBe('u1');
    expect(t.tutorId).toBe('alex');
    expect(t.turnId).toMatch(/^\d+-[a-z0-9]+$/);
    expect(t.t_started).toBeGreaterThan(0);
    expect(t.t_user_speech_end).toBeNull();
  });

  test('record computes time-to-first-audio and cost', () => {
    const r = record(fixture());
    expect(r.time_to_first_audio_ms).toBe(300);
    expect(r.time_to_first_token_ms).toBe(100);
    expect(r.estimated_cost_usd).toBeGreaterThan(0);
    // 5s STT + 100in + 50out + 200 chars TTS — all positive contributors
    const expected =
      (5 / 60) * COST.sttPerMinute +
      (100 / 1000) * COST.llmInputPer1KTokens +
      (50 / 1000) * COST.llmOutputPer1KTokens +
      200 * COST.ttsPerCharacter;
    expect(r.estimated_cost_usd).toBeCloseTo(expected, 6);
  });

  test('record handles interrupt timing', () => {
    const t = fixture({
      t_interrupt_requested: 1500,
      t_audio_silenced: 1620,
      abortReason: 'user_barge_in',
    });
    const r = record(t);
    expect(r.interrupt_stop_ms).toBe(120);
    expect(r.abortReason).toBe('user_barge_in');
  });

  test('snapshot returns most recent first', () => {
    record(fixture({ turnId: 'a' }));
    record(fixture({ turnId: 'b' }));
    record(fixture({ turnId: 'c' }));
    const s = snapshot(3);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s[0].turnId).toBe('c');
    expect(s[1].turnId).toBe('b');
    expect(s[2].turnId).toBe('a');
  });

  test('aggregate computes percentiles + interrupt rate', () => {
    for (let i = 0; i < 10; i++) {
      const t = fixture({ t_first_audio_chunk: 1000 + (i + 1) * 50 });
      if (i === 9) {
        t.t_interrupt_requested = 1500;
        t.t_audio_silenced = 1600;
        t.abortReason = 'user_barge_in';
      }
      record(t);
    }
    const a = aggregate();
    expect(a.count).toBeGreaterThanOrEqual(10);
    expect(a.ttfa_ms_p50).toBeGreaterThan(0);
    expect(a.ttfa_ms_p95).toBeGreaterThanOrEqual(a.ttfa_ms_p50);
    expect(a.interrupt_rate).toBeGreaterThan(0);
    expect(a.avg_cost_usd).toBeGreaterThan(0);
  });

  test('aggregate returns count:0 on empty buffer (no eligible turns)', () => {
    // After the prior tests, the ring has data — but we can still verify
    // the empty-shape contract by mocking a fresh require.
    jest.isolateModules(() => {
      const m = require('../../utils/voiceMetrics');
      const a = m.aggregate();
      expect(a.count).toBe(0);
    });
  });
});
