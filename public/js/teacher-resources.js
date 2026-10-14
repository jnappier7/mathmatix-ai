// public/js/teacher-resources.js
// Teacher resource upload and management

document.addEventListener('DOMContentLoaded', () => {
    // Modal elements
    const uploadModal = document.getElementById('upload-resource-modal');
    const uploadBtn = document.getElementById('upload-resource-btn');
    const closeUploadModal = document.getElementById('close-upload-resource-modal');
    const uploadForm = document.getElementById('upload-resource-form');
    const resourcesList = document.getElementById('resources-list');

    // Classes available for targeting, refreshed whenever the list loads.
    let teacherClasses = [];

    // Open upload modal
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            uploadModal.classList.add('is-visible');
            renderClassPicker();
        });
    }

    // --------------------------------------------------
    // Class targeting
    // --------------------------------------------------
    const scopeRadios = () => document.querySelectorAll('input[name="shareScope"]');
    const classListEl = () => document.getElementById('resource-class-list');

    /**
     * Paint the checkbox list of classes. Called on modal open rather than at
     * init because a teacher can create a class and upload in the same sitting,
     * and a picker built once at page load would not know about it.
     */
    function renderClassPicker() {
        const list = classListEl();
        if (!list) return;

        if (teacherClasses.length === 0) {
            list.innerHTML = `<p class="resource-class-empty">
                No classes yet — this will be shared with all your students.
                Create a class in the Classes tab to target one.
            </p>`;
            return;
        }

        list.innerHTML = teacherClasses.map(c => `
            <label class="resource-class-option">
                <input type="checkbox" name="classTarget" value="${c._id}">
                <span>${escapeHtml(c.className)}</span>
            </label>
        `).join('');
    }

    // Reveal the class list only when "specific classes" is chosen, so the
    // default path (all students) stays a single click.
    scopeRadios().forEach(radio => {
        radio.addEventListener('change', () => {
            const list = classListEl();
            if (list) list.hidden = radio.value !== 'classes' || !radio.checked;
        });
    });

    /**
     * The class ids to submit, as a JSON string (multipart sends strings).
     * Returns '[]' — meaning all students — for the "all" scope, and also when
     * "specific classes" is selected but nothing is ticked: silently sharing
     * with everyone is wrong there, so the caller treats that as an error.
     */
    function selectedClassIds() {
        const scope = document.querySelector('input[name="shareScope"]:checked')?.value;
        if (scope !== 'classes') return [];
        return [...document.querySelectorAll('input[name="classTarget"]:checked')].map(cb => cb.value);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : text;
        return div.innerHTML;
    }

    // Close modal
    if (closeUploadModal) {
        closeUploadModal.addEventListener('click', () => {
            uploadModal.classList.remove('is-visible');
            uploadForm.reset();
        });
    }

    // Cancel button
    const cancelBtn = document.getElementById('cancel-resource-upload-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            uploadModal.classList.remove('is-visible');
            uploadForm.reset();
        });
    }

    // Close on outside click
    uploadModal?.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
            uploadModal.classList.remove('is-visible');
            uploadForm.reset();
        }
    });

    // Handle file upload
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(uploadForm);
            const submitBtn = uploadForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            const scope = document.querySelector('input[name="shareScope"]:checked')?.value;
            const classIds = selectedClassIds();
            if (scope === 'classes' && classIds.length === 0 && teacherClasses.length > 0) {
                alert('Pick at least one class, or choose "All my students".');
                return;
            }
            // The radios are form inputs too — strip them so only the resolved
            // targeting reaches the server.
            formData.delete('shareScope');
            formData.set('sharedWithClassIds', JSON.stringify(classIds));
            if (formData.get('pushToTutor') === 'true') {
                formData.set('tutorEndsAt', endOfLocalDayIso(formData.get('tutorEndsAt')));
            } else {
                formData.delete('tutorNote');
                formData.delete('tutorEndsAt');
            }

            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

                const response = await csrfFetch('/api/teacher-resources/upload', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    alert('✅ Resource uploaded successfully!');
                    uploadModal.classList.remove('is-visible');
                    uploadForm.reset();
                    await loadResources(); // Reload resources list
                } else {
                    alert('❌ Failed to upload: ' + (result.message || 'Unknown error'));
                }

            } catch (error) {
                console.error('Upload error:', error);
                alert('❌ Error uploading resource. Please try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    // Load and display resources
    async function loadResources() {
        if (!resourcesList) return;

        resourcesList.innerHTML = '<p style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading resources...</p>';

        try {
            const response = await fetch('/api/teacher-resources/list');
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to load resources');
            }

            const resources = data.resources || [];
            teacherClasses = data.classes || [];

            if (resources.length === 0) {
                document.dispatchEvent(new CustomEvent('mm:resources', { detail: { resources: [] } }));
                resourcesList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-folder-open" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <h3>No Resources Yet</h3>
                        <p>Upload files that your students can reference in chat.</p>
                        <p style="font-size: 0.9em; margin-top: 10px;">Students can say "I'm on Module 6.2 practice" and the AI will automatically fetch and analyze the file!</p>
                    </div>
                `;
                return;
            }

            // Display resources as cards. Everything user-supplied is escaped,
            // and actions use data attributes + one delegated handler — the old
            // inline onclick="deleteResource('${name}')" broke on any name with
            // a quote and was an injection point.
            lastResources = resources;
            document.dispatchEvent(new CustomEvent('mm:resources', { detail: { resources } }));
            resourcesList.innerHTML = `
                <div class="resources-grid">
                    ${resources.map(renderResourceCard).join('')}
                </div>
            `;

        } catch (error) {
            console.error('Error loading resources:', error);
            resourcesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ff4e4e;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Failed to load resources. Please try again.</p>
                </div>
            `;
        }
    }

    let lastResources = [];

    function tutorStatusHtml(r) {
        const a = r.tutorAssignment;
        if (!a) return '';
        const until = a.endsAt ? new Date(a.endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        if (a.expired) return `<p class="resource-tutor resource-tutor-ended"><i class="fas fa-robot"></i> Tutor offer ended ${escapeHtml(until)} · ${a.startedCount} of ${a.audienceCount} started</p>`;
        if (a.scheduled) return `<p class="resource-tutor"><i class="fas fa-robot"></i> With the tutor from ${escapeHtml(new Date(a.startsAt).toLocaleDateString())}</p>`;
        return `<p class="resource-tutor resource-tutor-on"><i class="fas fa-robot"></i> With the tutor until ${escapeHtml(until)} · <strong>${a.startedCount} of ${a.audienceCount}</strong> started</p>` +
            (a.note ? `<p class="resource-tutor-note">“${escapeHtml(a.note)}”</p>` : '');
    }

    function renderResourceCard(resource) {
        const id = escapeHtml(resource.id);
        const pushedLive = resource.tutorAssignment && resource.tutorAssignment.active;
        return `
            <div class="resource-card ${resource.isPublished ? '' : 'resource-unpublished'}" data-resource-id="${id}">
                <div class="resource-icon"><i class="fas ${getFileIcon(resource.fileType || '')}"></i></div>
                <div class="resource-info">
                    <h4>
                        ${escapeHtml(resource.displayName)}
                        ${resource.isPublished
                            ? '<span class="publish-badge published" title="Visible to students"><i class="fas fa-eye"></i></span>'
                            : '<span class="publish-badge unpublished" title="Hidden from students"><i class="fas fa-eye-slash"></i></span>'}
                        ${resource.category ? `<span class="resource-cat">${escapeHtml(resource.category)}</span>` : ''}
                    </h4>
                    <p class="resource-meta">
                        <span class="resource-type">${escapeHtml(String(resource.fileType || '').toUpperCase())}</span>
                        <span>•</span><span>${formatFileSize(resource.fileSize || 0)}</span>
                        <span>•</span><span>${formatDate(resource.uploadedAt)}</span>
                    </p>
                    ${resource.description ? `<p class="resource-description">${escapeHtml(resource.description)}</p>` : ''}
                    ${tutorStatusHtml(resource)}
                    <p class="resource-audience" title="Who can see this resource">
                        <i class="fas fa-users"></i>
                        ${(resource.sharedWithClassNames || []).length > 0 ? escapeHtml(resource.sharedWithClassNames.join(', ')) : 'All my students'}
                    </p>
                    ${resource.keywords && resource.keywords.length > 0 ? `
                        <div class="resource-keywords">
                            ${resource.keywords.slice(0, 5).map(kw => `<span class="keyword-tag">${escapeHtml(kw)}</span>`).join('')}
                        </div>` : ''}
                </div>
                <div class="resource-actions">
                    <button type="button" class="btn-push ${pushedLive ? 'is-on' : ''}" data-res-act="${pushedLive ? 'unpush' : 'push'}" data-id="${id}">
                        <i class="fas fa-robot"></i> ${pushedLive ? 'Stop' : 'Push to tutor'}
                    </button>
                    <button type="button" class="btn-icon ${resource.isPublished ? 'btn-published' : 'btn-unpublished'}" data-res-act="publish" data-id="${id}"
                        title="${resource.isPublished ? 'Hide from students' : 'Show to students'}" aria-label="${resource.isPublished ? 'Hide from students' : 'Show to students'}">
                        <i class="fas ${resource.isPublished ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                    </button>
                    <button type="button" class="btn-icon" data-res-act="download" data-id="${id}" title="Download" aria-label="Download"><i class="fas fa-download"></i></button>
                    <button type="button" class="btn-icon btn-danger" data-res-act="delete" data-id="${id}" title="Delete" aria-label="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
    }

    function notify(msg, type) {
        if (window.TeacherDashboard && window.TeacherDashboard.toast) window.TeacherDashboard.toast(msg, type || 'success');
        else if (typeof showToast === 'function') showToast(msg, type || 'success');
    }

    function endOfLocalDayIso(yyyyMmDd) {
        if (!yyyyMmDd) return '';
        const [y, m, d] = yyyyMmDd.split('-').map(Number);
        return new Date(y, m - 1, d, 23, 59, 0).toISOString();
    }
    function inDaysYmd(days) {
        const d = new Date(Date.now() + days * 86400000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function openPushDialog(resource) {
        const existing = document.getElementById('push-dialog');
        if (existing) existing.remove();
        const isAssessment = ['test', 'quiz'].includes(resource.category);
        const wrap = document.createElement('div');
        wrap.id = 'push-dialog';
        wrap.className = 'push-overlay';
        wrap.innerHTML = `
            <div class="push-dialog" role="dialog" aria-modal="true" aria-labelledby="push-title">
                <h3 id="push-title"><i class="fas fa-robot"></i> Push “${escapeHtml(resource.displayName)}” to the tutor</h3>
                <p class="push-lead">Students who can see it (${(resource.sharedWithClassNames || []).length ? escapeHtml(resource.sharedWithClassNames.join(', ')) : 'all your students'}) will be offered it when they start a session, and the tutor will work from it with them.</p>
                ${isAssessment ? '<p class="push-warn"><i class="fas fa-shield-halved"></i> This is a ' + escapeHtml(resource.category) + ': the tutor helps with similar problems only and never works the actual items.</p>' : ''}
                <label for="push-note">Note to the tutor (optional)</label>
                <textarea id="push-note" rows="3" maxlength="500" placeholder="e.g., Focus on #1–10. Several kids are mixing up the order of operations.">${escapeHtml((resource.tutorAssignment && resource.tutorAssignment.note) || '')}</textarea>
                <label for="push-until">Offer it until</label>
                <input type="date" id="push-until" value="${inDaysYmd(14)}" min="${inDaysYmd(0)}" max="${inDaysYmd(180)}">
                <div class="push-actions">
                    <button type="button" class="btn cancel-btn" data-push="cancel">Cancel</button>
                    <button type="button" class="btn btn-primary" data-push="go"><i class="fas fa-robot"></i> Push to tutor</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        wrap.querySelector('#push-note').focus();
        const close = () => wrap.remove();
        wrap.addEventListener('click', async (e) => {
            if (e.target === wrap || e.target.closest('[data-push="cancel"]')) return close();
            const go = e.target.closest('[data-push="go"]');
            if (!go) return;
            go.disabled = true;
            try {
                const res = await csrfFetch(`/api/teacher-resources/${encodeURIComponent(resource.id)}/assign`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: true, note: wrap.querySelector('#push-note').value, endsAt: endOfLocalDayIso(wrap.querySelector('#push-until').value) })
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.message || 'Could not push it');
                notify(data.message);
                close();
                loadResources();
            } catch (err) {
                go.disabled = false;
                notify(err.message, 'error');
            }
        });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }

    if (resourcesList) {
        resourcesList.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-res-act]');
            if (!btn) return;
            const id = btn.getAttribute('data-id');
            const resource = lastResources.find(r => String(r.id) === id);
            if (!resource) return;
            switch (btn.getAttribute('data-res-act')) {
                case 'push': return openPushDialog(resource);
                case 'unpush': {
                    const res = await csrfFetch(`/api/teacher-resources/${encodeURIComponent(id)}/assign`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false })
                    });
                    if (res.ok) { notify('Removed from the tutor'); loadResources(); } else notify('Could not update', 'error');
                    return;
                }
                case 'publish': return window.togglePublish(id, resource.isPublished);
                case 'download': return window.open(`/api/teacher-resources/download/${encodeURIComponent(id)}`, '_blank');
                case 'delete': return window.deleteResource(id, resource.displayName);
            }
        });
    }

    // Upload form: push-to-tutor fields
    const pushBox = document.getElementById('resource-push');
    const pushFields = document.getElementById('resource-push-fields');
    if (pushBox && pushFields) {
        pushBox.addEventListener('change', () => {
            pushFields.hidden = !pushBox.checked;
            const until = document.getElementById('resource-tutor-until');
            if (pushBox.checked && until && !until.value) until.value = inDaysYmd(14);
        });
    }

    // Toggle publish status
    window.togglePublish = async function(resourceId, currentStatus) {
        try {
            const response = await csrfFetch(`/api/teacher-resources/${resourceId}/toggle-publish`, {
                method: 'PATCH'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Show toast notification if available
                if (typeof showToast === 'function') {
                    showToast(result.message, 'success');
                } else {
                    // Fallback: brief visual feedback
                    console.log(result.message);
                }
                await loadResources(); // Reload resources list
            } else {
                alert('Failed to update: ' + (result.message || 'Unknown error'));
            }

        } catch (error) {
            console.error('Toggle publish error:', error);
            alert('Error updating resource. Please try again.');
        }
    };

    // Delete resource
    window.deleteResource = async function(resourceId, resourceName) {
        const ok = typeof window.showConfirmDialog === 'function'
            ? await window.showConfirmDialog({ title: `Delete "${resourceName}"?`, message: 'Students and the tutor will lose access. This cannot be undone.', confirmText: 'Delete', type: 'danger' })
            : window.confirm(`Delete "${resourceName}"? This cannot be undone.`);
        if (!ok) return;

        try {
            const response = await csrfFetch(`/api/teacher-resources/${resourceId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert('✅ Resource deleted successfully');
                await loadResources();
            } else {
                alert('❌ Failed to delete: ' + (result.message || 'Unknown error'));
            }

        } catch (error) {
            console.error('Delete error:', error);
            alert('❌ Error deleting resource. Please try again.');
        }
    };

    // Helper functions
    function getFileIcon(fileType) {
        const icons = {
            'pdf': 'fa-file-pdf',
            'doc': 'fa-file-word',
            'docx': 'fa-file-word',
            'ppt': 'fa-file-powerpoint',
            'pptx': 'fa-file-powerpoint',
            'jpg': 'fa-file-image',
            'jpeg': 'fa-file-image',
            'png': 'fa-file-image',
            'webp': 'fa-file-image',
            'heic': 'fa-file-image'
        };
        return icons[fileType.toLowerCase()] || 'fa-file';
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    // Load resources on page load
    loadResources();
});
