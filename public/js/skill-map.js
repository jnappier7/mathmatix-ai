/**
 * SKILL MAP — "Your climb".
 *
 * Six strand towers, one band per course level, filling bottom-up. A pattern is a
 * vertical thread you can trace: unit rate sits in the PRP column at MS, slope is
 * the same column at ALG1, derivative-in-context is the same column at CALC. That
 * layout IS the "see the patterns" argument — the previous force-directed
 * constellation scattered exactly the relationship the product is built on.
 *
 * Reads GET /api/mastery/map, which is built from the real prerequisite graph the
 * closure engine reasons over. The old /api/mastery/skill-graph built nodes from a
 * hardcoded pattern config and edges from a hardcoded prerequisite map, so what a
 * student saw and what the system would actually unlock could disagree.
 *
 * Pure view logic lives in skillMapModel.js and is unit-tested; this file is DOM,
 * fetch, and the two proof runners.
 */
(function () {
  'use strict';

  var M = window.SkillMapModel;
  var $ = function (id) { return document.getElementById(id); };

  var state = { skills: [], byId: {}, nearest: null, current: null, teach: null };

  // ── data ────────────────────────────────────────────────────────────
  function withCsrf(options) {
    return (typeof addCsrfToken === 'function') ? addCsrfToken(options) : options;
  }

  function api(url, options) {
    var opts = Object.assign({ credentials: 'include' }, options || {});
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) { window.location.href = '/login.html'; throw new Error('unauthenticated'); }
      return res.json().then(function (body) {
        if (!res.ok) throw Object.assign(new Error(body.error || 'Request failed'), { body: body, status: res.status });
        return body;
      });
    });
  }

  function load() {
    setStatus('Loading your map…');
    return api('/api/mastery/map').then(function (data) {
      if (!data.seeded) {
        // Say so plainly. An empty board reads as "you have done nothing"
        // rather than "nothing is set up in this environment".
        setStatus('The skill map has not been set up for this environment yet.');
        return;
      }
      state.skills = data.skills || [];
      state.byId = {};
      state.skills.forEach(function (s) { state.byId[s.skillId] = s; });
      state.nearest = data.nearest || null;
      setStatus('');
      render(data);
    }).catch(function (err) {
      if (err && err.message === 'unauthenticated') return;
      setStatus('Could not load your map. Refresh to try again.');
    });
  }

  function setStatus(text) {
    var el = $('status');
    el.textContent = text || '';
    el.hidden = !text;
  }

  // ── render ──────────────────────────────────────────────────────────
  function render(data) {
    var counts = M.summarize(data);
    $('t-proved').textContent = counts.proved;
    $('t-taught').textContent = counts.taught;
    $('t-open').textContent = counts.open;

    renderTowers();
    renderHook();
    $('board').hidden = false;
    $('legend').hidden = false;
  }

  function renderTowers() {
    var towers = $('towers');
    var levels = M.activeLevels(state.skills);
    var grid = M.buildGrid(state.skills);
    var totals = M.strandTotals(state.skills);

    towers.innerHTML = '';
    towers.style.gridTemplateColumns = '64px repeat(' + M.STRANDS.length + ', 1fr)';

    towers.appendChild(el('div', 'spacer'));
    M.STRANDS.forEach(function (strand) {
      var t = totals[strand.key] || { total: 0, owned: 0 };
      var pct = t.total ? Math.round((t.owned / t.total) * 100) : 0;
      var head = el('div', 'colhead strand-' + strand.key.toLowerCase());
      head.innerHTML =
        '<span class="code">' + strand.key + '</span>' +
        '<span class="nm">' + escapeHtml(strand.name) + '</span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span>';
      head.title = strand.name + ' — ' + t.owned + ' of ' + t.total;
      towers.appendChild(head);
    });

    // Highest level at the top, so the board reads as a climb.
    levels.slice().reverse().forEach(function (level) {
      var lab = el('div', 'bandlabel');
      lab.textContent = level;
      towers.appendChild(lab);

      M.STRANDS.forEach(function (strand) {
        var band = el('div', 'band strand-' + strand.key.toLowerCase());
        (grid.get(level + '|' + strand.key) || []).forEach(function (skill) {
          band.appendChild(cell(skill));
        });
        towers.appendChild(band);
      });
    });
  }

  function cell(skill) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell s-' + skill.state;
    b.dataset.skillId = skill.skillId;
    b.title = skill.label + ' — ' + (M.STATE_LABEL[skill.state] || skill.state);
    b.setAttribute('aria-label', b.title);
    if (!M.isActionable(skill.state)) b.disabled = true;
    b.addEventListener('click', function () { openSkill(skill.skillId); });
    return b;
  }

  function renderHook() {
    var text = M.hookText(state.nearest);
    var hook = $('hook');
    if (!text) { hook.hidden = true; return; }
    $('hook-text').textContent = text;
    hook.hidden = false;
    var target = state.nearest.nextSkillId;
    $('hook-btn').onclick = function () { openSkill(target); };
    highlightTarget(target);
  }

  function highlightTarget(skillId) {
    Array.prototype.forEach.call(document.querySelectorAll('.cell.target'), function (c) {
      c.classList.remove('target');
    });
    var cellEl = document.querySelector('.cell[data-skill-id="' + cssEscape(skillId) + '"]');
    if (cellEl) cellEl.classList.add('target');
  }

  // ── drawer ──────────────────────────────────────────────────────────
  function openSkill(skillId) {
    var skill = state.byId[skillId];
    if (!skill || !M.isActionable(skill.state)) return;
    state.current = skill;

    $('d-label').textContent = skill.label;
    $('d-meta').textContent = [skill.skillId, skill.courseLevel, M.strandName(skill.strand)].join(' · ')
      + (skill.formalName && skill.formalName !== skill.label ? ' · ' + skill.formalName : '');
    $('d-state').textContent = stateSentence(skill);

    var proofs = $('d-proofs');
    proofs.innerHTML = '';
    M.rungOptions(skill).forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'proof';
      b.innerHTML = '<h3>' + escapeHtml(opt.label) + '</h3><p>' + escapeHtml(opt.hint) + '</p>';
      b.addEventListener('click', function () { chooseRung(opt.key, skill); });
      proofs.appendChild(b);
    });

    hide('runner'); hide('teach');
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
  }

  function stateSentence(skill) {
    switch (skill.state) {
      case 'taught': return 'You have taught this one. Top of the ladder.';
      case 'proved': return 'Proved. One rung left.';
      case 'above': return 'Cleared from above when you proved something higher up. Prove it directly to unlock teaching.';
      case 'learned': return 'You have worked through this. Prove it when you are ready.';
      default: return 'Every prerequisite is done — you can start this now.';
    }
  }

  function closeDrawer() {
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    state.current = null;
    state.teach = null;
  }

  function chooseRung(key, skill) {
    if (key === 'learn') {
      window.location.href = '/chat.html?skill=' + encodeURIComponent(skill.skillId);
      return;
    }
    if (key === 'challenge') return startChallenge(skill);
    if (key === 'teach') return startTeachBack(skill);
  }

  // ── challenge runner ────────────────────────────────────────────────
  function startChallenge(skill) {
    hide('teach');
    var runner = $('runner');
    $('runner-sub').textContent = 'Loading…';
    $('runner-qs').innerHTML = '';
    $('runner-result').hidden = true;
    runner.hidden = false;

    api('/api/mastery/challenge/' + encodeURIComponent(skill.skillId)).then(function (data) {
      $('runner-sub').textContent = data.instructions || '';
      var list = $('runner-qs');
      list.innerHTML = '';
      (data.problems || []).forEach(function (p) {
        var li = document.createElement('li');
        var prompt = el('div', 'q-prompt');
        prompt.textContent = p.prompt;
        li.appendChild(prompt);
        li.appendChild(answerField(p));
        list.appendChild(li);
      });
    }).catch(function (err) {
      var body = (err && err.body) || {};
      // Too few items in the bank, or the skill is already proved — give the
      // reason instead of a dead form.
      $('runner-sub').textContent = body.reason || body.error || 'Could not start a challenge for this skill.';
    });
  }

  function answerField(problem) {
    if (Array.isArray(problem.options) && problem.options.length) {
      var wrap = el('div', 'q-options');
      problem.options.forEach(function (opt, i) {
        var id = 'opt-' + problem.problemId + '-' + i;
        var label = document.createElement('label');
        label.className = 'q-option';
        label.htmlFor = id;
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = id;
        radio.name = 'q-' + problem.problemId;
        radio.value = opt;
        radio.dataset.problemId = problem.problemId;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(' ' + opt));
        wrap.appendChild(label);
      });
      return wrap;
    }
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'q-input';
    input.dataset.problemId = problem.problemId;
    input.setAttribute('aria-label', 'Your answer');
    input.placeholder = 'Your answer';
    return input;
  }

  function collectSubmissions() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#runner-qs .q-input'), function (i) {
      out.push({ problemId: i.dataset.problemId, answer: i.value });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#runner-qs input[type=radio]:checked'), function (i) {
      out.push({ problemId: i.dataset.problemId, answer: i.value });
    });
    return out;
  }

  function submitChallenge() {
    if (!state.current) return;
    var submissions = collectSubmissions();
    if (!submissions.length) return;
    var btn = $('runner-submit');
    btn.disabled = true;

    api('/api/mastery/challenge/' + encodeURIComponent(state.current.skillId), withCsrf({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions: submissions })
    })).then(function (res) {
      var out = $('runner-result');
      out.hidden = false;
      out.textContent = res.message || '';
      out.className = 'runner-result ' + (res.passed ? 'good' : 'miss');
      if (res.passed) {
        var cleared = (res.clearedFromAbove || []).length;
        toast(cleared ? '+' + cleared : 'Proved', cleared ? 'cleared from above' : 'rung 2 of 3');
        setTimeout(function () { closeDrawer(); load(); }, 1400);
      }
    }).catch(function () {
      var out = $('runner-result');
      out.hidden = false;
      out.className = 'runner-result miss';
      out.textContent = 'Could not score that run. Nothing was lost — try again.';
    }).then(function () { btn.disabled = false; });
  }

  // ── teach-back ──────────────────────────────────────────────────────
  function startTeachBack(skill) {
    hide('runner');
    var panel = $('teach');
    $('teach-prompt').textContent = 'Loading…';
    $('teach-input').value = '';
    $('teach-result').hidden = true;
    panel.hidden = false;

    api('/api/mastery/teachback/' + encodeURIComponent(skill.skillId)).then(function (data) {
      state.teach = data;
      $('teach-prompt').textContent = data.eligible
        ? data.opener
        : (data.reason || 'Not eligible to teach this yet.');
      $('teach-submit').disabled = !data.eligible;
    }).catch(function () {
      $('teach-prompt').textContent = 'Could not start a teach-back right now.';
      $('teach-submit').disabled = true;
    });
  }

  function submitTeachBack() {
    if (!state.current) return;
    var explanation = $('teach-input').value.trim();
    if (!explanation) return;
    var btn = $('teach-submit');
    btn.disabled = true;

    api('/api/mastery/teachback/' + encodeURIComponent(state.current.skillId), withCsrf({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        explanation: explanation,
        misconception: (state.teach && state.teach.misconception) || undefined
      })
    })).then(function (res) {
      var out = $('teach-result');
      out.hidden = false;
      // A scorer outage is neither a pass nor a fail — say exactly that, and
      // change nothing on the board.
      if (!res.scored) {
        out.className = 'runner-result';
        out.textContent = res.message || 'Could not grade that just now — try again.';
        return;
      }
      out.className = 'runner-result ' + (res.passed ? 'good' : 'miss');
      out.textContent = (res.message || '') + (res.feedback ? ' ' + res.feedback : '');
      if (res.passed) {
        toast('Taught it', 'rung 3 — rarest');
        setTimeout(function () { closeDrawer(); load(); }, 1600);
      }
    }).catch(function () {
      var out = $('teach-result');
      out.hidden = false;
      out.className = 'runner-result';
      out.textContent = 'Could not grade that just now — try again.';
    }).then(function () { btn.disabled = false; });
  }

  // ── helpers ─────────────────────────────────────────────────────────
  function el(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
  function hide(id) { $(id).hidden = true; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  var toastTimer = null;
  function toast(big, sub) {
    $('toast-big').textContent = big;
    $('toast-sub').textContent = sub || '';
    var t = $('toast');
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('on');
      setTimeout(function () { t.hidden = true; }, 300);
    }, 2200);
  }

  // ── wire up ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    $('d-close').addEventListener('click', closeDrawer);
    $('runner-cancel').addEventListener('click', function () { hide('runner'); });
    $('teach-cancel').addEventListener('click', function () { hide('teach'); });
    $('runner-submit').addEventListener('click', submitChallenge);
    $('teach-submit').addEventListener('click', submitTeachBack);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
    load();
  });
}());
