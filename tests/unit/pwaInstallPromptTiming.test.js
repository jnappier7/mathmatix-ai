/**
 * The install banner has to earn the ask.
 *
 * THE BUG THIS CATCHES: config/middleware.js injects pwa-register.js into every
 * HTML response, and the banner fired 3s after any page load with no other
 * condition. A site review hit it part-way through onboarding — before an account
 * existed, before the tutor had answered anything — where it is not an offer but a
 * third thing competing with the decision on screen, asking the visitor to install
 * something they have no evidence is worth installing. Because the injection is
 * global, the gating has to live in pwa-register.js; there is no per-page opt-out
 * to regress to.
 *
 * Two rules, and this test holds both:
 *   1. Never on a page where the visitor is mid-decision — onboarding, signup,
 *      login, pricing, the consent and picker flows.
 *   2. Not until there is something to install FOR — a tutor reply landed
 *      (script.js calls MathmatixPWA.markValueMoment()), or they came back for a
 *      second session on a product surface.
 *
 * The pre-existing escape hatches (recently dismissed, already installed) are
 * covered too, because the new gate sits in front of them and could have
 * swallowed them.
 *
 * The DOM work runs in a spawned process (tests/helpers/pwaInstallPromptProbe.js)
 * — jsdom@27 cannot be `require`d inside a Jest worker.
 */

const path = require('path');
const { execFileSync } = require('child_process');

describe('PWA install prompt timing', () => {
  let probe;

  beforeAll(() => {
    probe = JSON.parse(execFileSync(
      process.execPath,
      [path.join(__dirname, '../helpers/pwaInstallPromptProbe.js')],
      { encoding: 'utf8', timeout: 60000 }
    ));
  });

  describe('never interrupts a decision', () => {
    it.each([
      ['onboarding', 'onboardingWithValue'],
      ['signup', 'signupWithValue'],
      ['login', 'loginWithValue'],
      ['pricing', 'pricingWithValue'],
    ])('stays away on %s even for a visitor who has earned the ask', (_page, key) => {
      expect(probe[key].bannerShown).toBe(false);
    });

    it('also stays away on iOS, which uses a separate banner path', () => {
      // beforeinstallprompt never fires on iOS, so the manual "Add to Home
      // Screen" instructions are shown on their own timer — a second code path
      // that has to pass through the same gate.
      expect(probe.onboardingIosWithValue.bannerShown).toBe(false);
    });
  });

  describe('waits for a reason to exist', () => {
    it('says nothing on a first visit to the tutor', () => {
      expect(probe.chatFirstVisitNoValue.bannerShown).toBe(false);
    });

    it('appears once a tutor reply has landed', () => {
      expect(probe.chatWithValue.bannerShown).toBe(true);
    });

    it('appears on a return session even without a recorded reply', () => {
      // Storage can be cleared, or the reply can predate this code. Coming back
      // is its own evidence.
      expect(probe.chatSecondSession.bannerShown).toBe(true);
    });

    it('reaches iOS visitors on the same terms', () => {
      expect(probe.chatIosWithValue.bannerShown).toBe(true);
    });

    it('is silent for a first-time visitor on the homepage', () => {
      expect(probe.homeFirstVisit.bannerShown).toBe(false);
    });

    it('is allowed on the homepage once the ask is earned', () => {
      // Marketing pages are not suppressed — a returning user browsing the
      // homepage is a fine moment, they just have to be a returning user.
      expect(probe.homeWithValue.bannerShown).toBe(true);
    });
  });

  describe('the older escape hatches still work', () => {
    it('honors a recent dismissal', () => {
      expect(probe.chatDismissedRecently.bannerShown).toBe(false);
    });

    it('lets the dismissal expire', () => {
      expect(probe.chatDismissedLongAgo.bannerShown).toBe(true);
    });

    it('says nothing when the app is already installed', () => {
      expect(probe.chatAlreadyInstalled.bannerShown).toBe(false);
    });
  });

  describe('session counting', () => {
    it('counts a visit to a product surface', () => {
      expect(probe.chatFreshSession.sessionsRecorded).toBe('1');
    });

    it('counts once per tab session, not once per page load', () => {
      // Otherwise clicking around chat.html three times in one sitting would
      // read as three visits and trip the second-session rule immediately.
      expect(probe.chatAlreadyCountedThisTab.sessionsRecorded).toBe('1');
    });

    it('does not count marketing pages as product sessions', () => {
      expect(probe.marketingPageDoesNotCount.sessionsRecorded).toBeNull();
    });
  });

  it('exports the hook the chat engine calls', () => {
    // public/js/script.js calls this from appendMessage() when an AI turn lands.
    expect(probe.chatWithValue.exportsMarkValueMoment).toBe(true);
    expect(probe.chatFirstVisitNoValue.valueAfterMark).toBe('1');
  });
});
