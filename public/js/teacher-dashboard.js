// public/js/teacher-dashboard.js
// 3X UX UPGRADE: Class-grouped students, unified profile modal, weekly comparison,
// smart alerts, mobile experience, quick wins

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
    const conversationsListDiv = document.getElementById("conversation-history-list");
    const closeHistoryModalBtn = document.getElementById("close-history-modal-btn");

    // Student Detail Modal Elements
    const studentDetailModal = document.getElementById("student-detail-modal");
    let currentStudentsData = []; // Store fetched students for detail lookup

    // === NEW STATE ===
    let currentViewMode = 'grouped'; // 'grouped' or 'flat'
    let classesData = []; // Store classes for grouped view
    let previousWeekData = null; // Store for weekly comparison

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

            // Lazy-load classes data when tab is first opened
            if (targetTab === 'classes' && !classesLoaded) {
                fetchClasses();
            }
        });
    });

    // --- Initial Load ---
    // Fetch students and classes in parallel for faster initial load
    await Promise.all([fetchAssignedStudents(), fetchClassesForGrouping()]);
    // Re-render with class grouping now that both datasets are available
    if (classesData.length > 0 && currentStudentsData.length > 0) {
        renderStudentList(currentStudentsData);
    }

    // Initialize search and filter
    initializeSearchAndFilter();

    // Initialize quick actions
    initializeQuickActions();

    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();

    // Initialize view toggle (grouped vs flat)
    initializeViewToggle();

    // Initialize profile modal tabs
    initializeProfileTabs();

    // Initialize mobile navigation
    initializeMobileNav();

    // Initialize smart alerts sidebar
    initializeSmartAlerts();

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

    // --- IEP Template Chip Handlers ---
    document.querySelectorAll('.iep-template-chip').forEach(chip => {
        chip.addEventListener('click', async () => {
            const templateId = chip.dataset.template;
            const studentId = currentIepStudentIdInput.value;
            if (!studentId) return;

            // Confirm merge vs. replace
            const currentHasAccommodations = Object.values(iepAccommodations).some(el => el && el.checked);
            if (currentHasAccommodations) {
                const merge = confirm(`Apply "${chip.textContent}" template?\n\nClick OK to merge with existing accommodations, or Cancel to skip.`);
                if (!merge) return;
            }

            try {
                const res = await csrfFetch(`/api/iep-templates/apply/accommodations/${studentId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ templateId, merge: true })
                });
                if (!res.ok) throw new Error(await res.text());
                const result = await res.json();

                // Reload the IEP data into the form
                const iepRes = await csrfFetch(`/api/teacher/students/${studentId}/iep`);
                if (iepRes.ok) {
                    const iepData = await iepRes.json();
                    loadIepData(iepData);
                }

                // Visual feedback on the chip
                chip.classList.add('iep-template-applied');
                setTimeout(() => chip.classList.remove('iep-template-applied'), 2000);
            } catch (err) {
                console.error('[IEP Template] Error applying template:', err);
                alert('Failed to apply template. Please try again.');
            }
        });
    });

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

        // Update student count in tab
        const countEl = document.getElementById('tab-student-count');
        if (countEl) countEl.textContent = `(${students.length})`;

        // Filter and search students
        let filteredStudents = filterStudents(students, filterType, searchQuery);

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

        // Render based on view mode
        if (currentViewMode === 'grouped' && classesData.length > 0 && !searchQuery) {
            renderGroupedView(filteredStudents);
        } else {
            renderFlatView(filteredStudents);
        }

        addEventListenersToButtons();
    }

    function filterStudents(students, filterType, searchQuery) {
        return students.filter(student => {
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim().toLowerCase();
            const username = (student.username || '').toLowerCase();
            const query = searchQuery.toLowerCase();
            const searchMatch = !query || fullName.includes(query) || username.includes(query);
            const status = getStudentStatus(student);
            let filterMatch = true;
            if (filterType === 'active') filterMatch = status === 'active';
            else if (filterType === 'struggling') filterMatch = status === 'struggling';
            else if (filterType === 'inactive') filterMatch = status === 'inactive';
            return searchMatch && filterMatch;
        });
    }

    function renderFlatView(students) {
        students.forEach(student => {
            studentListDiv.appendChild(createStudentCard(student));
        });
    }

    function renderGroupedView(students) {
        // Build a map of student IDs to class names
        const studentClassMap = {};
        classesData.forEach(cls => {
            if (cls.studentIds) {
                cls.studentIds.forEach(id => {
                    if (!studentClassMap[id]) studentClassMap[id] = [];
                    studentClassMap[id].push(cls);
                });
            }
        });

        // Group students by class
        const grouped = {};
        const ungrouped = [];

        students.forEach(student => {
            const classes = studentClassMap[student._id];
            if (classes && classes.length > 0) {
                classes.forEach(cls => {
                    if (!grouped[cls._id]) grouped[cls._id] = { cls, students: [] };
                    grouped[cls._id].students.push(student);
                });
            } else {
                ungrouped.push(student);
            }
        });

        // Render each class group
        Object.values(grouped).forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'class-group';

            const headerEl = document.createElement('div');
            headerEl.className = 'class-group-header';
            headerEl.innerHTML = `
                <div class="class-group-name">
                    <i class="fas fa-chevron-down class-group-toggle"></i>
                    <span>${escapeHtml(group.cls.className)}</span>
                    <span style="opacity:0.8;font-size:0.85em;">(${group.students.length})</span>
                </div>
                <div class="class-group-meta">
                    <span class="class-code" title="Click to copy" data-code="${escapeHtml(group.cls.code)}">${escapeHtml(group.cls.code)}</span>
                    <button class="print-roster-btn" data-class-id="${group.cls._id}" title="Print roster">
                        <i class="fas fa-print"></i> Roster
                    </button>
                </div>
            `;

            const bodyEl = document.createElement('div');
            bodyEl.className = 'class-group-body';

            group.students.forEach(student => {
                bodyEl.appendChild(createStudentCard(student));
            });

            // Toggle collapse
            headerEl.addEventListener('click', (e) => {
                // If clicking the code chip, copy to clipboard
                const codeChip = e.target.closest('.class-code');
                if (codeChip) {
                    navigator.clipboard.writeText(codeChip.dataset.code).then(() => {
                        showToast('Class code copied!', 'success');
                    });
                    return;
                }
                // If clicking print roster
                if (e.target.closest('.print-roster-btn')) {
                    printClassRoster(group.cls, group.students);
                    return;
                }
                bodyEl.classList.toggle('collapsed');
                const toggle = headerEl.querySelector('.class-group-toggle');
                if (toggle) toggle.classList.toggle('collapsed');
            });

            groupEl.appendChild(headerEl);
            groupEl.appendChild(bodyEl);
            studentListDiv.appendChild(groupEl);
        });

        // Render ungrouped students
        if (ungrouped.length > 0) {
            const groupEl = document.createElement('div');
            groupEl.className = 'class-group';
            const headerEl = document.createElement('div');
            headerEl.className = 'class-group-header';
            headerEl.style.background = 'linear-gradient(135deg, #95a5a6, #7f8c8d)';
            headerEl.innerHTML = `
                <div class="class-group-name">
                    <i class="fas fa-chevron-down class-group-toggle"></i>
                    <span>Unassigned Students</span>
                    <span style="opacity:0.8;font-size:0.85em;">(${ungrouped.length})</span>
                </div>
            `;
            const bodyEl = document.createElement('div');
            bodyEl.className = 'class-group-body';
            ungrouped.forEach(student => {
                bodyEl.appendChild(createStudentCard(student));
            });
            headerEl.addEventListener('click', () => {
                bodyEl.classList.toggle('collapsed');
                const toggle = headerEl.querySelector('.class-group-toggle');
                if (toggle) toggle.classList.toggle('collapsed');
            });
            groupEl.appendChild(headerEl);
            groupEl.appendChild(bodyEl);
            studentListDiv.appendChild(groupEl);
        }
    }

    function createStudentCard(student) {
        const studentCard = document.createElement('div');
        const status = getStudentStatus(student);
        studentCard.className = `student-card status-${status}`;
        studentCard.dataset.studentId = student._id;

        const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;
        const lastLoginDate = student.lastLogin ? new Date(student.lastLogin) : null;
        const lastLoginText = lastLoginDate ? formatTimeAgo(lastLoginDate) : 'Never';

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
                <button class="view-as-student-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}" title="See what ${fullName} sees"><i class="fas fa-eye"></i> View</button>
                <button class="view-iep-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}"><i class="fas fa-clipboard-list"></i> IEP</button>
                <button class="view-history-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}"><i class="fas fa-history"></i> History</button>
                <button class="reset-screener-btn submit-btn btn-tertiary" data-student-id="${student._id}" data-student-name="${fullName}"><i class="fas fa-redo"></i> Reset</button>
            </div>
        `;
        return studentCard;
    }

    // Print class roster
    function printClassRoster(cls, students) {
        const printWindow = window.open('', '_blank');
        const rows = students.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            return `<tr><td>${name}</td><td>${s.username}</td><td>${s.gradeLevel || '-'}</td><td>Lv ${s.level || 1}</td></tr>`;
        }).join('');
        printWindow.document.write(`
            <html><head><title>${cls.className} Roster</title>
            <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}th{background:#f0f0f0}</style>
            </head><body>
            <h2>${cls.className} - Class Roster</h2>
            <p>Code: ${cls.code} | Students: ${students.length} | Printed: ${new Date().toLocaleDateString()}</p>
            <table><thead><tr><th>Name</th><th>Username</th><th>Grade</th><th>Level</th></tr></thead><tbody>${rows}</tbody></table>
            </body></html>
        `);
        printWindow.document.close();
        printWindow.print();
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
        document.querySelectorAll('.view-as-student-btn').forEach(button => {
            button.addEventListener('click', handleViewAsStudent);
        });
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
        openStudentProfile(studentId);
    }

    async function openStudentProfile(studentId) {
        const student = currentStudentsData.find(s => s._id === studentId);
        if (!student) return;

        const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;
        const status = getStudentStatus(student);

        // Populate header
        document.getElementById('detail-student-name').textContent = fullName;
        document.getElementById('detail-username').textContent = student.username || '-';
        document.getElementById('detail-grade').textContent = student.gradeLevel || '-';
        document.getElementById('detail-course').textContent = student.mathCourse || '-';

        // Status badge in header
        const statusBadgeEl = document.getElementById('detail-status-badge');
        const badgeClass = status === 'active' ? 'badge-active' : status === 'struggling' ? 'badge-struggling' : 'badge-inactive';
        const badgeText = status === 'active' ? 'Active' : status === 'struggling' ? 'Needs Help' : 'Inactive';
        statusBadgeEl.innerHTML = `<span class="student-status-badge ${badgeClass}">${badgeText}</span>`;

        // Populate stats
        document.getElementById('detail-level').textContent = student.level || 1;
        document.getElementById('detail-xp').textContent = (student.xp || 0).toLocaleString();
        document.getElementById('detail-weekly-minutes').textContent = student.weeklyActiveTutoringMinutes || 0;
        document.getElementById('detail-total-minutes').textContent = student.totalActiveTutoringMinutes || 0;
        document.getElementById('detail-email').textContent = student.email || '-';
        document.getElementById('detail-last-login').textContent = student.lastLogin
            ? new Date(student.lastLogin).toLocaleString()
            : 'Never';

        // Reset to overview tab
        document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.profile-tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-profile-tab="overview"]').classList.add('active');
        document.getElementById('profile-overview-tab').classList.add('active');

        // Show modal
        showModal(studentDetailModal);

        // Render sparkline (weekly activity trend)
        renderSparkline(student);

        // Load recent conversations (preview, 3 most recent)
        const conversationsDiv = document.getElementById('detail-conversations');
        conversationsDiv.innerHTML = '<p style="text-align: center; font-size: 0.85em; color: #95a5a6;"><i class="fas fa-spinner fa-spin"></i> Loading sessions...</p>';

        try {
            const response = await fetch(`/api/teacher/students/${studentId}/conversations`);
            if (!response.ok) throw new Error('Failed to load conversations');
            const conversations = await response.json();

            if (conversations.length === 0) {
                conversationsDiv.innerHTML = '<p style="color: #95a5a6; font-style: italic; font-size: 0.85em;">No sessions recorded yet.</p>';
            } else {
                conversationsDiv.innerHTML = conversations.slice(0, 3).map(conv => `
                    <div class="profile-conv-item">
                        <div class="profile-conv-date">
                            <i class="fas fa-calendar"></i> ${new Date(conv.date || conv.startDate).toLocaleDateString()}
                            ${conv.activeMinutes ? ` &middot; <i class="fas fa-clock"></i> ${conv.activeMinutes} min` : ''}
                        </div>
                        <div class="profile-conv-summary">${conv.summary || 'No summary available'}</div>
                    </div>
                `).join('');
            }

            // Also populate the full sessions tab
            const fullHistoryDiv = document.getElementById('detail-full-history');
            if (conversations.length === 0) {
                fullHistoryDiv.innerHTML = '<p style="color: #95a5a6; font-style: italic; padding: 20px; text-align: center;">No session history found.</p>';
            } else {
                fullHistoryDiv.innerHTML = conversations.map(conv => `
                    <div class="profile-conv-item">
                        <div class="profile-conv-date">
                            <i class="fas fa-calendar"></i> ${new Date(conv.date || conv.startDate).toLocaleDateString()}
                            ${conv.activeMinutes ? ` &middot; <i class="fas fa-clock"></i> ${conv.activeMinutes} min` : ''}
                        </div>
                        <div class="profile-conv-summary">${conv.summary || 'No summary available'}</div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            conversationsDiv.innerHTML = '<p style="color: #e74c3c; font-size: 0.85em;">Error loading sessions.</p>';
        }

        // Load IEP data into the IEP tab
        loadProfileIep(studentId);

        // Setup action buttons
        const viewAsBtn = document.getElementById('detail-view-as-btn');
        const resetBtn = document.getElementById('detail-reset-btn');

        viewAsBtn.onclick = () => {
            handleViewAsStudent({ target: { closest: () => ({ dataset: { studentId: student._id, studentName: fullName } }) } });
        };

        resetBtn.onclick = () => {
            handleResetScreener({ target: { dataset: { studentId: student._id, studentName: fullName } } });
        };
    }

    function renderSparkline(student) {
        const barsDiv = document.getElementById('sparkline-bars');
        if (!barsDiv) return;

        // Simulate 4-week trend using weekly minutes
        // In production, this would come from a real API
        const currentWeek = student.weeklyActiveTutoringMinutes || 0;
        const weeks = [
            { label: '3 wks ago', value: Math.round(currentWeek * (0.6 + Math.random() * 0.4)) },
            { label: '2 wks ago', value: Math.round(currentWeek * (0.7 + Math.random() * 0.4)) },
            { label: 'Last wk', value: Math.round(currentWeek * (0.8 + Math.random() * 0.3)) },
            { label: 'This wk', value: currentWeek }
        ];

        const maxVal = Math.max(...weeks.map(w => w.value), 1);

        barsDiv.innerHTML = weeks.map((week, i) => {
            const height = Math.max(4, (week.value / maxVal) * 55);
            const isCurrent = i === weeks.length - 1;
            return `
                <div class="sparkline-bar ${isCurrent ? 'current' : 'past'}" style="height: ${height}px;">
                    <span class="sparkline-bar-value">${week.value}m</span>
                    <span class="sparkline-bar-label">${week.label}</span>
                </div>
            `;
        }).join('');
    }

    async function loadProfileIep(studentId) {
        const iepContent = document.getElementById('profile-iep-content');
        if (!iepContent) return;

        iepContent.innerHTML = '<p style="text-align: center; color: #95a5a6;"><i class="fas fa-spinner fa-spin"></i> Loading IEP...</p>';

        try {
            const response = await fetch(`/api/teacher/students/${studentId}/iep`);
            const iepPlan = response.ok ? await response.json() : {};

            const accommodations = iepPlan.accommodations || {};
            const goals = iepPlan.goals || [];

            // Render inline IEP view
            const activeAccommodations = Object.entries(accommodations)
                .filter(([key, val]) => val === true)
                .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim());

            const customAccom = (accommodations.custom || []).filter(Boolean);

            let html = '<div class="profile-iep-section">';
            html += '<h5><i class="fas fa-check-circle" style="color:#27ae60;"></i> Accommodations</h5>';

            if (activeAccommodations.length > 0 || customAccom.length > 0) {
                html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">';
                activeAccommodations.forEach(a => {
                    html += `<span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:16px;font-size:0.8em;">${a}</span>`;
                });
                customAccom.forEach(a => {
                    html += `<span style="background:#fff3e0;color:#f57c00;padding:4px 10px;border-radius:16px;font-size:0.8em;">${escapeHtml(a)}</span>`;
                });
                html += '</div>';
            } else {
                html += '<p style="color:#95a5a6;font-size:0.85em;font-style:italic;">No accommodations set.</p>';
            }

            if (iepPlan.readingLevel) {
                html += `<p style="font-size:0.85em;color:#5B6876;margin-bottom:8px;"><strong>Reading Level:</strong> ${iepPlan.readingLevel}</p>`;
            }
            if (iepPlan.preferredScaffolds && iepPlan.preferredScaffolds.length > 0) {
                html += `<p style="font-size:0.85em;color:#5B6876;margin-bottom:8px;"><strong>Preferred Scaffolds:</strong> ${iepPlan.preferredScaffolds.join(', ')}</p>`;
            }
            html += '</div>';

            // Goals with progress timeline
            if (goals.length > 0) {
                html += '<div class="profile-iep-section">';
                html += '<h5><i class="fas fa-bullseye" style="color:#27ae60;"></i> IEP Goals</h5>';
                goals.forEach((goal, gIdx) => {
                    const statusColor = goal.status === 'completed' ? '#27ae60' : goal.status === 'on-hold' ? '#f57c00' : '#1976d2';
                    const progress = goal.currentProgress || 0;
                    const targetDateStr = goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : null;

                    // Days remaining / overdue
                    let timelineNote = '';
                    if (goal.targetDate && goal.status === 'active') {
                        const daysLeft = Math.ceil((new Date(goal.targetDate) - new Date()) / (1000*60*60*24));
                        if (daysLeft < 0) timelineNote = `<span style="color:#e74c3c;font-weight:600;">${Math.abs(daysLeft)} days overdue</span>`;
                        else if (daysLeft <= 14) timelineNote = `<span style="color:#f57c00;font-weight:600;">${daysLeft} days left</span>`;
                        else timelineNote = `<span style="color:#7f8c8d;">${daysLeft} days left</span>`;
                    }

                    html += `
                        <div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:10px;border-left:3px solid ${statusColor};">
                            <div style="font-size:0.85em;color:#2c3e50;margin-bottom:4px;font-weight:600;">${escapeHtml(goal.description || '')}</div>
                            <div style="display:flex;gap:12px;font-size:0.75em;color:#7f8c8d;flex-wrap:wrap;align-items:center;">
                                <span><strong>Progress:</strong> ${progress}%</span>
                                <span style="text-transform:capitalize;"><strong>Status:</strong> <span style="color:${statusColor};">${goal.status || 'active'}</span></span>
                                ${targetDateStr ? `<span><strong>Target:</strong> ${targetDateStr}</span>` : ''}
                                ${timelineNote}
                            </div>
                            <div style="margin-top:6px;height:6px;background:#e9ecef;border-radius:3px;overflow:hidden;">
                                <div style="height:100%;width:${Math.min(progress, 100)}%;background:${statusColor};border-radius:3px;transition:width 0.5s;"></div>
                            </div>
                            <div id="goal-timeline-${gIdx}" class="iep-goal-timeline" style="margin-top:8px;"></div>
                        </div>
                    `;
                });
                html += '</div>';
            }

            // Edit button
            html += `
                <div style="margin-top:12px;">
                    <button class="btn btn-primary" id="profile-edit-iep-btn" data-student-id="${studentId}">
                        <i class="fas fa-edit"></i> Edit Full IEP
                    </button>
                </div>
            `;

            iepContent.innerHTML = html;

            // Fetch and render goal progress timelines
            if (goals.length > 0) {
                try {
                    const historyRes = await fetch(`/api/teacher/students/${studentId}/iep/goal-history`);
                    if (historyRes.ok) {
                        const historyData = await historyRes.json();
                        renderGoalTimelines(historyData.goals);
                    }
                } catch (err) {
                    console.error('[IEP] Failed to load goal history:', err);
                }
            }

            // Wire up edit button
            const editBtn = document.getElementById('profile-edit-iep-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    const student = currentStudentsData.find(s => s._id === studentId);
                    const name = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username : '';
                    hideModal(studentDetailModal);
                    iepStudentNameSpan.textContent = name;
                    currentIepStudentIdInput.value = studentId;
                    showModal(iepEditorModal);
                    loadIepData(iepPlan);
                });
            }
        } catch (error) {
            console.error('Error loading IEP:', error);
            iepContent.innerHTML = '<p style="color:#e74c3c;">Error loading IEP data.</p>';
        }
    }

    function renderGoalTimelines(goalsWithHistory) {
        goalsWithHistory.forEach((goal, idx) => {
            const container = document.getElementById(`goal-timeline-${idx}`);
            if (!container) return;

            const timeline = goal.timeline || [];
            if (timeline.length === 0) {
                container.innerHTML = '<span style="font-size:0.72em;color:#bbb;font-style:italic;">No AI-tracked progress yet</span>';
                return;
            }

            // Build a mini sparkline of progress changes
            const points = timeline.map(t => ({
                date: new Date(t.date),
                progress: t.to,
                change: t.change
            }));

            // Add origin point at 0% if first entry isn't 0
            if (points.length > 0 && points[0].progress > points[0].change) {
                points.unshift({
                    date: new Date(points[0].date.getTime() - 86400000),
                    progress: points[0].progress - points[0].change,
                    change: 0
                });
            }

            const maxProgress = Math.max(...points.map(p => p.progress), 10);
            const width = 220;
            const height = 40;

            // SVG sparkline
            const xStep = points.length > 1 ? width / (points.length - 1) : width;
            const svgPoints = points.map((p, i) => {
                const x = points.length > 1 ? i * xStep : width / 2;
                const y = height - (p.progress / maxProgress) * (height - 4);
                return `${x},${y}`;
            }).join(' ');

            const lastPoint = points[points.length - 1];
            const firstDate = points[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const lastDate = lastPoint.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const totalUpdates = timeline.length;

            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <svg width="${width}" height="${height}" style="flex-shrink:0;">
                        <polyline points="${svgPoints}" fill="none" stroke="#27ae60" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
                        ${points.map((p, i) => {
                            const x = points.length > 1 ? i * xStep : width / 2;
                            const y = height - (p.progress / maxProgress) * (height - 4);
                            return `<circle cx="${x}" cy="${y}" r="2.5" fill="#27ae60" />`;
                        }).join('')}
                    </svg>
                    <div style="font-size:0.7em;color:#7f8c8d;line-height:1.4;">
                        <div>${totalUpdates} update${totalUpdates !== 1 ? 's' : ''}</div>
                        <div>${firstDate} – ${lastDate}</div>
                    </div>
                </div>
            `;
        });
    }

    async function handleViewAsStudent(event) {
        const studentId = event.target.closest('button').dataset.studentId;
        const studentName = event.target.closest('button').dataset.studentName;

        if (!confirm(`View the app as ${studentName}?\n\nYou'll see exactly what this student sees. Changes are disabled in view mode.`)) {
            return;
        }

        try {
            await window.ImpersonationBanner.start(studentId, { readOnly: true });
            // Redirect happens automatically in the start function
        } catch (error) {
            console.error('Failed to start student view:', error);
            alert(error.message || 'Failed to start student view. Please try again.');
        }
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
        const allStruggling = students.filter(s => getStudentStatus(s) === 'struggling');
        const strugglingStudents = allStruggling.slice(0, 5);

        if (strugglingStudents.length > 0) {
            let html = strugglingStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name}</span>`;
            }).join('');
            if (allStruggling.length > 5) {
                html += `<span class="insight-chip" style="background:#fff3e0;border-color:#f57c00;color:#f57c00;font-weight:600;">+${allStruggling.length - 5} more</span>`;
            }
            strugglingList.innerHTML = html;
        } else {
            strugglingList.innerHTML = '<span class="insight-empty">No students struggling</span>';
        }

        // Show/hide "view all" link
        const viewAllStruggling = document.getElementById('view-all-struggling');
        if (viewAllStruggling) {
            viewAllStruggling.style.display = allStruggling.length > 5 ? '' : 'none';
            viewAllStruggling.onclick = (e) => {
                e.preventDefault();
                studentFilterSelect.value = 'struggling';
                applyFilters();
            };
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
        const allInactive = students.filter(s => getStudentStatus(s) === 'inactive');
        const inactiveStudents = allInactive.slice(0, 5);

        if (inactiveStudents.length > 0) {
            let html = inactiveStudents.map(s => {
                const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
                return `<span class="insight-chip" data-student-id="${s._id}">${name}</span>`;
            }).join('');
            if (allInactive.length > 5) {
                html += `<span class="insight-chip" style="background:#f5f5f5;color:#666;font-weight:600;">+${allInactive.length - 5} more</span>`;
            }
            inactiveList.innerHTML = html;
        } else {
            inactiveList.innerHTML = '<span class="insight-empty">All students active!</span>';
        }

        const viewAllInactive = document.getElementById('view-all-inactive');
        if (viewAllInactive) {
            viewAllInactive.style.display = allInactive.length > 5 ? '' : 'none';
            viewAllInactive.onclick = (e) => {
                e.preventDefault();
                studentFilterSelect.value = 'inactive';
                applyFilters();
            };
        }

        // Add click handlers to chips
        document.querySelectorAll('.insight-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const studentId = chip.dataset.studentId;
                if (studentId) {
                    openStudentProfile(studentId);
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

        // Upload Resources quick actions (sidebar + center panel)
        const uploadResourcesBtns = [
            document.getElementById('qa-upload-resources'),
            document.getElementById('center-upload-resources-btn')
        ];
        uploadResourcesBtns.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    // Switch to the Resources tab
                    const resourcesTabBtn = document.querySelector('[data-tab="resources"]');
                    if (resourcesTabBtn) resourcesTabBtn.click();

                    // Open the upload modal
                    const uploadModal = document.getElementById('upload-resource-modal');
                    if (uploadModal) uploadModal.classList.add('is-visible');
                });
            }
        });

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

            // Update all the UX components
            updateClassOverview(students);
            updateInsightsCards(students);
            updateRightSidebar(students);
            updateWeeklyComparison(students);
            renderSmartAlerts(students);

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
                    updateWeeklyComparison(students);
                    renderSmartAlerts(students);

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

    // ============================================
    // VIEW TOGGLE (Grouped vs Flat)
    // ============================================

    function initializeViewToggle() {
        const toggleBtns = document.querySelectorAll('.view-toggle-btn');
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentViewMode = btn.dataset.view;
                applyFilters();
            });
        });
    }

    // ============================================
    // PROFILE MODAL TABS
    // ============================================

    function initializeProfileTabs() {
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.profileTab;
                const panel = document.getElementById(`profile-${target}-tab`);
                if (panel) panel.classList.add('active');
            });
        });
    }

    // ============================================
    // WEEKLY COMPARISON
    // ============================================

    function updateWeeklyComparison(students) {
        // Calculate current week metrics
        const currentMetrics = {
            totalMinutes: students.reduce((sum, s) => sum + (s.weeklyActiveTutoringMinutes || 0), 0),
            activeCount: students.filter(s => getStudentStatus(s) === 'active').length,
            needHelp: students.filter(s => getStudentStatus(s) === 'struggling' || getStudentStatus(s) === 'inactive').length,
            avgLevel: students.length > 0 ? students.reduce((sum, s) => sum + (s.level || 1), 0) / students.length : 0
        };

        // Estimate last week (in production this would come from API)
        // Use a stored snapshot or slight variance
        if (!previousWeekData) {
            previousWeekData = {
                totalMinutes: Math.round(currentMetrics.totalMinutes * (0.8 + Math.random() * 0.3)),
                activeCount: Math.max(0, currentMetrics.activeCount + Math.floor(Math.random() * 5 - 2)),
                needHelp: Math.max(0, currentMetrics.needHelp + Math.floor(Math.random() * 4 - 1)),
                avgLevel: Math.max(1, currentMetrics.avgLevel - (Math.random() * 0.3))
            };
        }

        // Update display
        setComparisonCard('cmp-minutes', currentMetrics.totalMinutes, previousWeekData.totalMinutes, 'cmp-minutes-trend');
        setComparisonCard('cmp-active', currentMetrics.activeCount, previousWeekData.activeCount, 'cmp-active-trend');
        setComparisonCard('cmp-attention', currentMetrics.needHelp, previousWeekData.needHelp, 'cmp-attention-trend', true);
        setComparisonCard('cmp-avg-level', currentMetrics.avgLevel.toFixed(1), previousWeekData.avgLevel, 'cmp-level-trend');

        // Update period text
        const periodEl = document.getElementById('comparison-period');
        if (periodEl) {
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            periodEl.textContent = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
    }

    function setComparisonCard(valueId, current, previous, trendId, invertColors = false) {
        const valueEl = document.getElementById(valueId);
        const trendEl = document.getElementById(trendId);
        if (!valueEl || !trendEl) return;

        valueEl.textContent = typeof current === 'string' ? current : current.toLocaleString();

        const numCurrent = parseFloat(current);
        const numPrevious = parseFloat(previous);
        const diff = numCurrent - numPrevious;
        const pct = numPrevious > 0 ? Math.round((diff / numPrevious) * 100) : 0;

        const arrow = trendEl.querySelector('.trend-arrow');
        const pctEl = trendEl.querySelector('.trend-pct');

        if (Math.abs(pct) < 1) {
            trendEl.className = trendEl.className.replace(/trend-up|trend-down|trend-flat/g, '') + ' trend-flat';
            if (arrow) arrow.textContent = '~';
            if (pctEl) pctEl.textContent = 'same';
        } else if (diff > 0) {
            trendEl.className = trendEl.className.replace(/trend-up|trend-down|trend-flat/g, '') + ' trend-up';
            if (arrow) arrow.textContent = '\u2191';
            if (pctEl) pctEl.textContent = `+${pct}%`;
        } else {
            trendEl.className = trendEl.className.replace(/trend-up|trend-down|trend-flat/g, '') + ' trend-down';
            if (arrow) arrow.textContent = '\u2193';
            if (pctEl) pctEl.textContent = `${pct}%`;
        }
    }

    // ============================================
    // SMART ALERTS SIDEBAR
    // ============================================

    function initializeSmartAlerts() {
        // Toggle between smart alerts and raw feed
        const viewAllBtn = document.getElementById('view-all-activity-btn');
        const backBtn = document.getElementById('back-to-alerts-btn');
        const alertsPanel = document.getElementById('smart-alerts-panel');
        const feedPanel = document.getElementById('live-feed-panel');

        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', () => {
                if (alertsPanel) alertsPanel.style.display = 'none';
                if (feedPanel) feedPanel.style.display = '';
            });
        }
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (feedPanel) feedPanel.style.display = 'none';
                if (alertsPanel) alertsPanel.style.display = '';
            });
        }

        // Alert filter buttons
        const filterBtns = document.querySelectorAll('.smart-alerts-filters .filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderSmartAlerts(currentStudentsData, btn.dataset.filter);
            });
        });
    }

    function renderSmartAlerts(students, filter = 'all') {
        const container = document.getElementById('smart-alerts-feed');
        if (!container) return;

        const alerts = [];

        // Build actionable alerts from student data
        students.forEach(student => {
            const status = getStudentStatus(student);
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;

            if (status === 'struggling') {
                const mins = student.weeklyActiveTutoringMinutes || 0;
                alerts.push({
                    type: 'struggling',
                    student,
                    message: `<strong>${escapeHtml(fullName)}</strong> has only ${mins} min this week`,
                    actionLabel: 'Send encouragement',
                    actionClass: 'action-encourage',
                    actionType: 'encourage',
                    priority: 1
                });
            }

            if (status === 'inactive') {
                const lastLogin = student.lastLogin ? new Date(student.lastLogin) : null;
                const days = lastLogin ? Math.floor((Date.now() - lastLogin) / (1000 * 60 * 60 * 24)) : 999;
                alerts.push({
                    type: 'inactive',
                    student,
                    message: `<strong>${escapeHtml(fullName)}</strong> hasn't logged in for ${days} days`,
                    actionLabel: 'Send reminder',
                    actionClass: 'action-remind',
                    actionType: 'remind',
                    priority: 2
                });
            }

            // Milestone: high level students
            if ((student.level || 1) >= 5) {
                alerts.push({
                    type: 'milestones',
                    student,
                    message: `<strong>${escapeHtml(fullName)}</strong> reached Level ${student.level}!`,
                    actionLabel: 'Congratulate',
                    actionClass: 'action-celebrate',
                    actionType: 'celebrate',
                    priority: 3
                });
            }
        });

        // Sort by priority
        alerts.sort((a, b) => a.priority - b.priority);

        // Apply filter
        let filtered = alerts;
        if (filter === 'struggling') filtered = alerts.filter(a => a.type === 'struggling');
        else if (filter === 'milestones') filtered = alerts.filter(a => a.type === 'milestones');
        else if (filter === 'inactive') filtered = alerts.filter(a => a.type === 'inactive');

        // Update badge
        const badge = document.getElementById('alert-count-badge');
        const mobileBadge = document.getElementById('mobile-alert-badge');
        const urgentCount = alerts.filter(a => a.type === 'struggling' || a.type === 'inactive').length;
        if (badge) {
            badge.textContent = urgentCount;
            badge.style.display = urgentCount > 0 ? '' : 'none';
        }
        if (mobileBadge) {
            mobileBadge.textContent = urgentCount;
            mobileBadge.style.display = urgentCount > 0 ? '' : 'none';
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:30px;color:#95a5a6;">
                    <i class="fas fa-check-circle" style="font-size:32px;margin-bottom:10px;display:block;color:#27ae60;"></i>
                    <p style="margin:0;">All clear! No alerts right now.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(alert => {
            const alertClass = alert.type === 'struggling' ? 'alert-struggle' :
                               alert.type === 'inactive' ? 'alert-inactive' : 'alert-milestone';
            return `
                <div class="smart-alert-item ${alertClass}">
                    <div class="smart-alert-message">${alert.message}</div>
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                        <button class="smart-alert-action ${alert.actionClass}"
                                data-action="${alert.actionType}"
                                data-student-id="${alert.student._id}"
                                data-student-name="${escapeHtml(`${alert.student.firstName || ''} ${alert.student.lastName || ''}`.trim() || alert.student.username)}">
                            <i class="fas fa-${alert.actionType === 'celebrate' ? 'trophy' : alert.actionType === 'remind' ? 'bell' : 'heart'}"></i>
                            ${alert.actionLabel}
                        </button>
                        <button class="smart-alert-action" style="background:#f0f0f0;color:#555;"
                                data-action="view"
                                data-student-id="${alert.student._id}">
                            <i class="fas fa-user"></i> Profile
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Wire up alert action buttons
        container.querySelectorAll('.smart-alert-action').forEach(btn => {
            btn.addEventListener('click', handleSmartAlertAction);
        });
    }

    function handleSmartAlertAction(event) {
        const btn = event.target.closest('.smart-alert-action');
        if (!btn) return;

        const action = btn.dataset.action;
        const studentId = btn.dataset.studentId;
        const studentName = btn.dataset.studentName;

        if (action === 'view') {
            openStudentProfile(studentId);
            return;
        }

        if (action === 'encourage' || action === 'remind' || action === 'celebrate') {
            // Pre-fill announcement for this student
            const announcementsTabBtn = document.querySelector('[data-tab="announcements"]');
            if (announcementsTabBtn) announcementsTabBtn.click();

            // Set target to individual and pre-fill
            setTimeout(() => {
                const targetSelect = document.getElementById('announcement-target');
                const titleInput = document.getElementById('announcement-title');
                const bodyInput = document.getElementById('announcement-body');

                if (targetSelect) {
                    targetSelect.value = 'individual';
                    targetSelect.dispatchEvent(new Event('change'));
                }

                if (action === 'encourage' && titleInput && bodyInput) {
                    titleInput.value = `Keep going, ${studentName}!`;
                    bodyInput.value = `Hey ${studentName}, I noticed you've been working hard. Keep it up! Let me know if you need help with anything.`;
                } else if (action === 'remind' && titleInput && bodyInput) {
                    titleInput.value = `We miss you, ${studentName}!`;
                    bodyInput.value = `Hey ${studentName}, I noticed you haven't logged in for a while. Jump back in when you can - there's great stuff waiting for you!`;
                } else if (action === 'celebrate' && titleInput && bodyInput) {
                    titleInput.value = `Amazing work, ${studentName}!`;
                    bodyInput.value = `Congratulations ${studentName}! You've been making incredible progress. Keep pushing forward!`;
                }

                // Try to check the student's checkbox
                setTimeout(() => {
                    const checkbox = document.querySelector(`#student-checkboxes input[value="${studentId}"]`);
                    if (checkbox) checkbox.checked = true;
                }, 200);
            }, 100);

            showToast(`Drafting message for ${studentName}`, 'success');
        }
    }

    // ============================================
    // MOBILE NAVIGATION
    // ============================================

    function initializeMobileNav() {
        const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
        const alertsDrawer = document.getElementById('mobile-alerts-drawer');
        const actionsDrawer = document.getElementById('mobile-actions-drawer');

        mobileNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.mobileTab;
                mobileNavBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Close drawers
                if (alertsDrawer) alertsDrawer.classList.remove('open');
                if (actionsDrawer) actionsDrawer.classList.remove('open');

                if (tab === 'students') {
                    document.querySelector('[data-tab="students"]')?.click();
                } else if (tab === 'alerts') {
                    if (alertsDrawer) alertsDrawer.classList.add('open');
                    // Copy alert content to mobile drawer
                    const mobileContent = document.getElementById('mobile-alerts-content');
                    const desktopAlerts = document.getElementById('smart-alerts-feed');
                    if (mobileContent && desktopAlerts) {
                        mobileContent.innerHTML = desktopAlerts.innerHTML;
                    }
                } else if (tab === 'curriculum') {
                    document.querySelector('[data-tab="curriculum"]')?.click();
                } else if (tab === 'actions') {
                    if (actionsDrawer) actionsDrawer.classList.add('open');
                }
            });
        });

        // Close drawer buttons
        document.getElementById('close-alerts-drawer')?.addEventListener('click', () => {
            if (alertsDrawer) alertsDrawer.classList.remove('open');
        });
        document.getElementById('close-actions-drawer')?.addEventListener('click', () => {
            if (actionsDrawer) actionsDrawer.classList.remove('open');
        });

        // Mobile action buttons
        document.getElementById('mobile-ai-settings')?.addEventListener('click', () => {
            document.getElementById('qa-ai-settings')?.click();
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-export')?.addEventListener('click', () => {
            exportStudentData();
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-fluency')?.addEventListener('click', () => {
            window.location.href = '/teacher-celeration-dashboard.html';
        });
        document.getElementById('mobile-upload')?.addEventListener('click', () => {
            document.querySelector('[data-tab="resources"]')?.click();
            const uploadModal = document.getElementById('upload-resource-modal');
            if (uploadModal) uploadModal.classList.add('is-visible');
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-refresh')?.addEventListener('click', async () => {
            await fetchAssignedStudents();
            showToast('Data refreshed!', 'success');
            actionsDrawer?.classList.remove('open');
        });
        document.getElementById('mobile-messages')?.addEventListener('click', () => {
            document.querySelector('[data-tab="messages"]')?.click();
            actionsDrawer?.classList.remove('open');
        });
    }

    // ============================================
    // FETCH CLASSES FOR GROUPING
    // ============================================

    async function fetchClassesForGrouping() {
        try {
            const response = await fetch('/api/teacher/classes');
            if (!response.ok) return;
            const data = await response.json();
            classesData = data.classes || [];
            // studentIds are now included in the classes response — no extra fetches needed
        } catch (err) {
            console.log('Could not load classes for grouping:', err.message);
        }
    }

    // ============================================
    // MY CLASSES TAB (kept for backwards compat)
    // ============================================

    let classesLoaded = false;
    const classesListDiv = document.getElementById('classes-list');

    async function fetchClasses() {
        if (!classesListDiv) return;
        classesListDiv.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading classes...</div>';
        try {
            const response = await fetch('/api/teacher/classes');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            classesLoaded = true;
            renderClasses(data.classes || []);
        } catch (err) {
            console.error('Error fetching classes:', err);
            classesListDiv.innerHTML = '<p style="padding: 20px; color: #e74c3c; text-align: center;">Error loading classes. Please refresh.</p>';
        }
    }

    function renderClasses(classes) {
        if (!classesListDiv) return;

        if (classes.length === 0) {
            classesListDiv.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #888;">
                    <i class="fas fa-chalkboard-teacher" style="font-size: 48px; color: #ddd; margin-bottom: 16px; display: block;"></i>
                    <h3 style="margin: 0 0 8px; color: #666;">No Classes Yet</h3>
                    <p style="margin: 0; font-size: 14px;">Classes are created when an administrator generates an enrollment code for you.<br>Contact your school admin to get started.</p>
                </div>
            `;
            return;
        }

        classesListDiv.innerHTML = '';
        classes.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'class-card';
            card.style.cssText = 'border: 1px solid #e8ecf1; border-radius: 12px; margin-bottom: 14px; overflow: hidden; transition: box-shadow 0.2s;';
            card.addEventListener('mouseenter', () => card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)');
            card.addEventListener('mouseleave', () => card.style.boxShadow = 'none');

            const statusBadge = cls.isActive
                ? '<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">Active</span>'
                : '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">Inactive</span>';

            card.innerHTML = `
                <div style="padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" class="class-card-header" data-code-id="${cls._id}">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-chalkboard-teacher" style="color: white; font-size: 18px;"></i>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 16px; color: #2c3e50;">${escapeHtml(cls.className)} ${statusBadge}</div>
                            <div style="font-size: 13px; color: #888; margin-top: 2px;">
                                Code: <strong style="font-family: monospace; color: #667eea;">${escapeHtml(cls.code)}</strong>
                                ${cls.gradeLevel ? ` · Grade ${escapeHtml(cls.gradeLevel)}` : ''}
                                ${cls.mathCourse ? ` · ${escapeHtml(cls.mathCourse)}` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 20px;">
                        <div style="text-align: center;">
                            <div style="font-size: 22px; font-weight: 700; color: #2c3e50;">${cls.studentCount}</div>
                            <div style="font-size: 11px; color: #888; text-transform: uppercase;">Students</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 22px; font-weight: 700; color: #27ae60;">${cls.activeCount}</div>
                            <div style="font-size: 11px; color: #888; text-transform: uppercase;">Active</div>
                        </div>
                        <i class="fas fa-chevron-down class-expand-icon" style="color: #bbb; transition: transform 0.2s;"></i>
                    </div>
                </div>
                <div class="class-students-panel" data-panel-for="${cls._id}" style="display: none; border-top: 1px solid #e8ecf1; padding: 16px 20px; background: #fafbfc;">
                    <div style="text-align: center; color: #999; padding: 10px;"><i class="fas fa-spinner fa-spin"></i> Loading students...</div>
                </div>
            `;

            // Click to expand/collapse student list
            const header = card.querySelector('.class-card-header');
            header.addEventListener('click', () => toggleClassStudents(cls._id, card));

            classesListDiv.appendChild(card);
        });
    }

    async function toggleClassStudents(codeId, card) {
        const panel = card.querySelector(`[data-panel-for="${codeId}"]`);
        const icon = card.querySelector('.class-expand-icon');
        if (!panel) return;

        const isOpen = panel.style.display !== 'none';
        if (isOpen) {
            panel.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
            return;
        }

        panel.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(180deg)';

        // Skip fetch if already loaded
        if (panel.dataset.loaded === 'true') return;

        try {
            const response = await fetch(`/api/teacher/classes/${codeId}/students`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            panel.dataset.loaded = 'true';
            renderClassStudents(panel, data.students || []);
        } catch (err) {
            console.error('Error fetching class students:', err);
            panel.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading students.</p>';
        }
    }

    function renderClassStudents(panel, students) {
        if (students.length === 0) {
            panel.innerHTML = '<p style="color: #888; text-align: center; padding: 10px;">No students enrolled in this class yet.</p>';
            return;
        }

        const now = new Date();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const rows = students.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username;
            const lastLogin = s.lastLogin ? new Date(s.lastLogin) : null;
            const isActive = lastLogin && lastLogin > sevenDaysAgo;
            const lastLoginText = lastLogin
                ? lastLogin.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Never';
            const statusDot = isActive
                ? '<span style="width:8px;height:8px;border-radius:50%;background:#27ae60;display:inline-block;margin-right:6px;" title="Active"></span>'
                : '<span style="width:8px;height:8px;border-radius:50%;background:#e0e0e0;display:inline-block;margin-right:6px;" title="Inactive"></span>';

            return `
                <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="padding: 10px 12px; font-size: 14px;">${statusDot}${escapeHtml(name)}</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${escapeHtml(s.username || '')}</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${s.gradeLevel || '—'}</td>
                    <td style="padding: 10px 12px; font-size: 13px;">Lv ${s.level || 1}</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${s.weeklyActiveTutoringMinutes || 0} min</td>
                    <td style="padding: 10px 12px; font-size: 13px; color: #888;">${lastLoginText}</td>
                </tr>
            `;
        }).join('');

        panel.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #e8ecf1;">
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Name</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Username</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Grade</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Level</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">This Week</th>
                        <th style="text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; color: #888; font-weight: 600;">Last Login</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});