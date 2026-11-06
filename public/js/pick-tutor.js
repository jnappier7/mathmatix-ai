// public/js/pick-tutor.js  –  Tutor selection (onboarding + switching)
//
// Character-select layout: full-body tutors stand together on the left; the
// selected one drives a detail panel (name, catchphrase, bio, voice preview,
// CTA) on the right. Tutors whose sessions the student hasn't unlocked yet
// sit on a shelf below, each linking into the chat shop (?shop=tutors), where
// coins unlock sessions with them — coins pay for the coaching, never the
// person. Access is server-enforced (PATCH /api/user/settings).
//
// One page, two modes (derived from currentUser.selectedTutorId — no caller
// plumbing):
//   onboarding — no tutor yet; show the stepper, finish with "Choose X".
//   switching  — already has a tutor; hide the stepper, pre-select the current
//                tutor, offer a "Back to Chat" escape, finish with "Switch to X".
document.addEventListener('DOMContentLoaded', () => {
  let allTutors      = [];
  let lockedTutors   = [];
  let currentUser    = null;
  let isSwitching    = false;
  let selectedTutorId = null;
  let currentAudio    = null; // currently playing voice preview
  let currentAudioUrl = null; // object URL to revoke

  const roster     = document.getElementById('tutor-roster');
  const panel      = document.getElementById('tutor-detail');
  const stepperEl  = document.getElementById('onboarding-stepper');
  const titleEl    = document.getElementById('selection-title');
  const subtitleEl = document.getElementById('selection-subtitle');
  const lockedShelf = document.getElementById('locked-shelf');
  const backBar    = document.getElementById('tp-backbar');

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
  function tutorById(id) { return allTutors.find(t => t.id === id); }
  function fullBodyBase(id) { return '/images/tutor_avatars/' + id + '-fullBody'; }
  // Static images are cached for a week; bump when a -fullBody file is re-exported.
  const ART_V = '?v=20261106b';
  function portraitBase(t) { return '/images/tutor_avatars/' + String(t.image || '').replace(/\.png$/, ''); }

  /* -------- MODE -------- */
  function applyMode() {
    isSwitching = !!(currentUser && currentUser.selectedTutorId);
    if (isSwitching) {
      if (stepperEl)  stepperEl.style.display = 'none';
      if (titleEl)    titleEl.textContent = 'Switch Your Tutor';
      if (subtitleEl) subtitleEl.textContent =
        'Pick a different coach whenever you like — your progress and XP stay with you.';
      if (backBar)    backBar.style.display = '';
    }
  }

  /* -------- INITIAL DATA LOAD -------- */
  async function fetchData() {
    try {
      const userRes = await fetch('/user', { credentials: 'include' });
      if (!userRes.ok) return window.location.href = '/login.html';
      currentUser = (await userRes.json()).user;

      const cfg = window.TUTOR_CONFIG;
      if (!cfg) throw new Error('Tutor configuration not loaded.');

      // Core tutors are always selectable; shop tutors (purchasable) only once
      // their sessions are unlocked. Inactive ones (active:false) don't appear.
      const unlocked = (currentUser && currentUser.unlockedItems) || [];
      const ids = Object.keys(cfg).filter(k => k !== 'default' && cfg[k].active !== false);
      allTutors = ids
        .filter(k => !cfg[k].purchasable || unlocked.includes(k))
        .map(k => ({ id: k, ...cfg[k] }));
      lockedTutors = ids
        .filter(k => cfg[k].purchasable && !unlocked.includes(k))
        .map(k => ({ id: k, ...cfg[k] }))
        .sort((a, b) => (a.shopPrice || 0) - (b.shopPrice || 0));

      applyMode();

      // Pre-select so the panel is populated on load: switching -> current
      // tutor; trial chat -> that tutor; else the first active tutor.
      const trialTutor = new URLSearchParams(window.location.search).get('trial_tutor');
      if (isSwitching && tutorById(currentUser.selectedTutorId)) {
        selectedTutorId = currentUser.selectedTutorId;
      } else if (trialTutor && tutorById(trialTutor)) {
        selectedTutorId = trialTutor;
      } else {
        selectedTutorId = allTutors[0] ? allTutors[0].id : null;
      }

      renderRoster();
      renderPanel();
      renderLocked();
    } catch (err) {
      console.error('Error fetching initial data:', err);
      roster.innerHTML = '<p style="margin:auto; color: var(--clr-text-dim);">Error loading tutors. Please refresh.</p>';
    }
  }

  /* -------- ROSTER (full-body figures) -------- */
  function renderRoster() {
    roster.innerHTML = '';
    allTutors.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tp-figure' + (t.id === selectedTutorId ? ' selected' : '');
      btn.dataset.tutorId = t.id;
      btn.setAttribute('aria-pressed', t.id === selectedTutorId ? 'true' : 'false');
      btn.setAttribute('aria-label', t.name);
      // Every selectable tutor has full-body art on the shared 961x1637 canvas
      // (pinned by tests/unit/tutorShop.test.js).
      const art = fullBodyBase(t.id);
      btn.innerHTML =
        '<span class="tp-figure-img"><picture>' +
          '<source srcset="' + art + '.webp' + ART_V + '" type="image/webp">' +
          '<img src="' + art + '.png' + ART_V + '" alt="'  + esc(t.name) + '" loading="lazy">' +
        '</picture></span>' +
        '<span class="tp-figure-name">' + esc(t.name) + '</span>';
      roster.appendChild(btn);
    });
    requestAnimationFrame(() => centreFigure(selectedTutorId, false));
  }

  // The strip side-scrolls; keep the chosen tutor in view without moving the page.
  function centreFigure(id, smooth) {
    const fig = roster.querySelector('.tp-figure[data-tutor-id="' + id + '"]');
    if (!fig || roster.scrollWidth <= roster.clientWidth) return;
    const left = fig.offsetLeft - (roster.clientWidth - fig.offsetWidth) / 2;
    roster.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }

  /* -------- DETAIL PANEL -------- */
  function renderPanel() {
    const t = tutorById(selectedTutorId);
    if (!t) { panel.innerHTML = ''; return; }
    const cta = (isSwitching ? 'Switch to ' : 'Choose ') + t.name;
    panel.innerHTML =
      '<h2 class="tp-name">' + esc(t.name) + '</h2>' +
      '<p class="tp-catch">“' + esc(t.catchphrase || '') + '”</p>' +
      '<p class="tp-bio">' + esc(t.about || '') + '</p>' +
      (t.specialties ? '<p class="tp-spec"><strong>Specializes in:</strong> ' + esc(t.specialties) + '</p>' : '') +
      '<div class="tp-actions">' +
        '<button type="button" class="tp-hear" id="tp-hear-btn"><i class="fas fa-volume-up"></i> Hear my voice</button>' +
        '<button type="button" class="tp-choose" id="tp-choose-btn"><i class="fas fa-arrow-right"></i> ' + esc(cta) + '</button>' +
      '</div>';
  }

  /* -------- SELECTION -------- */
  function selectTutor(id) {
    if (!id) return;
    selectedTutorId = id;
    document.querySelectorAll('.tp-figure').forEach(f => {
      const on = f.dataset.tutorId === id;
      f.classList.toggle('selected', on);
      f.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    stopVoice();
    renderPanel();
    centreFigure(id, true);
  }

  roster.addEventListener('click', e => {
    const fig = e.target.closest('.tp-figure');
    if (fig) selectTutor(fig.dataset.tutorId);
  });

  /* -------- VOICE PREVIEW -------- */
  function stopVoice() {
    if (!currentAudio) return;
    currentAudio.pause();
    if (currentAudioUrl) { URL.revokeObjectURL(currentAudioUrl); currentAudioUrl = null; }
    currentAudio = null;
  }

  async function playVoice(btn) {
    const t = tutorById(selectedTutorId);
    if (!t || !t.cartesiaVoiceId) return;
    stopVoice();

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Playing…';
    const reset = () => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-volume-up"></i> Hear my voice';
    };
    try {
      const resp = await csrfFetch('/api/speak', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: t.voicePreview, voiceId: t.cartesiaVoiceId }),
        credentials: 'include'
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      currentAudioUrl = url;
      currentAudio = new Audio(url);
      currentAudio.play();
      currentAudio.onended = () => { stopVoice(); reset(); };
    } catch (err) {
      console.error(err);
      reset();
    }
  }

  /* -------- COMPLETE SELECTION -------- */
  async function chooseTutor(btn) {
    if (!selectedTutorId) return;
    stopVoice();
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    try {
      const res = await csrfFetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedTutorId }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.href = '/chat.html';
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-times"></i> Save Failed – Retry';
    }
  }

  // Panel re-renders, so delegate its button clicks.
  panel.addEventListener('click', e => {
    const hear = e.target.closest('#tp-hear-btn');
    if (hear) return playVoice(hear);
    const choose = e.target.closest('#tp-choose-btn');
    if (choose) return chooseTutor(choose);
  });

  /* -------- MORE TUTORS SHELF (sessions not unlocked yet) -------- */
  function renderLocked() {
    if (!lockedShelf) return;
    if (!lockedTutors.length) { lockedShelf.style.display = 'none'; return; }
    // A student who hasn't picked a first tutor has nowhere to spend yet — the
    // shop lives in chat — so onboarding shows the shelf as a tease, not a link.
    const canShop = isSwitching;
    lockedShelf.innerHTML =
      '<p class="tp-locked-title"><i class="fas fa-star"></i> More tutors — unlock sessions with coins in the Shop</p>' +
      '<div class="tp-locked-row">' +
        lockedTutors.map(t => {
          const inner =
            '<span class="tp-lock-portrait"><picture>' +
              '<source srcset="' + portraitBase(t) + '.webp" type="image/webp">' +
              '<img src="' + portraitBase(t) + '.png" alt="" loading="lazy">' +
            '</picture></span>' +
            '<span class="tp-lock-name">' + esc(t.name) + '</span>' +
            '<span class="tp-lock-hint">🪙 ' + esc(String(t.shopPrice || '')) + ' · sessions</span>';
          return canShop
            ? '<a class="tp-lock" href="/chat.html?shop=tutors" title="Unlock sessions with ' + esc(t.name) + ' in the Shop">' + inner + '</a>'
            : '<div class="tp-lock" title="Unlock sessions in the Shop once you start learning">' + inner + '</div>';
        }).join('') +
      '</div>';
  }

  /* -------- KICKOFF -------- */
  fetchData();
});
