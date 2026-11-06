// Work a teacher pushed to the tutor — the alert on the student's chat screen.
//
// When a teacher pushes a resource to the tutor (teacher dashboard → Resources → "push to the
// tutor"; routes/teacherResources.js /assign), every student who can see it gets this banner the
// next time their chat screen polls. ONE tap: the start is recorded for the teacher ("5 of 14
// started"), the file is loaded through the student's own upload path (the same worksheet pipeline
// and no-answer-key guard as a photo they took), and a framing message is sent — so the tutor opens
// on the first problem without the student typing a word. The tutor's greeting may offer the same
// work with a button; whichever the student uses first, the resource is marked started and the
// banner stands down on the next poll.
//
// Deliberately NOT part of the chat page bundles (no `npm run build:bundles`, cannot break the chat
// engine), modelled on live-drill/chat-banner.js. Polls GET /api/teacher-resources/mine/assignments
// while the tab is visible; a non-student is told to stop. Paints its own opaque ground so it reads
// the same on the dark and light chat themes (CLAUDE.md §12).
(function () {
  if (window.__mmAssignmentBanner) return;
  window.__mmAssignmentBanner = true;

  const POLL_MS = 60000;
  const FIRST_POLL_MS = 6000; // let the greeting land first: if it offers the same work, the student sees one thing at a time
  const DISMISSED = 'mm-assignment-dismissed';
  let timer = null;
  let stopped = false;
  let el = null;

  const dismissed = () => { try { return JSON.parse(sessionStorage.getItem(DISMISSED) || '[]'); } catch { return []; } };
  const dismiss = (id) => { try { sessionStorage.setItem(DISMISSED, JSON.stringify([...dismissed(), id].slice(-20))); } catch { /* private mode */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function styles() {
    if (document.getElementById('mm-asg-banner-css')) return;
    const css = document.createElement('style');
    css.id = 'mm-asg-banner-css';
    css.textContent = `
      .mm-asg-banner{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9999;
        width:min(560px,calc(100vw - 24px));display:flex;align-items:center;gap:12px;
        background:#0b1a22;color:#eef3ec;border:2px solid #4cb3ff;border-radius:12px;
        padding:10px 12px 10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.45);
        font:500 15px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;animation:mmAsgIn .3s ease both}
      .mm-asg-banner.below{top:84px} /* under a live-drill banner, if both are up */
      .mm-asg-banner .ico{flex:none;font-size:22px}
      .mm-asg-banner .txt{flex:1 1 auto;min-width:0}
      .mm-asg-banner .txt b{color:#4cb3ff}
      .mm-asg-banner .sub{display:block;color:#9fb3b5;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .mm-asg-banner button.start{flex:none;background:#4cb3ff;color:#14212a;border:0;font:800 15px system-ui,-apple-system,"Segoe UI",sans-serif;
        border-radius:8px;padding:9px 16px;letter-spacing:.02em;cursor:pointer}
      .mm-asg-banner button.start[disabled]{opacity:.6;cursor:default}
      .mm-asg-banner button.x{flex:none;background:transparent;border:0;color:#9fb3b5;font-size:20px;line-height:1;padding:4px 6px;cursor:pointer}
      .mm-asg-banner button:focus-visible{outline:3px solid #fff;outline-offset:2px}
      @keyframes mmAsgIn{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
      @media (prefers-reduced-motion:reduce){.mm-asg-banner{animation:none}}`;
    document.head.appendChild(css);
  }

  const KIND = { test: 'practice test', quiz: 'practice quiz', worksheet: 'worksheet', practice: 'practice set', homework: 'homework', notes: 'notes', handout: 'handout' };

  /** The one tap: record the start, load the file into the chat, send the framing message. */
  async function start(a, btn) {
    btn.disabled = true;
    btn.textContent = 'Opening…';
    dismiss(a.id);
    try {
      if (window.csrfFetch) await window.csrfFetch(`/api/teacher-resources/${encodeURIComponent(a.id)}/start`, { method: 'POST' }).catch(() => {});
      const assessment = a.category === 'test' || a.category === 'quiz';
      const framing = assessment
        ? `My teacher ${a.teacherName} shared "${a.displayName}" — it's a ${KIND[a.category]}. Can you help me get ready for it with similar problems?`
        : `My teacher ${a.teacherName} shared "${a.displayName}" for me to work on with you. Can we start with the first problem?`;
      // The file rides the student's own upload path (OCR, worksheet guard) when the page can load it;
      // the tutor already carries the teacher's note and an excerpt in its prompt either way.
      if (typeof window.fetchAndUploadTeacherResource === 'function') {
        try { await window.fetchAndUploadTeacherResource(a.id, a.displayName); } catch { /* the message alone still names the work */ }
      }
      if (typeof window.mmSendChatMessage === 'function') window.mmSendChatMessage(framing);
    } finally {
      if (el) { el.remove(); el = null; }
    }
  }

  function render(list) {
    const skip = dismissed();
    const a = (list || []).find((x) => !skip.includes(x.id));
    if (!a) { if (el) { el.remove(); el = null; } return; }
    if (el && el.dataset.id === a.id) return;
    styles();
    if (!el) {
      el = document.createElement('div');
      el.className = 'mm-asg-banner';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.classList.toggle('below', !!document.querySelector('.mm-ld-banner'));
    el.dataset.id = a.id;
    const kind = KIND[a.category] || 'assignment';
    const due = a.endsAt ? ` · until ${new Date(a.endsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : '';
    el.innerHTML = `<span class="ico" aria-hidden="true">📄</span>
      <span class="txt">${esc(a.teacherName)} shared <b>${esc(a.displayName)}</b>
        <span class="sub">${esc(a.note || `A ${kind} to work on with your tutor`)}${due}</span></span>
      <button type="button" class="start">Start with tutor</button>
      <button type="button" class="x" aria-label="Not now">×</button>`;
    el.querySelector('button.start').addEventListener('click', () => start(a, el.querySelector('button.start')));
    el.querySelector('button.x').addEventListener('click', () => { dismiss(a.id); render(list); });
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    if (el) { el.remove(); el = null; }
  }

  async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    if (!document.hidden) {
      try {
        const res = await fetch('/api/teacher-resources/mine/assignments', { credentials: 'same-origin', cache: 'no-store' });
        if (res.status === 401 || res.status === 403) return stop();
        if (res.ok) {
          const body = await res.json();
          if (!body.student) return stop();
          render(body.assignments);
        }
      } catch { /* offline for a moment — try again next tick */ }
    }
    timer = setTimeout(poll, POLL_MS);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && !stopped) poll(); });
  window.addEventListener('session-expired', stop);
  timer = setTimeout(poll, FIRST_POLL_MS);
})();
