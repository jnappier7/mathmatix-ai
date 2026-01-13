// Debug script to check button functionality
console.log('🐛 Button Debug Script Loaded');

// Check if buttons exist when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🐛 DOM Content Loaded - Checking buttons...');

    // Check Resources button
    const resourcesBtn = document.getElementById('open-resources-modal-btn');
    console.log('📚 Resources Button:', resourcesBtn ? 'EXISTS ✅' : 'NOT FOUND ❌');
    if (resourcesBtn) {
        console.log('  - Display:', window.getComputedStyle(resourcesBtn).display);
        console.log('  - Visibility:', window.getComputedStyle(resourcesBtn).visibility);
        console.log('  - Pointer Events:', window.getComputedStyle(resourcesBtn).pointerEvents);
        console.log('  - Z-Index:', window.getComputedStyle(resourcesBtn).zIndex);

        // Add a test click handler
        resourcesBtn.addEventListener('click', () => {
            console.log('🎯 Resources button CLICKED!');
        }, { capture: true });
    }

    // Check modals
    const resourcesModal = document.getElementById('resources-modal');
    console.log('📚 Resources Modal:', resourcesModal ? 'EXISTS ✅' : 'NOT FOUND ❌');
});

// Also check immediately (in case DOMContentLoaded already fired)
setTimeout(() => {
    console.log('🐛 Delayed Check (1 second after load)...');

    const resourcesBtn = document.getElementById('open-resources-modal-btn');

    if (resourcesBtn) {
        console.log('📚 Resources button exists (handlers attached via addEventListener)');
        console.log('   Event listeners:', typeof getEventListeners !== 'undefined' ? getEventListeners(resourcesBtn) : 'Use DevTools to inspect');
    }
}, 1000);
