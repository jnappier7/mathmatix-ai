/**
 * Drives public/signup.html's role picker through the real signup-form.js and
 * reports what the form does. Not a test — a probe the test asserts against.
 *
 * Spawned as its own Node process for the same reason as i18nRenderProbe.js:
 * jsdom@27 pulls in an ESM-only transitive dependency that Jest's CommonJS
 * transform cannot parse, so `require('jsdom')` throws inside a Jest worker but
 * is fine under plain Node.
 *
 * Usage: node signupRoleProbe.js   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PUB = path.join(__dirname, '../../public');

const html = fs.readFileSync(path.join(PUB, 'signup.html'), 'utf8');
const formSrc = fs.readFileSync(path.join(PUB, 'js/signup-form.js'), 'utf8');

// A successful submit sets window.location.href, which jsdom reports as
// "Not implemented: navigation". That is the real code doing the right thing,
// so drop jsdom's own errors rather than working around the redirect.
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});

// outside-only: the page's own inline scripts expect GTM and a live server.
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://www.mathmatix.ai/signup.html',
  virtualConsole,
});
const win = dom.window;
const doc = win.document;

// signup-form.js posts through csrfFetch; record calls instead of making them.
const posted = [];
win.csrfFetch = (url, opts) => {
  posted.push({ url, body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'ok' }) });
};

win.eval(formSrc);

const $ = (sel) => doc.querySelector(sel);
const radios = () => Array.from(doc.querySelectorAll('input[name="role"]'));

function pick(value) {
  const radio = radios().find((r) => r.value === value);
  radio.checked = true;
  radio.dispatchEvent(new win.Event('change', { bubbles: true }));
}

function submitState() {
  const btn = $('#signupForm button[type="submit"]');
  return { disabled: btn.disabled };
}

/**
 * Is the element actually on screen? Three mechanisms hide things on this page
 * and they interact: the `hidden` attribute, the `.js-hidden` class, and an
 * inline `style.display` the form JS writes. An inline display WINS over the
 * class, which is exactly how the code un-hides `#codeInputGroup` — so a naive
 * "has .js-hidden → invisible" check reports the opposite of the truth.
 * Ancestors count too: a visible field inside a hidden wrapper is hidden.
 */
function visible(el) {
  for (let node = el; node && node !== doc.body; node = node.parentElement) {
    if (node.hidden) return false;
    const inline = node.style.display;
    if (inline === 'none') return false;
    if (!inline && node.classList.contains('js-hidden')) return false;
  }
  return !!el;
}

function fillValidFields() {
  doc.getElementById('firstName').value = 'Ada';
  doc.getElementById('lastName').value = 'Lovelace';
  doc.getElementById('email').value = 'ada@example.com';
  doc.getElementById('password').value = 'Abcdefg1';
  doc.getElementById('confirm-password').value = 'Abcdefg1';
  doc.getElementById('termsAccepted').checked = true;
}

async function trySubmit() {
  posted.length = 0;
  $('#signupForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  // The submit handler is async; let its fetch settle before reading the message.
  await new Promise((resolve) => win.setTimeout(resolve, 0));
  return {
    posted: posted.map((p) => p.body.role),
    message: doc.getElementById('signup-message').textContent,
  };
}

const result = {};

async function run() {
// --- Initial state: nothing chosen ---
result.initial = {
  roleValues: radios().map((r) => r.value),
  anyChecked: radios().some((r) => r.checked),
  hasSelectElement: !!doc.getElementById('role'),
  legend: $('.role-choice legend').textContent.trim(),
  everyRadioHasDescription: radios().every((r) => {
    const body = r.nextElementSibling;
    return !!body && !!body.querySelector('.role-card-desc')
      && body.querySelector('.role-card-desc').textContent.trim().length > 0;
  }),
  codeRowVisible: visible(doc.getElementById('hasCodeRow')),
  teacherNoticeVisible: visible(doc.getElementById('teacherNotice')),
};

// --- Submitting with no role chosen ---
fillValidFields();
result.submitWithNoRole = await trySubmit();

// --- Parent ---
pick('parent');
doc.getElementById('hasCodeCheckbox').checked = true;
doc.getElementById('hasCodeCheckbox').dispatchEvent(new win.Event('change', { bubbles: true }));
result.parent = {
  codeLabel: doc.getElementById('hasCodeLabel').textContent.trim(),
  childInviteVisible: visible(doc.getElementById('inviteCodeGroup')),
  enrollmentVisible: visible(doc.getElementById('enrollmentCodeGroup')),
  teacherNoticeVisible: visible(doc.getElementById('teacherNotice')),
  submit: submitState(),
};
result.parentSubmit = await trySubmit();

// --- Student ---
pick('student');
result.student = {
  codeLabel: doc.getElementById('hasCodeLabel').textContent.trim(),
  enrollmentVisible: visible(doc.getElementById('enrollmentCodeGroup')),
  parentInviteVisible: visible(doc.getElementById('parentInviteCodeGroup')),
  childInviteVisible: visible(doc.getElementById('inviteCodeGroup')),
  submit: submitState(),
};

// --- Teacher: explained, never posted ---
pick('teacher');
result.teacher = {
  noticeVisible: visible(doc.getElementById('teacherNotice')),
  noticeLinksToSupport: !!$('#teacherNotice a[href*="contact-support"]'),
  codeRowVisible: visible(doc.getElementById('hasCodeRow')),
  submit: submitState(),
};
result.teacherSubmit = await trySubmit();

}

run().then(() => {
  process.stdout.write(JSON.stringify(result, null, 2));
}).catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
