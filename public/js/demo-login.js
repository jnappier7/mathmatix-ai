const demoGrid = document.getElementById('demo-grid');
const demoError = document.getElementById('demo-error');

demoGrid.addEventListener('click', handleDemoLogin);
demoGrid.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleDemoLogin(e);
  }
});

async function handleDemoLogin(e) {
  const card = e.target.closest('.demo-card');
  if (!card || card.classList.contains('loading')) return;

  const profileId = card.dataset.profile;
  if (!profileId) return;

  // Show loading state
  card.classList.add('loading');
  demoError.style.display = 'none';

  try {
    const response = await csrfFetch('/api/demo/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId }),
      credentials: 'include'
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Redirect to the appropriate dashboard
      window.location.href = result.redirect;
    } else {
      demoError.textContent = result.message || 'Failed to start demo. Please try again.';
      demoError.style.display = 'block';
      card.classList.remove('loading');
    }
  } catch (error) {
    console.error('Demo login error:', error);
    demoError.textContent = 'Connection error. Please check your internet connection and try again.';
    demoError.style.display = 'block';
    card.classList.remove('loading');
  }
}
