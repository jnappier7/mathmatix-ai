// public/js/modules/iep.js
// IEP (Individualized Education Program) Accommodation System
// Extracted from script.js — handles accessibility accommodations,
// break overlays, chunked assignments, and multiplication chart.

/**
 * Create the IEP accommodation system.
 * @param {Object} deps
 * @param {Function} deps.playAudio - TTS playback function
 * @param {Function} deps.generateSpeakableText - Strips markup for TTS
 * @param {Function} deps.getCurrentUser - Returns current user object
 * @returns {{ applyIepAccommodations, handleIepResponseFeatures, handleIepGoalUpdates }}
 */
export function createIepSystem({ playAudio, generateSpeakableText, getCurrentUser }) {
    let iepChunkProblemCount = 0;
    const IEP_CHUNK_SIZE = 4; // check in after every 4 problems

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Page-level accommodations (applied at init from user profile) ---

    function applyIepAccommodations(user) {
        const accom = user?.iepPlan?.accommodations;
        if (!accom) return;

        const hasAny = Object.values(accom).some(v => v === true || (Array.isArray(v) && v.length > 0));
        if (!hasAny) return;

        console.log('[IEP] Applying accommodations:', accom);

        // Reduced Distraction: hide leaderboard, quests, streaks, badges sidebar
        if (accom.reducedDistraction) {
            document.body.classList.add('iep-reduced-distraction');
            console.log('[IEP] Reduced distraction mode enabled');
        }

        // Large Print / High Contrast: force high-contrast theme
        if (accom.largePrintHighContrast) {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('iep-high-contrast');
            console.log('[IEP] High contrast mode enabled (dark mode overridden)');
        }

        // Calculator Always Available
        if (accom.calculatorAllowed) {
            const calcBtn = document.getElementById('sidebar-calculator-btn');
            if (calcBtn) calcBtn.classList.add('iep-always-visible');
        }

        // Breaks As Needed: inject persistent break button
        if (accom.breaksAsNeeded) {
            injectBreakButton();
        }

        // Digital Multiplication Chart
        if (accom.digitalMultiplicationChart) {
            injectMultiplicationChart();
        }

        // Math Anxiety Support: add body class for gentler animations
        if (accom.mathAnxietySupport) {
            document.body.classList.add('iep-anxiety-support');
        }
    }

    // --- Per-response IEP features (from chat API response) ---

    function handleIepResponseFeatures(iepFeatures) {
        if (!iepFeatures) return;

        // Auto Read-Aloud: trigger TTS automatically on new AI messages
        if (iepFeatures.autoReadAloud) {
            const currentUser = getCurrentUser();
            const messages = document.querySelectorAll('.message.ai');
            const latest = messages[messages.length - 1];
            if (latest && typeof playAudio === 'function' && typeof generateSpeakableText === 'function' && window.TUTOR_CONFIG) {
                const tutor = window.TUTOR_CONFIG[currentUser?.selectedTutorId] || window.TUTOR_CONFIG['default'];
                const playBtn = latest.querySelector('.play-audio-btn');
                if (playBtn) {
                    playBtn.disabled = true;
                    playBtn.classList.add('is-loading');
                }
                const rawText = latest.querySelector('.message-content')?.textContent || latest.textContent || '';
                const speakableText = generateSpeakableText(rawText);
                if (speakableText) {
                    setTimeout(() => playAudio(speakableText, tutor?.voiceId, latest.id), 300);
                }
            } else {
                console.warn('[IEP] Audio read-aloud accommodation is active but TTS is unavailable');
            }
        }

        // Chunked Assignments: show check-in after every chunk of problems
        if (iepFeatures.chunkedAssignments) {
            handleChunkedAssignmentCheckIn();
        }
    }

    // --- IEP goal progress notifications ---

    function handleIepGoalUpdates(goalUpdates) {
        if (!goalUpdates || goalUpdates.length === 0) return;

        goalUpdates.forEach((update, i) => {
            setTimeout(() => {
                showIepGoalNotification(update);
            }, i * 1200);
        });
    }

    function showIepGoalNotification(update) {
        const notification = document.createElement('div');
        notification.className = 'iep-goal-notification';

        if (update.completed) {
            notification.innerHTML = `
                <div class="iep-goal-notif-icon completed"><i class="fas fa-star"></i></div>
                <div class="iep-goal-notif-text">
                    <strong>Goal Complete!</strong>
                    <span>${escapeHtml(update.description)}</span>
                </div>
            `;
            notification.classList.add('completed');
        } else {
            notification.innerHTML = `
                <div class="iep-goal-notif-icon"><i class="fas fa-chart-line"></i></div>
                <div class="iep-goal-notif-text">
                    <strong>+${update.change}% Goal Progress</strong>
                    <span>${escapeHtml(update.description)}</span>
                    <div class="iep-goal-notif-bar">
                        <div class="iep-goal-notif-fill" style="width:${update.newProgress}%"></div>
                    </div>
                </div>
            `;
        }

        document.body.appendChild(notification);

        requestAnimationFrame(() => notification.classList.add('visible'));

        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 400);
        }, 4000);

        notification.addEventListener('click', () => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 400);
        });
    }

    // --- Chunked Assignments Enforcement ---

    function handleChunkedAssignmentCheckIn() {
        const messages = document.querySelectorAll('.message');
        if (messages.length < 2) return;

        const lastTwo = Array.from(messages).slice(-2);
        if (lastTwo[0]?.classList.contains('user') && lastTwo[1]?.classList.contains('ai')) {
            iepChunkProblemCount++;
        }

        if (iepChunkProblemCount >= IEP_CHUNK_SIZE) {
            iepChunkProblemCount = 0;
            showChunkedCheckIn();
        }
    }

    function showChunkedCheckIn() {
        if (document.getElementById('iep-chunk-checkin')) return;

        const overlay = document.createElement('div');
        overlay.id = 'iep-chunk-checkin';
        overlay.className = 'iep-break-overlay';
        overlay.innerHTML = `
            <div class="iep-break-card">
                <h2>Nice work on that set!</h2>
                <p>You just finished ${IEP_CHUNK_SIZE} problems. How are you feeling?</p>
                <div class="iep-break-activities">
                    <button class="iep-break-activity" data-choice="continue">
                        <i class="fas fa-arrow-right"></i>
                        <span>Keep Going</span>
                        <small>I'm ready!</small>
                    </button>
                    <button class="iep-break-activity" data-choice="break">
                        <i class="fas fa-pause-circle"></i>
                        <span>Take a Break</span>
                        <small>I need a moment</small>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.iep-break-activity').forEach(btn => {
            btn.addEventListener('click', () => {
                overlay.remove();
                if (btn.dataset.choice === 'break') {
                    showBreakOverlay();
                }
            });
        });
    }

    // --- Break Overlay ---

    function injectBreakButton() {
        if (document.getElementById('iep-break-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'iep-break-btn';
        btn.className = 'iep-break-btn';
        btn.innerHTML = '<i class="fas fa-pause-circle"></i> Take a Break';
        btn.title = 'Take a brain break';
        btn.setAttribute('aria-label', 'Take a brain break');
        btn.addEventListener('click', showBreakOverlay);
        document.body.appendChild(btn);
    }

    function showBreakOverlay() {
        if (document.getElementById('iep-break-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'iep-break-overlay';
        overlay.className = 'iep-break-overlay';
        overlay.innerHTML = `
            <div class="iep-break-card">
                <h2>Brain Break Time</h2>
                <p>Take a moment to relax. Try one of these:</p>
                <div class="iep-break-activities">
                    <button class="iep-break-activity" data-activity="breathe">
                        <i class="fas fa-wind"></i>
                        <span>Breathe</span>
                        <small>4-7-8 breathing</small>
                    </button>
                    <button class="iep-break-activity" data-activity="stretch">
                        <i class="fas fa-child"></i>
                        <span>Stretch</span>
                        <small>Quick body stretch</small>
                    </button>
                    <button class="iep-break-activity" data-activity="countdown">
                        <i class="fas fa-eye"></i>
                        <span>5-4-3-2-1</span>
                        <small>Grounding exercise</small>
                    </button>
                </div>
                <div id="iep-break-exercise" class="iep-break-exercise" style="display:none;"></div>
                <button class="iep-break-done-btn" id="iep-break-done">
                    <i class="fas fa-check-circle"></i> I'm Ready to Continue
                </button>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.iep-break-activity').forEach(actBtn => {
            actBtn.addEventListener('click', () => {
                const activity = actBtn.dataset.activity;
                const exerciseArea = document.getElementById('iep-break-exercise');
                exerciseArea.style.display = 'block';

                if (activity === 'breathe') {
                    exerciseArea.innerHTML = `
                        <div class="iep-breathing-circle">
                            <div class="iep-breathing-dot"></div>
                        </div>
                        <p class="iep-breathing-instruction">Breathe in... 4 seconds</p>
                    `;
                    runBreathingExercise(exerciseArea);
                } else if (activity === 'stretch') {
                    exerciseArea.innerHTML = `
                        <div class="iep-stretch-steps">
                            <p>1. Reach your arms up high and stretch</p>
                            <p>2. Roll your shoulders backward 5 times</p>
                            <p>3. Turn your head slowly left, then right</p>
                            <p>4. Shake out your hands</p>
                        </div>
                    `;
                } else if (activity === 'countdown') {
                    exerciseArea.innerHTML = `
                        <div class="iep-grounding">
                            <p><strong>5</strong> things you can <em>see</em></p>
                            <p><strong>4</strong> things you can <em>touch</em></p>
                            <p><strong>3</strong> things you can <em>hear</em></p>
                            <p><strong>2</strong> things you can <em>smell</em></p>
                            <p><strong>1</strong> thing you can <em>taste</em></p>
                        </div>
                    `;
                }
            });
        });

        document.getElementById('iep-break-done').addEventListener('click', () => {
            overlay.remove();
        });
    }

    function runBreathingExercise(container) {
        const instruction = container.querySelector('.iep-breathing-instruction');
        const circle = container.querySelector('.iep-breathing-circle');
        if (!instruction || !circle) return;

        const phases = [
            { text: 'Breathe in... 4 seconds', class: 'inhale', duration: 4000 },
            { text: 'Hold... 7 seconds', class: 'hold', duration: 7000 },
            { text: 'Breathe out... 8 seconds', class: 'exhale', duration: 8000 }
        ];
        let phaseIndex = 0;
        let cycles = 0;

        function nextPhase() {
            if (cycles >= 3 || !document.getElementById('iep-break-overlay')) return;
            const phase = phases[phaseIndex];
            instruction.textContent = phase.text;
            circle.className = 'iep-breathing-circle ' + phase.class;
            phaseIndex = (phaseIndex + 1) % phases.length;
            if (phaseIndex === 0) cycles++;
            setTimeout(nextPhase, phase.duration);
        }
        nextPhase();
    }

    // --- Multiplication Chart ---

    function injectMultiplicationChart() {
        if (document.getElementById('iep-mult-chart-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'iep-mult-chart-btn';
        btn.className = 'iep-mult-chart-btn';
        btn.innerHTML = '<i class="fas fa-th"></i> &times; Chart';
        btn.title = 'Open multiplication chart';
        btn.setAttribute('aria-label', 'Open multiplication chart');
        btn.addEventListener('click', toggleMultiplicationChart);
        document.body.appendChild(btn);
    }

    function toggleMultiplicationChart() {
        let chart = document.getElementById('iep-mult-chart');
        if (chart) {
            chart.remove();
            return;
        }

        chart = document.createElement('div');
        chart.id = 'iep-mult-chart';
        chart.className = 'iep-mult-chart';

        let html = '<div class="iep-mult-chart-header"><h3>Multiplication Chart</h3><button class="iep-mult-chart-close" aria-label="Close chart">&times;</button></div>';
        html += '<table class="iep-mult-table"><thead><tr><th>&times;</th>';
        for (let i = 1; i <= 12; i++) html += `<th>${i}</th>`;
        html += '</tr></thead><tbody>';
        for (let r = 1; r <= 12; r++) {
            html += `<tr><th>${r}</th>`;
            for (let c = 1; c <= 12; c++) html += `<td>${r * c}</td>`;
            html += '</tr>';
        }
        html += '</tbody></table>';
        chart.innerHTML = html;
        document.body.appendChild(chart);

        chart.querySelector('.iep-mult-chart-close').addEventListener('click', () => chart.remove());
    }

    return {
        applyIepAccommodations,
        handleIepResponseFeatures,
        handleIepGoalUpdates,
    };
}
