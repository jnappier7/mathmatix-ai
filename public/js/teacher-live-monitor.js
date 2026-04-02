// public/js/teacher-live-monitor.js
// Teacher dashboard module for the Live Class Monitor tab.
// Renders a real-time grid of student statuses, violation badges,
// and a "spy" modal for observing individual students.

(function () {
  'use strict';

  let monitorState = {
    eventSource: null,
    currentClassId: null,
    isLocked: false,
    sessionId: null,
    students: [],
    spyModal: null,
    spyInterval: null,
    selectedStudentId: null
  };

  // ─── INITIALIZATION ─────────────────────────────────────────────────────────

  function initMonitorTab() {
    const monitorTab = document.getElementById('monitor-tab');
    if (!monitorTab) return;

    // Populate class selector
    populateClassSelector();

    // Bind control buttons
    const activateBtn = document.getElementById('monitor-activate-btn');
    const deactivateBtn = document.getElementById('monitor-deactivate-btn');
    const classSelect = document.getElementById('monitor-class-select');

    if (activateBtn) activateBtn.addEventListener('click', activateLock);
    if (deactivateBtn) deactivateBtn.addEventListener('click', deactivateLock);
    if (classSelect) classSelect.addEventListener('change', onClassChange);
  }

  async function populateClassSelector() {
    const select = document.getElementById('monitor-class-select');
    if (!select) return;

    try {
      const res = await csrfFetch('/api/teacher/classes');
      if (!res.ok) return;

      const classes = await res.json();
      select.innerHTML = '<option value="">-- Select a class --</option>';

      for (const cls of classes) {
        const opt = document.createElement('option');
        opt.value = cls._id;
        opt.textContent = `${cls.className} (${cls.enrolledStudents?.length || 0} students)`;
        select.appendChild(opt);
      }
    } catch (e) {
      console.error('[Monitor] Failed to load classes:', e);
    }
  }

  async function onClassChange() {
    const classId = document.getElementById('monitor-class-select')?.value;
    if (!classId) {
      stopStream();
      renderEmptyGrid();
      return;
    }

    monitorState.currentClassId = classId;

    // Check if there's an active lock session
    try {
      const res = await csrfFetch(`/api/browser-lock/status/${classId}`);
      const data = await res.json();
      monitorState.isLocked = data.locked;
      monitorState.sessionId = data.sessionId || null;
      updateLockControls();
    } catch (e) {
      console.error('[Monitor] Failed to check status:', e);
    }

    // Start live stream
    startStream(classId);
  }

  // ─── LOCK CONTROLS ────────────────────────────────────────────────────────

  async function activateLock() {
    const classId = monitorState.currentClassId;
    if (!classId) {
      showMonitorToast('Please select a class first.', 'warning');
      return;
    }

    // Gather settings from the UI
    const settings = {
      enforceFullscreen: document.getElementById('lock-enforce-fullscreen')?.checked || false,
      blockNavigation: document.getElementById('lock-block-navigation')?.checked !== false,
      trackTabSwitches: document.getElementById('lock-track-tabs')?.checked !== false,
      showWarningOnViolation: true,
      maxViolationsBeforeAlert: parseInt(document.getElementById('lock-max-violations')?.value) || 3,
      lockMessage: document.getElementById('lock-message')?.value || 'Your teacher has enabled focus mode. Please stay on this page.'
    };

    const sessionName = document.getElementById('lock-session-name')?.value || '';

    try {
      const res = await csrfFetch('/api/browser-lock/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, sessionName, settings })
      });

      const data = await res.json();
      if (data.success) {
        monitorState.isLocked = true;
        monitorState.sessionId = data.sessionId;
        updateLockControls();
        showMonitorToast(`Focus mode activated! ${data.studentCount} students affected.`, 'success');
      } else {
        showMonitorToast(data.message || 'Failed to activate.', 'error');
      }
    } catch (e) {
      showMonitorToast('Failed to activate focus mode.', 'error');
    }
  }

  async function deactivateLock() {
    try {
      const res = await csrfFetch('/api/browser-lock/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: monitorState.currentClassId,
          sessionId: monitorState.sessionId
        })
      });

      const data = await res.json();
      if (data.success) {
        monitorState.isLocked = false;
        monitorState.sessionId = null;
        updateLockControls();

        const summary = data.summary;
        showMonitorToast(
          `Focus mode ended. Duration: ${summary.duration}min, Violations: ${summary.totalViolations}`,
          'info'
        );
      }
    } catch (e) {
      showMonitorToast('Failed to deactivate.', 'error');
    }
  }

  function updateLockControls() {
    const activateBtn = document.getElementById('monitor-activate-btn');
    const deactivateBtn = document.getElementById('monitor-deactivate-btn');
    const lockStatus = document.getElementById('monitor-lock-status');
    const settingsPanel = document.getElementById('lock-settings-panel');

    if (activateBtn) activateBtn.style.display = monitorState.isLocked ? 'none' : '';
    if (deactivateBtn) deactivateBtn.style.display = monitorState.isLocked ? '' : 'none';
    if (lockStatus) {
      lockStatus.textContent = monitorState.isLocked ? 'FOCUS MODE ACTIVE' : 'Focus mode off';
      lockStatus.className = monitorState.isLocked
        ? 'monitor-lock-status active'
        : 'monitor-lock-status inactive';
    }
    if (settingsPanel) {
      settingsPanel.style.display = monitorState.isLocked ? 'none' : '';
    }
  }

  // ─── SSE LIVE STREAM ──────────────────────────────────────────────────────

  function startStream(classId) {
    stopStream();

    monitorState.eventSource = new EventSource(
      `/api/browser-lock/monitor/stream?classId=${encodeURIComponent(classId)}`
    );

    monitorState.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        monitorState.students = data.students || [];
        monitorState.isLocked = data.locked;
        monitorState.sessionId = data.sessionId || null;
        updateLockControls();
        renderStudentGrid(data);
      } catch (e) {
        console.error('[Monitor] Failed to parse SSE data:', e);
      }
    };

    monitorState.eventSource.onerror = () => {
      console.warn('[Monitor] SSE connection lost, will retry...');
    };
  }

  function stopStream() {
    if (monitorState.eventSource) {
      monitorState.eventSource.close();
      monitorState.eventSource = null;
    }
  }

  // ─── STUDENT GRID RENDERING ────────────────────────────────────────────────

  function renderStudentGrid(data) {
    const grid = document.getElementById('monitor-student-grid');
    if (!grid) return;

    const students = data.students || [];

    if (students.length === 0) {
      grid.innerHTML = `
        <div class="monitor-empty">
          <i class="fas fa-users-slash"></i>
          <p>No students enrolled in this class.</p>
        </div>
      `;
      return;
    }

    // Sort: active first, then by name
    const statusOrder = { active: 0, idle: 1, 'tab-away': 2, 'off-task': 3, disconnected: 4, offline: 5 };
    students.sort((a, b) => (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5)
      || a.name.localeCompare(b.name));

    grid.innerHTML = students.map(s => renderStudentCard(s)).join('');

    // Bind click handlers for spy mode
    grid.querySelectorAll('.monitor-student-card').forEach(card => {
      card.addEventListener('click', () => {
        const studentId = card.dataset.studentId;
        openSpyModal(studentId);
      });
    });

    // Update summary counters
    const activeCount = students.filter(s => s.status === 'active').length;
    const awayCount = students.filter(s => ['tab-away', 'off-task', 'window-blur'].includes(s.status)).length;
    const offlineCount = students.filter(s => ['disconnected', 'offline'].includes(s.status)).length;

    const counterEl = document.getElementById('monitor-counters');
    if (counterEl) {
      counterEl.innerHTML = `
        <span class="counter-chip active"><i class="fas fa-circle"></i> ${activeCount} Active</span>
        <span class="counter-chip away"><i class="fas fa-eye-slash"></i> ${awayCount} Away</span>
        <span class="counter-chip offline"><i class="fas fa-plug"></i> ${offlineCount} Offline</span>
        <span class="counter-chip violations"><i class="fas fa-exclamation-triangle"></i> ${data.totalViolations || 0} Violations</span>
      `;
    }
  }

  function renderStudentCard(student) {
    const statusIcons = {
      active: '<i class="fas fa-circle" style="color:#16C86D"></i>',
      idle: '<i class="fas fa-circle" style="color:#f39c12"></i>',
      'tab-away': '<i class="fas fa-eye-slash" style="color:#e74c3c"></i>',
      'off-task': '<i class="fas fa-exclamation-circle" style="color:#e74c3c"></i>',
      disconnected: '<i class="fas fa-plug" style="color:#95a5a6"></i>',
      offline: '<i class="fas fa-circle" style="color:#bdc3c7"></i>'
    };

    const statusLabels = {
      active: 'Active',
      idle: 'Idle',
      'tab-away': 'Tab Away',
      'off-task': 'Off Task',
      disconnected: 'Disconnected',
      offline: 'Offline'
    };

    const violationBadge = student.violationCount > 0
      ? `<span class="violation-badge ${student.violationCount >= 3 ? 'critical' : ''}">${student.violationCount}</span>`
      : '';

    const fullscreenIcon = student.isFullscreen
      ? '<i class="fas fa-expand" title="In fullscreen" style="color:#16C86D; margin-left:4px;"></i>'
      : '';

    const initials = student.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    return `
      <div class="monitor-student-card status-${student.status}" data-student-id="${student.studentId}" title="Click to view details">
        <div class="card-header">
          <div class="student-avatar">${initials}</div>
          <div class="student-info">
            <div class="student-name">${escapeHtml(student.name)} ${violationBadge} ${fullscreenIcon}</div>
            <div class="student-status">${statusIcons[student.status] || ''} ${statusLabels[student.status] || student.status}</div>
          </div>
        </div>
        <div class="card-body">
          ${student.currentActivity
            ? `<div class="activity-label"><i class="fas fa-book-open"></i> ${escapeHtml(student.currentActivity)}</div>`
            : '<div class="activity-label muted">No activity detected</div>'}
          ${student.lastMessagePreview
            ? `<div class="message-preview"><i class="fas fa-comment"></i> "${escapeHtml(student.lastMessagePreview.substring(0, 60))}${student.lastMessagePreview.length > 60 ? '...' : ''}"</div>`
            : ''}
          ${student.problemsAttempted > 0
            ? `<div class="progress-label"><i class="fas fa-check-circle"></i> ${student.problemsCorrect}/${student.problemsAttempted} problems</div>`
            : ''}
        </div>
        ${student.lastViolation
          ? `<div class="card-violation"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(student.lastViolation.type)} - ${timeAgo(student.lastViolation.timestamp)}</div>`
          : ''}
      </div>
    `;
  }

  function renderEmptyGrid() {
    const grid = document.getElementById('monitor-student-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="monitor-empty">
          <i class="fas fa-desktop"></i>
          <p>Select a class to start monitoring.</p>
        </div>
      `;
    }
  }

  // ─── SPY MODAL ─────────────────────────────────────────────────────────────

  async function openSpyModal(studentId) {
    monitorState.selectedStudentId = studentId;

    const modal = document.getElementById('spy-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    modal.querySelector('.spy-content').innerHTML = '<div class="spy-loading"><i class="fas fa-spinner fa-spin"></i> Loading student view...</div>';

    await refreshSpyData(studentId);

    // Auto-refresh every 5 seconds
    monitorState.spyInterval = setInterval(() => refreshSpyData(studentId), 5000);

    // Close button
    modal.querySelector('.spy-close')?.addEventListener('click', closeSpyModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSpyModal();
    });
  }

  function closeSpyModal() {
    const modal = document.getElementById('spy-modal');
    if (modal) modal.style.display = 'none';

    if (monitorState.spyInterval) {
      clearInterval(monitorState.spyInterval);
      monitorState.spyInterval = null;
    }
    monitorState.selectedStudentId = null;
  }

  async function refreshSpyData(studentId) {
    try {
      const res = await csrfFetch(`/api/browser-lock/monitor/spy/${studentId}`);
      if (!res.ok) return;

      const data = await res.json();
      renderSpyModal(data);
    } catch (e) {
      console.error('[Monitor] Failed to fetch spy data:', e);
    }
  }

  function renderSpyModal(data) {
    const content = document.querySelector('#spy-modal .spy-content');
    if (!content) return;

    const student = data.student;
    const status = data.status;
    const convo = data.conversation;
    const messages = data.recentMessages || [];
    const violations = data.violations || [];

    content.innerHTML = `
      <div class="spy-header">
        <div class="spy-student-info">
          <h3><i class="fas fa-user-graduate"></i> ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName || '')}</h3>
          <div class="spy-meta">
            <span><i class="fas fa-graduation-cap"></i> Grade ${escapeHtml(student.gradeLevel || 'N/A')}</span>
            <span><i class="fas fa-book"></i> ${escapeHtml(student.mathCourse || 'N/A')}</span>
            <span><i class="fas fa-star"></i> Level ${student.level || 1}</span>
          </div>
        </div>
        <div class="spy-status-badge status-${status.status || 'offline'}">
          ${status.status || 'offline'}
        </div>
      </div>

      ${convo ? `
        <div class="spy-session-info">
          <h4><i class="fas fa-comments"></i> Active Session</h4>
          <div class="spy-session-meta">
            <span><strong>Topic:</strong> ${escapeHtml(convo.topic || 'General')}</span>
            <span><strong>Duration:</strong> ${convo.duration || 0} min</span>
            <span><strong>Problems:</strong> ${convo.problemsCorrect || 0}/${convo.problemsAttempted || 0}</span>
          </div>
          ${convo.summary ? `<div class="spy-summary">${escapeHtml(convo.summary)}</div>` : ''}
        </div>
      ` : '<div class="spy-no-session"><i class="fas fa-info-circle"></i> No active tutoring session</div>'}

      <div class="spy-chat-feed">
        <h4><i class="fas fa-stream"></i> Live Chat Feed</h4>
        <div class="spy-messages">
          ${messages.length > 0 ? messages.map(m => `
            <div class="spy-message ${m.role}">
              <span class="spy-message-role">${m.role === 'user' ? '<i class="fas fa-user"></i> Student' : '<i class="fas fa-robot"></i> Tutor'}</span>
              <span class="spy-message-time">${formatTime(m.timestamp)}</span>
              <div class="spy-message-text">${escapeHtml(m.content)}</div>
            </div>
          `).join('') : '<div class="spy-empty">No messages yet in this session.</div>'}
        </div>
      </div>

      ${violations.length > 0 ? `
        <div class="spy-violations">
          <h4><i class="fas fa-exclamation-triangle"></i> Violations (${violations.length})</h4>
          <div class="spy-violations-list">
            ${violations.map(v => `
              <div class="spy-violation-item">
                <span class="violation-type">${escapeHtml(v.type)}</span>
                <span class="violation-time">${formatTime(v.timestamp)}</span>
                ${v.details ? `<span class="violation-detail">${escapeHtml(v.details)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const seconds = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function showMonitorToast(message, type) {
    const container = document.getElementById('monitor-toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = `monitor-toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i> ${escapeHtml(message)}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ─── INIT ON TAB ACTIVATION ────────────────────────────────────────────────

  // Lazy-load when the monitor tab is first clicked
  let monitorInitialized = false;

  document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      if (btn.dataset.tab === 'monitor') {
        btn.addEventListener('click', () => {
          if (!monitorInitialized) {
            monitorInitialized = true;
            initMonitorTab();
          }
        });
      }
    });
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopStream();
    if (monitorState.spyInterval) clearInterval(monitorState.spyInterval);
  });
})();
