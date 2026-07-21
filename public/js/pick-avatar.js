// public/js/pick-avatar.js  –  Full-body character select.
// DiceBear is retired: students choose one of the polished full-body preset
// characters (the `student.*` catalog). No custom builder, no gallery.
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
    } catch (err) {
      console.error('Error fetching initial data:', err);
      avatarSelectionGrid.innerHTML = '<p>Error loading avatars. Please refresh.</p>';
    }
  }

  /* -------- UI RENDER -------- */
  function renderAvatars() {
    if (!avatarSelectionGrid || !currentUser) return;
    avatarSelectionGrid.innerHTML = '';

    // HTML escape helper to prevent XSS from avatar names.
    function esc(str) {
      const el = document.createElement('span');
      el.textContent = str || '';
      return el.innerHTML;
    }

    // The full-body preset character lineup is the only avatar choice.
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
