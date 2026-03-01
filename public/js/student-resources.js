// student-resources.js
// Learning resources display for students — Enhanced UX

console.log('Student Resources JS Loading...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('Student Resources - DOM Ready');

    const openResourcesBtn = document.getElementById('open-resources-modal-btn');
    const resourcesModal = document.getElementById('resources-modal');
    const closeResourcesBtn = document.getElementById('close-resources-modal');
    const resourcesContent = document.getElementById('resources-content');

    // State for filtering
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

    // Drag-to-chat
    resourcesContent?.addEventListener('dragstart', (e) => {
        const card = e.target.closest('[data-resource-id]');
        if (!card) return;

        e.dataTransfer.setData('application/x-teacher-resource-id', card.dataset.resourceId);
        e.dataTransfer.setData('application/x-teacher-resource-name', card.dataset.resourceName);
        e.dataTransfer.setData('application/x-teacher-resource-type', card.dataset.resourceType);
        e.dataTransfer.effectAllowed = 'copy';

        card.style.opacity = '0.5';
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
            const [curriculumRes, uploadsRes, teacherRes] = await Promise.all([
                fetch('/api/curriculum/student/resources', { credentials: 'include' }),
                fetch('/api/student/uploads?limit=10', { credentials: 'include' }),
                fetch('/api/teacher-resources/my-teacher-resources', { credentials: 'include' })
            ]);

            if (!curriculumRes.ok) throw new Error('Failed to fetch curriculum resources');

            const data = await curriculumRes.json();
            let myUploads = [];
            let teacherResources = [];

            if (uploadsRes.ok) {
                const uploadsData = await uploadsRes.json();
                myUploads = uploadsData.success ? uploadsData.uploads : [];
            }

            if (teacherRes.ok) {
                const teacherData = await teacherRes.json();
                teacherResources = teacherData.success ? (teacherData.resources || []) : [];
            }

            allResources = { teacherResources, myUploads, curriculum: data };
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
        if (teacherResources.length === 0 && myUploads.length === 0 && !data.hasResources) {
            bodyHtml += `
                <div class="resources-empty-state">
                    <i class="fas fa-book-open"></i>
                    <h3>No Resources Yet</h3>
                    <p>${data.currentTopic ? `You're studying: <strong>${data.currentTopic}</strong>` : 'Your teacher hasn\'t uploaded resources yet.'}</p>
                    <p style="margin-top: 8px;">Resources like worksheets, videos, and practice problems will appear here.</p>
                </div>
            `;
        }

        // Tip bar
        if (teacherResources.length > 0 || data.hasResources) {
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
