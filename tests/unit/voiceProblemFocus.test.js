// tests/unit/voiceProblemFocus.test.js
//
// Owner report 2026-10-13, P0: in a fraction problem Ms. Maria jumped to a
// completely different equation mid-solve without noticing, and on another
// call invented an equation before the student had given her one.
//
// Root cause: voice history stores spoken prose only, so the model could not
// see which equation it was working; and when its board DID switch problems,
// the ledger filed the new problem's lines under the old one. These pin the
// continuity anchor and the ledger's handling of a switch.

const { buildVoiceFocusBlock, VoiceSession } = require('../../utils/voiceSession');
const {
    applyTurnToLedger,
    promoteLeadingResolveToPose,
    promoteSwitchedProblemToPose,
    dedupeCumulativeResolves,
} = require('../../utils/pipeline/boardLedger');
const { voiceToBoardCommands } = require('../../public/js/living-workspace/dom/voiceBoardTranslate');

describe('buildVoiceFocusBlock — the problem in focus is restated every turn', () => {
    test('anchors on the Given and lists the steps in order', () => {
        const block = buildVoiceFocusBlock([
            { label: 'Given', latex: '\\frac{6x}{3} = 4' },
            { label: 'Simplify', latex: '2x = 4' },
        ], null);
        expect(block).toMatch(/working on: \\frac\{6x\}\{3\} = 4/);
        expect(block).toMatch(/2x = 4/);
        expect(block).toMatch(/STAY ON THIS PROBLEM/);
    });

    test('with no problem set, forbids inventing one and demands an empty board', () => {
        const block = buildVoiceFocusBlock([], null);
        expect(block).toMatch(/NO PROBLEM SET YET/);
        expect(block).toMatch(/Do NOT invent/);
        expect(block).toMatch(/math array is \[\]/);
    });

    test('a leftover chat problem is offered, not assumed', () => {
        const ledger = { current: { problemTex: '3x + 1 = 10', steps: [] }, completed: [] };
        const block = buildVoiceFocusBlock([], ledger);
        expect(block).toMatch(/3x \+ 1 = 10/);
        expect(block).toMatch(/Ask whether they want to keep working it/);
    });

    test('for the chat orb the ledger IS the live board', () => {
        const ledger = {
            current: { problemTex: '3x + 1 = 10', steps: [{ action: 'resolve', tex: '3x = 9' }] },
            completed: [],
        };
        const block = buildVoiceFocusBlock([], ledger, { ledgerIsLive: true });
        expect(block).toMatch(/working on: 3x \+ 1 = 10/);
        expect(block).toMatch(/3x = 9/);
    });

    test('narration-only steps do not count as a problem', () => {
        expect(buildVoiceFocusBlock([{ text: 'Let us think' }], null)).toMatch(/NO PROBLEM SET YET/);
    });
});

describe('voice board ghost never teaches a tag voice cannot consume', () => {
    test('the POINTING (<BOARD_POINT/>) instruction is removed', () => {
        // WORK_BOARD on is the configuration where the chat ghost teaches it.
        const prev = process.env.WORK_BOARD;
        process.env.WORK_BOARD = 'on';
        try {
            const ghost = VoiceSession.prototype._boardGhost.call({
                boardLedger: { current: { problemTex: '2x = 4', steps: [] }, completed: [] },
            });
            expect(ghost).toMatch(/Problem in focus: 2x = 4/);
            expect(ghost).not.toMatch(/BOARD_POINT/);
        } finally {
            if (prev === undefined) delete process.env.WORK_BOARD; else process.env.WORK_BOARD = prev;
        }
    });
});

describe('promoteSwitchedProblemToPose — a new Given is a new problem', () => {
    function fold(ledger, mathSteps) {
        let cmds = voiceToBoardCommands({ mathSteps });
        cmds = promoteLeadingResolveToPose(ledger, cmds);
        cmds = promoteSwitchedProblemToPose(ledger, cmds, mathSteps[0]);
        cmds = dedupeCumulativeResolves(ledger, cmds);
        return applyTurnToLedger(ledger, cmds, new Date('2026-10-13T12:00:00Z'));
    }

    test('switching problems archives the old one instead of merging the two', () => {
        let ledger = fold(null, [{ label: 'Given', latex: '\\frac{x}{2} = 3' }]);
        ledger = fold(ledger, [
            { label: 'Given', latex: '\\frac{x}{2} = 3' },
            { label: 'Multiply', latex: 'x = 6' },
        ]);
        ledger = fold(ledger, [
            { label: 'Given', latex: '4x - 2 = 10' },
            { label: 'Add 2', latex: '4x = 12' },
        ]);
        expect(ledger.current.problemTex).toBe('4x - 2 = 10');
        expect(ledger.current.steps.map(s => s.tex)).toEqual(['4x = 12']);
        expect(ledger.completed).toHaveLength(1);
        expect(ledger.completed[0].problemTex).toBe('\\frac{x}{2} = 3');
    });

    test('a newest-line-only board (no Given label) is never mistaken for a switch', () => {
        const ledger = fold(null, [{ label: 'Given', latex: '\\frac{x}{2} = 3' }]);
        const cmds = promoteSwitchedProblemToPose(ledger,
            [{ action: 'resolve', tex: 'x = 6' }], { label: 'Multiply', latex: 'x = 6' });
        expect(cmds[0].action).toBe('resolve');
    });

    test('re-sending the same problem is not a switch', () => {
        const ledger = fold(null, [{ label: 'Given', latex: '\\frac{x}{2} = 3' }]);
        const cmds = promoteSwitchedProblemToPose(ledger,
            [{ action: 'resolve', tex: '\\frac{x}{2}  = 3' }], { label: 'Given', latex: '\\frac{x}{2}  = 3' });
        expect(cmds[0].action).toBe('resolve');
    });
});
