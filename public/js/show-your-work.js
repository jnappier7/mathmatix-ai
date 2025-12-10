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

        // Remove annotated section if it exists
        const annotatedSection = document.getElementById('syw-annotated-section');
        if (annotatedSection) {
            annotatedSection.remove();
        }
    }

    async handleFileSelect(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // Validate file type
        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';

        if (!isImage && !isPDF) {
            alert('Please select an image or PDF file');
            return;
        }

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            alert('File is too large. Please use a file under 10MB.');
            return;
        }

        this.currentFile = file;

        // Handle image preview
        if (isImage) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.currentImageData = e.target.result;
                this.previewImage.src = e.target.result;
                this.previewImage.style.display = 'block';

                // Hide PDF elements
                const pdfCanvas = document.getElementById('syw-preview-pdf-canvas');
                const pdfInfo = document.getElementById('syw-pdf-info');
                if (pdfCanvas) pdfCanvas.style.display = 'none';
                if (pdfInfo) pdfInfo.style.display = 'none';

                // Switch to preview section
                this.captureSection.style.display = 'none';
                this.previewSection.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
        // Handle PDF preview
        else if (isPDF) {
            await this.renderPDFPreview(file);
        }
    }

    async renderPDFPreview(file) {
        try {
            // Check if PDF.js is available
            if (typeof window.pdfjsLib === 'undefined') {
                alert('PDF viewer is not available. Please upload an image instead.');
                return;
            }

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Get first page
            const page = await pdf.getPage(1);

            const canvas = document.getElementById('syw-preview-pdf-canvas');
            const context = canvas.getContext('2d');

            // Set scale for good quality
            const viewport = page.getViewport({ scale: 2.0 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render PDF page to canvas
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Convert canvas to data URL for submission
            this.currentImageData = canvas.toDataURL('image/png');

            // Show PDF preview
            canvas.style.display = 'block';
            this.previewImage.style.display = 'none';

            // Show PDF info
            const pdfInfo = document.getElementById('syw-pdf-info');
            const pdfPagesInfo = document.getElementById('syw-pdf-pages-info');
            if (pdfInfo) pdfInfo.style.display = 'block';
            if (pdfPagesInfo) pdfPagesInfo.textContent = `Page 1 of ${pdf.numPages}`;

            // Switch to preview section
            this.captureSection.style.display = 'none';
            this.previewSection.style.display = 'block';

        } catch (error) {
            console.error('PDF rendering error:', error);
            alert('Failed to load PDF. Please try an image file instead.');
        }
    }

    async submitForGrading() {
        if (!this.currentImageData) {
            alert('Please select an image or PDF first');
            return;
        }

        try {
            // Show loading
            this.previewSection.style.display = 'none';
            this.loadingSection.style.display = 'block';

            // Prepare form data
            const formData = new FormData();

            // If PDF was uploaded, send the converted PNG instead
            if (this.currentFile.type === 'application/pdf') {
                // Convert data URL to blob
                const blob = await this.dataURLToBlob(this.currentImageData);
                formData.append('file', blob, 'work.png');
            } else {
                // Send original image file
                formData.append('file', this.currentFile);
            }

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

    // Helper to convert data URL to Blob
    async dataURLToBlob(dataURL) {
        const response = await fetch(dataURL);
        return await response.blob();
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

        // Create annotated image if annotations exist
        if (result.annotations && result.annotations.length > 0 && result.imageData) {
            this.createAnnotatedImage(result.imageData, result.annotations);
        }

        // Display feedback with formatting
        const feedback = result.feedback || 'No feedback available';
        this.feedbackContent.innerHTML = this.formatFeedback(feedback);
    }

    createAnnotatedImage(imageData, annotations) {
        // Create a container for before/after comparison
        const feedbackContainer = document.getElementById('syw-feedback-container');

        // Add annotated image section above feedback
        const annotatedSection = document.createElement('div');
        annotatedSection.id = 'syw-annotated-section';
        annotatedSection.style.cssText = 'margin-bottom: 20px; background: white; border-radius: 8px; padding: 15px;';

        annotatedSection.innerHTML = `
            <h4 style="margin-bottom: 15px;"><i class="fas fa-edit"></i> Annotated Work</h4>
            <div style="position: relative; max-width: 100%;">
                <canvas id="syw-annotated-canvas" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></canvas>
            </div>
        `;

        // Insert before feedback
        feedbackContainer.parentNode.insertBefore(annotatedSection, feedbackContainer);

        // Draw annotations on canvas
        const canvas = document.getElementById('syw-annotated-canvas');
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
            // Set canvas size to match image
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Draw annotations
            annotations.forEach(annotation => {
                this.drawAnnotation(ctx, canvas.width, canvas.height, annotation);
            });
        };
        img.src = imageData;
    }

    drawAnnotation(ctx, canvasWidth, canvasHeight, annotation) {
        // Map region to coordinates
        const regions = {
            'top': { x: 0.5, y: 0.15 },
            'top-left': { x: 0.15, y: 0.15 },
            'top-right': { x: 0.85, y: 0.15 },
            'middle': { x: 0.5, y: 0.5 },
            'middle-left': { x: 0.15, y: 0.5 },
            'middle-right': { x: 0.85, y: 0.5 },
            'bottom': { x: 0.5, y: 0.85 },
            'bottom-left': { x: 0.15, y: 0.85 },
            'bottom-right': { x: 0.85, y: 0.85 }
        };

        const position = regions[annotation.region] || { x: 0.5, y: 0.5 };
        const x = canvasWidth * position.x;
        const y = canvasHeight * position.y;

        // Style based on annotation type (all purple to match brand)
        const styles = {
            'check': { color: '#8b5cf6', icon: '✓', bgColor: '#ede9fe' },
            'error': { color: '#7c3aed', icon: '✗', bgColor: '#ede9fe' },
            'warning': { color: '#667eea', icon: '⚠', bgColor: '#e0e7ff' },
            'info': { color: '#764ba2', icon: 'ℹ', bgColor: '#f3e8ff' }
        };

        const style = styles[annotation.type] || styles.info;

        // Draw annotation bubble
        ctx.save();

        // Measure text
        ctx.font = 'bold 16px Arial';
        const textWidth = ctx.measureText(annotation.text).width;
        const bubbleWidth = textWidth + 40;
        const bubbleHeight = 35;

        // Draw bubble background
        ctx.fillStyle = style.bgColor;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 3;

        // Rounded rectangle
        const bubbleX = x - bubbleWidth / 2;
        const bubbleY = y - bubbleHeight / 2;
        const radius = 8;

        ctx.beginPath();
        ctx.moveTo(bubbleX + radius, bubbleY);
        ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
        ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + radius);
        ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
        ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - radius, bubbleY + bubbleHeight);
        ctx.lineTo(bubbleX + radius, bubbleY + bubbleHeight);
        ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - radius);
        ctx.lineTo(bubbleX, bubbleY + radius);
        ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw icon
        ctx.fillStyle = style.color;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.icon, bubbleX + 10, y);

        // Draw text
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#1f2937';
        ctx.fillText(annotation.text, bubbleX + 30, y);

        ctx.restore();
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
