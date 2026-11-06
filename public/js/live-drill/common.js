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

  /**
   * The full-screen splash: one team — or, when BOTH scored in the same update (a Huddle reveal, or
   * two drives landing inside one broadcast), both, split left and right. It used to be one panel
   * written per team, so the second write replaced the first and only one team was ever announced.
   */
  function splash(scores) {
    const el = $('td'); if (!el || !scores.length) return;
    el.classList.toggle('split', scores.length > 1);
    el.innerHTML = scores.map((s) => `<div class="t${s.idx}">${s.label}<br>${esc(s.name)}</div>`).join('');
    el.hidden = false;
    clearTimeout(splash._t);
    splash._t = setTimeout(() => { el.hidden = true; }, scores.length > 1 ? 2200 : 1600);
  }
  /** Fire the splash for every team whose points went up between two states. A pick six says so. */
  function watchTouchdowns(prev, next) {
    if (!prev || !next) return;
    const picks = (next.round && next.round.pickSix) || [];
    const scores = [];
    next.teams.forEach((t, i) => { if (prev.teams[i] && t.pts > prev.teams[i].pts) scores.push({ idx: i, name: t.name, label: picks[i] ? 'Pick six' : 'Touchdown' }); });
    splash(scores);
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
    if (r.heist) return heistRulesHTML(st, r, typed);
    const change = r.canChange ? ` Changed your mind? ${r.typed ? 'Type it again' : 'Tap another choice'} before the reveal — your <b>last</b> answer counts, timed from when you sent it.` : '';
    const p6 = r.pickSix;
    return `<h3>How scoring works</h3><p class="lead">${lead}${typed}${change}</p><div class="rgrid">`
      + `<div class="rule"><span class="rk">Right answer</span><span class="rv"><b class="g">+${fast.gain}</b> yds in ${s(fast.within)} · <b class="g">+${mid.gain}</b> in ${s(mid.within)} · <b class="g">+${slow.gain}</b> after</span></div>`
      + `<div class="rule"><span class="rk">Wrong answer</span><span class="rv"><b class="b">−${r.sack}</b> yds — a sack</span>${r.noAnswer ? `<span class="rv"><b class="b">−${r.noAnswer}</b> for <b>no answer</b> — worse than a wrong one, so always answer.</span>` : ''}</div>`
      + `<div class="rule"><span class="rk">One ball per team</span><span class="rv">Every teammate's yards push one ball, scaled to ${k} players' worth — a bigger team gets no bigger push.</span></div>`
      + `<div class="rule"><span class="rk">Touchdown</span><span class="rv"><b class="g">${r.tdPoints}</b> points; ball back to the ${r.startPos}.</span></div>`
      + (r.blitz ? `<div class="rule"><span class="rk">⚡ Blitz</span><span class="rv"><b>${r.blitz.every} in a row</b> blitzes the other team: their ball goes back <b class="b">${r.blitz.yards}</b> yards' worth (scaled for team size like every push). Nobody picks a target — it's the team you're playing.</span></div>` : '')
      + (p6 ? `<div class="rule"><span class="rk">Pick six</span><span class="rv">Teams of ${p6.minTeam} or more: <b>everyone</b> on the team right on the same play is a pick six — <b class="g">+${p6.points}</b> points, and the other team's ball goes back to the ${p6.resetPos}. One miss, no pick. Make sure your whole team has it.</span></div>` : '')
      + `<div class="rule"><span class="rk">Winner</span><span class="rv">Most points. Tied? Farther downfield.</span></div>`
      + '</div>';
  }

  /** Heist's rules — the same server numbers (games.rulesFor → heist.rules). */
  function heistRulesHTML(st, r, typed) {
    const h = r.heist;
    const s = (x) => `${x} s`;
    const money = (x) => `$${Number(x).toLocaleString()}`;
    const [fast, mid, slow] = r.speed;
    void slow;
    const gadgets = h.gadgets.map((g) => `<b>${g.label}</b> ${g.blurb}`).join('; ');
    return `<h3>How the heist works</h3><p class="lead"><b>${mmss(st.seconds * 1000)}</b> on one clock — every safecracker for themselves. Most cash at the buzzer wins.${typed}</p><div class="rgrid">`
      + `<div class="rule"><span class="rk">Right answer</span><span class="rv"><b class="g">${money(h.pay[0])}</b> in ${s(fast.within)} · <b class="g">${money(h.pay[1])}</b> in ${s(mid.within)} · <b class="g">${money(h.pay[2])}</b> after</span></div>`
      + `<div class="rule"><span class="rk">🚨 Wrong answer</span><span class="rv">You trip the alarm: <b class="b">−${money(h.alarmCost)}</b> and your screen locks for <b>${s(h.alarmSec)}</b>. Guessing costs you the clock — think, then answer.</span></div>`
      + `<div class="rule"><span class="rk">Crack a safe</span><span class="rv"><b>${h.safeEvery} right in a row</b> opens the vault: pick one of ${h.safeCount} safes. Most hold cash (${money(h.cashMin)} to ${money(h.cashMax)}, a few a <b class="g">${money(h.jackpot)}</b> jackpot). One miss and the count starts over.</span></div>`
      + `<div class="rule"><span class="rk">🕶 Grab · 🔁 Switch</span><span class="rv">A <b>Grab</b> takes ${h.grabPct}% of a random player <b>above you</b>; a <b>Switch</b> trades piles with one. Nobody picks a target, and nobody below you can be touched.</span></div>`
      + `<div class="rule"><span class="rk">🧰 Gadgets</span><span class="rv">Some safes hold a trick you fire when you like: ${gadgets}. Everyone but you.</span></div>`
      + `<div class="rule"><span class="rk">Decoy</span><span class="rv">Some safes are empty. The streak was the price.</span></div>`
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
      + `<div class="rule"><span class="rk">Boulder</span><span class="rv"><b>${h.boulderEvery} in a row</b> rolls a boulder onto the climber <b>just above you</b>: <b class="b">−${h.knockMin}</b> to <b class="b">−${h.knockMax}</b> — the higher they are, the farther they fall. Knocked down? You're steady for ${s(h.steadySec)}.</span></div>`
      + `<div class="rule"><span class="rk">The king</span><span class="rv">Highest climber wears the crown, and it's heavy: the king climbs at ${h.kingStepPct}% speed. ${h.shieldEvery} in a row raises a 🛡 shield that stops one boulder.</span></div>`
      + `<div class="rule"><span class="rk">Winner</span><span class="rv">Highest at the buzzer. Summit is ${h.summit}.</span></div>`
      + '</div>';
  }

  window.LiveDrill = { $, esc, buildField, setField, cardHTML, syncClock, serverNow, mmss, watchTouchdowns, rulesHTML };
})();
