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

  async function api(path, opts) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(seat ? { 'X-Live-Drill-Token': seat.token } : {}) },
      credentials: 'omit',
      cache: 'no-store',
    });
    let body = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (!res.ok) { const e = new Error((body && body.message) || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return body;
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
    if (st.phase === 'lobby') { cur = null; huddleKey = ''; }
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
    $('l-team').className = onHill ? 'teamcard hill' : `teamcard t${t}`;
    $('l-teamname').textContent = onHill ? 'King of the Hill' : `Team ${teamName(t)}`;
    $('l-name').textContent = st.me.name;
    $('l-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${st.mode === 'drive' ? 'Team Drive' : st.mode === 'hill' ? 'every climber for themselves' : 'Huddle'}`;
    const rules = window.LiveDrill.rulesHTML(st);
    if ($('l-rules').dataset.html !== rules) { $('l-rules').innerHTML = rules; $('l-rules').dataset.html = rules; }
  }

  function renderScore() {
    const onHill = st.mode === 'hill';
    $('live').classList.toggle('mode-hill', onHill);
    $('p-hill').hidden = !onHill;
    if (onHill) { renderMyHill(); return; }
    st.teams.forEach((t, i) => { $('s-n' + i).textContent = t.name; $('s-p' + i).textContent = t.pts; });
    setField($('field'), st.teams);
    const t = st.me.team;
    $('p-team').className = `pill t${t}`;
    $('p-team').textContent = `Team ${teamName(t)}`;
    $('p-me').textContent = `${st.me.name} · ${st.me.yards} yds · streak ${st.me.streak}`;
  }

  /** King of the Hill: where I am, who's just above, how close the next boulder is. */
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
    $('p-hill').innerHTML = `<div class="climb"><span class="track"><span class="me" style="bottom:${Math.round((100 * h.h) / h.summit)}%"></span>${
      h.above ? `<span class="up" style="bottom:${Math.round((100 * (h.h + h.above.gap)) / h.summit)}%"></span>` : ''}</span>
      <div class="hnums"><span class="v">${Math.round(h.h)}</span><span class="k">of ${h.summit}</span></div>
      <div class="boulder"><span class="k">${h.king && h.king.me ? 'Shield' : 'Boulder'}</span><span class="dots">${dots}</span></div></div>${status}`;
  }

  function renderClock() {
    if (!st) return;
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
      else if (o.picked != null) cls = c.k === o.picked ? ' picked' : ' fade';
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
  /** After grading: the pad shows what was typed, green or red. */
  function padResult(typed, ok) {
    pad = null;
    $('p-choices').hidden = true;
    $('p-pad').hidden = false;
    $('live').classList.add('typing');
    $('p-pad').innerHTML = `<div class="entry ${ok == null ? 'sent' : ok ? 'right' : 'wrong'}"><span class="v">${esc(showNum(typed))}</span></div>`;
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
      if (r.ok) {
        const call = r.hill ? hillCall(r.hill) : r.tier === 0 ? 'Big play' : r.tier === 1 ? 'First down' : 'Short gain';
        $('fb').className = 'fb good';
        $('fb').innerHTML = `<span class="bigtxt">${call}${r.hill ? '' : ` · +${r.gain}`}</span><span class="why">${r.hill ? `+${r.gain} · ` : ''}${(r.ms / 1000).toFixed(1)} s</span>`;
        // facts move fast: a right answer gets out of the way for the next one
        setTimeout(() => { cur = null; nextDrivePlay(); }, typed ? 380 : 650);
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
      if (!mine) { $('fb').className = 'fb'; $('fb').innerHTML = `<span class="bigtxt">No answer</span><span class="why">${r.tell}</span>`; }
      else if (mine.ok) { $('fb').className = 'fb good'; $('fb').innerHTML = `<span class="bigtxt">Right · +${mine.gain}</span><span class="why">${r.tell}</span>`; }
      else { $('fb').className = 'fb bad'; $('fb').innerHTML = `<span class="bigtxt">Sacked · ${showNum(mine.gain)}</span><span class="why">${r.tell}</span>`; }
      return;
    }
    $('p-card').innerHTML = cardHTML(r.play, null, `Play ${r.n}`);
    if (mine) {
      if (typed) padResult(mine.k, null);
      else $('p-choices').innerHTML = choicesHTML(r.play, { picked: mine.k, disabled: true });
      $('fb').className = 'fb'; $('fb').innerHTML = '<span class="bigtxt">Locked in</span><span class="why">Eyes on the board for the reveal.</span>';
      return;
    }
    if (typed) openPad(answerHuddle, negOk(r.play));
    else { closePad(); $('p-choices').innerHTML = choicesHTML(r.play); bindChoices(answerHuddle); }
    $('fb').className = 'fb'; $('fb').innerHTML = `<span class="muted">${esc(r.play.head)}</span>`;
  }

  async function answerHuddle(k) {
    const r = st && st.round;
    if (!r || r.closed || r.mine) return;
    r.mine = { k }; // optimistic: lock the buttons now
    huddleKey = '';
    renderHuddle();
    try { await api(`/${encodeURIComponent(seat.code)}/answer`, { method: 'POST', body: JSON.stringify({ n: r.n, k }) }); }
    catch (err) {
      if (err.status === 401) return gone('You are no longer in this game.');
      if (err.status === 409) return; // closed under us; the reveal state is on its way
      r.mine = null; huddleKey = ''; renderHuddle();
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
    $('f-yds').textContent = onHill && st.hill ? Math.round(st.hill.h) : me.yards;
    $('f-yds').nextElementSibling.textContent = onHill ? 'Height' : 'Your yards';
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
    // The stream stays open: the teacher may run it back, and this phone goes straight to the lobby.
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
