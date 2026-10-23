// Solo practice — a course's Live Drill games, played alone (/drill/<hub>; utils/liveDrill/solo.js).
// The server deals whole plays, answer included, in batches; this page clocks, grades and scores
// them itself. A guest's personal best stays in this browser; a signed-in STUDENT also files
// every finished round to their account (POST /result → models/drillResult.js), which is what
// makes a best follow them to another device. Play HTML (card, choices,
// tell) is the drill's own template output, never user text, so it is set with innerHTML — the
// same contract as the live pages (common.js).
(function () {
  const { $, esc, cardHTML, mmss } = window.LiveDrill;
  const API = '/api/live-drill/solo';
  const MINUS = '−';
  const showNum = (v) => String(v).replace('-', MINUS);

  const hubId = (location.pathname.match(/^\/drill\/([a-z0-9-]+)/) || [])[1] || null;
  let hub = null; // the hub view from the server
  const sel = { gi: 0, book: 'all', seconds: 0, focus: [] };
  // Math Facts: one-tap focus sets, as on the host screen. Anything else is a tap on the numbers.
  const FOCUS_PRESETS = [['All facts', []], ['Easy: 0 1 2 5 10', [0, 1, 2, 5, 10]], ['Tough: 6 7 8 9 12', [6, 7, 8, 9, 12]]];
  const focusOn = () => { const f = game().focusable; return !!(f && f.books.includes(sel.book)); };
  const focusNow = () => (focusOn() && sel.focus.length ? sel.focus : []);
  /** "2s, 5s & 10s" (facts.focusLabel) */
  const focusLabel = (f) => { const n = f.map((x) => `${x}s`); return n.length < 2 ? (n[0] || '') : `${n.slice(0, -1).join(', ')} & ${n[n.length - 1]}`; };
  let round = null;
  let tick = null;

  const local = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const bestKey = () => `mm-drill-best:${game().drill}:${sel.book}:${sel.seconds}${focusNow().length ? `:f${focusNow().join('-')}` : ''}`;
  const game = () => hub.games[sel.gi];

  // Who is playing. `saves` is the server's answer, not ours: rounds are filed
  // for students only, the same rule FactFluency follows.
  const me = { signedIn: false, firstName: '', saves: false };
  let bestSeq = 0;               // guards against a slow best landing after a newer one

  const selQuery = () => `drill=${encodeURIComponent(game().drill)}&book=${encodeURIComponent(sel.book)}`
    + `&seconds=${sel.seconds}&focus=${focusNow().join(',')}`;

  /** The account strip under the title. Says what is true in each of the three
   *  states — nothing is saved, everything is saved, or you are signed in but
   *  this is not your record to keep. */
  function renderAcct() {
    const el = $('acct');
    if (!el) return;
    if (!me.signedIn) {
      const next = encodeURIComponent(location.pathname);
      el.innerHTML = `Playing as a guest &mdash; scores stay on this device. `
        + `<a href="/login.html?next=${next}">Log in to save them</a>.`;
    } else if (me.saves) {
      el.textContent = `Signed in as ${me.firstName}. Every round is saved to your account.`;
    } else {
      el.textContent = `Signed in as ${me.firstName}. Rounds are saved for student accounts.`;
    }
  }

  async function loadMe() {
    try {
      const body = await get('/me');
      Object.assign(me, { signedIn: !!body.signedIn, firstName: body.firstName || '', saves: !!body.saves });
    } catch { /* a drill you can still play is better than an error */ }
    renderAcct();
    // This resolves after the first renderSetup, so the best line has already
    // been drawn from localStorage; redraw it now that we know whose it is.
    if (hub) showBest();
  }

  /** "Your best here", from the account when there is one, else this browser. */
  async function showBest() {
    const seq = ++bestSeq;
    const local0 = local.get(bestKey());
    const line = (b0) => (b0 ? `Your best here: ${b0.score} (${b0.right}/${b0.att ?? b0.attempted} right).` : '');
    $('best').textContent = line(local0);
    if (!me.saves) return;
    try {
      const body = await get(`/me?${selQuery()}`);
      if (seq !== bestSeq) return;            // selection moved on while we waited
      if (body.best) $('best').textContent = line(body.best);
    } catch { /* keep the local line */ }
  }

  async function get(path) {
    const res = await fetch(API + path, { headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Could not reach the drill.');
    return body;
  }
  function show(id) { ['pick', 'live', 'final'].forEach((s) => { $(s).hidden = s !== id; }); window.scrollTo(0, 0); }

  // ---------------------------------------------------------------- pick

  async function boot() {
    loadMe();                    // not awaited: the strip can fill in late
    if (!hubId) return renderHubList();
    try { hub = await get(`/hubs/${encodeURIComponent(hubId)}`); } catch (err) { $('pick-err').textContent = err.message; return; }
    document.title = `${hub.title} Drills | MATHMATIX AI`;
    $('h-title').innerHTML = `${esc(hub.title)} <span>Drills</span>`;
    $('h-hubs').innerHTML = hub.hubs.filter((h) => h.id !== hub.id)
      .map((h) => `<a href="/drill/${esc(h.id)}">${esc(h.title)} drills →</a>`).join(' · ');
    const saved = local.get(`mm-drill-pick:${hub.id}`);
    if (saved && hub.games[saved.gi]) Object.assign(sel, saved);
    if (!Array.isArray(sel.focus)) sel.focus = [];
    pickGame(sel.gi, true);
    $('setup').hidden = false;
    $('start').onclick = start;
  }

  /** /drill with no course: one tile per course. */
  async function renderHubList() {
    let list;
    try { list = (await get('/hubs')).hubs; } catch (err) { $('pick-err').textContent = err.message; return; }
    $('h-hubs').innerHTML = `<span class="books">${list.map((h) => `<a class="book" href="/drill/${esc(h.id)}"><span class="nm">${esc(h.title)}</span><span class="bl">${esc(h.games.join(' · '))}</span></a>`).join('')}</span>`;
  }

  function pickGame(gi, keep) {
    sel.gi = gi;
    const g = game();
    if (!keep || !g.playbooks.some((b) => b.key === sel.book)) sel.book = g.playbooks.some((b) => b.key === 'all') ? 'all' : g.playbooks[0].key;
    if (!keep || !g.clock.seconds.includes(sel.seconds)) sel.seconds = g.clock.defaultSeconds;
    renderSetup();
  }

  function renderSetup() {
    const g = game();
    $('games').innerHTML = hub.games.map((x, i) => `<button type="button" class="book" data-i="${i}" aria-pressed="${i === sel.gi}"><span class="nm">${esc(x.name)}</span><span class="bl">${esc(x.blurb)}</span></button>`).join('');
    $('games').querySelectorAll('.book').forEach((b) => { b.onclick = () => pickGame(Number(b.dataset.i)); });
    $('books').innerHTML = g.playbooks.map((b) => `<button type="button" class="book" data-k="${esc(b.key)}" aria-pressed="${b.key === sel.book}"><span class="bk-ch">${esc(b.ch || '')}</span><span class="nm">${esc(b.name)}</span><span class="bl">${esc(b.blurb || '')}</span></button>`).join('');
    $('books').querySelectorAll('.book').forEach((b) => { b.onclick = () => { sel.book = b.dataset.k; renderSetup(); }; });
    $('book-bl').textContent = (g.playbooks.find((b) => b.key === sel.book) || {}).blurb || '';
    $('clock').innerHTML = g.clock.seconds.map((s) => `<button type="button" data-s="${s}" aria-pressed="${s === sel.seconds}">${mmss(s * 1000)}</button>`).join('');
    $('clock').querySelectorAll('button').forEach((b) => { b.onclick = () => { sel.seconds = Number(b.dataset.s); renderSetup(); }; });
    renderFocus(g);
    $('rules').innerHTML = rulesHTML(g);
    showBest();
    local.set(`mm-drill-pick:${hub.id}`, sel);
  }

  function renderFocus(g) {
    $('opt-focus').hidden = !focusOn();
    if (!focusOn()) return;
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    $('f-pre').innerHTML = FOCUS_PRESETS.map(([label, set], i) => `<button type="button" data-i="${i}" aria-pressed="${same(sel.focus, set)}">${label}</button>`).join('');
    $('f-pre').querySelectorAll('button').forEach((b) => { b.onclick = () => { sel.focus = [...FOCUS_PRESETS[+b.dataset.i][1]]; renderSetup(); }; });
    $('f-nums').innerHTML = Array.from({ length: g.focusable.max + 1 }, (_, n) => `<button type="button" data-n="${n}" aria-pressed="${sel.focus.includes(n)}">${n}</button>`).join('');
    $('f-nums').querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const n = +b.dataset.n;
        sel.focus = sel.focus.includes(n) ? sel.focus.filter((x) => x !== n) : [...sel.focus, n].sort((a, c) => a - c);
        renderSetup();
      };
    });
    const big = sel.focus.some((n) => n > 10) && sel.book !== 'mul' && sel.book !== 'div';
    $('f-note').innerHTML = sel.focus.length
      ? `Every fact will have a <b>${focusLabel(sel.focus)}</b> in it.${big ? ' (Addition and subtraction go to 10, so 11s and 12s only show up in × and ÷.)' : ''}`
      : 'Tap numbers to drill just those — like 2, 5 and 10.';
  }

  function rulesHTML(g) {
    const [fast, mid, slow] = g.scoring.gains;
    const [w0, w1] = g.scoring.withinMs.map((ms) => `${ms / 1000} s`);
    return `<div class="rgrid">`
      + `<div class="rule"><span class="rk">Right answer</span><span class="rv"><b class="g">+${fast}</b> in ${w0} · <b class="g">+${mid}</b> in ${w1} · <b class="g">+${slow}</b> after</span></div>`
      + `<div class="rule"><span class="rk">Wrong answer</span><span class="rv"><b class="b">−${g.scoring.miss}</b>, and you see why before the next one</span></div>`
      + `<div class="rule"><span class="rk">The clock</span><span class="rv">One clock for the round. ${g.typed ? '<b>Type</b> each answer.' : 'Answer as many as you can.'}</span></div>`
      + '</div>';
  }

  // ---------------------------------------------------------------- round

  function newSeed() {
    const a = new Uint32Array(3);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => x.toString(36)).join('').slice(0, 24).padEnd(8, '0');
  }

  async function start() {
    const g = game();
    $('start').disabled = true;
    round = { g, book: sel.book, seconds: sel.seconds, focus: focusNow(), seed: newSeed(), plays: [], loading: null,
      n: 0, score: 0, right: 0, att: 0, streak: 0, longest: 0, misses: [], endsAt: 0, cur: null, over: false };
    try { await more(); } catch (err) { $('pick-err').textContent = err.message; $('start').disabled = false; return; }
    $('start').disabled = false;
    $('pick-err').textContent = '';
    $('p-game').textContent = `${g.name} · ${(g.playbooks.find((b) => b.key === round.book) || {}).name || ''}${round.focus.length ? ` · ${focusLabel(round.focus)}` : ''}`;
    renderScore();
    show('live');
    round.endsAt = Date.now() + round.seconds * 1000;
    clearInterval(tick);
    tick = setInterval(renderClock, 200);
    renderClock();
    nextPlay();
  }

  /** Fetch the next batch of plays; one request in flight at a time. */
  function more() {
    if (!round.loading) {
      const r = round;
      r.loading = get(`/plays?drill=${encodeURIComponent(r.g.drill)}&book=${encodeURIComponent(r.book)}&seed=${r.seed}&from=${r.plays.length}${r.focus.length ? `&focus=${r.focus.join(',')}` : ''}`)
        .then((b) => { r.plays.push(...b.plays); })
        .finally(() => { r.loading = null; });
    }
    return round.loading;
  }

  function renderScore() {
    $('s-score').textContent = round.score;
    $('s-streak').textContent = round.streak;
  }
  function renderClock() {
    if (!round || round.over) return;
    const left = round.endsAt - Date.now();
    $('s-clock').textContent = mmss(left);
    $('s-clock').classList.toggle('low', left <= 10000);
    if (left <= 0) finish();
  }

  async function nextPlay() {
    if (!round || round.over) return;
    if (round.n >= round.plays.length) {
      try { await more(); } catch (err) { $('fb').innerHTML = `<span class="muted">${esc(err.message)}</span>`; return; }
      if (round.n >= round.plays.length) return finish(); // the deal cap: a round that long is over
    }
    if (round.plays.length - round.n < 10) more().catch(() => { /* retried on the next play */ });
    const play = round.plays[round.n++];
    round.cur = { play, shownAt: Date.now(), locked: false };
    $('p-card').innerHTML = cardHTML(play, null, `Play ${round.n}`);
    if (window.scrollY > 0) window.scrollTo(0, 0); // back up from the last explanation
    if (play.input === 'number') openPad(answer, !!play.neg);
    else { closePad(); $('p-choices').innerHTML = choicesHTML(play); bindChoices(answer); }
    // The question is already on the card; the bar says how to answer instead.
    $('fb').className = 'fb';
    $('fb').innerHTML = `<span class="muted">${play.input === 'number' ? 'Type the answer, then press Enter or Go.' : `Tap an answer, or press 1–${play.choices.length}.`}</span>`;
  }

  /** The typed-answer rule the live game grades by (utils/liveDrill/facts.js normalizeTyped). */
  function normalizeTyped(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/[−–]/g, '-').replace(/\s+/g, '');
    if (!/^-?\d{1,5}$/.test(s)) return null;
    const n = Number(s);
    return String(Object.is(n, -0) ? 0 : n);
  }

  function answer(k) {
    const r = round;
    if (!r || r.over || !r.cur || r.cur.locked) return;
    const { play } = r.cur;
    r.cur.locked = true;
    const typed = play.input === 'number';
    const ms = Date.now() - r.cur.shownAt;
    const ok = typed ? normalizeTyped(k) === play.answer : k === play.answer;
    const tier = ms <= r.g.scoring.withinMs[0] ? 0 : ms <= r.g.scoring.withinMs[1] ? 1 : 2;
    r.att++;
    $('p-card').innerHTML = cardHTML(play, play.revealCard, `Play ${r.n}`);
    if (typed) padResult(k, ok);
    else $('p-choices').innerHTML = choicesHTML(play, { answer: play.answer, picked: k, disabled: true });
    if (ok) {
      const gain = r.g.scoring.gains[tier];
      r.score += gain; r.right++; r.streak++; r.longest = Math.max(r.longest, r.streak);
      renderScore();
      $('fb').className = 'fb good';
      $('fb').innerHTML = `<span class="bigtxt">${tier === 0 ? 'Fast' : tier === 1 ? 'Right' : 'Got it'} · +${gain}</span><span class="why">${(ms / 1000).toFixed(1)} s</span>`;
      setTimeout(nextPlay, typed ? 380 : 650);
    } else {
      r.score = Math.max(0, r.score - r.g.scoring.miss); r.streak = 0;
      renderScore();
      const pickedHtml = typed ? esc(showNum(k)) : ((play.choices.find((c) => c.k === k) || {}).html || '');
      r.misses.push({ play, pickedHtml });
      $('fb').className = 'fb bad';
      $('fb').innerHTML = `<span class="bigtxt">Missed · −${r.g.scoring.miss}</span><span class="why">You ${typed ? 'typed' : 'picked'} ${pickedHtml}. ${play.tell}</span><button class="next" id="nx" type="button">Next</button>`;
      $('nx').focus({ preventScroll: true });
      $('nx').onclick = nextPlay;
      // a short laptop screen can put the explanation below the fold: bring it up
      $('fb').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /** File a finished round. Best effort and silent on failure: a student who
   *  just played should never be told their practice did not count because a
   *  write failed — the round happened either way, and the local best still
   *  holds. CSRF rides along because this is a cookie-session write. */
  async function saveRound(r) {
    if (!me.saves || !r.att) return;
    try {
      const fetcher = window.csrfFetch || fetch;
      const res = await fetcher(`${API}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          hub: hub.id, drill: game().drill, book: sel.book, seconds: sel.seconds,
          focus: focusNow().join(','),
          score: r.score, right: r.right, attempted: r.att, streak: r.longest,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.saved && body.best) {
        $('f-best').textContent = body.best.score > r.score
          ? `Your best here is ${body.best.score}.`
          : 'New best — saved to your account.';
      }
    } catch { /* silent: see above */ }
  }

  function finish() {
    const r = round;
    if (!r || r.over) return;
    r.over = true;
    clearInterval(tick);
    closePad();
    const key = bestKey();
    const prev = local.get(key);
    const isBest = r.att > 0 && (!prev || r.score > prev.score);
    if (isBest) local.set(key, { score: r.score, right: r.right, att: r.att, at: Date.now() });
    $('f-game').textContent = $('p-game').textContent;
    $('f-result').textContent = r.att ? `${r.score} points` : 'No answers';
    $('f-best').textContent = isBest && prev ? `New best — up from ${prev.score}.` : isBest ? 'Your first score here. Beat it.' : prev ? `Your best here is ${prev.score}.` : '';
    saveRound(r);
    $('f-score').textContent = r.score;
    $('f-comp').textContent = `${r.right}/${r.att}`;
    $('f-pct').textContent = r.att ? `${Math.round((100 * r.right) / r.att)}%` : '–';
    $('f-streak').textContent = r.longest;
    const ms = r.misses;
    $('f-film').innerHTML = '<h3>Film room</h3>' + (ms.length
      ? `<p>${ms.length} missed. Read the tell on each one; that's the clue you'll see next time.</p><ol>${ms.map((m) => `<li>
          ${cardHTML({ card: m.play.revealCard, playbookName: '' }, m.play.revealCard, '')}
          <div class="note"><span><span class="tag">You ${m.play.input === 'number' ? 'typed' : 'picked'}</span><span class="yr">${m.pickedHtml}</span></span><span><span class="tag">Answer</span><span class="cr">${m.play.answerHtml}</span></span></div>
          <div class="tellbox">${m.play.tell}</div></li>`).join('')}</ol>`
      : r.att ? '<p>Clean round. Nothing to review.</p>' : '');
    show('final');
  }

  $('quit').onclick = finish;
  $('again').onclick = () => { renderSetup(); start(); };
  $('back').onclick = () => { renderSetup(); show('pick'); };

  // ---------------------------------------------------------------- choices & pad (as on /play)

  function choicesHTML(play, opts) {
    const o = opts || {};
    return play.choices.map((c, i) => {
      let cls = '';
      if (o.answer != null) cls = c.k === o.answer ? ' right' : c.k === o.picked ? ' wrong' : ' fade';
      return `<button class="ch${cls}" data-k="${esc(c.k)}"${o.disabled ? ' disabled' : ''}><span class="kbd">${i + 1}</span><span class="lab">${c.html}</span></button>`;
    }).join('');
  }
  function bindChoices(onPick) {
    $('p-choices').querySelectorAll('.ch').forEach((b) => { b.onclick = () => onPick(b.dataset.k); });
  }

  let pad = null; // { onSubmit, value, locked, minus }
  /** Go lives in the 4×3 grid so the pad fits a phone with its bars showing (see play.js). */
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
  function padResult(typed, ok) {
    pad = null;
    $('p-choices').hidden = true;
    $('p-pad').hidden = false;
    $('live').classList.add('typing');
    $('p-pad').innerHTML = `<div class="entry ${ok ? 'right' : 'wrong'}"><span class="v">${esc(showNum(typed))}</span></div>`;
  }
  function closePad() { pad = null; $('live').classList.remove('typing'); $('p-pad').hidden = true; $('p-pad').innerHTML = ''; $('p-choices').hidden = false; }

  document.addEventListener('keydown', (e) => {
    if ($('live').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (pad) {
      if (/^\d$/.test(e.key) || e.key === 'Backspace' || e.key === 'Enter' || e.key === '-') { e.preventDefault(); padKey(e.key); }
      return;
    }
    if (e.key === 'Enter' && $('nx')) { e.preventDefault(); $('nx').click(); return; }
    const i = Number(e.key) - 1;
    const btns = $('p-choices').querySelectorAll('.ch:not([disabled])');
    if (i >= 0 && i < btns.length) btns[i].click();
  });

  boot();
})();
