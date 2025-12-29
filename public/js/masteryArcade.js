// masteryArcade.js - M∆STERY.∆RC∆DE Hub

document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await loadStats();
    initializeEventListeners();
});

// Load user
async function loadUser() {
    try {
        const response = await fetch('/user');
        const data = await response.json();

        if (data.user) {
            document.getElementById('userName').textContent = data.user.firstName || 'Student';
            document.getElementById('userLevel').textContent = data.user.level || 1;
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch('/api/fact-fluency/progress');
        const data = await response.json();

        if (data.success && data.progress) {
            const progress = data.progress;

            // Count mastered families
            let masteredCount = 0;
            if (progress.factFamilies) {
                Object.values(progress.factFamilies).forEach(family => {
                    if (family.mastered) masteredCount++;
                });
            }

            // Update stats
            document.getElementById('totalMastered').textContent = masteredCount;
            document.getElementById('currentStreak').textContent = progress.stats?.currentStreak || 0;
            document.getElementById('totalSessions').textContent = progress.stats?.totalSessions || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Event listeners
function initializeEventListeners() {
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/badge-map.html';
    });
}
