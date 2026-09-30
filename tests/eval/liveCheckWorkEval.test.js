/**
 * Check-work eval — LIVE tier (opt-in: RUN_LLM_EVAL=1 + a real OPENAI_API_KEY).
 *
 *   npm run test:eval:checkwork
 *
 * Two measurements, kept apart so a bad number says WHICH stage is bad:
 *   A. GRADING  — the real judges + code on the GOLD transcription of every
 *                 corpus sheet (reading is assumed perfect).
 *   B. END TO END — the full read-then-grade pipeline on images: every corpus
 *                 sheet rendered to a handwriting-style JPEG, plus every real
 *                 sheet in tests/eval/checkWork/sheets/. Adds READ accuracy.
 *
 * Gate: false accusations (correct work called wrong) at or below
 * CHECK_WORK_EVAL_MAX_FALSE_ACCUSATION (default 0). Everything else is
 * reported, not gated. A JSON report lands in tests/eval/checkWork/reports/.
 *
 * Anthropic (judge 2) and Mathpix keys are optional: without them that
 * witness is simply absent, and the report says so.
 */

const fs = require('fs');
const path = require('path');
const { liveEvalGate, warnIfBlocked, isRealKey } = require('./liveCreds');

const gate = liveEvalGate('OPENAI_API_KEY');
warnIfBlocked(gate);
const d = gate.run ? describe : describe.skip;

const MAX_FA = Number(process.env.CHECK_WORK_EVAL_MAX_FALSE_ACCUSATION || 0);
const REPORT_DIR = path.join(__dirname, 'checkWork', 'reports');
const RENDER_DIR = path.join(__dirname, 'checkWork', '.rendered');

d('check-work eval — live', () => {
  jest.setTimeout(20 * 60 * 1000);

  const { gradeSheet, gradeTranscription } = require('../../utils/pipeline/checkWorkGrader');
  const { corpusSheets, realSheets, realSheetImages, goldTranscription, renderSheet } = require('./checkWork/sheets');
  const { score, readAccuracy, scorecard } = require('./checkWork/metrics');

  const report = {
    ranAt: new Date().toISOString(),
    witnesses: {
      judgeOpenAI: true,
      judgeAnthropic: isRealKey(process.env.ANTHROPIC_API_KEY),
      mathpix: isRealKey(process.env.MATHPIX_APP_ID) && isRealKey(process.env.MATHPIX_APP_KEY),
    },
  };

  const join = (sheet, out) => {
    const byLabel = new Map((out || []).map(p => [String(p.label), p]));
    return sheet.problems.map(gold => ({ gold, pred: byLabel.get(gold.label) || null, sheet: sheet.id }));
  };

  afterAll(() => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const body = JSON.stringify(report, null, 2);
    fs.writeFileSync(path.join(REPORT_DIR, 'latest.json'), body);
    fs.writeFileSync(path.join(REPORT_DIR, `${report.ranAt.replace(/[:.]/g, '-')}.json`), body);
  });

  test('A. grading on gold transcriptions', async () => {
    const rows = [];
    for (const sheet of corpusSheets()) {
      const out = await gradeTranscription(goldTranscription(sheet), { studentText: 'Can you check my work?' });
      rows.push(...join(sheet, out));
    }
    // A judge that can't be reached leaves the code stages grading alone —
    // which would report code-only numbers as if they were the judges'.
    const judged = rows.some(r => r.pred && (r.pred.evidence || []).some(e => e.startsWith('judge')));
    if (!judged) throw new Error('INFRA: no judge answered a single problem — check OPENAI_API_KEY and account credit. This is not a grading result.');
    const m = score(rows);
    report.grading = m;
    console.log(scorecard(`check-work eval — A. grading (judges: ${report.witnesses.judgeAnthropic ? 'gpt-4o + claude' : 'gpt-4o only'})`, m));
    expect(m.missedProblems).toEqual([]);
    expect(m.blankSolved).toEqual([]);
    expect(m.rates.falseAccusationRate).toBeLessThanOrEqual(MAX_FA);
  });

  test('B. end to end on sheet images (rendered corpus + real sheets)', async () => {
    fs.mkdirSync(RENDER_DIR, { recursive: true });
    const rows = [];
    const failedReads = [];
    const run = async (sheet, images) => {
      const out = await gradeSheet({ images, studentText: 'Can you check my work?' });
      if (!out) failedReads.push(sheet.id);
      rows.push(...join(sheet, out));
    };
    for (const sheet of corpusSheets()) {
      const { buffer, image } = await renderSheet(sheet);
      fs.writeFileSync(path.join(RENDER_DIR, `${sheet.id}.jpg`), buffer);
      await run(sheet, [image]);
    }
    const real = realSheets().filter(s => !s.invalid.length);
    for (const sheet of real) await run(sheet, realSheetImages(sheet));

    if (failedReads.length === corpusSheets().length + real.length) {
      throw new Error('INFRA: every READ call failed — check OPENAI_API_KEY and account credit. This is not a grading result.');
    }
    const m = score(rows);
    const read = readAccuracy(rows);
    report.endToEnd = { ...m, read, failedReads, realSheets: real.length };
    console.log(scorecard(`check-work eval — B. end to end (${corpusSheets().length} rendered + ${real.length} real sheets; mathpix ${report.witnesses.mathpix ? 'on' : 'off'})`, m, read));
    if (failedReads.length) console.log(`READ failed (grader would fall back to single-pass): ${failedReads.join(', ')}`);
    expect(m.rates.falseAccusationRate).toBeLessThanOrEqual(MAX_FA);
  });
});
