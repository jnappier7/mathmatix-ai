// Live Two-Minute Drill — pieces both screens share (the projector and the student phone).
// The play HTML in a state (card, choices, tell) is the drill's own template output, produced on
// the server by utils/liveDrill/engine.js — never user text — so it is set with innerHTML.
// Player NAMES are user text and always go through esc().
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fx = (y) => 7 + (y / 100) * 86;

  /** A field with one lane per team. Built once; `setField` moves the balls. */
  function buildField(el, teams) {
    let h = '<div class="ez l"></div><div class="ez r"><span>END ZONE</span></div>';
    for (let y = 10; y <= 90; y += 10) {
      h += `<div class="yl" style="left:${fx(y)}%"></div><div class="yn" style="left:${fx(y)}%">${y <= 50 ? y : 100 - y}</div>`;
    }
    teams.forEach((t, i) => { h += `<div class="lane t${i}"><span class="tag">${esc(t.name)}</span><div class="ball"></div></div>`; });
    el.innerHTML = h;
  }
  function setField(el, teams) {
    if (!el.querySelector('.lane')) buildField(el, teams);
    el.querySelectorAll('.lane').forEach((lane, i) => {
      const t = teams[i]; if (!t) return;
      lane.querySelector('.ball').style.left = fx(Math.max(0, Math.min(100, t.pos))) + '%';
    });
  }

  function cardHTML(play, revealCard, meta) {
    const hasFig = (revealCard || play.card).indexOf('class="fig"') >= 0;
    return `<div class="card${hasFig ? '' : ' nofig'}"><div class="meta"><span>${meta || ''}</span><span>${esc(play.playbookName)}</span></div>${revealCard || play.card}</div>`;
  }

  /** Server clock offset, refreshed from every state. */
  let skew = 0;
  function syncClock(state) { if (state && state.serverNow) skew = state.serverNow - Date.now(); }
  const serverNow = () => Date.now() + skew;
  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function touchdown(team) {
    const el = $('td'); if (!el) return;
    el.innerHTML = `<div class="t${team.idx}">Touchdown<br>${esc(team.name)}</div>`;
    el.hidden = false;
    clearTimeout(touchdown._t);
    touchdown._t = setTimeout(() => { el.hidden = true; }, 1600);
  }
  /** Fire the TD splash when a team's points go up between two states. */
  function watchTouchdowns(prev, next) {
    if (!prev || !next) return;
    next.teams.forEach((t, i) => { if (prev.teams[i] && t.pts > prev.teams[i].pts) touchdown({ idx: i, name: t.name }); });
  }

  window.LiveDrill = { $, esc, buildField, setField, cardHTML, syncClock, serverNow, mmss, watchTouchdowns };
})();
