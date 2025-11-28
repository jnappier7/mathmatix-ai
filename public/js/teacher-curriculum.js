// teacher-curriculum.js
// Curriculum management for teacher dashboard

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const curriculumTab = document.querySelector('[data-tab="curriculum"]');
    const curriculumContent = document.getElementById('curriculum-content');
    const syncCommonBtn = document.getElementById('sync-common-curriculum-btn');
    const uploadCurriculumBtn = document.getElementById('upload-curriculum-btn');

    // Sync Common Curriculum Modal
    const syncModal = document.getElementById('sync-curriculum-modal');
    const syncModalCloseBtn = document.getElementById('syncCurriculumModalCloseBtn');
    const syncForm = document.getElementById('sync-curriculum-form');
    const cancelSyncBtn = document.getElementById('cancel-sync-btn');

    // Upload CSV Modal
    const uploadModal = document.getElementById('upload-curriculum-modal');
    const uploadModalCloseBtn = document.getElementById('uploadCurriculumModalCloseBtn');
    const uploadForm = document.getElementById('upload-curriculum-form');
    const cancelUploadBtn = document.getElementById('cancel-upload-btn');

    // Load curriculum when tab is clicked
    if (curriculumTab) {
        curriculumTab.addEventListener('click', () => {
            loadCurriculum();
        });
    }

    // Open sync modal
    if (syncCommonBtn) {
        syncCommonBtn.addEventListener('click', () => {
            syncModal.style.display = 'flex';
            // Pre-fill with current year
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;
            document.getElementById('cc-school-year').value = `${currentYear}-${nextYear}`;
        });
    }

    // Close sync modal
    function closeSyncModal() {
        syncModal.style.display = 'none';
        syncForm.reset();
    }

    if (syncModalCloseBtn) syncModalCloseBtn.addEventListener('click', closeSyncModal);
    if (cancelSyncBtn) cancelSyncBtn.addEventListener('click', closeSyncModal);

    // Open upload modal
    if (uploadCurriculumBtn) {
        uploadCurriculumBtn.addEventListener('click', () => {
            uploadModal.style.display = 'flex';
            // Pre-fill with current year
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;
            document.getElementById('csv-school-year').value = `${currentYear}-${nextYear}`;
        });
    }

    // Close upload modal
    function closeUploadModal() {
        uploadModal.style.display = 'none';
        uploadForm.reset();
    }

    if (uploadModalCloseBtn) uploadModalCloseBtn.addEventListener('click', closeUploadModal);
    if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', closeUploadModal);

    // Submit sync form
    if (syncForm) {
        syncForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = syncForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
            submitBtn.disabled = true;

            try {
                const res = await fetch('/api/curriculum/teacher/curriculum/sync-common', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        url: document.getElementById('cc-url').value,
                        name: document.getElementById('cc-name').value,
                        courseLevel: document.getElementById('cc-course-level').value,
                        gradeLevel: document.getElementById('cc-grade-level').value,
                        schoolYear: document.getElementById('cc-school-year').value
                    })
                });

                const data = await res.json();

                if (data.success) {
                    alert(`Success! Imported ${data.lessonsCount} lessons with ${data.resourcesCount} resources.`);
                    closeSyncModal();
                    loadCurriculum();
                } else {
                    alert('Error: ' + (data.message || 'Failed to sync curriculum'));
                }
            } catch (error) {
                console.error('Error syncing curriculum:', error);
                alert('Failed to sync curriculum. Please try again.');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Submit upload form
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = uploadForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            submitBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('file', document.getElementById('csv-file').files[0]);
                formData.append('name', document.getElementById('csv-name').value);
                formData.append('courseLevel', document.getElementById('csv-course-level').value);
                formData.append('gradeLevel', document.getElementById('csv-grade-level').value);
                formData.append('schoolYear', document.getElementById('csv-school-year').value);

                const res = await fetch('/api/curriculum/teacher/curriculum/parse', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });

                const data = await res.json();

                if (data.success) {
                    alert(`Success! Imported ${data.lessonsCount} lessons from CSV.`);
                    closeUploadModal();
                    loadCurriculum();
                } else {
                    alert('Error: ' + (data.message || 'Failed to upload curriculum'));
                }
            } catch (error) {
                console.error('Error uploading curriculum:', error);
                alert('Failed to upload curriculum. Please try again.');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Load curriculum
    async function loadCurriculum() {
        if (!curriculumContent) return;

        curriculumContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading curriculum...</div>';

        try {
            const res = await fetch('/api/curriculum/teacher/curriculum', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load curriculum');
            const data = await res.json();

            if (!data.hasCurriculum) {
                curriculumContent.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #666;">
                        <i class="fas fa-book" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p>No curriculum schedule imported yet.</p>
                        <p style="font-size: 0.9em; margin-top: 10px;">
                            Import your schedule from Common Curriculum or upload a CSV file to get started.
                        </p>
                    </div>
                `;
                return;
            }

            const curriculum = data.curriculum;
            const currentLesson = curriculum.currentLesson;

            // Display curriculum with resources
            let html = `
                <div style="padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div>
                            <h3 style="margin: 0;">${curriculum.name}</h3>
                            <p style="margin: 5px 0; color: #666;">
                                ${curriculum.courseLevel || ''} ${curriculum.gradeLevel ? '| ' + curriculum.gradeLevel : ''} ${curriculum.schoolYear ? '| ' + curriculum.schoolYear : ''}
                            </p>
                            <p style="margin: 5px 0; font-size: 0.9em; color: #888;">
                                ${curriculum.lessonsCount} lessons |
                                Auto-sync with AI: ${curriculum.autoSyncWithAI ? '<span style="color: #12B3B3;">✓ Enabled</span>' : '<span style="color: #999;">○ Disabled</span>'}
                            </p>
                        </div>
                        <div>
                            <button id="edit-ai-preferences-btn" class="btn btn-secondary" style="margin-right: 10px;">
                                <i class="fas fa-robot"></i> AI Preferences
                            </button>
                            <button id="delete-curriculum-btn" class="btn btn-tertiary" style="background: #ff4e4e; color: white;">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>

                    ${currentLesson ? `
                        <div style="background: #e8f9f8; border-left: 4px solid #12B3B3; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                            <h4 style="margin: 0 0 10px 0; color: #12B3B3;">
                                <i class="fas fa-calendar-check"></i> Current Week (Week ${currentLesson.weekNumber})
                            </h4>
                            <p style="margin: 5px 0;"><strong>Topic:</strong> ${currentLesson.topic}</p>
                            ${currentLesson.standards && currentLesson.standards.length > 0 ?
                                `<p style="margin: 5px 0;"><strong>Standards:</strong> ${currentLesson.standards.join(', ')}</p>` : ''}
                            ${currentLesson.objectives && currentLesson.objectives.length > 0 ?
                                `<p style="margin: 5px 0;"><strong>Objectives:</strong> ${currentLesson.objectives.join('; ')}</p>` : ''}
                            ${currentLesson.resources && currentLesson.resources.length > 0 ?
                                `<div style="margin-top: 10px;">
                                    <strong>Resources:</strong>
                                    <div style="margin-top: 5px;">
                                        ${currentLesson.resources.map(resource => {
                                            const fileName = resource.split('/').pop();
                                            const fileType = getFileType(resource);
                                            return `<a href="${resource}" target="_blank" style="display: block; padding: 5px 0; color: #12B3B3;">
                                                <i class="${fileType.icon}"></i> ${fileName}
                                            </a>`;
                                        }).join('')}
                                    </div>
                                </div>` : ''}
                        </div>
                    ` : ''}

                    <h4 style="margin: 20px 0 10px 0;">All Lessons</h4>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Week</th>
                                <th>Topic</th>
                                <th>Dates</th>
                                <th>Standards</th>
                                <th>Resources</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${curriculum.lessons.map(lesson => `
                                <tr ${lesson._id === currentLesson?._id ? 'style="background: #f0fffe;"' : ''}>
                                    <td><strong>${lesson.weekNumber}</strong></td>
                                    <td>${lesson.topic}</td>
                                    <td style="font-size: 0.85em;">
                                        ${lesson.startDate && lesson.endDate ?
                                            `${new Date(lesson.startDate).toLocaleDateString()} - ${new Date(lesson.endDate).toLocaleDateString()}` :
                                            'No dates'}
                                    </td>
                                    <td style="font-size: 0.85em;">${lesson.standards && lesson.standards.length > 0 ? lesson.standards.join(', ') : '—'}</td>
                                    <td>
                                        ${lesson.resources && lesson.resources.length > 0 ?
                                            `<button class="btn btn-sm btn-secondary view-resources-btn" data-lesson-id="${lesson._id}">
                                                <i class="fas fa-link"></i> ${lesson.resources.length} resources
                                            </button>` :
                                            '<span style="color: #999;">No resources</span>'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            curriculumContent.innerHTML = html;

            // Add AI preferences handler
            document.getElementById('edit-ai-preferences-btn')?.addEventListener('click', () => {
                showAIPreferencesModal(curriculum);
            });

            // Add delete handler
            document.getElementById('delete-curriculum-btn')?.addEventListener('click', async () => {
                if (!confirm('Are you sure you want to delete this curriculum? This cannot be undone.')) return;

                try {
                    const res = await fetch(`/api/curriculum/teacher/curriculum/${curriculum._id}`, {
                        method: 'DELETE',
                        credentials: 'include'
                    });

                    const data = await res.json();
                    if (data.success) {
                        alert('Curriculum deleted successfully');
                        loadCurriculum();
                    } else {
                        alert('Error: ' + (data.message || 'Failed to delete curriculum'));
                    }
                } catch (error) {
                    console.error('Error deleting curriculum:', error);
                    alert('Failed to delete curriculum');
                }
            });

            // Add view resources handlers
            document.querySelectorAll('.view-resources-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const lessonId = btn.dataset.lessonId;
                    const lesson = curriculum.lessons.find(l => l._id === lessonId);
                    if (lesson) {
                        showResourcesModal(lesson);
                    }
                });
            });

        } catch (error) {
            console.error('Error loading curriculum:', error);
            curriculumContent.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4e4e;">Failed to load curriculum</div>';
        }
    }

    // Show resources modal
    function showResourcesModal(lesson) {
        const resourcesHtml = `
            <div style="padding: 20px;">
                <h3>${lesson.topic}</h3>
                <p style="color: #666; margin: 10px 0;">Week ${lesson.weekNumber} Resources</p>
                <div style="margin-top: 20px;">
                    ${lesson.resources.map(resource => {
                        const fileName = resource.split('/').pop();
                        const fileType = getFileType(resource);
                        return `
                            <div style="padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;">
                                <a href="${resource}" target="_blank" style="color: #12B3B3; font-weight: 500; display: flex; align-items: center; gap: 10px;">
                                    <i class="${fileType.icon}" style="font-size: 20px; color: ${fileType.color};"></i>
                                    <span>${fileName}</span>
                                </a>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        alert(resourcesHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
        // TODO: Create a proper modal for this
    }

    // Get file type icon and color
    function getFileType(url) {
        if (url.includes('.pdf')) {
            return { icon: 'fas fa-file-pdf', color: '#ff4e4e' };
        } else if (url.includes('.mp4') || url.includes('youtube.com') || url.includes('vimeo.com')) {
            return { icon: 'fas fa-video', color: '#9b51e0' };
        } else if (url.includes('.docx') || url.includes('.doc')) {
            return { icon: 'fas fa-file-word', color: '#2b7cd3' };
        } else if (url.includes('.pptx') || url.includes('.ppt')) {
            return { icon: 'fas fa-file-powerpoint', color: '#d24726' };
        } else if (url.includes('drive.google.com')) {
            return { icon: 'fab fa-google-drive', color: '#12B3B3' };
        } else {
            return { icon: 'fas fa-link', color: '#666' };
        }
    }

    // Show AI preferences modal
    function showAIPreferencesModal(curriculum) {
        const prefs = curriculum.teacherPreferences || {};

        const modalHtml = `
            <div id="ai-preferences-modal" class="modal-overlay" style="display: flex;">
                <div class="modal-content" style="max-width: 700px;">
                    <span class="modal-close-button" id="closeAIPrefsModal">&times;</span>
                    <h2><i class="fas fa-robot"></i> AI Tutor Preferences</h2>
                    <p style="color: #666; margin-bottom: 20px;">
                        Customize how the AI tutor interacts with your students. These preferences will be applied during all tutoring sessions.
                    </p>

                    <form id="ai-preferences-form">
                        <label for="ai-terminology">Terminology Preferences</label>
                        <textarea id="ai-terminology" rows="2" placeholder="e.g., Use 'slope' instead of 'gradient', always say 'parentheses' not 'brackets'">${prefs.terminology || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Specify preferred mathematical terms and vocabulary
                        </p>

                        <label for="ai-solution-methods">Preferred Solution Methods</label>
                        <textarea id="ai-solution-methods" rows="3" placeholder="e.g., Always factor before using quadratic formula, Show graphical representation first for linear equations">${prefs.solutionMethods || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Describe the solution approaches you want the AI to prioritize
                        </p>

                        <label for="ai-scaffolding">Scaffolding Approach</label>
                        <textarea id="ai-scaffolding" rows="3" placeholder="e.g., Break multi-step problems into smaller parts, Always ask students to draw diagrams first">${prefs.scaffolding || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            How should the AI break down complex problems?
                        </p>

                        <label for="ai-common-mistakes">Common Mistakes to Watch For</label>
                        <textarea id="ai-common-mistakes" rows="3" placeholder="e.g., Students often forget to distribute negative signs, Watch for sign errors in integer operations">${prefs.commonMistakes || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Alert the AI to common errors your students make
                        </p>

                        <label for="ai-additional-guidance">Additional Guidance</label>
                        <textarea id="ai-additional-guidance" rows="3" placeholder="e.g., Always encourage students to check their work, Use real-world examples when possible">${prefs.additionalGuidance || ''}</textarea>
                        <p style="font-size: 0.85em; color: #666; margin-top: -10px;">
                            Any other instructions for the AI tutor
                        </p>

                        <div class="form-buttons" style="margin-top: 20px;">
                            <button type="submit" class="submit-btn btn-primary">
                                <i class="fas fa-save"></i> Save Preferences
                            </button>
                            <button type="button" id="cancel-ai-prefs-btn" class="submit-btn cancel-btn btn-tertiary">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to body
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        const modal = document.getElementById('ai-preferences-modal');
        const closeBtn = document.getElementById('closeAIPrefsModal');
        const cancelBtn = document.getElementById('cancel-ai-prefs-btn');
        const form = document.getElementById('ai-preferences-form');

        // Close handlers
        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        // Submit handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            submitBtn.disabled = true;

            try {
                const res = await fetch(`/api/curriculum/teacher/curriculum/${curriculum._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        teacherPreferences: {
                            terminology: document.getElementById('ai-terminology').value,
                            solutionMethods: document.getElementById('ai-solution-methods').value,
                            scaffolding: document.getElementById('ai-scaffolding').value,
                            commonMistakes: document.getElementById('ai-common-mistakes').value,
                            additionalGuidance: document.getElementById('ai-additional-guidance').value
                        }
                    })
                });

                const data = await res.json();
                if (data.success) {
                    alert('AI preferences saved successfully!');
                    closeModal();
                    loadCurriculum();
                } else {
                    alert('Error: ' + (data.message || 'Failed to save preferences'));
                }
            } catch (error) {
                console.error('Error saving AI preferences:', error);
                alert('Failed to save preferences. Please try again.');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Initial load if on curriculum tab
    if (document.querySelector('[data-tab="curriculum"]')?.classList.contains('active')) {
        loadCurriculum();
    }
});
