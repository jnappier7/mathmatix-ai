/**
 * Admin Bulk Email - Campaign Management UI
 * Handles bulk email sending to students, parents, teachers, or classes
 */

document.addEventListener('DOMContentLoaded', () => {
    // Modal elements
    const bulkEmailModal = document.getElementById('bulkEmailModal');
    const emailHistoryModal = document.getElementById('emailHistoryModal');

    // Buttons
    const openBulkEmailBtn = document.getElementById('openBulkEmailBtn');
    const viewEmailCampaignsBtn = document.getElementById('viewEmailCampaignsBtn');
    const closeBulkEmailModal = document.getElementById('closeBulkEmailModal');
    const closeEmailHistoryModal = document.getElementById('closeEmailHistoryModal');
    const previewEmailBtn = document.getElementById('previewEmailBtn');
    const sendBulkEmailBtn = document.getElementById('sendBulkEmailBtn');

    // Form elements
    const audienceTypeSelect = document.getElementById('emailAudienceType');
    const classSelectContainer = document.getElementById('classSelectContainer');
    const classSelect = document.getElementById('emailClassSelect');
    const recipientPreview = document.getElementById('recipientPreview');
    const recipientCount = document.getElementById('recipientCount');
    const emailSubject = document.getElementById('emailSubject');
    const emailTemplate = document.getElementById('emailTemplate');
    const emailBody = document.getElementById('emailBody');
    const emailCategory = document.getElementById('emailCategory');
    const emailPriority = document.getElementById('emailPriority');
    const emailSendStatus = document.getElementById('emailSendStatus');

    // Stats elements
    const emailsSentToday = document.getElementById('emailsSentToday');
    const totalCampaigns = document.getElementById('totalCampaigns');

    // Campaign list
    const emailCampaignsList = document.getElementById('emailCampaignsList');

    let audienceData = null;
    let templates = [];

    // Initialize
    loadEmailStats();

    // Modal open handlers
    if (openBulkEmailBtn) {
        openBulkEmailBtn.addEventListener('click', () => {
            openModal(bulkEmailModal);
            loadAudienceData();
            loadTemplates();
        });
    }

    if (viewEmailCampaignsBtn) {
        viewEmailCampaignsBtn.addEventListener('click', () => {
            openModal(emailHistoryModal);
            loadCampaignHistory();
        });
    }

    // Modal close handlers
    if (closeBulkEmailModal) {
        closeBulkEmailModal.addEventListener('click', () => closeModal(bulkEmailModal));
    }
    if (closeEmailHistoryModal) {
        closeEmailHistoryModal.addEventListener('click', () => closeModal(emailHistoryModal));
    }

    // Close on overlay click
    [bulkEmailModal, emailHistoryModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
        }
    });

    // Audience type change handler
    if (audienceTypeSelect) {
        audienceTypeSelect.addEventListener('change', async (e) => {
            const type = e.target.value;

            // Show/hide class select
            if (type === 'class') {
                classSelectContainer.style.display = 'block';
                await loadClasses();
            } else {
                classSelectContainer.style.display = 'none';
            }

            // Update recipient preview
            updateRecipientPreview(type);

            // Enable/disable send button
            validateForm();
        });
    }

    // Class select change handler
    if (classSelect) {
        classSelect.addEventListener('change', () => {
            updateRecipientPreview('class');
            validateForm();
        });
    }

    // Form validation on input
    [emailSubject, emailBody].forEach(el => {
        if (el) {
            el.addEventListener('input', validateForm);
        }
    });

    // Template change handler
    if (emailTemplate) {
        emailTemplate.addEventListener('change', () => {
            const templateId = emailTemplate.value;
            if (templateId && templates.length > 0) {
                const template = templates.find(t => t.id === templateId);
                if (template) {
                    emailSubject.value = template.subject;
                    emailBody.value = template.body;
                    validateForm();
                }
            }
        });
    }

    // Preview button
    if (previewEmailBtn) {
        previewEmailBtn.addEventListener('click', previewEmail);
    }

    // Send button
    if (sendBulkEmailBtn) {
        sendBulkEmailBtn.addEventListener('click', sendBulkEmail);
    }

    // Load audience data
    async function loadAudienceData() {
        try {
            const response = await fetch('/api/admin/email/audiences');
            if (!response.ok) throw new Error('Failed to load audiences');

            audienceData = await response.json();

            // Update audience options with counts
            if (audienceTypeSelect) {
                const audiences = audienceData.audiences;
                audienceTypeSelect.innerHTML = `
                    <option value="">Select audience...</option>
                    <option value="all_students">All Students (${audiences.all_students.count})</option>
                    <option value="all_parents">All Parents (${audiences.all_parents.count})</option>
                    <option value="all_teachers">All Teachers (${audiences.all_teachers.count})</option>
                    <option value="class">Specific Class</option>
                `;
            }
        } catch (error) {
            console.error('[BulkEmail] Error loading audiences:', error);
        }
    }

    // Load classes for class select
    async function loadClasses() {
        if (!audienceData || !audienceData.classes) return;

        classSelect.innerHTML = `
            <option value="">Select class...</option>
            ${audienceData.classes.map(c => `
                <option value="${c._id}">${c.className || c.code} - ${c.teacherName} (${c.studentCount} students)</option>
            `).join('')}
        `;
    }

    // Load email templates
    async function loadTemplates() {
        try {
            const response = await fetch('/api/admin/email/templates');
            if (!response.ok) return;

            const data = await response.json();
            templates = data.templates || [];

            if (emailTemplate) {
                emailTemplate.innerHTML = `
                    <option value="">Start from scratch...</option>
                    ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                `;
            }
        } catch (error) {
            console.error('[BulkEmail] Error loading templates:', error);
        }
    }

    // Update recipient preview
    async function updateRecipientPreview(audienceType) {
        if (!audienceType) {
            recipientPreview.style.display = 'none';
            return;
        }

        let count = 0;

        if (audienceType === 'class') {
            const classId = classSelect.value;
            if (!classId) {
                recipientPreview.style.display = 'none';
                return;
            }
            const selectedClass = audienceData?.classes?.find(c => c._id === classId);
            count = selectedClass?.studentCount || 0;
        } else if (audienceData?.audiences?.[audienceType]) {
            count = audienceData.audiences[audienceType].count;
        }

        recipientCount.textContent = count;
        recipientPreview.style.display = 'block';
    }

    // Validate form
    function validateForm() {
        const audienceType = audienceTypeSelect?.value;
        const subject = emailSubject?.value?.trim();
        const body = emailBody?.value?.trim();

        let valid = audienceType && subject && body;

        if (audienceType === 'class' && !classSelect?.value) {
            valid = false;
        }

        if (sendBulkEmailBtn) {
            sendBulkEmailBtn.disabled = !valid;
        }

        return valid;
    }

    // Preview email
    function previewEmail() {
        const subject = emailSubject?.value || 'No subject';
        const body = emailBody?.value || 'No content';

        // Create preview modal
        const preview = document.createElement('div');
        preview.className = 'modal-overlay';
        preview.style.cssText = 'display: flex; justify-content: center; align-items: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 100000;';
        preview.innerHTML = `
            <div style="background: white; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <div style="padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0;"><i class="fas fa-eye"></i> Email Preview</h3>
                    <button class="close-preview" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 20px; background: #f8f9fa;">
                    <div style="background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                        <div style="background: linear-gradient(135deg, #e74c3c, #e67e22); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">MATHMATIX AI</h2>
                        </div>
                        <div style="padding: 20px;">
                            <h3 style="margin: 0 0 15px 0; color: #333;">${escapeHtml(subject)}</h3>
                            <div style="color: #555; line-height: 1.6;">${body}</div>
                        </div>
                        <div style="padding: 15px 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; text-align: center;">
                            This email was sent by MATHMATIX AI administration.
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(preview);

        preview.querySelector('.close-preview').addEventListener('click', () => preview.remove());
        preview.addEventListener('click', (e) => {
            if (e.target === preview) preview.remove();
        });
    }

    // Send bulk email
    async function sendBulkEmail() {
        if (!validateForm()) return;

        const audienceType = audienceTypeSelect.value;
        const enrollmentCodeId = audienceType === 'class' ? classSelect.value : null;

        sendBulkEmailBtn.disabled = true;
        sendBulkEmailBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        showStatus('Preparing to send emails...', 'info');

        try {
            const response = await csrfFetch('/api/admin/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audienceType,
                    enrollmentCodeId,
                    subject: emailSubject.value.trim(),
                    body: emailBody.value.trim(),
                    isHtml: true,
                    category: emailCategory?.value || 'announcement',
                    priority: emailPriority?.value || 'normal'
                })
            });

            const data = await response.json();

            if (data.success) {
                showStatus(`Email campaign started! Sending to recipients...`, 'success');

                // Reset form
                setTimeout(() => {
                    audienceTypeSelect.value = '';
                    classSelectContainer.style.display = 'none';
                    recipientPreview.style.display = 'none';
                    emailSubject.value = '';
                    emailBody.value = '';
                    emailTemplate.value = '';
                    closeModal(bulkEmailModal);
                    loadEmailStats();
                }, 2000);
            } else {
                showStatus(data.message || 'Failed to send email campaign', 'error');
            }
        } catch (error) {
            console.error('[BulkEmail] Send error:', error);
            showStatus('Error sending email campaign', 'error');
        } finally {
            sendBulkEmailBtn.disabled = false;
            sendBulkEmailBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Email';
        }
    }

    // Load campaign history
    async function loadCampaignHistory() {
        if (!emailCampaignsList) return;

        emailCampaignsList.innerHTML = '<p style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading campaigns...</p>';

        try {
            const response = await fetch('/api/admin/email/campaigns');
            if (!response.ok) throw new Error('Failed to load campaigns');

            const data = await response.json();
            const campaigns = data.campaigns || [];

            if (campaigns.length === 0) {
                emailCampaignsList.innerHTML = `
                    <div style="text-align: center; padding: 60px; color: #666;">
                        <i class="fas fa-envelope" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p>No email campaigns yet</p>
                    </div>
                `;
                return;
            }

            emailCampaignsList.innerHTML = campaigns.map(c => {
                const date = new Date(c.createdAt).toLocaleString();
                const statusColors = {
                    draft: '#999',
                    scheduled: '#3498db',
                    sending: '#f39c12',
                    sent: '#27ae60',
                    failed: '#e74c3c',
                    cancelled: '#999'
                };

                const audienceLabels = {
                    all_students: 'All Students',
                    all_parents: 'All Parents',
                    all_teachers: 'All Teachers',
                    class: 'Specific Class',
                    custom: 'Custom Selection'
                };

                return `
                    <div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid ${statusColors[c.status] || '#ddd'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div>
                                <strong style="font-size: 1.1em; color: #333;">${escapeHtml(c.subject)}</strong>
                                <span style="display: inline-block; margin-left: 10px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: ${statusColors[c.status]}20; color: ${statusColors[c.status]};">
                                    ${c.status}
                                </span>
                            </div>
                            <span style="font-size: 0.8em; color: #999;">${date}</span>
                        </div>
                        <div style="display: flex; gap: 20px; font-size: 0.9em; color: #666;">
                            <span><i class="fas fa-users"></i> ${audienceLabels[c.audienceType] || c.audienceType}</span>
                            <span><i class="fas fa-paper-plane"></i> ${c.stats?.sent || 0} sent</span>
                            <span><i class="fas fa-times-circle"></i> ${c.stats?.failed || 0} failed</span>
                            <span><i class="fas fa-user"></i> ${c.sender}</span>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('[BulkEmail] Load history error:', error);
            emailCampaignsList.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading campaign history</p>';
        }
    }

    // Load email stats
    async function loadEmailStats() {
        try {
            const response = await fetch('/api/admin/email/campaigns?limit=100');
            if (!response.ok) return;

            const data = await response.json();
            const campaigns = data.campaigns || [];

            // Count today's emails
            const today = new Date().toDateString();
            const todayEmails = campaigns.filter(c => {
                const campaignDate = new Date(c.createdAt).toDateString();
                return campaignDate === today && c.status === 'sent';
            }).reduce((sum, c) => sum + (c.stats?.sent || 0), 0);

            if (emailsSentToday) emailsSentToday.textContent = todayEmails;
            if (totalCampaigns) totalCampaigns.textContent = campaigns.length;

        } catch (error) {
            console.error('[BulkEmail] Stats error:', error);
        }
    }

    // Show status message
    function showStatus(message, type) {
        if (!emailSendStatus) return;

        emailSendStatus.style.display = 'block';
        emailSendStatus.style.padding = '12px';
        emailSendStatus.style.borderRadius = '6px';
        emailSendStatus.style.textAlign = 'center';

        if (type === 'success') {
            emailSendStatus.style.background = '#d4edda';
            emailSendStatus.style.color = '#155724';
            emailSendStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        } else if (type === 'error') {
            emailSendStatus.style.background = '#f8d7da';
            emailSendStatus.style.color = '#721c24';
            emailSendStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        } else {
            emailSendStatus.style.background = '#fff3cd';
            emailSendStatus.style.color = '#856404';
            emailSendStatus.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        }
    }

    // Helper functions
    function openModal(modal) {
        if (modal) modal.style.display = 'flex';
    }

    function closeModal(modal) {
        if (modal) modal.style.display = 'none';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
});
