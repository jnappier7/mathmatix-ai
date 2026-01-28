// public/js/complete-profile.js
// MODIFIED: Corrected the fetch URL to point to the correct API endpoint.

document.addEventListener('DOMContentLoaded', async () => {
    const profileForm = document.getElementById('profile-form');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const dobInput = document.getElementById('dateOfBirth');
    const gradeSelect = document.getElementById('grade');
    const mathCourseSection = document.getElementById('math-course-section');
    const studentOnlyDiv = document.getElementById('studentOnly');
    const parentOnlyDiv = document.getElementById('parentOnly');
    const parentConsentSection = document.getElementById('parentConsentSection');
    const parentInviteCodeInput = document.getElementById('parentInviteCode');
    const linkParentBtn = document.getElementById('linkParentBtn');
    const linkParentMessage = document.getElementById('linkParentMessage');

    let currentUser = null;

    // Set max date for DOB to today (COPPA compliance)
    if (dobInput) {
        const today = new Date().toISOString().split('T')[0];
        dobInput.setAttribute('max', today);
    }

    // Calculate age from DOB
    function calculateAge(dob) {
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    // Check if under 13 and show/hide parent consent section
    function checkAgeAndShowConsent() {
        if (!dobInput || !dobInput.value || !currentUser || currentUser.role !== 'student') {
            if (parentConsentSection) parentConsentSection.style.display = 'none';
            return;
        }

        const age = calculateAge(dobInput.value);
        if (age < 13 && !currentUser.hasParentalConsent) {
            parentConsentSection.style.display = 'block';
        } else {
            parentConsentSection.style.display = 'none';
        }
    }

    // Handle linking to parent
    async function linkToParent() {
        const code = parentInviteCodeInput.value.trim();
        if (!code) {
            linkParentMessage.textContent = 'Please enter your parent\'s invite code.';
            linkParentMessage.style.color = '#dc3545';
            return;
        }

        linkParentBtn.disabled = true;
        linkParentBtn.textContent = 'Linking...';
        linkParentMessage.textContent = '';

        try {
            const res = await csrfFetch('/api/student/link-to-parent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentInviteCode: code })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                linkParentMessage.textContent = data.message + ' You can now complete your profile.';
                linkParentMessage.style.color = '#28a745';
                currentUser.hasParentalConsent = true;
                parentConsentSection.style.display = 'none';
            } else {
                linkParentMessage.textContent = data.message || 'Failed to link. Check your code and try again.';
                linkParentMessage.style.color = '#dc3545';
            }
        } catch (error) {
            console.error('Link to parent error:', error);
            linkParentMessage.textContent = 'Network error. Please try again.';
            linkParentMessage.style.color = '#dc3545';
        } finally {
            linkParentBtn.disabled = false;
            linkParentBtn.textContent = 'Link to Parent';
        }
    }

    // Add event listeners
    if (dobInput) {
        dobInput.addEventListener('change', checkAgeAndShowConsent);
    }
    if (linkParentBtn) {
        linkParentBtn.addEventListener('click', linkToParent);
    }

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
            if (dobInput && user.dateOfBirth) {
                dobInput.value = user.dateOfBirth.split('T')[0]; // Format date for input
            }
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
            checkAgeAndShowConsent(); // Check if under 13 needs consent
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
            const dob = formData.get('dateOfBirth');
            if (dob) {
                // Calculate age for COPPA compliance check
                const birthDate = new Date(dob);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }

                // COPPA compliance: Under 13 requires parental consent
                if (age < 13 && !currentUser.hasParentalConsent) {
                    alert('Students under 13 require parental consent. Please enter your parent\'s invite code above to continue.');
                    parentConsentSection.style.display = 'block';
                    parentInviteCodeInput.focus();
                    return;
                }

                updates.dateOfBirth = dob;
            }
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
            const res = await csrfFetch('/api/user/settings', {
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