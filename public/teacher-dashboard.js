document.addEventListener("DOMContentLoaded", async () => {
    const studentListDiv = document.getElementById("student-list");
    const logoutBtn = document.getElementById("logoutBtn");

    // IEP Editor Elements
    const iepEditorModal = document.getElementById("iep-editor-modal");
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

    // Conversation History Elements
    const conversationHistoryModal = document.getElementById("conversation-history-modal");
    const historyStudentNameSpan = document.getElementById("history-student-name");
    const conversationsListDiv = document.getElementById("conversations-list");
    const conversationModalCloseBtn = document.getElementById("conversationModalCloseBtn"); // 'x' close button at top
    const closeHistoryModalBtn = document.getElementById("close-history-modal-btn"); // 'Close' button at bottom
	
	// --- Initial Load ---
    // This call is now inside the correct DOMContentLoaded scope.
    await fetchAssignedStudents();


    // Basic Logout Functionality
    // This listener is now within the correct DOMContentLoaded scope.
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
        modalElement.style.display = 'flex';
    }

    function hideModal(modalElement) {
        modalElement.style.display = 'none';
    }

    // Close buttons for modals (both 'x' at top and 'Close' at bottom)
    if (iepModalCloseBtn) {
        iepModalCloseBtn.addEventListener('click', () => hideModal(iepEditorModal));
    }
    if (closeIepModalBtn) {
        closeIepModalBtn.addEventListener('click', () => hideModal(iepEditorModal));
    }

    if (conversationModalCloseBtn) {
        conversationModalCloseBtn.addEventListener('click', () => hideModal(conversationHistoryModal));
    }
    if (closeHistoryModalBtn) {
        closeHistoryModalBtn.addEventListener('click', () => hideModal(conversationHistoryModal));
    }

    // Close modals if click outside content (on overlay)
    window.addEventListener('click', (event) => {
        if (event.target === iepEditorModal) {
            hideModal(iepEditorModal);
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
                const response = await fetch(`/api/teacher/students/${studentId}/iep`, {
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
                await fetchAssignedStudents();

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
	
	// --- Student List Loading & Display ---
    async function fetchAssignedStudents() {
        studentListDiv.innerHTML = 'Loading students...';
        try {
            const response = await fetch("/api/teacher/students");
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = "/login.html";
                } else if (response.status === 403) {
                    studentListDiv.innerHTML = "<p>Access Denied. You are not authorized to view this page.</p>";
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const students = await response.json();

            if (students.length === 0) {
                studentListDiv.innerHTML = "<p>No students assigned to you yet. Please contact an administrator to assign students.</p>";
                return;
            }

            studentListDiv.innerHTML = ''; // Clear previous list

            students.forEach(student => {
                const studentCard = document.createElement('div');
                studentCard.className = 'student-card';

                const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
                const displayName = fullName || student.username;
                const gradeDisplay = student.gradeLevel ? `Grade: ${student.gradeLevel}` : 'Grade: N/A';

                studentCard.innerHTML = `
                    <strong>${displayName}</strong>
                    <p>Username: ${student.username}</p>
                    <p>${gradeDisplay}</p>
                    <div class="card-buttons">
                        <button class="view-iep-btn submit-btn" data-student-id="${student._id}" data-student-name="${displayName}">View/Edit IEP</button>
                        <button class="view-history-btn submit-btn" data-student-id="${student._id}" data-student-name="${displayName}">View History</button>
                    </div>
                `;
                studentListDiv.appendChild(studentCard);
            });

            addIepButtonListeners();
            addHistoryButtonListeners();

        } catch (error) {
            console.error("Failed to fetch students:", error);
            studentListDiv.innerHTML = "<p>Error loading student data.</p>";
        }
    }

    // --- NEW: Conversation History Button Listener ---
    function addHistoryButtonListeners() {
        document.querySelectorAll('.view-history-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const studentId = event.target.dataset.studentId;
                const studentName = event.target.dataset.studentName;

                historyStudentNameSpan.textContent = studentName;
                showModal(conversationHistoryModal);

                hideModal(iepEditorModal); // Hide IEP modal if open

                conversationsListDiv.innerHTML = 'Loading conversation summaries...';

                try {
                    const response = await fetch(`/api/teacher/students/${studentId}/conversations`);
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

    // --- Event Listeners for Dynamically Created Buttons (IEP for Teacher Dashboard) ---
    function addIepButtonListeners() {
        document.querySelectorAll('.view-iep-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const studentId = event.target.dataset.studentId;
                const studentName = event.target.dataset.studentName;

                iepStudentNameSpan.textContent = studentName;
                currentIepStudentIdInput.value = studentId;
                showModal(iepEditorModal);

                hideModal(conversationHistoryModal); // Hide history modal if open

                try {
                    const iepResponse = await fetch(`/api/teacher/students/${studentId}/iep`);
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
}); // Correctly closes the DOMContentLoaded event listener