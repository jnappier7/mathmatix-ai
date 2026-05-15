/* session-presence.js
 * Tutor presence rail + lightweight context rail + session opener.
 * Surgical addition: injects new DOM, observes the existing chat container.
 * Does NOT modify script.js, the chat backend, or any in-flight files.
 *
 * Public entry: auto-runs on DOMContentLoaded.
 */
(function () {
  'use strict';

  // Tutor → CSS theme key (matches body[data-tutor="..."] in session-atmosphere.css)
  const THEME_KEYS = {
    maya: 'maya',
    'mr-nappier': 'mr-nappier',
    bob: 'bob',
    'ms-maria': 'ms-maria',
  };

  const IDLE_MS = 700;

  let observer = null;
  let idleTimer = null;
  let presenceEl = null;
  let contextEl = null;
  let openerEl = null;
  let stateEl = null;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function setTutorState(state) {
    document.body.dataset.tutorState = state;
    if (!stateEl) return;
    const label = {
      idle: 'here with you',
      thinking: 'thinking…',
      speaking: 'speaking',
    }[state] || 'here with you';
    stateEl.textContent = label;
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setTutorState('idle'), IDLE_MS);
  }

  function buildPresence(tutor) {
    const el = document.createElement('aside');
    el.id = 'tutor-presence';
    el.setAttribute('aria-label', `${tutor.name}, your tutor`);
    el.innerHTML = `
      <div class="mx-presence-portrait-wrap">
        <img class="mx-presence-portrait" src="/images/tutor_avatars/${tutor.image}" alt="${tutor.name}" />
        <div class="mx-presence-ring" aria-hidden="true"></div>
      </div>
      <div class="mx-presence-name">${tutor.name}</div>
      <div class="mx-presence-state">here with you</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-ready'));
    return el;
  }

  function buildContext() {
    const el = document.createElement('aside');
    el.id = 'session-context';
    el.setAttribute('aria-label', 'Session context');
    el.innerHTML = `
      <div class="mx-context-card" id="mx-recent-card">
        <div class="mx-context-title">Recent</div>
        <div class="mx-context-empty">Your recent topics will appear here.</div>
      </div>
      <div class="mx-context-card" id="mx-summary-card">
        <div class="mx-context-title">This session</div>
        <p class="mx-context-summary">We just started — wherever you want to begin is fine.</p>
      </div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-ready'));
    return el;
  }

  function buildOpener(user) {
    const firstName = (user && user.firstName) ? user.firstName : 'there';
    const el = document.createElement('div');
    el.id = 'session-opener';
    el.innerHTML = `
      <div class="mx-opener-greeting">Hey ${escapeHtml(firstName)}.</div>
      <h1 class="mx-opener-question">What do you want to work on today?</h1>
      <p class="mx-opener-sub">No wrong place to start. I'll figure it out with you.</p>
      <div class="mx-opener-chips" role="group" aria-label="Quick starts">
        <button class="mx-opener-chip" data-seed="I have homework I need help with.">Homework help</button>
        <button class="mx-opener-chip" data-seed="Can we practice a skill together?">Practice a skill</button>
        <button class="mx-opener-chip" data-seed="I have a test coming up — can you help me prep?">Prep for a test</button>
        <button class="mx-opener-chip" data-seed="Honestly, I just want to talk through something I'm stuck on.">Just talk it through</button>
      </div>
    `;
    el.addEventListener('click', (e) => {
      const chip = e.target.closest('.mx-opener-chip');
      if (!chip) return;
      seedAndSend(chip.dataset.seed);
    });
    return el;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function seedAndSend(text) {
    const input = $('#user-input');
    const send = $('#send-button');
    if (!input) return;
    if (input.tagName === 'DIV') {
      input.textContent = text;
    } else {
      input.value = text;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    if (send) {
      setTimeout(() => send.click(), 50);
    }
  }

  function showOpenerIfEmpty(chatBox, user) {
    if (!chatBox) return;
    const hasMessages = !!chatBox.querySelector('.message-container, .message');
    if (hasMessages) return;
    if (openerEl) return;
    openerEl = buildOpener(user);
    chatBox.appendChild(openerEl);
    requestAnimationFrame(() => openerEl.classList.add('is-visible'));
  }

  function dismissOpener() {
    if (!openerEl || openerEl.dataset.leaving === '1') return;
    openerEl.dataset.leaving = '1';
    openerEl.classList.add('is-leaving');
    setTimeout(() => {
      if (openerEl && openerEl.parentNode) {
        openerEl.parentNode.removeChild(openerEl);
      }
      openerEl = null;
    }, 360);
  }

  function watchChat(chatBox) {
    if (!chatBox) return;
    observer = new MutationObserver((mutations) => {
      let sawAi = false;
      let sawAnyMessage = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.id === 'session-opener' || node.closest && node.closest('#session-opener')) continue;
          if (node.classList && (
            node.classList.contains('message-container') ||
            node.classList.contains('message')
          )) {
            sawAnyMessage = true;
            const isAi = node.classList.contains('ai') ||
              (node.querySelector && node.querySelector('.message.ai, .message-container.ai'));
            if (isAi || (node.classList.contains('ai'))) sawAi = true;
          }
        }
        // Character data changes inside an AI bubble = streaming. Keep ring lit.
        if (m.type === 'characterData' || m.type === 'childList') {
          const target = m.target;
          if (target && target.closest && target.closest('.message.ai, .message-container.ai')) {
            sawAi = true;
          }
        }
      }
      if (sawAnyMessage) dismissOpener();
      if (sawAi) {
        setTutorState('speaking');
        scheduleIdle();
      }
    });
    observer.observe(chatBox, { childList: true, subtree: true, characterData: true });
  }

  function watchThinking() {
    const ind = $('#thinking-indicator');
    if (!ind) return;
    const mo = new MutationObserver(() => {
      const visible = window.getComputedStyle(ind).display !== 'none';
      if (visible) setTutorState('thinking');
      else scheduleIdle();
    });
    mo.observe(ind, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  function watchSendButton() {
    const send = $('#send-button');
    if (!send) return;
    send.addEventListener('click', () => {
      // User just spoke — fade the opener immediately rather than wait for the bubble.
      dismissOpener();
      setTutorState('thinking');
      scheduleIdle();
    });
  }

  function resolveTutor(user) {
    const id = user && user.selectedTutorId;
    const cfg = window.TUTOR_CONFIG || {};
    const tutor = (id && cfg[id]) || cfg.default || null;
    if (!tutor) {
      return { name: 'Your tutor', image: 'maya.png', id: 'maya' };
    }
    return { name: tutor.name || 'Your tutor', image: tutor.image || 'maya.png', id: id || 'maya' };
  }

  async function loadUser() {
    try {
      const res = await fetch('/user', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    } catch (_) {
      return null;
    }
  }

  function applyTheme(tutorId) {
    const key = THEME_KEYS[tutorId];
    if (key) document.body.dataset.tutor = key;
    else document.body.dataset.tutor = 'maya';
  }

  async function boot() {
    const chatBox = $('#chat-messages-container');
    if (!chatBox) return;

    setTutorState('idle');

    // The user fetch and TUTOR_CONFIG availability may race; give config a tick.
    const user = await loadUser();
    if (!user) return; // unauthenticated; nothing to do here

    const tutor = resolveTutor(user);
    applyTheme(tutor.id);

    presenceEl = buildPresence(tutor);
    stateEl = presenceEl.querySelector('.mx-presence-state');
    contextEl = buildContext();

    showOpenerIfEmpty(chatBox, user);
    watchChat(chatBox);
    watchThinking();
    watchSendButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
