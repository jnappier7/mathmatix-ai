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

    // Load resources from API
    async function loadResources() {
        resourcesContent.innerHTML = '<p style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading resources...</p>';

        try {
            const res = await fetch('/api/curriculum/student/resources', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch resources');

            const data = await res.json();

            if (!data.hasResources) {
                resourcesContent.innerHTML = `
                    <div style="padding: 20px;">
                        <!-- Tentative Schedule Section -->
                        <div style="margin-bottom: 25px;">
                            <h3 style="margin: 0 0 15px 0; color: #333; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-calendar-alt" style="color: #12B3B3;"></i>
                                Tentative Schedule
                            </h3>
                            <div class="schedule-iframe-container">
                                <iframe src="https://www.commoncurriculum.com/sites/tentative-schedule" title="Common Curriculum Tentative Schedule"></iframe>
                            </div>
                            <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666; text-align: center;">
                                <i class="fas fa-info-circle"></i> View the full curriculum schedule and click links to explore lesson resources
                            </p>
                        </div>

                        <div style="padding: 40px; text-align: center; color: #666; background: #f8f9fa; border-radius: 8px;">
                            <i class="fas fa-book-open" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                            <h3 style="color: #444;">No Additional Resources Available</h3>
                            <p>${data.currentTopic ? `You're currently studying: <strong>${data.currentTopic}</strong>` : 'Your teacher hasn\'t uploaded resources yet.'}</p>
                            <p style="font-size: 0.9em; margin-top: 10px;">
                                Resources like lesson videos, worksheets, and practice problems will appear here when your teacher adds them.
                            </p>
                        </div>
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
            let html = `
                <div style="padding: 20px;">
                    <!-- Tentative Schedule Section -->
                    <div style="margin-bottom: 25px;">
                        <h3 style="margin: 0 0 15px 0; color: #333; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-calendar-alt" style="color: #12B3B3;"></i>
                            Tentative Schedule
                        </h3>
                        <div class="schedule-iframe-container">
                            <iframe src="https://www.commoncurriculum.com/sites/tentative-schedule" title="Common Curriculum Tentative Schedule"></iframe>
                        </div>
                        <p style="margin: 10px 0 0 0; font-size: 0.85em; color: #666; text-align: center;">
                            <i class="fas fa-info-circle"></i> View the full curriculum schedule and click links to explore lesson resources
                        </p>
                    </div>

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
});
