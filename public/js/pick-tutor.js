// public/js/pick-tutor.js  –  FULL FILE (paste-ready)
document.addEventListener('DOMContentLoaded', () => {
  let allTutors    = [];
  let currentUser  = null;
  const tutorSelectionGrid = document.getElementById('tutor-selection-grid');
  const playVoiceBtn       = document.getElementById('play-voice-btn');
  const selectTutorBtn     = document.getElementById('select-tutor-btn');
  let selectedTutorId      = null;

  /* -------- INITIAL DATA LOAD -------- */
  async function fetchData() {
    try {
      const [userRes, tutorConfigRes] = await Promise.all([
        fetch('/user',           { credentials: 'include' }),
        fetch('/js/tutor-config-data.js')
      ]);

      if (!userRes.ok) return window.location.href = '/login.html';
      if (!tutorConfigRes.ok) throw new Error('Failed to load tutor configuration.');

      const userData   = await userRes.json();
      currentUser      = userData.user;

      // Fallback in case older accounts have empty unlockedItems
      if (!Array.isArray(currentUser.unlockedItems) || currentUser.unlockedItems.length === 0) {
        currentUser.unlockedItems = ['mr-nappier', 'maya', 'ms-maria', 'bob'];
      }

      /* Inject tutor config into page scope if not already present */
      const scriptText = await tutorConfigRes.text();
      if (!window.TUTOR_CONFIG) {
        const s = document.createElement('script');
        s.textContent = scriptText;
        document.body.appendChild(s);
      }

      const tutorsData = window.TUTOR_CONFIG;
      allTutors = Object.keys(tutorsData)
        .filter(key => key !== 'default')
        .map(key => ({ id: key, ...tutorsData[key] }));

      renderTutors();
    } catch (err) {
      console.error('Error fetching initial data:', err);
      tutorSelectionGrid.innerHTML = `<p>Error loading tutors. Please refresh.</p>`;
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

      if (isUnlocked) {
        card.innerHTML = `
          <img src="/images/tutor_avatars/${tutor.image}" alt="${tutor.name}" class="tutor-card-image" loading="lazy">
          <h3 class="tutor-card-name">${tutor.name}</h3>
          <p  class="tutor-card-tagline">${tutor.catchphrase || ''}</p>
          <div class="tutor-card-details-overlay">
            <h4>About ${tutor.name}:</h4><p>${tutor.about || ''}</p>
            <h4>Specializes In:</h4><p>${tutor.specialties || ''}</p>
          </div>`;
      } else {
        const unlockLabel = tutor.unlockLevel
          ? `Unlocks at Level ${tutor.unlockLevel}`
          : 'Unlock by playing';
        card.innerHTML = `
          <img src="/images/tutor_avatars/${tutor.image}" alt="Locked Tutor" class="tutor-card-image silhouette">
          <h3 class="tutor-card-name locked-name">?????</h3>
          <p  class="tutor-card-tagline"><i class="fas fa-lock"></i> ${unlockLabel}</p>`;
      }
      tutorSelectionGrid.appendChild(card);
    });
  }

  /* -------- INTERACTION HANDLERS -------- */
  tutorSelectionGrid.addEventListener('click', e => {
    const card = e.target.closest('.tutor-card');
    if (!card || card.classList.contains('locked')) return;

    document.querySelectorAll('.tutor-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedTutorId    = card.dataset.tutorId;
    playVoiceBtn.disabled   = false;
    selectTutorBtn.disabled = false;
    const tutorName = allTutors.find(t => t.id === selectedTutorId)?.name || 'Tutor';
    selectTutorBtn.textContent = `✅ Select ${tutorName}`;
  });

  playVoiceBtn.addEventListener('click', async () => {
    if (!selectedTutorId) return;
    const t = allTutors.find(t => t.id === selectedTutorId);
    if (!t.voiceId) return alert('Voice not available for this tutor.');

    playVoiceBtn.disabled = true;
    playVoiceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Playing…';

    try {
      const resp = await csrfFetch('/api/speak', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: t.voicePreview, voiceId: t.voiceId }),
        credentials: 'include'
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => {
        URL.revokeObjectURL(url);
        playVoiceBtn.disabled = false;
        playVoiceBtn.innerHTML = '<i class="fas fa-play"></i> Play Voice';
      };
    } catch (err) {
      console.error(err);
      playVoiceBtn.disabled = false;
      playVoiceBtn.innerHTML = '<i class="fas fa-play"></i> Play Voice';
    }
  });

  selectTutorBtn.addEventListener('click', async () => {
    if (!selectedTutorId) return;

    selectTutorBtn.disabled = true;
    selectTutorBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
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
      selectTutorBtn.disabled = false;
      selectTutorBtn.textContent = 'Save Failed – Retry';
    }
  });

  /* -------- KICKOFF -------- */
  fetchData();
});
