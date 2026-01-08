// public/js/complete-profile.js
// MODIFIED: Corrected the fetch URL to point to the correct API endpoint.

document.addEventListener('DOMContentLoaded', async () => {
    const profileForm = document.getElementById('profile-form');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const gradeSelect = document.getElementById('grade');
    const mathCourseSection = document.getElementById('math-course-section');
    const studentOnlyDiv = document.getElementById('studentOnly');
    const parentOnlyDiv = document.getElementById('parentOnly');

    let currentUser = null;

    async function fetchCurrentUser() {
        try {
            const res = await fetch('/user', { credentials: 'include' });
            if (!res.ok) {
                console.error("User not authenticated or session expired.");
                window.location.href = '/login.html';
                return null;
            }
            const data = await res.json();
            currentUser = data.user;
            populateProfileForm(currentUser);
            return currentUser;
        } catch (error) {
            console.error('Error fetching current user:', error);
            window.location.href = '/login.html';
            return null;
        }
    }

    function populateProfileForm(user) {
        firstNameInput.value = user.firstName || '';
        lastNameInput.value = user.lastName || '';

        if (user.role === 'student') {
            studentOnlyDiv.style.display = 'block';
            parentOnlyDiv.style.display = 'none';
            gradeSelect.value = user.gradeLevel || '';
            document.getElementById('mathCourse').value = user.mathCourse || '';
            document.getElementById('learningStyle').value = user.learningStyle || '';
            document.getElementById('tonePreference').value = user.tonePreference || '';
            document.getElementById('preferredLanguage').value = user.preferredLanguage || 'English';
            if (user.interests && Array.isArray(user.interests)) {
                user.interests.forEach(interest => {
                    const checkbox = document.querySelector(`input[name='interests[]'][value='${interest}']`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            toggleMathCourseSection();
        } else if (user.role === 'parent') {
            studentOnlyDiv.style.display = 'none';
            parentOnlyDiv.style.display = 'block';
            document.getElementById('reportFrequency').value = user.reportFrequency || 'weekly';
            document.getElementById('parentTone').value = user.parentTone || 'friendly';
            document.getElementById('parentLanguage').value = user.parentLanguage || 'English';
            document.getElementById('goalViewPreference').value = user.goalViewPreference || 'progress';
            document.getElementById('linkedChildren').textContent = user.children && user.children.length > 0 ? `Linked: ${user.children.length} children` : 'No children linked.';
        } else {
            studentOnlyDiv.style.display = 'none';
            parentOnlyDiv.style.display = 'none';
        }
    }

    function toggleMathCourseSection() {
        const selectedGrade = gradeSelect.value;
        const gradesRequiringMathCourse = ['9', '10', '11', '12', 'College'];
        if (gradesRequiringMathCourse.includes(selectedGrade)) {
            mathCourseSection.style.display = 'block';
        } else {
            mathCourseSection.style.display = 'none';
            document.getElementById('mathCourse').value = ''; 
        }
    }

    gradeSelect.addEventListener('change', toggleMathCourseSection);

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert('User data not loaded. Please refresh the page.');
            return;
        }

        const formData = new FormData(profileForm);
        const updates = {};

        updates.firstName = formData.get('firstName');
        updates.lastName = formData.get('lastName');

        if (currentUser.role === 'student') {
            updates.gradeLevel = formData.get('grade');
            updates.mathCourse = mathCourseSection.style.display === 'block' ? formData.get('mathCourse') : '';
            updates.learningStyle = formData.get('learningStyle');
            updates.tonePreference = formData.get('tonePreference');
            updates.preferredLanguage = formData.get('preferredLanguage');
            updates.interests = formData.getAll('interests[]');
        } else if (currentUser.role === 'parent') {
            updates.reportFrequency = formData.get('reportFrequency');
            updates.parentTone = formData.get('parentTone');
            updates.parentLanguage = formData.get('parentLanguage');
            updates.goalViewPreference = formData.get('goalViewPreference');
        }
        
        updates.needsProfileCompletion = false;

        try {
            // MODIFIED: Changed fetch URL to the correct backend endpoint.
            const res = await fetch('/api/user/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Profile update failed.');
            }

            const data = await res.json();
            alert(data.message || 'Profile updated successfully!');

            if (currentUser.role === 'student' && !currentUser.selectedTutorId) {
                window.location.href = '/pick-tutor.html';
            } else {
                const dashboardMap = {
                    student: '/chat.html',
                    teacher: '/teacher-dashboard.html',
                    admin: '/admin-dashboard.html',
                    parent: '/parent-dashboard.html'
                };
                window.location.href = dashboardMap[currentUser.role] || '/chat.html';
            }
        } catch (error) {
            console.error('Profile update error:', error);
            alert(`Error updating profile: ${error.message}`);
        }
    });

    fetchCurrentUser();
});