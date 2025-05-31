document.addEventListener("DOMContentLoaded", async () => {
    const userListDiv = document.getElementById("user-list");
    const logoutBtn = document.getElementById("logoutBtn");

    // IEP Editor Elements
    const iepEditorModal = document.getElementById("iep-editor-modal");
    const iepEditorContent = document.getElementById("iep-editor-content");
    const iepStudentNameSpan = document.getElementById("iep-student-name");
    const currentIepStudentIdInput = document.getElementById("current-iep-student-id");
    const saveIepBtn = document.getElementById("save-iep-btn");
    const cancelIepEditBtn = document.getElementById("cancel-iep-edit-btn");
    const iepModalCloseBtn = document.getElementById("iepModalCloseBtn"); // 'x' close button at top
    const closeIepModalBtn = document.getElementById("close-iep-modal-btn"); // New 'Close' button at bottom

    // IEP Form Elements
    const iepAccommodations = {
        extendedTime: document.getElementById("extendedTime"),
        simplifiedInstructions: document.getElementById("simplifiedInstructions"),
        frequentCheckIns: document.getElementById("frequentCheckIns"),
        visualSupport: document.getElementById("visualSupport"),
        chunking: document.getElementById("chunking"),
        reducedDistraction: document.getElementById("reducedDistraction"),
        mathAnxiety: document.getElementById("mathAnxiety")
    };
    const readingLevelInput = document.getElementById("readingLevel");
    const preferredScaffoldsInput = document.getElementById("preferredScaffolds");
    const iepGoalsList = document.getElementById("iep-goals-list");
    const addIepGoalBtn = document.getElementById("add-iep-goal-btn");

    // Assign Teacher Elements
    const assignTeacherModal = document.getElementById("assign-teacher-modal");
    const assignTeacherContent = document.getElementById("assign-teacher-content");
    const assignStudentNameSpan = document.getElementById("assign-student-name");
    const currentAssignStudentIdInput = document.getElementById("current-assign-student-id");
    const teacherSelect = document.getElementById("teacher-select");
    const saveAssignmentBtn = document.getElementById("save-assignment-btn");
    const cancelAssignmentBtn = document.getElementById("cancel-assignment-btn");
    const assignModalCloseBtn = document.getElementById("assignModalCloseBtn"); // 'x' close button at top
    const closeAssignModalBtn = document.getElementById("close-assign-modal-btn"); // New 'Close' button at bottom

    // Conversation History Elements
    const conversationHistoryModal = document.getElementById("conversation-history-modal");
    const historyStudentNameSpan = document.getElementById("history-student-name");
    const conversationsListDiv = document.getElementById("conversations-list");
    const conversationModalCloseBtn = document.getElementById("conversationModalCloseBtn"); // 'x' close button at top
    const closeHistoryModalBtn = document.getElementById("close-history-modal-btn"); // Existing 'Close' button at bottom

    let allTeachers = [];


    // --- Initial Load ---
    await fetchAllData();


    // Basic Logout Functionality
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            fetch("/logout")
                .then(() => {
                    localStorage.clear();
                    window.location.href = "/login.html";
                })
                .catch((err) => {
                    console.error("Logout failed:", err);
                    alert("Logout failed. Please try again.");
                });
        });
    }

    // --- Modal Control Functions ---
    function showModal(modalElement) {
        modalElement.style.display = 'flex'; // Use flex to center content
    }

    function hideModal(modalElement) {
        modalElement.style.display = 'none';
    }

    // Close buttons for modals (both 'x' at top and 'Close' at bottom)
    if (iepModalCloseBtn) {
        iepModalCloseBtn.addEventListener('click', () => hideModal(iepEditorModal));
    }
    if (closeIepModalBtn) { // Listener for the new 'Close' button
        closeIepModalBtn.addEventListener('click', () => hideModal(iepEditorModal));
    }

    if (assignModalCloseBtn) {
        assignModalCloseBtn.addEventListener('click', () => hideModal(assignTeacherModal));
    }
    if (closeAssignModalBtn) { // Listener for the new 'Close' button
        closeAssignModalBtn.addEventListener('click', () => hideModal(assignTeacherModal));
    }

    if (conversationModalCloseBtn) {
        conversationModalCloseBtn.addEventListener('click', () => hideModal(conversationHistoryModal));
    }
    if (closeHistoryModalBtn) { // Listener for the existing 'Close' button
        closeHistoryModalBtn.addEventListener('click', () => hideModal(conversationHistoryModal));
    }

    // Close modals if click outside content (on overlay)
    window.addEventListener('click', (event) => {
        if (event.target === iepEditorModal) {
            hideModal(iepEditorModal);
        }
        if (event.target === assignTeacherModal) {
            hideModal(assignTeacherModal);
        }
        if (event.target === conversationHistoryModal) {
            hideModal(conversationHistoryModal);
        }
    });


    // --- IEP Form Functions ---
    const loadIepData = (iepPlan) => {
        Object.keys(iepAccommodations).forEach(key => {
            iepAccommodations[key].checked = iepPlan[key] || false;
        });
        readingLevelInput.value = iepPlan.readingLevel || '';
        preferredScaffoldsInput.value = (iepPlan.preferredScaffolds || []).join(', ');

        iepGoalsList.innerHTML = '';
        (iepPlan.goals || []).forEach((goal) => {
            addIepGoalToUI(goal);
        });
    };

    const getIepData = () => {
        const currentGoals = [];
        iepGoalsList.querySelectorAll('.iep-goal-item').forEach(item => {
            currentGoals.push({
                description: item.querySelector('.goal-description').value,
                targetDate: item.querySelector('.goal-target-date').value,
                currentProgress: parseFloat(item.querySelector('.goal-progress').value) || 0,
                measurementMethod: item.querySelector('.goal-method').value,
                status: item.querySelector('.goal-status').value,
            });
        });

        const preferredScaffoldsArray = preferredScaffoldsInput.value
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        return {
            extendedTime: iepAccommodations.extendedTime.checked,
            simplifiedInstructions: iepAccommodations.simplifiedInstructions.checked,
            frequentCheckIns: iepAccommodations.frequentCheckIns.checked,
            visualSupport: iepAccommodations.visualSupport.checked,
            chunking: iepAccommodations.chunking.checked,
            reducedDistraction: iepAccommodations.reducedDistraction.checked,
            mathAnxiety: iepAccommodations.mathAnxiety.checked,
            readingLevel: parseFloat(readingLevelInput.value) || null,
            preferredScaffolds: preferredScaffoldsArray,
            goals: currentGoals
        };
    };

    const addIepGoalToUI = (goal = {}) => {
        const li = document.createElement('li');
        li.className = 'iep-goal-item';
        li.innerHTML = `
            <label>Description:</label>
            <textarea class="goal-description" rows="2" required>${goal.description || ''}</textarea>
            <label>Target Date:</label>
            <input type="date" class="goal-target-date" value="${goal.targetDate ? goal.targetDate.substring(0, 10) : ''}" />
            <label>Current Progress (%):</label>
            <input type="number" class="goal-progress" min="0" max="100" value="${goal.currentProgress || 0}" />
            <label>Measurement Method:</label>
            <input type="text" class="goal-method" value="${goal.measurementMethod || ''}" />
            <label>Status:</label>
            <select class="goal-status">
                <option value="active" ${goal.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="on-hold" ${goal.status === 'on-hold' ? 'selected' : ''}>On-Hold</option>
            </select>
            <button class="remove-goal-btn">Remove Goal</button>
            <hr>
        `;
        iepGoalsList.appendChild(li);

        li.querySelector('.remove-goal-btn').addEventListener('click', () => {
            li.remove();
        });
    };

    addIepGoalBtn.addEventListener('click', () => addIepGoalToUI());

    // --- Save IEP Button Handler ---
    if (saveIepBtn) {
        saveIepBtn.addEventListener('click', async () => {
            const studentId = currentIepStudentIdInput.value;
            if (!studentId) {
                alert("No student selected for IEP update.");
                return;
            }

            const updatedIepPlan = getIepData();

            try {
                const response = await fetch(`/api/admin/students/${studentId}/iep`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedIepPlan)
                });

                if (!response.ok) {
                    throw new Error(`Failed to save IEP: ${response.statusText}`);
                }

                const result = await response.json();
                alert(result.message || "IEP saved successfully!");
                hideModal(iepEditorModal);
                await fetchUsers();
            } catch (error) {
                console.error("Error saving IEP data:", error);
                alert("Failed to save IEP data. Please try again.");
            }
        });
    }

    // --- Cancel IEP Edit Button Handler ---
    if (cancelIepEditBtn) {
        cancelIepEditBtn.addEventListener('click', () => {
            hideModal(iepEditorModal);
            loadIepData({});
        });
    }

    // --- User List Loading & Display ---
    async function fetchUsers() {
        userListDiv.innerHTML = 'Loading users...';
        try {
            const response = await fetch("/api/admin/users");
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = "/login.html";
                } else if (response.status === 403) {
                    userListDiv.innerHTML = "<p>Access Denied. You are not authorized to view this page.</p>";
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const users = await response.json();

            if (users.length === 0) {
                userListDiv.innerHTML = "<p>No users found.</p>";
                return;
            }

            userListDiv.innerHTML = '';

            users.forEach(user => {
                const userCard = document.createElement('div');
                userCard.className = 'user-card';

                const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
                const displayName = fullName || user.username;
                const roleDisplay = user.role.charAt(0).toUpperCase() + user.role.slice(1);
                const gradeDisplay = user.gradeLevel ? `Grade: ${user.gradeLevel}` : 'Grade: N/A';

                let teacherAssignment = '';
                if (user.role === 'student') {
                    const assignedTeacher = allTeachers.find(t => t._id === user.teacherId);
                    teacherAssignment = `<p>Assigned Teacher: ${assignedTeacher ? `${assignedTeacher.firstName} ${assignedTeacher.lastName}` : 'None'}</p>`;
                }

                userCard.innerHTML = `
                    <strong>${displayName}</strong>
                    <p>Username: ${user.username}</p>
                    <p>Role: ${roleDisplay}</p>
                    ${user.role === 'student' ? `<p>${gradeDisplay}</p>${teacherAssignment}` : ''}
                    <div class="card-buttons">
                        ${user.role === 'student' ? `
                            <button class="view-iep-btn submit-btn" data-student-id="${user._id}" data-student-name="${displayName}">View/Edit IEP</button>
                            <button class="assign-teacher-btn submit-btn" data-student-id="${user._id}" data-student-name="${displayName}" data-current-teacher-id="${user.teacherId || ''}">Assign Teacher</button>
                            <button class="view-history-btn submit-btn" data-student-id="${user._id}" data-student-name="${displayName}">View History</button>
                        ` : ''}
                    </div>
                `;
                userListDiv.appendChild(userCard);
            });

            addIepButtonListeners();
            addAssignTeacherButtonListeners();
            addHistoryButtonListeners();

        } catch (error) {
            console.error("Failed to fetch users:", error);
            userListDiv.innerHTML = "<p>Error loading user data.</p>";
        }
    }

    // --- Fetch Teachers for Assignment Dropdown ---
    async function fetchTeachers() {
        try {
            const response = await fetch("/api/admin/teachers");
            if (!response.ok) {
                throw new Error(`Failed to fetch teachers: ${response.statusText}`);
            }
            allTeachers = await response.json();
        } catch (error) {
            console.error("Error fetching teachers:", error);
            allTeachers = [];
        }
    }

    // --- Populate Teacher Select Dropdown ---
    function populateTeacherSelect(currentTeacherId) {
        teacherSelect.innerHTML = '<option value="">-- Unassign Teacher --</option>';
        allTeachers.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher._id;
            option.textContent = `${teacher.firstName} ${teacher.lastName}`;
            if (teacher._id === currentTeacherId) {
                option.selected = true;
            }
            teacherSelect.appendChild(option);
        });
    }

    // --- Event Listeners for Dynamically Created Buttons ---
    function addIepButtonListeners() {
        document.querySelectorAll('.view-iep-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const studentId = event.target.dataset.studentId;
                const studentName = event.target.dataset.studentName;

                iepStudentNameSpan.textContent = studentName;
                currentIepStudentIdInput.value = studentId;
                showModal(iepEditorModal);

                hideModal(assignTeacherModal);
                hideModal(conversationHistoryModal);

                try {
                    const iepResponse = await fetch(`/api/admin/students/${studentId}/iep`);
                    if (!iepResponse.ok) {
                        throw new Error(`Failed to fetch IEP data: ${iepResponse.statusText}`);
                    }
                    const iepPlan = await iepResponse.json();
                    loadIepData(iepPlan);
                } catch (error) {
                    console.error("Error loading IEP data:", error);
                    alert("Failed to load IEP data for this student. Please try again.");
                    loadIepData({});
                }
            });
        });
    }

    function addAssignTeacherButtonListeners() {
        document.querySelectorAll('.assign-teacher-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const studentId = event.target.dataset.studentId;
                const studentName = event.target.dataset.studentName;
                const currentTeacherId = event.target.dataset.currentTeacherId;

                assignStudentNameSpan.textContent = studentName;
                currentAssignStudentIdInput.value = studentId;
                populateTeacherSelect(currentTeacherId);
                showModal(assignTeacherModal);

                hideModal(iepEditorModal);
                hideModal(conversationHistoryModal);
            });
        });
    }

    // --- NEW: Conversation History Button Listener ---
    function addHistoryButtonListeners() {
        document.querySelectorAll('.view-history-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const studentId = event.target.dataset.studentId;
                const studentName = event.target.dataset.studentName;

                historyStudentNameSpan.textContent = studentName;
                showModal(conversationHistoryModal);

                hideModal(iepEditorModal);
                hideModal(assignTeacherModal);

                conversationsListDiv.innerHTML = 'Loading conversation summaries...';

                try {
                    const response = await fetch(`/api/admin/students/${studentId}/conversations`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch conversations: ${response.statusText}`);
                    }
                    const conversations = await response.json();

                    if (conversations.length === 0) {
                        conversationsListDiv.innerHTML = "<p>No conversation history found for this student.</p>";
                        return;
                    }

                    let historyHtml = '';
                    conversations.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by newest first
                    conversations.forEach(convo => {
                        const dateObj = new Date(convo.date);
                        const formattedDate = dateObj.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric',
                            hour12: true
                        });
                        historyHtml += `
                            <div class="conversation-card">
                                <h4>Session on <span class="session-date">${formattedDate}</span></h4>
                                <p>${convo.summary || 'No summary available.'}</p>
                            </div>
                        `;
                    });
                    conversationsListDiv.innerHTML = historyHtml;

                } catch (error) {
                    console.error("Error loading conversation history:", error);
                    conversationsListDiv.innerHTML = "<p>Error loading conversation history.</p>";
                }
            });
        });
    }

    // --- Save Assignment Button Handler ---
    if (saveAssignmentBtn) {
        saveAssignmentBtn.addEventListener('click', async () => {
            const studentId = currentAssignStudentIdInput.value;
            const newTeacherId = teacherSelect.value === '' ? null : teacherSelect.value;

            if (!studentId) {
                alert("No student selected for assignment.");
                return;
            }

            try {
                const response = await fetch(`/api/admin/students/${studentId}/assign-teacher`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teacherId: newTeacherId })
                });

                if (!response.ok) {
                    throw new Error(`Failed to save assignment: ${response.statusText}`);
                }

                const result = await response.json();
                alert(result.message || "Assignment saved successfully!");
                hideModal(assignTeacherModal);
                await fetchUsers();
            } catch (error) {
                console.error("Error saving assignment:", error);
                alert("Failed to save assignment. Please try again.");
            }
        });
    }

    // --- Cancel Assignment Button Handler ---
    if (cancelAssignmentBtn) {
        cancelAssignmentBtn.addEventListener('click', () => {
            hideModal(assignTeacherModal);
        });
    }

    // --- Initial Data Fetch on Page Load ---
    async function fetchAllData() {
        await fetchTeachers();
        await fetchUsers();
    }
});