// public/js/pick-tutor.js - Logic for static tutor selection and mouse-over details

// Ensure TUTOR_CONFIG is loaded before this script, e.g., via a <script> tag in HTML
// or import it if this is part of a module bundle. For now, assuming window.TUTOR_CONFIG.
// import { TUTOR_CONFIG } from '../utils/tutorConfig.js'; // If this script is a module

document.addEventListener('DOMContentLoaded', async () => {
    // Access TUTOR_CONFIG from the global window object as it's typically loaded via a <script> tag
    const allTutors = window.TUTOR_CONFIG ? Object.values(window.TUTOR_CONFIG) : [];
    // Filter out the 'default' tutor if it's in the config and not meant for selection
    const selectableTutors = allTutors.filter(tutor => tutor.id !== "default");

    // Explicitly select the 4 desired tutors in their preferred order for display
    const tutors = [
        selectableTutors.find(t => t.id === 'bob'),
        selectableTutors.find(t => t.id === 'ms-maria'),
        selectableTutors.find(t => t.id === 'maya'),
        selectableTutors.find(t => t.id === 'mr-nappier')
    ].filter(Boolean); // Filter out any undefined if a tutor ID wasn't found

    const tutorSelectionGrid = document.getElementById('tutor-selection-grid');
    const playVoiceBtn = document.getElementById('play-voice-btn');
    const selectTutorBtn = document.getElementById('select-tutor-btn');

    let selectedTutorId = null; // To track the currently selected tutor for actions

    // --- Helper to fetch current user data ---
    async function fetchCurrentUser() {
        try {
            const res = await fetch('/user', { credentials: 'include' });
            if (!res.ok) {
                console.error("User not authenticated or session expired.");
                window.location.href = '/login.html';
                return null;
            }
            const data = await res.json();
            return data.user;
        } catch (error) {
            console.error('Error fetching current user:', error);
            alert('Failed to load user data. Please try logging in again.');
            window.location.href = '/login.html';
            return null;
        }
    }

    // --- Render Tutors as Cards ---
    function renderTutors() {
        tutorSelectionGrid.innerHTML = ''; // Clear existing cards

        tutors.forEach(tutor => {
            const tutorCard = document.createElement('div');
            tutorCard.classList.add('tutor-card', 'card-style-1'); // Reusable card style
            tutorCard.dataset.tutorId = tutor.id;

            tutorCard.innerHTML = `
                <img src="/images/tutor_avatars/${tutor.image}" alt="3D avatar of ${tutor.name}" class="tutor-card-image" loading="lazy" />
                <h3 class="tutor-card-name">${tutor.name}</h3>
                <p class="tutor-card-tagline">${tutor.catchphrase}</p>
                <div class="tutor-card-details-overlay">
                    <h4>About ${tutor.name}:</h4>
                    <p>${tutor.about}</p>
                    <h4>Specializes In:</h4>
                    <p>${tutor.specialties}</p>
                    <h4>Why Students Like ${tutor.name}:</h4>
                    <p>${tutor.likes}</p>
                </div>
            `;
            tutorSelectionGrid.appendChild(tutorCard);
        });
    }

    // --- Handle Tutor Card Clicks ---
    tutorSelectionGrid.addEventListener('click', (event) => {
        const clickedCard = event.target.closest('.tutor-card');
        if (clickedCard) {
            // Remove 'selected' class from all other cards
            document.querySelectorAll('.tutor-card').forEach(card => {
                card.classList.remove('selected');
                // For touch devices, ensure previously visible details are hidden
                if (card !== clickedCard) {
                    card.classList.remove('details-visible');
                }
            });

            // Add 'selected' class to the clicked card
            clickedCard.classList.add('selected');
            clickedCard.classList.toggle('details-visible'); // Toggle details for touch devices on subsequent clicks

            selectedTutorId = clickedCard.dataset.tutorId;

            // Enable action buttons
            playVoiceBtn.disabled = false;
            selectTutorBtn.disabled = false;
            selectTutorBtn.innerHTML = `<i class="fas fa-check-circle"></i> Select ${tutors.find(t => t.id === selectedTutorId)?.name || 'Tutor'}`;
        }
    });

    // --- Play Tutor Voice ---
    playVoiceBtn.addEventListener('click', async () => {
        if (!selectedTutorId) {
            alert("Please select a tutor first.");
            return;
        }

        const selectedTutor = tutors.find(t => t.id === selectedTutorId);
        if (!selectedTutor || !selectedTutor.voiceId) {
            alert("Voice not available for this tutor.");
            return;
        }

        const originalPlayButtonHtml = playVoiceBtn.innerHTML;
        playVoiceBtn.disabled = true; // Disable button while playing
        playVoiceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Playing...';

        try {
            const response = await fetch('/speak', { // Use the consolidated /speak route
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `Hello! I am ${selectedTutor.name}. I am excited to help you learn math.`,
                    voiceId: selectedTutor.voiceId
                }),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to play voice: ${errorText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
            audio.onended = () => {
                playVoiceBtn.disabled = false;
                playVoiceBtn.innerHTML = originalPlayButtonHtml; // Restore original HTML
                URL.revokeObjectURL(audioUrl); // Clean up
            };
        } catch (error) {
            console.error("Error playing voice:", error);
            alert(`Failed to play voice: ${error.message}. Please try again.`);
            playVoiceBtn.disabled = false;
            playVoiceBtn.innerHTML = originalPlayButtonHtml; // Restore original HTML
        }
    });

    // --- Select Tutor ---
    selectTutorBtn.addEventListener('click', async () => {
        if (!selectedTutorId) {
            alert("Please select a tutor first.");
            return;
        }

        const currentUser = await fetchCurrentUser();
        if (!currentUser) return; // Redirect handled by fetchCurrentUser

        const originalSelectButtonHtml = selectTutorBtn.innerHTML;
        selectTutorBtn.disabled = true;
        selectTutorBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Selecting...';


        try {
            const response = await fetch(`/api/user/settings`, { // Endpoint for saving user settings
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedTutorId: selectedTutorId }),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert(`You have selected ${tutors.find(t => t.id === selectedTutorId)?.name}! Redirecting to chat...`);
                // The backend will now correctly redirect after login
                window.location.href = "/chat.html"; // Redirect to your chat page
            } else {
                alert("Failed to select tutor: " + (result.message || "Unknown error"));
                selectTutorBtn.disabled = false;
                selectTutorBtn.innerHTML = originalSelectButtonHtml;
            }
        } catch (error) {
            console.error("Error selecting tutor:", error);
            alert("An error occurred while selecting your tutor. Please try again.");
            selectTutorBtn.disabled = false;
            selectTutorBtn.innerHTML = originalSelectButtonHtml;
        }
    });

    // Initial render
    renderTutors();
    // Disable buttons until a tutor is selected
    playVoiceBtn.disabled = true;
    selectTutorBtn.disabled = true;
});