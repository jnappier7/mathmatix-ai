/**
 * Check-work eval — HERMETIC tier (runs in CI, no keys).
 *
 * Grades the hand-labeled corpus with the grader's CODE stages only (solver +
 * step checker + the two-witness combine), and pins the properties that don't
 * depend on a model:
 *   - code never contradicts a gold label (a mislabeled corpus fails here,
 *     before it can mislead the live tier);
 *   - code alone NEVER falsely accuses a correct problem;
 *   - where the solver can check a problem, even two hostile judges can't
 *     make it call correct work wrong;
 *   - blanks are never solved.
 * The live tier (tests/eval/liveCheckWorkEval.test.js) adds the real judges
 * and the READ stage.
 */

jest.mock('../../../utils/llmGateway', () => ({ callLLMStructured: jest.fn() }));

const { callLLMStructured } = require('../../../utils/llmGateway');
const { gradeTranscription, _internal } = require('../../../utils/pipeline/checkWorkGrader');
const { corpusSheets, realSheets, validateSheet, goldTranscription } = require('./sheets');
const { score, scorecard } = require('./metrics');

const { solverCheck, stepCheck } = _internal;
const SHEETS = corpusSheets();

async function gradeCorpus(opts) {
  const rows = [];
  for (const sheet of SHEETS) {
    const out = await gradeTranscription(goldTranscription(sheet), opts);
    const byLabel = new Map(out.map(p => [p.label, p]));
    for (const gold of sheet.problems) rows.push({ gold, pred: byLabel.get(gold.label) || null, sheet: sheet.id });
  }
  return rows;
}

describe('corpus + real-sheet format', () => {
  test('every corpus sheet is well-formed', () => {
    for (const sheet of SHEETS) expect([sheet.id, validateSheet(sheet)]).toEqual([sheet.id, []]);
  });

  test('the corpus covers correct work, real errors and blanks', () => {
    const golds = SHEETS.flatMap(s => s.problems.map(p => p.gold));
    expect(golds.filter(g => g === 'correct').length).toBeGreaterThanOrEqual(30);
    expect(golds.filter(g => g === 'has_error').length).toBeGreaterThanOrEqual(20);
    expect(golds).toContain('blank');
  });

  test('every real sheet dropped into sheets/ is valid and consented', () => {
    for (const sheet of realSheets()) expect([sheet.id, sheet.invalid]).toEqual([sheet.id, []]);
  });
});

describe('corpus integrity — code never contradicts a gold label', () => {
  const all = SHEETS.flatMap(s => s.problems.map(p => ({ sheet: s.id, p }))).filter(x => x.p.gold !== 'blank');

  test.each(all.map(x => [`${x.sheet} #${x.p.label}`, x.p]))('%s', (_name, p) => {
    const solver = solverCheck(p);
    const steps = stepCheck(p);
    if (p.gold === 'correct') {
      expect(solver.result).not.toBe('mismatch');
      expect(steps.status).not.toBe('broken');
    } else {
      expect(solver.result).not.toBe('match');
    }
  });
});

describe('code-only grading (no judges)', () => {
  let rows;
  let m;
  beforeAll(async () => {
    rows = await gradeCorpus({ judgeModels: [] });
    m = score(rows);
    console.log(scorecard('check-work eval — code only (hermetic)', m));
  });

  test('NEVER falsely accuses a correct problem', () => {
    expect(m.falseAccusations).toEqual([]);
  });

  test('never waves a real error through as correct', () => {
    expect(m.affirmedWrong).toEqual([]);
  });

  test('catches most errors on its own, at the right line (regression floor)', () => {
    expect(m.rates.errorRecall).toBeGreaterThanOrEqual(0.75);
    expect(m.rates.errorLocalization).toBeGreaterThanOrEqual(0.9);
  });

  test('blanks stay blank', () => {
    expect(m.blankSolved).toEqual([]);
    expect(m.missedProblems).toEqual([]);
  });
});

describe('the code overrules the judges wherever it can check', () => {
  // Two judges that call EVERY problem wrong, confidently and in agreement.
  const hostile = async (model, messages) => {
    const labels = [...String(messages[1].content).matchAll(/^Problem (\S+):/gm)].map(x => x[1]);
    return { problems: labels.map(label => ({ label, verdict: 'has_error', errorStep: 'line 1', correctedValue: '0', whatIsRight: '', confidence: 0.99 })) };
  };

  test('false accusations are confined to problems the solver cannot check', async () => {
    callLLMStructured.mockImplementation(hostile);
    const rows = await gradeCorpus({});
    const m = score(rows);
    console.log(scorecard('check-work eval — two hostile judges (hermetic)', m));
    const uncheckable = rows
      .filter(r => r.gold.gold === 'correct' && solverCheck(r.gold).result !== 'match')
      .map(r => `${r.sheet} #${r.gold.label}`);
    for (const fa of m.falseAccusations) {
      expect(uncheckable.some(u => fa.startsWith(u))).toBe(true);
    }
  });
});
