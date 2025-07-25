// public/js/admin-dashboard.js
// MODIFIED: Updated to fetch conversation history on-demand when a student modal is opened.

document.addEventListener("DOMContentLoaded", async () => {
    // Initial user role check to secure the page
    try {
        const userResponse = await fetch('/user', { credentials: 'include' });
        if (!userResponse.ok) throw new Error("Not authenticated");
        const userData = await userResponse.json();
        if (!userData.user || userData.user.role !== 'admin') {
            throw new Error("Access Denied");
        }
    } catch (err) {
        window.location.href = '/login.html';
        return;
    }

    // --- Element Selectors ---
    const teacherSelect = document.getElementById("teacherSelect");
    const assignButton = document.getElementById("assignButton");
    const studentSearch = document.getElementById("studentSearch");
    const userTableBody = document.getElementById("userTableBody");
    const studentDetailModal = document.getElementById("studentDetailModal");
    const closeModalButton = document.getElementById("closeModalButton");
    const saveChangesButton = document.getElementById("saveChangesButton");
    const cancelButton = document.getElementById("cancelButton");
    const modalStudentName = document.getElementById("modalStudentName");
    const modalStudentId = document.getElementById("modalStudentId");
    const conversationSummariesList = document.getElementById("conversationSummariesList");

    let allUsers = [];
    let teachers = [];
    let students = [];

    // --- Modal Logic ---
    const openModal = () => studentDetailModal && (studentDetailModal.style.display = 'flex');
    const closeModal = () => studentDetailModal && (studentDetailModal.style.display = 'none');

    // --- Data Fetching ---
    async function fetchAllData() {
        try {
            const [usersRes, teachersRes] = await Promise.all([
                fetch('/api/admin/users', { credentials: 'include' }),
                fetch('/api/admin/teachers', { credentials: 'include' })
            ]);

            if (!usersRes.ok || !teachersRes.ok) throw new Error('Failed to load initial data.');

            allUsers = await usersRes.json();
            teachers = await teachersRes.json();
            students = allUsers.filter(u => u.role === 'student');

            renderTeacherOptions();
            renderStudents();
        } catch (error) {
            console.error("Error fetching data:", error);
            if(userTableBody) userTableBody.innerHTML = `<tr><td colspan="5">Error loading data. Please refresh.</td></tr>`;
        }
    }
    
    // --- Rendering Functions ---
    function renderTeacherOptions() {
        if (!teacherSelect) return;
        teacherSelect.innerHTML = '<option value="">Unassign</option>';
        teachers.forEach(teacher => {
            const option = document.createElement('option');
            option.value = teacher._id;
            option.textContent = `${teacher.firstName} ${teacher.lastName}`;
            teacherSelect.appendChild(option);
        });
    }

    function renderStudents() {
        if (!userTableBody) return;
        const query = studentSearch ? studentSearch.value.toLowerCase() : "";
        userTableBody.innerHTML = "";
        
        const filteredStudents = students.filter(s =>
            `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(query) ||
            (s.email && s.email.toLowerCase().includes(query)) ||
            (s.username && s.username.toLowerCase().includes(query))
        );

        if (filteredStudents.length === 0) {
            userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No students found.</td></tr>`;
            return;
        }

        filteredStudents.forEach(s => {
            const row = document.createElement("tr");
            row.dataset.studentid = s._id; // Add studentId to the row for event delegation
            row.innerHTML = `
                <td><input type="checkbox" class="select-student" value="${s._id}"></td>
                <td><a href="#" class="student-name-link">${s.firstName} ${s.lastName}</a></td>
                <td>${s.email || 'N/A'}</td>
                <td>${s.role}</td>
                <td>${getTeacherNameById(s.teacherId)}</td>
            `;
            userTableBody.appendChild(row);
        });
    }
    
    function getTeacherNameById(teacherId) {
        if (!teacherId) return 'N/A';
        const teacher = teachers.find(t => t._id === teacherId);
        return teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unknown';
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }

    // --- MODIFICATION: Updated to fetch conversations on-demand ---
    async function populateModal(studentId) {
        const student = students.find(s => s._id === studentId);
        if (!student) return;

        // Populate static fields first
        modalStudentId.value = student._id;
        modalStudentName.textContent = `${student.firstName} ${student.lastName}`;
        document.getElementById("modalFirstName").value = student.firstName || '';
        document.getElementById("modalLastName").value = student.lastName || '';
        // ... populate other form fields ...

        openModal();

        // Now, fetch dynamic data like conversations
        conversationSummariesList.innerHTML = '<li>Loading conversation history...</li>';
        try {
            const convoRes = await fetch(`/api/admin/students/${studentId}/conversations`);
            if (!convoRes.ok) throw new Error("Could not fetch conversations.");
            const conversations = await convoRes.json();

            if (conversations.length > 0) {
                const sortedConvos = conversations.sort((a, b) => new Date(b.date || b.startDate) - new Date(a.date || a.startDate));
                conversationSummariesList.innerHTML = sortedConvos.map(session => `
                    <li class="conversation-item">
                        <strong>${formatDate(session.date || session.startDate)}:</strong>
                        ${session.summary || 'No summary.'}
                    </li>
                `).join('');
            } else {
                conversationSummariesList.innerHTML = '<li>No conversation history found.</li>';
            }
        } catch (error) {
            console.error("Failed to load conversation history:", error);
            conversationSummariesList.innerHTML = '<li>Error loading conversation history.</li>';
        }
    }

    // --- Event Handlers ---
    if(studentSearch) studentSearch.addEventListener("input", renderStudents);

    if(userTableBody) userTableBody.addEventListener('click', (e) => {
        const studentId = e.target.closest('tr')?.dataset.studentid;
        if (studentId && e.target.classList.contains('student-name-link')) {
            e.preventDefault();
            populateModal(studentId);
        }
    });
    
    // Other event handlers (assignButton, saveChangesButton, etc.) remain largely the same
    // as their logic operates on data already loaded or sends specific updates.
    if(assignButton) assignButton.addEventListener("click", async () => {
        const selectedIds = Array.from(userTableBody.querySelectorAll(".select-student:checked")).map(cb => cb.value);
        if (selectedIds.length === 0) return alert("Please select at least one student.");
        
        const teacherId = teacherSelect.value;
        if (!teacherId && !confirm("Are you sure you want to unassign these students?")) return;
        
        try {
            const res = await fetch("/api/admin/assign-teacher", {
                method: "PATCH",
                headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                body: JSON.stringify({ studentIds: selectedIds, teacherId: teacherId || null })
            });
            const result = await res.json();
            if(!res.ok) throw new Error(result.message || "Failed to assign.");
            alert(result.message);
            await fetchAllData();
        } catch (error) {
            alert(`Error assigning teacher: ${error.message}`);
        }
    });

    if(closeModalButton) closeModalButton.addEventListener('click', closeModal);
    if(cancelButton) cancelButton.addEventListener('click', closeModal);

    if(saveChangesButton) saveChangesButton.addEventListener('click', async () => {
        const studentId = modalStudentId.value;
        const profileData = {
            firstName: document.getElementById("modalFirstName").value,
            lastName: document.getElementById("modalLastName").value,
            // ... gather other profile fields ...
        };
        // This logic remains the same - it sends a targeted update
        try {
            const res = await fetch(`/api/admin/students/${studentId}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                body: JSON.stringify(profileData)
            });
            if(!res.ok) throw new Error (await res.text());
            alert('Student updated successfully!');
            closeModal();
            fetchAllData();
        } catch (error) {
            alert(`Could not save changes: ${error.message}`);
        }
    });

    // --- Initial Load ---
    fetchAllData();
});