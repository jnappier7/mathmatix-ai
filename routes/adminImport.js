/**
 * ADMIN IMPORT ROUTES
 * Handles CSV file upload and item bank import
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Problem = require('../models/problem');

// Import utility functions
const {
  pValueToTheta,
  estimateDifficulty,
  estimateDiscrimination
} = require('../scripts/importItemBank');

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files allowed'));
    }
  }
});

/**
 * POST /api/admin/import-items
 * Upload and import item bank CSV
 */
router.post('/import-items', upload.single('file'), async (req, res) => {
  const { dryRun } = req.body;
  const isDryRun = dryRun === 'true';

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Set up streaming response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent({ type: 'log', message: `📊 Parsing CSV: ${req.file.originalname}` });

    const problems = [];
    const filePath = req.file.path;

    // Parse CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            const problem = parseRow(row);
            if (problem.content && problem.skillId) {
              problems.push(problem);
            }
          } catch (error) {
            sendEvent({
              type: 'log',
              message: `⚠️ Error parsing row: ${error.message}`,
              level: 'warning'
            });
          }
        })
        .on('end', () => {
          sendEvent({ type: 'log', message: `✅ Parsed ${problems.length} problems` });
          resolve();
        })
        .on('error', reject);
    });

    // Validate problems
    sendEvent({ type: 'log', message: '📋 Validating problems...' });
    const validProblems = validateProblems(problems, sendEvent);

    if (isDryRun) {
      sendEvent({
        type: 'log',
        message: `✅ Dry run complete. ${validProblems.length} problems ready to import.`,
        level: 'success'
      });

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.end();
      return;
    }

    // Import to database
    sendEvent({ type: 'log', message: `💾 Saving ${validProblems.length} problems to database...` });

    const result = await saveToDatabase(validProblems, sendEvent);

    sendEvent({
      type: 'log',
      message: `✅ Import complete! Saved: ${result.saved}, Skipped: ${result.skipped}, Errors: ${result.errors}`,
      level: 'success'
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.end();

  } catch (error) {
    console.error('Import error:', error);
    sendEvent({
      type: 'log',
      message: `❌ Import failed: ${error.message}`,
      level: 'error'
    });

    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.end();
  }
});

/**
 * Parse CSV row into Problem schema
 */
function parseRow(row) {
  const problem = {
    problemId: null,
    skillId: null,
    content: '',
    answer: null,
    options: [],
    answerType: 'integer',
    irtParameters: {
      difficulty: 0,
      discrimination: 1.2,
      calibrationConfidence: 'expert'
    },
    metadata: {
      source: 'imported',
      importDate: new Date()
    }
  };

  // Extract ID
  problem.problemId = row['ID'] || row['id'] || `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Extract problem text
  problem.content = row['Question_Text'] || row['Question'] || row['Problem'] || '';

  // Extract multiple choice options
  const optionA = row['Option_A'];
  const optionB = row['Option_B'];
  const optionC = row['Option_C'];
  const optionD = row['Option_D'];

  if (optionA || optionB || optionC || optionD) {
    problem.options = [
      { label: 'A', text: optionA || '' },
      { label: 'B', text: optionB || '' },
      { label: 'C', text: optionC || '' },
      { label: 'D', text: optionD || '' }
    ].filter(opt => opt.text);

    problem.answerType = 'multiple-choice';
  }

  // Extract correct answer
  const correctAnswer = row['Correct_Answer'];

  if (correctAnswer && /^[A-D]$/i.test(correctAnswer)) {
    const optionMap = { A: optionA, B: optionB, C: optionC, D: optionD };
    problem.answer = optionMap[correctAnswer.toUpperCase()] || correctAnswer;
    problem.correctOption = correctAnswer.toUpperCase();
  } else {
    problem.answer = correctAnswer;
  }

  // Try to parse as number
  if (problem.answer && !problem.options.length && !isNaN(parseFloat(problem.answer))) {
    problem.answer = parseFloat(problem.answer);
    problem.answerType = Number.isInteger(problem.answer) ? 'integer' : 'decimal';
  }

  // Extract standard/skill code
  const standardCode = row['Skill_Standard'] || row['Standard'] || '';
  problem.skillId = mapSkillCode(standardCode);
  problem.metadata.standardCode = standardCode;

  // Extract grade level
  problem.metadata.gradeLevel = row['Grade_Level'] || row['Grade'] || '';

  // Extract p-values from any numeric columns
  const pValues = [];
  const skipColumns = ['ID', 'Question_Text', 'Option_A', 'Option_B', 'Option_C', 'Option_D',
                       'Correct_Answer', 'Skill_Standard', 'Grade_Level'];

  for (const col in row) {
    if (!skipColumns.includes(col)) {
      const value = parseFloat(row[col]);
      if (!isNaN(value) && value >= 0 && value <= 1) {
        pValues.push(value);
      }
    }
  }

  // Estimate IRT parameters
  if (pValues.length > 0) {
    problem.irtParameters.difficulty = estimateDifficulty(pValues, problem.metadata.gradeLevel);
    problem.irtParameters.discrimination = estimateDiscrimination(pValues);
    problem.metadata.pValues = pValues;
  }

  return problem;
}

/**
 * Map skill code to skill ID
 */
function mapSkillCode(standardCode) {
  // Simple mapping - just lowercase and replace dots with dashes
  return standardCode.toLowerCase().replace(/\./g, '-').replace(/[^a-z0-9-]/g, '-');
}

/**
 * Validate problems
 */
function validateProblems(problems, sendEvent) {
  const valid = [];
  const invalid = [];

  for (const problem of problems) {
    const errors = [];

    if (!problem.content) errors.push('Missing content');
    if (!problem.skillId) errors.push('Missing skillId');
    if (!problem.answer) errors.push('Missing answer');

    if (errors.length === 0) {
      valid.push(problem);
    } else {
      invalid.push({ problem, errors });
    }
  }

  sendEvent({
    type: 'log',
    message: `📋 Validation: ✅ ${valid.length} valid, ❌ ${invalid.length} invalid`
  });

  if (invalid.length > 0 && invalid.length <= 5) {
    invalid.forEach(({ problem, errors }) => {
      sendEvent({
        type: 'log',
        message: `   ❌ "${problem.content.substring(0, 50)}..." - ${errors.join(', ')}`,
        level: 'warning'
      });
    });
  }

  return valid;
}

/**
 * Save to database
 */
async function saveToDatabase(problems, sendEvent) {
  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < problems.length; i++) {
    try {
      const problemData = problems[i];

      // Check for duplicates
      const existing = await Problem.findOne({ problemId: problemData.problemId });

      if (existing) {
        skipped++;
        continue;
      }

      const problem = new Problem(problemData);
      await problem.save();
      saved++;

      // Send progress every 10 items
      if (saved % 10 === 0) {
        sendEvent({
          type: 'progress',
          current: saved,
          total: problems.length
        });
      }

    } catch (error) {
      console.error('Error saving problem:', error.message);
      errors++;
    }
  }

  return { saved, skipped, errors };
}

module.exports = router;
