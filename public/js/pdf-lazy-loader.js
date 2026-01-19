/**
 * PDF.js Lazy Loader
 *
 * Loads the 19MB PDF.js library only when needed for PDF file uploads.
 * This prevents the massive bundle from being loaded on every page load,
 * dramatically improving mobile performance.
 *
 * BEFORE: 19MB loaded on every page load
 * AFTER: 19MB loaded only when user uploads a PDF
 */

class PDFLazyLoader {
    constructor() {
        this.isLoading = false;
        this.isLoaded = false;
        this.loadPromise = null;
    }

    /**
     * Load PDF.js library on-demand
     * @returns {Promise<boolean>} Resolves when PDF.js is loaded
     */
    async load() {
        // Already loaded
        if (this.isLoaded) {
            return true;
        }

        // Currently loading - return existing promise
        if (this.isLoading) {
            return this.loadPromise;
        }

        // Start loading
        this.isLoading = true;
        this.loadPromise = this._loadPDFJS();

        try {
            await this.loadPromise;
            this.isLoaded = true;
            this.isLoading = false;
            console.log('✅ PDF.js loaded successfully (lazy)');
            return true;
        } catch (error) {
            console.error('❌ Failed to load PDF.js:', error);
            this.isLoading = false;
            this.loadPromise = null;
            throw error;
        }
    }

    /**
     * Internal method to load PDF.js scripts dynamically
     * @private
     */
    async _loadPDFJS() {
        return new Promise((resolve, reject) => {
            // Check if already in DOM
            if (typeof pdfjsLib !== 'undefined') {
                resolve();
                return;
            }

            // Create script element for PDF.js
            const script = document.createElement('script');
            script.src = '/pdfjs-viewer/build/pdf.mjs';
            script.type = 'module';

            script.onload = () => {
                // Wait a bit for the module to initialize
                setTimeout(() => {
                    if (typeof pdfjsLib !== 'undefined') {
                        // Set worker source
                        if (pdfjsLib.GlobalWorkerOptions) {
                            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs-viewer/build/pdf.worker.mjs';
                        }
                        resolve();
                    } else {
                        reject(new Error('PDF.js loaded but pdfjsLib is undefined'));
                    }
                }, 100);
            };

            script.onerror = () => {
                reject(new Error('Failed to load PDF.js script'));
            };

            // Append to head
            document.head.appendChild(script);
        });
    }

    /**
     * Check if PDF.js is currently loaded
     * @returns {boolean}
     */
    isReady() {
        return this.isLoaded && typeof pdfjsLib !== 'undefined';
    }

    /**
     * Get pdfjsLib object (only available after load())
     * @returns {object|null}
     */
    getPDFJS() {
        return this.isReady() ? pdfjsLib : null;
    }
}

// Create global instance
window.pdfLazyLoader = new PDFLazyLoader();

/**
 * Usage Example:
 *
 * // In file-upload.js, before using pdfjsLib:
 * async loadPDF(file) {
 *     // Show loading indicator
 *     const loading = document.getElementById('pdf-loading');
 *     loading.textContent = 'Loading PDF viewer...';
 *
 *     try {
 *         // Lazy load PDF.js if not already loaded
 *         await window.pdfLazyLoader.load();
 *
 *         // Now pdfjsLib is available
 *         const arrayBuffer = await file.arrayBuffer();
 *         const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
 *         // ... rest of PDF loading code
 *     } catch (error) {
 *         console.error('Failed to load PDF:', error);
 *         alert('Failed to load PDF viewer');
 *     }
 * }
 */
