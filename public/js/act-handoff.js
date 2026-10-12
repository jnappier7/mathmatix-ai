// public/js/act-handoff.js
//
// Carry a finished guest ACT or SAT test through signup.
//
// The public test (/act, public/js/act-test.js) ends on "See what I missed —
// free", which led to signup -> onboarding -> the account form with no sign
// of the test anywhere: "Who will be using Mathmatix?", "What would you most
// like help with?", a password box. The result was safe (chat.html claims it
// on first load), but nothing on those screens said so, and the visitor had
// to tell us a second time that they wanted ACT prep (external audit,
// 2026-10-05).
//
// Loaded on signup.html and onboarding.html. When the visitor arrived through
// the test's CTA (?from=act, remembered for the tab in sessionStorage because
// onboarding -> signup drops the query) AND this browser holds a completed
// guest test, it:
//   - shows "Your ACT results are saved" with the score and the missed count;
//   - preselects "ACT / SAT prep" on the onboarding goal question (a default,
//     still changeable; "who" is NOT preselected — a parent may be signing up
//     for the student who took the test).
//
// The SAT's public test (/sat) arrives as ?from=sat and works the same way,
// reading its own guest record; so do the PSAT (?from=psat) and PreACT
// (?from=preact).
//
// Reads only what act-test.js wrote to localStorage. Display-only: the claim
// itself is still /api/act-test/claim on chat.html, authorised by the guest
// token, never by anything this file shows.
(function () {
  'use strict';

  // public/js/act-test.js EXAMS[*].guestKey
  var EXAMS = {
    act: { name: 'ACT', guestKey: 'mathmatix.actGuestTest' },
    sat: { name: 'SAT', guestKey: 'mathmatix.satGuestTest' },
    psat: { name: 'PSAT', guestKey: 'mathmatix.psatGuestTest' },
    preact: { name: 'PreACT', guestKey: 'mathmatix.preactGuestTest' },
  };
  var FLAG_KEY = 'mathmatix.actHandoff';
  var GUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000; // models/actTestSession GUEST_TTL_MS

  // Which test the visitor came from: 'act', 'sat', or null. The flag held
  // '1' before the SAT existed; that still means the ACT.
  function fromExam() {
    try {
      var q = new URLSearchParams(window.location.search || '').get('from');
      if (Object.prototype.hasOwnProperty.call(EXAMS, q)) {
        sessionStorage.setItem(FLAG_KEY, q);
        return q;
      }
      var f = sessionStorage.getItem(FLAG_KEY);
      if (f === '1') return 'act';
      return f && Object.prototype.hasOwnProperty.call(EXAMS, f) ? f : null;
    } catch { return null; }
  }

  function finishedGuestTest(exam) {
    try {
      var g = JSON.parse(localStorage.getItem(exam.guestKey) || 'null');
      if (!g || g.status !== 'completed' || !g.sessionId || !g.token) return null;
      if (g.completedAt && Date.now() - g.completedAt > GUEST_TTL_MS) return null;
      return g;
    } catch { return null; }
  }

  function banner(g, exam) {
    var el = document.createElement('div');
    el.className = 'act-handoff';
    el.setAttribute('role', 'status');
    var score = typeof g.score === 'number' ? g.score : null;
    var missed = typeof g.missed === 'number' ? g.missed : null;
    var facts = [];
    if (score != null) facts.push('estimated score ' + score);
    if (missed != null) facts.push(missed === 0 ? 'a perfect section' : missed + ' question' + (missed === 1 ? '' : 's') + ' to review');
    var title = document.createElement('div');
    title.className = 'act-handoff-title';
    title.textContent = '✓ Your ' + exam.name + ' results are saved';
    var body = document.createElement('div');
    body.className = 'act-handoff-body';
    body.textContent = (facts.length ? facts.join(' · ') + '. ' : '')
      + (missed === 0
        ? 'Finish setting up and your score is kept on your account.'
        : 'Finish setting up and they open with your tutor, question by question.');
    el.appendChild(title);
    el.appendChild(body);
    return el;
  }

  function injectStyles() {
    if (document.getElementById('act-handoff-css')) return;
    var s = document.createElement('style');
    s.id = 'act-handoff-css';
    s.textContent = '.act-handoff{margin:0 0 18px;padding:12px 14px;border-radius:10px;'
      + 'background:#f3efff;border:1px solid #d8ccf6;color:#3a3160;text-align:left}'
      + '.act-handoff-title{font-weight:700;font-size:15px;margin-bottom:2px}'
      + '.act-handoff-body{font-size:13.5px;line-height:1.45}';
    document.head.appendChild(s);
  }

  function run() {
    var key = fromExam();
    if (!key) return;
    var exam = EXAMS[key];
    var g = finishedGuestTest(exam);
    if (!g) return;
    injectStyles();

    // Onboarding: banner above the questions, ACT preselected on the goal.
    var onboarding = document.querySelector('.onboarding-body');
    if (onboarding) {
      onboarding.insertBefore(banner(g, exam), onboarding.firstChild);
      var goal = document.querySelector('input[name="onboarding-goal"][value="act_sat"]');
      if (goal && !document.querySelector('input[name="onboarding-goal"]:checked')) {
        goal.checked = true;
        // onboarding.js enables the submit button from this event; the goal
        // question does not auto-advance, so this only sets the default.
        goal.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    // Signup: banner above the account form.
    var heading = document.querySelector('.signup-container h2');
    if (heading && heading.parentNode) heading.parentNode.insertBefore(banner(g, exam), heading.nextSibling);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
