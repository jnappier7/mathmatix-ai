/* global csrfFetch */
// Sound: public/js/live-drill/sound.js (window.LiveDrillSound) — projector only.
// Live Two-Minute Drill — the projector. Setup → lobby → live → final, all driven by the
// game state the server pushes over SSE (routes/liveDrill.js /host/games/:code/stream).
(function () {
  const { $, esc, setField, cardHTML, syncClock, serverNow, mmss, watchTouchdowns, rulesHTML } = window.LiveDrill;
  const API = '/api/live-drill/host';
  const noop = () => {};
  const SND = window.LiveDrillSound || { unlock: noop, whistle: noop, horn: noop, tick: noop, chime: noop, buzzer: noop, cheer: noop, groan: noop, rumble: noop,
    setScene: noop, setHype: noop, setMuted: noop, setMusic: noop, setCrowd: noop, muted: true, musicOn: false, crowdOn: false };
  let lastTick = null; // the clock second last ticked, so each of the final five ticks once

  const S = { drills: [], settings: null, classes: [], drill: 'algebra', playbook: 'all', mode: 'drive', seconds: 120, plays: 10, spp: 20, classId: '', focus: [] };
  // Math Facts: one-tap focus sets. Anything else is a tap on the numbers themselves.
  const FOCUS_PRESETS = [['All facts', []], ['Easy: 0 1 2 5 10', [0, 1, 2, 5, 10]], ['Tough: 6 7 8 9 12', [6, 7, 8, 9, 12]]];
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
    $('m-hill').setAttribute('aria-pressed', S.mode === 'hill');
    $('opt-drive').hidden = S.mode === 'huddle'; // Team Drive and the hill both run on one clock
    $('opt-huddle').hidden = S.mode !== 'huddle';
    // Each drill brings its own clocks (a fact takes seconds, an algebra play half a minute).
    const st = d.settings || S.settings;
    if (!st.drive.seconds.includes(S.seconds)) S.seconds = st.drive.defaultSeconds;
    if (!st.huddle.plays.includes(S.plays)) S.plays = st.huddle.defaultPlays;
    if (!st.huddle.secondsPerPlay.includes(S.spp)) S.spp = st.huddle.defaultSecondsPerPlay;
    renderFocus(d);
    segment($('o-seconds'), st.drive.seconds, S.seconds, (v) => mmss(v * 1000), (v) => { S.seconds = v; renderSetup(); });
    segment($('o-plays'), st.huddle.plays, S.plays, String, (v) => { S.plays = v; renderSetup(); });
    segment($('o-spp'), st.huddle.secondsPerPlay, S.spp, (v) => v + 's', (v) => { S.spp = v; renderSetup(); });
    $('cls').value = S.classId;
    $('cls-note').hidden = !S.classes.length;
    try { localStorage.setItem('mm-live-drill-setup', JSON.stringify({ drill: S.drill, playbook: S.playbook, mode: S.mode, seconds: S.seconds, plays: S.plays, spp: S.spp, classId: S.classId, focus: S.focus })); } catch { /* private mode */ }
  }
  /** Math Facts: which numbers every fact must include ("× 2s, 5s & 10s"). Empty = all of them. */
  function focusApplies(d) { return !!(d.focusable && d.focusable.books.includes(S.playbook)); }
  function renderFocus(d) {
    const on = focusApplies(d);
    $('opt-focus').hidden = !on;
    if (!on) return;
    if (!Array.isArray(S.focus)) S.focus = [];
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    $('o-focus-pre').innerHTML = FOCUS_PRESETS.map(([label, set], i) => `<button data-i="${i}" aria-pressed="${same(S.focus, set)}">${label}</button>`).join('');
    $('o-focus-pre').querySelectorAll('button').forEach((b) => { b.onclick = () => { S.focus = [...FOCUS_PRESETS[+b.dataset.i][1]]; renderSetup(); }; });
    const nums = Array.from({ length: d.focusable.max + 1 }, (_, n) => n);
    $('o-focus').innerHTML = nums.map((n) => `<button data-n="${n}" aria-pressed="${S.focus.includes(n)}">${n}</button>`).join('');
    $('o-focus').querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const n = +b.dataset.n;
        S.focus = S.focus.includes(n) ? S.focus.filter((x) => x !== n) : [...S.focus, n].sort((a, c) => a - c);
        renderSetup();
      };
    });
    const list = S.focus.map((n) => `${n}s`).join(', ');
    $('fx-note').innerHTML = S.focus.length
      ? `Every fact will have a <b>${list}</b> in it — the other number is anything.${S.focus.some((n) => n > 10) && S.playbook !== 'mul' && S.playbook !== 'div' ? ' (Addition and subtraction go to 10, so 11s and 12s only drill × and ÷.)' : ''}`
      : 'Every fact is fair game. Tap numbers to single some out — like 2, 5 and 10.';
  }
  function renderClasses() {
    $('cls').innerHTML = '<option value="">No class — students join with the code</option>'
      + S.classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${c.students})</option>`).join('');
    if (!S.classes.some((c) => c.id === S.classId)) S.classId = '';
  }
  $('cls').onchange = () => { S.classId = $('cls').value; renderSetup(); };
  $('m-drive').onclick = () => { S.mode = 'drive'; renderSetup(); };
  $('m-huddle').onclick = () => { S.mode = 'huddle'; renderSetup(); };
  $('m-hill').onclick = () => { S.mode = 'hill'; renderSetup(); };

  $('open').onclick = async () => {
    $('setup-err').textContent = '';
    $('open').disabled = true;
    try {
      const st = await api('/games', { method: 'POST', body: JSON.stringify({
        drill: S.drill, playbook: S.playbook, mode: S.mode, seconds: S.seconds, plays: S.plays, secondsPerPlay: S.spp,
        focus: S.focus && S.focus.length ? S.focus : undefined,
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
  function reset() { SND.setScene('setup'); if (es) es.close(); es = null; game = null; seenFeed.clear(); $('l-code').textContent = '------'; $('l-qr').hidden = true; }
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
    $('mus').setAttribute('aria-pressed', SND.musicOn);
    $('mus').textContent = `🎵 Music ${SND.musicOn ? 'on' : 'off'}`;
    $('crowd').setAttribute('aria-pressed', SND.crowdOn);
    $('crowd').textContent = `📣 Crowd ${SND.crowdOn ? 'on' : 'off'}`;
    $('sndbar').classList.toggle('muted', SND.muted);
  }
  $('snd').onclick = () => { SND.setMuted(!SND.muted); renderSound(); };
  $('mus').onclick = () => { SND.setMusic(!SND.musicOn); if (SND.musicOn && SND.muted) SND.setMuted(false); renderSound(); };
  $('crowd').onclick = () => { SND.setCrowd(!SND.crowdOn); if (SND.crowdOn && SND.muted) SND.setMuted(false); renderSound(); };
  renderSound();

  /** Which bed of sound the room is in: music and crowd levels follow it (sound.js mix()). */
  function sceneOf(st) {
    if (!st) return 'setup';
    if (st.phase === 'lobby') return 'lobby';
    if (st.phase === 'over') return 'final';
    return st.mode === 'huddle' && st.round && st.round.closed ? 'reveal' : 'live';
  }
  /** The stands lean in as either ball crosses midfield: 0 at the 50, 1 at the goal line. */
  const hypeOf = (st) => (st.hill
    ? Math.max(0, ...st.hill.climbers.map((c) => (c.h - 40) / 60)) // the hill: the crowd leans in near the top
    : Math.max(0, ...st.teams.map((t) => (t.pos - 50) / 50)));

  /** What the room should hear, from one state to the next. */
  function cue(prev, st) {
    if (!prev) return;
    if (st.mode === 'hill') {
      // what happened on the hill since the last state: boulders rumble, a new king gets the horn
      const since = Math.max(0, ...(prev.feed || []).map((f) => f.at));
      const fresh = (st.feed || []).filter((f) => f.at > since);
      // Rate-limited: a contested summit trades the crown every few seconds, and a horn each time is noise.
      const t = Date.now();
      if (fresh.some((f) => f.type === 'knock') && t - (cue.rumbleAt || 0) > 1500) { cue.rumbleAt = t; SND.rumble(); }
      if (fresh.some((f) => f.type === 'crown') && st.phase === 'live' && t - (cue.crownAt || 0) > 10000) { cue.crownAt = t; SND.horn(); SND.cheer(false); }
    }
    if (prev.phase === 'lobby' && st.phase !== 'lobby' && st.phase !== 'over') SND.whistle();
    if (st.teams.some((t, i) => prev.teams[i] && t.pts > prev.teams[i].pts)) SND.horn();
    const scored = st.teams.some((t, i) => prev.teams[i] && t.pts > prev.teams[i].pts);
    if (scored) SND.cheer(true);
    if (st.mode === 'huddle' && prev.round && st.round && prev.round.n === st.round.n && !prev.round.closed && st.round.closed) {
      SND.chime();
      // the class's verdict on the play — a touchdown already got its cheer
      const r = st.round;
      const total = Object.values(r.counts || {}).reduce((a, b) => a + b, 0);
      const pct = total ? (r.counts[r.answer] || 0) / total : 0;
      if (total && !scored) { if (pct >= 0.6) SND.cheer(false); else if (pct < 0.4) SND.groan(); }
    }
    if (prev.phase !== 'over' && st.phase === 'over') { SND.buzzer(); setTimeout(() => SND.cheer(true), 900); }
  }

  // ---------------- render ----------------
  function apply(st) {
    if (!st || (game && st.code === game.code && st.version < game.version)) return;
    syncClock(st);
    const prev = game && game.code === st.code ? game : null;
    cue(prev, st);
    SND.setScene(sceneOf(st));
    SND.setHype(st.phase === 'live' ? hypeOf(st) : 0);
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
    $('l-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${modeName(st)}`;
    const rules = rulesHTML(st);
    if ($('l-rules').dataset.html !== rules) { $('l-rules').innerHTML = rules; $('l-rules').dataset.html = rules; }
    $('l-count').textContent = `${st.players.length} player${st.players.length === 1 ? '' : 's'}${st.gameNumber > 1 ? ` · game ${st.gameNumber}` : ''}`;
    $('kick').disabled = st.players.length === 0;
    $('rosters').classList.toggle('solo', st.mode === 'hill');
    $('rosters').innerHTML = st.mode === 'hill' ? soloRoster(st) : st.teams.map((t, i) => {
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

  function modeName(st) {
    if (st.mode === 'hill') return `King of the Hill, ${mmss(st.seconds * 1000)}`;
    return st.mode === 'drive' ? `Team Drive, ${mmss(st.seconds * 1000)}` : `Huddle, ${st.totalPlays} plays`;
  }
  /** The hill has no teams: one list of climbers, each still tappable to remove. */
  function soloRoster(st) {
    return `<div class="roster"><h3>Climbers<span class="muted" style="font-size:1rem">${st.players.length}</span></h3><div class="chips">${
      st.players.map((p) => (openChip === p.id
        ? `<span class="chipmenu${p.away ? ' away' : ''}">${esc(p.name)}<button class="rm" data-act="kick" data-id="${p.id}">Remove</button><button data-act="close">✕</button></span>`
        : `<button class="chip${p.away ? ' away' : ''}" data-act="open" data-id="${p.id}" title="${p.linked ? 'Signed in' : 'Joined with the code'}${p.away ? ' · screen closed' : ''}">${esc(p.name)}${p.linked ? '<span class="acct" aria-label="signed in">✓</span>' : ''}</button>`)).join('')
    }</div></div>`;
  }

  function renderScoreboard(st) {
    st.teams.forEach((t, i) => { $('s-n' + i).textContent = `${t.name} · ${t.size}`; $('s-p' + i).textContent = t.pts; });
    setField($('field'), st.teams);
  }

  function renderClock() {
    if (!game || game.phase === 'lobby' || game.phase === 'over') return;
    const c = $('s-clock');
    if (game.mode !== 'huddle') {
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
    $('g-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${st.mode === 'drive' ? 'Team Drive' : st.mode === 'hill' ? 'King of the Hill' : 'Huddle'}`;
    $('g-code').textContent = st.code;
    renderScoreboard(st);
    const onHill = st.mode === 'hill';
    $('live-body').classList.toggle('mode-hill', onHill);
    $('hill-pane').hidden = !onHill;
    if (onHill) {
      $('live-body').classList.remove('mode-huddle');
      ['drive-pane', 'huddle-pane', 'h-next', 'h-keys'].forEach((id) => { $(id).hidden = true; });
      renderHill(st);
      return;
    }
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
    if (play.input) { $('h-choices').innerHTML = typedSplit(r, total); }
    else $('h-choices').innerHTML = play.choices.map((c, i) => {
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

  /**
   * A typed play has no choices: while it's open, say so; at the reveal, show the answer and the
   * wrong answers the class typed most — the misconception is in the specific wrong number.
   */
  function typedSplit(r, total) {
    if (!r.closed) return '<div class="typed-wait">Type the answer on your device</div>';
    const neg = (k) => esc(String(k).replace('-', '−'));
    const wrong = Object.entries(r.counts || {}).filter(([k]) => k !== r.answer).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const row = (k, n, cls, tag) => `<div class="ch${cls}"><span class="bar" style="width:${Math.round((100 * n) / total)}%"></span><span class="kbd">${tag}</span><span class="lab">${neg(k)}</span><span class="cnt">${n}</span></div>`;
    return row(r.answer, (r.counts && r.counts[r.answer]) || 0, ' right', '✓') + wrong.map(([k, n]) => row(k, n, ' fade', '✗')).join('');
  }

  // ---------------- the hill ----------------
  const SUMMIT_Y = 64; const BASE_Y = 410; const PLATEAU = 110;
  const yOf = (h, summit) => BASE_Y - (h / summit) * (BASE_Y - SUMMIT_Y);
  /** A climber's spot across the slope: fixed per student (a hash of their id), so nobody jumps sideways. */
  function xOf(c, h, summit) {
    let n = 0;
    for (const ch of c.id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    const half = 370 * (1 - h / summit) + PLATEAU; // the hill is a mesa: a crowd at the top spreads out
    return 500 + ((n % 1000) / 500 - 1) * half * 0.85;
  }
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  function renderHill(st) {
    const H = st.hill;
    const svg = $('hill-svg');
    if (!svg.dataset.drawn) {
      svg.innerHTML = `<defs><linearGradient id="hillg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c8a5a"/><stop offset="1" stop-color="#1f4a2c"/></linearGradient></defs>
        <polygon points="20,${BASE_Y} ${500 - PLATEAU - 20},${SUMMIT_Y} ${500 + PLATEAU + 20},${SUMMIT_Y} 980,${BASE_Y}" fill="url(#hillg)" stroke="#2c5f3a" stroke-width="3"/>
        <polygon points="${500 - PLATEAU - 20},${SUMMIT_Y} ${500 + PLATEAU + 20},${SUMMIT_Y} ${500 + PLATEAU + 46},${SUMMIT_Y + 22} ${500 + 40},${SUMMIT_Y + 14} 500,${SUMMIT_Y + 26} ${500 - 40},${SUMMIT_Y + 14} ${500 - PLATEAU - 46},${SUMMIT_Y + 22}" fill="#eef4ee" opacity=".85"/>
        <line x1="500" y1="${SUMMIT_Y - 8}" x2="500" y2="${SUMMIT_Y - 44}" stroke="#ddd" stroke-width="3"/><polygon points="500,${SUMMIT_Y - 44} 532,${SUMMIT_Y - 36} 500,${SUMMIT_Y - 28}" style="fill:var(--led)"/>
        <g id="hill-climbers"></g>`;
      svg.dataset.drawn = '1';
    }
    const layer = $('hill-climbers');
    const keep = new Set();
    H.climbers.forEach((c) => {
      keep.add(c.id);
      let g = layer.querySelector(`[data-id="${c.id}"]`);
      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('data-id', c.id);
        g.setAttribute('class', 'climber');
        layer.appendChild(g);
      }
      const label = c.king; // the king's name on the hill; the board beside it names everyone
      g.innerHTML = `${c.king ? '<text class="crown" y="-22" text-anchor="middle">👑</text>' : ''}${c.shield ? '<circle class="shield" r="20"/>' : ''}
        <circle class="dot" r="14"/><text class="ini" y="5" text-anchor="middle">${esc(initials(c.name))}</text>
        ${label ? `<text class="nm" x="20" y="5">${esc(c.name)}</text>` : ''}`;
      g.classList.toggle('king', c.king);
      g.classList.toggle('hit', c.hit);
      g.classList.toggle('steady', c.steady);
      g.style.transform = `translate(${xOf(c, c.h, H.summit).toFixed(1)}px, ${yOf(c.h, H.summit).toFixed(1)}px)`;
    });
    layer.querySelectorAll('.climber').forEach((g) => { if (!keep.has(g.dataset.id)) g.remove(); });
    // the leaders on top of the stack, so a crowd at the summit never hides the king
    H.climbers.slice().reverse().forEach((c) => { const g = layer.querySelector(`[data-id="${c.id}"]`); if (g) layer.appendChild(g); });

    $('hill-board').innerHTML = H.climbers.slice(0, 10).map((c, i) => `<li class="${c.king ? 'king' : ''}${c.hit ? ' hit' : ''}">
      <span class="rk">${i + 1}</span><span class="nm">${esc(c.name)}${c.king ? ' 👑' : ''}${c.shield ? ' 🛡' : ''}</span>
      <span class="ht"><span style="width:${Math.round((100 * c.h) / H.summit)}%"></span></span><span class="hv">${Math.round(c.h)}</span></li>`).join('')
      + (H.climbers.length > 10 ? `<li class="more muted">+ ${H.climbers.length - 10} more climbing</li>` : '');
    $('hill-feed').innerHTML = st.feed.slice(0, 5).map((f) => {
      const id = `${f.at}|${f.type}|${f.who || ''}`;
      const fresh = seenFeed.has(id) ? '' : ' new';
      seenFeed.add(id);
      if (f.type === 'knock') return `<span class="it ev${fresh}">🪨 ${esc(f.who)} knocked ${esc(f.target)} down</span>`;
      if (f.type === 'blocked') return `<span class="it${fresh}">🛡 ${esc(f.target)} blocked ${esc(f.who)}'s boulder</span>`;
      if (f.type === 'shield') return `<span class="it${fresh}">🛡 ${esc(f.who)} raised a shield</span>`;
      if (f.type === 'crown') return `<span class="it ev${fresh}">👑 ${esc(f.who)} takes the crown</span>`;
      if (f.type === 'climb') return `<span class="it ev${fresh}">CLIMB!</span>`;
      return '';
    }).join('') || '<span class="muted">Boulders and crowns show up here.</span>';
  }

  /** The hill's final: the standings and the awards, in place of the team result. */
  function renderHillFinal(st, f) {
    const hl = f.hill;
    const top = hl.standings[0];
    $('f-acc').textContent = f.att ? f.pct + '%' : '–';
    $('f-result').className = 'king';
    $('f-result').textContent = top && top.h > 0 ? `👑 ${top.name} is King of the Hill` : 'Nobody left the base camp';
    const awards = [
      hl.longestReign && `<div class="award"><span class="k">Longest reign</span><b>${esc(hl.longestReign.name)}</b> ${hl.longestReign.sec}s</div>`,
      hl.mostBoulders && `<div class="award"><span class="k">Most boulders</span><b>${esc(hl.mostBoulders.name)}</b> ${hl.mostBoulders.count}</div>`,
    ].filter(Boolean).join('');
    $('f-mvps').innerHTML = `<div class="panel standings"><h3>Final standings</h3>${awards ? `<div class="awards">${awards}</div>` : ''}<ol>${
      hl.standings.map((s) => `<li${s.place === 1 ? ' class="king"' : ''}><span class="nm">${esc(s.name)}</span><span>${Math.round(s.h)} high · ${s.comp}/${s.att} right${s.thrown ? ` · 🪨 ${s.thrown}` : ''}</span></li>`).join('')
    }</ol></div>`;
  }

  function renderFinal(st) {
    st.teams.forEach((t, i) => { $('f-n' + i).textContent = t.name; $('f-p' + i).textContent = t.pts; });
    const f = st.final || { mvps: [[], []], film: [], pct: 0, att: 0 };
    $('final').classList.toggle('mode-hill', st.mode === 'hill');
    $('f-acc').textContent = f.att ? f.pct + '%' : '–';
    const [a, b] = st.teams;
    const win = a.pts !== b.pts ? (a.pts > b.pts ? 0 : 1) : (a.pos !== b.pos ? (a.pos > b.pos ? 0 : 1) : -1);
    const h = $('f-result');
    h.className = win >= 0 ? `t${win}` : '';
    h.textContent = win < 0 ? 'Tie game' : `${st.teams[win].name} wins${a.pts === b.pts ? ' on field position' : ''}`;
    if (f.hill) renderHillFinal(st, f);
    else $('f-mvps').innerHTML = st.teams.map((t, i) => `<div class="panel t${i}"><h3>${esc(t.name)} · top players</h3>${
      f.mvps[i].length ? `<ol>${f.mvps[i].map((p) => `<li>${esc(p.name)} <span>${p.yards} yds · ${p.comp}/${p.att}</span></li>`).join('')}</ol>` : '<p class="muted">No plays run.</p>'
    }</div>`).join('');
    $('f-film').innerHTML = '<h3>Film room</h3>' + (f.film.length
      ? `<p>The plays the class missed most. This is the reteach.</p><ol>${f.film.map((m) => `<li>
          <div class="note"><span class="count">${m.count} missed</span>${m.commonPick ? `<span><span class="tag">Most common wrong ${m.typed ? 'answer' : 'pick'}</span><span class="yr">${m.commonPick.html}</span> (${m.commonPick.count})</span>` : ''}<span><span class="tag">Answer</span><span class="cr">${m.answerHtml}</span></span></div>
          ${cardHTML({ card: m.card, playbookName: m.playbookName }, m.card, '')}
          <div class="tellbox">${m.tell}</div></li>`).join('')}</ol>`
      : '<p>Nobody missed a play. Clean game.</p>');
    renderFinalPlayers(st, f.players || []);
    renderPlayByPlay(st, f.plays || []);
    renderFacts(st, f.facts);
  }

  /** Every player's line — the scoreboard a teacher reads names off, and a CSV of it. */
  let lastScores = null;
  function renderFinalPlayers(st, players) {
    const el = $('f-players');
    if (!el) return;
    // King of the Hill already lists everyone in its standings.
    if (st.mode === 'hill' || !players.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    lastScores = { code: st.code, game: st.gameNumber, players, teams: st.teams };
    const unit = st.mode === 'drive' ? 'yds' : 'pts';
    const rows = players.map((p, i) => `<tr><td class="num">${i + 1}</td><td class="nm t${p.team}">${esc(p.name)}${p.saved ? ' <span class="acct" title="Signed in">✓</span>' : ''}</td>` +
      `<td>${esc(teamName(st, p.team))}</td><td class="num"><b>${p.yards}</b> ${unit}</td><td class="num">${p.comp}/${p.att}</td>` +
      `<td class="num">${p.pct == null ? '–' : p.pct + '%'}</td><td class="num">${p.best}</td><td class="num">${p.avgSec == null ? '–' : p.avgSec + ' s'}</td></tr>`).join('');
    el.innerHTML = `<h3>Every player</h3>
      <div class="tablewrap"><table class="ftab stab"><thead><tr><th>#</th><th>Student</th><th>Team</th><th>Score</th><th>Right</th><th>Accuracy</th><th>Best streak</th><th>Avg time</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row"><button class="ghost" id="f-scores-csv">Download scores (CSV)</button><span class="muted">One line per student. ✓ = signed in with their account.</span></div>`;
    $('f-scores-csv').onclick = downloadScoresCsv;
  }
  function teamName(st, i) { return (st.teams && st.teams[i] && st.teams[i].name) || ''; }
  function downloadScoresCsv() {
    if (!lastScores) return;
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const safe = (v) => (/^[=+\-@]/.test(String(v)) ? `'${v}` : v); // never a formula in a spreadsheet
    const lines = [['Rank', 'Student', 'Team', 'Score', 'Right', 'Attempted', 'Accuracy %', 'Best streak', 'Avg seconds', 'Signed in'].map(q).join(',')]
      .concat(lastScores.players.map((p, i) => [i + 1, safe(p.name), teamName(lastScores, p.team), p.yards, p.comp, p.att, p.pct == null ? '' : p.pct, p.best, p.avgSec == null ? '' : p.avgSec, p.saved ? 'yes' : 'no'].map(q).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `live-drill-scores-${lastScores.code}-game${lastScores.game}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** Math Facts: the fluency tracker — each student, the class grid, and a CSV of every answer. */
  function renderFacts(st, fx) {
    const el = $('f-facts');
    el.hidden = !fx;
    if (!fx) return;
    lastFacts = { fx, code: st.code, game: st.gameNumber, title: st.playbookName };
    const chips = (xs, cls) => xs.map((x) => `<span class="fchip ${cls}">${typeof x === 'string' ? x : `${x.label} <i>${x.sec}s</i>`}</span>`).join('');
    const rows = fx.students.map((s) => `<tr><td class="nm t${s.team}">${esc(s.name)}${s.saved ? ' <span class="acct" title="Signed in: saved to their account">✓</span>' : ''}</td>
      <td class="num">${s.right}/${s.att}</td><td class="num">${s.fluent}/${s.tried}</td><td class="num">${s.medianSec == null ? '–' : s.medianSec + 's'}</td>
      <td>${s.missed.length || s.slow.length ? chips(s.missed.slice(0, 8), 'miss') + chips(s.slow.slice(0, Math.max(0, 8 - s.missed.length)), 'slow') : '<span class="muted">All fluent</span>'}</td></tr>`).join('');
    el.innerHTML = `<h3>Fact tracker</h3>
      <p>Fluent = right every time, in ${fx.fluentSec} s or less. <span class="fchip miss">missed</span> <span class="fchip slow">right but slow</span> — those are each student's facts to practice.</p>
      <div class="tablewrap"><table class="ftab"><thead><tr><th>Student</th><th>Right</th><th>Fluent facts</th><th>Typical time</th><th>To practice</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${fx.unanswered.length ? `<p class="muted">No answers from: ${fx.unanswered.map(esc).join(', ')}.</p>` : ''}
      ${fx.grids.map(gridHTML).join('')}
      <div class="row"><button class="ghost" id="f-csv">Download answers (CSV)</button><span class="muted">Every answer: student, fact, what they typed, right or wrong, seconds.</span></div>
      <p class="muted" style="margin-top:8px">${fx.students.some((s) => s.saved) ? `Students with a ✓ joined signed in, so this game is saved to their account — see <a href="/fact-fluency" target="_blank" rel="noopener">Fact Fluency</a> for every game so far. ` : ''}${fx.students.some((s) => !s.saved) ? 'Students who joined with just the code and a name aren\'t saved anywhere — download the CSV to keep their results.' : ''}</p>`;
    $('f-csv').onclick = downloadCsv;
  }
  let lastFacts = null;

  /** The class grid for one fact family: green fluent, amber right-but-slow, red missed. */
  function gridHTML(g) {
    const sym = g.fam === 'mul' ? '×' : '+';
    const n = Array.from({ length: g.max + 1 }, (_, i) => i);
    const cell = (a, b) => {
      const c = g.cells[`${a},${b}`];
      if (!c) return '<td></td>';
      const cls = c.right < c.att ? 'miss' : c.sec > (lastFacts ? lastFacts.fx.fluentSec : 3) ? 'slow' : 'ok';
      return `<td class="${cls}" title="${a} ${sym} ${b}: ${c.right}/${c.att} right${c.sec != null ? `, ${c.sec}s` : ''}">${c.right}/${c.att}</td>`;
    };
    return `<div class="fgrid"><h4>${g.fam === 'mul' ? '× and ÷' : '+ and −'} facts · the class</h4><div class="tablewrap"><table><thead><tr><th>${sym}</th>${n.map((b) => `<th>${b}</th>`).join('')}</tr></thead><tbody>${
      n.map((a) => `<tr><th>${a}</th>${n.map((b) => cell(a, b)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  function downloadCsv() {
    if (!lastFacts) return;
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    // A name that starts with = + - @ would run as a formula in a spreadsheet: lead it with a quote.
    const safe = (v) => (/^[=+\-@]/.test(String(v)) ? `'${v}` : v);
    const lines = [['Student', 'Fact', 'Answer', 'Typed', 'Correct', 'Seconds'].map(q).join(',')]
      .concat(lastFacts.fx.log.map((e) => [safe(e.name), e.fact, e.answer, safe(e.typed), e.ok ? 'yes' : 'no', e.sec].map(q).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `math-facts-${lastFacts.code}-game${lastFacts.game}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
          <div class="note"><span><span class="tag">Right</span>${p.right} of ${p.att}</span>${p.commonWrong ? `<span><span class="tag">Most common wrong ${p.typed ? 'answer' : 'pick'}</span><span class="yr">${p.commonWrong.html}</span> (${p.commonWrong.count})</span>` : ''}<span><span class="tag">Answer</span><span class="cr">${p.answerHtml}</span></span></div>
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
      if (!['drive', 'huddle', 'hill'].includes(S.mode)) S.mode = 'drive';
      renderSetup();
      show('setup');
    } catch (e) { $('setup-err').textContent = e.message; }
  })();
})();
