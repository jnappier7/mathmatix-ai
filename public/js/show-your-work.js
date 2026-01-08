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

        // Camera state
        this.currentFile = null;
        this.currentImageData = null;
        this.gradingResult = null;
        this.cameraStream = null;
        this.currentFacingMode = 'environment'; // Start with rear camera (better for homework)
        this.isLiveCameraActive = false;

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
        this.takePhotoBtn?.addEventListener('click', () => this.openLiveCamera());
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
        this.stopCamera(); // Stop camera when closing modal
        this.resetToCapture();
    }

    resetToCapture() {
        // Show capture section, hide others
        this.captureSection.style.display = 'block';
        this.previewSection.style.display = 'none';
        this.loadingSection.style.display = 'none';
        this.resultsSection.style.display = 'none';

        // Stop camera if active
        this.stopCamera();

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

        // Remove live camera section if it exists
        const liveCameraSection = document.getElementById('syw-live-camera-section');
        if (liveCameraSection) {
            liveCameraSection.remove();
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
            // Show loading with animated progress messages
            this.previewSection.style.display = 'none';
            this.loadingSection.style.display = 'block';
            this.showProgressMessages();

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
            const response = await csrfFetch('/api/grade-work', {
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

    // Show animated progress messages during grading (teacher-like)
    showProgressMessages() {
        const loadingSection = this.loadingSection;
        if (!loadingSection) return;

        const messages = [
            { text: "Got it. I'm reading your work now. Give me a sec.", delay: 0 },
            { text: "Found your problems... checking your steps...", delay: 1500 },
            { text: "Verifying your answers...", delay: 3000 },
            { text: "Writing personalized feedback...", delay: 4500 }
        ];

        // Clear existing content and create message container
        loadingSection.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <div class="spinner" style="
                    width: 60px;
                    height: 60px;
                    border: 4px solid #f3f4f6;
                    border-top: 4px solid #8b5cf6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 30px auto;
                "></div>
                <div id="progress-message" style="
                    font-size: 1.1em;
                    color: #8b5cf6;
                    font-weight: 600;
                    min-height: 30px;
                    transition: opacity 0.3s ease;
                "></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

        const messageEl = document.getElementById('progress-message');

        // Show messages with fade transitions
        messages.forEach(({ text, delay }) => {
            setTimeout(() => {
                if (messageEl) {
                    messageEl.style.opacity = '0';
                    setTimeout(() => {
                        messageEl.textContent = text;
                        messageEl.style.opacity = '1';
                    }, 150);
                }
            }, delay);
        });
    }

    displayResults(result) {
        // Hide loading, show results with animation
        this.loadingSection.style.display = 'none';
        this.resultsSection.style.display = 'block';
        this.resultsSection.style.animation = 'fadeInUp 0.6s ease forwards';

        // Display score with beautiful styling
        const score = result.score || '--';
        const scorePercent = result.scorePercent || 0;

        // Animated score counter
        let currentScore = 0;
        const increment = scorePercent / 30; // 30 frames for smooth animation
        const scoreInterval = setInterval(() => {
            currentScore += increment;
            if (currentScore >= scorePercent) {
                currentScore = scorePercent;
                clearInterval(scoreInterval);
            }
            this.scoreDisplay.textContent = `${Math.round(currentScore)}%`;
        }, 20);

        // Set score text and color based on percentage
        let scoreMessage = 'Keep practicing!';
        let scoreColor = '#8b5cf6';
        let scoreEmoji = '💪';

        if (scorePercent >= 90) {
            scoreMessage = 'Outstanding work!';
            scoreColor = '#10b981';
            scoreEmoji = '🌟';
        } else if (scorePercent >= 80) {
            scoreMessage = 'Great job!';
            scoreColor = '#8b5cf6';
            scoreEmoji = '🎉';
        } else if (scorePercent >= 70) {
            scoreMessage = 'Good effort!';
            scoreColor = '#3b82f6';
            scoreEmoji = '👍';
        } else if (scorePercent >= 60) {
            scoreMessage = 'Keep going!';
            scoreColor = '#f59e0b';
            scoreEmoji = '💪';
        }

        this.scoreText.textContent = `${scoreEmoji} ${scoreMessage}`;
        this.scoreText.style.color = scoreColor;
        this.scoreDisplay.style.background = `linear-gradient(135deg, ${scoreColor}, ${scoreColor}dd)`;
        this.scoreDisplay.style.boxShadow = `0 8px 24px ${scoreColor}40`;

        // Create annotated image if annotations exist
        if (result.annotations && result.annotations.length > 0 && result.imageData) {
            this.createAnnotatedImage(result.imageData, result.annotations);
        }

        // Display feedback with formatting
        const feedback = result.feedback || 'No feedback available';
        this.feedbackContent.innerHTML = this.formatFeedback(feedback);

        // Add snippet card to chat history
        this.addWorkSnippetToChat(result, scorePercent, scoreEmoji, scoreMessage, scoreColor);
    }

    createAnnotatedImage(imageData, annotations) {
        // Create a container for before/after comparison
        const feedbackContainer = document.getElementById('syw-feedback-container');

        // Add annotated image section above feedback with fade-in animation
        const annotatedSection = document.createElement('div');
        annotatedSection.id = 'syw-annotated-section';
        annotatedSection.style.cssText = `
            margin-bottom: 20px;
            background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(139, 92, 246, 0.1);
            opacity: 0;
            transform: translateY(10px);
            animation: fadeInUp 0.6s ease forwards;
        `;

        annotatedSection.innerHTML = `
            <style>
                @keyframes fadeInUp {
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes drawIn {
                    from {
                        stroke-dashoffset: 1000;
                        opacity: 0;
                    }
                    to {
                        stroke-dashoffset: 0;
                        opacity: 1;
                    }
                }
            </style>
            <h4 style="margin-bottom: 15px; color: #8b5cf6; font-weight: 700;">
                <i class="fas fa-edit" style="margin-right: 8px;"></i>
                Your Graded Work
            </h4>
            <div style="position: relative; max-width: 100%;">
                <canvas id="syw-annotated-canvas" style="
                    max-width: 100%;
                    border-radius: 12px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                    border: 2px solid #e9d5ff;
                "></canvas>
            </div>
        `;

        // Insert before feedback
        feedbackContainer.parentNode.insertBefore(annotatedSection, feedbackContainer);

        // Draw annotations on canvas with staggered animation
        const canvas = document.getElementById('syw-annotated-canvas');
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.onload = () => {
            // Set canvas size to match image
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Animate annotations appearing one by one
            annotations.forEach((annotation, index) => {
                setTimeout(() => {
                    this.drawAnnotation(ctx, canvas.width, canvas.height, annotation);
                }, index * 200); // Stagger by 200ms each
            });
        };
        img.src = imageData;
    }

    drawAnnotation(ctx, canvasWidth, canvasHeight, annotation) {
        // Use precise percentage-based positioning from AI
        const x = canvasWidth * (annotation.x / 100);
        const y = canvasHeight * (annotation.y / 100);

        ctx.save();

        // Purple color for all marks (Mathmatix brand color)
        const gradingColor = '#8b5cf6'; // Bright purple for visibility
        const glowColor = 'rgba(139, 92, 246, 0.3)'; // Purple glow

        // Scale sizes based on canvas dimensions - MUCH LARGER for visibility
        // Changed from /30 to /12 to make annotations 2.5x bigger
        const baseSize = Math.max(60, Math.min(canvasWidth, canvasHeight) / 12);

        // Hand-drawn effect: Add slight random variance for natural look
        // Use annotation position as seed for consistent randomness
        const seed = (annotation.x + annotation.y) * 0.01;
        const wobble = baseSize * 0.05; // 5% variance
        const xOffset = Math.sin(seed * 13.7) * wobble;
        const yOffset = Math.cos(seed * 17.3) * wobble;

        if (annotation.type === 'check') {
            // Draw checkmark ✓ - Bold, beautiful, with glow

            // Glow effect (outer shadow)
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = baseSize / 3;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            ctx.strokeStyle = gradingColor;
            ctx.lineWidth = baseSize / 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Hand-drawn checkmark with slight curve
            ctx.beginPath();
            ctx.moveTo(x - baseSize * 0.4 + xOffset, y + yOffset);

            // Add slight curve using quadratic curve
            const midX = x - baseSize * 0.1 + xOffset * 0.5;
            const midY = y + baseSize * 0.4 + yOffset * 0.5;
            ctx.quadraticCurveTo(
                midX - wobble,
                midY + wobble,
                midX,
                midY
            );

            ctx.quadraticCurveTo(
                x + baseSize * 0.2 - xOffset,
                y - yOffset,
                x + baseSize * 0.5 - xOffset,
                y - baseSize * 0.5 - yOffset
            );
            ctx.stroke();

        } else if (annotation.type === 'miss') {
            // Draw X mark ✗ - Bold, dramatic, with glow

            // Glow effect
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = baseSize / 3;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            ctx.strokeStyle = gradingColor;
            ctx.lineWidth = baseSize / 4;
            ctx.lineCap = 'round';

            const size = baseSize * 0.5;

            // Draw first diagonal with slight curve
            ctx.beginPath();
            ctx.moveTo(x - size + xOffset, y - size + yOffset);
            ctx.quadraticCurveTo(
                x + xOffset * 0.5,
                y + yOffset * 0.5,
                x + size - xOffset,
                y + size - yOffset
            );
            ctx.stroke();

            // Draw second diagonal with slight curve
            ctx.beginPath();
            ctx.moveTo(x + size + xOffset, y - size - yOffset);
            ctx.quadraticCurveTo(
                x - xOffset * 0.5,
                y - yOffset * 0.5,
                x - size - xOffset,
                y + size + yOffset
            );
            ctx.stroke();

        } else if (annotation.type === 'circle') {
            // Draw hand-drawn circle around answer - Imperfect and beautiful

            // Glow effect
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = baseSize / 3;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;

            ctx.strokeStyle = gradingColor;
            ctx.lineWidth = baseSize / 6;
            ctx.lineCap = 'round';
            const radius = baseSize * 0.8;

            // Hand-drawn circle using multiple arcs for imperfect look
            ctx.beginPath();
            const segments = 8;
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const nextAngle = ((i + 1) / segments) * Math.PI * 2;

                // Add slight radius variation for hand-drawn effect
                const radiusVar = radius + Math.sin(angle * 3 + seed) * wobble;
                const nextRadiusVar = radius + Math.sin(nextAngle * 3 + seed) * wobble;

                const px = x + Math.cos(angle) * radiusVar;
                const py = y + Math.sin(angle) * radiusVar;
                const nx = x + Math.cos(nextAngle) * nextRadiusVar;
                const ny = y + Math.sin(nextAngle) * nextRadiusVar;

                if (i === 0) {
                    ctx.moveTo(px, py);
                }

                // Use quadratic curve for smoother transitions
                const midAngle = (angle + nextAngle) / 2;
                const midRadius = (radiusVar + nextRadiusVar) / 2;
                const cx = x + Math.cos(midAngle) * midRadius;
                const cy = y + Math.sin(midAngle) * midRadius;

                ctx.quadraticCurveTo(cx, cy, nx, ny);
            }
            ctx.stroke();

        } else if (annotation.type === 'partial' || annotation.type === 'note') {
            // Draw text annotation with exquisite styling
            const fontSize = baseSize * 1.2;

            // Use a more sophisticated font stack
            ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Measure text for background
            const text = annotation.mark || '';
            const metrics = ctx.measureText(text);
            const textWidth = metrics.width;
            const textHeight = fontSize * 1.2; // Account for ascenders/descenders
            const padding = fontSize * 0.4;

            // Add slight offset for hand-drawn effect
            const boxX = x + xOffset * 0.5;
            const boxY = y + yOffset * 0.5;

            // Shadow for depth
            ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
            ctx.shadowBlur = baseSize / 6;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;

            // Draw background with rounded corners
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            this.roundRect(
                ctx,
                boxX - textWidth / 2 - padding,
                boxY - textHeight / 2 - padding,
                textWidth + padding * 2,
                textHeight + padding * 2,
                fontSize * 0.25 // Rounded corners
            );
            ctx.fill();

            // Reset shadow for border
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Draw elegant border
            ctx.strokeStyle = gradingColor;
            ctx.lineWidth = 3;
            this.roundRect(
                ctx,
                boxX - textWidth / 2 - padding,
                boxY - textHeight / 2 - padding,
                textWidth + padding * 2,
                textHeight + padding * 2,
                fontSize * 0.25
            );
            ctx.stroke();

            // Add inner glow to text
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = fontSize / 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Draw the text
            ctx.fillStyle = gradingColor;
            ctx.fillText(text, boxX, boxY);
        }

        ctx.restore();
    }

    // Helper function to draw rounded rectangles
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // ============================================
    // LIVE CAMERA FUNCTIONALITY
    // ============================================

    async openLiveCamera() {
        try {
            // Create live camera UI
            const liveCameraSection = document.createElement('div');
            liveCameraSection.id = 'syw-live-camera-section';
            liveCameraSection.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.95);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                animation: fadeIn 0.3s ease;
            `;

            liveCameraSection.innerHTML = `
                <style>
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                    }
                    @keyframes flash {
                        0% { opacity: 0; }
                        50% { opacity: 1; }
                        100% { opacity: 0; }
                    }
                    @keyframes slideDown {
                        from {
                            opacity: 0;
                            transform: translateY(-20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                </style>

                <!-- Camera controls header -->
                <div style="
                    padding: 15px 20px;
                    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                ">
                    <h3 style="color: white; margin: 0; font-size: 1.1em;">
                        <i class="fas fa-camera" style="margin-right: 8px;"></i>
                        Camera Preview
                    </h3>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <!-- Grid toggle button -->
                        <button id="syw-toggle-grid-btn" style="
                            background: rgba(255,255,255,0.15);
                            color: white;
                            border: 1px solid rgba(255,255,255,0.3);
                            padding: 6px 12px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 0.9em;
                            font-weight: 600;
                            transition: all 0.2s;
                        " title="Toggle alignment grid">
                            <i class="fas fa-th"></i> Grid
                        </button>
                        <button id="syw-close-camera-btn" style="
                            background: rgba(255,255,255,0.2);
                            color: white;
                            border: none;
                            padding: 8px 16px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: 600;
                            transition: all 0.2s;
                        ">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                </div>

                <!-- Video preview container -->
                <div style="
                    flex: 1;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    position: relative;
                    overflow: hidden;
                ">
                    <video id="syw-camera-video" autoplay playsinline style="
                        max-width: 100%;
                        max-height: 100%;
                        border-radius: 12px;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    "></video>

                    <!-- Grid overlay -->
                    <div id="syw-camera-grid" style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 80%;
                        height: 80%;
                        max-width: 600px;
                        max-height: 800px;
                        pointer-events: none;
                        display: none;
                    ">
                        <!-- Rule of thirds grid -->
                        <svg width="100%" height="100%" style="opacity: 0.6;">
                            <!-- Vertical lines -->
                            <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <!-- Horizontal lines -->
                            <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <!-- Corner guides -->
                            <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#8b5cf6" stroke-width="2" rx="8"/>
                        </svg>
                    </div>

                    <!-- Helpful tips overlay (shows initially, then fades) -->
                    <div id="syw-camera-tips" style="
                        position: absolute;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(139, 92, 246, 0.95);
                        color: white;
                        padding: 12px 20px;
                        border-radius: 12px;
                        font-size: 0.9em;
                        text-align: center;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        animation: slideDown 0.5s ease;
                        max-width: 90%;
                        cursor: pointer;
                    " title="Click for privacy info">
                        <i class="fas fa-lightbulb" style="margin-right: 6px;"></i>
                        <strong>Tip:</strong> Position your homework flat and ensure good lighting
                    </div>

                    <!-- Privacy notice overlay -->
                    <div id="syw-privacy-notice" style="
                        position: absolute;
                        bottom: 80px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0, 0, 0, 0.85);
                        color: white;
                        padding: 15px 20px;
                        border-radius: 12px;
                        font-size: 0.85em;
                        text-align: center;
                        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
                        max-width: 90%;
                        border: 1px solid rgba(139, 92, 246, 0.5);
                    ">
                        <div style="margin-bottom: 8px;">
                            <i class="fas fa-shield-alt" style="color: #8b5cf6; margin-right: 6px;"></i>
                            <strong>Your Privacy Matters</strong>
                        </div>
                        <div style="font-size: 0.9em; line-height: 1.4; opacity: 0.9;">
                            Your photo is private and secure. Only you and your teacher can see it.
                            <br>
                            Photos are automatically deleted after 30 days.
                        </div>
                    </div>

                    <!-- Flash effect overlay -->
                    <div id="syw-camera-flash" style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: white;
                        opacity: 0;
                        pointer-events: none;
                    "></div>

                    <!-- Camera loading indicator -->
                    <div id="syw-camera-loading" style="
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        color: white;
                        font-size: 1.2em;
                        text-align: center;
                    ">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2em; margin-bottom: 10px;"></i>
                        <div>Starting camera...</div>
                    </div>
                </div>

                <!-- Camera controls footer -->
                <div style="
                    padding: 20px;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 20px;
                    flex-wrap: wrap;
                ">
                    <!-- Switch camera button -->
                    <button id="syw-switch-camera-btn" class="camera-control-btn" style="
                        background: rgba(255,255,255,0.1);
                        color: white;
                        border: 2px solid rgba(255,255,255,0.3);
                        padding: 12px 20px;
                        border-radius: 12px;
                        cursor: pointer;
                        font-weight: 600;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <i class="fas fa-sync-alt"></i>
                        <span>Switch Camera</span>
                    </button>

                    <!-- Capture button -->
                    <button id="syw-capture-photo-btn" style="
                        background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
                        color: white;
                        border: none;
                        padding: 18px 36px;
                        border-radius: 50px;
                        cursor: pointer;
                        font-weight: bold;
                        font-size: 1.1em;
                        box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    ">
                        <i class="fas fa-camera" style="font-size: 1.3em;"></i>
                        Capture Photo
                    </button>
                </div>
            `;

            document.body.appendChild(liveCameraSection);

            // Add event listeners
            document.getElementById('syw-close-camera-btn').addEventListener('click', () => {
                this.stopCamera();
                liveCameraSection.remove();
            });

            document.getElementById('syw-switch-camera-btn').addEventListener('click', () => {
                this.switchCamera();
            });

            document.getElementById('syw-capture-photo-btn').addEventListener('click', () => {
                this.capturePhoto();
            });

            document.getElementById('syw-toggle-grid-btn').addEventListener('click', () => {
                const grid = document.getElementById('syw-camera-grid');
                const btn = document.getElementById('syw-toggle-grid-btn');
                if (grid.style.display === 'none') {
                    grid.style.display = 'block';
                    btn.style.background = 'rgba(139, 92, 246, 0.6)';
                    btn.style.borderColor = '#8b5cf6';
                } else {
                    grid.style.display = 'none';
                    btn.style.background = 'rgba(255,255,255,0.15)';
                    btn.style.borderColor = 'rgba(255,255,255,0.3)';
                }
            });

            // Auto-hide tips after 4 seconds
            setTimeout(() => {
                const tips = document.getElementById('syw-camera-tips');
                if (tips) {
                    tips.style.transition = 'opacity 0.5s ease';
                    tips.style.opacity = '0';
                    setTimeout(() => tips.remove(), 500);
                }
            }, 4000);

            // Add hover effects
            const buttons = liveCameraSection.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.addEventListener('mouseenter', () => {
                    btn.style.transform = 'translateY(-2px)';
                    if (btn.id === 'syw-capture-photo-btn') {
                        btn.style.boxShadow = '0 8px 24px rgba(139, 92, 246, 0.6)';
                    }
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.transform = 'translateY(0)';
                    if (btn.id === 'syw-capture-photo-btn') {
                        btn.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.4)';
                    }
                });
            });

            // Start the camera
            await this.startCamera();

        } catch (error) {
            console.error('Failed to open camera:', error);
            alert('Unable to access camera. Please check permissions or use the upload option.');
        }
    }

    async startCamera() {
        try {
            // Stop existing stream if any
            this.stopCamera();

            const constraints = {
                video: {
                    facingMode: this.currentFacingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };

            console.log(`Starting camera with facingMode: ${this.currentFacingMode}`);

            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            const videoElement = document.getElementById('syw-camera-video');

            if (videoElement) {
                videoElement.srcObject = this.cameraStream;
                this.isLiveCameraActive = true;

                // Hide loading indicator
                const loadingIndicator = document.getElementById('syw-camera-loading');
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }

                console.log('✅ Camera started successfully');
            }

        } catch (error) {
            console.error('Camera error:', error);

            // Hide loading indicator
            const loadingIndicator = document.getElementById('syw-camera-loading');
            if (loadingIndicator) {
                loadingIndicator.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="font-size: 2em; margin-bottom: 10px; color: #f59e0b;"></i>
                    <div>Camera access denied or unavailable</div>
                    <div style="font-size: 0.9em; margin-top: 10px; opacity: 0.8;">Please check permissions or use the upload option</div>
                `;
            }

            throw error;
        }
    }

    async switchCamera() {
        // Toggle between front and rear cameras
        this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        console.log(`Switching to ${this.currentFacingMode} camera`);

        // Show loading indicator briefly
        const loadingIndicator = document.getElementById('syw-camera-loading');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
            loadingIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="font-size: 2em; margin-bottom: 10px;"></i>
                <div>Switching camera...</div>
            `;
        }

        try {
            await this.startCamera();
        } catch (error) {
            console.error('Failed to switch camera:', error);
            // Revert to previous facing mode
            this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        }
    }

    capturePhoto() {
        const videoElement = document.getElementById('syw-camera-video');
        const flashElement = document.getElementById('syw-camera-flash');

        if (!videoElement || !this.cameraStream) {
            console.error('No active camera stream');
            return;
        }

        // Trigger flash animation
        if (flashElement) {
            flashElement.style.animation = 'flash 0.5s ease';
            setTimeout(() => {
                flashElement.style.animation = '';
            }, 500);
        }

        // Vibrate device if supported (tactile feedback)
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }

        // Play shutter sound effect (optional - silent by default)
        // Uncomment to enable: this.playShutterSound();

        // Create a canvas to capture the current frame
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0);

        // Convert to blob and create file
        canvas.toBlob((blob) => {
            const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });

            // Store the captured image
            this.currentImageData = canvas.toDataURL('image/jpeg', 0.95);
            this.currentFile = file;

            // Brief delay for visual feedback, then close camera
            setTimeout(() => {
                // Close camera and show preview
                this.stopCamera();
                const liveCameraSection = document.getElementById('syw-live-camera-section');
                if (liveCameraSection) {
                    liveCameraSection.remove();
                }

                // Show preview
                this.previewImage.src = this.currentImageData;
                this.previewImage.style.display = 'block';

                // Hide PDF elements
                const pdfCanvas = document.getElementById('syw-preview-pdf-canvas');
                const pdfInfo = document.getElementById('syw-pdf-info');
                if (pdfCanvas) pdfCanvas.style.display = 'none';
                if (pdfInfo) pdfInfo.style.display = 'none';

                // Switch to preview section
                this.captureSection.style.display = 'none';
                this.previewSection.style.display = 'block';

                console.log('✅ Photo captured successfully');
            }, 300);

        }, 'image/jpeg', 0.95);
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
            this.isLiveCameraActive = false;
            console.log('Camera stopped');
        }
    }

    formatFeedback(feedback) {
        // Convert feedback to beautifully formatted HTML with structured problem cards
        let html = feedback;

        // Enhanced section headers with icons and styling
        html = html.replace(/\*\*SCORE:\s*([^\*]+)\*\*/g,
            '<div style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%); color: white; padding: 15px 20px; border-radius: 10px; margin: 15px 0; font-size: 1.2em; font-weight: bold; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);">📊 Score: $1</div>');

        // Highlight VERIFICATION section with problem breakdown
        html = html.replace(/\*\*VERIFICATION:\*\*/g,
            '<div style="margin-top: 25px; padding: 12px 16px; background: linear-gradient(to right, #dbeafe, transparent); border-left: 4px solid #3b82f6; border-radius: 4px; font-weight: 600; color: #1e40af;">🔍 Problem-by-Problem Breakdown</div>');

        // Highlight DETAILED ERROR ANALYSIS section
        html = html.replace(/\*\*DETAILED ERROR ANALYSIS:\*\*/g,
            '<div style="margin-top: 25px; padding: 12px 16px; background: linear-gradient(to right, #fee2e2, transparent); border-left: 4px solid #ef4444; border-radius: 4px; font-weight: 600; color: #991b1b;">🔧 How to Fix Your Mistakes</div>');

        html = html.replace(/\*\*PROBLEM IDENTIFIED:\*\*/g,
            '<div style="margin-top: 20px; padding: 12px 16px; background: linear-gradient(to right, #f0e7ff, transparent); border-left: 4px solid #8b5cf6; border-radius: 4px; font-weight: 600; color: #6b21a8;">🎯 Problem Identified</div>');

        html = html.replace(/\*\*STEP-BY-STEP ANALYSIS:\*\*/g,
            '<div style="margin-top: 20px; padding: 12px 16px; background: linear-gradient(to right, #f0e7ff, transparent); border-left: 4px solid #8b5cf6; border-radius: 4px; font-weight: 600; color: #6b21a8;">📝 Step-by-Step Analysis</div>');

        html = html.replace(/\*\*OVERALL FEEDBACK:\*\*/g,
            '<div style="margin-top: 20px; padding: 12px 16px; background: linear-gradient(to right, #f0e7ff, transparent); border-left: 4px solid #8b5cf6; border-radius: 4px; font-weight: 600; color: #6b21a8;">💬 Overall Feedback</div>');

        html = html.replace(/\*\*WHAT TO WORK ON:\*\*/g,
            '<div style="margin-top: 20px; padding: 12px 16px; background: linear-gradient(to right, #fef3c7, transparent); border-left: 4px solid #f59e0b; border-radius: 4px; font-weight: 600; color: #92400e;">🎓 What to Work On</div>');

        html = html.replace(/\*\*WHAT TO PRACTICE:\*\*/g,
            '<div style="margin-top: 20px; padding: 12px 16px; background: linear-gradient(to right, #dbeafe, transparent); border-left: 4px solid #3b82f6; border-radius: 4px; font-weight: 600; color: #1e40af;">🔁 Practice These Skills</div>');

        // Create visual cards for each problem with structured feedback
        html = html.replace(/Problem\s+(\d+):\s*\n-\s*Student's answer:\s*([^\n]+)\n-\s*Correct answer:\s*([^\n]+)\n-\s*(✅ CORRECT|❌ INCORRECT):\s*([^\n]+)/g,
            (match, num, studentAns, correctAns, status, explanation) => {
                const isCorrect = status.includes('CORRECT');
                const color = isCorrect ? '#10b981' : '#ef4444';
                const bgColor = isCorrect ? '#d1fae5' : '#fee2e2';
                const icon = isCorrect ? '✅' : '⚠️';

                return `
                <div style="background: ${bgColor}; border-left: 4px solid ${color}; border-radius: 8px; padding: 16px; margin: 15px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="font-weight: 700; color: ${color}; margin-bottom: 10px; font-size: 1.05em;">
                        ${icon} Problem ${num}
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #6b7280;">Your answer:</strong> ${studentAns}
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #6b7280;">Correct answer:</strong> ${correctAns}
                    </div>
                    <div style="padding: 10px; background: white; border-radius: 6px; margin-top: 10px;">
                        <strong style="color: ${color};">${isCorrect ? 'Why this works:' : 'What went wrong:'}</strong><br>
                        ${explanation}
                    </div>
                </div>`;
            });

        // Enhanced step markers with badges
        html = html.replace(/(Problem\/Step|Step)\s+(\d+):/g,
            '<div style="display: inline-block; background: #8b5cf6; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.9em; font-weight: bold; margin: 10px 5px 10px 0;">$1 $2</div>');

        // Beautiful checkmarks and X marks with backgrounds
        html = html.replace(/✓|✅/g,
            '<span style="display: inline-block; background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin: 0 4px;">✓</span>');
        html = html.replace(/✗|❌/g,
            '<span style="display: inline-block; background: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin: 0 4px;">✗</span>');

        // Style "Correct" and "Error" labels
        html = html.replace(/Correct/g,
            '<span style="color: #10b981; font-weight: 600;">Correct</span>');
        html = html.replace(/Error:/g,
            '<span style="color: #ef4444; font-weight: 600;">Error:</span>');

        // Enhanced bullet points with custom styling
        html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li style="margin: 8px 0; padding-left: 8px;">$1</li>');
        html = html.replace(/(<li[^>]*>.*<\/li>)/s, '<ul style="margin: 12px 0 12px 20px; list-style-type: none;"><style>ul li:before { content: "→"; color: #8b5cf6; font-weight: bold; margin-right: 8px; }</style>$1</ul>');

        // Add proper spacing
        html = html.replace(/\n\n/g, '<div style="height: 12px;"></div>');
        html = html.replace(/\n/g, '<br>');

        // Wrap in a nice container
        return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial; line-height: 1.7; color: #374151;">${html}</div>`;
    }

    addWorkSnippetToChat(result, scorePercent, scoreEmoji, scoreMessage, scoreColor) {
        // Find the chat messages container
        const chatContainer = document.getElementById('chat-messages');
        if (!chatContainer) return;

        // Create snippet card element
        const snippetCard = document.createElement('div');
        snippetCard.className = 'work-snippet-card';

        // Create thumbnail from submitted image
        const thumbnailSrc = this.currentImageData || '/images/default-work-thumbnail.png';

        // Truncate feedback for preview (first 150 chars)
        const feedbackPreview = (result.feedback || 'No feedback available')
            .replace(/<[^>]*>/g, '') // Strip HTML
            .substring(0, 150) + (result.feedback && result.feedback.length > 150 ? '...' : '');

        snippetCard.innerHTML = `
            <div class="work-snippet-header">
                <div class="work-snippet-icon">📝</div>
                <div class="work-snippet-title">
                    <strong>Work Submitted & Graded</strong>
                    <span class="work-snippet-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </div>
            <div class="work-snippet-body">
                <div class="work-snippet-thumbnail">
                    <img src="${thumbnailSrc}" alt="Submitted work" />
                </div>
                <div class="work-snippet-details">
                    <div class="work-snippet-score" style="background: linear-gradient(135deg, ${scoreColor}, ${scoreColor}dd); box-shadow: 0 2px 8px ${scoreColor}40;">
                        ${scoreEmoji} ${scorePercent}%
                    </div>
                    <div class="work-snippet-feedback">
                        ${feedbackPreview}
                    </div>
                </div>
            </div>
        `;

        // Add click handler to re-open modal with results
        snippetCard.style.cursor = 'pointer';
        snippetCard.addEventListener('click', () => {
            // Re-open the modal and show results
            this.modal?.classList.add('is-visible');
            this.captureSection.style.display = 'none';
            this.previewSection.style.display = 'none';
            this.loadingSection.style.display = 'none';
            this.resultsSection.style.display = 'block';
        });

        // Add to chat with animation
        snippetCard.style.opacity = '0';
        snippetCard.style.transform = 'translateY(20px)';
        chatContainer.appendChild(snippetCard);

        // Trigger animation
        setTimeout(() => {
            snippetCard.style.transition = 'all 0.4s ease';
            snippetCard.style.opacity = '1';
            snippetCard.style.transform = 'translateY(0)';
        }, 100);

        // Auto-scroll to show the new snippet
        chatContainer.scrollTop = chatContainer.scrollHeight;
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
