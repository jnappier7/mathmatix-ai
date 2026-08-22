// tests/unit/freeTimePill.test.js
//
// Two regressions in the free-time pill, reported together from a phone that
// showed "3 min AI time left" as a full-height panel with no way to close it:
//
//   1. LAYOUT. billing.js docks the pill to the TOP on phones, but section 18 of
//      css/mobile-fixes.css still pinned `bottom` from when the pill lived above
//      the input. A fixed element given both a top and a bottom offset does not
//      move — it STRETCHES between them, so the pill grew into a panel covering
//      the tutor, the conversation and the toolbar.
//   2. DISMISSAL. The × was rendered only in the comfortable branch. Under five
//      minutes the pill was deliberately undismissable so the upgrade nudge
//      couldn't be hidden — which made the tallest, most intrusive version of it
//      (extra CTA line + "Resets in…" line) the one version you were stuck with,
//      exactly when bug 1 had it covering the screen.
//
// The layout half is asserted statically against the stylesheets: jsdom's
// cascade doesn't evaluate media queries, and the defect WAS the declaration.
// The dismissal half runs the real function in a real DOM via
// tests/helpers/freeTimePillProbe.js (spawned — see that file for why).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const readPublic = (rel) =>
    fs.readFileSync(path.join(__dirname, '../../public', rel), 'utf8');

/** Pull the body of the first `#free-time-indicator { … }` rule inside a
 *  max-width (phone) media query. */
function phoneRuleFor(css) {
    const blocks = [...css.matchAll(/@media[^{]*max-width[^{]*\{([\s\S]*?)\n\}/g)]
        .map((m) => m[1])
        .filter((b) => b.includes('#free-time-indicator'));
    expect(blocks.length).toBeGreaterThan(0);
    const rule = blocks
        .map((b) => b.match(/#free-time-indicator\s*\{([\s\S]*?)\}/))
        .find(Boolean);
    expect(rule).toBeTruthy();
    return rule[1];
}

describe('free-time pill — phone positioning', () => {
    const billing = readPublic('js/modules/billing.js');
    const mobileFixes = readPublic('css/mobile-fixes.css');

    it('docks to the top on phones', () => {
        expect(phoneRuleFor(billing)).toMatch(/top:\s*calc\(env\(safe-area-inset-top/);
    });

    it('never pins a top and a bottom offset at once — that stretches it into a panel', () => {
        for (const [name, css] of [['billing.js', billing], ['mobile-fixes.css', mobileFixes]]) {
            const rule = phoneRuleFor(css);
            const bottom = rule.match(/bottom:\s*([^;]+);/);
            if (bottom) {
                expect(`${name}: ${bottom[1].trim()}`).toMatch(/auto/);
            }
        }
    });

    it('keeps mobile-fixes.css able to win, since it is the !important one', () => {
        // billing.js sets `top` without !important. If mobile-fixes.css ever
        // reintroduces an !important bottom, billing.js cannot correct it from
        // its own stylesheet — which is how this shipped.
        expect(phoneRuleFor(mobileFixes)).toMatch(/bottom:\s*auto\s*!important/);
    });
});

describe('free-time pill — dismissal', () => {
    let probe;
    beforeAll(() => {
        const out = execFileSync(
            process.execPath,
            [path.join(__dirname, '../helpers/freeTimePillProbe.js')],
            { encoding: 'utf8', timeout: 60000 }
        );
        probe = JSON.parse(out);
    });

    it('offers a × at every urgency level, not just when time is comfortable', () => {
        expect(probe.comfortable).toMatchObject({ visible: true, hasDismiss: true });
        expect(probe.low).toMatchObject({ visible: true, hasDismiss: true });
        expect(probe.out).toMatchObject({ visible: true, hasDismiss: true });
        expect(probe.low.text).toContain('3 min');
    });

    it('hides the pill and releases the space the layout reserved for it', () => {
        for (const state of ['comfortableAfterDismiss', 'lowAfterDismiss', 'outAfterDismiss']) {
            expect(probe[state]).toMatchObject({ visible: false, bodyReservesSpace: false });
        }
    });

    it('stays dismissed across turns that do not change the urgency level', () => {
        expect(probe.comfortableStaysDismissed.visible).toBe(false);
        expect(probe.lowStaysDismissed.visible).toBe(false);
    });

    it('comes back when the level escalates, so the warning is never lost', () => {
        // dismissed at "comfortable" -> crossing under 5 min shows it again
        expect(probe.low.visible).toBe(true);
        // dismissed at "low" -> running out shows it again
        expect(probe.out.visible).toBe(true);
    });

    it('comes back on de-escalation too, and clears the stored dismissal', () => {
        expect(probe.afterReset.visible).toBe(true);
        expect(probe.storageKeyAfterReset).toBeNull();
    });

    it('still opens the upgrade modal when the pill body is clicked', () => {
        expect(probe.pillBodyOpensUpgradeModal).toBe(true);
    });
});
