// student-resources.js
// Learning resources display for students

console.log('📚 Student Resources JS Loading...');

document.addEventListener('DOMContentLoaded', () => {
    console.log('📚 Student Resources - DOM Ready');

    const openResourcesBtn = document.getElementById('open-resources-modal-btn');
    const resourcesModal = document.getElementById('resources-modal');
    const closeResourcesBtn = document.getElementById('close-resources-modal');
    const resourcesContent = document.getElementById('resources-content');

    console.log('📚 Elements found:', {
        button: !!openResourcesBtn,
        modal: !!resourcesModal,
        closeBtn: !!closeResourcesBtn,
        content: !!resourcesContent
    });

    // Open resources modal
    if (openResourcesBtn && resourcesModal) {
        console.log('📚 Attaching click handler to Resources button');
        openResourcesBtn.addEventListener('click', async (e) => {
            console.log('📚 Resources button clicked!');
            e.preventDefault();
            e.stopPropagation();
            try {
                resourcesModal.classList.add('is-visible');
                await loadResources();
            } catch (error) {
                console.error('📚 Error opening resources:', error);
                alert('Error opening resources: ' + error.message);
            }
        });
        console.log('📚 Resources button click handler attached successfully');
    } else {
        console.error('📚 Missing elements!', {
            button: !openResourcesBtn ? 'MISSING' : 'OK',
            modal: !resourcesModal ? 'MISSING' : 'OK'
        });
    }

    // Close modal handlers
    function closeModal() {
        resourcesModal.classList.remove('is-visible');
    }

    if (closeResourcesBtn) {
        closeResourcesBtn.addEventListener('click', closeModal);
    }

    // Close on outside click
    resourcesModal?.addEventListener('click', (e) => {
        if (e.target === resourcesModal) {
            closeModal();
        }
    });

    // "Ask Tutor About This" button — event delegation on resources content
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
            // Place cursor at end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(chatInput);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    });

    // Load resources from API
    async function loadResources() {
        resourcesContent.innerHTML = '<p style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading resources...</p>';

        try {
            // Fetch curriculum resources, student uploads, and teacher-shared resources in parallel
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

            if (!data.hasResources) {
                // Use teacher's actual Common Curriculum URL if available, otherwise use generic schedule
                const scheduleUrl = data.scheduleUrl || 'https://www.commonplanner.com/sites/tentative-schedule';

                resourcesContent.innerHTML = `
                    <div style="padding: 20px;">
                        <!-- Tentative Schedule Section -->
                        <div style="margin-bottom: 25px;">
                            <h3 style="margin: 0 0 15px 0; color: #333; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-calendar-alt" style="color: #12B3B3;"></i>
                                ${data.scheduleUrl ? 'Your Class Schedule' : 'Tentative Schedule'}
                            </h3>
                            <div class="schedule-iframe-container">
                                <iframe src="${scheduleUrl}" title="Common Curriculum Schedule"></iframe>
                            </div>
                            <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666; text-align: center;">
                                <i class="fas fa-info-circle"></i> View the full curriculum schedule and click links to explore lesson resources
                            </p>
                        </div>

                        ${generateTeacherResourcesSection(teacherResources)}

                        ${generateMyUploadsSection(myUploads)}

                        ${teacherResources.length === 0 ? `
                        <div style="padding: 40px; text-align: center; color: #666; background: #f8f9fa; border-radius: 8px;">
                            <i class="fas fa-book-open" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                            <h3 style="color: #444;">No Additional Resources Available</h3>
                            <p>${data.currentTopic ? `You're currently studying: <strong>${data.currentTopic}</strong>` : 'Your teacher hasn\'t uploaded resources yet.'}</p>
                            <p style="font-size: 0.9em; margin-top: 10px;">
                                Resources like lesson videos, worksheets, and practice problems will appear here when your teacher adds them.
                            </p>
                        </div>
                        ` : ''}
                    </div>
                `;
                return;
            }

            const lesson = data.currentLesson;

            // Categorize resources by type
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

            // Build HTML
            // Use teacher's actual Common Curriculum URL if available, otherwise use generic schedule
            const scheduleUrl = data.scheduleUrl || 'https://www.commoncurriculum.com/sites/tentative-schedule';

            let html = `
                <div style="padding: 20px;">
                    <!-- Tentative Schedule Section -->
                    <div style="margin-bottom: 25px;">
                        <h3 style="margin: 0 0 15px 0; color: #333; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-calendar-alt" style="color: #12B3B3;"></i>
                            ${data.scheduleUrl ? 'Your Class Schedule' : 'Tentative Schedule'}
                        </h3>
                        <div class="schedule-iframe-container">
                            <iframe src="${scheduleUrl}" title="Common Curriculum Schedule"></iframe>
                        </div>
                        <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666; text-align: center;">
                            <i class="fas fa-info-circle"></i> View the full curriculum schedule and click links to explore lesson resources
                        </p>
                    </div>

                    ${generateTeacherResourcesSection(teacherResources)}

                    ${generateMyUploadsSection(myUploads)}

                    <div style="background: #e8f9f8; border-left: 4px solid #12B3B3; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
                        <h3 style="margin: 0 0 10px 0; color: #12B3B3;">
                            <i class="fas fa-calendar-check"></i> Week ${lesson.weekNumber}: ${lesson.topic}
                        </h3>
                        ${lesson.startDate && lesson.endDate ? `
                            <p style="margin: 5px 0; font-size: 0.9em; color: #666;">
                                ${new Date(lesson.startDate).toLocaleDateString()} - ${new Date(lesson.endDate).toLocaleDateString()}
                            </p>
                        ` : ''}
                        ${lesson.standards && lesson.standards.length > 0 ? `
                            <p style="margin: 5px 0; font-size: 0.9em; color: #666;">
                                <strong>Standards:</strong> ${lesson.standards.join(', ')}
                            </p>
                        ` : ''}
                    </div>

                    ${videos.length > 0 ? `
                        <div style="margin-bottom: 25px;">
                            <h4 style="margin: 0 0 10px 0; color: #333;">
                                <i class="fas fa-video" style="color: #9b51e0;"></i> Lesson Videos
                            </h4>
                            <div style="display: grid; gap: 10px;">
                                ${videos.map(url => {
                                    const fileName = url.split('/').pop();
                                    return `
                                        <a href="${url}" target="_blank" class="resource-link" style="display: flex; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; text-decoration: none; color: #333; border: 1px solid #e0e0e0; transition: all 0.2s;">
                                            <i class="fas fa-video" style="font-size: 24px; color: #9b51e0; margin-right: 15px;"></i>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 500;">${fileName}</div>
                                                <div style="font-size: 0.85em; color: #666; margin-top: 2px;">Click to watch</div>
                                            </div>
                                            <i class="fas fa-external-link-alt" style="color: #999;"></i>
                                        </a>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${pdfs.length > 0 ? `
                        <div style="margin-bottom: 25px;">
                            <h4 style="margin: 0 0 10px 0; color: #333;">
                                <i class="fas fa-file-pdf" style="color: #ff4e4e;"></i> Worksheets & Handouts
                            </h4>
                            <div style="display: grid; gap: 10px;">
                                ${pdfs.map(url => {
                                    const fileName = url.split('/').pop();
                                    return `
                                        <a href="${url}" target="_blank" class="resource-link" style="display: flex; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; text-decoration: none; color: #333; border: 1px solid #e0e0e0; transition: all 0.2s;">
                                            <i class="fas fa-file-pdf" style="font-size: 24px; color: #ff4e4e; margin-right: 15px;"></i>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 500;">${fileName}</div>
                                                <div style="font-size: 0.85em; color: #666; margin-top: 2px;">Click to open PDF</div>
                                            </div>
                                            <i class="fas fa-external-link-alt" style="color: #999;"></i>
                                        </a>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${other.length > 0 ? `
                        <div style="margin-bottom: 25px;">
                            <h4 style="margin: 0 0 10px 0; color: #333;">
                                <i class="fas fa-link" style="color: #12B3B3;"></i> Other Resources
                            </h4>
                            <div style="display: grid; gap: 10px;">
                                ${other.map(url => {
                                    const fileName = url.split('/').pop();
                                    const fileType = getFileType(url);
                                    return `
                                        <a href="${url}" target="_blank" class="resource-link" style="display: flex; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; text-decoration: none; color: #333; border: 1px solid #e0e0e0; transition: all 0.2s;">
                                            <i class="${fileType.icon}" style="font-size: 24px; color: ${fileType.color}; margin-right: 15px;"></i>
                                            <div style="flex: 1;">
                                                <div style="font-weight: 500;">${fileName}</div>
                                                <div style="font-size: 0.85em; color: #666; margin-top: 2px;">Click to open</div>
                                            </div>
                                            <i class="fas fa-external-link-alt" style="color: #999;"></i>
                                        </a>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div style="margin-top: 25px; padding: 15px; background: #f0f7ff; border-radius: 6px; border-left: 4px solid #2196F3;">
                        <p style="margin: 0; font-size: 0.9em; color: #555;">
                            <i class="fas fa-lightbulb" style="color: #FFC107;"></i>
                            <strong>Tip:</strong> These resources are aligned with what you're learning in class.
                            Watch the videos before attempting problems, and use the worksheets for extra practice!
                        </p>
                    </div>
                </div>
            `;

            resourcesContent.innerHTML = html;

            // Add hover effects
            document.querySelectorAll('.resource-link').forEach(link => {
                link.addEventListener('mouseenter', function() {
                    this.style.background = '#e3f2fd';
                    this.style.transform = 'translateX(5px)';
                });
                link.addEventListener('mouseleave', function() {
                    this.style.background = '#f8f9fa';
                    this.style.transform = 'translateX(0)';
                });
            });

        } catch (error) {
            console.error('Error loading resources:', error);
            resourcesContent.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #ff4e4e;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Failed to load resources. Please try again.</p>
                </div>
            `;
        }
    }

    // Get file type icon and color
    function getFileType(url) {
        if (url.includes('.docx') || url.includes('.doc')) {
            return { icon: 'fas fa-file-word', color: '#2b7cd3' };
        } else if (url.includes('.pptx') || url.includes('.ppt')) {
            return { icon: 'fas fa-file-powerpoint', color: '#d24726' };
        } else if (url.includes('drive.google.com')) {
            return { icon: 'fab fa-google-drive', color: '#12B3B3' };
        } else {
            return { icon: 'fas fa-link', color: '#666' };
        }
    }

    // Generate "Teacher Resources" section HTML
    function generateTeacherResourcesSection(resources) {
        if (!resources || resources.length === 0) {
            return ''; // Don't show section if no teacher resources
        }

        const getResourceIcon = (fileType) => {
            const icons = {
                'pdf': { class: 'fas fa-file-pdf', color: '#ff4e4e' },
                'doc': { class: 'fas fa-file-word', color: '#2b7cd3' },
                'docx': { class: 'fas fa-file-word', color: '#2b7cd3' },
                'ppt': { class: 'fas fa-file-powerpoint', color: '#d24726' },
                'pptx': { class: 'fas fa-file-powerpoint', color: '#d24726' },
                'jpg': { class: 'fas fa-file-image', color: '#4CAF50' },
                'jpeg': { class: 'fas fa-file-image', color: '#4CAF50' },
                'png': { class: 'fas fa-file-image', color: '#4CAF50' },
                'webp': { class: 'fas fa-file-image', color: '#4CAF50' },
                'heic': { class: 'fas fa-file-image', color: '#4CAF50' }
            };
            return icons[fileType.toLowerCase()] || { class: 'fas fa-file', color: '#666' };
        };

        const formatFileSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        };

        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            const now = new Date();
            const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays} days ago`;
            return date.toLocaleDateString();
        };

        const categoryLabels = {
            'worksheet': 'Worksheet',
            'practice': 'Practice',
            'homework': 'Homework',
            'notes': 'Notes',
            'test': 'Test',
            'quiz': 'Quiz',
            'handout': 'Handout',
            'other': 'Resource'
        };

        const resourcesHtml = resources.map(resource => {
            const icon = getResourceIcon(resource.fileType);
            const categoryLabel = categoryLabels[resource.category] || 'Resource';
            const escapedName = resource.displayName.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            return `
                <div class="resource-card-wrapper">
                    <a href="/api/teacher-resources/download/${resource.id}" target="_blank" class="resource-link"
                       style="display: flex; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; text-decoration: none; color: #333; border: 1px solid #e0e0e0; transition: all 0.2s;">
                        <i class="${icon.class}" style="font-size: 24px; color: ${icon.color}; margin-right: 15px;"></i>
                        <div style="flex: 1;">
                            <div style="font-weight: 500;">${resource.displayName}</div>
                            <div style="font-size: 0.85em; color: #666; margin-top: 2px;">
                                <span style="background: #e8f5e9; color: #27ae60; padding: 1px 6px; border-radius: 3px; font-size: 0.9em;">${categoryLabel}</span>
                                ${resource.fileType.toUpperCase()} &bull; ${formatFileSize(resource.fileSize)} &bull; ${formatDate(resource.uploadedAt)}
                            </div>
                            ${resource.description ? `<div style="font-size: 0.85em; color: #888; margin-top: 4px;">${resource.description}</div>` : ''}
                        </div>
                        <i class="fas fa-download" style="color: #999;"></i>
                    </a>
                    <button class="send-to-tutor-btn" data-resource-name="${escapedName}" title="Share this resource with your tutor">
                        <i class="fas fa-comment-dots"></i> Ask Tutor About This
                    </button>
                </div>
            `;
        }).join('');

        return `
            <div style="margin-bottom: 25px;">
                <h3 style="margin: 0 0 15px 0; color: #333; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-chalkboard-teacher" style="color: #27ae60;"></i>
                    Teacher Resources
                </h3>
                <div style="display: grid; gap: 10px;">
                    ${resourcesHtml}
                </div>
                <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666; text-align: center;">
                    <i class="fas fa-lightbulb" style="color: #FFC107;"></i>
                    <strong>Tip:</strong> Mention any resource by name in the chat and the AI will help you work through it!
                </p>
            </div>
        `;
    }

    // Generate "My Uploads" section HTML
    function generateMyUploadsSection(uploads) {
        if (!uploads || uploads.length === 0) {
            return ''; // Don't show section if no uploads
        }

        const formatFileSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        };

        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            const now = new Date();
            const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays} days ago`;
            return date.toLocaleDateString();
        };

        const uploadsHtml = uploads.map(upload => {
            const icon = upload.fileType === 'pdf' ?
                { class: 'fas fa-file-pdf', color: '#ff4e4e' } :
                { class: 'fas fa-image', color: '#4CAF50' };

            return `
                <a href="/api/student/uploads/${upload._id}/file" target="_blank" class="resource-link upload-link"
                   data-upload-id="${upload._id}"
                   style="display: flex; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 6px; text-decoration: none; color: #333; border: 1px solid #e0e0e0; transition: all 0.2s;">
                    <i class="${icon.class}" style="font-size: 24px; color: ${icon.color}; margin-right: 15px;"></i>
                    <div style="flex: 1;">
                        <div style="font-weight: 500;">${upload.originalFilename}</div>
                        <div style="font-size: 0.85em; color: #666; margin-top: 2px;">
                            ${formatFileSize(upload.fileSize)} • ${formatDate(upload.uploadedAt)}
                        </div>
                    </div>
                    <i class="fas fa-external-link-alt" style="color: #999;"></i>
                </a>
            `;
        }).join('');

        return `
            <div style="margin-bottom: 25px;">
                <h3 style="margin: 0 0 15px 0; color: #333; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-folder-open" style="color: #FF9800;"></i>
                    My Uploads
                </h3>
                <div style="display: grid; gap: 10px;">
                    ${uploadsHtml}
                </div>
                <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666; text-align: center;">
                    <i class="fas fa-lightbulb" style="color: #FFC107;"></i>
                    <strong>Pro tip:</strong> The AI can reference your previously uploaded problems to provide better help!
                </p>
            </div>
        `;
    }
});
