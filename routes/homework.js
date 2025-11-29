// routes/homework.js
// Homework assignment routes for teachers and students

const express = require('express');
const router = express.Router();
const Homework = require('../models/homework');
const User = require('../models/user');
const { isAuthenticated, isTeacher, isStudent } = require('../middleware/auth');

// ============================================
// TEACHER ROUTES
// ============================================

// Create new homework assignment
router.post('/teacher/homework', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const {
            title,
            description,
            questions,
            assignedTo,
            dueDate,
            topic,
            difficultyLevel,
            allowExtendedTime,
            allowCalculator,
            allowHints
        } = req.body;

        const homework = new Homework({
            title,
            description,
            questions,
            assignedTo,
            dueDate,
            topic,
            difficultyLevel,
            allowExtendedTime,
            allowCalculator,
            allowHints,
            teacherId: req.user._id
        });

        await homework.save();

        res.status(201).json({
            success: true,
            message: 'Homework created successfully!',
            homework: {
                _id: homework._id,
                title: homework.title,
                dueDate: homework.dueDate,
                assignedCount: homework.assignedTo.length
            }
        });
    } catch (error) {
        console.error('Error creating homework:', error);
        res.status(500).json({ message: 'Failed to create homework' });
    }
});

// Get all homework created by teacher
router.get('/teacher/homework', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const homework = await Homework.find({
            teacherId: req.user._id,
            isActive: true
        })
        .populate('assignedTo', 'firstName lastName username')
        .sort({ createdAt: -1 });

        // Add computed stats to each assignment
        const homeworkWithStats = homework.map(hw => ({
            _id: hw._id,
            title: hw.title,
            description: hw.description,
            topic: hw.topic,
            dueDate: hw.dueDate,
            difficultyLevel: hw.difficultyLevel,
            totalPoints: hw.totalPoints,
            questionCount: hw.questions.length,
            assignedCount: hw.assignedTo.length,
            submissionCount: hw.submissions.length,
            completionRate: hw.getCompletionRate(),
            averageScore: hw.getAverageScore(),
            createdAt: hw.createdAt
        }));

        res.json(homeworkWithStats);
    } catch (error) {
        console.error('Error fetching homework:', error);
        res.status(500).json({ message: 'Failed to fetch homework' });
    }
});

// Get specific homework with submissions
router.get('/teacher/homework/:id', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const homework = await Homework.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        })
        .populate('assignedTo', 'firstName lastName username')
        .populate('submissions.studentId', 'firstName lastName username');

        if (!homework) {
            return res.status(404).json({ message: 'Homework not found' });
        }

        res.json(homework);
    } catch (error) {
        console.error('Error fetching homework details:', error);
        res.status(500).json({ message: 'Failed to fetch homework details' });
    }
});

// Update homework assignment
router.put('/teacher/homework/:id', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const homework = await Homework.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });

        if (!homework) {
            return res.status(404).json({ message: 'Homework not found' });
        }

        // Update allowed fields
        const allowedUpdates = ['title', 'description', 'questions', 'dueDate', 'topic', 'difficultyLevel'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                homework[field] = req.body[field];
            }
        });

        await homework.save();

        res.json({
            success: true,
            message: 'Homework updated successfully',
            homework
        });
    } catch (error) {
        console.error('Error updating homework:', error);
        res.status(500).json({ message: 'Failed to update homework' });
    }
});

// Delete homework assignment
router.delete('/teacher/homework/:id', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const homework = await Homework.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });

        if (!homework) {
            return res.status(404).json({ message: 'Homework not found' });
        }

        // Soft delete
        homework.isActive = false;
        await homework.save();

        res.json({
            success: true,
            message: 'Homework deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting homework:', error);
        res.status(500).json({ message: 'Failed to delete homework' });
    }
});

// Grade a submission (with AI assistance)
router.post('/teacher/homework/:homeworkId/grade/:submissionId', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { homeworkId, submissionId } = req.params;
        const { teacherFeedback, overrideScores } = req.body;

        const homework = await Homework.findOne({
            _id: homeworkId,
            teacherId: req.user._id
        });

        if (!homework) {
            return res.status(404).json({ message: 'Homework not found' });
        }

        const submission = homework.submissions.id(submissionId);
        if (!submission) {
            return res.status(404).json({ message: 'Submission not found' });
        }

        // Apply teacher overrides if provided
        if (overrideScores && Array.isArray(overrideScores)) {
            overrideScores.forEach(override => {
                const answer = submission.answers[override.questionIndex];
                if (answer) {
                    answer.isCorrect = override.isCorrect;
                    answer.pointsEarned = override.pointsEarned;
                    answer.feedback = override.feedback || answer.feedback;
                }
            });
        }

        // Recalculate total score
        submission.totalScore = submission.answers.reduce((sum, a) => sum + (a.pointsEarned || 0), 0);
        submission.percentScore = Math.round((submission.totalScore / homework.totalPoints) * 100);
        submission.status = 'graded';
        submission.teacherFeedback = teacherFeedback;

        await homework.save();

        res.json({
            success: true,
            message: 'Submission graded successfully',
            submission
        });
    } catch (error) {
        console.error('Error grading submission:', error);
        res.status(500).json({ message: 'Failed to grade submission' });
    }
});

// ============================================
// STUDENT ROUTES
// ============================================

// Get assigned homework for student
router.get('/student/homework', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;

        const homework = await Homework.find({
            assignedTo: studentId,
            isActive: true
        })
        .select('-submissions') // Don't show other students' submissions
        .sort({ dueDate: 1 });

        // Add submission status for this student
        const homeworkWithStatus = homework.map(hw => {
            const submission = hw.getStudentSubmission(studentId);
            return {
                _id: hw._id,
                title: hw.title,
                description: hw.description,
                topic: hw.topic,
                dueDate: hw.dueDate,
                difficultyLevel: hw.difficultyLevel,
                totalPoints: hw.totalPoints,
                questionCount: hw.questions.length,
                allowHints: hw.allowHints,
                hasSubmitted: !!submission,
                submissionStatus: submission ? submission.status : null,
                score: submission ? submission.percentScore : null,
                isPastDue: new Date() > new Date(hw.dueDate)
            };
        });

        res.json(homeworkWithStatus);
    } catch (error) {
        console.error('Error fetching student homework:', error);
        res.status(500).json({ message: 'Failed to fetch homework' });
    }
});

// Get specific homework for student
router.get('/student/homework/:id', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const homework = await Homework.findOne({
            _id: req.params.id,
            assignedTo: studentId,
            isActive: true
        }).select('-submissions.studentId -submissions.answers'); // Hide other students' work

        if (!homework) {
            return res.status(404).json({ message: 'Homework not found' });
        }

        // Include only this student's submission
        const mySubmission = homework.getStudentSubmission(studentId);

        res.json({
            _id: homework._id,
            title: homework.title,
            description: homework.description,
            topic: homework.topic,
            dueDate: homework.dueDate,
            difficultyLevel: homework.difficultyLevel,
            totalPoints: homework.totalPoints,
            questions: homework.questions.map(q => ({
                _id: q._id,
                question: q.question,
                type: q.type,
                choices: q.choices,
                points: q.points,
                hint: homework.allowHints ? q.hint : undefined
            })),
            allowExtendedTime: homework.allowExtendedTime,
            allowCalculator: homework.allowCalculator,
            allowHints: homework.allowHints,
            mySubmission: mySubmission || null
        });
    } catch (error) {
        console.error('Error fetching homework details:', error);
        res.status(500).json({ message: 'Failed to fetch homework details' });
    }
});

// Submit homework
router.post('/student/homework/:id/submit', isAuthenticated, isStudent, async (req, res) => {
    try {
        const studentId = req.user._id;
        const { answers } = req.body; // Array of { questionIndex, studentAnswer }

        const homework = await Homework.findOne({
            _id: req.params.id,
            assignedTo: studentId,
            isActive: true
        });

        if (!homework) {
            return res.status(404).json({ message: 'Homework not found' });
        }

        // Check if already submitted
        if (homework.hasStudentSubmitted(studentId)) {
            return res.status(400).json({ message: 'You have already submitted this homework' });
        }

        // Auto-grade answers where possible
        const gradedAnswers = answers.map((ans, index) => {
            const question = homework.questions[index];
            let isCorrect = null;
            let pointsEarned = 0;

            if (question && question.correctAnswer) {
                // Simple string comparison (case-insensitive)
                const studentAns = ans.studentAnswer.trim().toLowerCase();
                const correctAns = question.correctAnswer.trim().toLowerCase();
                isCorrect = studentAns === correctAns;

                // Check acceptable alternatives
                if (!isCorrect && question.acceptableAnswers && question.acceptableAnswers.length > 0) {
                    isCorrect = question.acceptableAnswers.some(
                        acceptable => acceptable.trim().toLowerCase() === studentAns
                    );
                }

                pointsEarned = isCorrect ? (question.points || 1) : 0;
            }

            return {
                questionIndex: index,
                studentAnswer: ans.studentAnswer,
                isCorrect,
                pointsEarned,
                feedback: isCorrect === true ? 'Correct!' : isCorrect === false ? 'Incorrect' : 'Pending review'
            };
        });

        const totalScore = gradedAnswers.reduce((sum, a) => sum + a.pointsEarned, 0);
        const percentScore = Math.round((totalScore / homework.totalPoints) * 100);

        const submission = {
            studentId,
            answers: gradedAnswers,
            totalScore,
            maxScore: homework.totalPoints,
            percentScore,
            status: gradedAnswers.some(a => a.isCorrect === null) ? 'submitted' : 'graded',
            aiGraded: true
        };

        homework.submissions.push(submission);
        await homework.save();

        res.json({
            success: true,
            message: 'Homework submitted successfully!',
            score: percentScore,
            totalPoints: totalScore,
            maxPoints: homework.totalPoints
        });
    } catch (error) {
        console.error('Error submitting homework:', error);
        res.status(500).json({ message: 'Failed to submit homework' });
    }
});

module.exports = router;
