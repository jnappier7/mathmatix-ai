// ============================================
// DRAGGABLE TUTOR AVATAR
// Makes the floating tutor avatar draggable
// ============================================

(function() {
    let tutorCard = null;
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    function initDraggableTutor() {
        tutorCard = document.getElementById('floating-tutor');
        if (!tutorCard) {
            console.log('⚠️ Tutor card not found, retrying...');
            setTimeout(initDraggableTutor, 500);
            return;
        }

        console.log('✅ Making tutor avatar draggable');

        // Make it grabbable
        tutorCard.style.cursor = 'grab';

        // Add event listeners
        tutorCard.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        // Touch events for mobile
        tutorCard.addEventListener('touchstart', dragStart);
        document.addEventListener('touchmove', drag);
        document.addEventListener('touchend', dragEnd);
    }

    function dragStart(e) {
        // Prevent default behavior for touch events
        if (e.type === 'touchstart') {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        // Only start drag if clicking on the tutor card itself
        if (e.target === tutorCard || tutorCard.contains(e.target)) {
            isDragging = true;
            tutorCard.style.cursor = 'grabbing';
        }
    }

    function drag(e) {
        if (!isDragging) return;

        e.preventDefault();

        if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY);
    }

    function dragEnd(e) {
        if (!isDragging) return;

        isDragging = false;
        tutorCard.style.cursor = 'grab';

        // Save position to localStorage
        localStorage.setItem('tutorPosition', JSON.stringify({
            x: xOffset,
            y: yOffset
        }));
    }

    function setTranslate(xPos, yPos) {
        tutorCard.style.transform = `translate(${xPos}px, ${yPos}px)`;
    }

    function restorePosition() {
        const saved = localStorage.getItem('tutorPosition');
        if (saved) {
            try {
                const pos = JSON.parse(saved);
                xOffset = pos.x;
                yOffset = pos.y;
                setTranslate(xOffset, yOffset);
                console.log('✅ Restored tutor position:', pos);
            } catch (e) {
                console.error('Failed to restore tutor position:', e);
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initDraggableTutor();
            restorePosition();
        });
    } else {
        initDraggableTutor();
        restorePosition();
    }

    console.log('✅ Draggable tutor module loaded');
})();
