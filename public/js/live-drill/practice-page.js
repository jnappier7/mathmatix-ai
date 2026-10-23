// Practice Log — the teacher's view of solo drill rounds (routes/liveDrill.js
// /host/practice/…, utils/liveDrill/practice.js). Reads only; every read is FERPA-logged
// server-side. Scores are self-reported by the browser, so this page reports EFFORT —
// rounds, minutes, recency, movement — and shows no average and no ranking.
(function () {
  const { $, esc } = window.LiveDrill;
  const API = '/api/live-drill/host';
  let data = null; // the class view

  async function get(path) {
    const res = await fetch(API + path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    let body = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (res.status === 401) { location.href = '/login.html'; throw new Error('Sign in again.'); }
    if (!res.ok) throw new Error((body && body.message) || `Request failed (${res.status})`);
    return body;
  }

  const ago = (d) => {
    if (!d) return '–';
    const days = Math.floor((Date.now() - new Date(d)) / 86400000);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  };
  const when = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–');
  const gameName = (id) => (data && data.names && data.names[id]) || id;

  /** Movement, shown only where it means something: a single round is a starting
   *  point, not a trend, so the server sends delta:null for it and we say so. */
  function deltaHTML(g) {
    if (g.delta === null) return '<span class="muted">first round</span>';
    if (g.delta === 0) return '<span class="dz">no change</span>';
    const up = g.delta > 0;
    return `<span class="${up ? 'dup' : 'ddn'}">${up ? '▲' : '▼'} ${Math.abs(g.delta)}</span>`;
  }

  const gameChips = (games, names) => games.map((g) => `<span class="gchip"><b>${esc((names && names[g.drill]) || g.drill)}</b>`
    + `<i>${g.rounds} ${g.rounds === 1 ? 'round' : 'rounds'} · best ${g.best}</i>${deltaHTML(g)}</span>`).join('');

  function renderClass() {
    const v = $('class-view');
    v.hidden = false;
    $('student-view').hidden = true;
    const t = data.totals;
    $('csv').disabled = !t.rounds;
    const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
    $('cls-note').textContent = `${n(t.students, 'student')} · ${t.practised} practised · ${n(t.rounds, 'round')} · ${t.minutes} min`;

    if (!t.rounds) {
      v.innerHTML = `<h3>No practice saved yet</h3><p>Rounds are saved when a student plays at
        <a href="/drill">/drill</a> <b>while signed in</b>. A student playing signed out still gets
        the drill, but nothing is kept. Point them at <code>mathmatix.ai/drill</code> &mdash; both
        course home pages link it.</p>`;
      return;
    }

    v.innerHTML = `<h3>${esc(data.className)}</h3>
      <div class="stats" style="grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 0">
        <div><span class="v">${t.practised}/${t.students}</span><span class="k">Have practised</span></div>
        <div><span class="v">${t.notPractised}</span><span class="k">Not yet</span></div>
        <div><span class="v">${t.rounds}</span><span class="k">Rounds</span></div>
        <div><span class="v">${t.minutes}</span><span class="k">Minutes</span></div>
      </div>
      <p>Tap a student for their rounds. <b>▲</b> is the change from their first score to their latest, in that game.</p>
      <div class="tablewrap"><table class="ftab"><thead><tr><th>Student</th><th>Rounds</th><th>Minutes</th><th>Last played</th><th>Games</th></tr></thead><tbody>${
        data.students.map((s) => `<tr class="${s.rounds ? 'pick' : 'none'}" data-id="${esc(s.id)}" ${s.rounds ? 'tabindex="0"' : ''}>
          <td class="nm">${esc(s.name)}</td>
          <td class="num">${s.rounds || '–'}</td>
          <td class="num">${s.rounds ? s.minutes : '–'}</td>
          <td class="num">${ago(s.lastAt)}</td>
          <td>${s.rounds ? gameChips(s.games, data.names) : '<span class="muted">Hasn&rsquo;t practised</span>'}</td></tr>`).join('')
      }</tbody></table></div>`;

    v.querySelectorAll('tr.pick').forEach((tr) => {
      const go = () => openStudent(tr.dataset.id);
      tr.onclick = go;
      tr.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
  }

  async function openStudent(id) {
    try {
      const s = await get(`/practice/classes/${encodeURIComponent($('cls').value)}/students/${encodeURIComponent(id)}`);
      const v = $('student-view');
      v.hidden = false;
      v.innerHTML = `<div class="row"><h3 style="margin:0">${esc(s.name)}</h3><button class="ghost" id="back" style="margin-left:auto">Back to the class</button></div>
        <div class="stats" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:10px 0">
          <div><span class="v">${s.rounds}</span><span class="k">Rounds</span></div>
          <div><span class="v">${s.minutes}</span><span class="k">Minutes</span></div>
          <div><span class="v">${ago(s.lastAt)}</span><span class="k">Last played</span></div>
        </div>
        ${s.games.length ? `<div class="fchips">${gameChips(s.games, s.names)}</div>` : ''}
        <h4>Rounds</h4>
        <div class="tablewrap"><table class="ftab"><thead><tr><th>When</th><th>Game</th><th>Playbook</th><th>Clock</th><th>Score</th><th>Right</th></tr></thead><tbody>${
          s.recent.map((r) => `<tr><td class="num">${when(r.playedAt)}</td><td>${esc((s.names && s.names[r.drill]) || r.drill)}</td>
            <td>${esc(r.playbook || '–')}</td><td class="num">${r.seconds ? `${Math.round(r.seconds / 60)} min` : '–'}</td>
            <td class="num">${r.score}</td><td class="num">${r.right}/${r.attempted}</td></tr>`).join('')
        }</tbody></table></div>
        <p class="muted">Newest first, up to 50. Scores come from the student's browser.</p>`;
      $('back').onclick = () => { v.hidden = true; $('class-view').hidden = false; $('class-view').scrollIntoView({ block: 'start' }); };
      $('class-view').hidden = true;
      v.scrollIntoView({ block: 'start' });
    } catch (e) { $('err').textContent = e.message; }
  }

  function csv() {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const safe = (v) => (/^[=+\-@]/.test(String(v)) ? `'${v}` : v); // never a spreadsheet formula
    const lines = [['Student', 'Rounds', 'Minutes', 'Last played', 'Games'].map(q).join(',')]
      .concat(data.students.map((s) => [
        safe(s.name), s.rounds, s.minutes, s.lastAt ? new Date(s.lastAt).toISOString() : '',
        s.games.map((g) => `${gameName(g.drill)}: ${g.rounds} ${g.rounds === 1 ? 'round' : 'rounds'}, best ${g.best}${g.delta === null ? '' : `, ${g.delta >= 0 ? '+' : ''}${g.delta}`}`).join('; '),
      ].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `practice-${data.className.replace(/[^\w]+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('csv').onclick = csv;

  async function load() {
    $('err').textContent = '';
    try {
      data = await get(`/practice/classes/${encodeURIComponent($('cls').value)}`);
      try { localStorage.setItem('mm-practice-class', $('cls').value); } catch { /* private mode */ }
      renderClass();
    } catch (e) { $('err').textContent = e.message; }
  }
  $('cls').onchange = load;

  (async function boot() {
    try {
      const { classes } = await get('/classes');
      if (!classes.length) { $('err').textContent = 'You have no classes yet. Create one on your dashboard first.'; return; }
      $('cls').innerHTML = classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${c.students})</option>`).join('');
      let saved = null;
      try { saved = localStorage.getItem('mm-practice-class'); } catch { /* private mode */ }
      const qs = new URLSearchParams(location.search).get('class');
      const pick = [qs, saved].find((id) => id && classes.some((c) => c.id === id));
      if (pick) $('cls').value = pick;
      load();
    } catch (e) { $('err').textContent = e.message; }
  })();
})();
