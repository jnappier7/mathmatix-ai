/**
 * ADAPTIVE SCREENER AUTOMATED TEST
 *
 * Simulates a student taking the adaptive screener test.
 * Tests the complete flow without needing a frontend.
 *
 * Run: node test/testAdaptiveScreener.js
 */

const { initializeSession, processResponse, generateReport } = require('../utils/adaptiveScreener');
const { generateProblem } = require('../utils/problemGenerator');
const Problem = require('../models/problem');

// Simulated student ability (adjust to test different student levels)
// -2 = struggling (grade 4-5)
// -1 = below average (grade 6)
//  0 = average (grade 7-8)
// +1 = above average (grade 9-10)
// +2 = advanced (grade 11-12)
// +3 = exceptional (college)
const SIMULATED_ABILITY = 1.0;  // Change this to test different students

// Noise level (how consistent is the student?)
const NOISE_LEVEL = 0.3;  // 0 = perfect, 1 = very noisy

console.log('==========================================');
console.log('ADAPTIVE SCREENER SIMULATION');
console.log('==========================================');
console.log(`Simulating student with ability θ = ${SIMULATED_ABILITY}`);
console.log(`Noise level: ${NOISE_LEVEL}`);
console.log('');

/**
 * Simulate a student attempting a problem
 * Returns true/false based on IRT probability + noise
 */
function simulateAnswer(problemDifficulty, studentAbility, noise = 0.3) {
  // IRT probability of correct response
  // P(θ) = 1 / (1 + exp(-α(θ - β)))
  const discrimination = 1.2;
  const exponent = -discrimination * (studentAbility - problemDifficulty);
  const probability = 1 / (1 + Math.exp(exponent));

  // Add noise (±30% by default)
  const noisyProbability = probability + (Math.random() - 0.5) * noise;
  const clampedProbability = Math.max(0, Math.min(1, noisyProbability));

  // Random correct/incorrect based on probability
  const isCorrect = Math.random() < clampedProbability;

  return {
    correct: isCorrect,
    probability: probability.toFixed(2),
    actualProbability: clampedProbability.toFixed(2)
  };
}

/**
 * Run the simulation
 */
async function runSimulation() {
  // Initialize session
  const session = initializeSession({
    userId: 'test-user-123',
    startingTheta: 0
  });

  console.log('Session initialized');
  console.log(`Starting θ estimate: ${session.theta}`);
  console.log('');

  const skillsToTest = [
    'integer-addition',
    'one-step-equations-addition',
    'two-step-equations',
    'combining-like-terms',
    'order-of-operations'
  ];

  let questionNumber = 0;
  let nextAction = { action: 'continue' };

  // Main testing loop
  while (nextAction.action === 'continue' && questionNumber < session.maxQuestions) {
    questionNumber++;

    console.log('==========================================');
    console.log(`Question ${questionNumber}`);
    console.log('==========================================');

    // Determine target difficulty
    const targetDifficulty = session.theta;

    // Select skill (rotate through skills)
    const skillId = skillsToTest[questionNumber % skillsToTest.length];

    // Generate problem
    const problem = generateProblem(skillId, { difficulty: targetDifficulty });

    console.log(`Skill: ${skillId}`);
    console.log(`Problem: ${problem.content}`);
    console.log(`Correct Answer: ${problem.answer}`);
    console.log(`Difficulty (β): ${problem.irtParameters.difficulty}`);
    console.log(`Discrimination (α): ${problem.irtParameters.discrimination}`);

    // Simulate student answering
    const result = simulateAnswer(
      problem.irtParameters.difficulty,
      SIMULATED_ABILITY,
      NOISE_LEVEL
    );

    console.log(`Student answered: ${result.correct ? 'CORRECT ✅' : 'INCORRECT ❌'}`);
    console.log(`P(correct|θ=${SIMULATED_ABILITY}, β=${problem.irtParameters.difficulty}) = ${result.probability}`);
    console.log(`With noise: ${result.actualProbability}`);

    // Process response
    const response = {
      problemId: problem.problemId,
      skillId: problem.skillId,
      difficulty: problem.irtParameters.difficulty,
      discrimination: problem.irtParameters.discrimination,
      correct: result.correct,
      responseTime: 15 + Math.random() * 20  // Simulate 15-35 seconds
    };

    nextAction = processResponse(session, response);

    // Show updated estimates
    console.log('');
    console.log('Updated Estimates:');
    console.log(`  θ (ability): ${session.theta}`);
    console.log(`  SE (standard error): ${session.standardError.toFixed(3)}`);
    console.log(`  Confidence: ${(session.confidence * 100).toFixed(1)}%`);
    console.log(`  Questions answered: ${session.questionCount}`);

    if (nextAction.action !== 'continue') {
      console.log('');
      console.log(`Next action: ${nextAction.action.toUpperCase()}`);
      console.log(`Reason: ${nextAction.reason}`);
      console.log(`Message: ${nextAction.message}`);
    }

    console.log('');
  }

  // Generate final report
  session.endTime = Date.now();
  const report = generateReport(session);

  console.log('==========================================');
  console.log('FINAL REPORT');
  console.log('==========================================');
  console.log('');
  console.log('Ability Estimate:');
  console.log(`  θ (theta): ${report.theta}`);
  console.log(`  Standard Error: ${report.standardError}`);
  console.log(`  Confidence: ${(report.confidence * 100).toFixed(1)}%`);
  console.log(`  Percentile: ${report.percentile}th`);
  console.log('');
  console.log('Performance:');
  console.log(`  Questions answered: ${report.questionsAnswered}`);
  console.log(`  Correct: ${report.correctCount}`);
  console.log(`  Accuracy: ${report.accuracy}%`);
  console.log(`  Duration: ${(report.duration / 1000).toFixed(1)}s`);
  console.log('');
  console.log('Skill Categorization:');
  console.log(`  Mastered: ${report.masteredSkills.length} skills`);
  console.log(`    ${report.masteredSkills.join(', ') || 'None'}`);
  console.log(`  Learning: ${report.learningSkills.length} skills`);
  console.log(`    ${report.learningSkills.join(', ') || 'None'}`);
  console.log(`  Frontier: ${report.frontierSkills.length} skills`);
  console.log(`    ${report.frontierSkills.join(', ') || 'None'}`);
  console.log('');
  console.log('==========================================');
  console.log('ACCURACY CHECK');
  console.log('==========================================');
  console.log(`Simulated ability: θ = ${SIMULATED_ABILITY}`);
  console.log(`Estimated ability: θ = ${report.theta}`);
  console.log(`Estimation error: ${Math.abs(SIMULATED_ABILITY - report.theta).toFixed(2)}`);
  console.log(`Standard error: ${report.standardError.toFixed(2)}`);

  const withinSE = Math.abs(SIMULATED_ABILITY - report.theta) <= report.standardError;
  console.log(`Within 1 SE: ${withinSE ? '✅ YES' : '❌ NO'}`);
  console.log('');

  if (Math.abs(SIMULATED_ABILITY - report.theta) <= 0.5) {
    console.log('✅ EXCELLENT: Estimate within ±0.5 of true ability');
  } else if (Math.abs(SIMULATED_ABILITY - report.theta) <= 1.0) {
    console.log('⚠️  ACCEPTABLE: Estimate within ±1.0 of true ability');
  } else {
    console.log('❌ POOR: Estimate > 1.0 away from true ability (check algorithm)');
  }

  console.log('');
  console.log('Test complete!');
}

// Run the simulation
runSimulation().catch(err => {
  console.error('Error running simulation:', err);
  process.exit(1);
});
