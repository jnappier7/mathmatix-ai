// Live Two-Minute Drill — the student's device. Join with a code and a name; the server deals,
// clocks and grades every play (routes/liveDrill.js). This page only ever reports "I picked
// key k on play n". The token lives in sessionStorage so a refresh rejoins the same seat.
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
      const r = await api('/join', { method: 'POST', body: JSON.stringify({ code: $('code').value, name: $('name').value }) });
      seat = { code: r.code, token: r.token, name: r.name };
      store.set(seat);
      try { localStorage.setItem('mm-live-drill-name', $('name').value.trim()); } catch { /* private mode */ }
      connect();
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
    $('l-team').className = `teamcard t${t}`;
    $('l-teamname').textContent = `Team ${teamName(t)}`;
    $('l-name').textContent = st.me.name;
    $('l-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${st.mode === 'drive' ? 'Team Drive' : 'Huddle'}`;
  }

  function renderScore() {
    st.teams.forEach((t, i) => { $('s-n' + i).textContent = t.name; $('s-p' + i).textContent = t.pts; });
    setField($('field'), st.teams);
    const t = st.me.team;
    $('p-team').className = `pill t${t}`;
    $('p-team').textContent = `Team ${teamName(t)}`;
    $('p-me').textContent = `${st.me.name} · ${st.me.yards} yds · streak ${st.me.streak}`;
  }

  function renderClock() {
    if (!st) return;
    const c = $('s-clock');
    let left = null;
    if (st.mode === 'drive' && st.phase === 'live') { $('s-ck').textContent = 'Clock'; left = st.endsAt - serverNow(); }
    else if (st.mode === 'huddle' && st.round) {
      $('s-ck').textContent = st.round.closed ? `Play ${st.round.n}/${st.totalPlays}` : `Play ${st.round.n}`;
      if (!st.round.closed) left = st.round.closesAt - serverNow();
    }
    if (left == null) { if (st.mode === 'huddle' && st.round && st.round.closed) c.textContent = '—'; c.classList.remove('low'); return; }
    c.textContent = mmss(left);
    c.classList.toggle('low', left <= (st.mode === 'drive' ? 15000 : 5000));
  }

  function renderLive() {
    renderScore();
    if (st.mode === 'drive') { if (!cur && !fetching) nextDrivePlay(); return; }
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

  // ---- drive: each student on their own play ----
  async function nextDrivePlay() {
    if (fetching || !st || st.phase !== 'live') return;
    fetching = true;
    try {
      const r = await api(`/${encodeURIComponent(seat.code)}/play`);
      cur = { n: r.n, play: r.play, locked: false };
      $('p-card').innerHTML = cardHTML(r.play, null, `Play ${r.n}`);
      $('p-choices').innerHTML = choicesHTML(r.play);
      bindChoices(answerDrive);
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
      $('p-card').innerHTML = cardHTML(cur.play, r.revealCard, `Play ${cur.n}`);
      $('p-choices').innerHTML = choicesHTML(cur.play, { answer: r.answer, picked: k, disabled: true });
      if (r.ok) {
        const call = r.gain >= 15 ? 'Big play' : r.gain >= 10 ? 'First down' : 'Short gain';
        $('fb').className = 'fb good';
        $('fb').innerHTML = `<span class="bigtxt">${call} · +${r.gain}</span><span class="why">${(r.ms / 1000).toFixed(1)} s</span>`;
        setTimeout(() => { cur = null; nextDrivePlay(); }, 650);
      } else {
        const picked = (cur.play.choices.find((c) => c.k === k) || {}).html || '';
        $('fb').className = 'fb bad';
        $('fb').innerHTML = `<span class="bigtxt">Sacked · −5</span><span class="why">You picked ${picked}. ${r.tell}</span><button class="next" id="nx">Next play</button>`;
        $('nx').focus();
        $('nx').onclick = () => { cur = null; nextDrivePlay(); };
      }
    } catch (err) {
      if (err.status === 401) return gone('You are no longer in this game.');
      $('fb').className = 'fb';
      $('fb').innerHTML = `<span class="muted">${esc(err.message)}</span>`;
    }
  }

  // ---- huddle: everyone on the play the board shows ----
  function renderHuddle() {
    const r = st.round;
    if (!r) return;
    const mine = r.mine;
    const key = `${r.n}:${r.closed ? 'c' : 'o'}:${mine ? mine.k : ''}`;
    if (key === huddleKey) return;
    huddleKey = key;
    if (r.closed) {
      $('p-card').innerHTML = cardHTML(r.play, r.revealCard, `Play ${r.n}`);
      $('p-choices').innerHTML = choicesHTML(r.play, { answer: r.answer, picked: mine && mine.k, disabled: true });
      if (!mine) { $('fb').className = 'fb'; $('fb').innerHTML = `<span class="bigtxt">No answer</span><span class="why">${r.tell}</span>`; }
      else if (mine.ok) { $('fb').className = 'fb good'; $('fb').innerHTML = `<span class="bigtxt">Right · +${mine.gain}</span><span class="why">${r.tell}</span>`; }
      else { $('fb').className = 'fb bad'; $('fb').innerHTML = `<span class="bigtxt">Sacked · −5</span><span class="why">${r.tell}</span>`; }
      return;
    }
    $('p-card').innerHTML = cardHTML(r.play, null, `Play ${r.n}`);
    if (mine) {
      $('p-choices').innerHTML = choicesHTML(r.play, { picked: mine.k, disabled: true });
      $('fb').className = 'fb'; $('fb').innerHTML = '<span class="bigtxt">Locked in</span><span class="why">Eyes on the board for the reveal.</span>';
      return;
    }
    $('p-choices').innerHTML = choicesHTML(r.play);
    bindChoices(answerHuddle);
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
    $('f-yds').textContent = me.yards;
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
    if (es) { es.close(); es = null; }
  }

  // ---------------- keys ----------------
  document.addEventListener('keydown', (e) => {
    if ($('live').hidden || e.target.tagName === 'INPUT') return;
    if (/^[1-4]$/.test(e.key)) { const b = $('p-choices').children[+e.key - 1]; if (b && !b.disabled) b.click(); }
    else if ((e.key === 'Enter' || e.key === ' ') && $('nx') && document.activeElement !== $('nx')) { e.preventDefault(); $('nx').click(); }
  });

  // ---------------- boot ----------------
  const qs = new URLSearchParams(location.search);
  const qcode = (qs.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  try { $('name').value = localStorage.getItem('mm-live-drill-name') || ''; } catch { /* private mode */ }
  seat = store.get();
  if (seat && seat.token && (!qcode || qcode === seat.code)) {
    api(`/${encodeURIComponent(seat.code)}/state`).then((s) => { apply(s); connect(); }).catch(() => { store.clear(); seat = null; $('code').value = qcode; show('join'); });
  } else {
    seat = null;
    $('code').value = qcode;
    show('join');
    (qcode ? $('name') : $('code')).focus();
  }
})();
