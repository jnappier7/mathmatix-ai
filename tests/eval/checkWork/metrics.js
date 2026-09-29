/**
 * Scoring for the check-work eval.
 *
 * The headline number is the FALSE ACCUSATION RATE: of the problems a student
 * got right, how many did the grader call wrong? Telling a correct student
 * they made a mistake is the failure this grader exists to avoid, so it is
 * the number that gates. Missing a real error is worse for learning but not
 * harmful in the same way; it is reported as recall, not gated as hard.
 *
 * "uncertain" is a legitimate answer (the tutor asks instead of judging), so
 * it counts against coverage, never as a false accusation or a catch.
 */

function squash(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '');
}

/** Did the grader point at the line the gold label says the error is on? */
function locatedError(pred, gold) {
  if (!gold.errorLine || !pred.errorStep) return false;
  const want = squash(gold.errorLine);
  const got = squash(pred.errorStep);
  return got === want || got.includes(want) || want.includes(got);
}

/**
 * @param {Array<{gold: object, pred: object|null, sheet: string}>} rows
 *   gold: a corpus problem; pred: the grader's decided problem (null = the
 *   grader dropped the problem entirely)
 */
function score(rows) {
  const m = {
    problems: rows.length,
    gold: { correct: 0, has_error: 0, blank: 0 },
    falseAccusations: [],     // gold correct → pred has_error
    missedProblems: [],       // grader returned nothing for a problem
    caught: 0,                // gold error → pred has_error
    located: 0,               // …and pointed at the right line
    affirmed: 0,              // gold correct → pred correct
    affirmedWrong: [],        // gold error → pred correct (a real error waved through)
    uncertain: 0,
    blankSolved: [],          // gold blank → anything but blank
    byTag: {},
  };

  for (const { gold, pred, sheet } of rows) {
    m.gold[gold.gold] = (m.gold[gold.gold] || 0) + 1;
    const where = `${sheet} #${gold.label}`;
    const status = pred ? pred.status : 'missing';
    if (!pred) m.missedProblems.push(where);

    for (const tag of gold.tags || []) {
      const t = (m.byTag[tag] = m.byTag[tag] || { n: 0, right: 0 });
      t.n++;
      const right = gold.gold === 'correct' ? status === 'correct'
        : gold.gold === 'has_error' ? status === 'has_error'
          : status === 'blank';
      if (right) t.right++;
    }

    if (gold.gold === 'blank') {
      if (status !== 'blank') m.blankSolved.push(`${where} → ${status}`);
      continue;
    }
    if (status === 'uncertain') m.uncertain++;
    if (gold.gold === 'correct') {
      if (status === 'correct') m.affirmed++;
      if (status === 'has_error') m.falseAccusations.push(`${where} (${gold.problem}; answered ${gold.answer}) — flagged "${pred.errorStep}" via ${pred.source}`);
    } else {
      if (status === 'has_error') {
        m.caught++;
        if (locatedError(pred, gold)) m.located++;
      }
      if (status === 'correct') m.affirmedWrong.push(`${where} (${gold.problem}; answered ${gold.answer})`);
    }
  }

  const attempted = m.gold.correct + m.gold.has_error;
  const decided = attempted - m.uncertain;
  m.rates = {
    falseAccusationRate: m.gold.correct ? m.falseAccusations.length / m.gold.correct : 0,
    errorRecall: m.gold.has_error ? m.caught / m.gold.has_error : 0,
    errorLocalization: m.caught ? m.located / m.caught : 0,
    affirmationRate: m.gold.correct ? m.affirmed / m.gold.correct : 0,
    wavedThroughRate: m.gold.has_error ? m.affirmedWrong.length / m.gold.has_error : 0,
    coverage: attempted ? decided / attempted : 0,
  };
  return m;
}

/** Transcription accuracy: did the READ stage get the student's answer right? */
function readAccuracy(rows) {
  let n = 0, ok = 0;
  const misreads = [];
  for (const { gold, pred, sheet } of rows) {
    if (gold.gold === 'blank' || !gold.answer) continue;
    n++;
    if (pred && squash(pred.studentAnswer) === squash(gold.answer)) ok++;
    else misreads.push(`${sheet} #${gold.label}: wrote "${gold.answer}", read "${pred ? pred.studentAnswer : '(missing)'}"`);
  }
  return { n, ok, rate: n ? ok / n : 0, misreads };
}

const pct = x => `${(x * 100).toFixed(1)}%`;

function scorecard(title, m, read) {
  const lines = [
    `── ${title} ──`,
    `problems ${m.problems}  (correct ${m.gold.correct}, errors ${m.gold.has_error}, blank ${m.gold.blank})`,
    `FALSE ACCUSATIONS   ${m.falseAccusations.length}/${m.gold.correct}  ${pct(m.rates.falseAccusationRate)}   ← gate`,
    `errors caught       ${m.caught}/${m.gold.has_error}  ${pct(m.rates.errorRecall)}   located at the right line ${pct(m.rates.errorLocalization)}`,
    `errors waved through ${m.affirmedWrong.length}/${m.gold.has_error}  ${pct(m.rates.wavedThroughRate)}`,
    `correct affirmed    ${m.affirmed}/${m.gold.correct}  ${pct(m.rates.affirmationRate)}`,
    `coverage (decided)  ${pct(m.rates.coverage)}   uncertain ${m.uncertain}`,
    `blanks solved       ${m.blankSolved.length}`,
  ];
  if (read) lines.push(`answers read right  ${read.ok}/${read.n}  ${pct(read.rate)}`);
  const list = (h, xs) => { if (xs.length) lines.push(h, ...xs.map(x => `  - ${x}`)); };
  list('false accusations:', m.falseAccusations);
  list('errors waved through:', m.affirmedWrong);
  list('blanks not left blank:', m.blankSolved);
  list('problems the grader dropped:', m.missedProblems);
  if (read) list('misreads:', read.misreads);
  const weak = Object.entries(m.byTag).filter(([, t]) => t.right < t.n).map(([k, t]) => `${k} ${t.right}/${t.n}`);
  if (weak.length) lines.push(`tags below 100%: ${weak.join(', ')}`);
  return lines.join('\n');
}

module.exports = { score, readAccuracy, scorecard, locatedError, squash };
