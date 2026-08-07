/**
 * Parent-facing learning supports.
 *
 * Lets a parent tell the tutor how their child works best — extra time, chunked
 * problems, read-aloud and so on. These are stored separately from the school's
 * IEP, which only a teacher can write; any switch the school already owns
 * renders locked here rather than pretending a parent can change it.
 *
 * Deliberately avoids the word "IEP" as a thing the parent is editing. An IEP is
 * a legal document authored by a school team; this is a family preference.
 *
 * Usage:
 *   MMLearningSupports.mount(document.getElementById('learning-supports-root'));
 *
 * Exposes window.MMLearningSupports.
 */
/* global csrfFetch */
(function () {
  'use strict';

  // Order and wording are parent-facing on purpose — plain language, and each
  // one says what it actually changes about the tutoring.
  var SWITCHES = [
    { key: 'extendedTime',               label: 'Give extra time',            hint: 'The tutor never rushes or pushes to move on.' },
    { key: 'chunkedAssignments',         label: 'Work in small chunks',       hint: 'Three to five problems at a time, then a check-in.' },
    { key: 'audioReadAloud',             label: 'Read problems aloud',        hint: 'Plainer wording, easier to follow when read out.' },
    { key: 'breaksAsNeeded',             label: 'Offer breaks',               hint: 'The tutor suggests a break when energy dips.' },
    { key: 'mathAnxietySupport',         label: 'Go gently with anxiety',     hint: 'Extra encouragement; mistakes treated as normal.' },
    { key: 'calculatorAllowed',          label: 'Allow a calculator',         hint: 'Focus on strategy instead of arithmetic.' },
    { key: 'digitalMultiplicationChart', label: 'Allow a times-table chart',  hint: 'Using one is never treated as cheating.' },
    { key: 'reducedDistraction',         label: 'Keep it uncluttered',        hint: 'One idea at a time, cleaner visuals.' },
    { key: 'largePrintHighContrast',     label: 'Large, high-contrast text',  hint: 'Bigger type and stronger contrast.' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function req(url, opts) {
    if (opts && opts.method && opts.method !== 'GET' && typeof csrfFetch === 'function') {
      return csrfFetch(url, opts);
    }
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
  }

  function Supports(root) {
    this.root = root;
    this.children = [];
    this.activeChildId = null;
    this.saveTimer = null;
  }

  Supports.prototype.mount = function () {
    var self = this;
    this.root.innerHTML = '<p class="mm-ls-status">Loading…</p>';

    req('/api/parent/children')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (kids) {
        self.children = Array.isArray(kids) ? kids : [];
        if (!self.children.length) {
          self.root.innerHTML = '<p class="mm-ls-status">Link a child to set up their learning supports.</p>';
          return;
        }
        self.activeChildId = String(self.children[0]._id);
        self.renderShell();
        self.loadChild();
      })
      .catch(function () {
        self.root.innerHTML = '<p class="mm-ls-status">Could not load your children.</p>';
      });
    return this;
  };

  Supports.prototype.renderShell = function () {
    var self = this;
    var picker = '';
    if (this.children.length > 1) {
      picker = '<div class="mm-ls-kids">' + this.children.map(function (k) {
        var on = String(k._id) === self.activeChildId ? ' is-active' : '';
        return '<button type="button" class="mm-ls-kid' + on + '" data-id="' + esc(k._id) + '">' +
               esc(k.firstName) + '</button>';
      }).join('') + '</div>';
    }

    this.root.innerHTML =
      '<p class="mm-ls-intro">Tell the tutor how your child works best. These apply to every session, ' +
      'and you can change them any time.</p>' +
      picker +
      '<div class="mm-ls-body"><p class="mm-ls-status">Loading…</p></div>';

    Array.prototype.forEach.call(this.root.querySelectorAll('.mm-ls-kid'), function (btn) {
      btn.addEventListener('click', function () {
        self.activeChildId = btn.dataset.id;
        Array.prototype.forEach.call(self.root.querySelectorAll('.mm-ls-kid'), function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        self.loadChild();
      });
    });
  };

  Supports.prototype.loadChild = function () {
    var self = this;
    var body = this.root.querySelector('.mm-ls-body');
    body.innerHTML = '<p class="mm-ls-status">Loading…</p>';

    req('/api/parent/child/' + encodeURIComponent(this.activeChildId) + '/supports')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.success) {
          body.innerHTML = '<p class="mm-ls-status">Could not load these settings.</p>';
          return;
        }
        self.state = d;
        self.renderSwitches();
      })
      .catch(function () {
        body.innerHTML = '<p class="mm-ls-status">Could not load these settings.</p>';
      });
  };

  Supports.prototype.renderSwitches = function () {
    var self = this;
    var d = this.state;
    var body = this.root.querySelector('.mm-ls-body');

    var rows = SWITCHES.map(function (s) {
      var locked = d.lockedBySchool[s.key] === true;
      var on = locked || d.supports[s.key] === true;
      var id = 'mm-ls-' + s.key;
      return '' +
        '<div class="mm-ls-row' + (locked ? ' is-locked' : '') + '">' +
          '<input type="checkbox" id="' + id + '" data-key="' + s.key + '"' +
            (on ? ' checked' : '') + (locked ? ' disabled' : '') + ' />' +
          '<label for="' + id + '">' +
            '<span class="mm-ls-label">' + esc(s.label) +
              (locked ? '<span class="mm-ls-tag">Set by school</span>' : '') +
            '</span>' +
            '<span class="mm-ls-hint">' + esc(s.hint) + '</span>' +
          '</label>' +
        '</div>';
    }).join('');

    var schoolNote = d.hasSchoolIep
      ? '<p class="mm-ls-schoolnote">Some supports come from ' + esc(d.childName) +
        '&rsquo;s school plan. Those are shown locked &mdash; the school owns them, ' +
        'and the tutor already follows them.</p>'
      : '';

    body.innerHTML =
      schoolNote +
      '<div class="mm-ls-rows">' + rows + '</div>' +
      '<label class="mm-ls-notelabel" for="mm-ls-note">Anything else the tutor should know?</label>' +
      '<textarea id="mm-ls-note" class="mm-ls-note" rows="2" maxlength="500" ' +
        'placeholder="e.g. She freezes on timed work.">' + esc(d.note || '') + '</textarea>' +
      '<p class="mm-ls-saved" role="status" aria-live="polite"></p>';

    Array.prototype.forEach.call(body.querySelectorAll('input[type="checkbox"]'), function (cb) {
      cb.addEventListener('change', function () { self.save(); });
    });
    body.querySelector('.mm-ls-note').addEventListener('input', function () {
      clearTimeout(self.saveTimer);
      self.saveTimer = setTimeout(function () { self.save(); }, 800);
    });
  };

  Supports.prototype.save = function () {
    var self = this;
    var body = this.root.querySelector('.mm-ls-body');
    var status = body.querySelector('.mm-ls-saved');
    var payload = {};

    Array.prototype.forEach.call(body.querySelectorAll('input[type="checkbox"]'), function (cb) {
      // Locked rows are the school's; never send them back as ours.
      if (!cb.disabled) payload[cb.dataset.key] = cb.checked === true;
    });
    payload.note = body.querySelector('.mm-ls-note').value;

    status.textContent = 'Saving…';
    req('/api/parent/child/' + encodeURIComponent(this.activeChildId) + '/supports', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        status.textContent = (d && d.success) ? 'Saved' : 'Could not save';
        if (d && d.success) setTimeout(function () { status.textContent = ''; }, 2000);
      })
      .catch(function () { status.textContent = 'Could not save'; });
    void self;
  };

  window.MMLearningSupports = {
    mount: function (root) {
      if (!root) return null;
      return new Supports(root).mount();
    }
  };
})();
