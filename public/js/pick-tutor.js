// public/js/pick-tutor.js  –  Tutor selection (onboarding + switching)
//
// One page, two modes:
//   onboarding — the student has no tutor yet; show the step indicator
//                and finish with "Start Learning".
//   switching  — the student already has a tutor and came here to change
//                it; hide the stepper, pre-select their current tutor,
//                offer a "Back to Chat" escape, finish with "Switch to X".
// Mode is derived from currentUser.selectedTutorId — no caller plumbing.
document.addEventListener('DOMContentLoaded', () => {
  let allTutors   = [];
  let currentUser = null;
  let isSwitching = false;
  let selectedTutorId = null;
  let currentAudio    = null; // currently playing voice preview
  let currentAudioUrl = null; // object URL to revoke

  const tutorSelectionGrid   = document.getElementById('tutor-selection-grid');
  const completeSelectionBtn = document.getElementById('complete-selection-btn');
  const stepperEl  = document.getElementById('onboarding-stepper');
  const titleEl    = document.getElementById('selection-title');
  const subtitleEl = document.getElementById('selection-subtitle');
  const backLink   = document.getElementById('back-to-chat-link');

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function tutorName(id) {
    const t = allTutors.find(x => x.id === id);
    return t ? t.name : 'this tutor';
  }

  /* -------- PRIMARY BUTTON -------- */
  function refreshPrimary() {
    completeSelectionBtn.disabled = !selectedTutorId;
    if (!selectedTutorId) {
      completeSelectionBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Choose a tutor';
    } else if (isSwitching) {
      completeSelectionBtn.innerHTML =
        '<i class="fas fa-check"></i> Switch to ' + esc(tutorName(selectedTutorId));
    } else {
      completeSelectionBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Start Learning';
    }
  }

  /* -------- MODE -------- */
  function applyMode() {
    isSwitching = !!(currentUser && currentUser.selectedTutorId);
    if (isSwitching) {
      if (stepperEl)  stepperEl.style.display = 'none';
      if (titleEl)    titleEl.textContent = 'Switch Your Tutor';
      if (subtitleEl) subtitleEl.textContent =
        'Pick a different coach whenever you like — your progress and XP stay with you.';
      if (backLink)   backLink.style.display = '';
      selectedTutorId = currentUser.selectedTutorId;
    }
  }

  /* -------- INITIAL DATA LOAD -------- */
  async function fetchData() {
    try {
      const userRes = await fetch('/user', { credentials: 'include' });
      if (!userRes.ok) return window.location.href = '/login.html';

      const userData = await userRes.json();
      currentUser = userData.user;

      const tutorsData = window.TUTOR_CONFIG;
      if (!tutorsData) throw new Error('Tutor configuration not loaded.');

      // Only active tutors are selectable; inactive ones are held back
      // as future "specials" (see `active` in tutorConfig.js).
      allTutors = Object.keys(tutorsData)
        .filter(key => key !== 'default' && tutorsData[key].active !== false)
        .map(key => ({ id: key, ...tutorsData[key] }));

      applyMode();

      // Coming straight from a trial chat — pre-select that tutor.
      const trialTutor = new URLSearchParams(window.location.search).get('trial_tutor');
      if (trialTutor && allTutors.some(t => t.id === trialTutor)) {
        selectedTutorId = trialTutor;
      }

      renderTutors();
      refreshPrimary();
    } catch (err) {
      console.error('Error fetching initial data:', err);
      tutorSelectionGrid.innerHTML = '<p>Error loading tutors. Please refresh.</p>';
    }
  }

  /* -------- UI RENDER -------- */
  function renderTutors() {
    if (!tutorSelectionGrid) return;
    tutorSelectionGrid.innerHTML = '';

    allTutors.forEach(tutor => {
      const card = document.createElement('div');
      card.classList.add('tutor-card', 'card-style-1', 'unlocked');
      card.dataset.tutorId = tutor.id;
      if (tutor.id === selectedTutorId) card.classList.add('selected');

      card.innerHTML =
        '<img src="/images/tutor_avatars/' + esc(tutor.image) + '" alt="' + esc(tutor.name) + '" class="tutor-card-image" loading="lazy">' +
        '<h3 class="tutor-card-name">' + esc(tutor.name) + '</h3>' +
        '<p class="tutor-card-tagline">' + esc(tutor.catchphrase || '') + '</p>' +
        '<button class="tutor-card-hear-btn" data-tutor-id="' + esc(tutor.id) + '">' +
          '<i class="fas fa-volume-up"></i> Hear me' +
        '</button>' +
        '<div class="tutor-card-details-overlay">' +
          '<h4>About ' + esc(tutor.name) + ':</h4><p>' + esc(tutor.about || '') + '</p>' +
          '<h4>Specializes In:</h4><p>' + esc(tutor.specialties || '') + '</p>' +
        '</div>';
      tutorSelectionGrid.appendChild(card);
    });
  }

  /* -------- CARD SELECTION -------- */
  tutorSelectionGrid.addEventListener('click', e => {
    if (e.target.closest('.tutor-card-hear-btn')) return; // handled below

    const card = e.target.closest('.tutor-card');
    if (!card) return;

    document.querySelectorAll('.tutor-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedTutorId = card.dataset.tutorId;
    refreshPrimary();
  });

  /* -------- INLINE VOICE PREVIEW -------- */
  tutorSelectionGrid.addEventListener('click', async (e) => {
    const hearBtn = e.target.closest('.tutor-card-hear-btn');
    if (!hearBtn) return;

    e.stopPropagation();
    const tutorId = hearBtn.dataset.tutorId;
    const tutor = allTutors.find(t => t.id === tutorId);
    if (!tutor || !tutor.voiceId) return;

    // Stop any currently playing preview
    if (currentAudio) {
      currentAudio.pause();
      if (currentAudioUrl) { URL.revokeObjectURL(currentAudioUrl); currentAudioUrl = null; }
      currentAudio = null;
      document.querySelectorAll('.tutor-card-hear-btn').forEach(btn => {
        btn.innerHTML = '<i class="fas fa-volume-up"></i> Hear me';
        btn.disabled = false;
      });
    }

    hearBtn.disabled = true;
    hearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Playing…';

    try {
      const resp = await csrfFetch('/api/speak', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: tutor.voicePreview, voiceId: tutor.voiceId }),
        credentials: 'include'
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      currentAudioUrl = url;
      currentAudio = new Audio(url);
      currentAudio.play();
      currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioUrl = null;
        hearBtn.disabled = false;
        hearBtn.innerHTML = '<i class="fas fa-volume-up"></i> Hear me';
        currentAudio = null;
      };
    } catch (err) {
      console.error(err);
      hearBtn.disabled = false;
      hearBtn.innerHTML = '<i class="fas fa-volume-up"></i> Hear me';
    }
  });

  /* -------- COMPLETE SELECTION -------- */
  completeSelectionBtn.addEventListener('click', async () => {
    if (!selectedTutorId) return;

    completeSelectionBtn.disabled = true;
    completeSelectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
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
      completeSelectionBtn.disabled = false;
      completeSelectionBtn.innerHTML = '<i class="fas fa-times"></i> Save Failed – Retry';
    }
  });

  /* -------- KICKOFF -------- */
  fetchData();
});
