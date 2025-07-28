/**
 * M∆THM∆TIΧ AI - Admin Dashboard Script
 *
 * This script manages all functionality for the admin dashboard, including
 * fetching and displaying user data, handling teacher assignments, and
 * providing detailed views of student profiles.
 *
 * @version 2.0
 * @author Senior Developer
 */
document.addEventListener("DOMContentLoaded", async () => {
    // -------------------------------------------------------------------------
    // --- Initial Security Check ---
    // -------------------------------------------------------------------------
    try {
        const response = await fetch('/user', { credentials: 'include' });
        if (!response.ok) throw new Error("Not Authenticated");
        const { user } = await response.json();
        if (!user || user.role !== 'admin') {
            throw new Error("Access Denied");
        }
    } catch (err) {
        // If the user is not an admin, redirect them to the login page.
        window.location.href = '/login.html';
        return; // Halt script execution
    }

    // -------------------------------------------------------------------------
    // --- DOM Element Caching ---
    // -------------------------------------------------------------------------
    // Cache all necessary DOM elements at the start for performance.
    const teacherSelect = document.getElementById("teacherSelect");
    const assignButton = document.getElementById("assignButton");
    const studentSearch = document.getElementById("studentSearch");
    const userTableBody = document.getElementById("userTableBody");
    const studentDetailModal = document.getElementById("studentDetailModal");
    const closeModalButton = document.getElementById("closeModalButton");
    const saveChangesButton = document.getElementById("saveChangesButton");
    const cancelButton = document.getElementById("cancelButton");
    const studentProfileForm = document.getElementById("studentProfileForm");
    const studentIepForm = document.getElementById("studentIepForm");
    const modalStudentName = document.getElementById("modalStudentName");
    const modalStudentId = document.getElementById("modalStudentId");
    const conversationSummariesList = document.getElementById("conversationSummariesList");

    // -------------------------------------------------------------------------
    // --- State Management ---
    // -------------------------------------------------------------------------
    let students = [];
    let teacherMap = new Map(); // Use a Map for efficient teacher lookups.

    // -------------------------------------------------------------------------
    // --- Modal Control ---
    // -------------------------------------------------------------------------
    const openModal = () => studentDetailModal?.classList.add('is-visible');
    const closeModal = () => studentDetailModal?.classList.remove('is-visible');

    // -------------------------------------------------------------------------
    // --- Data Fetching & Initialization ---
    // -------------------------------------------------------------------------

    /**
     * Fetches all necessary data from the server and initializes the dashboard.
     */
    async function initializeDashboard() {
        try {
            const [usersRes, teachersRes] = await Promise.all([
                fetch('/api/admin/users', { credentials: 'include' }),
                fetch('/api/admin/teachers', { credentials: 'include' })
            ]);

            if (!usersRes.ok || !teachersRes.ok) {
                throw new Error('Failed to load initial user and teacher data.');
            }

            const allUsers = await usersRes.json();
            const teachers = await teachersRes.json();
            
            // Filter users into students for the main list
            students = allUsers.filter(u => u.role === 'student');

            // Create a teacher lookup map for efficient name retrieval (O(1) vs O(n))
            teacherMap = new Map(teachers.map(t => [t._id, `${t.firstName} ${t.lastName}`]));

            renderTeacherOptions();
            renderStudents();
            fetchAndDisplayLeaderboard(); // Now that the page is ready
            fetchSystemStatus();

        } catch (error) {
            console.error("Error initializing dashboard:", error);
            if(userTableBody) userTableBody.innerHTML = `<tr><td colspan="5" class="text-center">Error loading data. Please refresh.</td></tr>`;
        }
    }
    
    /**
     * Fetches and displays the top students in the leaderboard panel.
     * Note: This requires the "Top Students" panel in admin-dashboard.html to be updated
     * to use a table with id="leaderboardTable" as previously recommended.
     */
    async function fetchAndDisplayLeaderboard() {
        const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
        if (!leaderboardTableBody) return; // Exit if the leaderboard table isn't on the page

        leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
        try {
            const response = await fetch('/api/leaderboard', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load leaderboard');
            
            const topStudents = await response.json();
            leaderboardTableBody.innerHTML = ''; // Clear loading state
            
            if (topStudents.length === 0) {
                leaderboardTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available.</td></tr>';
                return;
            }

            topStudents.forEach((student, index) => {
                const row = leaderboardTableBody.insertRow();
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${student.name}</td>
                    <td>${student.level}</td>
                    <td>${student.xp}</td>
                `;
            });
        } catch (error) {
            console.error('Leaderboard error:', error);
            leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Could not load leaderboard.</td></tr>`;
        }
    }

    /**
     * Fetches the system health and updates the status panel.
     */
    async function fetchSystemStatus() {
        // This function will populate the System Status panel dynamically.
        // For now, it's a placeholder until the backend endpoint is created.
        // const status = await fetch('/api/admin/health-check');
    }

    // -------------------------------------------------------------------------
    // --- Rendering Functions ---
    // -------------------------------------------------------------------------

    /**
     * Populates the teacher assignment dropdown menu.
     */
    function renderTeacherOptions() {
        if (!teacherSelect) return;
        teacherSelect.innerHTML = '<option value="">Unassign</option>';
        for (const [id, name] of teacherMap.entries()) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            teacherSelect.appendChild(option);
        }
    }

    /**
     * Renders the list of students in the main table, applying search filters.
     */
    function renderStudents() {
        if (!userTableBody) return;
        const query = studentSearch ? studentSearch.value.toLowerCase().trim() : "";
        userTableBody.innerHTML = "";

        const filteredStudents = students.filter(s =>
            `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(query) ||
            (s.email || '').toLowerCase().includes(query) ||
            (s.username || '').toLowerCase().includes(query)
        );

        if (filteredStudents.length === 0) {
            userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No students found matching your search.</td></tr>`;
            return;
        }

        const rowsHtml = filteredStudents.map(s => `
            <tr data-studentid="${s._id}">
                <td><input type="checkbox" class="select-student" value="${s._id}"></td>
                <td><a href="#" class="student-name-link">${s.firstName} ${s.lastName}</a></td>
                <td>${s.email || 'N/A'}</td>
                <td>${s.role}</td>
                <td>${teacherMap.get(s.teacherId) || 'N/A'}</td>
            </tr>
        `).join('');

        userTableBody.innerHTML = rowsHtml;
    }
    
    /**
     * Formats a date string into a readable format.
     * @param {string} dateString - The ISO date string.
     * @returns {string} A formatted date string or 'N/A'.
     */
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }

    /**
     * Populates the student detail modal with data for a given student ID.
     * @param {string} studentId - The ID of the student to display.
     */
    async function populateModal(studentId) {
        const student = students.find(s => s._id === studentId);
        if (!student) return;

        // --- Populate Static & Profile Data ---
        modalStudentId.value = student._id;
        modalStudentName.textContent = `${student.firstName} ${student.lastName}`;
        studentProfileForm.elements.firstName.value = student.firstName || '';
        studentProfileForm.elements.lastName.value = student.lastName || '';
        studentProfileForm.elements.username.value = student.username || '';
        studentProfileForm.elements.email.value = student.email || '';
        studentProfileForm.elements.gradeLevel.value = student.gradeLevel || '';
        studentProfileForm.elements.mathCourse.value = student.mathCourse || '';
        studentProfileForm.elements.tonePreference.value = student.tonePreference || '';
        studentProfileForm.elements.learningStyle.value = student.learningStyle || '';
        studentProfileForm.elements.interests.value = (student.interests || []).join(', ');

        // --- Populate Usage Stats ---
        document.getElementById("totalActiveTutoringMinutes").textContent = student.totalActiveTutoringMinutes || 0;
        document.getElementById("weeklyActiveTutoringMinutes").textContent = student.weeklyActiveTutoringMinutes || 0;
        document.getElementById("xpDisplay").textContent = student.xp || 0;
        document.getElementById("levelDisplay").textContent = student.level || 0;
        document.getElementById("lastLoginDisplay").textContent = formatDate(student.lastLogin);
        document.getElementById("createdAtDisplay").textContent = formatDate(student.createdAt);
        
        // Open the modal immediately for better UX
        openModal();

        // --- Asynchronously Fetch and Populate Dynamic Data (IEP & Conversations) ---
        // Reset dynamic content areas to loading state
        conversationSummariesList.innerHTML = '<li>Loading conversation history...</li>';
        const iepGoalsList = document.getElementById("iepGoalsList");
        if(iepGoalsList) iepGoalsList.innerHTML = 'Loading goals...';


        // Fetch conversations and IEP data in parallel
        try {
            const [convoRes, iepRes] = await Promise.all([
                fetch(`/api/admin/students/${studentId}/conversations`, { credentials: 'include' }),
                fetch(`/api/admin/students/${studentId}/iep`, { credentials: 'include' })
            ]);

            // Process Conversations
            if (convoRes.ok) {
                const conversations = await convoRes.json();
                if (conversations && conversations.length > 0) {
                    conversationSummariesList.innerHTML = conversations
                        .sort((a, b) => new Date(b.date || b.startDate) - new Date(a.date || a.startDate))
                        .map(session => `
                            <li class="conversation-item">
                                <strong>${formatDate(session.date || session.startDate)}:</strong>
                                ${session.summary || 'No summary available.'}
                            </li>
                        `).join('');
                } else {
                    conversationSummariesList.innerHTML = '<li>No conversation history found.</li>';
                }
            } else {
                conversationSummariesList.innerHTML = '<li>Error loading conversation history.</li>';
            }

            // Process IEP Plan
            if (iepRes.ok) {
                const iepPlan = await iepRes.json();
                studentIepForm.elements.extendedTime.checked = !!iepPlan?.accommodations?.extendedTime;
                studentIepForm.elements.simplifiedInstructions.checked = !!iepPlan?.accommodations?.simplifiedInstructions;
                studentIepForm.elements.frequentCheckIns.checked = !!iepPlan?.accommodations?.frequentCheckIns;
                studentIepForm.elements.visualSupport.checked = !!iepPlan?.accommodations?.visualSupport;
                studentIepForm.elements.chunking.checked = !!iepPlan?.accommodations?.chunking;
                studentIepForm.elements.reducedDistraction.checked = !!iepPlan?.accommodations?.reducedDistraction;
                studentIepForm.elements.mathAnxiety.checked = !!iepPlan?.accommodations?.mathAnxiety;
                studentIepForm.elements.readingLevel.value = iepPlan?.readingLevel || '';
                studentIepForm.elements.preferredScaffolds.value = (iepPlan?.preferredScaffolds || []).join(', ');
                if(iepGoalsList) iepGoalsList.textContent = 'IEP Goals feature not yet implemented.'; // Placeholder
            } else {
                 if(iepGoalsList) iepGoalsList.innerHTML = 'Could not load IEP data.';
            }

        } catch (error) {
            console.error("Failed to load dynamic modal data:", error);
            conversationSummariesList.innerHTML = '<li>Error loading data.</li>';
            if(iepGoalsList) iepGoalsList.innerHTML = '<li>Error loading data.</li>';
        }
    }

    // -------------------------------------------------------------------------
    // --- Event Handlers ---
    // -------------------------------------------------------------------------

    // Use event delegation for student name clicks.
    if (userTableBody) {
        userTableBody.addEventListener('click', (e) => {
            // ROBUSTNESS FIX: Check if the closest ancestor is the link, not the exact target.
            const link = e.target.closest('.student-name-link');
            if (link) {
                e.preventDefault();
                const studentId = link.closest('tr')?.dataset.studentid;
                if (studentId) {
                    populateModal(studentId);
                }
            }
        });
    }

    // Handle student search input.
    if (studentSearch) studentSearch.addEventListener("input", renderStudents);

    // Handle teacher assignment.
    if (assignButton) {
        assignButton.addEventListener("click", async () => {
            const selectedIds = Array.from(userTableBody.querySelectorAll(".select-student:checked")).map(cb => cb.value);
            if (selectedIds.length === 0) {
                alert("Please select at least one student.");
                return;
            }
            
            const teacherId = teacherSelect.value;
            if (!teacherId && !confirm("This will unassign the selected students from any teacher. Are you sure?")) {
                return;
            }
            
            try {
                const res = await fetch("/api/admin/assign-teacher", {
                    method: "PATCH",
                    headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                    body: JSON.stringify({ studentIds: selectedIds, teacherId: teacherId || null })
                });
                const result = await res.json();
                if(!res.ok) throw new Error(result.message || "Failed to assign teacher.");
                
                alert(result.message);
                await initializeDashboard(); // Refresh all data
            } catch (error) {
                alert(`Error assigning teacher: ${error.message}`);
            }
        });
    }

    // Handle saving changes from the modal.
    if (saveChangesButton) {
        saveChangesButton.addEventListener("click", async () => {
            const studentId = modalStudentId.value;
            if (!studentId) return;

            // Gather all profile data from the form.
            const profileData = {
                firstName: studentProfileForm.elements.firstName.value,
                lastName: studentProfileForm.elements.lastName.value,
                email: studentProfileForm.elements.email.value,
                gradeLevel: studentProfileForm.elements.gradeLevel.value,
                mathCourse: studentProfileForm.elements.mathCourse.value,
                tonePreference: studentProfileForm.elements.tonePreference.value,
                learningStyle: studentProfileForm.elements.learningStyle.value,
                interests: studentProfileForm.elements.interests.value.split(',').map(s => s.trim()).filter(Boolean)
            };

            // Gather all IEP data from the form.
            const iepData = {
                accommodations: {
                    extendedTime: studentIepForm.elements.extendedTime.checked,
                    simplifiedInstructions: studentIepForm.elements.simplifiedInstructions.checked,
                    frequentCheckIns: studentIepForm.elements.frequentCheckIns.checked,
                    visualSupport: studentIepForm.elements.visualSupport.checked,
                    chunking: studentIepForm.elements.chunking.checked,
                    reducedDistraction: studentIepForm.elements.reducedDistraction.checked,
                    mathAnxiety: studentIepForm.elements.mathAnxiety.checked,
                },
                readingLevel: studentIepForm.elements.readingLevel.value,
                preferredScaffolds: studentIepForm.elements.preferredScaffolds.value.split(',').map(s => s.trim()).filter(Boolean),
                goals: [] // Placeholder for goals feature
            };

            // Disable button to prevent double-clicks
            saveChangesButton.disabled = true;
            saveChangesButton.textContent = 'Saving...';

            try {
                // Send update requests in parallel
                const [profileRes, iepRes] = await Promise.all([
                    fetch(`/api/admin/students/${studentId}/profile`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                        body: JSON.stringify(profileData)
                    }),
                    fetch(`/api/admin/students/${studentId}/iep`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                        body: JSON.stringify(iepData)
                    })
                ]);

                if (!profileRes.ok || !iepRes.ok) {
                    throw new Error('Failed to save one or more sections.');
                }

                alert('Student updated successfully!');
                closeModal();
                await initializeDashboard(); // Refresh all data

            } catch (error) {
                alert(`Could not save changes: ${error.message}`);
            } finally {
                // Re-enable button
                saveChangesButton.disabled = false;
                saveChangesButton.textContent = 'Save Changes';
            }
        });
    }

    // Modal close buttons
    if (closeModalButton) closeModalButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);

    // -------------------------------------------------------------------------
    // --- Initial Load ---
    // -------------------------------------------------------------------------
    initializeDashboard();
});