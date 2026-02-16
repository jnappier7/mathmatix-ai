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
    const availableStudentsList = document.getElementById('availableStudentsList');
    const addSelectedStudentsBtn = document.getElementById('addSelectedStudentsBtn');
    const selectedStudentCountEl = document.getElementById('selectedStudentCount');

    let currentClassId = null;
    let currentClassStudents = new Set();
    let allStudents = []; // All students loaded from API
    let selectedStudentIds = new Set(); // Students checked for adding

    // Open modal
    if (openManageClassesBtn) {
        openManageClassesBtn.addEventListener('click', () => {
            manageClassesModal.classList.add('is-visible');
            loadClasses();
            loadAllStudents();
            resetClassSelection();
        });
    }

    // Close modal
    if (closeManageClassesModal) {
        closeManageClassesModal.addEventListener('click', () => {
            manageClassesModal.classList.remove('is-visible');
        });
    }

    if (manageClassesModal) {
        manageClassesModal.addEventListener('click', (e) => {
            if (e.target === manageClassesModal) {
                manageClassesModal.classList.remove('is-visible');
            }
        });
    }

    // Filter students as user types (client-side)
    if (addStudentSearch) {
        addStudentSearch.addEventListener('input', renderAvailableStudents);
    }

    // Add selected students button
    if (addSelectedStudentsBtn) {
        addSelectedStudentsBtn.addEventListener('click', addSelectedStudentsToClass);
    }

    // Load all students from API (once on modal open)
    async function loadAllStudents() {
        try {
            const response = await fetch('/api/admin/users', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load users');

            const users = await response.json();
            allStudents = users.filter(u => u.role === 'student');
        } catch (error) {
            console.error('[ManageClasses] Load all students error:', error);
            allStudents = [];
        }
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

        // Reset search and selections
        addStudentSearch.value = '';
        selectedStudentIds.clear();
        updateAddSelectedButton();

        await loadClassStudents(classId);
        renderAvailableStudents();
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

            // Track current students for filtering available list
            currentClassStudents = new Set(data.students.map(s => s._id));

            if (data.students.length === 0) {
                classStudentsList.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #666;">
                        <p>No students in this class</p>
                        <p style="font-size: 0.85em;">Select students above to add them</p>
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

    // Render available students list (filtered, with checkboxes)
    function renderAvailableStudents() {
        if (!currentClassId) {
            availableStudentsList.innerHTML = '<p style="padding: 10px; color: #666; text-align: center; margin: 0;">Select a class to see available students</p>';
            return;
        }

        const query = (addStudentSearch.value || '').toLowerCase().trim();

        // Filter: exclude students already in class, then apply search
        let available = allStudents.filter(s => !currentClassStudents.has(s._id));

        if (query) {
            available = available.filter(s =>
                `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(query) ||
                (s.email || '').toLowerCase().includes(query) ||
                (s.username || '').toLowerCase().includes(query)
            );
        }

        if (available.length === 0) {
            availableStudentsList.innerHTML = query
                ? '<p style="padding: 10px; color: #666; text-align: center; margin: 0;">No matching students found</p>'
                : '<p style="padding: 10px; color: #666; text-align: center; margin: 0;">All students are already in this class</p>';
            return;
        }

        availableStudentsList.innerHTML = available.map(student => `
            <label class="available-student-item" data-student-id="${student._id}"
                 style="display: flex; align-items: center; padding: 8px 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; gap: 10px; margin: 0;">
                <input type="checkbox" class="add-student-checkbox" value="${student._id}"
                       ${selectedStudentIds.has(student._id) ? 'checked' : ''}
                       style="cursor: pointer; width: 16px; height: 16px; flex-shrink: 0;">
                <div style="flex: 1; min-width: 0;">
                    <span style="font-weight: 500;">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</span>
                    <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${escapeHtml(student.email || student.username || '')}</span>
                </div>
            </label>
        `).join('');

        // Add checkbox change handlers
        availableStudentsList.querySelectorAll('.add-student-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selectedStudentIds.add(cb.value);
                } else {
                    selectedStudentIds.delete(cb.value);
                }
                updateAddSelectedButton();
            });
        });

        // Hover effect
        availableStudentsList.querySelectorAll('.available-student-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.background = '#e8f5e9';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = '';
            });
        });
    }

    // Update the "Add Selected" button visibility and count
    function updateAddSelectedButton() {
        const count = selectedStudentIds.size;
        if (addSelectedStudentsBtn) {
            addSelectedStudentsBtn.style.display = count > 0 ? 'inline-block' : 'none';
        }
        if (selectedStudentCountEl) {
            selectedStudentCountEl.textContent = count;
        }
    }

    // Add all selected students to the class
    async function addSelectedStudentsToClass() {
        if (selectedStudentIds.size === 0) return;

        const ids = Array.from(selectedStudentIds);
        addSelectedStudentsBtn.disabled = true;
        addSelectedStudentsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

        try {
            const response = await csrfFetch(`/api/admin/enrollment-codes/${currentClassId}/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentIds: ids })
            });

            const data = await response.json();

            if (!response.ok) {
                alert('Failed to add students: ' + (data.message || 'Unknown error'));
                return;
            }

            if (data.success) {
                // Clear selections and reload
                selectedStudentIds.clear();
                updateAddSelectedButton();
                await loadClassStudents(currentClassId);
                renderAvailableStudents();
                loadClasses();
            } else {
                alert('Failed to add students: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('[ManageClasses] Add error:', error);
            alert('Error adding students to class');
        } finally {
            addSelectedStudentsBtn.disabled = false;
            addSelectedStudentsBtn.innerHTML = '<i class="fas fa-plus"></i> Add Selected (<span id="selectedStudentCount">' + selectedStudentIds.size + '</span>)';
            // Re-bind the count element reference
            const newCountEl = document.getElementById('selectedStudentCount');
            if (newCountEl) newCountEl.textContent = selectedStudentIds.size;
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
                renderAvailableStudents();
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
        selectedStudentIds.clear();
        updateAddSelectedButton();
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
