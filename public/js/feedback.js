// public/js/feedback.js
// Feedback modal and form handling

(function() {
    const feedbackModal = document.getElementById('feedback-modal');
    const openFeedbackBtn = document.getElementById('open-feedback-modal-btn');
    const closeFeedbackBtn = document.getElementById('close-feedback-modal-btn');
    const cancelFeedbackBtn = document.getElementById('cancel-feedback-btn');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackMessage = document.getElementById('feedback-message');
    const feedbackDescription = document.getElementById('feedback-description');
    const charCount = document.getElementById('char-count');

    function openModal() {
        feedbackModal.classList.add('is-visible');
        feedbackForm.reset();
        feedbackMessage.style.display = 'none';
    }

    function closeModal() {
        feedbackModal.classList.remove('is-visible');
    }

    function showMessage(message, isError = false) {
        feedbackMessage.textContent = message;
        feedbackMessage.style.display = 'block';
        feedbackMessage.style.background = isError ? '#fee2e2' : '#d1fae5';
        feedbackMessage.style.color = isError ? '#991b1b' : '#065f46';
        feedbackMessage.style.border = `1px solid ${isError ? '#fca5a5' : '#86efac'}`;
    }

    async function submitFeedback(e) {
        e.preventDefault();

        const type = document.getElementById('feedback-type').value;
        const subject = document.getElementById('feedback-subject').value.trim();
        const description = document.getElementById('feedback-description').value.trim();
        const priority = document.getElementById('feedback-priority').value;

        // Validation
        if (!type || !subject || !description) {
            showMessage('Please fill in all required fields.', true);
            return;
        }

        const submitBtn = document.getElementById('submit-feedback-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        try {
            const response = await window.csrfFetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    subject,
                    description,
                    priority,
                    url: window.location.href
                }),
                credentials: 'include'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showMessage('✓ Thank you! Your feedback has been submitted successfully.', false);
                feedbackForm.reset();

                // Close modal after 2 seconds
                setTimeout(() => {
                    closeModal();
                }, 2000);
            } else {
                showMessage(data.message || 'Failed to submit feedback. Please try again.', true);
            }
        } catch (error) {
            console.error('Feedback submission error:', error);
            showMessage('Network error. Please check your connection and try again.', true);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Feedback';
        }
    }

    function updateCharCount() {
        const count = feedbackDescription.value.length;
        charCount.textContent = count;

        if (count > 1900) {
            charCount.style.color = '#ff0000';
        } else if (count > 1700) {
            charCount.style.color = '#ff9900';
        } else {
            charCount.style.color = '#999';
        }
    }

    // Event listeners
    if (openFeedbackBtn) {
        openFeedbackBtn.addEventListener('click', openModal);
    }

    if (closeFeedbackBtn) {
        closeFeedbackBtn.addEventListener('click', closeModal);
    }

    if (cancelFeedbackBtn) {
        cancelFeedbackBtn.addEventListener('click', closeModal);
    }

    if (feedbackForm) {
        feedbackForm.addEventListener('submit', submitFeedback);
    }

    if (feedbackDescription) {
        feedbackDescription.addEventListener('input', updateCharCount);
    }

    // Close modal when clicking outside
    if (feedbackModal) {
        feedbackModal.addEventListener('click', (e) => {
            if (e.target === feedbackModal) {
                closeModal();
            }
        });
    }

    console.log('✅ Feedback module loaded');
})();
