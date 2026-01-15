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
    let isCollapsed = false;
    let collapseBtn = null;

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

        // Add collapse button
        collapseBtn = document.createElement('button');
        collapseBtn.id = 'tutor-collapse-btn';
        collapseBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
        collapseBtn.setAttribute('title', 'Minimize tutor');
        collapseBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(102, 126, 234, 0.9);
            color: white;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all 0.2s ease;
            z-index: 10;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        `;

        collapseBtn.addEventListener('mouseenter', () => {
            collapseBtn.style.background = 'rgba(102, 126, 234, 1)';
            collapseBtn.style.transform = 'scale(1.1)';
        });

        collapseBtn.addEventListener('mouseleave', () => {
            collapseBtn.style.background = 'rgba(102, 126, 234, 0.9)';
            collapseBtn.style.transform = 'scale(1)';
        });

        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCollapse();
        });

        tutorCard.appendChild(collapseBtn);

        // Add event listeners
        tutorCard.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        // Touch events for mobile
        tutorCard.addEventListener('touchstart', dragStart);
        document.addEventListener('touchmove', drag);
        document.addEventListener('touchend', dragEnd);

        // Restore collapsed state
        restoreCollapsedState();
    }

    function toggleCollapse() {
        isCollapsed = !isCollapsed;

        if (isCollapsed) {
            tutorCard.classList.add('collapsed');
            collapseBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
            collapseBtn.setAttribute('title', 'Expand tutor');
            tutorCard.style.width = '60px';
            tutorCard.style.height = '60px';
            tutorCard.style.borderRadius = '50%';
        } else {
            tutorCard.classList.remove('collapsed');
            collapseBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
            collapseBtn.setAttribute('title', 'Minimize tutor');
            tutorCard.style.width = '240px';
            tutorCard.style.height = '240px';
            tutorCard.style.borderRadius = '24px';
        }

        // Save state
        localStorage.setItem('tutorCollapsed', isCollapsed);
    }

    function restoreCollapsedState() {
        const saved = localStorage.getItem('tutorCollapsed');
        if (saved === 'true') {
            toggleCollapse();
        }
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
            restoreCollapsedState();
        });
    } else {
        initDraggableTutor();
        restorePosition();
        restoreCollapsedState();
    }

    console.log('✅ Draggable tutor module loaded');
})();
