/**
 * teacher-transcripts.js
 *
 * Opens a read-only, Messages-app-style transcript viewer for a single
 * conversation. Teachers can audit tutor turns turn-by-turn. Each tutor turn
 * can render an adjacent "reasoning trace" column once the permission
 * architecture (see docs/PERMISSION_ARCHITECTURE_SPEC.md §6) populates
 * conversation.reasoningTrace[]. Until then, the column renders a placeholder.
 *
 * Entry point: window.TranscriptViewer.open(studentId, conversationId, opts)
 *
 * Wire-up: the module auto-delegates clicks from any element with
 * data-conversation-id + data-student-id to open the modal.
 */
(function () {
  'use strict';

  const STATE = {
    modal: null,
    lastTrigger: null,
    showReasoning: false,
    escHandler: null,
    // Flagging context. currentConversationId / currentStudentId are set per
    // open() so the delegated flag handler has what it needs. flaggedTurns
    // tracks turns the reviewer has already flagged in this session so the
    // button reflects state after a successful POST.
    currentConversationId: null,
    currentStudentId: null,
    flaggedTurns: new Set(),
  };

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'className') el.className = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
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

  function ensureModal() {
    if (STATE.modal) return STATE.modal;

    const modal = h('div', {
      id: 'transcript-viewer-modal',
      className: 'modal-overlay transcript-viewer-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'transcript-viewer-title',
    });

    const content = h('div', { className: 'modal-content' }, [
      h('span', {
        id: 'transcript-close-btn',
        className: 'modal-close-button',
        role: 'button',
        'aria-label': 'Close transcript viewer',
        tabindex: '0',
      }, '×'),
      h('div', { className: 'transcript-viewer-header' }, [
        h('h2', { id: 'transcript-viewer-title' }, [
          h('i', { className: 'fas fa-comments' }),
          h('span', { id: 'transcript-viewer-title-text' }, 'Transcript'),
        ]),
        h('div', { className: 'transcript-viewer-meta', id: 'transcript-viewer-meta' }),
      ]),
      h('div', { className: 'transcript-viewer-toolbar' }, [
        h('label', { className: 'transcript-toggle' }, [
          h('input', {
            type: 'checkbox',
            id: 'transcript-reasoning-toggle',
            'aria-label': 'Show reasoning trace',
          }),
          h('span', null, 'Show reasoning trace'),
        ]),
        h('span', { id: 'transcript-count' }, ''),
      ]),
      h('div', { className: 'transcript-viewer-body', id: 'transcript-viewer-body' }, [
        h('div', { className: 'transcript-loading' }, [
          h('i', { className: 'fas fa-spinner fa-spin' }),
          h('span', null, 'Loading transcript…'),
        ]),
      ]),
    ]);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close interactions
    const close = () => closeModal();
    content.querySelector('#transcript-close-btn').addEventListener('click', close);
    content.querySelector('#transcript-close-btn').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Reasoning toggle
    content.querySelector('#transcript-reasoning-toggle').addEventListener('change', (e) => {
      STATE.showReasoning = e.target.checked;
      renderBodyFromCache();
    });

    // Flag clicks (delegated inside the modal body)
    content.querySelector('#transcript-viewer-body').addEventListener('click', (e) => {
      const btn = e.target.closest('.transcript-flag-btn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      handleFlagClick(btn);
    });

    STATE.modal = modal;
    return modal;
  }

  async function handleFlagClick(btn) {
    const turnIndex = Number(btn.dataset.turnIndex);
    if (!Number.isFinite(turnIndex) || turnIndex < 0) return;
    if (!STATE.currentConversationId) return;

    const reason = window.prompt(
      "Flag this tutor turn. What looks off? (This gets routed to admin review.)",
      ''
    );
    // prompt() returns null if the reviewer cancelled. Empty string is fine —
    // a no-reason flag is still signal.
    if (reason === null) return;

    btn.disabled = true;
    btn.classList.add('is-submitting');
    const label = btn.querySelector('.transcript-flag-label');
    if (label) label.textContent = 'Flagging…';

    try {
      const res = await fetch('/api/transcript-flags', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: STATE.currentConversationId,
          turnIndex,
          reason: (reason || '').trim(),
        }),
      });
      if (!res.ok) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        throw new Error(body?.message || `Flag failed (${res.status})`);
      }
      STATE.flaggedTurns.add(turnIndex);
      btn.classList.remove('is-submitting');
      btn.classList.add('is-flagged');
      btn.title = 'You already flagged this turn';
      btn.setAttribute('aria-label', 'Turn flagged');
      const icon = btn.querySelector('i');
      if (icon) icon.className = 'fas fa-flag-checkered';
      if (label) label.textContent = 'Flagged';
    } catch (err) {
      console.error('[TranscriptViewer] flag failed', err);
      btn.disabled = false;
      btn.classList.remove('is-submitting');
      if (label) label.textContent = 'Flag';
      window.alert(err.message || 'Could not flag this turn.');
    }
  }

  function closeModal() {
    if (!STATE.modal) return;
    STATE.modal.classList.remove('is-visible');
    if (STATE.escHandler) {
      document.removeEventListener('keydown', STATE.escHandler);
      STATE.escHandler = null;
    }
    if (STATE.lastTrigger && typeof STATE.lastTrigger.focus === 'function') {
      STATE.lastTrigger.focus();
    }
  }

  function openModal(triggerEl) {
    const modal = ensureModal();
    STATE.lastTrigger = triggerEl || null;
    modal.classList.add('is-visible');
    STATE.escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', STATE.escHandler);
    // Focus the close button so Esc/Enter works immediately for keyboard users.
    const closeBtn = modal.querySelector('#transcript-close-btn');
    if (closeBtn) closeBtn.focus();
  }

  function setBody(nodeOrHtml) {
    const body = STATE.modal.querySelector('#transcript-viewer-body');
    body.innerHTML = '';
    if (typeof nodeOrHtml === 'string') body.innerHTML = nodeOrHtml;
    else if (nodeOrHtml instanceof Node) body.appendChild(nodeOrHtml);
  }

  let CACHED_PAYLOAD = null;

  function renderBodyFromCache() {
    if (!CACHED_PAYLOAD) return;
    renderPayload(CACHED_PAYLOAD);
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch { return ''; }
  }

  function formatDateOnly(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleDateString(); } catch { return ''; }
  }

  function renderHeader(student, conversation) {
    const titleText = STATE.modal.querySelector('#transcript-viewer-title-text');
    const meta = STATE.modal.querySelector('#transcript-viewer-meta');
    const count = STATE.modal.querySelector('#transcript-count');

    const name = student
      ? [student.firstName, student.lastName].filter(Boolean).join(' ') || student.username || 'Student'
      : 'Student';
    const convoName = conversation.customName || conversation.conversationName || conversation.topic || 'Math session';
    titleText.textContent = `${name} — ${convoName}`;

    meta.innerHTML = '';
    const date = conversation.startDate ? formatDateOnly(conversation.startDate) : '';
    if (date) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-calendar' }), ` ${date}`]));
    }
    if (conversation.activeMinutes != null) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-clock' }), ` ${conversation.activeMinutes} min`]));
    }
    if (conversation.topic) {
      meta.appendChild(h('span', null, [
        h('i', { className: 'fas fa-tag' }),
        ` ${conversation.topicEmoji || ''} ${conversation.topic}`.trim(),
      ]));
    }
    if (conversation.conversationType) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-layer-group' }), ` ${conversation.conversationType}`]));
    }

    const msgs = Array.isArray(conversation.messages) ? conversation.messages : [];
    count.textContent = msgs.length
      ? `${msgs.length} turn${msgs.length === 1 ? '' : 's'}`
      : '';
  }

  function problemResultChip(result) {
    if (!result) return null;
    const label = result === 'correct' ? 'Correct'
      : result === 'incorrect' ? 'Incorrect'
      : result === 'skipped' ? 'Skipped' : result;
    const icon = result === 'correct' ? 'fa-check'
      : result === 'incorrect' ? 'fa-xmark' : 'fa-forward';
    return h('span', { className: `transcript-chip ${result}` }, [
      h('i', { className: `fas ${icon}` }),
      ` ${label}`,
    ]);
  }

  function reactionChip(reaction) {
    if (!reaction) return null;
    return h('span', { className: 'transcript-chip reaction', title: 'Student reaction' }, reaction);
  }

  function renderBubble(msg, idx) {
    // Role → bubble class. The schema allows 'user' | 'assistant' | 'system'.
    // We surface 'system' in a muted style; it's rare but can occur in older
    // conversations (e.g. proactive nudges stored as system messages).
    const role = msg.role === 'user' ? 'student'
      : msg.role === 'assistant' ? 'tutor'
      : 'system';
    const bubble = h('div', { className: `transcript-bubble ${role}` });
    bubble.appendChild(document.createTextNode(msg.content || ''));

    const metaRow = h('div', { className: 'transcript-bubble-meta' });
    const chips = [];
    if (role === 'tutor' && msg.problemResult) chips.push(problemResultChip(msg.problemResult));
    if (msg.reaction) chips.push(reactionChip(msg.reaction));
    chips.filter(Boolean).forEach(c => metaRow.appendChild(c));
    if (msg.timestamp) {
      metaRow.appendChild(h('span', { title: new Date(msg.timestamp).toISOString() }, formatTimestamp(msg.timestamp)));
    }
    // Flag affordance — tutor turns only. The backend enforces that too, but
    // hiding the button on student turns matches the product intent: the
    // reviewer is auditing what the tutor said, not the student.
    if (role === 'tutor') {
      const already = STATE.flaggedTurns.has(idx);
      const flagBtn = h('button', {
        type: 'button',
        className: `transcript-flag-btn${already ? ' is-flagged' : ''}`,
        'data-turn-index': String(idx),
        'aria-label': already ? 'Turn flagged' : 'Flag this moment',
        title: already ? 'You already flagged this turn' : 'Flag this moment',
        disabled: already,
      }, [
        h('i', { className: `fas ${already ? 'fa-flag-checkered' : 'fa-flag'}` }),
        h('span', { className: 'transcript-flag-label' }, already ? 'Flagged' : 'Flag'),
      ]);
      metaRow.appendChild(flagBtn);
    }
    if (metaRow.childNodes.length > 0) bubble.appendChild(metaRow);
    return bubble;
  }

  function renderReasoningCell(msg, trace) {
    // Reasoning is a tutor-turn concept; no reasoning for student turns.
    if (msg.role !== 'assistant') return h('div');

    const cell = h('div', { className: 'transcript-reasoning' }, [
      h('div', { className: 'transcript-reasoning-header' }, [
        h('i', { className: 'fas fa-diagram-project' }),
        h('span', null, 'Pipeline rationale'),
      ]),
    ]);

    if (!trace || (!trace.rationale && !trace.state && !trace.action)) {
      cell.appendChild(h('div', { className: 'transcript-reasoning-placeholder' },
        'Reasoning data coming soon — this column will show the pipeline state, chosen action, and rationale once the permission architecture ships.'));
      return cell;
    }

    const rows = [
      ['State', trace.state],
      ['Action', trace.action],
      ['Pattern', trace.utterance_pattern || trace.pattern],
      ['Goal', trace.goal_link || trace.goalLink],
      ['Rationale', trace.rationale],
    ];
    rows.forEach(([label, value]) => {
      if (!value) return;
      cell.appendChild(h('div', { className: 'transcript-reasoning-row' }, [
        h('strong', null, `${label}:`),
        h('span', null, String(value)),
      ]));
    });

    return cell;
  }

  function indexReasoningByTurn(traceArray) {
    const map = new Map();
    if (!Array.isArray(traceArray)) return map;
    traceArray.forEach((t) => {
      if (typeof t?.turn === 'number') map.set(t.turn, t);
    });
    return map;
  }

  function renderPayload(payload) {
    const { student, conversation } = payload;
    renderHeader(student, conversation);

    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    if (messages.length === 0) {
      setBody(h('div', { className: 'transcript-empty' }, 'This conversation has no messages.'));
      return;
    }

    const reasoningByTurn = indexReasoningByTurn(conversation.reasoningTrace);
    const container = h('div', { className: 'transcript-timeline' });

    // assistantTurnCounter: reasoningTrace is written once per tutor turn
    // (per spec §6), not per message, so trace[n] maps to the n-th assistant
    // message. We also tolerate trace entries keyed by absolute message index
    // via indexReasoningByTurn (whichever the pipeline ends up using).
    let assistantTurnCounter = -1;

    messages.forEach((msg, idx) => {
      if (msg.role === 'assistant') assistantTurnCounter += 1;

      const showReasoningForTurn = STATE.showReasoning && msg.role === 'assistant';
      const turnRow = h('div', {
        className: `transcript-turn${showReasoningForTurn ? ' with-reasoning' : ''}`,
        role: 'listitem',
        'data-turn-index': String(idx),
      });
      turnRow.appendChild(renderBubble(msg, idx));
      if (showReasoningForTurn) {
        const trace = reasoningByTurn.get(idx) || reasoningByTurn.get(assistantTurnCounter);
        turnRow.appendChild(renderReasoningCell(msg, trace));
      }
      container.appendChild(turnRow);
    });

    setBody(container);

    // If the caller asked us to focus a specific turn (e.g. admin opened this
    // transcript from a flag), scroll it into view and briefly highlight so
    // the reviewer's eye lands on the right place.
    if (STATE.pendingScrollTurnIndex != null) {
      const idx = STATE.pendingScrollTurnIndex;
      STATE.pendingScrollTurnIndex = null;
      // Defer to the next frame so the body has laid out before we scroll.
      requestAnimationFrame(() => {
        const target = container.querySelector(`.transcript-turn[data-turn-index="${idx}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('transcript-turn-highlight');
        setTimeout(() => target.classList.remove('transcript-turn-highlight'), 2200);
      });
    }
  }

  async function fetchTranscript(studentId, conversationId, { role } = {}) {
    // Admin users share the same viewer but hit the admin endpoint so that
    // access is logged under administrative_oversight rather than
    // teaching_instruction. role is detected from window.currentUser.role in
    // the auto-wiring path below.
    const base = role === 'admin' ? '/api/admin' : '/api/teacher';
    const url = `${base}/students/${encodeURIComponent(studentId)}/conversations/${encodeURIComponent(conversationId)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const err = new Error(body?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return res.json();
  }

  async function open(studentId, conversationId, opts = {}) {
    if (!studentId || !conversationId) {
      console.warn('[TranscriptViewer] open() requires studentId and conversationId');
      return;
    }

    openModal(opts.triggerEl || null);
    setBody(h('div', { className: 'transcript-loading' }, [
      h('i', { className: 'fas fa-spinner fa-spin' }),
      h('span', null, 'Loading transcript…'),
    ]));

    // Reset per-open state
    STATE.showReasoning = false;
    STATE.currentConversationId = conversationId;
    STATE.currentStudentId = studentId;
    STATE.flaggedTurns = new Set();
    STATE.pendingScrollTurnIndex =
      typeof opts.scrollToTurnIndex === 'number' && opts.scrollToTurnIndex >= 0
        ? opts.scrollToTurnIndex
        : null;
    const toggle = STATE.modal.querySelector('#transcript-reasoning-toggle');
    if (toggle) toggle.checked = false;

    try {
      const payload = await fetchTranscript(studentId, conversationId, { role: opts.role });
      CACHED_PAYLOAD = payload;
      renderPayload(payload);
    } catch (err) {
      console.error('[TranscriptViewer] fetch failed', err);
      const msg = err.status === 403
        ? (err.body?.message || 'You are not authorized to view this transcript.')
        : err.status === 404
        ? 'Conversation not found.'
        : 'We couldn\'t load this transcript. Please try again.';
      setBody(h('div', { className: 'transcript-error' }, msg));
    }
  }

  // Auto-delegate clicks from conversation cards. Any element with both
  // data-student-id and data-conversation-id opens the viewer. This keeps the
  // wire-up out of teacher-dashboard.js so the two files stay decoupled.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-conversation-id][data-student-id]');
    if (!trigger) return;
    e.preventDefault();
    const role = (window.currentUser && window.currentUser.role === 'admin') ? 'admin' : 'teacher';
    open(trigger.dataset.studentId, trigger.dataset.conversationId, { role, triggerEl: trigger });
  });

  // Keyboard: allow Enter/Space on focusable conversation cards.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest && e.target.closest('[data-conversation-id][data-student-id]');
    if (!trigger) return;
    // Don't hijack keystrokes inside actual inputs.
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    e.preventDefault();
    trigger.click();
  });

  window.TranscriptViewer = { open, close: closeModal };
})();
