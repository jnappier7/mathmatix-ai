// public/js/contact-support.js
// Frontend logic for AI-backed contact/support page

(function () {
  'use strict';

  // ── State ────────────────────────────────────────
  let currentTicketId = null;

  // ── DOM refs ─────────────────────────────────────
  const btnNewTicket = document.getElementById('btn-new-ticket');
  const btnMyTickets = document.getElementById('btn-my-tickets');

  const sectionNewTicket = document.getElementById('section-new-ticket');
  const sectionAiResponse = document.getElementById('section-ai-response');
  const sectionMyTickets = document.getElementById('section-my-tickets');
  const sectionTicketDetail = document.getElementById('section-ticket-detail');

  const ticketForm = document.getElementById('ticket-form');
  const submitBtn = document.getElementById('submit-ticket-btn');
  const subjectInput = document.getElementById('ticket-subject');
  const descInput = document.getElementById('ticket-description');
  const subjectCount = document.getElementById('subject-count');
  const descCount = document.getElementById('desc-count');

  const aiStatusBadge = document.getElementById('ai-status-badge');
  const aiResponseText = document.getElementById('ai-response-text');
  const aiResponseActions = document.getElementById('ai-response-actions');

  const followupSection = document.getElementById('followup-section');
  const ticketThread = document.getElementById('ticket-thread');
  const followupInput = document.getElementById('followup-input');
  const sendFollowupBtn = document.getElementById('send-followup-btn');

  const ticketsList = document.getElementById('tickets-list');
  const ticketDetailContent = document.getElementById('ticket-detail-content');
  const detailTitle = document.getElementById('detail-title');

  // ── Section toggling ─────────────────────────────
  function hideAllSections() {
    [sectionNewTicket, sectionAiResponse, sectionMyTickets, sectionTicketDetail].forEach(s => {
      s.style.display = 'none';
    });
  }

  function showSection(section) {
    hideAllSections();
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Button handlers ──────────────────────────────
  btnNewTicket.addEventListener('click', () => {
    showSection(sectionNewTicket);
    ticketForm.reset();
  });

  btnMyTickets.addEventListener('click', () => {
    showSection(sectionMyTickets);
    loadMyTickets();
  });

  // Close buttons
  document.getElementById('close-new-ticket').addEventListener('click', () => hideAllSections());
  document.getElementById('close-ai-response').addEventListener('click', () => hideAllSections());
  document.getElementById('close-my-tickets').addEventListener('click', () => hideAllSections());
  document.getElementById('close-ticket-detail').addEventListener('click', () => {
    hideAllSections();
    // Go back to ticket list if it was open
    if (sectionMyTickets.dataset.wasOpen === 'true') {
      showSection(sectionMyTickets);
    }
  });

  // ── Character counters ───────────────────────────
  subjectInput.addEventListener('input', () => {
    subjectCount.textContent = subjectInput.value.length;
  });
  descInput.addEventListener('input', () => {
    descCount.textContent = descInput.value.length;
  });

  // ── Submit ticket ────────────────────────────────
  ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const category = document.getElementById('ticket-category').value;
    const subject = subjectInput.value.trim();
    const description = descInput.value.trim();

    if (!category || !subject || !description) return;

    // Disable form
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

    try {
      const res = await csrfFetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subject,
          description,
          pageUrl: document.referrer || window.location.href
        })
      });

      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Failed to submit ticket.', 'error');
        return;
      }

      currentTicketId = data.ticket._id;

      // Show AI response
      showSection(sectionAiResponse);
      renderAiResponse(data.ticket);

    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Ticket';
    }
  });

  // ── Render AI response ───────────────────────────
  function renderAiResponse(ticket) {
    const handled = ticket.aiTriage?.handled;

    // Status badge
    if (handled) {
      aiStatusBadge.className = 'ai-response-status status-resolved';
      aiStatusBadge.innerHTML = '<i class="fas fa-check-circle"></i> AI Assistant resolved this';
    } else {
      aiStatusBadge.className = 'ai-response-status status-escalated';
      aiStatusBadge.innerHTML = '<i class="fas fa-user-tie"></i> Escalated to support team';
    }

    // Response text
    aiResponseText.textContent = ticket.aiTriage?.response || '';

    // Action buttons
    aiResponseActions.innerHTML = '';

    if (handled) {
      // User can mark as resolved or escalate
      const resolvedBtn = createBtn('That helped, thanks!', 'fas fa-thumbs-up', () => {
        showToast('Glad we could help!', 'success');
        hideAllSections();
      });

      const escalateBtn = createBtn("I still need help", 'fas fa-headset', () => {
        reopenTicket(ticket._id);
      }, 'btn-outline-danger');

      aiResponseActions.appendChild(resolvedBtn);
      aiResponseActions.appendChild(escalateBtn);

      // Show follow-up conversation
      followupSection.style.display = 'block';
      ticketThread.innerHTML = '';
    } else {
      // Escalated — just acknowledge
      const okBtn = createBtn('Got it', 'fas fa-check', () => {
        hideAllSections();
      });
      aiResponseActions.appendChild(okBtn);
      followupSection.style.display = 'none';
    }
  }

  function createBtn(text, iconClass, onClick, extraClass) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (extraClass ? ' ' + extraClass : '');
    btn.innerHTML = `<i class="${iconClass}"></i> ${text}`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ── Reopen / escalate ticket ─────────────────────
  async function reopenTicket(ticketId) {
    try {
      const res = await csrfFetch(`/api/support/tickets/${ticketId}/reopen`, {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success) {
        aiStatusBadge.className = 'ai-response-status status-escalated';
        aiStatusBadge.innerHTML = '<i class="fas fa-user-tie"></i> Escalated to support team';
        showToast("We've escalated this to our team. Someone will follow up.", 'success');
        followupSection.style.display = 'none';
        aiResponseActions.innerHTML = '';
        const okBtn = createBtn('Got it', 'fas fa-check', () => hideAllSections());
        aiResponseActions.appendChild(okBtn);
      } else {
        showToast(data.message || 'Failed to escalate.', 'error');
      }
    } catch (err) {
      showToast('Network error.', 'error');
    }
  }

  // ── Follow-up messages ───────────────────────────
  sendFollowupBtn.addEventListener('click', sendFollowUp);
  followupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFollowUp();
    }
  });

  async function sendFollowUp() {
    const content = followupInput.value.trim();
    if (!content || !currentTicketId) return;

    sendFollowupBtn.disabled = true;
    followupInput.value = '';

    // Show user message immediately
    appendThreadMessage('user', content);

    // Show typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'thread-message msg-ai ai-thinking';
    typingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI is thinking...';
    ticketThread.appendChild(typingEl);
    ticketThread.scrollTop = ticketThread.scrollHeight;

    try {
      const res = await csrfFetch(`/api/support/tickets/${currentTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      const data = await res.json();
      typingEl.remove();

      if (data.success && data.aiResponse) {
        appendThreadMessage('ai', data.aiResponse);

        // If escalated, update status
        if (data.status === 'escalated') {
          aiStatusBadge.className = 'ai-response-status status-escalated';
          aiStatusBadge.innerHTML = '<i class="fas fa-user-tie"></i> Escalated to support team';
          showToast('A team member will follow up on this.', 'success');
        }
      } else if (data.success) {
        appendThreadMessage('ai', 'Your message has been added to the ticket. A team member will respond.');
      } else {
        showToast(data.message || 'Failed to send.', 'error');
      }
    } catch (err) {
      typingEl.remove();
      showToast('Network error.', 'error');
    } finally {
      sendFollowupBtn.disabled = false;
    }
  }

  function appendThreadMessage(sender, content, timestamp) {
    const el = document.createElement('div');
    el.className = `thread-message msg-${sender}`;

    let label = '';
    if (sender === 'ai') label = 'AI Assistant';
    else if (sender === 'admin') label = 'Support Team';
    else label = 'You';

    let timeStr = '';
    if (timestamp) {
      timeStr = `<div class="msg-time">${formatDate(timestamp)}</div>`;
    }

    el.innerHTML = `<div class="msg-label">${label}</div>${escapeHtml(content)}${timeStr}`;
    ticketThread.appendChild(el);
    ticketThread.scrollTop = ticketThread.scrollHeight;
  }

  // ── Load my tickets ──────────────────────────────
  async function loadMyTickets() {
    ticketsList.innerHTML = '<div class="tickets-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
      const res = await fetch('/api/support/tickets/my');
      const data = await res.json();

      if (!data.success || !data.tickets?.length) {
        ticketsList.innerHTML = `
          <div class="tickets-empty">
            <i class="fas fa-ticket"></i>
            No tickets yet. Submit one above if you need help!
          </div>`;
        return;
      }

      ticketsList.innerHTML = '';
      data.tickets.forEach(ticket => {
        const row = document.createElement('div');
        row.className = 'ticket-row';
        row.addEventListener('click', () => viewTicketDetail(ticket._id));

        const iconMap = {
          'how-to': 'fa-circle-question',
          'bug': 'fa-bug',
          'account': 'fa-user-gear',
          'billing': 'fa-credit-card',
          'feature-request': 'fa-lightbulb',
          'data-privacy': 'fa-shield-halved',
          'other': 'fa-ellipsis'
        };

        const statusLabels = {
          'open': 'Open',
          'ai_resolved': 'AI Resolved',
          'escalated': 'With Team',
          'in_progress': 'In Progress',
          'resolved': 'Resolved',
          'closed': 'Closed'
        };

        row.innerHTML = `
          <div class="ticket-row-icon">
            <i class="fas ${iconMap[ticket.category] || 'fa-ticket'}"></i>
          </div>
          <div class="ticket-row-body">
            <div class="ticket-row-subject">${escapeHtml(ticket.subject)}</div>
            <div class="ticket-row-meta">${ticket.category} &middot; ${formatDate(ticket.createdAt)}</div>
          </div>
          <span class="ticket-status-badge badge-${ticket.status}">${statusLabels[ticket.status] || ticket.status}</span>
        `;

        ticketsList.appendChild(row);
      });

    } catch (err) {
      ticketsList.innerHTML = '<div class="tickets-empty">Failed to load tickets.</div>';
    }
  }

  // ── View ticket detail ───────────────────────────
  async function viewTicketDetail(ticketId) {
    sectionMyTickets.dataset.wasOpen = 'true';
    showSection(sectionTicketDetail);
    ticketDetailContent.innerHTML = '<div class="tickets-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();

      if (!data.success) {
        ticketDetailContent.innerHTML = '<div class="tickets-empty">Ticket not found.</div>';
        return;
      }

      const ticket = data.ticket;
      detailTitle.innerHTML = `<i class="fas fa-ticket"></i> ${escapeHtml(ticket.subject)}`;

      const statusLabels = {
        'open': 'Open',
        'ai_resolved': 'AI Resolved',
        'escalated': 'With Team',
        'in_progress': 'In Progress',
        'resolved': 'Resolved',
        'closed': 'Closed'
      };

      ticketDetailContent.innerHTML = `
        <div class="ticket-detail-meta">
          <div class="detail-meta-item">
            <div class="meta-label">Status</div>
            <div class="meta-value"><span class="ticket-status-badge badge-${ticket.status}">${statusLabels[ticket.status] || ticket.status}</span></div>
          </div>
          <div class="detail-meta-item">
            <div class="meta-label">Category</div>
            <div class="meta-value">${ticket.category}</div>
          </div>
          <div class="detail-meta-item">
            <div class="meta-label">Priority</div>
            <div class="meta-value">${ticket.priority}</div>
          </div>
          <div class="detail-meta-item">
            <div class="meta-label">Created</div>
            <div class="meta-value">${formatDate(ticket.createdAt)}</div>
          </div>
        </div>
        <div class="ticket-thread" id="detail-thread"></div>
      `;

      // Render messages
      const thread = document.getElementById('detail-thread');
      if (ticket.messages?.length) {
        ticket.messages.forEach(msg => {
          const el = document.createElement('div');
          el.className = `thread-message msg-${msg.sender}`;

          let label = '';
          if (msg.sender === 'ai') label = 'AI Assistant';
          else if (msg.sender === 'admin') label = 'Support Team';
          else label = 'You';

          el.innerHTML = `
            <div class="msg-label">${label}</div>
            ${escapeHtml(msg.content)}
            <div class="msg-time">${formatDate(msg.createdAt)}</div>
          `;
          thread.appendChild(el);
        });
      }

    } catch (err) {
      ticketDetailContent.innerHTML = '<div class="tickets-empty">Failed to load ticket.</div>';
    }
  }

  // ── Utility: escape HTML ─────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Utility: format date ─────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;

    // Less than 1 minute
    if (diff < 60000) return 'just now';
    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    // Less than 24 hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    // Less than 7 days
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── Utility: toast notifications ─────────────────
  function showToast(message, type) {
    // Use existing showToast if available (from helpers.js), otherwise create simple one
    if (window.showToast) {
      window.showToast(message, type);
      return;
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      padding: 0.75rem 1.5rem; border-radius: 10px; font-size: 0.9rem;
      color: white; z-index: 10000; animation: fadeIn 0.3s ease;
      max-width: 90%; text-align: center;
      background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#333'};
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ── Auth check (redirect if not logged in) ───────
  async function checkAuth() {
    try {
      const res = await fetch('/api/support/tickets/my');
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login.html?redirect=' + encodeURIComponent('/contact-support.html');
      }
    } catch (err) {
      // Network error — let page render, user can still see FAQ / email
    }
  }

  checkAuth();
})();
