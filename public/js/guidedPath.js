// public/js/guidedPath.js - CORRECTED

let currentCourse = null;
let currentModuleData = null; // Stores the loaded content of the current module JSON
let currentModuleIndex = 0;
let currentScaffoldStepIndex = 0; // Tracks the current step within a module's scaffold
let currentProblemIndex = 0; // For practice/assessment problems within a step
let sessionState = 'idle'; // idle, in-lesson-dialogue, awaiting-problem-answer, displaying-scaffold
let lessonHistory = []; // To keep track of the current lesson dialogue
let lessonPhaseState = null; // NEW: Adaptive lesson phase state (I Do / We Do / You Do)

// --- Path Initialization & Course Overview ---

// NEW: Function to load the pathway overview and display course cards
export async function loadPathwayOverview(currentUser) { // [MODIFIED] Accept currentUser
    const courseCardsContainer = document.getElementById('course-cards-container');
    const lessonsPane = document.getElementById('lessons-pane');
    const lessonContentPlaceholder = document.getElementById('lesson-content-placeholder');
    const lessonHeader = document.getElementById('lessons-pane').querySelector('#lesson-header');

    // Clear previous content
    if (courseCardsContainer) courseCardsContainer.innerHTML = '';
    if (lessonContentPlaceholder) lessonContentPlaceholder.innerHTML = `👈 Chat with your tutor to get started, or select a course from the sidebar.`;
    if (lessonHeader) lessonHeader.style.display = 'none'; // Hide header initially

    window.showThinkingIndicator(true);
    try {
        const response = await fetch('/resources/ready-for-algebra-1-pathway.json');
        if (!response.ok) throw new Error('Failed to load pathway overview.');
        currentCourse = await response.json();

        // Populate course cards in the sidebar
        if (currentCourse && currentCourse.modules && courseCardsContainer) {
            currentCourse.modules.forEach((module, index) => {
                const card = document.createElement('div');
                card.classList.add('course-card');
                
                const completionPercentage = (currentUser?.completedModules?.includes(module.moduleId)) ? 100 : 0;
                card.innerHTML = `
                    <div class="progress-circle-container" style="background: conic-gradient(var(--clr-success-green) ${completionPercentage}%, #e0e0e0 ${completionPercentage}%); margin-bottom: 10px;">
                        <div class="progress-circle-inner">${completionPercentage}%</div>
                    </div>
                    <h3>${module.title}</h3>
                    <p>${module.preview || module.description || ''}</p>
                    <button class="enroll-btn" data-module-id="${module.moduleId}" data-module-index="${index}">
                        ${completionPercentage === 100 ? '✅ Completed' : '🚀 Start Lesson'}
                    </button>
                `;
                courseCardsContainer.appendChild(card);

                card.querySelector('.enroll-btn').addEventListener('click', async (event) => {
                    const moduleId = event.target.dataset.moduleId;
                    const moduleIdx = parseInt(event.target.dataset.moduleIndex);
                    await startOrResumeModule(moduleId, moduleIdx);
                    document.querySelector('.tab-button[data-tab="lessons-pane"]')?.click();
                });
            });
        }
    } catch (error) {
        console.error("Error loading pathway overview:", error);
        if (lessonsPane) lessonsPane.innerHTML = `<p>Error loading lessons: ${error.message}</p>`;
        if (courseCardsContainer) courseCardsContainer.innerHTML = `<p>Error loading courses.</p>`;
    } finally {
        window.showThinkingIndicator(false);
    }
}

// NEW: Function to start or resume a specific module
export async function startOrResumeModule(moduleId, moduleIndex) {
    if (!currentCourse) {
        await loadPathwayOverview(window.currentUser);
        if (!currentCourse) {
            window.appendMessage("Could not load the course. Please try again later.", "ai");
            return;
        }
    }

    currentModuleIndex = moduleIndex;
    const moduleRef = currentCourse.modules[currentModuleIndex];
    if (!moduleRef || !moduleRef.source) {
        window.appendMessage("Selected lesson module not found or improperly configured.", "ai");
        return;
    }

    window.showThinkingIndicator(true);
    try {
        const response = await fetch(`/modules/${moduleRef.source}`);
        if (!response.ok) throw new Error(`Failed to load module: /modules/${moduleRef.source}`);
        currentModuleData = await response.json(); 

        currentScaffoldStepIndex = 0;
        currentProblemIndex = 0;
        lessonHistory = [];
        lessonPhaseState = null; // Reset adaptive lesson phase

        displayModuleHeader(currentModuleData);
        await processNextScaffoldStep();
        
    } catch (error) {
        console.error("Error loading module:", error);
        window.appendMessage(`Sorry, I couldn't load that lesson: ${error.message}. Please try selecting another or refreshing.`, "ai");
    } finally {
        window.showThinkingIndicator(false);
    }
}

// NEW: Processes the next step in the module's scaffold array
async function processNextScaffoldStep() {
    const lessonContentPlaceholder = document.getElementById('lesson-content-placeholder');
    if (!lessonContentPlaceholder) {
        console.error("Lesson content placeholder not found!");
        return;
    }
    
    if (!currentModuleData || !currentModuleData.scaffold || currentScaffoldStepIndex >= currentModuleData.scaffold.length) {
        // Module scaffold completed
        window.appendMessage(`Great work! You've completed the learning part of "${currentModuleData.title}". Let's check your understanding.`, 'ai');
        startAssessment(); // Transition to assessment
        return;
    }

    const step = currentModuleData.scaffold[currentScaffoldStepIndex];
    lessonContentPlaceholder.innerHTML = '';
    let contentHtml = '';
    
    switch (step.type) {
        case 'explanation':
        case 'model':
            contentHtml += step.type === 'model' ? `<h3>Example: ${step.problem}</h3>` : '';
            contentHtml += `<p>${step.text || step.goal || step.explanation}</p>`;
            if (step.image) contentHtml += `<img src="/images/${step.image}" alt="Lesson diagram" class="lesson-image" />`;
            // More logic for video etc. can go here
            
            await window.appendMessage(step.initialPrompt || `What are your thoughts on this?`, "ai");
            sessionState = 'in-lesson-dialogue';
            break;
        case 'guided_practice':
        case 'independent_practice':
            currentProblemIndex = 0;
            contentHtml += `<h3>${step.type === 'guided_practice' ? 'Guided Practice' : 'Independent Practice'}</h3>`;
            contentHtml += `<div id="problems-container"></div>`;
            lessonContentPlaceholder.innerHTML = contentHtml;
            askProblemFromCurrentStep();
            return; 
        default:
            contentHtml += `<p>Unknown step type: ${step.type}</p>`;
            await window.appendMessage(`I'm not sure what to do next. Let's try something else.`, "ai");
            sessionState = 'in-lesson-dialogue';
            currentScaffoldStepIndex++;
            setTimeout(processNextScaffoldStep, 1500);
            return;
    }
    
    lessonContentPlaceholder.innerHTML = contentHtml;
    if (window.renderMathInElement) window.renderMathInElement(lessonContentPlaceholder);
}

// Asks a problem from the current practice/assessment step
function askProblemFromCurrentStep() {
    if (!currentModuleData || !currentModuleData.scaffold) return;
    const step = currentModuleData.scaffold[currentScaffoldStepIndex];

    if (!step || !step.problems || currentProblemIndex >= step.problems.length) {
        currentScaffoldStepIndex++;
        currentProblemIndex = 0;
        processNextScaffoldStep();
        return;
    }

    const problem = step.problems[currentProblemIndex];
    window.appendMessage(`✍️ **Problem ${currentProblemIndex + 1}:** ${problem.question}`, 'ai');
    sessionState = 'awaiting-problem-answer';
}

function startAssessment() {
    const lessonContentPlaceholder = document.getElementById('lesson-content-placeholder');
    if (!lessonContentPlaceholder) return;
    
    lessonContentPlaceholder.innerHTML = `
        <h2>📋 Assessment: ${currentModuleData.title}</h2>
        <p>${currentModuleData.description || 'Complete the following problems.'}</p>
        <div id="assessment-problems-container"></div>
    `;
    currentProblemIndex = 0;
    askAssessmentQuestion();
}

function askAssessmentQuestion() {
    if (!currentModuleData || !currentModuleData.assessmentProblems || currentProblemIndex >= currentModuleData.assessmentProblems.length) {
        window.appendMessage("You've completed the assessment! I'm reviewing your answers...", "ai");
        sessionState = 'idle'; // Or 'reviewing-assessment'
        // In a real app, you would now score and save the assessment results.
        return;
    }

    const problem = currentModuleData.assessmentProblems[currentProblemIndex];
    window.appendMessage(`📝 **Assessment Question ${currentProblemIndex + 1}:** ${problem}`, 'ai');
    sessionState = 'awaiting-problem-answer';
}

// --- CORE API COMMUNICATION ---

async function requestLessonAIResponse(context, endpoint) {
    window.showThinkingIndicator(true);
    try {
        // CHANGED: Added /api prefix and fixed body structure
        const response = await fetch(`/api${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(context) // Send context object directly
        });
        if (!response.ok) throw new Error(`Network response was not ok. Status: ${response.status}`);
        const data = await response.json();
        
        await window.appendMessage(data.aiMessage, "ai");
        lessonHistory.push({ role: 'assistant', content: data.aiMessage });
        
        return data;
    } catch (error) {
        console.error("Error fetching AI lesson/dialogue/hint:", error);
        await window.appendMessage("Sorry, I'm having a little trouble. Let's try that again.", "ai");
        throw error;
    } finally {
        window.showThinkingIndicator(false);
    }
}

// MODIFIED: handle user input during guided path
export async function handleGuidedAnswer(userInput, currentUserData) {
    if (!currentModuleData) return false;

    lessonHistory.push({ role: 'user', content: userInput });

    if (sessionState === 'in-lesson-dialogue') {
        const lessonContext = {
            title: currentModuleData.title,
            goals: currentModuleData.goals || [],
            miniLessonConcepts: currentModuleData.miniLessonConcepts || currentModuleData.concepts || [],
            instructionalStrategies: currentModuleData.instructionalStrategy || ['inquiry', 'modeling', 'scaffolding'],
            skillId: currentModuleData.skillId || currentModuleData.moduleId,
            scaffold: currentModuleData.scaffold,
            conversationHistory: lessonHistory,
            currentScaffoldStep: currentModuleData.scaffold[currentScaffoldStepIndex],
            phaseState: lessonPhaseState // Pass current phase state
        };
        try {
            const data = await requestLessonAIResponse(lessonContext, '/guidedLesson/generate-interactive-lesson');

            // Update phase state from response
            if (data.phaseState) {
                lessonPhaseState = data.phaseState;
                console.log(`📚 Lesson Phase: ${data.currentPhase || 'unknown'}`);
            }

            if (data.lessonState === 'start_assessment' || data.lessonState === 'scaffold_complete') {
                currentScaffoldStepIndex++;
                await processNextScaffoldStep();
            } else {
                sessionState = 'in-lesson-dialogue';
            }
        } catch (error) {
            console.error("Error continuing dialogue:", error);
        }
        return true;
    } else if (sessionState === 'awaiting-problem-answer') {
        // ... (rest of the function is okay, but ensure the hint request is also fixed)
        const isAssessment = currentModuleData.type === 'assessment';
        const problemSet = isAssessment ? currentModuleData.assessmentProblems : currentModuleData.scaffold[currentScaffoldStepIndex]?.problems;
        const answerKey = isAssessment ? currentModuleData.answerKeys : null;

        if (!problemSet || currentProblemIndex >= problemSet.length) {
            // ... (error handling) ...
            return true;
        }

        const problem = isAssessment ? problemSet[currentProblemIndex] : problemSet[currentProblemIndex].question;
        const correctAnswer = isAssessment ? answerKey[problem] : problemSet[currentProblemIndex].answer;

        if (evaluateStudentAnswer(userInput, correctAnswer)) {
            await window.appendMessage('🔥 Correct!', 'ai');
            if (window.awardXP) window.awardXP(10);
            currentProblemIndex++;
            if (isAssessment) {
                askAssessmentQuestion();
            } else {
                askProblemFromCurrentStep();
            }
        } else {
            await requestDynamicHint(problem, userInput, correctAnswer, currentModuleData);
        }
        return true;
    }
    return false;
}

async function requestDynamicHint(problem, userAnswer, correctAnswer, moduleData) {
    window.showThinkingIndicator(true);
    const hintContext = { 
        problem, 
        userAnswer, 
        correctAnswer, 
        strategies: moduleData.instructionalStrategy,
        scaffold: moduleData.scaffold
    };
    try {
        // CHANGED: Corrected endpoint path and response property
        const data = await requestLessonAIResponse(hintContext, '/guidedLesson/get-scaffolded-hint'); 
        // The appendMessage is handled inside requestLessonAIResponse now, which is cleaner
    } catch (error) {
        console.error("Error fetching AI hint:", error);
        await window.appendMessage("Let's try that again. Take a close look at the signs and your steps.", "ai");
    } finally {
        window.showThinkingIndicator(false);
    }
}


// --- Utility Functions ---

function displayModuleHeader(moduleData) {
    const header = document.querySelector('#lessons-pane #lesson-header');
    if (header) {
        header.innerHTML = `<h2>${moduleData.title}</h2><small>Estimated: ${moduleData.estimatedDuration || '--'} min</small>`;
        header.style.display = 'block';
    }
}

function evaluateStudentAnswer(userInput, correctAnswer) {
    return userInput.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
}

function showCompletionBadge() {
    window.appendMessage('🎉 Congratulations! You\'ve completed the pathway!', 'ai');
    sessionState = 'idle';
    currentModuleData = null; // Clear the module data
    const header = document.querySelector('#lessons-pane #lesson-header');
    if (header) header.style.display = 'none';
}

// Expose functions globally for script.js to call
window.guidedPath = {
    loadPathwayOverview,
    startOrResumeModule,
    handleGuidedAnswer,
    // Expose currentModuleData for the check in sendMessage
    get currentModuleData() { return currentModuleData; }
};