// public/js/teacher-resources.js
// Teacher resource upload and management

document.addEventListener('DOMContentLoaded', () => {
    // Modal elements
    const uploadModal = document.getElementById('upload-resource-modal');
    const uploadBtn = document.getElementById('upload-resource-btn');
    const closeUploadModal = document.getElementById('close-upload-resource-modal');
    const uploadForm = document.getElementById('upload-resource-form');
    const resourcesList = document.getElementById('resources-list');

    // Open upload modal
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            uploadModal.classList.add('is-visible');
        });
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

            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

                const response = await fetch('/api/teacher-resources/upload', {
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
                        <div class="resource-card" data-resource-id="${resource.id}">
                            <div class="resource-icon">
                                <i class="fas ${getFileIcon(resource.fileType)}"></i>
                            </div>
                            <div class="resource-info">
                                <h4>${resource.displayName}</h4>
                                <p class="resource-meta">
                                    <span class="resource-type">${resource.fileType.toUpperCase()}</span>
                                    <span>•</span>
                                    <span>${formatFileSize(resource.fileSize)}</span>
                                    <span>•</span>
                                    <span>${formatDate(resource.uploadedAt)}</span>
                                </p>
                                ${resource.description ? `<p class="resource-description">${resource.description}</p>` : ''}
                                <p class="resource-stats">
                                    <i class="fas fa-eye"></i> Accessed ${resource.accessCount} times
                                </p>
                                ${resource.keywords && resource.keywords.length > 0 ? `
                                    <div class="resource-keywords">
                                        ${resource.keywords.slice(0, 5).map(kw => `<span class="keyword-tag">${kw}</span>`).join('')}
                                    </div>
                                ` : ''}
                            </div>
                            <div class="resource-actions">
                                <button class="btn-icon" title="Download" onclick="window.open('${resource.publicUrl}', '_blank')">
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

    // Delete resource
    window.deleteResource = async function(resourceId, resourceName) {
        if (!confirm(`Are you sure you want to delete "${resourceName}"? This cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/teacher-resources/${resourceId}`, {
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
