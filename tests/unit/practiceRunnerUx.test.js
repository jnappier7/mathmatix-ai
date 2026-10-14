/**
 * Practice-test runner UX fixes from the 2026-10-13 prod QA pass (Phase 5).
 *
 * jest has no DOM here, so the pure helpers are driven directly and the
 * DOM-only behaviour is pinned at the source (the runner's markup is built
 * from template strings in public/js/act-test.js).
 */
const fs = require('fs');
const path = require('path');

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const ROOT = path.join(__dirname, '..', '..');
const RUNNER = fs.readFileSync(path.join(ROOT, 'public', 'js', 'act-test.js'), 'utf8');

function loadRunner() {
  const win = { addEventListener() {} };
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  new Function('window', 'document', 'location', 'localStorage', RUNNER)(win, doc, { search: '' }, { getItem: () => null });
  return win;
}
const win = loadRunner();

describe('rushed attempts: "Not a reliable estimate"', () => {
  const { isRushed, RUSHED_FRACTION } = require('../../utils/rushedAttempt');

  test('under a quarter of the limit is rushed; a quarter or more is not', () => {
    expect(RUSHED_FRACTION).toBe(0.25);
    expect(isRushed(4 * 60000, 70)).toBe(true);           // 4 of 70 min
    expect(isRushed(17.4 * 60000, 70)).toBe(true);
    expect(isRushed(17.5 * 60000, 70)).toBe(false);       // exactly a quarter
    expect(isRushed(40 * 60000, 50)).toBe(false);
  });

  test('no duration or no limit is never called rushed', () => {
    expect(isRushed(null, 70)).toBe(false);
    expect(isRushed(60000, null)).toBe(false);
    expect(isRushed(60000, 0)).toBe(false);
    expect(isRushed(-5, 70)).toBe(false);
  });

  test('the guest report carries the flag (the teacher view averages without it)', () => {
    const { _internals } = require('../../routes/actTest');
    const started = new Date('2026-10-13T10:00:00Z');
    const session = (mins) => ({
      testId: 'act-math',
      startedAt: started,
      completedAt: new Date(started.getTime() + mins * 60000),
      timeLimitMinutes: 50,
      items: [], responses: [],
    });
    const tally = { raw: 0, total: 45, scaled: null, byCategory: {} };
    expect(_internals.buildGuestReport(session(5), tally)).toMatchObject({ durationMinutes: 5, rushed: true });
    expect(_internals.buildGuestReport(session(30), tally)).toMatchObject({ durationMinutes: 30, rushed: false });
  });

  test('the results screen says so, with the minutes', () => {
    const note = win.__actRushedNote;
    expect(note({ rushed: true, durationMinutes: 4, timeLimitMinutes: 70 })).toBe('Not a reliable estimate — you finished in 4 minutes.');
    expect(note({ rushed: true, durationMinutes: 1, timeLimitMinutes: 70 })).toMatch(/in 1 minute\.$/);
    expect(note({ rushed: true, durationMinutes: 0, timeLimitMinutes: 70 })).toMatch(/less than a minute/);
    expect(note({ rushed: false, durationMinutes: 4, timeLimitMinutes: 70 })).toBeNull();
    // An older server without the flag: judged from the minutes.
    expect(note({ durationMinutes: 6, timeLimitMinutes: 45 })).toMatch(/Not a reliable estimate/);
    expect(note({ durationMinutes: 30, timeLimitMinutes: 45 })).toBeNull();
  });
});

describe('grid-in: mixed numbers', () => {
  const hint = win.__actMixedNumberHint;

  test('a mixed number gets a hint, with the student\'s own number converted', () => {
    expect(hint('1 1/2')).toBe("Mixed numbers aren't allowed — enter 3/2 or 1.5.");
    expect(hint('2 1/3')).toBe("Mixed numbers aren't allowed — enter 7/3.");
    expect(hint('-1 3/4')).toBe("Mixed numbers aren't allowed — enter -7/4 or -1.75.");
  });

  test('the hint appears the moment the space is typed, before the merge', () => {
    expect(hint('1 ')).toMatch(/Mixed numbers aren't allowed — enter 3\/2 or 1\.5/);
    expect(hint('1 1')).toMatch(/Mixed numbers aren't allowed/);
  });

  test('ordinary entries get no hint', () => {
    for (const v of ['', '3', '3/2', '1.5', '-2', '.75', '11/2']) expect(hint(v)).toBeNull();
  });

  test('the box has an accessible name and announces the hint', () => {
    expect(RUNNER).toMatch(/aria-label="Your answer to question \$\{this\._num\(this\.pos\)\}"/);
    expect(RUNNER).toMatch(/id="actt-gihint" role="status" aria-live="polite"/);
  });
});

describe('runner chrome', () => {
  test('a five-minute warning is announced (role=alert), once per clock', () => {
    expect(RUNNER).toMatch(/id="actt-timewarn" role="alert"/);
    expect(RUNNER).toMatch(/remain <= 300000 && this\._warnedFor !== this\.deadline/);
  });

  test('the timer is blanked before a test builds, so a stale clock never shows', () => {
    const begin = RUNNER.slice(RUNNER.indexOf('    async _begin() {'), RUNNER.indexOf('Building your practice test'));
    expect(begin).toMatch(/this\._clearTimer\(\)/);
    expect(begin).not.toMatch(/actt-timer'\)\.style\.display = ''/);
  });

  test('the × asks before leaving a running test, and reopening offers Resume', () => {
    expect(RUNNER).toMatch(/addEventListener\('click', \(\) => this\._requestClose\(\)\)/);
    expect(RUNNER).toMatch(/role="alertdialog"/);
    expect(RUNNER).toMatch(/Resume test \(\$\{answered\} answered, \$\{fmtClock\(ov\.remainingSeconds\)\} left\)/);
    // No native confirm(): a timed flow must not block on a browser dialog.
    expect(RUNNER).not.toMatch(/[^.\w]confirm\(/);
  });

  test('the reference sheet floats and labels its figures', () => {
    expect(RUNNER).toMatch(/\.actt-refpanel\{position:fixed/);
    const sheet = RUNNER.slice(RUNNER.indexOf('const REFERENCE_SHEET_HTML'), RUNNER.indexOf('function escapeHtml'));
    const figures = sheet.match(/REF_FIG\('/g) || [];
    expect(figures.length).toBeGreaterThanOrEqual(11);
    // The letters a student has to map onto the figure are drawn on it.
    for (const label of ['>r<', '>ℓ<', '>w<', '>h<', '>b<', '>x√3<', '>2x<', '>s√2<', '>30°<', '>60°<']) {
      expect(sheet).toContain(label);
    }
  });

  test('Desmos on a phone sits above the nav bar, and its keypad is touch-only', () => {
    expect(RUNNER).toMatch(/\.actt-desmos\{position:fixed;left:0;right:0;bottom:var\(--actt-foot-h/);
    expect(RUNNER).toMatch(/keypad: isTouchDevice\(\)/);
    expect(RUNNER).not.toMatch(/keypad: true/);
  });
});

describe('/testprep hub copy', () => {
  test('PreACT is labeled for 9th and 10th graders', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'testprep.html'), 'utf8');
    expect(html).toMatch(/<h3>PreACT<\/h3><span class="tp-who">9th&ndash;10th grade<\/span>/);
  });
});

describe('the localStorage key named "undefined"', () => {
  // public/js/landing.js greets on load: showTrialChat() → saveTrialState()
  // ran while `var TRIAL_STORAGE_KEY` was hoisted but not yet assigned, so
  // the trial chat state ({"tutorId":"mr-nappier",…}) landed under the key
  // "undefined".
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'landing.js'), 'utf8');

  test('the key is assigned before the first save can run', () => {
    const assigned = src.indexOf("var TRIAL_STORAGE_KEY = 'mathmatix_trial_chat'");
    const firstCall = src.search(/^\s*showTrialChat\(\);/m);
    expect(assigned).toBeGreaterThan(-1);
    expect(firstCall).toBeGreaterThan(-1);
    expect(assigned).toBeLessThan(firstCall);
    expect(src.match(/var TRIAL_STORAGE_KEY\b/g)).toHaveLength(1);
  });

  test('behaviourally: the greeting-time save writes the real key', () => {
    // Run just the slice of the file that matters with a fake storage.
    const store = {};
    const ls = { setItem: (k, v) => { store[k] = v; }, getItem: (k) => (k in store ? store[k] : null), removeItem: (k) => { delete store[k]; } };
    store.undefined = JSON.stringify({ tutorId: 'mr-nappier', history: [], turnCount: 1, timestamp: 1 });
    const head = src.slice(src.indexOf("'use strict';") + "'use strict';".length, src.indexOf('/* ── Pi Day Countdown'));
    const saveFn = src.slice(src.indexOf('  function saveTrialState() {'), src.indexOf('  function clearTrialState() {'));
    new Function('localStorage', `${head}\nvar selectedTutorId = 'mr-nappier', chatHistory = [], clientTurnCount = 0;\n${saveFn}\nsaveTrialState();`)(ls);
    expect(store).not.toHaveProperty('undefined');     // the stray copy is swept too
    expect(JSON.parse(store.mathmatix_trial_chat).tutorId).toBe('mr-nappier');
  });
});
