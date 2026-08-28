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

            // Display resources as cards
            resourcesList.innerHTML = `
                <div class="resources-grid">
                    ${resources.map(resource => `
                        <div class="resource-card ${resource.isPublished ? '' : 'resource-unpublished'}" data-resource-id="${resource.id}">
                            <div class="resource-icon">
                                <i class="fas ${getFileIcon(resource.fileType)}"></i>
                            </div>
                            <div class="resource-info">
                                <h4>
                                    ${resource.displayName}
                                    ${resource.isPublished
                                        ? '<span class="publish-badge published" title="Visible to students"><i class="fas fa-eye"></i></span>'
                                        : '<span class="publish-badge unpublished" title="Hidden from students"><i class="fas fa-eye-slash"></i></span>'}
                                </h4>
                                <p class="resource-meta">
                                    <span class="resource-type">${resource.fileType.toUpperCase()}</span>
                                    <span>•</span>
                                    <span>${formatFileSize(resource.fileSize)}</span>
                                    <span>•</span>
                                    <span>${formatDate(resource.uploadedAt)}</span>
                                </p>
                                ${resource.description ? `<p class="resource-description">${resource.description}</p>` : ''}
                                <p class="resource-stats">
                                    <i class="fas fa-chart-bar"></i> Accessed ${resource.accessCount} times
                                </p>
                                <p class="resource-audience" title="Who can see this resource">
                                    <i class="fas fa-users"></i>
                                    ${(resource.sharedWithClassNames || []).length > 0
                                        ? escapeHtml(resource.sharedWithClassNames.join(', '))
                                        : 'All my students'}
                                </p>
                                ${resource.keywords && resource.keywords.length > 0 ? `
                                    <div class="resource-keywords">
                                        ${resource.keywords.slice(0, 5).map(kw => `<span class="keyword-tag">${kw}</span>`).join('')}
                                    </div>
                                ` : ''}
                            </div>
                            <div class="resource-actions">
                                <button class="btn-icon ${resource.isPublished ? 'btn-published' : 'btn-unpublished'}"
                                    title="${resource.isPublished ? 'Click to hide from students' : 'Click to publish to students'}"
                                    onclick="togglePublish('${resource.id}', ${resource.isPublished})">
                                    <i class="fas ${resource.isPublished ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                                </button>
                                <button class="btn-icon" title="Download" onclick="window.open('/api/teacher-resources/download/${resource.id}', '_blank')">
                                    <i class="fas fa-download"></i>
                                </button>
                                <button class="btn-icon btn-danger" title="Delete" onclick="deleteResource('${resource.id}', '${resource.displayName}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
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
        if (!confirm(`Are you sure you want to delete "${resourceName}"? This cannot be undone.`)) {
            return;
        }

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
