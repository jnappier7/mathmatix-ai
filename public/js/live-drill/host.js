/* global csrfFetch */
// Sound: public/js/live-drill/sound.js (window.LiveDrillSound) — projector only.
// Live Two-Minute Drill — the projector. Setup → lobby → live → final, all driven by the
// game state the server pushes over SSE (routes/liveDrill.js /host/games/:code/stream).
(function () {
  const { $, esc, setField, fieldBolt, calm, cardHTML, syncClock, serverNow, mmss, watchTouchdowns, rulesHTML } = window.LiveDrill;
  const API = '/api/live-drill/host';
  const noop = () => {};
  const SND = window.LiveDrillSound || { unlock: noop, whistle: noop, horn: noop, tick: noop, chime: noop, buzzer: noop, cheer: noop, groan: noop, rumble: noop, blitz: noop, safe: noop, smoke: noop,
    setScene: noop, setHype: noop, setMuted: noop, setMusic: noop, setCrowd: noop, muted: true, musicOn: false, crowdOn: false };
  let lastTick = null; // the clock second last ticked, so each of the final five ticks once

  // `playbook` is what the server deals from: a book of the bank, or a numbered section ("5.2",
  // every book that covers it). `section` is the UI's pick on the Section row ('' = whole module).
  const S = { drills: [], settings: null, classes: [], drill: 'algebra', playbook: 'all', section: '', mode: 'drive', seconds: 120, plays: 10, spp: 20, classId: '', focus: [] };
  // Math Facts: one-tap focus sets. Anything else is a tap on the numbers themselves.
  const FOCUS_PRESETS = [['All facts', []], ['Easy: 0 1 2 5 10', [0, 1, 2, 5, 10]], ['Tough: 6 7 8 9 12', [6, 7, 8, 9, 12]]];
  let game = null; // latest host state
  let es = null;
  let tick = null;
  let openChip = null;
  const seenFeed = new Set(); // feed items already animated in

  // A deploy moves the game to a new server: for a few seconds the old one answers 503 "moving"
  // (or nothing at all). Retry quietly for that long; the board must not say the game ended.
  const MOVE_RETRIES = 8;
  const MOVE_WAIT_MS = 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(path, opts) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await csrfFetch(API + path, {
          ...opts,
          headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) },
          credentials: 'same-origin',
        });
      } catch (netErr) {
        if (attempt < MOVE_RETRIES) { await sleep(MOVE_WAIT_MS); continue; }
        throw netErr;
      }
      let body = null;
      try { body = await res.json(); } catch { /* empty */ }
      if (res.status === 503 && body && body.retry && attempt < MOVE_RETRIES) { await sleep(MOVE_WAIT_MS); continue; }
      if (!res.ok) throw new Error((body && body.message) || `Request failed (${res.status})`);
      return body;
    }
  }

  function show(id) { ['setup', 'lobby', 'live', 'final'].forEach((s) => { $(s).hidden = s !== id; }); }

  // ---------------- search ----------------
  // Find a drill and playbook by topic. Same public index the solo page uses
  // (/api/live-drill/solo/search), so a teacher and a student get the same answer.
  let qSeq = 0;
  function wireSearch() {
    const q = $('q');
    const res = $('q-res');
    if (!q || !res) return;
    let t = null;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => runSearch(q.value), 160); };
    q.onkeydown = (e) => {
      if (e.key === 'Escape') { q.value = ''; runSearch(''); }
      if (e.key === 'ArrowDown') { const b = res.querySelector('button'); if (b) { e.preventDefault(); b.focus(); } }
    };
    res.onkeydown = (e) => {
      const items = [...res.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && items[i + 1]) { e.preventDefault(); items[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || q).focus(); }
      if (e.key === 'Escape') { q.focus(); q.value = ''; runSearch(''); }
    };
    $('dsearch').onsubmit = (e) => { e.preventDefault(); const b = res.querySelector('button'); if (b) b.click(); };
  }
  async function runSearch(text) {
    const res = $('q-res');
    const seq = ++qSeq;
    const words = String(text || '').trim();
    if (!words) { res.hidden = true; res.innerHTML = ''; return; }
    let results;
    try {
      const r = await fetch(`/api/live-drill/solo/search?q=${encodeURIComponent(words)}`, { credentials: 'same-origin' });
      ({ results } = await r.json());
    } catch { return; }
    if (seq !== qSeq) return; // a newer keystroke answered already
    results = results.filter((x) => S.drills.some((d) => d.id === x.drill && !d.unavailable));
    res.hidden = false;
    if (!results.length) { res.innerHTML = `<p class="muted none">Nothing for “${esc(words)}”. Try the module or chapter number, or a word from the lesson.</p>`; return; }
    res.innerHTML = results.map((x, i) => `<button type="button" role="option" data-i="${i}">`
      + `<span class="bk-ch">${esc(x.title)}${x.ch ? ` · ${esc(x.ch)}` : ''}</span>`
      + `<span class="nm">${esc(x.name)}</span><span class="bl">${esc(x.blurb || '')}</span></button>`).join('');
    res.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const x = results[Number(b.dataset.i)];
        S.drill = x.drill; S.playbook = x.key; S.focus = []; S.course = tabOf(x.drill) || S.course;
        S.section = sectionOf(x.drill, x.key); // a book's own section lights up on the row
        res.hidden = true; $('q').value = ''; $('dsearch').hidden = true; $('q-toggle').setAttribute('aria-expanded', 'false');
        renderSetup();
        $('books-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    });
  }

  // ---------------- setup ----------------
  function segment(el, values, current, fmt, onPick) {
    el.innerHTML = values.map((v) => `<button data-v="${v}" aria-pressed="${v === current}">${fmt(v)}</button>`).join('');
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => onPick(Number(b.dataset.v)); });
  }
  // ---- the three picks: who, what, how. One source of names: the hubs' own game names (via
  // /drills `name`) and the Arcade catalogue's game-type names and taglines (/solo/arcade). ----
  const isAnyTab = (id) => String(id || '').startsWith('drill:');
  const courseTabs = () => [
    ...(S.courses || []).filter((c) => c.id !== 'any').map((c) => ({ id: c.id, title: c.title })),
    // a game on every course (Math Facts) is its own tab, named for the game
    ...S.drills.filter((d) => (d.course || {}).id === 'any' && !d.unavailable).map((d) => ({ id: `drill:${d.id}`, title: d.name || d.title })),
  ];
  const drillsIn = (tab) => (isAnyTab(tab) ? S.drills.filter((d) => d.id === tab.slice(6)) : S.drills.filter((d) => (d.course || {}).id === tab && !d.unavailable));
  const tabOf = (drillId) => { const d = S.drills.find((x) => x.id === drillId); if (!d) return null; return (d.course || {}).id === 'any' ? `drill:${d.id}` : (d.course || {}).id; };
  /** The numbered section a playbook key is, or the first one its book covers ('' if none). */
  function sectionOf(drillId, key) {
    const d = S.drills.find((x) => x.id === drillId);
    const secs = (d && d.sections) || [];
    const s = secs.find((x) => x.key === key) || secs.find((x) => x.books.includes(key));
    return s ? s.key : '';
  }
  /** Keep the course tab and the unit consistent: the unit must be on the tab. */
  function settle() {
    const tabs = courseTabs();
    if (!tabs.some((t) => t.id === S.course)) S.course = tabOf(S.drill) || (tabs[0] && tabs[0].id);
    const units = drillsIn(S.course);
    if (!units.some((d) => d.id === S.drill)) {
      S.lastUnit = S.lastUnit || {};
      const remembered = S.lastUnit[S.course];
      S.drill = (units.find((d) => d.id === remembered) || units[0] || { id: S.drill }).id;
      S.playbook = 'all'; S.section = '';
    }
    S.lastUnit = { ...(S.lastUnit || {}), [S.course]: S.drill };
  }
  function renderSetup() {
    settle();
    const tabs = courseTabs();
    $('courses').innerHTML = tabs.map((t) => `<button type="button" data-id="${esc(t.id)}" aria-pressed="${t.id === S.course}">${esc(t.title)}</button>`).join('');
    $('courses').querySelectorAll('button').forEach((b) => { b.onclick = () => { S.course = b.dataset.id; S.drill = ''; renderSetup(); }; });
    const units = drillsIn(S.course);
    const d = S.drills.find((x) => x.id === S.drill) || { playbooks: [] };
    // the unit: a dropdown in teaching order (a tab with one game needs no dropdown)
    $('unit-row').hidden = units.length < 2;
    $('unit').innerHTML = units.map((u) => `<option value="${esc(u.id)}"${u.id === S.drill ? ' selected' : ''}>${esc(u.name || u.title)}</option>`).join('');
    $('unit').onchange = () => { S.drill = $('unit').value; S.playbook = 'all'; S.section = ''; renderSetup(); };
    $('unit-bl').textContent = d.blurb || '';
    // the numbered section within the unit (5.1, 5.2, …): the pick a teacher makes mid-module.
    // Whole module · 5.1 · 5.2 …; a number no bank covers yet is shown, greyed, not skipped.
    const secs = d.sections || [];
    if (S.section && !secs.some((x) => x.key === S.section && x.books.length)) { S.section = ''; if (!(d.playbooks || []).some((b) => b.key === S.playbook)) S.playbook = 'all'; }
    const sec = secs.find((x) => x.key === S.section);
    const whole = ((d.playbooks || [])[0] || {}).name || 'Whole module';
    $('sec-row').hidden = !secs.length;
    $('secs').innerHTML = [`<button type="button" data-k="" aria-pressed="${!S.section}">${esc(whole)}</button>`]
      .concat(secs.map((x) => `<button type="button" data-k="${esc(x.key)}" aria-pressed="${x.key === S.section}"${x.books.length ? ` title="${esc(x.topics.join(' · '))}"` : ' disabled title="Not in this drill yet"'}>${esc(x.key)}</button>`)).join('');
    $('secs').querySelectorAll('button').forEach((b) => { b.onclick = () => { S.section = b.dataset.k; S.playbook = S.section || 'all'; renderSetup(); }; });
    // the topic: compact chips, the blurb of the chosen one beneath. Inside a section, only the
    // topics that section covers (one topic = the section itself, no chips); otherwise every book.
    const all = d.playbooks || [];
    const inSec = sec ? all.filter((b) => sec.books.includes(b.key)) : all;
    const books = sec && inSec.length > 1 ? [{ key: sec.key, name: `All of ${sec.key}`, blurb: sec.topics.join(' · ') }, ...inSec] : inSec;
    $('bk-l').textContent = secs.length ? 'Topic' : 'Section';
    $('books-wrap').hidden = books.length < 2;
    $('books').innerHTML = books.map((b) => `<button type="button" class="chip" data-k="${esc(b.key)}" aria-pressed="${b.key === S.playbook}" title="${esc(b.blurb || '')}">${b.ch && !sec ? `<span class="ch">${esc(b.ch)}</span>` : ''}${esc(b.name)}</button>`).join('');
    $('books').querySelectorAll('.chip').forEach((b) => { b.onclick = () => { S.playbook = b.dataset.k; renderSetup(); }; });
    const book = books.find((b) => b.key === S.playbook) || (sec && inSec.length === 1 ? inSec[0] : null);
    $('book-bl').textContent = book && book.blurb ? book.blurb : '';
    // the game type, from the Arcade's catalogue (names and taglines are the same there and here)
    const games = S.games && S.games.length ? S.games : Object.entries(MODE_LABEL).map(([id, name]) => ({ id, name, tagline: '' }));
    $('modes').innerHTML = games.map((g) => `<button type="button" class="mode" id="m-${esc(g.id)}" data-id="${esc(g.id)}" aria-pressed="${g.id === S.mode}"><b>${esc(g.name)}</b>${g.tagline ? `<span>${esc(g.tagline)}</span>` : ''}</button>`).join('');
    $('modes').querySelectorAll('.mode').forEach((b) => { b.onclick = () => { S.mode = b.dataset.id; renderSetup(); }; });
    $('opt-drive').hidden = S.mode === 'huddle'; // Team Drive, the hill and the heist all run on one clock
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
    // what the lobby will say, in one line
    const cls = S.classes.find((c) => c.id === S.classId);
    const game = games.find((g) => g.id === S.mode) || { name: MODE_LABEL[S.mode] || S.mode };
    const when = S.mode === 'huddle' ? `${S.plays} plays · ${S.spp}s each` : mmss(S.seconds * 1000);
    const what = sec ? `Section ${sec.key}${book && book.key !== sec.key ? ` · ${book.name}` : ''}` : book && books.length > 1 ? book.name : '';
    $('summary').innerHTML = [cls ? esc(cls.name) : 'Join by code', esc(d.name || d.title || ''), esc(what), esc(game.name), when]
      .filter(Boolean).map((x) => `<span>${x}</span>`).join('<i>·</i>');
    try { localStorage.setItem('mm-live-drill-setup', JSON.stringify({ drill: S.drill, playbook: S.playbook, section: S.section, mode: S.mode, seconds: S.seconds, plays: S.plays, spp: S.spp, classId: S.classId, focus: S.focus, course: S.course, lastUnit: S.lastUnit })); } catch { /* private mode */ }
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
    // Opened from a class card on the dashboard (/live-drill?class=…): start with that class.
    const want = new URLSearchParams(location.search).get('class');
    if (want && !S.urlClassApplied && S.classes.some((c) => c.id === want)) { S.classId = want; S.urlClassApplied = true; pickCourseForClass(); }
    if (!S.classes.some((c) => c.id === S.classId)) S.classId = '';
  }
  /** A class on a known course page ("Honors Geom · 4") picks that course; the unit is remembered per course. */
  function pickCourseForClass() {
    const c = S.classes.find((x) => x.id === S.classId);
    if (c && c.hub && courseTabs().some((t) => t.id === c.hub)) { S.course = c.hub; S.drill = ''; }
  }
  $('cls').onchange = () => { S.classId = $('cls').value; pickCourseForClass(); renderSetup(); };
  $('q-toggle').onclick = () => {
    const open = $('dsearch').hidden;
    $('dsearch').hidden = !open;
    $('q-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('q').focus(); else { $('q').value = ''; runSearch(''); }
  };

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
    : st.heist
      ? Math.max(0, 1 - (st.endsAt - serverNow()) / 45000) // the heist: the room tightens over the last 45 s
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
    if (st.mode === 'heist') {
      const since = Math.max(0, ...(prev.feed || []).map((f) => f.at));
      const fresh = (st.feed || []).filter((f) => f.at > since);
      const t = Date.now();
      if (fresh.some((f) => f.type === 'jackpot')) { SND.safe(); SND.cheer(false); }
      else if (fresh.some((f) => f.type === 'safe' || f.type === 'crack') && t - (cue.safeAt || 0) > 900) { cue.safeAt = t; SND.safe(); }
      if (fresh.some((f) => f.type === 'grab' || f.type === 'switch') && t - (cue.grabAt || 0) > 1200) { cue.grabAt = t; SND.blitz(); }
      if (fresh.some((f) => f.type === 'gadget')) SND.smoke();
    }
    if (st.mode === 'drive') {
      // a blitz landed since the last state — one whoosh, rate-limited (a big class blitzes often)
      const since = Math.max(0, ...(prev.feed || []).map((f) => f.at));
      const t = Date.now();
      if ((st.feed || []).some((f) => f.at > since && f.type === 'blitz') && t - (cue.blitzAt || 0) > 1200) { cue.blitzAt = t; SND.blitz(); }
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
    const solo = st.mode === 'hill' || st.mode === 'heist';
    $('rosters').classList.toggle('solo', solo);
    $('rosters').innerHTML = solo ? soloRoster(st) : st.teams.map((t, i) => {
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
    if (st.mode === 'heist') return `Heist, ${mmss(st.seconds * 1000)}`;
    return st.mode === 'drive' ? `Team Drive, ${mmss(st.seconds * 1000)}` : `Huddle, ${st.totalPlays} plays`;
  }
  const MODE_LABEL = { drive: 'Team Drive', huddle: 'Huddle', hill: 'King of the Hill', heist: 'Heist' };
  /** The hill and the heist have no teams: one list of players, each still tappable to remove. */
  function soloRoster(st) {
    return `<div class="roster"><h3>${st.mode === 'heist' ? 'Crew' : 'Climbers'}<span class="muted" style="font-size:1rem">${st.players.length}</span></h3><div class="chips">${
      st.players.map((p) => (openChip === p.id
        ? `<span class="chipmenu${p.away ? ' away' : ''}">${esc(p.name)}<button class="rm" data-act="kick" data-id="${p.id}">Remove</button><button data-act="close">✕</button></span>`
        : `<button class="chip${p.away ? ' away' : ''}" data-act="open" data-id="${p.id}" title="${p.linked ? 'Signed in' : 'Joined with the code'}${p.away ? ' · screen closed' : ''}">${esc(p.name)}${p.linked ? '<span class="acct" aria-label="signed in">✓</span>' : ''}</button>`)).join('')
    }</div></div>`;
  }

  function renderScoreboard(st) {
    st.teams.forEach((t, i) => {
      $('s-n' + i).textContent = `${t.name} · ${t.size}`;
      const v = $('s-p' + i);
      const was = v.textContent;
      v.textContent = t.pts;
      // the number on the board lands with a thump when it goes up
      if (was !== '' && Number(was) < t.pts) { v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump'); }
    });
    setField($('field'), st.teams, { pickSix: st.round && st.round.closed ? st.round.pickSix : null });
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
    $('g-what').textContent = `${st.drillTitle} · ${st.playbookName} · ${MODE_LABEL[st.mode] || 'Huddle'}`;
    $('g-code').textContent = st.code;
    renderScoreboard(st);
    const onHill = st.mode === 'hill';
    const onHeist = st.mode === 'heist';
    $('live-body').classList.toggle('mode-hill', onHill);
    $('live-body').classList.toggle('mode-heist', onHeist);
    $('hill-pane').hidden = !onHill;
    $('heist-pane').hidden = !onHeist;
    if (onHill || onHeist) {
      $('live-body').classList.remove('mode-huddle');
      ['drive-pane', 'huddle-pane', 'h-next', 'h-keys'].forEach((id) => { $(id).hidden = true; });
      if (onHill) renderHill(st); else renderHeist(st);
      return;
    }
    const drive = st.mode === 'drive';
    $('live-body').classList.toggle('mode-huddle', !drive);
    $('drive-pane').hidden = !drive;
    $('huddle-pane').hidden = drive;
    $('h-next').hidden = drive;
    $('h-keys').hidden = drive;
    if (drive) {
      // a blitz that just landed: the bolt hits the other team's ball (before the feed marks it seen)
      st.feed.forEach((f) => { if (f.type === 'blitz' && !seenFeed.has(`${f.at}|${f.type}|${f.who || ''}`)) fieldBolt($('field'), f.victim); });
      $('feed').innerHTML = st.feed.map((f) => {
        const id = `${f.at}|${f.type}|${f.who || ''}`;
        const team = (f.team != null ? ` t${f.team}` : '') + (seenFeed.has(id) ? '' : ' new');
        seenFeed.add(id);
        if (f.type === 'td') return `<span class="it ev${team.includes('new') ? ' new' : ''}">${esc(f.text)}${f.who ? ` · ${esc(f.who)}` : ''}</span>`;
        if (f.type === 'big') return `<span class="it${team}">${esc(f.who)} +${f.gain}</span>`;
        if (f.type === 'sack') return `<span class="it${team}">${esc(f.who)} sacked</span>`;
        if (f.type === 'blitz') return `<span class="it ev blitz${team.includes('new') ? ' new' : ''}">⚡ BLITZ · ${esc(f.who)} · ${esc(teamName(st, f.victim))} −${f.yards}</span>`;
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
      const picks = r.pickSix || [];
      const silent = r.noAnswer || [];
      const pen = st.rules && st.rules.noAnswer;
      $('h-split').innerHTML = st.teams.map((t, i) => `<span class="t${i}">${esc(t.name)}: ${r.rightByTeam[i]}/${t.size} right${picks[i] ? ' · 🏈 PICK SIX' : ''}${silent[i] ? ` · ${silent[i]} no answer${pen ? ` (−${pen} each)` : ''}` : ''}</span>`).join('')
        + (r.changed ? `<span class="muted">${r.changed} changed ${r.changed === 1 ? 'an' : 'their'} answer</span>` : '');
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
  // The scene is one SVG (viewBox 1000×430): sky, haze ridges for depth, the mountain with a snow
  // cap, a switchback trail, contour lines at 25/50/75, pines and rocks on the lower slope — drawn
  // once — and a dynamic layer on top: climbers as little figures in their own colour with a name
  // badge, the king crowned and glowing, a shield bubble, a boulder that ROLLS from the thrower to
  // the climber it hits (with a dust burst), a tumble on the one knocked down, and a sparkle when
  // the crown changes hands. Height is the geometry's only input: y is linear in h, x is a hash of
  // the student's id spread across the slope's width at that height, so nobody drifts sideways.
  const SUMMIT_Y = 64; const BASE_Y = 410; const PLATEAU = 110;
  const yOf = (h, summit) => BASE_Y - (h / summit) * (BASE_Y - SUMMIT_Y);
  const idHash = (id) => { let n = 0; for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return n; };
  /** A climber's spot across the slope: fixed per student (a hash of their id), so nobody jumps sideways. */
  function xOf(c, h, summit) {
    const half = 370 * (1 - h / summit) + PLATEAU; // the hill is a mesa: a crowd at the top spreads out
    return 500 + ((idHash(c.id) % 1000) / 500 - 1) * half * 0.85;
  }
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  // twelve jackets a class can tell apart on a green hill, picked by the same hash
  const JACKETS = ['#ff6a5c', '#4cb3ff', '#ffb547', '#b388ff', '#3ccf7e', '#ff8fd0', '#ffd166', '#7ee8fa', '#f5a623', '#c3f73a', '#ff9b73', '#9bd5ff'];
  const jacketOf = (id) => JACKETS[idHash(id) % JACKETS.length];
  /** The half-width of the slope at height h (the mountain's outline). */
  const halfAt = (h, summit) => 370 * (1 - h / summit) + PLATEAU + 20;

  function hillScene(summit) {
    const L = (h) => 500 - halfAt(h, summit); const R = (h) => 500 + halfAt(h, summit); const Y = (h) => yOf(h, summit);
    // the trail: switchbacks up the face, one bend per quarter
    const trail = [[0, 0.62], [12, 0.3], [25, 0.68], [38, 0.34], [50, 0.64], [62, 0.38], [75, 0.6], [87, 0.42], [100, 0.5]]
      .map(([h, t]) => `${(L(h) + (R(h) - L(h)) * t).toFixed(0)},${Y(h).toFixed(0)}`).join(' ');
    const contour = (h) => `<path d="M${L(h) + 10},${Y(h)} Q500,${Y(h) - 10} ${R(h) - 10},${Y(h)}" class="contour"/><text class="ctext" x="${R(h) - 6}" y="${Y(h) - 4}" text-anchor="end">${h}</text>`;
    const pine = (x, y, s) => `<use href="#pine" transform="translate(${x} ${y}) scale(${s})"/>`;
    const rock = (x, y, rx, ry) => `<ellipse class="rockout" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`;
    const cloud = (x, y, s, dur) => `<g class="cloud" style="animation-duration:${dur}s"><g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="46" ry="16"/><ellipse cx="-22" cy="-6" rx="24" ry="14"/><ellipse cx="18" cy="-9" rx="28" ry="17"/></g></g>`;
    return `<defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a2e"/><stop offset=".55" stop-color="#1d3f5e"/><stop offset="1" stop-color="#3b6e8a"/></linearGradient>
        <linearGradient id="hillg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6aa36e"/><stop offset=".45" stop-color="#3f8a52"/><stop offset="1" stop-color="#1d4a2d"/></linearGradient>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
        <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2c4"/><stop offset=".6" stop-color="#ffd166"/><stop offset="1" stop-color="#ffd166" stop-opacity="0"/></radialGradient>
        <radialGradient id="kingglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb547" stop-opacity=".55"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></radialGradient>
        <symbol id="pine" overflow="visible"><rect x="-2" y="-4" width="4" height="8" fill="#4a2f1a"/><polygon points="0,-34 -12,-14 12,-14" fill="#1f5a33"/><polygon points="0,-26 -15,-2 15,-2" fill="#17472a"/><polygon points="0,-18 -18,8 18,8" fill="#113a21"/></symbol>
        <symbol id="boulder" overflow="visible"><circle r="11" fill="#8d7f70" stroke="#4e4338" stroke-width="2"/><path d="M-6,-3 L-1,2 L4,-4 M-3,6 L3,5" stroke="#4e4338" stroke-width="1.5" fill="none" stroke-linecap="round"/></symbol>
      </defs>
      <rect width="1000" height="450" fill="url(#sky)"/>
      <circle cx="150" cy="80" r="46" fill="url(#sun)"/>
      ${cloud(230, 60, 1, 38)}${cloud(760, 44, 0.8, 52)}${cloud(900, 110, 0.6, 46)}
      <polygon class="ridge far" points="0,300 120,190 220,240 330,150 420,200 500,170 600,210 700,140 800,200 900,160 1000,230 1000,430 0,430"/>
      <polygon class="ridge near" points="0,340 90,270 180,300 260,230 350,280 440,250 560,290 650,230 760,280 860,240 1000,300 1000,430 0,430"/>
      <polygon points="20,${BASE_Y} ${500 - PLATEAU - 20},${SUMMIT_Y} ${500 + PLATEAU + 20},${SUMMIT_Y} 980,${BASE_Y}" fill="url(#hillg)" stroke="#2c5f3a" stroke-width="3" stroke-linejoin="round"/>
      <polygon points="500,${SUMMIT_Y} ${500 + PLATEAU + 20},${SUMMIT_Y} 980,${BASE_Y} 500,${BASE_Y}" fill="url(#shade)"/>
      ${contour(25)}${contour(50)}${contour(75)}
      <polyline class="trail" points="${trail}"/>
      ${rock(300, 330, 26, 12)}${rock(690, 300, 20, 9)}${rock(420, 250, 14, 7)}${rock(610, 190, 12, 6)}${rock(560, 360, 30, 13)}
      <polygon points="${500 - PLATEAU - 20},${SUMMIT_Y} ${500 + PLATEAU + 20},${SUMMIT_Y} ${500 + PLATEAU + 46},${SUMMIT_Y + 22} ${500 + 40},${SUMMIT_Y + 14} 500,${SUMMIT_Y + 26} ${500 - 40},${SUMMIT_Y + 14} ${500 - PLATEAU - 46},${SUMMIT_Y + 22}" fill="#f4f8f4" opacity=".92"/>
      <line x1="500" y1="${SUMMIT_Y - 6}" x2="500" y2="${SUMMIT_Y - 46}" stroke="#eee" stroke-width="3"/><polygon class="flag" points="500,${SUMMIT_Y - 46} 534,${SUMMIT_Y - 38} 500,${SUMMIT_Y - 30}"/>
      <rect x="0" y="${BASE_Y}" width="1000" height="${450 - BASE_Y}" fill="#122c1b"/>
      ${[[40, 418, 1.5], [95, 426, 1.2], [150, 420, 1.35], [215, 428, 1.05], [960, 418, 1.5], [905, 426, 1.25], [850, 420, 1.35], [790, 428, 1.0], [130, 372, 0.75], [875, 366, 0.7], [70, 392, 0.9], [935, 390, 0.85], [245, 392, 0.7], [760, 396, 0.75]].map(([x, y, s]) => pine(x, y, s)).join('')}
      <g id="hill-fx"></g><g id="hill-climbers"></g><g id="hill-rocks"></g>`;
  }

  /** One climber: a figure in their jacket, a badge with their initials, and whatever they wear. */
  function climberHTML(c, labelled) {
    const jacket = jacketOf(c.id);
    return `${c.king ? '<circle class="glow" r="34" fill="url(#kingglow)"/>' : ''}${c.shield ? '<circle class="shield" r="22"/>' : ''}
      <g class="fig"><ellipse class="shadow" cx="0" cy="12" rx="12" ry="4"/>
        <path class="legs" d="M-5,2 L-6,12 M5,2 L6,12"/>
        <path class="body" d="M-9,4 Q-9,-10 0,-10 Q9,-10 9,4 Z" fill="${jacket}"/>
        <path class="pack" d="M-11,-7 Q-14,-1 -11,5 L-8,5 L-8,-7 Z"/>
        <circle class="head" cy="-16" r="7"/>
        ${c.king ? '<text class="crown" y="-24" text-anchor="middle">👑</text>' : ''}
      </g>
      <g class="badge" transform="translate(0 24)"><rect x="-13" y="-8" width="26" height="16" rx="8"/><text class="ini" y="4" text-anchor="middle">${esc(initials(c.name))}</text></g>
      ${labelled ? `<text class="nm" x="16" y="-10">${esc(c.name)}</text>` : ''}`;
  }

  function renderHill(st) {
    const H = st.hill;
    const svg = $('hill-svg');
    if (!svg.dataset.drawn) { svg.innerHTML = hillScene(H.summit); svg.dataset.drawn = '1'; }
    const layer = $('hill-climbers');
    const keep = new Set();
    const pos = {}; // name → [x, y] for the boulders and the sparkle
    H.climbers.forEach((c, i) => {
      keep.add(c.id);
      let g = layer.querySelector(`[data-id="${c.id}"]`);
      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('data-id', c.id);
        g.setAttribute('class', 'climber');
        layer.appendChild(g);
      }
      // the king and the two chasing them wear their names on the hill; the board names everyone
      const labelled = c.king || i < 3;
      const sig = `${c.king}|${c.shield}|${labelled}|${c.name}`;
      if (g.dataset.sig !== sig) { g.innerHTML = climberHTML(c, labelled); g.dataset.sig = sig; }
      g.classList.toggle('king', c.king);
      g.classList.toggle('hit', c.hit);
      g.classList.toggle('steady', c.steady);
      const x = xOf(c, c.h, H.summit); const y = yOf(c.h, H.summit);
      pos[c.name] = [x, y];
      g.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
    layer.querySelectorAll('.climber').forEach((g) => { if (!keep.has(g.dataset.id)) g.remove(); });
    // the leaders on top of the stack, so a crowd at the summit never hides the king
    H.climbers.slice().reverse().forEach((c) => { const g = layer.querySelector(`[data-id="${c.id}"]`); if (g) layer.appendChild(g); });

    // what just happened, before the feed marks it seen: boulders roll, a new crown sparkles
    const fresh = st.feed.filter((f) => !seenFeed.has(`${f.at}|${f.type}|${f.who || ''}`));
    for (const f of fresh) {
      if ((f.type === 'knock' || f.type === 'blocked') && pos[f.who] && pos[f.target]) rollBoulder(pos[f.who], pos[f.target], f.type === 'blocked');
      if (f.type === 'crown' && pos[f.who]) sparkle(pos[f.who]);
    }

    $('hill-board').innerHTML = H.climbers.slice(0, 10).map((c, i) => `<li class="${c.king ? 'king' : ''}${c.hit ? ' hit' : ''}">
      <span class="rk">${i + 1}</span><span class="nm"><i class="jk" style="background:${jacketOf(c.id)}"></i>${esc(c.name)}${c.king ? ' 👑' : ''}${c.shield ? ' 🛡' : ''}${c.steady ? ' <span class="muted">steady</span>' : ''}</span>
      <span class="ht"><span style="width:${Math.round((100 * c.h) / H.summit)}%"></span></span><span class="hv">${Math.round(c.h)}</span></li>`).join('')
      + (H.climbers.length > 10 ? `<li class="more muted">+ ${H.climbers.length - 10} more climbing</li>` : '');
    $('hill-feed').innerHTML = st.feed.slice(0, 5).map((f) => {
      const id = `${f.at}|${f.type}|${f.who || ''}`;
      const isNew = seenFeed.has(id) ? '' : ' new';
      seenFeed.add(id);
      if (f.type === 'knock') return `<span class="it ev${isNew}">🪨 ${esc(f.who)} knocked ${esc(f.target)} down</span>`;
      if (f.type === 'blocked') return `<span class="it${isNew}">🛡 ${esc(f.target)} blocked ${esc(f.who)}'s boulder</span>`;
      if (f.type === 'shield') return `<span class="it${isNew}">🛡 ${esc(f.who)} raised a shield</span>`;
      if (f.type === 'crown') return `<span class="it ev${isNew}">👑 ${esc(f.who)} takes the crown</span>`;
      if (f.type === 'climb') return `<span class="it ev${isNew}">CLIMB!</span>`;
      return '';
    }).join('') || '<span class="muted">Boulders and crowns show up here.</span>';
  }

  /** A boulder rolls from the thrower to the target: a lob along an arc, a dust burst where it lands. */
  function rollBoulder([x1, y1], [x2, y2], blocked) {
    const rocks = $('hill-rocks'); const fx = $('hill-fx');
    if (!rocks || !fx) return;
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'rock');
    g.innerHTML = '<use href="#boulder"/>';
    // an arc: the control point sits above the midpoint, so the throw lobs up and comes down on them
    const mx = (x1 + x2) / 2; const my = Math.min(y1, y2) - 60;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M${x1},${y1 - 10} Q${mx},${my} ${x2},${y2 - 8}`);
    const anim = document.createElementNS(ns, 'animateMotion');
    anim.setAttribute('dur', '0.7s'); anim.setAttribute('fill', 'freeze'); anim.setAttribute('calcMode', 'spline');
    anim.setAttribute('keySplines', '.3 0 .7 1'); anim.setAttribute('keyTimes', '0;1');
    const mp = document.createElementNS(ns, 'mpath');
    mp.setAttribute('href', '#' + (path.id = `rp${Date.now()}${Math.floor(Math.random() * 1e4)}`));
    anim.appendChild(mp);
    g.appendChild(anim);
    fx.appendChild(path); path.setAttribute('class', 'rockpath');
    rocks.appendChild(g);
    if (anim.beginElement) { try { anim.beginElement(); } catch { /* not supported: it still starts on insert */ } }
    setTimeout(() => {
      g.remove(); path.remove();
      const burst = document.createElementNS(ns, 'g');
      burst.setAttribute('class', blocked ? 'burst block' : 'burst');
      burst.setAttribute('transform', `translate(${x2} ${y2})`);
      burst.innerHTML = blocked
        ? '<circle class="ring" r="24"/>'
        : [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle class="puff" r="${7 + (i % 3) * 2}" style="--dx:${Math.round(Math.cos((i / 7) * 6.283) * 32)}px;--dy:${Math.round(Math.sin((i / 7) * 6.283) * 16 - 12)}px;animation-delay:${i * 25}ms"/>`).join('');
      fx.appendChild(burst);
      setTimeout(() => burst.remove(), 900);
    }, 700);
  }

  /** The crown changes hands: a burst of rays over the new king. */
  function sparkle([x, y]) {
    const fx = $('hill-fx');
    if (!fx) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'sparkle');
    g.setAttribute('transform', `translate(${x} ${y - 24})`);
    g.innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="0" y1="0" x2="0" y2="-30" transform="rotate(${i * 45})"/>`).join('') + '<circle r="6"/>';
    fx.appendChild(g);
    setTimeout(() => g.remove(), 1100);
  }

  // ---------------- the heist ----------------
  const money = (x) => `$${Number(x || 0).toLocaleString()}`;
  // The projector's heist has two halves. The BOARD is keyed, so a row is the same element all game:
  // when the standings change the rows glide to their new places (you can watch someone pass you),
  // the cash counts up, and money that changes hands is SEEN changing hands — a grab flies from the
  // victim's row to the thief's. The VAULT is the room's set piece: the wheel turns for every crack,
  // coins spill for every safe, the door swings open on a jackpot, and the lamp goes red while
  // anyone's alarm is ringing.
  const NS = 'http://www.w3.org/2000/svg';
  function vaultScene() {
    const bolts = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 6.283; return `<circle class="rivet" cx="${(200 + Math.cos(a) * 112).toFixed(1)}" cy="${(150 + Math.sin(a) * 112).toFixed(1)}" r="5"/>`;
    }).join('');
    const ticks = Array.from({ length: 40 }, (_, i) => `<line class="tick" x1="200" y1="${i % 5 ? 66 : 62}" x2="200" y2="72" transform="rotate(${i * 9} 200 150)"/>`).join('');
    const spokes = [0, 72, 144, 216, 288].map((d) => `<g transform="rotate(${d})"><rect class="spoke" x="-4" y="-50" width="8" height="50" rx="3"/><circle class="knob" cy="-52" r="8"/></g>`).join('');
    return `<defs>
        <radialGradient id="vg-door" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#8a96a8"/><stop offset=".55" stop-color="#4c566a"/><stop offset="1" stop-color="#252b3a"/></radialGradient>
        <radialGradient id="vg-gold" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#ffb547"/><stop offset="1" stop-color="#7a4a08"/></radialGradient>
        <linearGradient id="vg-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2233"/><stop offset="1" stop-color="#0b0f1a"/></linearGradient>
      </defs>
      <rect x="-300" width="1000" height="300" fill="url(#vg-wall)"/>
      <g class="plates"><path d="M-300 60H700M-300 240H700M-130 0V300M70 0V300M330 0V300M530 0V300"/></g>
      <circle class="frame" cx="200" cy="150" r="122"/>
      <circle class="inside" cx="200" cy="150" r="104" fill="url(#vg-gold)"/>
      <g class="stack">${[0, 1, 2, 3, 4].map((i) => `<rect x="${150 + i * 21}" y="${196 - (i % 3) * 14}" width="18" height="${44 + (i % 3) * 14}" rx="3"/>`).join('')}</g>
      <g id="vault-door" class="door">
        <circle cx="200" cy="150" r="106" fill="url(#vg-door)" stroke="#161b28" stroke-width="4"/>
        ${bolts}
        <circle class="ring" cx="200" cy="150" r="84"/>
        ${ticks}
        <g transform="translate(200 150)"><g id="vault-wheel" class="wheel">${spokes}<circle class="hub" r="20"/><circle class="hubcap" r="8"/></g></g>
      </g>
      <rect class="hinge" x="74" y="100" width="20" height="30" rx="4"/><rect class="hinge" x="74" y="170" width="20" height="30" rx="4"/>
      <circle id="vault-lamp" class="lamp" cx="352" cy="34" r="11"/>
      <g id="vault-fx"></g>
      <text id="vault-call" class="call" x="200" y="286" text-anchor="middle"></text>`;
  }
  let wheelTurn = 0;
  function spinWheel(turns) {
    const w = $('vault-wheel'); if (!w) return;
    wheelTurn += turns * 360;
    w.style.transform = `rotate(${wheelTurn}deg)`;
  }
  /** Coins out of the vault mouth: up, out, and down under gravity. */
  function spillCoins(n) {
    const fx = $('vault-fx'); if (!fx || calm()) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'coin'); c.setAttribute('r', 6 + (i % 3)); c.setAttribute('cx', 200); c.setAttribute('cy', 150);
      fx.appendChild(c);
      const vx = (Math.random() - 0.5) * 300; const up = 50 + Math.random() * 110;
      c.animate([
        { transform: 'translate(0,0)', opacity: 1 },
        { transform: `translate(${vx * 0.5}px,${-up}px)`, opacity: 1, offset: 0.35, easing: 'ease-in' },
        { transform: `translate(${vx}px,${170}px)`, opacity: 0.9 },
      ], { duration: 900 + Math.random() * 500, delay: i * 22, easing: 'ease-out', fill: 'backwards' }).onfinish = () => c.remove();
    }
  }
  function vaultCall(text) {
    const t = $('vault-call'); if (!t) return;
    t.textContent = text;
    t.classList.remove('on'); void t.getBBox(); t.classList.add('on');
    clearTimeout(vaultCall._t); vaultCall._t = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function jackpotDoor(who, amount) {
    const d = $('vault-door'); if (!d) return;
    d.classList.add('open');
    spinWheel(2);
    setTimeout(() => spillCoins(26), 380);
    vaultCall(`JACKPOT · ${who} · ${money(amount)}`);
    clearTimeout(jackpotDoor._t); jackpotDoor._t = setTimeout(() => d.classList.remove('open'), 2600);
  }

  /** A chip of text thrown from one element to another along an arc (fixed layer, so nothing clips it). */
  function flyChip(fromEl, toEl, text, cls) {
    if (!fromEl || !toEl || calm()) return;
    const a = fromEl.getBoundingClientRect(); const b = toEl.getBoundingClientRect();
    const chip = document.createElement('span');
    chip.className = 'flychip ' + (cls || '');
    chip.textContent = text;
    document.body.appendChild(chip);
    const x1 = a.left + a.width / 2; const y1 = a.top + a.height / 2; const x2 = b.left + b.width / 2; const y2 = b.top + b.height / 2;
    const lift = Math.max(40, Math.abs(y2 - y1) * 0.35);
    chip.animate([
      { transform: `translate(${x1}px,${y1}px) translate(-50%,-50%) scale(.7)`, opacity: 0 },
      { transform: `translate(${x1}px,${y1 - 8}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${(x1 + x2) / 2 - lift}px,${(y1 + y2) / 2}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x2}px,${y2}px) translate(-50%,-50%) scale(.85)`, opacity: 1, offset: 0.92 },
      { transform: `translate(${x2}px,${y2}px) translate(-50%,-50%) scale(.5)`, opacity: 0 },
    ], { duration: 950, easing: 'cubic-bezier(.4,0,.3,1)' }).onfinish = () => chip.remove();
  }
  /** "+$150" lifting off a row's total. */
  function floatGain(row, text, cls) {
    if (!row || calm()) return;
    const r = row.querySelector('.cv').getBoundingClientRect();
    const f = document.createElement('span');
    f.className = 'flychip gain ' + (cls || '');
    f.textContent = text;
    document.body.appendChild(f);
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    f.animate([
      { transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(.7)`, opacity: 0 },
      { transform: `translate(${x}px,${y - 26}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${x}px,${y - 54}px) translate(-50%,-50%) scale(1)`, opacity: 0 },
    ], { duration: 1200, easing: 'ease-out' }).onfinish = () => f.remove();
  }
  /** Count a dollar figure from what the row shows to what it holds. */
  function countCash(el, to) {
    const from = el._shown == null ? to : el._shown;
    cancelAnimationFrame(el._raf);
    if (from === to || calm()) { el._shown = to; el.textContent = money(to); return; }
    const t0 = performance.now(); const ms = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - k, 3);
      el._shown = Math.round(from + (to - from) * e);
      el.textContent = money(el._shown);
      if (k < 1) el._raf = requestAnimationFrame(step); else el._shown = to;
    };
    el._raf = requestAnimationFrame(step);
  }

  /** The vault board: everyone richest first as cash bars, plus whatever is being done to the screens. */
  function renderHeist(st) {
    const H = st.heist;
    if (!H) return;
    const svg = $('vault-svg');
    if (svg && !svg.dataset.drawn) { svg.innerHTML = vaultScene(); svg.dataset.drawn = '1'; }
    const top = Math.max(1, H.top);
    const board = $('heist-board');
    const rows = new Map(); const before = new Map();
    board.querySelectorAll('li[data-id]').forEach((li) => { rows.set(li.dataset.id, li); before.set(li.dataset.id, li.getBoundingClientRect().top); });
    const firstPaint = rows.size === 0;
    const shown = H.crew.slice(0, 14);
    const byName = {};
    shown.forEach((c, i) => {
      let li = rows.get(c.id);
      if (!li) {
        li = document.createElement('li');
        li.dataset.id = c.id;
        li.innerHTML = '<span class="rk"></span><span class="nm"></span><span class="bar"><span></span></span><span class="cv"></span>';
      }
      rows.delete(c.id);
      const lead = c.rank === 1 && c.cash > 0;
      li.className = `${lead ? 'lead' : ''}${c.hit ? ' hit' : ''}${c.alarm ? ' alarm' : ''}${c.cracking ? ' cracking' : ''}`;
      li.children[0].textContent = c.rank;
      const nm = `${esc(c.name)}${lead ? ' 🏆' : ''}${c.gadgets ? ' 🧰' : ''}${c.alarm ? ' 🚨' : c.cracking ? ' 🔐' : ''}`;
      if (li.dataset.nm !== nm) { li.children[1].innerHTML = nm; li.dataset.nm = nm; }
      li.children[2].firstChild.style.width = `${Math.round((100 * c.cash) / top)}%`;
      countCash(li.children[3], c.cash);
      if (board.children[i] !== li) board.insertBefore(li, board.children[i] || null);
      byName[c.name] = li;
    });
    rows.forEach((li) => li.remove()); // left the top 14, or the game
    let more = board.querySelector('li.more');
    if (H.crew.length > 14) {
      if (!more) { more = document.createElement('li'); more.className = 'more muted'; }
      more.textContent = `+ ${H.crew.length - 14} more in the crew`;
      board.appendChild(more);
    } else if (more) more.remove();
    // FLIP: every row that changed rank glides from where it was
    if (!firstPaint && !calm()) {
      board.querySelectorAll('li[data-id]').forEach((li) => {
        const was = before.get(li.dataset.id);
        if (was == null) { li.animate([{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' }); return; }
        const dy = was - li.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) {
          li.style.zIndex = dy > 0 ? '2' : '1'; // the one moving UP passes in front
          li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.3,1.25,.45,1)' }).onfinish = () => { li.style.zIndex = ''; };
        }
      });
    }
    // what just happened, before the feed marks it seen
    if (!firstPaint) {
      st.feed.filter((f) => !seenFeed.has(`${f.at}|${f.type}|${f.who || ''}`)).forEach((f) => {
        if (f.type === 'crack') spinWheel(0.5);
        if (f.type === 'safe') { spinWheel(1); spillCoins(7); floatGain(byName[f.who], `+${money(f.amount)}`); }
        if (f.type === 'jackpot') { jackpotDoor(f.who, f.amount); floatGain(byName[f.who], `+${money(f.amount)}`, 'jackpot'); }
        if (f.type === 'grab') flyChip(byName[f.target] && byName[f.target].querySelector('.cv'), byName[f.who] && byName[f.who].querySelector('.cv'), `💵 ${money(f.amount)}`);
        if (f.type === 'switch') [byName[f.who], byName[f.target]].forEach((li) => { if (li && !calm()) li.animate([{ boxShadow: '0 0 0 3px var(--led)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 900 }); });
      });
    }
    const lamp = $('vault-lamp');
    if (lamp) lamp.classList.toggle('red', H.crew.some((c) => c.alarm));
    $('heist-tally').textContent = `${H.safesCracked} ${H.safesCracked === 1 ? 'safe' : 'safes'} cracked`;
    const fx = (H.effects || []).find((e) => e.until > serverNow());
    $('live-body').classList.toggle('fx-smoke', !!fx && fx.kind === 'smoke');
    $('live-body').classList.toggle('fx-flip', !!fx && fx.kind === 'flip');
    $('heist-fx').hidden = !fx;
    if (fx) $('heist-fx').innerHTML = `${fx.kind === 'smoke' ? '💨' : '🙃'} <b>${esc(fx.by)}</b> ${fx.kind === 'smoke' ? 'dropped a smoke bomb' : 'flipped every screen'}!`;
    $('heist-feed').innerHTML = st.feed.slice(0, 6).map((f) => {
      const id = `${f.at}|${f.type}|${f.who || ''}`;
      const fresh = seenFeed.has(id) ? '' : ' new';
      seenFeed.add(id);
      if (f.type === 'jackpot') return `<span class="it ev jackpot${fresh}">💎 JACKPOT · ${esc(f.who)} ${money(f.amount)}</span>`;
      if (f.type === 'safe') return `<span class="it${fresh}">💰 ${esc(f.who)} opened a safe · ${money(f.amount)}</span>`;
      if (f.type === 'crack') return `<span class="it${fresh}">🔐 ${esc(f.who)} cracked the vault</span>`;
      if (f.type === 'grab') return `<span class="it ev${fresh}">🕶 ${esc(f.who)} grabbed ${money(f.amount)} from ${esc(f.target)}</span>`;
      if (f.type === 'switch') return `<span class="it ev${fresh}">🔁 ${esc(f.who)} switched piles with ${esc(f.target)}</span>`;
      if (f.type === 'gadget') return `<span class="it ev${fresh}">${f.kind === 'smoke' ? '💨' : '🙃'} ${esc(f.who)} fired ${f.kind === 'smoke' ? 'a smoke bomb' : 'a flip'}</span>`;
      if (f.type === 'heist') return `<span class="it ev${fresh}">THE HEIST IS ON</span>`;
      return '';
    }).join('') || '<span class="muted">Safes, grabs and gadgets show up here.</span>';
  }

  /** The heist's final: the standings and the awards, in place of the team result. */
  function renderHeistFinal(st, f) {
    const hz = f.heist;
    const top = hz.standings[0];
    $('f-acc').textContent = f.att ? f.pct + '%' : '–';
    $('f-result').className = 'king';
    $('f-result').textContent = top && top.cash > 0 ? `🏆 ${top.name} walks out with ${money(top.cash)}` : 'Nobody cracked a thing';
    const awards = [
      hz.safecracker && `<div class="award"><span class="k">Safecracker</span><b>${esc(hz.safecracker.name)}</b> ${hz.safecracker.count} ${hz.safecracker.count === 1 ? 'safe' : 'safes'}</div>`,
      hz.biggestGrab && `<div class="award"><span class="k">Biggest grab</span><b>${esc(hz.biggestGrab.name)}</b> ${money(hz.biggestGrab.amount)}</div>`,
    ].filter(Boolean).join('');
    $('f-mvps').innerHTML = `<div class="panel standings"><h3>Final standings</h3>${awards ? `<div class="awards">${awards}</div>` : ''}<ol>${
      hz.standings.map((s) => `<li${s.place === 1 ? ' class="king"' : ''}><span class="nm">${esc(s.name)}</span><span>${money(s.cash)} · ${s.comp}/${s.att} right${s.safes ? ` · 🔐 ${s.safes}` : ''}${s.alarms ? ` · 🚨 ${s.alarms}` : ''}</span></li>`).join('')
    }</ol><p class="muted">Accuracy sits beside the cash on purpose: the student who answered the most usually walks out with the most.</p></div>`;
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
    $('final').classList.toggle('mode-heist', st.mode === 'heist');
    $('f-acc').textContent = f.att ? f.pct + '%' : '–';
    const [a, b] = st.teams;
    const win = a.pts !== b.pts ? (a.pts > b.pts ? 0 : 1) : (a.pos !== b.pos ? (a.pos > b.pos ? 0 : 1) : -1);
    const h = $('f-result');
    h.className = win >= 0 ? `t${win}` : '';
    h.textContent = win < 0 ? 'Tie game' : `${st.teams[win].name} wins${a.pts === b.pts ? ' on field position' : ''}`;
    const picks = st.teams.reduce((n, t) => n + (t.picks || 0), 0);
    const blitzes = st.teams.reduce((n, t) => n + (t.blitzes || 0), 0);
    $('f-picks').hidden = !picks && !blitzes;
    $('f-picks').innerHTML = st.teams.map((t, i) => (t.picks ? `<span class="t${i}">🏈 ${esc(t.name)}: ${t.picks} pick ${t.picks === 1 ? 'six' : 'sixes'}</span>` : '')).join('')
      + st.teams.map((t, i) => (t.blitzes ? `<span class="t${i}">⚡ ${esc(t.name)}: ${t.blitzes} ${t.blitzes === 1 ? 'blitz' : 'blitzes'}</span>` : '')).join('');
    if (f.hill) renderHillFinal(st, f);
    else if (f.heist) renderHeistFinal(st, f);
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
    // King of the Hill and the Heist already list everyone in their standings.
    if (st.mode === 'hill' || st.mode === 'heist' || !players.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    lastScores = { code: st.code, game: st.gameNumber, players, teams: st.teams };
    const unit = st.mode === 'drive' ? 'yds' : 'pts';
    const showBlitz = st.mode === 'drive' && !!(st.rules && st.rules.blitz);
    const showSilent = st.mode === 'huddle';
    const rows = players.map((p, i) => `<tr><td class="num">${i + 1}</td><td class="nm t${p.team}">${esc(p.name)}${p.saved ? ' <span class="acct" title="Signed in">✓</span>' : ''}</td>` +
      `<td>${esc(teamName(st, p.team))}</td><td class="num"><b>${p.yards}</b> ${unit}</td><td class="num">${p.comp}/${p.att}</td>` +
      `<td class="num">${p.pct == null ? '–' : p.pct + '%'}</td><td class="num">${p.best}</td>${showBlitz ? `<td class="num">${p.blitzes || 0}</td>` : ''}${showSilent ? `<td class="num">${p.noAnswers || 0}</td>` : ''}<td class="num">${p.avgSec == null ? '–' : p.avgSec + ' s'}</td></tr>`).join('');
    el.innerHTML = `<h3>Every player</h3>
      <div class="tablewrap"><table class="ftab stab"><thead><tr><th>#</th><th>Student</th><th>Team</th><th>Score</th><th>Right</th><th>Accuracy</th><th>Best streak</th>${showBlitz ? '<th>⚡ Blitzes</th>' : ''}${showSilent ? '<th>No answer</th>' : ''}<th>Avg time</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row"><button class="ghost" id="f-scores-csv">Download scores (CSV)</button><span class="muted">One line per student. ✓ = signed in with their account.</span></div>`;
    $('f-scores-csv').onclick = downloadScoresCsv;
  }
  function teamName(st, i) { return (st.teams && st.teams[i] && st.teams[i].name) || ''; }
  function downloadScoresCsv() {
    if (!lastScores) return;
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const safe = (v) => (/^[=+\-@]/.test(String(v)) ? `'${v}` : v); // never a formula in a spreadsheet
    const lines = [['Rank', 'Student', 'Team', 'Score', 'Right', 'Attempted', 'Accuracy %', 'Best streak', 'Blitzes', 'No answer', 'Avg seconds', 'Signed in'].map(q).join(',')]
      .concat(lastScores.players.map((p, i) => [i + 1, safe(p.name), teamName(lastScores, p.team), p.yards, p.comp, p.att, p.pct == null ? '' : p.pct, p.best, p.blitzes || 0, p.noAnswers || 0, p.avgSec == null ? '' : p.avgSec, p.saved ? 'yes' : 'no'].map(q).join(',')));
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
    const note = st.mode !== 'huddle'
      ? 'Each student ran the plays at their own pace, so the later plays were only reached by the fastest.'
      : 'Every student saw every play.';
    $('f-pbp').innerHTML = `<h3>Play by play</h3><p>${note} Tap a play to see it again.</p><ol>${plays.map((p) => `<li><details class="${band(p.pct)}">
        <summary><span class="pn">#${p.n}</span><span class="ps">${p.summary}${(p.pickSix || []).some(Boolean) ? ` <span class="p6tag">🏈 Pick six · ${p.pickSix.map((x, i) => (x ? esc(teamName(st, i)) : null)).filter(Boolean).join(' & ')}</span>` : ''}</span>
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
      const [{ drills, courses, settings }, { classes }, cat] = await Promise.all([
        api('/drills'), api('/classes').catch(() => ({ classes: [] })),
        fetch('/api/live-drill/solo/arcade', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({ games: [] })),
      ]);
      S.drills = drills; S.courses = courses || []; S.settings = settings; S.classes = classes; S.games = (cat && cat.games) || [];
      renderClasses();
      if (!drills.some((d) => d.id === S.drill && !d.unavailable)) S.drill = (drills.find((d) => !d.unavailable) || drills[0]).id;
      // Opened from the Arcade (/live-drill?mode=heist): start on that game.
      const wantMode = new URLSearchParams(location.search).get('mode');
      if (['drive', 'huddle', 'hill', 'heist'].includes(wantMode)) S.mode = wantMode;
      if (!['drive', 'huddle', 'hill', 'heist'].includes(S.mode)) S.mode = 'drive';
      renderSetup();
      wireSearch();
      show('setup');
    } catch (e) { $('setup-err').textContent = e.message; }
  })();
})();
