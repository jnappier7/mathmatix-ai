/**
 * COURSE PRE-ASSESSMENT — the modal every course opens with.
 *
 * A course is prep and readiness, not the whole curriculum, so it starts by
 * finding out what the student already owns. Anything they answer cleanly is
 * proved at rung 2 and cascades to clear its prerequisites, so the course skips
 * it — and it shows up owned on the skill map.
 *
 * Exposes window.openCoursePreAssessment(sessionId). Grading is entirely
 * server-side: this sends answers, never a correctness claim.
 */
(function () {
  'use strict';

  var MODAL_ID = 'course-preassessment-modal';

  function csrfOpts(options) {
    return (typeof addCsrfToken === 'function') ? addCsrfToken(options) : options;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function close() {
    var el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  function shell(title, bodyHtml, opts) {
    close();
    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', title);
    wrap.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex;'
      + 'align-items:center; justify-content:center; background:rgba(8,12,20,.72); padding:16px;';
    wrap.innerHTML =
      '<div class="cpa-panel" style="background:#fff; color:#1b2430; border-radius:14px;'
      + 'max-width:640px; width:100%; max-height:88vh; overflow-y:auto; padding:24px;'
      + 'box-shadow:0 24px 60px rgba(0,0,0,.35);">'
      + '<h2 style="font-size:20px; font-weight:800; margin-bottom:6px;">' + esc(title) + '</h2>'
      + bodyHtml
      + '</div>';
    document.body.appendChild(wrap);

    // A required check is not dismissible by clicking away — that is the whole
    // point of it being required.
    if (!opts || !opts.required) {
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    }
    return wrap;
  }

  function open(sessionId, options) {
    var opts = options || {};
    if (!sessionId) return;

    shell('Quick check', '<p style="color:#5a6b7d;">Loading…</p>', opts);

    fetch('/api/course-sessions/' + encodeURIComponent(sessionId) + '/preassessment',
      { credentials: 'include' })
      .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, body: b }; }); })
      .then(function (r) {
        if (!r.ok) return renderUnavailable(r.body, opts);
        renderForm(sessionId, r.body, opts);
      })
      .catch(function () {
        renderUnavailable({ error: 'Could not load the check right now.' }, opts);
      });
  }

  function renderUnavailable(body, opts) {
    // Say why rather than showing an empty form. A course with too thin a bank
    // should not look broken.
    var msg = (body && (body.error || body.reason)) || 'This check is not available right now.';
    var wrap = shell('Quick check',
      '<p style="color:#5a6b7d; line-height:1.6; margin-bottom:16px;">' + esc(msg) + '</p>'
      + '<button id="cpa-close" style="padding:10px 18px; border:none; border-radius:8px;'
      + 'background:#4f46e5; color:#fff; font-weight:700; cursor:pointer;">Continue to the course</button>',
      Object.assign({}, opts, { required: false }));
    wrap.querySelector('#cpa-close').addEventListener('click', close);
  }

  function renderForm(sessionId, data, opts) {
    var items = (data.problems || []).map(function (p, i) {
      var field;
      if (Array.isArray(p.options) && p.options.length) {
        field = p.options.map(function (opt, j) {
          // Options are { label, text }. Rendering `opt` directly painted
          // "[object Object]" on every choice and submitted that string as the
          // answer — the same bug already fixed on the skill map. The label is
          // taken POSITIONALLY, matching how the server normalizes on serve and
          // resolves on grade; a letter read off the option can be stale from a
          // shuffle, and a wrong one here is silent.
          var id = 'cpa-' + i + '-' + j;
          var lab = String.fromCharCode(65 + j);
          var text = (opt && typeof opt === 'object') ? String(opt.text != null ? opt.text : '') : String(opt);
          return '<label for="' + id + '" style="display:flex; gap:8px; align-items:center; margin:4px 0; cursor:pointer;">'
            + '<input type="radio" id="' + id + '" name="cpa-q-' + esc(p.problemId) + '"'
            + ' data-problem-id="' + esc(p.problemId) + '" value="' + esc(lab) + '">'
            + '<span>' + esc(lab) + '. ' + esc(text) + '</span></label>';
        }).join('');
      } else {
        field = '<input type="text" class="cpa-answer" data-problem-id="' + esc(p.problemId) + '"'
          + ' aria-label="Your answer" placeholder="Your answer"'
          + ' style="width:100%; max-width:280px; padding:9px 11px; border:1px solid #cbd5e1; border-radius:8px; font-size:15px;">';
      }
      return '<li style="margin-bottom:18px;">'
        + '<div style="font-size:15px; margin-bottom:8px;">' + esc(p.prompt) + '</div>'
        + field + '</li>';
    }).join('');

    // Coverage is stated, not implied — this check does not see every skill in
    // the course, and claiming otherwise would misreport readiness.
    var coverage = data.skillsAssessed && data.totalCourseSkills
      ? '<p style="font-size:12px; color:#7a889a; margin-top:14px;">Checks '
        + data.skillsAssessed + ' of ' + data.totalCourseSkills + ' skills in this course.</p>'
      : '';

    var wrap = shell(data.title ? ('Quick check — ' + data.title) : 'Quick check',
      '<p style="color:#5a6b7d; line-height:1.6; margin-bottom:16px;">' + esc(data.instructions || '') + '</p>'
      + '<ol style="padding-left:20px;">' + items + '</ol>'
      + '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">'
      + '<button id="cpa-submit" style="padding:11px 20px; border:none; border-radius:8px;'
      + 'background:#4f46e5; color:#fff; font-weight:700; cursor:pointer;">Submit</button>'
      + (opts.required ? '' : '<button id="cpa-skip" style="padding:11px 18px; border:1px solid #cbd5e1;'
        + 'border-radius:8px; background:#fff; cursor:pointer;">Skip for now</button>')
      + '</div>'
      + '<p id="cpa-result" style="margin-top:14px; line-height:1.6;"></p>'
      + coverage, opts);

    var skip = wrap.querySelector('#cpa-skip');
    if (skip) skip.addEventListener('click', close);
    wrap.querySelector('#cpa-submit').addEventListener('click', function () {
      submit(sessionId, wrap);
    });
  }

  function collect(wrap) {
    var out = [];
    Array.prototype.forEach.call(wrap.querySelectorAll('.cpa-answer'), function (i) {
      out.push({ problemId: i.dataset.problemId, answer: i.value });
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('input[type=radio]:checked'), function (i) {
      out.push({ problemId: i.dataset.problemId, answer: i.value });
    });
    return out;
  }

  function submit(sessionId, wrap) {
    var submissions = collect(wrap);
    var out = wrap.querySelector('#cpa-result');
    if (!submissions.length) {
      out.textContent = 'Answer at least one question first — a blank check tells the course nothing.';
      return;
    }
    var btn = wrap.querySelector('#cpa-submit');
    btn.disabled = true;
    btn.textContent = 'Scoring…';

    fetch('/api/course-sessions/' + encodeURIComponent(sessionId) + '/preassessment', csrfOpts({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions: submissions })
    }))
      .then(function (res) { return res.json(); })
      .then(function (body) {
        var cleared = (body.clearedFromAbove || []).length;
        var credited = (body.credited || []).length;
        out.innerHTML = '<strong>' + esc(body.message || '') + '</strong>'
          + (cleared ? '<br><span style="color:#2e9268;">That also cleared ' + cleared
            + ' earlier skill' + (cleared === 1 ? '' : 's') + ' beneath them.</span>' : '')
          + (!credited ? '<br><span style="color:#7a889a;">Nothing cleared this time — the course will start from the beginning.</span>' : '');
        btn.remove();
        var done = document.createElement('button');
        done.textContent = 'Start the course';
        done.style.cssText = 'padding:11px 20px; border:none; border-radius:8px; background:#2e9268;'
          + 'color:#fff; font-weight:700; cursor:pointer; margin-top:12px;';
        done.addEventListener('click', function () {
          close();
          // The pre-assessment just retargeted the course (credited skills,
          // moved the start module). Begin teaching now — the greeting the enroll
          // flow held back fires here, adapted. Reload only as a fallback if the
          // course manager is not on the page.
          if (window.courseManager && typeof window.courseManager.onBaselineComplete === 'function') {
            window.courseManager.onBaselineComplete();
          } else {
            window.location.reload();
          }
        });
        out.parentNode.appendChild(done);
      })
      .catch(function () {
        out.textContent = 'Could not score that just now. Nothing was lost — try again.';
        btn.disabled = false;
        btn.textContent = 'Submit';
      });
  }

  window.openCoursePreAssessment = open;
  window.closeCoursePreAssessment = close;
}());
