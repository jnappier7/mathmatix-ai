/**
 * In-chat CHALLENGE CARD (test-out / Fix B).
 *
 * When the student asks to prove they already know a skill, the pipeline sends
 * { launchChallenge: { skillId } } on the chat `complete` event and script.js
 * calls MMChallengeCard.launch(skillId). This renders a self-contained card in
 * the conversation: 5 problems, no hints, one submit. Grading + the rung proof
 * happen server-side (GET/POST /api/mastery/challenge/:skillId, proves
 * via:'challenge'); this file is only DOM + fetch. On a pass the skill is proved
 * and the cascade clears everything beneath it — we celebrate and nudge a refresh
 * of the progress surfaces. On a miss nothing is lost — we name the gap.
 */
(function () {
  'use strict';

  function csrf(options) {
    return (typeof addCsrfToken === 'function') ? addCsrfToken(options) : options;
  }

  function api(url, options) {
    var opts = Object.assign({ credentials: 'include' }, options || {});
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw Object.assign(new Error(body.error || 'Request failed'), { body: body, status: res.status });
        return body;
      });
    });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Render math if KaTeX auto-render is on the page; otherwise the text stands on
  // its own (prompts are plain enough to read either way).
  function typeset(node) {
    try { if (typeof window.renderMathInElement === 'function') window.renderMathInElement(node, { throwOnError: false }); } catch (_) {}
  }

  function answerField(problem) {
    if (Array.isArray(problem.options) && problem.options.length) {
      var wrap = el('div', 'mm-ch-options');
      problem.options.forEach(function (opt, i) {
        // Same fix as skill-map.js: options are { label, text } objects, the
        // student sees the text, and grading expects the LETTER back. The label
        // is POSITIONAL — the older banks key it as `id`/`letter` or omit it, and
        // trusting opt.label put the string "undefined" in the radio. The server
        // normalizes on serve now; this stays because a wrong label is silent.
        var isObj = opt && typeof opt === 'object';
        var optLabel = String.fromCharCode(65 + i);
        var optText = isObj ? String(opt.text != null ? opt.text : '') : String(opt);
        var id = 'mmch-' + problem.problemId + '-' + i;
        var label = el('label', 'mm-ch-option');
        label.htmlFor = id;
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = id;
        radio.name = 'mmch-' + problem.problemId;
        radio.value = optLabel;
        radio.dataset.problemId = problem.problemId;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(' ' + optLabel + '. ' + optText));
        wrap.appendChild(label);
      });
      return wrap;
    }
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'mm-ch-input';
    input.autocomplete = 'off';
    input.dataset.problemId = problem.problemId;
    input.setAttribute('aria-label', 'Your answer');
    return input;
  }

  function collect(card, problems) {
    return problems.map(function (p) {
      var sel = card.querySelector('input[name="mmch-' + p.problemId + '"]:checked');
      if (sel) return { problemId: p.problemId, answer: sel.value };
      var txt = card.querySelector('.mm-ch-input[data-problem-id="' + p.problemId + '"]');
      return { problemId: p.problemId, answer: txt ? txt.value.trim() : '' };
    });
  }

  function launch(skillId) {
    if (!skillId) return;
    var mount = document.getElementById('chat-messages-container') || document.getElementById('chat-messages');
    if (!mount) return;

    var card = el('div', 'mm-challenge-card');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Skill challenge');
    var head = el('div', 'mm-ch-head');
    head.appendChild(el('span', 'mm-ch-badge', '⚡ Challenge'));
    var title = el('div', 'mm-ch-title', 'Loading your challenge…');
    head.appendChild(title);
    card.appendChild(head);
    var sub = el('div', 'mm-ch-sub');
    card.appendChild(sub);
    var list = el('ol', 'mm-ch-list');
    card.appendChild(list);
    var footer = el('div', 'mm-ch-footer');
    card.appendChild(footer);
    mount.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    api('/api/mastery/challenge/' + encodeURIComponent(skillId)).then(function (data) {
      title.textContent = 'Prove it: ' + (data.label || 'this skill');
      sub.textContent = data.instructions || 'Five problems, no hints, one shot.';
      var problems = data.problems || [];
      problems.forEach(function (p) {
        var li = el('li', 'mm-ch-q');
        var prompt = el('div', 'mm-ch-prompt', p.prompt);
        li.appendChild(prompt);
        li.appendChild(answerField(p));
        list.appendChild(li);
      });
      typeset(card);

      var submit = el('button', 'mm-ch-submit', 'Submit challenge');
      submit.type = 'button';
      var cancel = el('button', 'mm-ch-cancel', 'Not now');
      cancel.type = 'button';
      cancel.addEventListener('click', function () { card.remove(); });
      footer.appendChild(submit);
      footer.appendChild(cancel);

      submit.addEventListener('click', function () {
        var submissions = collect(card, problems);
        if (submissions.some(function (s) { return !s.answer; })) {
          sub.textContent = 'Answer all five, then submit — no hints, but you get to finish it.';
          return;
        }
        submit.disabled = true;
        submit.textContent = 'Grading…';
        api('/api/mastery/challenge/' + encodeURIComponent(skillId), csrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissions: submissions })
        })).then(function (result) {
          renderResult(card, list, footer, result, skillId);
        }).catch(function (err) {
          submit.disabled = false;
          submit.textContent = 'Submit challenge';
          sub.textContent = (err && err.body && (err.body.error || err.body.message)) || 'Could not grade that — try again.';
        });
      });
    }).catch(function (err) {
      var body = (err && err.body) || {};
      // 409 = already proved, or too few problems in the bank for this skill.
      title.textContent = 'Challenge';
      sub.textContent = body.reason || body.error || 'Could not start a challenge for this skill right now.';
      var ok = el('button', 'mm-ch-cancel', 'Got it');
      ok.type = 'button';
      ok.addEventListener('click', function () { card.remove(); });
      footer.appendChild(ok);
    });
  }

  function renderResult(card, list, footer, result, skillId) {
    list.innerHTML = '';
    footer.innerHTML = '';
    card.classList.add(result.passed ? 'is-pass' : 'is-miss');
    var res = el('div', 'mm-ch-result');
    if (result.passed) {
      res.appendChild(el('div', 'mm-ch-result-big', '🎉 Proved it!'));
      res.appendChild(el('div', 'mm-ch-result-sub',
        (result.correct != null ? result.correct + ' of ' + result.total + ' — ' : '') +
        'this skill is yours. Nice.'));
      // Nudge the progress surfaces to re-read (the bar just moved to mastered).
      try { if (typeof window.refreshResumeCard === 'function') window.refreshResumeCard(); } catch (_) {}
      try { if (window.MM_XP && typeof window.MM_XP.celebrate === 'function') window.MM_XP.celebrate(); } catch (_) {}
      document.dispatchEvent(new CustomEvent('mm:skill-proved', { detail: { skillId: skillId } }));
    } else {
      res.appendChild(el('div', 'mm-ch-result-big', 'Found the gap'));
      res.appendChild(el('div', 'mm-ch-result-sub',
        (result.correct != null ? result.correct + ' of ' + result.total + '. ' : '') +
        (result.message || "Let's close it together — nothing lost.")));
    }
    card.appendChild(res);
    var done = el('button', 'mm-ch-cancel', result.passed ? 'Keep going' : 'Let’s work on it');
    done.type = 'button';
    done.addEventListener('click', function () { card.remove(); });
    footer.appendChild(done);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  window.MMChallengeCard = { launch: launch };
})();
