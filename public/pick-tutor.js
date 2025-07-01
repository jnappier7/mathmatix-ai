// public/js/pick-tutor.js

document.addEventListener('DOMContentLoaded', async () => {
    // Correctly get and filter out the 'default' tutor from TUTOR_CONFIG
    let tutorsData = {};
    if (window.TUTOR_CONFIG) {
        // Iterate over keys to exclude 'default' before getting values
        for (const key in window.TUTOR_CONFIG) {
            if (key !== 'default') { // Exclude the 'default' key
                tutorsData[key] = window.TUTOR_CONFIG[key];
            }
        }
    }
    const tutors = Object.values(tutorsData); // Get values from the filtered object

    const tutorSelectionGrid = document.getElementById('tutor-selection-grid');
    const playVoiceBtn = document.getElementById('play-voice-btn');
    const selectTutorBtn = document.getElementById('select-tutor-btn');

    let selectedTutorId = null; 

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
        // Now, 'tutors' array already contains only the non-default tutors.
        // We can still slice to ensure we only render a specific number, if desired.
        const tutorsToDisplay = tutors.slice(0, 4); // Display up to 4 tutors

        tutorsToDisplay.forEach(tutor => { // Changed from fourTutors.forEach to tutorsToDisplay.forEach
            const tutorCard = document.createElement('div');
            tutorCard.classList.add('tutor-card', 'card-style-1'); 
            // Corrected: Use tutor.name as the ID, as tutorConfig uses name as key and doesn't have an 'id' property.
            tutorCard.dataset.tutorId = tutor.name; 

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
            document.querySelectorAll('.tutor-card').forEach(card => {
                card.classList.remove('selected');
                card.classList.remove('details-visible');
            });

            clickedCard.classList.add('selected');
            clickedCard.classList.add('details-visible');

            selectedTutorId = clickedCard.dataset.tutorId;

            playVoiceBtn.disabled = false;
            selectTutorBtn.disabled = false;
            selectTutorBtn.textContent = `✅ Select ${tutors.find(t => t.name === selectedTutorId)?.name || 'Tutor'}`;
        }
    });

    // --- Play Tutor Voice ---
    playVoiceBtn.addEventListener('click', async () => {
        if (!selectedTutorId) {
            alert("Please select a tutor first.");
            return;
        }

        const selectedTutor = tutors.find(t => t.name === selectedTutorId);
        if (!selectedTutor || !selectedTutor.voiceId) {
            alert("Voice not available for this tutor.");
            return;
        }

        playVoiceBtn.disabled = true;
        playVoiceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Playing...';

        try {
            const response = await fetch('/speak', {
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
                playVoiceBtn.innerHTML = '<i class="fas fa-volume-up"></i> Hear My Voice';
                URL.revokeObjectURL(audioUrl);
            };
        } catch (error) {
            console.error("Error playing voice:", error);
            alert(`Failed to play voice: ${error.message}. Please try again.`);
            playVoiceBtn.disabled = false;
            playVoiceBtn.innerHTML = '<i class="fas fa-volume-up"></i> Hear My Voice';
        }
    });

    // --- Select Tutor ---
    selectTutorBtn.addEventListener('click', async () => {
        if (!selectedTutorId) {
            alert("Please select a tutor first.");
            return;
        }

        const currentUser = await fetchCurrentUser();
        if (!currentUser) return;

        try {
            const response = await fetch(`/api/user/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedTutorId: selectedTutorId }),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert(`You have selected ${tutors.find(t => t.name === selectedTutorId)?.name}! Redirecting to chat...`);
                window.location.href = "/chat.html";
            } else {
                alert("Failed to select tutor: " + (result.message || "Unknown error"));
            }
        } catch (error) {
            console.error("Error selecting tutor:", error);
            alert("An error occurred while selecting your tutor. Please try again.");
        }
    });

    // Initial render
    renderTutors();
    // Disable buttons until a tutor is selected
    playVoiceBtn.disabled = true;
    selectTutorBtn.disabled = true;
});