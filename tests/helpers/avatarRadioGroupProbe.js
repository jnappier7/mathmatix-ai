/**
 * Drives avatar-builder.html's pickers by keyboard through the real
 * avatar-builder.js and reports what focus and selection did. Not a test — a
 * probe the test asserts against.
 *
 * Spawned as its own Node process for the same reason as i18nRenderProbe.js:
 * jsdom@27 pulls in an ESM-only transitive dependency that Jest's CommonJS
 * transform cannot parse, so `require('jsdom')` throws inside a Jest worker.
 *
 * Usage: node avatarRadioGroupProbe.js   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PUB = path.join(__dirname, '../../public');
const html = fs.readFileSync(path.join(PUB, 'avatar-builder.html'), 'utf8');
const src = fs.readFileSync(path.join(PUB, 'js/avatar-builder.js'), 'utf8');

function boot() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://www.mathmatix.ai/avatar-builder.html',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const win = dom.window;
  const doc = win.document;

  // The builder fetches the saved avatar and renders previews against
  // api.dicebear.com; neither is reachable or relevant here.
  win.fetch = () => Promise.reject(new Error('offline'));

  win.eval(src);
  if (doc.readyState === 'loading') {
    // The page's own script tag runs on DOMContentLoaded.
    doc.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
  }
  return { win, doc };
}

function press(win, el, key) {
  el.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function snapshot(doc, groupId) {
  const group = doc.getElementById(groupId);
  const opts = Array.from(group.querySelectorAll('[role="radio"]'));
  const named = (el) => el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim();
  return {
    role: group.getAttribute('role'),
    groupLabel: group.getAttribute('aria-label'),
    count: opts.length,
    checked: opts.filter((o) => o.getAttribute('aria-checked') === 'true').map(named),
    activeClass: opts.filter((o) => o.classList.contains('active')).map(named),
    tabbable: opts.filter((o) => o.getAttribute('tabindex') === '0').map(named),
    focused: doc.activeElement && doc.activeElement.getAttribute('role') === 'radio'
      ? named(doc.activeElement) : null,
  };
}

const GROUPS = ['style-selector', 'skin-picker', 'hair-color-picker', 'bg-picker'];
const result = {};

// ── Initial state, straight from the markup ────────────────────────────────
{
  const { doc } = boot();
  result.initial = Object.fromEntries(GROUPS.map((g) => [g, snapshot(doc, g)]));
  // A radiogroup must expose exactly one tab stop, so Tab moves between groups.
  result.initial.totalTabbableRadios =
    doc.querySelectorAll('[role="radio"][tabindex="0"]').length;
  result.initial.totalRadios = doc.querySelectorAll('[role="radio"]').length;
  result.initial.strayAriaPressed = doc.querySelectorAll('[aria-pressed]').length;
}

// ── Arrow keys move focus AND selection, in both axes ──────────────────────
{
  const { win, doc } = boot();
  const opts = Array.from(doc.querySelectorAll('#skin-picker [role="radio"]'));
  const start = opts.find((o) => o.getAttribute('tabindex') === '0');
  start.focus();
  const before = snapshot(doc, 'skin-picker');

  press(win, doc.activeElement, 'ArrowRight');
  const afterRight = snapshot(doc, 'skin-picker');

  press(win, doc.activeElement, 'ArrowDown');
  const afterDown = snapshot(doc, 'skin-picker');

  press(win, doc.activeElement, 'ArrowLeft');
  const afterLeft = snapshot(doc, 'skin-picker');

  press(win, doc.activeElement, 'ArrowUp');
  const afterUp = snapshot(doc, 'skin-picker');

  result.arrows = { before, afterRight, afterDown, afterLeft, afterUp };
}

// ── Wrapping at both ends, and Home/End ────────────────────────────────────
{
  const { win, doc } = boot();
  const opts = Array.from(doc.querySelectorAll('#skin-picker [role="radio"]'));
  opts[0].focus();
  press(win, doc.activeElement, 'ArrowLeft');
  const wrappedBackwards = snapshot(doc, 'skin-picker');

  opts[opts.length - 1].focus();
  press(win, doc.activeElement, 'ArrowRight');
  const wrappedForwards = snapshot(doc, 'skin-picker');

  press(win, doc.activeElement, 'End');
  const atEnd = snapshot(doc, 'skin-picker');
  press(win, doc.activeElement, 'Home');
  const atHome = snapshot(doc, 'skin-picker');

  result.edges = { wrappedBackwards, wrappedForwards, atEnd, atHome };
}

// ── Keys we do not own must pass through, or focus is trapped ──────────────
{
  const { win, doc } = boot();
  const opts = Array.from(doc.querySelectorAll('#skin-picker [role="radio"]'));
  opts[0].focus();
  const ev = new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  doc.activeElement.dispatchEvent(ev);
  result.tabNotSwallowed = !ev.defaultPrevented;

  const ev2 = new win.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
  doc.activeElement.dispatchEvent(ev2);
  result.typingNotSwallowed = !ev2.defaultPrevented;
}

// ── Clicking still works, and leaves exactly one tab stop behind ───────────
{
  const { win, doc } = boot();
  const opts = Array.from(doc.querySelectorAll('#bg-picker [role="radio"]'));
  const target = opts[4];
  target.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  result.afterClick = snapshot(doc, 'bg-picker');
}

// ── Each group is independent: arrowing one must not disturb another ───────
{
  const { win, doc } = boot();
  const skin = Array.from(doc.querySelectorAll('#skin-picker [role="radio"]'));
  const hairBefore = snapshot(doc, 'hair-color-picker');
  skin.find((o) => o.getAttribute('tabindex') === '0').focus();
  press(win, doc.activeElement, 'ArrowRight');
  result.isolation = {
    hairBefore,
    hairAfter: snapshot(doc, 'hair-color-picker'),
  };
}

process.stdout.write(JSON.stringify(result, null, 2));
