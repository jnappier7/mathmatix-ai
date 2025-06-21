// FULL MERGED, SURGICALLY EDITED admin-dashboard.js

document.addEventListener("DOMContentLoaded", async () => {
  const teacherSelect = document.getElementById("teacherSelect");
  const assignButton = document.getElementById("assignButton");
  const studentSearch = document.getElementById("studentSearch");
  const userTableBody = document.getElementById("userTableBody");

  // Modal elements
  const studentDetailModal = document.getElementById("studentDetailModal");
  const closeModalButton = document.getElementById("closeModalButton");
  const saveChangesButton = document.getElementById("saveChangesButton");
  const cancelButton = document.getElementById("cancelButton");

  const modalStudentName = document.getElementById("modalStudentName");
  const modalStudentId = document.getElementById("modalStudentId"); // Hidden input for student ID

  // Profile form fields
  const studentProfileForm = document.getElementById("studentProfileForm");
  const modalFirstName = document.getElementById("modalFirstName");
  const modalLastName = document.getElementById("modalLastName");
  const modalUsername = document.getElementById("modalUsername");
  const modalEmail = document.getElementById("modalEmail");
  const modalGradeLevel = document.getElementById("modalGradeLevel");
  const modalMathCourse = document.getElementById("modalMathCourse");
  const modalTonePreference = document.getElementById("modalTonePreference");
  const modalLearningStyle = document.getElementById("modalLearningStyle");
  const modalInterests = document.getElementById("modalInterests");

  // IEP form fields
  const studentIepForm = document.getElementById("studentIepForm");
  const iepExtendedTime = document.getElementById("iepExtendedTime");
  const iepSimplifiedInstructions = document.getElementById("iepSimplifiedInstructions");
  const iepFrequentCheckIns = document.getElementById("iepFrequentCheckIns");
  const iepVisualSupport = document.getElementById("iepVisualSupport");
  const iepChunking = document.getElementById("iepChunking");
  const iepReducedDistraction = document.getElementById("iepReducedDistraction");
  const iepReadingLevel = document.getElementById("iepReadingLevel");
  const iepMathAnxiety = document.getElementById("iepMathAnxiety");
  const iepPreferredScaffolds = document.getElementById("iepPreferredScaffolds");
  const iepGoalsList = document.getElementById("iepGoalsList"); // For displaying goals

  // Usage Info display fields
  const totalActiveTutoringMinutes = document.getElementById("totalActiveTutoringMinutes");
  const weeklyActiveTutoringMinutes = document.getElementById("weeklyActiveTutoringMinutes");
  const xpDisplay = document.getElementById("xpDisplay");
  const levelDisplay = document.getElementById("levelDisplay");
  const lastLoginDisplay = document.getElementById("lastLoginDisplay");
  const createdAtDisplay = document.getElementById("createdAtDisplay");
  const conversationSummariesList = document.getElementById("conversationSummariesList");


  let students = []; // This will hold the comprehensive student data
  let teachers = [];

  // --- Modal Functions ---
  function openModal() {
    studentDetailModal.style.display = 'flex'; // Use flex to center
  }

  function closeModal() {
    studentDetailModal.style.display = 'none';
    // Clear form fields (optional, but good for next open)
    studentProfileForm.reset();
    studentIepForm.reset();
    iepGoalsList.innerHTML = '';
    conversationSummariesList.innerHTML = '';
  }

  // --- Fetch Data Functions ---
  async function fetchUsers() {
    try {
      const res = await fetch("/admin/users"); // This endpoint now fetches all fields needed
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to fetch users.');
      }
      const data = await res.json();
      students = data.filter(user => user.role === "student");
      teachers = data.filter(user => user.role === "teacher");
      renderTeacherOptions();
      renderStudents();
    } catch (error) {
      console.error("Error fetching users:", error);
      alert(`Error loading users: ${error.message}`);
    }
  }

  // --- Render UI Functions ---
  function renderTeacherOptions() {
    teacherSelect.innerHTML = "<option value=''>Select teacher</option>";
    teachers.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t._id;
      opt.textContent = `${t.firstName} ${t.lastName}`; // Use firstName and lastName for teacher display
      teacherSelect.appendChild(opt);
    });
  }

  function renderStudents() {
    const query = studentSearch.value.toLowerCase();
    userTableBody.innerHTML = "";
    students
      .filter(s =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        s.username.toLowerCase().includes(query) // Allow search by username too
      )
      .forEach(s => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td><input type="checkbox" class="selectStudent" value="${s._id}" /></td>
          <td><span class="student-name-clickable" data-student-id="${s._id}">${s.firstName} ${s.lastName}</span></td>
          <td>${s.email}</td>
          <td>${s.role}</td>
          <td>${getTeacherName(s.teacherId)}</td>
        `;
        userTableBody.appendChild(row);
      });
  }

  function getTeacherName(id) {
    const teacher = teachers.find(t => t._id === id);
    return teacher ? `${teacher.firstName} ${teacher.lastName}` : "None";
  }

  function formatDate(dateString) {
      if (!dateString) return 'N/A';
      const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      return new Date(dateString).toLocaleDateString(undefined, options);
  }

  // --- Populate Modal with Student Data ---
  async function populateModal(studentId) {
    const student = students.find(s => s._id === studentId);
    if (!student) {
      alert("Student data not found.");
      closeModal();
      return;
    }

    modalStudentId.value = student._id;
    modalStudentName.textContent = `${student.firstName} ${student.lastName} Profile`;

    // Populate General Profile Form
    modalFirstName.value = student.firstName || '';
    modalLastName.value = student.lastName || '';
    modalUsername.value = student.username || '';
    modalEmail.value = student.email || '';
    modalGradeLevel.value = student.gradeLevel || '';
    modalMathCourse.value = student.mathCourse || '';
    modalTonePreference.value = student.tonePreference || '';
    modalLearningStyle.value = student.learningStyle || '';
    modalInterests.value = (student.interests && Array.isArray(student.interests)) ? student.interests.join(', ') : '';

    // Populate IEP Form
    const iep = student.iepPlan || {};
    iepExtendedTime.checked = iep.extendedTime || false;
    iepSimplifiedInstructions.checked = iep.simplifiedInstructions || false;
    iepFrequentCheckIns.checked = iep.frequentCheckIns || false;
    iepVisualSupport.checked = iep.visualSupport || false;
    iepChunking.checked = iep.chunking || false;
    iepReducedDistraction.checked = iep.reducedDistraction || false;
    iepReadingLevel.value = iep.readingLevel || '';
    iepMathAnxiety.checked = iep.mathAnxiety || false;
    iepPreferredScaffolds.value = (iep.preferredScaffolds && Array.isArray(iep.preferredScaffolds)) ? iep.preferredScaffolds.join(', ') : '';

    // Display IEP Goals (read-only for now)
    iepGoalsList.innerHTML = ''; // Clear previous goals
    if (iep.goals && iep.goals.length > 0) {
      iep.goals.forEach((goal, index) => {
        const goalDiv = document.createElement('div');
        goalDiv.innerHTML = `
          <strong>Goal ${index + 1}:</strong> ${goal.description} <br>
          <em>Target:</em> ${goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : 'N/A'},
          <em>Progress:</em> ${goal.currentProgress || 0}%,
          <em>Status:</em> ${goal.status || 'N/A'}
        `;
        iepGoalsList.appendChild(goalDiv);
      });
    } else {
      iepGoalsList.textContent = 'No IEP goals defined.';
    }

    // Populate Usage Info
    totalActiveTutoringMinutes.textContent = student.totalActiveTutoringMinutes !== undefined ? student.totalActiveTutoringMinutes : '0';
    weeklyActiveTutoringMinutes.textContent = student.weeklyActiveTutoringMinutes !== undefined ? student.weeklyActiveTutoringMinutes : '0';
    xpDisplay.textContent = student.xp !== undefined ? student.xp : '0';
    levelDisplay.textContent = student.level !== undefined ? student.level : '1';
    lastLoginDisplay.textContent = formatDate(student.lastLogin);
    createdAtDisplay.textContent = formatDate(student.createdAt);

    // Populate Conversation Summaries
    conversationSummariesList.innerHTML = ''; // Clear previous summaries
    if (student.conversations && student.conversations.length > 0) {
      student.conversations.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by most recent
      student.conversations.forEach((session, index) => {
        const sessionDiv = document.createElement('div');
        sessionDiv.classList.add('conversation-item');
        const sessionDate = new Date(session.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        sessionDiv.innerHTML = `
          <strong>Session Date:</strong> ${sessionDate}<br>
          <strong>Summary:</strong> ${session.summary || 'No summary provided.'}<br>
          <strong>Active Minutes:</strong> ${session.activeMinutes !== undefined ? session.activeMinutes : 'N/A'}
        `;
        conversationSummariesList.appendChild(sessionDiv);
      });
    } else {
      conversationSummariesList.textContent = 'No conversation history available.';
    }

    openModal();
  }

  // --- Save Changes Functionality ---
  async function saveStudentChanges() {
    const studentId = modalStudentId.value;
    if (!studentId) {
      alert("Error: No student ID found for saving.");
      return;
    }

    const currentStudentData = students.find(s => s._id === studentId);
    if (!currentStudentData) {
        alert("Error: Current student data not found for comparison.");
        return;
    }

    let profileChanged = false;
    const profileUpdates = {};
    if (modalFirstName.value !== currentStudentData.firstName) { profileUpdates.firstName = modalFirstName.value; profileChanged = true; }
    if (modalLastName.value !== currentStudentData.lastName) { profileUpdates.lastName = modalLastName.value; profileChanged = true; }
    // Username is readonly, email could be changed (requires backend validation)
    if (modalEmail.value !== currentStudentData.email) { profileUpdates.email = modalEmail.value; profileChanged = true; }
    if (modalGradeLevel.value !== currentStudentData.gradeLevel) { profileUpdates.gradeLevel = modalGradeLevel.value; profileChanged = true; }
    if (modalMathCourse.value !== currentStudentData.mathCourse) { profileUpdates.mathCourse = modalMathCourse.value; profileChanged = true; }
    if (modalTonePreference.value !== currentStudentData.tonePreference) { profileUpdates.tonePreference = modalTonePreference.value; profileChanged = true; }
    if (modalLearningStyle.value !== currentStudentData.learningStyle) { profileUpdates.learningStyle = modalLearningStyle.value; profileChanged = true; }
    const newInterests = modalInterests.value.split(',').map(s => s.trim()).filter(s => s);
    const currentInterests = currentStudentData.interests || [];
    // Simple array comparison, might need more robust for complex cases
    if (JSON.stringify(newInterests) !== JSON.stringify(currentInterests)) {
        profileUpdates.interests = newInterests;
        profileChanged = true;
    }


    let iepChanged = false;
    const iepUpdates = {};
    const currentIep = currentStudentData.iepPlan || {};

    const iepCheckboxes = {
        extendedTime: iepExtendedTime,
        simplifiedInstructions: iepSimplifiedInstructions,
        frequentCheckIns: iepFrequentCheckIns,
        visualSupport: iepVisualSupport,
        chunking: iepChunking,
        reducedDistraction: iepReducedDistraction,
        mathAnxiety: iepMathAnxiety
    };
    for (const key in iepCheckboxes) {
        if (iepCheckboxes[key].checked !== (currentIep[key] || false)) {
            iepUpdates[key] = iepCheckboxes[key].checked;
            iepChanged = true;
        }
    }

    const newReadingLevel = iepReadingLevel.value ? parseFloat(iepReadingLevel.value) : null;
    if (newReadingLevel !== (currentIep.readingLevel || null)) {
        iepUpdates.readingLevel = newReadingLevel;
        iepChanged = true;
    }

    const newPreferredScaffolds = iepPreferredScaffolds.value.split(',').map(s => s.trim()).filter(s => s);
    const currentPreferredScaffolds = currentIep.preferredScaffolds || [];
    if (JSON.stringify(newPreferredScaffolds) !== JSON.stringify(currentPreferredScaffolds)) {
        iepUpdates.preferredScaffolds = newPreferredScaffolds;
        iepChanged = true;
    }


    const fetchPromises = [];

    if (profileChanged) {
        console.log("Profile changes detected:", profileUpdates);
        fetchPromises.push(fetch(`/admin/students/${studentId}/profile`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileUpdates)
        }));
    }

    if (iepChanged) {
        console.log("IEP changes detected:", iepUpdates);
        fetchPromises.push(fetch(`/admin/students/${studentId}/iep`, {
            method: 'PUT', // IEP uses PUT
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(iepUpdates)
        }));
    }

    if (fetchPromises.length === 0) {
        alert("No changes detected. Nothing to save.");
        closeModal();
        return;
    }

    try {
        const results = await Promise.all(fetchPromises);
        let allSuccessful = true;
        for (const res of results) {
            if (!res.ok) {
                allSuccessful = false;
                const errorData = await res.json();
                console.error('Save failed:', errorData.message || res.statusText);
                alert(`Failed to save some changes: ${errorData.message || res.statusText}`);
                break; // Stop on first error
            }
        }

        if (allSuccessful) {
            alert("Student details updated successfully!");
            await fetchUsers(); // Re-fetch all data to ensure table is up-to-date
            closeModal();
        }
    } catch (error) {
        console.error("Error saving student details:", error);
        alert(`Error saving changes: ${error.message}`);
    }
  }


  // --- Event Listeners ---
  studentSearch.addEventListener("input", renderStudents);

  assignButton.addEventListener("click", async () => {
    const selectedIds = [...document.querySelectorAll(".selectStudent:checked")].map(
      input => input.value
    );
    const teacherId = teacherSelect.value;

    if (selectedIds.length === 0) {
      return alert("Please select students to assign.");
    }
    if (!teacherId) {
      const confirmUnassign = confirm("No teacher selected. Do you want to unassign selected students?");
      if (!confirmUnassign) return;
    }

    try {
      const res = await fetch("/admin/assign-teacher", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds: selectedIds, teacherId: teacherId || null })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to assign teacher(s).');
      }

      alert("Students assigned successfully!");
      await fetchUsers();
    } catch (error) {
      console.error("Error assigning teacher:", error);
      alert(`Error: ${error.message}`);
    }
  });

  // Listener for student name clicks (delegated)
  userTableBody.addEventListener('click', async (event) => {
    const target = event.target;
    if (target.classList.contains('student-name-clickable')) {
      const studentId = target.dataset.studentId;
      await populateModal(studentId);
    }
  });

  // Modal button listeners
  closeModalButton.addEventListener('click', closeModal);
  cancelButton.addEventListener('click', closeModal);
  saveChangesButton.addEventListener('click', saveStudentChanges);

  // Close modal if clicking outside content
  studentDetailModal.addEventListener('click', (event) => {
    if (event.target === studentDetailModal) {
      closeModal();
    }
  });

  // Initial fetch of users when the page loads
  fetchUsers();
});