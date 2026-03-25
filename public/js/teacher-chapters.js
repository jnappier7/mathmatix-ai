// public/js/teacher-chapters.js
// Simple chapter upload UI for textbook mode

(function () {
  'use strict';

  const uploadBtn = document.getElementById('upload-chapter-btn');
  const fileInput = document.getElementById('chapter-file-input');
  const numberInput = document.getElementById('chapter-number-input');
  const titleInput = document.getElementById('chapter-title-input');
  const statusDiv = document.getElementById('chapter-upload-status');
  const listDiv = document.getElementById('chapters-list');

  if (!uploadBtn) return;

  // ── Load existing chapters on page load ──
  loadChapters();

  // ── Upload handler ──
  uploadBtn.addEventListener('click', async function () {
    const file = fileInput.files[0];
    const chapterNumber = numberInput.value;
    const chapterTitle = titleInput.value.trim();

    if (!file) return showStatus('Please select a PDF file.', 'warning');
    if (!chapterTitle) return showStatus('Please enter a chapter title.', 'warning');

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chapterNumber', chapterNumber);
      formData.append('chapterTitle', chapterTitle);
      formData.append('subject', 'biology');

      const res = await csrfFetch('/api/bio/chapters/upload', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        showStatus(`Chapter ${chapterNumber} uploaded! Processing started...`, 'success');
        fileInput.value = '';
        titleInput.value = '';
        numberInput.value = parseInt(chapterNumber) + 1;
        loadChapters();
        // Poll for status updates
        pollStatus();
      } else {
        showStatus(data.message || 'Upload failed.', 'error');
      }
    } catch (err) {
      showStatus('Upload failed: ' + err.message, 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Chapter';
    }
  });

  // ── Load and render chapters list ──
  async function loadChapters() {
    try {
      const res = await csrfFetch('/api/bio/chapters/status', { credentials: 'same-origin' });
      if (!res.ok) {
        listDiv.textContent = 'Failed to load chapters.';
        return;
      }

      const data = await res.json();
      const chapters = data.chapters || [];

      if (chapters.length === 0) {
        listDiv.innerHTML = '<p style="color: var(--color-text-muted);">No chapters uploaded yet. Upload your first chapter above.</p>';
        return;
      }

      listDiv.innerHTML = '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr style="text-align:left;border-bottom:2px solid var(--color-border);">' +
        '<th style="padding:6px 8px;">Ch.</th>' +
        '<th style="padding:6px 8px;">Title</th>' +
        '<th style="padding:6px 8px;">Status</th>' +
        '<th style="padding:6px 8px;">Concepts</th>' +
        '<th style="padding:6px 8px;">Chunks</th>' +
        '<th style="padding:6px 8px;"></th>' +
        '</tr></thead><tbody>' +
        chapters.map(ch => {
          const statusBadge = getStatusBadge(ch.processingStatus);
          return `<tr style="border-bottom:1px solid var(--color-border);">
            <td style="padding:6px 8px;font-weight:600;">${ch.chapterNumber}</td>
            <td style="padding:6px 8px;">${escapeHtml(ch.chapterTitle)}</td>
            <td style="padding:6px 8px;">${statusBadge}</td>
            <td style="padding:6px 8px;">${ch.totalConceptCards || '—'}</td>
            <td style="padding:6px 8px;">${ch.totalChunks || '—'}</td>
            <td style="padding:6px 8px;">
              <button class="btn-delete-chapter" data-id="${ch._id}" title="Delete" style="background:none;border:none;color:var(--color-danger);cursor:pointer;font-size:0.85rem;">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`;
        }).join('') +
        '</tbody></table>';

      // Wire up delete buttons
      listDiv.querySelectorAll('.btn-delete-chapter').forEach(btn => {
        btn.addEventListener('click', async function () {
          if (!confirm('Delete this chapter?')) return;
          const id = this.dataset.id;
          try {
            const res = await csrfFetch(`/api/bio/chapters/${id}`, {
              method: 'DELETE',
              credentials: 'same-origin'
            });
            if (res.ok) loadChapters();
          } catch (err) {
            console.error('Delete failed:', err);
          }
        });
      });

    } catch (err) {
      listDiv.textContent = 'Error loading chapters.';
      console.error('[Chapters] Load failed:', err);
    }
  }

  // ── Poll for processing status ──
  function pollStatus() {
    let polls = 0;
    const interval = setInterval(async () => {
      polls++;
      await loadChapters();
      // Stop polling after 2 minutes or if all chapters are done
      if (polls > 24) clearInterval(interval);
      try {
        const res = await csrfFetch('/api/bio/chapters/status', { credentials: 'same-origin' });
        const data = await res.json();
        const processing = (data.chapters || []).some(c =>
          !['ready', 'failed'].includes(c.processingStatus)
        );
        if (!processing) clearInterval(interval);
      } catch { clearInterval(interval); }
    }, 5000);
  }

  // ── Helpers ──
  function getStatusBadge(status) {
    const map = {
      pending: { color: '#f39c12', icon: 'clock', label: 'Pending' },
      extracting: { color: '#3498db', icon: 'file-pdf', label: 'Extracting text...' },
      'generating-cards': { color: '#9b59b6', icon: 'brain', label: 'Generating concepts...' },
      chunking: { color: '#e67e22', icon: 'puzzle-piece', label: 'Chunking...' },
      embedding: { color: '#1abc9c', icon: 'vector-square', label: 'Embedding...' },
      ready: { color: '#27ae60', icon: 'check-circle', label: 'Ready' },
      failed: { color: '#e74c3c', icon: 'exclamation-circle', label: 'Failed' }
    };
    const s = map[status] || { color: '#999', icon: 'question', label: status };
    return `<span style="color:${s.color};font-size:0.8rem;"><i class="fas fa-${s.icon}"></i> ${s.label}</span>`;
  }

  function showStatus(msg, type) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = type === 'success' ? '#e8f5e9' : type === 'error' ? '#ffebee' : '#fff3e0';
    statusDiv.style.color = type === 'success' ? '#2e7d32' : type === 'error' ? '#c62828' : '#e65100';
    statusDiv.textContent = msg;
    setTimeout(() => { statusDiv.style.display = 'none'; }, 5000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
