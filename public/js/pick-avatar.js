// public/js/pick-avatar.js  –  Avatar selection (separate screen from tutor selection)
document.addEventListener('DOMContentLoaded', () => {
  let allAvatars   = [];
  let currentUser  = null;
  const avatarSelectionGrid  = document.getElementById('avatar-selection-grid');
  const completeSelectionBtn = document.getElementById('complete-selection-btn');
  let selectedAvatarId       = null;

  /* -------- INITIAL DATA LOAD -------- */
  async function fetchData() {
    try {
      const userRes = await fetch('/user', { credentials: 'include' });

      if (!userRes.ok) return window.location.href = '/login.html';

      const userData = await userRes.json();
      currentUser    = userData.user;

      // If student hasn't picked a tutor yet, send them back
      if (currentUser.role === 'student' && !currentUser.selectedTutorId) {
        return window.location.href = '/pick-tutor.html';
      }

      const avatarsData = window.AVATAR_CONFIG;
      allAvatars = Object.keys(avatarsData)
        .filter(key => key !== 'default')
        .map(key => ({ id: key, ...avatarsData[key] }));

      renderAvatars();

      // Check if returning from avatar builder - auto-select the latest custom avatar
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('avatar') === 'custom' && currentUser.avatarGallery?.length > 0) {
        const latestIndex = currentUser.avatarGallery.length - 1;
        setTimeout(() => {
          const latestAvatarCard = document.querySelector(`.avatar-card[data-avatar-id="gallery-${latestIndex}"]`);
          if (latestAvatarCard) {
            latestAvatarCard.classList.add('selected');
            selectedAvatarId = `gallery-${latestIndex}`;
            completeSelectionBtn.disabled = false;
          }
        }, 100);
        // Clean up the URL
        window.history.replaceState({}, '', '/pick-avatar.html');
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
      avatarSelectionGrid.innerHTML = `<p>Error loading avatars. Please refresh.</p>`;
    }
  }

  /* -------- UI RENDER -------- */
  function renderAvatars() {
    if (!avatarSelectionGrid || !currentUser) return;
    avatarSelectionGrid.innerHTML = '';

    // Add "Create Custom Avatar" card first
    const galleryCount = (currentUser.avatarGallery || []).length;
    const customCard = document.createElement('div');
    customCard.classList.add('avatar-card', 'unlocked', 'create-custom');
    customCard.dataset.avatarId = 'custom';
    customCard.innerHTML = `
      <div class="avatar-card-image">
        <i class="fas fa-magic"></i>
      </div>
      <h4 class="avatar-card-name">Create Your Own!</h4>
      <p class="avatar-card-description">${galleryCount < 3 ? `${3 - galleryCount} slots left` : 'Replace oldest'}</p>`;
    avatarSelectionGrid.appendChild(customCard);

    // Show all avatars from the gallery (up to 3)
    if (currentUser.avatarGallery && currentUser.avatarGallery.length > 0) {
      currentUser.avatarGallery.forEach((avatar, index) => {
        const galleryCard = document.createElement('div');
        galleryCard.classList.add('avatar-card', 'unlocked');
        galleryCard.dataset.avatarId = `gallery-${index}`;
        galleryCard.dataset.galleryIndex = index;
        galleryCard.innerHTML = `
          <div class="avatar-card-image">
            <img src="${avatar.dicebearUrl}" alt="${avatar.name}" loading="lazy">
          </div>
          <h4 class="avatar-card-name">${avatar.name}</h4>
          <p class="avatar-card-description">Custom creation</p>
          <span class="avatar-rarity rarity-legendary">custom</span>`;
        avatarSelectionGrid.appendChild(galleryCard);
      });
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
  avatarSelectionGrid.addEventListener('click', e => {
    const card = e.target.closest('.avatar-card');
    if (!card || card.classList.contains('locked')) return;

    // If clicking "Create Custom Avatar", redirect to avatar builder
    if (card.dataset.avatarId === 'custom') {
      window.location.href = '/avatar-builder.html?from=pick-avatar';
      return;
    }

    document.querySelectorAll('.avatar-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedAvatarId = card.dataset.avatarId;
    completeSelectionBtn.disabled = false;
  });

  completeSelectionBtn.addEventListener('click', async () => {
    if (!selectedAvatarId) return;

    completeSelectionBtn.disabled = true;
    completeSelectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    try {
      const res = await csrfFetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAvatarId }),
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
