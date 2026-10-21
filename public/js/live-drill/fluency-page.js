// Fact Fluency — the teacher's view of each student's saved math-facts record
// (routes/liveDrill.js /host/fluency/…, utils/liveDrill/fluency.js). Reads only; every read is
// FERPA-logged server-side.
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

  const STATUS = { fluent: 'Fluent', slow: 'Slow', missed: 'Missed', new: 'New' };
  const chips = (list) => list.map((p) => `<span class="fchip ${p.status === 'missed' ? 'miss' : 'slow'}">${p.label}${p.sec != null && p.status === 'slow' ? ` <i>${p.sec}s</i>` : ''}</span>`).join('');
  const ago = (d) => {
    if (!d) return '–';
    const days = Math.floor((Date.now() - new Date(d)) / 86400000);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  };

  /** A family grid. Class cells color by the share of students fluent; student cells by status. */
  function gridHTML(g, mode) {
    const sym = g.fam === 'mul' ? '×' : '+';
    const nums = Array.from({ length: g.max + 1 }, (_, i) => i);
    const cell = (a, b) => {
      const c = g.cells[`${a},${b}`];
      if (!c) return '<td></td>';
      if (mode === 'student') {
        const cls = { fluent: 'ok', slow: 'slow', missed: 'miss', new: 'new' }[c.status];
        return `<td class="${cls}" title="${a} ${sym} ${b}: ${STATUS[c.status]} (${c.facts.join(', ')})">${c.status === 'fluent' ? '✓' : c.status === 'missed' ? '✗' : c.status === 'slow' ? '…' : '·'}</td>`;
      }
      const share = c.fluent / c.tried;
      const cls = c.missed / c.tried >= 0.3 ? 'miss' : share >= 0.8 ? 'ok' : 'slow';
      return `<td class="${cls}" title="${a} ${sym} ${b}: ${c.fluent} of ${c.tried} fluent, ${c.missed} missing it">${c.fluent}/${c.tried}</td>`;
    };
    return `<div class="fgrid"><h4>${g.fam === 'mul' ? '× and ÷' : '+ and −'} facts</h4><div class="tablewrap"><table><thead><tr><th>${sym}</th>${nums.map((b) => `<th>${b}</th>`).join('')}</tr></thead><tbody>${
      nums.map((a) => `<tr><th>${a}</th>${nums.map((b) => cell(a, b)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderClass() {
    const v = $('class-view');
    v.hidden = false;
    $('student-view').hidden = true;
    const withData = data.students.filter((s) => s.games > 0);
    $('csv').disabled = !withData.length;
    $('cls-note').textContent = `${data.students.length} students · ${withData.length} with Math Facts games saved`;
    if (!withData.length) {
      v.innerHTML = `<h3>No games saved yet</h3><p>Host a Math Facts game at <a href="/live-drill">/live-drill</a> and tie it to this class. Students who join signed in — the <b>Join</b> button on their chat screen, or /play while signed in — are saved; a student who joins with just the code and a name isn't.</p>`;
      return;
    }
    const legend = '<span class="fchip miss">missed</span> <span class="fchip slow">right but slow</span>';
    v.innerHTML = `<h3>${esc(data.className)}</h3>
      <p>Each cell: students fluent / students who've had that fact. Green = most of the class is fluent; amber = not fluent yet (right once, or slow); red = 30%+ are missing it. A fact and its inverse share a cell (56 ÷ 7 is in 7 × 8).</p>
      ${data.grids.map((g) => gridHTML(g, 'class')).join('')}
      <h4>Students</h4><p>Tap a student for their own grid. ${legend}</p>
      <div class="tablewrap"><table class="ftab"><thead><tr><th>Student</th><th>Games</th><th>Fluent</th><th title="Right and fast once — one more and it's fluent">Right once</th><th>Slow</th><th>Missed</th><th>Last game</th><th>To practice</th></tr></thead><tbody>${
        data.students.map((s) => `<tr class="pick" data-id="${esc(s.id)}" tabindex="0"><td class="nm">${esc(s.name)}</td><td class="num">${s.games}</td><td class="num">${s.fluent}/${s.tried}</td><td class="num">${s.new}</td><td class="num">${s.slow}</td><td class="num">${s.missed}</td><td class="num">${ago(s.lastGameAt)}</td><td>${s.games ? (s.practice.length ? chips(s.practice.slice(0, 8)) : '<span class="muted">Nothing to practice</span>') : '<span class="muted">No games yet</span>'}</td></tr>`).join('')
      }</tbody></table></div>`;
    v.querySelectorAll('tr.pick').forEach((tr) => {
      const go = () => openStudent(tr.dataset.id);
      tr.onclick = go;
      tr.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
  }

  async function openStudent(id) {
    try {
      const s = await get(`/fluency/classes/${encodeURIComponent($('cls').value)}/students/${encodeURIComponent(id)}`);
      const v = $('student-view');
      v.hidden = false;
      v.innerHTML = `<div class="row"><h3 style="margin:0">${esc(s.name)}</h3><button class="ghost" id="back" style="margin-left:auto">Back to the class</button></div>
        <div class="stats" style="grid-template-columns:repeat(5,minmax(0,1fr));margin:10px 0">
          <div><span class="v">${s.fluent}</span><span class="k">Fluent</span></div><div><span class="v">${s.new}</span><span class="k">Right once</span></div>
          <div><span class="v">${s.slow}</span><span class="k">Slow</span></div><div><span class="v">${s.missed}</span><span class="k">Missed</span></div><div><span class="v">${s.games}</span><span class="k">Games</span></div></div>
        ${s.practice.length ? `<p>To practice, misses first:</p><div class="fchips">${chips(s.practice)}</div>` : '<p>Nothing to practice right now.</p>'}
        ${s.grids.map((g) => gridHTML(g, 'student')).join('')}
        <p class="muted">✓ fluent · · right once (one more and it's fluent) · … right but slow · ✗ missed lately. A cell shows its weakest fact.</p>`;
      $('back').onclick = () => { v.hidden = true; $('class-view').hidden = false; $('class-view').scrollIntoView({ block: 'start' }); };
      $('class-view').hidden = true;
      v.scrollIntoView({ block: 'start' });
    } catch (e) { $('err').textContent = e.message; }
  }

  function csv() {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const safe = (v) => (/^[=+\-@]/.test(String(v)) ? `'${v}` : v); // never a spreadsheet formula
    const lines = [['Student', 'Games', 'Facts tried', 'Fluent', 'Right once', 'Slow', 'Missed', 'To practice'].map(q).join(',')]
      .concat(data.students.map((s) => [safe(s.name), s.games, s.tried, s.fluent, s.new, s.slow, s.missed, s.practice.map((p) => p.label).join('; ')].map(q).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `fact-fluency-${data.className.replace(/[^\w]+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('csv').onclick = csv;

  async function load() {
    $('err').textContent = '';
    try {
      data = await get(`/fluency/classes/${encodeURIComponent($('cls').value)}`);
      try { localStorage.setItem('mm-fluency-class', $('cls').value); } catch { /* private mode */ }
      renderClass();
    } catch (e) { $('err').textContent = e.message; }
  }
  $('cls').onchange = load;

  (async function boot() {
    try {
      const { classes } = await get('/classes');
      if (!classes.length) { $('err').textContent = 'You have no classes yet. Create one on your dashboard, then host a Math Facts game for it.'; return; }
      $('cls').innerHTML = classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${c.students})</option>`).join('');
      let saved = null;
      try { saved = localStorage.getItem('mm-fluency-class'); } catch { /* private mode */ }
      const qs = new URLSearchParams(location.search).get('class');
      const pick = [qs, saved].find((id) => id && classes.some((c) => c.id === id));
      if (pick) $('cls').value = pick;
      load();
    } catch (e) { $('err').textContent = e.message; }
  })();
})();
