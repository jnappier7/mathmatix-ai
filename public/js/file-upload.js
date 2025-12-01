// ============================================
// ELEGANT FILE UPLOAD SYSTEM
// ChatGPT/Claude-style experience
// ============================================

class FileUploadManager {
    constructor() {
        this.dragDropOverlay = document.getElementById('drag-drop-overlay');
        this.filePreviewModal = document.getElementById('file-preview-modal');
        this.attachButton = document.getElementById('attach-button');
        this.fileInput = document.getElementById('file-input');

        this.currentFile = null;
        this.currentPdfDoc = null;
        this.currentPdfPage = 1;

        this.init();
    }

    init() {
        this.setupDragAndDrop();
        this.setupFileInput();
        this.setupModalControls();
        console.log('✅ File Upload Manager initialized');
    }

    // ============================================
    // DRAG & DROP
    // ============================================

    setupDragAndDrop() {
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Show overlay on drag enter
        chatContainer.addEventListener('dragenter', (e) => {
            if (e.dataTransfer.types.includes('Files')) {
                this.showDragOverlay();
            }
        });

        // Hide overlay on drag leave (from overlay itself)
        this.dragDropOverlay.addEventListener('dragleave', (e) => {
            if (e.target === this.dragDropOverlay) {
                this.hideDragOverlay();
            }
        });

        // Handle drop
        this.dragDropOverlay.addEventListener('drop', (e) => {
            this.preventDefaults(e);
            this.hideDragOverlay();

            const files = [...e.dataTransfer.files];
            if (files.length > 0) {
                this.handleFile(files[0]); // Handle first file
            }
        });
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    showDragOverlay() {
        this.dragDropOverlay.classList.remove('hidden');
    }

    hideDragOverlay() {
        this.dragDropOverlay.classList.add('hidden');
    }

    // ============================================
    // FILE INPUT
    // ============================================

    setupFileInput() {
        if (this.attachButton && this.fileInput) {
            this.attachButton.addEventListener('click', () => {
                this.fileInput.click();
            });

            this.fileInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    this.handleFile(files[0]);
                }
                // Reset input
                this.fileInput.value = '';
            });
        }
    }

    // ============================================
    // FILE HANDLING
    // ============================================

    async handleFile(file) {
        this.currentFile = file;

        // Show preview modal
        this.filePreviewModal.style.display = 'flex';

        // Update file info
        document.getElementById('preview-filename').textContent = file.name;
        document.getElementById('preview-filesize').textContent = this.formatFileSize(file.size);

        // Show preview based on file type
        if (file.type.startsWith('image/')) {
            await this.previewImage(file);
        } else if (file.type === 'application/pdf') {
            await this.previewPDF(file);
        }

        // Start OCR processing
        this.processOCR(file);
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ============================================
    // IMAGE PREVIEW
    // ============================================

    async previewImage(file) {
        const img = document.getElementById('preview-image');
        const canvas = document.getElementById('preview-pdf-canvas');
        const pdfNav = document.getElementById('pdf-nav-controls');

        // Hide PDF elements, show image
        canvas.style.display = 'none';
        pdfNav.style.display = 'none';
        img.style.display = 'block';

        // Load image
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ============================================
    // PDF PREVIEW
    // ============================================

    async previewPDF(file) {
        const img = document.getElementById('preview-image');
        const canvas = document.getElementById('preview-pdf-canvas');
        const pdfNav = document.getElementById('pdf-nav-controls');

        // Hide image, show PDF elements
        img.style.display = 'none';
        canvas.style.display = 'block';
        pdfNav.style.display = 'flex';

        try {
            // Load PDF using pdfjs
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            this.currentPdfDoc = await loadingTask.promise;

            const totalPages = this.currentPdfDoc.numPages;
            document.getElementById('pdf-total-pages').textContent = totalPages;

            this.currentPdfPage = 1;
            await this.renderPDFPage(1);

        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Failed to load PDF. Please try again.');
        }
    }

    async renderPDFPage(pageNum) {
        if (!this.currentPdfDoc) return;

        const page = await this.currentPdfDoc.getPage(pageNum);
        const canvas = document.getElementById('preview-pdf-canvas');
        const context = canvas.getContext('2d');

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        document.getElementById('pdf-current-page').textContent = pageNum;
        this.currentPdfPage = pageNum;
    }

    // ============================================
    // OCR PROCESSING
    // ============================================

    async processOCR(file) {
        const ocrLoading = document.getElementById('ocr-loading');
        const ocrResults = document.getElementById('ocr-results');
        const extractedTextArea = document.getElementById('ocr-extracted-text');

        // Show loading
        ocrLoading.style.display = 'flex';
        ocrResults.style.display = 'none';

        try {
            // Create form data
            const formData = new FormData();
            formData.append('file', file);

            // Call OCR endpoint
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('OCR processing failed');
            }

            const data = await response.json();

            // Hide loading, show results
            ocrLoading.style.display = 'none';
            ocrResults.style.display = 'block';

            // Display extracted text
            const extractedText = data.extractedText || data.text || 'No text detected';
            extractedTextArea.value = extractedText;

            // Show confidence if available
            if (data.confidence) {
                const confidenceBadge = document.getElementById('ocr-confidence');
                confidenceBadge.textContent = `${Math.round(data.confidence * 100)}% confidence`;
            }

        } catch (error) {
            console.error('OCR error:', error);
            ocrLoading.style.display = 'none';
            ocrResults.style.display = 'block';
            extractedTextArea.value = 'OCR processing failed. You can still send the image for AI analysis.';
        }
    }

    // ============================================
    // MODAL CONTROLS
    // ============================================

    setupModalControls() {
        // Close button
        document.getElementById('close-file-preview')?.addEventListener('click', () => {
            this.closePreviewModal();
        });

        // Cancel button
        document.getElementById('cancel-upload')?.addEventListener('click', () => {
            this.closePreviewModal();
        });

        // Send button
        document.getElementById('send-with-file')?.addEventListener('click', () => {
            this.sendFileToAI();
        });

        // PDF navigation
        document.getElementById('pdf-prev-page')?.addEventListener('click', () => {
            if (this.currentPdfPage > 1) {
                this.renderPDFPage(this.currentPdfPage - 1);
            }
        });

        document.getElementById('pdf-next-page')?.addEventListener('click', () => {
            if (this.currentPdfDoc && this.currentPdfPage < this.currentPdfDoc.numPages) {
                this.renderPDFPage(this.currentPdfPage + 1);
            }
        });
    }

    closePreviewModal() {
        this.filePreviewModal.style.display = 'none';
        this.currentFile = null;
        this.currentPdfDoc = null;
        this.currentPdfPage = 1;

        // Reset displays
        document.getElementById('preview-image').style.display = 'none';
        document.getElementById('preview-pdf-canvas').style.display = 'none';
        document.getElementById('pdf-nav-controls').style.display = 'none';
        document.getElementById('ocr-loading').style.display = 'none';
        document.getElementById('ocr-results').style.display = 'none';
    }

    sendFileToAI() {
        if (!this.currentFile) return;

        // Get extracted text if available
        const extractedText = document.getElementById('ocr-extracted-text').value;

        // Set global attachedFile (from main script.js)
        if (window.attachedFile !== undefined) {
            window.attachedFile = this.currentFile;
        }

        // Show file pill
        if (typeof showFilePill === 'function') {
            showFilePill(this.currentFile.name);
        }

        // Set message input with extracted text or placeholder
        const userInput = document.getElementById('user-input');
        if (userInput && !userInput.value.trim()) {
            if (extractedText && extractedText !== 'OCR processing failed. You can still send the image for AI analysis.') {
                userInput.value = `Can you help me solve this?\n\n${extractedText}`;
            } else {
                userInput.value = 'Can you help me with this problem?';
            }
        }

        // Close modal
        this.closePreviewModal();

        // Focus input
        userInput.focus();
        userInput.select();

        console.log('✅ File attached and ready to send!');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.fileUploadManager = new FileUploadManager();
    });
} else {
    window.fileUploadManager = new FileUploadManager();
}
