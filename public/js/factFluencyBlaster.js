// factFluencyBlaster.js - Main game logic for M∆THBL∆ST Fact Fluency

// Game State
const gameState = {
    user: null,
    currentScreen: 'placement',
    placement: {
        currentOperation: 0,
        operations: ['addition', 'subtraction', 'multiplication', 'division'],
        timeRemaining: 60,
        problems: [],
        currentProblemIndex: 0,
        attempted: 0,
        correct: 0,
        results: [],
        timer: null
    },
    practice: {
        operation: null,
        familyName: null,
        displayName: null,
        problems: [],
        currentProblemIndex: 0,
        startTime: null,
        attempted: 0,
        correct: 0,
        responses: [],
        timer: null
    },
    progress: null,
    families: null
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await loadProgress();
    await loadFamilies();
    initializeEventListeners();
    checkPlacementStatus();
});

// Load current user
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

// Load user progress
async function loadProgress() {
    try {
        const response = await fetch('/api/fact-fluency/progress');
        const data = await response.json();
        if (data.success) {
            gameState.progress = data.progress;
        }
    } catch (error) {
        console.error('Error loading progress:', error);
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

// Check placement status and show appropriate screen
function checkPlacementStatus() {
    if (gameState.progress && gameState.progress.placement && gameState.progress.placement.completed) {
        // Placement already completed, go to recommended level
        showScreen('game');
        startPracticeSession(
            gameState.progress.placement.recommendedOperation,
            gameState.progress.placement.recommendedLevel
        );
    } else {
        // Show placement intro
        showScreen('placement');
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Placement Screen
    document.getElementById('startPlacementBtn').addEventListener('click', startPlacement);
    document.getElementById('submitPlacementAnswer').addEventListener('click', submitPlacementAnswer);
    document.getElementById('placementAnswer').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitPlacementAnswer();
    });

    // Game Screen
    document.getElementById('gameAnswer').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitGameAnswer();
    });
    document.getElementById('gameAnswer').addEventListener('input', () => {
        // Auto-submit if answer looks complete (for single digit answers)
        const input = document.getElementById('gameAnswer');
        if (input.value.length >= 1 && !input.value.includes('-')) {
            // Small delay to allow double-digit entry
            setTimeout(() => {
                if (input.value.length > 0) {
                    submitGameAnswer();
                }
            }, 300);
        }
    });
    document.getElementById('endSessionBtn').addEventListener('click', endPracticeSession);

    // Results Screen
    document.getElementById('practiceAgainBtn').addEventListener('click', () => {
        showScreen('game');
        startPracticeSession(gameState.practice.operation, gameState.practice.familyName);
    });
    document.getElementById('nextLevelBtn').addEventListener('click', startNextLevel);
    document.getElementById('viewProgressBtn').addEventListener('click', () => {
        showProgressDashboard();
    });
    document.getElementById('startPracticeBtn').addEventListener('click', () => {
        const operation = gameState.progress.placement.recommendedOperation;
        const level = gameState.progress.placement.recommendedLevel;
        showScreen('game');
        startPracticeSession(operation, level);
    });

    // Progress Screen
    document.getElementById('backToGameBtn').addEventListener('click', async () => {
        const nextLevel = await getNextLevel();
        if (nextLevel && !nextLevel.needsPlacement && !nextLevel.allMastered) {
            showScreen('game');
            startPracticeSession(nextLevel.nextLevel.operation, nextLevel.nextLevel.familyName);
        } else {
            showScreen('placement');
        }
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const operation = btn.getAttribute('data-operation');
            displayFamilyProgress(operation);
        });
    });

    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/badge-map.html';
    });

    // Break screen continue button
    document.getElementById('continueToNextOperation').addEventListener('click', () => {
        startOperationPlacement();
    });
}

// Show specific screen
function showScreen(screenName) {
    const screens = document.querySelectorAll('.game-screen');
    screens.forEach(screen => screen.classList.remove('active'));

    const screenMap = {
        'placement': 'placementScreen',
        'placementTest': 'placementTestScreen',
        'placementBreak': 'placementBreakScreen',
        'placementResults': 'placementResultsScreen',
        'game': 'gameScreen',
        'results': 'resultsScreen',
        'progress': 'progressScreen'
    };

    const screenId = screenMap[screenName];
    if (screenId) {
        document.getElementById(screenId).classList.add('active');
        gameState.currentScreen = screenName;
    }
}

// ===== PLACEMENT TEST =====

async function startPlacement() {
    showScreen('placementTest');
    gameState.placement.currentOperation = 0;
    gameState.placement.results = [];
    await startOperationPlacement();
}

async function startOperationPlacement() {
    const operation = gameState.placement.operations[gameState.placement.currentOperation];

    // Reset for this operation
    gameState.placement.timeRemaining = 60;
    gameState.placement.attempted = 0;
    gameState.placement.correct = 0;
    gameState.placement.currentProblemIndex = 0;

    // Generate mixed problems for this operation
    const response = await fetch('/api/fact-fluency/generate-problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            operation,
            familyName: gameState.families[operation][Math.floor(Math.random() * gameState.families[operation].length)].familyName,
            count: 100  // Generate plenty of problems
        })
    });

    const data = await response.json();
    if (data.success) {
        gameState.placement.problems = data.problems;
    }

    // Update UI
    const operationNames = {
        'addition': 'Addition',
        'subtraction': 'Subtraction',
        'multiplication': 'Multiplication',
        'division': 'Division'
    };
    document.getElementById('currentOperation').textContent = operationNames[operation];
    document.getElementById('placementAttempted').textContent = '0';
    document.getElementById('placementCorrect').textContent = '0';

    // Show first problem
    displayPlacementProblem();

    // Start timer
    gameState.placement.timer = setInterval(updatePlacementTimer, 1000);

    // Focus on answer input
    document.getElementById('placementAnswer').focus();
}

function displayPlacementProblem() {
    const problem = gameState.placement.problems[gameState.placement.currentProblemIndex];
    if (problem) {
        document.getElementById('placementProblem').textContent = problem.problem;
        document.getElementById('placementAnswer').value = '';
    }
}

function submitPlacementAnswer() {
    const answer = parseInt(document.getElementById('placementAnswer').value);
    const problem = gameState.placement.problems[gameState.placement.currentProblemIndex];

    if (isNaN(answer)) return;

    gameState.placement.attempted++;

    if (answer === problem.answer) {
        gameState.placement.correct++;
    }

    // Update UI
    document.getElementById('placementAttempted').textContent = gameState.placement.attempted;
    document.getElementById('placementCorrect').textContent = gameState.placement.correct;

    // Next problem
    gameState.placement.currentProblemIndex++;
    if (gameState.placement.currentProblemIndex < gameState.placement.problems.length) {
        displayPlacementProblem();
        document.getElementById('placementAnswer').focus();
    }
}

function updatePlacementTimer() {
    gameState.placement.timeRemaining--;
    document.getElementById('placementTimer').textContent = gameState.placement.timeRemaining;

    // Update progress bar
    const progress = ((60 - gameState.placement.timeRemaining) / 60) * 100;
    document.getElementById('placementProgress').style.width = progress + '%';

    // Warning color
    if (gameState.placement.timeRemaining <= 10) {
        document.getElementById('placementTimer').classList.add('warning');
    }

    // Time's up
    if (gameState.placement.timeRemaining <= 0) {
        clearInterval(gameState.placement.timer);
        finishOperationPlacement();
    }
}

function finishOperationPlacement() {
    const operation = gameState.placement.operations[gameState.placement.currentOperation];
    const accuracy = gameState.placement.attempted > 0
        ? Math.round((gameState.placement.correct / gameState.placement.attempted) * 100)
        : 0;
    const rate = Math.round((gameState.placement.correct / 60) * 60); // Digits per minute

    gameState.placement.results.push({
        operation,
        attempted: gameState.placement.attempted,
        correct: gameState.placement.correct,
        accuracy,
        rate
    });

    // Move to next operation or finish
    gameState.placement.currentOperation++;
    if (gameState.placement.currentOperation < gameState.placement.operations.length) {
        // Show break screen before next operation
        showBreakScreen(operation, accuracy);
    } else {
        // All operations complete
        finishPlacement();
    }
}

function showBreakScreen(completedOperation, accuracy) {
    showScreen('placementBreak');

    const operationNames = {
        'addition': 'Addition',
        'subtraction': 'Subtraction',
        'multiplication': 'Multiplication',
        'division': 'Division'
    };

    // Show what was just completed
    document.getElementById('breakOperationComplete').textContent =
        operationNames[completedOperation] + ' Complete!';

    // Show stats from last operation
    document.getElementById('breakAttempted').textContent = gameState.placement.attempted;
    document.getElementById('breakCorrect').textContent = gameState.placement.correct;
    document.getElementById('breakAccuracy').textContent = accuracy + '%';

    // Show what's next
    const nextOperation = gameState.placement.operations[gameState.placement.currentOperation];
    document.getElementById('breakNextOperation').textContent = operationNames[nextOperation];
}

async function finishPlacement() {
    // Save placement results
    const response = await fetch('/api/fact-fluency/placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            results: gameState.placement.results
        })
    });

    const data = await response.json();
    if (data.success) {
        // Reload progress
        await loadProgress();

        // Show results
        showPlacementResults();
    }
}

function showPlacementResults() {
    showScreen('placementResults');

    // Display results for each operation
    const resultsContainer = document.getElementById('placementResultsData');
    resultsContainer.innerHTML = '';

    gameState.placement.results.forEach(result => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <h3>${capitalizeFirst(result.operation)}</h3>
            <p><strong>Attempted:</strong> ${result.attempted}</p>
            <p><strong>Correct:</strong> ${result.correct}</p>
            <p><strong>Accuracy:</strong> ${result.accuracy}%</p>
            <p><strong>Rate:</strong> ${result.rate}/min</p>
        `;
        resultsContainer.appendChild(card);
    });

    // Show recommendation
    document.getElementById('recommendedOperation').textContent =
        capitalizeFirst(gameState.progress.placement.recommendedOperation);

    const family = gameState.families[gameState.progress.placement.recommendedOperation]
        .find(f => f.familyName === gameState.progress.placement.recommendedLevel);

    document.getElementById('recommendedLevel').textContent = family ? family.displayName : '';
}

// ===== PRACTICE SESSION =====

async function startPracticeSession(operation, familyName) {
    // Get family config
    const family = gameState.families[operation].find(f => f.familyName === familyName);
    if (!family) {
        console.error('Invalid family');
        return;
    }

    // Reset practice state
    gameState.practice = {
        operation,
        familyName,
        displayName: family.displayName,
        problems: [],
        currentProblemIndex: 0,
        startTime: Date.now(),
        attempted: 0,
        correct: 0,
        responses: [],
        timer: null
    };

    // Generate problems
    const response = await fetch('/api/fact-fluency/generate-problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            operation,
            familyName,
            count: 50
        })
    });

    const data = await response.json();
    if (data.success) {
        gameState.practice.problems = data.problems;
    }

    // Update UI
    document.getElementById('currentLevelName').textContent =
        `${capitalizeFirst(operation)} ${family.displayName}`;
    document.getElementById('masteryStatus').textContent = 'In Progress';
    document.getElementById('masteryStatus').className = 'status-badge in-progress';
    document.getElementById('gameAccuracy').textContent = '100';
    document.getElementById('gameRate').textContent = '0';
    document.getElementById('gameTimer').textContent = '0';

    // Show first problem
    displayGameProblem();

    // Start timer
    gameState.practice.timer = setInterval(updateGameTimer, 1000);

    // Focus answer input
    document.getElementById('gameAnswer').focus();
}

function displayGameProblem() {
    const problem = gameState.practice.problems[gameState.practice.currentProblemIndex];
    if (problem) {
        document.getElementById('gameProblem').textContent = problem.problem;
        document.getElementById('gameAnswer').value = '';

        // Reset asteroid animation
        const asteroid = document.getElementById('asteroid');
        asteroid.classList.remove('explode', 'shake');
    }
}

function submitGameAnswer() {
    const input = document.getElementById('gameAnswer');
    const answer = parseInt(input.value);
    const problem = gameState.practice.problems[gameState.practice.currentProblemIndex];

    if (isNaN(answer)) return;

    const responseTime = Date.now() - gameState.practice.startTime;
    const correct = answer === problem.answer;

    gameState.practice.attempted++;
    if (correct) {
        gameState.practice.correct++;
    }

    gameState.practice.responses.push({
        problem: problem.problem,
        answer: problem.answer,
        userAnswer: answer,
        correct,
        responseTime
    });

    // Visual feedback
    showFeedback(correct, problem.answer);

    // Update stats
    updateGameStats();

    // Move to next problem
    gameState.practice.currentProblemIndex++;
    if (gameState.practice.currentProblemIndex < gameState.practice.problems.length) {
        setTimeout(() => {
            displayGameProblem();
            document.getElementById('gameAnswer').focus();
        }, 800);
    } else {
        // Out of problems, end session
        setTimeout(() => endPracticeSession(), 1000);
    }
}

function showFeedback(correct, correctAnswer) {
    const feedback = document.getElementById('feedbackDisplay');
    const asteroid = document.getElementById('asteroid');

    if (correct) {
        feedback.textContent = '✓ Correct!';
        feedback.className = 'feedback-display correct';
        asteroid.classList.add('explode');
        playSound('correct');
    } else {
        feedback.textContent = `✗ Incorrect (${correctAnswer})`;
        feedback.className = 'feedback-display incorrect';
        asteroid.classList.add('shake');
        playSound('incorrect');
    }

    setTimeout(() => {
        feedback.textContent = '';
        feedback.className = 'feedback-display';
    }, 800);
}

function updateGameStats() {
    const accuracy = gameState.practice.attempted > 0
        ? Math.round((gameState.practice.correct / gameState.practice.attempted) * 100)
        : 100;

    const elapsedSeconds = Math.floor((Date.now() - gameState.practice.startTime) / 1000);
    const rate = elapsedSeconds > 0
        ? Math.round((gameState.practice.correct / elapsedSeconds) * 60)
        : 0;

    document.getElementById('gameAccuracy').textContent = accuracy;
    document.getElementById('gameRate').textContent = rate;

    // Update fluency progress bar
    const targetRate = getTargetRate();
    const progress = Math.min((rate / targetRate) * 100, 100);
    document.getElementById('fluencyProgress').style.width = progress + '%';
}

function updateGameTimer() {
    const elapsedSeconds = Math.floor((Date.now() - gameState.practice.startTime) / 1000);
    document.getElementById('gameTimer').textContent = elapsedSeconds;

    // Update stats
    updateGameStats();
}

function getTargetRate() {
    // Get target rate based on grade level (Morningside standards)
    if (!gameState.user || !gameState.user.gradeLevel) return 40;

    const grade = parseInt(gameState.user.gradeLevel);
    if (grade >= 9) return 60;  // High school
    if (grade >= 6) return 50;  // Middle school
    return 40;  // Elementary
}

async function endPracticeSession() {
    clearInterval(gameState.practice.timer);

    const durationSeconds = Math.floor((Date.now() - gameState.practice.startTime) / 1000);
    const accuracy = gameState.practice.attempted > 0
        ? Math.round((gameState.practice.correct / gameState.practice.attempted) * 100)
        : 0;
    const rate = durationSeconds > 0
        ? Math.round((gameState.practice.correct / durationSeconds) * 60)
        : 0;

    // Save session to backend
    const response = await fetch('/api/fact-fluency/record-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            operation: gameState.practice.operation,
            familyName: gameState.practice.familyName,
            displayName: gameState.practice.displayName,
            durationSeconds,
            problemsAttempted: gameState.practice.attempted,
            problemsCorrect: gameState.practice.correct
        })
    });

    const data = await response.json();

    // Show results
    showSessionResults(data);
}

function showSessionResults(data) {
    showScreen('results');

    const durationSeconds = Math.floor((Date.now() - gameState.practice.startTime) / 1000);
    const accuracy = gameState.practice.attempted > 0
        ? Math.round((gameState.practice.correct / gameState.practice.attempted) * 100)
        : 0;
    const rate = data.rate || 0;

    // Populate results
    document.getElementById('resultAttempted').textContent = gameState.practice.attempted;
    document.getElementById('resultCorrect').textContent = gameState.practice.correct;
    document.getElementById('resultAccuracy').textContent = accuracy + '%';
    document.getElementById('resultRate').textContent = rate;
    document.getElementById('resultDuration').textContent = durationSeconds;

    // Mastery message
    const masteryMsg = document.getElementById('masteryMessage');
    const targetRate = getTargetRate();

    if (data.masteryAchieved) {
        document.getElementById('resultsTitle').textContent = '🎉 MASTERY ACHIEVED! 🎉';
        masteryMsg.className = 'mastery-message achieved';
        masteryMsg.innerHTML = `
            <h2>🌟 Congratulations! 🌟</h2>
            <p>You've mastered ${gameState.practice.displayName}!</p>
            <p>✓ Accuracy: ${accuracy}% (Goal: 95%+)</p>
            <p>✓ Rate: ${rate}/min (Goal: ${targetRate}+/min)</p>
            <p><strong>Ready for the next level!</strong></p>
        `;
        document.getElementById('nextLevelBtn').style.display = 'inline-block';
        playSound('mastery');
    } else {
        document.getElementById('resultsTitle').textContent = 'Great Practice Session!';
        masteryMsg.className = 'mastery-message not-achieved';

        const needsAccuracy = accuracy < 95;
        const needsSpeed = rate < targetRate;

        masteryMsg.innerHTML = `
            <h3>Keep Practicing!</h3>
            <p>You're making progress on ${gameState.practice.displayName}</p>
            ${needsAccuracy ? `<p>⚡ Goal: Improve accuracy to 95%+ (Currently: ${accuracy}%)</p>` : ''}
            ${needsSpeed ? `<p>⚡ Goal: Increase speed to ${targetRate}+/min (Currently: ${rate}/min)</p>` : ''}
            <p><strong>You can do it!</strong></p>
        `;
        document.getElementById('nextLevelBtn').style.display = 'none';
    }

    // Reload progress
    loadProgress();
}

async function startNextLevel() {
    const nextLevel = await getNextLevel();

    if (nextLevel && nextLevel.nextLevel) {
        showScreen('game');
        startPracticeSession(nextLevel.nextLevel.operation, nextLevel.nextLevel.familyName);
    } else if (nextLevel && nextLevel.allMastered) {
        alert('🎉 Congratulations! You\'ve mastered all fact families in ' +
              capitalizeFirst(gameState.practice.operation) + '!');
        showProgressDashboard();
    }
}

async function getNextLevel() {
    try {
        const response = await fetch('/api/fact-fluency/next-level');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error getting next level:', error);
        return null;
    }
}

// ===== PROGRESS DASHBOARD =====

async function showProgressDashboard() {
    showScreen('progress');
    await loadProgress();

    // Overall stats
    const stats = gameState.progress.stats || {};
    document.getElementById('totalSessions').textContent = stats.totalSessions || 0;
    document.getElementById('currentStreak').textContent = stats.currentStreak || 0;
    document.getElementById('overallAccuracy').textContent = (stats.overallAccuracy || 0) + '%';

    // Count mastered facts
    let masteredCount = 0;
    const families = gameState.progress.factFamilies || {};
    for (let key in families) {
        if (families[key].mastered) masteredCount++;
    }
    document.getElementById('factsMastered').textContent = masteredCount;

    // Show addition by default
    displayFamilyProgress('addition');
}

function displayFamilyProgress(operation) {
    const container = document.getElementById('familyProgressGrid');
    container.innerHTML = '';

    const familyList = gameState.families[operation] || [];
    const progressData = gameState.progress.factFamilies || {};

    familyList.forEach(family => {
        const familyKey = `${operation}-${family.familyName}`;
        const data = progressData[familyKey] || {};

        const card = document.createElement('div');
        card.className = 'family-card' + (data.mastered ? ' mastered' : '');

        card.innerHTML = `
            <div class="family-name">${family.displayName}</div>
            <div class="family-badge">${data.mastered ? '✓' : '○'}</div>
            ${data.bestRate ? `
                <div class="family-stats">
                    <div>${data.bestRate}/min</div>
                    <div>${data.bestAccuracy}%</div>
                </div>
            ` : '<div class="family-stats">Not practiced</div>'}
        `;

        container.appendChild(card);
    });
}

// ===== UTILITIES =====

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function playSound(type) {
    // Sound effects could be added here
    // For now, just console log
    console.log('Sound:', type);
}
