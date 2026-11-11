/* global addCsrfToken */
// Live Two-Minute Drill — the student's device. Join with a code and a name; the server deals,
// clocks and grades every play (routes/liveDrill.js). This page only ever reports "I picked
// key k on play n". The token lives in sessionStorage so a refresh rejoins the same seat.
//
// A signed-in student joins with their ACCOUNT instead (/api/live-drill/mine/join): no name box,
// and arriving from the chat-screen banner (/play?code=…) joins with no tap at all. Those calls go
// through plain fetch + addCsrfToken, never csrfFetch — csrfFetch sends any 401 to the login page,
// and a 401 here only means "no account, show the name box".
(function () {
  const { $, esc, setField, cardHTML, syncClock, serverNow, mmss, watchTouchdowns } = window.LiveDrill;
  const API = '/api/live-drill/play';
  const KEY = 'mm-live-drill-seat';

  let seat = null; // { code, token, name }
  let st = null; // latest player state
  let es = null;
  let tick = null;
  // drive: the play on screen; huddle: which round render is on screen
  let cur = null; // { n, play, locked }
  let huddleKey = '';
  let fetching = false;
  let account = null; // { name } when a signed-in student is on this page

  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } },
    clear() { try { sessionStorage.removeItem(KEY); } catch { /* private mode */ } },
  };

  // A deploy moves the game to a new server: for a few seconds the old one answers 503 "moving"
  // (or nothing at all). Retry quietly for that long rather than tell a student their answer failed.
  const MOVE_RETRIES = 8;
  const MOVE_WAIT_MS = 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(path, opts) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(API + path, {
          ...opts,
          headers: { 'Content-Type': 'application/json', ...(seat ? { 'X-Live-Drill-Token': seat.token } : {}) },
          credentials: 'omit',
          cache: 'no-store',
        });
      } catch (netErr) {
        if (attempt < MOVE_RETRIES) { await sleep(MOVE_WAIT_MS); continue; }
        throw netErr;
      }
      let body = null;
      try { body = await res.json(); } catch { /* empty */ }
      if (res.status === 503 && body && body.retry && attempt < MOVE_RETRIES) { await sleep(MOVE_WAIT_MS); continue; }
      if (!res.ok) { const e = new Error((body && body.message) || `Request failed (${res.status})`); e.status = res.status; throw e; }
      return body;
    }
  }

  /** Signed-in student calls. Never throws a redirect: any failure means "use the code form". */
  async function mine(path, opts) {
    const res = await fetch('/api/live-drill/mine' + path, addCsrfToken({
      ...opts, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store',
    }));
    let body = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (!res.ok) { const e = new Error((body && body.message) || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return body;
  }

  function seatFrom(r) {
    seat = { code: r.code, token: r.token, name: r.name };
    store.set(seat);
    connect();
  }

  function show(id) { ['join', 'lobby', 'live', 'final', 'gone'].forEach((s) => { $(s).hidden = s !== id; }); }

  function gone(msg) {
    if (es) es.close(); es = null;
    clearInterval(tick);
    store.clear(); seat = null; st = null; cur = null; huddleKey = '';
    $('gone-msg').textContent = msg;
    show('gone');
  }

  // ---------------- join ----------------
  $('join-form').onsubmit = async (e) => {
    e.preventDefault();
    $('join-err').textContent = '';
    $('join-btn').disabled = true;
    try {
      if (account) {
        seatFrom(await mine('/join', { method: 'POST', body: JSON.stringify({ code: $('code').value }) }));
      } else {
        seatFrom(await api('/join', { method: 'POST', body: JSON.stringify({ code: $('code').value, name: $('name').value }) }));
        try { localStorage.setItem('mm-live-drill-name', $('name').value.trim()); } catch { /* private mode */ }
      }
    } catch (err) { $('join-err').textContent = err.message; }
    $('join-btn').disabled = false;
  };
  $('code').addEventListener('input', () => { $('code').value = $('code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('f-new').onclick = () => { gone(''); show('join'); };
  $('gone-btn').onclick = () => show('join');

  // ---------------- connection ----------------
  function connect() {
    if (es) es.close();
    es = new EventSource(`${API}/${encodeURIComponent(seat.code)}/stream?t=${encodeURIComponent(seat.token)}`);
    es.addEventListener('state', (ev) => { try { apply(JSON.parse(ev.data)); } catch { /* malformed */ } });
    es.addEventListener('kicked', () => gone('Your teacher removed you from this game.'));
    es.onerror = async () => {
      try { apply(await api(`/${encodeURIComponent(seat.code)}/state`)); } catch (err) {
        if (err.status === 401) gone('You are no longer in this game. Join again with the code.');
        else if (err.status === 404) gone('That game has ended.');
      }
    };
  }

  // ---------------- render ----------------
  function apply(next) {
    if (!next || (st && next.version < st.version)) return;
    syncClock(next);
    const prev = st;
    if (prev && prev.phase !== 'lobby') watchTouchdowns(prev, next);
    st = next;
    // Back to the lobby — a "Run it back" — so nothing from the last game stays on screen.
    if (st.phase === 'lobby') { cur = null; huddleKey = ''; heistWait = null; fxShown = ''; $('live').classList.remove('fx-smoke', 'fx-flip'); }
    if (st.phase === 'lobby') { show('lobby'); renderLobby(); }
    else if (st.phase === 'over') { show('final'); renderFinal(); }
    else { show('live'); renderLive(); }
    clearInterval(tick);
    if (st.phase === 'live' || st.phase === 'reveal') tick = setInterval(renderClock, 250);
    renderClock();
  }

  function teamName(i) { return st.teams[i] ? st.teams[i].name : ''; }

  function renderLobby() {
    const t = st.me.team;
    const onHill = st.mode === 'hill';
    const onHeist = st.mode === 'heist';
    $('l-team').className = onHill ? 'teamcard hill' : onHeist ? 'teamcard heist' : `teamcard t${t}`;
    $('l-teamname').textContent = onHill ? 'King of the Hill' : onHeist ? 'Heist' : `Team ${teamName(t)}`;
    $('l-name').textContent = st.me.name;
    $('l-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${st.mode === 'drive' ? 'Team Drive' : onHill ? 'every climber for themselves' : onHeist ? 'every safecracker for themselves' : 'Huddle'}`;
    const rules = window.LiveDrill.rulesHTML(st);
    if ($('l-rules').dataset.html !== rules) { $('l-rules').innerHTML = rules; $('l-rules').dataset.html = rules; }
  }

  function renderScore() {
    const onHill = st.mode === 'hill';
    const onHeist = st.mode === 'heist';
    $('live').classList.toggle('mode-hill', onHill);
    $('live').classList.toggle('mode-heist', onHeist);
    $('p-hill').hidden = !onHill;
    $('p-heist').hidden = !onHeist;
    if (onHill) { renderMyHill(); return; }
    if (onHeist) { renderMyHeist(); return; }
    st.teams.forEach((t, i) => { $('s-n' + i).textContent = t.name; $('s-p' + i).textContent = t.pts; });
    setField($('field'), st.teams);
    const t = st.me.team;
    $('p-team').className = `pill t${t}`;
    $('p-team').textContent = `Team ${teamName(t)}`;
    const b = st.rules && st.rules.blitz;
    const toBlitz = b && st.phase === 'live' ? ` · ${b.every - (st.me.streak % b.every)} to ⚡` : '';
    $('p-me').textContent = `${st.me.name} · ${st.me.yards} yds · streak ${st.me.streak}${toBlitz}`;
  }

  /** King of the Hill: where I am, who's just above, how close the next boulder is. */
  const idHash = (id) => { let n = 0; for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return n; };
  const JACKETS = ['#ff6a5c', '#4cb3ff', '#ffb547', '#b388ff', '#3ccf7e', '#ff8fd0', '#ffd166', '#7ee8fa', '#f5a623', '#c3f73a', '#ff9b73', '#9bd5ff'];
  /** A little climber for the phone's hill: the same jacket colour the projector gives this student. */
  function miniClimber(x, y, jacket, cls, label) {
    return `<g class="mc ${cls || ''}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><path d="M-3,1 L-3.5,7 M3,1 L3.5,7" class="legs"/><path d="M-6,3 Q-6,-6 0,-6 Q6,-6 6,3 Z" fill="${jacket}" class="body"/><circle cy="-10" r="4.5" class="head"/>${label ? `<text class="lbl" y="-16" text-anchor="middle">${esc(label)}</text>` : ''}</g>`;
  }
  function renderMyHill() {
    const h = st.hill;
    if (!h) return;
    $('p-team').className = 'pill hill';
    $('p-team').textContent = h.king && h.king.me ? '👑 King' : `#${h.rank} of ${h.of}`;
    $('p-me').textContent = `${st.me.name} · streak ${st.me.streak}`;
    const dots = Array.from({ length: 3 }, (_, i) => `<span class="${i < 3 - h.toBoulder ? 'on' : ''}"></span>`).join('');
    const status = h.hit ? `<div class="hit">🪨 ${esc(h.hit.by)} knocked you down!${h.steady ? ' You\'re steady for a moment.' : ''}</div>`
      : h.king && h.king.me ? `<div class="crownline">👑 You're the king.${h.shield ? ' 🛡 Shield up.' : ` ${h.toBoulder} more in a row for a shield.`}</div>`
      : h.above ? `<div class="above"><b>${esc(h.above.name)}</b> is ${Math.max(1, Math.round(h.above.gap))} above you${h.king && h.king.name !== h.above.name ? ` · 👑 ${esc(h.king.name)}` : ''}</div>`
      : '';
    // the mini hill: a slope 0→100 from the base (y 84) to the snow cap (y 12); me, the climber above, the king
    const Y = (v) => 84 - (v / h.summit) * 72;
    const X = (v, t) => 80 + (t - 0.5) * 2 * (48 * (1 - v / h.summit) + 18);
    const me = miniClimber(X(h.h, 0.42), Y(h.h), JACKETS[idHash(st.me.id) % JACKETS.length], 'me', 'you');
    const up = h.above && !(h.king && h.king.name === h.above.name) ? miniClimber(X(h.h + h.above.gap, 0.66), Y(h.h + h.above.gap), '#c9d3d6', 'up', h.above.name) : '';
    const king = h.king && !h.king.me ? miniClimber(X(h.king.h, 0.56), Y(h.king.h), '#ffb547', 'kg', `👑 ${h.king.name}`) : '';
    const scene = `<svg class="minihill" viewBox="0 -12 160 104" aria-hidden="true">
      <polygon points="8,88 62,12 98,12 152,88" fill="#3f8a52" stroke="#2c5f3a" stroke-width="1.5" stroke-linejoin="round"/>
      <polygon points="62,12 98,12 103,18 80,16 57,18" fill="#f4f8f4" opacity=".9"/>
      <line x1="80" y1="12" x2="80" y2="2" stroke="#eee" stroke-width="1.2"/><polygon points="80,2 89,4.5 80,7" fill="#ffb547"/>
      <path d="M14,66 Q80,62 146,66 M38,36 Q80,32 122,36" fill="none" stroke="#fff" stroke-opacity=".18" stroke-dasharray="3 3"/>
      <rect x="0" y="88" width="160" height="4" fill="#122c1b"/>${king}${up}${me}</svg>`;
    $('p-hill').innerHTML = `<div class="climb">${scene}
      <div class="hnums"><span class="v">${Math.round(h.h)}</span><span class="k">of ${h.summit}</span></div>
      <div class="boulder"><span class="k">${h.king && h.king.me ? 'Shield' : 'Boulder'}</span><span class="dots">${dots}</span></div></div>${status}`;
  }

  // ---- heist: cash, the alarm, the safes, the gadgets ----
  const money = (x) => `$${Number(x || 0).toLocaleString()}`;
  let heistWait = null; // 'alarm' | 'safe' while the phone is held off the next play
  let fxShown = ''; // the effect banner on screen (kind|until), so it isn't rebuilt every state
  const GADGET_ICON = { smoke: '💨', flip: '🙃' };
  const GADGET_DID = { smoke: 'dropped a smoke bomb', flip: 'flipped your screen' };

  /** Heist: cash, rank, who's above, the safe meter, held gadgets, and anything done to this screen. */
  function renderMyHeist() {
    const h = st.heist;
    if (!h) return;
    $('p-team').className = 'pill heist';
    $('p-team').textContent = h.leader && h.leader.me ? '🏆 Leader' : `#${h.rank} of ${h.of}`;
    $('p-me').textContent = `${st.me.name} · streak ${st.me.streak}`;
    const dots = Array.from({ length: 3 }, (_, i) => `<span class="${i < 3 - h.toSafe ? 'on' : ''}"></span>`).join('');
    const gadgets = h.gadgets.length ? `<div class="gadgets">${h.gadgets.map((g) => `<button type="button" class="gadget" data-id="${esc(g.id)}" title="${esc(g.blurb)}">${GADGET_ICON[g.kind] || '🧰'} Fire ${esc(g.label)}</button>`).join('')}</div>` : '';
    const hitLine = (x) => (x.kind === 'grab' ? `🕶 ${esc(x.by)} grabbed ${money(x.amount)} from you!`
      : x.kind === 'switch' ? `🔁 ${esc(x.by)} switched piles with you!`
        : `💸 ${esc(x.by)} shook you down for ${money(x.amount)}!`);
    const status = h.hit ? `<div class="hit">${hitLine(h.hit)}</div>`
      : h.leader && h.leader.me ? '<div class="crownline">🏆 You\'re in the lead. Keep answering — a Grab can only come from below.</div>'
      : h.above ? `<div class="above"><b>${esc(h.above.name)}</b> is ${money(h.above.gap)} ahead of you${h.leader && h.leader.name !== h.above.name ? ` · 🏆 ${esc(h.leader.name)} ${money(h.leader.cash)}` : ''}</div>`
      : '';
    $('p-heist').innerHTML = `<div class="vault"><div class="cash"><span class="k">Your cash</span><span class="v">${money(h.cash)}</span></div>
      <div class="safemeter"><span class="k">${h.safe ? 'Safe open!' : 'Next safe'}</span><span class="dots">${dots}</span></div></div>${gadgets}${status}`;
    $('p-heist').querySelectorAll('.gadget').forEach((b) => { b.onclick = () => fireGadget(b.dataset.id, b); });
    // what someone did to every screen but theirs
    const fx = h.effect && h.effect.until > serverNow() ? h.effect : null;
    const key = fx ? `${fx.kind}|${fx.until}` : '';
    if (key !== fxShown) {
      fxShown = key;
      $('live').classList.toggle('fx-smoke', !!fx && fx.kind === 'smoke');
      $('live').classList.toggle('fx-flip', !!fx && fx.kind === 'flip');
      $('p-fx').hidden = !fx;
      if (fx) $('p-fx').innerHTML = `${GADGET_ICON[fx.kind] || '🧰'} <b>${esc(fx.by)}</b> ${GADGET_DID[fx.kind] || 'fired a gadget'}! <span class="left" id="fx-left"></span>`;
    }
    // the server's view of the alarm / an open crack wins over whatever this phone thought
    if (st.phase === 'live') {
      // (a play still on screen with its tell is left alone: the answer handler brings the alarm up after it)
      if (h.alarmUntil && heistWait !== 'alarm' && !(cur && cur.locked)) showAlarm(h.alarmUntil);
      else if (!h.alarmUntil && heistWait === 'alarm') { heistWait = null; cur = null; nextDrivePlay(); }
      if (h.safe && heistWait !== 'safe' && !cur) showSafes(h.safe);
      if (h.pick && heistWait !== 'pick' && !cur) showTargets(h.pick.kind, h.pick.options);
    }
  }

  /** 🕶 / 🔁 Your pick: the classmates above you. The server takes only a name that is still above you. */
  function showTargets(kind, options) {
    heistWait = 'pick';
    cur = { wait: true };
    closePad();
    const grab = kind === 'grab';
    $('p-card').innerHTML = `<div class="vaultcard"><div class="big">${grab ? '🕶 Grab — who are you robbing?' : '🔁 Switch — whose pile do you want?'}</div><div class="sub">${grab ? 'You take 20% of their cash.' : 'You trade piles with them.'} Only classmates ahead of you.</div></div>`;
    $('p-choices').innerHTML = options.map((t) => `<button class="ch target" data-id="${esc(t.id)}"><span class="lab">${esc(t.name)}</span><span class="cnt">${money(t.cash)}</span></button>`).join('');
    $('fb').className = 'fb';
    $('fb').innerHTML = '<span class="muted">Tap a name.</span>';
    $('p-choices').querySelectorAll('.target').forEach((b) => { b.onclick = () => pickTarget(b.dataset.id); });
  }

  async function pickTarget(id) {
    const btns = [...$('p-choices').querySelectorAll('.target')];
    btns.forEach((b) => { b.disabled = true; });
    try {
      const r = await api(`/${encodeURIComponent(seat.code)}/target`, { method: 'POST', body: JSON.stringify({ id }) });
      btns.forEach((b) => b.classList.toggle('picked', b.dataset.id === id));
      let call; let why;
      if (r.kind === 'grab') { call = `🕶 Grab · +${money(r.amount)}`; why = `Taken from ${esc(r.target)}.`; }
      else if (r.kind === 'switch') { call = `🔁 Switch · ${money(r.cash)}`; why = `You traded piles with ${esc(r.target)} (+${money(r.amount)}).`; }
      else { call = `+${money(r.amount)}`; why = 'Nobody was ahead of you any more — the safe paid cash instead.'; }
      $('fb').className = 'fb good';
      $('fb').innerHTML = `<span class="bigtxt">${call}</span><span class="why">${why}</span>`;
      heistWait = null;
      setTimeout(() => { cur = null; nextDrivePlay(); }, 2000);
    } catch (err) {
      if (err.status === 401) return gone('You are no longer in this game.');
      // 400: that classmate is no longer ahead of you — the next fetch brings the fresh list;
      // 409: the clock ran out, or the server has moved on — fall in line either way
      heistWait = null; cur = null;
      if (err.status === 400) $('fb').innerHTML = `<span class="muted">${esc(err.message)}</span>`;
      setTimeout(() => nextDrivePlay(), 600);
    }
  }

  /** Each clock tick: the alarm countdown, the effect countdown, and the effect's end. */
  function heistTick() {
    if (!st || st.mode !== 'heist') return;
    const h = st.heist || {};
    if (heistWait === 'alarm' && $('al-left')) {
      const left = Math.max(0, (h.alarmUntil || 0) - serverNow());
      $('al-left').textContent = (left / 1000).toFixed(1);
      if (left <= 0) { heistWait = null; cur = null; nextDrivePlay(); }
    }
    if (fxShown) {
      const fx = h.effect;
      const left = fx ? fx.until - serverNow() : 0;
      if (left <= 0) { fxShown = ''; $('live').classList.remove('fx-smoke', 'fx-flip'); $('p-fx').hidden = true; }
      else if ($('fx-left')) $('fx-left').textContent = `${Math.ceil(left / 1000)}s`;
    }
  }

  /** 🚨 The alarm: no play until it clears. The server won't deal one either. (Your own wrong
   *  answer is the only thing that ever holds a screen — nothing another player does.) */
  function showAlarm(until) {
    heistWait = 'alarm';
    cur = { wait: true };
    closePad();
    $('p-choices').innerHTML = '';
    $('p-card').innerHTML = `<div class="alarm"><span class="sweep" aria-hidden="true"></span><div class="siren">🚨</div><div class="big">ALARM</div><span class="drain" aria-hidden="true"><span style="animation-duration:${Math.max(0.1, (until - serverNow()) / 1000).toFixed(2)}s"></span></span><div class="sub">Wrong answer. Locked for <b id="al-left">${Math.max(0, (until - serverNow()) / 1000).toFixed(1)}</b> s — think before the next one.</div></div>`;
  }

  /** The vault: three safes, one tap. What's inside is already decided on the server. */
  function showSafes(safe) {
    heistWait = 'safe';
    cur = { wait: true };
    closePad();
    $('p-card').innerHTML = `<div class="vaultcard"><div class="big">🔐 You cracked the vault!</div><div class="sub">Safe ${safe.n} · pick one</div></div>`;
    $('p-choices').innerHTML = Array.from({ length: safe.count }, (_, i) => `<button class="ch safe" data-i="${i}" style="--i:${i}"><span class="box"><span class="loot"></span><span class="door"><span class="dial"></span><span class="handle"></span></span></span><span class="lab">Safe ${i + 1}</span></button>`).join('');
    $('fb').className = 'fb';
    $('fb').innerHTML = '<span class="muted">Cash, a jackpot, a grab, a switch, a shakedown, a gadget… or a decoy.</span>';
    $('p-choices').querySelectorAll('.safe').forEach((b) => { b.onclick = () => openSafe(Number(b.dataset.i)); });
  }

  async function openSafe(i) {
    const btns = [...$('p-choices').querySelectorAll('.safe')];
    btns.forEach((b) => { b.disabled = true; });
    if (btns[i]) btns[i].classList.add('cracking'); // the dial spins until the server says what's inside
    try {
      const r = await api(`/${encodeURIComponent(seat.code)}/safe`, { method: 'POST', body: JSON.stringify({ pick: i }) });
      const LOOT = { decoy: '🕳', gadget: '🧰', grab: '🕶', switch: '🔁', shakedown: '💸' };
      btns.forEach((b, j) => { b.classList.remove('cracking'); b.classList.toggle('opened', j === i); b.classList.toggle('fade', j !== i); if (j === i) { b.classList.toggle('rich', r.kind !== 'decoy'); b.classList.toggle('jackpot', r.label === 'JACKPOT'); } if (j === i) b.querySelector('.loot').textContent = LOOT[r.kind] || '💰'; });
      let call; let why = ''; let cls = 'good';
      if (r.kind === 'cash') { call = `${r.label === 'JACKPOT' ? '💎 JACKPOT ' : ''}+${money(r.amount)}`; why = r.label === 'JACKPOT' ? 'The big one.' : 'Cash.'; }
      else if (r.choose) { call = r.kind === 'grab' ? '🕶 Grab!' : '🔁 Switch!'; why = 'Pick who — anyone ahead of you.'; }
      else if (r.kind === 'shakedown') { call = `💸 Shakedown · +${money(r.amount)}`; why = `A cut from ${r.count === 1 ? 'the one player' : `each of the ${r.count} players`} ahead of you.`; }
      else if (r.kind === 'gadget') { call = `🧰 ${esc(r.gadget.label)}`; why = `Yours to fire when you like: ${esc(r.gadget.blurb)}. The button is above.`; }
      else { call = 'Decoy'; why = 'Empty. The streak was the price.'; cls = ''; }
      $('fb').className = `fb ${cls}`;
      $('fb').innerHTML = `<span class="bigtxt">${call}</span><span class="why">${why}</span>`;
      heistWait = null;
      if (r.choose) { setTimeout(() => { cur = null; showTargets(r.kind, r.choose); }, 1200); return; }
      setTimeout(() => { cur = null; nextDrivePlay(); }, r.kind === 'decoy' ? 1400 : 2000);
    } catch (err) {
      if (err.status === 401) return gone('You are no longer in this game.');
      heistWait = null; cur = null;
      // 409: the clock ran out, or the server already has this safe open elsewhere — fall in line with its state
      setTimeout(() => nextDrivePlay(), 600);
    }
  }

  async function fireGadget(id, btn) {
    btn.disabled = true;
    try {
      const r = await api(`/${encodeURIComponent(seat.code)}/gadget`, { method: 'POST', body: JSON.stringify({ id }) });
      $('fb').className = 'fb good';
      $('fb').innerHTML = `<span class="bigtxt">${GADGET_ICON[r.kind] || '🧰'} ${esc(r.label)}!</span><span class="why">Everyone else's screen, for ${Math.round((r.until - serverNow()) / 1000)} seconds. Not yours.</span>`;
    } catch (err) { btn.disabled = false; $('fb').className = 'fb'; $('fb').innerHTML = `<span class="muted">${esc(err.message)}</span>`; }
  }

  function renderClock() {
    if (!st) return;
    heistTick();
    const c = $('s-clock');
    let left = null;
    if (st.mode !== 'huddle' && st.phase === 'live') { $('s-ck').textContent = 'Clock'; left = st.endsAt - serverNow(); }
    else if (st.mode === 'huddle' && st.round) {
      $('s-ck').textContent = st.round.closed ? `Play ${st.round.n}/${st.totalPlays}` : `Play ${st.round.n}`;
      if (!st.round.closed) left = st.round.closesAt - serverNow();
    }
    if (left == null) { if (st.mode === 'huddle' && st.round && st.round.closed) c.textContent = '—'; c.classList.remove('low'); return; }
    c.textContent = mmss(left);
    c.classList.toggle('low', left <= (st.mode !== 'huddle' ? 15000 : 5000));
  }

  function renderLive() {
    renderScore();
    if (st.mode !== 'huddle') { if (!cur && !fetching) nextDrivePlay(); return; }
    renderHuddle();
  }

  function choicesHTML(play, opts) {
    const o = opts || {};
    return play.choices.map((c, i) => {
      let cls = '';
      if (o.answer != null) cls = c.k === o.answer ? ' right' : c.k === o.picked ? ' wrong' : ' fade';
      else if (o.picked != null) cls = c.k === o.picked ? ' picked' : o.keepOthers ? '' : ' fade';
      return `<button class="ch${cls}" data-k="${esc(c.k)}"${o.disabled ? ' disabled' : ''}><span class="kbd">${i + 1}</span><span class="lab">${c.html}</span></button>`;
    }).join('');
  }
  function bindChoices(onPick) {
    $('p-choices').querySelectorAll('.ch').forEach((b) => { b.onclick = () => onPick(b.dataset.k); });
  }

  // ---- typed answers (Math Facts): a number pad, so a phone never pops its own keyboard ----
  let pad = null; // { onSubmit, value, locked }
  const MINUS = '−';
  const showNum = (v) => String(v).replace('-', MINUS);
  /** Show the pad for an open play. `allowMinus` adds the − key (integer facts). */
  /**
   * The whole pad has to fit on a phone with the browser's bars showing (an iPhone SE leaves ~548 px):
   * a student who scrolls for every fact isn't drilling facts. So Go lives IN the grid —
   * 1 2 3 ⌫ / 4 5 6 0 / 7 8 9 Go — and integer facts get a ± beside the answer, not a fourth row.
   */
  function openPad(onSubmit, allowMinus) {
    pad = { onSubmit, value: '', locked: false, minus: !!allowMinus };
    $('p-choices').hidden = true; $('p-choices').innerHTML = '';
    $('p-pad').hidden = false;
    $('live').classList.add('typing');
    $('keys-hint') && ($('keys-hint').textContent = 'Type with the keys or the pad. Enter sends.');
    const key = (k, label) => `<button type="button" data-key="${k}" aria-label="${label || k}">${k}</button>`;
    $('p-pad').innerHTML = `<div class="entryrow">${allowMinus ? key('±', 'plus or minus') : ''}<div class="entry" id="p-entry" aria-live="polite"><span class="ph">?</span></div></div>
      <div class="keys">${key('1')}${key('2')}${key('3')}${key('⌫', 'delete')}${key('4')}${key('5')}${key('6')}${key('0')}${key('7')}${key('8')}${key('9')}<button type="button" class="send" id="p-send" disabled>Go</button></div>`;
    $('p-pad').querySelectorAll('[data-key]').forEach((b) => { b.onclick = () => padKey(b.dataset.key); });
    $('p-send').onclick = () => padKey('Enter');
  }
  function padKey(k) {
    if (!pad || pad.locked) return;
    if (k === 'Enter') { if (/\d/.test(pad.value)) { pad.locked = true; padRender(); pad.onSubmit(pad.value); } return; }
    if (k === '⌫' || k === 'Backspace') pad.value = pad.value.slice(0, -1);
    else if (k === '±' || k === MINUS || k === '-') { if (pad.minus) pad.value = pad.value.startsWith('-') ? pad.value.slice(1) : `-${pad.value}`; }
    else if (/^\d$/.test(k) && pad.value.replace('-', '').length < 5) pad.value += k;
    padRender();
  }
  function padRender() {
    if (!pad) return;
    $('p-entry').innerHTML = pad.value ? `<span class="v">${esc(showNum(pad.value))}</span>` : '<span class="ph">?</span>';
    $('p-send').disabled = pad.locked || !/\d/.test(pad.value);
    $('p-pad').classList.toggle('locked', pad.locked);
  }
  /** After grading: the pad shows what was typed, green or red. Huddle, still open (`onChange`):
   *  the sent number, plus a Change button that brings the pad back with it to edit. */
  function padResult(typed, ok, onChange) {
    pad = null;
    $('p-choices').hidden = true;
    $('p-pad').hidden = false;
    $('live').classList.add('typing');
    $('p-pad').innerHTML = `<div class="entryrow"><div class="entry ${ok == null ? 'sent' : ok ? 'right' : 'wrong'}"><span class="v">${esc(showNum(typed))}</span></div>${
      onChange ? '<button type="button" class="change" id="p-change">Change</button>' : ''}</div>`;
    if (onChange) $('p-change').onclick = () => { onChange(); if (pad) { pad.value = String(typed); padRender(); } };
  }
  function closePad() { pad = null; $('live').classList.remove('typing'); $('p-pad').hidden = true; $('p-pad').innerHTML = ''; $('p-choices').hidden = false; }
  const typedPlay = (play) => play && play.input === 'number';
  const negOk = (play) => !!play.neg; // the play says when its answer can be negative (integers, a slope, a y-intercept…)

  // ---- drive: each student on their own play ----
  async function nextDrivePlay() {
    if (fetching || !st || st.phase !== 'live') return;
    fetching = true;
    try {
      const r = await api(`/${encodeURIComponent(seat.code)}/play`);
      // heist: the server holds the play back while the alarm rings or a crack is open
      if (r.alarm) { showAlarm(r.alarm); return; }
      if (r.safe) { showSafes(r.safe); return; }
      if (r.pick) { showTargets(r.pick.kind, r.pick.options); return; }
      heistWait = null;
      cur = { n: r.n, play: r.play, locked: false };
      $('p-card').innerHTML = cardHTML(r.play, null, `Play ${r.n}`);
      if (typedPlay(r.play)) openPad(answerDrive, negOk(r.play));
      else { closePad(); $('p-choices').innerHTML = choicesHTML(r.play); bindChoices(answerDrive); }
      $('fb').className = 'fb';
      $('fb').innerHTML = `<span class="muted">${esc(r.play.head)}</span>`;
    } catch (err) {
      if (err.status === 401) gone('You are no longer in this game.');
      // 409: the clock ran out between states — the "over" state is on its way.
    } finally { fetching = false; }
  }

  async function answerDrive(k) {
    if (!cur || cur.locked) return;
    cur.locked = true;
    $('p-choices').querySelectorAll('.ch').forEach((b) => { b.disabled = true; });
    try {
      const r = await api(`/${encodeURIComponent(seat.code)}/answer`, { method: 'POST', body: JSON.stringify({ n: cur.n, k }) });
      const typed = typedPlay(cur.play);
      $('p-card').innerHTML = cardHTML(cur.play, r.revealCard, `Play ${cur.n}`);
      if (typed) padResult(r.picked, r.ok);
      else $('p-choices').innerHTML = choicesHTML(cur.play, { answer: r.answer, picked: k, disabled: true });
      if (r.heist) {
        // the heist pays in cash; a miss trips the alarm (the server holds the next play until it clears)
        const hz = r.heist;
        if (r.ok) {
          $('fb').className = `fb good${hz.safe ? ' crack' : ''}`;
          $('fb').innerHTML = `<span class="bigtxt">${hz.safe ? '🔐 Safe cracked!' : r.tier === 0 ? 'Clean' : r.tier === 1 ? 'Right' : 'Right, slow'} · +${money(hz.step)}</span><span class="why">${(r.ms / 1000).toFixed(1)} s${hz.safe ? ' · 3 in a row — pick a safe' : ''}</span>`;
          setTimeout(() => { cur = null; if (hz.safe) showSafes(hz.safe); else nextDrivePlay(); }, hz.safe ? 900 : typed ? 380 : 650);
        } else {
          $('fb').className = 'fb bad';
          $('fb').innerHTML = `<span class="bigtxt">🚨 Alarm · ${MINUS}${money(-hz.step)}</span><span class="why">You ${typed ? `typed ${esc(showNum(r.picked))}` : `picked ${(cur.play.choices.find((c) => c.k === k) || {}).html || ''}`}. ${r.tell}</span>`;
          setTimeout(() => showAlarm(hz.lockUntil), 1600); // read the tell first, then the lock
        }
        return;
      }
      if (r.ok) {
        const call = r.hill ? hillCall(r.hill) : r.blitz ? '⚡ Blitz!' : r.tier === 0 ? 'Big play' : r.tier === 1 ? 'First down' : 'Short gain';
        const blitzed = r.blitz ? ` · ${esc(teamName(r.blitz.team))} pushed back ${r.blitz.lost}` : '';
        $('fb').className = `fb good${r.blitz ? ' blitz' : ''}`;
        $('fb').innerHTML = `<span class="bigtxt">${call}${r.hill ? '' : ` · +${r.gain}`}</span><span class="why">${r.hill ? `+${r.gain} · ` : ''}${(r.ms / 1000).toFixed(1)} s${blitzed}</span>`;
        // facts move fast: a right answer gets out of the way for the next one
        setTimeout(() => { cur = null; nextDrivePlay(); }, r.blitz ? 1100 : typed ? 380 : 650);
      } else {
        const picked = typed ? `typed ${esc(showNum(r.picked))}` : `picked ${(cur.play.choices.find((c) => c.k === k) || {}).html || ''}`;
        $('fb').className = 'fb bad';
        $('fb').innerHTML = `<span class="bigtxt">${r.hill ? 'Slipped' : 'Sacked'} · ${showNum(r.gain)}</span><span class="why">You ${picked}. ${r.tell}</span><button class="next" id="nx">Next play</button>`;
        $('nx').focus();
        $('nx').onclick = () => { cur = null; nextDrivePlay(); };
      }
    } catch (err) {
      if (err.status === 401) return gone('You are no longer in this game.');
      if (err.status === 400 && typedPlay(cur.play)) { cur.locked = false; openPad(answerDrive, negOk(cur.play)); }
      $('fb').className = 'fb';
      $('fb').innerHTML = `<span class="muted">${esc(err.message)}</span>`;
      // "already over": the server is past this play (0:00, or a reconnect) — pick up where it is
      if (err.status === 409) setTimeout(() => { cur = null; nextDrivePlay(); }, 900);
    }
  }

  /** What a right answer did on the hill: a plain climb, a boulder, a block, or a shield. */
  function hillCall(h) {
    if (h.threw && h.threw.blocked) return `🛡 ${esc(h.threw.name)} blocked your boulder`;
    if (h.threw) return `🪨 Boulder! ${esc(h.threw.name)} goes down`;
    if (h.shield) return '🛡 Shield up!';
    return 'Climb';
  }

  // ---- huddle: everyone on the play the board shows ----
  function renderHuddle() {
    const r = st.round;
    if (!r) return;
    const mine = r.mine;
    const key = `${r.n}:${r.closed ? 'c' : 'o'}:${mine ? mine.k : ''}`;
    if (key === huddleKey) return;
    huddleKey = key;
    const typed = typedPlay(r.play);
    if (r.closed) {
      $('p-card').innerHTML = cardHTML(r.play, r.revealCard, `Play ${r.n}`);
      if (typed) { if (mine) padResult(mine.k, mine.ok); else closePad(); }
      else $('p-choices').innerHTML = choicesHTML(r.play, { answer: r.answer, picked: mine && mine.k, disabled: true });
      const picks = r.pickSix || [];
      const p6 = st.rules && st.rules.pickSix;
      const ours = picks[st.me.team] && p6 ? `<b>🏈 PICK SIX!</b> Everyone on ${esc(teamName(st.me.team))} got it: +${p6.points}, and ${esc(teamName(1 - st.me.team))} is back on the ${p6.resetPos}. ` : '';
      const theirs = picks[1 - st.me.team] && p6 ? `<b>Pick six for ${esc(teamName(1 - st.me.team))}</b> — all of them got it, so ${esc(teamName(st.me.team))} is back on the ${p6.resetPos}. ` : '';
      if (!mine && r.penalty) { $('fb').className = 'fb bad'; $('fb').innerHTML = `<span class="bigtxt">No answer · ${showNum(r.penalty)}</span><span class="why"><b>Sitting out costs more than a wrong answer.</b> ${theirs}${r.tell}</span>`; }
      else if (!mine) { $('fb').className = 'fb'; $('fb').innerHTML = `<span class="bigtxt">No answer</span><span class="why">${theirs}${r.tell}</span>`; }
      else if (mine.ok) { $('fb').className = `fb good${picks[st.me.team] ? ' pick6' : ''}`; $('fb').innerHTML = `<span class="bigtxt">${picks[st.me.team] ? 'Pick six' : 'Right'} · +${mine.gain}</span><span class="why">${ours}${theirs}${r.tell}</span>`; }
      else { $('fb').className = 'fb bad'; $('fb').innerHTML = `<span class="bigtxt">Sacked · ${showNum(mine.gain)}</span><span class="why">${theirs}${r.tell}</span>`; }
      return;
    }
    $('p-card').innerHTML = cardHTML(r.play, null, `Play ${r.n}`);
    if (mine) {
      // Answer in — but the play is still open, so it can be changed: the choices stay live (the
      // current pick is lit, nothing is faded) and a typed answer gets a Change button. The server
      // grades the LAST answer, timed from when it was sent (games.js answer).
      if (typed) padResult(mine.k, null, () => openPad(answerHuddle, negOk(r.play)));
      else { closePad(); $('p-choices').innerHTML = choicesHTML(r.play, { picked: mine.k, keepOthers: true }); bindChoices(answerHuddle); }
      $('fb').className = 'fb'; $('fb').innerHTML = `<span class="bigtxt">Answer in</span><span class="why">Changed your mind? ${typed ? 'Tap Change' : 'Tap another choice'} before the reveal — your last answer counts.</span>`;
      return;
    }
    if (typed) openPad(answerHuddle, negOk(r.play));
    else { closePad(); $('p-choices').innerHTML = choicesHTML(r.play); bindChoices(answerHuddle); }
    $('fb').className = 'fb'; $('fb').innerHTML = `<span class="muted">${esc(r.play.head)}</span>`;
  }

  async function answerHuddle(k) {
    const r = st && st.round;
    if (!r || r.closed) return;
    const was = r.mine; // a change: keep the old pick to fall back on if the new one doesn't land
    if (was && was.k === k) return;
    r.mine = { k }; // optimistic: show the pick now
    huddleKey = '';
    renderHuddle();
    try { await api(`/${encodeURIComponent(seat.code)}/answer`, { method: 'POST', body: JSON.stringify({ n: r.n, k }) }); }
    catch (err) {
      if (err.status === 401) return gone('You are no longer in this game.');
      if (err.status === 409) return; // closed under us; the reveal state is on its way
      r.mine = was || null; huddleKey = ''; renderHuddle();
      $('fb').innerHTML = `<span class="muted">${esc(err.message)}</span>`;
    }
  }

  // ---------------- final ----------------
  function renderFinal() {
    st.teams.forEach((t, i) => { $('f-n' + i).textContent = t.name; $('f-p' + i).textContent = t.pts; });
    const [a, b] = st.teams;
    const win = a.pts !== b.pts ? (a.pts > b.pts ? 0 : 1) : (a.pos !== b.pos ? (a.pos > b.pos ? 0 : 1) : -1);
    const mineWon = win === st.me.team;
    $('f-mid').textContent = win < 0 ? 'Tie' : mineWon ? 'W' : 'L';
    const h = $('f-result');
    h.className = win >= 0 ? `t${win}` : '';
    h.textContent = win < 0 ? 'Tie game' : `${teamName(win)} wins`;
    const me = st.me;
    const onHill = st.mode === 'hill';
    $('final').classList.toggle('mode-hill', onHill);
    $('f-place').hidden = !onHill;
    if (onHill && st.hill) {
      const hl = st.hill;
      $('f-mid').textContent = `#${hl.rank}`;
      h.className = hl.rank === 1 ? 'king' : '';
      h.textContent = hl.rank === 1 ? '👑 King of the Hill' : `#${hl.rank} of ${hl.of}`;
      $('f-place').textContent = hl.rank === 1 ? `You finished on top at ${Math.round(hl.h)}.` : `You finished at ${Math.round(hl.h)}${hl.king ? ` · 👑 ${hl.king.name} is king` : ''}.`;
    }
    const onHeist = st.mode === 'heist';
    $('final').classList.toggle('mode-heist', onHeist);
    if (onHeist && st.heist) {
      const hz = st.heist;
      $('f-place').hidden = false;
      $('f-mid').textContent = `#${hz.rank}`;
      h.className = hz.rank === 1 ? 'king' : '';
      h.textContent = hz.rank === 1 ? '🏆 Top of the heist' : `#${hz.rank} of ${hz.of}`;
      $('f-place').textContent = hz.rank === 1 ? `You walked out with ${money(hz.cash)}.` : `You walked out with ${money(hz.cash)}${hz.leader ? ` · 🏆 ${hz.leader.name} took ${money(hz.leader.cash)}` : ''}.`;
    }
    $('f-yds').textContent = onHill && st.hill ? Math.round(st.hill.h) : onHeist && st.heist ? money(st.heist.cash) : me.yards;
    $('f-yds').nextElementSibling.textContent = onHill ? 'Height' : onHeist ? 'Your cash' : 'Your yards';
    $('f-comp').textContent = `${me.comp}/${me.att}`;
    $('f-pct').textContent = me.att ? Math.round((100 * me.comp) / me.att) + '%' : '–';
    $('f-best').textContent = me.best;
    const ms = st.film || [];
    $('f-film').innerHTML = '<h3>Film room</h3>' + (ms.length
      ? `<p>${ms.length} missed ${ms.length === 1 ? 'play' : 'plays'}. Read the tell on each one; that's the clue you'll see next time.</p><ol>${ms.map((m) => `<li>
          ${cardHTML({ card: m.card, playbookName: '' }, m.card, '')}
          <div class="note"><span><span class="tag">You picked</span><span class="yr">${m.pickedHtml}</span></span><span><span class="tag">Answer</span><span class="cr">${m.answerHtml}</span></span></div>
          <div class="tellbox">${m.tell}</div></li>`).join('')}</ol>`
      : '<p>Clean game. No film to review.</p>');
    renderMyFacts(st.facts);
    if (st.facts && account) lifetime();
    // The stream stays open: the teacher may run it back, and this phone goes straight to the lobby.
  }

  /** Signed in: the saved record, after this game is folded in (the save runs as the game ends). */
  let lifetimeFor = null;
  function lifetime() {
    const key = `${seat && seat.code}:${st.gameNumber}`;
    if (lifetimeFor === key) return;
    lifetimeFor = key;
    setTimeout(async () => {
      try {
        const res = await fetch('/api/live-drill/mine/fluency', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const f = await res.json();
        if (!f.games || $('f-facts').hidden) return;
        const line = document.createElement('p');
        line.className = 'lifetime';
        const once = f.new ? ` · <b>${f.new}</b> right once — get ${f.new === 1 ? 'it' : 'them'} again to lock ${f.new === 1 ? 'it' : 'them'} in` : '';
        line.innerHTML = `<b>All your games (${f.games}):</b> ${f.fluent} fluent${once}${f.missed ? ` · ${f.missed} to practice` : ''}. Saved to your account.`;
        $('f-facts').appendChild(line);
      } catch { /* offline: the game's own summary is already on screen */ }
    }, 1500);
  }

  /** Math Facts: this student's own fluency — what to practice tonight. */
  function renderMyFacts(fx) {
    $('f-facts').hidden = !fx;
    if (!fx) return;
    const chips = (xs, cls) => xs.map((x) => `<span class="fchip ${cls}">${typeof x === 'string' ? x : `${x.label} <i>${x.sec}s</i>`}</span>`).join('');
    const practice = fx.missed.length + fx.slow.length;
    $('f-facts').innerHTML = `<h3>Your facts</h3>
      <div class="stats"><div><span class="v">${fx.fluent}/${fx.tried}</span><span class="k">Fluent</span></div>
      <div><span class="v">${fx.medianSec == null ? '–' : fx.medianSec + 's'}</span><span class="k">Typical time</span></div></div>
      ${practice ? `<p>Practice these — <span class="fchip miss">missed</span> first, then <span class="fchip slow">right but over ${fx.fluentSec}s</span>:</p><div class="fchips">${chips(fx.missed, 'miss')}${chips(fx.slow, 'slow')}</div>`
    : `<p>Every fact right in ${fx.fluentSec} s or less. That's fluent.</p>`}`;
  }

  // ---------------- keys ----------------
  document.addEventListener('keydown', (e) => {
    if ($('live').hidden || e.target.tagName === 'INPUT') return;
    if (pad) {
      if (/^\d$/.test(e.key) || e.key === '-' || e.key === 'Backspace' || e.key === 'Enter') { e.preventDefault(); padKey(e.key); }
      return;
    }
    if (/^[1-4]$/.test(e.key)) { const b = $('p-choices').children[+e.key - 1]; if (b && !b.disabled) b.click(); }
    else if ((e.key === 'Enter' || e.key === ' ') && $('nx') && document.activeElement !== $('nx')) { e.preventDefault(); $('nx').click(); }
  });

  // ---------------- boot ----------------
  const qs = new URLSearchParams(location.search);
  const qcode = (qs.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  try { $('name').value = localStorage.getItem('mm-live-drill-name') || ''; } catch { /* private mode */ }
  /** Signed in as a student? Then the name comes from the account, and a code in the URL joins at once. */
  async function detectAccount() {
    try {
      const me = await mine('');
      if (!me.student) return;
      account = { name: me.name };
      $('name-row').hidden = true;
      $('name').required = false;
      $('acct-name').textContent = me.name;
      $('acct-row').hidden = false;
      if (qcode) {
        $('join-btn').disabled = true;
        try { seatFrom(await mine('/join', { method: 'POST', body: JSON.stringify({ code: qcode }) })); }
        catch (err) { $('join-err').textContent = err.message; }
        $('join-btn').disabled = false;
      }
    } catch { /* not signed in — the name box stays */ }
  }

  function showJoin() {
    seat = null;
    $('code').value = qcode;
    show('join');
    (qcode ? $('name') : $('code')).focus();
    detectAccount();
  }

  seat = store.get();
  if (seat && seat.token && (!qcode || qcode === seat.code)) {
    api(`/${encodeURIComponent(seat.code)}/state`).then((s) => { apply(s); connect(); }).catch(() => { store.clear(); showJoin(); });
  } else {
    showJoin();
  }
})();
