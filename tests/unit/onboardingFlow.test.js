/**
 * The first thing after "Start Free Now" has to be answerable.
 *
 * THE BUG THIS CATCHES: onboarding.html opened with "What brings you to
 * Mathmatix today?" and a microphone. It sat between the button someone had just
 * clicked and the account they clicked it for, so it delayed the action they
 * chose — and it was open enough that people could not tell what kind of answer
 * was wanted: their role? their child's difficulty? a math problem? A prompt you
 * cannot tell how to answer is a prompt people skip or abandon.
 *
 * It is now two closed questions — who, then what — with the microphone and
 * textarea kept underneath as "rather say it in your own words". Voice enhances
 * the flow instead of defining it, and there is a visible "Step 1 of 3" so the
 * page stops feeling open-ended.
 *
 * What this pins:
 *   - the structured questions come first, with nothing preselected
 *   - the browser posts WHICH OPTIONS were picked, never a category; that is
 *     the same property utils/onboardingIntent.js inferIntent has, and losing it
 *     would let any caller name any enum value (see routes/onboarding.js)
 *   - free text on its own is still a complete answer
 *   - a browser without speech recognition loses the mic, not the flow — the
 *     old code force-revealed a textarea at everyone in that case
 *
 * The DOM work runs in a spawned process (tests/helpers/onboardingFlowProbe.js)
 * — jsdom@27 cannot be `require`d inside a Jest worker.
 */

const path = require('path');
const { execFileSync } = require('child_process');

describe('onboarding first step', () => {
  let probe;

  beforeAll(() => {
    probe = JSON.parse(execFileSync(
      process.execPath,
      [path.join(__dirname, '../helpers/onboardingFlowProbe.js')],
      { encoding: 'utf8', timeout: 60000 }
    ));
  });

  describe('opens with a closed question', () => {
    it('asks who will be using it', () => {
      expect(probe.initial.heading).toBe('Who will be using Mathmatix?');
      expect(probe.initial.whoVisible).toBe(true);
    });

    it('offers the three answers and preselects none', () => {
      expect(probe.initial.whoOptions).toEqual(['my_child', 'me', 'my_students']);
      expect(probe.initial.anyWhoChecked).toBe(false);
      expect(probe.initial.anyGoalChecked).toBe(false);
    });

    it('does not lead with the microphone', () => {
      // The mic and textarea are one question further in, under the chips.
      expect(probe.initial.freeformVisible).toBe(false);
    });

    it('says how far along the visitor is', () => {
      expect(probe.initial.progress).toBe('Step 1 of 3');
      expect(probe.initial.currentStep).toBe('who');
    });
  });

  describe('advancing', () => {
    it('moves to the goal question as soon as "who" is answered', () => {
      // No Continue tap in between: a "who" answer has no ambiguity to confirm,
      // and the extra tap is exactly the friction this replaced.
      expect(probe.afterWho.whoVisible).toBe(false);
      expect(probe.afterWho.goalVisible).toBe(true);
      expect(probe.afterWho.goalHeading).toBe('What would you most like help with?');
      expect(probe.afterWho.progress).toBe('Step 2 of 3');
    });

    it('does not auto-advance off the goal question', () => {
      // The free-text box lives under these chips; auto-submitting would skip
      // past it before anyone could decide to use it.
      expect(probe.afterWho.submitDisabled).toBe(true);
      expect(probe.afterWho.freeformStillHidden).toBe(true);
    });

    it('lets Back return without losing the answer', () => {
      expect(probe.afterBack.whoVisible).toBe(true);
      expect(probe.afterBack.progress).toBe('Step 1 of 3');
      expect(probe.afterBack.whoStillChecked).toBe(true);
    });

    it('offers the six goals', () => {
      expect(probe.initial.goalOptions).toEqual([
        'homework', 'missing_skills', 'test_prep', 'act_sat', 'accommodations', 'not_sure',
      ]);
    });
  });

  describe('what gets posted', () => {
    it('sends the picked options and no category at all', () => {
      // The server classifies, from a whitelist, in one place. A browser that
      // could send `intentCategory` could name any enum value it liked — that
      // is the bug inferIntent's server-side move fixed, and the structured
      // path must not reintroduce it.
      expect(probe.structuredSubmit.posted).toEqual([
        { who: 'my_child', goal: 'homework', intentText: '', capturedVia: 'choice' },
      ]);
      expect(probe.structuredSubmit.sendsCategory).toBe(false);
    });

    it('marks the structured path so the metrics can tell it apart', () => {
      // utils/intentMetrics.js splits on capturedVia.
      expect(probe.structuredSubmit.posted[0].capturedVia).toBe('choice');
    });

    it('accepts free text alone as a complete answer', () => {
      expect(probe.freeText.disabledBefore).toBe(true);
      expect(probe.freeText.freeformAfterToggle).toBe(true);
      expect(probe.freeText.posted).toEqual([
        { who: 'me', goal: '', intentText: 'I have a calculus final next week', capturedVia: 'text' },
      ]);
    });

    it('keeps the "who" answer when someone skips', () => {
      // A who without a goal is still what tells parent_support from
      // teacher_exploring, so skipping should not throw it away.
      expect(probe.skip.posted).toEqual([
        { who: 'my_students', goal: '', intentText: '', capturedVia: 'text' },
      ]);
    });
  });

  describe('no speech recognition', () => {
    it('drops the mic and keeps the questions', () => {
      expect(probe.noSpeech.micHidden).toBe(true);
      expect(probe.noSpeech.goalVisible).toBe(true);
    });

    it('does not push a textarea at everyone', () => {
      // The old flow force-revealed the typing UI here, because typing was the
      // only fallback for a question that had to be answered in prose. The
      // chips are the answer now.
      expect(probe.noSpeech.freeformVisible).toBe(false);
    });
  });
});
