// Live Two-Minute Drill — pieces both screens share (the projector and the student phone).
// The play HTML in a state (card, choices, tell) is the drill's own template output, produced on
// the server by utils/liveDrill/engine.js — never user text — so it is set with innerHTML.
// Player NAMES are user text and always go through esc().
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fx = (y) => 7 + (y / 100) * 86;

  // ---------------- the field ----------------
  // One lane per team, built once. `setField` is told only where each ball IS; everything that
  // moves is worked out here from where it WAS: a gain spirals forward and leaves a streak, a loss
  // tumbles back, a touchdown runs the ball into the end zone, spikes it and re-spots it (it used
  // to slide 80 yards backwards, which read as the biggest loss of the game). WAAPI ignores the
  // stylesheet's reduced-motion rule, so every effect checks `calm()` itself.
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const BALL = '<svg viewBox="0 0 44 26" aria-hidden="true"><path class="skin" d="M2 13Q22-7 42 13Q22 33 2 13Z"/>'
    + '<path class="stripe" d="M9.5 6.8Q7.6 13 9.5 19.2M34.5 6.8Q36.4 13 34.5 19.2"/>'
    + '<path class="lace" d="M16 13H28M18.5 10.6V15.4M22 10.2V15.8M25.5 10.6V15.4"/></svg>';

  function buildField(el, teams) {
    let h = '<div class="ez l"></div><div class="ez r"><span>END ZONE</span></div>';
    for (let y = 10; y <= 90; y += 10) {
      h += `<div class="yl" style="left:${fx(y)}%"></div><div class="yn" style="left:${fx(y)}%">${y <= 50 ? y : 100 - y}</div>`;
    }
    teams.forEach((t, i) => { h += `<div class="lane t${i}"><span class="tag">${esc(t.name)}</span><div class="ezglow"></div><div class="ball">${BALL}</div></div>`; });
    el.innerHTML = h;
  }

  /** Restart a one-shot CSS animation class on an element. */
  function kick(el, cls, ms) {
    el.classList.remove('run', 'hit', 'spike', 'spot');
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el._k);
    el._k = setTimeout(() => el.classList.remove(cls), ms);
  }
  function streak(lane, from, to) {
    const tr = document.createElement('div');
    tr.className = 'trail ' + (to > from ? 'fwd' : 'back');
    tr.style.left = fx(Math.min(from, to)) + '%';
    tr.style.width = Math.abs(fx(to) - fx(from)) + '%';
    lane.insertBefore(tr, lane.querySelector('.ball'));
    tr.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out' }).onfinish = () => tr.remove();
  }
  function yardPop(lane, at, text, cls) {
    if (lane.querySelectorAll('.pop').length >= 3) return; // a big class moves the ball every second
    const p = document.createElement('span');
    p.className = 'pop ' + cls;
    p.textContent = text;
    p.style.left = fx(at) + '%';
    lane.appendChild(p);
    p.animate([
      { transform: 'translate(-50%,-30%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%,-110%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-150%) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-190%) scale(1)', opacity: 0 },
    ], { duration: 1300, easing: 'ease-out' }).onfinish = () => p.remove();
  }
  function burst(lane, n) {
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'cf c' + (i % 3);
      lane.appendChild(c);
      const a = Math.PI * (0.55 + 0.9 * Math.random()); // up and back toward the field
      const d = 30 + Math.random() * 70;
      c.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${-Math.abs(Math.sin(a)) * d * 0.7 - 10}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${Math.cos(a) * d * 1.2}px,${30 + Math.random() * 30}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => c.remove();
    }
  }

  /** The scoring drive: into the end zone, a spike, then the ball is re-spotted where the next drive starts. */
  function touchdown(lane, ball) {
    lane._busy = true;
    clearTimeout(lane._t1); clearTimeout(lane._t2); clearTimeout(lane._t3);
    ball.style.left = fx(100) + 3.5 + '%'; // across the goal line, into the paint
    kick(ball, 'run', 620);
    lane.classList.add('scored');
    lane._t1 = setTimeout(() => { kick(ball, 'spike', 800); burst(lane, 16); }, 600);
    lane._t2 = setTimeout(() => {
      ball.style.transition = 'none';
      ball.style.left = fx(lane._pos) + '%';
      void ball.offsetWidth;
      ball.style.transition = '';
      kick(ball, 'spot', 600);
      lane._busy = false;
    }, 1700);
    lane._t3 = setTimeout(() => lane.classList.remove('scored'), 3200);
  }

  /**
   * Put each team's ball where the state says. `opts.pickSix` ([bool, bool]) marks points that came
   * from a pick six: those were not a drive, so the end zone lights up but no ball runs in.
   */
  function setField(el, teams, opts) {
    if (!el.querySelector('.lane')) buildField(el, teams);
    const picks = (opts && opts.pickSix) || [];
    el.querySelectorAll('.lane').forEach((lane, i) => {
      const t = teams[i]; if (!t) return;
      const ball = lane.querySelector('.ball');
      const pos = Math.max(0, Math.min(100, t.pos));
      const was = lane._pos; const pts = lane._pts;
      lane._pos = pos; lane._pts = t.pts;
      if (was == null || calm() || !ball.animate) { ball.style.left = fx(pos) + '%'; return; }
      const scored = pts != null && t.pts > pts;
      if (scored && picks[i]) {
        lane.classList.add('scored'); burst(lane, 12);
        clearTimeout(lane._t3); lane._t3 = setTimeout(() => lane.classList.remove('scored'), 3200);
      } else if (scored) { touchdown(lane, ball); return; }
      if (lane._busy || pos === was) return; // mid-celebration: the re-spot reads lane._pos
      ball.style.left = fx(pos) + '%';
      const d = Math.round(pos - was);
      streak(lane, was, pos);
      if (d) yardPop(lane, pos, (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? 'gain' : 'loss');
      kick(ball, d >= 0 ? 'run' : 'hit', 650);
    });
  }

  /** A blitz lands on a team's ball: a bolt out of the sky and a flash down the lane. */
  function fieldBolt(el, team) {
    const lane = el.querySelectorAll('.lane')[team];
    if (!lane || lane._pos == null || calm()) return;
    const b = document.createElement('div');
    b.className = 'bolt';
    b.style.left = fx(lane._pos) + '%';
    b.innerHTML = '<svg viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true"><path d="M24 0L6 52H19L11 100L36 40H22L32 0Z"/></svg>';
    lane.appendChild(b);
    lane.classList.add('zap');
    setTimeout(() => { b.remove(); lane.classList.remove('zap'); }, 620);
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
  /** Paper in the scoring team's colour, falling across its half of the splash (CSS-driven, so reduced motion drops it). */
  function confetti(scores) {
    if (calm()) return '';
    let h = '';
    scores.forEach((s, k) => {
      const lo = scores.length > 1 ? k * 50 : 0; const span = scores.length > 1 ? 50 : 100;
      for (let i = 0; i < 44; i++) {
        h += `<i class="cf t${s.idx} c${i % 3}" style="left:${(lo + Math.random() * span).toFixed(1)}%;--d:${(Math.random() * 0.5).toFixed(2)}s;--t:${(1.1 + Math.random() * 0.9).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;--x:${Math.round(Math.random() * 120 - 60)}px"></i>`;
      }
    });
    return h;
  }
  function splash(scores) {
    const el = $('td'); if (!el || !scores.length) return;
    el.classList.toggle('split', scores.length > 1);
    el.innerHTML = scores.map((s) => `<div class="t${s.idx}">${s.label}<br>${esc(s.name)}</div>`).join('') + confetti(scores);
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
      + `<div class="rule"><span class="rk">🕶 Grab · 🔁 Switch</span><span class="rv">More than half the safes (${h.attackPct}%) are a move on someone else. A <b>Grab</b> takes ${h.grabPct}% from a classmate <b>above you</b> — you pick who. A <b>Switch</b> trades piles with one, your pick too. Nobody below you can be touched.</span></div>`
      + `<div class="rule"><span class="rk">💸 Shakedown</span><span class="rv">A <b>Shakedown</b> knocks one classmate above you — your pick — down <b class="b">${h.shakeLoss}%</b>; you pocket ${h.shakeTake}%. It hurts them more than it helps you: the move for a runaway leader. Nothing anyone does ever takes your screen away — a swap keeps everyone playing.</span></div>`
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

  window.LiveDrill = { $, esc, buildField, setField, fieldBolt, calm, cardHTML, syncClock, serverNow, mmss, watchTouchdowns, rulesHTML };
})();
