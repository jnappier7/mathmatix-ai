// public/js/guidedPath.js - FINAL VERSION (PHASE 2)

let currentCourse = null;
let currentModuleIndex = 0;
let currentProblemIndex = 0;
let sessionState = 'idle'; // idle, in-lesson-dialogue, awaiting-problem-answer
let lessonHistory = []; // NEW: To keep track of the current lesson dialogue

// --- Path Initialization ---

export function startGuidedPath(courseId, courseData) {
    currentCourse = courseData;
    currentModuleIndex = 0;
    currentProblemIndex = 0;
    lessonHistory = []; // Reset history for a new path
    requestInteractiveLesson();

    if (window.location.pathname !== '/chat.html') {
        window.location.href = `/chat.html?mode=guided&courseId=${courseId}`;
    }
}

export function resumeGuidedPath(courseId, courseData, moduleIndex = 0, problemIndex = 0) {
    currentCourse = courseData;
    currentModuleIndex = moduleIndex;
    currentProblemIndex = problemIndex;
    lessonHistory = []; // Reset history
    requestInteractiveLesson();
}

// --- Core API Communication ---

async function requestInteractiveLesson() {
    if (!currentCourse || !currentCourse.modules || currentModuleIndex >= currentCourse.modules.length) {
        showCompletionBadge();
        return;
    }

    const module = currentCourse.modules[currentModuleIndex];
    displayModuleHeader(module);
    window.showThinkingIndicator(true);

    const lessonContext = {
        title: module.title,
        goals: module.goals,
        miniLessonConcepts: module.miniLesson,
        instructionalStrategies: module.instructionalStrategy,
        // No conversation history on the first call
    };

    try {
        const data = await callLessonAPI(lessonContext);
        await window.appendMessage(data.aiMessage, "ai");
        lessonHistory.push({ role: 'assistant', content: data.aiMessage });
        sessionState = 'in-lesson-dialogue'; 
    } catch (error) {
        console.error("Error fetching AI lesson:", error);
        await window.appendMessage("Sorry, I'm having a little trouble starting the lesson. Please try again.", "ai");
    } finally {
        window.showThinkingIndicator(false);
    }
}

async function continueInteractiveLesson(userInput) {
    const module = currentCourse.modules[currentModuleIndex];
    window.showThinkingIndicator(true);

    lessonHistory.push({ role: 'user', content: userInput });

    const lessonContext = {
        title: module.title,
        goals: module.goals,
        conversationHistory: lessonHistory,
    };
    
    try {
        const data = await callLessonAPI(lessonContext);
        await window.appendMessage(data.aiMessage, "ai");
        lessonHistory.push({ role: 'assistant', content: data.aiMessage });

        // The AI now decides when to move on.
        if (data.lessonState === 'start_assessment') {
            await window.appendMessage("Alright, you've got this! Let's try a few practice problems.", "ai");
            askQuestion(module.starterProblems[currentProblemIndex]);
        } else {
            // Otherwise, stay in dialogue mode
            sessionState = 'in-lesson-dialogue';
        }
    } catch (error) {
        console.error("Error continuing lesson:", error);
        await window.appendMessage("I seem to have lost my train of thought! Let's try that again.", "ai");
    } finally {
        window.showThinkingIndicator(false);
    }
}

async function requestDynamicHint(problem, userAnswer, correctAnswer, module) {
    window.showThinkingIndicator(true);
    const hintContext = { problem, userAnswer, correctAnswer, strategies: module.instructionalStrategy.concat(module.scaffold) };
    try {
        const response = await fetch('/get-scaffolded-hint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(hintContext)
        });
        if (!response.ok) throw new Error('Network response was not ok.');
        const data = await response.json();
        await window.appendMessage(data.hint, "ai");
    } catch (error) {
        console.error("Error fetching AI hint:", error);
        await window.appendMessage("Let's try that again. Take a close look at the signs and your steps.", "ai");
    } finally {
        window.showThinkingIndicator(false);
    }
}

// NEW: Abstracted the fetch call for lessons
async function callLessonAPI(context) {
    const response = await fetch('/generate-interactive-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context)
    });
    if (!response.ok) throw new Error('Network response was not ok.');
    return await response.json();
}

// --- State Management & Routing ---

export async function handleGuidedAnswer(userInput, courseDataFromMain) {
    if (!currentCourse) currentCourse = courseDataFromMain;

    if (sessionState === 'in-lesson-dialogue') {
        await continueInteractiveLesson(userInput);
        return true;
    } else if (sessionState === 'awaiting-problem-answer') {
        await checkProblemAnswer(userInput);
        return true;
    }

    return false;
}

async function checkProblemAnswer(userInput) {
    const module = currentCourse.modules[currentModuleIndex];
    const problem = module.starterProblems[currentProblemIndex];
    const correctAnswer = module.answerKeys[problem];
    
    if (evaluateStudentAnswer(userInput, correctAnswer)) {
        await window.appendMessage('🔥 Nice! That\'s correct!', 'ai');
        currentProblemIndex++;
        if (currentProblemIndex < module.starterProblems.length) {
            askQuestion(module.starterProblems[currentProblemIndex]);
        } else {
            await window.appendMessage('You\'ve mastered this module! Moving on to the next topic.', 'ai');
            currentModuleIndex++;
            currentProblemIndex = 0;
            lessonHistory = []; // Clear history for the next lesson
            setTimeout(requestInteractiveLesson, 2000);
        }
    } else {
        await requestDynamicHint(problem, userInput, correctAnswer, module);
    }
}

// --- Utility Functions ---

function askQuestion(question) {
    window.appendMessage(`✍️ **Practice Problem:** ${question}`, 'ai');
    sessionState = 'awaiting-problem-answer';
}

function displayModuleHeader(module) {
    const header = document.getElementById('lesson-header');
    if (header) {
        header.innerHTML = `<h2>${module.title}</h2><small>Estimated: ${module.estimatedDuration} min</small>`;
        header.style.display = 'block';
    }
}

function evaluateStudentAnswer(userInput, correctAnswer) {
    return userInput.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
}

function showCompletionBadge() {
    window.appendMessage('🎉 Congratulations! You\'ve completed the Ready for Algebra 1 pathway!', 'ai');
    sessionState = 'idle';
    const header = document.getElementById('lesson-header');
    if (header) header.style.display = 'none';
}