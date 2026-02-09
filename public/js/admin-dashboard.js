/**
 * M∆THM∆TIΧ AI - Admin Dashboard Script
 *
 * Manages all functionality for the admin dashboard, including fetching
 * and displaying user data, handling teacher assignments, and providing
 * detailed views and edits of student profiles.
 *
 * @version 2.1
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
    let teacherMap = new Map(); // Use a Map for efficient O(1) teacher lookups.

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
            
            students = allUsers.filter(u => u.role === 'student');

            // Create a teacher lookup map for efficient name retrieval.
            teacherMap = new Map(teachers.map(t => [t._id, `${t.firstName} ${t.lastName}`]));

            renderTeacherOptions();
            renderStudents();
            fetchAndDisplayLeaderboard();
            fetchSystemStatus();

        } catch (error) {
            console.error("Error initializing dashboard:", error);
            if(userTableBody) userTableBody.innerHTML = `<tr><td colspan="5" class="text-center">Error loading data. Please refresh.</td></tr>`;
        }
    }
    
    /**
     * Fetches and displays the top students in the leaderboard panel.
     */
    async function fetchAndDisplayLeaderboard() {
        const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
        if (!leaderboardTableBody) return;

        leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
        try {
            const response = await fetch('/api/leaderboard', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load leaderboard');
            
            const topStudents = await response.json();
            leaderboardTableBody.innerHTML = '';
            
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
        const dbStatus = document.getElementById("dbStatus");
        const aiStatus = document.getElementById("aiStatus");
        const lastSyncTime = document.getElementById("lastSyncTime");
        if (!dbStatus || !aiStatus) return;

        try {
            const response = await fetch('/api/admin/health-check', { credentials: 'include' });
            if (!response.ok) throw new Error('Health check failed');
            const data = await response.json();
            dbStatus.textContent = 'Online';
            aiStatus.textContent = data.status || 'Operational';
            lastSyncTime.textContent = new Date().toLocaleTimeString();
        } catch (error) {
            dbStatus.textContent = 'Offline';
            dbStatus.className = 'status-offline'; // Assumes you have a CSS class for this
            aiStatus.textContent = 'Unknown';
        }
    }

    // -------------------------------------------------------------------------
    // --- Rendering Functions ---
    // -------------------------------------------------------------------------

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
            userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No students found.</td></tr>`;
            return;
        }

        const rowsHtml = filteredStudents.map(s => `
            <tr data-studentid="${s._id}">
                <td><input type="checkbox" class="select-student" value="${s._id}"></td>
                <td><a href="#" class="student-name-link">${s.firstName} ${s.lastName}</a></td>
                <td>${s.email || 'N/A'}</td>
                <td>${s.role}</td>
                <td>${teacherMap.get(s.teacherId) || 'N/A'}</td>
                <td>
                    <button class="btn-icon view-as-user-btn" data-userid="${s._id}" data-username="${s.firstName} ${s.lastName}" data-role="${s.role}" title="View as ${s.firstName}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon reset-screener-btn" data-studentid="${s._id}" data-studentname="${s.firstName} ${s.lastName}" title="Reset Screener">
                        <i class="fas fa-redo"></i>
                    </button>
                    <button class="btn-icon btn-danger delete-user-btn" data-userid="${s._id}" data-username="${s.firstName} ${s.lastName}" title="Delete User">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        userTableBody.innerHTML = rowsHtml;
    }
    
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

        // --- Populate Profile & Static Data ---
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
        
        openModal();

        // --- Asynchronously Fetch Dynamic Data ---
        conversationSummariesList.innerHTML = '<li>Loading conversation history...</li>';
        const iepGoalsList = document.getElementById("iepGoalsList");
        if(iepGoalsList) iepGoalsList.innerHTML = 'Loading goals...';

        try {
            const [convoRes, iepRes] = await Promise.all([
                fetch(`/api/admin/students/${studentId}/conversations`, { credentials: 'include' }),
                fetch(`/api/admin/students/${studentId}/iep`, { credentials: 'include' })
            ]);

            if (convoRes.ok) {
                const conversations = await convoRes.json();
                conversationSummariesList.innerHTML = conversations.length > 0
                    ? conversations
                        .sort((a, b) => new Date(b.date || b.startDate) - new Date(a.date || a.startDate))
                        .map(s => `<li><strong>${formatDate(s.date || s.startDate)}:</strong> ${s.summary || ''}</li>`)
                        .join('')
                    : '<li>No conversation history found.</li>';
            } else {
                conversationSummariesList.innerHTML = '<li>Error loading conversation history.</li>';
            }

            if (iepRes.ok) {
                const iepPlan = await iepRes.json();
                const accom = iepPlan?.accommodations || {};

                // Load standard accommodations
                studentIepForm.elements.extendedTime.checked = !!accom.extendedTime;
                studentIepForm.elements.reducedDistraction.checked = !!accom.reducedDistraction;
                studentIepForm.elements.calculatorAllowed.checked = !!accom.calculatorAllowed;
                studentIepForm.elements.audioReadAloud.checked = !!accom.audioReadAloud;
                studentIepForm.elements.chunkedAssignments.checked = !!accom.chunkedAssignments;
                studentIepForm.elements.breaksAsNeeded.checked = !!accom.breaksAsNeeded;
                studentIepForm.elements.digitalMultiplicationChart.checked = !!accom.digitalMultiplicationChart;
                studentIepForm.elements.largePrintHighContrast.checked = !!accom.largePrintHighContrast;
                studentIepForm.elements.mathAnxietySupport.checked = !!accom.mathAnxietySupport;

                // Load custom accommodations
                studentIepForm.elements.customAccommodations.value = (accom.custom || []).join('\n');

                // Load other fields
                studentIepForm.elements.readingLevel.value = iepPlan?.readingLevel || '';
                studentIepForm.elements.preferredScaffolds.value = (iepPlan?.preferredScaffolds || []).join(', ');
                if(iepGoalsList) iepGoalsList.textContent = 'IEP Goals feature not yet implemented.';
            } else {
                 if(iepGoalsList) iepGoalsList.innerHTML = 'Could not load IEP data.';
            }

        } catch (error) {
            console.error("Failed to load dynamic modal data:", error);
            conversationSummariesList.innerHTML = '<li>Error loading data.</li>';
        }
    }

    // -------------------------------------------------------------------------
    // --- Event Handlers ---
    // -------------------------------------------------------------------------

    if (userTableBody) {
        userTableBody.addEventListener('click', async (e) => {
            // Handle student name link click
            const link = e.target.closest('.student-name-link');
            if (link) {
                e.preventDefault();
                const studentId = link.closest('tr')?.dataset.studentid;
                if (studentId) {
                    populateModal(studentId);
                }
                return;
            }

            // Handle reset screener button click
            const resetBtn = e.target.closest('.reset-screener-btn');
            if (resetBtn) {
                e.preventDefault();
                const studentId = resetBtn.dataset.studentid;
                const studentName = resetBtn.dataset.studentname;

                const reason = prompt(
                    `Reset placement assessment for ${studentName}?\n\n` +
                    `This will allow them to retake the screener.\n\n` +
                    `Optional: Enter a reason for this reset (e.g., "summer break", "skill regression"):`
                );

                // User cancelled
                if (reason === null) return;

                try {
                    resetBtn.disabled = true;
                    resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    const response = await csrfFetch(`/api/admin/students/${studentId}/reset-assessment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ reason: reason || 'Admin requested reset' })
                    });

                    const result = await response.json();

                    if (response.ok && result.success) {
                        alert(`✅ ${result.message}\n\nThe student can now retake the placement screener.`);
                        await initializeDashboard(); // Refresh the dashboard
                    } else {
                        throw new Error(result.message || 'Failed to reset assessment');
                    }
                } catch (error) {
                    console.error('Reset assessment error:', error);
                    alert(`❌ Error: ${error.message}`);
                } finally {
                    resetBtn.disabled = false;
                    resetBtn.innerHTML = '<i class="fas fa-redo"></i>';
                }
                return;
            }

            // Handle view-as-user button click
            const viewAsBtn = e.target.closest('.view-as-user-btn');
            if (viewAsBtn) {
                e.preventDefault();
                const userId = viewAsBtn.dataset.userid;
                const username = viewAsBtn.dataset.username;
                const role = viewAsBtn.dataset.role;

                if (!confirm(`View the app as ${username}?\n\nYou'll see exactly what this ${role} sees.\nChanges are disabled in view mode.`)) {
                    return;
                }

                try {
                    viewAsBtn.disabled = true;
                    viewAsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    await window.ImpersonationBanner.start(userId, { readOnly: true });
                    // Redirect happens automatically in the start function
                } catch (error) {
                    console.error('Failed to start user view:', error);
                    alert(`❌ Error: ${error.message || 'Failed to start user view'}`);
                    viewAsBtn.disabled = false;
                    viewAsBtn.innerHTML = '<i class="fas fa-eye"></i>';
                }
                return;
            }

            // Handle delete button click
            const deleteBtn = e.target.closest('.delete-user-btn');
            if (deleteBtn) {
                e.preventDefault();
                const userId = deleteBtn.dataset.userid;
                const username = deleteBtn.dataset.username;

                if (!confirm(`⚠️ Are you sure you want to delete "${username}"?\n\nThis will permanently delete:\n• Their account\n• All conversation history\n• All progress data\n\nThis action CANNOT be undone.`)) {
                    return;
                }

                try {
                    deleteBtn.disabled = true;
                    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    const response = await csrfFetch(`/api/admin/users/${userId}`, {
                        method: 'DELETE',
                        credentials: 'include'
                    });

                    const result = await response.json();

                    if (response.ok && result.success) {
                        alert(`✅ ${result.message}`);
                        await initializeDashboard(); // Refresh the dashboard
                    } else {
                        throw new Error(result.message || 'Failed to delete user');
                    }
                } catch (error) {
                    console.error('Delete error:', error);
                    alert(`❌ Error: ${error.message}`);
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                }
            }
        });
    }

    if (studentSearch) studentSearch.addEventListener("input", renderStudents);

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
                const res = await csrfFetch("/api/admin/assign-teacher", {
                    method: "PATCH",
                    headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                    body: JSON.stringify({ studentIds: selectedIds, teacherId: teacherId || null })
                });
                const result = await res.json();
                if(!res.ok) throw new Error(result.message || "Failed to assign teacher.");
                
                alert(result.message);
                await initializeDashboard(); // Refresh all data
            } catch (error) {
                alert(`Error: ${error.message}`);
            }
        });
    }

    if (saveChangesButton) {
        saveChangesButton.addEventListener("click", async () => {
            const studentId = modalStudentId.value;
            if (!studentId) return;

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

            // Build accommodations object
            const accommodations = {
                extendedTime: studentIepForm.elements.extendedTime.checked,
                reducedDistraction: studentIepForm.elements.reducedDistraction.checked,
                calculatorAllowed: studentIepForm.elements.calculatorAllowed.checked,
                audioReadAloud: studentIepForm.elements.audioReadAloud.checked,
                chunkedAssignments: studentIepForm.elements.chunkedAssignments.checked,
                breaksAsNeeded: studentIepForm.elements.breaksAsNeeded.checked,
                digitalMultiplicationChart: studentIepForm.elements.digitalMultiplicationChart.checked,
                largePrintHighContrast: studentIepForm.elements.largePrintHighContrast.checked,
                mathAnxietySupport: studentIepForm.elements.mathAnxietySupport.checked,
            };

            // Add custom accommodations array
            const customAccomText = studentIepForm.elements.customAccommodations.value.trim();
            if (customAccomText) {
                accommodations.custom = customAccomText.split('\n').map(s => s.trim()).filter(Boolean);
            } else {
                accommodations.custom = [];
            }

            const iepData = {
                accommodations,
                readingLevel: studentIepForm.elements.readingLevel.value,
                preferredScaffolds: studentIepForm.elements.preferredScaffolds.value.split(',').map(s => s.trim()).filter(Boolean),
                goals: []
            };

            saveChangesButton.disabled = true;
            saveChangesButton.textContent = 'Saving...';

            try {
                const [profileRes, iepRes] = await Promise.all([
                    csrfFetch(`/api/admin/students/${studentId}/profile`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                        body: JSON.stringify(profileData)
                    }),
                    csrfFetch(`/api/admin/students/${studentId}/iep`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                        body: JSON.stringify(iepData)
                    })
                ]);

                if (!profileRes.ok || !iepRes.ok) throw new Error('Failed to save one or more sections.');

                alert('Student updated successfully!');
                closeModal();
                await initializeDashboard();

            } catch (error) {
                alert(`Could not save changes: ${error.message}`);
            } finally {
                saveChangesButton.disabled = false;
                saveChangesButton.textContent = 'Save Changes';
            }
        });
    }

    if (closeModalButton) closeModalButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);

    // -------------------------------------------------------------------------
    // --- Reports Functionality ---
    // -------------------------------------------------------------------------

    const usageReportModal = document.getElementById('usageReportModal');
    const liveActivityModal = document.getElementById('liveActivityModal');
    const summariesModal = document.getElementById('summariesModal');
    const openUsageReportBtn = document.getElementById('openUsageReportBtn');
    const openLiveActivityBtn = document.getElementById('openLiveActivityBtn');
    const openSummariesBtn = document.getElementById('openSummariesBtn');
    const closeUsageReportBtn = document.getElementById('closeUsageReportBtn');
    const closeLiveActivityBtn = document.getElementById('closeLiveActivityBtn');
    const closeSummariesBtn = document.getElementById('closeSummariesBtn');
    const applyReportFilters = document.getElementById('applyReportFilters');
    const exportReportCSV = document.getElementById('exportReportCSV');
    const refreshLiveActivityBtn = document.getElementById('refreshLiveActivityBtn');
    const refreshSummariesBtn = document.getElementById('refreshSummariesBtn');
    const applySummariesFilters = document.getElementById('applySummariesFilters');

    let currentReportData = null;
    let currentSummariesData = null;

    // Open/Close Usage Report Modal
    if (openUsageReportBtn) {
        openUsageReportBtn.addEventListener('click', () => {
            usageReportModal?.classList.add('is-visible');
            loadUsageReport();
        });
    }

    if (closeUsageReportBtn) {
        closeUsageReportBtn.addEventListener('click', () => {
            usageReportModal?.classList.remove('is-visible');
        });
    }

    // Open/Close Live Activity Modal
    if (openLiveActivityBtn) {
        openLiveActivityBtn.addEventListener('click', () => {
            liveActivityModal?.classList.add('is-visible');
            loadLiveActivity();
        });
    }

    if (closeLiveActivityBtn) {
        closeLiveActivityBtn.addEventListener('click', () => {
            liveActivityModal?.classList.remove('is-visible');
        });
    }

    // Open/Close Summaries Modal
    if (openSummariesBtn) {
        openSummariesBtn.addEventListener('click', () => {
            summariesModal?.classList.add('is-visible');
            loadSummaries();
        });
    }

    if (closeSummariesBtn) {
        closeSummariesBtn.addEventListener('click', () => {
            summariesModal?.classList.remove('is-visible');
        });
    }

    // Apply Filters
    if (applyReportFilters) {
        applyReportFilters.addEventListener('click', loadUsageReport);
    }

    // Refresh Live Activity
    if (refreshLiveActivityBtn) {
        refreshLiveActivityBtn.addEventListener('click', loadLiveActivity);
    }

    // Refresh Summaries
    if (refreshSummariesBtn) {
        refreshSummariesBtn.addEventListener('click', loadSummaries);
    }

    // Apply Summaries Filters
    if (applySummariesFilters) {
        applySummariesFilters.addEventListener('click', () => {
            if (currentSummariesData) {
                renderSummaries(currentSummariesData.users);
            }
        });
    }

    // Export CSV
    if (exportReportCSV) {
        exportReportCSV.addEventListener('click', exportUsageReportToCSV);
    }

    /**
     * Load Usage Report from API
     */
    async function loadUsageReport() {
        try {
            const role = document.getElementById('reportRoleFilter')?.value || '';
            const sortBy = document.getElementById('reportSortBy')?.value || 'lastLogin';
            const sortOrder = document.getElementById('reportSortOrder')?.value || 'desc';

            const params = new URLSearchParams();
            if (role) params.append('role', role);
            params.append('sortBy', sortBy);
            params.append('sortOrder', sortOrder);

            const response = await fetch(`/api/admin/reports/usage?${params.toString()}`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to load usage report');

            const data = await response.json();
            currentReportData = data;

            // Update summary stats
            document.getElementById('summaryTotalUsers').textContent = data.summary.totalUsers;
            document.getElementById('summaryActiveToday').textContent = data.summary.activeToday;
            document.getElementById('summaryActiveWeek').textContent = data.summary.activeThisWeek;
            document.getElementById('summaryTotalMinutes').textContent = data.summary.totalMinutesAllTime.toLocaleString();
            document.getElementById('summaryWeekMinutes').textContent = data.summary.totalMinutesThisWeek.toLocaleString();
            document.getElementById('summaryAvgMinutes').textContent = data.summary.averageMinutesPerUser;

            // Render user table
            renderUsageReportTable(data.users);

        } catch (error) {
            console.error('Error loading usage report:', error);
            alert('Failed to load usage report');
        }
    }

    /**
     * Render Usage Report Table
     */
    function renderUsageReportTable(users) {
        const tbody = document.getElementById('usageReportTableBody');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const lastLogin = user.lastLogin
                ? new Date(user.lastLogin).toLocaleDateString()
                : 'Never';
            const daysSince = user.daysSinceLastLogin !== null
                ? `(${user.daysSinceLastLogin}d ago)`
                : '';

            return `
                <tr>
                    <td><strong>${user.name}</strong></td>
                    <td><span class="badge badge-${user.role}">${user.role}</span></td>
                    <td>${lastLogin} ${daysSince}</td>
                    <td>${user.totalMinutes}</td>
                    <td>${user.weeklyMinutes}</td>
                    <td>${user.sessionCount}</td>
                    <td>${user.level}</td>
                    <td>${user.xp.toLocaleString()}</td>
                    <td>${user.teacher || '-'}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Export Usage Report to CSV
     */
    function exportUsageReportToCSV() {
        if (!currentReportData || !currentReportData.users) {
            alert('No report data to export');
            return;
        }

        const headers = ['Name', 'Role', 'Email', 'Last Login', 'Total Minutes', 'Weekly Minutes', 'Sessions', 'Level', 'XP', 'Teacher'];
        const rows = currentReportData.users.map(user => [
            user.name,
            user.role,
            user.email,
            user.lastLogin ? new Date(user.lastLogin).toISOString() : 'Never',
            user.totalMinutes,
            user.weeklyMinutes,
            user.sessionCount,
            user.level,
            user.xp,
            user.teacher || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Load Live Activity Feed
     */
    async function loadLiveActivity() {
        const container = document.getElementById('liveActivityContainer');
        if (!container) return;

        container.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

        try {
            const response = await fetch('/api/admin/reports/live-activity', {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to load live activity');

            const data = await response.json();
            renderLiveActivity(data.sessions);

        } catch (error) {
            console.error('Error loading live activity:', error);
            container.innerHTML = '<p style="text-align: center; color: red;">Failed to load live activity</p>';
        }
    }

    /**
     * Render Live Activity Cards
     */
    function renderLiveActivity(sessions) {
        const container = document.getElementById('liveActivityContainer');
        if (!container) return;

        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="no-activity-message">
                    <i class="fas fa-inbox"></i>
                    <p>No active sessions in the last 10 minutes</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sessions.map(session => {
            const accuracy = session.problemsAttempted > 0
                ? Math.round((session.problemsCorrect / session.problemsAttempted) * 100)
                : 0;

            const isStruggling = session.strugglingWith || session.alerts.length > 0;
            const cardClass = isStruggling ? 'activity-card struggling' : 'activity-card';

            return `
                <div class="${cardClass}">
                    <div class="activity-header">
                        <div class="activity-student-name">
                            ${session.studentName}
                            <span class="activity-topic">${session.currentTopic}</span>
                        </div>
                        <div class="activity-time">
                            <i class="fas fa-clock"></i> ${session.minutesAgo}m ago
                        </div>
                    </div>
                    <div class="activity-stats">
                        <div class="activity-stat">
                            <i class="fas fa-hourglass-half"></i> ${session.activeMinutes} min
                        </div>
                        <div class="activity-stat">
                            <i class="fas fa-tasks"></i> ${session.problemsCorrect}/${session.problemsAttempted} correct (${accuracy}%)
                        </div>
                        <div class="activity-stat">
                            <i class="fas fa-trophy"></i> Level ${session.level} (${session.xp.toLocaleString()} XP)
                        </div>
                    </div>
                    ${isStruggling ? `
                        <div class="struggle-alert">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>Struggling with:</strong> ${session.strugglingWith || 'Current concept'}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Load User Summaries from API
     */
    async function loadSummaries() {
        const container = document.getElementById('summariesContainer');
        if (!container) return;

        container.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

        try {
            const response = await fetch('/api/admin/reports/summaries', {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to load summaries');

            const data = await response.json();
            currentSummariesData = data;

            renderSummaries(data.users);

        } catch (error) {
            console.error('Error loading summaries:', error);
            container.innerHTML = '<p style="text-align: center; color: red;">Failed to load summaries</p>';
        }
    }

    /**
     * Render User Summaries
     */
    function renderSummaries(users) {
        const container = document.getElementById('summariesContainer');
        const countDisplay = document.getElementById('summariesCount');
        if (!container) return;

        // Apply filters
        const roleFilter = document.getElementById('summariesRoleFilter')?.value || '';
        const searchQuery = document.getElementById('summariesSearchInput')?.value.toLowerCase().trim() || '';

        let filteredUsers = users;

        if (roleFilter) {
            filteredUsers = filteredUsers.filter(u => u.role === roleFilter);
        }

        if (searchQuery) {
            filteredUsers = filteredUsers.filter(u =>
                u.name.toLowerCase().includes(searchQuery) ||
                u.email.toLowerCase().includes(searchQuery) ||
                u.username.toLowerCase().includes(searchQuery)
            );
        }

        if (countDisplay) {
            countDisplay.textContent = filteredUsers.length;
        }

        if (filteredUsers.length === 0) {
            container.innerHTML = `
                <div class="no-activity-message">
                    <i class="fas fa-inbox"></i>
                    <p>No users found matching your filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredUsers.map(user => {
            const lastLogin = user.lastLogin
                ? new Date(user.lastLogin).toLocaleDateString()
                : 'Never';

            const conversationsHtml = user.recentConversations && user.recentConversations.length > 0
                ? user.recentConversations.map(conv => `
                    <div class="conversation-summary-item">
                        <div class="conversation-date">
                            <i class="fas fa-calendar"></i> ${formatDate(conv.startDate)}
                            <span style="color: #888; margin-left: 10px;">
                                <i class="fas fa-clock"></i> ${conv.activeMinutes || 0} min
                            </span>
                        </div>
                        <div class="conversation-summary-text">${conv.summary || 'No summary available'}</div>
                    </div>
                `).join('')
                : '<p style="color: #888; font-style: italic;">No recent conversation summaries</p>';

            return `
                <div class="user-summary-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                        <div>
                            <h4 style="margin: 0 0 5px 0; color: #333;">
                                <i class="fas fa-user"></i> ${user.name}
                                <span class="badge badge-${user.role}" style="margin-left: 10px; font-size: 0.8em;">${user.role}</span>
                            </h4>
                            <div style="color: #666; font-size: 0.9em;">
                                <i class="fas fa-envelope"></i> ${user.email}
                                ${user.username ? `<span style="margin-left: 15px;"><i class="fas fa-at"></i> ${user.username}</span>` : ''}
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 0.9em; color: #666;">
                            <div><strong>Last Login:</strong> ${lastLogin}</div>
                            ${user.teacher ? `<div><strong>Teacher:</strong> ${user.teacher}</div>` : ''}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                        <div class="stat-item">
                            <i class="fas fa-trophy"></i> <strong>Level:</strong> ${user.level}
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-star"></i> <strong>XP:</strong> ${user.xp.toLocaleString()}
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-clock"></i> <strong>Total Min:</strong> ${user.totalMinutes}
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-calendar-week"></i> <strong>Weekly Min:</strong> ${user.weeklyMinutes}
                        </div>
                    </div>

                    <div style="border-top: 1px solid #eee; padding-top: 15px;">
                        <h5 style="margin: 0 0 10px 0; color: #555;">
                            <i class="fas fa-comments"></i> Recent Conversation Summaries
                        </h5>
                        <div class="conversation-summaries">
                            ${conversationsHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // --- Survey Responses & Analytics ---
    // -------------------------------------------------------------------------

    /**
     * Fetches survey statistics for the preview panel
     */
    async function fetchSurveyStatsPreview() {
        try {
            const response = await fetch('/api/admin/survey-stats', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch survey stats');

            const data = await response.json();
            const stats = data.stats;

            // Update preview panel
            document.getElementById('totalSurveyResponses').textContent = stats.totalResponses || 0;

            // Calculate average rating from full data
            const responsesRes = await fetch('/api/admin/survey-responses?limit=1000', { credentials: 'include' });
            if (responsesRes.ok) {
                const responsesData = await responsesRes.json();
                const avgRating = responsesData.stats?.averageRating || 0;
                document.getElementById('avgRating').textContent = avgRating;
            }

            // Calculate tour completion rate
            const tourCompletionRate = stats.totalUsers > 0
                ? Math.round((stats.tourCompletedCount / stats.totalUsers) * 100)
                : 0;
            document.getElementById('tourCompletionRate').textContent = tourCompletionRate;

        } catch (error) {
            console.error('Error fetching survey stats preview:', error);
        }
    }

    /**
     * Opens the survey responses modal and loads data
     */
    async function openSurveyResponsesModal() {
        const modal = document.getElementById('surveyResponsesModal');
        if (!modal) return;

        modal.classList.add('is-visible');
        await loadSurveyResponses();
    }

    /**
     * Closes the survey responses modal
     */
    function closeSurveyResponsesModal() {
        const modal = document.getElementById('surveyResponsesModal');
        if (modal) modal.classList.remove('is-visible');
    }

    /**
     * Loads and displays survey responses
     */
    async function loadSurveyResponses() {
        try {
            const response = await fetch('/api/admin/survey-responses?limit=100', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch survey responses');

            const data = await response.json();
            const { stats, responses } = data;

            // Update statistics
            document.getElementById('surveyTotalResponses').textContent = stats.totalResponses || 0;
            document.getElementById('surveyTotalUsers').textContent = stats.totalUsers || 0;
            document.getElementById('surveyAvgRating').textContent = `${stats.averageRating || 0} / 5`;
            document.getElementById('surveyAvgHelpfulness').textContent = `${stats.averageHelpfulness || 0} / 5`;
            document.getElementById('surveyAvgWillingness').textContent = `${stats.averageWillingness || 0} / 10`;

            // Get tour stats
            const statsRes = await fetch('/api/admin/survey-stats', { credentials: 'include' });
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                document.getElementById('surveyTourCompleted').textContent =
                    `${statsData.stats.tourCompletedCount || 0} / ${statsData.stats.totalUsers || 0}`;
            }

            // Render rating distribution
            renderRatingDistribution(stats.ratingDistribution);

            // Render experience breakdown
            renderExperienceBreakdown(stats.experienceBreakdown);

            // Render responses table
            renderSurveyResponsesTable(responses);

            // Update count
            document.getElementById('responsesCount').textContent = responses.length;

        } catch (error) {
            console.error('Error loading survey responses:', error);
            document.getElementById('surveyResponsesTableBody').innerHTML =
                '<tr><td colspan="11" style="text-align: center; color: #e74c3c;">Failed to load survey responses</td></tr>';
        }
    }

    /**
     * Renders the rating distribution bar chart
     */
    function renderRatingDistribution(distribution) {
        const container = document.getElementById('ratingDistribution');
        if (!container) return;

        const maxCount = Math.max(...Object.values(distribution), 1);

        container.innerHTML = Object.entries(distribution)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([rating, count]) => {
                const height = (count / maxCount) * 100;
                const color = rating >= 4 ? '#4CAF50' : rating >= 3 ? '#FFC107' : '#f44336';
                return `
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;">
                        <div style="font-size: 0.9em; font-weight: bold; margin-bottom: 5px; color: #333;">${count}</div>
                        <div style="width: 100%; height: ${height}%; background: ${color}; border-radius: 4px 4px 0 0; min-height: ${count > 0 ? '20px' : '0'}; transition: height 0.3s;"></div>
                        <div style="margin-top: 8px; font-size: 0.9em; color: #666;">★${rating}</div>
                    </div>
                `;
            }).join('');
    }

    /**
     * Renders the experience breakdown
     */
    function renderExperienceBreakdown(breakdown) {
        const container = document.getElementById('experienceBreakdown');
        if (!container) return;

        const experienceColors = {
            excellent: '#4CAF50',
            good: '#8BC34A',
            okay: '#FFC107',
            frustrating: '#FF9800',
            confusing: '#f44336'
        };

        const experienceIcons = {
            excellent: 'fa-smile-beam',
            good: 'fa-smile',
            okay: 'fa-meh',
            frustrating: 'fa-frown',
            confusing: 'fa-dizzy'
        };

        if (Object.keys(breakdown).length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999;">No experience data yet</p>';
            return;
        }

        container.innerHTML = Object.entries(breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([experience, count]) => {
                const color = experienceColors[experience] || '#999';
                const icon = experienceIcons[experience] || 'fa-circle';
                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas ${icon}" style="color: ${color}; font-size: 1.2em;"></i>
                            <span style="text-transform: capitalize; font-weight: 500;">${experience}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="background: ${color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.9em; font-weight: bold;">
                                ${count}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    /**
     * Renders the survey responses table
     */
    function renderSurveyResponsesTable(responses) {
        const tbody = document.getElementById('surveyResponsesTableBody');
        if (!tbody) return;

        if (responses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: #999;">No survey responses yet</td></tr>';
            return;
        }

        tbody.innerHTML = responses.map(r => {
            const date = new Date(r.submittedAt).toLocaleString();
            const rating = r.rating ? `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}` : '-';

            return `
                <tr>
                    <td style="white-space: nowrap;">${date}</td>
                    <td>${r.userName || 'Unknown'}<br><small style="color: #666;">${r.userEmail || ''}</small></td>
                    <td style="text-align: center;">${rating}</td>
                    <td>${r.experience || '-'}</td>
                    <td style="text-align: center;">${r.helpfulness || '-'} / 5</td>
                    <td style="text-align: center;">${r.difficulty || '-'} / 5</td>
                    <td style="text-align: center;">${r.willingness !== null && r.willingness !== undefined ? r.willingness + ' / 10' : '-'}</td>
                    <td style="text-align: center;">${r.sessionDuration || '-'}</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${r.feedback || ''}">${r.feedback ? r.feedback.substring(0, 50) + (r.feedback.length > 50 ? '...' : '') : '-'}</td>
                    <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${r.bugs || ''}">${r.bugs ? r.bugs.substring(0, 40) + (r.bugs.length > 40 ? '...' : '') : '-'}</td>
                    <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${r.features || ''}">${r.features ? r.features.substring(0, 40) + (r.features.length > 40 ? '...' : '') : '-'}</td>
                </tr>
            `;
        }).join('');
    }

    // Event Listeners for Survey Modal
    const openSurveyResponsesBtn = document.getElementById('openSurveyResponsesBtn');
    const closeSurveyResponsesBtn = document.getElementById('closeSurveyResponsesBtn');
    const refreshSurveyResponsesBtn = document.getElementById('refreshSurveyResponsesBtn');

    if (openSurveyResponsesBtn) {
        openSurveyResponsesBtn.addEventListener('click', openSurveyResponsesModal);
    }

    if (closeSurveyResponsesBtn) {
        closeSurveyResponsesBtn.addEventListener('click', closeSurveyResponsesModal);
    }

    if (refreshSurveyResponsesBtn) {
        refreshSurveyResponsesBtn.addEventListener('click', loadSurveyResponses);
    }

    // Close modal on outside click
    const surveyModal = document.getElementById('surveyResponsesModal');
    if (surveyModal) {
        surveyModal.addEventListener('click', (e) => {
            if (e.target === surveyModal) {
                closeSurveyResponsesModal();
            }
        });
    }

    // -------------------------------------------------------------------------
    // --- Teacher & Roster Setup Functionality ---
    // -------------------------------------------------------------------------

    // --- Create User Modal (was Create Teacher, now supports all roles) ---
    const createTeacherModal = document.getElementById('createTeacherModal');
    const openTeacherSetupBtn = document.getElementById('openTeacherSetupBtn');
    const closeCreateTeacherBtn = document.getElementById('closeCreateTeacherBtn');
    const cancelCreateTeacher = document.getElementById('cancelCreateTeacher');
    const createTeacherForm = document.getElementById('createTeacherForm');
    const generatePasswordCheck = document.getElementById('generatePasswordCheck');
    const passwordFieldGroup = document.getElementById('passwordFieldGroup');
    const teacherCreatedResult = document.getElementById('teacherCreatedResult');
    const createAnotherTeacher = document.getElementById('createAnotherTeacher');

    // Track the last created user for follow-up actions
    let lastCreatedUserId = null;

    function hideAllFollowUps() {
        document.getElementById('followUpTeacher').style.display = 'none';
        document.getElementById('followUpParent').style.display = 'none';
        document.getElementById('followUpStudent').style.display = 'none';
        document.getElementById('followUpClassResult').style.display = 'none';
        document.getElementById('followUpParentLinkResult').style.display = 'none';
        document.getElementById('followUpStudentLinkResult').style.display = 'none';
    }

    function openCreateTeacherModal() {
        createTeacherModal?.classList.add('is-visible');
        createTeacherForm?.reset();
        teacherCreatedResult.style.display = 'none';
        createTeacherForm.style.display = 'block';
        hideAllFollowUps();
        lastCreatedUserId = null;
    }

    function closeCreateTeacherModal() {
        createTeacherModal?.classList.remove('is-visible');
    }

    if (openTeacherSetupBtn) {
        openTeacherSetupBtn.addEventListener('click', openCreateTeacherModal);
    }

    if (closeCreateTeacherBtn) {
        closeCreateTeacherBtn.addEventListener('click', closeCreateTeacherModal);
    }

    if (cancelCreateTeacher) {
        cancelCreateTeacher.addEventListener('click', closeCreateTeacherModal);
    }

    if (generatePasswordCheck) {
        generatePasswordCheck.addEventListener('change', () => {
            passwordFieldGroup.style.display = generatePasswordCheck.checked ? 'none' : 'block';
        });
    }

    if (createAnotherTeacher) {
        createAnotherTeacher.addEventListener('click', () => {
            teacherCreatedResult.style.display = 'none';
            createTeacherForm.style.display = 'block';
            createTeacherForm.reset();
            hideAllFollowUps();
            lastCreatedUserId = null;
        });
    }

    // Helper to populate follow-up selects with users by role
    async function populateFollowUpSelects() {
        try {
            const response = await fetch('/api/admin/users', { credentials: 'include' });
            if (!response.ok) return;
            const users = await response.json();

            const students = users.filter(u => u.role === 'student');
            const parents = users.filter(u => u.role === 'parent');
            const teachers = users.filter(u => u.role === 'teacher');

            const studentOptions = students.map(s =>
                `<option value="${s._id}">${s.firstName} ${s.lastName} (${s.email})</option>`
            ).join('');
            const parentOptions = parents.map(p =>
                `<option value="${p._id}">${p.firstName} ${p.lastName} (${p.email})</option>`
            ).join('');
            const teacherOptions = teachers.map(t =>
                `<option value="${t._id}">${t.firstName} ${t.lastName} (${t.email})</option>`
            ).join('');

            // Parent follow-up: pick a student
            const followUpParentStudentSelect = document.getElementById('followUpParentStudentSelect');
            if (followUpParentStudentSelect) {
                followUpParentStudentSelect.innerHTML = '<option value="">Select a student...</option>' + studentOptions;
            }

            // Student follow-up: pick a parent and/or teacher
            const followUpStudentParentSelect = document.getElementById('followUpStudentParentSelect');
            if (followUpStudentParentSelect) {
                followUpStudentParentSelect.innerHTML = '<option value="">Select a parent...</option>' + parentOptions;
            }
            const followUpStudentTeacherSelect = document.getElementById('followUpStudentTeacherSelect');
            if (followUpStudentTeacherSelect) {
                followUpStudentTeacherSelect.innerHTML = '<option value="">Select a teacher...</option>' + teacherOptions;
            }

            // Also populate the standalone link-parent modal selects
            const linkParentSelect = document.getElementById('linkParentSelect');
            if (linkParentSelect) {
                linkParentSelect.innerHTML = '<option value="">Select a parent...</option>' + parentOptions;
            }
            const linkStudentSelect = document.getElementById('linkStudentSelect');
            if (linkStudentSelect) {
                linkStudentSelect.innerHTML = '<option value="">Select a student...</option>' + studentOptions;
            }
        } catch (err) {
            console.error('Error populating follow-up selects:', err);
        }
    }

    if (createTeacherForm) {
        createTeacherForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('createTeacherSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            try {
                // Collect selected roles from checkboxes
                const selectedRoles = Array.from(
                    document.querySelectorAll('#teacherRoleCheckboxes input[name="roles"]:checked')
                ).map(cb => cb.value);

                if (selectedRoles.length === 0) {
                    alert('Please select at least one role.');
                    return;
                }

                const sendWelcomeEmailCheck = document.getElementById('sendWelcomeEmailCheck');
                const formData = {
                    firstName: document.getElementById('teacherFirstName').value.trim(),
                    lastName: document.getElementById('teacherLastName').value.trim(),
                    email: document.getElementById('teacherEmail').value.trim(),
                    roles: selectedRoles,
                    username: document.getElementById('teacherUsername').value.trim() || undefined,
                    generatePassword: generatePasswordCheck.checked,
                    password: !generatePasswordCheck.checked ? document.getElementById('teacherPassword').value : undefined,
                    sendEmail: sendWelcomeEmailCheck ? sendWelcomeEmailCheck.checked : false
                };

                const response = await csrfFetch('/api/admin/create-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    lastCreatedUserId = result.user._id;

                    // Show success result
                    document.getElementById('resultTeacherName').textContent = `${result.user.firstName} ${result.user.lastName}`;
                    document.getElementById('resultTeacherEmail').textContent = result.user.email;
                    document.getElementById('resultTeacherUsername').textContent = result.user.username;
                    const rolesLabel = (result.user.roles || [selectedRoles[0]]).map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');
                    document.getElementById('resultTeacherRole').textContent = rolesLabel;

                    if (result.temporaryPassword) {
                        document.getElementById('resultTeacherPassword').textContent = result.temporaryPassword;
                        document.getElementById('resultPasswordRow').style.display = 'block';
                    } else {
                        document.getElementById('resultPasswordRow').style.display = 'none';
                    }

                    // Show email status
                    const emailStatusEl = document.getElementById('resultEmailStatus');
                    const shareWarningEl = document.getElementById('resultShareWarning');
                    if (result.emailSent) {
                        emailStatusEl.innerHTML = '<i class="fas fa-envelope" style="color: #155724;"></i> <span style="color: #155724;">Welcome email sent to ' + result.user.email + '</span>';
                        emailStatusEl.style.display = 'block';
                        shareWarningEl.style.display = 'none';
                    } else if (formData.sendEmail && !result.emailSent) {
                        emailStatusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color: #856404;"></i> <span style="color: #856404;">Welcome email failed to send. Share credentials manually.</span>';
                        emailStatusEl.style.display = 'block';
                        shareWarningEl.style.display = 'block';
                    } else {
                        emailStatusEl.style.display = 'none';
                        shareWarningEl.style.display = 'block';
                    }

                    // Show role-specific follow-ups (multiple can show for multi-role users)
                    hideAllFollowUps();
                    let needsUserSelects = false;
                    if (selectedRoles.includes('teacher')) {
                        document.getElementById('followUpTeacher').style.display = 'block';
                    }
                    if (selectedRoles.includes('parent')) {
                        needsUserSelects = true;
                        document.getElementById('followUpParent').style.display = 'block';
                    }
                    if (selectedRoles.includes('student')) {
                        needsUserSelects = true;
                        document.getElementById('followUpStudent').style.display = 'block';
                    }
                    if (needsUserSelects) {
                        await populateFollowUpSelects();
                    }

                    createTeacherForm.style.display = 'none';
                    teacherCreatedResult.style.display = 'block';

                    // Refresh dashboard
                    await initializeDashboard();
                } else {
                    throw new Error(result.message || 'Failed to create user');
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create User';
            }
        });
    }

    // --- Follow-up: Create class for new teacher ---
    const followUpCreateClassBtn = document.getElementById('followUpCreateClassBtn');
    if (followUpCreateClassBtn) {
        followUpCreateClassBtn.addEventListener('click', async () => {
            if (!lastCreatedUserId) return;
            const className = document.getElementById('followUpClassName').value.trim();
            if (!className) {
                alert('Please enter a class name.');
                return;
            }

            followUpCreateClassBtn.disabled = true;
            followUpCreateClassBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            try {
                const response = await csrfFetch('/api/admin/enrollment-codes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        teacherId: lastCreatedUserId,
                        className,
                        gradeLevel: document.getElementById('followUpGradeLevel').value.trim() || undefined,
                        mathCourse: document.getElementById('followUpMathCourse').value.trim() || undefined
                    })
                });
                const result = await response.json();
                const resultEl = document.getElementById('followUpClassResult');
                if (response.ok && result.success) {
                    resultEl.innerHTML = `<i class="fas fa-check-circle"></i> Class code created: <strong>${result.enrollmentCode.code}</strong>`;
                    resultEl.style.display = 'block';
                } else {
                    throw new Error(result.message || 'Failed to create class code');
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                followUpCreateClassBtn.disabled = false;
                followUpCreateClassBtn.innerHTML = '<i class="fas fa-key"></i> Create Class Code';
            }
        });
    }

    // --- Follow-up: Link child to new parent ---
    const followUpLinkChildBtn = document.getElementById('followUpLinkChildBtn');
    if (followUpLinkChildBtn) {
        followUpLinkChildBtn.addEventListener('click', async () => {
            if (!lastCreatedUserId) return;
            const studentId = document.getElementById('followUpParentStudentSelect').value;
            if (!studentId) {
                alert('Please select a student.');
                return;
            }

            followUpLinkChildBtn.disabled = true;
            followUpLinkChildBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';

            try {
                const response = await csrfFetch('/api/admin/link-parent-student', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ parentId: lastCreatedUserId, studentId })
                });
                const result = await response.json();
                const resultEl = document.getElementById('followUpParentLinkResult');
                if (response.ok && result.success) {
                    resultEl.innerHTML = `<i class="fas fa-check-circle"></i> ${result.message}`;
                    resultEl.style.display = 'block';
                } else {
                    throw new Error(result.message || 'Failed to link parent to student');
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                followUpLinkChildBtn.disabled = false;
                followUpLinkChildBtn.innerHTML = '<i class="fas fa-link"></i> Link Student';
            }
        });
    }

    // --- Follow-up: Link parent and/or teacher to new student ---
    const followUpLinkStudentBtn = document.getElementById('followUpLinkStudentBtn');
    if (followUpLinkStudentBtn) {
        followUpLinkStudentBtn.addEventListener('click', async () => {
            if (!lastCreatedUserId) return;
            const parentId = document.getElementById('followUpStudentParentSelect').value;
            const teacherId = document.getElementById('followUpStudentTeacherSelect').value;

            if (!parentId && !teacherId) {
                alert('Please select at least a parent or a teacher.');
                return;
            }

            followUpLinkStudentBtn.disabled = true;
            followUpLinkStudentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';

            const resultEl = document.getElementById('followUpStudentLinkResult');
            const messages = [];

            try {
                if (parentId) {
                    const response = await csrfFetch('/api/admin/link-parent-student', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ parentId, studentId: lastCreatedUserId })
                    });
                    const result = await response.json();
                    if (response.ok && result.success) {
                        messages.push(result.message);
                    } else {
                        messages.push(`Parent link: ${result.message}`);
                    }
                }

                if (teacherId) {
                    const response = await csrfFetch('/api/admin/assign-teacher', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ teacherId, studentId: lastCreatedUserId })
                    });
                    const result = await response.json();
                    if (response.ok && result.success) {
                        messages.push(result.message);
                    } else {
                        messages.push(`Teacher assign: ${result.message}`);
                    }
                }

                resultEl.innerHTML = messages.map(m => `<i class="fas fa-check-circle"></i> ${m}`).join('<br>');
                resultEl.style.display = 'block';
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                followUpLinkStudentBtn.disabled = false;
                followUpLinkStudentBtn.innerHTML = '<i class="fas fa-link"></i> Link Selected';
            }
        });
    }

    // --- Link Parent to Student Modal (standalone) ---
    const linkParentModal = document.getElementById('linkParentModal');
    const openLinkParentBtn = document.getElementById('openLinkParentBtn');
    const closeLinkParentBtn = document.getElementById('closeLinkParentBtn');
    const cancelLinkParent = document.getElementById('cancelLinkParent');
    const linkParentForm = document.getElementById('linkParentForm');
    const linkParentResult = document.getElementById('linkParentResult');
    const linkAnotherParent = document.getElementById('linkAnotherParent');

    async function openLinkParentModal() {
        linkParentModal?.classList.add('is-visible');
        linkParentForm?.reset();
        linkParentResult.style.display = 'none';
        linkParentForm.style.display = 'block';
        await populateFollowUpSelects();
    }

    function closeLinkParentModal() {
        linkParentModal?.classList.remove('is-visible');
    }

    if (openLinkParentBtn) {
        openLinkParentBtn.addEventListener('click', openLinkParentModal);
    }
    if (closeLinkParentBtn) {
        closeLinkParentBtn.addEventListener('click', closeLinkParentModal);
    }
    if (cancelLinkParent) {
        cancelLinkParent.addEventListener('click', closeLinkParentModal);
    }
    if (linkAnotherParent) {
        linkAnotherParent.addEventListener('click', () => {
            linkParentResult.style.display = 'none';
            linkParentForm.style.display = 'block';
            linkParentForm.reset();
        });
    }

    if (linkParentForm) {
        linkParentForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('linkParentSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';

            try {
                const parentId = document.getElementById('linkParentSelect').value;
                const studentId = document.getElementById('linkStudentSelect').value;

                const response = await csrfFetch('/api/admin/link-parent-student', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ parentId, studentId })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    document.getElementById('resultLinkMessage').textContent = result.message;
                    linkParentForm.style.display = 'none';
                    linkParentResult.style.display = 'block';
                    await initializeDashboard();
                } else {
                    throw new Error(result.message || 'Failed to link parent to student');
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-link"></i> Link Parent & Student';
            }
        });
    }

    // --- Create Enrollment Code Modal ---
    const createEnrollmentCodeModal = document.getElementById('createEnrollmentCodeModal');
    const openEnrollmentCodeBtn = document.getElementById('openEnrollmentCodeBtn');
    const closeEnrollmentCodeBtn = document.getElementById('closeEnrollmentCodeBtn');
    const cancelCreateCode = document.getElementById('cancelCreateCode');
    const createEnrollmentCodeForm = document.getElementById('createEnrollmentCodeForm');
    const codeTeacherSelect = document.getElementById('codeTeacherSelect');
    const codeCreatedResult = document.getElementById('codeCreatedResult');
    const createAnotherCode = document.getElementById('createAnotherCode');

    async function populateTeacherSelects() {
        try {
            const response = await fetch('/api/admin/teachers', { credentials: 'include' });
            if (!response.ok) return;

            const teachers = await response.json();
            const teacherOptions = teachers.map(t =>
                `<option value="${t._id}">${t.firstName} ${t.lastName}</option>`
            ).join('');

            // Populate all teacher selects
            if (codeTeacherSelect) {
                codeTeacherSelect.innerHTML = '<option value="">Select a teacher...</option>' + teacherOptions;
            }
            const rosterTeacherSelect = document.getElementById('rosterTeacherSelect');
            if (rosterTeacherSelect) {
                rosterTeacherSelect.innerHTML = '<option value="">No teacher assignment</option>' + teacherOptions;
            }
        } catch (error) {
            console.error('Error loading teachers for selects:', error);
        }
    }

    async function populateEnrollmentCodeSelect() {
        try {
            const response = await fetch('/api/admin/enrollment-codes', { credentials: 'include' });
            if (!response.ok) return;

            const codes = await response.json();
            const codeOptions = codes.map(c =>
                `<option value="${c._id}">${c.code} - ${c.className} (${c.teacherId?.firstName || 'Unknown'})</option>`
            ).join('');

            const rosterEnrollmentCodeSelect = document.getElementById('rosterEnrollmentCodeSelect');
            if (rosterEnrollmentCodeSelect) {
                rosterEnrollmentCodeSelect.innerHTML = '<option value="">No enrollment code</option>' + codeOptions;
            }
        } catch (error) {
            console.error('Error loading enrollment codes:', error);
        }
    }

    function openCreateEnrollmentCodeModal() {
        createEnrollmentCodeModal?.classList.add('is-visible');
        createEnrollmentCodeForm?.reset();
        codeCreatedResult.style.display = 'none';
        createEnrollmentCodeForm.style.display = 'block';
        populateTeacherSelects();
    }

    function closeCreateEnrollmentCodeModal() {
        createEnrollmentCodeModal?.classList.remove('is-visible');
    }

    if (openEnrollmentCodeBtn) {
        openEnrollmentCodeBtn.addEventListener('click', openCreateEnrollmentCodeModal);
    }

    if (closeEnrollmentCodeBtn) {
        closeEnrollmentCodeBtn.addEventListener('click', closeCreateEnrollmentCodeModal);
    }

    if (cancelCreateCode) {
        cancelCreateCode.addEventListener('click', closeCreateEnrollmentCodeModal);
    }

    if (createAnotherCode) {
        createAnotherCode.addEventListener('click', () => {
            codeCreatedResult.style.display = 'none';
            createEnrollmentCodeForm.style.display = 'block';
            createEnrollmentCodeForm.reset();
        });
    }

    if (createEnrollmentCodeForm) {
        createEnrollmentCodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('createEnrollmentCodeSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            try {
                const formData = {
                    teacherId: document.getElementById('codeTeacherSelect').value,
                    className: document.getElementById('codeClassName').value.trim(),
                    gradeLevel: document.getElementById('codeGradeLevel').value.trim() || undefined,
                    mathCourse: document.getElementById('codeMathCourse').value.trim() || undefined,
                    customCode: document.getElementById('customCode').value.trim() || undefined,
                    maxUses: document.getElementById('codeMaxUses').value || undefined,
                    expiresAt: document.getElementById('codeExpires').value || undefined
                };

                const response = await csrfFetch('/api/admin/enrollment-codes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    document.getElementById('resultEnrollmentCode').textContent = result.enrollmentCode.code;
                    document.getElementById('resultCodeClassName').textContent = result.enrollmentCode.className;
                    document.getElementById('resultCodeTeacher').textContent = result.enrollmentCode.teacherName;

                    createEnrollmentCodeForm.style.display = 'none';
                    codeCreatedResult.style.display = 'block';
                } else {
                    throw new Error(result.message || 'Failed to create enrollment code');
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-key"></i> Create Code';
            }
        });
    }

    // --- Roster Import Modal ---
    const rosterImportModal = document.getElementById('rosterImportModal');
    const openRosterImportBtn = document.getElementById('openRosterImportBtn');
    const closeRosterImportBtn = document.getElementById('closeRosterImportBtn');
    const cancelRosterImport = document.getElementById('cancelRosterImport');
    const rosterImportForm = document.getElementById('rosterImportForm');
    const validateRosterBtn = document.getElementById('validateRosterBtn');
    const rosterImportResults = document.getElementById('rosterImportResults');
    const importAnotherRoster = document.getElementById('importAnotherRoster');
    const downloadSampleCSV = document.getElementById('downloadSampleCSV');
    const exportCredentialsBtn = document.getElementById('exportCredentialsBtn');

    let lastImportedStudents = [];

    function openRosterImportModal() {
        rosterImportModal?.classList.add('is-visible');
        rosterImportForm?.reset();
        rosterImportResults.style.display = 'none';
        document.querySelectorAll('#rosterImportModal .modal-section').forEach(s => {
            if (!s.closest('#rosterImportResults')) s.style.display = 'block';
        });
        populateTeacherSelects();
        populateEnrollmentCodeSelect();
    }

    function closeRosterImportModal() {
        rosterImportModal?.classList.remove('is-visible');
    }

    if (openRosterImportBtn) {
        openRosterImportBtn.addEventListener('click', openRosterImportModal);
    }

    if (closeRosterImportBtn) {
        closeRosterImportBtn.addEventListener('click', closeRosterImportModal);
    }

    if (cancelRosterImport) {
        cancelRosterImport.addEventListener('click', closeRosterImportModal);
    }

    if (importAnotherRoster) {
        importAnotherRoster.addEventListener('click', () => {
            rosterImportResults.style.display = 'none';
            document.querySelectorAll('#rosterImportModal .modal-section').forEach(s => {
                if (!s.closest('#rosterImportResults')) s.style.display = 'block';
            });
            rosterImportForm.reset();
        });
    }

    if (downloadSampleCSV) {
        downloadSampleCSV.addEventListener('click', (e) => {
            e.preventDefault();
            const csvContent = 'firstName,lastName,email,gradeLevel,mathCourse\nJohn,Smith,john.smith@school.org,7th Grade,Pre-Algebra\nJane,Doe,jane.doe@school.org,7th Grade,Pre-Algebra\n';
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'student-roster-template.csv';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (exportCredentialsBtn) {
        exportCredentialsBtn.addEventListener('click', () => {
            if (lastImportedStudents.length === 0) {
                alert('No students to export');
                return;
            }

            const csvContent = 'firstName,lastName,email,username,temporaryPassword\n' +
                lastImportedStudents.map(s =>
                    `${s.firstName},${s.lastName},${s.email},${s.username},${s.temporaryPassword}`
                ).join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `student-credentials-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    async function performRosterImport(dryRun = false) {
        const fileInput = document.getElementById('rosterFile');
        const teacherId = document.getElementById('rosterTeacherSelect')?.value || '';
        const enrollmentCodeId = document.getElementById('rosterEnrollmentCodeSelect')?.value || '';

        if (!fileInput.files[0]) {
            alert('Please select a CSV file');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        let url = `/api/admin/roster-import?dryRun=${dryRun}`;
        if (teacherId) url += `&teacherId=${teacherId}`;
        if (enrollmentCodeId) url += `&enrollmentCodeId=${enrollmentCodeId}`;

        const submitBtn = dryRun ? validateRosterBtn : document.getElementById('importRosterBtn');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Import failed');
            }

            displayImportResults(result, dryRun);

        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    function displayImportResults(result, dryRun) {
        // Hide input sections, show results
        document.querySelectorAll('#rosterImportModal .modal-section').forEach(s => {
            if (!s.closest('#rosterImportResults')) s.style.display = 'none';
        });
        rosterImportResults.style.display = 'block';

        // Update stats
        document.getElementById('resultTotalRows').textContent = result.summary?.totalRows || result.summary?.totalStudents || 0;
        document.getElementById('resultCreated').textContent = dryRun ? result.summary?.validStudents || 0 : result.summary?.created || 0;
        document.getElementById('resultSkipped').textContent = result.summary?.skippedStudents || result.skippedStudents?.length || 0;
        document.getElementById('resultErrors').textContent = result.summary?.errors || result.errors?.length || 0;

        // Created students table
        const createdList = document.getElementById('createdStudentsList');
        const createdTbody = document.getElementById('createdStudentsTableBody');
        const studentsToShow = dryRun ? result.newStudents : result.createdStudents;

        if (studentsToShow && studentsToShow.length > 0) {
            createdList.style.display = 'block';
            lastImportedStudents = studentsToShow;
            createdTbody.innerHTML = studentsToShow.map(s => `
                <tr>
                    <td>${s.firstName} ${s.lastName}</td>
                    <td>${s.email}</td>
                    <td>${s.username}</td>
                    <td><code style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${s.temporaryPassword || (dryRun ? 'N/A (dry run)' : 'N/A')}</code></td>
                </tr>
            `).join('');

            // Hide export button for dry runs
            exportCredentialsBtn.style.display = dryRun ? 'none' : 'inline-block';
        } else {
            createdList.style.display = 'none';
        }

        // Skipped students table
        const skippedList = document.getElementById('skippedStudentsList');
        const skippedTbody = document.getElementById('skippedStudentsTableBody');

        if (result.skippedStudents && result.skippedStudents.length > 0) {
            skippedList.style.display = 'block';
            skippedTbody.innerHTML = result.skippedStudents.map(s => `
                <tr>
                    <td>${s.firstName} ${s.lastName}</td>
                    <td>${s.email}</td>
                    <td>${s.reason}</td>
                </tr>
            `).join('');
        } else {
            skippedList.style.display = 'none';
        }

        // Errors table
        const errorsList = document.getElementById('importErrorsList');
        const errorsTbody = document.getElementById('importErrorsTableBody');

        if (result.errors && result.errors.length > 0) {
            errorsList.style.display = 'block';
            errorsTbody.innerHTML = result.errors.map(e => `
                <tr>
                    <td>${e.row || '-'}</td>
                    <td>${e.field || '-'}</td>
                    <td>${e.message || e.error || 'Unknown error'}</td>
                </tr>
            `).join('');
        } else {
            errorsList.style.display = 'none';
        }

        // Refresh dashboard if not dry run
        if (!dryRun && result.createdStudents?.length > 0) {
            initializeDashboard();
        }
    }

    if (validateRosterBtn) {
        validateRosterBtn.addEventListener('click', () => performRosterImport(true));
    }

    if (rosterImportForm) {
        rosterImportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            performRosterImport(false);
        });
    }

    // -------------------------------------------------------------------------
    // --- Initial Load ---
    // -------------------------------------------------------------------------
    initializeDashboard();
    fetchSurveyStatsPreview(); // Load survey stats preview

    // =========================================================================
    // ADMIN UX ENHANCEMENTS (3x Better UX)
    // =========================================================================

    // -------------------------------------------------------------------------
    // --- AUDIT TRAIL (FERPA Compliance) ---
    // -------------------------------------------------------------------------

    const auditLog = [];

    function logAdminAction(action, details, targetUserId = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            details,
            targetUserId,
            adminSession: window.location.href
        };
        auditLog.push(entry);

        // Also send to server for persistent logging
        fetch('/api/admin/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(entry)
        }).catch(err => console.log('[Audit] Failed to send audit log:', err.message));

        // Update UI if audit panel exists
        updateAuditTrailUI();
    }

    function updateAuditTrailUI() {
        const auditPanel = document.getElementById('audit-trail-panel');
        if (!auditPanel) return;

        const recentEntries = auditLog.slice(-10).reverse();
        auditPanel.innerHTML = recentEntries.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return `
                <div class="audit-entry" style="padding: 8px; border-bottom: 1px solid #eee; font-size: 0.85em;">
                    <span style="color: #888;">${time}</span>
                    <strong style="color: #333; margin-left: 8px;">${entry.action}</strong>
                    <span style="color: #666; margin-left: 8px;">${entry.details}</span>
                </div>
            `;
        }).join('') || '<p style="color: #888; padding: 10px;">No recent actions</p>';
    }

    // Wrap existing admin actions with audit logging
    const originalInitializeDashboard = initializeDashboard;
    initializeDashboard = async function() {
        await originalInitializeDashboard();
        logAdminAction('DASHBOARD_LOADED', `Loaded ${students.length} students`);
    };

    // -------------------------------------------------------------------------
    // --- REAL-TIME POLLING ---
    // -------------------------------------------------------------------------

    let adminPollingInterval = null;
    let lastStudentCount = 0;
    let lastActiveSessionCount = 0;

    function startAdminPolling() {
        adminPollingInterval = setInterval(async () => {
            try {
                // Quick health check
                const healthRes = await fetch('/api/admin/health-check', { credentials: 'include' });
                if (healthRes.ok) {
                    const health = await healthRes.json();
                    const dbStatus = document.getElementById("dbStatus");
                    const aiStatus = document.getElementById("aiStatus");
                    const lastSyncTime = document.getElementById("lastSyncTime");

                    if (dbStatus) dbStatus.textContent = 'Online';
                    if (aiStatus) aiStatus.textContent = health.status || 'Operational';
                    if (lastSyncTime) lastSyncTime.textContent = new Date().toLocaleTimeString();
                }

                // Check for live activity changes
                const liveRes = await fetch('/api/admin/reports/live-activity', { credentials: 'include' });
                if (liveRes.ok) {
                    const liveData = await liveRes.json();
                    const currentActiveCount = liveData.sessions?.length || 0;

                    // Notify if more students are active
                    if (currentActiveCount > lastActiveSessionCount && lastActiveSessionCount > 0) {
                        showAdminNotification(
                            `${currentActiveCount - lastActiveSessionCount} new active session${currentActiveCount - lastActiveSessionCount > 1 ? 's' : ''}`,
                            'info'
                        );
                    }
                    lastActiveSessionCount = currentActiveCount;

                    // Update live activity badge
                    const liveCount = document.getElementById('liveActivityCount');
                    if (liveCount) {
                        liveCount.textContent = currentActiveCount;
                        liveCount.style.display = currentActiveCount > 0 ? 'inline-block' : 'none';
                    }
                }
            } catch (error) {
                console.log('[Admin Polling] Error:', error.message);
            }
        }, 45000); // Poll every 45 seconds
    }

    function stopAdminPolling() {
        if (adminPollingInterval) {
            clearInterval(adminPollingInterval);
            adminPollingInterval = null;
        }
    }

    function showAdminNotification(message, type = 'info') {
        let notification = document.getElementById('admin-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'admin-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 16px 24px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 10000;
                animation: slideIn 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            `;
            document.body.appendChild(notification);
        }

        const colors = {
            info: '#3498db',
            success: '#27ae60',
            warning: '#f39c12',
            error: '#e74c3c'
        };

        notification.style.background = colors[type] || colors.info;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; font-size: 1.2em; cursor: pointer; margin-left: 10px;">&times;</button>
        `;

        setTimeout(() => {
            if (notification && notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    // Start polling
    startAdminPolling();

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAdminPolling();
        } else {
            startAdminPolling();
        }
    });

    window.addEventListener('beforeunload', stopAdminPolling);

    // -------------------------------------------------------------------------
    // --- ENHANCED BULK OPERATIONS ---
    // -------------------------------------------------------------------------

    let selectedUserIds = new Set();

    function updateBulkSelectionUI() {
        const count = selectedUserIds.size;
        let bulkBar = document.getElementById('admin-bulk-bar');

        if (!bulkBar) {
            bulkBar = document.createElement('div');
            bulkBar.id = 'admin-bulk-bar';
            bulkBar.style.cssText = `
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: #2c3e50;
                color: white;
                padding: 15px 30px;
                display: none;
                justify-content: center;
                align-items: center;
                gap: 20px;
                z-index: 9999;
                box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
            `;
            document.body.appendChild(bulkBar);
        }

        if (count > 0) {
            bulkBar.innerHTML = `
                <span style="font-weight: 600;">${count} user${count > 1 ? 's' : ''} selected</span>
                <button onclick="bulkAssignTeacher()" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-chalkboard-teacher"></i> Assign Teacher
                </button>
                <button onclick="bulkExportUsers()" style="background: #27ae60; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-download"></i> Export
                </button>
                <button onclick="bulkResetScreeners()" style="background: #f39c12; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Reset Screeners
                </button>
                <button onclick="clearBulkSelection()" style="background: transparent; color: #ccc; border: 1px solid #666; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-times"></i> Clear
                </button>
            `;
            bulkBar.style.display = 'flex';
        } else {
            bulkBar.style.display = 'none';
        }
    }

    window.clearBulkSelection = function() {
        selectedUserIds.clear();
        document.querySelectorAll('.select-student:checked').forEach(cb => cb.checked = false);
        updateBulkSelectionUI();
    };

    window.bulkAssignTeacher = async function() {
        const teacherId = prompt('Enter teacher ID or leave blank to unassign:');
        if (teacherId === null) return; // Cancelled

        const ids = Array.from(selectedUserIds);
        try {
            const res = await csrfFetch("/api/admin/assign-teacher", {
                method: "PATCH",
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ studentIds: ids, teacherId: teacherId || null })
            });
            const result = await res.json();
            if (res.ok) {
                logAdminAction('BULK_ASSIGN_TEACHER', `Assigned ${ids.length} students to teacher ${teacherId || 'none'}`, ids.join(','));
                showAdminNotification(`Assigned ${ids.length} students`, 'success');
                clearBulkSelection();
                await initializeDashboard();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            showAdminNotification(`Error: ${error.message}`, 'error');
        }
    };

    window.bulkExportUsers = function() {
        const selected = students.filter(s => selectedUserIds.has(s._id));
        if (selected.length === 0) return;

        logAdminAction('BULK_EXPORT', `Exported ${selected.length} users`);

        const headers = ['Name', 'Email', 'Username', 'Grade', 'Teacher', 'Level', 'XP'];
        const rows = selected.map(s => [
            `${s.firstName} ${s.lastName}`,
            s.email || '',
            s.username || '',
            s.gradeLevel || '',
            teacherMap.get(s.teacherId) || '',
            s.level || 1,
            s.xp || 0
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bulk-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showAdminNotification(`Exported ${selected.length} users`, 'success');
        clearBulkSelection();
    };

    window.bulkResetScreeners = async function() {
        const count = selectedUserIds.size;
        if (!confirm(`Reset placement screeners for ${count} selected users?`)) return;

        const ids = Array.from(selectedUserIds);
        let successCount = 0;

        for (const studentId of ids) {
            try {
                const response = await csrfFetch(`/api/admin/students/${studentId}/reset-assessment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ reason: 'Bulk reset by admin' })
                });
                if (response.ok) successCount++;
            } catch (error) {
                console.error(`Failed to reset ${studentId}:`, error);
            }
        }

        logAdminAction('BULK_RESET_SCREENERS', `Reset ${successCount}/${count} screeners`);
        showAdminNotification(`Reset ${successCount}/${count} screeners`, successCount === count ? 'success' : 'warning');
        clearBulkSelection();
        await initializeDashboard();
    };

    // Listen for checkbox changes
    if (userTableBody) {
        userTableBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('select-student')) {
                const studentId = e.target.value;
                if (e.target.checked) {
                    selectedUserIds.add(studentId);
                } else {
                    selectedUserIds.delete(studentId);
                }
                updateBulkSelectionUI();
            }
        });
    }

    // Select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllStudents');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const checkboxes = document.querySelectorAll('.select-student');
            checkboxes.forEach(cb => {
                cb.checked = selectAllCheckbox.checked;
                if (selectAllCheckbox.checked) {
                    selectedUserIds.add(cb.value);
                } else {
                    selectedUserIds.delete(cb.value);
                }
            });
            updateBulkSelectionUI();
        });
    }

    // -------------------------------------------------------------------------
    // --- KEYBOARD SHORTCUTS ---
    // -------------------------------------------------------------------------

    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (studentSearch) studentSearch.focus();
        }

        // Escape: Close modals and clear selection
        if (e.key === 'Escape') {
            closeModal();
            closeSurveyResponsesModal();
            if (usageReportModal) usageReportModal.classList.remove('is-visible');
            if (liveActivityModal) liveActivityModal.classList.remove('is-visible');
            if (summariesModal) summariesModal.classList.remove('is-visible');
            clearBulkSelection();
        }

        // Ctrl/Cmd + R: Refresh dashboard
        if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !e.shiftKey) {
            e.preventDefault();
            showAdminNotification('Refreshing dashboard...', 'info');
            initializeDashboard();
        }
    });

    // Add slideIn animation for notifications
    const adminStyleEl = document.createElement('style');
    adminStyleEl.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(adminStyleEl);

    console.log('[Admin Dashboard] 3x UX enhancements loaded: Audit Trail, Real-time Polling, Bulk Operations');
});