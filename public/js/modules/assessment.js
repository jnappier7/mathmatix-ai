// public/js/modules/assessment.js
// In-chat CAT (Computerized Adaptive Testing) Assessment System
// Extracted from script.js — handles the placement assessment flow
// that determines a student's math level.

/**
 * Create the in-chat assessment system.
 * @param {Object} deps
 * @param {Function} deps.appendMessage - Appends a chat message (text, sender, graphData, isMasteryQuiz)
 * @param {Function} deps.showThinkingIndicator - Shows/hides the thinking dots
 * @param {Function} deps.getChatBox - Returns the chat messages container element
 * @returns {{ showAssessmentPitch }}
 */
export function createAssessmentSystem({ appendMessage, showThinkingIndicator, getChatBox }) {

    function showAssessmentPitch() {
        const chatBox = getChatBox();

        const pitchMessage = `**Quick Placement Assessment** 📊

This helps me personalize your learning by understanding:
• What you already know well
• Where you might need support
• The perfect starting point for you

**What to expect:**
• 5-30 adaptive questions (stops when I'm confident)
• Questions adjust to your level as you go
• Takes about 5-10 minutes

Ready to start? Or would you rather skip for now and jump straight into general tutoring?`;

        appendMessage(pitchMessage, "ai");

        // Add action buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'assessment-action-buttons';
        buttonContainer.style.cssText = `
            display: flex;
            gap: 12px;
            margin: 15px 0;
            flex-wrap: wrap;
        `;

        const startBtn = document.createElement('button');
        startBtn.textContent = "Let's do it!";
        startBtn.className = 'btn-primary';
        startBtn.style.cssText = `
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        `;
        startBtn.onmouseover = () => startBtn.style.transform = 'scale(1.05)';
        startBtn.onmouseout = () => startBtn.style.transform = 'scale(1)';
        startBtn.onclick = () => {
            buttonContainer.remove();
            startInChatAssessment();
        };

        const skipBtn = document.createElement('button');
        skipBtn.textContent = "Skip for now";
        skipBtn.className = 'btn-secondary';
        skipBtn.style.cssText = `
            padding: 12px 24px;
            background: #f3f4f6;
            color: #6b7280;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        `;
        skipBtn.onmouseover = () => {
            skipBtn.style.background = '#e5e7eb';
            skipBtn.style.color = '#4b5563';
        };
        skipBtn.onmouseout = () => {
            skipBtn.style.background = '#f3f4f6';
            skipBtn.style.color = '#6b7280';
        };
        skipBtn.onclick = async () => {
            buttonContainer.remove();
            appendMessage("No problem! I'll ask again next time. What would you like to work on today?", "ai");
            try {
                await csrfFetch('/api/screener/skip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error('Failed to record skip:', error);
            }
        };

        buttonContainer.appendChild(startBtn);
        buttonContainer.appendChild(skipBtn);
        chatBox.appendChild(buttonContainer);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function startInChatAssessment() {
        try {
            appendMessage("Great! Starting your placement assessment...", "ai");
            showThinkingIndicator(true);

            const response = await csrfFetch('/api/screener/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = errorData.message || errorData.error || 'Failed to start assessment';
                throw new Error(errorMsg);
            }

            const data = await response.json();
            console.log('[Assessment] Started:', data);

            await loadNextAssessmentProblem(data.sessionId);

        } catch (error) {
            console.error('[Assessment] Start error:', error);
            appendMessage(`Oops, something went wrong starting the assessment: ${error.message}. Let's just chat instead - what would you like to work on?`, "ai");
            showThinkingIndicator(false);
        }
    }

    async function loadNextAssessmentProblem(sessionId) {
        try {
            const response = await csrfFetch(`/api/screener/next-problem?sessionId=${sessionId}`, {
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = errorData.message || errorData.error || 'Failed to load problem';
                throw new Error(errorMsg);
            }

            const data = await response.json();
            showThinkingIndicator(false);

            if (data.complete) {
                data.sessionId = sessionId;
                handleAssessmentComplete(data);
                return;
            }

            const problemMessage = `**Question ${data.problem.questionNumber} of ~${data.problem.progress?.target || '?'}**

${data.problem.content}`;

            appendMessage(problemMessage, "ai");

            createAssessmentAnswerInput(sessionId, data.problem);

        } catch (error) {
            console.error('[Assessment] Load problem error:', error);
            appendMessage(`Had trouble loading the next question: ${error.message}. Let's continue with regular tutoring instead!`, "ai");
            showThinkingIndicator(false);
        }
    }

    function createAssessmentAnswerInput(sessionId, problem) {
        const chatBox = getChatBox();

        const inputContainer = document.createElement('div');
        inputContainer.className = 'assessment-answer-input';
        inputContainer.style.cssText = `
            display: flex;
            gap: 12px;
            margin: 15px 0;
            align-items: center;
        `;

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Your answer...';
        input.style.cssText = `
            flex: 1;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 16px;
        `;

        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Submit';
        submitBtn.style.cssText = `
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
        `;

        submitBtn.onclick = async () => {
            const answer = input.value.trim();
            if (!answer) return;

            inputContainer.remove();
            await submitAssessmentAnswer(sessionId, problem.problemId, answer);
        };

        input.onkeypress = (e) => {
            if (e.key === 'Enter') submitBtn.click();
        };

        inputContainer.appendChild(input);
        inputContainer.appendChild(submitBtn);
        chatBox.appendChild(inputContainer);
        chatBox.scrollTop = chatBox.scrollHeight;
        input.focus();
    }

    async function submitAssessmentAnswer(sessionId, problemId, answer) {
        try {
            appendMessage(answer, "user");
            showThinkingIndicator(true);

            const response = await csrfFetch('/api/screener/submit-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    problemId,
                    answer,
                    responseTime: 0
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = errorData.message || errorData.error || 'Failed to submit answer';
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.feedback) {
                appendMessage(data.feedback, "ai");
            }

            if (data.nextAction === 'interview' || data.nextAction === 'complete') {
                data.sessionId = sessionId;
                handleAssessmentComplete(data);
            } else {
                await loadNextAssessmentProblem(sessionId);
            }

        } catch (error) {
            console.error('[Assessment] Submit error:', error);
            showThinkingIndicator(false);
            appendMessage(`Had trouble processing that: ${error.message}. Let's move on to regular tutoring!`, "ai");
        }
    }

    async function handleAssessmentComplete(data) {
        showThinkingIndicator(false);

        try {
            const completeResponse = await csrfFetch('/api/screener/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: data.sessionId
                })
            });

            if (completeResponse.ok) {
                const completeData = await completeResponse.json();
                const report = completeData.report;

                const badgeInfo = report.earnedBadges && report.earnedBadges.length > 0
                    ? `\n• **Badges Earned**: ${report.earnedBadges.length} 🎖️`
                    : '';

                const resultsMessage = `🎉 **Assessment Complete!**

You did great! Here's what I learned:
• **Level**: θ = ${report.theta.toFixed(2)} (${report.percentile}th percentile)
• **Accuracy**: ${Math.round(report.accuracy * 100)}%
• **Questions**: ${report.questionsAnswered}${badgeInfo}

I now have a good understanding of where you are. I'll use this to personalize everything for you!

What would you like to work on first?`;

                appendMessage(resultsMessage, "ai");
            } else {
                throw new Error('Failed to complete assessment');
            }
        } catch (error) {
            console.error('Failed to save assessment results:', error);
            appendMessage("Assessment complete! What would you like to work on?", "ai");
        }
    }

    return {
        showAssessmentPitch,
    };
}
