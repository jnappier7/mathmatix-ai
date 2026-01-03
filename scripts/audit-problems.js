/**
 * PROBLEM AUDITOR
 *
 * Finds problems with data quality issues:
 * - Missing answers
 * - Invalid answer formats
 * - Mismatched answerType and answer data
 * - Multiple choice problems missing options or correctOption
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

async function auditProblems() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected\n');

    const allProblems = await Problem.find({}).lean();
    console.log(`Found ${allProblems.length} total problems\n`);

    const issues = {
      missingAnswer: [],
      nullAnswer: [],
      emptyAnswer: [],
      mcMissingOptions: [],
      mcMissingCorrectOption: [],
      fractionInvalid: [],
      answerTypeMismatch: []
    };

    for (const problem of allProblems) {
      const pid = problem.problemId;

      // Missing answer field
      if (!problem.hasOwnProperty('answer')) {
        issues.missingAnswer.push({ problemId: pid, skillId: problem.skillId });
        continue;
      }

      // Null answer
      if (problem.answer === null || problem.answer === undefined) {
        issues.nullAnswer.push({ problemId: pid, skillId: problem.skillId, content: problem.content });
        continue;
      }

      // Empty answer
      if (String(problem.answer).trim() === '') {
        issues.emptyAnswer.push({ problemId: pid, skillId: problem.skillId, content: problem.content });
        continue;
      }

      // Multiple choice validation
      if (problem.answerType === 'multiple-choice') {
        if (!problem.options || problem.options.length === 0) {
          issues.mcMissingOptions.push({ problemId: pid, skillId: problem.skillId, content: problem.content });
        }
        if (!problem.correctOption) {
          issues.mcMissingCorrectOption.push({ problemId: pid, skillId: problem.skillId, answer: problem.answer });
        }
      }

      // Fraction validation
      if (problem.answerType === 'fraction') {
        const fractionPattern = /^-?\d+\/\d+$/;
        if (!fractionPattern.test(String(problem.answer).trim())) {
          issues.fractionInvalid.push({
            problemId: pid,
            skillId: problem.skillId,
            answer: problem.answer,
            content: problem.content.substring(0, 60) + '...'
          });
        }
      }

      // Answer type mismatch (has options but not marked as MC)
      if (problem.options && problem.options.length > 0 && problem.answerType !== 'multiple-choice') {
        issues.answerTypeMismatch.push({
          problemId: pid,
          skillId: problem.skillId,
          answerType: problem.answerType,
          hasOptions: true
        });
      }
    }

    // Report findings
    console.log('═══════════════════════════════════════════════════════');
    console.log('                    AUDIT RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');

    let totalIssues = 0;

    if (issues.missingAnswer.length > 0) {
      console.log(`❌ MISSING ANSWER FIELD: ${issues.missingAnswer.length} problems`);
      issues.missingAnswer.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId})`);
      });
      if (issues.missingAnswer.length > 5) console.log(`   ... and ${issues.missingAnswer.length - 5} more`);
      console.log('');
      totalIssues += issues.missingAnswer.length;
    }

    if (issues.nullAnswer.length > 0) {
      console.log(`❌ NULL/UNDEFINED ANSWER: ${issues.nullAnswer.length} problems`);
      issues.nullAnswer.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId})`);
        console.log(`     Content: "${p.content.substring(0, 60)}..."`);
      });
      if (issues.nullAnswer.length > 5) console.log(`   ... and ${issues.nullAnswer.length - 5} more`);
      console.log('');
      totalIssues += issues.nullAnswer.length;
    }

    if (issues.emptyAnswer.length > 0) {
      console.log(`❌ EMPTY ANSWER: ${issues.emptyAnswer.length} problems`);
      issues.emptyAnswer.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId})`);
        console.log(`     Content: "${p.content.substring(0, 60)}..."`);
      });
      if (issues.emptyAnswer.length > 5) console.log(`   ... and ${issues.emptyAnswer.length - 5} more`);
      console.log('');
      totalIssues += issues.emptyAnswer.length;
    }

    if (issues.mcMissingOptions.length > 0) {
      console.log(`⚠️  MULTIPLE CHOICE MISSING OPTIONS: ${issues.mcMissingOptions.length} problems`);
      issues.mcMissingOptions.slice(0, 3).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId})`);
      });
      if (issues.mcMissingOptions.length > 3) console.log(`   ... and ${issues.mcMissingOptions.length - 3} more`);
      console.log('');
      totalIssues += issues.mcMissingOptions.length;
    }

    if (issues.mcMissingCorrectOption.length > 0) {
      console.log(`⚠️  MULTIPLE CHOICE MISSING CORRECT OPTION: ${issues.mcMissingCorrectOption.length} problems`);
      issues.mcMissingCorrectOption.slice(0, 3).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}) - answer: ${p.answer}`);
      });
      if (issues.mcMissingCorrectOption.length > 3) console.log(`   ... and ${issues.mcMissingCorrectOption.length - 3} more`);
      console.log('');
      totalIssues += issues.mcMissingCorrectOption.length;
    }

    if (issues.fractionInvalid.length > 0) {
      console.log(`⚠️  INVALID FRACTION FORMAT: ${issues.fractionInvalid.length} problems`);
      issues.fractionInvalid.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}) - answer: "${p.answer}"`);
        console.log(`     Content: "${p.content}"`);
      });
      if (issues.fractionInvalid.length > 5) console.log(`   ... and ${issues.fractionInvalid.length - 5} more`);
      console.log('');
      totalIssues += issues.fractionInvalid.length;
    }

    if (issues.answerTypeMismatch.length > 0) {
      console.log(`⚠️  ANSWER TYPE MISMATCH: ${issues.answerTypeMismatch.length} problems`);
      console.log(`    (Has options but answerType is not 'multiple-choice')`);
      issues.answerTypeMismatch.slice(0, 5).forEach(p => {
        console.log(`   - ${p.problemId} (${p.skillId}) - answerType: ${p.answerType}`);
      });
      if (issues.answerTypeMismatch.length > 5) console.log(`   ... and ${issues.answerTypeMismatch.length - 5} more`);
      console.log('');
      totalIssues += issues.answerTypeMismatch.length;
    }

    console.log('═══════════════════════════════════════════════════════');

    if (totalIssues === 0) {
      console.log('✅ All problems passed validation!');
    } else {
      console.log(`Found ${totalIssues} total issues across ${allProblems.length} problems`);
      console.log(`Quality score: ${((1 - totalIssues / allProblems.length) * 100).toFixed(1)}%`);
    }

    console.log('═══════════════════════════════════════════════════════\n');

    // Save detailed report to file
    const fs = require('fs');
    const reportPath = './problem-audit-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(issues, null, 2));
    console.log(`📄 Detailed report saved to: ${reportPath}\n`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error during audit:', error);
    process.exit(1);
  }
}

auditProblems();
