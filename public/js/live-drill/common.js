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

  /**
   * "How scoring works", from the rules the server sends with every state (games.js rulesFor), so
   * the lobby can't promise a different game than the one the server scores.
   */
  function rulesHTML(st) {
    const r = st.rules;
    if (!r) return '';
    const s = (x) => `${x} s`;
    const k = r.teamK === 2.5 ? '2½' : String(r.teamK);
    const [fast, mid, slow] = r.speed;
    const lead = st.mode === 'drive'
      ? `<b>${mmss(st.seconds * 1000)}</b> on one clock — answer at your own pace.`
      : `<b>${st.totalPlays} plays</b>, <b>${s(st.secondsPerPlay)}</b> each — everyone answers the same play.`;
    const typed = r.typed ? ` <b>Type</b> each answer — fluent is right in ${s(r.fluentSec)} or less.` : '';
    if (r.hill) return hillRulesHTML(st, r, typed);
    return `<h3>How scoring works</h3><p class="lead">${lead}${typed}</p><div class="rgrid">`
      + `<div class="rule"><span class="rk">Right answer</span><span class="rv"><b class="g">+${fast.gain}</b> yds in ${s(fast.within)} · <b class="g">+${mid.gain}</b> in ${s(mid.within)} · <b class="g">+${slow.gain}</b> after</span></div>`
      + `<div class="rule"><span class="rk">Wrong answer</span><span class="rv"><b class="b">−${r.sack}</b> yds — a sack</span>${r.noAnswer === 0 ? '<span class="rv">No answer: 0, no gain, no loss</span>' : ''}</div>`
      + `<div class="rule"><span class="rk">One ball per team</span><span class="rv">Every teammate's yards push one ball, scaled to ${k} players' worth — a bigger team gets no bigger push.</span></div>`
      + `<div class="rule"><span class="rk">Touchdown</span><span class="rv"><b class="g">${r.tdPoints}</b> points; ball back to the ${r.startPos}.</span></div>`
      + `<div class="rule"><span class="rk">Winner</span><span class="rv">Most points. Tied? Farther downfield.</span></div>`
      + '</div>';
  }

  /** King of the Hill's rules — the same server numbers (games.rulesFor → hill.RULES). */
  function hillRulesHTML(st, r, typed) {
    const s = (x) => `${x} s`;
    const h = r.hill;
    const [fast, mid, slow] = r.speed;
    return `<h3>How the hill works</h3><p class="lead"><b>${mmss(st.seconds * 1000)}</b> on one clock — every climber for themselves.${typed}</p><div class="rgrid">`
      + `<div class="rule"><span class="rk">Right answer</span><span class="rv">Climb <b class="g">+${fast.gain}</b> in ${s(fast.within)} · <b class="g">+${mid.gain}</b> in ${s(mid.within)} · <b class="g">+${slow.gain}</b> after</span></div>`
      + `<div class="rule"><span class="rk">Wrong answer</span><span class="rv">Slip <b class="b">−${r.sack}</b></span></div>`
      + `<div class="rule"><span class="rk">Boulder</span><span class="rv"><b>${h.boulderEvery} in a row</b> rolls a boulder onto the climber <b>just above you</b>: <b class="b">−${h.knock}</b>. Knocked down? You're steady for ${s(h.steadySec)}.</span></div>`
      + `<div class="rule"><span class="rk">The king</span><span class="rv">Highest climber wears the crown. A king's ${h.boulderEvery} in a row raises a 🛡 shield that stops one boulder.</span></div>`
      + `<div class="rule"><span class="rk">Winner</span><span class="rv">Highest at the buzzer. Summit is ${h.summit}.</span></div>`
      + '</div>';
  }

  window.LiveDrill = { $, esc, buildField, setField, cardHTML, syncClock, serverNow, mmss, watchTouchdowns, rulesHTML };
})();
