/* --- /js/student-resources.js --- */
// student-resources.js
// Learning resources display for students — Enhanced UX

console.log('Student Resources JS Loading...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('Student Resources - DOM Ready');

    const openResourcesBtn = document.getElementById('open-resources-modal-btn');
    const resourcesModal = document.getElementById('resources-modal');
    const closeResourcesBtn = document.getElementById('close-resources-modal');
    const resourcesContent = document.getElementById('resources-content');

    // State for filtering (teacherResources always empty — hidden from student view)
    let allResources = { teacherResources: [], myUploads: [], curriculum: null };
    let activeFilter = 'all';
    let searchQuery = '';

    // Open resources modal
    if (openResourcesBtn && resourcesModal) {
        openResourcesBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                resourcesModal.classList.add('is-visible');
                await loadResources();
            } catch (error) {
                console.error('Error opening resources:', error);
            }
        });
    }

    // Close modal handlers
    function closeModal() {
        resourcesModal.classList.remove('is-visible');
    }

    if (closeResourcesBtn) {
        closeResourcesBtn.addEventListener('click', closeModal);
    }

    resourcesModal?.addEventListener('click', (e) => {
        if (e.target === resourcesModal) closeModal();
    });

    // "Ask Tutor About This" button — event delegation
    resourcesContent?.addEventListener('click', (e) => {
        const btn = e.target.closest('.send-to-tutor-btn');
        if (!btn) return;

        const resourceName = btn.dataset.resourceName;
        if (!resourceName) return;

        closeModal();

        const chatInput = document.getElementById('user-input');
        if (chatInput) {
            chatInput.textContent = `Can you help me with "${resourceName}"?`;
            chatInput.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(chatInput);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    });

    // Drag-to-chat: close modal so the chat drop-zone is visible
    resourcesContent?.addEventListener('dragstart', (e) => {
        const card = e.target.closest('[data-resource-id]');
        if (!card) return;

        e.dataTransfer.setData('application/x-teacher-resource-id', card.dataset.resourceId);
        e.dataTransfer.setData('application/x-teacher-resource-name', card.dataset.resourceName);
        e.dataTransfer.setData('application/x-teacher-resource-type', card.dataset.resourceType);
        e.dataTransfer.effectAllowed = 'copy';

        card.style.opacity = '0.5';

        // Collapse the modal after a tiny delay so the drag image is captured first
        setTimeout(() => closeModal(), 50);

        card.addEventListener('dragend', () => { card.style.opacity = ''; }, { once: true });
    });

    // ===== SKELETON LOADING =====
    function showSkeletonLoading() {
        resourcesContent.innerHTML = `
            <div class="resources-skeleton">
                ${Array.from({ length: 4 }, () => `
                    <div class="skeleton-card">
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-lines">
                            <div class="skeleton-line medium"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ===== LOAD RESOURCES =====
    async function loadResources() {
        showSkeletonLoading();

        try {
            const [curriculumRes, uploadsRes] = await Promise.all([
                fetch('/api/curriculum/student/resources', { credentials: 'include' }),
                fetch('/api/student/uploads?limit=10', { credentials: 'include' })
            ]);

            if (!curriculumRes.ok) throw new Error('Failed to fetch curriculum resources');

            const data = await curriculumRes.json();
            let myUploads = [];

            if (uploadsRes.ok) {
                const uploadsData = await uploadsRes.json();
                myUploads = uploadsData.success ? uploadsData.uploads : [];
            }

            // Teacher resources are intentionally hidden from the student view.
            // They are only used by the AI tutor behind the scenes via resourceDetector.
            allResources = { teacherResources: [], myUploads, curriculum: data };
            activeFilter = 'all';
            searchQuery = '';
            renderResources();

        } catch (error) {
            console.error('Error loading resources:', error);
            resourcesContent.innerHTML = `
                <div class="resources-empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #ff4e4e;"></i>
                    <h3>Failed to Load Resources</h3>
                    <p>Please check your connection and try again.</p>
                </div>
            `;
        }
    }

    // ===== RENDER EVERYTHING =====
    function renderResources() {
        const { teacherResources, myUploads, curriculum: data } = allResources;
        const scheduleUrl = data.scheduleUrl || 'https://www.commonplanner.com/sites/tentative-schedule';

        // Count by category for filter chips
        const categoryCounts = {};
        teacherResources.forEach(r => {
            const cat = r.category || 'other';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        // Build search bar + filter chips
        const searchBarHtml = `
            <div class="resources-search-bar">
                <div class="resources-search-input-wrap">
                    <input type="text" class="resources-search-input" id="resources-search"
                        placeholder="Search resources..." value="${searchQuery}" autocomplete="off" />
                    <i class="fas fa-search"></i>
                </div>
                ${Object.keys(categoryCounts).length > 0 ? `
                    <div class="resources-filter-chips">
                        <button class="resources-filter-chip ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">
                            All <span class="chip-count">${teacherResources.length + myUploads.length}</span>
                        </button>
                        ${Object.entries(categoryCounts).map(([cat, count]) => `
                            <button class="resources-filter-chip ${activeFilter === cat ? 'active' : ''}" data-filter="${cat}">
                                ${categoryLabel(cat)} <span class="chip-count">${count}</span>
                            </button>
                        `).join('')}
                        ${myUploads.length > 0 ? `
                            <button class="resources-filter-chip ${activeFilter === 'uploads' ? 'active' : ''}" data-filter="uploads">
                                My Uploads <span class="chip-count">${myUploads.length}</span>
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;

        // Filter teacher resources
        let filteredTeacher = teacherResources;
        let filteredUploads = myUploads;

        if (activeFilter !== 'all' && activeFilter !== 'uploads') {
            filteredTeacher = teacherResources.filter(r => (r.category || 'other') === activeFilter);
            filteredUploads = [];
        } else if (activeFilter === 'uploads') {
            filteredTeacher = [];
        }

        // Apply search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filteredTeacher = filteredTeacher.filter(r =>
                r.displayName.toLowerCase().includes(q) ||
                (r.description || '').toLowerCase().includes(q) ||
                (r.keywords || []).some(k => k.toLowerCase().includes(q))
            );
            filteredUploads = filteredUploads.filter(u =>
                u.originalFilename.toLowerCase().includes(q)
            );
        }

        // Build body sections
        let bodyHtml = '<div class="resources-body">';

        // Schedule section
        bodyHtml += `
            <div class="resources-section">
                <div class="resources-section-header">
                    <i class="fas fa-calendar-alt" style="color: #12B3B3;"></i>
                    ${data.scheduleUrl ? 'Your Class Schedule' : 'Tentative Schedule'}
                </div>
                <div class="schedule-iframe-container">
                    <iframe src="${scheduleUrl}" title="Common Curriculum Schedule" loading="lazy"></iframe>
                </div>
                <p style="margin: 10px 0 0; font-size: 12px; color: #888; text-align: center;">
                    <i class="fas fa-info-circle"></i> View the full curriculum schedule and click links to explore resources
                </p>
            </div>
        `;

        // Current lesson banner (if available)
        if (data.hasResources && data.currentLesson) {
            const lesson = data.currentLesson;
            bodyHtml += `
                <div class="resources-lesson-banner">
                    <div>
                        <h3><i class="fas fa-calendar-check"></i> Week ${lesson.weekNumber}: ${lesson.topic}</h3>
                        ${lesson.startDate && lesson.endDate ? `
                            <p>${new Date(lesson.startDate).toLocaleDateString()} - ${new Date(lesson.endDate).toLocaleDateString()}</p>
                        ` : ''}
                        ${lesson.standards && lesson.standards.length > 0 ? `
                            <p><strong>Standards:</strong> ${lesson.standards.join(', ')}</p>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // Teacher resources section
        if (filteredTeacher.length > 0) {
            bodyHtml += `
                <div class="resources-section">
                    <div class="resources-section-header">
                        <i class="fas fa-chalkboard-teacher" style="color: #27ae60;"></i>
                        Teacher Resources
                        <span class="section-count">${filteredTeacher.length}</span>
                    </div>
                    <div class="resources-grid">
                        ${filteredTeacher.map(resource => renderTeacherResourceCard(resource)).join('')}
                    </div>
                </div>
            `;
        }

        // Curriculum resources (videos, PDFs, other)
        if (data.hasResources && data.currentLesson && activeFilter === 'all' && !searchQuery) {
            const lesson = data.currentLesson;
            const videos = [];
            const pdfs = [];
            const other = [];

            lesson.resources.forEach(url => {
                if (url.includes('.mp4') || url.includes('youtube.com') || url.includes('vimeo.com')) {
                    videos.push(url);
                } else if (url.includes('.pdf')) {
                    pdfs.push(url);
                } else {
                    other.push(url);
                }
            });

            if (videos.length > 0) {
                bodyHtml += renderUrlResourceSection('Lesson Videos', 'fas fa-video', '#9b51e0', videos, 'video');
            }
            if (pdfs.length > 0) {
                bodyHtml += renderUrlResourceSection('Worksheets & Handouts', 'fas fa-file-pdf', '#ff4e4e', pdfs, 'pdf');
            }
            if (other.length > 0) {
                bodyHtml += renderUrlResourceSection('Other Resources', 'fas fa-link', '#12B3B3', other, 'other');
            }
        }

        // My uploads section
        if (filteredUploads.length > 0) {
            bodyHtml += `
                <div class="resources-section">
                    <div class="resources-section-header">
                        <i class="fas fa-folder-open" style="color: #FF9800;"></i>
                        My Uploads
                        <span class="section-count">${filteredUploads.length}</span>
                    </div>
                    <div class="resources-grid">
                        ${filteredUploads.map(upload => renderUploadCard(upload)).join('')}
                    </div>
                </div>
            `;
        }

        // No results
        if (filteredTeacher.length === 0 && filteredUploads.length === 0 && (searchQuery || activeFilter !== 'all')) {
            bodyHtml += `
                <div class="resources-no-results">
                    <i class="fas fa-search"></i>
                    <p>No resources match your ${searchQuery ? 'search' : 'filter'}. Try a different ${searchQuery ? 'term' : 'category'}.</p>
                </div>
            `;
        }

        // Empty state (no resources at all)
        if (myUploads.length === 0 && !data.hasResources) {
            bodyHtml += `
                <div class="resources-empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>No Resources Yet</h3>
                    <p>${data.currentTopic ? `You're studying: <strong>${data.currentTopic}</strong>` : 'No resources available yet.'}</p>
                    <p style="margin-top: 8px;">Resources like worksheets, videos, and practice problems will appear here.</p>
                </div>
            `;
        }

        // Tip bar
        if (myUploads.length > 0 || data.hasResources) {
            bodyHtml += `
                <div class="resources-tip">
                    <i class="fas fa-lightbulb"></i>
                    <span><strong>Tip:</strong> Mention any resource by name in the chat and your AI tutor will help you work through it!</span>
                </div>
            `;
        }

        bodyHtml += '</div>';

        resourcesContent.innerHTML = searchBarHtml + bodyHtml;

        // Wire up search
        const searchInput = document.getElementById('resources-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                renderResources();
                // Re-focus and restore cursor
                const newInput = document.getElementById('resources-search');
                if (newInput) {
                    newInput.focus();
                    newInput.selectionStart = newInput.selectionEnd = newInput.value.length;
                }
            });
        }

        // Wire up filter chips
        resourcesContent.querySelectorAll('.resources-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                activeFilter = chip.dataset.filter;
                renderResources();
            });
        });
    }

    // ===== RENDER HELPERS =====

    function renderTeacherResourceCard(resource) {
        const iconClass = getIconBadgeClass(resource.fileType);
        const iconFA = getFileIcon(resource.fileType);
        const catLabel = categoryLabel(resource.category);
        const catClass = 'cat-' + (resource.category || 'other');
        const escapedName = resource.displayName.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="resource-card-wrapper"
                 draggable="true"
                 data-resource-id="${resource.id}"
                 data-resource-name="${escapedName}"
                 data-resource-type="${resource.fileType}"
                 data-category="${resource.category || 'other'}"
                 title="Drag to chat to share with your tutor">
                <a href="/api/teacher-resources/download/${resource.id}" target="_blank" class="resource-link">
                    <div class="resource-icon-badge ${iconClass}">
                        <i class="fas ${iconFA}"></i>
                    </div>
                    <div class="resource-info-text">
                        <div class="resource-name">${resource.displayName}</div>
                        <div class="resource-meta-row">
                            <span class="resource-category-badge ${catClass}">${catLabel}</span>
                            <span>${resource.fileType.toUpperCase()}</span>
                            <span>&bull;</span>
                            <span>${formatFileSize(resource.fileSize)}</span>
                            <span>&bull;</span>
                            <span>${formatDate(resource.uploadedAt)}</span>
                        </div>
                        ${resource.description ? `<div class="resource-description-text">${resource.description}</div>` : ''}
                    </div>
                    <div class="resource-actions-col">
                        <i class="fas fa-download" title="Download"></i>
                        <i class="fas fa-grip-vertical" style="font-size: 11px; color: #ccc;" title="Drag to chat"></i>
                    </div>
                </a>
                <button class="send-to-tutor-btn" data-resource-name="${escapedName}" title="Share with your AI tutor">
                    <i class="fas fa-comment-dots"></i> Ask Tutor About This
                </button>
            </div>
        `;
    }

    function renderUploadCard(upload) {
        const iconClass = upload.fileType === 'pdf' ? 'icon-pdf' : 'icon-image';
        const iconFA = upload.fileType === 'pdf' ? 'fa-file-pdf' : 'fa-image';

        return `
            <div class="resource-card-wrapper">
                <a href="/api/student/uploads/${upload._id}/file" target="_blank" class="resource-link">
                    <div class="resource-icon-badge ${iconClass}">
                        <i class="fas ${iconFA}"></i>
                    </div>
                    <div class="resource-info-text">
                        <div class="resource-name">${upload.originalFilename}</div>
                        <div class="resource-meta-row">
                            <span>${formatFileSize(upload.fileSize)}</span>
                            <span>&bull;</span>
                            <span>${formatDate(upload.uploadedAt)}</span>
                        </div>
                    </div>
                    <div class="resource-actions-col">
                        <i class="fas fa-external-link-alt"></i>
                    </div>
                </a>
            </div>
        `;
    }

    function renderUrlResourceSection(title, iconClass, iconColor, urls, type) {
        return `
            <div class="resources-section">
                <div class="resources-section-header">
                    <i class="${iconClass}" style="color: ${iconColor};"></i>
                    ${title}
                    <span class="section-count">${urls.length}</span>
                </div>
                <div class="resources-grid">
                    ${urls.map(url => {
                        const fileName = url.split('/').pop();
                        const ft = getFileType(url);
                        const badgeClass = type === 'video' ? 'icon-video' : type === 'pdf' ? 'icon-pdf' : 'icon-default';
                        return `
                            <div class="resource-card-wrapper">
                                <a href="${url}" target="_blank" class="resource-link">
                                    <div class="resource-icon-badge ${badgeClass}">
                                        <i class="${ft.icon}"></i>
                                    </div>
                                    <div class="resource-info-text">
                                        <div class="resource-name">${fileName}</div>
                                        <div class="resource-meta-row">
                                            <span>Click to ${type === 'video' ? 'watch' : 'open'}</span>
                                        </div>
                                    </div>
                                    <div class="resource-actions-col">
                                        <i class="fas fa-external-link-alt"></i>
                                    </div>
                                </a>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // ===== UTILITY FUNCTIONS =====

    function getFileIcon(fileType) {
        const icons = {
            'pdf': 'fa-file-pdf', 'doc': 'fa-file-word', 'docx': 'fa-file-word',
            'ppt': 'fa-file-powerpoint', 'pptx': 'fa-file-powerpoint',
            'jpg': 'fa-file-image', 'jpeg': 'fa-file-image', 'png': 'fa-file-image',
            'webp': 'fa-file-image', 'heic': 'fa-file-image'
        };
        return icons[fileType?.toLowerCase()] || 'fa-file';
    }

    function getIconBadgeClass(fileType) {
        const map = {
            'pdf': 'icon-pdf', 'doc': 'icon-doc', 'docx': 'icon-doc',
            'ppt': 'icon-ppt', 'pptx': 'icon-ppt',
            'jpg': 'icon-image', 'jpeg': 'icon-image', 'png': 'icon-image',
            'webp': 'icon-image', 'heic': 'icon-image'
        };
        return map[fileType?.toLowerCase()] || 'icon-default';
    }

    function getFileType(url) {
        if (url.includes('.docx') || url.includes('.doc')) return { icon: 'fas fa-file-word', color: '#2b7cd3' };
        if (url.includes('.pptx') || url.includes('.ppt')) return { icon: 'fas fa-file-powerpoint', color: '#d24726' };
        if (url.includes('.mp4') || url.includes('youtube.com') || url.includes('vimeo.com')) return { icon: 'fas fa-video', color: '#9b51e0' };
        if (url.includes('.pdf')) return { icon: 'fas fa-file-pdf', color: '#ff4e4e' };
        if (url.includes('drive.google.com')) return { icon: 'fab fa-google-drive', color: '#12B3B3' };
        return { icon: 'fas fa-link', color: '#666' };
    }

    function categoryLabel(cat) {
        const labels = {
            'worksheet': 'Worksheet', 'practice': 'Practice', 'homework': 'Homework',
            'notes': 'Notes', 'test': 'Test', 'quiz': 'Quiz',
            'handout': 'Handout', 'other': 'Resource'
        };
        return labels[cat] || 'Resource';
    }

    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }
});

;
/* --- /js/settings.js --- */
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

;
/* --- /js/show-your-work.js --- */
// ============================================
// SHOW YOUR WORK — AI WORK ANALYSIS (v2)
// Feedback-first: no grades, just analysis
// ============================================

class ShowYourWorkManager {
    constructor() {
        // Modal shell
        this.modal = document.getElementById('show-your-work-modal');
        // (camera-button is now owned by unified-upload.js — this modal is
        // opened programmatically as the "full view" of a result, see init().)
        this.closeBtn = document.getElementById('close-show-your-work-modal');

        // Sections (capture → preview → loading → results)
        this.captureSection = document.getElementById('syw-capture-section');
        this.previewSection = document.getElementById('syw-preview-section');
        this.loadingSection = document.getElementById('syw-loading-section');
        this.resultsSection = document.getElementById('syw-results-section');

        // Capture controls
        this.takePhotoBtn = document.getElementById('syw-take-photo-btn');
        this.uploadPhotoBtn = document.getElementById('syw-upload-photo-btn');
        this.fileInput = document.getElementById('syw-file-input');
        this.cameraInput = document.getElementById('syw-camera-input');

        // Preview elements
        this.previewImage = document.getElementById('syw-preview-image');
        this.retakeBtn = document.getElementById('syw-retake-btn');
        this.submitBtn = document.getElementById('syw-submit-btn');

        // Results container (dynamically filled)
        this.resultsContainer = document.getElementById('syw-results-container');
        this.tryAgainBtn = document.getElementById('syw-try-again-btn');
        this.askTutorBtn = document.getElementById('syw-ask-tutor-btn');
        this.viewHistoryBtn = document.getElementById('syw-view-history-btn');

        // State
        this.currentFile = null;
        this.currentImageData = null;
        this.analysisResult = null;
        this.lastResultId = null; // Tracks the last grading result for re-attempt flow
        this.cameraStream = null;
        this.currentFacingMode = 'environment';

        this.init();
    }

    // ----------------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------------

    init() {
        if (!this.modal) return;

        // NOTE: the camera button no longer opens this modal directly. The
        // unified-upload entry (unified-upload.js) owns the capture menu and
        // routes images to the smart upload card. This modal is now opened
        // programmatically as the "full view" of a work-check result, and via
        // the inline card's "Open full view" button — not as a front door.
        this.closeBtn?.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });

        this.takePhotoBtn?.addEventListener('click', () => this.openLiveCamera());
        this.uploadPhotoBtn?.addEventListener('click', () => this.fileInput?.click());
        this.cameraInput?.addEventListener('change', (e) => this.handleFileSelect(e));
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

        this.retakeBtn?.addEventListener('click', () => this.resetToCapture());
        this.submitBtn?.addEventListener('click', () => this.submitForAnalysis());

        this.tryAgainBtn?.addEventListener('click', () => this.resetToCapture());
        this.askTutorBtn?.addEventListener('click', () => this.askTutorAboutWork());
        this.viewHistoryBtn?.addEventListener('click', () => this.showHistory());
    }

    // ----------------------------------------------------------------
    // MODAL LIFECYCLE
    // ----------------------------------------------------------------

    openModal() {
        this.modal?.classList.add('is-visible');
        this.resetToCapture();
    }

    closeModal() {
        this.modal?.classList.remove('is-visible');
        this.stopCamera();
        this.resetToCapture();
    }

    showSection(section) {
        [this.captureSection, this.previewSection, this.loadingSection, this.resultsSection]
            .forEach(s => { if (s) s.style.display = 'none'; });
        if (section) section.style.display = 'block';
    }

    resetToCapture() {
        this.showSection(this.captureSection);
        this.stopCamera();
        this.currentFile = null;
        this.currentImageData = null;
        this.analysisResult = null;
        this.lastResultId = null; // Clear re-attempt chain on full reset
        if (this.previewImage) {
            this.previewImage.src = '';
            this.previewImage.style.display = 'none';
        }
        if (this.fileInput) this.fileInput.value = '';
        if (this.cameraInput) this.cameraInput.value = '';

        document.getElementById('syw-live-camera-section')?.remove();
    }

    // ----------------------------------------------------------------
    // FILE HANDLING
    // ----------------------------------------------------------------

    async handleFileSelect(e) {
        const file = e.target?.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';

        if (!isImage && !isPDF) {
            this.showToast('Please select an image or PDF file', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('File is too large. Maximum size is 10 MB.', 'error');
            return;
        }

        this.currentFile = file;

        if (isImage) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                this.currentImageData = ev.target.result;
                this.previewImage.src = ev.target.result;
                this.previewImage.style.display = 'block';
                this.hidePdfPreview();
                this.showSection(this.previewSection);
            };
            reader.readAsDataURL(file);
        } else if (isPDF) {
            await this.renderPDFPreview(file);
        }
    }

    hidePdfPreview() {
        const pdfCanvas = document.getElementById('syw-preview-pdf-canvas');
        const pdfInfo = document.getElementById('syw-pdf-info');
        if (pdfCanvas) pdfCanvas.style.display = 'none';
        if (pdfInfo) pdfInfo.style.display = 'none';
    }

    async renderPDFPreview(file) {
        if (typeof window.pdfjsLib === 'undefined') {
            this.showToast('PDF viewer is not available. Please upload an image instead.', 'info');
            return;
        }
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);

            const canvas = document.getElementById('syw-preview-pdf-canvas');
            const ctx = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: 2.0 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;

            this.currentImageData = canvas.toDataURL('image/png');
            canvas.style.display = 'block';
            this.previewImage.style.display = 'none';

            const pdfInfo = document.getElementById('syw-pdf-info');
            const pdfPagesInfo = document.getElementById('syw-pdf-pages-info');
            if (pdfInfo) pdfInfo.style.display = 'block';
            if (pdfPagesInfo) pdfPagesInfo.textContent = `Page 1 of ${pdf.numPages}`;

            this.showSection(this.previewSection);
        } catch (err) {
            console.error('PDF rendering error:', err);
            this.showToast('Failed to load PDF preview, but you can still submit it for analysis.', 'info');
            // Even if preview fails, the original file is still valid for submission
            this.showSection(this.previewSection);
        }
    }

    // ----------------------------------------------------------------
    // SUBMISSION
    // ----------------------------------------------------------------

    async submitForAnalysis() {
        if (!this.currentFile) {
            this.showToast('Please select an image or PDF first', 'info');
            return;
        }

        try {
            this.showSection(this.loadingSection);
            this.showProgressMessages();

            // Always send the original file — the backend handles both images and PDFs.
            // Previously PDFs were converted to a page-1 PNG screenshot, losing all other pages.
            const formData = new FormData();
            formData.append('file', this.currentFile);

            // Re-attempt: link to previous result so server can track improvement
            if (this.lastResultId) {
                formData.append('previousAttemptId', this.lastResultId);
            }

            const response = await csrfFetch('/api/grade-work', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                let errorMsg = 'Failed to analyze work';
                if (response.status === 429) {
                    errorMsg = 'Too many requests. Please wait a moment and try again.';
                } else {
                    try { const err = await response.json(); errorMsg = err.message || errorMsg; } catch {}
                }
                throw new Error(errorMsg);
            }

            const result = await response.json();
            this.analysisResult = result;
            this.lastResultId = result.id || null; // Track for next re-attempt
            this.displayResults(result);

            // Show unplugged badge celebration if any were earned
            if (result.unpluggedBadgesEarned && result.unpluggedBadgesEarned.length > 0) {
                this.showUnpluggedBadgeCelebration(result.unpluggedBadgesEarned);
            }

        } catch (error) {
            console.error('Analysis error:', error);
            this.showToast(error.message || 'Something went wrong. Please try again.', 'error', 7000);
            this.resetToCapture();
        }
    }

    // ----------------------------------------------------------------
    // PROGRESS INDICATOR
    // ----------------------------------------------------------------

    showProgressMessages() {
        if (!this.loadingSection) return;

        const isPDF = this.currentFile?.type === 'application/pdf';
        const messages = isPDF
            ? [
                { text: "Extracting text from your PDF...", delay: 0 },
                { text: "Reading each problem carefully...", delay: 3000 },
                { text: "Solving each problem to check your answers...", delay: 6000 },
                { text: "Writing personalized feedback...", delay: 10000 }
            ]
            : [
                { text: "Reading your work...", delay: 0 },
                { text: "Solving each problem to check your answers...", delay: 2000 },
                { text: "Analyzing your approach step by step...", delay: 4500 },
                { text: "Writing personalized feedback...", delay: 7000 }
            ];

        this.loadingSection.innerHTML = `
            <div class="syw-loading-inner">
                <div class="syw-spinner"></div>
                <div id="syw-progress-msg" class="syw-progress-msg"></div>
            </div>
        `;

        const msgEl = document.getElementById('syw-progress-msg');
        messages.forEach(({ text, delay }) => {
            setTimeout(() => {
                if (msgEl) {
                    msgEl.style.opacity = '0';
                    setTimeout(() => {
                        msgEl.textContent = text;
                        msgEl.style.opacity = '1';
                    }, 150);
                }
            }, delay);
        });
    }

    // ----------------------------------------------------------------
    // RESULTS DISPLAY — feedback-first, no scores
    // ----------------------------------------------------------------

    displayResults(result) {
        this.showSection(this.resultsSection);
        if (!this.resultsContainer) return;

        // If no student work was detected, show a friendly nudge — not a grading result
        if (result.noWorkDetected) {
            this.resultsContainer.innerHTML = `
                <div class="syw-summary-header">
                    <div class="syw-no-work-message" style="text-align: center; padding: 20px;">
                        <i class="fas fa-pencil-alt" style="font-size: 2em; color: #8b5cf6; margin-bottom: 10px;"></i>
                        <h3>Give it a try first!</h3>
                        <p>${this.escapeHtml(result.overallFeedback || "I can see your worksheet but it looks like you haven't started yet. Work through the problems first, then send me another photo and I'll check your work!")}</p>
                    </div>
                </div>
            `;
            return;
        }

        const total = result.problemCount || 0;
        const correct = result.correctCount || 0;
        const allCorrect = total > 0 && correct === total;
        const imp = result.improvement;
        const attempt = result.attemptNumber || 1;

        this.resultsContainer.innerHTML = `
            <!-- Improvement banner (shown on re-attempts) -->
            ${imp ? `<div class="syw-improvement-banner ${imp.improved ? 'syw-improved' : 'syw-no-change'}" style="padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; text-align: center; font-weight: 600; ${imp.improved ? 'background: linear-gradient(135deg, #d4edda, #c3e6cb); color: #155724;' : 'background: #fff3cd; color: #856404;'}">
                ${imp.improved
                    ? `Attempt #${attempt}: ${imp.previousCorrect}/${imp.previousTotal} → ${correct}/${total} — Nice improvement!`
                    : `Attempt #${attempt}: Keep at it! Review the feedback and try again.`}
            </div>` : ''}

            <!-- Summary header -->
            <div class="syw-summary-header ${allCorrect ? 'syw-all-correct' : ''}">
                <div class="syw-summary-counts">
                    <span class="syw-count-correct">${correct}</span>
                    <span class="syw-count-sep">of</span>
                    <span class="syw-count-total">${total}</span>
                    <span class="syw-count-label">correct</span>
                </div>
                ${result.whatWentWell ? `<div class="syw-went-well">${this.escapeHtml(result.whatWentWell)}</div>` : ''}
                <div class="syw-xp-badge">+${result.xpEarned || 0} XP</div>
            </div>

            <!-- Per-problem feedback cards -->
            <div class="syw-problems-list">
                <h4 class="syw-section-title"><i class="fas fa-list-ol"></i> Problem-by-Problem Feedback</h4>
                ${(result.problems || []).map(p => this.renderProblemCard(p)).join('')}
            </div>

            <!-- Overall feedback -->
            <div class="syw-overall-feedback">
                <h4 class="syw-section-title"><i class="fas fa-comment-alt"></i> Overall</h4>
                <div class="syw-overall-feedback-body">${this.renderMath(result.overallFeedback || '')}</div>
            </div>

            <!-- Practice recommendations -->
            ${result.practiceRecommendations?.length ? `
            <div class="syw-practice-recs">
                <h4 class="syw-section-title"><i class="fas fa-dumbbell"></i> What to Practice</h4>
                <ul>
                    ${result.practiceRecommendations.map(r => `<li>${this.escapeHtml(r)}</li>`).join('')}
                </ul>
            </div>` : ''}

            ${!allCorrect ? `<div class="syw-resubmit-cta" style="text-align: center; padding: 16px; margin-top: 8px;">
                <p style="color: #6b7280; margin-bottom: 10px;">Fix your mistakes, then snap another photo!</p>
                <button id="syw-fix-resubmit-btn" class="syw-btn syw-btn-primary" style="font-size: 1em; padding: 10px 24px;">
                    <i class="fas fa-redo"></i> Fix & Resubmit
                </button>
            </div>` : ''}
        `;

        // Bind re-submit button (keeps lastResultId so server tracks improvement)
        document.getElementById('syw-fix-resubmit-btn')?.addEventListener('click', () => {
            // lastResultId is already set — resetToCapture preserves it
            this.showSection(this.captureSection);
        });

        // Render any LaTeX in the feedback
        this.typesetMath(this.resultsContainer);

        // Bind per-problem "Ask my tutor about this" buttons inside the modal
        this.resultsContainer.querySelectorAll('.syw-ask-tutor-problem').forEach(btn => {
            btn.addEventListener('click', () => {
                const num = btn.dataset.problem;
                const isUnsure = btn.dataset.unsure === 'true';
                const msg = isUnsure
                    ? `Can we go over problem #${num} together? You weren't sure about it.`
                    : `Can you help me with problem #${num}? I got it wrong.`;
                this.closeModal();
                this.sendChatMessage(msg);
            });
        });

        // Render the same breakdown inline in chat so it stays visible
        // alongside the conversation. Skip if this is just a re-render
        // of a result already shown in chat (avoid duplicate cards).
        if (!this._renderedInChatIds) this._renderedInChatIds = new Set();
        if (result.id && !this._renderedInChatIds.has(result.id)) {
            this._renderedInChatIds.add(result.id);
            this.addWorkSnippetToChat(result);
        }
    }

    renderProblemCard(problem) {
        const correct = problem.isCorrect;
        const isUnsure = correct === null || correct === undefined;

        // Error details are shown collapsed — feedback is the primary content
        const hasErrors = problem.errors && problem.errors.length > 0;
        const errorsHtml = hasErrors ? (problem.errors || []).map(e => `
            <div class="syw-error-item">
                <span class="syw-error-badge">${this.escapeHtml(e.category || 'error')}</span>
                ${e.step ? `<strong>${this.escapeHtml(e.step)}:</strong> ` : ''}
                ${this.renderMath(e.description || '')}
            </div>
        `).join('') : '';

        // Pre-render LaTeX+markdown via the same pipeline chat messages use.
        // Inserting raw LaTeX into innerHTML is fragile — HTML-special chars
        // like < in math (e.g. \(x < 5\)) break the parser and leave LaTeX
        // as unrendered text.  renderMath() produces safe, pre-rendered HTML.
        const statement = this.renderMath(problem.problemStatement || '');
        const feedback  = this.renderMath(problem.feedback || '');
        const strengths = this.renderMath(problem.strengths || '');
        const answer    = this.renderMath(problem.studentAnswer || '—');

        const cardClass = isUnsure ? 'syw-problem-unsure' : (correct ? 'syw-problem-correct' : 'syw-problem-incorrect');
        const statusClass = isUnsure ? 'syw-status-unsure' : (correct ? 'syw-status-correct' : 'syw-status-incorrect');
        const statusText = isUnsure ? "Let's discuss" : (correct ? 'Got it' : 'Take another look');

        return `
        <div class="syw-problem-card ${cardClass}">
            <div class="syw-problem-header">
                <span class="syw-problem-num">Problem ${problem.problemNumber}</span>
                <span class="syw-problem-status ${statusClass}">
                    ${statusText}
                </span>
            </div>
            ${statement ? `<div class="syw-problem-statement">${statement}</div>` : ''}

            ${feedback ? `<div class="syw-problem-feedback">${feedback}</div>` : ''}

            ${strengths ? `<div class="syw-strengths">${strengths}</div>` : ''}

            <!-- Answers shown below feedback -->
            <div class="syw-problem-answers">
                <div class="syw-answer-row">
                    <span class="syw-answer-label">Your answer:</span>
                    <div class="syw-answer-value">${answer}</div>
                </div>
                ${isUnsure ? `<div class="syw-answer-row">
                    <span class="syw-answer-label">Next step:</span>
                    <div class="syw-answer-value">Let's talk through this one in chat — I want to make sure I'm reading your work right.</div>
                </div>` : ''}
                ${!correct && !isUnsure ? `<div class="syw-answer-row">
                    <span class="syw-answer-label">Hint:</span>
                    <div class="syw-answer-value">Check the feedback above and try again!</div>
                </div>` : ''}
            </div>

            ${errorsHtml ? `<details class="syw-error-details"><summary>Error details</summary>${errorsHtml}</details>` : ''}

            ${!correct ? `<button class="syw-ask-tutor-problem" data-problem="${this.escapeHtml(problem.problemNumber)}" data-statement="${this.escapeHtml(problem.problemStatement || '')}" data-unsure="${isUnsure}">
                <i class="fas fa-comment-dots"></i> Ask my tutor about this
            </button>` : ''}
        </div>`;
    }

    // ----------------------------------------------------------------
    // LIVE CAMERA
    // ----------------------------------------------------------------

    async openLiveCamera() {
        try {
            const section = document.createElement('div');
            section.id = 'syw-live-camera-section';
            section.className = 'syw-live-camera-overlay';
            section.innerHTML = `
                <div class="syw-camera-header">
                    <h3><i class="fas fa-camera"></i> Camera Preview</h3>
                    <div class="syw-camera-header-actions">
                        <button id="syw-toggle-grid-btn" class="syw-cam-btn syw-cam-btn-ghost">
                            <i class="fas fa-th"></i> Grid
                        </button>
                        <button id="syw-close-camera-btn" class="syw-cam-btn syw-cam-btn-ghost">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                </div>
                <div class="syw-camera-viewfinder">
                    <video id="syw-camera-video" autoplay playsinline></video>
                    <div id="syw-camera-grid" class="syw-camera-grid" style="display:none">
                        <svg width="100%" height="100%" style="opacity:0.5">
                            <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#8b5cf6" stroke-width="2" rx="8"/>
                        </svg>
                    </div>
                    <div id="syw-camera-flash" class="syw-camera-flash"></div>
                    <div id="syw-camera-loading" class="syw-camera-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <div>Starting camera...</div>
                    </div>
                </div>
                <div class="syw-camera-footer">
                    <button id="syw-switch-camera-btn" class="syw-cam-btn syw-cam-btn-ghost">
                        <i class="fas fa-sync-alt"></i> Switch
                    </button>
                    <button id="syw-capture-photo-btn" class="syw-cam-btn syw-cam-btn-primary">
                        <i class="fas fa-camera"></i> Capture
                    </button>
                </div>
            `;
            document.body.appendChild(section);

            document.getElementById('syw-close-camera-btn').addEventListener('click', () => {
                this.stopCamera();
                section.remove();
            });
            document.getElementById('syw-switch-camera-btn').addEventListener('click', () => this.switchCamera());
            document.getElementById('syw-capture-photo-btn').addEventListener('click', () => this.capturePhoto());
            document.getElementById('syw-toggle-grid-btn').addEventListener('click', () => {
                const grid = document.getElementById('syw-camera-grid');
                grid.style.display = grid.style.display === 'none' ? 'block' : 'none';
            });

            await this.startCamera();
        } catch (err) {
            console.error('Failed to open camera:', err);
            this.showToast('Unable to access camera. Check permissions or use the upload option.', 'error');
        }
    }

    async startCamera() {
        this.stopCamera();
        const constraints = {
            video: { facingMode: this.currentFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        };
        this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = document.getElementById('syw-camera-video');
        if (video) {
            video.srcObject = this.cameraStream;
            const loading = document.getElementById('syw-camera-loading');
            if (loading) loading.style.display = 'none';
        }
    }

    async switchCamera() {
        this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        try {
            await this.startCamera();
        } catch (_) {
            this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        }
    }

    capturePhoto() {
        const video = document.getElementById('syw-camera-video');
        const flash = document.getElementById('syw-camera-flash');
        if (!video || !this.cameraStream) return;

        if (flash) {
            flash.classList.add('syw-flash-active');
            setTimeout(() => flash.classList.remove('syw-flash-active'), 400);
        }
        if ('vibrate' in navigator) navigator.vibrate(50);

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            this.currentFile = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
            this.currentImageData = canvas.toDataURL('image/jpeg', 0.92);

            setTimeout(() => {
                this.stopCamera();
                document.getElementById('syw-live-camera-section')?.remove();

                this.previewImage.src = this.currentImageData;
                this.previewImage.style.display = 'block';
                this.hidePdfPreview();
                this.showSection(this.previewSection);
            }, 250);
        }, 'image/jpeg', 0.92);
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(t => t.stop());
            this.cameraStream = null;
        }
    }

    // ----------------------------------------------------------------
    // ANALYSIS HISTORY
    // ----------------------------------------------------------------

    async showHistory() {
        try {
            const res = await csrfFetch('/api/grade-work/history', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load history');
            const data = await res.json();

            if (!data.results || data.results.length === 0) {
                this.showToast('No analysis history yet. Submit some work first!', 'info');
                return;
            }

            this.showSection(this.resultsSection);
            if (!this.resultsContainer) return;

            this.resultsContainer.innerHTML = `
                <h4 class="syw-section-title"><i class="fas fa-history"></i> Past Analyses</h4>
                <div class="syw-history-list">
                    ${data.results.map(r => {
                        const date = new Date(r.createdAt).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric'
                        });
                        return `
                        <div class="syw-history-item" data-id="${r.id}">
                            <div class="syw-history-counts">
                                <span class="syw-count-correct">${r.correctCount}</span>/<span class="syw-count-total">${r.problemCount}</span>
                            </div>
                            <div class="syw-history-info">
                                <div>${r.correctCount} of ${r.problemCount} correct</div>
                                <div class="syw-history-date">${date}</div>
                                ${r.teacherComment ? `<div class="syw-history-teacher-comment">${this.escapeHtml(r.teacherComment)}</div>` : ''}
                            </div>
                            <div class="syw-history-xp">+${r.xpEarned} XP</div>
                        </div>`;
                    }).join('')}
                </div>
                <button class="syw-btn syw-btn-secondary" id="syw-back-from-history">Back</button>
            `;

            document.getElementById('syw-back-from-history')?.addEventListener('click', () => this.resetToCapture());

            this.resultsContainer.querySelectorAll('.syw-history-item').forEach(item => {
                item.addEventListener('click', () => this.loadHistoryDetail(item.dataset.id));
            });
        } catch (err) {
            console.error('History error:', err);
            this.showToast('Could not load analysis history.', 'error');
        }
    }

    async loadHistoryDetail(id) {
        try {
            const res = await csrfFetch(`/api/grade-work/${id}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load result');
            const data = await res.json();

            this.analysisResult = data.result;
            this.currentImageData = null;
            this.displayResults(data.result);
        } catch (err) {
            console.error('Detail error:', err);
            this.showToast('Could not load analysis details.', 'error');
        }
    }

    // ----------------------------------------------------------------
    // CHAT INTEGRATION
    // ----------------------------------------------------------------

    addWorkSnippetToChat(result) {
        const chatContainer = document.getElementById('chat-messages-container')
            || document.getElementById('chat-messages');
        if (!chatContainer) return;

        const card = this.buildInlineWorkCard(result);
        if (!card) return;

        chatContainer.appendChild(card);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        this.typesetMath(card);

        // Surface the AI-generated tutor greeting as a real assistant message
        // (already persisted server-side; this just renders it client-side).
        if (result.tutorGreeting && typeof window.appendMessage === 'function') {
            window.appendMessage(result.tutorGreeting, 'ai');
        }
    }

    /**
     * Build the full breakdown card (same content as the modal results)
     * for inline rendering inside the chat history.
     */
    buildInlineWorkCard(result) {
        const wrapper = document.createElement('div');
        wrapper.className = 'message-container work-check-message';
        wrapper.setAttribute('data-work-check-id', result.id || '');

        if (result.noWorkDetected) {
            wrapper.innerHTML = `
                <div class="work-check-card work-check-empty">
                    <div class="work-check-header">
                        <i class="fas fa-pencil-alt"></i>
                        <strong>Work Check</strong>
                    </div>
                    <div class="work-check-empty-body">
                        ${this.escapeHtml(result.overallFeedback || "Looks like the worksheet isn't filled in yet — give it a try first, then snap another photo.")}
                    </div>
                </div>
            `;
            return wrapper;
        }

        const total = result.problemCount || 0;
        const correct = result.correctCount || 0;
        const allCorrect = total > 0 && correct === total;
        const imp = result.improvement;
        const attempt = result.attemptNumber || 1;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        wrapper.innerHTML = `
            <div class="work-check-card">
                <div class="work-check-header">
                    <i class="fas fa-clipboard-check"></i>
                    <strong>Work Check</strong>
                    <span class="work-check-time">${time}</span>
                </div>

                ${imp ? `<div class="syw-improvement-banner ${imp.improved ? 'syw-improved' : 'syw-no-change'}" style="padding: 10px 14px; border-radius: 8px; margin: 8px 0; text-align: center; font-weight: 600; ${imp.improved ? 'background: linear-gradient(135deg, #d4edda, #c3e6cb); color: #155724;' : 'background: #fff3cd; color: #856404;'}">
                    ${imp.improved
                        ? `Attempt #${attempt}: ${imp.previousCorrect}/${imp.previousTotal} → ${correct}/${total} — Nice improvement!`
                        : `Attempt #${attempt}: Keep at it! Review the feedback and try again.`}
                </div>` : ''}

                <div class="syw-summary-header ${allCorrect ? 'syw-all-correct' : ''}">
                    <div class="syw-summary-counts">
                        <span class="syw-count-correct">${correct}</span>
                        <span class="syw-count-sep">of</span>
                        <span class="syw-count-total">${total}</span>
                        <span class="syw-count-label">correct</span>
                    </div>
                    ${result.whatWentWell ? `<div class="syw-went-well">${this.escapeHtml(result.whatWentWell)}</div>` : ''}
                    <div class="syw-xp-badge">+${result.xpEarned || 0} XP</div>
                </div>

                <div class="syw-problems-list">
                    <h4 class="syw-section-title"><i class="fas fa-list-ol"></i> Problem-by-Problem Feedback</h4>
                    ${(result.problems || []).map(p => this.renderProblemCard(p)).join('')}
                </div>

                ${result.overallFeedback ? `<div class="syw-overall-feedback">
                    <h4 class="syw-section-title"><i class="fas fa-comment-alt"></i> Overall</h4>
                    <div class="syw-overall-feedback-body">${this.renderMath(result.overallFeedback)}</div>
                </div>` : ''}

                ${result.practiceRecommendations?.length ? `<div class="syw-practice-recs">
                    <h4 class="syw-section-title"><i class="fas fa-dumbbell"></i> What to Practice</h4>
                    <ul>${result.practiceRecommendations.map(r => `<li>${this.escapeHtml(r)}</li>`).join('')}</ul>
                </div>` : ''}

                <div class="work-check-actions">
                    <button class="syw-btn syw-btn-secondary work-check-open-modal" type="button">
                        <i class="fas fa-expand"></i> Open full view
                    </button>
                    ${!allCorrect ? `<button class="syw-btn syw-btn-primary work-check-discuss" type="button">
                        <i class="fas fa-comments"></i> Discuss with tutor
                    </button>` : ''}
                </div>
            </div>
        `;

        // Bind per-problem "Ask my tutor about this" buttons inside the chat card
        wrapper.querySelectorAll('.syw-ask-tutor-problem').forEach(btn => {
            btn.addEventListener('click', () => {
                const num = btn.dataset.problem;
                const statement = btn.dataset.statement;
                const isUnsure = btn.dataset.unsure === 'true';
                const msg = isUnsure
                    ? `Can we go over problem #${num} together? You weren't sure about it.`
                    : `Can you help me with problem #${num}? I got it wrong.`;
                this.sendChatMessage(msg);
            });
        });

        wrapper.querySelector('.work-check-open-modal')?.addEventListener('click', () => {
            this.analysisResult = result;
            this.modal?.classList.add('is-visible');
            this.displayResults(result);
        });

        wrapper.querySelector('.work-check-discuss')?.addEventListener('click', () => {
            this.analysisResult = result;
            this.askTutorAboutWork();
        });

        return wrapper;
    }

    /**
     * Send a chat message via the existing chat send pipeline.
     * Used by "Ask my tutor" buttons on inline cards and inside the modal.
     */
    sendChatMessage(msg) {
        const userInput = document.getElementById('user-input');
        if (!userInput) return;
        userInput.textContent = msg;
        userInput.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
            const sendBtn = document.getElementById('send-button');
            if (sendBtn && !sendBtn.disabled) sendBtn.click();
        }, 100);
    }

    askTutorAboutWork() {
        this.closeModal();
        if (!this.analysisResult) return;

        const r = this.analysisResult;

        // The work-check card and tutor greeting are already in the
        // conversation history, so this is just a short follow-up nudge.
        const incorrect = (r.problems || []).filter(p => p.isCorrect === false).map(p => `#${p.problemNumber}`);
        const unsure = (r.problems || []).filter(p => p.isCorrect === null || p.isCorrect === undefined).map(p => `#${p.problemNumber}`);

        let msg;
        if (unsure.length && incorrect.length) {
            msg = `Let's start with ${unsure.join(', ')} — I want to walk through those with you.`;
        } else if (unsure.length) {
            msg = `Can we go through ${unsure.join(', ')} together?`;
        } else if (incorrect.length) {
            msg = `Help me with ${incorrect.join(', ')} please.`;
        } else {
            msg = `I got them all — what should I try next?`;
        }
        this.sendChatMessage(msg);
    }

    // ----------------------------------------------------------------
    // UTILITIES
    // ----------------------------------------------------------------

    /**
     * Render LaTeX in a given element using KaTeX (via the global shim).
     * The AI may include \(...\) or \[...\] delimited math in its feedback.
     */
    typesetMath(el) {
        if (window.renderMathInElement && el) {
            window.renderMathInElement(el);
        }
    }

    /**
     * Render a text string that may contain LaTeX (and markdown) to safe HTML.
     * Uses the same renderMarkdownMath pipeline as chat messages so LaTeX is
     * pre-rendered via KaTeX before insertion into innerHTML.  This avoids the
     * fragile post-processing approach where bare < or > in math expressions
     * (e.g. \(x < 5\)) can break the HTML parser and leave LaTeX unrendered.
     *
     * Falls back to escapeHtml when the rendering pipeline isn't available.
     */
    renderMath(text) {
        if (!text) return '';
        if (window.renderMarkdownMath) return window.renderMarkdownMath(text);
        // Fallback: escape HTML so raw LaTeX at least doesn't break the DOM.
        // typesetMath() will still attempt to render \(...\) in a second pass.
        return this.escapeHtml(text);
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Show a non-blocking toast notification instead of alert().
     * @param {string} message - Text to display
     * @param {'error'|'info'|'success'} type - Toast type for styling
     * @param {number} duration - Auto-dismiss after ms (0 = manual dismiss only)
     */
    showToast(message, type = 'error', duration = 5000) {
        // Remove any existing toast
        document.getElementById('syw-toast')?.remove();

        const toast = document.createElement('div');
        toast.id = 'syw-toast';
        toast.className = `syw-toast syw-toast-${type}`;
        toast.setAttribute('role', 'alert');

        const colors = { error: '#ef4444', info: '#3b82f6', success: '#22c55e' };
        const icons = { error: 'fa-exclamation-circle', info: 'fa-info-circle', success: 'fa-check-circle' };

        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${this.escapeHtml(message)}</span>
            <button class="syw-toast-close" aria-label="Dismiss">&times;</button>
        `;
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: ${colors[type] || colors.info}; color: white;
            padding: 12px 20px; border-radius: 10px; font-size: 0.95em;
            display: flex; align-items: center; gap: 10px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2); z-index: 10001;
            animation: syw-toast-in 0.3s ease-out;
            max-width: 90vw;
        `;

        // Add animation keyframes if not present
        if (!document.getElementById('syw-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'syw-toast-styles';
            style.textContent = `
                @keyframes syw-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
                @keyframes syw-toast-out { from { opacity: 1; } to { opacity: 0; transform: translateX(-50%) translateY(20px); } }
            `;
            document.head.appendChild(style);
        }

        const dismiss = () => {
            toast.style.animation = 'syw-toast-out 0.2s ease-in forwards';
            setTimeout(() => toast.remove(), 200);
        };

        toast.querySelector('.syw-toast-close').addEventListener('click', dismiss);

        document.body.appendChild(toast);
        if (duration > 0) setTimeout(dismiss, duration);
    }

    // ----------------------------------------------------------------
    // UNPLUGGED BADGE CELEBRATION
    // ----------------------------------------------------------------

    showUnpluggedBadgeCelebration(badges) {
        if (!badges || badges.length === 0) return;

        const overlay = document.createElement('div');
        overlay.className = 'unplugged-badge-overlay';
        overlay.innerHTML = `
            <div class="unplugged-badge-modal">
                <div class="unplugged-badge-icon">🏅</div>
                <h2>Unplugged Badge${badges.length > 1 ? 's' : ''} Earned!</h2>
                <div class="unplugged-badge-list">
                    ${badges.map(b => `
                        <div class="unplugged-badge-item">
                            <span class="unplugged-badge-name">${b.badgeName}</span>
                            <span class="unplugged-badge-desc">${b.description || ''}</span>
                            <span class="unplugged-badge-xp">+${b.xpReward} XP</span>
                        </div>
                    `).join('')}
                </div>
                <p class="unplugged-badge-message">Paper work pays off! Keep showing your steps.</p>
                <button class="btn btn-primary unplugged-badge-dismiss">Awesome!</button>
            </div>
        `;

        // Add styles if not already present
        if (!document.getElementById('unplugged-badge-styles')) {
            const style = document.createElement('style');
            style.id = 'unplugged-badge-styles';
            style.textContent = `
                .unplugged-badge-overlay {
                    position: fixed; inset: 0; z-index: 10000;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex; align-items: center; justify-content: center;
                    animation: ubFadeIn 0.3s ease-out;
                }
                .unplugged-badge-modal {
                    background: #fff; border-radius: 16px; padding: 2rem;
                    text-align: center; max-width: 360px; width: 90%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    animation: ubSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .unplugged-badge-icon { font-size: 3rem; margin-bottom: 0.5rem; }
                .unplugged-badge-modal h2 { margin: 0.5rem 0; font-size: 1.4rem; }
                .unplugged-badge-list { margin: 1rem 0; }
                .unplugged-badge-item {
                    display: flex; flex-direction: column; padding: 0.75rem;
                    margin: 0.5rem 0; border-radius: 8px;
                    background: linear-gradient(135deg, #f0f4ff, #e8f5e9);
                }
                .unplugged-badge-name { font-weight: 700; font-size: 1.1rem; }
                .unplugged-badge-desc { font-size: 0.85rem; color: #666; margin: 0.25rem 0; }
                .unplugged-badge-xp { font-weight: 600; color: #4a6cf7; }
                .unplugged-badge-message { font-style: italic; color: #666; margin: 0.75rem 0; font-size: 0.9rem; }
                .unplugged-badge-dismiss { margin-top: 0.5rem; min-width: 120px; }
                @keyframes ubFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes ubSlideUp { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
            `;
            document.head.appendChild(style);
        }

        overlay.querySelector('.unplugged-badge-dismiss').addEventListener('click', () => {
            overlay.style.animation = 'ubFadeIn 0.2s ease-in reverse forwards';
            setTimeout(() => overlay.remove(), 200);
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.animation = 'ubFadeIn 0.2s ease-in reverse forwards';
                setTimeout(() => overlay.remove(), 200);
            }
        });

        document.body.appendChild(overlay);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.showYourWorkManager = new ShowYourWorkManager();
    // Convenience alias used by chat integrations (e.g. file-card "Check my work").
    window.showYourWork = window.showYourWorkManager;
});

;
/* --- /js/unified-upload.js --- */
/* public/js/unified-upload.js
 *
 * One front door for uploads.
 *
 * Before: two toolbar buttons with two separate processes — a paperclip
 * ("Upload", → chat) and a camera ("Show your work", → grading modal). The
 * student had to pick the pipeline before they'd even taken the picture.
 *
 * After: a single entry (the camera button) opens a small capture menu —
 * Take a photo / Upload a file / Scan with phone. Every source lands in the
 * same chat attach tray, where the card classifies the image and suggests the
 * right one-tap action ("Check my work" vs "Help me with this"). See
 * decorateSmartCard() in script.js.
 *
 * This module is self-contained (injects its own menu + styles) and wires by
 * id, so chat.html only needs the <script> include. It no-ops gracefully if
 * the toolbar isn't present.
 */
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('unified-upload-styles')) return;
    var css = ''
      // Capture menu (popover above the toolbar button)
      + '.uu-menu{position:fixed;z-index:10050;background:#fff;border-radius:14px;'
      + 'box-shadow:0 12px 40px rgba(26,26,46,.22);padding:6px;min-width:220px;'
      + 'border:1px solid rgba(0,0,0,.06);animation:uu-pop .14s ease-out;}'
      + '.uu-item{display:flex;align-items:center;gap:12px;width:100%;border:none;'
      + 'background:transparent;padding:11px 12px;border-radius:10px;cursor:pointer;'
      + 'font-size:.95rem;color:#1a1a2e;text-align:left;font-family:inherit;}'
      + '.uu-item:hover{background:#f1f3f9;}'
      + '.uu-item i{width:20px;text-align:center;color:#12B3B3;font-size:1.05rem;}'
      + '.uu-item-sub{display:block;font-size:.74rem;color:#8a90a2;margin-top:1px;}'
      + '.uu-item-text{display:flex;flex-direction:column;line-height:1.15;}'
      + '@keyframes uu-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}'
      // Suggestion bar — full-width strip above the compose row (rendered by
      // script.js). Lives outside the thumbnail grid, so it never gets clipped.
      + '.smart-suggest-bar{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;'
      + 'padding:9px 13px;margin:8px 10px 0;border-radius:12px;'
      + 'background:rgba(18,179,179,.07);border:1px solid rgba(18,179,179,.22);'
      + 'animation:uu-pop .14s ease-out;}'
      + '.ssb-hint{flex:1 1 180px;min-width:140px;font-size:.84rem;color:#374151;line-height:1.3;'
      + 'display:flex;align-items:center;gap:7px;}'
      + '.ssb-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}'
      + '.fcs-chip{display:inline-flex;align-items:center;justify-content:center;'
      + 'gap:5px;border:1px solid #d7dbe6;background:#fff;color:#1a1a2e;border-radius:9px;'
      + 'padding:8px 12px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;'
      + 'white-space:nowrap;transition:background .12s,border-color .12s,box-shadow .12s;}'
      + '.fcs-chip:hover{background:#f1f3f9;}'
      + '.fcs-chip.fcs-suggested{background:linear-gradient(135deg,#12B3B3,#0e9a9a);'
      + 'border-color:transparent;color:#fff;box-shadow:0 3px 10px rgba(18,179,179,.32);}'
      + '.fcs-chip.fcs-suggested:hover{filter:brightness(1.04);background:linear-gradient(135deg,#12B3B3,#0e9a9a);}'
      + '.fcs-tag{flex:0 0 auto;font-size:.56rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;'
      + 'background:rgba(255,255,255,.28);padding:2px 5px;border-radius:6px;}'
      // Subordinate opt-in: the gamified scored breakdown, visually quieter than
      // the two primary conversational chips.
      + '.fcs-scored{display:inline-flex;align-items:center;justify-content:center;gap:5px;'
      + 'background:none;border:none;color:#8a90a2;font-size:.72rem;font-weight:600;cursor:pointer;'
      + 'font-family:inherit;padding:2px 4px;margin-top:1px;text-decoration:underline;'
      + 'text-underline-offset:2px;}'
      + '.fcs-scored:hover{color:#12B3B3;}';
    var style = document.createElement('style');
    style.id = 'unified-upload-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Hidden input dedicated to the "Take a photo" action. On mobile, the
  // `capture` attribute opens the camera directly; on desktop it falls back to
  // the file picker (acceptable — desktops rarely have a relevant camera, and
  // "Upload a file" covers them).
  function ensureCameraInput() {
    var input = document.getElementById('uu-camera-input');
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'uu-camera-input';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) routeFile(file);
      input.value = '';
    });
    document.body.appendChild(input);
    return input;
  }

  // Hand a captured file to the existing chat attach tray, which classifies it
  // and renders the smart action chooser.
  function routeFile(file) {
    if (window.fileUploadManager && typeof window.fileUploadManager.handleFile === 'function') {
      window.fileUploadManager.handleFile(file);
    } else if (typeof window.handleFileUpload === 'function') {
      window.handleFileUpload([file]);
    } else {
      console.error('[unifiedUpload] no upload handler available');
    }
  }

  function closeMenu() {
    var menu = document.getElementById('uu-menu');
    if (menu) menu.remove();
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeydown, true);
  }

  function onOutsideClick(e) {
    var menu = document.getElementById('uu-menu');
    if (menu && !menu.contains(e.target) && e.target.id !== 'camera-button' && !e.target.closest('#camera-button')) {
      closeMenu();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeMenu();
  }

  function openMenu(anchor) {
    if (document.getElementById('uu-menu')) { closeMenu(); return; }
    injectStyles();

    var phoneAvailable = !!(window.PhoneLink && typeof window.PhoneLink.open === 'function');

    var menu = document.createElement('div');
    menu.className = 'uu-menu';
    menu.id = 'uu-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
        '<button class="uu-item" data-action="photo" role="menuitem">'
      + '<i class="fas fa-camera"></i><span class="uu-item-text">Take a photo'
      + '<span class="uu-item-sub">Snap your worksheet or a problem</span></span></button>'
      + '<button class="uu-item" data-action="upload" role="menuitem">'
      + '<i class="fas fa-image"></i><span class="uu-item-text">Upload a file'
      + '<span class="uu-item-sub">Photo or PDF from this device</span></span></button>'
      + (phoneAvailable
          ? '<button class="uu-item" data-action="phone" role="menuitem">'
            + '<i class="fas fa-qrcode"></i><span class="uu-item-text">Scan with phone'
            + '<span class="uu-item-sub">Use your phone\'s camera</span></span></button>'
          : '');
    document.body.appendChild(menu);

    // Position above the anchor button, left-aligned, clamped to the viewport.
    var r = anchor.getBoundingClientRect();
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8));
    var top = r.top - mh - 8;
    if (top < 8) top = r.bottom + 8; // flip below if no room above
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('.uu-item');
      if (!item) return;
      var action = item.getAttribute('data-action');
      closeMenu();
      if (action === 'photo') {
        ensureCameraInput().click();
      } else if (action === 'upload') {
        var fi = document.getElementById('file-input');
        if (fi) fi.click();
        else ensureCameraInput().click();
      } else if (action === 'phone') {
        window.PhoneLink.open();
      }
    });

    // Defer outside-click binding so this opening click doesn't immediately close it.
    setTimeout(function () {
      document.addEventListener('click', onOutsideClick, true);
      document.addEventListener('keydown', onKeydown, true);
    }, 0);
  }

  function init() {
    // Inject styles up front: the smart-card chips (rendered by script.js after
    // ANY upload, including drag-drop that never opens the menu) depend on the
    // .fcs-* rules, so they can't wait for the first menu open.
    injectStyles();

    // Collapse to a single entry: the camera button becomes the unified "add"
    // affordance; the separate paperclip is redundant now that the menu offers
    // "Upload a file".
    var attach = document.getElementById('attach-button');
    if (attach) attach.style.display = 'none';

    var camera = document.getElementById('camera-button');
    if (!camera) return;
    camera.setAttribute('data-tip', 'Add your math');
    camera.setAttribute('aria-label', 'Add a photo or file');
    camera.setAttribute('aria-haspopup', 'menu');
    camera.addEventListener('click', function (e) {
      e.preventDefault();
      openMenu(camera);
    });

    // Drag-and-drop (file-upload.js) still works and lands in the same smart
    // tray — no change needed there.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.UnifiedUpload = { open: function () { var c = document.getElementById('camera-button'); if (c) openMenu(c); } };
})();

;
/* --- /js/ghostTimer.js --- */
/**
 * GHOST TIMER - Adaptive Fluency Tracking
 *
 * PHILOSOPHY:
 * - Track response times WITHOUT inducing panic
 * - No ticking countdown clock
 * - Subtle visual cues only at key thresholds
 * - Invisible to the student, visible to the system
 *
 * DESIGN:
 * - Starts automatically when AI asks a question
 * - Tracks elapsed time in the background
 * - Sends response time with answer for fluency analysis
 * - Optional visual "encouragement" cues (not warnings)
 *
 * @module ghostTimer
 */

class GhostTimer {
  constructor() {
    this.startTime = null;
    this.isActive = false;
    this.currentProblemType = null;  // 'reflex', 'process', 'algorithm', 'conceptual'
    this.timeLimits = null;           // Adaptive time limits from server
    this.visualCueTimeout = null;
    this.onTimeUpdate = null;         // Callback for time updates
  }

  /**
   * Start the ghost timer for a new problem
   *
   * @param {Object} options - Timer configuration
   * @param {String} options.problemType - 'reflex', 'process', 'algorithm', 'conceptual'
   * @param {Object} options.timeLimits - { expectedTime, warningThreshold, ghostLimit }
   * @param {Function} options.onTimeUpdate - Callback with elapsed time
   */
  start(options = {}) {
    this.reset();

    this.startTime = Date.now();
    this.isActive = true;
    this.currentProblemType = options.problemType || 'process';
    this.timeLimits = options.timeLimits || null;
    this.onTimeUpdate = options.onTimeUpdate || null;

    // Start tracking loop (update every second)
    this.trackingInterval = setInterval(() => {
      this.tick();
    }, 1000);

    console.log('[GhostTimer] Started', {
      problemType: this.currentProblemType,
      timeLimits: this.timeLimits
    });
  }

  /**
   * Called every second while timer is active
   */
  tick() {
    if (!this.isActive) return;

    const elapsed = this.getElapsedTime();

    // Call update callback if provided
    if (this.onTimeUpdate) {
      this.onTimeUpdate(elapsed);
    }

    // Check for visual cue thresholds (if we have time limits)
    if (this.timeLimits) {
      this.checkVisualCues(elapsed);
    }
  }

  /**
   * Check if we should show subtle visual encouragement
   *
   * NOT a panic-inducing warning, but a gentle nudge
   */
  checkVisualCues(elapsed) {
    const { warningThreshold, ghostLimit } = this.timeLimits;

    // At 75% of ghost limit: Show gentle "keep going" encouragement
    if (elapsed >= warningThreshold && elapsed < ghostLimit) {
      this.showEncouragementCue('gentle');
    }

    // At ghost limit: Show "take your time" but acknowledge time passing
    if (elapsed >= ghostLimit) {
      this.showEncouragementCue('time-passing');
    }
  }

  /**
   * Show subtle visual encouragement (NOT panic-inducing)
   *
   * @param {String} cueType - 'gentle' or 'time-passing'
   */
  showEncouragementCue(cueType) {
    const inputArea = document.getElementById('user-input');
    if (!inputArea) return;

    // Remove any existing cues
    inputArea.classList.remove('ghost-timer-gentle', 'ghost-timer-time-passing');

    // Add appropriate cue class
    if (cueType === 'gentle') {
      // Subtle border pulse - barely noticeable
      inputArea.classList.add('ghost-timer-gentle');
    } else if (cueType === 'time-passing') {
      // Slightly more visible, but still encouraging
      inputArea.classList.add('ghost-timer-time-passing');
    }
  }

  /**
   * Stop the timer and return elapsed time
   *
   * Call this when student submits their answer
   *
   * @returns {Number} Elapsed time in seconds
   */
  stop() {
    if (!this.isActive) return 0;

    const elapsed = this.getElapsedTime();

    this.isActive = false;
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    // Remove any visual cues
    const inputArea = document.getElementById('user-input');
    if (inputArea) {
      inputArea.classList.remove('ghost-timer-gentle', 'ghost-timer-time-passing');
    }

    console.log('[GhostTimer] Stopped', {
      elapsed: elapsed.toFixed(1) + 's',
      problemType: this.currentProblemType
    });

    return elapsed;
  }

  /**
   * Get current elapsed time in seconds
   *
   * @returns {Number} Seconds since timer started (0 if not active)
   */
  getElapsedTime() {
    if (!this.startTime) return 0;
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Reset the timer to initial state
   */
  reset() {
    this.isActive = false;
    this.startTime = null;
    this.currentProblemType = null;
    this.timeLimits = null;

    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    if (this.visualCueTimeout) {
      clearTimeout(this.visualCueTimeout);
      this.visualCueTimeout = null;
    }

    // Remove visual cues
    const inputArea = document.getElementById('user-input');
    if (inputArea) {
      inputArea.classList.remove('ghost-timer-gentle', 'ghost-timer-time-passing');
    }
  }

  /**
   * Pause the timer (useful for multi-part problems or clarifications)
   */
  pause() {
    if (!this.isActive) return;

    this.isActive = false;
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    // Store elapsed time so far
    this.pausedElapsed = this.getElapsedTime();
    this.pausedAt = Date.now();

    console.log('[GhostTimer] Paused at', this.pausedElapsed.toFixed(1) + 's');
  }

  /**
   * Resume a paused timer
   */
  resume() {
    if (this.isActive || !this.pausedElapsed) return;

    // Adjust start time to account for paused period
    const pauseDuration = Date.now() - this.pausedAt;
    this.startTime = Date.now() - (this.pausedElapsed * 1000);

    this.isActive = true;
    this.pausedElapsed = null;
    this.pausedAt = null;

    // Restart tracking loop
    this.trackingInterval = setInterval(() => {
      this.tick();
    }, 1000);

    console.log('[GhostTimer] Resumed');
  }

  /**
   * Check if timer is currently running
   *
   * @returns {Boolean} True if timer is active
   */
  isRunning() {
    return this.isActive;
  }
}

// ============================================================================
// GLOBAL GHOST TIMER INSTANCE
// ============================================================================

// Create singleton instance
const ghostTimer = new GhostTimer();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect problem type from AI message content
 *
 * Looks for tags like <REFLEX_PROBLEM>, <PROCESS_PROBLEM>, etc.
 *
 * @param {String} messageContent - AI's message text
 * @returns {String|null} Problem type or null
 */
function detectProblemType(messageContent) {
  if (!messageContent) return null;

  if (messageContent.includes('<REFLEX_PROBLEM>')) return 'reflex';
  if (messageContent.includes('<PROCESS_PROBLEM>')) return 'process';
  if (messageContent.includes('<ALGORITHM_PROBLEM>')) return 'algorithm';
  if (messageContent.includes('<CONCEPTUAL_PROBLEM>')) return 'conceptual';

  // Default: If message ends with a question mark and is relatively short,
  // assume it's a process problem
  if (messageContent.trim().endsWith('?') && messageContent.length < 200) {
    return 'process';
  }

  return null;
}

/**
 * Auto-start ghost timer when AI asks a question
 *
 * Call this after appending AI message to chat
 *
 * @param {String} aiMessage - AI's message content
 * @param {Object} timeLimits - Optional adaptive time limits from server
 */
function autoStartGhostTimer(aiMessage, timeLimits = null) {
  const problemType = detectProblemType(aiMessage);

  // Only start timer if we detected a problem
  if (problemType) {
    ghostTimer.start({
      problemType,
      timeLimits,
      onTimeUpdate: (elapsed) => {
        // Optional: Update UI with elapsed time (for debugging or teacher view)
        // console.log('[GhostTimer] Elapsed:', elapsed.toFixed(1) + 's');
      }
    });
  }
}

/**
 * Get response time and stop timer
 *
 * Call this before sending student's answer
 *
 * @returns {Number|null} Response time in seconds, or null if timer not running
 */
function getResponseTimeAndStop() {
  if (!ghostTimer.isRunning()) {
    return null;
  }

  return ghostTimer.stop();
}

// ============================================================================
// EXPORTS (for use in script.js)
// ============================================================================

// Expose to global scope for use in main script
window.GhostTimer = GhostTimer;
window.ghostTimer = ghostTimer;
window.autoStartGhostTimer = autoStartGhostTimer;
window.getResponseTimeAndStop = getResponseTimeAndStop;
window.detectProblemType = detectProblemType;

;
/* --- /js/badgeProgress.js --- */
/**
 * Badge Progress Widget
 * Shows active badge progress in the chat interface
 */

let badgeProgressState = {
  activeBadge: null,
  checkInterval: null
};

/**
 * Initialize badge progress widget
 */
async function initializeBadgeProgress() {
  // Check for active badge on load
  await checkActiveBadge();

  // Check periodically for updates (every 5 seconds)
  badgeProgressState.checkInterval = setInterval(checkActiveBadge, 5000);
}

/**
 * Check if user has an active badge
 */
async function checkActiveBadge() {
  try {
    // Only show badge widget during ACTIVE badge earning, not during other mastery phases
    const masteryPhase = window.StorageUtils
      ? StorageUtils.session.getItem('masteryPhase')
      : null;
    if (masteryPhase !== 'badge-earning') {
      // Not actively earning a badge - hide widget if it exists
      hideBadgeWidget();
      return;
    }

    const response = await fetch('/api/mastery/active-badge', {
      credentials: 'include'
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();

    if (data.activeBadge) {
      badgeProgressState.activeBadge = data.activeBadge;
      displayBadgeWidget(data.activeBadge);
    } else {
      badgeProgressState.activeBadge = null;
      hideBadgeWidget();
    }

  } catch (error) {
    console.error('Error checking active badge:', error);
  }
}

/**
 * Display the badge progress widget
 */
function displayBadgeWidget(badge) {
  let widget = document.getElementById('badge-progress-widget');
  let wasCollapsed = false;

  // Create widget if it doesn't exist
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'badge-progress-widget';
    widget.className = 'badge-progress-widget';
    document.body.appendChild(widget);
  } else {
    // Preserve collapsed state during updates
    wasCollapsed = widget.classList.contains('collapsed');
  }

  const progressPercent = badge.progress || 0;
  const accuracy = Math.round((badge.currentAccuracy || 0) * 100);
  const meetsRequirements = badge.meetsRequirements;

  widget.innerHTML = `
    <div class="badge-widget-header">
      <div class="badge-widget-title">
        <span class="badge-icon">🏆</span>
        <span class="badge-name">${badge.badgeName}</span>
      </div>
      <button class="badge-widget-close" onclick="toggleBadgeWidget()">
        <i class="fas ${wasCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
      </button>
    </div>

    <div class="badge-widget-content">
      <div class="badge-stat-row">
        <div class="badge-stat">
          <span class="badge-stat-label">Progress</span>
          <span class="badge-stat-value">${badge.problemsCompleted}/${badge.requiredProblems}</span>
        </div>
        <div class="badge-stat">
          <span class="badge-stat-label">Accuracy</span>
          <span class="badge-stat-value ${accuracy >= (badge.requiredAccuracy * 100) ? 'success' : 'warning'}">${accuracy}%</span>
        </div>
      </div>

      <div class="badge-progress-bar">
        <div class="badge-progress-fill" style="width: ${progressPercent}%"></div>
      </div>

      <div class="badge-requirements">
        <span class="requirement-label">Required:</span>
        <span class="requirement-value">${badge.requiredProblems} problems at ${Math.round(badge.requiredAccuracy * 100)}% accuracy</span>
      </div>

      ${meetsRequirements ? `
        <button class="btn-claim-badge" onclick="claimBadge()">
          <i class="fas fa-trophy"></i> Claim Your Badge!
        </button>
      ` : `
        <div class="badge-encouragement">
          ${badge.problemsCompleted < badge.requiredProblems
            ? `Keep going! ${badge.requiredProblems - badge.problemsCompleted} more problem${badge.requiredProblems - badge.problemsCompleted === 1 ? '' : 's'} to go!`
            : `You need ${Math.round(badge.requiredAccuracy * 100)}% accuracy. Keep practicing!`
          }
        </div>
      `}

      <button class="btn-view-badges" onclick="window.location.href='/badge-map.html'">
        View All Badges
      </button>
    </div>
  `;

  // Restore collapsed state after updating content
  if (wasCollapsed) {
    widget.classList.add('collapsed');
  }
}

/**
 * Hide the badge progress widget
 */
function hideBadgeWidget() {
  const widget = document.getElementById('badge-progress-widget');
  if (widget) {
    widget.remove();
  }
}

/**
 * Toggle widget collapsed state
 */
function toggleBadgeWidget() {
  const widget = document.getElementById('badge-progress-widget');
  if (widget) {
    widget.classList.toggle('collapsed');

    // Update icon
    const icon = widget.querySelector('.badge-widget-close i');
    if (widget.classList.contains('collapsed')) {
      icon.className = 'fas fa-chevron-up';
    } else {
      icon.className = 'fas fa-chevron-down';
    }
  }
}

/**
 * Claim badge when requirements are met
 */
async function claimBadge() {
  try {
    const response = await csrfFetch('/api/mastery/complete-badge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Failed to claim badge');
      return;
    }

    const data = await response.json();

    // Show success message
    showBadgeEarnedModal(data);

    // Clear widget
    badgeProgressState.activeBadge = null;
    hideBadgeWidget();

  } catch (error) {
    console.error('Error claiming badge:', error);
    alert('Failed to claim badge. Please try again.');
  }
}

/**
 * Show badge earned celebration modal
 */
function showBadgeEarnedModal(data) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay is-visible';

  modal.innerHTML = `
    <div class="modal-content badge-earned-modal">
      <div class="badge-celebration">
        <div class="celebration-icon">🎉</div>
        <h1>Badge Earned!</h1>
        <div class="earned-badge-icon">🏆</div>
        <h2>${data.badge}</h2>
        <p class="xp-bonus">+${data.xpBonus} XP</p>
        <p class="badge-count">Total Badges: ${data.totalBadges}</p>

        <div class="celebration-actions">
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove(); window.location.href='/badge-map.html'">
            Choose Next Badge
          </button>
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Continue Chatting
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Remove after 10 seconds if user doesn't click
  setTimeout(() => {
    if (modal.parentNode) {
      modal.remove();
    }
  }, 10000);
}

/**
 * Manually trigger badge progress check (call this after answering a problem)
 */
async function updateBadgeProgress() {
  await checkActiveBadge();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBadgeProgress);
} else {
  initializeBadgeProgress();
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
  window.updateBadgeProgress = updateBadgeProgress;
  window.toggleBadgeWidget = toggleBadgeWidget;
  window.claimBadge = claimBadge;
}

;
/* --- /js/mobile-stats-bar.js --- */
// Mobile Stats Bar — syncs XP, level, and streak to the persistent bar
// Also wires up hero action buttons (Upload Homework, Show Your Work)
(function () {
  'use strict';

  // --- Stats Bar: Mirror data from drawer elements ---
  function syncStatsBar() {
    const msbLevel = document.getElementById('msb-level');
    const msbStreak = document.getElementById('msb-streak');
    const msbXp = document.getElementById('msb-xp');
    const msbXpFill = document.getElementById('msb-xp-fill');

    // Pull from drawer (already updated by sidebar.js)
    const drawerLevel = document.getElementById('drawer-level');
    const drawerStreak = document.getElementById('drawer-streak-count');
    const drawerTotalXp = document.getElementById('drawer-total-xp');
    const drawerProgressFill = document.getElementById('drawer-progress-fill');

    if (msbLevel && drawerLevel) msbLevel.textContent = drawerLevel.textContent;
    if (msbStreak && drawerStreak) msbStreak.textContent = drawerStreak.textContent;
    if (msbXp && drawerTotalXp) msbXp.textContent = drawerTotalXp.textContent;
    if (msbXpFill && drawerProgressFill) {
      msbXpFill.style.width = drawerProgressFill.style.width;
    }
  }

  // Observe drawer changes so stats bar stays in sync
  function observeDrawerChanges() {
    const targets = [
      'drawer-level', 'drawer-streak-count',
      'drawer-total-xp', 'drawer-progress-fill'
    ];

    const observer = new MutationObserver(syncStatsBar);

    targets.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        observer.observe(el, {
          childList: true,
          characterData: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style']
        });
      }
    });
  }

  // --- Hero Action Buttons ---
  function wireHeroButtons() {
    var uploadBtn = document.getElementById('hero-upload-btn');
    var attachBtn = document.getElementById('attach-button');

    // Upload / Photo → trigger the existing attach button (handles both files and camera)
    if (uploadBtn && attachBtn) {
      uploadBtn.addEventListener('click', function () {
        attachBtn.click();
      });
    }
  }

  // --- Compact hero actions after first message (but keep them visible) ---
  function watchForFirstMessage() {
    var chatBox = document.getElementById('chat-messages-container');
    var heroActions = document.getElementById('hero-actions');
    if (!chatBox || !heroActions) return;

    var observer = new MutationObserver(function () {
      // If chat has messages, compact the hero buttons but keep them accessible
      var messages = chatBox.querySelectorAll('.message-container, .message');
      if (messages.length > 0) {
        heroActions.classList.add('hero-compact');
      }
    });

    observer.observe(chatBox, { childList: true });
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    // Initial sync after a small delay (sidebar loads data async)
    setTimeout(syncStatsBar, 1500);
    setTimeout(syncStatsBar, 4000);
    observeDrawerChanges();
    wireHeroButtons();
    watchForFirstMessage();
  });
})();

;
/* --- /js/resume-card.js --- */
// Resume Card — "Welcome back" experience for returning students
// Shows streak, XP progress, last session context, and quick actions
// Injected into #chat-messages-container before the welcome message

(function () {
  'use strict';

  const CARD_ID = 'resume-card';

  // Time-of-day greeting
  function getTimeGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  // Relative time formatting
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  // Fetch both endpoints in parallel
  async function fetchResumeData() {
    const [returningRes, summaryRes] = await Promise.all([
      fetch('/api/conversations/returning-user-data', { credentials: 'include' }).catch(() => null),
      fetch('/api/student/progress/summary', { credentials: 'include' }).catch(() => null),
    ]);

    const returning = returningRes?.ok ? await returningRes.json() : null;
    const summary = summaryRes?.ok ? await summaryRes.json() : null;

    return { returning, summary };
  }

  // Build the streak flame display
  function streakHTML(count) {
    if (!count || count < 1) return '';
    const label = count === 1 ? 'day' : 'days';
    return `<div class="rc-streak"><span class="rc-streak-flame">🔥</span><span class="rc-streak-count">${count}</span><span class="rc-streak-label">${label}</span></div>`;
  }

  // Build XP progress bar
  function xpBarHTML(user) {
    if (!user || !user.level) return '';
    const level = user.level || 1;
    const xpCurrent = user.xpForCurrentLevel || 0;
    const xpNeeded = user.xpForNextLevel || 100;
    const pct = Math.min(Math.round((xpCurrent / xpNeeded) * 100), 100);
    return `
      <div class="rc-xp">
        <div class="rc-xp-label">
          <span class="rc-level">Lv. ${level}</span>
          <span class="rc-xp-text">${xpCurrent} / ${xpNeeded} XP</span>
        </div>
        <div class="rc-xp-track"><div class="rc-xp-fill" style="width: ${pct}%"></div></div>
      </div>`;
  }

  // Build weekly stats strip
  function weeklyStatsHTML(stats) {
    if (!stats) return '';
    const items = [];
    if (stats.problemsSolved != null && stats.problemsSolved > 0) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">${stats.problemsSolved}</span><span class="rc-stat-label">problems</span></div>`);
    }
    if (stats.accuracy != null) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">${stats.accuracy}%</span><span class="rc-stat-label">accuracy</span></div>`);
    }
    if (stats.xpEarned != null && stats.xpEarned > 0) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">+${stats.xpEarned}</span><span class="rc-stat-label">XP this week</span></div>`);
    }
    if (stats.skillsMastered != null && stats.skillsMastered > 0) {
      items.push(`<div class="rc-stat"><span class="rc-stat-val">${stats.skillsMastered}</span><span class="rc-stat-label">mastered</span></div>`);
    }
    if (items.length === 0) return '';
    return `<div class="rc-stats-strip">${items.join('')}</div>`;
  }

  // Build learning progress section
  function learningHTML(summary) {
    if (!summary) return '';
    const parts = [];

    if (summary.currentLearning) {
      const pct = summary.currentLearning.progress || 0;
      parts.push(`
        <div class="rc-learning-item">
          <div class="rc-learning-header">
            <span class="rc-learning-status">📖 Currently learning</span>
            <span class="rc-learning-pct">${pct}%</span>
          </div>
          <div class="rc-learning-name">${summary.currentLearning.displayName}</div>
          <div class="rc-learning-track"><div class="rc-learning-fill" style="width: ${pct}%"></div></div>
        </div>`);
    }

    if (summary.recentMastery) {
      parts.push(`
        <div class="rc-learning-item rc-mastery-item">
          <span class="rc-mastery-badge">⭐</span>
          <span>Recently mastered <strong>${summary.recentMastery.displayName}</strong></span>
        </div>`);
    }

    return parts.length > 0 ? `<div class="rc-learning">${parts.join('')}</div>` : '';
  }

  // Build recent session buttons
  function sessionsHTML(returning) {
    if (!returning?.isReturningUser) return '';

    const items = [];

    // Course in progress
    if (returning.courses?.length > 0) {
      const c = returning.courses[0];
      items.push(`
        <button class="rc-session-btn rc-session-course" data-course-id="${c.courseSessionId}">
          <span class="rc-session-emoji">📚</span>
          <div class="rc-session-info">
            <span class="rc-session-name">${c.courseName}</span>
            <span class="rc-session-meta">${c.currentModuleLabel} · ${c.overallProgress}%</span>
          </div>
          <span class="rc-session-arrow">→</span>
        </button>`);
    }

    // Recent sessions (top 3)
    const sessions = (returning.recentSessions || []).slice(0, 3);
    for (const s of sessions) {
      items.push(`
        <button class="rc-session-btn" data-session-id="${s._id}">
          <span class="rc-session-emoji">${s.topicEmoji}</span>
          <div class="rc-session-info">
            <span class="rc-session-name">${s.name}</span>
            <span class="rc-session-meta">${timeAgo(s.lastActivity)} · ${s.messageCount} messages</span>
          </div>
          <span class="rc-session-arrow">→</span>
        </button>`);
    }

    if (items.length === 0) return '';

    return `
      <div class="rc-sessions">
        <div class="rc-sessions-label">Pick up where you left off</div>
        ${items.join('')}
      </div>`;
  }

  // Build the full card
  function buildCard(data, user) {
    const { returning, summary } = data;
    const firstName = user?.firstName || user?.name?.split(' ')[0] || '';
    const greeting = `${getTimeGreeting()}${firstName ? ', ' + firstName : ''}!`;

    // Only show card if there's meaningful content
    const hasStreak = summary?.streak > 0;
    const hasSessions = returning?.isReturningUser && (returning.courses?.length > 0 || returning.recentSessions?.length > 0);
    const hasLearning = summary?.currentLearning || summary?.recentMastery;
    const hasStats = summary?.weeklyStats && (summary.weeklyStats.problemsSolved > 0 || summary.weeklyStats.xpEarned > 0);

    if (!hasSessions && !hasLearning && !hasStats && !hasStreak) return null;

    const html = `
      <div id="${CARD_ID}" class="rc-card" role="region" aria-label="Welcome back">
        <div class="rc-header">
          <div class="rc-greeting">${greeting}</div>
          <button class="rc-dismiss" id="rc-dismiss-btn" aria-label="Dismiss">&times;</button>
        </div>
        <div class="rc-body">
          <div class="rc-top-row">
            ${streakHTML(summary?.streak)}
            ${xpBarHTML(user)}
          </div>
          ${weeklyStatsHTML(summary?.weeklyStats)}
          ${learningHTML(summary)}
          ${sessionsHTML(returning)}
        </div>
      </div>`;

    return html;
  }

  // Dismiss with animation
  function dismissCard() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    card.classList.add('rc-dismissing');
    setTimeout(() => card.remove(), 300);
  }

  // Wire up session resume clicks
  function wireSessionClicks() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;

    card.querySelectorAll('.rc-session-btn[data-session-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sessionId = btn.dataset.sessionId;
        dismissCard();
        // Use sidebar's switchSession to load conversation properly
        if (window.sidebar?.switchSession) {
          window.sidebar.switchSession(sessionId);
        }
      });
    });

    card.querySelectorAll('.rc-session-btn[data-course-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dismissCard();
        // Resume course via course manager
        if (window.courseManager?.resumeCourse) {
          window.courseManager.resumeCourse();
        }
      });
    });
  }

  // Main: show resume card
  async function showResumeCard() {
    // Don't show if user isn't a student or data already loaded
    const user = window.currentUser;
    if (!user || user.role !== 'student') return;

    // Don't show if chat already has messages (e.g., trial carryover)
    const chatBox = document.getElementById('chat-messages-container');
    if (!chatBox || chatBox.children.length > 0) return;

    try {
      const data = await fetchResumeData();
      const cardHTML = buildCard(data, user);
      if (!cardHTML) return;

      // Insert at top of chat container
      chatBox.insertAdjacentHTML('afterbegin', cardHTML);

      // Wire up interactions
      const dismissBtn = document.getElementById('rc-dismiss-btn');
      if (dismissBtn) dismissBtn.addEventListener('click', dismissCard);
      wireSessionClicks();

      // Card stays until the user dismisses it or taps a session.
      // No auto-dismiss — let them read at their own pace.
    } catch (err) {
      // Silent fail — welcome message will show normally
      console.warn('[ResumeCard] Failed to load resume data:', err);
    }
  }

  // Expose globally so initializeApp can call it
  window.showResumeCard = showResumeCard;
})();
