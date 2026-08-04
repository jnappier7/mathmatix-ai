// routes/quiz.js — anonymous pop-quiz endpoints behind /quiz (the Facebook ad
// funnel). No auth: the ad's answer buttons deep-link straight here. Abuse
// posture mirrors trial-chat: IP rate limit at mount (config/routes.js), CSRF
// exempt (middleware/csrf.js), session-based dedupe so refresh/re-click can't
// stuff the poll.
//
// Answer-leak rule: GET responses NEVER carry the correct answer or teaching
// content — grading and the GEMS walkthrough only come back in the POST /vote
// response, after the visitor has committed to an answer.

const express = require('express');
const router = express.Router();
const QuizPoll = require('../models/quizPoll');
const { QUIZ_BANK, QUIZ_ORDER, OTHER_OPTION, getQuiz, isValidAnswer, publicQuiz } = require('../utils/quizBank');
const { recordConversionEvent } = require('../utils/conversionEvents');

/** Tally with every option present (zeros included) so poll bars never jump in late. */
function shapeTally(quiz, pollDoc) {
  const counts = {};
  for (const opt of [...quiz.options, OTHER_OPTION]) {
    const raw = pollDoc && pollDoc.counts ? pollDoc.counts.get(opt) : 0;
    counts[opt] = raw || 0;
  }
  return { counts, total: (pollDoc && pollDoc.total) || 0 };
}

function getSessionVotes(req) {
  if (!req.session) return {};
  if (!req.session.quizVotes) req.session.quizVotes = {};
  return req.session.quizVotes;
}

/**
 * GET /api/quiz
 * The quiz sequence in ad order — expressions and options only, no answers.
 */
router.get('/', (req, res) => {
  res.json({ quizzes: QUIZ_ORDER.map((id) => publicQuiz(QUIZ_BANK[id])) });
});

/**
 * GET /api/quiz/:quizId/stats
 * Live tally for one quiz. Safe to call any time — carries no answer info
 * beyond what the crowd picked.
 */
router.get('/:quizId/stats', async (req, res) => {
  const quiz = getQuiz(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Unknown quiz.' });
  try {
    const poll = await QuizPoll.findOne({ quizId: quiz.id });
    res.json({ tally: shapeTally(quiz, poll) });
  } catch (err) {
    console.error('[Quiz] stats error:', err.message);
    res.status(500).json({ error: 'Could not load results.' });
  }
});

/**
 * POST /api/quiz/:quizId/vote
 * Body: { answer: string }  — one of the quiz's options, or 'other'.
 * Returns: { yourAnswer, correct, correctAnswer, alreadyVoted, tally, teach }
 *
 * One counted vote per quiz per browser session. A repeat vote (refresh, or
 * clicking a second ad link) re-grades the ORIGINAL answer and returns the
 * live tally without incrementing — the poll stays honest and the visitor
 * still gets the full reveal.
 */
router.post('/:quizId/vote', async (req, res) => {
  const quiz = getQuiz(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Unknown quiz.' });

  const answer = typeof req.body.answer === 'string' ? req.body.answer.trim() : '';
  if (!isValidAnswer(quiz, answer)) {
    return res.status(400).json({ error: 'Invalid answer.' });
  }

  try {
    const votes = getSessionVotes(req);
    const priorAnswer = votes[quiz.id];
    const effectiveAnswer = priorAnswer || answer;
    let poll;

    if (priorAnswer) {
      poll = await QuizPoll.findOne({ quizId: quiz.id });
    } else {
      poll = await QuizPoll.recordVote(quiz.id, answer);
      votes[quiz.id] = answer;
      // Funnel telemetry — anonymous session key only, never IP/name.
      recordConversionEvent('quiz_vote', {
        sessionKey: req.sessionID,
        context: { quizId: quiz.id, answer, correct: answer === quiz.correct },
      });
    }

    res.json({
      yourAnswer: effectiveAnswer,
      correct: effectiveAnswer === quiz.correct,
      correctAnswer: quiz.correct,
      trapAnswer: quiz.trap,
      alreadyVoted: Boolean(priorAnswer),
      tally: shapeTally(quiz, poll),
      teach: quiz.teach,
    });
  } catch (err) {
    console.error('[Quiz] vote error:', err.message);
    res.status(500).json({ error: 'Could not record your answer. Please try again.' });
  }
});

module.exports = router;
