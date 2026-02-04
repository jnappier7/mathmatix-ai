/**
 * Teacher Announcements - IM/Announcement Style Messaging
 * Allows teachers to send messages to classes or individual students
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const announcementForm = document.getElementById('announcement-form');
    const targetSelect = document.getElementById('announcement-target');
    const studentSelectContainer = document.getElementById('student-select-container');
    const studentCheckboxes = document.getElementById('student-checkboxes');
    const sentAnnouncementsList = document.getElementById('sent-announcements-list');
    const announcementStatus = document.getElementById('announcement-status');

    let studentsData = [];

    // Initialize when announcements tab is clicked
    const announcementsTab = document.querySelector('[data-tab="announcements"]');
    if (announcementsTab) {
        announcementsTab.addEventListener('click', () => {
            loadStudentsForSelection();
            loadSentAnnouncements();
        });
    }

    // Target selection change handler
    if (targetSelect) {
        targetSelect.addEventListener('change', (e) => {
            if (e.target.value === 'individual') {
                studentSelectContainer.style.display = 'block';
                loadStudentsForSelection();
            } else {
                studentSelectContainer.style.display = 'none';
            }
        });
    }

    // Load students for checkbox selection
    async function loadStudentsForSelection() {
        if (studentsData.length > 0) {
            renderStudentCheckboxes();
            return;
        }

        try {
            const response = await fetch('/api/announcements/teacher/students');
            if (!response.ok) throw new Error('Failed to load students');

            const data = await response.json();
            studentsData = data.students || [];
            renderStudentCheckboxes();
        } catch (error) {
            console.error('[Announcements] Error loading students:', error);
            studentCheckboxes.innerHTML = '<p style="color: #e74c3c;">Failed to load students</p>';
        }
    }

    // Render student checkboxes
    function renderStudentCheckboxes() {
        if (studentsData.length === 0) {
            studentCheckboxes.innerHTML = '<p style="color: #666; font-style: italic;">No students assigned</p>';
            return;
        }

        studentCheckboxes.innerHTML = `
            <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">
                <label style="cursor: pointer; font-weight: 600;">
                    <input type="checkbox" id="select-all-students" style="margin-right: 8px;">
                    Select All (${studentsData.length})
                </label>
            </div>
            ${studentsData.map(student => `
                <label style="display: block; padding: 6px 0; cursor: pointer; border-bottom: 1px solid #f0f0f0;">
                    <input type="checkbox" class="student-checkbox" value="${student._id}" style="margin-right: 8px;">
                    ${student.firstName} ${student.lastName}
                    <span style="color: #999; font-size: 0.85em;">(${student.username})</span>
                </label>
            `).join('')}
        `;

        // Select all handler
        const selectAllCheckbox = document.getElementById('select-all-students');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                document.querySelectorAll('.student-checkbox').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
        }
    }

    // Form submission
    if (announcementForm) {
        announcementForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const targetType = targetSelect.value;
            const title = document.getElementById('announcement-title').value.trim();
            const body = document.getElementById('announcement-body').value.trim();
            const priority = document.getElementById('announcement-priority').value;
            const category = document.getElementById('announcement-category').value;

            // Validate
            if (!title || !body) {
                showStatus('Please fill in all required fields', 'error');
                return;
            }

            // Get selected students if individual
            let recipientIds = [];
            if (targetType === 'individual') {
                recipientIds = Array.from(document.querySelectorAll('.student-checkbox:checked'))
                    .map(cb => cb.value);

                if (recipientIds.length === 0) {
                    showStatus('Please select at least one student', 'error');
                    return;
                }
            }

            // Disable form while sending
            const submitBtn = announcementForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            try {
                const response = await csrfFetch('/api/announcements/teacher/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetType,
                        recipientIds: targetType === 'individual' ? recipientIds : undefined,
                        title,
                        body,
                        priority,
                        category
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showStatus(`Announcement sent to ${data.announcement.recipientCount} student(s)!`, 'success');
                    announcementForm.reset();
                    studentSelectContainer.style.display = 'none';
                    loadSentAnnouncements();
                } else {
                    showStatus(data.message || 'Failed to send announcement', 'error');
                }
            } catch (error) {
                console.error('[Announcements] Send error:', error);
                showStatus('Error sending announcement. Please try again.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Announcement';
            }
        });
    }

    // Load sent announcements
    async function loadSentAnnouncements() {
        if (!sentAnnouncementsList) return;

        sentAnnouncementsList.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        try {
            const response = await fetch('/api/announcements/teacher');
            if (!response.ok) throw new Error('Failed to load announcements');

            const data = await response.json();
            const announcements = data.announcements || [];

            if (announcements.length === 0) {
                sentAnnouncementsList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p>No announcements sent yet</p>
                        <p style="font-size: 0.9em;">Send your first announcement to your students!</p>
                    </div>
                `;
                return;
            }

            sentAnnouncementsList.innerHTML = announcements.map(a => {
                const date = new Date(a.createdAt);
                const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const priorityColors = {
                    normal: '#27ae60',
                    important: '#f39c12',
                    urgent: '#e74c3c'
                };

                const categoryIcons = {
                    general: 'fa-info-circle',
                    assignment: 'fa-book',
                    reminder: 'fa-bell',
                    encouragement: 'fa-heart',
                    achievement: 'fa-trophy',
                    event: 'fa-calendar'
                };

                const readPercent = a.totalRecipients > 0
                    ? Math.round((a.readCount / a.totalRecipients) * 100)
                    : 0;

                return `
                    <div class="announcement-card" style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 12px; border-left: 4px solid ${priorityColors[a.priority] || '#27ae60'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fas ${categoryIcons[a.category] || 'fa-info-circle'}" style="color: ${priorityColors[a.priority]}"></i>
                                <span style="font-weight: 600; color: #333;">${escapeHtml(a.title)}</span>
                            </div>
                            <span style="font-size: 0.8em; color: #999;">${dateStr}</span>
                        </div>
                        <p style="margin: 0 0 10px 0; color: #555; font-size: 0.9em; line-height: 1.5;">${escapeHtml(a.body).substring(0, 150)}${a.body.length > 150 ? '...' : ''}</p>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <span style="font-size: 0.8em; color: #666;">
                                    <i class="fas fa-users"></i> ${a.totalRecipients} recipient${a.totalRecipients !== 1 ? 's' : ''}
                                </span>
                                <span style="font-size: 0.8em; color: ${readPercent >= 50 ? '#27ae60' : '#f39c12'};">
                                    <i class="fas fa-eye"></i> ${readPercent}% read
                                </span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn-icon view-stats-btn" data-id="${a._id}" title="View read stats" style="background: #f5f5f5; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-chart-bar"></i>
                                </button>
                                <button class="btn-icon delete-announcement-btn" data-id="${a._id}" title="Delete" style="background: #fff5f5; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; color: #e74c3c;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Add event listeners for buttons
            document.querySelectorAll('.view-stats-btn').forEach(btn => {
                btn.addEventListener('click', () => viewAnnouncementStats(btn.dataset.id));
            });

            document.querySelectorAll('.delete-announcement-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteAnnouncement(btn.dataset.id));
            });

        } catch (error) {
            console.error('[Announcements] Load error:', error);
            sentAnnouncementsList.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 20px;">Error loading announcements</p>';
        }
    }

    // View announcement stats
    async function viewAnnouncementStats(announcementId) {
        try {
            const response = await fetch(`/api/announcements/teacher/${announcementId}/stats`);
            const data = await response.json();

            if (!data.success) {
                alert('Failed to load stats: ' + data.message);
                return;
            }

            const stats = data.stats;

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal-overlay is-visible';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;';
            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <div style="padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0;">Read Statistics</h3>
                        <button class="close-stats-modal" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                    </div>
                    <div style="padding: 20px;">
                        <div style="display: flex; justify-content: space-around; margin-bottom: 20px; text-align: center;">
                            <div>
                                <div style="font-size: 32px; font-weight: 700; color: #27ae60;">${stats.readCount}</div>
                                <div style="color: #666; font-size: 14px;">Read</div>
                            </div>
                            <div>
                                <div style="font-size: 32px; font-weight: 700; color: #e74c3c;">${stats.totalRecipients - stats.readCount}</div>
                                <div style="color: #666; font-size: 14px;">Unread</div>
                            </div>
                            <div>
                                <div style="font-size: 32px; font-weight: 700; color: #667eea;">${stats.readPercentage}%</div>
                                <div style="color: #666; font-size: 14px;">Read Rate</div>
                            </div>
                        </div>

                        <h4 style="margin: 20px 0 10px; font-size: 14px; color: #333;">Recipients</h4>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${stats.recipients.map(r => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f0f0f0;">
                                    <span>${r.firstName} ${r.lastName}</span>
                                    ${r.hasRead
                                        ? `<span style="color: #27ae60; font-size: 12px;"><i class="fas fa-check-circle"></i> Read ${new Date(r.readAt).toLocaleString()}</span>`
                                        : '<span style="color: #999; font-size: 12px;"><i class="fas fa-clock"></i> Not read</span>'
                                    }
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            modal.querySelector('.close-stats-modal').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

        } catch (error) {
            console.error('[Announcements] Stats error:', error);
            alert('Error loading statistics');
        }
    }

    // Delete announcement
    async function deleteAnnouncement(announcementId) {
        if (!confirm('Are you sure you want to delete this announcement?')) return;

        try {
            const response = await csrfFetch(`/api/announcements/teacher/${announcementId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                loadSentAnnouncements();
            } else {
                alert('Failed to delete: ' + data.message);
            }
        } catch (error) {
            console.error('[Announcements] Delete error:', error);
            alert('Error deleting announcement');
        }
    }

    // Show status message
    function showStatus(message, type) {
        if (!announcementStatus) return;

        announcementStatus.style.display = 'block';
        announcementStatus.style.padding = '12px';
        announcementStatus.style.borderRadius = '6px';
        announcementStatus.style.textAlign = 'center';

        if (type === 'success') {
            announcementStatus.style.background = '#d4edda';
            announcementStatus.style.color = '#155724';
            announcementStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        } else {
            announcementStatus.style.background = '#f8d7da';
            announcementStatus.style.color = '#721c24';
            announcementStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        }

        setTimeout(() => {
            announcementStatus.style.display = 'none';
        }, 5000);
    }

    // HTML escape helper
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
