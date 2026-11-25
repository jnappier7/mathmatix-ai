/**
 * Runs the landing page's real renderTutorReply / sanitizeTrialVisual /
 * splitTrialVisuals (lifted out of public/js/landing.js by name) in jsdom, with
 * and without DOMPurify, and reports what ended up in the bubble. Not a test —
 * a probe tests/unit/trialVisualFailsClosed.test.js asserts against.
 *
 * Its own Node process for the same reason as signupRoleProbe.js: jsdom's
 * ESM-only dependency cannot be parsed inside a Jest worker.
 *
 * Usage: node trialVisualProbe.js   → JSON on stdout
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const landing = fs.readFileSync(path.join(__dirname, '../../public/js/landing.js'), 'utf8');

function lift(name) {
  const at = landing.indexOf(`  function ${name}(`);
  if (at < 0) throw new Error(`landing.js has no ${name}`);
  return landing.slice(at, landing.indexOf('\n  }\n', at) + 4);
}

// What a steered label could put in a picture's HTML.
const EVIL = '<div class="icv-container"><svg><text>Parts</text></svg><img src="x" onerror="window.__pwned = true"><script>window.__pwned = true</script></div>';
const CLEAN = '<div class="icv-container"><svg><text>Parts</text></svg></div>';
const REPLY = 'Look at the bars.\n\n[FRACTION:compare=2/3,3/4,label="x"]\n\nWhich is longer?';

async function run(purify) {
  // A page that WOULD run an injected script, so "nothing ran" means something.
  const { window } = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
  const sanitized = [];
  let initialized = 0;
  if (purify === 'real') window.DOMPurify = { sanitize: (html, cfg) => { sanitized.push({ html, cfg }); return CLEAN; } };
  if (purify === 'not-the-library') window.DOMPurify = {};
  window.inlineChatVisuals = {
    processMessage: () => ({ hasVisuals: true, html: EVIL }),
    initializeVisuals: () => { initialized += 1; },
  };
  const make = new Function('window', 'document', 'requestAnimationFrame', 'loadTrialVisuals', 'renderTrialMath', 'TRIAL_DRAWABLE', 'scrollTrialToReply', `
    ${lift('splitTrialVisuals')}
    ${lift('sanitizeTrialVisual')}
    ${lift('renderTutorReply')}
    return { renderTutorReply, sanitizeTrialVisual };
  `);
  const page = make(window, window.document, (fn) => fn(), () => Promise.resolve(true), (t) => t, ['FRACTION'], () => {});

  const bubble = window.document.createElement('div');
  window.document.body.appendChild(bubble);
  page.renderTutorReply(bubble, REPLY, null);
  await new Promise((resolve) => setTimeout(resolve, 30));

  return {
    direct: page.sanitizeTrialVisual(EVIL),
    slots: bubble.querySelectorAll('.lp-chat-visual').length,
    pictures: bubble.querySelectorAll('.icv-container').length,
    dangerous: bubble.querySelectorAll('img, script').length,
    html: bubble.innerHTML,
    words: [...bubble.querySelectorAll('.lp-chat-text')].map((el) => el.textContent),
    initialized,
    pwned: window.__pwned === true,
    sanitizedInput: sanitized.map((s) => s.html),
    sanitizedProfiles: sanitized.map((s) => Object.keys((s.cfg && s.cfg.USE_PROFILES) || {})),
  };
}

(async () => {
  const out = {
    absent: await run(null),
    notTheLibrary: await run('not-the-library'),
    present: await run('real'),
  };
  process.stdout.write(JSON.stringify(out));
})().catch((err) => { process.stderr.write(String(err && err.stack || err)); process.exit(1); });
