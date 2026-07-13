// public/js/pick-avatar.js  –  DiceBear avatar gallery (no preset avatars)
// Users customize their avatar using the DiceBear builder.
// Gallery holds up to 3 saved custom avatars.
document.addEventListener('DOMContentLoaded', () => {
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

      if (currentUser.role === 'student' && !currentUser.selectedTutorId) {
        return window.location.href = '/pick-tutor.html';
      }

      renderAvatars();

      // Check if returning from avatar builder
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('avatar') === 'custom' && currentUser.avatarGallery?.length > 0) {
        const latestIndex = currentUser.avatarGallery.length - 1;
        setTimeout(() => {
          const card = document.querySelector(`.avatar-card[data-avatar-id="gallery-${latestIndex}"]`);
          if (card) {
            card.classList.add('selected');
            selectedAvatarId = `gallery-${latestIndex}`;
            completeSelectionBtn.disabled = false;
          }
        }, 100);
        window.history.replaceState({}, '', '/pick-avatar.html');
      }
    } catch (err) {
      console.error('Error fetching initial data:', err);
      avatarSelectionGrid.innerHTML = '<p>Error loading avatars. Please refresh.</p>';
    }
  }

  /* -------- UI RENDER -------- */
  function renderAvatars() {
    if (!avatarSelectionGrid || !currentUser) return;
    avatarSelectionGrid.innerHTML = '';

    // "Create Custom Avatar" card
    const galleryCount = (currentUser.avatarGallery || []).length;
    const customCard = document.createElement('div');
    customCard.classList.add('avatar-card', 'unlocked', 'create-custom');
    customCard.dataset.avatarId = 'custom';
    customCard.innerHTML =
      '<div class="avatar-card-image"><i class="fas fa-magic"></i></div>' +
      '<h4 class="avatar-card-name">Create Your Own!</h4>' +
      '<p class="avatar-card-description">' + (galleryCount < 3 ? (3 - galleryCount) + ' slots left' : 'Replace oldest') + '</p>';
    avatarSelectionGrid.appendChild(customCard);

    // HTML escape helper to prevent XSS from user-created avatar names/URLs
    function esc(str) {
      const el = document.createElement('span');
      el.textContent = str || '';
      return el.innerHTML;
    }

    // Show gallery avatars
    if (currentUser.avatarGallery && currentUser.avatarGallery.length > 0) {
      currentUser.avatarGallery.forEach((avatar, index) => {
        const card = document.createElement('div');
        card.classList.add('avatar-card', 'unlocked');
        card.dataset.avatarId = 'gallery-' + index;
        card.dataset.galleryIndex = index;
        card.innerHTML =
          '<div class="avatar-card-image"><img src="' + esc(avatar.dicebearUrl) + '" alt="' + esc(avatar.name) + '" loading="lazy"></div>' +
          '<h4 class="avatar-card-name">' + esc(avatar.name) + '</h4>' +
          '<p class="avatar-card-description">Custom avatar</p>';
        avatarSelectionGrid.appendChild(card);
      });
    }

    // Show current default DiceBear avatar if no gallery items
    if (currentUser.avatar?.dicebearUrl && galleryCount === 0) {
      const defaultCard = document.createElement('div');
      defaultCard.classList.add('avatar-card', 'unlocked', 'selected');
      defaultCard.dataset.avatarId = 'dicebear-default';
      selectedAvatarId = 'dicebear-default';
      completeSelectionBtn.disabled = false;
      defaultCard.innerHTML =
        '<div class="avatar-card-image"><img src="' + esc(currentUser.avatar.dicebearUrl) + '" alt="My Avatar" loading="lazy"></div>' +
        '<h4 class="avatar-card-name">Current Avatar</h4>' +
        '<p class="avatar-card-description">Your default look</p>';
      avatarSelectionGrid.appendChild(defaultCard);
    }

    // Catalog avatars (creatures/characters) — coexist with DiceBear. Free ones
    // unlock at level 1; creatures unlock by level as a progression reward.
    renderCatalogAvatars(esc);
  }

  /* Render the human student preset avatars as a character-select lineup.
     Creatures/characters/sports/styles are intentionally retired from the
     picker — students get the polished full-body characters only. */
  function renderCatalogAvatars(esc) {
    const cfg = window.AVATAR_CONFIG || {};
    const items = Object.values(cfg)
      .filter(item => item.group === 'student')
      .sort((a, b) => a.name.localeCompare(b.name));

    items.forEach(item => {
      const card = document.createElement('div');
      card.classList.add('avatar-card', 'student-avatar-card', 'unlocked');
      card.dataset.avatarId = item.id;
      card.dataset.catalog = '1';
      if (currentUser.selectedAvatarId === item.id) {
        card.classList.add('selected');
        selectedAvatarId = item.id;
        completeSelectionBtn.disabled = false;
      }
      // Student presets use absolute image paths (/images/students/…).
      const imgSrc = item.image.charAt(0) === '/' ? item.image : '/images/avatars/' + item.image;
      card.innerHTML =
        '<div class="avatar-card-image"><img src="' + esc(imgSrc) + '" alt="' + esc(item.name) + '" loading="lazy"></div>' +
        '<h4 class="avatar-card-name">' + esc(item.name) + '</h4>';
      // Auto-hide a preset whose art file isn't present (defensive).
      const img = card.querySelector('img');
      if (img) img.addEventListener('error', () => card.remove());
      avatarSelectionGrid.appendChild(card);
    });
  }

  /* Is this id one of the catalog creatures/characters? */
  function isCatalogId(id) {
    return !!(window.AVATAR_CONFIG && window.AVATAR_CONFIG[id]);
  }

  /* -------- INTERACTION HANDLERS -------- */
  avatarSelectionGrid.addEventListener('click', e => {
    const card = e.target.closest('.avatar-card');
    if (!card || card.classList.contains('locked')) return;

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
    completeSelectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving\u2026';
    try {
      // Catalog creatures/characters go through the level-gated endpoint; DiceBear
      // selections (custom / gallery-N / dicebear-default) use the settings PATCH.
      const res = isCatalogId(selectedAvatarId)
        ? await csrfFetch('/api/avatar/select-character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatarId: selectedAvatarId }),
            credentials: 'include'
          })
        : await csrfFetch('/api/user/settings', {
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
      completeSelectionBtn.innerHTML = '<i class="fas fa-times"></i> Save Failed \u2013 Retry';
    }
  });

  /* -------- KICKOFF -------- */
  fetchData();
});
