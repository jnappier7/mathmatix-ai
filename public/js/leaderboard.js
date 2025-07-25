// public/js/leaderboard.js
// MODIFIED: Added a guard clause to prevent errors on pages without a leaderboard.

document.addEventListener("DOMContentLoaded", async () => {
    const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');

    // --- GUARD CLAUSE ---
    if (!leaderboardTableBody) {
        return; // Exit if the leaderboard element doesn't exist on the current page.
    }

    async function fetchAndDisplayLeaderboard() {
        leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
        try {
            const response = await fetch('/api/leaderboard', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load leaderboard');
            const students = await response.json();
            
            leaderboardTableBody.innerHTML = ''; 
            
            if (students.length === 0) {
                leaderboardTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available.</td></tr>';
                return;
            }
            students.forEach((student, index) => {
                const row = leaderboardTableBody.insertRow();
                row.innerHTML = `<td>${index + 1}</td><td>${student.name}</td><td>${student.level}</td><td>${student.xp}</td>`;
            });
        } catch (error) {
            console.error('Leaderboard error:', error);
            leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Could not load leaderboard.</td></tr>`;
        }
    }

    // Initial load
    fetchAndDisplayLeaderboard();
});