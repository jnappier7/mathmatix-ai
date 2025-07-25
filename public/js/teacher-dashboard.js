// public/js/teacher-dashboard.js
// MODIFIED: Verified to correctly consume data from the updated /api/teacher/.../conversations route.

document.addEventListener("DOMContentLoaded", async () => {
    const studentListDiv = document.getElementById("student-list");
    const logoutBtn = document.getElementById("logoutBtn");

    // IEP Editor Elements
    const iepEditorModal = document.getElementById("iep-editor-modal");
    const iepStudentNameSpan = document.getElementById("iep-student-name");
    const currentIepStudentIdInput = document.getElementById("current-iep-student-id");
    const saveIepBtn = document.getElementById("save-iep-btn");
    const closeIepModalBtn = document.getElementById("close-iep-modal-btn");

    // IEP Form Elements
    const iepAccommodations = {
        extendedTime: document.getElementById("extendedTime"),
        simplifiedInstructions: document.getElementById("simplifiedInstructions"),
        frequentCheckIns: document.getElementById("iepFrequentCheckIns"),
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
    const closeHistoryModalBtn = document.getElementById("close-history-modal-btn");

    // --- Initial Load ---
    await fetchAssignedStudents();

    // --- Modal Control Functions ---
    function showModal(modalElement) {
        if (modalElement) modalElement.style.display = 'flex';
    }

    function hideModal(modalElement) {
        if (modalElement) modalElement.style.display = 'none';
    }
    
    // Setup all modal close buttons
    [
        { btn: document.getElementById("iepModalCloseBtn"), modal: iepEditorModal },
        { btn: closeIepModalBtn, modal: iepEditorModal },
        { btn: document.getElementById("cancel-iep-edit-btn"), modal: iepEditorModal },
        { btn: document.getElementById("conversationModalCloseBtn"), modal: conversationHistoryModal },
        { btn: closeHistoryModalBtn, modal: conversationHistoryModal }
    ].forEach(item => {
        if (item.btn) item.btn.addEventListener('click', () => hideModal(item.modal));
    });

    window.addEventListener('click', (event) => {
        if (event.target === iepEditorModal) hideModal(iepEditorModal);
        if (event.target === conversationHistoryModal) hideModal(conversationHistoryModal);
    });

    // --- IEP Form Logic ---
    const loadIepData = (iepPlan = {}) => {
        const accommodations = iepPlan.accommodations || {};
        Object.keys(iepAccommodations).forEach(key => {
            if(iepAccommodations[key]) iepAccommodations[key].checked = accommodations[key] || false;
        });
        if(readingLevelInput) readingLevelInput.value = iepPlan.readingLevel || '';
        if(preferredScaffoldsInput) preferredScaffoldsInput.value = (iepPlan.preferredScaffolds || []).join(', ');
        if(iepGoalsList) {
            iepGoalsList.innerHTML = '';
            (iepPlan.goals || []).forEach(goal => addIepGoalToUI(goal));
        }
    };

    const getIepDataFromForm = () => {
        const goals = Array.from(iepGoalsList.querySelectorAll('.iep-goal-item')).map(item => ({
            description: item.querySelector('.goal-description').value,
            targetDate: item.querySelector('.goal-target-date').value,
            currentProgress: parseFloat(item.querySelector('.goal-progress').value) || 0,
            measurementMethod: item.querySelector('.goal-method').value,
            status: item.querySelector('.goal-status').value,
        }));
        return {
            accommodations: Object.fromEntries(Object.entries(iepAccommodations).map(([key, el]) => [key, el.checked])),
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
            const response = await fetch(`/api/teacher/students/${studentId}/iep`, {
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
            renderStudentList(students);
        } catch (error) {
            console.error("Failed to fetch students:", error);
            studentListDiv.innerHTML = "<p>Error loading student data. Please refresh.</p>";
        }
    }

    function renderStudentList(students) {
        studentListDiv.innerHTML = '';
        if (students.length === 0) {
            studentListDiv.innerHTML = "<p>No students have been assigned to you. Please contact an administrator.</p>";
            return;
        }
        students.forEach(student => {
            const studentCard = document.createElement('div');
            studentCard.className = 'student-card';
            const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;
            studentCard.innerHTML = `
                <strong>${fullName}</strong>
                <p>Username: ${student.username}</p>
                <p>Grade: ${student.gradeLevel || 'N/A'}</p>
                <div class="card-buttons">
                    <button class="view-iep-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}">View/Edit IEP</button>
                    <button class="view-history-btn submit-btn" data-student-id="${student._id}" data-student-name="${fullName}">View History</button>
                </div>
            `;
            studentListDiv.appendChild(studentCard);
        });
        addEventListenersToButtons();
    }

    function addEventListenersToButtons() {
        document.querySelectorAll('.view-iep-btn').forEach(button => {
            button.addEventListener('click', handleViewIep);
        });
        document.querySelectorAll('.view-history-btn').forEach(button => {
            button.addEventListener('click', handleViewHistory);
        });
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
});