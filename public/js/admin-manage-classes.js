/**
 * Admin Manage Classes - Add/Remove students from classes
 */

document.addEventListener('DOMContentLoaded', () => {
    const manageClassesModal = document.getElementById('manageClassesModal');
    const openManageClassesBtn = document.getElementById('openManageClassesBtn');
    const closeManageClassesModal = document.getElementById('closeManageClassesModal');

    const classListContainer = document.getElementById('classListContainer');
    const noClassSelected = document.getElementById('noClassSelected');
    const classStudentManagement = document.getElementById('classStudentManagement');
    const selectedClassName = document.getElementById('selectedClassName');
    const selectedClassCode = document.getElementById('selectedClassCode');
    const classStudentCount = document.getElementById('classStudentCount');
    const classStudentsList = document.getElementById('classStudentsList');

    const addStudentSearch = document.getElementById('addStudentSearch');
    const searchStudentsToAddBtn = document.getElementById('searchStudentsToAddBtn');
    const studentSearchResultsForClass = document.getElementById('studentSearchResultsForClass');

    let currentClassId = null;
    let currentClassStudents = new Set();

    // Open modal
    if (openManageClassesBtn) {
        openManageClassesBtn.addEventListener('click', () => {
            manageClassesModal.style.display = 'flex';
            loadClasses();
            resetClassSelection();
        });
    }

    // Close modal
    if (closeManageClassesModal) {
        closeManageClassesModal.addEventListener('click', () => {
            manageClassesModal.style.display = 'none';
        });
    }

    if (manageClassesModal) {
        manageClassesModal.addEventListener('click', (e) => {
            if (e.target === manageClassesModal) {
                manageClassesModal.style.display = 'none';
            }
        });
    }

    // Search students to add
    if (searchStudentsToAddBtn) {
        searchStudentsToAddBtn.addEventListener('click', searchStudentsToAdd);
    }
    if (addStudentSearch) {
        addStudentSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchStudentsToAdd();
            }
        });
    }

    // Load all classes
    async function loadClasses() {
        classListContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i></p>';

        try {
            const response = await fetch('/api/admin/enrollment-codes');
            if (!response.ok) throw new Error('Failed to load classes');

            const classes = await response.json();

            if (classes.length === 0) {
                classListContainer.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #666;">
                        <p>No classes yet</p>
                        <p style="font-size: 0.85em;">Use "Create Class Code" to create one</p>
                    </div>
                `;
                return;
            }

            classListContainer.innerHTML = classes.map(c => `
                <div class="class-list-item" data-class-id="${c._id}"
                     style="padding: 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s;">
                    <div style="font-weight: 500; color: #333;">${escapeHtml(c.className || 'Unnamed Class')}</div>
                    <div style="font-size: 0.85em; color: #999; margin-top: 4px;">
                        <span style="font-family: monospace; background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${escapeHtml(c.code)}</span>
                        <span style="margin-left: 10px;"><i class="fas fa-users"></i> ${c.enrolledStudents?.length || 0}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #666; margin-top: 4px;">
                        Teacher: ${c.teacherId?.firstName || 'Unknown'} ${c.teacherId?.lastName || ''}
                    </div>
                </div>
            `).join('');

            // Add click handlers
            classListContainer.querySelectorAll('.class-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    classListContainer.querySelectorAll('.class-list-item').forEach(i => {
                        i.style.background = '';
                        i.style.borderLeft = '';
                    });
                    item.style.background = '#e8f4f8';
                    item.style.borderLeft = '3px solid #e74c3c';
                    selectClass(item.dataset.classId);
                });

                item.addEventListener('mouseenter', () => {
                    if (item.dataset.classId !== currentClassId) {
                        item.style.background = '#f5f5f5';
                    }
                });

                item.addEventListener('mouseleave', () => {
                    if (item.dataset.classId !== currentClassId) {
                        item.style.background = '';
                    }
                });
            });

        } catch (error) {
            console.error('[ManageClasses] Load error:', error);
            classListContainer.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 20px;">Error loading classes</p>';
        }
    }

    // Select a class
    async function selectClass(classId) {
        currentClassId = classId;
        noClassSelected.style.display = 'none';
        classStudentManagement.style.display = 'block';

        // Reset search
        addStudentSearch.value = '';
        studentSearchResultsForClass.style.display = 'none';
        studentSearchResultsForClass.innerHTML = '';

        await loadClassStudents(classId);
    }

    // Load students in selected class
    async function loadClassStudents(classId) {
        classStudentsList.innerHTML = '<p style="padding: 20px; color: #666; text-align: center; margin: 0;"><i class="fas fa-spinner fa-spin"></i></p>';

        try {
            const response = await fetch(`/api/admin/enrollment-codes/${classId}/students`);
            if (!response.ok) throw new Error('Failed to load students');

            const data = await response.json();

            selectedClassName.textContent = data.className || 'Unnamed Class';
            selectedClassCode.textContent = data.code;
            classStudentCount.textContent = data.totalEnrolled;

            // Track current students for search filtering
            currentClassStudents = new Set(data.students.map(s => s._id));

            if (data.students.length === 0) {
                classStudentsList.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #666;">
                        <p>No students in this class</p>
                        <p style="font-size: 0.85em;">Search above to add students</p>
                    </div>
                `;
                return;
            }

            classStudentsList.innerHTML = data.students.map(student => `
                <div class="class-student-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid #f0f0f0;">
                    <div>
                        <span style="font-weight: 500;">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</span>
                        <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${escapeHtml(student.email || student.username)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 0.75em; color: #666;">${student.enrollmentMethod || 'unknown'}</span>
                        <button class="remove-student-btn" data-student-id="${student._id}"
                                style="background: #fee; color: #e74c3c; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                title="Remove from class">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            // Add remove handlers
            classStudentsList.querySelectorAll('.remove-student-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Remove this student from the class?')) {
                        await removeStudentFromClass(btn.dataset.studentId);
                    }
                });
            });

        } catch (error) {
            console.error('[ManageClasses] Load students error:', error);
            classStudentsList.innerHTML = '<p style="color: #e74c3c; padding: 20px; text-align: center; margin: 0;">Error loading students</p>';
        }
    }

    // Search students to add
    async function searchStudentsToAdd() {
        const search = addStudentSearch.value.trim();
        if (!search) {
            studentSearchResultsForClass.style.display = 'none';
            return;
        }

        studentSearchResultsForClass.style.display = 'block';
        studentSearchResultsForClass.innerHTML = '<p style="padding: 10px; text-align: center; margin: 0;"><i class="fas fa-spinner fa-spin"></i></p>';

        try {
            // Use the existing admin email users search endpoint
            const response = await fetch(`/api/admin/email/users?search=${encodeURIComponent(search)}&role=student&limit=20`);
            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();
            let students = data.users || [];

            // Filter out students already in the class
            students = students.filter(s => !currentClassStudents.has(s._id));

            if (students.length === 0) {
                studentSearchResultsForClass.innerHTML = '<p style="padding: 10px; color: #666; text-align: center; margin: 0;">No students found (or all matches already in class)</p>';
                return;
            }

            studentSearchResultsForClass.innerHTML = students.map(student => `
                <div class="add-student-item" data-student-id="${student._id}"
                     style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0;"
                     data-student='${JSON.stringify(student).replace(/'/g, "&#39;")}'>
                    <div>
                        <span style="font-weight: 500;">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</span>
                        <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${escapeHtml(student.email)}</span>
                    </div>
                    <i class="fas fa-plus-circle" style="color: #27ae60;"></i>
                </div>
            `).join('');

            // Add click handlers
            studentSearchResultsForClass.querySelectorAll('.add-student-item').forEach(item => {
                item.addEventListener('click', async () => {
                    await addStudentToClass(item.dataset.studentId);
                    item.remove();
                    if (studentSearchResultsForClass.children.length === 0) {
                        studentSearchResultsForClass.innerHTML = '<p style="padding: 10px; color: #27ae60; text-align: center; margin: 0;"><i class="fas fa-check"></i> All found students added</p>';
                    }
                });

                item.addEventListener('mouseenter', () => {
                    item.style.background = '#e8f5e9';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = '';
                });
            });

        } catch (error) {
            console.error('[ManageClasses] Search error:', error);
            studentSearchResultsForClass.innerHTML = '<p style="color: #e74c3c; padding: 10px; text-align: center; margin: 0;">Error searching students</p>';
        }
    }

    // Add student to class
    async function addStudentToClass(studentId) {
        try {
            const response = await csrfFetch(`/api/admin/enrollment-codes/${currentClassId}/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentIds: [studentId] })
            });

            const data = await response.json();

            if (data.success) {
                // Reload students list
                await loadClassStudents(currentClassId);
                // Update class list count
                loadClasses();
            } else {
                alert('Failed to add student: ' + data.message);
            }
        } catch (error) {
            console.error('[ManageClasses] Add error:', error);
            alert('Error adding student to class');
        }
    }

    // Remove student from class
    async function removeStudentFromClass(studentId) {
        try {
            const response = await csrfFetch(`/api/admin/enrollment-codes/${currentClassId}/students/${studentId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                await loadClassStudents(currentClassId);
                loadClasses();
            } else {
                alert('Failed to remove student: ' + data.message);
            }
        } catch (error) {
            console.error('[ManageClasses] Remove error:', error);
            alert('Error removing student from class');
        }
    }

    // Reset class selection
    function resetClassSelection() {
        currentClassId = null;
        currentClassStudents.clear();
        noClassSelected.style.display = 'block';
        classStudentManagement.style.display = 'none';
    }

    // Helper
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
});
