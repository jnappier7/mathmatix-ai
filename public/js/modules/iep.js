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
    let extendedTimeIndicatorInjected = false;
    let calculatorAutoOpened = false;

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

        // Large Print / High Contrast: force high-contrast theme and override ThemeToggle
        if (accom.largePrintHighContrast) {
            document.body.classList.remove('dark-mode');
            document.body.classList.add('iep-high-contrast');
            // Override the theme system so dark mode can't re-engage
            if (window.ThemeToggle) {
                window.ThemeToggle.setTheme('light');
            }
            document.documentElement.setAttribute('data-theme', 'light');
            console.log('[IEP] High contrast mode enabled (dark mode overridden, theme locked to light)');
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

        // Extended Time: show reassuring indicator so student knows they have extra time
        if (accom.extendedTime && !extendedTimeIndicatorInjected) {
            injectExtendedTimeIndicator();
        }
    }

    // --- Per-response IEP features (from chat API response) ---

    function handleIepResponseFeatures(iepFeatures) {
        if (!iepFeatures) return;

        // Auto-show calculator once on first response; respect if student closes it
        if (iepFeatures.showCalculator && window.floatingCalc && !calculatorAutoOpened) {
            const calcEl = document.getElementById('floating-calculator');
            if (calcEl && calcEl.style.display === 'none') {
                window.floatingCalc.showCalculator();
                console.log('[IEP] Auto-opened calculator for calculatorAllowed accommodation');
            }
            calculatorAutoOpened = true;
        }

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
                const rawText = latest.dataset.rawText || latest.querySelector('.message-text')?.textContent || '';
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
                    <button class="iep-break-activity" data-activity="tictactoe">
                        <i class="fas fa-th"></i>
                        <span>Tic-Tac-Toe</span>
                        <small>Quick game</small>
                    </button>
                    <button class="iep-break-activity" data-activity="wordguess">
                        <i class="fas fa-font"></i>
                        <span>Word Guess</span>
                        <small>Guess the word</small>
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
                } else if (activity === 'tictactoe') {
                    runTicTacToe(exerciseArea);
                } else if (activity === 'wordguess') {
                    runWordGuess(exerciseArea);
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

    // --- Tic-Tac-Toe Break Game ---

    function runTicTacToe(container) {
        let board = Array(9).fill('');
        let currentPlayer = 'X'; // Player is X, computer is O
        let gameOver = false;

        function render() {
            const statusText = gameOver
                ? container.querySelector('.iep-ttt-status').textContent
                : "Your turn (X)";
            container.innerHTML = `
                <div class="iep-ttt">
                    <p class="iep-ttt-status">${statusText}</p>
                    <div class="iep-ttt-board">
                        ${board.map((cell, i) => `
                            <button class="iep-ttt-cell ${cell ? 'taken' : ''}" data-index="${i}"
                                ${cell || gameOver ? 'disabled' : ''}>${cell}</button>
                        `).join('')}
                    </div>
                    ${gameOver ? '<button class="iep-ttt-reset">Play Again</button>' : ''}
                </div>
            `;
            container.querySelectorAll('.iep-ttt-cell:not([disabled])').forEach(btn => {
                btn.addEventListener('click', () => handleMove(parseInt(btn.dataset.index)));
            });
            const resetBtn = container.querySelector('.iep-ttt-reset');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    board = Array(9).fill('');
                    currentPlayer = 'X';
                    gameOver = false;
                    render();
                });
            }
        }

        function checkWinner() {
            const lines = [
                [0,1,2],[3,4,5],[6,7,8],
                [0,3,6],[1,4,7],[2,5,8],
                [0,4,8],[2,4,6]
            ];
            for (const [a,b,c] of lines) {
                if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                    return board[a];
                }
            }
            return board.every(cell => cell) ? 'draw' : null;
        }

        function computerMove() {
            const empty = board.map((c, i) => c === '' ? i : -1).filter(i => i >= 0);
            if (empty.length === 0) return;

            // Simple AI: try to win, then block, then take center, then random
            const lines = [
                [0,1,2],[3,4,5],[6,7,8],
                [0,3,6],[1,4,7],[2,5,8],
                [0,4,8],[2,4,6]
            ];

            // Try to win
            for (const [a,b,c] of lines) {
                const cells = [board[a], board[b], board[c]];
                if (cells.filter(x => x === 'O').length === 2 && cells.includes('')) {
                    const idx = [a,b,c][cells.indexOf('')];
                    board[idx] = 'O';
                    return;
                }
            }

            // Block player
            for (const [a,b,c] of lines) {
                const cells = [board[a], board[b], board[c]];
                if (cells.filter(x => x === 'X').length === 2 && cells.includes('')) {
                    const idx = [a,b,c][cells.indexOf('')];
                    board[idx] = 'O';
                    return;
                }
            }

            // Take center if available
            if (board[4] === '') { board[4] = 'O'; return; }

            // Random
            const pick = empty[Math.floor(Math.random() * empty.length)];
            board[pick] = 'O';
        }

        function handleMove(index) {
            if (board[index] || gameOver) return;
            board[index] = 'X';
            let winner = checkWinner();
            if (winner) {
                gameOver = true;
                render();
                setStatus(winner === 'draw' ? "It's a draw!" : 'You win!');
                return;
            }
            computerMove();
            winner = checkWinner();
            if (winner) {
                gameOver = true;
                render();
                setStatus(winner === 'draw' ? "It's a draw!" : 'Computer wins!');
                return;
            }
            render();
        }

        function setStatus(text) {
            const el = container.querySelector('.iep-ttt-status');
            if (el) el.textContent = text;
        }

        render();
    }

    // --- Word Guess Break Game ---

    function runWordGuess(container) {
        const words = [
            'angle', 'graph', 'prime', 'shape', 'ratio', 'slope',
            'digit', 'equal', 'minus', 'value', 'cubic', 'dozen',
            'total', 'proof', 'chord', 'plane', 'helix', 'unity'
        ];
        let word = words[Math.floor(Math.random() * words.length)];
        let guessed = new Set();
        let wrongCount = 0;
        const maxWrong = 6;

        function getDisplay() {
            return word.split('').map(ch => guessed.has(ch) ? ch : '_').join(' ');
        }

        function isWon() {
            return word.split('').every(ch => guessed.has(ch));
        }

        function drawHangman(wrong) {
            const parts = [
                '<circle cx="50" cy="25" r="10" stroke="#667eea" stroke-width="2" fill="none"/>',         // head
                '<line x1="50" y1="35" x2="50" y2="60" stroke="#667eea" stroke-width="2"/>',              // body
                '<line x1="50" y1="42" x2="35" y2="52" stroke="#667eea" stroke-width="2"/>',              // left arm
                '<line x1="50" y1="42" x2="65" y2="52" stroke="#667eea" stroke-width="2"/>',              // right arm
                '<line x1="50" y1="60" x2="38" y2="75" stroke="#667eea" stroke-width="2"/>',              // left leg
                '<line x1="50" y1="60" x2="62" y2="75" stroke="#667eea" stroke-width="2"/>',              // right leg
            ];
            return `
                <svg class="iep-wordguess-svg" viewBox="0 0 100 90" width="120" height="108">
                    <!-- gallows -->
                    <line x1="15" y1="85" x2="85" y2="85" stroke="#555" stroke-width="2"/>
                    <line x1="25" y1="85" x2="25" y2="5" stroke="#555" stroke-width="2"/>
                    <line x1="25" y1="5" x2="50" y2="5" stroke="#555" stroke-width="2"/>
                    <line x1="50" y1="5" x2="50" y2="15" stroke="#555" stroke-width="2"/>
                    ${parts.slice(0, wrong).join('')}
                </svg>
            `;
        }

        function render() {
            const gameOver = wrongCount >= maxWrong || isWon();
            const won = isWon();
            const status = gameOver
                ? (won ? 'You got it!' : `The word was: ${word}`)
                : `Wrong guesses: ${wrongCount} / ${maxWrong}`;

            const alphabet = 'abcdefghijklmnopqrstuvwxyz';
            container.innerHTML = `
                <div class="iep-wordguess">
                    ${drawHangman(wrongCount)}
                    <p class="iep-wordguess-word">${gameOver && !won ? word.split('').join(' ') : getDisplay()}</p>
                    <p class="iep-wordguess-status">${status}</p>
                    <div class="iep-wordguess-letters">
                        ${alphabet.split('').map(ch => `
                            <button class="iep-wordguess-letter ${guessed.has(ch) ? (word.includes(ch) ? 'correct' : 'wrong') : ''}"
                                data-letter="${ch}" ${guessed.has(ch) || gameOver ? 'disabled' : ''}>${ch}</button>
                        `).join('')}
                    </div>
                    ${gameOver ? '<button class="iep-wordguess-reset">Play Again</button>' : ''}
                </div>
            `;

            container.querySelectorAll('.iep-wordguess-letter:not([disabled])').forEach(btn => {
                btn.addEventListener('click', () => {
                    const letter = btn.dataset.letter;
                    guessed.add(letter);
                    if (!word.includes(letter)) wrongCount++;
                    render();
                });
            });

            const resetBtn = container.querySelector('.iep-wordguess-reset');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    word = words[Math.floor(Math.random() * words.length)];
                    guessed = new Set();
                    wrongCount = 0;
                    render();
                });
            }
        }

        render();
    }

    // --- Extended Time Indicator ---

    function injectExtendedTimeIndicator() {
        if (document.getElementById('iep-extended-time-indicator')) return;
        extendedTimeIndicatorInjected = true;

        const indicator = document.createElement('div');
        indicator.id = 'iep-extended-time-indicator';
        indicator.className = 'iep-extended-time-indicator';
        indicator.innerHTML = '<i class="fas fa-clock"></i> <span>Extended Time (1.5x)</span>';
        indicator.title = 'You have extended time on timed activities';
        indicator.setAttribute('aria-label', 'Extended time accommodation active: 1.5x time on timed activities');
        document.body.appendChild(indicator);

        // Auto-hide after 8 seconds, then show only on hover of the icon
        setTimeout(() => {
            indicator.classList.add('collapsed');
        }, 8000);

        indicator.addEventListener('click', () => {
            indicator.classList.toggle('collapsed');
        });
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
