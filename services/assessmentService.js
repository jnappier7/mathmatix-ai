// services/assessmentService.js
// Computer Adaptive Testing (CAT) Assessment System
// Adaptive interview-style assessment for initial placement

const logger = require('../utils/logger').child({ service: 'assessment-service' });
const Conversation = require('../models/conversation');

// Assessment question bank organized by grade level and difficulty
const ASSESSMENT_BANK = {
  // Elementary (K-5)
  elementary: [
    {
      id: 'elem_1',
      difficulty: 1,
      gradeLevel: '1-2',
      question: 'What is 5 + 3?',
      type: 'number',
      correctAnswer: 8,
      skill: 'Basic Addition'
    },
    {
      id: 'elem_2',
      difficulty: 2,
      gradeLevel: '2-3',
      question: 'If you have 12 apples and eat 5, how many are left?',
      type: 'number',
      correctAnswer: 7,
      skill: 'Subtraction Word Problems'
    },
    {
      id: 'elem_3',
      difficulty: 3,
      gradeLevel: '3-4',
      question: 'What is 6 × 7?',
      type: 'number',
      correctAnswer: 42,
      skill: 'Multiplication Facts'
    },
    {
      id: 'elem_4',
      difficulty: 4,
      gradeLevel: '4-5',
      question: 'What is 1/2 + 1/4? (Enter as a fraction like 3/4)',
      type: 'fraction',
      correctAnswer: '3/4',
      skill: 'Adding Fractions'
    },
    {
      id: 'elem_5',
      difficulty: 5,
      gradeLevel: '5-6',
      question: 'What is 15% of 80?',
      type: 'number',
      correctAnswer: 12,
      skill: 'Percentages'
    }
  ],

  // Middle School (6-8)
  middleSchool: [
    {
      id: 'ms_1',
      difficulty: 6,
      gradeLevel: '6',
      question: 'Solve for x: x + 7 = 15',
      type: 'number',
      correctAnswer: 8,
      skill: 'Simple Linear Equations'
    },
    {
      id: 'ms_2',
      difficulty: 7,
      gradeLevel: '7',
      question: 'What is -3 + (-5)?',
      type: 'number',
      correctAnswer: -8,
      skill: 'Integer Operations'
    },
    {
      id: 'ms_3',
      difficulty: 8,
      gradeLevel: '7-8',
      question: 'Solve for x: 2x - 4 = 10',
      type: 'number',
      correctAnswer: 7,
      skill: 'Two-Step Equations'
    },
    {
      id: 'ms_4',
      difficulty: 9,
      gradeLevel: '8',
      question: 'What is the slope of the line passing through points (2, 3) and (4, 7)?',
      type: 'number',
      correctAnswer: 2,
      skill: 'Slope'
    },
    {
      id: 'ms_5',
      difficulty: 10,
      gradeLevel: '8',
      question: 'Simplify: 3x² + 2x + 5x² - x',
      type: 'expression',
      correctAnswer: '8x^2+x',
      skill: 'Combining Like Terms'
    }
  ],

  // High School (9-12)
  highSchool: [
    {
      id: 'hs_1',
      difficulty: 11,
      gradeLevel: '9',
      question: 'Solve for x: 3(x - 2) = 12',
      type: 'number',
      correctAnswer: 6,
      skill: 'Distributive Property'
    },
    {
      id: 'hs_2',
      difficulty: 12,
      gradeLevel: '9-10',
      question: 'Factor completely: x² - 9',
      type: 'expression',
      correctAnswer: '(x+3)(x-3)',
      skill: 'Factoring Difference of Squares'
    },
    {
      id: 'hs_3',
      difficulty: 13,
      gradeLevel: '10',
      question: 'Solve using the quadratic formula: x² - 5x + 6 = 0 (give one solution)',
      type: 'number',
      correctAnswer: 2,
      skill: 'Quadratic Equations'
    },
    {
      id: 'hs_4',
      difficulty: 14,
      gradeLevel: '11',
      question: 'What is the domain of f(x) = 1/(x-3)? Answer as an inequality or interval.',
      type: 'text',
      correctAnswer: 'x≠3',
      skill: 'Function Domain'
    },
    {
      id: 'hs_5',
      difficulty: 15,
      gradeLevel: '11-12',
      question: 'What is the derivative of f(x) = x²? Write as an expression.',
      type: 'expression',
      correctAnswer: '2x',
      skill: 'Basic Derivatives'
    }
  ]
};

/**
 * Get next adaptive question based on conversation history
 * @param {Object} conversation - Assessment conversation
 * @returns {Object} Next question object
 */
function getNextQuestion(conversation) {
  const messages = conversation.messages || [];
  const userMessages = messages.filter(m => m.role === 'user');

  // First question - start at middle difficulty (grade 6-7)
  if (userMessages.length === 0) {
    return {
      ...ASSESSMENT_BANK.middleSchool[0],
      questionNumber: 1,
      totalQuestions: 10
    };
  }

  // Analyze previous responses to determine difficulty
  const currentDifficulty = estimateCurrentDifficulty(conversation);
  const questionsAsked = conversation.messages.filter(m =>
    m.role === 'assistant' && m.content.includes('?')
  ).length;

  // Assessment complete after 10 questions
  if (questionsAsked >= 10) {
    return null;
  }

  // Get appropriate question based on current difficulty estimate
  const allQuestions = [
    ...ASSESSMENT_BANK.elementary,
    ...ASSESSMENT_BANK.middleSchool,
    ...ASSESSMENT_BANK.highSchool
  ];

  // Find questions near current difficulty that haven't been asked
  const askedQuestionIds = extractAskedQuestionIds(conversation);
  const availableQuestions = allQuestions.filter(q =>
    !askedQuestionIds.includes(q.id) &&
    Math.abs(q.difficulty - currentDifficulty) <= 2
  );

  if (availableQuestions.length === 0) {
    // Fallback: any unasked question
    const fallback = allQuestions.find(q => !askedQuestionIds.includes(q.id));
    return fallback ? {
      ...fallback,
      questionNumber: questionsAsked + 1,
      totalQuestions: 10
    } : null;
  }

  // Select question closest to current difficulty
  const nextQuestion = availableQuestions.sort((a, b) =>
    Math.abs(a.difficulty - currentDifficulty) - Math.abs(b.difficulty - currentDifficulty)
  )[0];

  return {
    ...nextQuestion,
    questionNumber: questionsAsked + 1,
    totalQuestions: 10
  };
}

/**
 * Estimate current difficulty based on performance
 * @param {Object} conversation - Assessment conversation
 * @returns {number} Estimated difficulty level (1-15)
 */
function estimateCurrentDifficulty(conversation) {
  const allQuestions = [
    ...ASSESSMENT_BANK.elementary,
    ...ASSESSMENT_BANK.middleSchool,
    ...ASSESSMENT_BANK.highSchool
  ];

  const messages = conversation.messages || [];
  let totalDifficulty = 0;
  let correctCount = 0;
  let incorrectCount = 0;

  // Analyze each question-answer pair
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const nextMsg = messages[i + 1];

    if (msg.role === 'assistant' && nextMsg.role === 'user') {
      // Extract question ID from message
      const questionId = extractQuestionId(msg.content);
      const question = allQuestions.find(q => q.id === questionId);

      if (question) {
        const isCorrect = checkAnswer(nextMsg.content, question);

        if (isCorrect) {
          correctCount++;
          // Increase difficulty after correct answer
          totalDifficulty += question.difficulty + 1;
        } else {
          incorrectCount++;
          // Decrease difficulty after incorrect answer
          totalDifficulty += Math.max(1, question.difficulty - 2);
        }
      }
    }
  }

  const totalAnswers = correctCount + incorrectCount;
  if (totalAnswers === 0) {
    return 6; // Start at grade 6 level
  }

  const averageDifficulty = totalDifficulty / totalAnswers;
  return Math.round(Math.max(1, Math.min(15, averageDifficulty)));
}

/**
 * Check if user's answer is correct
 * @param {string} userAnswer - User's answer
 * @param {Object} question - Question object
 * @returns {boolean} True if correct
 */
function checkAnswer(userAnswer, question) {
  const cleanAnswer = userAnswer.trim().toLowerCase();
  const correctAnswer = String(question.correctAnswer).toLowerCase();

  // Number answers
  if (question.type === 'number') {
    const userNum = parseFloat(cleanAnswer.replace(/[^\d.-]/g, ''));
    const correctNum = parseFloat(correctAnswer);
    return Math.abs(userNum - correctNum) < 0.01;
  }

  // Fraction answers
  if (question.type === 'fraction') {
    return cleanAnswer.replace(/\s/g, '') === correctAnswer.replace(/\s/g, '');
  }

  // Expression answers (simplified matching)
  if (question.type === 'expression') {
    const userExpr = cleanAnswer.replace(/\s/g, '').replace(/\*\*/g, '^');
    const correctExpr = correctAnswer.replace(/\s/g, '');
    return userExpr === correctExpr || userExpr.includes(correctExpr);
  }

  // Text answers
  return cleanAnswer.includes(correctAnswer) || correctAnswer.includes(cleanAnswer);
}

/**
 * Extract question ID from message content
 * @param {string} content - Message content
 * @returns {string|null} Question ID
 */
function extractQuestionId(content) {
  const match = content.match(/\[Q:(\w+)\]/);
  return match ? match[1] : null;
}

/**
 * Extract all asked question IDs from conversation
 * @param {Object} conversation - Assessment conversation
 * @returns {Array<string>} List of question IDs
 */
function extractAskedQuestionIds(conversation) {
  const ids = [];

  for (const msg of conversation.messages) {
    if (msg.role === 'assistant') {
      const id = extractQuestionId(msg.content);
      if (id) ids.push(id);
    }
  }

  return ids;
}

/**
 * Calculate final assessment results
 * @param {Object} conversation - Completed assessment conversation
 * @returns {Object} Assessment results
 */
async function calculateAssessmentResults(conversation) {
  const allQuestions = [
    ...ASSESSMENT_BANK.elementary,
    ...ASSESSMENT_BANK.middleSchool,
    ...ASSESSMENT_BANK.highSchool
  ];

  const messages = conversation.messages || [];
  let correctCount = 0;
  let totalQuestions = 0;
  let difficultySum = 0;
  const skillsCorrect = new Set();
  const skillsIncorrect = new Set();

  // Analyze all question-answer pairs
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const nextMsg = messages[i + 1];

    if (msg.role === 'assistant' && nextMsg.role === 'user') {
      const questionId = extractQuestionId(msg.content);
      const question = allQuestions.find(q => q.id === questionId);

      if (question) {
        totalQuestions++;
        const isCorrect = checkAnswer(nextMsg.content, question);

        if (isCorrect) {
          correctCount++;
          difficultySum += question.difficulty;
          skillsCorrect.add(question.skill);
        } else {
          skillsIncorrect.add(question.skill);
        }
      }
    }
  }

  // Calculate skill level (0-100)
  const averageDifficulty = totalQuestions > 0 ? difficultySum / totalQuestions : 6;
  const skillLevel = Math.round((averageDifficulty / 15) * 100);

  // Determine estimated grade level
  let estimatedGrade = 'Unknown';
  if (averageDifficulty <= 3) estimatedGrade = '1st-3rd Grade';
  else if (averageDifficulty <= 5) estimatedGrade = '4th-5th Grade';
  else if (averageDifficulty <= 7) estimatedGrade = '6th-7th Grade';
  else if (averageDifficulty <= 9) estimatedGrade = '8th Grade';
  else if (averageDifficulty <= 11) estimatedGrade = '9th-10th Grade';
  else if (averageDifficulty <= 13) estimatedGrade = '11th Grade';
  else estimatedGrade = '12th Grade+';

  // Identify strengths and weaknesses
  const strengths = Array.from(skillsCorrect).filter(s => !skillsIncorrect.has(s));
  const weaknesses = Array.from(skillsIncorrect);

  // Recommended starting point
  const recommendedStartingPoint = averageDifficulty <= 5
    ? 'Basic Operations & Fractions'
    : averageDifficulty <= 9
    ? 'Pre-Algebra & Beginning Algebra'
    : averageDifficulty <= 12
    ? 'Algebra I & Geometry'
    : 'Algebra II & Advanced Topics';

  const results = {
    estimatedGrade,
    skillLevel,
    strengths,
    weaknesses,
    recommendedStartingPoint,
    completedAt: new Date(),
    correctCount,
    totalQuestions
  };

  // Save results to conversation and mark as inactive
  conversation.assessmentResults = results;
  conversation.isAssessmentComplete = true;
  conversation.isActive = false; // Mark inactive so it gets properly summarized
  await conversation.save();

  logger.info('Assessment completed', {
    userId: conversation.userId,
    results
  });

  return results;
}

/**
 * Generate follow-up question based on answer
 * @param {string} userAnswer - User's answer
 * @param {Object} question - Original question
 * @param {boolean} isCorrect - Whether answer was correct
 * @returns {string|null} Follow-up question or null
 */
function generateFollowUp(userAnswer, question, isCorrect) {
  // For now, no follow-ups - keep it simple
  // Could add "Can you explain how you got that?" for deeper understanding
  return null;
}

module.exports = {
  getNextQuestion,
  checkAnswer,
  calculateAssessmentResults,
  estimateCurrentDifficulty,
  generateFollowUp
};
