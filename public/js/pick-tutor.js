// public/js/pick-tutor.js  –  Tutor selection with inline voice preview on each card
document.addEventListener('DOMContentLoaded', () => {
  let allTutors    = [];
  let currentUser  = null;
  const tutorSelectionGrid = document.getElementById('tutor-selection-grid');
  const completeSelectionBtn = document.getElementById('complete-selection-btn');
  let selectedTutorId      = null;
  let currentAudio         = null; // Track currently playing voice preview

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  /* -------- INITIAL DATA LOAD -------- */
  async function fetchData() {
    try {
      const userRes = await fetch('/user', { credentials: 'include' });

      if (!userRes.ok) return window.location.href = '/login.html';

      const userData   = await userRes.json();
      currentUser      = userData.user;

      // Fallback in case older accounts have empty unlockedItems
      if (!Array.isArray(currentUser.unlockedItems) || currentUser.unlockedItems.length === 0) {
        currentUser.unlockedItems = ['mr-nappier', 'maya', 'ms-maria', 'bob'];
      }

      const tutorsData = window.TUTOR_CONFIG;
      if (!tutorsData) throw new Error('Tutor configuration not loaded.');

      allTutors = Object.keys(tutorsData)
        .filter(key => key !== 'default')
        .map(key => ({ id: key, ...tutorsData[key] }));

      // If coming from trial chat, pre-select that tutor
      const params = new URLSearchParams(window.location.search);
      const trialTutor = params.get('trial_tutor');
      if (trialTutor && allTutors.some(t => t.id === trialTutor)) {
        selectedTutorId = trialTutor;
        completeSelectionBtn.disabled = false;
      }

      renderTutors();
    } catch (err) {
      console.error('Error fetching initial data:', err);
      tutorSelectionGrid.innerHTML = '<p>Error loading tutors. Please refresh.</p>';
    }
  }

  /* -------- UI RENDER -------- */
  function renderTutors() {
    if (!tutorSelectionGrid || !currentUser) return;
    tutorSelectionGrid.innerHTML = '';

    allTutors.forEach(tutor => {
      const isUnlocked = currentUser.unlockedItems.includes(tutor.id);
      const card       = document.createElement('div');
      card.classList.add('tutor-card', 'card-style-1', isUnlocked ? 'unlocked' : 'locked');
      card.dataset.tutorId = tutor.id;

      // Pre-select from trial chat
      if (isUnlocked && tutor.id === selectedTutorId) {
        card.classList.add('selected');
      }

      if (isUnlocked) {
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
      } else {
        const hint = tutor.unlockHint || 'Keep going — you\'ll meet me soon';
        card.innerHTML =
          '<img src="/images/tutor_avatars/' + esc(tutor.image) + '" alt="Locked Tutor" class="tutor-card-image silhouette">' +
          '<h3 class="tutor-card-name locked-name">?????</h3>' +
          '<p class="tutor-card-tagline"><i class="fas fa-lock"></i> ' + esc(hint) + '</p>';
      }
      tutorSelectionGrid.appendChild(card);
    });
  }

  /* -------- CARD SELECTION -------- */
  tutorSelectionGrid.addEventListener('click', e => {
    // Ignore clicks on the hear button
    if (e.target.closest('.tutor-card-hear-btn')) return;

    const card = e.target.closest('.tutor-card');
    if (!card || card.classList.contains('locked')) return;

    document.querySelectorAll('.tutor-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedTutorId = card.dataset.tutorId;
    completeSelectionBtn.disabled = false;
    completeSelectionBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Next: Choose Your Avatar';
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
      currentAudio = null;
      // Reset all hear buttons
      document.querySelectorAll('.tutor-card-hear-btn').forEach(btn => {
        btn.innerHTML = '<i class="fas fa-volume-up"></i> Hear me';
        btn.disabled = false;
      });
    }

    hearBtn.disabled = true;
    hearBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Playing\u2026';

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
      currentAudio = new Audio(url);
      currentAudio.play();
      currentAudio.onended = () => {
        URL.revokeObjectURL(url);
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
    completeSelectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving\u2026';
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
      completeSelectionBtn.innerHTML = '<i class="fas fa-times"></i> Save Failed \u2013 Retry';
    }
  });

  /* -------- KICKOFF -------- */
  fetchData();
});
