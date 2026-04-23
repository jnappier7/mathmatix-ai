/**
 * admin-transcript-flags.js
 *
 * Simple admin review list for transcript flags. Injects a button into the
 * admin dashboard header, opens a modal with the current flag backlog, and
 * lets the admin click a row to open the flagged conversation in the shared
 * transcript viewer (public/js/teacher-transcripts.js).
 *
 * Intentionally small: this is v1 triage surface. Status transitions
 * (reviewed / dismissed) are out of scope here — the model supports them,
 * the next pass wires them up.
 */
(function () {
  'use strict';

  const STATE = { modal: null, button: null, escHandler: null };

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'className') el.className = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }

  function ensureButton() {
    if (STATE.button) return STATE.button;
    // Dock the button next to the user search so it's visible without
    // fighting for layout. If the dashboard reshuffles later, the fallback
    // appends to the main-content header area.
    const searchRow = document.querySelector('#studentSearch')?.closest('div[style*="flex"]');
    const btn = h('button', {
      id: 'admin-review-flags-btn',
      type: 'button',
      className: 'btn',
      style: 'padding: 8px 14px; border-radius: 6px; border: 1px solid #e74c3c; background: #fff; color: #c0392b; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;',
      title: 'Review transcript flags',
    }, [
      h('i', { className: 'fas fa-flag' }),
      h('span', null, 'Review flags'),
      h('span', { id: 'admin-review-flags-count', style: 'display:none; background:#e74c3c; color:#fff; border-radius:999px; padding:1px 7px; font-size:0.8em; margin-left:4px;' }),
    ]);
    btn.addEventListener('click', () => openModal());

    if (searchRow) {
      searchRow.appendChild(btn);
    } else {
      const main = document.querySelector('#main-content') || document.body;
      btn.style.position = 'fixed';
      btn.style.top = '80px';
      btn.style.right = '20px';
      btn.style.zIndex = '500';
      main.appendChild(btn);
    }
    STATE.button = btn;
    return btn;
  }

  function ensureModal() {
    if (STATE.modal) return STATE.modal;

    const modal = h('div', {
      id: 'admin-flags-modal',
      className: 'modal-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'admin-flags-title',
      style: 'display: none;',
    });
    const content = h('div', {
      className: 'modal-content',
      style: 'max-width: 920px; width: calc(100vw - 40px); max-height: 85vh; padding: 0; display: flex; flex-direction: column;',
    }, [
      h('span', {
        id: 'admin-flags-close',
        className: 'modal-close-button',
        role: 'button',
        'aria-label': 'Close',
        tabindex: '0',
      }, '×'),
      h('div', { style: 'padding: 20px 24px 12px 24px; border-bottom: 1px solid #e9ecef;' }, [
        h('h2', { id: 'admin-flags-title', style: 'margin: 0 0 6px 0; color: #c0392b; font-size: 1.2em; display:flex; align-items:center; gap:8px;' }, [
          h('i', { className: 'fas fa-flag' }),
          h('span', null, 'Transcript flags'),
        ]),
        h('div', { style: 'display:flex; gap:10px; align-items:center; font-size:0.9em;' }, [
          h('label', { for: 'admin-flags-status', style: 'color:#5B6876;' }, 'Status:'),
          h('select', { id: 'admin-flags-status', style: 'padding:4px 8px; border-radius:6px; border:1px solid #ddd;' }, [
            h('option', { value: 'open', selected: 'selected' }, 'Open'),
            h('option', { value: 'reviewed' }, 'Reviewed'),
            h('option', { value: 'dismissed' }, 'Dismissed'),
            h('option', { value: 'all' }, 'All'),
          ]),
          h('button', {
            id: 'admin-flags-refresh',
            type: 'button',
            style: 'padding:4px 10px; border-radius:6px; border:1px solid #ddd; background:#fff; cursor:pointer;',
            title: 'Refresh',
          }, [h('i', { className: 'fas fa-rotate-right' })]),
        ]),
      ]),
      h('div', {
        id: 'admin-flags-body',
        style: 'flex: 1 1 auto; overflow-y: auto; padding: 0;',
      }),
    ]);
    modal.appendChild(content);
    document.body.appendChild(modal);

    const close = () => closeModal();
    content.querySelector('#admin-flags-close').addEventListener('click', close);
    content.querySelector('#admin-flags-close').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    content.querySelector('#admin-flags-status').addEventListener('change', () => loadFlags());
    content.querySelector('#admin-flags-refresh').addEventListener('click', () => loadFlags());

    STATE.modal = modal;
    return modal;
  }

  function openModal() {
    ensureModal();
    STATE.modal.style.display = 'flex';
    STATE.modal.classList.add('is-visible');
    STATE.escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', STATE.escHandler);
    loadFlags();
  }

  function closeModal() {
    if (!STATE.modal) return;
    STATE.modal.classList.remove('is-visible');
    STATE.modal.style.display = 'none';
    if (STATE.escHandler) {
      document.removeEventListener('keydown', STATE.escHandler);
      STATE.escHandler = null;
    }
    if (STATE.button) STATE.button.focus();
  }

  function setBody(nodeOrHtml) {
    const body = STATE.modal.querySelector('#admin-flags-body');
    body.innerHTML = '';
    if (typeof nodeOrHtml === 'string') body.innerHTML = nodeOrHtml;
    else if (nodeOrHtml) body.appendChild(nodeOrHtml);
  }

  function nameOf(user) {
    if (!user) return 'Unknown';
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown';
  }

  function snippetOf(flag) {
    const content = flag?.turnSnapshot?.content || '';
    if (content.length <= 180) return content;
    return `${content.slice(0, 177)}…`;
  }

  async function loadFlags() {
    const status = STATE.modal.querySelector('#admin-flags-status').value;
    setBody(h('div', { style: 'padding:40px 20px; text-align:center; color:#7f8c8d;' }, [
      h('i', { className: 'fas fa-spinner fa-spin' }),
      h('span', { style: 'margin-left:8px;' }, 'Loading flags…'),
    ]));
    try {
      const res = await fetch(`/api/transcript-flags?status=${encodeURIComponent(status)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const { flags } = await res.json();
      renderFlags(flags || []);
      updateButtonCount(status === 'open' ? (flags || []).length : null);
    } catch (err) {
      console.error('[AdminFlags] load failed', err);
      setBody(h('div', { style: 'padding:24px; color:#c0392b; text-align:center;' }, 'Could not load flags.'));
    }
  }

  function updateButtonCount(count) {
    const span = document.querySelector('#admin-review-flags-count');
    if (!span) return;
    if (count == null || count === 0) {
      span.style.display = 'none';
      span.textContent = '';
    } else {
      span.style.display = 'inline-block';
      span.textContent = String(count);
    }
  }

  function renderFlags(flags) {
    if (!flags.length) {
      setBody(h('div', { style: 'padding:40px 20px; text-align:center; color:#95a5a6; font-style:italic;' }, 'No flags in this view.'));
      return;
    }

    const table = h('table', { style: 'width:100%; border-collapse:collapse; font-size:0.9em;' });
    table.appendChild(h('thead', null,
      h('tr', { style: 'background:#f8f9fa; color:#2c3e50;' }, [
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Flagged'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Student'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Turn excerpt'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Reason'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Flagged by'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, ''),
      ])
    ));
    const tbody = h('tbody');
    flags.forEach((f) => {
      const row = h('tr', {
        style: 'cursor:pointer; transition:background 0.12s ease;',
        tabindex: '0',
        'data-student-id': (f.studentId && f.studentId._id) || f.studentId || '',
        'data-conversation-id': f.conversationId || '',
        title: 'Open transcript',
      });
      row.addEventListener('mouseenter', () => { row.style.background = '#f5faf7'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      const open = () => {
        if (window.TranscriptViewer && typeof window.TranscriptViewer.open === 'function') {
          window.TranscriptViewer.open(row.dataset.studentId, row.dataset.conversationId, { role: 'admin', triggerEl: row });
        }
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });

      const createdAt = f.createdAt ? new Date(f.createdAt).toLocaleString() : '';
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; white-space:nowrap; color:#5B6876;' }, createdAt));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1;' }, nameOf(f.studentId)));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; color:#2c3e50;' }, snippetOf(f) || '—'));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; color:#5B6876; font-style: italic;' }, f.reason || '—'));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; color:#5B6876;' },
        `${nameOf(f.flaggedBy)} (${f.flaggedByRole || '?'})`));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1;' }, [
        h('span', { style: 'color:#16a085; font-size:0.85em;' }, [
          h('i', { className: 'fas fa-external-link-alt' }),
        ]),
      ]));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    setBody(table);
  }

  async function pollOpenCount() {
    try {
      const res = await fetch('/api/transcript-flags?status=open&limit=500', { credentials: 'include' });
      if (!res.ok) return;
      const { flags } = await res.json();
      updateButtonCount((flags || []).length);
    } catch { /* ignore */ }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Only run on the admin dashboard. The auth check in admin-dashboard.js
    // redirects non-admins away before this runs, but guard just in case the
    // script loads elsewhere.
    if (!document.getElementById('main-content')) return;
    ensureButton();
    // Background poll so the badge reflects open count without opening the modal.
    pollOpenCount();
  });

  window.AdminTranscriptFlags = { open: openModal, close: closeModal, refresh: loadFlags };
})();
