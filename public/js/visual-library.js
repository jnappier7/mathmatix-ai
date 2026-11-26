/* /visual-library — browse every picture and interactive Mathmatix draws
   itself (GET /api/images/library ← utils/visualLibrary.js). Pictures open
   full size on a click; an item with a hands-on version has "Explore it". */
(function () {
  'use strict';
  var main = document.getElementById('vl-main');
  var box = document.getElementById('vl-q');
  var LWS = window.LWS || {};
  var items = [];

  function note(text) { main.textContent = ''; var p = document.createElement('p'); p.className = 'vl-note'; p.textContent = text; main.appendChild(p); }

  function card(it) {
    var el = document.createElement('article'); el.className = 'vl-card'; el.id = 'vl-' + it.id;
    var img = document.createElement('img'); img.className = 'vl-pic'; img.src = it.url; img.alt = it.title + ': ' + it.blurb; img.loading = 'lazy';
    if (LWS.ImageElement) LWS.ImageElement.enlargeable(img, { src: it.url, alt: img.alt, caption: it.title });
    var h = document.createElement('h3'); h.textContent = it.title;
    var p = document.createElement('p'); p.textContent = it.blurb;
    el.appendChild(img);
    var IX = LWS.Interactives;
    if (it.widget && IX && IX.has(it.widget)) {
      var stage = document.createElement('div'); stage.hidden = true;
      var bar = document.createElement('div'); bar.className = 'lws-image-actions';
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'lws-image-explore'; btn.textContent = 'Explore it'; btn.setAttribute('aria-pressed', 'false');
      var open = false;
      btn.addEventListener('click', function () {
        open = !open;
        if (open && !stage.firstChild) IX.mount(it.widget, stage);
        img.hidden = open; stage.hidden = !open;
        btn.textContent = open ? 'Back to the picture' : 'Explore it'; btn.setAttribute('aria-pressed', open ? 'true' : 'false');
      });
      var tag = document.createElement('span'); tag.className = 'vl-tag'; tag.textContent = 'Hands-on';
      el.appendChild(stage); el.appendChild(tag); el.appendChild(h); el.appendChild(p); bar.appendChild(btn); el.appendChild(bar);
    } else { el.appendChild(h); el.appendChild(p); }
    return el;
  }

  function draw() {
    var q = (box.value || '').toLowerCase().trim();
    var words = q.split(/\s+/).filter(Boolean);
    var shown = items.filter(function (it) {
      var hay = (it.title + ' ' + it.blurb + ' ' + it.topic).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    main.textContent = '';
    if (!shown.length) { note('Nothing in the library matches “' + box.value + '”.'); return; }
    var topics = [];
    shown.forEach(function (it) { if (topics.indexOf(it.topic) === -1) topics.push(it.topic); });
    topics.forEach(function (t) {
      var h = document.createElement('h2'); h.className = 'vl-topic'; h.textContent = t; main.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'vl-grid';
      shown.filter(function (it) { return it.topic === t; }).forEach(function (it) { grid.appendChild(card(it)); });
      main.appendChild(grid);
    });
  }

  fetch('/api/images/library', { credentials: 'same-origin' })
    .then(function (r) { if (r.status === 401 || r.status === 403) throw new Error('signin'); if (!r.ok) throw new Error('load'); return r.json(); })
    .then(function (data) { items = (data && data.items) || []; draw(); })
    .catch(function (e) { note(e.message === 'signin' ? 'Sign in to see the visual library.' : 'The library could not be loaded. Try again in a moment.'); });
  box.addEventListener('input', draw);
})();
