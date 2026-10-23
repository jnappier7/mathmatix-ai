/**
 * PRACTICE — what a teacher can see about solo drill rounds (models/drillResult.js).
 *
 * Pure shaping, no database and no Express, so the rules below can be tested directly.
 *
 * ⚠️ Every number here is SELF-REPORTED. Rounds are played and scored in the browser, so a
 * score is whatever the page said it was. That is why this module reports EFFORT — how many
 * rounds, how recently, whether the score moved — and deliberately offers no class average,
 * no ranking and no pass/fail. Those are the shapes that get read as assessment, and this
 * data cannot carry that weight. See the header of models/drillResult.js.
 */

/** drill id -> the name a teacher would recognise, from the hub catalog. */
function gameNames(HUBS) {
  const out = {};
  for (const hub of Object.values(HUBS || {})) {
    for (const g of hub.games || []) out[g.drill] = g.name;
  }
  return out;
}

const byTime = (a, b) => new Date(a.playedAt || 0) - new Date(b.playedAt || 0);

/**
 * One student's practice, folded by game.
 * @param {Array} rows that student's DrillResult documents, any order
 * @returns {{rounds:number, minutes:number, lastAt:Date|null, games:Array}}
 */
function summarizeStudent(rows) {
  const list = [...(rows || [])].sort(byTime);
  const byGame = new Map();
  let seconds = 0;

  for (const r of list) {
    seconds += Number(r.seconds) || 0;
    const key = r.drill;
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(r);
  }

  const games = [...byGame.entries()].map(([drill, rs]) => {
    const first = rs[0];
    const last = rs[rs.length - 1];
    return {
      drill,
      rounds: rs.length,
      best: Math.max(...rs.map((r) => r.score || 0)),
      first: first.score || 0,
      last: last.score || 0,
      // Movement needs two rounds to mean anything; one round is a starting
      // point, not a trend, and showing "+0" for it would read as "no progress".
      delta: rs.length > 1 ? (last.score || 0) - (first.score || 0) : null,
      lastAt: last.playedAt || null,
    };
  }).sort((a, b) => b.rounds - a.rounds);

  return {
    rounds: list.length,
    minutes: Math.round(seconds / 60),
    lastAt: list.length ? list[list.length - 1].playedAt : null,
    games,
  };
}

/**
 * A class: every enrolled student, including the ones who have not practised —
 * which is usually the row a teacher is actually looking for.
 * @param {Array} students [{ id, name }] from the roster, already name-sorted upstream or not
 * @param {Array} rows every DrillResult for those students
 */
function summarizeClass(students, rows) {
  const byUser = new Map();
  for (const r of rows || []) {
    const k = String(r.userId);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k).push(r);
  }

  const out = (students || []).map((s) => ({
    id: String(s.id),
    name: s.name,
    ...summarizeStudent(byUser.get(String(s.id)) || []),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const practised = out.filter((s) => s.rounds > 0);
  return {
    students: out,
    totals: {
      students: out.length,
      practised: practised.length,
      notPractised: out.length - practised.length,
      rounds: out.reduce((n, s) => n + s.rounds, 0),
      // Rounded ONCE, from raw seconds. Summing each student's already-rounded
      // minutes drifts: three students at 90s each is 4.5 minutes, but reports
      // as 6 if every 1.5 is rounded up first.
      minutes: Math.round((rows || []).reduce((n, r) => n + (Number(r.seconds) || 0), 0) / 60),
    },
  };
}

module.exports = { gameNames, summarizeStudent, summarizeClass };
