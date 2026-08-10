/**
 * Student self-report — "How I learn best".
 *
 * Lets a student tell their tutor what they need, in their own words, without
 * going through a parent or a school. Third and lowest tier: anything a school
 * IEP or a parent already granted shows as already on rather than as something
 * to ask for.
 *
 * Only accessibility switches appear here. Calculator and times-table chart are
 * absent by design — those change how hard the work is, not how reachable it
 * is, and they stay with a parent or teacher (see utils/studentSupports.js).
 *
 * Usage:
 *   MMStudentSupports.mount(document.getElementById('student-supports-root'));
 *
 * Exposes window.MMStudentSupports.
 */
/* global csrfFetch */
(function () {
  'use strict';

  // Written in the student's voice on purpose. This is a kid saying what helps,
  // not a form describing a diagnosis.
  var SWITCHES = [
    { key: 'extendedTime',           label: 'Don’t rush me',                    hint: 'Take as long as I need.' },
    { key: 'chunkedAssignments',     label: 'A few problems at a time',              hint: 'Not a whole page at once.' },
    { key: 'audioReadAloud',         label: 'Read problems out loud',                hint: 'Easier than reading them myself.' },
    { key: 'mathAnxietySupport',     label: 'Math stresses me out',                  hint: 'Go gently. Mistakes are okay.' },
    { key: 'breaksAsNeeded',         label: 'Offer me breaks',                       hint: 'Check in when I’m running out of steam.' },
    { key: 'reducedDistraction',     label: 'Keep the screen simple',                hint: 'One thing at a time.' },
    { key: 'largePrintHighContrast', label: 'Bigger, higher-contrast text',          hint: 'Easier to see.' }
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

  function Widget(root) {
    this.root = root;
    this.state = null;
  }

  Widget.prototype.mount = function () {
    var self = this;
    this.root.innerHTML = '<p class="mm-ss-status">Loading…</p>';

    req('/api/student/supports')
      .then(function (r) {
        // Not a student account — nothing to show rather than an error.
        if (r.status === 403) { self.root.style.display = 'none'; return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d || !d.success) {
          self.root.innerHTML = '<p class="mm-ss-status">Couldn’t load this right now.</p>';
          return;
        }
        self.state = d;
        self.render();
      })
      .catch(function () {
        self.root.innerHTML = '<p class="mm-ss-status">Couldn’t load this right now.</p>';
      });
    return this;
  };

  Widget.prototype.render = function () {
    var self = this;
    var d = this.state;

    var rows = SWITCHES.map(function (s) {
      var granted = d.alreadyGranted[s.key] === true;
      var on = granted || d.supports[s.key] === true;
      var id = 'mm-ss-' + s.key;
      return '' +
        '<div class="mm-ss-row' + (granted ? ' is-granted' : '') + '">' +
          '<input type="checkbox" id="' + id + '" data-key="' + s.key + '"' +
            (on ? ' checked' : '') + (granted ? ' disabled' : '') + ' />' +
          '<label for="' + id + '">' +
            '<span class="mm-ss-label">' + esc(s.label) +
              (granted ? '<span class="mm-ss-tag">Already on</span>' : '') +
            '</span>' +
            '<span class="mm-ss-hint">' + esc(s.hint) + '</span>' +
          '</label>' +
        '</div>';
    }).join('');

    this.root.innerHTML =
      '<p class="mm-ss-intro">Tell your tutor what helps. It changes how every session goes, ' +
      'and you can change it whenever you want.</p>' +
      '<div class="mm-ss-rows">' + rows + '</div>' +
      '<p class="mm-ss-saved" role="status" aria-live="polite"></p>';

    Array.prototype.forEach.call(this.root.querySelectorAll('input[type="checkbox"]'), function (cb) {
      cb.addEventListener('change', function () { self.save(); });
    });
  };

  Widget.prototype.save = function () {
    var status = this.root.querySelector('.mm-ss-saved');
    var payload = {};

    Array.prototype.forEach.call(this.root.querySelectorAll('input[type="checkbox"]'), function (cb) {
      // A granted row belongs to a parent or the school; never claim it.
      if (!cb.disabled) payload[cb.dataset.key] = cb.checked === true;
    });

    status.textContent = 'Saving…';
    req('/api/student/supports', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        var ok = !!(d && d.success);
        status.textContent = ok ? 'Saved' : 'Couldn’t save';
        if (ok) setTimeout(function () { status.textContent = ''; }, 2000);
      })
      .catch(function () { status.textContent = 'Couldn’t save'; });
  };

  window.MMStudentSupports = {
    mount: function (root) {
      if (!root) return null;
      return new Widget(root).mount();
    }
  };
})();
