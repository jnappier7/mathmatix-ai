/* global csrfFetch */
// Sound: public/js/live-drill/sound.js (window.LiveDrillSound) — projector only.
// Live Two-Minute Drill — the projector. Setup → lobby → live → final, all driven by the
// game state the server pushes over SSE (routes/liveDrill.js /host/games/:code/stream).
(function () {
  const { $, esc, setField, cardHTML, syncClock, serverNow, mmss, watchTouchdowns } = window.LiveDrill;
  const API = '/api/live-drill/host';
  const SND = window.LiveDrillSound || { unlock() {}, whistle() {}, horn() {}, tick() {}, chime() {}, buzzer() {}, muted: true, setMuted() {} };
  let lastTick = null; // the clock second last ticked, so each of the final five ticks once

  const S = { drills: [], settings: null, classes: [], drill: 'algebra', playbook: 'all', mode: 'drive', seconds: 120, plays: 10, spp: 20, classId: '' };
  let game = null; // latest host state
  let es = null;
  let tick = null;
  let openChip = null;
  const seenFeed = new Set(); // feed items already animated in

  async function api(path, opts) {
    const res = await csrfFetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) },
      credentials: 'same-origin',
    });
    let body = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error((body && body.message) || `Request failed (${res.status})`);
    return body;
  }

  function show(id) { ['setup', 'lobby', 'live', 'final'].forEach((s) => { $(s).hidden = s !== id; }); }

  // ---------------- setup ----------------
  function segment(el, values, current, fmt, onPick) {
    el.innerHTML = values.map((v) => `<button data-v="${v}" aria-pressed="${v === current}">${fmt(v)}</button>`).join('');
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => onPick(Number(b.dataset.v)); });
  }
  function renderSetup() {
    $('drills').innerHTML = S.drills.map((d) => `<button data-id="${d.id}" aria-pressed="${d.id === S.drill}"${d.unavailable ? ' disabled' : ''}>${esc(d.title)}</button>`).join('');
    $('drills').querySelectorAll('button').forEach((b) => { b.onclick = () => { S.drill = b.dataset.id; S.playbook = 'all'; renderSetup(); }; });
    const d = S.drills.find((x) => x.id === S.drill) || { playbooks: [] };
    $('books').innerHTML = d.playbooks.map((b) => `<button class="book" data-k="${b.key}" aria-pressed="${b.key === S.playbook}"><span class="bk-ch">${esc(b.ch)}</span><span class="nm">${esc(b.name)}</span><span class="bl">${esc(b.blurb)}</span></button>`).join('');
    $('books').querySelectorAll('.book').forEach((b) => { b.onclick = () => { S.playbook = b.dataset.k; renderSetup(); }; });
    $('m-drive').setAttribute('aria-pressed', S.mode === 'drive');
    $('m-huddle').setAttribute('aria-pressed', S.mode === 'huddle');
    $('opt-drive').hidden = S.mode !== 'drive';
    $('opt-huddle').hidden = S.mode !== 'huddle';
    const st = S.settings;
    segment($('o-seconds'), st.drive.seconds, S.seconds, (v) => mmss(v * 1000), (v) => { S.seconds = v; renderSetup(); });
    segment($('o-plays'), st.huddle.plays, S.plays, String, (v) => { S.plays = v; renderSetup(); });
    segment($('o-spp'), st.huddle.secondsPerPlay, S.spp, (v) => v + 's', (v) => { S.spp = v; renderSetup(); });
    $('cls').value = S.classId;
    $('cls-note').hidden = !S.classes.length;
    try { localStorage.setItem('mm-live-drill-setup', JSON.stringify({ drill: S.drill, playbook: S.playbook, mode: S.mode, seconds: S.seconds, plays: S.plays, spp: S.spp, classId: S.classId })); } catch { /* private mode */ }
  }
  function renderClasses() {
    $('cls').innerHTML = '<option value="">No class — students join with the code</option>'
      + S.classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${c.students})</option>`).join('');
    if (!S.classes.some((c) => c.id === S.classId)) S.classId = '';
  }
  $('cls').onchange = () => { S.classId = $('cls').value; renderSetup(); };
  $('m-drive').onclick = () => { S.mode = 'drive'; renderSetup(); };
  $('m-huddle').onclick = () => { S.mode = 'huddle'; renderSetup(); };

  $('open').onclick = async () => {
    $('setup-err').textContent = '';
    $('open').disabled = true;
    try {
      const st = await api('/games', { method: 'POST', body: JSON.stringify({
        drill: S.drill, playbook: S.playbook, mode: S.mode, seconds: S.seconds, plays: S.plays, secondsPerPlay: S.spp,
        classId: S.classId || undefined,
      }) });
      connect(st.code);
      apply(st);
    } catch (e) { $('setup-err').textContent = e.message; }
    $('open').disabled = false;
  };

  // ---------------- live connection ----------------
  function connect(code) {
    if (es) es.close();
    es = new EventSource(`${API}/games/${encodeURIComponent(code)}/stream`);
    es.addEventListener('state', (ev) => { try { apply(JSON.parse(ev.data)); } catch { /* malformed */ } });
    es.onerror = async () => {
      // EventSource retries on its own; just check the game still exists.
      try { apply(await api(`/games/${encodeURIComponent(code)}`)); } catch (e) {
        if (/not found/i.test(e.message)) { es.close(); es = null; game = null; show('setup'); $('setup-err').textContent = 'That game has ended.'; }
      }
    };
  }

  function action(path) {
    return async () => {
      try { apply(await api(`/games/${encodeURIComponent(game.code)}${path}`, { method: 'POST', body: '{}' })); }
      catch (e) { ($(!game ? 'setup-err' : game.phase === 'lobby' ? 'lobby-err' : game.phase === 'over' ? 'final-err' : 'live-err')).textContent = e.message; }
    };
  }
  $('kick').onclick = action('/start');
  $('g-end').onclick = () => { if (confirm('End the game now?')) action('/end')(); };
  $('h-next').onclick = action('/advance');
  $('l-cancel').onclick = async () => { await action('/end')(); reset(); show('setup'); };
  function reset() { if (es) es.close(); es = null; game = null; seenFeed.clear(); $('l-code').textContent = '------'; $('l-qr').hidden = true; }
  $('f-again').onclick = () => { reset(); show('setup'); renderSetup(); };
  // Same code, same teams, same phones: everyone lands back in the lobby still seated.
  $('f-rematch').onclick = () => { seenFeed.clear(); $('final-err').textContent = ''; action('/rematch')(); };

  // ---------------- sound ----------------
  // Browsers allow audio only after a gesture; the teacher's first click or clicker press unlocks it.
  document.addEventListener('pointerdown', () => SND.unlock(), { capture: true });
  document.addEventListener('keydown', () => SND.unlock(), { capture: true });
  function renderSound() {
    $('snd').setAttribute('aria-pressed', SND.muted);
    $('snd').textContent = SND.muted ? '🔇 Muted' : '🔊 Sound';
  }
  $('snd').onclick = () => { SND.setMuted(!SND.muted); renderSound(); };
  renderSound();

  /** What the room should hear, from one state to the next. */
  function cue(prev, st) {
    if (!prev) return;
    if (prev.phase === 'lobby' && st.phase !== 'lobby' && st.phase !== 'over') SND.whistle();
    if (st.teams.some((t, i) => prev.teams[i] && t.pts > prev.teams[i].pts)) SND.horn();
    if (st.mode === 'huddle' && prev.round && st.round && prev.round.n === st.round.n && !prev.round.closed && st.round.closed) SND.chime();
    if (prev.phase !== 'over' && st.phase === 'over') SND.buzzer();
  }

  // ---------------- render ----------------
  function apply(st) {
    if (!st || (game && st.code === game.code && st.version < game.version)) return;
    syncClock(st);
    const prev = game && game.code === st.code ? game : null;
    cue(prev, st);
    if (prev && prev.phase !== 'lobby') watchTouchdowns(prev, st);
    game = st;
    if (st.phase === 'lobby') { show('lobby'); renderLobby(st); }
    else if (st.phase === 'over') { show('final'); renderFinal(st); }
    else { show('live'); renderLive(st); }
    clearInterval(tick);
    if (st.phase === 'live') tick = setInterval(renderClock, 200);
    renderClock();
  }

  function renderLobby(st) {
    if ($('l-code').textContent !== st.code) {
      $('l-qr').src = `${API}/games/${encodeURIComponent(st.code)}/qr.svg`;
      $('l-qr').hidden = false;
    }
    $('l-code').textContent = st.code;
    $('l-class').hidden = !st.className;
    if (st.className) $('l-class').innerHTML = `<b>${esc(st.className)}</b>: your students also have a <b>Join</b> button on their Mathmatix chat screen.`;
    $('l-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${st.mode === 'drive' ? `Team Drive, ${mmss(st.seconds * 1000)}` : `Huddle, ${st.totalPlays} plays`}`;
    $('l-count').textContent = `${st.players.length} player${st.players.length === 1 ? '' : 's'}${st.gameNumber > 1 ? ` · game ${st.gameNumber}` : ''}`;
    $('kick').disabled = st.players.length === 0;
    $('rosters').innerHTML = st.teams.map((t, i) => {
      const ps = st.players.filter((p) => p.team === i);
      return `<div class="roster t${i}"><h3>${esc(t.name)}<span class="muted" style="font-size:1rem">${ps.length}</span></h3><div class="chips">${
        ps.map((p) => (openChip === p.id
          ? `<span class="chipmenu${p.away ? ' away' : ''}">${esc(p.name)}<button data-act="team" data-id="${p.id}" data-team="${1 - i}">→ ${esc(st.teams[1 - i].name)}</button><button class="rm" data-act="kick" data-id="${p.id}">Remove</button><button data-act="close">✕</button></span>`
          : `<button class="chip${p.away ? ' away' : ''}" data-act="open" data-id="${p.id}" title="${p.linked ? 'Signed in' : 'Joined with the code'}${p.away ? ' · screen closed' : ''}">${esc(p.name)}${p.linked ? '<span class="acct" aria-label="signed in">✓</span>' : ''}</button>`)).join('')
      }</div></div>`;
    }).join('');
    $('rosters').querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.id;
        if (b.dataset.act === 'open') { openChip = id; renderLobby(game); return; }
        if (b.dataset.act === 'close') { openChip = null; renderLobby(game); return; }
        openChip = null;
        try {
          const path = b.dataset.act === 'kick' ? `/players/${id}/kick` : `/players/${id}/team`;
          apply(await api(`/games/${encodeURIComponent(game.code)}${path}`, { method: 'POST', body: JSON.stringify({ team: Number(b.dataset.team) }) }));
        } catch (e) { $('lobby-err').textContent = e.message; }
      };
    });
  }

  function renderScoreboard(st) {
    st.teams.forEach((t, i) => { $('s-n' + i).textContent = `${t.name} · ${t.size}`; $('s-p' + i).textContent = t.pts; });
    setField($('field'), st.teams);
  }

  function renderClock() {
    if (!game || game.phase === 'lobby' || game.phase === 'over') return;
    const c = $('s-clock');
    if (game.mode === 'drive') {
      $('s-ck').textContent = 'Clock';
      const left = game.endsAt - serverNow();
      c.textContent = mmss(left);
      c.classList.toggle('low', left <= 15000);
      finalFive(`d${game.code}:${game.gameNumber}`, left);
    } else {
      const r = game.round;
      $('s-ck').textContent = 'Play';
      c.textContent = r ? `${r.n}/${game.totalPlays}` : '–';
      c.classList.remove('low');
      if (r && !r.closed) {
        const left = r.closesAt - serverNow();
        $('h-count').textContent = `${mmss(left)} · ${r.answered}/${r.expected} in`;
        $('h-count').classList.toggle('low', left <= 5000);
        finalFive(`h${game.code}:${game.gameNumber}:${r.n}`, left);
      }
    }
  }

  /** One tick for each of the last five seconds of a clock (`id` names which clock). */
  function finalFive(id, leftMs) {
    const s = Math.ceil(leftMs / 1000);
    if (s < 1 || s > 5) return;
    const key = `${id}:${s}`;
    if (key === lastTick) return;
    lastTick = key;
    SND.tick(s === 1);
  }

  function renderLive(st) {
    $('g-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${st.mode === 'drive' ? 'Team Drive' : 'Huddle'}`;
    $('g-code').textContent = st.code;
    renderScoreboard(st);
    const drive = st.mode === 'drive';
    $('live-body').classList.toggle('mode-huddle', !drive);
    $('drive-pane').hidden = !drive;
    $('huddle-pane').hidden = drive;
    $('h-next').hidden = drive;
    $('h-keys').hidden = drive;
    if (drive) {
      $('feed').innerHTML = st.feed.map((f) => {
        const id = `${f.at}|${f.type}|${f.who || ''}`;
        const team = (f.team != null ? ` t${f.team}` : '') + (seenFeed.has(id) ? '' : ' new');
        seenFeed.add(id);
        if (f.type === 'td') return `<span class="it ev${team.includes('new') ? ' new' : ''}">${esc(f.text)}${f.who ? ` · ${esc(f.who)}` : ''}</span>`;
        if (f.type === 'big') return `<span class="it${team}">${esc(f.who)} +${f.gain}</span>`;
        if (f.type === 'sack') return `<span class="it${team}">${esc(f.who)} sacked</span>`;
        if (f.type === 'kickoff') return `<span class="it ev${team.includes('new') ? ' new' : ''}">KICKOFF</span>`;
        return '';
      }).join('') || '<span class="muted">The play-by-play shows up here.</span>';
      return;
    }
    renderHuddle(st);
  }

  function renderHuddle(st) {
    const r = st.round;
    if (!r) return;
    const play = r.play;
    $('h-head').textContent = `Play ${r.n} of ${st.totalPlays} · ${play.head}`;
    $('h-card').innerHTML = cardHTML(play, r.closed ? r.revealCard : null, `Play ${r.n}`);
    const total = Math.max(1, Object.values(r.counts || {}).reduce((a, b) => a + b, 0));
    $('h-choices').innerHTML = play.choices.map((c, i) => {
      if (!r.closed) return `<div class="ch"><span class="kbd">${i + 1}</span><span class="lab">${c.html}</span></div>`;
      const n = (r.counts && r.counts[c.k]) || 0;
      const cls = c.k === r.answer ? ' right' : ' fade';
      return `<div class="ch${cls}"><span class="bar" style="width:${Math.round((100 * n) / total)}%"></span><span class="kbd">${i + 1}</span><span class="lab">${c.html}</span><span class="cnt">${n}</span></div>`;
    }).join('');
    $('h-reveal').hidden = !r.closed;
    if (r.closed) {
      $('h-count').textContent = 'Reveal';
      $('h-count').classList.remove('low');
      $('h-tell').innerHTML = r.tell;
      $('h-split').innerHTML = st.teams.map((t, i) => `<span class="t${i}">${esc(t.name)}: ${r.rightByTeam[i]}/${t.size} right</span>`).join('');
      $('h-next').textContent = r.n >= st.totalPlays ? 'Final score' : 'Next play';
    } else {
      $('h-next').textContent = 'Reveal now';
    }
  }

  function renderFinal(st) {
    st.teams.forEach((t, i) => { $('f-n' + i).textContent = t.name; $('f-p' + i).textContent = t.pts; });
    const f = st.final || { mvps: [[], []], film: [], pct: 0, att: 0 };
    $('f-acc').textContent = f.att ? f.pct + '%' : '–';
    const [a, b] = st.teams;
    const win = a.pts !== b.pts ? (a.pts > b.pts ? 0 : 1) : (a.pos !== b.pos ? (a.pos > b.pos ? 0 : 1) : -1);
    const h = $('f-result');
    h.className = win >= 0 ? `t${win}` : '';
    h.textContent = win < 0 ? 'Tie game' : `${st.teams[win].name} wins${a.pts === b.pts ? ' on field position' : ''}`;
    $('f-mvps').innerHTML = st.teams.map((t, i) => `<div class="panel t${i}"><h3>${esc(t.name)} · top players</h3>${
      f.mvps[i].length ? `<ol>${f.mvps[i].map((p) => `<li>${esc(p.name)} <span>${p.yards} yds · ${p.comp}/${p.att}</span></li>`).join('')}</ol>` : '<p class="muted">No plays run.</p>'
    }</div>`).join('');
    $('f-film').innerHTML = '<h3>Film room</h3>' + (f.film.length
      ? `<p>The plays the class missed most. This is the reteach.</p><ol>${f.film.map((m) => `<li>
          <div class="note"><span class="count">${m.count} missed</span>${m.commonPick ? `<span><span class="tag">Most common wrong pick</span><span class="yr">${m.commonPick.html}</span> (${m.commonPick.count})</span>` : ''}<span><span class="tag">Answer</span><span class="cr">${m.answerHtml}</span></span></div>
          ${cardHTML({ card: m.card, playbookName: m.playbookName }, m.card, '')}
          <div class="tellbox">${m.tell}</div></li>`).join('')}</ol>`
      : '<p>Nobody missed a play. Clean game.</p>');
    renderPlayByPlay(st, f.plays || []);
  }

  /** Every play anyone answered, in order — tap a row for the play, the answer and the tell. */
  function renderPlayByPlay(st, plays) {
    if (!plays.length) { $('f-pbp').innerHTML = ''; $('f-pbp').hidden = true; return; }
    $('f-pbp').hidden = false;
    const band = (p) => (p < 50 ? 'low' : p < 80 ? 'mid' : 'high');
    const note = st.mode === 'drive'
      ? 'Each student ran the plays at their own pace, so the later plays were only reached by the fastest.'
      : 'Every student saw every play.';
    $('f-pbp').innerHTML = `<h3>Play by play</h3><p>${note} Tap a play to see it again.</p><ol>${plays.map((p) => `<li><details class="${band(p.pct)}">
        <summary><span class="pn">#${p.n}</span><span class="ps">${p.summary}</span>
          <span class="meter" aria-hidden="true"><span style="width:${p.pct}%"></span></span>
          <span class="pp" title="${p.right} of ${p.att} right">${p.pct}%</span></summary>
        <div class="more">
          <div class="note"><span><span class="tag">Right</span>${p.right} of ${p.att}</span>${p.commonWrong ? `<span><span class="tag">Most common wrong pick</span><span class="yr">${p.commonWrong.html}</span> (${p.commonWrong.count})</span>` : ''}<span><span class="tag">Answer</span><span class="cr">${p.answerHtml}</span></span></div>
          ${cardHTML({ card: p.card, playbookName: p.playbookName }, p.card, '')}
          <div class="tellbox">${p.tell}</div>
        </div></details></li>`).join('')}</ol>`;
  }

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && e.target === document.body) { SND.setMuted(!SND.muted); renderSound(); }
  });

  // A presentation clicker sends →, PageDown or Space: in Huddle it reveals / advances.
  document.addEventListener('keydown', (e) => {
    if (!game || game.mode !== 'huddle' || $('live').hidden || $('h-next').hidden) return;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key) && e.target === document.body) {
      e.preventDefault();
      $('h-next').click();
    }
  });

  // ---------------- boot ----------------
  (async function boot() {
    try { Object.assign(S, JSON.parse(localStorage.getItem('mm-live-drill-setup') || '{}')); } catch { /* none saved */ }
    try {
      const [{ drills, settings }, { classes }] = await Promise.all([api('/drills'), api('/classes').catch(() => ({ classes: [] }))]);
      S.drills = drills; S.settings = settings; S.classes = classes;
      renderClasses();
      if (!drills.some((d) => d.id === S.drill && !d.unavailable)) S.drill = (drills.find((d) => !d.unavailable) || drills[0]).id;
      if (S.mode !== 'drive' && S.mode !== 'huddle') S.mode = 'drive';
      renderSetup();
      show('setup');
    } catch (e) { $('setup-err').textContent = e.message; }
  })();
})();
