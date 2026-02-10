// ============================================
// SHOW YOUR WORK — AI WORK ANALYSIS (v2)
// Feedback-first: no grades, just analysis
// ============================================

class ShowYourWorkManager {
    constructor() {
        // Modal shell
        this.modal = document.getElementById('show-your-work-modal');
        this.openBtn = document.getElementById('camera-button');
        this.closeBtn = document.getElementById('close-show-your-work-modal');

        // Sections (capture → preview → loading → results)
        this.captureSection = document.getElementById('syw-capture-section');
        this.previewSection = document.getElementById('syw-preview-section');
        this.loadingSection = document.getElementById('syw-loading-section');
        this.resultsSection = document.getElementById('syw-results-section');

        // Capture controls
        this.takePhotoBtn = document.getElementById('syw-take-photo-btn');
        this.uploadPhotoBtn = document.getElementById('syw-upload-photo-btn');
        this.fileInput = document.getElementById('syw-file-input');
        this.cameraInput = document.getElementById('syw-camera-input');

        // Preview elements
        this.previewImage = document.getElementById('syw-preview-image');
        this.retakeBtn = document.getElementById('syw-retake-btn');
        this.submitBtn = document.getElementById('syw-submit-btn');

        // Results container (dynamically filled)
        this.resultsContainer = document.getElementById('syw-results-container');
        this.tryAgainBtn = document.getElementById('syw-try-again-btn');
        this.askTutorBtn = document.getElementById('syw-ask-tutor-btn');
        this.viewHistoryBtn = document.getElementById('syw-view-history-btn');

        // State
        this.currentFile = null;
        this.currentImageData = null;
        this.analysisResult = null;
        this.lastResultId = null; // Tracks the last grading result for re-attempt flow
        this.cameraStream = null;
        this.currentFacingMode = 'environment';

        this.init();
    }

    // ----------------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------------

    init() {
        if (!this.modal) return;

        this.openBtn?.addEventListener('click', () => this.openModal());
        this.closeBtn?.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });

        this.takePhotoBtn?.addEventListener('click', () => this.openLiveCamera());
        this.uploadPhotoBtn?.addEventListener('click', () => this.fileInput?.click());
        this.cameraInput?.addEventListener('change', (e) => this.handleFileSelect(e));
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

        this.retakeBtn?.addEventListener('click', () => this.resetToCapture());
        this.submitBtn?.addEventListener('click', () => this.submitForAnalysis());

        this.tryAgainBtn?.addEventListener('click', () => this.resetToCapture());
        this.askTutorBtn?.addEventListener('click', () => this.askTutorAboutWork());
        this.viewHistoryBtn?.addEventListener('click', () => this.showHistory());
    }

    // ----------------------------------------------------------------
    // MODAL LIFECYCLE
    // ----------------------------------------------------------------

    openModal() {
        this.modal?.classList.add('is-visible');
        this.resetToCapture();
    }

    closeModal() {
        this.modal?.classList.remove('is-visible');
        this.stopCamera();
        this.resetToCapture();
    }

    showSection(section) {
        [this.captureSection, this.previewSection, this.loadingSection, this.resultsSection]
            .forEach(s => { if (s) s.style.display = 'none'; });
        if (section) section.style.display = 'block';
    }

    resetToCapture() {
        this.showSection(this.captureSection);
        this.stopCamera();
        this.currentFile = null;
        this.currentImageData = null;
        this.analysisResult = null;
        this.lastResultId = null; // Clear re-attempt chain on full reset
        if (this.previewImage) {
            this.previewImage.src = '';
            this.previewImage.style.display = 'none';
        }
        if (this.fileInput) this.fileInput.value = '';
        if (this.cameraInput) this.cameraInput.value = '';

        document.getElementById('syw-live-camera-section')?.remove();
    }

    // ----------------------------------------------------------------
    // FILE HANDLING
    // ----------------------------------------------------------------

    async handleFileSelect(e) {
        const file = e.target?.files?.[0];
        if (!file) return;

        const isImage = file.type.startsWith('image/');
        const isPDF = file.type === 'application/pdf';

        if (!isImage && !isPDF) {
            alert('Please select an image or PDF file');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert('File is too large. Maximum size is 10 MB.');
            return;
        }

        this.currentFile = file;

        if (isImage) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                this.currentImageData = ev.target.result;
                this.previewImage.src = ev.target.result;
                this.previewImage.style.display = 'block';
                this.hidePdfPreview();
                this.showSection(this.previewSection);
            };
            reader.readAsDataURL(file);
        } else if (isPDF) {
            await this.renderPDFPreview(file);
        }
    }

    hidePdfPreview() {
        const pdfCanvas = document.getElementById('syw-preview-pdf-canvas');
        const pdfInfo = document.getElementById('syw-pdf-info');
        if (pdfCanvas) pdfCanvas.style.display = 'none';
        if (pdfInfo) pdfInfo.style.display = 'none';
    }

    async renderPDFPreview(file) {
        if (typeof window.pdfjsLib === 'undefined') {
            alert('PDF viewer is not available. Please upload an image instead.');
            return;
        }
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);

            const canvas = document.getElementById('syw-preview-pdf-canvas');
            const ctx = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: 2.0 });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;

            this.currentImageData = canvas.toDataURL('image/png');
            canvas.style.display = 'block';
            this.previewImage.style.display = 'none';

            const pdfInfo = document.getElementById('syw-pdf-info');
            const pdfPagesInfo = document.getElementById('syw-pdf-pages-info');
            if (pdfInfo) pdfInfo.style.display = 'block';
            if (pdfPagesInfo) pdfPagesInfo.textContent = `Page 1 of ${pdf.numPages}`;

            this.showSection(this.previewSection);
        } catch (err) {
            console.error('PDF rendering error:', err);
            alert('Failed to load PDF. Please try an image file instead.');
        }
    }

    // ----------------------------------------------------------------
    // SUBMISSION
    // ----------------------------------------------------------------

    async submitForAnalysis() {
        if (!this.currentImageData) {
            alert('Please select an image or PDF first');
            return;
        }

        try {
            this.showSection(this.loadingSection);
            this.showProgressMessages();

            const formData = new FormData();
            if (this.currentFile.type === 'application/pdf') {
                const blob = await (await fetch(this.currentImageData)).blob();
                formData.append('file', blob, 'work.png');
            } else {
                formData.append('file', this.currentFile);
            }

            // Re-attempt: link to previous result so server can track improvement
            if (this.lastResultId) {
                formData.append('previousAttemptId', this.lastResultId);
            }

            const response = await csrfFetch('/api/grade-work', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Failed to analyze work');
            }

            const result = await response.json();
            this.analysisResult = result;
            this.lastResultId = result.id || null; // Track for next re-attempt
            this.displayResults(result);

        } catch (error) {
            console.error('Analysis error:', error);
            alert(`Error: ${error.message}`);
            this.resetToCapture();
        }
    }

    // ----------------------------------------------------------------
    // PROGRESS INDICATOR
    // ----------------------------------------------------------------

    showProgressMessages() {
        if (!this.loadingSection) return;

        const messages = [
            { text: "Reading your work...", delay: 0 },
            { text: "Solving each problem to check your answers...", delay: 2000 },
            { text: "Analyzing your approach step by step...", delay: 4500 },
            { text: "Writing personalized feedback...", delay: 7000 }
        ];

        this.loadingSection.innerHTML = `
            <div class="syw-loading-inner">
                <div class="syw-spinner"></div>
                <div id="syw-progress-msg" class="syw-progress-msg"></div>
            </div>
        `;

        const msgEl = document.getElementById('syw-progress-msg');
        messages.forEach(({ text, delay }) => {
            setTimeout(() => {
                if (msgEl) {
                    msgEl.style.opacity = '0';
                    setTimeout(() => {
                        msgEl.textContent = text;
                        msgEl.style.opacity = '1';
                    }, 150);
                }
            }, delay);
        });
    }

    // ----------------------------------------------------------------
    // RESULTS DISPLAY — feedback-first, no scores
    // ----------------------------------------------------------------

    displayResults(result) {
        this.showSection(this.resultsSection);
        if (!this.resultsContainer) return;

        // ANTI-CHEAT: If no student work was detected, show a friendly message instead of grading
        if (result.noWorkDetected) {
            this.resultsContainer.innerHTML = `
                <div class="syw-summary-header">
                    <div class="syw-no-work-message" style="text-align: center; padding: 20px;">
                        <i class="fas fa-pencil-alt" style="font-size: 2em; color: #8b5cf6; margin-bottom: 10px;"></i>
                        <h3>No work detected</h3>
                        <p>${this.escapeHtml(result.overallFeedback || "It looks like the problems haven't been attempted yet. Give them a try first, then snap another photo!")}</p>
                    </div>
                </div>
            `;
            return;
        }

        const total = result.problemCount || 0;
        const correct = result.correctCount || 0;
        const allCorrect = total > 0 && correct === total;
        const imp = result.improvement;
        const attempt = result.attemptNumber || 1;

        this.resultsContainer.innerHTML = `
            <!-- Improvement banner (shown on re-attempts) -->
            ${imp ? `<div class="syw-improvement-banner ${imp.improved ? 'syw-improved' : 'syw-no-change'}" style="padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; text-align: center; font-weight: 600; ${imp.improved ? 'background: linear-gradient(135deg, #d4edda, #c3e6cb); color: #155724;' : 'background: #fff3cd; color: #856404;'}">
                ${imp.improved
                    ? `Attempt #${attempt}: ${imp.previousCorrect}/${imp.previousTotal} → ${correct}/${total} — Nice improvement!`
                    : `Attempt #${attempt}: Keep at it! Review the feedback and try again.`}
            </div>` : ''}

            <!-- Summary header -->
            <div class="syw-summary-header ${allCorrect ? 'syw-all-correct' : ''}">
                <div class="syw-summary-counts">
                    <span class="syw-count-correct">${correct}</span>
                    <span class="syw-count-sep">of</span>
                    <span class="syw-count-total">${total}</span>
                    <span class="syw-count-label">correct</span>
                </div>
                ${result.whatWentWell ? `<div class="syw-went-well">${this.escapeHtml(result.whatWentWell)}</div>` : ''}
                <div class="syw-xp-badge">+${result.xpEarned || 0} XP</div>
            </div>

            <!-- Per-problem feedback cards -->
            <div class="syw-problems-list">
                <h4 class="syw-section-title"><i class="fas fa-list-ol"></i> Problem-by-Problem Feedback</h4>
                ${(result.problems || []).map(p => this.renderProblemCard(p)).join('')}
            </div>

            <!-- Overall feedback (not escaped — may contain LaTeX) -->
            <div class="syw-overall-feedback">
                <h4 class="syw-section-title"><i class="fas fa-comment-alt"></i> Overall</h4>
                <p>${result.overallFeedback || ''}</p>
            </div>

            <!-- Practice recommendations -->
            ${result.practiceRecommendations?.length ? `
            <div class="syw-practice-recs">
                <h4 class="syw-section-title"><i class="fas fa-dumbbell"></i> What to Practice</h4>
                <ul>
                    ${result.practiceRecommendations.map(r => `<li>${this.escapeHtml(r)}</li>`).join('')}
                </ul>
            </div>` : ''}

            ${!allCorrect ? `<div class="syw-resubmit-cta" style="text-align: center; padding: 16px; margin-top: 8px;">
                <p style="color: #6b7280; margin-bottom: 10px;">Fix your mistakes, then snap another photo!</p>
                <button id="syw-fix-resubmit-btn" class="syw-btn syw-btn-primary" style="font-size: 1em; padding: 10px 24px;">
                    <i class="fas fa-redo"></i> Fix & Resubmit
                </button>
            </div>` : ''}
        `;

        // Bind re-submit button (keeps lastResultId so server tracks improvement)
        document.getElementById('syw-fix-resubmit-btn')?.addEventListener('click', () => {
            // lastResultId is already set — resetToCapture preserves it
            this.showSection(this.captureSection);
        });

        // Render any LaTeX in the feedback
        this.typesetMath(this.resultsContainer);

        // Add snippet to chat
        this.addWorkSnippetToChat(result);
    }

    renderProblemCard(problem) {
        const correct = problem.isCorrect;

        // Error details are shown collapsed — feedback is the primary content
        const hasErrors = problem.errors && problem.errors.length > 0;
        const errorsHtml = hasErrors ? (problem.errors || []).map(e => `
            <div class="syw-error-item">
                <span class="syw-error-badge">${this.escapeHtml(e.category || 'error')}</span>
                ${e.step ? `<strong>${this.escapeHtml(e.step)}:</strong> ` : ''}
                ${this.escapeHtml(e.description || '')}
            </div>
        `).join('') : '';

        return `
        <div class="syw-problem-card ${correct ? 'syw-problem-correct' : 'syw-problem-incorrect'}">
            <div class="syw-problem-header">
                <span class="syw-problem-num">Problem ${problem.problemNumber}</span>
                <span class="syw-problem-status ${correct ? 'syw-status-correct' : 'syw-status-incorrect'}">
                    ${correct ? 'Got it' : 'Take another look'}
                </span>
            </div>
            ${problem.problemStatement ? `<div class="syw-problem-statement">${this.escapeHtml(problem.problemStatement)}</div>` : ''}

            <!-- Tutor feedback is the main content (not escaped — may contain LaTeX) -->
            ${problem.feedback ? `<div class="syw-problem-feedback">${problem.feedback}</div>` : ''}

            ${problem.strengths ? `<div class="syw-strengths">${problem.strengths}</div>` : ''}

            <!-- Answers shown below feedback -->
            <div class="syw-problem-answers">
                <div class="syw-answer-row">
                    <span class="syw-answer-label">Your answer:</span>
                    <span class="syw-answer-value">${this.escapeHtml(problem.studentAnswer || '—')}</span>
                </div>
                ${!correct ? `<div class="syw-answer-row">
                    <span class="syw-answer-label">Hint:</span>
                    <span class="syw-answer-value">Check the feedback above and try again!</span>
                </div>` : ''}
            </div>

            ${errorsHtml ? `<details class="syw-error-details"><summary>Error details</summary>${errorsHtml}</details>` : ''}
        </div>`;
    }

    // ----------------------------------------------------------------
    // LIVE CAMERA
    // ----------------------------------------------------------------

    async openLiveCamera() {
        try {
            const section = document.createElement('div');
            section.id = 'syw-live-camera-section';
            section.className = 'syw-live-camera-overlay';
            section.innerHTML = `
                <div class="syw-camera-header">
                    <h3><i class="fas fa-camera"></i> Camera Preview</h3>
                    <div class="syw-camera-header-actions">
                        <button id="syw-toggle-grid-btn" class="syw-cam-btn syw-cam-btn-ghost">
                            <i class="fas fa-th"></i> Grid
                        </button>
                        <button id="syw-close-camera-btn" class="syw-cam-btn syw-cam-btn-ghost">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                </div>
                <div class="syw-camera-viewfinder">
                    <video id="syw-camera-video" autoplay playsinline></video>
                    <div id="syw-camera-grid" class="syw-camera-grid" style="display:none">
                        <svg width="100%" height="100%" style="opacity:0.5">
                            <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="white" stroke-width="1" stroke-dasharray="5,5"/>
                            <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#8b5cf6" stroke-width="2" rx="8"/>
                        </svg>
                    </div>
                    <div id="syw-camera-flash" class="syw-camera-flash"></div>
                    <div id="syw-camera-loading" class="syw-camera-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <div>Starting camera...</div>
                    </div>
                </div>
                <div class="syw-camera-footer">
                    <button id="syw-switch-camera-btn" class="syw-cam-btn syw-cam-btn-ghost">
                        <i class="fas fa-sync-alt"></i> Switch
                    </button>
                    <button id="syw-capture-photo-btn" class="syw-cam-btn syw-cam-btn-primary">
                        <i class="fas fa-camera"></i> Capture
                    </button>
                </div>
            `;
            document.body.appendChild(section);

            document.getElementById('syw-close-camera-btn').addEventListener('click', () => {
                this.stopCamera();
                section.remove();
            });
            document.getElementById('syw-switch-camera-btn').addEventListener('click', () => this.switchCamera());
            document.getElementById('syw-capture-photo-btn').addEventListener('click', () => this.capturePhoto());
            document.getElementById('syw-toggle-grid-btn').addEventListener('click', () => {
                const grid = document.getElementById('syw-camera-grid');
                grid.style.display = grid.style.display === 'none' ? 'block' : 'none';
            });

            await this.startCamera();
        } catch (err) {
            console.error('Failed to open camera:', err);
            alert('Unable to access camera. Please check permissions or use the upload option.');
        }
    }

    async startCamera() {
        this.stopCamera();
        const constraints = {
            video: { facingMode: this.currentFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        };
        this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = document.getElementById('syw-camera-video');
        if (video) {
            video.srcObject = this.cameraStream;
            const loading = document.getElementById('syw-camera-loading');
            if (loading) loading.style.display = 'none';
        }
    }

    async switchCamera() {
        this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        try {
            await this.startCamera();
        } catch (_) {
            this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        }
    }

    capturePhoto() {
        const video = document.getElementById('syw-camera-video');
        const flash = document.getElementById('syw-camera-flash');
        if (!video || !this.cameraStream) return;

        if (flash) {
            flash.classList.add('syw-flash-active');
            setTimeout(() => flash.classList.remove('syw-flash-active'), 400);
        }
        if ('vibrate' in navigator) navigator.vibrate(50);

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            this.currentFile = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
            this.currentImageData = canvas.toDataURL('image/jpeg', 0.92);

            setTimeout(() => {
                this.stopCamera();
                document.getElementById('syw-live-camera-section')?.remove();

                this.previewImage.src = this.currentImageData;
                this.previewImage.style.display = 'block';
                this.hidePdfPreview();
                this.showSection(this.previewSection);
            }, 250);
        }, 'image/jpeg', 0.92);
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(t => t.stop());
            this.cameraStream = null;
        }
    }

    // ----------------------------------------------------------------
    // ANALYSIS HISTORY
    // ----------------------------------------------------------------

    async showHistory() {
        try {
            const res = await csrfFetch('/api/grade-work/history', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load history');
            const data = await res.json();

            if (!data.results || data.results.length === 0) {
                alert('No analysis history yet.');
                return;
            }

            this.showSection(this.resultsSection);
            if (!this.resultsContainer) return;

            this.resultsContainer.innerHTML = `
                <h4 class="syw-section-title"><i class="fas fa-history"></i> Past Analyses</h4>
                <div class="syw-history-list">
                    ${data.results.map(r => {
                        const date = new Date(r.createdAt).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric'
                        });
                        return `
                        <div class="syw-history-item" data-id="${r.id}">
                            <div class="syw-history-counts">
                                <span class="syw-count-correct">${r.correctCount}</span>/<span class="syw-count-total">${r.problemCount}</span>
                            </div>
                            <div class="syw-history-info">
                                <div>${r.correctCount} of ${r.problemCount} correct</div>
                                <div class="syw-history-date">${date}</div>
                                ${r.teacherComment ? `<div class="syw-history-teacher-comment">${this.escapeHtml(r.teacherComment)}</div>` : ''}
                            </div>
                            <div class="syw-history-xp">+${r.xpEarned} XP</div>
                        </div>`;
                    }).join('')}
                </div>
                <button class="syw-btn syw-btn-secondary" id="syw-back-from-history">Back</button>
            `;

            document.getElementById('syw-back-from-history')?.addEventListener('click', () => this.resetToCapture());

            this.resultsContainer.querySelectorAll('.syw-history-item').forEach(item => {
                item.addEventListener('click', () => this.loadHistoryDetail(item.dataset.id));
            });
        } catch (err) {
            console.error('History error:', err);
            alert('Could not load analysis history.');
        }
    }

    async loadHistoryDetail(id) {
        try {
            const res = await csrfFetch(`/api/grade-work/${id}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load result');
            const data = await res.json();

            this.analysisResult = data.result;
            this.currentImageData = null;
            this.displayResults(data.result);
        } catch (err) {
            console.error('Detail error:', err);
            alert('Could not load analysis details.');
        }
    }

    // ----------------------------------------------------------------
    // CHAT INTEGRATION
    // ----------------------------------------------------------------

    addWorkSnippetToChat(result) {
        const chatContainer = document.getElementById('chat-messages');
        if (!chatContainer) return;

        const card = document.createElement('div');
        card.className = 'work-snippet-card';

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const feedbackPreview = (result.overallFeedback || '').substring(0, 120);

        card.innerHTML = `
            <div class="work-snippet-header">
                <div class="work-snippet-icon">📝</div>
                <div class="work-snippet-title">
                    <strong>Work Analyzed</strong>
                    <span class="work-snippet-time">${time}</span>
                </div>
            </div>
            <div class="work-snippet-body">
                <div class="work-snippet-details">
                    <div class="work-snippet-counts">${result.correctCount}/${result.problemCount} correct</div>
                    <div class="work-snippet-feedback">${this.escapeHtml(feedbackPreview)}</div>
                    <div class="work-snippet-xp">+${result.xpEarned || 0} XP</div>
                </div>
            </div>
        `;

        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            this.modal?.classList.add('is-visible');
            this.displayResults(this.analysisResult);
        });

        chatContainer.appendChild(card);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    askTutorAboutWork() {
        this.closeModal();
        if (!this.analysisResult) return;

        const r = this.analysisResult;

        // Build a clean, natural message instead of dumping raw data.
        // The tutor already has gradingContext in its system prompt, so
        // it knows the details — the student just needs to reference the work.
        const incorrectProblems = (r.problems || [])
            .filter(p => !p.isCorrect)
            .map(p => `#${p.problemNumber}`)
            .join(', ');

        let msg;
        if (incorrectProblems) {
            msg = `I just checked my work and got ${r.correctCount} out of ${r.problemCount} right. Can you help me with the ones I got wrong? (${incorrectProblems})`;
        } else {
            msg = `I just checked my work and got them all right! What should I work on next?`;
        }

        const userInput = document.getElementById('user-input');
        if (userInput) {
            userInput.value = msg;
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
            userInput.focus();
        }
    }

    // ----------------------------------------------------------------
    // UTILITIES
    // ----------------------------------------------------------------

    /**
     * Trigger MathJax to render LaTeX in the given element.
     * The AI may include \(...\) or \[...\] delimited math in its feedback.
     */
    typesetMath(el) {
        if (window.MathJax && window.MathJax.typesetPromise && el) {
            window.MathJax.typesetPromise([el]).catch(err => console.log('MathJax error:', err));
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.showYourWorkManager = new ShowYourWorkManager();
});
