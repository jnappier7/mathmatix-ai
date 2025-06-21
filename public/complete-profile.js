// public/complete-profile.js

document.addEventListener('DOMContentLoaded', async () => {
    const profileForm = document.getElementById('profile-form');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const gradeSelect = document.getElementById('grade');
    const mathCourseSection = document.getElementById('math-course-section');
    const studentOnlyDiv = document.getElementById('studentOnly');
    const parentOnlyDiv = document.getElementById('parentOnly');

    let currentUser = null; // To store user data from /user endpoint

    // --- Fetch Current User Data ---
    async function fetchCurrentUser() {
        try {
            const res = await fetch('/user', { credentials: 'include' }); // This is correct, it hits the /user endpoint
            if (!res.ok) {
                // If not authenticated or session expired, redirect to login
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
            alert('Failed to load user data. Please try logging in again.');
            window.location.href = '/login.html';
            return null;
        }
    }

    // --- Populate Form with Existing Data ---
    function populateProfileForm(user) {
        firstNameInput.value = user.firstName || '';
        lastNameInput.value = user.lastName || '';

        // Show/hide sections based on role
        if (user.role === 'student') {
            studentOnlyDiv.style.display = 'block';
            parentOnlyDiv.style.display = 'none';

            // Populate student fields
            gradeSelect.value = user.gradeLevel || '';
            document.getElementById('mathCourse').value = user.mathCourse || '';
            document.getElementById('learningStyle').value = user.learningStyle || '';
            document.getElementById('tonePreference').value = user.tonePreference || '';

            // Populate interests checkboxes
            if (user.interests && Array.isArray(user.interests)) {
                user.interests.forEach(interest => {
                    const checkbox = document.querySelector(`input[name='interests[]'][value='${interest}']`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            // Initial check for math course section visibility after populating grade
            toggleMathCourseSection();

        } else if (user.role === 'parent') {
            studentOnlyDiv.style.display = 'none';
            parentOnlyDiv.style.display = 'block';

            // Populate parent fields
            document.getElementById('reportFrequency').value = user.reportFrequency || 'weekly';
            document.getElementById('parentTone').value = user.parentTone || 'friendly';
            document.getElementById('parentLanguage').value = user.parentLanguage || 'English';
            document.getElementById('goalViewPreference').value = user.goalViewPreference || 'progress';
            
            // Placeholder for linked children display (you might have specific JS to populate this)
            document.getElementById('linkedChildren').textContent = user.children && user.children.length > 0 ? `Linked: ${user.children.length} children` : 'No children linked.';

        } else {
            // For other roles (teacher, admin) who might land here if they need profile completion
            // You might want to hide both studentOnly and parentOnly or show a specific message
            studentOnlyDiv.style.display = 'none';
            parentOnlyDiv.style.display = 'none';
            // Optionally, show a message like "Your profile requires no further completion here."
        }
    }

    // --- Logic to show/hide math course section based on grade ---
    function toggleMathCourseSection() {
        const selectedGrade = gradeSelect.value;
        // Grades 9, 10, 11, 12, College should show math course
        const gradesRequiringMathCourse = ['9', '10', '11', '12', 'College']; 

        if (gradesRequiringMathCourse.includes(selectedGrade)) {
            mathCourseSection.style.display = 'block';
        } else {
            mathCourseSection.style.display = 'none';
            // Optionally, reset mathCourse selection if hidden
            document.getElementById('mathCourse').value = ''; 
        }
    }

    // Add event listener for grade selection change
    gradeSelect.addEventListener('change', toggleMathCourseSection);


    // --- Form Submission Handler ---
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert('User data not loaded. Please refresh the page.');
            return;
        }

        const formData = new FormData(profileForm);
        const updates = {};

        // Collect common fields
        updates.firstName = formData.get('firstName');
        updates.lastName = formData.get('lastName');
        
        // Update the 'name' field if firstName or lastName changed
        // This logic should ideally be handled on the backend based on firstName/lastName
        // But for frontend convenience, if you're directly updating a 'name' field
        if (updates.firstName !== currentUser.firstName || updates.lastName !== currentUser.lastName) {
             updates.name = `${updates.firstName} ${updates.lastName}`;
        }

        // Collect role-specific fields
        if (currentUser.role === 'student') {
            updates.gradeLevel = formData.get('grade');
            // Only include mathCourse if the section is visible (i.e., grade 9+)
            if (mathCourseSection.style.display === 'block') {
                updates.mathCourse = formData.get('mathCourse');
            } else {
                updates.mathCourse = ''; // Ensure it's cleared if grade is low
            }
            updates.learningStyle = formData.get('learningStyle');
            updates.tonePreference = formData.get('tonePreference');
            updates.interests = formData.getAll('interests[]'); // Gets all checked values
            updates.needsProfileCompletion = false; // Mark as completed
        } else if (currentUser.role === 'parent') {
            updates.reportFrequency = formData.get('reportFrequency');
            updates.parentTone = formData.get('parentTone');
            updates.parentLanguage = formData.get('parentLanguage');
            updates.goalViewPreference = formData.get('goalViewPreference');
            updates.needsProfileCompletion = false; // Mark as completed
        }
        // Add other role-specific fields for teacher/admin if necessary

        try {
            // [CHANGE] Removed /api prefix
            const res = await fetch(`/user/complete-profile/${currentUser._id}`, { 
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Profile update failed.');
            }

            const data = await res.json();
            alert(data.message || 'Profile updated successfully!');

            // Redirect based on role after successful completion
            if (currentUser.role === 'student') {
                if (currentUser.selectedTutorId) { // If student already has a tutor
                    window.location.href = '/chat.html';
                } else {
                    window.location.href = '/pick-tutor.html'; // Student needs to pick a tutor
                }
            } else if (currentUser.role === 'teacher') {
                window.location.href = '/teacher-dashboard.html';
            } else if (currentUser.role === 'admin') {
                window.location.href = '/admin-dashboard.html';
            } else if (currentUser.role === 'parent') {
                window.location.href = '/parent-dashboard.html';
            } else {
                window.location.href = '/chat.html'; // Default fallback
            }

        } catch (error) {
            console.error('Profile update error:', error);
            alert(`Error updating profile: ${error.message}`);
        }
    });

    // Initial fetch of current user when the page loads
    fetchCurrentUser();
});