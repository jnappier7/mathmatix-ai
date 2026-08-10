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

  // The three a parent can answer without a diagnosis, and the three that
  // change the tutoring most visibly. Asked on first run so a new family gets
  // a tutor tuned to their child in session one rather than whenever somebody
  // happens to find this panel.
  var QUICK_START = ['extendedTime', 'chunkedAssignments', 'mathAnxietySupport'];

  var QUICK_QUESTIONS = {
    extendedTime:       'Does it help if nobody rushes them?',
    chunkedAssignments: 'Do they do better with a few problems at a time?',
    mathAnxietySupport: 'Does math stress them out?'
  };

  function Supports(root) {
    this.root = root;
    this.children = [];
    this.activeChildId = null;
    this.saveTimer = null;
    this.showAllFor = {};   // childId -> skip the quick start for this child
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

  /* First run — three questions instead of nine switches.
     updatedAt is null until a parent has saved something, which is the only
     honest signal we have that this child was never set up. */
  Supports.prototype.renderQuickStart = function () {
    var self = this;
    var d = this.state;
    var body = this.root.querySelector('.mm-ls-body');
    var name = esc(d.childName || 'your child');
    // The quick start carries its own lead; the standing intro would just
    // repeat it.
    this.root.classList.add('mm-ls-first-run');

    var rows = QUICK_START.map(function (key) {
      // A switch the school already set is not a question — it is settled.
      if (d.lockedBySchool[key] === true) return '';
      var id = 'mm-qs-' + key;
      return '' +
        '<div class="mm-ls-row">' +
          '<input type="checkbox" id="' + id + '" data-key="' + key + '" />' +
          '<label for="' + id + '"><span class="mm-ls-label">' + esc(QUICK_QUESTIONS[key]) + '</span></label>' +
        '</div>';
    }).join('');

    body.innerHTML =
      '<div class="mm-ls-quickstart">' +
        '<p class="mm-ls-qs-lead"><strong>Help ' + name + '&rsquo;s tutor start strong.</strong> ' +
          'Three quick questions &mdash; they change how every session runs.</p>' +
        '<div class="mm-ls-rows">' + rows + '</div>' +
        '<div class="mm-ls-qs-actions">' +
          '<button type="button" class="mm-ls-qs-save">Save &amp; start</button>' +
          '<button type="button" class="mm-ls-qs-all">See all options</button>' +
        '</div>' +
        '<p class="mm-ls-saved" role="status" aria-live="polite"></p>' +
      '</div>';

    body.querySelector('.mm-ls-qs-save').addEventListener('click', function () {
      var payload = {};
      Array.prototype.forEach.call(body.querySelectorAll('input[type="checkbox"]'), function (cb) {
        payload[cb.dataset.key] = cb.checked === true;
      });
      self.persist(payload, body.querySelector('.mm-ls-saved'), function () {
        // Saving is what retires the quick start — updatedAt is now set.
        self.showAllFor[self.activeChildId] = true;
        self.loadChild();
      });
    });

    body.querySelector('.mm-ls-qs-all').addEventListener('click', function () {
      self.showAllFor[self.activeChildId] = true;
      self.renderSwitches();
    });
  };

  Supports.prototype.renderSwitches = function () {
    var self = this;
    var d = this.state;
    var body = this.root.querySelector('.mm-ls-body');

    if (!d.updatedAt && !this.showAllFor[this.activeChildId]) {
      return this.renderQuickStart();
    }
    this.root.classList.remove('mm-ls-first-run');

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

  /* One write path for both the quick start and the full panel. */
  Supports.prototype.persist = function (payload, status, onSaved) {
    if (status) status.textContent = 'Saving…';
    return req('/api/parent/child/' + encodeURIComponent(this.activeChildId) + '/supports', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        var ok = !!(d && d.success);
        if (status) {
          status.textContent = ok ? 'Saved' : 'Could not save';
          if (ok) setTimeout(function () { status.textContent = ''; }, 2000);
        }
        if (ok && onSaved) onSaved(d);
      })
      .catch(function () { if (status) status.textContent = 'Could not save'; });
  };

  Supports.prototype.save = function () {
    var body = this.root.querySelector('.mm-ls-body');
    var payload = {};

    Array.prototype.forEach.call(body.querySelectorAll('input[type="checkbox"]'), function (cb) {
      // Locked rows are the school's; never send them back as ours.
      if (!cb.disabled) payload[cb.dataset.key] = cb.checked === true;
    });
    payload.note = body.querySelector('.mm-ls-note').value;

    this.persist(payload, body.querySelector('.mm-ls-saved'));
  };

  /* Called after a child is linked, so the setup prompt is where the parent is
     already looking instead of somewhere further down the page. */
  Supports.prototype.focus = function () {
    var self = this;
    this.mount();
    setTimeout(function () {
      self.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
      self.root.classList.add('mm-ls-flash');
      setTimeout(function () { self.root.classList.remove('mm-ls-flash'); }, 2200);
    }, 400);
  };

  var instance = null;

  window.MMLearningSupports = {
    mount: function (root) {
      if (!root) return null;
      instance = new Supports(root);
      return instance.mount();
    },
    /* Bring the setup prompt to the parent after they link a child. */
    focusSetup: function () { if (instance) instance.focus(); }
  };
})();
