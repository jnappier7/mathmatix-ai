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

    // Check Graphing Calculator button
    const graphBtn = document.getElementById('open-graphing-calc-btn');
    console.log('📊 Graphing Calc Button:', graphBtn ? 'EXISTS ✅' : 'NOT FOUND ❌');
    if (graphBtn) {
        console.log('  - Display:', window.getComputedStyle(graphBtn).display);
        console.log('  - Visibility:', window.getComputedStyle(graphBtn).visibility);
        console.log('  - Pointer Events:', window.getComputedStyle(graphBtn).pointerEvents);
        console.log('  - Z-Index:', window.getComputedStyle(graphBtn).zIndex);

        // Add a test click handler
        graphBtn.addEventListener('click', () => {
            console.log('🎯 Graphing calc button CLICKED!');
        }, { capture: true });
    }

    // Check modals
    const resourcesModal = document.getElementById('resources-modal');
    const graphModal = document.getElementById('graphing-calc-modal');
    console.log('📚 Resources Modal:', resourcesModal ? 'EXISTS ✅' : 'NOT FOUND ❌');
    console.log('📊 Graphing Modal:', graphModal ? 'EXISTS ✅' : 'NOT FOUND ❌');
});

// Also check immediately (in case DOMContentLoaded already fired)
setTimeout(() => {
    console.log('🐛 Delayed Check (1 second after load)...');

    const resourcesBtn = document.getElementById('open-resources-modal-btn');
    const graphBtn = document.getElementById('open-graphing-calc-btn');

    if (resourcesBtn) {
        console.log('📚 Resources button exists and has', resourcesBtn.onclick ? 'onclick handler' : 'NO onclick handler');
        console.log('   Event listeners count:', typeof getEventListeners !== 'undefined' ? getEventListeners(resourcesBtn) : 'Cannot check (DevTools only)');
    }

    if (graphBtn) {
        console.log('📊 Graph button exists and has', graphBtn.onclick ? 'onclick handler' : 'NO onclick handler');
        console.log('   Event listeners count:', typeof getEventListeners !== 'undefined' ? getEventListeners(graphBtn) : 'Cannot check (DevTools only)');
    }
}, 1000);
