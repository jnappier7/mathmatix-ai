// settings.js
// User settings functionality including password change

document.addEventListener('DOMContentLoaded', async () => {
    const settingsModal = document.getElementById('settings-modal');
    const openSettingsBtn = document.getElementById('open-settings-modal-btn');
    const closeSettingsBtn = document.getElementById('close-settings-modal-btn');
    const passwordChangeSection = document.getElementById('password-change-section');
    const oauthNotice = document.getElementById('oauth-notice');
    const changePasswordBtn = document.getElementById('change-password-btn');
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmNewPasswordInput = document.getElementById('confirm-new-password');
    const preferredLanguageSelect = document.getElementById('preferredLanguageSetting');

    // Open settings modal
    if (openSettingsBtn && settingsModal) {
        openSettingsBtn.addEventListener('click', async () => {
            settingsModal.classList.add('is-visible');
            await checkPasswordChangeAvailability();
            await loadLanguagePreference();
        });
    }

    // Close settings modal
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('is-visible');
            clearPasswordFields();
        });
    }

    // Close on outside click
    settingsModal?.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('is-visible');
            clearPasswordFields();
        }
    });

    // Check if user can change password (not OAuth account)
    async function checkPasswordChangeAvailability() {
        try {
            const response = await fetch('/api/settings/account-info', {
                credentials: 'include'
            });

            if (!response.ok) {
                console.error('Failed to fetch account info');
                return;
            }

            const data = await response.json();

            if (data.success) {
                if (data.canChangePassword) {
                    passwordChangeSection.style.display = 'block';
                    oauthNotice.style.display = 'none';
                } else {
                    passwordChangeSection.style.display = 'none';
                    oauthNotice.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Error checking password availability:', error);
        }
    }

    // Handle password change
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', async () => {
            const currentPassword = currentPasswordInput.value.trim();
            const newPassword = newPasswordInput.value.trim();
            const confirmNewPassword = confirmNewPasswordInput.value.trim();

            // Validation
            if (!currentPassword || !newPassword || !confirmNewPassword) {
                alert('Please fill in all password fields.');
                return;
            }

            if (newPassword.length < 6) {
                alert('New password must be at least 6 characters long.');
                return;
            }

            if (newPassword !== confirmNewPassword) {
                alert('New password and confirmation do not match.');
                return;
            }

            if (currentPassword === newPassword) {
                alert('New password must be different from current password.');
                return;
            }

            try {
                changePasswordBtn.disabled = true;
                changePasswordBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

                const response = await csrfFetch('/api/settings/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        currentPassword,
                        newPassword
                    })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    alert('✅ ' + result.message);
                    clearPasswordFields();
                    settingsModal.classList.remove('is-visible');
                } else {
                    alert('❌ ' + (result.message || 'Failed to change password'));
                }

            } catch (error) {
                console.error('Password change error:', error);
                alert('❌ Error changing password. Please try again.');
            } finally {
                changePasswordBtn.disabled = false;
                changePasswordBtn.innerHTML = '<i class="fas fa-key"></i> Update Password';
            }
        });
    }

    // Clear password fields
    function clearPasswordFields() {
        if (currentPasswordInput) currentPasswordInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmNewPasswordInput) confirmNewPasswordInput.value = '';
    }

    // Allow Enter key to submit password change
    [currentPasswordInput, newPasswordInput, confirmNewPasswordInput].forEach(input => {
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                changePasswordBtn?.click();
            }
        });
    });

    // Load user's current language preference
    async function loadLanguagePreference() {
        try {
            const response = await fetch('/user', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                if (data.user && data.user.preferredLanguage && preferredLanguageSelect) {
                    preferredLanguageSelect.value = data.user.preferredLanguage;
                }
            }
        } catch (error) {
            console.error('Error loading language preference:', error);
        }
    }

    // Handle language preference change
    if (preferredLanguageSelect) {
        preferredLanguageSelect.addEventListener('change', async () => {
            const newLanguage = preferredLanguageSelect.value;

            try {
                const response = await csrfFetch('/api/user/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ preferredLanguage: newLanguage })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Language preference updated:', newLanguage);

                    // Show success message
                    const originalHTML = preferredLanguageSelect.parentElement.querySelector('.setting-description').innerHTML;
                    preferredLanguageSelect.parentElement.querySelector('.setting-description').innerHTML =
                        `✅ Language updated to ${newLanguage}! This will take effect in your next tutoring session.`;

                    setTimeout(() => {
                        preferredLanguageSelect.parentElement.querySelector('.setting-description').innerHTML = originalHTML;
                    }, 3000);
                } else {
                    alert('Failed to update language preference');
                    await loadLanguagePreference(); // Reload to reset
                }
            } catch (error) {
                console.error('Error updating language preference:', error);
                alert('Error updating language preference');
                await loadLanguagePreference(); // Reload to reset
            }
        });
    }
});
