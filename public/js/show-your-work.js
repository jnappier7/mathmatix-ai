// ============================================
// SHOW YOUR WORK - AI GRADING FEATURE
// ============================================

class ShowYourWorkManager {
    constructor() {
        // Modal elements
        this.modal = document.getElementById('show-your-work-modal');
        this.openBtn = document.getElementById('camera-button');
        this.closeBtn = document.getElementById('close-show-your-work-modal');

        // Sections
        this.captureSection = document.getElementById('syw-capture-section');
        this.previewSection = document.getElementById('syw-preview-section');
        this.loadingSection = document.getElementById('syw-loading-section');
        this.resultsSection = document.getElementById('syw-results-section');

        // Capture buttons
        this.takePhotoBtn = document.getElementById('syw-take-photo-btn');
        this.uploadPhotoBtn = document.getElementById('syw-upload-photo-btn');
        this.fileInput = document.getElementById('syw-file-input');
        this.cameraInput = document.getElementById('syw-camera-input');

        // Preview elements
        this.previewImage = document.getElementById('syw-preview-image');
        this.retakeBtn = document.getElementById('syw-retake-btn');
        this.submitBtn = document.getElementById('syw-submit-btn');

        // Results elements
        this.scoreDisplay = document.getElementById('syw-score-display');
        this.scoreText = document.getElementById('syw-score-text');
        this.feedbackContent = document.getElementById('syw-feedback-content');
        this.tryAgainBtn = document.getElementById('syw-try-again-btn');
        this.askTutorBtn = document.getElementById('syw-ask-tutor-btn');

        // State
        this.currentFile = null;
        this.currentImageData = null;
        this.gradingResult = null;

        this.init();
    }

    init() {
        if (!this.modal) {
            console.log('Show Your Work modal not found');
            return;
        }

        // Open modal
        this.openBtn?.addEventListener('click', () => this.openModal());

        // Close modal
        this.closeBtn?.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });

        // Capture handlers
        this.takePhotoBtn?.addEventListener('click', () => this.cameraInput.click());
        this.uploadPhotoBtn?.addEventListener('click', () => this.fileInput.click());

        this.cameraInput?.addEventListener('change', (e) => this.handleFileSelect(e));
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

        // Preview handlers
        this.retakeBtn?.addEventListener('click', () => this.resetToCapture());
        this.submitBtn?.addEventListener('click', () => this.submitForGrading());

        // Results handlers
        this.tryAgainBtn?.addEventListener('click', () => this.resetToCapture());
        this.askTutorBtn?.addEventListener('click', () => this.askTutorAboutWork());

        console.log('✅ Show Your Work Manager initialized');
    }

    openModal() {
        this.modal?.classList.add('is-visible');
        this.resetToCapture();
    }

    closeModal() {
        this.modal?.classList.remove('is-visible');
        this.resetToCapture();
    }

    resetToCapture() {
        // Show capture section, hide others
        this.captureSection.style.display = 'block';
        this.previewSection.style.display = 'none';
        this.loadingSection.style.display = 'none';
        this.resultsSection.style.display = 'none';

        // Reset state
        this.currentFile = null;
        this.currentImageData = null;
        this.gradingResult = null;
        this.previewImage.src = '';
        this.previewImage.style.display = 'none';

        // Reset file inputs
        this.fileInput.value = '';
        this.cameraInput.value = '';
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            alert('Image is too large. Please use an image under 10MB.');
            return;
        }

        this.currentFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentImageData = e.target.result;
            this.previewImage.src = e.target.result;
            this.previewImage.style.display = 'block';

            // Switch to preview section
            this.captureSection.style.display = 'none';
            this.previewSection.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    async submitForGrading() {
        if (!this.currentFile) {
            alert('Please select an image first');
            return;
        }

        try {
            // Show loading
            this.previewSection.style.display = 'none';
            this.loadingSection.style.display = 'block';

            // Prepare form data
            const formData = new FormData();
            formData.append('file', this.currentFile);

            // Submit to grading endpoint
            const response = await fetch('/api/grade-work', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to grade work');
            }

            const result = await response.json();
            this.gradingResult = result;

            // Display results
            this.displayResults(result);

        } catch (error) {
            console.error('Grading error:', error);
            alert(`Error: ${error.message}`);
            this.resetToCapture();
        }
    }

    displayResults(result) {
        // Hide loading, show results
        this.loadingSection.style.display = 'none';
        this.resultsSection.style.display = 'block';

        // Display score
        const score = result.score || '--';
        const scorePercent = result.scorePercent || 0;
        this.scoreDisplay.textContent = `${scorePercent}%`;

        // Set score text based on percentage
        let scoreMessage = 'Keep practicing!';
        if (scorePercent >= 90) {
            scoreMessage = '🌟 Outstanding work!';
        } else if (scorePercent >= 80) {
            scoreMessage = '🎉 Great job!';
        } else if (scorePercent >= 70) {
            scoreMessage = '👍 Good effort!';
        } else if (scorePercent >= 60) {
            scoreMessage = '💪 Keep going!';
        }
        this.scoreText.textContent = scoreMessage;

        // Display feedback with formatting
        const feedback = result.feedback || 'No feedback available';
        this.feedbackContent.innerHTML = this.formatFeedback(feedback);
    }

    formatFeedback(feedback) {
        // Convert feedback to HTML with nice formatting
        // Support markdown-like syntax: **bold**, *italic*, bullet points, etc.

        let html = feedback;

        // Convert step markers
        html = html.replace(/Step (\d+):/g, '<strong style="color: #667eea;">Step $1:</strong>');

        // Convert checkmarks and X marks
        html = html.replace(/✓|✅/g, '<span style="color: #10b981;">✅</span>');
        html = html.replace(/✗|❌/g, '<span style="color: #ef4444;">❌</span>');

        // Convert bullet points
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul style="margin-left: 20px;">$1</ul>');

        // Add line breaks for readability
        html = html.replace(/\n\n/g, '<br><br>');

        return html;
    }

    async askTutorAboutWork() {
        // Close the modal and send the grading result to the chat
        this.closeModal();

        // Construct a message to the tutor about the graded work
        const message = `I just got my work graded and received a ${this.gradingResult.scorePercent}%. Can you help me understand what I did wrong and how to improve?

Here's the feedback I received:
${this.gradingResult.feedback}`;

        // Find the user input textarea and send button
        const userInput = document.getElementById('user-input');
        const sendButton = document.getElementById('send-button');

        if (userInput && sendButton) {
            userInput.value = message;

            // Trigger auto-resize if available
            if (userInput.dispatchEvent) {
                userInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Optionally auto-send (or let user review first)
            // sendButton.click();
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.showYourWorkManager = new ShowYourWorkManager();
});
