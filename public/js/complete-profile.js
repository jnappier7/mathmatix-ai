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

    // Teen consent section elements
    const teenConsentSection = document.getElementById('teenConsentSection');
    const teenParentEmailInput = document.getElementById('teenParentEmail');
    const sendParentConsentBtn = document.getElementById('sendParentConsentBtn');
    const teenParentInviteCodeInput = document.getElementById('teenParentInviteCode');
    const teenLinkParentBtn = document.getElementById('teenLinkParentBtn');
    const teenConsentMessage = document.getElementById('teenConsentMessage');

    // Check age bracket and show appropriate consent section
    function checkAgeAndShowConsent() {
        if (!dobInput || !dobInput.value || !currentUser || currentUser.role !== 'student') {
            if (parentConsentSection) parentConsentSection.style.display = 'none';
            if (teenConsentSection) teenConsentSection.style.display = 'none';
            return;
        }

        const age = calculateAge(dobInput.value);

        if (age < 13 && !currentUser.hasParentalConsent) {
            // Under-13: Full parent invite code required (COPPA)
            if (parentConsentSection) parentConsentSection.style.display = 'block';
            if (teenConsentSection) teenConsentSection.style.display = 'none';
        } else if (age >= 13 && age < 18 && !currentUser.hasParentalConsent) {
            // 13-17: Parent email verification or invite code (OpenAI/ElevenLabs terms)
            if (parentConsentSection) parentConsentSection.style.display = 'none';
            if (teenConsentSection) teenConsentSection.style.display = 'block';
        } else {
            // 18+ or already has consent
            if (parentConsentSection) parentConsentSection.style.display = 'none';
            if (teenConsentSection) teenConsentSection.style.display = 'none';
        }
    }

    // Handle under-13 linking to parent (existing flow)
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

    // Handle 13-17 parent email consent request
    async function sendTeenParentConsent() {
        const email = teenParentEmailInput ? teenParentEmailInput.value.trim() : '';
        if (!email) {
            if (teenConsentMessage) {
                teenConsentMessage.textContent = 'Please enter your parent\'s email address.';
                teenConsentMessage.style.color = '#dc3545';
            }
            return;
        }

        if (sendParentConsentBtn) {
            sendParentConsentBtn.disabled = true;
            sendParentConsentBtn.textContent = 'Sending...';
        }
        if (teenConsentMessage) teenConsentMessage.textContent = '';

        try {
            const res = await csrfFetch('/api/consent/request-parent-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentEmail: email })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                if (teenConsentMessage) {
                    teenConsentMessage.textContent = 'Verification email sent! Your parent will receive an email to confirm your account. You can complete your profile now.';
                    teenConsentMessage.style.color = '#28a745';
                }
                // Allow profile completion — consent is pending but 13+ can proceed
                currentUser.hasParentalConsent = true;
                if (teenConsentSection) teenConsentSection.style.display = 'none';
            } else {
                if (teenConsentMessage) {
                    teenConsentMessage.textContent = data.message || 'Failed to send email. Try again.';
                    teenConsentMessage.style.color = '#dc3545';
                }
            }
        } catch (error) {
            console.error('Teen consent email error:', error);
            if (teenConsentMessage) {
                teenConsentMessage.textContent = 'Network error. Please try again.';
                teenConsentMessage.style.color = '#dc3545';
            }
        } finally {
            if (sendParentConsentBtn) {
                sendParentConsentBtn.disabled = false;
                sendParentConsentBtn.textContent = 'Send Verification Email';
            }
        }
    }

    // Handle 13-17 linking to parent via invite code
    async function teenLinkToParent() {
        const code = teenParentInviteCodeInput ? teenParentInviteCodeInput.value.trim() : '';
        if (!code) {
            if (teenConsentMessage) {
                teenConsentMessage.textContent = 'Please enter your parent\'s invite code.';
                teenConsentMessage.style.color = '#dc3545';
            }
            return;
        }

        if (teenLinkParentBtn) {
            teenLinkParentBtn.disabled = true;
            teenLinkParentBtn.textContent = 'Linking...';
        }
        if (teenConsentMessage) teenConsentMessage.textContent = '';

        try {
            const res = await csrfFetch('/api/student/link-to-parent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentInviteCode: code })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                if (teenConsentMessage) {
                    teenConsentMessage.textContent = data.message + ' You can now complete your profile.';
                    teenConsentMessage.style.color = '#28a745';
                }
                currentUser.hasParentalConsent = true;
                if (teenConsentSection) teenConsentSection.style.display = 'none';
            } else {
                if (teenConsentMessage) {
                    teenConsentMessage.textContent = data.message || 'Failed to link. Check your code.';
                    teenConsentMessage.style.color = '#dc3545';
                }
            }
        } catch (error) {
            console.error('Teen link to parent error:', error);
            if (teenConsentMessage) {
                teenConsentMessage.textContent = 'Network error. Please try again.';
                teenConsentMessage.style.color = '#dc3545';
            }
        } finally {
            if (teenLinkParentBtn) {
                teenLinkParentBtn.disabled = false;
                teenLinkParentBtn.textContent = 'Link to Parent';
            }
        }
    }

    // Add event listeners
    if (dobInput) {
        dobInput.addEventListener('change', checkAgeAndShowConsent);
    }
    if (linkParentBtn) {
        linkParentBtn.addEventListener('click', linkToParent);
    }
    if (sendParentConsentBtn) {
        sendParentConsentBtn.addEventListener('click', sendTeenParentConsent);
    }
    if (teenLinkParentBtn) {
        teenLinkParentBtn.addEventListener('click', teenLinkToParent);
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

            // DOB is required for all students
            if (!dob) {
                alert('Date of birth is required for all students.');
                dobInput.focus();
                return;
            }

            if (dob) {
                // Calculate age for COPPA compliance check
                const birthDate = new Date(dob);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }

                // COPPA compliance: Under 13 requires parental consent (invite code)
                if (age < 13 && !currentUser.hasParentalConsent) {
                    alert('Students under 13 require parental consent. Please enter your parent\'s invite code above to continue.');
                    if (parentConsentSection) parentConsentSection.style.display = 'block';
                    if (parentInviteCodeInput) parentInviteCodeInput.focus();
                    return;
                }

                // AI provider terms: 13-17 requires parental consent (email or invite code)
                if (age >= 13 && age < 18 && !currentUser.hasParentalConsent) {
                    alert('Students under 18 need a parent or guardian\'s permission. Please provide your parent\'s email or invite code above.');
                    if (teenConsentSection) teenConsentSection.style.display = 'block';
                    if (teenParentEmailInput) teenParentEmailInput.focus();
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