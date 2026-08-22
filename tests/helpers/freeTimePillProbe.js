/**
 * Drives the free-time pill (public/js/modules/billing.js) through the urgency
 * levels a student actually walks down — comfortable → under five minutes → out
 * of time — and reports what the DOM ends up looking like. Not a test; a probe
 * the test asserts against.
 *
 * Runs as its own Node process for the same reason as i18nRenderProbe.js:
 * jsdom@27 pulls an ESM-only transitive dep that Jest's CommonJS transform
 * can't parse, so `require('jsdom')` throws inside a Jest worker but is fine
 * under plain Node.
 *
 * billing.js is an ES module the browser loads directly (chat.html scripts it
 * with type="module"); jsdom evaluates it as a classic script, so the import
 * and export keywords are stripped first. Nothing else about the source is
 * touched — the function under test is the shipped one.
 *
 * Usage: node freeTimePillProbe.js   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(
    path.join(__dirname, '../../public/js/modules/billing.js'), 'utf8'
);
const classic = src
    .replace(/^import .*$/gm, '')
    .replace(/^export\s+/gm, '');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://www.mathmatix.ai/chat.html',
});
const win = dom.window;
win.showToast = () => {};
win.csrfFetch = () => Promise.reject(new Error('offline'));
// No server here; the upgrade modal's promo lookup is best-effort and swallows
// the rejection, so it still renders.
win.fetch = () => Promise.reject(new Error('offline'));
win.eval(classic);

const pill = () => win.document.getElementById('free-time-indicator');
const snapshot = () => {
    const el = pill();
    return {
        visible: !!el && el.style.display !== 'none',
        bodyReservesSpace: win.document.body.classList.contains('mm-has-time-pill'),
        hasDismiss: !!(el && el.querySelector('#mm-time-dismiss')),
        text: el ? el.textContent.replace(/\s+/g, ' ').trim() : null,
    };
};
const update = (secondsRemaining, extra = {}) =>
    win.updateFreeTimeIndicator({ secondsRemaining, limitReached: secondsRemaining <= 0, ...extra });
const clickDismiss = () => {
    const x = pill().querySelector('#mm-time-dismiss');
    x.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
};

const result = {};

// Comfortable: 20 minutes left.
update(1200);
result.comfortable = snapshot();

// Dismissed while comfortable, then a later turn still comfortable: stays gone.
clickDismiss();
result.comfortableAfterDismiss = snapshot();
update(1100);
result.comfortableStaysDismissed = snapshot();

// Escalating past the five-minute mark retires that dismissal — this is the
// state in the bug report (3 min left), and it must arrive dismissable.
update(180);
result.low = snapshot();
clickDismiss();
result.lowAfterDismiss = snapshot();
update(150);
result.lowStaysDismissed = snapshot();

// Running out escalates again: back it comes, still dismissable.
update(0);
result.out = snapshot();
clickDismiss();
result.outAfterDismiss = snapshot();

// Buying time / a quota reset de-escalates, which also retires the dismissal.
update(1800);
result.afterReset = snapshot();

// A dismissal must not survive into a state the student never saw dismissed.
result.storageKeyAfterReset = win.sessionStorage.getItem('mm_time_pill_level_dismissed');

// The nudge is never lost by dismissing: clicking the pill body (not the ×)
// still opens the upgrade modal, at every level.
(async () => {
    pill().dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => win.setTimeout(r, 50));
    result.pillBodyOpensUpgradeModal = !!win.document.getElementById('upgrade-modal');

    process.stdout.write(JSON.stringify(result, null, 2));
})();
