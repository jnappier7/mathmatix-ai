/**
 * Drives public/onboarding.html's two structured questions through the real
 * onboarding.js and reports what the page shows and what it posts. Not a test —
 * a probe the test asserts against.
 *
 * Spawned as its own Node process for the same reason as i18nRenderProbe.js:
 * jsdom@27 pulls in an ESM-only transitive dependency that Jest's CommonJS
 * transform cannot parse, so `require('jsdom')` throws inside a Jest worker.
 *
 * Usage: node onboardingFlowProbe.js   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PUB = path.join(__dirname, '../../public');
const html = fs.readFileSync(path.join(PUB, 'onboarding.html'), 'utf8');
const src = fs.readFileSync(path.join(PUB, 'js/onboarding.js'), 'utf8');

/**
 * @param {object} opts
 * @param {boolean} [opts.speechSupported]  expose SpeechRecognition
 * @param {function} [opts.drive]           async (ctx) => void
 */
async function session(opts = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://www.mathmatix.ai/onboarding.html',
    virtualConsole,
  });
  const win = dom.window;
  const doc = win.document;

  if (opts.speechSupported) {
    // A minimal stand-in: onboarding.js only constructs it and attaches handlers.
    win.SpeechRecognition = function () {
      this.start = () => {};
      this.stop = () => {};
    };
  }

  const posted = [];
  win.fetch = (url, init) => {
    if (String(url).includes('/api/onboarding/status')) {
      // Unauthenticated visitor: the page stays on question one.
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: false }) });
    }
    if (String(url).includes('/api/onboarding/intent')) {
      posted.push(JSON.parse(init.body));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          intentCategory: 'student_homework',
          redirect: '/chat.html',
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };

  // Eval while the document is still parsing, as a <script> at the end of body
  // would, so onboarding.js registers its DOMContentLoaded listener. Then wait
  // for jsdom's OWN event — dispatching a second one by hand runs init() twice
  // and double-binds every click handler.
  win.eval(src);
  if (doc.readyState === 'loading') {
    await new Promise((resolve) => doc.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  await new Promise((resolve) => win.setTimeout(resolve, 0));

  const ctx = {
    win,
    doc,
    posted,
    visible: (id) => {
      const el = doc.getElementById(id);
      return !!el && !el.hidden;
    },
    pick: (name, value) => {
      const radio = doc.querySelector(`input[name="${name}"][value="${value}"]`);
      radio.checked = true;
      radio.dispatchEvent(new win.Event('change', { bubbles: true }));
    },
    click: (id) => doc.getElementById(id).dispatchEvent(new win.Event('click', { bubbles: true })),
    progress: () => doc.getElementById('onboarding-progress-text').textContent.trim(),
    currentStep: () => {
      const el = doc.querySelector('.onboarding-progress-step.is-current');
      return el ? el.getAttribute('data-step') : null;
    },
    submitDisabled: () => doc.getElementById('onboarding-submit').disabled,
  };

  if (opts.drive) await opts.drive(ctx);
  return ctx;
}

async function main() {
  const out = {};

  // --- Landing state -----------------------------------------------------
  {
    const c = await session();
    out.initial = {
      whoVisible: c.visible('onboarding-step-who'),
      goalVisible: c.visible('onboarding-step-goal'),
      freeformVisible: c.visible('onboarding-freeform'),
      progress: c.progress(),
      currentStep: c.currentStep(),
      heading: c.doc.getElementById('onboarding-prompt-heading').textContent.trim(),
      whoOptions: Array.from(c.doc.querySelectorAll('input[name="onboarding-who"]')).map((r) => r.value),
      goalOptions: Array.from(c.doc.querySelectorAll('input[name="onboarding-goal"]')).map((r) => r.value),
      anyWhoChecked: Array.from(c.doc.querySelectorAll('input[name="onboarding-who"]')).some((r) => r.checked),
      anyGoalChecked: Array.from(c.doc.querySelectorAll('input[name="onboarding-goal"]')).some((r) => r.checked),
    };
  }

  // --- Question one advances on choice ----------------------------------
  {
    const c = await session({ drive: async (ctx) => ctx.pick('onboarding-who', 'my_child') });
    out.afterWho = {
      whoVisible: c.visible('onboarding-step-who'),
      goalVisible: c.visible('onboarding-step-goal'),
      progress: c.progress(),
      currentStep: c.currentStep(),
      submitDisabled: c.submitDisabled(),
      goalHeading: c.doc.getElementById('onboarding-goal-heading').textContent.trim(),
      freeformStillHidden: !c.visible('onboarding-freeform'),
    };
  }

  // --- Back returns to question one --------------------------------------
  {
    const c = await session({ drive: async (ctx) => {
      ctx.pick('onboarding-who', 'me');
      ctx.click('onboarding-back');
    } });
    out.afterBack = {
      whoVisible: c.visible('onboarding-step-who'),
      goalVisible: c.visible('onboarding-step-goal'),
      progress: c.progress(),
      // The answer survives the trip, so Back is cheap rather than destructive.
      whoStillChecked: c.doc.querySelector('input[name="onboarding-who"][value="me"]').checked,
    };
  }

  // --- Picking a goal enables submit, and submit posts the choices --------
  {
    const c = await session({ drive: async (ctx) => {
      ctx.pick('onboarding-who', 'my_child');
      ctx.pick('onboarding-goal', 'homework');
      ctx.click('onboarding-submit');
      await new Promise((r) => ctx.win.setTimeout(r, 0));
    } });
    out.structuredSubmit = {
      posted: c.posted,
      // No category is ever sent; the server derives it.
      sendsCategory: c.posted.some((b) => 'intentCategory' in b),
    };
  }

  // --- Free text alone is still a complete answer -------------------------
  {
    const c = await session({ drive: async (ctx) => {
      ctx.pick('onboarding-who', 'me');
      const disabledBefore = ctx.submitDisabled();
      ctx.click('onboarding-typing-toggle');
      const freeformAfterToggle = ctx.visible('onboarding-freeform');
      const ta = ctx.doc.getElementById('onboarding-textarea');
      ta.value = 'I have a calculus final next week';
      ta.dispatchEvent(new ctx.win.Event('input', { bubbles: true }));
      ctx.click('onboarding-submit');
      await new Promise((r) => ctx.win.setTimeout(r, 0));
      out.freeText = {
        disabledBefore,
        freeformAfterToggle,
        posted: ctx.posted,
      };
    } });
    out.freeText.finalDisabled = c.submitDisabled();
  }

  // --- Skip records the "who" it already has ------------------------------
  {
    const c = await session({ drive: async (ctx) => {
      ctx.pick('onboarding-who', 'my_students');
      ctx.click('onboarding-back');
      ctx.click('onboarding-skip');
      await new Promise((r) => ctx.win.setTimeout(r, 0));
    } });
    out.skip = { posted: c.posted };
  }

  // --- No speech recognition: the mic goes, the chips stay ----------------
  {
    const c = await session({ drive: async (ctx) => ctx.pick('onboarding-who', 'me') });
    out.noSpeech = {
      micHidden: c.doc.getElementById('onboarding-mic-btn').hidden,
      // The old code force-revealed the textarea here; it should not any more.
      freeformVisible: c.visible('onboarding-freeform'),
      goalVisible: c.visible('onboarding-step-goal'),
    };
  }

  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
