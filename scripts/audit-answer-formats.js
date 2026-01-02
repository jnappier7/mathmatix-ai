/**
 * Audit answer format inconsistencies in problems
 *
 * Checks for:
 * 1. Numeric answers stored as strings when answerType is integer/decimal
 * 2. String answers for ratio/fraction problems that look like decimals
 * 3. Inconsistent problemId formats (numeric vs generated)
 */

const mongoose = require('mongoose');
const Problem = require('../models/problem');
require('dotenv').config();

async function auditAnswerFormats() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix_dev');
    console.log('Connected to MongoDB');

    // Find all problems
    const problems = await Problem.find({}).lean();
    console.log(`\nAuditing ${problems.length} problems...\n`);

    const issues = {
      numericAsString: [],
      suspiciousDecimals: [],
      oldProblemIds: [],
      missingAnswerType: []
    };

    for (const problem of problems) {
      const { problemId, skillId, answer, answerType, options } = problem;

      // Check 1: Numeric answer stored as string for integer/decimal types
      if ((answerType === 'integer' || answerType === 'decimal') && typeof answer === 'string') {
        if (/^\d+(\.\d+)?$/.test(answer)) {
          issues.numericAsString.push({ problemId, skillId, answer, answerType });
        }
      }

      // Check 2: Decimal answer for ratio/fraction problems
      if (skillId && (skillId.includes('ratio') || skillId.includes('fraction'))) {
        if (typeof answer === 'number' && !Number.isInteger(answer)) {
          issues.suspiciousDecimals.push({ problemId, skillId, answer });
        }
      }

      // Check 3: Old numeric problemIds
      if (/^\d+$/.test(problemId)) {
        issues.oldProblemIds.push({ problemId, skillId });
      }

      // Check 4: Missing answerType with options
      if (options && options.length > 0 && answerType !== 'multiple-choice') {
        issues.missingAnswerType.push({ problemId, skillId, answerType });
      }
    }

    // Report results
    console.log('='.repeat(60));
    console.log('AUDIT RESULTS');
    console.log('='.repeat(60));

    console.log(`\n1. Numeric answers stored as strings: ${issues.numericAsString.length}`);
    if (issues.numericAsString.length > 0) {
      console.log('   Examples:');
      issues.numericAsString.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}): "${p.answer}" (${p.answerType})`);
      });
    }

    console.log(`\n2. Suspicious decimal answers for ratio/fraction: ${issues.suspiciousDecimals.length}`);
    if (issues.suspiciousDecimals.length > 0) {
      console.log('   Examples:');
      issues.suspiciousDecimals.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}): ${p.answer}`);
      });
    }

    console.log(`\n3. Old numeric problemIds: ${issues.oldProblemIds.length}`);
    if (issues.oldProblemIds.length > 0) {
      console.log(`   First few: ${issues.oldProblemIds.slice(0, 5).map(p => p.problemId).join(', ')}`);
    }

    console.log(`\n4. Wrong answerType for multiple-choice: ${issues.missingAnswerType.length}`);
    if (issues.missingAnswerType.length > 0) {
      console.log('   Examples:');
      issues.missingAnswerType.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}): answerType="${p.answerType}" but has options`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Total problems audited: ${problems.length}`);
    console.log(`Total issues found: ${Object.values(issues).reduce((sum, arr) => sum + arr.length, 0)}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  auditAnswerFormats();
}

module.exports = { auditAnswerFormats };
