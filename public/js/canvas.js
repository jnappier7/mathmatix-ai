// public/js/canvas.js - Enhanced Interactive Whiteboard
document.addEventListener('DOMContentLoaded', () => {
    console.log("Canvas script loaded.");

    const canvas = document.getElementById('interactive-canvas');
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("Failed to get 2D context from canvas.");
        return;
    }

    console.log("Canvas and context initialized successfully.");

    // --- Drawing State & Configuration ---
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let currentColor = '#000000';
    let currentLineWidth = 3;
    let currentTool = 'pen'; // 'pen', 'eraser', 'line', 'rectangle', 'circle', 'text'
    let undoStack = [];
    let redoStack = [];
    let startX = 0;
    let startY = 0;
    let snapshot = null;

    // Save initial blank state
    saveState();

    // --- Utility Functions ---
    function saveState() {
        undoStack.push(canvas.toDataURL());
        if (undoStack.length > 50) undoStack.shift(); // Limit to 50 states
        redoStack = []; // Clear redo stack on new action
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || e.touches?.[0]?.clientX) - rect.left,
            y: (e.clientY || e.touches?.[0]?.clientY) - rect.top
        };
    }

    function restoreCanvas(dataUrl) {
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = dataUrl;
    }

    // --- Drawing Functions ---
    function startDrawing(e) {
        e.preventDefault();
        isDrawing = true;
        const pos = getMousePos(e);
        lastX = startX = pos.x;
        lastY = startY = pos.y;

        if (currentTool !== 'pen' && currentTool !== 'eraser') {
            snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        if (currentTool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
                ctx.font = `${currentLineWidth * 8}px Arial`;
                ctx.fillStyle = currentColor;
                ctx.fillText(text, lastX, lastY);
                saveState();
            }
            isDrawing = false;
        }
    }

    function stopDrawing(e) {
        if (!isDrawing) return;
        isDrawing = false;

        if (currentTool !== 'pen' && currentTool !== 'eraser') {
            saveState();
        }
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();

        const pos = getMousePos(e);
        const currentX = pos.x;
        const currentY = pos.y;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (currentTool === 'pen') {
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = currentLineWidth;
            ctx.globalCompositeOperation = 'source-over';

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            [lastX, lastY] = [currentX, currentY];

        } else if (currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = currentLineWidth * 3;

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            [lastX, lastY] = [currentX, currentY];
            ctx.globalCompositeOperation = 'source-over';

        } else if (currentTool === 'line') {
            if (snapshot) {
                ctx.putImageData(snapshot, 0, 0);
            }
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = currentLineWidth;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

        } else if (currentTool === 'rectangle') {
            if (snapshot) {
                ctx.putImageData(snapshot, 0, 0);
            }
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = currentLineWidth;
            ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);

        } else if (currentTool === 'circle') {
            if (snapshot) {
                ctx.putImageData(snapshot, 0, 0);
            }
            const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = currentLineWidth;
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    // --- Tool Controls ---
    window.setDrawingTool = function(tool) {
        currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tool="${tool}"]`)?.classList.add('active');
    };

    window.setDrawingColor = function(color) {
        currentColor = color;
        document.getElementById('color-picker').value = color;
    };

    window.setLineWidth = function(width) {
        currentLineWidth = parseInt(width);
        document.getElementById('line-width-value').textContent = width;
    };

    window.clearCanvas = function() {
        if (confirm('Clear the entire canvas?')) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            saveState();
        }
    };

    window.undoCanvas = function() {
        if (undoStack.length > 1) {
            redoStack.push(undoStack.pop());
            const previousState = undoStack[undoStack.length - 1];
            restoreCanvas(previousState);
        }
    };

    window.redoCanvas = function() {
        if (redoStack.length > 0) {
            const nextState = redoStack.pop();
            undoStack.push(nextState);
            restoreCanvas(nextState);
        }
    };

    window.downloadCanvas = function() {
        const link = document.createElement('a');
        link.download = `mathmatix-whiteboard-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    };

    // --- Event Listeners for Mouse ---
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', (e) => {
        if (isDrawing && (currentTool === 'pen' || currentTool === 'eraser')) {
            saveState();
        }
        stopDrawing(e);
    });
    canvas.addEventListener('mouseout', stopDrawing);

    // --- Event Listeners for Touch (Mobile/Tablet) ---
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', (e) => {
        if (isDrawing && (currentTool === 'pen' || currentTool === 'eraser')) {
            saveState();
        }
        stopDrawing(e);
    });
    canvas.addEventListener('touchcancel', stopDrawing);

    // --- Initialize UI ---
    if (document.getElementById('color-picker')) {
        document.getElementById('color-picker').addEventListener('input', (e) => {
            setDrawingColor(e.target.value);
        });
    }

    if (document.getElementById('line-width')) {
        document.getElementById('line-width').addEventListener('input', (e) => {
            setLineWidth(e.target.value);
        });
    }

    console.log("Enhanced whiteboard initialized with all features.");
});