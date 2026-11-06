// Mathmatix Arcade — the front door to every game (/arcade; catalogue from utils/liveDrill/arcade.js
// via GET /api/live-drill/solo/arcade). Public: a guest sees every game and the join box; a signed-in
// student also sees any class game open right now; a teacher gets a Host button on each game.
(function () {
  const { $, esc } = window.LiveDrill;
  const SOLO = '/api/live-drill/solo';

  async function getJSON(url) {
    const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(`Request failed (${r.status})`);
    return r.json();
  }

  // ---- the card art: four little inline scenes, one per game, in the drill's own palette ----
  const ART = {
    field: `<svg viewBox="0 0 200 110" aria-hidden="true"><rect width="200" height="110" rx="8" fill="#2d6a3e"/>
      ${[20, 40, 60, 80, 100, 120, 140, 160, 180].map((x) => `<line x1="${x}" y1="10" x2="${x}" y2="100" stroke="#eef3ec" stroke-opacity=".55" stroke-width="${x === 100 ? 2 : 1}"/>`).join('')}
      <rect x="0" y="0" width="20" height="110" fill="#ff5d50" opacity=".85"/><rect x="180" y="0" width="20" height="110" fill="#4cb3ff" opacity=".85"/>
      <ellipse cx="128" cy="56" rx="13" ry="8" fill="#8b4a1f" stroke="#fff" stroke-width="1.5" transform="rotate(-20 128 56)"/><line x1="122" y1="58" x2="134" y2="54" stroke="#fff" stroke-width="1.5"/>
      <circle cx="70" cy="40" r="6" fill="#ff5d50"/><circle cx="60" cy="72" r="6" fill="#ff5d50"/><circle cx="150" cy="40" r="6" fill="#4cb3ff"/><circle cx="145" cy="78" r="6" fill="#4cb3ff"/></svg>`,
    board: `<svg viewBox="0 0 200 110" aria-hidden="true"><rect width="200" height="110" rx="8" fill="#12262f"/>
      <rect x="18" y="14" width="164" height="36" rx="5" fill="#fbfbf7"/><text x="30" y="38" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="800" font-size="18" fill="#14212a">SOLVE.  6x + 2 ≤ 68</text>
      ${[0, 1, 2, 3].map((i) => `<rect x="18" y="${58 + i * 12}" width="${[120, 56, 150, 40][i]}" height="9" rx="3" fill="${i === 2 ? '#3ccf7e' : '#1c3540'}"/><rect x="18" y="${58 + i * 12}" width="9" height="9" rx="2" fill="#ffb547"/>`).join('')}</svg>`,
    mountain: `<svg viewBox="0 0 200 110" aria-hidden="true"><rect width="200" height="110" rx="8" fill="#1d3f5e"/>
      <circle cx="36" cy="26" r="12" fill="#ffd166" opacity=".9"/><polygon points="0,110 50,60 90,80 130,40 170,75 200,55 200,110" fill="#24466a"/>
      <polygon points="30,110 100,18 170,110" fill="#3f8a52" stroke="#2c5f3a" stroke-width="2"/><polygon points="88,34 100,18 112,34" fill="#f4f8f4"/>
      <line x1="100" y1="18" x2="100" y2="6" stroke="#eee" stroke-width="1.5"/><polygon points="100,6 110,9 100,12" fill="#ffb547"/>
      <circle cx="78" cy="78" r="5" fill="#4cb3ff"/><circle cx="118" cy="64" r="5" fill="#ff6a5c"/><circle cx="100" cy="40" r="5" fill="#ffb547"/><text x="100" y="34" text-anchor="middle" font-size="11">👑</text>
      <circle cx="106" cy="54" r="5" fill="#8d7f70" stroke="#4e4338" stroke-width="1.5"/></svg>`,
    vault: `<svg viewBox="0 0 200 110" aria-hidden="true"><rect width="200" height="110" rx="8" fill="#141a2a"/>
      <rect x="55" y="12" width="90" height="86" rx="8" fill="#2a2f45" stroke="#5a5f7a" stroke-width="3"/><circle cx="100" cy="55" r="22" fill="#171b2c" stroke="#8d93ad" stroke-width="3"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="100" y1="37" x2="100" y2="43" stroke="#ffb547" stroke-width="2.5" transform="rotate(${a} 100 55)"/>`).join('')}
      <circle cx="100" cy="55" r="5" fill="#ffb547"/><rect x="128" y="48" width="8" height="14" rx="2" fill="#8d93ad"/>
      <text x="160" y="40" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="20" fill="#ffb547">$</text>
      <text x="22" y="86" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="20" fill="#3ccf7e">$</text><text x="28" y="30" font-size="16">🚨</text></svg>`,
  };

  let me = { signedIn: false, teacher: false, saves: false };

  function renderGames(games) {
    $('games').innerHTML = games.map((g) => `<article class="gcard" id="game-${esc(g.id)}">
        <div class="art">${ART[g.icon] || ''}</div>
        <div class="gbody">
          <div class="eyebrow">${esc(g.players)}</div>
          <h3>${esc(g.name)}</h3>
          <p class="tag">${esc(g.tagline)}</p>
          <p class="how">${esc(g.how)}</p>
          <div class="gact">${me.teacher
    ? `<a class="go sm" href="/live-drill?mode=${encodeURIComponent(g.id)}">Host ${esc(g.name)}</a>`
    : '<span class="muted">Your teacher hosts this one — join with the code on the board.</span>'}</div>
        </div>
      </article>`).join('');
    if (me.teacher) $('g-note').textContent = 'Pick a game to host it. Students join at mathmatix.ai/play with the code on your board, or from their Mathmatix chat screen if you tie the game to a class.';
  }

  function renderHubs(hubs) {
    $('hubs').innerHTML = hubs.map((h) => `<a class="hcard" href="${esc(h.url)}">
        <h3>${esc(h.title)}</h3>
        <ul>${h.games.slice(0, 6).map((n) => `<li>${esc(n)}</li>`).join('')}${h.games.length > 6 ? `<li class="muted">+ ${h.games.length - 6} more</li>` : ''}</ul>
        <span class="cta">Play solo →</span>
      </a>`).join('');
  }

  function renderTests(tests) {
    $('tests').innerHTML = tests.map((t) => `<a class="tcard" href="${esc(t.url)}">
        <h3>${esc(t.name)}</h3><p>${esc(t.blurb)}</p><span class="cta">Start the test →</span>
      </a>`).join('');
  }

  /** A signed-in student: any class game open right now gets a Join button at the top. */
  async function liveNow() {
    try {
      const r = await getJSON('/api/live-drill/mine');
      if (!r.student || !r.games || !r.games.length) return;
      const what = { drive: 'Team Drive', huddle: 'Huddle', hill: 'King of the Hill', heist: 'Heist' };
      $('live-now').hidden = false;
      $('live-now').innerHTML = `<span class="eyebrow">Live now</span>` + r.games.map((g) => `<div class="lrow"><span><b>${esc(g.className || 'Your class')}</b> · ${esc(what[g.mode] || g.mode)}${g.hostName ? ` · ${esc(g.hostName)}` : ''}</span><a class="go sm" href="/play?code=${encodeURIComponent(g.code)}">Join</a></div>`).join('');
    } catch { /* not signed in, or no games */ }
  }

  // ---- find a topic: the same index the solo page and the host use ----
  let qSeq = 0;
  async function runSearch(text) {
    const res = $('q-res');
    const seq = ++qSeq;
    const words = String(text || '').trim();
    if (!words) { res.hidden = true; res.innerHTML = ''; return; }
    let results;
    try { ({ results } = await getJSON(`${SOLO}/search?q=${encodeURIComponent(words)}`)); } catch { return; }
    if (seq !== qSeq) return;
    res.hidden = false;
    if (!results.length) { res.innerHTML = `<p class="muted none">Nothing for “${esc(words)}”. Try the module or chapter number, or a word from the lesson.</p>`; return; }
    res.innerHTML = results.map((x) => `<a role="option" href="/drill/${encodeURIComponent(x.hub)}?game=${encodeURIComponent(x.drill)}&book=${encodeURIComponent(x.key)}">`
      + `<span class="bk-ch">${esc(x.title)}${x.ch ? ` · ${esc(x.ch)}` : ''}</span>`
      + `<span class="nm">${esc(x.name)}</span><span class="bl">${esc(x.blurb || '')}</span></a>`).join('');
  }
  function wireSearch() {
    const q = $('q'); const res = $('q-res');
    let t = null;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => runSearch(q.value), 160); };
    q.onkeydown = (e) => {
      if (e.key === 'Escape') { q.value = ''; runSearch(''); }
      if (e.key === 'ArrowDown') { const a = res.querySelector('a'); if (a) { e.preventDefault(); a.focus(); } }
    };
    res.onkeydown = (e) => {
      const items = [...res.querySelectorAll('a')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && items[i + 1]) { e.preventDefault(); items[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || q).focus(); }
    };
    $('dsearch').onsubmit = (e) => { e.preventDefault(); const a = res.querySelector('a'); if (a) a.click(); };
  }

  // ---- join with a code ----
  $('code').addEventListener('input', () => { $('code').value = $('code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('join').onsubmit = (e) => {
    e.preventDefault();
    const code = $('code').value.trim();
    if (code.length < 4) { $('code').focus(); return; }
    location.href = `/play?code=${encodeURIComponent(code)}`;
  };

  (async function boot() {
    try {
      const [cat, who] = await Promise.all([getJSON(`${SOLO}/arcade`), getJSON(`${SOLO}/me`).catch(() => me)]);
      me = { ...me, ...who };
      renderGames(cat.games);
      renderHubs(cat.hubs);
      renderTests(cat.tests);
      wireSearch();
      $('foot').innerHTML = me.teacher
        ? 'Teachers: your class results live in the <a href="/drill-practice">practice log</a> and <a href="/fact-fluency">fact fluency</a>; the <a href="/live-drill">host screen</a> is where a game starts.'
        : me.signedIn
          ? `Signed in as <b>${esc(who.firstName || '')}</b>: your solo rounds are saved to your account.`
          : 'No account needed for any of this. <a href="/login">Sign in</a> and your solo rounds are saved.';
      if (me.signedIn && !me.teacher) liveNow();
    } catch (err) { $('err').textContent = err.message; }
  })();
})();
