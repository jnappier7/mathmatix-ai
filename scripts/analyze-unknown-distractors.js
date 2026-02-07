/**
 * ANALYZE UNKNOWN TYPE PROBLEMS WITH BAD DISTRACTORS
 *
 * Examines problems that fix-terrible-trio.js couldn't auto-fix
 * to identify patterns for adding more type handlers.
 *
 * Run: node scripts/analyze-unknown-distractors.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Problem = require('../models/problem');

// The terrible trio
const TERRIBLE_TRIO = [
  'cannot be determined',
  'not enough information',
  'none of the above',
];

function hasTerribleTrio(options) {
  if (!options || !Array.isArray(options)) return false;
  const optionTexts = options.map(opt =>
    (opt.text || opt || '').toString().toLowerCase().trim()
  );
  return TERRIBLE_TRIO.every(bad =>
    optionTexts.some(text => text.includes(bad))
  );
}

function detectType(problem) {
  const prompt = (problem.prompt || '').toLowerCase();
  const answer = (problem.answer?.value || problem.answer || '').toString();
  const answerLower = answer.toLowerCase();

  // Coordinate pairs
  if (/\(\s*-?\d+\s*,\s*-?\d+\s*\)/.test(answer)) return 'coordinates';
  if (prompt.includes('coordinate') || prompt.includes('quadrant')) return 'coordinates';

  // Transformations/shifts
  if (prompt.includes('shift') || prompt.includes('f(x)') || prompt.includes('graph')) return 'transformations';

  // Place value
  if (prompt.includes('place') || prompt.includes('digit')) return 'placeValue';
  if (['ones', 'tens', 'hundreds', 'thousands'].some(p => answerLower.includes(p))) return 'placeValue';

  // Comparison
  if (prompt.includes('compare') || ['>', '<', '='].includes(answer.trim())) return 'comparison';

  // Yes/No
  if (['yes', 'no'].includes(answerLower)) return 'yesNo';

  // True/False
  if (['true', 'false'].includes(answerLower)) return 'trueFalse';

  return 'unknown';
}

async function main() {
  console.log('=== ANALYZE UNKNOWN TYPE PROBLEMS ===\n');

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');

  // Find all active MC problems with terrible trio
  const allMCProblems = await Problem.find({
    isActive: true,
    answerType: 'multiple-choice'
  });

  const terribleProblems = allMCProblems.filter(p => hasTerribleTrio(p.options));
  const unknownProblems = terribleProblems.filter(p => detectType(p) === 'unknown');

  console.log(`Total with terrible trio: ${terribleProblems.length}`);
  console.log(`Unknown type: ${unknownProblems.length}\n`);

  // Analyze by skill ID
  const bySkill = {};
  for (const p of unknownProblems) {
    bySkill[p.skillId] = bySkill[p.skillId] || [];
    bySkill[p.skillId].push(p);
  }

  console.log('=== BY SKILL (sorted by count) ===\n');
  const sortedSkills = Object.entries(bySkill).sort((a, b) => b[1].length - a[1].length);

  for (const [skillId, problems] of sortedSkills.slice(0, 30)) {
    console.log(`\n--- ${skillId}: ${problems.length} problems ---`);

    // Show samples
    for (const p of problems.slice(0, 3)) {
      const answer = (p.answer?.value || p.answer || '').toString();
      const prompt = (p.prompt || '').substring(0, 100);
      console.log(`  Problem: ${p.problemId}`);
      console.log(`  Prompt: ${prompt}${prompt.length >= 100 ? '...' : ''}`);
      console.log(`  Answer: "${answer}"`);
      console.log(`  Options: ${(p.options || []).map(o => `"${o.text || o}"`).join(', ')}`);
      console.log();
    }
  }

  // Analyze answer patterns
  console.log('\n=== ANSWER PATTERNS ===\n');

  const answerPatterns = {
    numeric: [],
    fraction: [],
    decimal: [],
    percentage: [],
    word: [],
    expression: [],
    equation: [],
    mixed: [],
    other: []
  };

  for (const p of unknownProblems) {
    const answer = (p.answer?.value || p.answer || '').toString().trim();

    if (/^-?\d+$/.test(answer)) {
      answerPatterns.numeric.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else if (/^\d+\/\d+$/.test(answer) || /^\d+\s+\d+\/\d+$/.test(answer)) {
      answerPatterns.fraction.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else if (/^-?\d+\.\d+$/.test(answer)) {
      answerPatterns.decimal.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else if (/%/.test(answer)) {
      answerPatterns.percentage.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else if (/^[a-zA-Z]+$/.test(answer)) {
      answerPatterns.word.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else if (/[+\-*/^]/.test(answer) && !/=/.test(answer)) {
      answerPatterns.expression.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else if (/=/.test(answer)) {
      answerPatterns.equation.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else if (/\d/.test(answer) && /[a-zA-Z]/.test(answer)) {
      answerPatterns.mixed.push({ answer, skillId: p.skillId, problemId: p.problemId });
    } else {
      answerPatterns.other.push({ answer, skillId: p.skillId, problemId: p.problemId });
    }
  }

  for (const [pattern, items] of Object.entries(answerPatterns)) {
    if (items.length > 0) {
      console.log(`${pattern}: ${items.length} problems`);
      // Show unique answers
      const uniqueAnswers = [...new Set(items.map(i => i.answer))].slice(0, 10);
      console.log(`  Sample answers: ${uniqueAnswers.join(', ')}`);
      // Show which skills
      const skillCounts = {};
      for (const item of items) {
        skillCounts[item.skillId] = (skillCounts[item.skillId] || 0) + 1;
      }
      const topSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`  Top skills: ${topSkills.map(([s, c]) => `${s}(${c})`).join(', ')}`);
      console.log();
    }
  }

  // Look for specific prompt patterns
  console.log('\n=== PROMPT KEYWORD ANALYSIS ===\n');

  const keywords = {
    'fraction': 0,
    'simplify': 0,
    'equivalent': 0,
    'solve': 0,
    'equation': 0,
    'expression': 0,
    'factor': 0,
    'multiply': 0,
    'divide': 0,
    'add': 0,
    'subtract': 0,
    'percent': 0,
    'ratio': 0,
    'proportion': 0,
    'area': 0,
    'perimeter': 0,
    'volume': 0,
    'angle': 0,
    'slope': 0,
    'linear': 0,
    'quadratic': 0,
    'exponent': 0,
    'square root': 0,
    'absolute': 0,
    'integer': 0,
    'negative': 0,
    'positive': 0,
    'order': 0,
    'least to greatest': 0,
    'greatest to least': 0,
    'round': 0,
    'estimate': 0,
  };

  for (const p of unknownProblems) {
    const prompt = (p.prompt || '').toLowerCase();
    for (const keyword of Object.keys(keywords)) {
      if (prompt.includes(keyword)) {
        keywords[keyword]++;
      }
    }
  }

  const sortedKeywords = Object.entries(keywords)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [keyword, count] of sortedKeywords) {
    console.log(`  "${keyword}": ${count}`);
  }

  // Recommend handlers to add
  console.log('\n\n=== RECOMMENDED HANDLERS TO ADD ===\n');

  // Find the most common skill patterns
  const topSkillsForHandlers = sortedSkills.slice(0, 10);

  for (const [skillId, problems] of topSkillsForHandlers) {
    const sampleAnswers = problems.slice(0, 5).map(p => p.answer?.value || p.answer || '');
    console.log(`${skillId} (${problems.length} problems)`);
    console.log(`  Sample answers: ${sampleAnswers.join(', ')}`);

    // Suggest distractor strategy
    const firstAnswer = sampleAnswers[0]?.toString() || '';
    if (/^\d+$/.test(firstAnswer)) {
      console.log(`  Suggested: numeric distractors (±1, ±2, ×2, etc.)`);
    } else if (/^\d+\/\d+$/.test(firstAnswer)) {
      console.log(`  Suggested: fraction distractors (flip, wrong denominator, etc.)`);
    } else if (/^\d+\.\d+$/.test(firstAnswer)) {
      console.log(`  Suggested: decimal distractors (off by 0.1, wrong decimal place)`);
    } else {
      console.log(`  Suggested: needs manual analysis`);
    }
    console.log();
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
