// Function to fetch and display leaderboard data
async function fetchAndDisplayLeaderboard() {
    const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
    leaderboardTableBody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-4 text-gray-500">Loading leaderboard...</td>
        </tr>
    `; // Show loading message

    try {
        // --- Actual API Call ---
        // This will now fetch data from your Express backend route: /api/students/leaderboard
        const response = await fetch('/api/students/leaderboard');

        if (!response.ok) {
            // If the response is not OK (e.g., 401, 403, 500 status)
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const students = await response.json(); // Parse the JSON response

        // Clear existing table rows
        leaderboardTableBody.innerHTML = '';

        // Check if no students were returned (e.g., if a student has no assigned teacher)
        if (students.length === 0) {
            leaderboardTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-4 text-gray-500">No students found for this leaderboard.</td>
                </tr>
            `;
            return; // Exit the function
        }

        // Populate the table with student data
        students.forEach((student, index) => {
            const rank = index + 1; // Rank is determined by the order from the backend (already sorted by XP)

            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors duration-150'; // Hover effect for rows
            row.innerHTML = `
                <td class="py-3 px-4 text-sm text-gray-700 font-medium">${rank}</td>
                <td class="py-3 px-4 text-sm text-gray-700">${student.name}</td> <td class="py-3 px-4 text-sm text-gray-700">${student.level}</td>
                <td class="py-3 px-4 text-sm text-gray-700">${student.xp}</td>
            `;
            leaderboardTableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        leaderboardTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-red-500">Failed to load leaderboard. Please ensure you are logged in and authorized.</td>
            </tr>
        `;
    }
}

// Call the function to display the leaderboard when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', fetchAndDisplayLeaderboard);