// tests/unit/pipelinePayloadGate.test.js
//
// QA handoff 2026-10-14 §4: every /api/chat response shipped `_pipeline` —
// tutor-quality grades, mood/fatigue, knowledge estimates, the plan target —
// to the student's browser, and nothing client-side reads it. It now ships
// only to an admin who asks with ?debug=1.

jest.mock('../../utils/logger', () => {
  const s = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  s.child = jest.fn().mockReturnValue(s);
  return s;
});
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const fs = require('fs');
const path = require('path');
const { debugPipelinePayload } = require('../../routes/chat');

const PR = { _pipeline: { action: 'scaffold', grade: { turnScore: 0.3 }, sessionMood: { fatigueSignal: true } } };
const student = { _id: 's', role: 'student', roles: ['student'] };
const admin = { _id: 'a', role: 'student', roles: ['student', 'admin'] };

test.each([
  ['student, no flag', { user: student, query: {} }, false],
  ['student asking for debug', { user: student, query: { debug: '1' } }, false],
  ['admin without the flag', { user: admin, query: {} }, false],
  ['admin with ?debug=1', { user: admin, query: { debug: '1' } }, true],
])('%s', (_label, req, ships) => {
  const out = debugPipelinePayload(req, PR);
  expect('_pipeline' in out).toBe(ships);
});

test('the response object spreads the gate, never the raw field', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');
  expect(src).not.toMatch(/_pipeline: pipelineResult\._pipeline,\n\s*\};/);
  expect(src).toMatch(/\.\.\.debugPipelinePayload\(req, pipelineResult\),/);
});
