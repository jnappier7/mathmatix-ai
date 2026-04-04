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
            await loadSubscriptionSection();
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

    // Subscription section in settings
    const subSection = document.getElementById('settings-subscription-section');
    const subDivider = document.getElementById('settings-sub-divider');
    const manageSubBtn = document.getElementById('settings-manage-sub-btn');

    async function loadSubscriptionSection() {
        if (!subSection) return;
        try {
            const res = await fetch('/api/billing/status', { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            if (data.billingEnabled === false) return;

            const statusEl = document.getElementById('settings-sub-status');

            if (data.tier === 'unlimited') {
                subSection.style.display = '';
                if (subDivider) subDivider.style.display = '';
                // Fetch detailed info
                try {
                    const detailRes = await csrfFetch('/api/billing/subscription-details', { credentials: 'include' });
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        const periodEnd = detail.currentPeriodEnd ? new Date(detail.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
                        if (detail.isPaused) {
                            const resumeDate = detail.resumesAt ? new Date(detail.resumesAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
                            statusEl.innerHTML = `<strong style="color:#ffaa00;">Paused</strong> — Resumes ${resumeDate}`;
                        } else if (detail.cancelAtPeriodEnd) {
                            statusEl.innerHTML = `<strong style="color:#ff6b6b;">Cancelling</strong> — Access until ${periodEnd}`;
                        } else {
                            statusEl.innerHTML = `<strong style="color:#4caf50;">Mathmatix+ Active</strong> — Next bill: ${periodEnd}`;
                        }
                    }
                } catch { statusEl.textContent = 'Mathmatix+ Active'; }
            } else if (data.tier === 'free') {
                // For free users, show upgrade prompt in settings
                subSection.style.display = '';
                if (subDivider) subDivider.style.display = '';
                const statusEl2 = document.getElementById('settings-sub-status');
                if (statusEl2) {
                    const mins = data.usage ? Math.floor((data.usage.secondsRemaining || 0) / 60) : '?';
                    statusEl2.innerHTML = `<strong>Free Plan</strong> — ${mins} AI min remaining this week`;
                }
                if (manageSubBtn) {
                    manageSubBtn.innerHTML = '<i class="fas fa-arrow-up"></i> Upgrade to Mathmatix+';
                    manageSubBtn.onclick = () => { window.location.href = '/pricing.html'; };
                }
            }
        } catch (e) {
            console.error('[Settings] Subscription section error:', e);
        }
    }

    if (manageSubBtn) {
        manageSubBtn.addEventListener('click', () => {
            settingsModal.classList.remove('is-visible');
            // Trigger the manage subscription modal from billing module
            if (window.showManageSubscription) {
                window.showManageSubscription();
            } else {
                window.location.href = '/pricing.html';
            }
        });
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

                    // Update UI language in real time
                    if (window.MathmatixI18n) {
                        window.MathmatixI18n.setLanguage(newLanguage);
                    }

                    // Show success message
                    const descEl = preferredLanguageSelect.parentElement.querySelector('.setting-description');
                    const originalHTML = descEl.getAttribute('data-i18n')
                        ? (window.MathmatixI18n && window.MathmatixI18n.t('settings.languageDescription')) || descEl.innerHTML
                        : descEl.innerHTML;
                    descEl.innerHTML = `✅ Language updated to ${newLanguage}!`;

                    setTimeout(() => {
                        descEl.innerHTML = originalHTML;
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
