// Live Two-Minute Drill — the "Join" banner on the student chat screen.
//
// When a teacher hosts a live drill for one of their classes (routes/liveDrill.js, `classId`), every
// student enrolled in that class who has Mathmatix open sees this banner: one tap opens /play with
// the code, and play.js joins them with their account — no code, nothing typed.
//
// Deliberately NOT part of the chat page bundles: it is a standalone script, so it needs no
// `npm run build:bundles` and cannot break the chat engine. It polls GET /api/live-drill/mine
// while the tab is visible; that endpoint answers from memory when no class game exists anywhere,
// and tells a non-student to stop asking. The banner paints its own opaque ground, so it reads the
// same on the dark and light chat themes (CLAUDE.md §12).
(function () {
  if (window.__mmLiveDrillBanner) return;
  window.__mmLiveDrillBanner = true;

  const POLL_MS = 20000;
  const DISMISSED = 'mm-live-drill-dismissed';
  let timer = null;
  let stopped = false;
  let el = null;

  const dismissed = () => { try { return JSON.parse(sessionStorage.getItem(DISMISSED) || '[]'); } catch { return []; } };
  const dismiss = (code) => {
    try { sessionStorage.setItem(DISMISSED, JSON.stringify([...dismissed(), code].slice(-20))); } catch { /* private mode */ }
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function styles() {
    if (document.getElementById('mm-ld-banner-css')) return;
    const css = document.createElement('style');
    css.id = 'mm-ld-banner-css';
    css.textContent = `
      .mm-ld-banner{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:10000;
        width:min(560px,calc(100vw - 24px));display:flex;align-items:center;gap:12px;
        background:#0b1a22;color:#eef3ec;border:2px solid #ffb547;border-radius:12px;
        padding:10px 12px 10px 14px;box-shadow:0 10px 30px rgba(0,0,0,.45);
        font:500 15px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;animation:mmLdIn .3s ease both}
      .mm-ld-banner .ball{flex:none;font-size:22px}
      .mm-ld-banner .txt{flex:1 1 auto;min-width:0}
      .mm-ld-banner .txt b{color:#ffb547}
      .mm-ld-banner .sub{display:block;color:#9fb3b5;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .mm-ld-banner a.join{flex:none;background:#ffb547;color:#14212a;text-decoration:none;font-weight:800;
        border-radius:8px;padding:9px 16px;letter-spacing:.02em}
      .mm-ld-banner a.join:focus-visible,.mm-ld-banner button:focus-visible{outline:3px solid #fff;outline-offset:2px}
      .mm-ld-banner button{flex:none;background:transparent;border:0;color:#9fb3b5;font-size:20px;line-height:1;
        padding:4px 6px;cursor:pointer}
      @keyframes mmLdIn{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
      @media (prefers-reduced-motion:reduce){.mm-ld-banner{animation:none}}`;
    document.head.appendChild(css);
  }

  function render(games) {
    const skip = dismissed();
    const g = (games || []).find((x) => !skip.includes(x.code));
    if (!g) { if (el) { el.remove(); el = null; } return; }
    if (el && el.dataset.code === g.code) return;
    styles();
    if (!el) {
      el = document.createElement('div');
      el.className = 'mm-ld-banner';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.dataset.code = g.code;
    const who = g.hostName ? `${esc(g.hostName)} started` : 'Your class started';
    const what = g.mode === 'huddle' ? 'Huddle' : g.mode === 'hill' ? 'King of the Hill' : 'Team Drive';
    el.innerHTML = `<span class="ball" aria-hidden="true">🏈</span>
      <span class="txt">${who} a <b>Two-Minute Drill</b>
        <span class="sub">${esc(g.className || g.drillTitle)} · ${esc(g.playbookName)} · ${what}</span></span>
      <a class="join" href="/play?code=${encodeURIComponent(g.code)}" target="_blank" rel="noopener">Join</a>
      <button type="button" aria-label="Dismiss">×</button>`;
    el.querySelector('a.join').addEventListener('click', () => { dismiss(g.code); setTimeout(() => render(games), 0); });
    el.querySelector('button').addEventListener('click', () => { dismiss(g.code); render(games); });
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
        const res = await fetch('/api/live-drill/mine', { credentials: 'same-origin', cache: 'no-store' });
        if (res.status === 401 || res.status === 403) return stop();
        if (res.ok) {
          const body = await res.json();
          if (!body.student) return stop();
          render(body.games);
        }
      } catch { /* offline for a moment — try again next tick */ }
    }
    timer = setTimeout(poll, POLL_MS);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && !stopped) poll(); });
  window.addEventListener('session-expired', stop);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => poll());
  else poll();
})();
