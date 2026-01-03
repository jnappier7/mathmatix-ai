/**
 * Comprehensive data quality audit
 */

const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

async function auditDataQuality() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB\n');

    const problems = await Problem.find({}).lean();
    console.log(`Auditing ${problems.length} problems...\n`);

    const issues = {
      missingAnswer: [],
      missingContent: [],
      malformedEquations: [],
      answerOptionMismatch: [],
      missingCorrectOption: [],
      emptyOptions: [],
      missingAnswerType: []
    };

    for (const problem of problems) {
      const { problemId, skillId, content, answer, answerType, options, correctOption } = problem;

      // Check 1: Missing answer
      if (answer === undefined || answer === null || answer === '') {
        issues.missingAnswer.push({ problemId, skillId, content: content?.substring(0, 50) });
      }

      // Check 2: Missing content
      if (!content || content.trim() === '') {
        issues.missingContent.push({ problemId, skillId });
      }

      // Check 3: Malformed equations (double equals, missing values)
      if (content && (content.includes('+ =') || content.includes('- =') || content.includes('* =') || content.includes('/ ='))) {
        issues.malformedEquations.push({ problemId, skillId, content: content.substring(0, 80) });
      }

      // Check 4: Multiple choice issues
      if (answerType === 'multiple-choice') {
        // Missing correctOption
        if (!correctOption) {
          issues.missingCorrectOption.push({ problemId, skillId });
        }

        // Empty or missing options
        if (!options || options.length === 0) {
          issues.emptyOptions.push({ problemId, skillId });
        }

        // Answer doesn't match correctOption text
        if (correctOption && options && options.length > 0) {
          const correctOpt = options.find(opt => opt.label === correctOption);
          if (correctOpt && answer && String(answer).trim() !== String(correctOpt.text).trim()) {
            issues.answerOptionMismatch.push({
              problemId,
              skillId,
              answer: String(answer).substring(0, 30),
              correctOptionText: String(correctOpt.text).substring(0, 30),
              correctOption
            });
          }
        }
      }

      // Check 5: Missing answerType
      if (!answerType) {
        issues.missingAnswerType.push({ problemId, skillId });
      }
    }

    // Print results
    console.log('============================================================');
    console.log('DATA QUALITY AUDIT RESULTS');
    console.log('============================================================\n');

    console.log(`1. Missing answer field: ${issues.missingAnswer.length}`);
    if (issues.missingAnswer.length > 0) {
      console.log('   First 5 examples:');
      issues.missingAnswer.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}): "${p.content}"`);
      });
      console.log('');
    }

    console.log(`2. Missing content: ${issues.missingContent.length}`);
    if (issues.missingContent.length > 0) {
      console.log('   Examples:', issues.missingContent.slice(0, 3).map(p => p.problemId).join(', '));
      console.log('');
    }

    console.log(`3. Malformed equations (+ =, - =, etc): ${issues.malformedEquations.length}`);
    if (issues.malformedEquations.length > 0) {
      console.log('   First 5 examples:');
      issues.malformedEquations.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}): "${p.content}"`);
      });
      console.log('');
    }

    console.log(`4. Answer doesn't match correctOption text: ${issues.answerOptionMismatch.length}`);
    if (issues.answerOptionMismatch.length > 0) {
      console.log('   First 5 examples:');
      issues.answerOptionMismatch.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId})`);
        console.log(`     Answer: "${p.answer}"`);
        console.log(`     Correct option (${p.correctOption}): "${p.correctOptionText}"`);
      });
      console.log('');
    }

    console.log(`5. Missing correctOption: ${issues.missingCorrectOption.length}`);
    console.log(`6. Empty options array: ${issues.emptyOptions.length}`);
    console.log(`7. Missing answerType: ${issues.missingAnswerType.length}`);

    console.log('\n============================================================');
    const totalIssues = Object.values(issues).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`Total issues found: ${totalIssues}`);
    console.log(`Problems affected: ${new Set(Object.values(issues).flat().map(p => p.problemId)).size}`);
    console.log('============================================================\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

auditDataQuality();
