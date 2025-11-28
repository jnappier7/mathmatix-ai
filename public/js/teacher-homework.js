// teacher-homework.js
// Homework management for teacher dashboard

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const createHomeworkBtn = document.getElementById('create-homework-btn');
    const quickActionHomeworkBtn = document.querySelector('.admin-widget-sidebar .btn-secondary');
    const homeworkModal = document.getElementById('homework-modal');
    const homeworkModalCloseBtn = document.getElementById('homeworkModalCloseBtn');
    const cancelHomeworkBtn = document.getElementById('cancel-homework-btn');
    const homeworkForm = document.getElementById('homework-form');
    const addQuestionBtn = document.getElementById('add-question-btn');
    const questionsContainer = document.getElementById('questions-container');
    const studentCheckboxesContainer = document.getElementById('student-checkboxes');
    const selectAllStudentsCheckbox = document.getElementById('select-all-students');
    const homeworkListContainer = document.getElementById('homework-list');

    let students = [];
    let questionCount = 0;

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            // Update active states
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabName}-tab`) {
                    content.classList.add('active');
                }
            });

            // Load homework list if switching to homework tab
            if (tabName === 'homework') {
                loadHomeworkList();
            }
        });
    });

    // Open homework modal
    function openHomeworkModal() {
        homeworkModal.style.display = 'flex';
        loadStudentsForAssignment();
        // Set default due date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59);
        document.getElementById('hw-due-date').value = tomorrow.toISOString().slice(0, 16);
        // Add first question by default
        if (questionCount === 0) {
            addQuestion();
        }
    }

    // Close homework modal
    function closeHomeworkModal() {
        homeworkModal.style.display = 'none';
        homeworkForm.reset();
        questionsContainer.innerHTML = '';
        questionCount = 0;
    }

    // Event listeners for modal
    if (createHomeworkBtn) {
        createHomeworkBtn.addEventListener('click', openHomeworkModal);
    }
    if (quickActionHomeworkBtn) {
        quickActionHomeworkBtn.addEventListener('click', () => {
            // Switch to homework tab and open modal
            document.querySelector('[data-tab="homework"]').click();
            setTimeout(openHomeworkModal, 100);
        });
    }
    if (homeworkModalCloseBtn) {
        homeworkModalCloseBtn.addEventListener('click', closeHomeworkModal);
    }
    if (cancelHomeworkBtn) {
        cancelHomeworkBtn.addEventListener('click', closeHomeworkModal);
    }

    // Add question functionality
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', addQuestion);
    }

    function addQuestion() {
        questionCount++;
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        questionDiv.dataset.questionIndex = questionCount;
        questionDiv.innerHTML = `
            <div style="border: 1px solid #ddd; padding: 15px; border-radius: 4px; margin-bottom: 10px; background: #f9f9f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong>Question ${questionCount}</strong>
                    <button type="button" class="remove-question-btn" style="background: #ff4e4e; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 0.85em;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>

                <label>Question Text *</label>
                <textarea class="question-text" required placeholder="Enter the question" rows="2"></textarea>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px;">
                    <div>
                        <label>Correct Answer</label>
                        <input type="text" class="correct-answer" placeholder="Expected answer">
                    </div>
                    <div>
                        <label>Points</label>
                        <input type="number" class="question-points" value="1" min="1">
                    </div>
                </div>

                <label>Question Type</label>
                <select class="question-type">
                    <option value="short-answer">Short Answer</option>
                    <option value="equation">Equation</option>
                    <option value="word-problem">Word Problem</option>
                    <option value="multiple-choice">Multiple Choice</option>
                </select>

                <div class="multiple-choice-options" style="display: none; margin-top: 10px;">
                    <label>Choices (one per line)</label>
                    <textarea class="mc-choices" rows="3" placeholder="A) Option 1\nB) Option 2\nC) Option 3\nD) Option 4"></textarea>
                </div>
            </div>
        `;

        questionsContainer.appendChild(questionDiv);

        // Remove question handler
        questionDiv.querySelector('.remove-question-btn').addEventListener('click', () => {
            questionDiv.remove();
            renumberQuestions();
        });

        // Show/hide multiple choice options
        const typeSelect = questionDiv.querySelector('.question-type');
        const mcOptions = questionDiv.querySelector('.multiple-choice-options');
        typeSelect.addEventListener('change', () => {
            mcOptions.style.display = typeSelect.value === 'multiple-choice' ? 'block' : 'none';
        });
    }

    function renumberQuestions() {
        const questions = questionsContainer.querySelectorAll('.question-item');
        questions.forEach((q, index) => {
            q.querySelector('strong').textContent = `Question ${index + 1}`;
            q.dataset.questionIndex = index + 1;
        });
        questionCount = questions.length;
    }

    // Load students for assignment
    async function loadStudentsForAssignment() {
        try {
            const res = await fetch('/api/teacher/students', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load students');
            students = await res.json();

            studentCheckboxesContainer.innerHTML = students.map(student => `
                <label style="display: block; padding: 5px 0; font-size: 0.9em; font-weight: normal;">
                    <input type="checkbox" class="student-checkbox" value="${student._id}">
                    ${student.firstName} ${student.lastName} ${student.iepPlan && student.iepPlan.goals && student.iepPlan.goals.length > 0 ? '<span style="color: #12B3B3;">(IEP)</span>' : ''}
                </label>
            `).join('');

            // Select all functionality
            if (selectAllStudentsCheckbox) {
                selectAllStudentsCheckbox.addEventListener('change', (e) => {
                    document.querySelectorAll('.student-checkbox').forEach(cb => {
                        cb.checked = e.target.checked;
                    });
                });
            }
        } catch (error) {
            console.error('Error loading students:', error);
            studentCheckboxesContainer.innerHTML = '<p style="color: #ff4e4e;">Failed to load students</p>';
        }
    }

    // Submit homework form
    if (homeworkForm) {
        homeworkForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Collect form data
            const title = document.getElementById('hw-title').value;
            const description = document.getElementById('hw-description').value;
            const topic = document.getElementById('hw-topic').value;
            const dueDate = document.getElementById('hw-due-date').value;
            const difficultyLevel = document.getElementById('hw-difficulty').value;
            const allowExtendedTime = document.getElementById('hw-extended-time').checked;
            const allowCalculator = document.getElementById('hw-calculator').checked;

            // Collect questions
            const questionItems = questionsContainer.querySelectorAll('.question-item');
            const questions = Array.from(questionItems).map(item => {
                const type = item.querySelector('.question-type').value;
                const question = {
                    question: item.querySelector('.question-text').value,
                    correctAnswer: item.querySelector('.correct-answer').value,
                    points: parseInt(item.querySelector('.question-points').value) || 1,
                    type: type
                };

                if (type === 'multiple-choice') {
                    const choicesText = item.querySelector('.mc-choices').value;
                    question.choices = choicesText.split('\n').map(c => c.trim()).filter(c => c);
                }

                return question;
            });

            if (questions.length === 0) {
                alert('Please add at least one question');
                return;
            }

            // Collect assigned students
            const assignedTo = Array.from(document.querySelectorAll('.student-checkbox:checked')).map(cb => cb.value);
            if (assignedTo.length === 0) {
                alert('Please select at least one student');
                return;
            }

            // Create homework
            try {
                const res = await fetch('/api/homework/teacher/homework', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        title,
                        description,
                        topic,
                        dueDate,
                        difficultyLevel,
                        allowExtendedTime,
                        allowCalculator,
                        allowHints: true,
                        questions,
                        assignedTo
                    })
                });

                const data = await res.json();
                if (data.success) {
                    alert('Homework created and assigned successfully!');
                    closeHomeworkModal();
                    loadHomeworkList();
                    // Switch to homework tab
                    document.querySelector('[data-tab="homework"]').click();
                } else {
                    alert('Error: ' + (data.message || 'Failed to create homework'));
                }
            } catch (error) {
                console.error('Error creating homework:', error);
                alert('Failed to create homework. Please try again.');
            }
        });
    }

    // Load homework list
    async function loadHomeworkList() {
        if (!homeworkListContainer) return;

        homeworkListContainer.innerHTML = '<div style="padding: 20px; text-align: center;">Loading homework...</div>';

        try {
            const res = await fetch('/api/homework/teacher/homework', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load homework');
            const homework = await res.json();

            if (homework.length === 0) {
                homeworkListContainer.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #666;">
                        <i class="fas fa-inbox" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p>No homework assignments yet.</p>
                        <button id="create-first-homework" class="btn btn-primary" style="margin-top: 10px;">
                            <i class="fas fa-plus"></i> Create Your First Assignment
                        </button>
                    </div>
                `;
                document.getElementById('create-first-homework').addEventListener('click', openHomeworkModal);
                return;
            }

            homeworkListContainer.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Topic</th>
                            <th>Due Date</th>
                            <th>Questions</th>
                            <th>Assigned</th>
                            <th>Submitted</th>
                            <th>Avg Score</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${homework.map(hw => {
                            const dueDate = new Date(hw.dueDate);
                            const isPastDue = dueDate < new Date();
                            return `
                                <tr>
                                    <td><strong>${hw.title}</strong></td>
                                    <td>${hw.topic || 'N/A'}</td>
                                    <td ${isPastDue ? 'style="color: #ff4e4e;"' : ''}>
                                        ${dueDate.toLocaleDateString()} ${dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td>${hw.questionCount}</td>
                                    <td>${hw.assignedCount}</td>
                                    <td>${hw.submissionCount} (${hw.completionRate}%)</td>
                                    <td>${hw.averageScore}%</td>
                                    <td>
                                        <button class="btn btn-sm btn-secondary view-hw-btn" data-id="${hw._id}">
                                            <i class="fas fa-eye"></i> View
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            // Add view button handlers
            document.querySelectorAll('.view-hw-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const homeworkId = btn.dataset.id;
                    viewHomeworkDetails(homeworkId);
                });
            });

        } catch (error) {
            console.error('Error loading homework:', error);
            homeworkListContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff4e4e;">Failed to load homework</div>';
        }
    }

    // View homework details
    async function viewHomeworkDetails(homeworkId) {
        alert('Homework details view coming soon! ID: ' + homeworkId);
        // TODO: Implement detailed view with submissions
    }

    // Initial load if on homework tab
    if (document.querySelector('[data-tab="homework"]').classList.contains('active')) {
        loadHomeworkList();
    }
});
