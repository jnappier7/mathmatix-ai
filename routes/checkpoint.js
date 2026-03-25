/**
 * CHECKPOINT API — Server-side grading for course checkpoint assessments
 *
 * Checkpoints present pre-defined problems from the module's assessmentProblems
 * array as floating cards (no chat). Answers are graded server-side against
 * the module's answerKeys using the mathSolver's verifyAnswer function.
 *
 * Endpoints:
 *   POST /api/checkpoint/start     — Initialize checkpoint session
 *   GET  /api/checkpoint/problem    — Get current problem
 *   POST /api/checkpoint/submit     — Submit answer, get result + next problem
 *   POST /api/checkpoint/complete   — Finalize checkpoint, save score
 *
 * @module routes/checkpoint
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const CourseSession = require('../models/courseSession');
const { verifyAnswer } = require('../utils/mathSolver');
const { callLLM } = require('../utils/llmGateway');

/**
 * Helper: Load the active course session for the authenticated user.
 * Auth middleware populates req.user with the full user document,
 * which includes activeCourseSessionId (same pattern as courseChat).
 */
async function getActiveCourseSession(req) {
  const sessionId = req.user?.activeCourseSessionId;
  if (!sessionId) return null;
  return CourseSession.findById(sessionId);
}

/**
 * POST /start — Initialize a checkpoint session
 *
 * Loads the module's assessmentProblems and returns session metadata.
 * Problems are stored server-side; the client only gets the question text.
 */
router.post('/start', async (req, res) => {
  try {
    const userId = req.user._id;

    // Find active course session (same lookup as courseChat)
    const courseSession = await getActiveCourseSession(req);
    if (!courseSession) {
      return res.status(404).json({ error: 'No active course session' });
    }

    // Load pathway and module data
    const pathwayFile = path.join(__dirname, '../public/resources', `${courseSession.courseId}-pathway.json`);
    if (!fs.existsSync(pathwayFile)) {
      return res.status(404).json({ error: 'Course pathway not found' });
    }
    const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
    const currentModule = (pathway.modules || []).find(m => m.moduleId === courseSession.currentModuleId);
    if (!currentModule?.moduleFile) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const moduleFile = path.join(__dirname, '../public', currentModule.moduleFile);
    if (!fs.existsSync(moduleFile)) {
      return res.status(404).json({ error: 'Module file not found' });
    }
    const moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));

    if (!moduleData.assessmentProblems || moduleData.assessmentProblems.length === 0) {
      return res.status(400).json({ error: 'Module has no assessment problems' });
    }

    // Initialize checkpoint state on the session (or resume if already started)
    const mod = (courseSession.modules || []).find(m => m.moduleId === courseSession.currentModuleId);
    if (mod && mod.status !== 'in_progress') {
      mod.status = 'in_progress';
      mod.startedAt = mod.startedAt || new Date();
    }

    // Store checkpoint progress in session
    if (!courseSession.checkpointState) {
      courseSession.checkpointState = {};
    }
    if (!courseSession.checkpointState.responses) {
      courseSession.checkpointState = {
        moduleId: courseSession.currentModuleId,
        responses: [],
        startedAt: new Date(),
        currentIndex: 0,
      };
    }
    courseSession.markModified('checkpointState');
    await courseSession.save();

    const problems = moduleData.assessmentProblems;
    const currentIndex = courseSession.checkpointState.currentIndex || 0;

    res.json({
      started: true,
      moduleTitle: moduleData.title,
      totalProblems: problems.length,
      passThreshold: moduleData.passThreshold || 70,
      totalPoints: problems.reduce((sum, p) => sum + (p.points || 1), 0),
      currentIndex,
      // Send first problem (or current if resuming)
      problem: currentIndex < problems.length ? sanitizeProblem(problems[currentIndex], currentIndex, problems.length) : null,
      skillsCovered: moduleData.skillsCovered || [],
    });
  } catch (err) {
    console.error('[Checkpoint] Start error:', err);
    res.status(500).json({ error: 'Failed to start checkpoint' });
  }
});

/**
 * GET /problem — Get the current problem
 */
router.get('/problem', async (req, res) => {
  try {
    const courseSession = await getActiveCourseSession(req);
    if (!courseSession?.checkpointState) {
      return res.status(404).json({ error: 'No active checkpoint' });
    }

    const moduleData = loadModuleData(courseSession);
    if (!moduleData) {
      return res.status(404).json({ error: 'Module data not found' });
    }

    const problems = moduleData.assessmentProblems || [];
    const currentIndex = courseSession.checkpointState.currentIndex || 0;

    if (currentIndex >= problems.length) {
      return res.json({ complete: true, problem: null });
    }

    res.json({
      problem: sanitizeProblem(problems[currentIndex], currentIndex, problems.length),
      progress: {
        current: currentIndex + 1,
        total: problems.length,
        answered: courseSession.checkpointState.responses.length,
        correct: courseSession.checkpointState.responses.filter(r => r.correct).length,
      },
    });
  } catch (err) {
    console.error('[Checkpoint] Get problem error:', err);
    res.status(500).json({ error: 'Failed to get problem' });
  }
});

/**
 * POST /submit — Submit an answer, get result + next problem
 */
router.post('/submit', async (req, res) => {
  try {
    const userId = req.user._id;
    const { answer, skipped } = req.body;

    const courseSession = await getActiveCourseSession(req);
    if (!courseSession?.checkpointState) {
      return res.status(404).json({ error: 'No active checkpoint' });
    }

    const moduleData = loadModuleData(courseSession);
    if (!moduleData) {
      return res.status(404).json({ error: 'Module data not found' });
    }

    const problems = moduleData.assessmentProblems || [];
    const answerKeys = moduleData.answerKeys || {};
    const currentIndex = courseSession.checkpointState.currentIndex || 0;

    if (currentIndex >= problems.length) {
      return res.json({ complete: true });
    }

    const problem = problems[currentIndex];
    const correctAnswer = answerKeys[problem.id] || problem.answer;

    // Grade the answer — try deterministic first, then LLM fallback
    let isCorrect = false;
    let gradingFeedback = null;
    if (!skipped && answer) {
      // Fast path: deterministic verification for numeric/simple answers
      const verification = verifyAnswer(answer, correctAnswer);
      isCorrect = verification.isCorrect;

      // If deterministic check fails, use LLM for semantic equivalence.
      // Open-ended math answers have many equivalent forms that string
      // matching can't catch (e.g., "cos θ" vs "cosθ", "k=2" vs "2").
      if (!isCorrect) {
        try {
          const gradeResult = await gradeWithLLM(problem.question, correctAnswer, answer);
          isCorrect = gradeResult.correct;
          gradingFeedback = gradeResult.feedback;
        } catch (err) {
          console.error('[Checkpoint] LLM grading fallback failed:', err.message);
          // Stick with deterministic result
        }
      }
    }

    // Record response
    courseSession.checkpointState.responses.push({
      problemId: problem.id,
      skill: problem.skill,
      answer: skipped ? '__SKIPPED__' : answer,
      correct: isCorrect,
      skipped: !!skipped,
      points: problem.points || 1,
      earnedPoints: isCorrect ? (problem.points || 1) : 0,
      timestamp: new Date(),
    });

    // Advance to next problem
    courseSession.checkpointState.currentIndex = currentIndex + 1;
    courseSession.markModified('checkpointState');
    await courseSession.save();

    const nextIndex = currentIndex + 1;
    const isComplete = nextIndex >= problems.length;

    const result = {
      correct: isCorrect,
      skipped: !!skipped,
      // Brief explanation if wrong — prefer LLM feedback, fall back to answer key
      feedback: !isCorrect ? (gradingFeedback || null) : null,
      correctAnswer: !isCorrect ? correctAnswer : null,
      progress: {
        current: nextIndex + 1,
        total: problems.length,
        answered: courseSession.checkpointState.responses.length,
        correct: courseSession.checkpointState.responses.filter(r => r.correct).length,
      },
    };

    if (isComplete) {
      result.nextAction = 'complete';
      result.summary = buildSummary(courseSession.checkpointState, moduleData);
    } else {
      result.nextAction = 'continue';
      result.nextProblem = sanitizeProblem(problems[nextIndex], nextIndex, problems.length);
    }

    res.json(result);
  } catch (err) {
    console.error('[Checkpoint] Submit error:', err);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

/**
 * POST /complete — Finalize checkpoint, save score to course session
 */
router.post('/complete', async (req, res) => {
  try {
    const courseSession = await getActiveCourseSession(req);
    if (!courseSession?.checkpointState) {
      return res.status(404).json({ error: 'No active checkpoint' });
    }

    const moduleData = loadModuleData(courseSession);
    const summary = buildSummary(courseSession.checkpointState, moduleData);

    // Update module progress with score
    const mod = (courseSession.modules || []).find(m => m.moduleId === courseSession.currentModuleId);
    if (mod) {
      mod.checkpointScore = summary.scorePercent;
      mod.checkpointPassed = summary.passed;
      mod.status = 'completed';
      mod.completedAt = new Date();
      mod.scaffoldProgress = 100;
    }

    // Unlock next module
    const modIdx = (courseSession.modules || []).findIndex(m => m.moduleId === courseSession.currentModuleId);
    if (modIdx >= 0 && modIdx < (courseSession.modules || []).length - 1) {
      const nextMod = courseSession.modules[modIdx + 1];
      if (nextMod && nextMod.status === 'locked') {
        nextMod.status = 'available';
      }
      courseSession.currentModuleId = nextMod.moduleId;
    }

    // Clear checkpoint state
    courseSession.checkpointState = null;
    courseSession.markModified('checkpointState');
    courseSession.markModified('modules');

    // Recalculate overall progress
    const { calculateOverallProgress } = require('../utils/coursePrompt');
    courseSession.overallProgress = calculateOverallProgress(courseSession.modules);

    await courseSession.save();

    console.log(`[Checkpoint] ${req.user.firstName} completed ${summary.moduleTitle}: ${summary.scorePercent}% (${summary.passed ? 'PASSED' : 'needs remediation'})`);

    res.json({
      success: true,
      summary,
      nextModuleId: courseSession.currentModuleId,
    });
  } catch (err) {
    console.error('[Checkpoint] Complete error:', err);
    res.status(500).json({ error: 'Failed to complete checkpoint' });
  }
});

// ── Helpers ──

function sanitizeProblem(problem, index, total) {
  return {
    id: problem.id,
    question: problem.question,
    skill: problem.skill,
    difficulty: problem.difficulty,
    points: problem.points || 1,
    questionNumber: index + 1,
    totalQuestions: total,
  };
}

function loadModuleData(courseSession) {
  try {
    const pathwayFile = path.join(__dirname, '../public/resources', `${courseSession.courseId}-pathway.json`);
    const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
    const currentModule = (pathway.modules || []).find(m => m.moduleId === courseSession.currentModuleId);
    if (!currentModule?.moduleFile) return null;
    const moduleFile = path.join(__dirname, '../public', currentModule.moduleFile);
    if (!fs.existsSync(moduleFile)) return null;
    return JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Grade an open-ended answer using a lightweight LLM call.
 * Handles equivalent forms that deterministic verifyAnswer misses.
 */
async function gradeWithLLM(question, answerKey, studentAnswer) {
  const prompt = `You are a math answer grader. Compare the student's answer to the answer key.

Question: ${question}
Answer Key: ${answerKey}
Student Answer: ${studentAnswer}

Rules:
- Accept equivalent mathematical forms (e.g., "2" and "k=2" are both correct if the answer is k=2)
- Accept reasonable notation variations (spaces, order of terms, simplified vs unsimplified)
- For multi-part answers: mark correct only if ALL parts are substantially correct
- If incorrect, give a ONE sentence explanation

Respond in JSON only: {"correct": true or false, "feedback": "Brief feedback"}`;

  const result = await callLLM('gpt-4o-mini', [
    { role: 'system', content: prompt },
  ], { temperature: 0, max_tokens: 100 });

  const text = result.choices[0]?.message?.content?.trim() || '';
  try {
    // Try to parse JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        correct: !!parsed.correct,
        feedback: parsed.feedback || null,
      };
    }
  } catch {
    // If JSON parsing fails, check for obvious correct/incorrect keywords
    const isCorrect = /correct.*true|"correct"\s*:\s*true/i.test(text);
    return { correct: isCorrect, feedback: null };
  }
  return { correct: false, feedback: null };
}

function buildSummary(checkpointState, moduleData) {
  const responses = checkpointState.responses || [];
  const totalPoints = responses.reduce((sum, r) => sum + (r.points || 1), 0);
  const earnedPoints = responses.reduce((sum, r) => sum + (r.earnedPoints || 0), 0);
  const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passThreshold = moduleData?.passThreshold || 70;

  // Skill breakdown
  const skillMap = {};
  for (const r of responses) {
    if (!skillMap[r.skill]) {
      skillMap[r.skill] = { correct: 0, total: 0, skill: r.skill };
    }
    skillMap[r.skill].total++;
    if (r.correct) skillMap[r.skill].correct++;
  }

  return {
    moduleTitle: moduleData?.title || 'Checkpoint',
    totalProblems: responses.length,
    correct: responses.filter(r => r.correct).length,
    skipped: responses.filter(r => r.skipped).length,
    totalPoints,
    earnedPoints,
    scorePercent,
    passThreshold,
    passed: scorePercent >= passThreshold,
    skillBreakdown: Object.values(skillMap),
    duration: checkpointState.startedAt
      ? Date.now() - new Date(checkpointState.startedAt).getTime()
      : null,
  };
}

module.exports = router;
