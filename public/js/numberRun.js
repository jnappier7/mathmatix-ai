// numberRun.js - Endless Runner Math Game

// Game State
const gameState = {
    user: null,
    selectedOperation: null,
    selectedFamily: null,
    familyDisplayName: null,
    problems: [],
    currentProblemIndex: 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    attempted: 0,
    correct: 0,
    speed: 1,
    currentLane: 'center', // left, center, right
    gameRunning: false,
    platformInterval: null,
    nextPlatformSet: null,
    startTime: null,
    families: null
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await loadFamilies();
    checkURLParams();
    initializeEventListeners();
});

// Load user
async function loadUser() {
    try {
        const response = await fetch('/user');
        const data = await response.json();
        gameState.user = data.user;

        if (gameState.user) {
            document.getElementById('userName').textContent = gameState.user.firstName || 'Student';
            document.getElementById('userLevel').textContent = gameState.user.level || 1;
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Load fact families
async function loadFamilies() {
    try {
        const response = await fetch('/api/fact-fluency/families');
        const data = await response.json();
        if (data.success) {
            gameState.families = data.families;
        }
    } catch (error) {
        console.error('Error loading families:', error);
    }
}

// Check URL parameters for direct launch from mastery grid
function checkURLParams() {
    const params = new URLSearchParams(window.location.search);
    const operation = params.get('operation');
    const familyName = params.get('family');

    if (operation && familyName) {
        // Launched from mastery grid - skip selection and start directly
        gameState.selectedOperation = operation;
        gameState.selectedFamily = familyName;

        const family = gameState.families[operation]?.find(f => f.familyName === familyName);
        if (family) {
            gameState.familyDisplayName = family.displayName;
            showScreen('game');
            startRun();
        }
    }
}

// Event Listeners
function initializeEventListeners() {
    // Operation selection
    document.querySelectorAll('.op-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.op-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            gameState.selectedOperation = btn.getAttribute('data-operation');
            document.getElementById('startRunBtn').disabled = false;
        });
    });

    // Start run
    document.getElementById('startRunBtn').addEventListener('click', startRun);

    // Play again
    document.getElementById('playAgainBtn').addEventListener('click', () => {
        showScreen('game');
        startRun();
    });

    // Change operation
    document.getElementById('changeOpBtn').addEventListener('click', () => {
        showScreen('start');
        resetGame();
    });

    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/badge-map.html';
    });

    // Keyboard controls
    document.addEventListener('keydown', handleKeyPress);
}

// Handle keyboard input
function handleKeyPress(e) {
    if (!gameState.gameRunning) return;

    if (e.key === 'ArrowLeft') {
        moveLane('left');
    } else if (e.key === 'ArrowRight') {
        moveLane('right');
    }
}

// Move to lane
function moveLane(direction) {
    const char = document.getElementById('runnerChar');

    if (direction === 'left') {
        if (gameState.currentLane === 'center') {
            gameState.currentLane = 'left';
        } else if (gameState.currentLane === 'right') {
            gameState.currentLane = 'center';
        }
    } else if (direction === 'right') {
        if (gameState.currentLane === 'left') {
            gameState.currentLane = 'center';
        } else if (gameState.currentLane === 'center') {
            gameState.currentLane = 'right';
        }
    }

    // Update character position
    char.className = 'runner-char lane-' + gameState.currentLane;
}

// Start run
async function startRun() {
    resetGame();
    gameState.gameRunning = true;
    gameState.startTime = Date.now();

    // Generate problems
    await generateProblems();

    // Show first problem
    displayCurrentProblem();

    // Start spawning platforms
    spawnPlatformSet();
    gameState.platformInterval = setInterval(() => {
        spawnPlatformSet();
    }, 3000 / gameState.speed); // Platforms spawn faster with speed
}

// Generate problems
async function generateProblems() {
    try {
        const requestBody = {
            operation: gameState.selectedOperation,
            count: 100,
            includeTraps: true
        };

        // If practicing a specific family (from mastery grid), use that
        if (gameState.selectedFamily) {
            requestBody.familyName = gameState.selectedFamily;
        } else {
            // Otherwise generate mixed problems from all families
            requestBody.mixed = true;
        }

        const response = await fetch('/api/fact-fluency/generate-problems', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        if (data.success) {
            gameState.problems = data.problems;
        }
    } catch (error) {
        console.error('Error generating problems:', error);
    }
}

// Display current problem
function displayCurrentProblem() {
    const problem = gameState.problems[gameState.currentProblemIndex];
    if (problem) {
        document.getElementById('currentProblem').textContent = problem.problem + ' = ?';
    }
}

// Spawn a set of 3 platforms (one per lane)
function spawnPlatformSet() {
    if (!gameState.gameRunning) return;

    const problem = gameState.problems[gameState.currentProblemIndex];
    if (!problem) {
        endGame('No more problems!');
        return;
    }

    // Create 3 answers: 1 correct + 2 traps (or random if not enough traps)
    const answers = [problem.answer];

    if (problem.trapAnswers && problem.trapAnswers.length >= 2) {
        answers.push(problem.trapAnswers[0], problem.trapAnswers[1]);
    } else {
        // Fallback: generate random wrong answers
        while (answers.length < 3) {
            const wrong = problem.answer + Math.floor(Math.random() * 10) - 5;
            if (wrong > 0 && wrong !== problem.answer && !answers.includes(wrong)) {
                answers.push(wrong);
            }
        }
    }

    // Shuffle answers
    for (let i = answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [answers[i], answers[j]] = [answers[j], answers[i]];
    }

    // Create platforms
    const lanes = ['left', 'center', 'right'];
    const container = document.getElementById('platformsContainer');

    lanes.forEach((lane, index) => {
        const platform = document.createElement('div');
        platform.className = 'platform';
        platform.dataset.answer = answers[index];
        platform.dataset.correct = (answers[index] === problem.answer) ? 'true' : 'false';
        platform.dataset.lane = lane;

        // Position in lane
        const lanePositions = { left: '5%', center: '36%', right: '67%' };
        platform.style.left = lanePositions[lane];

        // Set animation duration based on speed
        const duration = 3 / gameState.speed;
        platform.style.animationDuration = `${duration}s`;

        const answerDisplay = document.createElement('div');
        answerDisplay.className = 'answer';
        answerDisplay.textContent = answers[index];
        platform.appendChild(answerDisplay);

        container.appendChild(platform);

        // Check collision when platform reaches character position
        setTimeout(() => {
            checkCollision(platform);
        }, (duration * 0.65) * 1000); // Check at 65% of animation

        // Remove platform after animation
        setTimeout(() => {
            platform.remove();
        }, duration * 1000);
    });

    // Move to next problem after platforms pass
    setTimeout(() => {
        gameState.currentProblemIndex++;
        displayCurrentProblem();
    }, (3 / gameState.speed) * 1000);
}

// Check collision
function checkCollision(platform) {
    if (!gameState.gameRunning) return;

    const platformLane = platform.dataset.lane;
    const isCorrect = platform.dataset.correct === 'true';

    // Check if character is in same lane
    if (platformLane === gameState.currentLane) {
        gameState.attempted++;

        if (isCorrect) {
            // Hit correct platform
            handleCorrectHit(platform);
        } else {
            // Hit wrong platform - game over
            handleWrongHit(platform);
        }
    } else {
        // Missed all platforms - game over if this was the correct one
        if (isCorrect) {
            setTimeout(() => {
                if (gameState.gameRunning) {
                    endGame('You missed the correct answer!');
                }
            }, 200);
        }
    }
}

// Handle correct hit
function handleCorrectHit(platform) {
    gameState.correct++;
    gameState.streak++;
    gameState.score += Math.floor(10 * gameState.speed);

    if (gameState.streak > gameState.maxStreak) {
        gameState.maxStreak = gameState.streak;
    }

    // Visual feedback
    platform.classList.add('hit');
    platform.classList.add('correct');

    // Increase speed every 5 correct
    if (gameState.correct % 5 === 0 && gameState.speed < 3) {
        gameState.speed += 0.2;
        updatePlatformSpawnRate();
    }

    // Update HUD
    updateHUD();
}

// Handle wrong hit
function handleWrongHit(platform) {
    platform.classList.add('wrong');
    endGame('You hit the wrong answer!');
}

// Update platform spawn rate
function updatePlatformSpawnRate() {
    if (gameState.platformInterval) {
        clearInterval(gameState.platformInterval);
        gameState.platformInterval = setInterval(() => {
            spawnPlatformSet();
        }, 3000 / gameState.speed);
    }
}

// Update HUD
function updateHUD() {
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('streak').textContent = gameState.streak;
    document.getElementById('speed').textContent = gameState.speed.toFixed(1);
}

// End game
async function endGame(reason) {
    gameState.gameRunning = false;
    clearInterval(gameState.platformInterval);

    // Falling animation
    const char = document.getElementById('runnerChar');
    char.classList.add('falling');

    // Record session if practicing a specific family
    if (gameState.selectedFamily && gameState.startTime) {
        await recordSession();
    }

    // Show game over after fall animation
    setTimeout(() => {
        showGameOver(reason);
    }, 1000);
}

// Record session to backend
async function recordSession() {
    try {
        const durationSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);

        const response = await fetch('/api/fact-fluency/record-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operation: gameState.selectedOperation,
                familyName: gameState.selectedFamily,
                displayName: gameState.familyDisplayName,
                durationSeconds,
                problemsAttempted: gameState.attempted,
                problemsCorrect: gameState.correct
            })
        });

        const data = await response.json();
        if (data.success) {
            console.log('Session recorded', data);
        }
    } catch (error) {
        console.error('Error recording session:', error);
    }
}

// Show game over screen
function showGameOver(reason) {
    const accuracy = gameState.attempted > 0
        ? Math.round((gameState.correct / gameState.attempted) * 100)
        : 0;

    document.getElementById('gameOverReason').textContent = reason;
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('finalStreak').textContent = gameState.maxStreak;
    document.getElementById('finalAccuracy').textContent = accuracy + '%';
    document.getElementById('finalProblems').textContent = gameState.correct;

    showScreen('gameOver');
}

// Reset game
function resetGame() {
    gameState.currentProblemIndex = 0;
    gameState.score = 0;
    gameState.streak = 0;
    gameState.maxStreak = 0;
    gameState.attempted = 0;
    gameState.correct = 0;
    gameState.speed = 1;
    gameState.currentLane = 'center';
    gameState.gameRunning = false;

    // Reset character
    const char = document.getElementById('runnerChar');
    char.className = 'runner-char lane-center';

    // Clear platforms
    document.getElementById('platformsContainer').innerHTML = '';

    // Reset HUD
    updateHUD();
}

// Show screen
function showScreen(screenName) {
    const screens = document.querySelectorAll('.game-screen');
    screens.forEach(screen => screen.classList.remove('active'));

    const screenMap = {
        'start': 'startScreen',
        'game': 'gameScreen',
        'gameOver': 'gameOverScreen'
    };

    const screenId = screenMap[screenName];
    if (screenId) {
        document.getElementById(screenId).classList.add('active');
    }
}
