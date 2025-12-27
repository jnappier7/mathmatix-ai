/**
 * ITEM BANK IMPORTER
 *
 * Imports professionally calibrated math problems from CSV/JSON
 * Maps to our Problem schema with IRT parameters
 */

// Load environment variables if dotenv is available
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, assume environment is already configured
  console.log('Running without dotenv (environment should be pre-configured)');
}

const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');
const Problem = require('../models/problem');

// ============================================================================
// SKILL MAPPING (Common Core to our skill IDs)
// ============================================================================

const SKILL_MAP = {
  // Grade 1-2 (Operations & Algebraic Thinking)
  '1OA1': 'addition-within-10',
  '1OA2': 'subtraction-within-10',
  '1OA6': 'addition-subtraction-word-problems',
  '2OA1': 'addition-within-100',
  '2OA2': 'subtraction-within-100',

  // Grade 3-5 (Number & Operations - Fractions)
  '3NF1': 'fractions-basics',
  '3NF2': 'fractions-number-line',
  '4NF1': 'equivalent-fractions',
  '4NF2': 'comparing-fractions',
  '4NF3': 'adding-fractions-same-denominator',
  '4NF4': 'multiplying-fractions',
  '5NF1': 'adding-fractions-different-denominators',
  '5NF2': 'fraction-word-problems',

  // Grade 6-8 (Expressions & Equations)
  '6EE1': 'numerical-expressions-exponents',
  '6EE2': 'writing-expressions',
  '6EE3': 'equivalent-expressions',
  '6EE5': 'one-step-equations-addition',
  '6EE6': 'writing-equations',
  '6EE7': 'solving-equations',
  '7EE1': 'combining-like-terms',
  '7EE2': 'simplifying-expressions',
  '7EE3': 'solving-multi-step-equations',
  '7EE4': 'solving-inequalities',
  '8EE1': 'exponent-properties',
  '8EE2': 'square-cube-roots',
  '8EE5': 'slope',
  '8EE6': 'linear-equations',
  '8EE7': 'solving-linear-equations',
  '8EE8': 'systems-of-equations',

  // Geometry
  '6G1': 'area-triangles',
  '6G2': 'volume-rectangular-prisms',
  '7G4': 'circles-circumference-area',
  '7G6': 'volume-surface-area',
  '8G7': 'pythagorean-theorem',
  '8G8': 'distance-formula',

  // Statistics & Probability
  '6SP1': 'statistical-questions',
  '6SP2': 'measures-of-center',
  '6SP3': 'measures-of-variation',
  '7SP1': 'sampling',
  '7SP5': 'probability-basics',
  '7SP6': 'probability-models',

  // Ratios & Proportional Relationships
  '6RP1': 'ratios',
  '6RP2': 'unit-rates',
  '6RP3': 'ratio-tables',
  '7RP1': 'unit-rates-complex',
  '7RP2': 'proportional-relationships',
  '7RP3': 'percent-problems',

  // Number System
  '6NS1': 'dividing-fractions',
  '6NS2': 'dividing-multi-digit',
  '6NS3': 'decimals',
  '6NS5': 'negative-numbers',
  '6NS6': 'coordinate-plane',
  '7NS1': 'adding-subtracting-integers',
  '7NS2': 'multiplying-dividing-integers',
  '7NS3': 'rational-numbers',
  '8NS1': 'irrational-numbers',
  '8NS2': 'rational-approximations',

  // High School & Beyond
  'Stats': 'statistics',
  'PreCalc': 'precalculus',
  'Calc 1': 'derivatives',
  'Calc 2': 'integration',
  'FinLit': 'financial-literacy',
  'HS-Alg1': 'linear-equations',
  'HS-Alg2': 'quadratics',
  'College Alg': 'polynomials'
};

// Domain-based fallback for unmapped standards
const DOMAIN_MAP = {
  'G': 'geometry',
  'MD': 'measurement',
  'NBT': 'place-value',
  'NF': 'fractions',
  'OA': 'operations',
  'CC': 'counting',
  'NS': 'number-system',
  'EE': 'expressions-equations',
  'RP': 'ratios-proportions',
  'SP': 'statistics-probability',
  'F': 'functions',
  'APR': 'polynomials',
  'CED': 'equations',
  'REI': 'solving-equations',
  'SSE': 'expressions',
  'BF': 'functions',
  'IF': 'functions',
  'LE': 'linear-functions',
  'TF': 'trigonometry',
  'C': 'circles',
  'CO': 'congruence',
  'GMD': 'volume',
  'GPE': 'coordinate-geometry',
  'SRT': 'similarity',
  'CN': 'complex-numbers',
  'RN': 'real-numbers',
  'VM': 'vectors',
  'CP': 'probability',
  'ID': 'statistics'
};

// ============================================================================
// DIFFICULTY CONVERSION
// ============================================================================

/**
 * Convert p-value (proportion correct) to theta estimate
 *
 * Common conversion formulas:
 * - Scantron uses: θ ≈ -ln((1-p)/p) / 1.7
 * - NWEA uses logistic transformation
 *
 * We'll use inverse of our IRT model:
 * If P(correct) = p, and discrimination = 1.0, then:
 * θ ≈ difficulty + ln(p/(1-p)) / discrimination
 */
function pValueToTheta(pValue, baselineTheta = 0) {
  if (pValue >= 0.99) return baselineTheta + 3.0; // Very easy
  if (pValue <= 0.01) return baselineTheta - 3.0; // Very hard

  // Inverse logit transformation
  const logit = Math.log(pValue / (1 - pValue));
  return baselineTheta + (logit / 1.7); // 1.7 is typical discrimination
}

/**
 * Estimate difficulty from multiple p-values across grades
 * Takes the median difficulty as the calibrated value
 */
function estimateDifficulty(pValues, gradeLevel) {
  const validPValues = pValues.filter(p => p > 0 && p < 1);

  if (validPValues.length === 0) {
    // Fallback: estimate from grade level
    return gradeToTheta(gradeLevel);
  }

  // Convert each p-value to theta
  const thetas = validPValues.map(p => pValueToTheta(p));

  // Return median
  thetas.sort((a, b) => a - b);
  const mid = Math.floor(thetas.length / 2);
  return thetas.length % 2 === 0
    ? (thetas[mid - 1] + thetas[mid]) / 2
    : thetas[mid];
}

/**
 * Map grade level to baseline theta
 */
function gradeToTheta(grade) {
  const mapping = {
    'K': -2.5, '1': -2.0, '2': -1.5, '3': -1.0, '4': -0.5,
    '5': 0.0, '6': 0.5, '7': 1.0, '8': 1.5, '9': 2.0, '10': 2.5,
    '11': 2.6, '12': 2.7, '13+': 2.8,
    'HS': 2.2, 'College': 2.7, 'calc-1': 2.8
  };
  return mapping[String(grade)] || 0;
}

/**
 * Estimate discrimination from variance in p-values
 * Higher variance = more discriminating item
 */
function estimateDiscrimination(pValues) {
  const validPValues = pValues.filter(p => p > 0 && p < 1);

  if (validPValues.length < 2) return 1.2; // Default

  // Calculate variance
  const mean = validPValues.reduce((sum, p) => sum + p, 0) / validPValues.length;
  const variance = validPValues.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / validPValues.length;

  // High variance = high discrimination (1.5-2.0)
  // Low variance = low discrimination (0.8-1.2)
  if (variance > 0.04) return 1.6;
  if (variance > 0.02) return 1.3;
  return 1.0;
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

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

  // Extract ID (use original if available, otherwise generate)
  problem.problemId = row['ID'] || row['id'] || generateProblemId();

  // Extract problem text
  problem.content = row['Question_Text'] || row['Question'] || row['Problem'] || row['Content'] || '';

  // Extract multiple choice options
  const optionA = row['Option_A'] || row['A'];
  const optionB = row['Option_B'] || row['B'];
  const optionC = row['Option_C'] || row['C'];
  const optionD = row['Option_D'] || row['D'];

  if (optionA || optionB || optionC || optionD) {
    problem.options = [
      { label: 'A', text: optionA || '' },
      { label: 'B', text: optionB || '' },
      { label: 'C', text: optionC || '' },
      { label: 'D', text: optionD || '' }
    ].filter(opt => opt.text); // Remove empty options

    // Set answer type to multiple choice
    problem.answerType = 'multiple-choice';
  }

  // Extract correct answer
  const correctAnswer = row['Correct_Answer'] || row['Answer'] || row['Correct'] || null;

  // If it's a letter (A, B, C, D), convert to the actual answer text
  if (correctAnswer && /^[A-D]$/i.test(correctAnswer)) {
    const optionMap = { A: optionA, B: optionB, C: optionC, D: optionD };
    problem.answer = optionMap[correctAnswer.toUpperCase()] || correctAnswer;
    problem.correctOption = correctAnswer.toUpperCase();
  } else {
    problem.answer = correctAnswer;
  }

  // Try to parse answer as number if possible
  if (problem.answer && !isNaN(parseFloat(problem.answer))) {
    problem.answer = parseFloat(problem.answer);
  }

  // Extract standard/skill code and clean it
  let standardCode = row['Skill_Standard'] || row['Standard'] || row['Code'] || row['Skill'] || '';

  // Strip any parenthetical descriptions: "1.G.A.1 (Geometry)" → "1.G.A.1"
  standardCode = standardCode.split(/[\s(]/)[0].trim();

  // Try multiple formats for SKILL_MAP lookup
  // Format 1: "6.EE.A.5" → "6EEA5" → "6EE5" (remove dots, then single cluster letters)
  // Also handles single-letter domains: "1.G.A.1" → "1GA1" → "1G1"
  let compactCode = standardCode.replace(/\./g, ''); // "6.EE.A.5" → "6EEA5", "1.G.A.1" → "1GA1"
  compactCode = compactCode.replace(/([A-Z]+)([A-Z])(\d+)$/, '$1$3'); // "6EEA5" → "6EE5", "1GA1" → "1G1"

  // Try SKILL_MAP with both original and compact formats
  // If not found, use domain-based fallback (e.g., "1.G.A.1" → "geometry")
  let skillId = SKILL_MAP[standardCode] || SKILL_MAP[compactCode];

  if (!skillId) {
    // Extract domain code (e.g., "1GA1" → "G", "7NSA1" → "NS")
    const domainMatch = compactCode.match(/\d*([A-Z]+)/);
    const domain = domainMatch ? domainMatch[1] : null;
    skillId = domain && DOMAIN_MAP[domain] ? DOMAIN_MAP[domain] : standardCode.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  problem.skillId = skillId;
  problem.metadata.standardCode = standardCode;

  // Extract grade level
  const gradeLevel = row['Grade_Level'] || row['Grade'] || '';
  problem.metadata.gradeLevel = gradeLevel;

  // Check if CSV has pre-calibrated Difficulty and Discrimination
  const csvDifficulty = parseFloat(row['Difficulty']);
  const csvDiscrimination = parseFloat(row['Discrimination']);

  if (!isNaN(csvDifficulty) && csvDifficulty >= -3 && csvDifficulty <= 3) {
    // Use calibrated difficulty from CSV
    problem.irtParameters.difficulty = csvDifficulty;
    problem.irtParameters.calibrationConfidence = 'expert';
  } else {
    // Extract difficulty data from additional columns
    // Look for columns with numeric p-values (0.0 to 1.0)
    const pValues = [];
    const allColumns = Object.keys(row);

    // Skip known text columns
    const skipColumns = ['ID', 'Question_Text', 'Option_A', 'Option_B', 'Option_C', 'Option_D',
                         'Correct_Answer', 'Skill_Standard', 'Grade_Level', 'Difficulty', 'Discrimination'];

    for (const col of allColumns) {
      if (!skipColumns.includes(col)) {
        const value = parseFloat(row[col]);
        // If it's a valid p-value (between 0 and 1)
        if (!isNaN(value) && value >= 0 && value <= 1) {
          pValues.push(value);
        }
      }
    }

    // Estimate IRT parameters from p-values
    const grade = gradeLevel || extractGrade(standardCode);
    problem.irtParameters.difficulty = estimateDifficulty(pValues, grade);
    problem.irtParameters.discrimination = estimateDiscrimination(pValues);

    // Store raw p-values for reference
    if (pValues.length > 0) {
      problem.metadata.pValues = pValues;
    }
  }

  if (!isNaN(csvDiscrimination) && csvDiscrimination > 0) {
    // Use calibrated discrimination from CSV
    problem.irtParameters.discrimination = csvDiscrimination;
  }

  return problem;
}

/**
 * Extract grade level from standard code (e.g., "6EE5" → "6")
 */
function extractGrade(standardCode) {
  const match = standardCode.match(/^(\d+)/);
  return match ? match[1] : '5'; // Default to grade 5
}

/**
 * Generate unique problem ID
 */
function generateProblemId() {
  return `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

/**
 * Import from CSV file
 */
async function importFromCSV(filePath) {
  console.log(`📊 Importing from CSV: ${filePath}`);

  const problems = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const problem = parseRow(row);
          if (problem.content && problem.skillId) {
            problems.push(problem);
          }
        } catch (error) {
          console.error('Error parsing row:', error);
        }
      })
      .on('end', () => {
        console.log(`✅ Parsed ${problems.length} problems`);
        resolve(problems);
      })
      .on('error', reject);
  });
}

/**
 * Import from JSON file
 */
async function importFromJSON(filePath) {
  console.log(`📊 Importing from JSON: ${filePath}`);

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const problems = [];

  for (const item of data) {
    try {
      const problem = parseRow(item);
      if (problem.content && problem.skillId) {
        problems.push(problem);
      }
    } catch (error) {
      console.error('Error parsing item:', error);
    }
  }

  console.log(`✅ Parsed ${problems.length} problems`);
  return problems;
}

/**
 * Validate problems before import
 */
function validateProblems(problems) {
  const valid = [];
  const invalid = [];

  for (const problem of problems) {
    const errors = [];

    if (!problem.content) errors.push('Missing content');
    if (!problem.skillId) errors.push('Missing skillId');
    if (typeof problem.irtParameters.difficulty !== 'number') errors.push('Invalid difficulty');
    if (problem.irtParameters.difficulty < -3 || problem.irtParameters.difficulty > 3) {
      errors.push('Difficulty out of range');
    }

    if (errors.length === 0) {
      valid.push(problem);
    } else {
      invalid.push({ problem, errors });
    }
  }

  console.log(`\n📋 Validation Results:`);
  console.log(`   ✅ Valid: ${valid.length}`);
  console.log(`   ❌ Invalid: ${invalid.length}`);

  if (invalid.length > 0) {
    console.log(`\n❌ Invalid problems:`);
    invalid.slice(0, 5).forEach(({ problem, errors }) => {
      console.log(`   - "${problem.content.substring(0, 50)}..."`);
      console.log(`     Errors: ${errors.join(', ')}`);
    });
    if (invalid.length > 5) {
      console.log(`   ... and ${invalid.length - 5} more`);
    }
  }

  return valid;
}

/**
 * Save problems to database
 */
async function saveToDatabase(problems, options = {}) {
  const { batchSize = 100, skipDuplicates = true } = options;

  console.log(`\n💾 Saving ${problems.length} problems to database...`);

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < problems.length; i += batchSize) {
    const batch = problems.slice(i, i + batchSize);

    for (const problemData of batch) {
      try {
        if (skipDuplicates) {
          // Check if problem already exists
          const existing = await Problem.findOne({
            content: problemData.content,
            skillId: problemData.skillId
          });

          if (existing) {
            skipped++;
            continue;
          }
        }

        const problem = new Problem(problemData);
        await problem.save();
        saved++;

        if (saved % 50 === 0) {
          console.log(`   Progress: ${saved}/${problems.length} saved`);
        }

      } catch (error) {
        console.error(`Error saving problem:`, error.message);
        errors++;
      }
    }
  }

  console.log(`\n✅ Import Complete!`);
  console.log(`   💾 Saved: ${saved}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);

  return { saved, skipped, errors };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
📥 ITEM BANK IMPORTER

Usage:
  node importItemBank.js <file> [options]

Options:
  --format <csv|json>     File format (auto-detected if not specified)
  --dry-run               Validate without saving to database
  --skip-duplicates       Skip problems that already exist (default: true)
  --batch-size <n>        Number of problems to save at once (default: 100)

Examples:
  node importItemBank.js problems.csv
  node importItemBank.js data.json --dry-run
  node importItemBank.js items.csv --skip-duplicates=false
    `);
    process.exit(0);
  }

  const filePath = args[0];
  const options = {
    format: args.find(a => a.startsWith('--format='))?.split('=')[1],
    dryRun: args.includes('--dry-run'),
    skipDuplicates: !args.includes('--skip-duplicates=false'),
    batchSize: parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '100')
  };

  // Auto-detect format
  if (!options.format) {
    options.format = filePath.endsWith('.json') ? 'json' : 'csv';
  }

  try {
    // Connect to database
    if (!options.dryRun) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('✅ Connected to MongoDB\n');
    }

    // Import problems
    let problems;
    if (options.format === 'json') {
      problems = await importFromJSON(filePath);
    } else {
      problems = await importFromCSV(filePath);
    }

    // Validate
    const validProblems = validateProblems(problems);

    if (options.dryRun) {
      console.log(`\n🔍 Dry run complete. Would import ${validProblems.length} problems.`);
    } else {
      // Save to database
      await saveToDatabase(validProblems, options);
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  importFromCSV,
  importFromJSON,
  validateProblems,
  saveToDatabase,
  pValueToTheta,
  estimateDifficulty,
  estimateDiscrimination
};
