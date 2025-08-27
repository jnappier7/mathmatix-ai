// public/js/canvas.js
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

    // --- NEW: Drawing State & Logic ---

    // This variable will track whether the user is currently drawing.
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // Function to start drawing
    function startDrawing(e) {
        isDrawing = true;
        // Record the starting position of the line
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }

    // Function to stop drawing
    function stopDrawing() {
        isDrawing = false;
    }

    // The main drawing function
    function draw(e) {
        // Stop if the user isn't holding the mouse down
        if (!isDrawing) return;

        // --- Configure the line style ---
        ctx.strokeStyle = '#000000'; // Black color
        ctx.lineWidth = 3;           // A nice, visible thickness
        ctx.lineCap = 'round';       // Smooth, rounded ends for the lines
        ctx.lineJoin = 'round';      // Smooth, rounded corners where lines meet

        // --- Draw the line ---
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);       // Start from the last recorded point
        ctx.lineTo(e.offsetX, e.offsetY); // Draw a line to the new, current point
        ctx.stroke();                   // Make the line visible on the canvas

        // Update the last position for the next small segment of the line
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }

    // --- NEW: Event Listeners for Mouse ---
    // When the mouse button is pressed down, start drawing.
    canvas.addEventListener('mousedown', startDrawing);

    // When the mouse is moved, draw if the button is held down.
    canvas.addEventListener('mousemove', draw);

    // When the mouse button is released, stop drawing.
    canvas.addEventListener('mouseup', stopDrawing);

    // Also, if the mouse leaves the canvas area, stop drawing.
    canvas.addEventListener('mouseout', stopDrawing);

});