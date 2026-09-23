/* global csrfFetch */
/**
 * activities.js — the student host page for Class Activities.
 *
 * List view: GET /api/activities/mine.
 * Player view (?a=<slug>): loads /api/activities/<slug>/frame into an iframe
 * with sandbox="allow-scripts" (and the server adds a CSP sandbox on top), so
 * the activity runs in an opaque origin with no network access. It talks only
 * to this page:
 *
 *   activity → host  { source:'mathmatix-activity', v:1, type:'ready' }
 *                    { source:'mathmatix-activity', v:1, type:'check', item, level,
 *                      correct, total, solved, checks, durationMs, misconceptions[] }
 *   host → activity  { source:'mathmatix-host', v:1, type:'init', progress:{ item:[levels] } }
 *
 * Messages are accepted only from our own iframe's window (the origin is the
 * string "null" for a sandboxed frame, so the window identity is the check).
 * This page adds nothing about the student to what it forwards — the server
 * takes identity from the session. Full protocol: docs/CLASS_ACTIVITIES.md.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const slug = new URLSearchParams(location.search).get('a');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function fmtDue(d) {
    if (!d) return '';
    const date = new Date(d);
    const late = date < new Date();
    return (late ? 'Was due ' : 'Due ') + date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ─── List view ──────────────────────────────────────────────────────────
  async function showList() {
    const status = $('act-status');
    status.textContent = 'Loading…';
    try {
      const res = await fetch('/api/activities/mine', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(res.status);
      const { assignments } = await res.json();
      status.textContent = '';
      const list = $('act-list');
      list.textContent = '';
      if (!assignments.length) {
        status.textContent = 'Nothing assigned right now. When your teacher assigns an activity it will show up here.';
        return;
      }
      for (const a of assignments) {
        const li = el('li', 'act-card');
        const link = el('a', 'act-card-link');
        link.href = '/activities.html?a=' + encodeURIComponent(a.activity.slug);
        link.appendChild(el('span', 'act-card-title', a.activity.title));
        const meta = [a.activity.course, a.className].filter(Boolean).join(' · ');
        if (meta) link.appendChild(el('span', 'act-card-meta', meta));
        if (a.activity.description) link.appendChild(el('span', 'act-card-desc', a.activity.description));
        if (a.note) link.appendChild(el('span', 'act-card-note', a.note));
        const foot = el('span', 'act-card-foot');
        const done = a.itemsSolved >= a.itemsTotal;
        foot.appendChild(el('span', 'act-progress' + (done ? ' done' : ''), `${a.itemsSolved} of ${a.itemsTotal} done`));
        if (a.dueDate) foot.appendChild(el('span', 'act-due', fmtDue(a.dueDate)));
        link.appendChild(foot);
        li.appendChild(link);
        list.appendChild(li);
      }
    } catch {
      status.textContent = 'Could not load your activities. Refresh to try again.';
    }
  }

  // ─── Player view ────────────────────────────────────────────────────────
  async function showPlayer() {
    $('act-list-view').hidden = true;
    $('act-player-view').hidden = false;
    document.body.classList.add('playing');
    const back = $('act-back');
    back.href = '/activities.html';
    back.textContent = '← Activities';

    const frame = $('act-frame');
    const saveEl = $('act-save');
    let progress = {};

    try {
      const res = await fetch('/api/activities/' + encodeURIComponent(slug) + '/progress', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        progress = data.progress || {};
        $('act-title').textContent = data.activity.title;
        document.title = data.activity.title + ' | MATHMATIX AI';
      }
    } catch { /* the activity still works without restored ✓ marks */ }

    const sendInit = () => {
      if (frame.contentWindow) {
        frame.contentWindow.postMessage({ source: 'mathmatix-host', v: 1, type: 'init', progress }, '*');
      }
    };

    function setSave(text, cls) {
      saveEl.textContent = text;
      saveEl.className = 'act-save' + (cls ? ' ' + cls : '');
    }

    async function record(msg, attempt) {
      setSave('Saving…');
      try {
        const res = await csrfFetch('/api/activities/' + encodeURIComponent(slug) + '/events', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg)
        });
        const data = await res.json().catch(() => ({}));
        if (res.status >= 400 && res.status < 500) {
          // Not a connection problem, and retrying won't change the answer.
          return setSave('Not saved — ' + (data.message || 'refused'), 'err');
        }
        if (!res.ok) throw new Error(data.message || res.status);
        if (data.stored === false) setSave('Preview — not saved', 'muted');
        else setSave(msg.solved ? 'Saved ✓ solved' : 'Saved', 'ok');
        if (msg.solved) {
          const lv = progress[msg.item] || (progress[msg.item] = []);
          if (!lv.includes(msg.level)) lv.push(msg.level);
        }
      } catch {
        if (!attempt) return setTimeout(() => record(msg, 1), 3000);
        setSave('Not saved — check your connection', 'err');
      }
    }

    window.addEventListener('message', (e) => {
      if (e.source !== frame.contentWindow) return;
      const d = e.data;
      if (!d || d.source !== 'mathmatix-activity' || d.v !== 1) return;
      if (d.type === 'ready') sendInit();
      else if (d.type === 'check') {
        record({
          type: 'check', item: d.item, level: d.level, correct: d.correct, total: d.total,
          solved: d.solved === true, checks: d.checks, durationMs: d.durationMs,
          misconceptions: Array.isArray(d.misconceptions) ? d.misconceptions : []
        });
      }
    });

    frame.addEventListener('load', sendInit);
    frame.src = '/api/activities/' + encodeURIComponent(slug) + '/frame';
  }

  if (slug) showPlayer(); else showList();
})();
