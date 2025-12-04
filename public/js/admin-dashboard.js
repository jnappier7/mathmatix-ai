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
                studentIepForm.elements.extendedTime.checked = !!iepPlan?.accommodations?.extendedTime;
                studentIepForm.elements.simplifiedInstructions.checked = !!iepPlan?.accommodations?.simplifiedInstructions;
                studentIepForm.elements.frequentCheckIns.checked = !!iepPlan?.accommodations?.frequentCheckIns;
                studentIepForm.elements.visualSupport.checked = !!iepPlan?.accommodations?.visualSupport;
                studentIepForm.elements.chunking.checked = !!iepPlan?.accommodations?.chunking;
                studentIepForm.elements.reducedDistraction.checked = !!iepPlan?.accommodations?.reducedDistraction;
                studentIepForm.elements.mathAnxiety.checked = !!iepPlan?.accommodations?.mathAnxiety;
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
        userTableBody.addEventListener('click', (e) => {
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
                goals: []
            };

            saveChangesButton.disabled = true;
            saveChangesButton.textContent = 'Saving...';

            try {
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
    const openUsageReportBtn = document.getElementById('openUsageReportBtn');
    const openLiveActivityBtn = document.getElementById('openLiveActivityBtn');
    const closeUsageReportBtn = document.getElementById('closeUsageReportBtn');
    const closeLiveActivityBtn = document.getElementById('closeLiveActivityBtn');
    const applyReportFilters = document.getElementById('applyReportFilters');
    const exportReportCSV = document.getElementById('exportReportCSV');
    const refreshLiveActivityBtn = document.getElementById('refreshLiveActivityBtn');

    let currentReportData = null;

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

    // Apply Filters
    if (applyReportFilters) {
        applyReportFilters.addEventListener('click', loadUsageReport);
    }

    // Refresh Live Activity
    if (refreshLiveActivityBtn) {
        refreshLiveActivityBtn.addEventListener('click', loadLiveActivity);
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

    // -------------------------------------------------------------------------
    // --- Initial Load ---
    // -------------------------------------------------------------------------
    initializeDashboard();
});