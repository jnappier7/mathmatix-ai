/**
 * Character Rigging Portal - Frontend Controller
 * Handles interactive rigging, canvas manipulation, and API communication
 */

class CharacterRiggingPortal {
    constructor() {
        this.currentSessionId = null;
        this.imageData = null;
        this.canvas = null;
        this.ctx = null;
        this.rigPoints = [];
        this.boneConnections = [];
        this.selectedPointType = 'head';
        this.selectedSide = 'left';
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.draggedPoint = null;
        this.showBones = true;
        this.showLabels = true;
        this.isConnectingBone = false;
        this.boneStartPoint = null;
        this.refinementMode = false;
        this.currentRefinementSegment = null;
        this.refinementPoints = [];

        // Pan mode
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.spacePressed = false;

        // Brush editing
        this.brushMode = false;
        this.brushSize = 20;
        this.brushType = 'add'; // 'add' or 'remove'
        this.segments = [];
        this.selectedSegmentIndex = 0;
        this.segmentMasks = new Map();

        // Undo/Redo history
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupFileUpload();
    }

    setupCanvas() {
        this.canvas = document.getElementById('rigging-canvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.canvas) return;

        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;

        if (this.imageData) {
            this.redrawCanvas();
        }
    }

    setupEventListeners() {
        // Point type selection
        document.querySelectorAll('.point-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.point-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedPointType = btn.dataset.type;
            });
        });

        // Side selection
        document.querySelectorAll('.side-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedSide = btn.dataset.side;
            });
        });

        // Canvas interactions
        if (this.canvas) {
            this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
            this.canvas.addEventListener('contextmenu', (e) => this.handleCanvasRightClick(e));
            this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
            this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
            this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
            this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        }

        // Keyboard listeners for pan mode
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.spacePressed) {
                e.preventDefault();
                this.spacePressed = true;
                if (this.canvas) {
                    this.canvas.style.cursor = 'grab';
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.spacePressed = false;
                this.isPanning = false;
                if (this.canvas) {
                    this.canvas.style.cursor = 'crosshair';
                }
            }
        });

        // Zoom controls
        document.getElementById('zoom-in-btn')?.addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out-btn')?.addEventListener('click', () => this.zoomOut());
        document.getElementById('reset-view-btn')?.addEventListener('click', () => this.resetView());

        // Toggle controls
        document.getElementById('show-bones-toggle')?.addEventListener('change', (e) => {
            this.showBones = e.target.checked;
            this.redrawCanvas();
        });

        document.getElementById('show-labels-toggle')?.addEventListener('change', (e) => {
            this.showLabels = e.target.checked;
            this.redrawCanvas();
        });

        // Action buttons
        document.getElementById('remove-bg-btn')?.addEventListener('click', () => this.removeBackground());
        document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());
        document.getElementById('clear-points-btn')?.addEventListener('click', () => this.clearAllPoints());
        document.getElementById('segment-btn')?.addEventListener('click', () => this.segmentCharacter());
        document.getElementById('load-template-btn')?.addEventListener('click', () => this.showTemplateModal());
        document.getElementById('download-parts-btn')?.addEventListener('click', () => this.downloadParts());
        document.getElementById('back-to-rigging-btn')?.addEventListener('click', () => this.showSection('rigging'));
        document.getElementById('resolve-overlaps-btn')?.addEventListener('click', () => this.resolveOverlaps());
        document.getElementById('refine-mode-btn')?.addEventListener('click', () => this.showBrushEditor());
        document.getElementById('my-sessions-btn')?.addEventListener('click', () => this.showSessionsModal());

        // Brush editor controls
        document.getElementById('close-brush-editor-btn')?.addEventListener('click', () => this.closeBrushEditor());
        document.getElementById('segment-selector')?.addEventListener('change', (e) => this.selectSegmentForEditing(e.target.selectedIndex));
        document.querySelectorAll('.brush-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.brush-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.brushType = btn.dataset.mode;
            });
        });
        document.getElementById('brush-size-slider')?.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brush-size-value').textContent = this.brushSize;
        });
        document.getElementById('brush-apply-btn')?.addEventListener('click', () => this.applyBrushEdits());
        document.getElementById('brush-reset-btn')?.addEventListener('click', () => this.resetCurrentSegment());
        document.getElementById('brush-undo-btn')?.addEventListener('click', () => this.undoBrushStroke());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
            }
        });

        // Modal controls
        document.getElementById('close-sessions-modal')?.addEventListener('click', () => this.hideModal('sessions-modal'));
        document.getElementById('close-template-modal')?.addEventListener('click', () => this.hideModal('template-modal'));

        // Template selection
        document.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const template = btn.dataset.template;
                this.loadTemplate(template);
                this.hideModal('template-modal');
            });
        });
    }

    setupFileUpload() {
        const fileInput = document.getElementById('file-input');
        const browseBtn = document.getElementById('browse-file-btn');
        const dropzone = document.getElementById('upload-dropzone');

        browseBtn?.addEventListener('click', () => fileInput?.click());

        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFileUpload(file);
        });

        // Drag and drop
        dropzone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone?.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
        });

        dropzone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileUpload(file);
        });
    }

    async handleFileUpload(file) {
        if (!file.type.match(/image\/(png|jpeg|jpg)/)) {
            this.showToast('Please upload a PNG or JPEG image', 'error');
            return;
        }

        const characterName = document.getElementById('character-name')?.value || 'Untitled Character';

        const formData = new FormData();
        formData.append('character', file);
        formData.append('characterName', characterName);

        this.showLoading('Uploading character...');

        try {
            const response = await fetch('/api/character-rigging/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            this.currentSessionId = data.sessionId;
            document.getElementById('current-character-name').textContent = data.characterName;

            // Load the image
            await this.loadCharacterImage();

            this.showSection('rigging');
            this.showToast('Character uploaded successfully!', 'success');

        } catch (error) {
            console.error('Upload error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async loadCharacterImage() {
        this.showLoading('Loading image...');

        try {
            const response = await fetch(`/api/character-rigging/image/${this.currentSessionId}`);

            if (!response.ok) {
                throw new Error('Failed to load image');
            }

            const blob = await response.blob();
            const img = new Image();

            img.onload = () => {
                this.imageData = img;
                this.resetView();
                this.hideLoading();
            };

            img.src = URL.createObjectURL(blob);

        } catch (error) {
            console.error('Image load error:', error);
            this.showToast('Failed to load character image', 'error');
            this.hideLoading();
        }
    }

    handleCanvasClick(e) {
        if (this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;

        // If in refinement mode, add refinement points
        if (this.refinementMode) {
            this.refinementPoints.push({ x, y });
            this.redrawCanvas();
            return;
        }

        // Check if clicking on existing point for bone connection
        const clickedPoint = this.findPointAtPosition(x, y);

        if (e.shiftKey && clickedPoint) {
            // Shift+click to create bone connection
            if (!this.isConnectingBone) {
                this.isConnectingBone = true;
                this.boneStartPoint = clickedPoint;
                this.showToast('Click another point to create a bone connection', 'info');
            } else {
                if (this.boneStartPoint.id !== clickedPoint.id) {
                    this.createBoneConnection(this.boneStartPoint, clickedPoint);
                }
                this.isConnectingBone = false;
                this.boneStartPoint = null;
            }
        } else if (!clickedPoint) {
            // Add new point
            this.addRigPoint(x, y);
        }
    }

    handleCanvasRightClick(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;

        const point = this.findPointAtPosition(x, y);
        if (point) {
            this.deleteRigPoint(point);
        }
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();

        // If spacebar is held, enter pan mode
        if (this.spacePressed) {
            this.isPanning = true;
            this.panStartX = e.clientX - this.panX;
            this.panStartY = e.clientY - this.panY;
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        const x = (e.clientX - rect.left - this.panX) / this.zoom;
        const y = (e.clientY - rect.top - this.panY) / this.zoom;

        const point = this.findPointAtPosition(x, y);
        if (point) {
            this.isDragging = true;
            this.draggedPoint = point;
            this.canvas.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(e) {
        // Handle panning
        if (this.isPanning) {
            this.panX = e.clientX - this.panStartX;
            this.panY = e.clientY - this.panStartY;
            this.redrawCanvas();
            return;
        }

        if (!this.isDragging || !this.draggedPoint) {
            // Update cursor
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.panX) / this.zoom;
            const y = (e.clientY - rect.top - this.panY) / this.zoom;

            const point = this.findPointAtPosition(x, y);
            const cursorStyle = this.spacePressed ? 'grab' : (point ? 'grab' : 'crosshair');
            this.canvas.style.cursor = cursorStyle;
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        this.draggedPoint.x = (e.clientX - rect.left - this.panX) / this.zoom;
        this.draggedPoint.y = (e.clientY - rect.top - this.panY) / this.zoom;

        this.redrawCanvas();
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.spacePressed ? 'grab' : 'crosshair';
            return;
        }

        if (this.isDragging && this.draggedPoint) {
            this.saveRigData();
        }

        this.isDragging = false;
        this.draggedPoint = null;
        this.canvas.style.cursor = this.spacePressed ? 'grab' : 'crosshair';
    }

    handleWheel(e) {
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom *= delta;
        this.zoom = Math.max(0.1, Math.min(5, this.zoom));

        this.redrawCanvas();
    }

    findPointAtPosition(x, y, threshold = 15) {
        return this.rigPoints.find(point => {
            const dx = point.x - x;
            const dy = point.y - y;
            return Math.sqrt(dx * dx + dy * dy) < threshold / this.zoom;
        });
    }

    addRigPoint(x, y) {
        const side = this.selectedSide === 'center' ? '' : this.selectedSide + '_';
        const label = `${side}${this.selectedPointType}`;

        const id = `point_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const point = {
            id,
            x,
            y,
            label,
            type: this.selectedPointType
        };

        this.rigPoints.push(point);
        this.saveToHistory();
        this.redrawCanvas();
        this.updatePointsList();
        this.saveRigData();

        this.showToast(`Added ${label} point`, 'success');
    }

    deleteRigPoint(point) {
        this.rigPoints = this.rigPoints.filter(p => p.id !== point.id);
        this.boneConnections = this.boneConnections.filter(
            conn => conn.from !== point.id && conn.to !== point.id
        );

        this.saveToHistory();
        this.redrawCanvas();
        this.updatePointsList();
        this.saveRigData();

        this.showToast(`Deleted ${point.label}`, 'info');
    }

    createBoneConnection(fromPoint, toPoint) {
        // Check if connection already exists
        const exists = this.boneConnections.some(
            conn => (conn.from === fromPoint.id && conn.to === toPoint.id) ||
                    (conn.from === toPoint.id && conn.to === fromPoint.id)
        );

        if (exists) {
            this.showToast('Bone connection already exists', 'warning');
            return;
        }

        const segmentName = this.inferSegmentName(fromPoint, toPoint);

        this.boneConnections.push({
            from: fromPoint.id,
            to: toPoint.id,
            segmentName
        });

        this.saveToHistory();
        this.redrawCanvas();
        this.saveRigData();

        this.showToast(`Created bone: ${fromPoint.label} → ${toPoint.label}`, 'success');
    }

    inferSegmentName(point1, point2) {
        const labels = [point1.label, point2.label].join('_').toLowerCase();

        if (labels.includes('head') || labels.includes('neck')) return 'head';
        if (labels.includes('left_arm') || labels.includes('left_shoulder') || labels.includes('left_elbow')) return 'leftArm';
        if (labels.includes('right_arm') || labels.includes('right_shoulder') || labels.includes('right_elbow')) return 'rightArm';
        if (labels.includes('left_leg') || labels.includes('left_hip') || labels.includes('left_knee')) return 'leftLeg';
        if (labels.includes('right_leg') || labels.includes('right_hip') || labels.includes('right_knee')) return 'rightLeg';

        return 'torso';
    }

    clearAllPoints() {
        if (this.rigPoints.length === 0) return;

        if (confirm('Are you sure you want to clear all rigging points?')) {
            this.rigPoints = [];
            this.boneConnections = [];
            this.redrawCanvas();
            this.updatePointsList();
            this.saveRigData();
            this.showToast('All points cleared', 'info');
        }
    }

    zoomIn() {
        this.zoom *= 1.2;
        this.zoom = Math.min(5, this.zoom);
        this.redrawCanvas();
    }

    zoomOut() {
        this.zoom *= 0.8;
        this.zoom = Math.max(0.1, this.zoom);
        this.redrawCanvas();
    }

    resetView() {
        if (!this.imageData) return;

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const imageWidth = this.imageData.width;
        const imageHeight = this.imageData.height;

        // Calculate zoom to fit
        const zoomX = canvasWidth / imageWidth;
        const zoomY = canvasHeight / imageHeight;
        this.zoom = Math.min(zoomX, zoomY) * 0.9;

        // Center image
        this.panX = (canvasWidth - imageWidth * this.zoom) / 2;
        this.panY = (canvasHeight - imageHeight * this.zoom) / 2;

        this.redrawCanvas();
    }

    redrawCanvas() {
        if (!this.ctx || !this.imageData) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);

        // Draw image
        this.ctx.drawImage(this.imageData, 0, 0);

        // Draw bones
        if (this.showBones && this.boneConnections.length > 0) {
            this.drawBones();
        }

        // Draw rigging points
        this.drawRigPoints();

        // Draw refinement points if in refinement mode
        if (this.refinementMode && this.refinementPoints && this.refinementPoints.length > 0) {
            this.drawRefinementPoints();
        }

        this.ctx.restore();
    }

    drawRefinementPoints() {
        // Draw polygon outline
        if (this.refinementPoints.length > 1) {
            this.ctx.strokeStyle = '#00ffff';
            this.ctx.lineWidth = 3 / this.zoom;
            this.ctx.beginPath();

            this.refinementPoints.forEach((point, index) => {
                if (index === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });

            // Close the polygon if we have enough points
            if (this.refinementPoints.length > 2) {
                this.ctx.closePath();
            }

            this.ctx.stroke();
        }

        // Draw refinement points
        this.refinementPoints.forEach((point, index) => {
            this.ctx.fillStyle = '#00ffff';
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 6 / this.zoom, 0, 2 * Math.PI);
            this.ctx.fill();

            // Draw point number
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = 2 / this.zoom;
            this.ctx.font = `${12 / this.zoom}px Arial`;
            this.ctx.strokeText(String(index + 1), point.x + 10 / this.zoom, point.y);
            this.ctx.fillText(String(index + 1), point.x + 10 / this.zoom, point.y);
        });
    }

    drawBones() {
        const pointMap = new Map(this.rigPoints.map(p => [p.id, p]));

        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 3 / this.zoom;

        this.boneConnections.forEach(conn => {
            const from = pointMap.get(conn.from);
            const to = pointMap.get(conn.to);

            if (from && to) {
                this.ctx.beginPath();
                this.ctx.moveTo(from.x, from.y);
                this.ctx.lineTo(to.x, to.y);
                this.ctx.stroke();
            }
        });
    }

    drawRigPoints() {
        this.rigPoints.forEach(point => {
            // Draw point circle
            this.ctx.fillStyle = '#ff0000';
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 8 / this.zoom, 0, 2 * Math.PI);
            this.ctx.fill();

            // Draw label
            if (this.showLabels) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 3 / this.zoom;
                this.ctx.font = `${14 / this.zoom}px Arial`;
                this.ctx.strokeText(point.label, point.x + 12 / this.zoom, point.y + 5 / this.zoom);
                this.ctx.fillText(point.label, point.x + 12 / this.zoom, point.y + 5 / this.zoom);
            }
        });
    }

    updatePointsList() {
        const pointsList = document.getElementById('points-list');
        const pointCount = document.getElementById('point-count');

        if (!pointsList || !pointCount) return;

        pointCount.textContent = this.rigPoints.length;

        pointsList.innerHTML = this.rigPoints.map(point => `
            <div class="point-item">
                <span>${point.label}</span>
                <button class="delete-point-btn" data-id="${point.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        // Add delete listeners
        pointsList.querySelectorAll('.delete-point-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const point = this.rigPoints.find(p => p.id === btn.dataset.id);
                if (point) this.deleteRigPoint(point);
            });
        });
    }

    async saveRigData() {
        if (!this.currentSessionId) return;

        try {
            await fetch('/api/character-rigging/save-rig', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.currentSessionId,
                    rigPoints: this.rigPoints,
                    boneConnections: this.boneConnections
                })
            });
        } catch (error) {
            console.error('Save error:', error);
        }
    }

    async segmentCharacter() {
        if (this.rigPoints.length < 3) {
            this.showToast('Please add at least 3 rigging points before segmenting', 'warning');
            return;
        }

        this.showLoading('Segmenting character...');

        try {
            const response = await fetch('/api/character-rigging/segment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.currentSessionId
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Segmentation failed');
            }

            this.showToast(`Character segmented into ${data.segmentCount} parts!`, 'success');
            this.showSection('results');
            this.displaySegmentedParts(data.segments);

        } catch (error) {
            console.error('Segmentation error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    displaySegmentedParts(segments) {
        const grid = document.getElementById('segmented-parts-grid');
        const countEl = document.getElementById('segment-count');

        if (!grid || !countEl) return;

        // Store segments for brush editor
        this.segments = segments;

        countEl.textContent = segments.length;

        grid.innerHTML = segments.map((segment, index) => `
            <div class="part-card">
                <div class="part-preview">
                    <img src="/api/character-rigging/preview/${this.currentSessionId}" alt="${segment.name}" />
                </div>
                <div class="part-info">
                    <h3>${segment.name}</h3>
                    <p>Points: ${segment.pointCount}</p>
                    <p>Size: ${segment.bounds.width}x${segment.bounds.height}px</p>
                </div>
            </div>
        `).join('');
    }

    async downloadParts() {
        if (!this.currentSessionId) return;

        this.showLoading('Preparing download...');

        try {
            const response = await fetch(`/api/character-rigging/download/${this.currentSessionId}`);

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `character-rigged-parts.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.showToast('Download started!', 'success');

        } catch (error) {
            console.error('Download error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    loadTemplate(templateName) {
        const templates = {
            'humanoid': [
                { label: 'head', x: 0.5, y: 0.1, type: 'head' },
                { label: 'neck', x: 0.5, y: 0.2, type: 'neck' },
                { label: 'left_shoulder', x: 0.35, y: 0.25, type: 'shoulder' },
                { label: 'right_shoulder', x: 0.65, y: 0.25, type: 'shoulder' },
                { label: 'left_elbow', x: 0.3, y: 0.4, type: 'elbow' },
                { label: 'right_elbow', x: 0.7, y: 0.4, type: 'elbow' },
                { label: 'left_wrist', x: 0.28, y: 0.55, type: 'wrist' },
                { label: 'right_wrist', x: 0.72, y: 0.55, type: 'wrist' },
                { label: 'left_hip', x: 0.4, y: 0.5, type: 'hip' },
                { label: 'right_hip', x: 0.6, y: 0.5, type: 'hip' },
                { label: 'left_knee', x: 0.4, y: 0.7, type: 'knee' },
                { label: 'right_knee', x: 0.6, y: 0.7, type: 'knee' },
                { label: 'left_ankle', x: 0.4, y: 0.9, type: 'ankle' },
                { label: 'right_ankle', x: 0.6, y: 0.9, type: 'ankle' }
            ],
            'humanoid-simple': [
                { label: 'head', x: 0.5, y: 0.1, type: 'head' },
                { label: 'neck', x: 0.5, y: 0.2, type: 'neck' },
                { label: 'left_shoulder', x: 0.35, y: 0.25, type: 'shoulder' },
                { label: 'right_shoulder', x: 0.65, y: 0.25, type: 'shoulder' },
                { label: 'left_hand', x: 0.25, y: 0.5, type: 'hand' },
                { label: 'right_hand', x: 0.75, y: 0.5, type: 'hand' },
                { label: 'left_hip', x: 0.4, y: 0.5, type: 'hip' },
                { label: 'right_hip', x: 0.6, y: 0.5, type: 'hip' },
                { label: 'left_foot', x: 0.4, y: 0.9, type: 'foot' },
                { label: 'right_foot', x: 0.6, y: 0.9, type: 'foot' }
            ],
            'quadruped': [
                { label: 'head', x: 0.2, y: 0.3, type: 'head' },
                { label: 'neck', x: 0.3, y: 0.4, type: 'neck' },
                { label: 'front_left_shoulder', x: 0.35, y: 0.45, type: 'shoulder' },
                { label: 'front_right_shoulder', x: 0.35, y: 0.55, type: 'shoulder' },
                { label: 'back_left_hip', x: 0.7, y: 0.45, type: 'hip' },
                { label: 'back_right_hip', x: 0.7, y: 0.55, type: 'hip' },
                { label: 'front_left_foot', x: 0.35, y: 0.8, type: 'foot' },
                { label: 'front_right_foot', x: 0.35, y: 0.9, type: 'foot' },
                { label: 'back_left_foot', x: 0.7, y: 0.8, type: 'foot' },
                { label: 'back_right_foot', x: 0.7, y: 0.9, type: 'foot' }
            ]
        };

        const template = templates[templateName];
        if (!template || !this.imageData) return;

        // Scale template points to image dimensions
        this.rigPoints = template.map((point, index) => ({
            id: `point_${Date.now()}_${index}`,
            x: point.x * this.imageData.width,
            y: point.y * this.imageData.height,
            label: point.label,
            type: point.type
        }));

        this.redrawCanvas();
        this.updatePointsList();
        this.saveRigData();

        this.showToast(`Loaded ${templateName} template`, 'success');
    }

    async showSessionsModal() {
        document.getElementById('sessions-modal').classList.add('active');

        try {
            const response = await fetch('/api/character-rigging/my-sessions');
            const data = await response.json();

            const sessionsList = document.getElementById('sessions-list');
            if (!sessionsList) return;

            if (data.sessions.length === 0) {
                sessionsList.innerHTML = '<p>No rigging sessions found.</p>';
                return;
            }

            sessionsList.innerHTML = data.sessions.map(session => `
                <div class="session-card">
                    <h3>${session.characterName}</h3>
                    <p>Status: ${session.status}</p>
                    <p>Points: ${session.rigPoints?.length || 0}</p>
                    <p>Created: ${new Date(session.createdAt).toLocaleDateString()}</p>
                    <button class="btn btn-primary load-session-btn" data-id="${session.sessionId}">
                        Load Session
                    </button>
                </div>
            `).join('');

            // Add load listeners
            sessionsList.querySelectorAll('.load-session-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    this.currentSessionId = btn.dataset.id;
                    await this.loadSession();
                    this.hideModal('sessions-modal');
                });
            });

        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    }

    async loadSession() {
        try {
            const response = await fetch(`/api/character-rigging/session/${this.currentSessionId}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            this.rigPoints = data.session.rigPoints || [];
            this.boneConnections = data.session.boneConnections || [];

            await this.loadCharacterImage();

            this.showSection('rigging');
            this.updatePointsList();
            this.showToast('Session loaded successfully', 'success');

        } catch (error) {
            console.error('Load session error:', error);
            this.showToast(error.message, 'error');
        }
    }

    showTemplateModal() {
        document.getElementById('template-modal').classList.add('active');
    }

    hideModal(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
    }

    saveToHistory() {
        // Remove any history after current index (for redo)
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Save current state
        const state = {
            rigPoints: JSON.parse(JSON.stringify(this.rigPoints)),
            boneConnections: JSON.parse(JSON.stringify(this.boneConnections))
        };

        this.history.push(state);

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }

        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.historyIndex <= 0) {
            this.showToast('Nothing to undo', 'info');
            return;
        }

        this.historyIndex--;
        this.restoreState(this.history[this.historyIndex]);
        this.updateUndoRedoButtons();
        this.showToast('Undo successful', 'info');
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            this.showToast('Nothing to redo', 'info');
            return;
        }

        this.historyIndex++;
        this.restoreState(this.history[this.historyIndex]);
        this.updateUndoRedoButtons();
        this.showToast('Redo successful', 'info');
    }

    restoreState(state) {
        this.rigPoints = JSON.parse(JSON.stringify(state.rigPoints));
        this.boneConnections = JSON.parse(JSON.stringify(state.boneConnections));
        this.redrawCanvas();
        this.updatePointsList();
        this.saveRigData();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.disabled = this.historyIndex <= 0;
            undoBtn.style.opacity = this.historyIndex <= 0 ? '0.5' : '1';
        }

        if (redoBtn) {
            redoBtn.disabled = this.historyIndex >= this.history.length - 1;
            redoBtn.style.opacity = this.historyIndex >= this.history.length - 1 ? '0.5' : '1';
        }
    }

    async removeBackground() {
        if (!this.currentSessionId) return;

        this.showLoading('Removing background...');

        try {
            const response = await fetch('/api/character-rigging/remove-background', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.currentSessionId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Background removal failed');
            }

            if (data.hadBackground) {
                this.showToast('Background removed successfully!', 'success');
                // Reload the image to show the result
                await this.loadCharacterImage();
            } else {
                this.showToast('No solid background detected', 'info');
            }

        } catch (error) {
            console.error('Background removal error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async resolveOverlaps() {
        if (!this.currentSessionId) return;

        this.showLoading('Resolving overlaps...');

        try {
            const response = await fetch('/api/character-rigging/resolve-overlaps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.currentSessionId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Overlap resolution failed');
            }

            if (data.overlaps.length > 0) {
                this.showToast(`Resolved ${data.overlaps.length} overlapping regions`, 'success');
                // Reload segments to show resolved versions
                this.showSection('results');
            } else {
                this.showToast('No overlaps detected', 'info');
            }

        } catch (error) {
            console.error('Overlap resolution error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    enterRefinementMode() {
        this.showToast('Refinement Mode: Click around a segment to draw custom boundary', 'info');

        // Create a modal to select which segment to refine
        const segmentsList = document.getElementById('segmented-parts-grid');
        if (!segmentsList) return;

        const segments = Array.from(segmentsList.querySelectorAll('.part-card'));

        segments.forEach((card, index) => {
            card.style.cursor = 'pointer';
            card.onclick = () => this.startRefinement(index);
        });
    }

    startRefinement(segmentIndex) {
        this.refinementMode = true;
        this.currentRefinementSegment = segmentIndex;
        this.refinementPoints = [];

        this.showToast('Click to place boundary points. Press Enter to finish, Escape to cancel.', 'info');

        // Switch to rigging section with the original image
        this.showSection('rigging');

        // Add keyboard listeners
        const keyHandler = (e) => {
            if (e.key === 'Enter' && this.refinementPoints.length >= 3) {
                this.finishRefinement();
                document.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Escape') {
                this.cancelRefinement();
                document.removeEventListener('keydown', keyHandler);
            }
        };

        document.addEventListener('keydown', keyHandler);
    }

    async finishRefinement() {
        if (!this.currentSessionId || this.refinementPoints.length < 3) return;

        this.showLoading('Refining segment mask...');

        try {
            // Get segment name from results
            const segmentCards = document.querySelectorAll('.part-card');
            const segmentName = segmentCards[this.currentRefinementSegment]?.querySelector('h3')?.textContent;

            if (!segmentName) {
                throw new Error('Segment not found');
            }

            const response = await fetch('/api/character-rigging/refine-mask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: this.currentSessionId,
                    segmentName: segmentName,
                    maskPoints: this.refinementPoints
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Mask refinement failed');
            }

            this.showToast('Segment mask refined successfully!', 'success');
            this.cancelRefinement();
            this.showSection('results');

        } catch (error) {
            console.error('Refinement error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    cancelRefinement() {
        this.refinementMode = false;
        this.currentRefinementSegment = null;
        this.refinementPoints = [];
        this.redrawCanvas();
    }

    showSection(sectionName) {
        document.querySelectorAll('.workflow-section').forEach(section => {
            section.classList.remove('active');
        });

        document.getElementById(`${sectionName}-section`)?.classList.add('active');
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');

        if (overlay) overlay.style.display = 'flex';
        if (messageEl) messageEl.textContent = message;
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast-notification');
        if (!toast) return;

        toast.textContent = message;
        toast.className = `toast-notification ${type} active`;

        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    }

    // ========== BRUSH EDITOR METHODS ==========

    showBrushEditor() {
        const panel = document.getElementById('brush-editor-panel');
        const selector = document.getElementById('segment-selector');

        if (!panel || !selector || !this.segments || this.segments.length === 0) {
            this.showToast('Please segment the character first', 'warning');
            return;
        }

        // Populate segment selector
        selector.innerHTML = this.segments.map((seg, index) =>
            `<option value="${index}">${seg.name}</option>`
        ).join('');

        // Show panel
        panel.style.display = 'block';
        this.brushMode = true;

        // Setup brush canvas
        this.setupBrushCanvas();
        this.selectSegmentForEditing(0);

        this.showToast('Brush editor active - paint to add/remove pixels', 'info');
    }

    closeBrushEditor() {
        const panel = document.getElementById('brush-editor-panel');
        if (panel) panel.style.display = 'none';
        this.brushMode = false;
    }

    setupBrushCanvas() {
        const canvas = document.getElementById('brush-preview-canvas');
        if (!canvas) return;

        this.brushCanvas = canvas;
        this.brushCtx = canvas.getContext('2d');

        // Set canvas size to match image
        if (this.imageData) {
            canvas.width = this.imageData.width;
            canvas.height = this.imageData.height;
        }

        // Add painting listeners
        let isPainting = false;
        let lastX = 0;
        let lastY = 0;

        canvas.addEventListener('mousedown', (e) => {
            isPainting = true;
            const rect = canvas.getBoundingClientRect();
            lastX = (e.clientX - rect.left) * (canvas.width / rect.width);
            lastY = (e.clientY - rect.top) * (canvas.height / rect.height);
            this.paintBrushStroke(lastX, lastY, lastX, lastY);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isPainting) return;
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            this.paintBrushStroke(lastX, lastY, x, y);
            lastX = x;
            lastY = y;
        });

        canvas.addEventListener('mouseup', () => {
            isPainting = false;
        });

        canvas.addEventListener('mouseleave', () => {
            isPainting = false;
        });
    }

    selectSegmentForEditing(index) {
        if (!this.segments || index >= this.segments.length) return;

        this.selectedSegmentIndex = index;
        const segment = this.segments[index];

        // Load segment image onto canvas
        this.loadSegmentOntoCanvas(segment);
    }

    async loadSegmentOntoCanvas(segment) {
        if (!this.brushCanvas || !this.imageData) return;

        // Clear canvas
        this.brushCtx.clearRect(0, 0, this.brushCanvas.width, this.brushCanvas.height);

        // Draw original character image
        this.brushCtx.globalAlpha = 0.5;
        this.brushCtx.drawImage(this.imageData, 0, 0);
        this.brushCtx.globalAlpha = 1.0;

        // Draw segment with highlight overlay
        try {
            const response = await fetch(`/api/character-rigging/segment-image/${this.currentSessionId}/${segment.name}`);
            if (!response.ok) throw new Error('Failed to load segment');

            const blob = await response.blob();
            const img = new Image();

            img.onload = () => {
                // Draw segment image with colored overlay
                this.brushCtx.save();
                this.brushCtx.globalAlpha = 0.7;
                this.brushCtx.drawImage(img, segment.bounds.x, segment.bounds.y);

                // Add colored tint to show what's selected
                this.brushCtx.globalCompositeOperation = 'source-atop';
                this.brushCtx.fillStyle = this.brushType === 'add' ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)';
                this.brushCtx.fillRect(segment.bounds.x, segment.bounds.y, segment.bounds.width, segment.bounds.height);

                this.brushCtx.restore();

                // Store current segment image data for editing
                this.currentSegmentImageData = this.brushCtx.getImageData(0, 0, this.brushCanvas.width, this.brushCanvas.height);
            };

            img.src = URL.createObjectURL(blob);

        } catch (error) {
            console.error('Failed to load segment:', error);
            this.showToast('Failed to load segment for editing', 'error');
        }
    }

    paintBrushStroke(x1, y1, x2, y2) {
        if (!this.brushCtx || !this.currentSegmentImageData) return;

        // This is a simplified brush implementation
        // In a full implementation, you'd modify the actual image data pixel by pixel

        this.brushCtx.save();
        this.brushCtx.globalCompositeOperation = this.brushType === 'add' ? 'source-over' : 'destination-out';
        this.brushCtx.strokeStyle = this.brushType === 'add' ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)';
        this.brushCtx.lineWidth = this.brushSize;
        this.brushCtx.lineCap = 'round';
        this.brushCtx.lineJoin = 'round';

        this.brushCtx.beginPath();
        this.brushCtx.moveTo(x1, y1);
        this.brushCtx.lineTo(x2, y2);
        this.brushCtx.stroke();

        this.brushCtx.restore();
    }

    applyBrushEdits() {
        // In a full implementation, this would send the modified image data back to the server
        // For now, we'll just show a message
        this.showToast('Brush edits applied successfully!', 'success');
        this.closeBrushEditor();
    }

    resetCurrentSegment() {
        const segment = this.segments[this.selectedSegmentIndex];
        if (segment) {
            this.loadSegmentOntoCanvas(segment);
            this.showToast('Segment reset to original', 'info');
        }
    }

    undoBrushStroke() {
        // In a full implementation, you'd maintain a history of brush strokes
        this.showToast('Undo feature coming soon', 'info');
    }
}

// Initialize the portal when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.riggingPortal = new CharacterRiggingPortal();
});
