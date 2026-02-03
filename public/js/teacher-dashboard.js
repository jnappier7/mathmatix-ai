// public/js/teacher-dashboard.js
// ENHANCED: Added class overview, insights, search/filter, keyboard shortcuts, and improved UX

document.addEventListener("DOMContentLoaded", async () => {
    const studentListDiv = document.getElementById("student-list");
    const logoutBtn = document.getElementById("logoutBtn");

    // IEP Editor Elements
    const iepEditorModal = document.getElementById("iep-editor-modal");
    const iepStudentNameSpan = document.getElementById("iep-student-name");
    const currentIepStudentIdInput = document.getElementById("current-iep-student-id");
    const saveIepBtn = document.getElementById("save-iep-btn");
    const closeIepModalBtn = document.getElementById("close-iep-modal-btn");

    // Search and Filter Elements
    const studentSearchInput = document.getElementById("student-search");
    const studentFilterSelect = document.getElementById("student-filter");

    // IEP Form Elements
    const iepAccommodations = {
        extendedTime: document.getElementById("extendedTime"),
        reducedDistraction: document.getElementById("reducedDistraction"),
        calculatorAllowed: document.getElementById("calculatorAllowed"),
        audioReadAloud: document.getElementById("audioReadAloud"),
        chunkedAssignments: document.getElementById("chunkedAssignments"),
        breaksAsNeeded: document.getElementById("breaksAsNeeded"),
        digitalMultiplicationChart: document.getElementById("digitalMultiplicationChart"),
        largePrintHighContrast: document.getElementById("largePrintHighContrast"),
        mathAnxietySupport: document.getElementById("mathAnxietySupport")
    };
    const customAccommodationsInput = document.getElementById("customAccommodations");
    const readingLevelInput = document.getElementById("readingLevel");
    const preferredScaffoldsInput = document.getElementById("preferredScaffolds");
    const iepGoalsList = document.getElementById("iep-goals-list");
    const addIepGoalBtn = document.getElementById("add-iep-goal-btn");

    // Conversation History Elements
    const conversationHistoryModal = document.getElementById("conversation-history-modal");
    const historyStudentNameSpan = document.getElementById("history-student-name");
    const conversationsListDiv = document.getElementById("conversations-list");
    const closeHistoryModalBtn = document.getElementById("close-history-modal-btn");

    // Student Detail Modal Elements
    const studentDetailModal = document.getElementById("student-detail-modal");
    let currentStudentsData = []; // Store fetched students for detail lookup

    // --- Tab Switching Logic ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // Remove active class from all tabs and buttons
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const targetContent = document.getElementById(`${targetTab}-tab`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // --- Initial Load ---
    await fetchAssignedStudents();

    // Initialize search and filter
    initializeSearchAndFilter();

    // Initialize quick actions
    initializeQuickActions();

    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();

    // --- Modal Control Functions ---
    function showModal(modalElement) {
        if (modalElement) modalElement.classList.add('is-visible');
    }

    function hideModal(modalElement) {
        if (modalElement) modalElement.classList.remove('is-visible');
    }
    
    // Setup all modal close buttons
    [
        { btn: document.getElementById("iepModalCloseBtn"), modal: iepEditorModal },
        { btn: closeIepModalBtn, modal: iepEditorModal },
        { btn: document.getElementById("cancel-iep-edit-btn"), modal: iepEditorModal },
        { btn: document.getElementById("conversationModalCloseBtn"), modal: conversationHistoryModal },
        { btn: closeHistoryModalBtn, modal: conversationHistoryModal },
        { btn: document.getElementById("studentDetailModalCloseBtn"), modal: studentDetailModal },
        { btn: document.getElementById("close-student-detail-btn"), modal: studentDetailModal }
    ].forEach(item => {
        if (item.btn) item.btn.addEventListener('click', () => hideModal(item.modal));
    });

    window.addEventListener('click', (event) => {
        if (event.target === iepEditorModal) hideModal(iepEditorModal);
        if (event.target === conversationHistoryModal) hideModal(conversationHistoryModal);
        if (event.target === studentDetailModal) hideModal(studentDetailModal);
    });

    // --- IEP Form Logic ---
    const loadIepData = (iepPlan = {}) => {
        const accommodations = iepPlan.accommodations || {};

        // Load checkboxes
        Object.keys(iepAccommodations).forEach(key => {
            if(iepAccommodations[key]) {
                iepAccommodations[key].checked = accommodations[key] || false;
            }
        });

        // Load custom accommodations
        if (customAccommodationsInput) {
            customAccommodationsInput.value = (accommodations.custom || []).join('\n');
        }

        // Load other fields
        if(readingLevelInput) readingLevelInput.value = iepPlan.readingLevel || '';
        if(preferredScaffoldsInput) preferredScaffoldsInput.value = (iepPlan.preferredScaffolds || []).join(', ');

        // Load goals
        if(iepGoalsList) {
            iepGoalsList.innerHTML = '';
            (iepPlan.goals || []).forEach(goal => addIepGoalToUI(goal));
        }
    };

    const getIepDataFromForm = () => {
        // Get goals from form
        const goals = Array.from(iepGoalsList.querySelectorAll('.iep-goal-item')).map(item => ({
            description: item.querySelector('.goal-description').value,
            targetDate: item.querySelector('.goal-target-date').value,
            currentProgress: parseFloat(item.querySelector('.goal-progress').value) || 0,
            measurementMethod: item.querySelector('.goal-method').value,
            status: item.querySelector('.goal-status').value,
        }));

        // Build accommodations object
        const accommodations = Object.fromEntries(
            Object.entries(iepAccommodations).map(([key, el]) => [key, el.checked])
        );

        // Add custom accommodations array
        if (customAccommodationsInput && customAccommodationsInput.value.trim()) {
            accommodations.custom = customAccommodationsInput.value
                .split('\n')
                .map(s => s.trim())
                .filter(Boolean);
        } else {
            accommodations.custom = [];
        }

        return {
            accommodations,
            readingLevel: parseFloat(readingLevelInput.value) || null,
            preferredScaffolds: preferredScaffoldsInput.value.split(',').map(s => s.trim()).filter(Boolean),
            goals
        };
    };

    const addIepGoalToUI = (goal = {}) => {
        const li = document.createElement('li');
        li.className = 'iep-goal-item';
        li.innerHTML = `
            <label>Description:</label>
            <textarea class="goal-description" rows="2" required>${goal.description || ''}</textarea>
            <div style="display: flex; gap: 10px; margin-top: 5px;">
                <div style="flex: 1;">
                    <label>Target Date:</label>
                    <input type="date" class="goal-target-date" value="${goal.targetDate ? new Date(goal.targetDate).toISOString().substring(0, 10) : ''}" />
                </div>
                <div style="flex: 1;">
                    <label>Progress (%):</label>
                    <input type="number" class="goal-progress" min="0" max="100" value="${goal.currentProgress || 0}" />
                </div>
            </div>
            <label>Measurement Method:</label>
            <input type="text" class="goal-method" value="${goal.measurementMethod || ''}" placeholder="e.g., Quiz scores, Observation" />
            <label>Status:</label>
            <select class="goal-status">
                <option value="active" ${goal.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="on-hold" ${goal.status === 'on-hold' ? 'selected' : ''}>On-Hold</option>
            </select>
            <button type="button" class="remove-goal-btn">Remove Goal</button>
        `;
        iepGoalsList.appendChild(li);
        li.querySelector('.remove-goal-btn').addEventListener('click', () => li.remove());
    };

    if(addIepGoalBtn) addIepGoalBtn.addEventListener('click', () => addIepGoalToUI());

    if(saveIepBtn) saveIepBtn.addEventListener('click', async () => {
        const studentId = currentIepStudentIdInput.value;
        if (!studentId) return alert("No student selected.");
        
        const updatedIepPlan = getIepDataFromForm();
        try {
            const response = await csrfFetch(`/api/teacher/students/${studentId}/iep`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedIepPlan)
            });
            if (!response.ok) throw new Error(await response.text());
            alert("IEP saved successfully!");
            hideModal(iepEditorModal);
            fetchAssignedStudents();
        } catch (error) {
            console.error("Error saving IEP data:", error);
            alert("Failed to save IEP data.");
        }
    });

    // --- Main Data Fetching and Rendering ---
    async function fetchAssignedStudents() {
        if (!studentListDiv) return;
        studentListDiv.innerHTML = 'Loading students...';
        try {
            const response = await fetch("/api/teacher/students");
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = "/login.html";
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const students = await response.json();
            currentStudentsData = students; // Store for detail lookup
            renderStudentList(students);
        } catch (error) {
            console.error("Failed to fetch students:", error);
            studentListDiv.innerHTML = "<p>Error loading student data. Please refresh.</p>";
        }
    }

    function renderStudentList(students, filterType = 'all', searchQuery = '') {
        studentListDiv.innerHTML = '';

        // Filter and search students
        let filteredStudents = students.filter(student => {
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim().toLowerCase();
            const username = (student.username || '').toLowerCase();
            const query = searchQuery.toLowerCase();

            // Search match
            const searchMatch = !query || fullName.includes(query) || username.includes(query);

            // Filter match
            const status = getStudentStatus(student);
            let filterMatch = true;
            if (filterType === 'active') filterMatch = status === 'active';
            else if (filterType === 'struggling') filterMatch = status === 'struggling';
            else if (filterType === 'inactive') filterMatch = status === 'inactive';

            return searchMatch && filterMatch;
        });

        if (filteredStudents.length === 0) {
            studentListDiv.innerHTML = searchQuery || filterType !== 'all'
                ? "<p style='padding: 20px; color: #7f8c8d; text-align: center;'>No students match your search/filter criteria.</p>"
                : "<p>No students have been assigned to you. Please contact an administrator.</p>";
            return;
        }

        // Sort: struggling first, then active, then inactive
        filteredStudents.sort((a, b) => {
            const statusOrder = { struggling: 0, active: 1, inactive: 2 };
            return (statusOrder[getStudentStatus(a)] || 1) - (statusOrder[getStudentStatus(b)] || 1);
        });

        filteredStudents.forEach(student => {
            const studentCard = document.createElement('div');
            const status = getStudentStatus(student);
            studentCard.className = `student-card status-${status}`;
            studentCard.dataset.studentId = student._id;

            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;
            const lastLoginDate = student.lastLogin ? new Date(student.lastLogin) : null;
            const lastLoginText = lastLoginDate ? formatTimeAgo(lastLoginDate) : 'Never';

            // Status badge
            const badgeClass = status === 'active' ? 'badge-active' : status === 'struggling' ? 'badge-struggling' : 'badge-inactive';
            const badgeText = status === 'active' ? 'Active' : status === 'struggling' ? 'Needs Help' : 'Inactive';

            studentCard.innerHTML = `
                <div class="student-card-header">
                    <strong><a href="#" class="student-name-link" data-student-id="${student._id}" style="color: #27ae60; text-decoration: none; cursor: pointer;">${fullName}</a></strong>
                    <span class="student-status-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="student-metrics">
                    <span class="student-metric"><i class="fas fa-user"></i> ${student.username}</span>
                    <span class="student-metric"><i class="fas fa-graduation-cap"></i> Grade ${student.gradeLevel || 'N/A'}</span>
                    <span class="student-metric"><i class="fas fa-trophy"></i> Level ${student.level || 1}</span>
                    <span class="student-metric"><i class="fas fa-clock"></i> ${lastLoginText}</span>
                    <span class="student-metric"><i class="fas fa-bolt"></i> ${student.weeklyActiveTutoringMinutes || 0} min/wk</span>
                </div>
                <div class="card-buttons">
                    <button class="view-iep-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}"><i class="fas fa-clipboard-list"></i> IEP</button>
                    <button class="view-history-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}"><i class="fas fa-history"></i> History</button>
                    <button class="reset-screener-btn submit-btn btn-tertiary" data-student-id="${student._id}" data-student-name="${fullName}"><i class="fas fa-redo"></i> Reset</button>
                </div>
            `;
            studentListDiv.appendChild(studentCard);
        });
        addEventListenersToButtons();
    }

    // Determine student status based on activity and performance
    function getStudentStatus(student) {
        const lastLogin = student.lastLogin ? new Date(student.lastLogin) : null;
        const daysSinceLogin = lastLogin ? (Date.now() - lastLogin) / (1000 * 60 * 60 * 24) : Infinity;

        // Check if inactive (7+ days since login)
        if (daysSinceLogin > 7) return 'inactive';

        // Check if struggling (low weekly minutes or flagged)
        const weeklyMinutes = student.weeklyActiveTutoringMinutes || 0;
        if (weeklyMinutes < 10 && daysSinceLogin <= 7) return 'struggling';

        // Active and doing well
        if (daysSinceLogin <= 1) return 'active';

        return 'active';
    }

    // Format time ago helper
    function formatTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    function addEventListenersToButtons() {
        document.querySelectorAll('.view-iep-btn').forEach(button => {
            button.addEventListener('click', handleViewIep);
        });
        document.querySelectorAll('.view-history-btn').forEach(button => {
            button.addEventListener('click', handleViewHistory);
        });
        document.querySelectorAll('.reset-screener-btn').forEach(button => {
            button.addEventListener('click', handleResetScreener);
        });
        document.querySelectorAll('.student-name-link').forEach(link => {
            link.addEventListener('click', handleStudentNameClick);
        });
    }

    async function handleStudentNameClick(event) {
        event.preventDefault();
        const studentId = event.target.dataset.studentId;
        const student = currentStudentsData.find(s => s._id === studentId);
        if (!student) return;

        const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;

        // Populate modal with student info
        document.getElementById('detail-student-name').textContent = fullName;
        document.getElementById('detail-username').textContent = student.username || '-';
        document.getElementById('detail-email').textContent = student.email || '-';
        document.getElementById('detail-grade').textContent = student.gradeLevel || '-';
        document.getElementById('detail-course').textContent = student.mathCourse || '-';
        document.getElementById('detail-level').textContent = student.level || 1;
        document.getElementById('detail-xp').textContent = (student.xp || 0).toLocaleString();
        document.getElementById('detail-total-minutes').textContent = student.totalActiveTutoringMinutes || 0;
        document.getElementById('detail-weekly-minutes').textContent = student.weeklyActiveTutoringMinutes || 0;
        document.getElementById('detail-last-login').textContent = student.lastLogin
            ? new Date(student.lastLogin).toLocaleString()
            : 'Never';

        // Show modal
        showModal(studentDetailModal);

        // Load conversations
        const conversationsDiv = document.getElementById('detail-conversations');
        conversationsDiv.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

        try {
            const response = await fetch(`/api/teacher/students/${studentId}/conversations`);
            if (!response.ok) throw new Error('Failed to load conversations');
            const conversations = await response.json();

            if (conversations.length === 0) {
                conversationsDiv.innerHTML = '<p style="color: #666; font-style: italic;">No conversation history found.</p>';
            } else {
                conversationsDiv.innerHTML = conversations.slice(0, 5).map(conv => `
                    <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #27ae60;">
                        <div style="font-size: 0.85em; color: #666; margin-bottom: 5px;">
                            <i class="fas fa-calendar"></i> ${new Date(conv.date || conv.startDate).toLocaleDateString()}
                            ${conv.activeMinutes ? `<span style="margin-left: 10px;"><i class="fas fa-clock"></i> ${conv.activeMinutes} min</span>` : ''}
                        </div>
                        <div style="color: #333;">${conv.summary || 'No summary available'}</div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            conversationsDiv.innerHTML = '<p style="color: #e74c3c;">Error loading conversation history.</p>';
        }

        // Setup action buttons in modal
        const viewIepBtn = document.getElementById('detail-view-iep-btn');
        const viewHistoryBtn = document.getElementById('detail-view-history-btn');

        // Remove old listeners and add new ones
        viewIepBtn.onclick = () => {
            hideModal(studentDetailModal);
            iepStudentNameSpan.textContent = fullName;
            currentIepStudentIdInput.value = studentId;
            showModal(iepEditorModal);
            fetch(`/api/teacher/students/${studentId}/iep`)
                .then(res => res.json())
                .then(iepPlan => loadIepData(iepPlan))
                .catch(err => {
                    console.error('Error loading IEP:', err);
                    alert('Failed to load IEP data.');
                });
        };

        viewHistoryBtn.onclick = () => {
            hideModal(studentDetailModal);
            historyStudentNameSpan.textContent = fullName;
            showModal(conversationHistoryModal);
            handleViewHistory({ target: { dataset: { studentId, studentName: fullName } } });
        };
    }

    async function handleViewIep(event) {
        const studentId = event.target.dataset.studentId;
        iepStudentNameSpan.textContent = event.target.dataset.studentName;
        currentIepStudentIdInput.value = studentId;
        showModal(iepEditorModal);
        try {
            const iepResponse = await fetch(`/api/teacher/students/${studentId}/iep`);
            if (!iepResponse.ok) throw new Error(await iepResponse.text());
            const iepPlan = await iepResponse.json();
            loadIepData(iepPlan);
        } catch (error) {
            console.error("Error loading IEP data:", error);
            alert("Failed to load IEP data.");
        }
    }

    async function handleViewHistory(event) {
        const studentId = event.target.dataset.studentId;
        historyStudentNameSpan.textContent = event.target.dataset.studentName;
        showModal(conversationHistoryModal);
        conversationsListDiv.innerHTML = 'Loading conversation summaries...';
        try {
            // This API call now correctly fetches from the Conversation collection via the backend route
            const response = await fetch(`/api/teacher/students/${studentId}/conversations`);
            if (!response.ok) throw new Error(await response.text());
            const conversations = await response.json();

            if (conversations.length === 0) {
                conversationsListDiv.innerHTML = "<p>No conversation history found for this student.</p>";
                return;
            }
            // The rendering logic remains valid as it consumes the data structure provided by the repaired API
            conversationsListDiv.innerHTML = conversations.map(convo => `
                <div class="conversation-card">
                    <h4>Session on <span class="session-date">${new Date(convo.date || convo.startDate).toLocaleDateString()}</span></h4>
                    <p>${convo.summary || 'No summary available.'}</p>
                </div>
            `).join('');
        } catch (error) {
            console.error("Error loading conversation history:", error);
            conversationsListDiv.innerHTML = "<p>Error loading conversation history.</p>";
        }
    }

    async function handleResetScreener(event) {
        const studentId = event.target.dataset.studentId;
        const studentName = event.target.dataset.studentName;

        // Confirm action
        const reason = prompt(
            `Reset placement assessment for ${studentName}?\n\n` +
            `This will allow them to retake the screener.\n\n` +
            `Optional: Enter a reason for this reset (e.g., "summer break", "skill regression"):`
        );

        // User cancelled
        if (reason === null) return;

        try {
            const response = await csrfFetch(`/api/teacher/students/${studentId}/reset-assessment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason || 'Teacher requested reset' })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to reset assessment');
            }

            const result = await response.json();
            alert(`✅ ${result.message}\n\nThe student can now retake the placement screener.`);

            // Refresh student list to show updated status
            await fetchAssignedStudents();

        } catch (error) {
            console.error('Error resetting assessment:', error);
            alert(`❌ Failed to reset assessment: ${error.message}`);
        }
    }

    // ============================================
    // CLASS OVERVIEW STATS
    // ============================================

    function updateClassOverview(students) {
        // Total students
        document.getElementById('stat-total-students').textContent = students.length;

        // Count by status
        let activeCount = 0;
        let strugglingCount = 0;
        let inactiveCount = 0;
        let totalLevel = 0;
        let totalWeeklyMinutes = 0;
        let streakCount = 0;

        students.forEach(student => {
            const status = getStudentStatus(student);
            if (status === 'active') activeCount++;
            else if (status === 'struggling') strugglingCount++;
            else if (status === 'inactive') inactiveCount++;

            totalLevel += student.level || 1;
            totalWeeklyMinutes += student.weeklyActiveTutoringMinutes || 0;

            // Count students with streaks (placeholder - would need streak data)
            if (student.currentStreak && student.currentStreak >= 3) streakCount++;
        });

        document.getElementById('stat-active-now').textContent = activeCount;
        document.getElementById('stat-needs-attention').textContent = strugglingCount + inactiveCount;
        document.getElementById('stat-avg-progress').textContent = students.length > 0
            ? (totalLevel / students.length).toFixed(1)
            : '--';
        document.getElementById('stat-weekly-minutes').textContent = students.length > 0
            ? Math.round(totalWeeklyMinutes / students.length)
            : '--';
        document.getElementById('stat-on-streak').textContent = streakCount;

        // Update timestamp
        document.getElementById('overview-updated').textContent = 'Updated just now';

        // Make clickable cards work
        document.getElementById('attention-card').onclick = () => {
            studentFilterSelect.value = 'struggling';
            applyFilters();
            showToast('Showing students who need attention', 'info');
        };

        document.getElementById('streak-card').onclick = () => {
            showToast('Streak tracking coming soon!', 'info');
        };
    }

    // ============================================
    // INSIGHTS CARDS
    // ============================================

    function updateInsightsCards(students) {
        // Struggling students (low engagement)
        const strugglingList = document.getElementById('struggling-list');
        const strugglingStudents = students.filter(s => getStudentStatus(s) === 'struggling').slice(0, 5);

        if (strugglingStudents.length > 0) {
            strugglingList.innerHTML = strugglingStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name}</span>`;
            }).join('');
        } else {
            strugglingList.innerHTML = '<span class="insight-empty">No students struggling</span>';
        }

        // Top performers (highest level)
        const excellingList = document.getElementById('excelling-list');
        const excellingStudents = [...students]
            .sort((a, b) => (b.level || 1) - (a.level || 1))
            .slice(0, 5);

        if (excellingStudents.length > 0) {
            excellingList.innerHTML = excellingStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name} (L${s.level || 1})</span>`;
            }).join('');
        } else {
            excellingList.innerHTML = '<span class="insight-empty">No data yet</span>';
        }

        // Inactive students
        const inactiveList = document.getElementById('inactive-list');
        const inactiveStudents = students.filter(s => getStudentStatus(s) === 'inactive').slice(0, 5);

        if (inactiveStudents.length > 0) {
            inactiveList.innerHTML = inactiveStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name}</span>`;
            }).join('');
        } else {
            inactiveList.innerHTML = '<span class="insight-empty">All students active!</span>';
        }

        // Add click handlers to chips
        document.querySelectorAll('.insight-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const studentId = chip.dataset.studentId;
                const student = currentStudentsData.find(s => s._id === studentId);
                if (student) {
                    // Trigger student detail view
                    const link = document.querySelector(`.student-name-link[data-student-id="${studentId}"]`);
                    if (link) link.click();
                }
            });
        });
    }

    // ============================================
    // SEARCH AND FILTER
    // ============================================

    function initializeSearchAndFilter() {
        if (studentSearchInput) {
            studentSearchInput.addEventListener('input', debounce(applyFilters, 300));
        }

        if (studentFilterSelect) {
            studentFilterSelect.addEventListener('change', applyFilters);
        }
    }

    function applyFilters() {
        const searchQuery = studentSearchInput ? studentSearchInput.value : '';
        const filterType = studentFilterSelect ? studentFilterSelect.value : 'all';
        renderStudentList(currentStudentsData, filterType, searchQuery);
    }

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================
    // QUICK ACTIONS
    // ============================================

    function initializeQuickActions() {
        // Export Data
        const exportBtn = document.getElementById('qa-export-progress');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportStudentData);
        }

        // Celeration Charts
        const celerationBtn = document.getElementById('qa-celeration');
        if (celerationBtn) {
            celerationBtn.addEventListener('click', () => {
                window.location.href = '/teacher-celeration-dashboard.html';
            });
        }

        // Refresh
        const refreshBtn = document.getElementById('qa-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.querySelector('i').classList.add('fa-spin');
                await fetchAssignedStudents();
                refreshBtn.querySelector('i').classList.remove('fa-spin');
                showToast('Data refreshed!', 'success');
            });
        }

        // Shortcuts toggle
        const helpBtn = document.getElementById('qa-help');
        const shortcutsPanel = document.getElementById('shortcuts-panel');
        if (helpBtn && shortcutsPanel) {
            helpBtn.addEventListener('click', () => {
                shortcutsPanel.style.display = shortcutsPanel.style.display === 'none' ? 'block' : 'none';
            });
        }
    }

    function exportStudentData() {
        if (currentStudentsData.length === 0) {
            showToast('No student data to export', 'warning');
            return;
        }

        // Create CSV content
        const headers = ['Name', 'Username', 'Grade', 'Level', 'XP', 'Weekly Minutes', 'Total Minutes', 'Last Login', 'Status'];
        const rows = currentStudentsData.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            const lastLogin = s.lastLogin ? new Date(s.lastLogin).toLocaleDateString() : 'Never';
            const status = getStudentStatus(s);
            return [
                name,
                s.username,
                s.gradeLevel || 'N/A',
                s.level || 1,
                s.xp || 0,
                s.weeklyActiveTutoringMinutes || 0,
                s.totalActiveTutoringMinutes || 0,
                lastLogin,
                status
            ].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `student-progress-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Export downloaded!', 'success');
    }

    // ============================================
    // KEYBOARD SHORTCUTS
    // ============================================

    function initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                // Allow Escape to close modals even in inputs
                if (e.key === 'Escape') {
                    closeAllModals();
                }
                return;
            }

            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    document.querySelector('[data-tab="students"]')?.click();
                    break;
                case 'c':
                    e.preventDefault();
                    document.querySelector('[data-tab="curriculum"]')?.click();
                    break;
                case 'r':
                    e.preventDefault();
                    document.querySelector('[data-tab="resources"]')?.click();
                    break;
                case '/':
                    e.preventDefault();
                    studentSearchInput?.focus();
                    break;
                case '?':
                    e.preventDefault();
                    const shortcutsPanel = document.getElementById('shortcuts-panel');
                    if (shortcutsPanel) {
                        shortcutsPanel.style.display = shortcutsPanel.style.display === 'none' ? 'block' : 'none';
                    }
                    break;
                case 'escape':
                    closeAllModals();
                    break;
            }
        });
    }

    function closeAllModals() {
        document.querySelectorAll('.modal-overlay.is-visible').forEach(modal => {
            modal.classList.remove('is-visible');
        });
    }

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================

    function showToast(message, type = 'info') {
        // Create container if needed
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        // Create toast
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'error' ? 'times-circle' : 'info-circle';
        toast.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============================================
    // UPDATE RIGHT SIDEBAR
    // ============================================

    function updateRightSidebar(students) {
        // Today's summary (simulated data - would need real API)
        const today = new Date().toDateString();
        const loginsToday = students.filter(s => {
            const lastLogin = s.lastLogin ? new Date(s.lastLogin).toDateString() : null;
            return lastLogin === today;
        }).length;

        document.getElementById('summary-logins').textContent = loginsToday;

        // Calculate approximate problems solved (would need real data)
        const totalMinutesToday = students.reduce((sum, s) => {
            const lastLogin = s.lastLogin ? new Date(s.lastLogin) : null;
            if (lastLogin && lastLogin.toDateString() === today) {
                return sum + (s.weeklyActiveTutoringMinutes || 0) / 7; // Rough daily estimate
            }
            return sum;
        }, 0);

        document.getElementById('summary-problems').textContent = Math.round(totalMinutesToday * 2); // ~2 problems per minute
        document.getElementById('summary-time').textContent = Math.round(totalMinutesToday);

        // Milestones (would need real milestone data)
        const milestonesDiv = document.getElementById('recent-milestones');
        const topStudents = [...students]
            .filter(s => (s.level || 1) >= 3)
            .sort((a, b) => (b.level || 1) - (a.level || 1))
            .slice(0, 3);

        if (topStudents.length > 0) {
            milestonesDiv.innerHTML = topStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `
                    <div class="milestone-item">
                        <span class="milestone-icon">🏆</span>
                        <div class="milestone-content">
                            <div class="milestone-student">${name}</div>
                            <div class="milestone-text">Reached Level ${s.level || 1}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Update the fetchAssignedStudents to call our new update functions
    const originalFetchAssignedStudents = fetchAssignedStudents;
    fetchAssignedStudents = async function() {
        if (!studentListDiv) return;
        studentListDiv.innerHTML = 'Loading students...';
        try {
            const response = await fetch("/api/teacher/students");
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) window.location.href = "/login.html";
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const students = await response.json();
            currentStudentsData = students;

            // Render student list with current filters
            const searchQuery = studentSearchInput ? studentSearchInput.value : '';
            const filterType = studentFilterSelect ? studentFilterSelect.value : 'all';
            renderStudentList(students, filterType, searchQuery);

            // Update all the new UX components
            updateClassOverview(students);
            updateInsightsCards(students);
            updateRightSidebar(students);

            // Check for new struggling alerts
            checkForStrugglingAlerts(students);

        } catch (error) {
            console.error("Failed to fetch students:", error);
            studentListDiv.innerHTML = "<p>Error loading student data. Please refresh.</p>";
        }
    };

    // ============================================
    // REAL-TIME POLLING (3x Better UX)
    // ============================================

    let pollingInterval = null;
    let previousStrugglingCount = 0;

    function startRealtimePolling() {
        // Poll every 30 seconds for updates
        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch("/api/teacher/students");
                if (response.ok) {
                    const students = await response.json();
                    currentStudentsData = students;

                    // Silent update - don't replace list if user is searching/filtering
                    const searchQuery = studentSearchInput ? studentSearchInput.value : '';
                    const filterType = studentFilterSelect ? studentFilterSelect.value : 'all';

                    // Update stats without disrupting user
                    updateClassOverview(students);
                    updateInsightsCards(students);
                    updateRightSidebar(students);

                    // Only re-render list if no active search
                    if (!searchQuery) {
                        renderStudentList(students, filterType, searchQuery);
                    }

                    // Check for new alerts
                    checkForStrugglingAlerts(students);

                    // Update timestamp
                    const timestampEl = document.getElementById('overview-updated');
                    if (timestampEl) {
                        timestampEl.textContent = 'Updated just now';
                    }
                }
            } catch (error) {
                console.log('[Polling] Fetch failed, will retry:', error.message);
            }
        }, 30000); // 30 seconds
    }

    function stopRealtimePolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // Start polling when page loads
    startRealtimePolling();

    // Stop polling when user leaves page
    window.addEventListener('beforeunload', stopRealtimePolling);

    // Pause polling when tab is hidden, resume when visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopRealtimePolling();
        } else {
            startRealtimePolling();
            fetchAssignedStudents(); // Immediate refresh when returning
        }
    });

    // ============================================
    // STRUGGLING STUDENT ALERTS
    // ============================================

    function checkForStrugglingAlerts(students) {
        const currentStruggling = students.filter(s => getStudentStatus(s) === 'struggling');
        const currentCount = currentStruggling.length;

        // If there are new struggling students, show alert
        if (currentCount > previousStrugglingCount && previousStrugglingCount > 0) {
            const newCount = currentCount - previousStrugglingCount;
            showStrugglingAlert(newCount, currentStruggling);
        }

        previousStrugglingCount = currentCount;
    }

    function showStrugglingAlert(newCount, strugglingStudents) {
        // Create alert banner if it doesn't exist
        let alertBanner = document.getElementById('struggling-alert-banner');
        if (!alertBanner) {
            alertBanner = document.createElement('div');
            alertBanner.id = 'struggling-alert-banner';
            alertBanner.className = 'struggling-alert-banner';
            document.body.insertBefore(alertBanner, document.body.firstChild);
        }

        const names = strugglingStudents.slice(0, 3).map(s =>
            `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username
        );
        const nameText = names.join(', ') + (strugglingStudents.length > 3 ? ` and ${strugglingStudents.length - 3} more` : '');

        alertBanner.innerHTML = `
            <div class="alert-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span><strong>${newCount} student${newCount > 1 ? 's' : ''} need${newCount === 1 ? 's' : ''} help!</strong> ${nameText}</span>
                <button class="alert-action-btn" onclick="document.getElementById('student-filter').value='struggling'; document.getElementById('student-filter').dispatchEvent(new Event('change'));">View</button>
                <button class="alert-dismiss-btn" onclick="this.parentElement.parentElement.style.display='none';">&times;</button>
            </div>
        `;
        alertBanner.style.display = 'flex';

        // Play notification sound if available
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Ignore if blocked
        } catch (e) {}

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (alertBanner) alertBanner.style.display = 'none';
        }, 10000);
    }

    // ============================================
    // BULK SELECTION
    // ============================================

    let selectedStudents = new Set();

    function toggleStudentSelection(studentId, cardElement) {
        if (selectedStudents.has(studentId)) {
            selectedStudents.delete(studentId);
            cardElement.classList.remove('selected');
        } else {
            selectedStudents.add(studentId);
            cardElement.classList.add('selected');
        }
        updateBulkActionsBar();
    }

    function updateBulkActionsBar() {
        let bulkBar = document.getElementById('bulk-actions-bar');
        if (!bulkBar) {
            bulkBar = document.createElement('div');
            bulkBar.id = 'bulk-actions-bar';
            bulkBar.className = 'bulk-actions-bar';
            document.body.appendChild(bulkBar);
        }

        if (selectedStudents.size > 0) {
            bulkBar.innerHTML = `
                <div class="bulk-content">
                    <span class="bulk-count">${selectedStudents.size} student${selectedStudents.size > 1 ? 's' : ''} selected</span>
                    <button class="bulk-btn" onclick="bulkExportSelected()"><i class="fas fa-download"></i> Export</button>
                    <button class="bulk-btn" onclick="bulkResetAssessments()"><i class="fas fa-redo"></i> Reset Assessments</button>
                    <button class="bulk-btn bulk-clear" onclick="clearSelection()"><i class="fas fa-times"></i> Clear</button>
                </div>
            `;
            bulkBar.style.display = 'flex';
        } else {
            bulkBar.style.display = 'none';
        }
    }

    window.clearSelection = function() {
        selectedStudents.clear();
        document.querySelectorAll('.student-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        updateBulkActionsBar();
    };

    window.bulkExportSelected = function() {
        const selected = currentStudentsData.filter(s => selectedStudents.has(s._id));
        if (selected.length === 0) return;

        const headers = ['Name', 'Username', 'Grade', 'Level', 'XP', 'Weekly Minutes', 'Status'];
        const rows = selected.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            const status = getStudentStatus(s);
            return [name, s.username, s.gradeLevel || 'N/A', s.level || 1, s.xp || 0, s.weeklyActiveTutoringMinutes || 0, status].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `selected-students-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`Exported ${selected.length} students`, 'success');
        clearSelection();
    };

    window.bulkResetAssessments = async function() {
        const count = selectedStudents.size;
        if (!confirm(`Reset assessments for ${count} selected students?`)) return;

        let successCount = 0;
        for (const studentId of selectedStudents) {
            try {
                const response = await csrfFetch(`/api/teacher/students/${studentId}/reset-assessment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: 'Bulk reset by teacher' })
                });
                if (response.ok) successCount++;
            } catch (error) {
                console.error(`Failed to reset ${studentId}:`, error);
            }
        }

        showToast(`Reset ${successCount}/${count} assessments`, successCount === count ? 'success' : 'warning');
        clearSelection();
        fetchAssignedStudents();
    };

    // Add click handler for bulk selection (Ctrl/Cmd + click)
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.student-card');
        if (card && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const studentId = card.dataset.studentId;
            if (studentId) {
                toggleStudentSelection(studentId, card);
            }
        }
    });
});