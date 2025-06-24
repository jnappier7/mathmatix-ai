// public/js/guidedPath.js - FINAL VERSION (PHASE 3 - MODULAR LOADING + CONTENT RENDERING)

let currentCourse = null;
let currentModuleData = null; // Stores the loaded content of the current module JSON
let currentModuleIndex = 0;
let currentScaffoldStepIndex = 0; // Tracks the current step within a module's scaffold
let currentProblemIndex = 0; // For practice/assessment problems within a step
let sessionState = 'idle'; // idle, in-lesson-dialogue, awaiting-problem-answer, displaying-scaffold
let lessonHistory = []; // To keep track of the current lesson dialogue

// --- Path Initialization & Course Overview ---

// NEW: Function to load the pathway overview and display course cards
export async function loadPathwayOverview(currentUser) { // [MODIFIED] Accept currentUser
    const courseCardsContainer = document.getElementById('course-cards-container');
    const lessonsPane = document.getElementById('lessons-pane');
    const lessonContentPlaceholder = document.getElementById('lesson-content-placeholder'); // Get this element
    const lessonHeader = document.getElementById('lessons-pane').querySelector('#lesson-header'); // Get header for lessons pane

    // Clear previous content
    if (courseCardsContainer) courseCardsContainer.innerHTML = '';
    if (lessonContentPlaceholder) lessonContentPlaceholder.innerHTML = `👈 Chat with your tutor to get started, or select a course from the sidebar.`;
    if (lessonHeader) lessonHeader.style.display = 'none'; // Hide header initially

    window.showThinkingIndicator(true);
    try {
        const response = await fetch('/resources/ready-for-algebra-1-pathway.json'); // Fetch the main pathway JSON
        if (!response.ok) throw new Error('Failed to load pathway overview.');
        currentCourse = await response.json();

        // Populate course cards in the sidebar
        if (currentCourse && currentCourse.modules && courseCardsContainer) {
            currentCourse.modules.forEach((module, index) => {
                const card = document.createElement('div');
                card.classList.add('course-card');
                
                // Add a simple progress visualization (placeholder)
                const completionPercentage = (currentUser && currentUser.completedModules && currentUser.completedModules.includes(module.moduleId)) ? 100 : 0;
                card.innerHTML = `
                    <div class="progress-circle-container" style="background: conic-gradient(var(--accent-green) ${completionPercentage}%, #e0e0e0 ${completionPercentage}%); margin-bottom: 10px;">
                        <div class="progress-circle-inner">${completionPercentage}%</div>
                    </div>
                    <h3>${module.title}</h3>
                    <p>${module.preview || module.description || ''}</p>
                    <button class="enroll-btn" data-module-id="${module.moduleId}" data-module-index="${index}">
                        ${completionPercentage === 100 ? '✅ Completed' : (completionPercentage > 0 ? '▶️ Resume' : '🚀 Start Lesson')}
                    </button>
                `;
                courseCardsContainer.appendChild(card);

                card.querySelector('.enroll-btn').addEventListener('click', async (event) => {
                    const moduleId = event.target.dataset.moduleId;
                    const moduleIdx = parseInt(event.target.dataset.moduleIndex);
                    await startOrResumeModule(moduleId, moduleIdx);
                    // Switch to lessons tab after starting a module
                    const lessonsTabButton = document.querySelector('.tab-button[data-tab="lessons-pane"]');
                    if (lessonsTabButton) lessonsTabButton.click();
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
        await loadPathwayOverview(window.currentUser); // Ensure pathway is loaded with current user
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
        const response = await fetch(`/modules/${moduleRef.source}`); // Fetch individual module JSON
        if (!response.ok) throw new Error(`Failed to load module: /modules/${moduleRef.source}`);
        currentModuleData = await response.json(); // Store the full module content

        currentScaffoldStepIndex = 0; // Start at the beginning of the module's scaffold
        currentProblemIndex = 0;
        lessonHistory = []; // Reset history for a new module
        
        displayModuleHeader(currentModuleData);
        await processNextScaffoldStep(); // Start processing the module's scaffold
        
    } catch (error) {
        console.error("Error loading module:", error);
        window.appendMessage(`Sorry, I couldn't load that lesson: ${error.message}. Please try selecting another or refreshing.`, "ai");
    } finally {
        window.showThinkingIndicator(false);
    }
}

// NEW: Processes the next step in the module's scaffold array
async function processNextScaffoldStep() {
    const lessonsPane = document.getElementById('lessons-pane');
    if (!lessonsPane) return;

    const lessonContentPlaceholder = document.getElementById('lesson-content-placeholder');
    if (!lessonContentPlaceholder) {
        console.error("Lesson content placeholder not found!");
        return;
    }
    
    if (!currentModuleData || !currentModuleData.scaffold || currentScaffoldStepIndex >= currentModuleData.scaffold.length) {
        // Module scaffold completed, now handle transition or completion
        if (currentModuleData.type === 'assessment') {
            await window.appendMessage("Alright, let's begin the assessment for this topic!", "ai");
            startAssessment();
        } else {
            // Mark module as completed (future feature)
            // if (window.markModuleCompleted) window.markModuleCompleted(currentModuleData.moduleId);
            await window.appendMessage('You\'ve completed this module! Moving on to the next topic.', 'ai');
            currentModuleIndex++;
            currentScaffoldStepIndex = 0;
            currentProblemIndex = 0;
            lessonHistory = [];
            currentModuleData = null; // Clear current module data
            
            // Check if there's a next module in the pathway, otherwise show pathway completion
            if (currentCourse.modules[currentModuleIndex]) {
                 setTimeout(() => startOrResumeModule(currentCourse.modules[currentModuleIndex].moduleId, currentModuleIndex), 2000);
            } else {
                showCompletionBadge();
                setTimeout(() => loadPathwayOverview(window.currentUser), 2000); // Back to overview
            }
        }
        return;
    }

    const step = currentModuleData.scaffold[currentScaffoldStepIndex];
    
    // Clear previous step's content
    lessonContentPlaceholder.innerHTML = '';

    let contentHtml = '';
    
    switch (step.type) {
        case 'explanation':
            contentHtml += `<p>${step.text || step.goal}</p>`;
            if (step.image) {
                contentHtml += `<img src="${step.image}" alt="Lesson diagram" class="lesson-image" />`;
            }
            if (step.video) {
                if (step.video.type === 'youtube') {
                    const embedUrl = step.video.url.replace("watch?v=", "embed/");
                    contentHtml += `<iframe width="560" height="315" src="${embedUrl}" frameborder="0" allowfullscreen class="lesson-video"></iframe>`;
                } else if (step.video.type === 'mp4') {
                    contentHtml += `<video controls width="100%" class="lesson-video"><source src="${step.video.src}" type="video/mp4">Your browser does not support the video tag.</video>`;
                }
            }
            // Ask an open-ended question to encourage dialogue after explanation
            await window.appendMessage(step.initialPrompt || `What are your thoughts on this, or what questions do you have?`, "ai");
            sessionState = 'in-lesson-dialogue';
            break;
        case 'model':
            contentHtml += `<h3>Example: ${step.problem}</h3>`;
            contentHtml += `<p>Here's how we can think through this:</p>`;
            if (step.explanation) {
                contentHtml += `<p>${step.explanation}</p>`;
            }
            if (step.image) {
                contentHtml += `<img src="${step.image}" alt="Model example" class="lesson-image" />`;
            }
            if (step.video) {
                if (step.video.type === 'youtube') {
                    const embedUrl = step.video.url.replace("watch?v=", "embed/");
                    contentHtml += `<iframe width="560" height="315" src="${embedUrl}" frameborder="0" allowfullscreen class="lesson-video"></iframe>`;
                } else if (step.video.type === 'mp4') {
                    contentHtml += `<video controls width="100%" class="lesson-video"><source src="${step.video.src}" type="video/mp4">Your browser does not support the video tag.</video>`;
                }
            }
            await window.appendMessage(step.initialPrompt || `Does this example make sense? How would you explain the first step?`, "ai");
            sessionState = 'in-lesson-dialogue';
            break;
        case 'guided_practice':
        case 'independent_practice':
            currentProblemIndex = 0; // Reset for this practice set
            contentHtml += `<h3>${step.type === 'guided_practice' ? 'Guided Practice' : 'Independent Practice'}</h3>`;
            contentHtml += `<div id="problems-container"></div>`; // Placeholder for problems
            lessonContentPlaceholder.innerHTML = contentHtml; // Render HTML
            askProblemFromCurrentStep(); // Ask the first problem
            return; // Don't auto-advance scaffold step here, as problems need to be answered
        case 'assessment':
            // Assessment is handled separately; this type won't be in a 'scaffold' array directly
            break;
        default:
            contentHtml += `<p>Unknown step type: ${step.type}</p>`;
            await window.appendMessage(`I'm not sure how to handle this part of the lesson. Let's try something else.`, "ai");
            sessionState = 'in-lesson-dialogue';
            currentScaffoldStepIndex++; // Try to move past unrecognized step
            setTimeout(processNextScaffoldStep, 1500);
            return; // Exit after appending message and scheduling next step
    }
    
    lessonContentPlaceholder.innerHTML = contentHtml; // Render HTML content
    if (window.renderMathInElement) { // Ensure MathJax is loaded
        window.renderMathInElement(lessonContentPlaceholder); // Render any MathJax
    }

    // After rendering, if it's not a practice/assessment (which handles its own flow),
    // we advance the scaffold step and rely on user input for dialogue flow.
    // The AI's response in in-lesson-dialogue will decide when to <END_LESSON_DIALOGUE />.
}

// NEW: Asks a problem from the current practice/assessment step
function askProblemFromCurrentStep() {
    if (!currentModuleData || !currentModuleData.scaffold) return;

    const step = currentModuleData.scaffold[currentScaffoldStepIndex];
    if (!step || !step.problems || currentProblemIndex >= step.problems.length) {
        // All problems in this step are done, move to next scaffold step
        currentScaffoldStepIndex++;
        currentProblemIndex = 0; // Reset problem index for next step
        processNextScaffoldStep();
        return;
    }

    const problem = step.problems[currentProblemIndex];
    window.appendMessage(`✍️ **Problem ${currentProblemIndex + 1}:** ${problem.question}`, 'ai');
    sessionState = 'awaiting-problem-answer';
}

// NEW: Handles the start of a formal assessment (distinct from practice problems)
function startAssessment() {
    const lessonsPane = document.getElementById('lessons-pane');
    if (!lessonsPane) return;

    const lessonContentPlaceholder = document.getElementById('lesson-content-placeholder');
    if (!lessonContentPlaceholder) {
        console.error("Lesson content placeholder not found for assessment!");
        return;
    }

    lessonContentPlaceholder.innerHTML = `
        <h2>📋 Assessment: ${currentModuleData.title}</h2>
        <p>${currentModuleData.description || 'Complete the following problems to demonstrate your mastery.'}</p>
        <div id="assessment-problems-container"></div>
        <div id="assessment-feedback"></div>
        <button id="submit-assessment-btn" style="display:none;">Submit Assessment</button>
    `;
    currentProblemIndex = 0; // Reset problem index for assessment
    askAssessmentQuestion(); // Ask the first assessment question
}

// NEW: Asks an assessment question
function askAssessmentQuestion() {
    if (!currentModuleData || !currentModuleData.assessmentProblems || currentProblemIndex >= currentModuleData.assessmentProblems.length) {
        // All assessment problems done
        window.appendMessage("You've completed the assessment! I'm reviewing your answers...", "ai");
        sessionState = 'idle'; // Or 'reviewing-assessment'
        // Trigger assessment scoring logic here (future feature)
        const submitBtn = document.getElementById('submit-assessment-btn');
        if (submitBtn) {
            submitBtn.style.display = 'block'; // Make submit button visible
            submitBtn.onclick = () => {
                alert("Assessment submission (future feature)"); // Placeholder
            };
        }
        return;
    }

    const problem = currentModuleData.assessmentProblems[currentProblemIndex];
    window.appendMessage(`📝 **Assessment Question ${currentProblemIndex + 1}:** ${problem}`, 'ai');
    sessionState = 'awaiting-problem-answer';
}


// --- Core API Communication (Adjusted to use common endpoint) ---

// This function is now used for ALL AI interactions within guided lessons
async function requestLessonAIResponse(context, endpoint) {
    window.showThinkingIndicator(true);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonContext: context })
        });
        if (!response.ok) throw new Error(`Network response was not ok. Status: ${response.status}`);
        const data = await response.json();
        
        await window.appendMessage(data.aiMessage, "ai");
        // Only add to lessonHistory if it's actual AI dialogue, not just a system instruction
        if (context.conversationHistory || data.aiMessage.includes("What are your thoughts") || data.aiMessage.includes("Does this example make sense")) { // Heuristic
             lessonHistory.push({ role: 'assistant', content: data.aiMessage });
        }
        
        return data;
    } catch (error) {
        console.error("Error fetching AI lesson/dialogue/hint:", error);
        await window.appendMessage("Sorry, I'm having a little trouble with the lesson. Please try again.", "ai");
        throw error;
    } finally {
        window.showThinkingIndicator(false);
    }
}

// MODIFIED: handle user input during guided path
export async function handleGuidedAnswer(userInput, currentUserData) { // [MODIFIED] parameter name
    if (!currentModuleData) {
        // This means we are not currently in a guided lesson module,
        // or the initial pathway overview is not loaded.
        // It should fall back to general chat or prompt to start a lesson.
        return false; // Indicate that this input was NOT handled by guided path
    }

    lessonHistory.push({ role: 'user', content: userInput }); // Add user input to lesson history

    if (sessionState === 'in-lesson-dialogue') {
        const lessonContext = {
            title: currentModuleData.title,
            goals: currentModuleData.goals,
            scaffold: currentModuleData.scaffold,
            conversationHistory: lessonHistory,
            currentScaffoldStep: currentModuleData.scaffold[currentScaffoldStepIndex]
        };
        try {
            const data = await requestLessonAIResponse(lessonContext, '/lesson/generate-interactive-lesson'); // Use shared endpoint
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
        const currentStep = currentModuleData.scaffold[currentScaffoldStepIndex];
        let problemToEvaluate;
        let correctAnswer;
        let isAssessmentProblem = false;

        if (currentModuleData.type === 'assessment' && currentModuleData.assessmentProblems) {
            isAssessmentProblem = true;
            problemToEvaluate = currentModuleData.assessmentProblems[currentProblemIndex];
            correctAnswer = currentModuleData.answerKeys[problemToEvaluate];
        } else if (currentStep && currentStep.problems && currentProblemIndex < currentStep.problems.length) {
            problemToEvaluate = currentStep.problems[currentProblemIndex].question;
            correctAnswer = currentStep.problems[currentProblemIndex].answer;
        } else {
            console.error("No problem found to evaluate.");
            await window.appendMessage("I'm not sure which problem you're answering. Let's get back on track.", "ai");
            sessionState = 'in-lesson-dialogue'; // Fallback to dialogue
            return true;
        }

        if (evaluateStudentAnswer(userInput, correctAnswer)) {
            await window.appendMessage('🔥 Nice! That\'s correct!', 'ai');
            if (window.awardXP && currentUserData) { // Use currentUserData parameter
                window.awardXP(10); // Example XP for correct answer
            }
            currentProblemIndex++;
            if (isAssessmentProblem) {
                askAssessmentQuestion();
            } else {
                askProblemFromCurrentStep();
            }
        } else {
            // [MODIFIED] Ensure module data is passed correctly to hint request
            await requestDynamicHint(problemToEvaluate, userInput, correctAnswer, currentModuleData);
        }
        return true;
    }
    return false; // Input not handled by guided path
}

async function requestDynamicHint(problem, userAnswer, correctAnswer, moduleData) { // [MODIFIED] parameter name
    window.showThinkingIndicator(true);
    const hintContext = { 
        problem, 
        userAnswer, 
        correctAnswer, 
        strategies: moduleData.instructionalStrategy, // Use instructionalStrategy from moduleData
        scaffold: moduleData.scaffold // Provide full scaffold for context
    };
    try {
        const data = await requestLessonAIResponse(hintContext, '/lesson/get-scaffolded-hint'); // Use shared endpoint
        // Hint already appended by requestLessonAIResponse
    } catch (error) {
        console.error("Error fetching AI hint:", error);
        await window.appendMessage("Let's try that again. Take a close look at the signs and your steps.", "ai");
    } finally {
        window.showThinkingIndicator(false);
    }
}


// --- Utility Functions ---

// MODIFIED: displayModuleHeader now gets data from currentModuleData
function displayModuleHeader(moduleData) {
    const header = document.getElementById('lessons-pane').querySelector('#lesson-header'); // Target the header in lessons pane
    if (header) {
        header.innerHTML = `<h2>${moduleData.title}</h2><small>Estimated: ${moduleData.estimatedDuration || '--'} min</small>`;
        header.style.display = 'block';
    }
}

function evaluateStudentAnswer(userInput, correctAnswer) {
    // Basic string comparison for now.
    // Future: implement more robust math evaluation (e.g., parsing LaTeX, numerical comparison)
    // Trim and lower-case both for basic robustness
    return userInput.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
}

function showCompletionBadge() {
    window.appendMessage('🎉 Congratulations! You\'ve completed the pathway!', 'ai');
    sessionState = 'idle';
    const header = document.getElementById('lessons-pane').querySelector('#lesson-header'); // Target header in lessons pane
    if (header) header.style.display = 'none';
}

// Expose loadPathwayOverview globally so script.js can call it
window.guidedPath = {
    loadPathwayOverview: loadPathwayOverview,
    startOrResumeModule: startOrResumeModule,
    handleGuidedAnswer: handleGuidedAnswer
};