/* global csrfFetch */
/**
 * teacher-activities.js — the teacher dashboard's Activities tab.
 *
 * Assign a Class Activity (activities/manifest.json) to one of your classes,
 * then read results per student and the class "trap report": which wrong
 * strips were sitting in students' proofs when they pressed Check, counted by
 * student. API: routes/activities.js. Deferred standalone script (not part of
 * the teacher bundle), so no `npm run build:bundles` is needed after edits.
 */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const tabBtn = document.querySelector('[data-tab="activities"]');
  if (!tabBtn) return;

  let catalog = [];
  let loaded = false;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
  const fmtDur = (ms) => {
    if (!ms && ms !== 0) return '';
    const m = Math.round(ms / 60000);
    return m < 1 ? '<1 min' : `${m} min`;
  };

  function setStatus(text, kind) {
    const s = $('ta-assign-status');
    s.textContent = text;
    s.className = 'ta-status' + (kind ? ' ' + kind : '');
  }

  function syncActivityDesc() {
    const a = catalog.find((x) => x.slug === $('ta-activity').value);
    $('ta-activity-desc').textContent = a
      ? [a.course, a.sections && `§${a.sections}`, `${a.items.length} items`].filter(Boolean).join(' · ') + (a.description ? ` — ${a.description}` : '')
      : '';
    $('ta-preview').href = a ? '/activities.html?a=' + encodeURIComponent(a.slug) : '#';
  }

  async function loadCatalogAndClasses() {
    const [catRes, clsRes] = await Promise.all([
      fetch('/api/activities/catalog', { credentials: 'same-origin' }),
      fetch('/api/teacher/classes', { credentials: 'same-origin' })
    ]);
    catalog = catRes.ok ? (await catRes.json()).activities || [] : [];
    const classes = clsRes.ok ? (await clsRes.json()).classes || [] : [];

    const actSel = $('ta-activity');
    actSel.textContent = '';
    for (const a of catalog) {
      const o = el('option', null, a.title);
      o.value = a.slug;
      actSel.appendChild(o);
    }
    const clsSel = $('ta-class');
    clsSel.textContent = '';
    if (!classes.length) {
      const o = el('option', null, 'Create a class in the Classes tab first');
      o.value = '';
      clsSel.appendChild(o);
    }
    for (const c of classes) {
      const o = el('option', null, `${c.className || c.code} (${c.studentCount})`);
      o.value = c._id;
      clsSel.appendChild(o);
    }
    syncActivityDesc();
  }

  async function loadAssignments() {
    const box = $('ta-assignments');
    try {
      const res = await fetch('/api/activities/assignments', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(res.status);
      const { assignments } = await res.json();
      box.textContent = '';
      if (!assignments.length) {
        box.appendChild(el('p', 'ta-empty', 'Nothing assigned yet.'));
        return;
      }
      for (const a of assignments) {
        const row = el('div', 'ta-assignment');
        const main = el('div', 'ta-assignment-main');
        main.appendChild(el('strong', null, a.activityTitle));
        main.appendChild(el('span', 'ta-muted',
          `${a.className} · ${a.studentCount} student${a.studentCount === 1 ? "" : "s"} · assigned ${fmtDate(a.assignedAt)}` + (a.dueDate ? ` · due ${fmtDate(a.dueDate)}` : '')));
        row.appendChild(main);
        const view = el('button', 'btn btn-primary btn-sm', 'Results');
        view.type = 'button';
        view.addEventListener('click', () => loadResults(a));
        const del = el('button', 'btn btn-secondary btn-sm', 'Remove');
        del.type = 'button';
        del.addEventListener('click', async () => {
          if (!confirm(`Remove "${a.activityTitle}" from ${a.className}? Students' saved work is kept.`)) return;
          const r = await csrfFetch(`/api/activities/assignments/${a._id}`, { method: 'DELETE', credentials: 'same-origin' });
          if (r.ok) loadAssignments();
        });
        row.appendChild(view);
        row.appendChild(del);
        box.appendChild(row);
      }
    } catch {
      box.textContent = 'Could not load assignments.';
    }
  }

  function levelName(activity, n) {
    const l = activity.levels.find((x) => x.n === n);
    return l ? l.name : `Level ${n}`;
  }

  async function loadResults(a) {
    const box = $('ta-results');
    $('ta-results-title').textContent = `${a.activityTitle} — ${a.className}`;
    box.textContent = 'Loading…';
    box.closest('.dashboard-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const res = await fetch(`/api/activities/assignments/${a._id}/results`, { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || res.status);
      renderResults(data);
    } catch {
      box.textContent = 'Could not load results.';
    }
  }

  function renderResults(data) {
    const box = $('ta-results');
    const { activity, summary, items, students } = data;
    box.textContent = '';

    const stats = el('div', 'ta-stats');
    [
      [summary.students, summary.students === 1 ? 'student' : 'students'],
      [summary.opened, 'opened it'],
      [summary.finishedAll, `finished all ${activity.items.length}`]
    ].forEach(([n, label]) => {
      const s = el('div', 'ta-stat');
      s.appendChild(el('b', null, String(n)));
      s.appendChild(el('span', null, label));
      stats.appendChild(s);
    });
    box.appendChild(stats);

    // ── Student × item grid ──
    const wrap = el('div', 'ta-table-wrap');
    const table = el('table', 'ta-table');
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', null, 'Student'));
    for (const it of activity.items) {
      const th = el('th', null, it.label);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const s of students) {
      const tr = el('tr');
      const nameTd = el('td', 'ta-name');
      nameTd.appendChild(el('span', null, s.name));
      if (!s.opened) nameTd.appendChild(el('span', 'ta-tag', 'not opened'));
      tr.appendChild(nameTd);
      for (const it of activity.items) {
        const r = s.items[it.key];
        const td = el('td', 'ta-cell');
        if (!r) {
          td.textContent = '—';
          td.classList.add('ta-none');
        } else if (r.solvedLevels.length) {
          td.classList.add('ta-solved');
          td.textContent = '✓ ' + r.solvedLevels.map((n) => `R${n}`).join(' ');
          const f = r.firstSolve;
          td.title = `First solved on ${levelName(activity, f.level)} in ${f.checks} check${f.checks === 1 ? '' : 's'}` +
            (f.durationMs ? `, ${fmtDur(f.durationMs)}` : '') + `. ${r.checks} checks total.`;
        } else {
          td.classList.add('ta-trying');
          td.textContent = `${r.checks} check${r.checks === 1 ? '' : 's'}, not yet`;
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    box.appendChild(wrap);
    box.appendChild(el('p', 'ta-muted ta-legend',
      'R1/R2/R3 = rungs solved (' + activity.levels.map((l) => `R${l.n} ${l.name}`).join(', ') + '). Hover a cell for checks and time.'));

    // ── Trap report ──
    box.appendChild(el('h3', 'ta-h3', 'Traps your class fell for'));
    box.appendChild(el('p', 'ta-muted', 'Wrong strips that were in a student\'s proof when they pressed Check, counted once per student.'));
    let anyTrap = false;
    for (const it of items) {
      if (!it.traps.length) continue;
      anyTrap = true;
      const block = el('div', 'ta-trap-item');
      block.appendChild(el('strong', null, `${it.label} — solved by ${it.solvedBy} of ${summary.students}`));
      const ul = el('ul', 'ta-traps');
      for (const t of it.traps) {
        const li = el('li');
        li.appendChild(el('span', 'ta-trap-count', `${t.students}`));
        li.appendChild(el('span', null, t.label || t.key));
        ul.appendChild(li);
      }
      block.appendChild(ul);
      box.appendChild(block);
    }
    if (!anyTrap) box.appendChild(el('p', 'ta-empty', 'No trap strips recorded yet.'));
  }

  $('ta-activity').addEventListener('change', syncActivityDesc);

  $('ta-assign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const classId = $('ta-class').value;
    if (!classId) return setStatus('Create a class first (Classes tab).', 'err');
    setStatus('Assigning…');
    try {
      const res = await csrfFetch('/api/activities/assignments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activitySlug: $('ta-activity').value,
          classId,
          dueDate: $('ta-due').value || null,
          note: $('ta-note').value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not assign.');
      setStatus('Assigned. Students will see it under Assignments in their chat sidebar.', 'ok');
      $('ta-note').value = '';
      $('ta-due').value = '';
      loadAssignments();
    } catch (err) {
      setStatus(err.message, 'err');
    }
  });

  tabBtn.addEventListener('click', () => {
    if (loaded) return;
    loaded = true;
    loadCatalogAndClasses().catch(() => setStatus('Could not load activities or classes.', 'err'));
    loadAssignments();
  });
});
