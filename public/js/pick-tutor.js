// public/js/pick-tutor.js

document.addEventListener('DOMContentLoaded', () => {
    let allTutors = [];
    let currentUser = null;
    const tutorSelectionGrid = document.getElementById('tutor-selection-grid');
    const playVoiceBtn = document.getElementById('play-voice-btn');
    const selectTutorBtn = document.getElementById('select-tutor-btn');
    let selectedTutorId = null;

    async function fetchData() {
        try {
            const [userRes, tutorConfigRes] = await Promise.all([
                fetch('/user', { credentials: 'include' }),
                fetch('/js/tutor-config-data.js')
            ]);

            if (!userRes.ok) {
                window.location.href = '/login.html';
                return;
            }
            if (!tutorConfigRes.ok) throw new Error('Failed to load tutor configuration.');
            
            const userData = await userRes.json();
            currentUser = userData.user;

            const scriptText = await tutorConfigRes.text();
            if (!window.TUTOR_CONFIG) {
                const script = document.createElement('script');
                script.textContent = scriptText;
                document.body.appendChild(script);
            }
            
            const tutorsData = window.TUTOR_CONFIG;
            allTutors = Object.keys(tutorsData)
                .filter(key => key !== 'default')
                .map(key => ({ id: key, ...tutorsData[key] }));

        } catch (error) {
            console.error('Error fetching initial data:', error);
            if (tutorSelectionGrid) tutorSelectionGrid.innerHTML = `<p>Error loading page data. Please refresh.</p>`;
        }
    }

    function renderTutors() {
        if (!tutorSelectionGrid || !currentUser || allTutors.length === 0) return;
        tutorSelectionGrid.innerHTML = '';

        allTutors.forEach(tutor => {
            const tutorCard = document.createElement('div');
            const isUnlocked = currentUser.unlockedTutors.includes(tutor.id);
            
            tutorCard.classList.add('tutor-card', 'card-style-1', isUnlocked ? 'unlocked' : 'locked');
            tutorCard.dataset.tutorId = tutor.id;

            if (isUnlocked) {
                tutorCard.innerHTML = `
                    <img src="/images/tutor_avatars/${tutor.image}" alt="Avatar of ${tutor.name}" class="tutor-card-image" loading="lazy" />
                    <h3 class="tutor-card-name">${tutor.name}</h3>
                    <p class="tutor-card-tagline">${tutor.catchphrase || ''}</p>
                    <div class="tutor-card-details-overlay">
                        <h4>About ${tutor.name}:</h4><p>${tutor.about || ''}</p>
                        <h4>Specializes In:</h4><p>${tutor.specialties || ''}</p>
                    </div>
                `;
            } else {
                // Render the "locked" silhouette card
                // ALWAYS use the actual tutor image. The CSS 'silhouette' class will handle the effect.
                tutorCard.innerHTML = `
                    <img src="/images/tutor_avatars/${tutor.image}" alt="Locked Tutor" class="tutor-card-image silhouette" />
                    <h3 class="tutor-card-name locked-name">?????</h3>
                    <p class="tutor-card-tagline"><i class="fas fa-lock"></i> ${tutor.unlockCondition?.description || 'Unlock by playing'}</p>
                `;
            }
            tutorSelectionGrid.appendChild(tutorCard);
        });
    }

    tutorSelectionGrid.addEventListener('click', (event) => {
        const clickedCard = event.target.closest('.tutor-card');
        
        if (clickedCard && !clickedCard.classList.contains('locked')) {
            document.querySelectorAll('.tutor-card').forEach(card => card.classList.remove('selected'));
            clickedCard.classList.add('selected');
            selectedTutorId = clickedCard.dataset.tutorId;
            playVoiceBtn.disabled = false;
            selectTutorBtn.disabled = false;
            const selectedTutorName = allTutors.find(t => t.id === selectedTutorId)?.name || 'Tutor';
            selectTutorBtn.textContent = `✅ Select ${selectedTutorName}`;
        }
    });

    playVoiceBtn.addEventListener('click', async () => {
        if (!selectedTutorId) return;
        const selectedTutor = allTutors.find(t => t.id === selectedTutorId);
        if (!selectedTutor || !selectedTutor.voiceId) { alert("Voice not available for this tutor."); return; }

        playVoiceBtn.disabled = true;
        playVoiceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Playing...';

        try {
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: selectedTutor.voicePreview, voiceId: selectedTutor.voiceId }),
                credentials: 'include'
            });
            if (!response.ok) throw new Error(await response.text());
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                playVoiceBtn.disabled = false;
                playVoiceBtn.innerHTML = '<i class="fas fa-volume-up"></i> Hear My Voice';
            };
        } catch (error) {
            console.error("Error playing voice:", error);
            playVoiceBtn.disabled = false;
            playVoiceBtn.innerHTML = '<i class="fas fa-volume-up"></i> Hear My Voice';
        }
    });

    selectTutorBtn.addEventListener('click', async () => {
        if (!selectedTutorId) return;
        try {
            const response = await fetch(`/api/user/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedTutorId: selectedTutorId }),
                credentials: 'include'
            });
            const result = await response.json();
            if (response.ok && result.success) {
                window.location.href = "/chat.html";
            } else {
                alert("Failed to select tutor: " + (result.message || "Unknown error"));
            }
        } catch (error) {
            console.error("Error selecting tutor:", error);
        }
    });

    // --- CORRECTED INITIALIZATION ---
    // We wrap the initialization logic in an async function and call it.
    async function initializePage() {
        playVoiceBtn.disabled = true;
        selectTutorBtn.disabled = true;
        await fetchData();
        renderTutors();
    }

    initializePage();
});