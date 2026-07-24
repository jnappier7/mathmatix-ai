/* ============================================================
   playerStatsCard.js — full profile card for the chat right rail, built
   to match the profile mockup: a gradient Level/XP hero with a trophy,
   colored stat tiles, "Skills Recently Mastered" and "What's Next?" rows,
   and a CTA banner. Replaces the plain avatar+name player card.

   WHY a window-global IIFE (not an ES module): script.js populates the
   avatar (#sidebar-avatar-panel) and name (#cr-player-name) inline in
   setupChatUI once window.currentUser is loaded, then calls
   window.PlayerStatsCard.init(currentUser) — no import threading needed.
   Mirrors avatarFullBody.js / boardCommandHandler.js.

   DATA (see the data audit that preceded this):
   - Hero + band read window.currentUser (level, xp, xpForCurrentLevel/
     NextLevel, dailyQuests.currentStreak) — already loaded, instant.
   - Tiles' accuracy/solved and the skills sections come from ONE
     GET /api/student/progress/summary (the same bundle the student
     dashboard uses; display-ready names, so we never title-case a raw id).

   NO FABRICATION: the mockup's "top X% of learners" and weekly
   time-practiced have no real source here, so they are replaced with real,
   motivating copy (XP-to-next-level) / omitted. accuracy is null until ≥5
   graded problems in-window — shown as "—", never faked.
   ============================================================ */
(function (root) {
  'use strict';

  var SUMMARY_URL = '/api/student/progress/summary';
  var summaryCache = null;
  var summaryPending = null;
  var mounted = false;
  var lastUser = null;

  function h(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function num(v, f) { var n = Number(v); return Number.isFinite(n) ? n : (f == null ? 0 : f); }
  function txt(el, s) { if (el) el.textContent = (s == null ? '' : String(s)); }

  // Friendly level-tier title (cosmetic label, not a data claim).
  function rankFor(level) {
    var l = num(level, 1);
    if (l >= 40) return 'Math Master';
    if (l >= 25) return 'Math Explorer';
    if (l >= 15) return 'Problem Solver';
    if (l >= 6) return 'Rising Star';
    return 'Rookie';
  }
  function streakSub(d) { d = num(d); return d >= 14 ? 'On fire!' : d >= 5 ? 'Keep it up!' : d >= 1 ? 'Nice start!' : 'Start today!'; }
  function accSub(a) { if (a == null) return 'Warming up'; return a >= 90 ? 'Amazing!' : a >= 75 ? 'Great work!' : a >= 60 ? 'Getting there' : 'Keep going'; }
  function solvedSub(n) { n = num(n); return n >= 100 ? 'Excellent!' : n >= 25 ? 'Great pace!' : n >= 1 ? 'Keep going!' : 'Let’s begin'; }
  function shortDate(iso) {
    if (!iso) return '';
    try { var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (_) { return ''; }
  }

  function heroData(user) {
    var cur = num(user && user.xpForCurrentLevel, 0);
    var need = num(user && user.xpForNextLevel, 100);
    var pct = need > 0 ? Math.max(0, Math.min(100, (cur / need) * 100)) : 0;
    var level = num(user && user.level, 1);
    return { cur: cur, need: need, pct: pct, level: level, remaining: Math.max(0, need - cur) };
  }
  function streakOf(user) { return num(user && user.dailyQuests && user.dailyQuests.currentStreak, 0); }

  // ── scaffold: turn the docked card into a Board/Me switcher + build the
  //    profile overlay that holds the full card. Idempotent. ────────────────
  var elProfile = null;
  function scaffold(host) {
    if (elProfile && document.body.contains(elProfile)) return elProfile;
    var region = host.closest('#cr-workspace') || host.parentNode || host;
    if (getComputedStyle(region).position === 'static') region.style.position = 'relative';

    // The profile overlay (fills the rail above the switcher, hidden by default).
    elProfile = document.getElementById('psc-profile');
    if (!elProfile) {
      elProfile = h('div', 'psc-profile');
      elProfile.id = 'psc-profile';
      elProfile.hidden = true;
      elProfile.setAttribute('role', 'tabpanel');
      elProfile.setAttribute('aria-label', 'My progress');
      elProfile.appendChild(h('div', 'psc-full'));
      region.appendChild(elProfile);
    }

    // Turn #cr-player-card into the segmented switcher. Move the avatar/name
    // that script.js filled into the profile header first.
    var name = host.querySelector('#cr-player-name');
    if (name) { host._pscName = (name.textContent || ''); if (name.parentNode) name.parentNode.removeChild(name); }
    var avatar = host.querySelector('#sidebar-avatar-panel');
    if (avatar) { host._pscAvatar = avatar; if (avatar.parentNode) avatar.parentNode.removeChild(avatar); }

    if (!host.classList.contains('psc-toggle')) {
      host.classList.add('psc-toggle');
      host.classList.remove('psc-card', 'cr-player-card');   // shed old centered-column styling
      host.textContent = '';
      var segBoard = h('button', 'psc-seg is-active', '<i class="fas fa-pen"></i><span>Board</span>');
      segBoard.type = 'button'; segBoard.setAttribute('role', 'tab');
      var segMe = h('button', 'psc-seg', '<i class="fas fa-user"></i><span>My Progress</span>');
      segMe.type = 'button'; segMe.setAttribute('role', 'tab');
      segBoard.addEventListener('click', function () { showProfile(false); });
      segMe.addEventListener('click', function () { showProfile(true); });
      host.appendChild(segBoard); host.appendChild(segMe);
      host._segBoard = segBoard; host._segMe = segMe;
    }
    return elProfile;
  }

  function showProfile(on) {
    var host = document.getElementById('cr-player-card');
    if (!elProfile || !host) return;
    elProfile.hidden = !on;
    if (host._segMe) host._segMe.classList.toggle('is-active', on);
    if (host._segBoard) host._segBoard.classList.toggle('is-active', !on);
    if (host._segMe) host._segMe.setAttribute('aria-selected', on ? 'true' : 'false');
    if (host._segBoard) host._segBoard.setAttribute('aria-selected', on ? 'false' : 'true');
    if (on && elProfile) elProfile.scrollTop = 0;
  }

  // ── render the full card into the profile overlay ───────────────────────
  function render(host, user, summary) {
    var ws = (summary && summary.weeklyStats) || {};
    var hd = heroData(user);
    var pre = summary && summary.assessmentCompleted === false;

    scaffold(host);
    var nameText = host._pscName || (user && user.firstName) || 'Mathematician';
    var avatar = host._pscAvatar || null;
    if (avatar && avatar.parentNode) avatar.parentNode.removeChild(avatar);  // detach for re-append

    var full = elProfile.querySelector('.psc-full');
    full.textContent = '';

    // header: character + greeting
    var head = h('div', 'psc-head');
    if (avatar) head.appendChild(avatar); else head.appendChild(h('div', 'psc-head-ava'));
    var greet = h('div', 'psc-head-txt',
      '<div class="psc-head-name"></div><div class="psc-head-sub">Keep learning, keep growing 💜</div>');
    txt(greet.querySelector('.psc-head-name'), nameText);
    head.appendChild(greet);
    full.appendChild(head);

    // hero
    var hero = h('div', 'psc-hero');
    var badge = h('div', 'psc-badge',
      '<div class="psc-badge-shield">🛡️</div>' +
      '<div class="psc-badge-lvl">Level <b></b></div>' +
      '<div class="psc-badge-rank"></div>');
    txt(badge.querySelector('.psc-badge-lvl b'), hd.level);
    txt(badge.querySelector('.psc-badge-rank'), rankFor(hd.level));
    var mid = h('div', 'psc-hero-mid',
      '<div class="psc-hero-xplabel">XP</div>' +
      '<div class="psc-hero-xpval"><b></b> <small></small></div>' +
      '<div class="psc-hero-bar"><div class="psc-hero-fill"></div></div>' +
      '<div class="psc-hero-sub"></div>');
    txt(mid.querySelector('.psc-hero-xpval b'), hd.cur.toLocaleString());
    txt(mid.querySelector('.psc-hero-xpval small'), '/ ' + hd.need.toLocaleString());
    mid.querySelector('.psc-hero-fill').style.width = hd.pct.toFixed(1) + '%';
    txt(mid.querySelector('.psc-hero-sub'), '📈 ' + hd.remaining.toLocaleString() + ' XP to Lv ' + (hd.level + 1));
    hero.appendChild(badge);
    hero.appendChild(mid);
    hero.appendChild(h('div', 'psc-trophy', '🏆'));
    full.appendChild(hero);

    // stat tiles
    var tiles = h('div', 'psc-tiles');
    tiles.appendChild(tile('streak', 'fa-fire', 'Streak', streakOf(user), 'days', streakSub(streakOf(user))));
    tiles.appendChild(tile('solved', 'fa-magnifying-glass', 'Problems', pre ? 0 : num(ws.problemsSolved, 0), '/wk', solvedSub(ws.problemsSolved)));
    tiles.appendChild(tile('acc', 'fa-bullseye', 'Accuracy', (ws.accuracy == null ? '—' : ws.accuracy), (ws.accuracy == null ? '' : '%'), accSub(ws.accuracy)));
    full.appendChild(tiles);

    if (pre) {
      full.appendChild(h('div', 'psc-empty',
        '<div class="psc-empty-ic">📋</div>' +
        '<div class="psc-empty-t">Take your placement to unlock progress</div>' +
        '<div class="psc-empty-s">Once you start solving, your mastered skills and next steps show up here.</div>'));
      appendCta(full);
      return;
    }

    // Skills Recently Mastered
    var mastered = [];
    if (Array.isArray(summary && summary.recentWins) && summary.recentWins.length) {
      mastered = summary.recentWins.slice(0, 3).map(function (w) { return { name: w.description, date: w.date }; });
    } else if (summary && summary.recentMastery) {
      mastered = [{ name: summary.recentMastery.displayName, date: summary.recentMastery.date }];
    }
    if (mastered.length) {
      full.appendChild(section('🎓', 'Skills Recently Mastered'));
      var ul = h('ul', 'psc-list');
      mastered.forEach(function (m, i) {
        var li = h('li', 'psc-row');
        li.appendChild(h('span', 'psc-row-check', '✓'));
        var body = h('div', 'psc-row-body', '<span class="psc-row-name"></span>');
        txt(body.querySelector('.psc-row-name'), m.name);
        li.appendChild(body);
        var meta = h('div', 'psc-row-meta');
        if (m.date) { var dEl = h('span', 'psc-xp-pill'); txt(dEl, shortDate(m.date)); meta.appendChild(dEl); }
        var star = h('span', 'psc-star', '★'); star.setAttribute('aria-hidden', 'true'); meta.appendChild(star);
        li.appendChild(meta);
        ul.appendChild(li);
      });
      full.appendChild(ul);
    }

    // What's Next
    var next = [];
    if (summary && summary.currentLearning) next.push({ name: summary.currentLearning.displayName, pct: num(summary.currentLearning.progress, 0), ready: false });
    if (summary && summary.nextReady) next.push({ name: summary.nextReady.displayName, pct: null, ready: true });
    if (next.length) {
      full.appendChild(section('🚀', 'What’s Next?'));
      var ul2 = h('ul', 'psc-list');
      next.forEach(function (n, i) {
        var li = h('li', 'psc-row');
        var b = h('span', 'psc-row-badge', glyphFor(n.name));
        b.setAttribute('data-b', String(i % 4));
        li.appendChild(b);
        var body = h('div', 'psc-row-body', '<span class="psc-row-name"></span>');
        txt(body.querySelector('.psc-row-name'), n.name);
        if (!n.ready) {
          var pl = h('div', 'psc-row-progline',
            '<div class="psc-row-bar"><div class="psc-row-fill"></div></div><span class="psc-row-pct"></span>');
          pl.querySelector('.psc-row-fill').style.width = Math.max(0, Math.min(100, n.pct)) + '%';
          txt(pl.querySelector('.psc-row-pct'), n.pct + '%');
          body.appendChild(pl);
        }
        li.appendChild(body);
        var meta = h('div', 'psc-row-meta');
        if (n.ready) { var r = h('span', 'psc-xp-pill'); txt(r, 'Ready'); meta.appendChild(r); }
        var star2 = h('span', 'psc-star' + (n.ready ? ' is-dim' : ''), '★'); star2.setAttribute('aria-hidden', 'true'); meta.appendChild(star2);
        li.appendChild(meta);
        ul2.appendChild(li);
      });
      full.appendChild(ul2);
    }

    if (!mastered.length && !next.length) {
      full.appendChild(h('div', 'psc-empty',
        '<div class="psc-empty-ic">✍️</div>' +
        '<div class="psc-empty-t">Your progress is warming up</div>' +
        '<div class="psc-empty-s">Solve a few problems and your mastered skills and next steps appear here.</div>'));
    }

    appendCta(full);
  }

  function tile(c, icon, label, val, unit, sub) {
    var t = h('div', 'psc-tile',
      '<div class="psc-tile-top"><i class="fas ' + icon + '"></i><span></span></div>' +
      '<div class="psc-tile-val"><b></b><small></small></div>' +
      '<div class="psc-tile-sub"></div>');
    t.setAttribute('data-c', c);
    txt(t.querySelector('.psc-tile-top span'), label);
    txt(t.querySelector('.psc-tile-val b'), val);
    txt(t.querySelector('.psc-tile-val small'), unit ? ' ' + unit : '');
    txt(t.querySelector('.psc-tile-sub'), sub);
    return t;
  }
  function section(ic, title) {
    var s = h('div', 'psc-sect', '<span class="psc-sect-ic"></span><span class="psc-sect-t"></span>');
    txt(s.querySelector('.psc-sect-ic'), ic);
    txt(s.querySelector('.psc-sect-t'), title);
    return s;
  }
  // A short 2-char glyph for a What's-Next badge, derived from the name.
  function glyphFor(name) {
    var s = String(name || '').replace(/[^A-Za-z0-9]/g, '');
    return (s.slice(0, 2) || '▸').toUpperCase();
  }
  function appendCta(full) {
    var cta = h('div', 'psc-cta',
      '<div class="psc-cta-star">⭐</div>' +
      '<div class="psc-cta-body"><div class="psc-cta-t">You’re on a roll!</div>' +
      '<div class="psc-cta-s">Every problem you solve makes you stronger.</div></div>');
    var btn = h('button', 'psc-cta-btn', 'Let’s Go 🚀');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      var input = document.getElementById('user-input');
      if (input) { try { input.focus(); input.scrollIntoView({ block: 'center' }); } catch (_) {} }
    });
    cta.appendChild(btn);
    full.appendChild(cta);
  }

  // ── summary fetch (once, cached) ────────────────────────────────────────
  function loadSummary() {
    if (summaryCache) return Promise.resolve(summaryCache);
    if (summaryPending) return summaryPending;
    summaryPending = fetch(SUMMARY_URL, { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        summaryCache = data || null;
        summaryPending = null;
        var host = document.getElementById('cr-player-card');
        if (host && lastUser) render(host, lastUser, summaryCache); // re-render with real skills
        return summaryCache;
      })
      .catch(function (err) { console.warn('[PlayerStatsCard] summary fetch failed', err); summaryPending = null; return null; });
    return summaryPending;
  }

  // ── public API ──────────────────────────────────────────────────────────
  // init(user, opts): opts.summary injects data and skips the fetch (harness).
  function init(user, opts) {
    opts = opts || {};
    var host = document.getElementById('cr-player-card');
    if (!host || !user) return;
    lastUser = user;
    mounted = true;
    if (opts.summary !== undefined) { summaryCache = opts.summary; render(host, user, summaryCache); return; }
    render(host, user, summaryCache);   // paint instantly with band data
    loadSummary();                       // fill tiles + skills when it lands
  }

  // refresh(user): re-paint after a chat turn (level/xp/streak may change).
  function refresh(user) {
    if (!mounted || !user) return;
    lastUser = user;
    var host = document.getElementById('cr-player-card');
    if (host) render(host, user, summaryCache);
  }

  root.PlayerStatsCard = { init: init, refresh: refresh, _loadSummary: loadSummary };
})(typeof window !== 'undefined' ? window : this);
