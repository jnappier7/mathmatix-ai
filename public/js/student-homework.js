// student-homework.js
// Homework display and submission for students

document.addEventListener('DOMContentLoaded', () => {
    const openHomeworkBtn = document.getElementById('open-homework-modal-btn');
    const homeworkModal = document.getElementById('homework-modal');
    const closeHomeworkBtn = document.getElementById('close-homework-modal');
    const homeworkContent = document.getElementById('homework-content');

    // Open homework modal
    if (openHomeworkBtn) {
        openHomeworkBtn.addEventListener('click', async () => {
            homeworkModal.style.display = 'flex';
            await loadHomework();
        });
    }

    // Close modal handlers
    function closeModal() {
        homeworkModal.style.display = 'none';
    }

    if (closeHomeworkBtn) {
        closeHomeworkBtn.addEventListener('click', closeModal);
    }

    // Close on outside click
    homeworkModal?.addEventListener('click', (e) => {
        if (e.target === homeworkModal) {
            closeModal();
        }
    });

    // Load homework from API
    async function loadHomework() {
        homeworkContent.innerHTML = '<p style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading homework...</p>';

        try {
            const res = await fetch('/api/homework/student/homework', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch homework');

            const data = await res.json();

            if (!data.homework || data.homework.length === 0) {
                homeworkContent.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #666;">
                        <i class="fas fa-clipboard-check" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <h3 style="color: #444;">No Homework Assigned</h3>
                        <p>You don't have any homework assignments right now. Check back later!</p>
                    </div>
                `;
                return;
            }

            // Separate by status
            const pending = data.homework.filter(hw => hw.status === 'assigned');
            const submitted = data.homework.filter(hw => hw.status === 'submitted');
            const graded = data.homework.filter(hw => hw.status === 'graded');

            let html = '<div style="padding: 20px;">';

            // Pending assignments
            if (pending.length > 0) {
                html += `
                    <h3 style="color: #ff4e4e; margin-bottom: 15px;">
                        <i class="fas fa-exclamation-circle"></i> Due Soon (${pending.length})
                    </h3>
                    <div style="display: grid; gap: 15px; margin-bottom: 30px;">
                        ${pending.map(hw => renderHomeworkCard(hw, 'pending')).join('')}
                    </div>
                `;
            }

            // Submitted assignments
            if (submitted.length > 0) {
                html += `
                    <h3 style="color: #FFA500; margin-bottom: 15px;">
                        <i class="fas fa-clock"></i> Submitted (${submitted.length})
                    </h3>
                    <div style="display: grid; gap: 15px; margin-bottom: 30px;">
                        ${submitted.map(hw => renderHomeworkCard(hw, 'submitted')).join('')}
                    </div>
                `;
            }

            // Graded assignments
            if (graded.length > 0) {
                html += `
                    <h3 style="color: #12B3B3; margin-bottom: 15px;">
                        <i class="fas fa-check-circle"></i> Graded (${graded.length})
                    </h3>
                    <div style="display: grid; gap: 15px;">
                        ${graded.map(hw => renderHomeworkCard(hw, 'graded')).join('')}
                    </div>
                `;
            }

            html += '</div>';
            homeworkContent.innerHTML = html;

            // Add click handlers for view details
            document.querySelectorAll('.view-homework-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const homeworkId = btn.dataset.homeworkId;
                    const homework = data.homework.find(hw => hw._id === homeworkId);
                    if (homework) {
                        showHomeworkDetails(homework);
                    }
                });
            });

        } catch (error) {
            console.error('Error loading homework:', error);
            homeworkContent.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #ff4e4e;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Failed to load homework. Please try again.</p>
                </div>
            `;
        }
    }

    // Render homework card
    function renderHomeworkCard(hw, type) {
        const dueDate = hw.dueDate ? new Date(hw.dueDate) : null;
        const isOverdue = dueDate && dueDate < new Date() && type === 'pending';

        let borderColor = '#e0e0e0';
        let statusBadge = '';

        if (type === 'pending') {
            borderColor = isOverdue ? '#ff4e4e' : '#FFA500';
            statusBadge = isOverdue
                ? '<span style="background: #ff4e4e; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.8em;">OVERDUE</span>'
                : '<span style="background: #FFA500; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.8em;">DUE SOON</span>';
        } else if (type === 'submitted') {
            borderColor = '#FFA500';
            statusBadge = '<span style="background: #FFA500; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.8em;">SUBMITTED</span>';
        } else {
            borderColor = '#12B3B3';
            const score = hw.grade?.score || 0;
            const total = hw.grade?.totalPoints || 100;
            const percent = Math.round((score / total) * 100);
            statusBadge = `<span style="background: #12B3B3; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.8em;">${percent}%</span>`;
        }

        return `
            <div style="border: 2px solid ${borderColor}; border-radius: 8px; padding: 15px; background: white;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 5px 0;">${hw.title}</h4>
                        <p style="margin: 0; color: #666; font-size: 0.9em;">${hw.description || 'No description'}</p>
                    </div>
                    ${statusBadge}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <div style="font-size: 0.85em; color: #666;">
                        ${dueDate ? `<i class="fas fa-calendar"></i> Due: ${dueDate.toLocaleDateString()}` : 'No due date'}
                    </div>
                    <button class="btn btn-sm btn-secondary view-homework-btn" data-homework-id="${hw._id}">
                        <i class="fas fa-eye"></i> View
                    </button>
                </div>
            </div>
        `;
    }

    // Show homework details (placeholder for now)
    function showHomeworkDetails(homework) {
        alert(`Homework: ${homework.title}\n\nDescription: ${homework.description || 'No description'}\n\nThis feature will be enhanced to show full homework details and allow submissions.`);
    }
});
