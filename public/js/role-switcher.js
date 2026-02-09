/**
 * Role Switcher - Enables multi-role users to switch their active dashboard.
 *
 * Looks for #roleSwitcher (container) and #roleSwitcherSelect (dropdown) in the DOM.
 * Fetches the current user's roles from /user and shows the switcher only when
 * the user has more than one role.
 */
(function () {
  const container = document.getElementById('roleSwitcher');
  const select = document.getElementById('roleSwitcherSelect');
  if (!container || !select) return;

  // Inject minimal styles
  const style = document.createElement('style');
  style.textContent = `
    .role-switcher { display: flex; align-items: center; margin-right: 10px; }
    .role-switcher-select {
      padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.15); color: #fff; font-size: 0.85em;
      cursor: pointer; outline: none; font-weight: 500;
    }
    .role-switcher-select:hover { background: rgba(255,255,255,0.25); }
    .role-switcher-select option { color: #333; background: #fff; }
  `;
  document.head.appendChild(style);

  const roleLabels = {
    admin: 'Admin',
    teacher: 'Teacher',
    parent: 'Parent',
    student: 'Student'
  };

  const roleIcons = {
    admin: 'fa-user-shield',
    teacher: 'fa-chalkboard-teacher',
    parent: 'fa-heart',
    student: 'fa-graduation-cap'
  };

  async function init() {
    try {
      const res = await fetch('/user', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const user = data.user;
      if (!user) return;

      const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
      if (roles.length <= 1) return; // Single-role user, no switcher needed

      // Build options
      select.innerHTML = roles.map(r =>
        `<option value="${r}" ${r === user.role ? 'selected' : ''}>${roleLabels[r] || r}</option>`
      ).join('');

      container.style.display = 'flex';

      select.addEventListener('change', async () => {
        const newRole = select.value;
        if (!newRole) return;
        select.disabled = true;

        try {
          // Use csrfFetch if available (admin/teacher dashboards), otherwise plain fetch
          const fetchFn = typeof csrfFetch === 'function' ? csrfFetch : fetch;
          const res = await fetchFn('/api/user/switch-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role: newRole })
          });
          const result = await res.json();
          if (res.ok && result.success && result.redirect) {
            window.location.href = result.redirect;
          } else {
            alert(result.message || 'Failed to switch role.');
            select.disabled = false;
          }
        } catch (err) {
          alert('Failed to switch role. Please try again.');
          select.disabled = false;
        }
      });
    } catch (err) {
      // Silently fail - role switcher is non-critical
      console.error('Role switcher init error:', err);
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
