// public/js/pick-tutor.js  –  FULL FILE (paste-ready)
document.addEventListener('DOMContentLoaded', () => {
  let allTutors    = [];
  let allAvatars   = [];
  let currentUser  = null;
  const tutorSelectionGrid = document.getElementById('tutor-selection-grid');
  const avatarSelectionGrid = document.getElementById('avatar-selection-grid');
  const playVoiceBtn       = document.getElementById('play-voice-btn');
  const completeSelectionBtn = document.getElementById('complete-selection-btn');
  let selectedTutorId      = null;
  let selectedAvatarId     = null;

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

      const avatarsData = window.AVATAR_CONFIG;
      allAvatars = Object.keys(avatarsData)
        .filter(key => key !== 'default')
        .map(key => ({ id: key, ...avatarsData[key] }));

      renderTutors();
      renderAvatars();

      // Check if returning from avatar builder - auto-select custom avatar
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('avatar') === 'custom' && currentUser.avatar?.dicebearUrl) {
        // Find and click the custom avatar card
        setTimeout(() => {
          const customAvatarCard = document.querySelector('.avatar-card[data-avatar-id="dicebear-custom"]');
          if (customAvatarCard) {
            customAvatarCard.classList.add('selected');
            selectedAvatarId = 'dicebear-custom';
            checkBothSelected();
          }
        }, 100);
        // Clean up the URL
        window.history.replaceState({}, '', '/pick-tutor.html');
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
      tutorSelectionGrid.innerHTML = `<p>Error loading tutors. Please refresh.</p>`;
      avatarSelectionGrid.innerHTML = `<p>Error loading avatars. Please refresh.</p>`;
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

  function renderAvatars() {
    if (!avatarSelectionGrid || !currentUser) return;
    avatarSelectionGrid.innerHTML = '';

    // Add "Create Custom Avatar" card first
    const customCard = document.createElement('div');
    customCard.classList.add('avatar-card', 'unlocked', 'create-custom');
    customCard.dataset.avatarId = 'custom';
    customCard.innerHTML = `
      <div class="avatar-card-image">
        <i class="fas fa-magic"></i>
      </div>
      <h4 class="avatar-card-name">Create Your Own!</h4>
      <p class="avatar-card-description">Design a custom avatar</p>`;
    avatarSelectionGrid.appendChild(customCard);

    // Check if user has a custom DiceBear avatar - show it as second option
    if (currentUser.avatar?.dicebearUrl) {
      const dicebearCard = document.createElement('div');
      dicebearCard.classList.add('avatar-card', 'unlocked');
      dicebearCard.dataset.avatarId = 'dicebear-custom';
      dicebearCard.innerHTML = `
        <div class="avatar-card-image">
          <img src="${currentUser.avatar.dicebearUrl}" alt="My Custom Avatar" loading="lazy">
        </div>
        <h4 class="avatar-card-name">My Avatar</h4>
        <p class="avatar-card-description">Your custom creation</p>
        <span class="avatar-rarity rarity-legendary">custom</span>`;
      avatarSelectionGrid.appendChild(dicebearCard);
    }

    allAvatars.forEach(avatar => {
      const isUnlocked = avatar.unlocked || (currentUser.level >= (avatar.unlockLevel || 0));
      const card = document.createElement('div');
      card.classList.add('avatar-card', isUnlocked ? 'unlocked' : 'locked');
      card.dataset.avatarId = avatar.id;

      if (isUnlocked) {
        card.innerHTML = `
          <div class="avatar-card-image">
            <img src="/images/avatars/${avatar.image}" alt="${avatar.name}" loading="lazy" onerror="this.src='/images/avatars/default.png'">
          </div>
          <h4 class="avatar-card-name">${avatar.name}</h4>
          <p class="avatar-card-description">${avatar.description}</p>
          ${avatar.rarity ? `<span class="avatar-rarity rarity-${avatar.rarity}">${avatar.rarity}</span>` : ''}`;
      } else {
        const unlockLabel = avatar.unlockLevel
          ? `Unlocks at Level ${avatar.unlockLevel}`
          : 'Keep playing to unlock!';
        card.innerHTML = `
          <div class="avatar-card-image locked-image">
            <img src="/images/avatars/${avatar.image}" alt="Locked Avatar" loading="lazy" style="filter: brightness(0) opacity(0.3);" onerror="this.src='/images/avatars/default.png'">
            <div class="lock-overlay"><i class="fas fa-lock fa-2x"></i></div>
          </div>
          <h4 class="avatar-card-name">?????</h4>
          <p class="avatar-card-description"><i class="fas fa-lock"></i> ${unlockLabel}</p>`;
      }
      avatarSelectionGrid.appendChild(card);
    });
  }

  /* -------- INTERACTION HANDLERS -------- */
  function checkBothSelected() {
    if (selectedTutorId && selectedAvatarId) {
      completeSelectionBtn.disabled = false;
      completeSelectionBtn.innerHTML = '<i class="fas fa-rocket"></i> Let\'s Go!';
    }
  }

  tutorSelectionGrid.addEventListener('click', e => {
    const card = e.target.closest('.tutor-card');
    if (!card || card.classList.contains('locked')) return;

    document.querySelectorAll('.tutor-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedTutorId = card.dataset.tutorId;
    playVoiceBtn.disabled = false;
    checkBothSelected();
  });

  avatarSelectionGrid.addEventListener('click', e => {
    const card = e.target.closest('.avatar-card');
    if (!card || card.classList.contains('locked')) return;

    // If clicking "Create Custom Avatar", redirect to avatar builder
    if (card.dataset.avatarId === 'custom') {
      // Pass tutor selection if one is already made, so we can skip back here
      let url = '/avatar-builder.html?from=pick-tutor';
      if (selectedTutorId) {
        url += `&tutor=${selectedTutorId}`;
      }
      window.location.href = url;
      return;
    }

    document.querySelectorAll('.avatar-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedAvatarId = card.dataset.avatarId;
    checkBothSelected();
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

  completeSelectionBtn.addEventListener('click', async () => {
    if (!selectedTutorId || !selectedAvatarId) return;

    completeSelectionBtn.disabled = true;
    completeSelectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    try {
      const res = await csrfFetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedTutorId, selectedAvatarId }),
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
