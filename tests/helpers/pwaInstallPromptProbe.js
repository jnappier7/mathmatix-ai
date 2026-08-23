/**
 * Runs public/js/pwa-register.js in a real DOM under a matrix of pages and
 * storage states, and reports whether the install banner appeared. Not a test —
 * a probe the test asserts against.
 *
 * Spawned as its own Node process for the same reason as i18nRenderProbe.js:
 * jsdom@27 pulls in an ESM-only transitive dependency that Jest's CommonJS
 * transform cannot parse, so `require('jsdom')` throws inside a Jest worker.
 *
 * Usage: node pwaInstallPromptProbe.js   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = fs.readFileSync(
  path.join(__dirname, '../../public/js/pwa-register.js'),
  'utf8'
);

/**
 * @param {object} opts
 * @param {string} opts.url            page the visitor is on
 * @param {object} opts.local          seeded localStorage
 * @param {object} opts.session        seeded sessionStorage
 * @param {boolean} opts.ios           pretend to be iOS (no beforeinstallprompt)
 * @param {boolean} opts.standalone    already installed
 */
function run(opts) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: opts.url,
    pretendToBeVisual: true,
    virtualConsole,
  });
  const win = dom.window;

  for (const [k, v] of Object.entries(opts.local || {})) win.localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(opts.session || {})) win.sessionStorage.setItem(k, v);

  if (opts.ios) {
    Object.defineProperty(win.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    });
  }

  // The banner is deliberately delayed so it does not fight page load. Collapse
  // the delay rather than waiting three seconds per scenario.
  win.setTimeout = (fn) => { fn(); return 0; };
  win.matchMedia = () => ({ matches: !!opts.standalone, addListener() {}, removeListener() {} });

  win.eval(SRC);

  // Android/Chrome path: the browser offers the prompt, the script decides.
  if (!opts.ios) {
    const evt = new win.Event('beforeinstallprompt');
    evt.prompt = () => {};
    evt.userChoice = Promise.resolve({ outcome: 'accepted' });
    win.dispatchEvent(evt);
  }

  return {
    bannerShown: !!win.document.getElementById('pwa-install-banner'),
    sessionsRecorded: win.localStorage.getItem('mathmatix-pwa-sessions'),
    exportsMarkValueMoment: typeof (win.MathmatixPWA || {}).markValueMoment === 'function',
    valueAfterMark: (() => {
      if (!win.MathmatixPWA) return null;
      win.MathmatixPWA.markValueMoment();
      return win.localStorage.getItem('mathmatix-pwa-value-moment');
    })(),
  };
}

const VALUE = { 'mathmatix-pwa-value-moment': '1' };
const TWO_SESSIONS = { 'mathmatix-pwa-sessions': '2' };
const CHAT = 'https://www.mathmatix.ai/chat.html';

const result = {
  // Mid-decision pages: never, no matter how much value the visitor has seen.
  onboardingWithValue: run({ url: 'https://www.mathmatix.ai/onboarding.html', local: VALUE }),
  signupWithValue: run({ url: 'https://www.mathmatix.ai/signup.html', local: VALUE }),
  loginWithValue: run({ url: 'https://www.mathmatix.ai/login.html', local: VALUE }),
  pricingWithValue: run({ url: 'https://www.mathmatix.ai/pricing.html', local: VALUE }),
  onboardingIosWithValue: run({ url: 'https://www.mathmatix.ai/onboarding.html', local: VALUE, ios: true }),

  // Product surfaces: only once the ask has been earned.
  chatFirstVisitNoValue: run({ url: CHAT }),
  chatWithValue: run({ url: CHAT, local: VALUE }),
  chatSecondSession: run({ url: CHAT, local: TWO_SESSIONS }),
  chatIosWithValue: run({ url: CHAT, local: VALUE, ios: true }),

  // Marketing pages are not suppressed — a returning user on the homepage is a
  // fine place to offer it, they just have to be a returning user.
  homeFirstVisit: run({ url: 'https://www.mathmatix.ai/index.html' }),
  homeWithValue: run({ url: 'https://www.mathmatix.ai/index.html', local: VALUE }),

  // Escape hatches that already existed must keep working.
  chatDismissedRecently: run({
    url: CHAT,
    local: Object.assign({}, VALUE, { 'mathmatix-pwa-dismiss': String(Date.now()) }),
  }),
  chatDismissedLongAgo: run({
    url: CHAT,
    local: Object.assign({}, VALUE, {
      'mathmatix-pwa-dismiss': String(Date.now() - 30 * 24 * 60 * 60 * 1000),
    }),
  }),
  chatAlreadyInstalled: run({ url: CHAT, local: VALUE, standalone: true }),

  // Session counting.
  chatFreshSession: run({ url: CHAT }),
  chatAlreadyCountedThisTab: run({
    url: CHAT,
    local: { 'mathmatix-pwa-sessions': '1' },
    session: { 'mathmatix-pwa-session-counted': '1' },
  }),
  marketingPageDoesNotCount: run({ url: 'https://www.mathmatix.ai/index.html' }),
};

process.stdout.write(JSON.stringify(result, null, 2));
